import type { Division } from '../../models';

export type BashoFormatKind = 'SEKITORI_15' | 'LOWER_7';

export interface BashoFormatPolicy {
  kind: BashoFormatKind;
  totalBouts: 15 | 7;
  majorityWins: 8 | 4;
  calendarDays: 15;
  usesSparseBoutSchedule: boolean;
  momentumScale: number;
  regressionScale: number;
  maxRegressionAdjustment: number;
}

export interface BoutOrdinalContext {
  calendarDay: number;
  boutOrdinal: number;
  totalBouts: 15 | 7;
  isFinalBout: boolean;
  remainingBouts: number;
}

export interface BoutPressureContext {
  isKachikoshiDecider: boolean;
  isMakekoshiDecider: boolean;
  isKachiMakeDecider: boolean;
  isYushoRelevant: boolean;
  isPromotionRelevant: boolean;
  isDemotionRelevant: boolean;
  isFinalBout: boolean;
}

export interface BoutPressureImplications {
  isYushoRelevant?: boolean;
  titleImplication?: 'DIRECT' | 'CHASE' | 'NONE';
  boundaryImplication?: 'PROMOTION' | 'DEMOTION' | 'NONE';
}

const SEKITORI_15_POLICY: BashoFormatPolicy = {
  kind: 'SEKITORI_15',
  totalBouts: 15,
  majorityWins: 8,
  calendarDays: 15,
  usesSparseBoutSchedule: false,
  momentumScale: 1,
  regressionScale: 1,
  maxRegressionAdjustment: 0,
};

const LOWER_7_POLICY: BashoFormatPolicy = {
  kind: 'LOWER_7',
  totalBouts: 7,
  majorityWins: 4,
  calendarDays: 15,
  usesSparseBoutSchedule: true,
  momentumScale: 1,
  regressionScale: 1,
  maxRegressionAdjustment: 0,
};

export const resolveBashoFormatPolicy = (
  division: Division,
): BashoFormatPolicy | null => {
  if (division === 'Makuuchi' || division === 'Juryo') return SEKITORI_15_POLICY;
  if (
    division === 'Makushita' ||
    division === 'Sandanme' ||
    division === 'Jonidan' ||
    division === 'Jonokuchi'
  ) {
    return LOWER_7_POLICY;
  }
  return null;
};

export const createBoutOrdinalContext = ({
  calendarDay,
  boutOrdinal,
  totalBouts,
}: {
  calendarDay: number;
  boutOrdinal: number;
  totalBouts: 15 | 7;
}): BoutOrdinalContext => ({
  calendarDay,
  boutOrdinal,
  totalBouts,
  isFinalBout: boutOrdinal >= totalBouts,
  remainingBouts: Math.max(0, totalBouts - boutOrdinal),
});

export const createBoutPressureContext = (
  policy: BashoFormatPolicy,
  ordinal: BoutOrdinalContext,
  currentWins: number,
  currentLosses: number,
  implications: BoutPressureImplications = {},
): BoutPressureContext => {
  const isKachikoshiDecider = currentWins === policy.majorityWins - 1;
  const isMakekoshiDecider = currentLosses === policy.totalBouts - policy.majorityWins;
  const isKachiMakeDecider = isKachikoshiDecider || isMakekoshiDecider;
  const isYushoRelevant = Boolean(
    implications.isYushoRelevant ||
    implications.titleImplication === 'DIRECT' ||
    implications.titleImplication === 'CHASE',
  );
  return {
    isKachikoshiDecider,
    isMakekoshiDecider,
    isKachiMakeDecider,
    isYushoRelevant,
    isPromotionRelevant: implications.boundaryImplication === 'PROMOTION',
    isDemotionRelevant: implications.boundaryImplication === 'DEMOTION',
    isFinalBout: ordinal.isFinalBout,
  };
};
