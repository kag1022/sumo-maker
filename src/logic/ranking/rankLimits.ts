import { Division } from '../models';
import { maxNumber, resolveDivisionSlots } from '../banzuke/scale/rankScale';

type RankedDivision = Exclude<Division, 'Maezumo'>;

export type RankScaleSlots = Partial<Record<RankedDivision, number>>;

export type RankLimits = {
  MAEGASHIRA_MAX: number;
  JURYO_MAX: number;
  MAKUSHITA_MAX: number;
  SANDANME_MAX: number;
  JONIDAN_MAX: number;
  JONOKUCHI_MAX: number;
};

export const DEFAULT_SCALE_SLOTS: Record<RankedDivision, number> = {
  Makuuchi: 42,
  Juryo: 28,
  Makushita: 120,
  Sandanme: 180,
  Jonidan: 200,
  Jonokuchi: 60,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveMaegashiraMax = (makuuchiSlots: number): number => {
  const usable = Math.max(2, makuuchiSlots - 8);
  return Math.max(1, Math.floor(usable / 2));
};

export const resolveScaleSlots = (
  scaleSlots?: RankScaleSlots,
): Record<RankedDivision, number> => ({
  Makuuchi: resolveDivisionSlots('Makuuchi', scaleSlots) || DEFAULT_SCALE_SLOTS.Makuuchi,
  Juryo: resolveDivisionSlots('Juryo', scaleSlots) || DEFAULT_SCALE_SLOTS.Juryo,
  Makushita: resolveDivisionSlots('Makushita', scaleSlots) || DEFAULT_SCALE_SLOTS.Makushita,
  Sandanme: resolveDivisionSlots('Sandanme', scaleSlots) || DEFAULT_SCALE_SLOTS.Sandanme,
  Jonidan: resolveDivisionSlots('Jonidan', scaleSlots) || DEFAULT_SCALE_SLOTS.Jonidan,
  Jonokuchi: resolveDivisionSlots('Jonokuchi', scaleSlots) || DEFAULT_SCALE_SLOTS.Jonokuchi,
});

export const resolveRankLimits = (scaleSlots?: RankScaleSlots): RankLimits => {
  const slots = resolveScaleSlots(scaleSlots);
  return {
    MAEGASHIRA_MAX: resolveMaegashiraMax(slots.Makuuchi),
    JURYO_MAX: maxNumber('Juryo', slots.Juryo),
    MAKUSHITA_MAX: maxNumber('Makushita', slots.Makushita),
    SANDANME_MAX: maxNumber('Sandanme', slots.Sandanme),
    JONIDAN_MAX: maxNumber('Jonidan', slots.Jonidan),
    JONOKUCHI_MAX: maxNumber('Jonokuchi', slots.Jonokuchi),
  };
};

export const LIMITS: RankLimits = resolveRankLimits();

export const resolveRankSlotOffset = (scaleSlots?: RankScaleSlots) => {
  const limits = resolveRankLimits(scaleSlots);
  return {
    Makuuchi: 0,
    Juryo: 8 + limits.MAEGASHIRA_MAX * 2,
    Makushita: 8 + (limits.MAEGASHIRA_MAX + limits.JURYO_MAX) * 2,
    Sandanme: 8 + (limits.MAEGASHIRA_MAX + limits.JURYO_MAX + limits.MAKUSHITA_MAX) * 2,
    Jonidan: 8 + (limits.MAEGASHIRA_MAX + limits.JURYO_MAX + limits.MAKUSHITA_MAX + limits.SANDANME_MAX) * 2,
    Jonokuchi: 8 + (limits.MAEGASHIRA_MAX + limits.JURYO_MAX + limits.MAKUSHITA_MAX + limits.SANDANME_MAX + limits.JONIDAN_MAX) * 2,
    Maezumo: 8 + (limits.MAEGASHIRA_MAX + limits.JURYO_MAX + limits.MAKUSHITA_MAX + limits.SANDANME_MAX + limits.JONIDAN_MAX + limits.JONOKUCHI_MAX) * 2,
  } as const;
};

export const RANK_SLOT_OFFSET = resolveRankSlotOffset();

export type LowerDivisionKey = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';

export type LowerDivisionSpec = {
  division: LowerDivisionKey;
  name: string;
  max: number;
};

export const resolveLowerDivisionOrder = (scaleSlots?: RankScaleSlots): LowerDivisionSpec[] => {
  const limits = resolveRankLimits(scaleSlots);
  return [
    { division: 'Makushita', name: '幕下', max: limits.MAKUSHITA_MAX },
    { division: 'Sandanme', name: '三段目', max: limits.SANDANME_MAX },
    { division: 'Jonidan', name: '序二段', max: limits.JONIDAN_MAX },
    { division: 'Jonokuchi', name: '序ノ口', max: limits.JONOKUCHI_MAX },
  ];
};

export const resolveLowerDivisionOffset = (
  scaleSlots?: RankScaleSlots,
): Record<LowerDivisionKey, number> => {
  const limits = resolveRankLimits(scaleSlots);
  return {
    Makushita: 0,
    Sandanme: limits.MAKUSHITA_MAX * 2,
    Jonidan: (limits.MAKUSHITA_MAX + limits.SANDANME_MAX) * 2,
    Jonokuchi: (limits.MAKUSHITA_MAX + limits.SANDANME_MAX + limits.JONIDAN_MAX) * 2,
  };
};

export const resolveLowerDivisionTotal = (scaleSlots?: RankScaleSlots): number => {
  const limits = resolveRankLimits(scaleSlots);
  return (limits.MAKUSHITA_MAX + limits.SANDANME_MAX + limits.JONIDAN_MAX + limits.JONOKUCHI_MAX) * 2;
};

export const resolveLowerDivisionMax = (
  scaleSlots?: RankScaleSlots,
): Record<LowerDivisionKey, number> => {
  const limits = resolveRankLimits(scaleSlots);
  return {
    Makushita: limits.MAKUSHITA_MAX,
    Sandanme: limits.SANDANME_MAX,
    Jonidan: limits.JONIDAN_MAX,
    Jonokuchi: limits.JONOKUCHI_MAX,
  };
};

export const LOWER_DIVISION_ORDER: LowerDivisionSpec[] = resolveLowerDivisionOrder();

export const LOWER_DIVISION_OFFSET: Record<LowerDivisionKey, number> = resolveLowerDivisionOffset();

export const LOWER_DIVISION_TOTAL = resolveLowerDivisionTotal();

export const LOWER_DIVISION_MAX: Record<LowerDivisionKey, number> = resolveLowerDivisionMax();

export const clampLowerRankNumber = (
  division: LowerDivisionKey,
  number: number,
  scaleSlots?: RankScaleSlots,
): number => clamp(Math.floor(number), 1, resolveLowerDivisionMax(scaleSlots)[division]);
