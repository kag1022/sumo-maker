import fs from 'fs';
import path from 'path';
import { Rank, RankScaleSlots } from '../../src/logic/models';
import { BanzukeDecisionLog } from '../../src/logic/banzuke';
import { runCareerObservation } from '../../src/logic/simulation/observation';
import {
  EmpiricalBanzukeCalibrationSource,
  resolveEmpiricalSlotBand,
  setEmpiricalBanzukeCalibrationSource,
} from '../../src/logic/banzuke/providers/empirical';
import {
  LowerDivisionKey,
  resolveLowerDivisionMax,
  resolveLowerDivisionOffset,
  resolveLowerDivisionTotal,
} from '../../src/logic/banzuke/scale/rankLimits';

type Division = LowerDivisionKey;
type RankBand = 'upper' | 'middle' | 'lower' | 'bottom';
type RecordBucket = '0-7' | '1-6' | '2-5' | '3-4' | '4-3' | '5-2' | '6-1' | '7-0';

interface Observation {
  source: EmpiricalBanzukeCalibrationSource;
  seed: number;
  seq: number;
  division: Division;
  rankBand: RankBand;
  record: RecordBucket;
  movement: number;
  demotionWidth: number;
  promotionWidth: number;
  divisionCrossing: boolean;
  recordAwareHit: boolean;
  fallbackHit: boolean;
  sampleSize: number;
  beforeRank: string;
  afterRank: string;
  reasonCodes: string[];
}

interface SummaryRow {
  source: EmpiricalBanzukeCalibrationSource;
  division: Division;
  rankBand: RankBand;
  record: RecordBucket;
  count: number;
  demotionP50: number;
  demotionP75: number;
  promotionP50: number;
  promotionP75: number;
  divisionCrossingRate: number;
  fallbackHitRate: number;
  recordAwareHitRate: number;
}

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'docs', 'design', 'lower_division_calibration_source_ab_report.json');
const OUT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_calibration_source_ab_report.md');
const LOWER_DIVISIONS: Division[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const RECORDS: RecordBucket[] = ['0-7', '1-6', '2-5', '3-4', '4-3', '5-2', '6-1', '7-0'];
const RANK_BANDS: RankBand[] = ['upper', 'middle', 'lower', 'bottom'];
const SOURCES: EmpiricalBanzukeCalibrationSource[] = ['heisei', 'long-range'];
const DIVISION_ORDER: Rank['division'][] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];

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
    careers: Math.max(1, Math.floor(readNumber('--careers', 100))),
    seed: Math.floor(readNumber('--seed', 20260420)),
  };
};

const toRankLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : '東';
  return `${side}${rank.name}${rank.number ?? 1}枚目`;
};

const toLowerSlot = (rank: Rank, scaleSlots?: RankScaleSlots): number => {
  const offsets = resolveLowerDivisionOffset(scaleSlots);
  return offsets[rank.division as Division] + ((rank.number ?? 1) - 1) * 2 + (rank.side === 'West' ? 1 : 0);
};

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

const rate = (count: number, total: number): number =>
  total === 0 ? 0 : Number((count / total).toFixed(4));

const observeSeed = async (
  source: EmpiricalBanzukeCalibrationSource,
  seed: number,
): Promise<Observation[]> => {
  setEmpiricalBanzukeCalibrationSource(source);
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
      (toLowerSlot(before, frame.record.scaleSlots) - toLowerSlot(after, frame.record.scaleSlots));
    const provider = resolveEmpiricalSlotBand({
      division: before.division,
      rankName: before.name,
      rankNumber: before.number,
      currentSlot: toLowerSlot(before, frame.record.scaleSlots) + 1,
      totalSlots: resolveLowerDivisionTotal(frame.record.scaleSlots),
      divisionTotalSlots: resolveLowerDivisionMax(frame.record.scaleSlots)[before.division] * 2,
      wins: frame.record.wins,
      losses: frame.record.losses,
      absent: frame.record.absent,
    });

    observations.push({
      source,
      seed,
      seq: frame.seq,
      division: before.division,
      rankBand: resolveRankBand(before, frame.record.scaleSlots),
      record,
      movement,
      demotionWidth: Math.max(0, -movement),
      promotionWidth: Math.max(0, movement),
      divisionCrossing: divisionDelta(before.division, after.division) !== 0,
      recordAwareHit: provider.source === 'recordAware' && provider.sampleSize >= 20,
      fallbackHit: provider.source !== 'recordAware' || provider.sampleSize < 20,
      sampleSize: provider.sampleSize,
      beforeRank: toRankLabel(before),
      afterRank: toRankLabel(after),
      reasonCodes: decision?.lowerMovementDiagnostics?.reasonCodes ?? [],
    });
  }
  return observations;
};

const summarize = (observations: Observation[]): SummaryRow[] => {
  const rows: SummaryRow[] = [];
  for (const source of SOURCES) {
    for (const division of LOWER_DIVISIONS) {
      for (const rankBand of RANK_BANDS) {
        for (const record of RECORDS) {
          const group = observations.filter((row) =>
            row.source === source &&
            row.division === division &&
            row.rankBand === rankBand &&
            row.record === record);
          if (!group.length) continue;
          rows.push({
            source,
            division,
            rankBand,
            record,
            count: group.length,
            demotionP50: percentile(group.map((row) => row.demotionWidth), 0.5),
            demotionP75: percentile(group.map((row) => row.demotionWidth), 0.75),
            promotionP50: percentile(group.map((row) => row.promotionWidth), 0.5),
            promotionP75: percentile(group.map((row) => row.promotionWidth), 0.75),
            divisionCrossingRate: rate(group.filter((row) => row.divisionCrossing).length, group.length),
            fallbackHitRate: rate(group.filter((row) => row.fallbackHit).length, group.length),
            recordAwareHitRate: rate(group.filter((row) => row.recordAwareHit).length, group.length),
          });
        }
      }
    }
  }
  return rows;
};

const findPair = (
  rows: SummaryRow[],
  source: EmpiricalBanzukeCalibrationSource,
  division: Division,
  rankBand: RankBand,
  record: RecordBucket,
): SummaryRow | undefined =>
  rows.find((row) =>
    row.source === source &&
    row.division === division &&
    row.rankBand === rankBand &&
    row.record === record);

const writeMarkdown = (rows: SummaryRow[], meta: Record<string, unknown>): void => {
  const lines = [
    '# Lower Division Calibration Source A/B Report',
    '',
    `- generatedAt: ${meta.generatedAt}`,
    `- careers: ${meta.careers}`,
    `- baseSeed: ${meta.baseSeed}`,
    `- observations: ${meta.observations}`,
    '',
    '| division | band | record | H n | H dem p50/p75 | H pro p50/p75 | H cross | H fallback | H record-aware | LR n | LR dem p50/p75 | LR pro p50/p75 | LR cross | LR fallback | LR record-aware |',
    '| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | ---: |',
  ];
  for (const division of LOWER_DIVISIONS) {
    for (const rankBand of RANK_BANDS) {
      for (const record of RECORDS) {
        const heisei = findPair(rows, 'heisei', division, rankBand, record);
        const longRange = findPair(rows, 'long-range', division, rankBand, record);
        if (!heisei && !longRange) continue;
        const h = heisei ?? {
          count: 0,
          demotionP50: 0,
          demotionP75: 0,
          promotionP50: 0,
          promotionP75: 0,
          divisionCrossingRate: 0,
          fallbackHitRate: 0,
          recordAwareHitRate: 0,
        };
        const lr = longRange ?? {
          count: 0,
          demotionP50: 0,
          demotionP75: 0,
          promotionP50: 0,
          promotionP75: 0,
          divisionCrossingRate: 0,
          fallbackHitRate: 0,
          recordAwareHitRate: 0,
        };
        lines.push(`| ${division} | ${rankBand} | ${record} | ${h.count} | ${h.demotionP50}/${h.demotionP75} | ${h.promotionP50}/${h.promotionP75} | ${(h.divisionCrossingRate * 100).toFixed(1)}% | ${(h.fallbackHitRate * 100).toFixed(1)}% | ${(h.recordAwareHitRate * 100).toFixed(1)}% | ${lr.count} | ${lr.demotionP50}/${lr.demotionP75} | ${lr.promotionP50}/${lr.promotionP75} | ${(lr.divisionCrossingRate * 100).toFixed(1)}% | ${(lr.fallbackHitRate * 100).toFixed(1)}% | ${(lr.recordAwareHitRate * 100).toFixed(1)}% |`);
      }
    }
  }
  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  fs.writeFileSync(OUT_MD, `${lines.join('\n')}\n`);
};

const main = async (): Promise<void> => {
  const { careers, seed } = parseArgs();
  const observations: Observation[] = [];
  for (const source of SOURCES) {
    for (let index = 0; index < careers; index += 1) {
      observations.push(...await observeSeed(source, seed + index));
      if ((index + 1) % 10 === 0 || index + 1 === careers) {
        console.log(`calibration A/B ${source}: completed ${index + 1}/${careers}`);
      }
    }
  }
  setEmpiricalBanzukeCalibrationSource('long-range');
  const rows = summarize(observations);
  const meta = {
    generatedAt: new Date().toISOString(),
    careers,
    baseSeed: seed,
    observations: observations.length,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify({ meta, rows }, null, 2)}\n`);
  writeMarkdown(rows, meta);
  console.log(`A/B observations=${observations.length}`);
  console.log(path.relative(ROOT, OUT_MD));
  console.log(path.relative(ROOT, OUT_JSON));
};

main().catch((error) => {
  setEmpiricalBanzukeCalibrationSource('long-range');
  console.error(error);
  process.exitCode = 1;
});
