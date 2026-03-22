import { clamp, compareBoundaryCandidate, resolveAdaptiveExchangeSlots } from '../boundary/shared';
import { BoundaryCandidate, BoundarySnapshot } from './types';
import { HEISEI_BANZUKE_CALIBRATION } from '../../calibration/banzukeHeisei';

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
        (number >= 11 && wins <= 4) ||
        (number >= 9 && wins <= 2);
      const bubble =
        mandatory ||
        (number >= 14 && wins === 7) ||
        (number >= 12 && wins === 6) ||
        (number >= 10 && wins === 5) ||
        (number >= 8 && wins === 4);
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
      const tuning = HEISEI_BANZUKE_CALIBRATION.boundaryExchange.juryoMakushita;
      const number = toMakushitaNumber(result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      if (wins <= losses) return null;
      const mandatory = (number <= 5 && wins === 7) || (number <= 2 && wins >= 4);
      const bubble =
        mandatory ||
        (number <= 4 && wins >= 5) ||
        (number <= 10 && wins >= 6) ||
        (number <= tuning.makushitaSevenWinBubbleMaxRank && wins === 7);
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
      const tuning = HEISEI_BANZUKE_CALIBRATION.boundaryExchange.juryoMakushita;
      const number = toMakushitaNumber(result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      if (wins <= losses) return null;
      if (wins < tuning.makushitaFallbackMinWins || number > tuning.makushitaFallbackMaxRank) {
        return null;
      }
      const score =
        Math.max(0, wins - 3) * 2.4 +
        Math.max(0, tuning.makushitaFallbackMaxRank - number) * 0.9 +
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
  return resolveAdaptiveExchangeSlots(demotionPool, promotionPool, {
    historicalTargetSlots:
      HEISEI_BANZUKE_CALIBRATION.boundaryExchange.juryoMakushita.targetCompetitiveSlots,
    historicalToleranceGap:
      HEISEI_BANZUKE_CALIBRATION.boundaryExchange.juryoMakushita.historicalToleranceGap,
  });
};
