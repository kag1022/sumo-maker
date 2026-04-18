import { BanzukeCandidate, SekitoriDeltaBand, SekitoriZone } from './types';

const resolveSekitoriZone = (candidate: BanzukeCandidate): SekitoriZone => {
  const rank = candidate.snapshot.rank;
  if (rank.division === 'Juryo') return 'Juryo';
  if (rank.name !== '前頭') return 'MakuuchiTop';
  const num = rank.number ?? 17;
  return num <= 5 ? 'MakuuchiTop' : 'MakuuchiMidLow';
};

export const resolveSekitoriDeltaBand = (candidate: BanzukeCandidate): SekitoriDeltaBand => {
  if (candidate.orderProfile) {
    const minSlotDelta = candidate.currentSlot - candidate.orderProfile.maxSlot;
    const maxSlotDelta = candidate.currentSlot - candidate.orderProfile.minSlot;
    return {
      zone: resolveSekitoriZone(candidate),
      minSlotDelta: Math.min(minSlotDelta, maxSlotDelta),
      maxSlotDelta: Math.max(minSlotDelta, maxSlotDelta),
    };
  }

  const losses = candidate.normalizedLosses;
  const diff = candidate.snapshot.wins - losses;
  const rise = diff > 0 ? diff * 2 : 0;
  const drop = diff < 0 ? Math.abs(diff) * 3 : 0;
  const maxSlotDelta =
    candidate.snapshot.absent >= 15 && drop > 0
      ? -Math.max(1, Math.ceil(drop / 3))
      : rise;
  return {
    zone: resolveSekitoriZone(candidate),
    minSlotDelta: -drop,
    maxSlotDelta,
  };
};

export const resolveSekitoriPreferredSlot = (
  candidate: BanzukeCandidate,
  band: SekitoriDeltaBand,
): number => {
  if (candidate.orderProfile) return candidate.orderProfile.targetSlot;
  const preferredDelta = Math.round((band.minSlotDelta + band.maxSlotDelta) / 2);
  return candidate.currentSlot - preferredDelta;
};

export const resolveBandSlotBounds = (
  currentSlot: number,
  band: SekitoriDeltaBand,
): { minSlot: number; maxSlot: number } => {
  const a = currentSlot - band.minSlotDelta;
  const b = currentSlot - band.maxSlotDelta;
  return { minSlot: Math.min(a, b), maxSlot: Math.max(a, b) };
};

export const resolveRequiredSekitoriDemotionSlots = (candidate: BanzukeCandidate): number => {
  const band = resolveSekitoriDeltaBand(candidate);
  return Math.max(0, -band.maxSlotDelta);
};
