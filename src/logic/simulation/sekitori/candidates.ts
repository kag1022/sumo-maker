import { clamp, compareBoundaryCandidate, resolveAdaptiveExchangeSlots } from '../boundary/shared';
import { BoundaryCandidate, BoundarySnapshot } from './types';
import { resolveEmpiricalSlotBand } from '../../banzuke/providers/empirical';

const JURYO_SIZE = 28;
const TOTAL_SLOTS = 148;

const toJuryoNumber = (rankScore: number): number => clamp(Math.ceil(rankScore / 2), 1, 14);
const toMakushitaNumber = (rankScore: number): number => clamp(Math.ceil(rankScore / 2), 1, 60);

const toGlobalSlot = (division: 'Juryo' | 'Makushita', rankScore: number): number =>
  division === 'Juryo' ? clamp(rankScore, 1, JURYO_SIZE) : JURYO_SIZE + clamp(rankScore, 1, 120);

const buildCandidateFromEmpirical = (
  division: 'Juryo' | 'Makushita',
  result: BoundarySnapshot,
): {
  candidate: BoundaryCandidate;
  expectedSlot: number;
  minSlot: number;
  maxSlot: number;
} => {
  const rankNumber = division === 'Juryo' ? toJuryoNumber(result.rankScore) : toMakushitaNumber(result.rankScore);
  const empirical = resolveEmpiricalSlotBand({
    division,
    rankName: division === 'Juryo' ? '十両' : '幕下',
    rankNumber,
    currentSlot: toGlobalSlot(division, result.rankScore),
    totalSlots: TOTAL_SLOTS,
    wins: result.wins,
    losses: result.losses,
    absent: 0,
  });
  const boundaryDelta =
    division === 'Juryo'
      ? Math.max(0, empirical.expectedSlot - JURYO_SIZE)
      : Math.max(0, JURYO_SIZE - empirical.expectedSlot);
  const spanPressure =
    division === 'Juryo'
      ? Math.max(0, empirical.maxSlot - JURYO_SIZE)
      : Math.max(0, JURYO_SIZE - empirical.minSlot);
  const score =
    boundaryDelta * 4.2 +
    spanPressure * 1.7 +
    Math.abs(result.wins - result.losses) * 3.5;
  const mandatory =
    division === 'Juryo'
      ? empirical.minSlot > JURYO_SIZE
      : empirical.maxSlot <= JURYO_SIZE;
  return {
    candidate: {
      id: result.id,
      score,
      mandatory,
    },
    expectedSlot: empirical.expectedSlot,
    minSlot: empirical.minSlot,
    maxSlot: empirical.maxSlot,
  };
};

export const buildJuryoDemotionCandidates = (
  results: BoundarySnapshot[],
): BoundaryCandidate[] =>
  results
    .map((result) => {
      const resolved = buildCandidateFromEmpirical('Juryo', result);
      const bubble = resolved.expectedSlot > JURYO_SIZE || resolved.maxSlot > JURYO_SIZE || result.wins < result.losses;
      return bubble ? resolved.candidate : null;
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort(compareBoundaryCandidate);

export const buildJuryoFallbackDemotionCandidates = (
  results: BoundarySnapshot[],
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  results
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => buildCandidateFromEmpirical('Juryo', result).candidate)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

export const buildMakushitaPromotionCandidates = (
  results: BoundarySnapshot[],
): BoundaryCandidate[] =>
  results
    .map((result) => {
      const resolved = buildCandidateFromEmpirical('Makushita', result);
      const bubble = resolved.expectedSlot <= JURYO_SIZE || resolved.minSlot <= JURYO_SIZE || result.wins > result.losses;
      return bubble ? resolved.candidate : null;
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort(compareBoundaryCandidate);

export const buildMakushitaFallbackPromotionCandidates = (
  results: BoundarySnapshot[],
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  results
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => buildCandidateFromEmpirical('Makushita', result).candidate)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

export const resolveExchangeSlots = (
  demotionPool: BoundaryCandidate[],
  promotionPool: BoundaryCandidate[],
): { demotions: BoundaryCandidate[]; promotions: BoundaryCandidate[]; slots: number } =>
  resolveAdaptiveExchangeSlots(demotionPool, promotionPool);
