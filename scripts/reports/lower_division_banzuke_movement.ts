import fs from 'fs';
import os from 'os';
import path from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { Rank, RankScaleSlots } from '../../src/logic/models';
import { getRankValueForChart } from '../../src/logic/ranking/rankScore';
import { runCareerObservation } from '../../src/logic/simulation/observation';
import { BanzukeDecisionLog } from '../../src/logic/banzuke';
import {
  LowerDivisionKey,
  resolveLowerDivisionMax,
  resolveLowerDivisionOffset,
} from '../../src/logic/banzuke/scale/rankLimits';

type LowerDivision = LowerDivisionKey;
type RankBand = 'upper' | 'middle' | 'lower' | 'bottom';
type RecordBucket = '7-0' | '6-1' | '5-2' | '4-3' | '3-4' | '2-5' | '1-6' | '0-7';

interface MovementObservation {
  seed: number;
  seq: number;
  division: LowerDivision;
  rankBand: RankBand;
  record: RecordBucket;
  movement: number;
  recordMovement: number;
  pressureMovement: number;
  populationCompression: number;
  boundaryProjection: number;
  stayed: boolean;
  kachikoshiButNoPromotion: boolean;
  makekoshiButNoDemotion: boolean;
  promotionToNextDivision: boolean;
  fallbackApplied: boolean;
  unresolvedTargetRank: boolean;
  newRecruitPressureApplied: boolean;
  vacancyPressureApplied: boolean;
  rankScaleExtension: boolean;
  boundaryProjectionApplied: boolean;
  dynamicScaleResolved: boolean;
  makekoshiPromotionWithPressure: boolean;
  makekoshiPopulationCompression: boolean;
  kachikoshiRewardLost: boolean;
  kachikoshiRewardPreserved: boolean;
  fallbackReasons: string[];
  movementReasons: string[];
  beforeRank: string;
  proposedRank: string;
  afterRank: string;
}

interface WorkerResult {
  observations: MovementObservation[];
}

interface SummaryRow {
  division: LowerDivision;
  rankBand: RankBand;
  record: RecordBucket;
  sample: number;
  averageMovement: number;
  recordMovementAverage: number;
  pressureMovementAverage: number;
  populationCompressionAverage: number;
  boundaryProjectionAverage: number;
  finalMovementAverage: number;
  p10Movement: number;
  p50Movement: number;
  p90Movement: number;
  stayRate: number;
  kachikoshiButNoPromotionRate: number;
  makekoshiButNoDemotionRate: number;
  promotionToNextDivisionRate: number;
  fallbackAppliedRate: number;
  unresolvedTargetRankRate: number;
  newRecruitPressureAppliedRate: number;
  vacancyPressureAppliedRate: number;
  rankScaleExtensionRate: number;
  boundaryProjectionRate: number;
  dynamicScaleResolvedRate: number;
  makekoshiPromotionWithPressureRate: number;
  makekoshiPopulationCompressionRate: number;
  kachikoshiRewardLostRate: number;
  kachikoshiRewardPreservedRate: number;
  fallbackReasons: Record<string, number>;
}

interface ReportPayload {
  generatedAt: string;
  meta: {
    seeds: number;
    observations: number;
    workerCount: number;
    note: string;
  };
  rows: SummaryRow[];
  focusJonokuchiBottomKachikoshi: SummaryRow[];
  invalidRankSamples: MovementObservation[];
  fallbackSamples: MovementObservation[];
}

const REPORT_PATH = path.join('docs', 'balance', 'lower-division-banzuke-movement.md');
const JSON_PATH = path.join('.tmp', 'lower-division-banzuke-movement.json');
const LOWER_DIVISIONS: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const DIVISION_ORDER: Rank['division'][] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];
const RECORD_BUCKETS: RecordBucket[] = ['7-0', '6-1', '5-2', '4-3', '3-4', '2-5', '1-6', '0-7'];
const RANK_BANDS: RankBand[] = ['upper', 'middle', 'lower', 'bottom'];
const DEFAULT_SEEDS = Number(process.env.LOWER_BANZUKE_AUDIT_SEEDS || 160);
const DEFAULT_WORKER_LIMIT = Number(process.env.LOWER_BANZUKE_AUDIT_WORKERS || 0);

const isLowerDivision = (division: Rank['division']): division is LowerDivision =>
  LOWER_DIVISIONS.includes(division as LowerDivision);

const resolveAvailableWorkers = (): number => {
  const available =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length;
  if (DEFAULT_WORKER_LIMIT > 0) return Math.max(1, DEFAULT_WORKER_LIMIT);
  return Math.max(1, Math.min(8, available - 1 || 1));
};

const toRankLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : '東';
  if (typeof rank.number === 'number') return `${rank.name}${rank.number}${side}`;
  return `${rank.name}${side}`;
};

const toLowerHalfStep = (rank: Rank, scaleSlots?: RankScaleSlots): number => {
  if (!isLowerDivision(rank.division)) return getRankValueForChart(rank) * 2 + (rank.side === 'West' ? 1 : 0);
  const offsets = resolveLowerDivisionOffset(scaleSlots);
  return offsets[rank.division] + ((rank.number ?? 1) - 1) * 2 + (rank.side === 'West' ? 1 : 0);
};

const compareDivision = (before: Rank['division'], after: Rank['division']): number =>
  DIVISION_ORDER.indexOf(before) - DIVISION_ORDER.indexOf(after);

const resolveMovement = (before: Rank, after: Rank, scaleSlots?: RankScaleSlots): number => {
  if (isLowerDivision(before.division) && isLowerDivision(after.division)) {
    return toLowerHalfStep(before, scaleSlots) - toLowerHalfStep(after, scaleSlots);
  }
  return (getRankValueForChart(before) * 2 + (before.side === 'West' ? 1 : 0)) -
    (getRankValueForChart(after) * 2 + (after.side === 'West' ? 1 : 0));
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

const resolveRecordBucket = (wins: number, losses: number, absent: number): RecordBucket | null => {
  if (absent > 0) return null;
  const key = `${wins}-${losses}`;
  return RECORD_BUCKETS.includes(key as RecordBucket) ? key as RecordBucket : null;
};

const isRankInsideKnownScale = (rank: Rank, scaleSlots?: RankScaleSlots): boolean => {
  if (!isLowerDivision(rank.division)) return true;
  const number = rank.number ?? Number.NaN;
  if (!Number.isFinite(number)) return false;
  const max = resolveLowerDivisionMax(scaleSlots)[rank.division];
  return number >= 1 && number <= max;
};

const resolveFallbackReasons = (decision?: BanzukeDecisionLog): string[] => {
  if (!decision) return [];
  const reasons = new Set<string>();
  for (const reason of decision.reasons ?? []) {
    if (reason === 'AUDIT_FALLBACK_LEGACY') reasons.add(reason);
    if (reason.startsWith('REVIEW_')) reasons.add(reason);
  }
  for (const name of decision.overrideNames ?? []) reasons.add(name);
  if (decision.proposalBasis === 'RULE_OVERRIDE') reasons.add('RULE_OVERRIDE');
  if (decision.usedBoundaryPressure) reasons.add(`BOUNDARY_${decision.proposalSource ?? 'UNKNOWN'}`);
  return [...reasons].sort();
};

const observeSeed = async (seed: number): Promise<WorkerResult> => {
  const result = await runCareerObservation({
    seed,
    populationKind: 'historical-like-career',
    populationPreset: 'historical-like-v2-mid',
  });
  const observations: MovementObservation[] = [];

  for (const frame of result.frames) {
    if (frame.kind !== 'BASHO' || !frame.record) continue;
    const before = frame.record.rank;
    if (!isLowerDivision(before.division)) continue;
    const record = resolveRecordBucket(frame.record.wins, frame.record.losses, frame.record.absent);
    if (!record) continue;

    const decision = frame.banzukeDecisions?.find((entry) => entry.rikishiId === 'PLAYER');
    const after = decision?.finalRank ?? frame.rank;
    const proposed = decision?.proposedRank ?? after;
    const movement = decision?.lowerMovementDiagnostics?.finalMovement ??
      resolveMovement(before, after, frame.record.scaleSlots);
    const recordMovement = decision?.lowerMovementDiagnostics?.recordMovement ?? movement;
    const pressureMovement =
      (decision?.lowerMovementDiagnostics?.newRecruitPressure ?? 0) +
      (decision?.lowerMovementDiagnostics?.vacancyPressure ?? 0);
    const populationCompression = decision?.lowerMovementDiagnostics?.populationCompression ?? 0;
    const boundaryProjection = decision?.lowerMovementDiagnostics?.boundaryProjection ?? 0;
    const fallbackReasons = resolveFallbackReasons(decision);
    const movementReasons = decision?.lowerMovementDiagnostics?.reasonCodes ?? [];
    const divisionDelta = compareDivision(before.division, after.division);
    const isKachikoshi = frame.record.wins > frame.record.losses + frame.record.absent;
    const isMakekoshi = frame.record.wins < frame.record.losses + frame.record.absent;

    observations.push({
      seed,
      seq: frame.seq,
      division: before.division,
      rankBand: resolveRankBand(before, frame.record.scaleSlots),
      record,
      movement,
      recordMovement,
      pressureMovement,
      populationCompression,
      boundaryProjection,
      stayed: movement === 0,
      kachikoshiButNoPromotion: isKachikoshi && movement <= 0,
      makekoshiButNoDemotion: isMakekoshi && movement >= 0,
      promotionToNextDivision: divisionDelta > 0,
      fallbackApplied: fallbackReasons.length > 0,
      unresolvedTargetRank:
        !(decision?.lowerMovementDiagnostics?.dynamicScaleResolved ?? false) &&
        (
          !isRankInsideKnownScale(proposed, frame.record.scaleSlots) ||
          !isRankInsideKnownScale(after, frame.record.scaleSlots)
        ),
      newRecruitPressureApplied: (decision?.lowerMovementDiagnostics?.newRecruitPressure ?? 0) !== 0,
      vacancyPressureApplied: (decision?.lowerMovementDiagnostics?.vacancyPressure ?? 0) !== 0,
      rankScaleExtension: decision?.lowerMovementDiagnostics?.rankScaleExtended ?? false,
      boundaryProjectionApplied: decision?.lowerMovementDiagnostics?.boundaryProjectionApplied ?? false,
      dynamicScaleResolved: decision?.lowerMovementDiagnostics?.dynamicScaleResolved ?? false,
      makekoshiPromotionWithPressure:
        decision?.lowerMovementDiagnostics?.reasonCodes.includes('MAKEKOSHI_PROMOTION_BY_PRESSURE') ?? false,
      makekoshiPopulationCompression:
        decision?.lowerMovementDiagnostics?.reasonCodes.includes('POPULATION_COMPRESSION') ?? false,
      kachikoshiRewardLost:
        decision?.lowerMovementDiagnostics?.reasonCodes.includes('KACHIKOSHI_REWARD_LOST') ?? false,
      kachikoshiRewardPreserved:
        decision?.lowerMovementDiagnostics?.reasonCodes.includes('KACHIKOSHI_REWARD_PRESERVED') ?? false,
      fallbackReasons,
      movementReasons,
      beforeRank: toRankLabel(before),
      proposedRank: toRankLabel(proposed),
      afterRank: toRankLabel(after),
    });
  }

  return { observations };
};

const percentile = (values: number[], ratio: number): number => {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;

const rate = (values: MovementObservation[], predicate: (value: MovementObservation) => boolean): number =>
  values.length ? values.filter(predicate).length / values.length : Number.NaN;

const summarizeGroup = (
  division: LowerDivision,
  rankBand: RankBand,
  record: RecordBucket,
  rows: MovementObservation[],
): SummaryRow => {
  const movements = rows.map((row) => row.movement);
  const recordMovements = rows.map((row) => row.recordMovement);
  const pressureMovements = rows.map((row) => row.pressureMovement);
  const populationCompressions = rows.map((row) => row.populationCompression);
  const boundaryProjections = rows.map((row) => row.boundaryProjection);
  const fallbackReasons: Record<string, number> = {};
  for (const row of rows) {
    for (const reason of row.fallbackReasons) {
      fallbackReasons[reason] = (fallbackReasons[reason] ?? 0) + 1;
    }
  }
  return {
    division,
    rankBand,
    record,
    sample: rows.length,
    averageMovement: mean(movements),
    recordMovementAverage: mean(recordMovements),
    pressureMovementAverage: mean(pressureMovements),
    populationCompressionAverage: mean(populationCompressions),
    boundaryProjectionAverage: mean(boundaryProjections),
    finalMovementAverage: mean(movements),
    p10Movement: percentile(movements, 0.1),
    p50Movement: percentile(movements, 0.5),
    p90Movement: percentile(movements, 0.9),
    stayRate: rate(rows, (row) => row.stayed),
    kachikoshiButNoPromotionRate: rate(rows, (row) => row.kachikoshiButNoPromotion),
    makekoshiButNoDemotionRate: rate(rows, (row) => row.makekoshiButNoDemotion),
    promotionToNextDivisionRate: rate(rows, (row) => row.promotionToNextDivision),
    fallbackAppliedRate: rate(rows, (row) => row.fallbackApplied),
    unresolvedTargetRankRate: rate(rows, (row) => row.unresolvedTargetRank),
    newRecruitPressureAppliedRate: rate(rows, (row) => row.newRecruitPressureApplied),
    vacancyPressureAppliedRate: rate(rows, (row) => row.vacancyPressureApplied),
    rankScaleExtensionRate: rate(rows, (row) => row.rankScaleExtension),
    boundaryProjectionRate: rate(rows, (row) => row.boundaryProjectionApplied),
    dynamicScaleResolvedRate: rate(rows, (row) => row.dynamicScaleResolved),
    makekoshiPromotionWithPressureRate: rate(rows, (row) => row.makekoshiPromotionWithPressure),
    makekoshiPopulationCompressionRate: rate(rows, (row) => row.makekoshiPopulationCompression),
    kachikoshiRewardLostRate: rate(rows, (row) => row.kachikoshiRewardLost),
    kachikoshiRewardPreservedRate: rate(rows, (row) => row.kachikoshiRewardPreserved),
    fallbackReasons,
  };
};

const buildSummary = (observations: MovementObservation[], seeds: number, workerCount: number): ReportPayload => {
  const rows: SummaryRow[] = [];
  for (const division of LOWER_DIVISIONS) {
    for (const rankBand of RANK_BANDS) {
      for (const record of RECORD_BUCKETS) {
        rows.push(summarizeGroup(
          division,
          rankBand,
          record,
          observations.filter((row) =>
            row.division === division && row.rankBand === rankBand && row.record === record),
        ));
      }
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    meta: {
      seeds,
      observations: observations.length,
      workerCount,
      note: 'movement は半枚単位。正の値が番付上昇、負の値が降下。record/pressure/compression/boundary は decision log の lowerMovementDiagnostics から読む。',
    },
    rows,
    focusJonokuchiBottomKachikoshi: rows.filter((row) =>
      row.division === 'Jonokuchi' &&
      row.rankBand === 'bottom' &&
      (row.record === '4-3' || row.record === '5-2' || row.record === '6-1' || row.record === '7-0')),
    invalidRankSamples: observations.filter((row) => row.unresolvedTargetRank).slice(0, 40),
    fallbackSamples: observations.filter((row) => row.fallbackApplied).slice(0, 40),
  };
};

const formatNumber = (value: number): string =>
  Number.isFinite(value) ? value.toFixed(2) : 'n/a';

const formatRate = (value: number): string =>
  Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : 'n/a';

const renderRow = (row: SummaryRow): string =>
  [
    row.division,
    row.rankBand,
    row.record,
    row.sample.toString(),
    formatNumber(row.averageMovement),
    formatNumber(row.recordMovementAverage),
    formatNumber(row.pressureMovementAverage),
    formatNumber(row.populationCompressionAverage),
    formatNumber(row.boundaryProjectionAverage),
    formatNumber(row.finalMovementAverage),
    formatNumber(row.p10Movement),
    formatNumber(row.p50Movement),
    formatNumber(row.p90Movement),
    formatRate(row.stayRate),
    formatRate(row.kachikoshiButNoPromotionRate),
    formatRate(row.makekoshiButNoDemotionRate),
    formatRate(row.promotionToNextDivisionRate),
    formatRate(row.fallbackAppliedRate),
    formatRate(row.unresolvedTargetRankRate),
    formatRate(row.newRecruitPressureAppliedRate),
    formatRate(row.vacancyPressureAppliedRate),
    formatRate(row.rankScaleExtensionRate),
    formatRate(row.boundaryProjectionRate),
    formatRate(row.dynamicScaleResolvedRate),
    formatRate(row.makekoshiPromotionWithPressureRate),
    formatRate(row.makekoshiPopulationCompressionRate),
    formatRate(row.kachikoshiRewardLostRate),
    formatRate(row.kachikoshiRewardPreservedRate),
    Object.entries(row.fallbackReasons).map(([key, count]) => `${key}:${count}`).join(' / ') || '-',
  ].join(' | ');

const renderReport = (payload: ReportPayload): string => {
  const header = 'division | rankBand | record | sample | avg | recordAvg | pressureAvg | compressionAvg | boundaryAvg | finalAvg | p10 | p50 | p90 | stay | KK no promo | MK no demotion | next division | fallback | unresolved | newRecruit | vacancy | scaleExt | boundaryProj | dynamicScale | MK pressure promo | MK compression | KK lost | KK preserved | fallback reasons';
  const separator = '--- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---';
  const lines = [
    '# 下位番付移動 Audit',
    '',
    `- 実行日: ${payload.generatedAt}`,
    `- seed数: ${payload.meta.seeds}`,
    `- 観測遷移数: ${payload.meta.observations}`,
    `- worker数: ${payload.meta.workerCount}`,
    `- 注記: ${payload.meta.note}`,
    '',
    '## 序ノ口下位 勝ち越し重点',
    '',
    header,
    separator,
    ...payload.focusJonokuchiBottomKachikoshi.map(renderRow),
    '',
    '## 全集計',
    '',
    header,
    separator,
    ...payload.rows.filter((row) => row.sample > 0).map(renderRow),
    '',
    '## unresolved target rank samples',
    '',
    ...(
      payload.invalidRankSamples.length
        ? payload.invalidRankSamples.map((row) =>
          `- seed ${row.seed} seq ${row.seq}: ${row.beforeRank} ${row.record} -> proposed ${row.proposedRank} / final ${row.afterRank}`)
        : ['- なし']
    ),
    '',
    '## fallback samples',
    '',
    ...(
      payload.fallbackSamples.length
        ? payload.fallbackSamples.map((row) =>
          `- seed ${row.seed} seq ${row.seq}: ${row.beforeRank} ${row.record} -> ${row.afterRank} (${row.fallbackReasons.join(', ')} / movement: ${row.movementReasons.join(', ') || '-'})`)
        : ['- なし']
    ),
    '',
  ];
  return lines.join('\n');
};

const writeFile = (filePath: string, text: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const runSeedsParallel = async (seeds: number[]): Promise<WorkerResult[]> => {
  const workerCount = Math.min(resolveAvailableWorkers(), seeds.length);
  if (workerCount <= 1) return Promise.all(seeds.map(observeSeed));

  console.log(`lower division banzuke audit: seeds=${seeds.length}, workers=${workerCount}`);
  return new Promise((resolve, reject) => {
    const results: WorkerResult[] = new Array(seeds.length);
    let activeWorkers = 0;
    let completed = 0;
    let nextIndex = 0;
    let failed = false;

    const launchNext = (): void => {
      if (failed) return;
      if (completed === seeds.length && activeWorkers === 0) {
        resolve(results);
        return;
      }
      while (activeWorkers < workerCount && nextIndex < seeds.length) {
        const taskIndex = nextIndex;
        const seed = seeds[nextIndex];
        nextIndex += 1;
        activeWorkers += 1;
        const worker = new Worker(__filename, { workerData: seed });
        worker.on('message', (message: WorkerResult) => {
          results[taskIndex] = message;
          completed += 1;
          if (completed % 20 === 0 || completed === seeds.length) {
            console.log(`lower division banzuke audit: completed ${completed}/${seeds.length}`);
          }
        });
        worker.on('error', (error) => {
          failed = true;
          reject(error);
        });
        worker.on('exit', (code) => {
          activeWorkers -= 1;
          if (!failed && code !== 0) {
            failed = true;
            reject(new Error(`lower division banzuke audit worker exited with code ${code}`));
            return;
          }
          launchNext();
        });
      }
    };

    launchNext();
  });
};

const runMain = async (): Promise<void> => {
  const seeds = Array.from({ length: DEFAULT_SEEDS }, (_, index) => index + 1);
  const workerCount = Math.min(resolveAvailableWorkers(), seeds.length);
  const results = await runSeedsParallel(seeds);
  const observations = results.flatMap((result) => result.observations);
  const payload = buildSummary(observations, seeds.length, workerCount);
  writeFile(JSON_PATH, JSON.stringify(payload, null, 2));
  writeFile(REPORT_PATH, renderReport(payload));
  console.log(renderReport(payload));
  console.log(`report written: ${REPORT_PATH}`);
  console.log(`json written: ${JSON_PATH}`);
};

if (!isMainThread) {
  observeSeed(workerData as number)
    .then((result) => parentPort?.postMessage(result))
    .catch((error) => {
      throw error;
    });
} else {
  runMain().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
