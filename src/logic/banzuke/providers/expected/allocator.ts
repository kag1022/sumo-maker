import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from './types';

const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

type CandidateTarget = {
  candidate: ExpectedPlacementCandidate;
  minSlot: number;
  maxSlot: number;
  targetSlot: number;
  targetScore: number;
};

const resolveHardBounds = (
  candidate: ExpectedPlacementCandidate,
  totalSlots: number,
): { minSlot: number; maxSlot: number } => {
  const effectiveLosses = resolveEffectiveLosses(candidate);
  let minSlot = clamp(candidate.minSlot, 1, totalSlots);
  let maxSlot = clamp(candidate.maxSlot, 1, totalSlots);

  if (candidate.mandatoryDemotion && candidate.currentSlot < totalSlots) {
    minSlot = Math.max(minSlot, candidate.currentSlot + 1);
  } else if (candidate.wins < effectiveLosses) {
    minSlot = Math.max(minSlot, candidate.currentSlot);
  }

  if (candidate.mandatoryPromotion && candidate.currentSlot > 1) {
    maxSlot = Math.min(maxSlot, candidate.currentSlot - 1);
  } else if (candidate.wins > effectiveLosses) {
    maxSlot = Math.min(maxSlot, candidate.currentSlot);
  }

  if (minSlot <= maxSlot) {
    return { minSlot, maxSlot };
  }

  const fallback = clamp(candidate.currentSlot, 1, totalSlots);
  if (candidate.mandatoryPromotion) {
    return { minSlot: 1, maxSlot: Math.max(1, fallback - 1) };
  }
  if (candidate.mandatoryDemotion) {
    return { minSlot: Math.min(totalSlots, fallback + 1), maxSlot: totalSlots };
  }
  if (candidate.wins < effectiveLosses) {
    return { minSlot: fallback, maxSlot: totalSlots };
  }
  if (candidate.wins > effectiveLosses) {
    return { minSlot: 1, maxSlot: fallback };
  }
  return { minSlot: fallback, maxSlot: fallback };
};

const resolveTarget = (
  candidate: ExpectedPlacementCandidate,
  totalSlots: number,
): CandidateTarget => {
  const bounds = resolveHardBounds(candidate, totalSlots);
  const targetSlot = clamp(candidate.expectedSlot, bounds.minSlot, bounds.maxSlot);
  const priority =
    candidate.mandatoryPromotion ? -0.35
      : candidate.mandatoryDemotion ? 0.35
        : 0;
  const scoreNudge = -Math.max(-0.45, Math.min(0.45, candidate.score / 2000));
  return {
    candidate,
    minSlot: bounds.minSlot,
    maxSlot: bounds.maxSlot,
    targetSlot,
    targetScore: targetSlot + priority + scoreNudge,
  };
};

const moveItem = <T>(arr: T[], from: number, to: number): void => {
  if (from === to) return;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
};

const enforceBoundsOnOrder = (ordered: CandidateTarget[]): CandidateTarget[] => {
  const working = ordered.slice();
  const maxIterations = Math.max(6, working.length * 2);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    let changed = false;

    for (let idx = 0; idx < working.length; idx += 1) {
      const minIndex = working[idx].minSlot - 1;
      if (idx < minIndex) {
        moveItem(working, idx, minIndex);
        changed = true;
      }
    }

    for (let idx = working.length - 1; idx >= 0; idx -= 1) {
      const maxIndex = working[idx].maxSlot - 1;
      if (idx > maxIndex) {
        moveItem(working, idx, maxIndex);
        changed = true;
      }
    }

    if (!changed) break;
  }

  return working;
};

const sortByTargetScore = (targets: CandidateTarget[]): CandidateTarget[] =>
  targets.slice().sort((a, b) => {
    if (a.targetScore !== b.targetScore) return a.targetScore - b.targetScore;
    if (a.targetSlot !== b.targetSlot) return a.targetSlot - b.targetSlot;
    if (b.candidate.score !== a.candidate.score) return b.candidate.score - a.candidate.score;
    return a.candidate.id.localeCompare(b.candidate.id);
  });

const resolveFallbackSlot = (
  idx: number,
  target: CandidateTarget,
): number => {
  const proposed = idx + 1;
  if (proposed < target.minSlot) return target.minSlot;
  if (proposed > target.maxSlot) return target.maxSlot;
  return proposed;
};

const resolveAssignmentsFromOrder = (
  ordered: CandidateTarget[],
): ExpectedPlacementAssignment[] =>
  ordered.map((target, idx) => ({
    id: target.candidate.id,
    slot: resolveFallbackSlot(idx, target),
  }));

const hasBoundViolation = (
  assignments: ExpectedPlacementAssignment[],
  byId: Map<string, CandidateTarget>,
): boolean => {
  for (const assignment of assignments) {
    const target = byId.get(assignment.id);
    if (!target) continue;
    if (assignment.slot < target.minSlot || assignment.slot > target.maxSlot) return true;
  }
  return false;
};

const hasDuplicateSlots = (assignments: ExpectedPlacementAssignment[]): boolean => {
  const seen = new Set<number>();
  for (const assignment of assignments) {
    if (seen.has(assignment.slot)) return true;
    seen.add(assignment.slot);
  }
  return false;
};

const allocateGreedyUniqueWithinBounds = (
  ordered: CandidateTarget[],
  totalSlots: number,
): ExpectedPlacementAssignment[] => {
  const available = Array.from({ length: totalSlots }, (_, idx) => idx + 1);
  const assignments: ExpectedPlacementAssignment[] = [];

  for (const target of ordered) {
    let bestSlot = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const slot of available) {
      if (slot < target.minSlot || slot > target.maxSlot) continue;
      const distance = Math.abs(slot - target.targetSlot);
      if (distance < bestDistance || (distance === bestDistance && slot < bestSlot)) {
        bestSlot = slot;
        bestDistance = distance;
      }
    }

    if (bestSlot < 0) {
      for (const slot of available) {
        const distance = Math.abs(slot - target.targetSlot);
        if (distance < bestDistance || (distance === bestDistance && (bestSlot < 0 || slot < bestSlot))) {
          bestSlot = slot;
          bestDistance = distance;
        }
      }
    }

    if (bestSlot < 0) continue;
    assignments.push({ id: target.candidate.id, slot: bestSlot });
    const removeIndex = available.indexOf(bestSlot);
    if (removeIndex >= 0) available.splice(removeIndex, 1);
  }

  return assignments;
};

export const allocateExpectedSlots = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
): ExpectedPlacementAssignment[] => {
  if (!candidates.length || totalSlots <= 0) return [];

  const targets = candidates.map((candidate) => resolveTarget(candidate, totalSlots));
  const sortedByTarget = sortByTargetScore(targets);
  const ordered = enforceBoundsOnOrder(sortedByTarget);
  const assignments = resolveAssignmentsFromOrder(ordered);
  const byId = new Map(targets.map((target) => [target.candidate.id, target]));
  if (!hasBoundViolation(assignments, byId) && !hasDuplicateSlots(assignments)) {
    return assignments;
  }

  // Fallback safety: resolve unique slots with nearest-target greedy.
  return allocateGreedyUniqueWithinBounds(ordered, totalSlots);
};
