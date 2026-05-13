import fs from 'fs';
import path from 'path';
import { Rank, RankScaleSlots } from '../../src/logic/models';
import { BanzukeDecisionLog } from '../../src/logic/banzuke';
import { getRankValueForChart } from '../../src/logic/ranking/rankScore';
import { runCareerObservation } from '../../src/logic/simulation/observation';
import {
  LowerDivisionKey,
  resolveLowerDivisionMax,
  resolveLowerDivisionOffset,
} from '../../src/logic/banzuke/scale/rankLimits';

type Division = LowerDivisionKey;
type RankBand = 'upper' | 'middle' | 'lower' | 'bottom';
type RecordBucket = '0-7' | '1-6' | '2-5' | '3-4' | '4-3' | '5-2' | '6-1' | '7-0';

interface Observation {
  seed: number;
  seq: number;
  division: Division;
  rankBand: RankBand;
  record: RecordBucket;
  demotionWidth: number;
  sameDivision: boolean;
  demotedToLowerDivision: boolean;
  floorClampLikely: boolean;
  extremeDemotion: boolean;
  beforeRank: string;
  afterRank: string;
  reasonCodes: string[];
  playerOnly: boolean;
}

interface SummaryRow {
  division: Division;
  rankBand: RankBand;
  record: RecordBucket;
  count: number;
  p25: number;
  p50: number;
  p75: number;
  average: number;
  sameDivisionStayRate: number;
  demotionToLowerDivisionRate: number;
  floorClampLikelyRate: number;
  extremeDemotionRate: number;
}

const LOWER_DIVISIONS: Division[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const RECORDS: RecordBucket[] = ['0-7', '1-6', '2-5', '3-4', '4-3', '5-2', '6-1', '7-0'];
const RANK_BANDS: RankBand[] = ['upper', 'middle', 'lower', 'bottom'];
const DIVISION_ORDER: Rank['division'][] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'docs', 'design', 'lower_division_sim_demotion_width.json');
const OUT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_sim_demotion_width.md');

const isLowerDivision = (division: Rank['division']): division is Division =>
  LOWER_DIVISIONS.includes(division as Division);

const parseArgs = (): { careers: number; seed: number } => {
  const args = process.argv.slice(2);
  const readNumber = (name: string, fallback: number): number => {
    const index = args.indexOf(name);
    if (index < 0) return fallback;
    const value = Number(args[index + 1]);
    return Number.isFinite(value) ? value : fallback;
  };
  return {
    careers: Math.max(1, Math.floor(readNumber('--careers', 20))),
    seed: Math.floor(readNumber('--seed', 20260420)),
  };
};

const toRankLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : '東';
  return `${side}${rank.name}${rank.number ?? 1}枚目`;
};

const toLowerSlot = (rank: Rank, scaleSlots?: RankScaleSlots): number => {
  if (!isLowerDivision(rank.division)) {
    return getRankValueForChart(rank) * 2 + (rank.side === 'West' ? 1 : 0);
  }
  const offsets = resolveLowerDivisionOffset(scaleSlots);
  return offsets[rank.division] + ((rank.number ?? 1) - 1) * 2 + (rank.side === 'West' ? 1 : 0);
};

const resolveMovement = (before: Rank, after: Rank, scaleSlots?: RankScaleSlots): number =>
  toLowerSlot(before, scaleSlots) - toLowerSlot(after, scaleSlots);

const resolveRankBand = (rank: Rank, scaleSlots?: RankScaleSlots): RankBand => {
  if (!isLowerDivision(rank.division)) return 'middle';
  const max = resolveLowerDivisionMax(scaleSlots)[rank.division];
  const progress = ((rank.number ?? max) - 1) / Math.max(1, max - 1);
  if (progress < 0.25) return 'upper';
  if (progress < 0.65) return 'middle';
  if (progress < 0.9) return 'lower';
  return 'bottom';
};

const resolveRecord = (wins: number, losses: number, absent: number): RecordBucket | null => {
  if (absent > 0) return null;
  const bucket = `${wins}-${losses}`;
  return RECORDS.includes(bucket as RecordBucket) ? bucket as RecordBucket : null;
};

const divisionDelta = (before: Rank['division'], after: Rank['division']): number =>
  DIVISION_ORDER.indexOf(after) - DIVISION_ORDER.indexOf(before);

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Number(sorted[index].toFixed(2));
};

const average = (values: number[]): number =>
  values.length === 0 ? 0 : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));

const rate = (count: number, total: number): number =>
  total === 0 ? 0 : Number((count / total).toFixed(4));

const observeSeed = async (seed: number): Promise<Observation[]> => {
  const result = await runCareerObservation({
    seed,
    populationKind: 'historical-like-career',
    populationPreset: 'historical-like-v2-mid',
  });
  const observations: Observation[] = [];
  for (const frame of result.frames) {
    if (frame.kind !== 'BASHO' || !frame.record) continue;
    const before = frame.record.rank;
    if (!isLowerDivision(before.division)) continue;
    const record = resolveRecord(frame.record.wins, frame.record.losses, frame.record.absent);
    if (!record) continue;
    const decision: BanzukeDecisionLog | undefined = frame.banzukeDecisions?.find((row) => row.rikishiId === 'PLAYER');
    const after = decision?.finalRank ?? frame.rank;
    const movement = decision?.lowerMovementDiagnostics?.finalMovement ??
      resolveMovement(before, after, frame.record.scaleSlots);
    const demotionWidth = Math.max(0, -movement);
    const max = resolveLowerDivisionMax(frame.record.scaleSlots)[before.division];
    const floorClampLikely = before.division === 'Jonokuchi' &&
      (before.number ?? max) >= Math.floor(max * 0.9) &&
      demotionWidth <= 2;
    observations.push({
      seed,
      seq: frame.seq,
      division: before.division,
      rankBand: resolveRankBand(before, frame.record.scaleSlots),
      record,
      demotionWidth,
      sameDivision: after.division === before.division,
      demotedToLowerDivision: divisionDelta(before.division, after.division) > 0,
      floorClampLikely,
      extremeDemotion: demotionWidth >= 100,
      beforeRank: toRankLabel(before),
      afterRank: toRankLabel(after),
      reasonCodes: decision?.lowerMovementDiagnostics?.reasonCodes ?? [],
      playerOnly: true,
    });
  }
  return observations;
};

const summarize = (observations: Observation[]): SummaryRow[] => {
  const rows: SummaryRow[] = [];
  for (const division of LOWER_DIVISIONS) {
    for (const rankBand of RANK_BANDS) {
      for (const record of RECORDS) {
        const group = observations.filter((row) =>
          row.division === division && row.rankBand === rankBand && row.record === record);
        if (group.length === 0) continue;
        const widths = group.map((row) => row.demotionWidth);
        rows.push({
          division,
          rankBand,
          record,
          count: group.length,
          p25: percentile(widths, 0.25),
          p50: percentile(widths, 0.5),
          p75: percentile(widths, 0.75),
          average: average(widths),
          sameDivisionStayRate: rate(group.filter((row) => row.sameDivision).length, group.length),
          demotionToLowerDivisionRate: rate(group.filter((row) => row.demotedToLowerDivision).length, group.length),
          floorClampLikelyRate: rate(group.filter((row) => row.floorClampLikely).length, group.length),
          extremeDemotionRate: rate(group.filter((row) => row.extremeDemotion).length, group.length),
        });
      }
    }
  }
  return rows;
};

const writeMarkdown = (rows: SummaryRow[], observations: Observation[], meta: Record<string, unknown>): void => {
  const lines = [
    '# Lower Division Sim Demotion Width',
    '',
    `- generatedAt: ${meta.generatedAt}`,
    `- careers: ${meta.careers}`,
    `- baseSeed: ${meta.baseSeed}`,
    `- observations: ${meta.observations}`,
    '- scope: player career observations only. 現行構造で全 NPC 遷移を本番ロジック変更なしに安定取得できないため。',
    '',
    'movement は降下幅を正の slot 数として扱う。既存 decision log の lowerMovementDiagnostics.finalMovement を優先する。',
    '',
    '| division | band | record | n | p25 | p50 | p75 | avg | same div | lower div | floor likely | extreme rate |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.division} | ${row.rankBand} | ${row.record} | ${row.count} | ${row.p25} | ${row.p50} | ${row.p75} | ${row.average} | ${(row.sameDivisionStayRate * 100).toFixed(1)}% | ${(row.demotionToLowerDivisionRate * 100).toFixed(1)}% | ${(row.floorClampLikelyRate * 100).toFixed(1)}% | ${(row.extremeDemotionRate * 100).toFixed(1)}% |`);
  }
  lines.push('', '## Extreme Samples', '');
  const samples = observations.filter((row) => row.extremeDemotion).slice(0, 20);
  if (samples.length === 0) {
    lines.push('- なし');
  } else {
    for (const row of samples) {
      lines.push(`- seed ${row.seed} seq ${row.seq}: ${row.beforeRank} ${row.record} -> ${row.afterRank}, width=${row.demotionWidth}, reasons=${row.reasonCodes.join('/') || '-'}`);
    }
  }
  fs.writeFileSync(OUT_MD, `${lines.join('\n')}\n`);
};

const main = async (): Promise<void> => {
  const { careers, seed } = parseArgs();
  const observations: Observation[] = [];
  for (let index = 0; index < careers; index += 1) {
    const currentSeed = seed + index;
    observations.push(...await observeSeed(currentSeed));
    if ((index + 1) % 5 === 0 || index + 1 === careers) {
      console.log(`sim diagnosis: completed ${index + 1}/${careers}`);
    }
  }
  const rows = summarize(observations);
  const meta = {
    generatedAt: new Date().toISOString(),
    careers,
    baseSeed: seed,
    observations: observations.length,
    scope: 'PLAYER_ONLY',
  };
  fs.writeFileSync(OUT_JSON, `${JSON.stringify({ meta, rows, extremeSamples: observations.filter((row) => row.extremeDemotion).slice(0, 40) }, null, 2)}\n`);
  writeMarkdown(rows, observations, meta);
  console.log(`sim observations=${observations.length}`);
  console.log(path.relative(ROOT, OUT_MD));
  console.log(path.relative(ROOT, OUT_JSON));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
