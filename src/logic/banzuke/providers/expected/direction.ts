import { ExpectedPlacementCandidate } from './types';

export const resolveEffectiveLosses = (candidate: ExpectedPlacementCandidate): number =>
  candidate.losses + candidate.absent;

export const shouldEnforceRecordDirection = (
  candidate: ExpectedPlacementCandidate,
): boolean => {
  const effectiveLosses = resolveEffectiveLosses(candidate);
  if (candidate.wins > effectiveLosses) {
    return candidate.expectedSlot <= candidate.currentSlot;
  }
  if (candidate.wins < effectiveLosses) {
    return candidate.expectedSlot >= candidate.currentSlot;
  }
  return true;
};
