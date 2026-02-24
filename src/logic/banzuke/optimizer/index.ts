import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from '../providers/expected/types';
import { buildOptimizerRows } from './objective';
import { solveOrderedAssignmentDp } from './orderedAssignmentDp';
import { resolveOptimizerPressure } from './pressure';

const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

const hasDuplicateSlot = (assignments: ExpectedPlacementAssignment[]): boolean => {
  const seen = new Set<number>();
  for (const assignment of assignments) {
    if (seen.has(assignment.slot)) return true;
    seen.add(assignment.slot);
  }
  return false;
};

const violatesCandidateHardRules = (
  assignment: ExpectedPlacementAssignment,
  candidate: ExpectedPlacementCandidate,
): boolean => {
  if (assignment.slot < candidate.minSlot || assignment.slot > candidate.maxSlot) return true;
  const effectiveLosses = resolveEffectiveLosses(candidate);
  if (candidate.wins > effectiveLosses && assignment.slot > candidate.currentSlot) return true;
  if (candidate.wins < effectiveLosses && assignment.slot < candidate.currentSlot) return true;
  if (candidate.mandatoryPromotion && assignment.slot >= candidate.currentSlot) return true;
  if (candidate.mandatoryDemotion && assignment.slot <= candidate.currentSlot) return true;
  return false;
};

const hasCrossDirectionViolation = (
  assignments: ExpectedPlacementAssignment[],
  byId: Map<string, ExpectedPlacementCandidate>,
): boolean => {
  const byDivision = new Map<string, Array<{ slot: number; diff: number }>>();
  for (const assignment of assignments) {
    const candidate = byId.get(assignment.id);
    if (!candidate) continue;
    const diff = candidate.wins - resolveEffectiveLosses(candidate);
    const bucket = byDivision.get(candidate.sourceDivision) ?? [];
    bucket.push({ slot: assignment.slot, diff });
    byDivision.set(candidate.sourceDivision, bucket);
  }

  for (const rows of byDivision.values()) {
    const winners = rows.filter((row) => row.diff > 0);
    const losers = rows.filter((row) => row.diff < 0);
    for (const winner of winners) {
      for (const loser of losers) {
        if (winner.slot > loser.slot) return true;
      }
    }
  }
  return false;
};

export const optimizeExpectedPlacements = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
): ExpectedPlacementAssignment[] | undefined => {
  if (!candidates.length || totalSlots <= 0) return [];

  const pressure = resolveOptimizerPressure(candidates);
  const rows = buildOptimizerRows(candidates, pressure);
  const solved = solveOrderedAssignmentDp(rows, totalSlots);
  if (!solved) return undefined;

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  if (hasDuplicateSlot(solved.assignments)) return undefined;
  for (const assignment of solved.assignments) {
    const candidate = byId.get(assignment.id);
    if (!candidate) return undefined;
    if (violatesCandidateHardRules(assignment, candidate)) return undefined;
  }
  if (hasCrossDirectionViolation(solved.assignments, byId)) return undefined;

  return solved.assignments;
};

