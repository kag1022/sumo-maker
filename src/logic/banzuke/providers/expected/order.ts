import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from './types';

const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

const resolveDirectionBucket = (candidate: ExpectedPlacementCandidate): number => {
  if (candidate.mandatoryPromotion) return 0;
  const diff = candidate.wins - resolveEffectiveLosses(candidate);
  if (diff > 0) return 1;
  if (diff === 0) return 2;
  if (candidate.mandatoryDemotion) return 4;
  return 3;
};

const buildDivisionGroups = (
  candidates: ExpectedPlacementCandidate[],
): Array<Array<{ candidate: ExpectedPlacementCandidate; index: number }>> => {
  const divisionOrder: string[] = [];
  const grouped = new Map<string, Array<{ candidate: ExpectedPlacementCandidate; index: number }>>();

  candidates.forEach((candidate, index) => {
    const groupKey = candidate.orderingGroup ?? candidate.sourceDivision;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
      divisionOrder.push(groupKey);
    }
    grouped.get(groupKey)?.push({ candidate, index });
  });

  return divisionOrder.map((division) => grouped.get(division) ?? []);
};

export const orderExpectedPlacementCandidates = (
  candidates: ExpectedPlacementCandidate[],
): ExpectedPlacementCandidate[] => buildDivisionGroups(candidates)
  .flatMap((group) => group
    .slice()
    .sort((left, right) => {
      const leftTier = left.candidate.comparisonTier ?? Number.MAX_SAFE_INTEGER;
      const rightTier = right.candidate.comparisonTier ?? Number.MAX_SAFE_INTEGER;
      if (leftTier !== rightTier) return leftTier - rightTier;
      const leftBucket = resolveDirectionBucket(left.candidate);
      const rightBucket = resolveDirectionBucket(right.candidate);
      if (leftBucket !== rightBucket) return leftBucket - rightBucket;
      if (left.candidate.expectedSlot !== right.candidate.expectedSlot) {
        return left.candidate.expectedSlot - right.candidate.expectedSlot;
      }
      if (left.candidate.currentSlot !== right.candidate.currentSlot) {
        return left.candidate.currentSlot - right.candidate.currentSlot;
      }
      if (right.candidate.score !== left.candidate.score) {
        return right.candidate.score - left.candidate.score;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.candidate));

export const hasDuplicateAssignments = (
  assignments: ExpectedPlacementAssignment[],
): boolean => {
  const seen = new Set<number>();
  for (const assignment of assignments) {
    if (seen.has(assignment.slot)) return true;
    seen.add(assignment.slot);
  }
  return false;
};

export const findFirstOrderedSlotViolation = (
  candidates: ExpectedPlacementCandidate[],
  assignments: ExpectedPlacementAssignment[] | Map<string, number>,
): {
  previousId: string;
  currentId: string;
  division: string;
  previousSlot: number;
  currentSlot: number;
} | null => {
  const assignedById = assignments instanceof Map
    ? assignments
    : new Map(assignments.map((assignment) => [assignment.id, assignment.slot]));
  const ordered = orderExpectedPlacementCandidates(candidates);

  let previousDivision: string | null = null;
  let previousId: string | null = null;
  let previousSlot = Number.NEGATIVE_INFINITY;

  for (const candidate of ordered) {
    const slot = assignedById.get(candidate.id);
    if (slot === undefined) {
      return {
        previousId: previousId ?? candidate.id,
        currentId: candidate.id,
        division: candidate.sourceDivision,
        previousSlot,
        currentSlot: Number.NEGATIVE_INFINITY,
      };
    }
    if (candidate.sourceDivision !== previousDivision) {
      previousDivision = candidate.sourceDivision;
      previousId = candidate.id;
      previousSlot = slot;
      continue;
    }
    if (slot <= previousSlot) {
      return {
        previousId: previousId ?? candidate.id,
        currentId: candidate.id,
        division: candidate.sourceDivision,
        previousSlot,
        currentSlot: slot,
      };
    }
    previousId = candidate.id;
    previousSlot = slot;
  }

  return null;
};

export const hasOrderedSlotViolation = (
  candidates: ExpectedPlacementCandidate[],
  assignments: ExpectedPlacementAssignment[] | Map<string, number>,
): boolean => Boolean(findFirstOrderedSlotViolation(candidates, assignments));
