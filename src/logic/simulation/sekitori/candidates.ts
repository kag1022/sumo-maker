import { clamp, compareBoundaryCandidate, resolveAdaptiveExchangeSlots } from '../boundary/shared';
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
        (number >= 14 && wins <= 6) ||
        (number >= 13 && wins <= 5) ||
        (number >= 12 && wins <= 4) ||
        (number >= 10 && wins <= 2);
      const bubble =
        mandatory ||
        (number >= 14 && wins === 7) ||
        (number >= 12 && wins === 6) ||
        (number >= 10 && wins === 5);
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
      if (wins <= losses) return null;
      const mandatory = (number <= 5 && wins === 7) || (number === 1 && wins >= 4);
      const bubble =
        mandatory ||
        (number <= 3 && wins >= 5) ||
        (number <= 6 && wins >= 6) ||
        (number <= 15 && wins === 7);
      if (!bubble) return null;

      let score =
        Math.max(0, wins - 3) * 2.9 +
        Math.max(0, 12 - number) * 1.35 +
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
      if (wins <= losses) return null;
      if (wins < 5 || number > 20) return null;
      const score =
        Math.max(0, wins - 3) * 2.4 +
        Math.max(0, 20 - number) * 1.2 +
        Math.max(0, wins - losses) * 0.7;
      return { id: result.id, score, mandatory: false };
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

export const resolveExchangeSlots = (
  demotionPool: BoundaryCandidate[],
  promotionPool: BoundaryCandidate[],
): { demotions: BoundaryCandidate[]; promotions: BoundaryCandidate[]; slots: number } => {
  return resolveAdaptiveExchangeSlots(demotionPool, promotionPool);
};
