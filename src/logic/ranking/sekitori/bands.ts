import { Rank } from '../../models';
import { normalizeSekitoriLosses } from '../topDivisionRules';
import { BanzukeCandidate, BashoRecordSnapshot, SekitoriDeltaBand, SekitoriZone } from './types';

const LIMITS = {
  MAEGASHIRA_MAX: 17,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const normalizeBand = (minSlotDelta: number, maxSlotDelta: number): SekitoriDeltaBand => ({
  zone: 'MakuuchiMidLow',
  minSlotDelta: Math.min(minSlotDelta, maxSlotDelta),
  maxSlotDelta: Math.max(minSlotDelta, maxSlotDelta),
});

const interpolateAnchors = (
  value: number,
  left: { x: number; min: number; max: number },
  right: { x: number; min: number; max: number },
): { min: number; max: number } => {
  if (right.x <= left.x) return { min: left.min, max: left.max };
  const t = clamp((value - left.x) / (right.x - left.x), 0, 1);
  return {
    min: Math.round(left.min + (right.min - left.min) * t),
    max: Math.round(left.max + (right.max - left.max) * t),
  };
};

const resolveBaseSekitoriBand = (diff: number): { minSlotDelta: number; maxSlotDelta: number } => {
  if (diff === 0) return { minSlotDelta: 0, maxSlotDelta: 0 };
  if (diff > 0) {
    const up = clamp(diff, 1, 15);
    if (up === 1) return { minSlotDelta: 2, maxSlotDelta: 3 };
    if (up <= 5) {
      const band = interpolateAnchors(
        up,
        { x: 1, min: 2, max: 3 },
        { x: 5, min: 8, max: 12 },
      );
      return { minSlotDelta: band.min, maxSlotDelta: band.max };
    }
    if (up <= 9) {
      const band = interpolateAnchors(
        up,
        { x: 5, min: 8, max: 12 },
        { x: 9, min: 16, max: 20 },
      );
      return { minSlotDelta: band.min, maxSlotDelta: band.max };
    }
    const band = interpolateAnchors(
      up,
      { x: 9, min: 16, max: 20 },
      { x: 15, min: 28, max: 34 },
    );
    return { minSlotDelta: band.min, maxSlotDelta: band.max };
  }

  const down = clamp(Math.abs(diff), 1, 15);
  if (down === 1) return { minSlotDelta: -4, maxSlotDelta: -3 };
  if (down <= 5) {
    const band = interpolateAnchors(
      down,
      { x: 1, min: -4, max: -3 },
      { x: 5, min: -16, max: -12 },
    );
    return { minSlotDelta: band.min, maxSlotDelta: band.max };
  }
  if (down <= 9) {
    const band = interpolateAnchors(
      down,
      { x: 5, min: -16, max: -12 },
      { x: 9, min: -28, max: -22 },
    );
    return { minSlotDelta: band.min, maxSlotDelta: band.max };
  }
  const band = interpolateAnchors(
    down,
    { x: 9, min: -28, max: -22 },
    { x: 15, min: -44, max: -36 },
  );
  return { minSlotDelta: band.min, maxSlotDelta: band.max };
};

const resolveSekitoriZone = (rank: Rank): SekitoriZone => {
  if (rank.division === 'Juryo') return 'Juryo';
  if (rank.name !== '前頭') return 'MakuuchiTop';
  const num = clamp(rank.number || 17, 1, LIMITS.MAEGASHIRA_MAX);
  return num <= 5 ? 'MakuuchiTop' : 'MakuuchiMidLow';
};

export const resolveSekitoriDeltaBand = (record: BashoRecordSnapshot): SekitoriDeltaBand => {
  const losses = normalizeSekitoriLosses(record.wins, record.losses, record.absent);
  const diff = record.wins - losses;
  const zone = resolveSekitoriZone(record.rank);

  if (record.wins === 0 && record.losses === 0 && record.absent >= 15) {
    return { zone, minSlotDelta: -30, maxSlotDelta: -30 };
  }

  const base = resolveBaseSekitoriBand(diff);

  if (zone !== 'MakuuchiTop') {
    return {
      zone,
      minSlotDelta: base.minSlotDelta,
      maxSlotDelta: base.maxSlotDelta,
    };
  }

  if (record.rank.name === '前頭' && (record.rank.number || 99) <= 5 && diff === 1) {
    return { zone, minSlotDelta: 1, maxSlotDelta: 2 };
  }

  let minSlotDelta = base.minSlotDelta;
  let maxSlotDelta = base.maxSlotDelta;
  if (diff >= 2) {
    minSlotDelta = Math.max(1, Math.floor(minSlotDelta * 0.85));
    maxSlotDelta = Math.max(minSlotDelta, Math.floor(maxSlotDelta * 0.9));
  } else if (diff <= -2) {
    minSlotDelta = Math.floor(minSlotDelta * 1.25);
    maxSlotDelta = Math.floor(maxSlotDelta * 1.2);
  }

  const normalized = normalizeBand(minSlotDelta, maxSlotDelta);
  return { zone, minSlotDelta: normalized.minSlotDelta, maxSlotDelta: normalized.maxSlotDelta };
};

export const resolveSekitoriPreferredSlot = (
  candidate: BanzukeCandidate,
  band: SekitoriDeltaBand,
): number => {
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
  const band = resolveSekitoriDeltaBand(candidate.snapshot);
  return Math.max(0, -band.maxSlotDelta);
};
