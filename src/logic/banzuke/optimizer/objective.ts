import { ExpectedPlacementCandidate } from '../providers/expected/types';
import { OPTIMIZER_CONFIG } from './config';
import { resolveQuantileTarget } from './quantileTargets';
import { OptimizerCostBreakdown, OptimizerPressureSnapshot, OptimizerRow } from './types';

const INF = Number.POSITIVE_INFINITY;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

const resolveCandidatePriority = (candidate: ExpectedPlacementCandidate): number => {
  const effectiveLosses = resolveEffectiveLosses(candidate);
  const diff = candidate.wins - effectiveLosses;
  const mandatoryBias =
    candidate.mandatoryPromotion ? 11000 : candidate.mandatoryDemotion ? -11000 : 0;
  const score = clamp(candidate.score, -4000, 4000);
  return mandatoryBias + score * 1.2 + diff * 140 - candidate.currentSlot * 0.38;
};

const resolveSlotCostBreakdown = (
  candidate: ExpectedPlacementCandidate,
  slot: number,
  quantiles: { p10: number; p50: number; p90: number },
  pressure: number,
): OptimizerCostBreakdown | null => {
  if (slot < candidate.minSlot || slot > candidate.maxSlot) return null;

  const breakdown: OptimizerCostBreakdown = {
    quantileOutside: 0,
    quantileCenter: 0,
    expectedSlotDrift: 0,
    currentSlotDrift: 0,
    directionViolation: 0,
    mandatoryViolation: 0,
    pressure: 0,
    scoreTieBreak: 0,
  };

  if (slot < quantiles.p10) {
    breakdown.quantileOutside += (quantiles.p10 - slot) * OPTIMIZER_CONFIG.quantileOutsidePenalty;
  } else if (slot > quantiles.p90) {
    breakdown.quantileOutside += (slot - quantiles.p90) * OPTIMIZER_CONFIG.quantileOutsidePenalty;
  }

  breakdown.quantileCenter += Math.abs(slot - quantiles.p50) * OPTIMIZER_CONFIG.quantileCenterPenalty;
  breakdown.expectedSlotDrift += Math.abs(slot - candidate.expectedSlot) * OPTIMIZER_CONFIG.expectedSlotPenalty;
  breakdown.currentSlotDrift += Math.abs(slot - candidate.currentSlot) * OPTIMIZER_CONFIG.currentSlotDriftPenalty;

  const effectiveLosses = resolveEffectiveLosses(candidate);
  const diff = candidate.wins - effectiveLosses;
  const delta = slot - candidate.currentSlot;
  if (diff > 0 && delta > 0) {
    breakdown.directionViolation += delta * OPTIMIZER_CONFIG.directionViolationPenalty;
  }
  if (diff < 0 && delta < 0) {
    breakdown.directionViolation += Math.abs(delta) * OPTIMIZER_CONFIG.directionViolationPenalty;
  }
  if (candidate.mandatoryPromotion && delta >= 0) {
    breakdown.mandatoryViolation += OPTIMIZER_CONFIG.mandatoryViolationPenalty + delta * 200;
  }
  if (candidate.mandatoryDemotion && delta <= 0) {
    breakdown.mandatoryViolation += OPTIMIZER_CONFIG.mandatoryViolationPenalty + Math.abs(delta) * 200;
  }

  if (diff !== 0) {
    breakdown.pressure += OPTIMIZER_CONFIG.pressureLinearPenalty * pressure * delta * Math.sign(diff);
  }

  const normalizedScore = clamp(candidate.score, -2500, 2500);
  breakdown.scoreTieBreak += (1000 - normalizedScore) * OPTIMIZER_CONFIG.scoreTieBreakScale;
  return breakdown;
};

const resolveSlotCostFromBreakdown = (breakdown: OptimizerCostBreakdown): number =>
  breakdown.quantileOutside +
  breakdown.quantileCenter +
  breakdown.expectedSlotDrift +
  breakdown.currentSlotDrift +
  breakdown.directionViolation +
  breakdown.mandatoryViolation +
  breakdown.pressure +
  breakdown.scoreTieBreak;

export const buildOptimizerRows = (
  candidates: ExpectedPlacementCandidate[],
  pressureSnapshot: OptimizerPressureSnapshot,
): OptimizerRow[] => candidates
  .map((candidate) => {
    const quantiles = resolveQuantileTarget(candidate, pressureSnapshot);
    const pressure =
      pressureSnapshot.byDivision.get(candidate.sourceDivision) ?? pressureSnapshot.global;
    return {
      id: candidate.id,
      candidate,
      minSlot: Math.min(candidate.minSlot, candidate.maxSlot),
      maxSlot: Math.max(candidate.minSlot, candidate.maxSlot),
      priority: resolveCandidatePriority(candidate),
      quantiles,
      costAt: (slot: number) => {
        const breakdown = resolveSlotCostBreakdown(candidate, slot, quantiles, pressure);
        if (!breakdown) return INF;
        return resolveSlotCostFromBreakdown(breakdown);
      },
      costBreakdownAt: (slot: number) =>
        resolveSlotCostBreakdown(candidate, slot, quantiles, pressure) ?? {
          quantileOutside: INF,
          quantileCenter: 0,
          expectedSlotDrift: 0,
          currentSlotDrift: 0,
          directionViolation: 0,
          mandatoryViolation: 0,
          pressure: 0,
          scoreTieBreak: 0,
        },
    };
  });
