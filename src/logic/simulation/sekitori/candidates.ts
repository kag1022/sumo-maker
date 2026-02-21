import { clamp, compareBoundaryCandidate } from '../boundary/shared';
import { BoundaryCandidate, BoundarySnapshot } from './types';

const toJuryoNumber = (rankScore: number): number => clamp(Math.ceil(rankScore / 2), 1, 14);

const toMakushitaNumber = (rankScore: number): number => clamp(Math.ceil(rankScore / 2), 1, 60);

export const buildJuryoDemotionCandidates = (
  results: BoundarySnapshot[],
): BoundaryCandidate[] =>
  results
    .map((result) => {
      const number = toJuryoNumber(result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      const mandatory =
        (number >= 14 && wins <= 7) ||
        (number >= 13 && wins <= 6) ||
        (number >= 12 && wins <= 5) ||
        (number >= 10 && wins <= 3);
      const bubble =
        mandatory ||
        (number >= 13 && wins === 7) ||
        (number >= 11 && wins === 6) ||
        (number >= 9 && wins === 5);
      if (!bubble) return null;

      let score =
        (number - 8) * 2.05 +
        Math.max(0, 8 - wins) * 3.15 +
        Math.max(0, losses - wins) * 1.1;
      if (mandatory) score += 8;

      return { id: result.id, score, mandatory };
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort(compareBoundaryCandidate);

export const buildJuryoFallbackDemotionCandidates = (
  results: BoundarySnapshot[],
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  results
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => {
      const number = toJuryoNumber(result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      const score =
        Math.max(0, number - 12) * 1.8 +
        Math.max(0, 8 - wins) * 1.2 +
        Math.max(0, losses - wins) * 0.4;
      return { id: result.id, score, mandatory: false };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

export const buildMakushitaPromotionCandidates = (
  results: BoundarySnapshot[],
): BoundaryCandidate[] =>
  results
    .map((result) => {
      const number = toMakushitaNumber(result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      const mandatory = (number <= 15 && wins === 7) || (number === 1 && wins >= 4);
      const bubble =
        mandatory ||
        (number <= 3 && wins >= 5) ||
        (number <= 5 && wins >= 6) ||
        (number <= 10 && wins === 7) ||
        (number <= 15 && wins >= 6);
      if (!bubble) return null;

      let score =
        Math.max(0, wins - 3) * 2.9 +
        Math.max(0, 16 - number) * 1.65 +
        Math.max(0, wins - losses) * 1.0;
      if (mandatory) score += 8;

      return { id: result.id, score, mandatory };
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort(compareBoundaryCandidate);

export const buildMakushitaFallbackPromotionCandidates = (
  results: BoundarySnapshot[],
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  results
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => {
      const number = toMakushitaNumber(result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      const score =
        Math.max(0, wins - 3) * 2.4 +
        Math.max(0, 20 - number) * 1.2 +
        Math.max(0, wins - losses) * 0.7;
      return { id: result.id, score, mandatory: false };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

export const resolveExchangeSlots = (
  demotionPool: BoundaryCandidate[],
  promotionPool: BoundaryCandidate[],
): { demotions: BoundaryCandidate[]; promotions: BoundaryCandidate[]; slots: number } => {
  if (!demotionPool.length || !promotionPool.length) {
    return { demotions: [], promotions: [], slots: 0 };
  }

  const mandatoryDemotions = demotionPool.filter((candidate) => candidate.mandatory).length;
  const mandatoryPromotions = promotionPool.filter((candidate) => candidate.mandatory).length;
  const maxSlots = Math.min(demotionPool.length, promotionPool.length);

  let slots = Math.min(Math.max(mandatoryDemotions, mandatoryPromotions), maxSlots);
  if (slots === 0 && promotionPool[0].score >= demotionPool[0].score + 5) {
    slots = 1;
  }
  if (slots === 0 && maxSlots > 0) {
    slots = 1;
  }

  while (slots < maxSlots) {
    const nextPromotion = promotionPool[slots];
    const nextDemotion = demotionPool[slots];
    if (!nextPromotion || !nextDemotion) break;
    if (nextPromotion.score >= nextDemotion.score + 2.5) {
      slots += 1;
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
