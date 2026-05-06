import { evaluateYokozunaPromotion } from '../../banzuke';
import { listOfficialWinningKimariteCatalog } from '../../kimarite/catalog';
import { ensureKimariteRepertoire } from '../../kimarite/repertoire';
import {
  BashoRecord,
  Rank,
  RikishiStatus,
} from '../../models';
import {
  buildInitialRikishiForObservationPopulation,
  ObservationPopulationKind,
  ObservationPopulationPreset,
  resolveObservationPopulationMetadata,
  summarizeInitialPopulationProfile,
} from '../../scout/populations';
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveInternalStrengthStyles,
  resolveInternalWeakStyles,
} from '../../style/identity';
import { CONSTANTS } from '../../constants';
import { runBashoDetailed } from '../basho';
import { createSeededRandom } from '../engine/random';
import { SimulationDependencies } from '../deps';
import {
  advanceLeaguePopulation,
  applyLeaguePromotionFlow,
  createLeagueFlowRuntime,
  prepareLeagueForBasho,
} from '../leagueFlow';
import { createSimulationRuntime, runSeasonStep } from '../runtime';
import {
  advanceTopDivisionBanzuke,
  countActiveBanzukeHeadcountExcludingMaezumo,
} from '../world';
import {
  CareerObservationConfig,
  CareerObservationResult,
  CareerObservationSummary,
  ObservationAptitudeLadder,
  ObservationBatchSummary,
  ObservationDistributionSummary,
  ObservationStyleBucketSummary,
  SeasonObservationFrame,
} from './types';

const DEFAULT_START_YEAR = 2026;
const DEFAULT_OBSERVATION_POPULATION_KIND: ObservationPopulationKind = 'player-scout-default';
const OFFICIAL_BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;
const DEFAULT_EMPTY_WIN_RATE = 0.5;
const TOP_DIVISION_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const HIGHEST_RANK_BUCKETS = ['横綱', '大関', '三役', '前頭', '十両', '幕下', '三段目', '序二段', '序ノ口'] as const;
const OFFICIAL_KIMARITE_MAP = new Map(
  listOfficialWinningKimariteCatalog().map((entry) => [entry.name, entry]),
);

const percentile = (values: number[], ratio: number): number => {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const mean = (values: number[]): number =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;

const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const withPatchedMathRandom = <T>(randomFn: () => number, run: () => T): T => {
  const original = Math.random;
  Math.random = randomFn;
  try {
    return run();
  } finally {
    Math.random = original;
  }
};

const applyAptitudeLadder = (ladder?: ObservationAptitudeLadder): (() => void) => {
  if (!ladder || !ladder.factors || !CONSTANTS?.APTITUDE_TIER_DATA) {
    return () => { };
  }

  const previous = {
    cFactor: CONSTANTS.APTITUDE_TIER_DATA.C.factor,
    dFactor: CONSTANTS.APTITUDE_TIER_DATA.D.factor,
    cProfile: CONSTANTS.APTITUDE_PROFILE_DATA?.C
      ? { ...CONSTANTS.APTITUDE_PROFILE_DATA.C }
      : null,
    dProfile: CONSTANTS.APTITUDE_PROFILE_DATA?.D
      ? { ...CONSTANTS.APTITUDE_PROFILE_DATA.D }
      : null,
  };

  if (Number.isFinite(ladder.factors.C)) {
    CONSTANTS.APTITUDE_TIER_DATA.C.factor = ladder.factors.C as number;
    if (CONSTANTS.APTITUDE_PROFILE_DATA?.C) {
      CONSTANTS.APTITUDE_PROFILE_DATA.C.initialFactor = Math.max(0.4, (ladder.factors.C as number) * 0.92);
      CONSTANTS.APTITUDE_PROFILE_DATA.C.growthFactor = Math.max(0.45, ladder.factors.C as number);
      CONSTANTS.APTITUDE_PROFILE_DATA.C.boutFactor = Math.max(0.45, (ladder.factors.C as number) * 0.9);
    }
  }

  if (Number.isFinite(ladder.factors.D)) {
    CONSTANTS.APTITUDE_TIER_DATA.D.factor = ladder.factors.D as number;
    if (CONSTANTS.APTITUDE_PROFILE_DATA?.D) {
      CONSTANTS.APTITUDE_PROFILE_DATA.D.initialFactor = Math.max(0.35, (ladder.factors.D as number) * 0.88);
      CONSTANTS.APTITUDE_PROFILE_DATA.D.growthFactor = Math.max(0.4, ladder.factors.D as number);
      CONSTANTS.APTITUDE_PROFILE_DATA.D.boutFactor = Math.max(0.4, (ladder.factors.D as number) * 0.9);
    }
  }

  return () => {
    CONSTANTS.APTITUDE_TIER_DATA.C.factor = previous.cFactor;
    CONSTANTS.APTITUDE_TIER_DATA.D.factor = previous.dFactor;
    if (previous.cProfile && CONSTANTS.APTITUDE_PROFILE_DATA?.C) {
      CONSTANTS.APTITUDE_PROFILE_DATA.C = { ...previous.cProfile };
    }
    if (previous.dProfile && CONSTANTS.APTITUDE_PROFILE_DATA?.D) {
      CONSTANTS.APTITUDE_PROFILE_DATA.D = { ...previous.dProfile };
    }
  };
};

const createObservationInitialStatus = (
  seed: number,
  ladder?: ObservationAptitudeLadder,
  populationKind: ObservationPopulationKind = DEFAULT_OBSERVATION_POPULATION_KIND,
  populationPreset?: ObservationPopulationPreset,
): RikishiStatus => {
  const restore = applyAptitudeLadder(ladder);
  try {
    const draftRandom = createSeededRandom(seed ^ 0xa5a5a5a5);
    return withPatchedMathRandom(draftRandom, () => {
      return buildInitialRikishiForObservationPopulation(populationKind, draftRandom, populationPreset);
    });
  } finally {
    restore();
  }
};

const resolveOfficialCareerWinRate = (wins: number, losses: number): number => {
  const total = wins + losses;
  return total > 0 ? wins / total : DEFAULT_EMPTY_WIN_RATE;
};

const resolveEffectiveCareerWinRate = (wins: number, losses: number, absent = 0): number => {
  const total = wins + losses + absent;
  return total > 0 ? wins / total : DEFAULT_EMPTY_WIN_RATE;
};

const isSekitoriRank = (rank: Rank): boolean => rank.division === 'Makuuchi' || rank.division === 'Juryo';
const isMakuuchiRank = (rank: Rank): boolean => rank.division === 'Makuuchi';
const isSanyakuRank = (rank: Rank): boolean => rank.division === 'Makuuchi' && TOP_DIVISION_NAMES.has(rank.name);
const isOzekiRank = (rank: Rank): boolean => rank.division === 'Makuuchi' && (rank.name === '大関' || rank.name === '横綱');
const isYokozunaRank = (rank: Rank): boolean => rank.division === 'Makuuchi' && rank.name === '横綱';

const resolveHighestRankBucket = (rank: Rank): string => {
  if (rank.division === 'Makuuchi') {
    if (rank.name === '横綱') return '横綱';
    if (rank.name === '大関') return '大関';
    if (rank.name === '関脇' || rank.name === '小結') return '三役';
    return '前頭';
  }
  if (rank.division === 'Juryo') return '十両';
  if (rank.division === 'Makushita') return '幕下';
  if (rank.division === 'Sandanme') return '三段目';
  if (rank.division === 'Jonidan') return '序二段';
  return '序ノ口';
};

const resolveScheduledBouts = (rank: Rank): number =>
  rank.division === 'Makuuchi' || rank.division === 'Juryo' ? 15 : 7;

const resolveRetirementReasonLabel = (records: RikishiStatus['history']['events']): string => {
  const event = records.slice().reverse().find((entry) => entry.type === 'RETIREMENT');
  if (!event) return '理由不明';
  return event.description.replace(/^引退 \(/, '').replace(/\)$/, '') || '理由不明';
};

const resolveRetirementReasonCode = (label: string): string => {
  if (/古傷|慢性的な故障/.test(label)) return 'CHRONIC_INJURY';
  if (/長期休場|度重なる怪我/.test(label)) return 'CONSECUTIVE_ABSENCE';
  if (/怪我の回復/.test(label)) return 'SEVERE_INJURY';
  if (/連続負け越し/.test(label)) return 'MAKEKOSHI_STREAK';
  if (/関取復帰/.test(label)) return 'FORMER_SEKITORI_DROP';
  if (/気力/.test(label)) return 'SPIRIT';
  if (/体力/.test(label)) return 'AGE_OR_BODY_LIMIT';
  return 'OTHER';
};

const resolveStyleBucketFromFamily = (family: string): 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' => {
  if (family === 'PUSH_THRUST') return 'PUSH';
  if (family === 'FORCE_OUT') return 'GRAPPLE';
  return 'TECHNIQUE';
};

const summarizeKimariteMetrics = (kimariteTotal?: Record<string, number>) => {
  const entries = Object.entries(kimariteTotal || {})
    .filter(([, count]) => count > 0)
    .map(([name, count]) => ({ name, count, entry: OFFICIAL_KIMARITE_MAP.get(name) }))
    .filter((row): row is { name: string; count: number; entry: NonNullable<typeof row.entry> } => Boolean(row.entry));
  if (!entries.length) {
    return {
      uniqueOfficialKimariteCount: 0,
      top1MoveShare: Number.NaN,
      top3MoveShare: Number.NaN,
      rareMoveRate: Number.NaN,
      dominantStyleBucket: null,
    };
  }

  const total = entries.reduce((sum, row) => sum + row.count, 0);
  const sorted = entries.slice().sort((left, right) => right.count - left.count);
  let rareCount = 0;
  const familyWeights = new Map<string, number>();
  for (const row of entries) {
    familyWeights.set(row.entry.family, (familyWeights.get(row.entry.family) ?? 0) + row.count);
    if (row.entry.rarityBucket === 'RARE' || row.entry.rarityBucket === 'EXTREME') {
      rareCount += row.count;
    }
  }
  const dominantFamily = [...familyWeights.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return {
    uniqueOfficialKimariteCount: entries.length,
    top1MoveShare: sorted[0].count / total,
    top3MoveShare: sorted.slice(0, 3).reduce((sum, row) => sum + row.count, 0) / total,
    rareMoveRate: rareCount / total,
    dominantStyleBucket: dominantFamily ? resolveStyleBucketFromFamily(dominantFamily) : null,
  };
};

const summarizeWinRouteMetrics = (winRouteTotal?: Record<string, number>) => {
  const entries = Object.entries(winRouteTotal || {}).filter(([, count]) => count > 0);
  if (!entries.length) {
    return {
      dominantRoute: null,
      dominantRouteShare: Number.NaN,
      top2RouteShare: Number.NaN,
    };
  }
  const sorted = entries.slice().sort((left, right) => right[1] - left[1]);
  const total = sorted.reduce((sum, [, count]) => sum + count, 0);
  return {
    dominantRoute: sorted[0]?.[0] ?? null,
    dominantRouteShare: sorted[0] ? sorted[0][1] / total : Number.NaN,
    top2RouteShare: sorted.slice(0, 2).reduce((sum, [, count]) => sum + count, 0) / total,
  };
};

const resolvePromotionBlockReason = (review?: SeasonObservationFrame['promotionReview']): string | null => {
  if (!review || !review.candidate || review.promote) return null;
  return review.blockReason ?? 'OTHER';
};

const buildPromotionReview = (record: BashoRecord, records: BashoRecord[]) => {
  const index = records.findIndex(
    (candidate) => candidate.year === record.year && candidate.month === record.month,
  );
  const previous = index > 0 ? records[index - 1] : undefined;
  const recentWinTrend = records.slice(Math.max(0, index - 2), index + 1).map((candidate) => candidate.wins);
  const result = evaluateYokozunaPromotion(
    {
      rank: record.rank,
      wins: record.wins,
      losses: record.losses,
      absent: record.absent,
      yusho: record.yusho,
      junYusho: record.junYusho,
      pastRecords: previous
        ? [
          {
            rank: previous.rank,
            wins: previous.wins,
            losses: previous.losses,
            absent: previous.absent,
            yusho: previous.yusho,
            junYusho: previous.junYusho,
          },
        ]
        : [],
    } as never,
    {
      performanceOverExpected: record.performanceOverExpected,
      recentWinTrend,
      hasShukun: record.specialPrizes.includes('殊勲賞'),
    },
  );

  let blockReason: string | undefined;
  if (!result.promote) {
    if (!result.evidence.isCurrentOzeki || !result.evidence.isPrevOzeki) {
      blockReason = 'OZEKI_STREAK_MISSING';
    } else if (!result.evidence.currentYusho) {
      blockReason = 'CURRENT_YUSHO_MISSING';
    } else if (!result.evidence.hasEquivalentPair) {
      blockReason = 'EQUIVALENT_SHORT';
    } else if (!result.evidence.hasRealisticTotal) {
      blockReason = 'TOTAL_SHORT';
    } else if (result.decisionBand === 'BORDERLINE') {
      blockReason = 'DELIBERATION_REJECTED';
    } else {
      blockReason = 'REJECTED';
    }
  }

  const candidate =
    result.evidence.isCurrentOzeki ||
    result.evidence.isPrevOzeki ||
    result.decisionBand === 'BORDERLINE' ||
    result.decisionBand === 'BORDERLINE_PROMOTE' ||
    result.decisionBand === 'AUTO_PROMOTE';

  return {
    candidate,
    promote: result.promote,
    decisionBand: result.decisionBand,
    score: result.score,
    blockReason,
  };
};

export const summarizeCareerObservation = (
  result: Omit<CareerObservationResult, 'summary'>,
): CareerObservationSummary => {
  const status = result.finalStatus;
  const records = status.history.records;
  const kimariteMetrics = summarizeKimariteMetrics(status.history.kimariteTotal);
  const winRouteMetrics = summarizeWinRouteMetrics(status.history.winRouteTotal);
  const normalizedStatus = ensureKimariteRepertoire(ensureStyleIdentityProfile(status));
  const strengths = resolveDisplayedStrengthStyles(normalizedStatus.styleIdentityProfile);
  const weaknesses = resolveDisplayedWeakStyles(normalizedStatus.styleIdentityProfile);
  const internalStrengths = resolveInternalStrengthStyles(normalizedStatus.styleIdentityProfile);
  const internalWeaknesses = resolveInternalWeakStyles(normalizedStatus.styleIdentityProfile);
  const runtimeEntryMaps = result.frames.map((frame) => {
    const actorMap = new Map<string, { actorType: string; entrySeq: number }>();
    for (const division of Object.values(frame.runtime.league.divisions)) {
      for (const row of division.ranks) {
        actorMap.set(row.id, {
          actorType: row.actorType,
          entrySeq: row.entrySeq,
        });
      }
    }
    return actorMap;
  });

  const lateEntrantIds = new Set<string>();
  const lateEntrantYokozunaIds = new Set<string>();
  for (let frameIndex = 0; frameIndex < result.frames.length; frameIndex += 1) {
    const frame = result.frames[frameIndex];
    const actorMap = runtimeEntryMaps[frameIndex];
    actorMap.forEach((entry, id) => {
      if (entry.actorType === 'NPC' && entry.entrySeq > 0) {
        lateEntrantIds.add(id);
      }
    });
    for (const row of frame.npcResults) {
      const actor = actorMap.get(row.entityId);
      if (!actor || actor.actorType !== 'NPC' || actor.entrySeq <= 0) continue;
      if (row.division === 'Makuuchi' && row.rankName === '横綱') {
        lateEntrantYokozunaIds.add(row.entityId);
      }
    }
  }

  const populationTimeline = result.frames
    .filter((frame) => frame.kind === 'BASHO')
    .map((frame) => ({
      seq: frame.seq,
      year: frame.year,
      month: frame.month,
      activeBanzukeHeadcount: frame.runtime.league.population.activeBanzukeHeadcount,
      jonidanHeadcount: frame.runtime.league.divisions.Jonidan.headcount,
      jonokuchiHeadcount: frame.runtime.league.divisions.Jonokuchi.headcount,
    }));

  const sameStableViolations = result.frames.reduce(
    (sum, frame) => sum + (frame.diagnostics?.sameStableViolationCount ?? 0),
    0,
  );
  const sameCardViolations = result.frames.reduce(
    (sum, frame) => sum + (frame.diagnostics?.sameCardViolationCount ?? 0),
    0,
  );
  const crossDivisionBouts = result.frames.reduce(
    (sum, frame) => sum + (frame.diagnostics?.crossDivisionBoutCount ?? 0),
    0,
  );
  const lateCrossDivisionBouts = result.frames.reduce(
    (sum, frame) => sum + (frame.diagnostics?.lateCrossDivisionBoutCount ?? 0),
    0,
  );
  const upperRankEarlyDeepOpponents = result.frames.reduce(
    (sum, frame) => sum + frame.upperRankEarlyDeepOpponents,
    0,
  );
  const upperRankEarlyTotalOpponents = result.frames.reduce(
    (sum, frame) => sum + frame.upperRankEarlyTotalOpponents,
    0,
  );

  const ozekiRecords = records.filter((record) => record.rank.division === 'Makuuchi' && record.rank.name === '大関');
  const promotionReviews = result.frames
    .map((frame) => frame.promotionReview)
    .filter((review): review is NonNullable<typeof review> => Boolean(review));
  const blockedReasons: Record<string, number> = {};
  for (const review of promotionReviews) {
    const blockReason = resolvePromotionBlockReason(review);
    if (!blockReason) continue;
    blockedReasons[blockReason] = (blockedReasons[blockReason] ?? 0) + 1;
  }
  const firstSekitoriRecordIndex = records.findIndex((record) => isSekitoriRank(record.rank));
  const sekitoriRecords = records.filter((record) => isSekitoriRank(record.rank));
  const makuuchiRecords = records.filter((record) => isMakuuchiRank(record.rank));
  const fullAbsenceBashoCount = records.filter((record) => record.absent >= resolveScheduledBouts(record.rank)).length;
  const latestRecord = records[records.length - 1];
  const retirementReasonLabel = resolveRetirementReasonLabel(status.history.events);
  const retirementReasonCode = resolveRetirementReasonCode(retirementReasonLabel);

  return {
    seed: result.seed,
    startYear: result.startYear,
    modelVersion: result.modelVersion,
    bundleId: result.runtime.bundle.id,
    population: resolveObservationPopulationMetadata(result.populationKind, result.populationPreset),
    initialPopulation: summarizeInitialPopulationProfile(
      result.populationKind,
      result.populationPreset,
      result.initialStatus,
    ),
    aptitudeTier: status.aptitudeTier ?? 'B',
    rankOutcome: {
      isSekitori: isSekitoriRank(status.history.maxRank),
      isMakuuchi: isMakuuchiRank(status.history.maxRank),
      isSanyaku: isSanyakuRank(status.history.maxRank),
      isOzeki: isOzekiRank(status.history.maxRank),
      isYokozuna: isYokozunaRank(status.history.maxRank),
      maxRank: status.history.maxRank,
      highestRankBucket: resolveHighestRankBucket(status.history.maxRank),
    },
    careerOutcome: {
      wins: status.history.totalWins,
      losses: status.history.totalLosses,
      absent: status.history.totalAbsent,
      bashoCount: status.history.records.length,
      retireAge: status.age,
      officialWinRate: resolveOfficialCareerWinRate(status.history.totalWins, status.history.totalLosses),
      effectiveWinRate: resolveEffectiveCareerWinRate(
        status.history.totalWins,
        status.history.totalLosses,
        status.history.totalAbsent,
      ),
      pooledWinRate: status.history.totalWins / Math.max(1, status.history.totalWins + status.history.totalLosses),
      losingCareer: status.history.totalWins < status.history.totalLosses + status.history.totalAbsent,
      entryAge: result.initialStatus.entryAge,
      firstSekitoriBasho: firstSekitoriRecordIndex >= 0 ? firstSekitoriRecordIndex + 1 : undefined,
      sekitoriBashoCount: sekitoriRecords.length,
      makuuchiBashoCount: makuuchiRecords.length,
      fullAbsenceBashoCount,
      retirementReasonCode,
      retirementReasonLabel,
      retiredAfterKachikoshi: latestRecord ? latestRecord.wins > latestRecord.losses + latestRecord.absent : false,
    },
    styleOutcome: {
      uniqueOfficialKimariteCount: kimariteMetrics.uniqueOfficialKimariteCount,
      top1MoveShare: kimariteMetrics.top1MoveShare,
      top3MoveShare: kimariteMetrics.top3MoveShare,
      rareMoveRate: kimariteMetrics.rareMoveRate,
      dominantStyleBucket: kimariteMetrics.dominantStyleBucket,
      dominantRoute: winRouteMetrics.dominantRoute,
      dominantRouteShare: winRouteMetrics.dominantRouteShare,
      top2RouteShare: winRouteMetrics.top2RouteShare,
      strengthStyleCount: strengths.length,
      weakStyleCount: weaknesses.length,
      internalStrengthStyleCount: internalStrengths.length,
      internalWeakStyleCount: internalWeaknesses.length,
      noStyleIdentity: strengths.length === 0,
      repertoireUnsettled: normalizedStatus.kimariteRepertoire?.provisional !== false,
      repertoireSettledAtBashoSeq: normalizedStatus.kimariteRepertoire?.settledAtBashoSeq,
      kimariteVarietyEligible: status.history.totalWins >= 100 && status.history.records.length >= 20,
      kimariteVariety20Reached:
        status.history.totalWins >= 100 &&
        status.history.records.length >= 20 &&
        kimariteMetrics.uniqueOfficialKimariteCount >= 20,
    },
    leagueOutcome: {
      sameStableViolations,
      sameCardViolations,
      crossDivisionBouts,
      lateCrossDivisionBouts,
      upperRankEarlyDeepOpponents,
      upperRankEarlyTotalOpponents,
      lateEntrantCount: lateEntrantIds.size,
      lateEntrantYokozunaCount: lateEntrantYokozunaIds.size,
      populationTimeline,
    },
    pipeline: {
      ozekiReach: ozekiRecords.length > 0 || status.history.maxRank.name === '横綱',
      ozekiBashoCount: ozekiRecords.length,
      ozeki13WinCount: ozekiRecords.filter((record) => record.wins >= 13).length,
      ozekiYushoCount: ozekiRecords.filter((record) => record.yusho).length,
      backToBackYushoEquivalentCount: promotionReviews
        .filter((review) => review.candidate && review.score >= 26)
        .length,
      yokozunaDeliberationCount: promotionReviews
        .filter((review) => review.decisionBand === 'BORDERLINE' || review.decisionBand === 'BORDERLINE_PROMOTE')
        .length,
      yokozunaPromotionCount: promotionReviews.filter((review) => review.promote).length,
      yokozunaBlockedReasons: blockedReasons,
    },
  };
};

export const runCareerObservation = async (
  config: CareerObservationConfig,
): Promise<CareerObservationResult> => {
  const startYear = config.startYear ?? DEFAULT_START_YEAR;
  const modelVersion = config.simulationModelVersion ?? 'v3';
  const populationKind = config.populationKind ?? DEFAULT_OBSERVATION_POPULATION_KIND;
  const populationPreset = config.populationPreset;
  const initialStatus = config.initialStatus
    ? structuredClone(config.initialStatus)
    : createObservationInitialStatus(config.seed, config.aptitudeLadder, populationKind, populationPreset);
  const runtime = createSimulationRuntime(
    {
      initialStats: structuredClone(initialStatus),
      oyakata: null,
      simulationModelVersion: modelVersion,
    },
    {
      random: createSeededRandom(config.seed ^ 0x3c6ef372),
      getCurrentYear: () => startYear,
      yieldControl: async () => { },
    } satisfies Partial<SimulationDependencies>,
  );

  const frames: SeasonObservationFrame[] = [];

  while (true) {
    const step = await runSeasonStep(runtime);
    if (step.kind === 'BASHO') {
      const records = step.statusSnapshot?.history.records ?? runtime.getStatus().history.records;
      const record = records[records.length - 1];
      const isUpperRank =
        step.playerRecord.rank.division === 'Makuuchi' &&
        TOP_DIVISION_NAMES.has(step.playerRecord.rank.name);
      const upperRankEarlyTotalOpponents = isUpperRank
        ? step.playerBouts.filter((bout) => bout.result !== 'ABSENT' && bout.day <= 5).length
        : 0;
      const upperRankEarlyDeepOpponents = isUpperRank
        ? step.playerBouts.filter(
          (bout) =>
            bout.result !== 'ABSENT' &&
            bout.day <= 5 &&
            bout.opponentRankName === '前頭' &&
            (bout.opponentRankNumber ?? 0) >= 10,
        ).length
        : 0;
      frames.push({
        kind: 'BASHO',
        seq: step.seq,
        year: step.year,
        month: step.month,
        rank: step.playerRecord.rank,
        maxRank: runtime.getStatus().history.maxRank,
        record,
        progress: step.progress,
        runtime: step.runtime ?? runtime.getSnapshot(),
        domainEvents: step.domainEvents ?? [],
        diagnostics: step.diagnostics,
        npcResults: step.npcBashoRecords,
        banzukeDecisions: step.banzukeDecisions,
        retiredNpcCareerBashoCounts: step.retiredNpcCareerBashoCounts,
        upperRankEarlyDeepOpponents,
        upperRankEarlyTotalOpponents,
        promotionReview: record ? buildPromotionReview(record, records) : undefined,
        titleContext: {
          yusho: step.playerRecord.yusho,
          wins: step.playerRecord.wins,
          losses: step.playerRecord.losses,
          absent: step.playerRecord.absent,
        },
      });
      continue;
    }

    const finalRuntime = step.runtime ?? runtime.getSnapshot();
    const baseResult = {
      seed: config.seed,
      startYear,
      modelVersion,
      populationKind,
      populationPreset,
      initialStatus,
      finalStatus: step.statusSnapshot,
      runtime: finalRuntime,
      frames,
    };
    return {
      ...baseResult,
      summary: summarizeCareerObservation(baseResult),
    };
  }
};

export const runObservationBatch = async (
  configs: CareerObservationConfig[],
): Promise<CareerObservationResult[]> => {
  const results: CareerObservationResult[] = [];
  for (const config of configs) {
    results.push(await runCareerObservation(config));
  }
  return results;
};

const buildPopulationSummary = (summaries: CareerObservationSummary[]) => {
  const annualTotals: number[] = [];
  const annualAbsDeltas: number[] = [];
  const annualSwings: number[] = [];
  const annualJonidanSwings: number[] = [];
  const annualJonokuchiSwings: number[] = [];

  for (const summary of summaries) {
    const timeline = summary.leagueOutcome.populationTimeline;
    for (let index = 0; index + 5 < timeline.length; index += 6) {
      const yearSlice = timeline.slice(index, index + 6);
      const totals = yearSlice.map((row) => row.activeBanzukeHeadcount);
      const jonidan = yearSlice.map((row) => row.jonidanHeadcount);
      const jonokuchi = yearSlice.map((row) => row.jonokuchiHeadcount);
      annualTotals.push(...totals);
      annualAbsDeltas.push(Math.abs(totals[totals.length - 1] - totals[0]));
      annualSwings.push(Math.max(...totals) - Math.min(...totals));
      annualJonidanSwings.push(Math.max(...jonidan) - Math.min(...jonidan));
      annualJonokuchiSwings.push(Math.max(...jonokuchi) - Math.min(...jonokuchi));
    }
  }

  return {
    sample: summaries.length,
    annualTotalMedian: percentile(annualTotals, 0.5),
    annualAbsDeltaMedian: percentile(annualAbsDeltas, 0.5),
    annualAbsDeltaP90: percentile(annualAbsDeltas, 0.9),
    annualSwingMedian: percentile(annualSwings, 0.5),
    annualSwingP90: percentile(annualSwings, 0.9),
    annualJonidanSwingMedian: percentile(annualJonidanSwings, 0.5),
    annualJonokuchiSwingMedian: percentile(annualJonokuchiSwings, 0.5),
  };
};

const buildStyleBucketSummary = (
  summaries: CareerObservationSummary[],
  bucket: 'PUSH' | 'GRAPPLE' | 'TECHNIQUE',
): ObservationStyleBucketSummary => {
  const rows = summaries.filter((summary) => summary.styleOutcome.dominantStyleBucket === bucket);
  return {
    sample: rows.length,
    uniqueKimariteP50: percentile(rows.map((row) => row.styleOutcome.uniqueOfficialKimariteCount), 0.5),
    uniqueKimariteP90: percentile(rows.map((row) => row.styleOutcome.uniqueOfficialKimariteCount), 0.9),
    top1MoveShareP50: percentile(rows.map((row) => row.styleOutcome.top1MoveShare).filter(Number.isFinite), 0.5),
    top3MoveShareP50: percentile(rows.map((row) => row.styleOutcome.top3MoveShare).filter(Number.isFinite), 0.5),
    rareMoveRate: mean(rows.map((row) => row.styleOutcome.rareMoveRate).filter(Number.isFinite)),
  };
};

const buildRateDistribution = (keys: readonly string[], values: string[], sampleSize: number): Record<string, number> => {
  const counts = Object.fromEntries(keys.map((key) => [key, 0])) as Record<string, number>;
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).map(([key, count]) => [key, count / Math.max(1, sampleSize)]));
};

const resolveCareerBashoBucket = (value: number): string => {
  if (value < 12) return '<12';
  if (value < 24) return '12-23';
  if (value < 36) return '24-35';
  if (value < 60) return '36-59';
  if (value < 90) return '60-89';
  if (value < 120) return '90-119';
  return '>=120';
};

const resolveCareerWinRateBucket = (value: number): string => {
  if (value < 0.35) return '<0.35';
  if (value < 0.4) return '0.35-0.39';
  if (value < 0.45) return '0.40-0.44';
  if (value < 0.5) return '0.45-0.49';
  if (value < 0.55) return '0.50-0.54';
  if (value < 0.6) return '0.55-0.59';
  if (value < 0.65) return '0.60-0.64';
  return '>=0.65';
};

const buildQuantiles = (values: number[]) => ({
  p10: percentile(values, 0.1),
  p50: percentile(values, 0.5),
  p90: percentile(values, 0.9),
});

const buildDistributionSummary = (summaries: CareerObservationSummary[]): ObservationDistributionSummary => {
  const sampleSize = summaries.length;
  const sekitori = summaries.filter((summary) => summary.rankOutcome.isSekitori);
  const careerBashoCounts = summaries.map((summary) => summary.careerOutcome.bashoCount);
  const officialWinRates = summaries.map((summary) => summary.careerOutcome.officialWinRate);
  const effectiveWinRates = summaries.map((summary) => summary.careerOutcome.effectiveWinRate);
  const absences = summaries.map((summary) => summary.careerOutcome.absent);
  const reasonCounts: Record<string, number> = {};
  for (const summary of summaries) {
    const code = summary.careerOutcome.retirementReasonCode;
    reasonCounts[code] = (reasonCounts[code] ?? 0) + 1;
  }
  const firstSekitoriBasho = sekitori
    .map((summary) => summary.careerOutcome.firstSekitoriBasho)
    .filter((value): value is number => Number.isFinite(value));

  return {
    highestRankBuckets: buildRateDistribution(
      HIGHEST_RANK_BUCKETS,
      summaries.map((summary) => summary.rankOutcome.highestRankBucket),
      sampleSize,
    ),
    careerBashoBuckets: buildRateDistribution(
      ['<12', '12-23', '24-35', '36-59', '60-89', '90-119', '>=120'],
      careerBashoCounts.map(resolveCareerBashoBucket),
      sampleSize,
    ),
    careerWinRateBuckets: buildRateDistribution(
      ['<0.35', '0.35-0.39', '0.40-0.44', '0.45-0.49', '0.50-0.54', '0.55-0.59', '0.60-0.64', '>=0.65'],
      officialWinRates.map(resolveCareerWinRateBucket),
      sampleSize,
    ),
    careerBasho: buildQuantiles(careerBashoCounts),
    retireAge: buildQuantiles(summaries.map((summary) => summary.careerOutcome.retireAge)),
    officialWinRate: buildQuantiles(officialWinRates),
    effectiveWinRate: buildQuantiles(effectiveWinRates),
    absent: {
      p50: percentile(absences, 0.5),
      p90: percentile(absences, 0.9),
      p99: percentile(absences, 0.99),
    },
    absenceZeroRate:
      summaries.filter((summary) => summary.careerOutcome.absent === 0).length / Math.max(1, sampleSize),
    fullAbsenceBashoExperienceRate:
      summaries.filter((summary) => summary.careerOutcome.fullAbsenceBashoCount > 0).length / Math.max(1, sampleSize),
    firstSekitoriBasho: buildQuantiles(firstSekitoriBasho),
    sekitoriBashoCount: {
      p50: percentile(sekitori.map((summary) => summary.careerOutcome.sekitoriBashoCount), 0.5),
      p90: percentile(sekitori.map((summary) => summary.careerOutcome.sekitoriBashoCount), 0.9),
    },
    makuuchiBashoCount: {
      p50: percentile(sekitori.map((summary) => summary.careerOutcome.makuuchiBashoCount), 0.5),
      p90: percentile(sekitori.map((summary) => summary.careerOutcome.makuuchiBashoCount), 0.9),
    },
    lowWinLongCareerRate:
      summaries.filter((summary) => summary.careerOutcome.officialWinRate < 0.4 && summary.careerOutcome.bashoCount >= 60)
        .length / Math.max(1, sampleSize),
    retiredAfterKachikoshiRate:
      summaries.filter((summary) => summary.careerOutcome.retiredAfterKachikoshi).length / Math.max(1, sampleSize),
    retirementReasonDistribution:
      Object.fromEntries(Object.entries(reasonCounts).map(([key, count]) => [key, count / Math.max(1, sampleSize)])),
  };
};

export const summarizeObservationBatch = (
  summaries: CareerObservationSummary[],
): ObservationBatchSummary => {
  const nonSekitori = summaries.filter((summary) => !summary.rankOutcome.isSekitori);
  const careerBashoCounts = summaries.map((summary) => summary.careerOutcome.bashoCount);
  const retireAges = summaries.map((summary) => summary.careerOutcome.retireAge);
  const lowTierCount = summaries.filter(
    (summary) => summary.aptitudeTier === 'C' || summary.aptitudeTier === 'D',
  ).length;
  const blockedReasonDistribution: Record<string, number> = {};
  for (const summary of summaries) {
    for (const [reason, count] of Object.entries(summary.pipeline.yokozunaBlockedReasons)) {
      blockedReasonDistribution[reason] = (blockedReasonDistribution[reason] ?? 0) + count;
    }
  }

  return {
    realism: {
      sample: summaries.length,
      sekitoriRate: summaries.filter((summary) => summary.rankOutcome.isSekitori).length / Math.max(1, summaries.length),
      makuuchiRate: summaries.filter((summary) => summary.rankOutcome.isMakuuchi).length / Math.max(1, summaries.length),
      sanyakuRate: summaries.filter((summary) => summary.rankOutcome.isSanyaku).length / Math.max(1, summaries.length),
      yokozunaRate: summaries.filter((summary) => summary.rankOutcome.isYokozuna).length / Math.max(1, summaries.length),
      careerWinRate: mean(summaries.map((summary) => summary.careerOutcome.officialWinRate)),
      careerEffectiveWinRate: mean(summaries.map((summary) => summary.careerOutcome.effectiveWinRate)),
      careerPooledWinRate:
        summaries.reduce((sum, summary) => sum + summary.careerOutcome.wins, 0) /
        Math.max(
          1,
          summaries.reduce((sum, summary) => sum + summary.careerOutcome.wins + summary.careerOutcome.losses, 0),
        ),
      nonSekitoriCareerWinRate: mean(nonSekitori.map((summary) => summary.careerOutcome.officialWinRate)),
      nonSekitoriCareerEffectiveWinRate: mean(nonSekitori.map((summary) => summary.careerOutcome.effectiveWinRate)),
      nonSekitoriCareerPooledWinRate:
        nonSekitori.reduce((sum, summary) => sum + summary.careerOutcome.wins, 0) /
        Math.max(
          1,
          nonSekitori.reduce((sum, summary) => sum + summary.careerOutcome.wins + summary.careerOutcome.losses, 0),
        ),
      losingCareerRate:
        summaries.filter((summary) => summary.careerOutcome.losingCareer).length / Math.max(1, summaries.length),
      avgCareerBasho: mean(careerBashoCounts),
      careerBashoP50: percentile(careerBashoCounts, 0.5),
      allCareerRetireAgeP50: percentile(retireAges, 0.5),
      nonSekitoriMedianBasho: percentile(nonSekitori.map((summary) => summary.careerOutcome.bashoCount), 0.5),
      lowTierRate: lowTierCount / Math.max(1, summaries.length),
      careerWinRateLe35Rate:
        summaries.filter((summary) => summary.careerOutcome.effectiveWinRate <= 0.35).length / Math.max(1, summaries.length),
      careerWinRateLe30Rate:
        summaries.filter((summary) => summary.careerOutcome.effectiveWinRate <= 0.3).length / Math.max(1, summaries.length),
    },
    distribution: buildDistributionSummary(summaries),
    population: buildPopulationSummary(summaries),
    style: {
      uniqueKimariteP50: percentile(
        summaries
          .filter((summary) => summary.styleOutcome.kimariteVarietyEligible)
          .map((summary) => summary.styleOutcome.uniqueOfficialKimariteCount),
        0.5,
      ),
      uniqueKimariteP90: percentile(
        summaries
          .filter((summary) => summary.styleOutcome.kimariteVarietyEligible)
          .map((summary) => summary.styleOutcome.uniqueOfficialKimariteCount),
        0.9,
      ),
      top1MoveShareP50: percentile(
        summaries
          .filter((summary) => summary.styleOutcome.kimariteVarietyEligible)
          .map((summary) => summary.styleOutcome.top1MoveShare)
          .filter(Number.isFinite),
        0.5,
      ),
      top3MoveShareP50: percentile(
        summaries
          .filter((summary) => summary.styleOutcome.kimariteVarietyEligible)
          .map((summary) => summary.styleOutcome.top3MoveShare)
          .filter(Number.isFinite),
        0.5,
      ),
      dominantRouteShareP50: percentile(
        summaries.map((summary) => summary.styleOutcome.dominantRouteShare).filter(Number.isFinite),
        0.5,
      ),
      top2RouteShareP50: percentile(
        summaries.map((summary) => summary.styleOutcome.top2RouteShare).filter(Number.isFinite),
        0.5,
      ),
      rareMoveRate: mean(summaries.map((summary) => summary.styleOutcome.rareMoveRate).filter(Number.isFinite)),
      kimariteVariety20Rate:
        summaries.filter((summary) => summary.styleOutcome.kimariteVariety20Reached).length /
        Math.max(1, summaries.filter((summary) => summary.styleOutcome.kimariteVarietyEligible).length),
      strengthStyleCountMean: mean(summaries.map((summary) => summary.styleOutcome.strengthStyleCount)),
      weakStyleCountMean: mean(summaries.map((summary) => summary.styleOutcome.weakStyleCount)),
      internalStrengthStyleCountMean: mean(summaries.map((summary) => summary.styleOutcome.internalStrengthStyleCount)),
      internalWeakStyleCountMean: mean(summaries.map((summary) => summary.styleOutcome.internalWeakStyleCount)),
      noStyleIdentityRate:
        summaries.filter((summary) => summary.styleOutcome.noStyleIdentity).length / Math.max(1, summaries.length),
      repertoireUnsettledRate:
        summaries.filter((summary) => summary.styleOutcome.repertoireUnsettled).length / Math.max(1, summaries.length),
      repertoireSettledAtBashoSeqP50: percentile(
        summaries
          .map((summary) => summary.styleOutcome.repertoireSettledAtBashoSeq)
          .filter((value): value is number => Number.isFinite(value)),
        0.5,
      ),
      styleBucketMetrics: {
        PUSH: buildStyleBucketSummary(summaries, 'PUSH'),
        GRAPPLE: buildStyleBucketSummary(summaries, 'GRAPPLE'),
        TECHNIQUE: buildStyleBucketSummary(summaries, 'TECHNIQUE'),
      },
    },
    yokozunaPipeline: {
      ozekiReachRate: summaries.filter((summary) => summary.pipeline.ozekiReach).length / Math.max(1, summaries.length),
      ozeki13WinRate: summaries.filter((summary) => summary.pipeline.ozeki13WinCount > 0).length / Math.max(1, summaries.length),
      ozekiYushoRate: summaries.filter((summary) => summary.pipeline.ozekiYushoCount > 0).length / Math.max(1, summaries.length),
      backToBackYushoEquivalentRate:
        summaries.filter((summary) => summary.pipeline.backToBackYushoEquivalentCount > 0).length /
        Math.max(1, summaries.length),
      yokozunaDeliberationRate:
        summaries.filter((summary) => summary.pipeline.yokozunaDeliberationCount > 0).length /
        Math.max(1, summaries.length),
      yokozunaPromotionRate:
        summaries.filter((summary) => summary.pipeline.yokozunaPromotionCount > 0).length /
        Math.max(1, summaries.length),
      yokozunaBlockedReasonDistribution: blockedReasonDistribution,
    },
    outliers: {
      longestCareerSeeds: summaries
        .slice()
        .sort((left, right) => right.careerOutcome.bashoCount - left.careerOutcome.bashoCount)
        .slice(0, 5)
        .map((summary) => summary.seed),
      lowWinLongCareerSeeds: summaries
        .filter((summary) => summary.careerOutcome.bashoCount >= 60)
        .slice()
        .sort((left, right) => left.careerOutcome.officialWinRate - right.careerOutcome.officialWinRate)
        .slice(0, 5)
        .map((summary) => summary.seed),
      highestRankOutlierSeeds: summaries
        .slice()
        .sort((left, right) => {
          const bucketOrder = new Map<string, number>(HIGHEST_RANK_BUCKETS.map((bucket, index) => [bucket, index]));
          return (
            (bucketOrder.get(left.rankOutcome.highestRankBucket) ?? HIGHEST_RANK_BUCKETS.length) -
            (bucketOrder.get(right.rankOutcome.highestRankBucket) ?? HIGHEST_RANK_BUCKETS.length)
          );
        })
        .slice(0, 5)
        .map((summary) => summary.seed),
      highAbsenceSeeds: summaries
        .slice()
        .sort((left, right) => right.careerOutcome.absent - left.careerOutcome.absent)
        .slice(0, 5)
        .map((summary) => summary.seed),
      yokozunaSeeds: summaries.filter((summary) => summary.rankOutcome.isYokozuna).map((summary) => summary.seed),
      highestLateEntrantYokozunaSeeds: summaries
        .slice()
        .sort(
          (left, right) =>
            right.leagueOutcome.lateEntrantYokozunaCount - left.leagueOutcome.lateEntrantYokozunaCount,
        )
        .slice(0, 5)
        .map((summary) => summary.seed),
    },
  };
};

export const runObservationVerificationSample = async (
  configs: CareerObservationConfig[],
): Promise<ObservationBatchSummary> => {
  const results = await runObservationBatch(configs);
  const aggregate = summarizeObservationBatch(results.map((result) => result.summary));

  const annualTotals: number[] = [];
  const annualAbsDeltas: number[] = [];
  const annualSwings: number[] = [];
  const annualJonidanSwings: number[] = [];
  const annualJonokuchiSwings: number[] = [];

  for (const config of configs) {
    const rng = lcg(config.seed);
    const leagueFlow = createLeagueFlowRuntime(rng);
    const { world, lowerWorld } = leagueFlow;
    const status = structuredClone(
      config.initialStatus ?? createObservationInitialStatus(
        config.seed,
        config.aptitudeLadder,
        config.populationKind ?? DEFAULT_OBSERVATION_POPULATION_KIND,
        config.populationPreset,
      ),
    );
    let seq = 0;
    let year = config.startYear ?? DEFAULT_START_YEAR;
    let yearTotals: number[] = [];
    let yearJonidan: number[] = [];
    let yearJonokuchi: number[] = [];

    for (let bashoIndex = 0; bashoIndex < 120; bashoIndex += 1) {
      const month = OFFICIAL_BASHO_MONTHS[bashoIndex % OFFICIAL_BASHO_MONTHS.length];
      prepareLeagueForBasho(leagueFlow, rng, year, seq, month);
      runBashoDetailed(status, year, month, rng, world, lowerWorld);
      advanceTopDivisionBanzuke(world);
      applyLeaguePromotionFlow(leagueFlow, rng);

      seq += 1;
      advanceLeaguePopulation(leagueFlow, rng, seq, month);
      yearTotals.push(countActiveBanzukeHeadcountExcludingMaezumo(world));
      yearJonidan.push(lowerWorld.rosters.Jonidan.length);
      yearJonokuchi.push(lowerWorld.rosters.Jonokuchi.length);

      if (month === 11) {
        annualTotals.push(...yearTotals);
        annualAbsDeltas.push(Math.abs(yearTotals[yearTotals.length - 1] - yearTotals[0]));
        annualSwings.push(Math.max(...yearTotals) - Math.min(...yearTotals));
        annualJonidanSwings.push(Math.max(...yearJonidan) - Math.min(...yearJonidan));
        annualJonokuchiSwings.push(Math.max(...yearJonokuchi) - Math.min(...yearJonokuchi));
        yearTotals = [];
        yearJonidan = [];
        yearJonokuchi = [];
        year += 1;
      }
    }
  }

  return {
    ...aggregate,
    population: {
      sample: configs.length,
      annualTotalMedian: percentile(annualTotals, 0.5),
      annualAbsDeltaMedian: percentile(annualAbsDeltas, 0.5),
      annualAbsDeltaP90: percentile(annualAbsDeltas, 0.9),
      annualSwingMedian: percentile(annualSwings, 0.5),
      annualSwingP90: percentile(annualSwings, 0.9),
      annualJonidanSwingMedian: percentile(annualJonidanSwings, 0.5),
      annualJonokuchiSwingMedian: percentile(annualJonokuchiSwings, 0.5),
    },
  };
};

export type {
  CareerObservationConfig,
  CareerObservationResult,
  CareerObservationSummary,
  ObservationAptitudeLadder,
  ObservationBatchSummary,
  SeasonObservationFrame,
} from './types';
