import { clamp } from '../../simulation/boundary/shared';
import { HEISEI_BANZUKE_CALIBRATION, getHeiseiDivisionQuantiles } from '../../calibration/banzukeHeisei';
import { BanzukeMovementQuantiles, BanzukeRankBandTuple } from '../../calibration/types';

export interface EmpiricalBanzukeCalibration {
  target: typeof HEISEI_BANZUKE_CALIBRATION;
}

export interface EmpiricalSlotBandResolverInput {
  division: string;
  rankName: string;
  rankNumber?: number;
  currentSlot: number;
  totalSlots: number;
  wins: number;
  losses: number;
  absent: number;
  mandatoryPromotion?: boolean;
  mandatoryDemotion?: boolean;
  promotionPressure?: number;
  demotionPressure?: number;
}

export interface EmpiricalSlotBandResolverResult {
  expectedSlot: number;
  minSlot: number;
  maxSlot: number;
  score: number;
  rankBand: string;
  recordBucket: string;
  proposalBasis: 'EMPIRICAL';
  movementClass: 'stayed' | 'promoted' | 'demoted';
  source: 'recordAware' | 'divisionQuantile';
  sampleSize: number;
}

type ParsedRecordBucket = {
  wins: number;
  losses: number;
  absences: number;
};

const TOP_DIVISION_RANK_BANDS: Record<string, BanzukeRankBandTuple[]> = {
  Juryo: [
    [1, 3, '1-3'],
    [4, 7, '4-7'],
    [8, 11, '8-11'],
    [12, 14, '12-14'],
  ],
};

const resolveEffectiveLosses = (losses: number, absent: number): number => losses + absent;

export const resolveEmpiricalRecordBucket = (
  wins: number,
  losses: number,
  absent: number,
): string => {
  const totalBouts = wins + losses;
  if (absent === 0 && (totalBouts === 7 || totalBouts === 15)) {
    return `${wins}-${losses}`;
  }
  return `${wins}-${losses}-${absent}`;
};

const parseRecordBucket = (value: string): ParsedRecordBucket => {
  const parts = value.split('-').map((part) => Number.parseInt(part, 10));
  if (parts.length === 2) {
    return { wins: parts[0] || 0, losses: parts[1] || 0, absences: 0 };
  }
  return {
    wins: parts[0] || 0,
    losses: parts[1] || 0,
    absences: parts[2] || 0,
  };
};

const resolveBandTuples = (division: string): BanzukeRankBandTuple[] | undefined => {
  const lowerBands = HEISEI_BANZUKE_CALIBRATION.recordBucketRules.rankBands[division];
  if (lowerBands?.length) return lowerBands;
  return TOP_DIVISION_RANK_BANDS[division];
};

export const resolveEmpiricalRankBand = (
  division: string,
  rankName: string,
  rankNumber?: number,
): string => {
  if (division === 'Makuuchi') {
    if (rankName === '横綱' || rankName === '大関') return 'Y/O';
    if (rankName === '関脇' || rankName === '小結') return 'S/K';
    const number = rankNumber ?? 17;
    if (number <= 5) return '1-5';
    if (number <= 10) return '6-10';
    return '11+';
  }

  const tuples = resolveBandTuples(division);
  if (!tuples?.length) return 'unknown';
  const value = rankNumber ?? tuples[0][0];
  for (const [lower, upper, label] of tuples) {
    if (value >= lower && (upper === null || value <= upper)) {
      return label;
    }
  }
  return tuples[tuples.length - 1][2];
};

const resolveBandIndex = (division: string, band: string): number => {
  const tuples = resolveBandTuples(division);
  if (!tuples?.length) return band === 'Y/O' ? 0 : band === 'S/K' ? 1 : 2;
  const index = tuples.findIndex(([, , label]) => label === band);
  return index >= 0 ? index : tuples.length;
};

const findNearestRecordAwareQuantiles = (
  division: string,
  rankBand: string,
  recordBucket: string,
): { quantiles: BanzukeMovementQuantiles; rankBand: string; recordBucket: string } | null => {
  const divisionRows = HEISEI_BANZUKE_CALIBRATION.recordBucketRules.recordAwareQuantiles[division];
  if (!divisionRows) return null;

  const targetBandIndex = resolveBandIndex(division, rankBand);
  const targetRecord = parseRecordBucket(recordBucket);
  let best:
    | {
      quantiles: BanzukeMovementQuantiles;
      rankBand: string;
      recordBucket: string;
      cost: number;
      sampleSize: number;
    }
    | undefined;

  for (const [candidateBand, buckets] of Object.entries(divisionRows)) {
    const bandDistance = Math.abs(resolveBandIndex(division, candidateBand) - targetBandIndex);
    for (const [candidateBucket, quantiles] of Object.entries(buckets)) {
      if (!quantiles || quantiles.sampleSize <= 0) continue;
      const parsed = parseRecordBucket(candidateBucket);
      const recordDistance =
        Math.abs(parsed.wins - targetRecord.wins) * 3 +
        Math.abs(parsed.losses - targetRecord.losses) * 2 +
        Math.abs(parsed.absences - targetRecord.absences) * 4;
      const boutDistance = Math.abs(
        (parsed.wins + parsed.losses + parsed.absences) -
        (targetRecord.wins + targetRecord.losses + targetRecord.absences),
      ) * 2;
      const cost = bandDistance * 10 + recordDistance + boutDistance;
      if (
        !best ||
        cost < best.cost ||
        (cost === best.cost && quantiles.sampleSize > best.sampleSize)
      ) {
        best = {
          quantiles,
          rankBand: candidateBand,
          recordBucket: candidateBucket,
          cost,
          sampleSize: quantiles.sampleSize,
        };
      }
    }
  }

  return best
    ? {
      quantiles: best.quantiles,
      rankBand: best.rankBand,
      recordBucket: best.recordBucket,
    }
    : null;
};

const resolveTopMovementClass = (
  division: string,
  rankName: string,
  rankNumber: number | undefined,
  wins: number,
  losses: number,
  absent: number,
): 'stayed' | 'promoted' | 'demoted' => {
  const effectiveLosses = resolveEffectiveLosses(losses, absent);
  const diff = wins - effectiveLosses;
  const number = rankNumber ?? 99;
  if (division === 'Makuuchi') {
    if (diff > 0 && rankName === '前頭' && number <= 5 && wins >= 10) return 'promoted';
    if (diff < 0 && rankName === '前頭' && number >= 11 && effectiveLosses - wins >= 2) return 'demoted';
    return 'stayed';
  }
  if (division === 'Juryo') {
    if (diff > 0 && number <= 5 && wins >= 8) return 'promoted';
    if (diff < 0 && number >= 10 && effectiveLosses - wins >= 2) return 'demoted';
    return 'stayed';
  }
  if (division === 'Makushita') {
    if (diff > 0 && number <= 15 && wins >= 6) return 'promoted';
    if (diff < 0 && number >= 46 && effectiveLosses - wins >= 2) return 'demoted';
  }
  if (division === 'Sandanme') {
    if (diff > 0 && number <= 20 && wins >= 6) return 'promoted';
    if (diff < 0 && number >= 91 && effectiveLosses - wins >= 2) return 'demoted';
  }
  if (division === 'Jonidan') {
    if (diff > 0 && number <= 30 && wins >= 6) return 'promoted';
    if (diff < 0 && number >= 151 && effectiveLosses - wins >= 2) return 'demoted';
  }
  if (division === 'Jonokuchi') {
    if (diff > 0 && wins >= 6) return 'promoted';
    if (diff < 0 && number >= 21 && effectiveLosses - wins >= 2) return 'demoted';
  }
  return 'stayed';
};

const resolveFallbackQuantiles = (
  division: string,
  movementClass: 'stayed' | 'promoted' | 'demoted',
): BanzukeMovementQuantiles | null =>
  getHeiseiDivisionQuantiles(division, movementClass);

const resolveScore = (
  wins: number,
  losses: number,
  absent: number,
  quantiles: BanzukeMovementQuantiles,
  currentSlot: number,
): number => {
  const effectiveLosses = resolveEffectiveLosses(losses, absent);
  const diff = wins - effectiveLosses;
  return (
    quantiles.p50HalfStep * 18 +
    diff * 28 -
    currentSlot * 0.12 +
    quantiles.sampleSize * 0.02
  );
};

const resolveMinimumDemotionSlots = (
  division: string,
  wins: number,
  losses: number,
  absent: number,
): number => {
  const effectiveLosses = resolveEffectiveLosses(losses, absent);
  const deficit = Math.max(0, effectiveLosses - wins);
  if (deficit <= 0) return 0;

  if (division === 'Makuuchi' || division === 'Juryo') {
    if (absent >= 15) return 14;
    if (absent >= 10) return Math.max(8, Math.floor(deficit / 2) + 3);
    if (absent >= 8) return Math.max(6, Math.floor(deficit / 2) + 1);
    if (deficit >= 8) return 5;
    if (deficit >= 5) return 3;
    return 1;
  }

  if (absent >= 7) return 8;
  if (absent >= 4) return Math.max(4, Math.ceil(deficit / 2));
  if (deficit >= 4) return 3;
  if (deficit >= 2) return 1;
  return 0;
};

export const resolveEmpiricalSlotBand = (
  input: EmpiricalSlotBandResolverInput,
): EmpiricalSlotBandResolverResult => {
  const {
    division,
    rankName,
    rankNumber,
    currentSlot,
    totalSlots,
    wins,
    losses,
    absent,
    mandatoryPromotion = false,
    mandatoryDemotion = false,
    promotionPressure = 0,
    demotionPressure = 0,
  } = input;
  const recordBucket = resolveEmpiricalRecordBucket(wins, losses, absent);
  const rankBand = resolveEmpiricalRankBand(division, rankName, rankNumber);
  const movementClass = resolveTopMovementClass(
    division,
    rankName,
    rankNumber,
    wins,
    losses,
    absent,
  );

  const recordAware = findNearestRecordAwareQuantiles(division, rankBand, recordBucket);
  const quantiles = recordAware?.quantiles ?? resolveFallbackQuantiles(division, movementClass);
  if (!quantiles) {
    const expected = clamp(currentSlot, 1, totalSlots);
    return {
      expectedSlot: expected,
      minSlot: expected,
      maxSlot: expected,
      score: 0,
      rankBand,
      recordBucket,
      proposalBasis: 'EMPIRICAL',
      movementClass,
      source: 'divisionQuantile',
      sampleSize: 0,
    };
  }

  const pressureHalfStep = clamp((promotionPressure - demotionPressure) * 6, -12, 12);
  const p10Slot = currentSlot - quantiles.p10HalfStep;
  const p50Slot = currentSlot - (quantiles.p50HalfStep + pressureHalfStep);
  const p90Slot = currentSlot - quantiles.p90HalfStep;
  let minSlot = clamp(Math.floor(Math.min(p10Slot, p50Slot, p90Slot)), 1, totalSlots);
  let maxSlot = clamp(Math.ceil(Math.max(p10Slot, p50Slot, p90Slot)), 1, totalSlots);
  let expectedSlot = clamp(Math.round(p50Slot), minSlot, maxSlot);

  if (mandatoryPromotion) {
    expectedSlot = Math.min(expectedSlot, currentSlot - 1);
    maxSlot = Math.min(maxSlot, currentSlot - 1);
  }
  if (mandatoryDemotion) {
    expectedSlot = Math.max(expectedSlot, currentSlot + 1);
    minSlot = Math.max(minSlot, currentSlot + 1);
  }

  const minimumDemotionSlots = resolveMinimumDemotionSlots(division, wins, losses, absent);
  if (minimumDemotionSlots > 0) {
    const forcedFloor = clamp(currentSlot + minimumDemotionSlots, 1, totalSlots);
    minSlot = Math.max(minSlot, forcedFloor);
    maxSlot = Math.max(maxSlot, minSlot);
    expectedSlot = Math.max(expectedSlot, minSlot);
  }

  minSlot = clamp(Math.min(minSlot, maxSlot), 1, totalSlots);
  maxSlot = clamp(Math.max(minSlot, maxSlot), 1, totalSlots);
  expectedSlot = clamp(expectedSlot, minSlot, maxSlot);

  return {
    expectedSlot,
    minSlot,
    maxSlot,
    score: resolveScore(wins, losses, absent, quantiles, currentSlot),
    rankBand: recordAware?.rankBand ?? rankBand,
    recordBucket: recordAware?.recordBucket ?? recordBucket,
    proposalBasis: 'EMPIRICAL',
    movementClass,
    source: recordAware ? 'recordAware' : 'divisionQuantile',
    sampleSize: quantiles.sampleSize,
  };
};
