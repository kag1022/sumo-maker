import { Rank } from '../../models';
import {
  DEFAULT_MAKUUCHI_LAYOUT,
  JURYO_CAPACITY,
  MAKUUCHI_CAPACITY,
  MakuuchiLayout,
  decodeMakuuchiRankFromScore,
  encodeMakuuchiRankToScore,
} from '../banzukeLayout';
import { SekitoriDivision } from './types';

const LIMITS = {
  JURYO_MAX: 14,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const SEKITORI_CAPACITY = {
  Makuuchi: MAKUUCHI_CAPACITY,
  Juryo: JURYO_CAPACITY,
} as const;

export const isSekitoriDivision = (division: Rank['division']): division is SekitoriDivision =>
  division === 'Makuuchi' || division === 'Juryo';

export const toMakuuchiSlot = (
  rank: Rank,
  layout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): number => encodeMakuuchiRankToScore(rank, layout);

export const toJuryoSlot = (rank: Rank): number => {
  const number = clamp(rank.number || 14, 1, LIMITS.JURYO_MAX);
  const sideOffset = rank.side === 'West' ? 1 : 0;
  return 1 + (number - 1) * 2 + sideOffset;
};

export const toSekitoriSlot = (
  rank: Rank,
  layout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): number => {
  if (rank.division === 'Makuuchi') return toMakuuchiSlot(rank, layout);
  return SEKITORI_CAPACITY.Makuuchi + toJuryoSlot(rank);
};

export const fromMakuuchiSlot = (
  slot: number,
  layout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): Rank => decodeMakuuchiRankFromScore(slot, layout);

export const fromJuryoSlot = (slot: number): Rank => {
  const bounded = clamp(slot, 1, SEKITORI_CAPACITY.Juryo);
  return {
    division: 'Juryo',
    name: '十両',
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

export const fromSekitoriSlot = (
  slot: number,
  layout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): Rank => {
  const bounded = clamp(slot, 1, SEKITORI_CAPACITY.Makuuchi + SEKITORI_CAPACITY.Juryo);
  if (bounded <= SEKITORI_CAPACITY.Makuuchi) return fromMakuuchiSlot(bounded, layout);
  return fromJuryoSlot(bounded - SEKITORI_CAPACITY.Makuuchi);
};
