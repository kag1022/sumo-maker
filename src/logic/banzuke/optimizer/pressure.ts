import { ExpectedPlacementCandidate } from '../providers/expected/types';
import { OptimizerPressureSnapshot } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

export const resolveOptimizerPressure = (
  candidates: ExpectedPlacementCandidate[],
): OptimizerPressureSnapshot => {
  const byDivisionRaw = new Map<string, { winners: number; losers: number; mandatoryUp: number; mandatoryDown: number; total: number }>();

  for (const candidate of candidates) {
    const effectiveLosses = resolveEffectiveLosses(candidate);
    const bucket = byDivisionRaw.get(candidate.sourceDivision) ?? {
      winners: 0,
      losers: 0,
      mandatoryUp: 0,
      mandatoryDown: 0,
      total: 0,
    };
    if (candidate.wins > effectiveLosses) bucket.winners += 1;
    if (candidate.wins < effectiveLosses) bucket.losers += 1;
    if (candidate.mandatoryPromotion) bucket.mandatoryUp += 1;
    if (candidate.mandatoryDemotion) bucket.mandatoryDown += 1;
    bucket.total += 1;
    byDivisionRaw.set(candidate.sourceDivision, bucket);
  }

  const byDivision = new Map<string, number>();
  let aggregate = 0;
  let aggregateWeight = 0;

  for (const [division, bucket] of byDivisionRaw.entries()) {
    if (bucket.total <= 0) {
      byDivision.set(division, 0);
      continue;
    }
    const directional = (bucket.winners - bucket.losers) / bucket.total;
    const mandatory = (bucket.mandatoryUp - bucket.mandatoryDown) / bucket.total;
    const pressure = clamp(directional * 0.75 + mandatory * 0.6, -1, 1);
    byDivision.set(division, pressure);
    aggregate += pressure * bucket.total;
    aggregateWeight += bucket.total;
  }

  return {
    global: aggregateWeight > 0 ? clamp(aggregate / aggregateWeight, -1, 1) : 0,
    byDivision,
  };
};

