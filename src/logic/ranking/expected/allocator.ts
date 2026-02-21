import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from './types';

const sortCandidatesForPlacement = (
  candidates: ExpectedPlacementCandidate[],
): ExpectedPlacementCandidate[] =>
  candidates.slice().sort((a, b) => {
    const aPriority = a.mandatoryPromotion ? 0 : a.mandatoryDemotion ? 2 : 1;
    const bPriority = b.mandatoryPromotion ? 0 : b.mandatoryDemotion ? 2 : 1;
    if (aPriority !== bPriority) return aPriority - bPriority;
    if (b.score !== a.score) return b.score - a.score;
    if (a.expectedSlot !== b.expectedSlot) return a.expectedSlot - b.expectedSlot;
    return a.id.localeCompare(b.id);
  });

const resolveSlotCost = (candidate: ExpectedPlacementCandidate, slot: number): number => {
  const outside =
    slot < candidate.minSlot
      ? candidate.minSlot - slot
      : slot > candidate.maxSlot
        ? slot - candidate.maxSlot
        : 0;
  const distance = Math.abs(slot - candidate.expectedSlot);
  let cost = outside * 140 + distance * 2;

  if (candidate.mandatoryDemotion && slot <= candidate.currentSlot) {
    cost += 2400 + (candidate.currentSlot - slot) * 45;
  }
  if (candidate.mandatoryPromotion && slot >= candidate.currentSlot) {
    cost += 2400 + (slot - candidate.currentSlot) * 45;
  }
  if (candidate.wins > candidate.losses && slot > candidate.currentSlot) {
    cost += 900 + (slot - candidate.currentSlot) * 18;
  }
  if (candidate.wins < candidate.losses && slot < candidate.currentSlot) {
    cost += 1300 + (candidate.currentSlot - slot) * 22;
  }

  return cost;
};

const pickBestSlot = (
  candidate: ExpectedPlacementCandidate,
  availableSlots: number[],
): number => {
  let best = availableSlots[0];
  let bestCost = Number.POSITIVE_INFINITY;
  for (const slot of availableSlots) {
    const cost = resolveSlotCost(candidate, slot);
    if (cost < bestCost || (cost === bestCost && slot < best)) {
      best = slot;
      bestCost = cost;
    }
  }
  return best;
};

export const allocateExpectedSlots = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
): ExpectedPlacementAssignment[] => {
  if (!candidates.length || totalSlots <= 0) return [];

  const availableSlots: number[] = Array.from({ length: totalSlots }, (_, index) => index + 1);
  const assignments: ExpectedPlacementAssignment[] = [];
  for (const candidate of sortCandidatesForPlacement(candidates)) {
    if (!availableSlots.length) break;
    const slot = pickBestSlot(candidate, availableSlots);
    assignments.push({ id: candidate.id, slot });
    const idx = availableSlots.indexOf(slot);
    if (idx >= 0) {
      availableSlots.splice(idx, 1);
    }
  }

  return assignments;
};
