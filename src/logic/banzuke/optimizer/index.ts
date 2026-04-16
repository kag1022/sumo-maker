import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from '../providers/expected/types';
import {
  hasDuplicateAssignments,
  hasOrderedSlotViolation,
  orderExpectedPlacementCandidates,
} from '../providers/expected/order';
import { buildOptimizerRows } from './objective';
import { solveOrderedAssignmentDp } from './orderedAssignmentDp';
import { resolveOptimizerPressure } from './pressure';

const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

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

export const optimizeExpectedPlacements = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
): ExpectedPlacementAssignment[] | undefined => {
  if (!candidates.length || totalSlots <= 0) return [];

  const orderedCandidates = orderExpectedPlacementCandidates(candidates);
  const pressure = resolveOptimizerPressure(orderedCandidates);
  const rows = buildOptimizerRows(orderedCandidates, pressure);
  const solved = solveOrderedAssignmentDp(rows, totalSlots);
  if (!solved) return undefined;

  const byId = new Map(orderedCandidates.map((candidate) => [candidate.id, candidate]));
  if (hasDuplicateAssignments(solved.assignments)) return undefined;
  for (const assignment of solved.assignments) {
    const candidate = byId.get(assignment.id);
    if (!candidate) return undefined;
    if (violatesCandidateHardRules(assignment, candidate)) return undefined;
  }
  if (hasOrderedSlotViolation(orderedCandidates, solved.assignments)) return undefined;

  return solved.assignments;
};

