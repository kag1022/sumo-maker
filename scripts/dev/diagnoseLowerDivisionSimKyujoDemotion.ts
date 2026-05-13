import fs from 'fs';
import path from 'path';
import { Rank } from '../../src/logic/models';
import { resolveLowerDivisionPlacements } from '../../src/logic/banzuke/providers/lowerBoundary';
import { runCareerObservation } from '../../src/logic/simulation/observation';
import { BoundarySnapshot, LowerDivision, PlayerLowerRecord } from '../../src/logic/simulation/lower/types';

type Division = LowerDivision;
type RecordType = '0-7' | '0-0-7';

interface Args {
  careers: number;
  seed: number;
}

interface LandingObservation {
  source: 'natural' | 'forced';
  seed?: number;
  bashoSeq?: number;
  recordType: RecordType;
  fromDivision: Division;
  fromRankNumber: number;
  fromRankLabel: string;
  finalDivision: Rank['division'];
  finalRankNumber: number | null;
  finalRankLabel: string;
  reasonCodes: string[];
  expectedSlot?: number;
  expectedDemotionWidth?: number;
}

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'docs', 'design', 'lower_division_sim_kyujo_demotion.json');
const OUT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_sim_kyujo_demotion.md');

const LOWER_DIVISIONS: Division[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const DEFAULT_SLOTS: Record<Division, number> = {
  Makushita: 120,
  Sandanme: 200,
  Jonidan: 250,
  Jonokuchi: 78,
};

const parseArgs = (): Args => {
  const args = process.argv.slice(2);
  const readNumber = (name: string, fallback: number): number => {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    const value = Number(args[index + 1]);
    return Number.isFinite(value) ? Math.floor(value) : fallback;
  };
  return {
    careers: Math.max(1, readNumber('--careers', 100)),
    seed: readNumber('--seed', 20260422),
  };
};

const formatRank = (rank: Rank): string => {
  if (rank.division === 'Maezumo') return '前相撲';
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number ?? 1}枚目`;
};

const rankScoreToRank = (division: Division, rankScore: number): Rank => ({
  division,
  name:
    division === 'Makushita' ? '幕下'
      : division === 'Sandanme' ? '三段目'
        : division === 'Jonidan' ? '序二段'
          : '序ノ口',
  number: Math.floor((Math.max(1, rankScore) - 1) / 2) + 1,
  side: Math.max(1, rankScore) % 2 === 1 ? 'East' : 'West',
});

const rankScoreFromRankNumber = (rankNumber: number, side: 'East' | 'West' = 'East'): number =>
  (rankNumber - 1) * 2 + (side === 'West' ? 2 : 1);

const resolveRecordType = (wins: number, losses: number, absent: number): RecordType | null => {
  if (wins === 0 && losses === 7 && absent === 0) return '0-7';
  if (wins === 0 && losses === 0 && absent >= 7) return '0-0-7';
  return null;
};

const makeNpcRecord = (rankScore: number): { wins: number; losses: number } => {
  const mod = rankScore % 8;
  if (mod === 0) return { wins: 7, losses: 0 };
  if (mod <= 2) return { wins: 4, losses: 3 };
  if (mod <= 5) return { wins: 3, losses: 4 };
  return { wins: 2, losses: 5 };
};

const buildForcedResults = (
  playerDivision: Division,
  playerRankNumber: number,
  recordType: RecordType,
): Record<Division, BoundarySnapshot[]> => {
  const playerWins = 0;
  const playerLosses = recordType === '0-7' ? 7 : 0;
  const results = {} as Record<Division, BoundarySnapshot[]>;
  for (const division of LOWER_DIVISIONS) {
    const rows: BoundarySnapshot[] = [];
    for (let slot = 1; slot <= DEFAULT_SLOTS[division]; slot += 1) {
      if (division === playerDivision && slot === rankScoreFromRankNumber(playerRankNumber)) {
        rows.push({
          id: 'PLAYER',
          shikona: '診断力士',
          isPlayer: true,
          stableId: 'diagnostic',
          rankScore: slot,
          wins: playerWins,
          losses: playerLosses,
        });
        continue;
      }
      const record = makeNpcRecord(slot);
      rows.push({
        id: `${division}-${slot}`,
        shikona: `${division}${slot}`,
        isPlayer: false,
        stableId: 'diagnostic',
        rankScore: slot,
        wins: record.wins,
        losses: record.losses,
      });
    }
    results[division] = rows;
  }
  return results;
};

const collectForcedScenario = (rankNumber: number, recordType: RecordType): LandingObservation => {
  const fromRank: Rank = {
    division: 'Sandanme',
    name: '三段目',
    number: rankNumber,
    side: 'East',
  };
  const playerRecord: PlayerLowerRecord = {
    rank: fromRank,
    shikona: '診断力士',
    stableId: 'diagnostic',
    wins: 0,
    losses: recordType === '0-7' ? 7 : 0,
    absent: recordType === '0-0-7' ? 7 : 0,
  };
  const resolution = resolveLowerDivisionPlacements(
    buildForcedResults('Sandanme', rankNumber, recordType),
    playerRecord,
  );
  const finalRank = resolution.playerAssignedRank ?? fromRank;
  return {
    source: 'forced',
    recordType,
    fromDivision: 'Sandanme',
    fromRankNumber: rankNumber,
    fromRankLabel: formatRank(fromRank),
    finalDivision: finalRank.division,
    finalRankNumber: finalRank.number ?? null,
    finalRankLabel: formatRank(finalRank),
    reasonCodes: [],
  };
};

const collectNaturalSamples = async (seed: number): Promise<LandingObservation[]> => {
  const result = await runCareerObservation({
    seed,
    populationKind: 'historical-like-career',
    populationPreset: 'historical-like-v2-mid',
  });
  const observations: LandingObservation[] = [];
  for (let index = 0; index < result.frames.length - 1; index += 1) {
    const frame = result.frames[index];
    const next = result.frames[index + 1];
    if (frame.kind !== 'BASHO' || next.kind !== 'BASHO' || !frame.record) continue;
    const record = frame.record;
    if (!LOWER_DIVISIONS.includes(record.rank.division as Division)) continue;
    const recordType = resolveRecordType(record.wins, record.losses, record.absent);
    if (!recordType) continue;
    const decision = frame.banzukeDecisions?.find((entry) => entry.rikishiId === 'PLAYER');
    observations.push({
      source: 'natural',
      seed,
      bashoSeq: frame.seq,
      recordType,
      fromDivision: record.rank.division as Division,
      fromRankNumber: record.rank.number ?? 1,
      fromRankLabel: formatRank(record.rank),
      finalDivision: next.rank.division,
      finalRankNumber: next.rank.number ?? null,
      finalRankLabel: formatRank(next.rank),
      reasonCodes: decision?.lowerMovementDiagnostics?.reasonCodes ?? decision?.reasons ?? [],
    });
  }
  return observations;
};

const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Number(sorted[index].toFixed(2));
};

const summarizeSandanme40To60 = (observations: LandingObservation[]) => {
  const result: Record<string, Record<string, number>> = {};
  for (const source of ['natural', 'forced'] as const) {
    for (const recordType of ['0-7', '0-0-7'] as const) {
      const group = observations.filter((row) =>
        row.source === source &&
        row.recordType === recordType &&
        row.fromDivision === 'Sandanme' &&
        row.fromRankNumber >= 40 &&
        row.fromRankNumber <= 60);
      const ranks = group.map((row) => row.finalRankNumber).filter((value): value is number => value !== null);
      result[`${source}:${recordType}`] = {
        count: group.length,
        jonidan1To30: group.filter((row) => row.finalDivision === 'Jonidan' && (row.finalRankNumber ?? 0) >= 1 && (row.finalRankNumber ?? 0) <= 30).length,
        jonidan31To60: group.filter((row) => row.finalDivision === 'Jonidan' && (row.finalRankNumber ?? 0) >= 31 && (row.finalRankNumber ?? 0) <= 60).length,
        jonidan61To90: group.filter((row) => row.finalDivision === 'Jonidan' && (row.finalRankNumber ?? 0) >= 61 && (row.finalRankNumber ?? 0) <= 90).length,
        jonidan91Plus: group.filter((row) => row.finalDivision === 'Jonidan' && (row.finalRankNumber ?? 0) >= 91).length,
        toRankP25: percentile(ranks, 0.25),
        toRankP50: percentile(ranks, 0.5),
        toRankP75: percentile(ranks, 0.75),
      };
    }
  }
  return result;
};

const renderMarkdown = (
  args: Args,
  observations: LandingObservation[],
  sandanme40To60: Record<string, Record<string, number>>,
): string => [
  '# Lower Division Sim Kyujo Demotion',
  '',
  `- careers: ${args.careers}`,
  `- seed: ${args.seed}`,
  `- observations: ${observations.length}`,
  '',
  '自然発生サンプルと、診断専用 forced scenario（三段目40-60を0-7 / 0-0-7に固定）を分けて集計する。',
  '',
  '## Sandanme 40-60',
  '',
  '| source | record | n | Jonidan 1-30 | 31-60 | 61-90 | 91+ | to rank p25/p50/p75 |',
  '| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...Object.entries(sandanme40To60).map(([key, row]) => {
    const [source, recordType] = key.split(':');
    return `| ${source} | ${recordType} | ${row.count ?? 0} | ${row.jonidan1To30 ?? 0} | ${row.jonidan31To60 ?? 0} | ${row.jonidan61To90 ?? 0} | ${row.jonidan91Plus ?? 0} | ${row.toRankP25 ?? 0}/${row.toRankP50 ?? 0}/${row.toRankP75 ?? 0} |`;
  }),
  '',
  '## Samples',
  '',
  ...observations
    .filter((row) => row.fromDivision === 'Sandanme' && row.fromRankNumber >= 40 && row.fromRankNumber <= 60)
    .slice(0, 40)
    .map((row) => `- ${row.source} ${row.recordType}: ${row.fromRankLabel} -> ${row.finalRankLabel} ${row.reasonCodes.length ? `(${row.reasonCodes.join('/')})` : ''}`),
  '',
].join('\n');

const main = async (): Promise<void> => {
  const args = parseArgs();
  const observations: LandingObservation[] = [];
  for (let index = 0; index < args.careers; index += 1) {
    observations.push(...await collectNaturalSamples(args.seed + index));
    if ((index + 1) % 10 === 0 || index + 1 === args.careers) {
      console.log(`sim kyujo demotion: completed ${index + 1}/${args.careers}`);
    }
  }
  for (let rankNumber = 40; rankNumber <= 60; rankNumber += 1) {
    observations.push(collectForcedScenario(rankNumber, '0-7'));
    observations.push(collectForcedScenario(rankNumber, '0-0-7'));
  }
  const sandanme40To60 = summarizeSandanme40To60(observations);
  const meta = {
    generatedAt: new Date().toISOString(),
    args,
    observations: observations.length,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify({ meta, sandanme40To60, observations }, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, `${renderMarkdown(args, observations, sandanme40To60)}\n`);
  console.log(path.relative(ROOT, OUT_MD));
  console.log(path.relative(ROOT, OUT_JSON));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
