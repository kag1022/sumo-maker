import type { RandomSource } from '../deps';

export type BoundaryCandidate = {
  score: number;
  mandatory: boolean;
};

export type BoundaryResultSnapshot = {
  id: string;
  rankScore: number;
  wins: number;
  losses: number;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const randomNoise = (rng: RandomSource, amplitude: number): number =>
  (rng() * 2 - 1) * amplitude;

export const compareBoundaryCandidate = (
  a: BoundaryCandidate,
  b: BoundaryCandidate,
): number => {
  if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
  return b.score - a.score;
};

const resolvePressureTargetSlots = <T extends BoundaryCandidate>(
  demotionPool: T[],
  promotionPool: T[],
  baseSlots: number,
  maxSlots: number,
): number => {
  if (!demotionPool.length || !promotionPool.length) return 0;
  const topDemotionScore = demotionPool[0].score;
  const topPromotionScore = promotionPool[0].score;
  const promotionPressure = promotionPool.filter(
    (candidate) => candidate.score >= topDemotionScore - 2,
  ).length;
  const demotionPressure = demotionPool.filter(
    (candidate) => candidate.score >= topPromotionScore - 2,
  ).length;
  const blended = Math.round((promotionPressure + demotionPressure) * 0.5);
  return clamp(blended, baseSlots, maxSlots);
};

export const resolveAdaptiveExchangeSlots = <T extends BoundaryCandidate>(
  demotionPool: T[],
  promotionPool: T[],
  options?: {
    historicalTargetSlots?: number;
    historicalToleranceGap?: number;
  },
): { demotions: T[]; promotions: T[]; slots: number } => {
  if (!demotionPool.length || !promotionPool.length) {
    return { demotions: [], promotions: [], slots: 0 };
  }

  const mandatoryDemotions = demotionPool.filter((candidate) => candidate.mandatory).length;
  const mandatoryPromotions = promotionPool.filter((candidate) => candidate.mandatory).length;
  const maxSlots = Math.min(demotionPool.length, promotionPool.length);
  if (maxSlots <= 0) {
    return { demotions: [], promotions: [], slots: 0 };
  }

  let slots = Math.min(Math.max(mandatoryDemotions, mandatoryPromotions), maxSlots);
  if (slots === 0) slots = 1;

  const pressureTargetSlots = resolvePressureTargetSlots(
    demotionPool,
    promotionPool,
    slots,
    maxSlots,
  );
  const historicalTargetSlots = clamp(
    options?.historicalTargetSlots ?? slots,
    slots,
    maxSlots,
  );
  const historicalToleranceGap = options?.historicalToleranceGap ?? -1.6;
  let momentum = 0;

  while (slots < historicalTargetSlots) {
    const promotion = promotionPool[slots];
    const demotion = demotionPool[slots];
    if (!promotion || !demotion) break;
    const gap = promotion.score - demotion.score;
    if (gap < historicalToleranceGap) break;
    slots += 1;
    momentum = clamp(momentum * 0.45 + gap * 0.1, -1.2, 1.8);
  }

  while (slots < maxSlots) {
    const promotion = promotionPool[slots];
    const demotion = demotionPool[slots];
    if (!promotion || !demotion) break;

    const gap = promotion.score - demotion.score;
    const adaptiveThreshold = Math.max(-0.8, 3.2 - slots * 0.3);
    if (gap + momentum >= adaptiveThreshold) {
      slots += 1;
      momentum = clamp(momentum * 0.6 + Math.max(-0.6, gap) * 0.18, -1.2, 1.8);
      continue;
    }

    if (slots < pressureTargetSlots && gap >= -1.4) {
      slots += 1;
      momentum = clamp(momentum * 0.4 + gap * 0.12, -1.2, 1.8);
      continue;
    }
    break;
  }

  return {
    demotions: demotionPool.slice(0, slots),
    promotions: promotionPool.slice(0, slots),
    slots,
  };
};

export const computeNeighborHalfStepNudge = (
  results: BoundaryResultSnapshot[],
): number => {
  const player = results.find((result) => result.id === 'PLAYER');
  if (!player) return 0;
  const byScore = new Map(results.map((result) => [result.rankScore, result]));
  const upper = byScore.get(player.rankScore - 1);
  const lower = byScore.get(player.rankScore + 1);
  const playerDiff = player.wins - player.losses;
  const upperDiff = upper ? upper.wins - upper.losses : null;
  const lowerDiff = lower ? lower.wins - lower.losses : null;

  if (playerDiff > 0 && upperDiff !== null && playerDiff >= upperDiff + 2) return -1;
  if (playerDiff < 0 && lowerDiff !== null && lowerDiff >= playerDiff + 2) return 1;
  if (playerDiff === 0) {
    if (upperDiff !== null && upperDiff <= -2) return -1;
    if (lowerDiff !== null && lowerDiff >= 2) return 1;
  }
  if (playerDiff > 0 && upperDiff !== null && upperDiff < 0) return -1;
  if (playerDiff < 0 && lowerDiff !== null && lowerDiff > 0) return 1;
  return 0;
};
