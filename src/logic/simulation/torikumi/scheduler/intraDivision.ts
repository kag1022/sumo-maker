import { TorikumiPair, TorikumiParticipant } from '../types';
import { RandomSource } from '../../deps';
import { SimulationModelVersion } from '../../modelVersion';
import { compareForPhase, resolvePairEvalPhase, resolvePairScore } from './scoring';

const isAlreadyPaired = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): boolean => faced.get(a.id)?.has(b.id) ?? false;

const isForbiddenPair = (a: TorikumiParticipant, b: TorikumiParticipant): boolean =>
  (a.forbiddenOpponentIds?.includes(b.id) ?? false) ||
  (b.forbiddenOpponentIds?.includes(a.id) ?? false);

export const isValidPair = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): boolean =>
  a.id !== b.id &&
  a.stableId !== b.stableId &&
  !isAlreadyPaired(faced, a, b) &&
  !isForbiddenPair(a, b);

export const markPaired = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): void => {
  faced.get(a.id)?.add(b.id);
  faced.get(b.id)?.add(a.id);
};

export const pairWithinDivision = (
  pool: TorikumiParticipant[],
  faced: Map<string, Set<string>>,
  day: number,
  lateEvalStartDay: number,
  simulationModelVersion: SimulationModelVersion,
  rng?: RandomSource,
): { pairs: TorikumiPair[]; leftovers: TorikumiParticipant[] } => {
  if (pool.length <= 1) return { pairs: [], leftovers: pool.slice() };
  const sorted = pool.slice().sort((a, b) => compareForPhase(a, b, day));
  const used = new Set<string>();
  const pairs: TorikumiPair[] = [];
  const leftovers: TorikumiParticipant[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (used.has(current.id)) continue;

    let bestCandidate: TorikumiParticipant | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    const scoredCandidates: Array<{ candidate: TorikumiParticipant; score: number }> = [];
    for (let j = i + 1; j < sorted.length; j += 1) {
      const candidate = sorted[j];
      if (used.has(candidate.id)) continue;
      if (!isValidPair(faced, current, candidate)) continue;
      const score = resolvePairScore(current, candidate, day, {
        phase: resolvePairEvalPhase(day, lateEvalStartDay, current, candidate),
        simulationModelVersion,
      });
      scoredCandidates.push({ candidate, score });
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
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
          bestCandidate = top[idx].candidate;
          break;
        }
      }
    }

    if (!bestCandidate) {
      leftovers.push(current);
      used.add(current.id);
      continue;
    }

    used.add(current.id);
    used.add(bestCandidate.id);
    pairs.push({
      a: current,
      b: bestCandidate,
      activationReasons: [],
    });
  }

  return { pairs, leftovers };
};
