import { Division, Rank } from '../../models';

const DEFAULT_SLOTS: Record<Exclude<Division, 'Maezumo'>, number> = {
  Makuuchi: 42,
  Juryo: 28,
  Makushita: 120,
  Sandanme: 180,
  Jonidan: 200,
  Jonokuchi: 60,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const maxNumber = (division: Division, slots: number): number => {
  if (division === 'Maezumo') return 1;
  return Math.max(1, Math.ceil(Math.max(1, slots) / 2));
};

export const resolveDivisionSlots = (
  division: Division,
  slotsByDivision?: Partial<Record<Exclude<Division, 'Maezumo'>, number>>,
): number => {
  if (division === 'Maezumo') return 1;
  const resolved = slotsByDivision?.[division];
  return Math.max(1, Math.floor(resolved ?? DEFAULT_SLOTS[division]));
};

export const rankNumberSideToSlot = (
  number: number,
  side: 'East' | 'West' | undefined,
  slots: number,
): number => {
  const max = maxNumber('Juryo', slots);
  const n = clamp(Math.floor(number), 1, max);
  const sideOffset = side === 'West' ? 1 : 0;
  return clamp(1 + (n - 1) * 2 + sideOffset, 1, Math.max(1, slots));
};

export const slotToRankNumberSide = (
  slot: number,
  slots: number,
): { number: number; side: 'East' | 'West' } => {
  const bounded = clamp(Math.floor(slot), 1, Math.max(1, slots));
  return {
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

export const clampRankToSlots = (
  rank: Rank,
  slotsByDivision?: Partial<Record<Exclude<Division, 'Maezumo'>, number>>,
): Rank => {
  if (rank.division === 'Maezumo') return rank;
  const slots = resolveDivisionSlots(rank.division, slotsByDivision);
  const maximum = maxNumber(rank.division, slots);
  const slot = rankNumberSideToSlot(rank.number ?? 1, rank.side, slots);
  const normalized = slotToRankNumberSide(slot, slots);
  return {
    ...rank,
    number: clamp(rank.number ?? normalized.number, 1, maximum),
    side: rank.side ?? normalized.side,
  };
};

