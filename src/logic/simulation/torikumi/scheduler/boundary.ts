import { boundaryNeedWeight } from '../policy';
import { RandomSource } from '../../deps';
import { SimulationModelVersion } from '../../modelVersion';
import {
  BoundaryActivationReason,
  BoundaryBandSpec,
  TorikumiDivision,
  TorikumiPair,
  TorikumiParticipant,
} from '../types';
import { isValidPair } from './intraDivision';
import {
  isLowerDivisionClimax,
  resolvePairEvalPhase,
  resolvePairScore,
  resolveRankNumber,
} from './scoring';

export const mergeUniqueParticipants = (
  prioritized: TorikumiParticipant[],
  rest: TorikumiParticipant[],
): TorikumiParticipant[] => {
  const seen = new Set<string>();
  const merged: TorikumiParticipant[] = [];
  for (const participant of prioritized.concat(rest)) {
    if (seen.has(participant.id)) continue;
    seen.add(participant.id);
    merged.push(participant);
  }
  return merged;
};

export const filterByBand = (
  participants: TorikumiParticipant[],
  band: BoundaryBandSpec['upperBand'],
): TorikumiParticipant[] =>
  participants.filter((participant) => {
    if (band.rankName && participant.rankName !== band.rankName) return false;
    const number = resolveRankNumber(participant);
    return number >= band.minNumber && number <= band.maxNumber;
  });

export const resolveHybridBandCandidates = (
  participants: TorikumiParticipant[],
  band: BoundaryBandSpec['upperBand'],
  preferUpperNumber: boolean,
): TorikumiParticipant[] => {
  if (!participants.length) return [];
  let min = band.minNumber;
  let max = band.maxNumber;
  const floor = 1;
  const ceil = Math.max(...participants.map((participant) => resolveRankNumber(participant)));

  for (let step = 0; step < 8; step += 1) {
    const filtered = participants.filter((participant) => {
      if (band.rankName && participant.rankName !== band.rankName) return false;
      const number = resolveRankNumber(participant);
      return number >= min && number <= max;
    });
    if (filtered.length > 0) return filtered;
    min = Math.max(floor, min - 1);
    max = Math.min(ceil, max + 1);
  }

  const sorted = participants
    .slice()
    .sort((a, b) =>
      preferUpperNumber
        ? resolveRankNumber(b) - resolveRankNumber(a)
        : resolveRankNumber(a) - resolveRankNumber(b));
  return sorted.slice(0, Math.min(10, sorted.length));
};

const hasCloseScorePair = (
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
): boolean => {
  for (const up of upper) {
    for (const low of lower) {
      if (Math.abs(up.wins - low.wins) <= 1) return true;
    }
  }
  return false;
};

const hasRunawayLower = (
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
): boolean => {
  if (!upper.length || !lower.length) return false;
  const upperBottomWins = Math.min(...upper.map((participant) => participant.wins));
  const lowerTopWins = Math.max(...lower.map((participant) => participant.wins));
  return lowerTopWins - upperBottomWins >= 2;
};

export const resolveActivationReasons = (
  spec: BoundaryBandSpec,
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
  vacancyByDivision: Partial<Record<TorikumiDivision, number>>,
  isLatePhase: boolean,
): BoundaryActivationReason[] => {
  const reasons: BoundaryActivationReason[] = [];
  if ((vacancyByDivision[spec.upperDivision] ?? 0) > 0) reasons.push('VACANCY');
  if (upper.length > 0 && lower.length > 0) reasons.push('SHORTAGE');
  if (hasCloseScorePair(upper, lower)) reasons.push('SCORE_ALIGNMENT');
  if (isLatePhase) reasons.push('LATE_EVAL');
  if (hasRunawayLower(upper, lower)) reasons.push('RUNAWAY_CHECK');
  return reasons;
};

const resolvePromotionPressure = (
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
): number => {
  if (!upper.length || !lower.length) return 0;
  const upperBottom = Math.min(...upper.map((participant) => participant.wins));
  const lowerTop = Math.max(...lower.map((participant) => participant.wins));
  return Math.max(0, lowerTop - upperBottom - 1);
};

export const pairAcrossBoundary = (
  day: number,
  lateEvalStartDay: number,
  faced: Map<string, Set<string>>,
  spec: BoundaryBandSpec,
  upperCandidates: TorikumiParticipant[],
  lowerCandidates: TorikumiParticipant[],
  reasons: BoundaryActivationReason[],
  simulationModelVersion: SimulationModelVersion,
  rng?: RandomSource,
): TorikumiPair[] => {
  const pairs: TorikumiPair[] = [];
  const usedUpper = new Set<string>();
  const usedLower = new Set<string>();
  const sortedUpper = upperCandidates
    .slice()
    .sort((a, b) => resolveRankNumber(b) - resolveRankNumber(a));

  const vacancy = reasons.includes('VACANCY') ? 1 : 0;
  const promotionPressure = resolvePromotionPressure(upperCandidates, lowerCandidates);
  const needWeight = boundaryNeedWeight(day, vacancy, promotionPressure);

  for (const upper of sortedUpper) {
    if (usedUpper.has(upper.id)) continue;
    let bestLower: TorikumiParticipant | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const scoredCandidates: Array<{ lower: TorikumiParticipant; score: number }> = [];
    for (const lower of lowerCandidates) {
      if (usedLower.has(lower.id)) continue;
      if (!isValidPair(faced, upper, lower)) continue;
      const score = resolvePairScore(upper, lower, day, {
        boundaryNeed: needWeight,
        boundaryId: spec.id,
        phase: resolvePairEvalPhase(day, lateEvalStartDay, upper, lower),
        simulationModelVersion,
      });
      scoredCandidates.push({ lower, score });
      if (score < bestScore) {
        bestScore = score;
        bestLower = lower;
      }
    }
    if (
      simulationModelVersion === 'unified-v3-variance' &&
      rng &&
      scoredCandidates.length > 1
    ) {
      scoredCandidates.sort((a, b) => a.score - b.score);
      const top = scoredCandidates.slice(0, 3);
      const rawWeights = [0.7, 0.2, 0.1].slice(0, top.length);
      const weightSum = rawWeights.reduce((sum, weight) => sum + weight, 0);
      const roll = rng();
      let acc = 0;
      for (let idx = 0; idx < top.length; idx += 1) {
        acc += rawWeights[idx] / weightSum;
        if (roll <= acc) {
          bestLower = top[idx].lower;
          break;
        }
      }
    }
    if (!bestLower) continue;
    usedUpper.add(upper.id);
    usedLower.add(bestLower.id);
    pairs.push({
      a: upper,
      b: bestLower,
      boundaryId: spec.id,
      activationReasons: reasons,
    });
  }

  return pairs;
};

export const isBoundaryLatePhase = (
  day: number,
  lateEvalStartDay: number,
  upperParticipants: TorikumiParticipant[],
  lowerParticipants: TorikumiParticipant[],
): boolean =>
  day >= lateEvalStartDay ||
  upperParticipants.some(isLowerDivisionClimax) ||
  lowerParticipants.some(isLowerDivisionClimax);
