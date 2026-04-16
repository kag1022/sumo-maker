import { allocateExpectedSlots } from './allocator';
import { findFirstOrderedSlotViolation, orderExpectedPlacementCandidates } from './order';
import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from './types';

export const reallocateWithMonotonicConstraints = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
  maxIterations = 6,
): ExpectedPlacementAssignment[] => {
  const working = orderExpectedPlacementCandidates(candidates).map((candidate) => ({ ...candidate }));
  const workingById = new Map(working.map((candidate) => [candidate.id, candidate]));
  let assignments = allocateExpectedSlots(working, totalSlots);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const violation = findFirstOrderedSlotViolation(working, assignments);
    if (!violation) break;

    const previousCandidate = workingById.get(violation.previousId);
    const currentCandidate = workingById.get(violation.currentId);
    if (!previousCandidate || !currentCandidate) break;

    const previousExpectedSlot = previousCandidate.expectedSlot;
    previousCandidate.score += 120;
    currentCandidate.score -= 120;
    previousCandidate.expectedSlot = Math.min(
      previousCandidate.maxSlot,
      Math.max(previousCandidate.minSlot, Math.min(previousCandidate.expectedSlot, currentCandidate.expectedSlot)),
    );
    currentCandidate.expectedSlot = Math.min(
      currentCandidate.maxSlot,
      Math.max(currentCandidate.minSlot, Math.max(currentCandidate.expectedSlot, previousExpectedSlot)),
    );
    assignments = allocateExpectedSlots(working, totalSlots);
  }

  return assignments;
};
