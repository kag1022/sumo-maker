import { allocateExpectedSlots } from './allocator';
import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from './types';

const findViolations = (
  candidates: ExpectedPlacementCandidate[],
  assignedById: Map<string, number>,
): Array<{ winner: ExpectedPlacementCandidate; loser: ExpectedPlacementCandidate }> => {
  const violations: Array<{ winner: ExpectedPlacementCandidate; loser: ExpectedPlacementCandidate }> = [];
  const byDivision = new Map<string, ExpectedPlacementCandidate[]>();
  for (const candidate of candidates) {
    const key = candidate.sourceDivision;
    const list = byDivision.get(key) ?? [];
    list.push(candidate);
    byDivision.set(key, list);
  }

  for (const divisionCandidates of byDivision.values()) {
    const winners = divisionCandidates.filter((candidate) => candidate.wins > candidate.losses);
    const losers = divisionCandidates.filter((candidate) => candidate.wins < candidate.losses);
    for (const winner of winners) {
      const winnerSlot = assignedById.get(winner.id);
      if (!winnerSlot) continue;
      for (const loser of losers) {
        const loserSlot = assignedById.get(loser.id);
        if (!loserSlot) continue;
        if (winnerSlot > loserSlot) {
          violations.push({ winner, loser });
        }
      }
    }
  }

  return violations;
};

export const reallocateWithMonotonicConstraints = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
  maxIterations = 6,
): ExpectedPlacementAssignment[] => {
  const working = candidates.map((candidate) => ({ ...candidate }));
  let assignments = allocateExpectedSlots(working, totalSlots);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const assignedById = new Map(assignments.map((assignment) => [assignment.id, assignment.slot]));
    const violations = findViolations(working, assignedById);
    if (!violations.length) break;

    for (const { winner, loser } of violations) {
      const winnerCandidate = working.find((candidate) => candidate.id === winner.id);
      const loserCandidate = working.find((candidate) => candidate.id === loser.id);
      if (!winnerCandidate || !loserCandidate) continue;
      winnerCandidate.score += 80;
      loserCandidate.score -= 80;
    }
    assignments = allocateExpectedSlots(working, totalSlots);
  }

  return assignments;
};
