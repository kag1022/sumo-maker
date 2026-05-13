import fs from 'fs';
import path from 'path';
import { Rank, RankScaleSlots } from '../../src/logic/models';
import { BanzukeDecisionLog, BanzukeDecisionReasonCode } from '../../src/logic/banzuke';
import {
  LowerDivisionPlacementDiagnosticTrace,
  setLowerDivisionPlacementDiagnosticSink,
} from '../../src/logic/banzuke/providers/lowerBoundary';
import { OptimizerCandidateTrace } from '../../src/logic/banzuke/optimizer';
import { runCareerObservation } from '../../src/logic/simulation/observation';
import {
  getEmpiricalBanzukeCalibrationSource,
  resolveEmpiricalSlotBand,
} from '../../src/logic/banzuke/providers/empirical';
import { LONG_RANGE_BANZUKE_CALIBRATION } from '../../src/logic/calibration/banzukeLongRange';
import {
  LowerDivisionKey,
  resolveLowerDivisionMax,
  resolveLowerDivisionOffset,
  resolveLowerDivisionOrder,
  resolveLowerDivisionTotal,
} from '../../src/logic/banzuke/scale/rankLimits';

type Division = LowerDivisionKey;
type RankBand = 'upper' | 'middle' | 'lower' | 'bottom';
type CauseCode =
  | 'Q.quantile_tail'
  | 'B.boundary_crossing_deep'
  | 'O.optimizer_worsening'
  | 'P.population_pressure'
  | 'M.mixed_bucket'
  | 'F.fallback_path'
  | 'U.unknown';

interface TraceRow {
  actorId: string;
  seed: number;
  bashoIndex: number;
  fromDivision: Division;
  fromRankLabel: string;
  fromRankNumber: number;
  fromRankBand: RankBand;
  wins: number;
  losses: number;
  absent: number;
  recordBucket: '0-7';
  empiricalHit: boolean;
  calibrationSource: string;
  sampleCount: number;
  realP25: number | null;
  realP50: number | null;
  realP75: number | null;
  realP90: number | null;
  expectedSlot: number;
  minSlot: number;
  maxSlot: number;
  currentSlot: number;
  expectedDemotionWidth: number;
  maxDemotionWidth: number;
  boundaryProjectedDivision: string;
  boundaryProjectedRankLabel: string;
  boundaryProjectedSlot: number;
  boundaryProjectedDemotionWidth: number;
  optimizerInputSlot: number;
  optimizerOutputSlot: number;
  optimizerDelta: number;
  finalDivision: string;
  finalRankLabel: string;
  finalSlot: number;
  decisionProposedSlotByRecordScale: number;
  decisionFinalSlotByRecordScale: number;
  apparentFinalDemotionByRecordScale: number;
  slotCoordinateMismatch: number;
  finalDemotionWidth: number;
  gapExpectedToFinal: number;
  gapBoundaryToFinal: number;
  reasonCodes: BanzukeDecisionReasonCode[];
  causeCodes: CauseCode[];
  internalTrace?: InternalTraceSnapshot;
}

interface InternalTraceSnapshot {
  totalSlots: number;
  divisionSizes: Record<string, number>;
  divisionOffsets: Record<string, number>;
  boundarySlots: number[];
  playerSlot?: number;
  tierCounts: Record<string, number>;
  optimizerUsed: boolean;
  monotonicFallbackUsed: boolean;
  optimizerAssignmentSource?: string;
  optimizerFailureReason?: string;
  optimizerObjective?: number;
  pressureGlobal?: number;
  pressureByDivision?: Record<string, number>;
  playerCandidate?: LowerDivisionPlacementDiagnosticTrace['player'];
  playerOptimizerCandidate?: OptimizerCandidateTrace;
  playerBlockerCount: number;
  blockersBetweenExpectedAndAssigned: LowerDivisionPlacementDiagnosticTrace['playerBlockers'];
}

interface SummaryRow {
  division: Division;
  rankBand: RankBand;
  count: number;
  empiricalHitRate: number;
  fallbackRate: number;
  expectedP50: number;
  expectedP75: number;
  expectedP90: number;
  finalP50: number;
  finalP75: number;
  finalP90: number;
  gapP50: number;
  gapP75: number;
  gapMax: number;
  deepBoundaryCrossingCount: number;
  optimizerWorseningCount: number;
  mixedBucketCount: number;
  reasonCodeFrequency: Record<string, number>;
  causeFrequency: Record<string, number>;
}

const ROOT = process.cwd();
const OUT_JSON = path.join(ROOT, 'docs', 'design', 'lower_division_0_7_tail_trace.json');
const OUT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_0_7_tail_trace.md');
const AUDIT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_0_7_tail_trace_audit.md');
const LOWER_DIVISIONS: Division[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const RANK_BANDS: RankBand[] = ['upper', 'middle', 'lower', 'bottom'];
const FOCUS_KEYS = new Set([
  'Sandanme:middle',
  'Sandanme:upper',
  'Jonidan:upper',
  'Jonidan:lower',
  'Jonokuchi:middle',
]);

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
    seed: Math.floor(readNumber('--seed', 20260421)),
  };
};

const isLowerDivision = (division: Rank['division']): division is Division =>
  LOWER_DIVISIONS.includes(division as Division);

const toRankLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : '東';
  return `${side}${rank.name}${rank.number ?? 1}枚目`;
};

const toLocalLowerSlot = (rank: Rank, scaleSlots?: RankScaleSlots): number => {
  if (!isLowerDivision(rank.division)) return Number.NaN;
  const offsets = resolveLowerDivisionOffset(scaleSlots);
  return offsets[rank.division] + ((rank.number ?? 1) - 1) * 2 + (rank.side === 'West' ? 1 : 0) + 1;
};

const fromLocalLowerSlot = (slot: number, scaleSlots?: RankScaleSlots): Rank => {
  const lowerOrder = resolveLowerDivisionOrder(scaleSlots);
  const offsets = resolveLowerDivisionOffset(scaleSlots);
  const maxByDivision = resolveLowerDivisionMax(scaleSlots);
  const total = resolveLowerDivisionTotal(scaleSlots);
  const bounded = Math.max(1, Math.min(total, Math.round(slot)));
  const zeroBased = bounded - 1;
  for (const spec of lowerOrder) {
    const start = offsets[spec.division];
    const end = start + maxByDivision[spec.division] * 2 - 1;
    if (zeroBased >= start && zeroBased <= end) {
      const relative = zeroBased - start;
      return {
        division: spec.division,
        name: spec.name,
        number: Math.floor(relative / 2) + 1,
        side: relative % 2 === 0 ? 'East' : 'West',
      };
    }
  }
  return {
    division: 'Jonokuchi',
    name: '序ノ口',
    number: maxByDivision.Jonokuchi,
    side: 'West',
  };
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

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Number(sorted[index].toFixed(2));
};

const toDemotionQuantile = (halfStep: number | undefined): number | null => {
  if (halfStep === undefined) return null;
  return Math.max(0, -halfStep);
};

const rate = (count: number, total: number): number =>
  total === 0 ? 0 : Number((count / total).toFixed(4));

const inc = (target: Record<string, number>, key: string): void => {
  target[key] = (target[key] ?? 0) + 1;
};

const getCalibrationQuantiles = (
  division: Division,
  rankBand: string,
  recordBucket: string,
) => LONG_RANGE_BANZUKE_CALIBRATION.recordBucketRules.recordAwareQuantiles[division]?.[rankBand]?.[recordBucket] ?? null;

const buildInternalTraceSnapshot = (
  trace: LowerDivisionPlacementDiagnosticTrace | undefined,
): InternalTraceSnapshot | undefined => {
  if (!trace) return undefined;
  const playerOptimizerCandidate = trace.optimizerTrace?.candidates.find((candidate) => candidate.id === 'PLAYER');
  return {
    totalSlots: trace.totalSlots,
    divisionSizes: trace.divisionSizes,
    divisionOffsets: trace.divisionOffsets,
    boundarySlots: trace.boundarySlots,
    playerSlot: trace.playerSlot,
    tierCounts: trace.tierCounts,
    optimizerUsed: trace.optimizerUsed,
    monotonicFallbackUsed: trace.monotonicFallbackUsed,
    optimizerAssignmentSource: trace.optimizerTrace?.assignmentSource,
    optimizerFailureReason: trace.optimizerTrace?.failureReason,
    optimizerObjective: trace.optimizerTrace?.objective,
    pressureGlobal: trace.optimizerTrace?.pressure.global,
    pressureByDivision: trace.optimizerTrace?.pressure.byDivision,
    playerCandidate: trace.player,
    playerOptimizerCandidate,
    playerBlockerCount: trace.playerBlockers.length,
    blockersBetweenExpectedAndAssigned: trace.playerBlockers
      .sort((a, b) => (a.assignedSlot ?? 0) - (b.assignedSlot ?? 0)),
  };
};

const classifyCauses = (row: Omit<TraceRow, 'causeCodes'>): CauseCode[] => {
  const causes = new Set<CauseCode>();
  if (!row.empiricalHit) causes.add('F.fallback_path');
  if (row.maxDemotionWidth >= 100 || row.expectedDemotionWidth >= 100) causes.add('Q.quantile_tail');
  if (
    row.finalDemotionWidth >= 100 &&
    row.finalDivision !== row.fromDivision &&
    row.expectedDemotionWidth < 100
  ) {
    causes.add('B.boundary_crossing_deep');
  }
  if (row.optimizerDelta > 20 || row.gapExpectedToFinal > 20) causes.add('O.optimizer_worsening');
  if (
    row.gapExpectedToFinal > 0 &&
    row.reasonCodes.some((reason) =>
      reason === 'NEW_RECRUIT_PRESSURE' ||
      reason === 'VACANCY_PULL' ||
      reason === 'RANK_SCALE_EXTENSION' ||
      reason === 'VARIABLE_HEADCOUNT_PROJECTION')
  ) {
    causes.add('P.population_pressure');
  }
  if (!causes.size) causes.add('U.unknown');
  return [...causes];
};

const observeSeed = async (seed: number): Promise<TraceRow[]> => {
  const placementDiagnostics: LowerDivisionPlacementDiagnosticTrace[] = [];
  const previousSink = setLowerDivisionPlacementDiagnosticSink((trace) => {
    placementDiagnostics.push(trace);
  });
  const result = await runCareerObservation({
    seed,
    populationKind: 'historical-like-career',
    populationPreset: 'historical-like-v2-mid',
  }).finally(() => {
    setLowerDivisionPlacementDiagnosticSink(previousSink);
  });
  const traces: TraceRow[] = [];
  const playerDiagnostics = placementDiagnostics.filter((trace) => trace.player);
  let playerDiagnosticCursor = 0;

  for (const frame of result.frames) {
    if (frame.kind !== 'BASHO' || !frame.record) continue;
    const record = frame.record;
    const frameInternalTrace =
      isLowerDivision(record.rank.division) ? playerDiagnostics[playerDiagnosticCursor++] : undefined;
    if (record.wins !== 0 || record.losses !== 7 || record.absent !== 0) continue;
    const fromRank = record.rank;
    if (!isLowerDivision(fromRank.division)) continue;

    const currentSlot = toLocalLowerSlot(fromRank, record.scaleSlots);
    const totalSlots = resolveLowerDivisionTotal(record.scaleSlots);
    const empirical = resolveEmpiricalSlotBand({
      division: fromRank.division,
      rankName: fromRank.name,
      rankNumber: fromRank.number,
      currentSlot,
      totalSlots,
      divisionTotalSlots: resolveLowerDivisionMax(record.scaleSlots)[fromRank.division] * 2,
      wins: record.wins,
      losses: record.losses,
      absent: record.absent,
    });
    const quantiles = getCalibrationQuantiles(fromRank.division, empirical.rankBand, empirical.recordBucket);
    const decision: BanzukeDecisionLog | undefined = frame.banzukeDecisions?.find((entry) => entry.rikishiId === 'PLAYER');
    const proposedRank = decision?.proposedRank ?? fromLocalLowerSlot(empirical.expectedSlot, record.scaleSlots);
    const finalRank = decision?.finalRank ?? frame.rank;
    const proposedSlot = isLowerDivision(proposedRank.division)
      ? toLocalLowerSlot(proposedRank, record.scaleSlots)
      : empirical.expectedSlot;
    const finalSlot = isLowerDivision(finalRank.division)
      ? toLocalLowerSlot(finalRank, record.scaleSlots)
      : proposedSlot;
    const expectedRank = fromLocalLowerSlot(empirical.expectedSlot, record.scaleSlots);
    const reasonCodes = decision?.lowerMovementDiagnostics?.reasonCodes ?? [];
    const internalTrace = buildInternalTraceSnapshot(frameInternalTrace);
    const actualCurrentSlot = internalTrace?.playerCandidate?.currentSlot ?? currentSlot;
    const actualExpectedSlot = internalTrace?.playerCandidate?.expectedSlot ?? empirical.expectedSlot;
    const actualMinSlot = internalTrace?.playerCandidate?.minSlot ?? empirical.minSlot;
    const actualMaxSlot = internalTrace?.playerCandidate?.maxSlot ?? empirical.maxSlot;
    const actualProposedSlot = internalTrace?.playerCandidate?.assignedSlot ?? proposedSlot;
    const actualFinalSlot = internalTrace?.playerCandidate?.assignedSlot ?? finalSlot;
    const baseRow: Omit<TraceRow, 'causeCodes'> = {
      actorId: 'PLAYER',
      seed,
      bashoIndex: frame.seq,
      fromDivision: fromRank.division,
      fromRankLabel: toRankLabel(fromRank),
      fromRankNumber: fromRank.number ?? 1,
      fromRankBand: resolveRankBand(fromRank, record.scaleSlots),
      wins: record.wins,
      losses: record.losses,
      absent: record.absent,
      recordBucket: '0-7',
      empiricalHit: empirical.source === 'recordAware' && empirical.sampleSize >= 20,
      calibrationSource: getEmpiricalBanzukeCalibrationSource(),
      sampleCount: empirical.sampleSize,
      realP25: null,
      realP50: toDemotionQuantile(quantiles?.p50HalfStep),
      realP75: null,
      realP90: toDemotionQuantile(quantiles?.p90HalfStep),
      expectedSlot: actualExpectedSlot,
      minSlot: actualMinSlot,
      maxSlot: actualMaxSlot,
      currentSlot: actualCurrentSlot,
      expectedDemotionWidth: Math.max(0, actualExpectedSlot - actualCurrentSlot),
      maxDemotionWidth: Math.max(0, actualMaxSlot - actualCurrentSlot),
      boundaryProjectedDivision: expectedRank.division,
      boundaryProjectedRankLabel: toRankLabel(expectedRank),
      boundaryProjectedSlot: actualExpectedSlot,
      boundaryProjectedDemotionWidth: Math.max(0, actualExpectedSlot - actualCurrentSlot),
      optimizerInputSlot: actualExpectedSlot,
      optimizerOutputSlot: actualProposedSlot,
      optimizerDelta: actualProposedSlot - actualExpectedSlot,
      finalDivision: finalRank.division,
      finalRankLabel: toRankLabel(finalRank),
      finalSlot: actualFinalSlot,
      decisionProposedSlotByRecordScale: proposedSlot,
      decisionFinalSlotByRecordScale: finalSlot,
      apparentFinalDemotionByRecordScale: Math.max(0, finalSlot - actualCurrentSlot),
      slotCoordinateMismatch: finalSlot - actualFinalSlot,
      finalDemotionWidth: Math.max(0, actualFinalSlot - actualCurrentSlot),
      gapExpectedToFinal: actualFinalSlot - actualExpectedSlot,
      gapBoundaryToFinal: actualFinalSlot - actualProposedSlot,
      reasonCodes,
      internalTrace,
    };
    traces.push({
      ...baseRow,
      causeCodes: classifyCauses(baseRow),
    });
  }
  return traces;
};

const applyMixedBucketClassification = (rows: TraceRow[]): void => {
  for (const division of LOWER_DIVISIONS) {
    for (const rankBand of RANK_BANDS) {
      const group = rows.filter((row) => row.fromDivision === division && row.fromRankBand === rankBand);
      if (group.length < 3) continue;
      const normal = group.filter((row) => row.finalDemotionWidth < 100).length;
      const deep = group.filter((row) => row.finalDemotionWidth >= 100).length;
      if (normal > 0 && deep > 0) {
        for (const row of group) {
          if (!row.causeCodes.includes('M.mixed_bucket')) row.causeCodes.push('M.mixed_bucket');
        }
      }
    }
  }
};

const summarize = (rows: TraceRow[]): SummaryRow[] => {
  const summary: SummaryRow[] = [];
  for (const division of LOWER_DIVISIONS) {
    for (const rankBand of RANK_BANDS) {
      const group = rows.filter((row) => row.fromDivision === division && row.fromRankBand === rankBand);
      if (!group.length) continue;
      const reasonCodeFrequency: Record<string, number> = {};
      const causeFrequency: Record<string, number> = {};
      for (const row of group) {
        for (const reason of row.reasonCodes) inc(reasonCodeFrequency, reason);
        for (const cause of row.causeCodes) inc(causeFrequency, cause);
      }
      summary.push({
        division,
        rankBand,
        count: group.length,
        empiricalHitRate: rate(group.filter((row) => row.empiricalHit).length, group.length),
        fallbackRate: rate(group.filter((row) => !row.empiricalHit).length, group.length),
        expectedP50: percentile(group.map((row) => row.expectedDemotionWidth), 0.5),
        expectedP75: percentile(group.map((row) => row.expectedDemotionWidth), 0.75),
        expectedP90: percentile(group.map((row) => row.expectedDemotionWidth), 0.9),
        finalP50: percentile(group.map((row) => row.finalDemotionWidth), 0.5),
        finalP75: percentile(group.map((row) => row.finalDemotionWidth), 0.75),
        finalP90: percentile(group.map((row) => row.finalDemotionWidth), 0.9),
        gapP50: percentile(group.map((row) => row.gapExpectedToFinal), 0.5),
        gapP75: percentile(group.map((row) => row.gapExpectedToFinal), 0.75),
        gapMax: Math.max(...group.map((row) => row.gapExpectedToFinal)),
        deepBoundaryCrossingCount: group.filter((row) => row.causeCodes.includes('B.boundary_crossing_deep')).length,
        optimizerWorseningCount: group.filter((row) => row.causeCodes.includes('O.optimizer_worsening')).length,
        mixedBucketCount: group.filter((row) => row.causeCodes.includes('M.mixed_bucket')).length,
        reasonCodeFrequency,
        causeFrequency,
      });
    }
  }
  return summary;
};

const renderReport = (
  meta: Record<string, unknown>,
  summary: SummaryRow[],
  traces: TraceRow[],
): string => {
  const lines = [
    '# Lower Division 0-7 Tail Trace',
    '',
    `- generatedAt: ${meta.generatedAt}`,
    `- careers: ${meta.careers}`,
    `- baseSeed: ${meta.baseSeed}`,
    `- traces: ${meta.traces}`,
    `- calibrationSource: ${meta.calibrationSource}`,
    '',
    '## Summary',
    '',
    '| division | band | n | empirical | fallback | expected p50/p75/p90 | final p50/p75/p90 | gap p50/p75/max | deep | optimizer | mixed | causes | reasons |',
    '| --- | --- | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | --- | --- |',
  ];
  for (const row of summary) {
    lines.push(`| ${row.division} | ${row.rankBand} | ${row.count} | ${(row.empiricalHitRate * 100).toFixed(1)}% | ${(row.fallbackRate * 100).toFixed(1)}% | ${row.expectedP50}/${row.expectedP75}/${row.expectedP90} | ${row.finalP50}/${row.finalP75}/${row.finalP90} | ${row.gapP50}/${row.gapP75}/${row.gapMax} | ${row.deepBoundaryCrossingCount} | ${row.optimizerWorseningCount} | ${row.mixedBucketCount} | ${Object.entries(row.causeFrequency).map(([key, value]) => `${key}:${value}`).join(', ') || '-'} | ${Object.entries(row.reasonCodeFrequency).map(([key, value]) => `${key}:${value}`).join(', ') || '-'} |`);
  }

  const coordinateMismatchRows = traces.filter((row) => row.slotCoordinateMismatch !== 0);
  const maxCoordinateMismatch = coordinateMismatchRows.length
    ? Math.max(...coordinateMismatchRows.map((row) => Math.abs(row.slotCoordinateMismatch)))
    : 0;
  const expected91DeepInternal = traces.filter((row) => row.expectedDemotionWidth === 91 && row.finalDemotionWidth >= 300).length;
  const expected91DeepRecordScale = traces.filter((row) => row.expectedDemotionWidth === 91 && row.apparentFinalDemotionByRecordScale >= 300).length;
  lines.push(
    '',
    '## Primary Finding',
    '',
    `- internal lowerBoundary coordinate での expectedDemotionWidth=91 -> finalDemotionWidth>=300 は ${expected91DeepInternal} 件。`,
    `- record.scaleSlots で decision finalRank を再スロット化すると expectedDemotionWidth=91 -> apparentFinalDemotion>=300 は ${expected91DeepRecordScale} 件。`,
    `- coordinate mismatch rows: ${coordinateMismatchRows.length}/${traces.length}, max mismatch=${maxCoordinateMismatch} slots。`,
    '- したがって、今回観測された「91幅想定から300台まで落ちた」ように見える tail は optimizer が押し出した現象ではなく、trace側で異なる slot 座標系を混ぜたことによる見かけの tail と判断する。',
    '',
  );

  lines.push('', '## Focus Tail Samples', '');
  const focus = traces
    .filter((row) => FOCUS_KEYS.has(`${row.fromDivision}:${row.fromRankBand}`))
    .sort((a, b) => b.finalDemotionWidth - a.finalDemotionWidth)
    .slice(0, 40);
  if (!focus.length) {
    lines.push('- なし');
  } else {
    for (const row of focus) {
      const internal = row.internalTrace;
      const playerOpt = internal?.playerOptimizerCandidate;
      const blockerPreview = internal?.blockersBetweenExpectedAndAssigned
        .slice(0, 5)
        .map((blocker) => `${blocker.id}:${blocker.currentRankLabel}->${blocker.assignedRankLabel ?? blocker.assignedSlot}`)
        .join(', ') || '-';
      lines.push(`- seed ${row.seed} seq ${row.bashoIndex}: ${row.fromRankLabel} -> ${row.finalRankLabel}, expected=${row.expectedDemotionWidth}, final=${row.finalDemotionWidth}, gap=${row.gapExpectedToFinal}, optimizer=${internal?.optimizerAssignmentSource ?? '-'}, monotonicFallback=${internal?.monotonicFallbackUsed ?? false}, blockers=${internal?.playerBlockerCount ?? 0}, playerPressure=${playerOpt?.pressure ?? '-'}, expectedPenalty=${playerOpt?.costAtExpected ?? '-'}, assignedPenalty=${playerOpt?.costAtAssigned ?? '-'}, blockerPreview=${blockerPreview}, sample=${row.sampleCount}, causes=${row.causeCodes.join('/')}, reasons=${row.reasonCodes.join('/') || '-'}`);
    }
  }

  lines.push('', '## Expected Demotion 91 Apparent Deep Cases', '');
  const expected91Deep = traces
    .filter((row) => row.expectedDemotionWidth === 91 && row.apparentFinalDemotionByRecordScale >= 300)
    .sort((a, b) => b.apparentFinalDemotionByRecordScale - a.apparentFinalDemotionByRecordScale);
  if (!expected91Deep.length) {
    lines.push('- なし');
  } else {
    lines.push('| seed | seq | from | currentSlot | expectedWidth | internalFinalWidth | apparentRecordScaleWidth | mismatch | tier | optimizer | pressure | blockers | dominant assigned penalty |');
    lines.push('| ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: | --- |');
    for (const row of expected91Deep.slice(0, 30)) {
      const internal = row.internalTrace;
      const player = internal?.playerCandidate;
      const playerOpt = internal?.playerOptimizerCandidate;
      const breakdown = playerOpt?.assignedCostBreakdown;
      const dominantPenalty = breakdown
        ? Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]
        : undefined;
      lines.push(`| ${row.seed} | ${row.bashoIndex} | ${row.fromRankLabel} | ${row.currentSlot} | ${row.expectedDemotionWidth} | ${row.finalDemotionWidth} | ${row.apparentFinalDemotionByRecordScale} | ${row.slotCoordinateMismatch} | ${player?.tier ?? '-'} | ${internal?.optimizerAssignmentSource ?? '-'} | ${playerOpt?.pressure ?? 0} | ${internal?.playerBlockerCount ?? 0} | ${dominantPenalty ? `${dominantPenalty[0]}=${dominantPenalty[1].toFixed(2)}` : '-'} |`);
    }
  }

  lines.push(
    '',
    '## Missing Trace Fields',
    '',
    '- `realP25` / `realP75`: 現行 `BanzukeMovementQuantiles` schema は p10/p50/p90 のみ保持するため null。',
    '- monotonic constraint の個別 iteration: optimizer が解けなかった場合の fallback 有無までは記録するが、iteration ごとの score 書き換えは未取得。',
    '',
    '## 修正方針候補',
    '',
    '- `Q.quantile_tail`: calibration export 側の outlier trimming、rank band 細分化、p90 依存の見直し。',
    '- `B.boundary_crossing_deep`: division boundary crossing 時の landing cap または upper/middle 0-7 限定の soft guard。',
    '- `O.optimizer_worsening`: expectedSlot からの悪化に追加 penalty。まず診断 hook を追加して候補衝突を確認する。',
    '- `P.population_pressure`: new recruit / vacancy / dynamic scale の下降側上限を検討。',
    '- `M.mixed_bucket`: boundary 近傍専用 bucket または rank band 細分化。',
    '',
  );
  return lines.join('\n');
};

const writeAudit = (): void => {
  const lines = [
    '# Lower Division 0-7 Tail Trace Audit',
    '',
    '## Trace points',
    '',
    '- expectedSlot: `src/logic/banzuke/providers/empirical.ts` の `resolveEmpiricalSlotBand()` で決まる。',
    '- finalRank: `src/logic/banzuke/rules/singleRankChange.ts` の decision log `finalRank` で取れる。',
    '- boundary/optimizer後の提案位置: 既存 `BanzukeDecisionLog.proposedRank` を使う。',
    '- lowerBoundary 内部候補: 診断sink経由で `ExpectedPlacementCandidate`、Tier、assignment、blocker を取る。',
    '- optimizer 内部: 診断sink経由で pressure、quantile target、expected/assigned cost breakdown を取る。',
    '- finalMovement / reasonCodes: `lowerMovementDiagnostics` で取れる。',
    '- 外側 `record.scaleSlots` で rank label を再スロット化した値は、lowerBoundary 内部の可変 headcount 座標と一致しない場合があるため、内部trace側を正とする。',
    '',
    '## Existing fields enough for',
    '',
    '- currentSlot, expectedSlot, minSlot, maxSlot',
    '- proposedRank slot, finalRank slot',
    '- expected -> proposed -> final の差分',
    '- record-aware hit / fallback hit',
    '- population pressure 系 reason code',
    '',
    '## Missing fields',
    '',
    '- monotonic constraint の iteration 単位ログ。fallback 使用有無までは取る。',
    '- calibration p25 / p75。現行 schema は p10/p50/p90。',
    '',
    '## Added diagnostic hook',
    '',
    '- 本番挙動は変更しない。',
    '- `src/logic/banzuke/providers/lowerBoundary.ts` に診断sinkを追加し、未設定時は何もしない。',
    '- `scripts/dev/diagnoseLowerDivision07TailTrace.ts` が `resolveEmpiricalSlotBand()` と lowerBoundary 内部 candidate trace を既存 decision log と突合する。',
    '',
  ];
  fs.mkdirSync(path.dirname(AUDIT_MD), { recursive: true });
  fs.writeFileSync(AUDIT_MD, lines.join('\n'));
};

const main = async (): Promise<void> => {
  const { careers, seed } = parseArgs();
  const traces: TraceRow[] = [];
  for (let index = 0; index < careers; index += 1) {
    traces.push(...await observeSeed(seed + index));
    if ((index + 1) % 10 === 0 || index + 1 === careers) {
      console.log(`0-7 tail trace: completed ${index + 1}/${careers}`);
    }
  }
  applyMixedBucketClassification(traces);
  const summary = summarize(traces);
  const meta = {
    generatedAt: new Date().toISOString(),
    careers,
    baseSeed: seed,
    traces: traces.length,
    calibrationSource: getEmpiricalBanzukeCalibrationSource(),
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify({ meta, summary, traces }, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, `${renderReport(meta, summary, traces)}\n`);
  writeAudit();
  console.log(`tail traces=${traces.length}`);
  console.log(path.relative(ROOT, AUDIT_MD));
  console.log(path.relative(ROOT, OUT_MD));
  console.log(path.relative(ROOT, OUT_JSON));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
