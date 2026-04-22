import { compareBoundaryCandidate, resolveAdaptiveExchangeSlots } from '../boundary/shared';
import { BoundaryCandidate, BoundarySnapshot } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const toJuryoNumber = (rankScore: number): number => clamp(Math.ceil(rankScore / 2), 1, 14);
const toMakushitaNumber = (rankScore: number): number => clamp(Math.ceil(rankScore / 2), 1, 60);

const buildJuryoCandidate = (result: BoundarySnapshot): BoundaryCandidate => {
  const number = toJuryoNumber(result.rankScore);
  const diff = result.wins - result.losses;
  const fullAbsenceLike = result.losses >= 15;
  const mandatory =
    fullAbsenceLike ||
    (number >= 13 && diff <= -4) ||
    (number >= 14 && diff <= -2);
  const score =
    number * 3.2 +
    Math.max(0, result.losses - result.wins) * 6.8 +
    (number >= 12 ? 10 : 0) +
    (fullAbsenceLike ? 24 : 0);
  return { id: result.id, score, mandatory };
};

const buildMakushitaCandidate = (result: BoundarySnapshot): BoundaryCandidate => {
  const number = toMakushitaNumber(result.rankScore);
  const diff = result.wins - result.losses;
  const mandatory =
    (number === 1 && result.wins >= 4) ||
    (number <= 3 && result.wins >= 6) ||
    (number <= 5 && result.wins === 7) ||
    (number <= 15 && result.wins === 7);
  const score =
    Math.max(0, 18 - number) * 4.2 +
    Math.max(0, diff) * 7.2 +
    (result.wins === 7 ? 10 : 0) +
    (number === 1 && result.wins >= 4 ? 22 : 0);
  return { id: result.id, score, mandatory };
};

export const buildJuryoDemotionCandidates = (
  results: BoundarySnapshot[],
): BoundaryCandidate[] =>
  results
    .map((result) => {
      const number = toJuryoNumber(result.rankScore);
      const diff = result.wins - result.losses;
      const bubble =
        number >= 11 && diff < 0 ||
        number >= 9 && diff <= -4 ||
        result.losses >= 15;
      return bubble ? buildJuryoCandidate(result) : null;
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort(compareBoundaryCandidate);

export const buildJuryoFallbackDemotionCandidates = (
  results: BoundarySnapshot[],
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  results
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => buildJuryoCandidate(result))
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
      const bubble =
        (number === 1 && result.wins >= 4) ||
        (number <= 3 && result.wins >= 5) ||
        (number <= 5 && result.wins >= 6) ||
        (number <= 15 && result.wins === 7);
      return bubble ? buildMakushitaCandidate(result) : null;
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort(compareBoundaryCandidate);

export const buildMakushitaFallbackPromotionCandidates = (
  results: BoundarySnapshot[],
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  results
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => buildMakushitaCandidate(result))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

export const resolveExchangeSlots = (
  demotionPool: BoundaryCandidate[],
  promotionPool: BoundaryCandidate[],
): { demotions: BoundaryCandidate[]; promotions: BoundaryCandidate[]; slots: number } =>
  resolveAdaptiveExchangeSlots(demotionPool, promotionPool, {
    historicalTargetSlots: Math.min(
      Math.max(1, Math.min(demotionPool.length, promotionPool.length)),
      Math.max(
        demotionPool.filter((candidate) => candidate.mandatory).length,
        promotionPool.filter((candidate) => candidate.mandatory).length,
        1,
      ),
    ),
    historicalToleranceGap: -1.2,
  });
