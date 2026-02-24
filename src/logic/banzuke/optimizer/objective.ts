import { ExpectedPlacementCandidate } from '../providers/expected/types';
import { OPTIMIZER_CONFIG } from './config';
import { resolveQuantileTarget } from './quantileTargets';
import { OptimizerPressureSnapshot, OptimizerRow } from './types';

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

const resolveSlotCost = (
  candidate: ExpectedPlacementCandidate,
  slot: number,
  quantiles: { p10: number; p50: number; p90: number },
  pressure: number,
): number => {
  if (slot < candidate.minSlot || slot > candidate.maxSlot) return INF;

  let cost = 0;
  if (slot < quantiles.p10) {
    cost += (quantiles.p10 - slot) * OPTIMIZER_CONFIG.quantileOutsidePenalty;
  } else if (slot > quantiles.p90) {
    cost += (slot - quantiles.p90) * OPTIMIZER_CONFIG.quantileOutsidePenalty;
  }

  cost += Math.abs(slot - quantiles.p50) * OPTIMIZER_CONFIG.quantileCenterPenalty;
  cost += Math.abs(slot - candidate.expectedSlot) * OPTIMIZER_CONFIG.expectedSlotPenalty;
  cost += Math.abs(slot - candidate.currentSlot) * OPTIMIZER_CONFIG.currentSlotDriftPenalty;

  const effectiveLosses = resolveEffectiveLosses(candidate);
  const diff = candidate.wins - effectiveLosses;
  const delta = slot - candidate.currentSlot;
  if (diff > 0 && delta > 0) {
    cost += delta * OPTIMIZER_CONFIG.directionViolationPenalty;
  }
  if (diff < 0 && delta < 0) {
    cost += Math.abs(delta) * OPTIMIZER_CONFIG.directionViolationPenalty;
  }
  if (candidate.mandatoryPromotion && delta >= 0) {
    cost += OPTIMIZER_CONFIG.mandatoryViolationPenalty + delta * 200;
  }
  if (candidate.mandatoryDemotion && delta <= 0) {
    cost += OPTIMIZER_CONFIG.mandatoryViolationPenalty + Math.abs(delta) * 200;
  }

  if (diff !== 0) {
    cost += OPTIMIZER_CONFIG.pressureLinearPenalty * pressure * delta * Math.sign(diff);
  }

  const normalizedScore = clamp(candidate.score, -2500, 2500);
  cost += (1000 - normalizedScore) * OPTIMIZER_CONFIG.scoreTieBreakScale;
  return cost;
};

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
      costAt: (slot: number) => resolveSlotCost(candidate, slot, quantiles, pressure),
    };
  })
  .sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    if (a.candidate.currentSlot !== b.candidate.currentSlot) {
      return a.candidate.currentSlot - b.candidate.currentSlot;
    }
    return a.id.localeCompare(b.id);
  });

