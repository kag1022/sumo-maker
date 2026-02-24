import { ExpectedPlacementCandidate } from '../providers/expected/types';
import { OPTIMIZER_CONFIG } from './config';
import { OptimizerPressureSnapshot, OptimizerQuantileTarget } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

const resolveDirectionalTilt = (candidate: ExpectedPlacementCandidate): number => {
  const effectiveLosses = resolveEffectiveLosses(candidate);
  const diff = candidate.wins - effectiveLosses;
  if (diff === 0) return 0;
  const absDiff = Math.min(7, Math.abs(diff));
  const raw = 0.18 + absDiff * 0.08;
  return diff > 0
    ? Math.min(0.72, raw * OPTIMIZER_CONFIG.promotionTiltWeight)
    : -Math.min(0.72, raw * OPTIMIZER_CONFIG.demotionTiltWeight);
};

export const resolveQuantileTarget = (
  candidate: ExpectedPlacementCandidate,
  pressure: OptimizerPressureSnapshot,
): OptimizerQuantileTarget => {
  const minSlot = Math.min(candidate.minSlot, candidate.maxSlot);
  const maxSlot = Math.max(candidate.minSlot, candidate.maxSlot);
  const width = Math.max(1, maxSlot - minSlot);
  const baseP50 = clamp(candidate.expectedSlot, minSlot, maxSlot);
  const divisionPressure = pressure.byDivision.get(candidate.sourceDivision) ?? pressure.global;
  const directionalTilt = resolveDirectionalTilt(candidate);
  const pressureTilt = directionalTilt * divisionPressure * 0.35;
  const totalTilt = clamp(directionalTilt + pressureTilt, -0.8, 0.8);

  const p50 = (() => {
    if (totalTilt > 0) {
      return Math.round(lerp(baseP50, minSlot, totalTilt));
    }
    if (totalTilt < 0) {
      return Math.round(lerp(baseP50, maxSlot, Math.abs(totalTilt)));
    }
    return Math.round(baseP50);
  })();

  const spread = Math.max(
    OPTIMIZER_CONFIG.minimumQuantileSpread,
    Math.round(width * (0.22 + Math.abs(totalTilt) * 0.18)),
  );
  const p10 = clamp(p50 - spread, minSlot, maxSlot);
  const p90 = clamp(p50 + spread, minSlot, maxSlot);
  return {
    p10: Math.min(p10, p50, p90),
    p50: clamp(p50, minSlot, maxSlot),
    p90: Math.max(p10, p50, p90),
  };
};

