import { clamp } from '../../simulation/boundary/shared';

export interface ExpectedSlotRangeByWinsSpec {
  min: number;
  max: number;
  sign: 1 | -1;
}

export interface ExpectedSlotBandInput {
  currentSlot: number;
  wins: number;
  losses: number;
  absent: number;
  totalSlots: number;
  rankProgress?: number;
  slotRangeByWins?: Partial<Record<number, ExpectedSlotRangeByWinsSpec>>;
  mandatoryDemotion?: boolean;
  mandatoryPromotion?: boolean;
}

export interface ExpectedSlotBand {
  expectedSlot: number;
  minSlot: number;
  maxSlot: number;
}

const resolveBaseShift = (wins: number, losses: number, absent: number): number => {
  const diff = wins - losses;
  const performanceShift = Math.round(Math.abs(diff) * 2.2 + Math.max(wins, losses) * 0.45);
  const absenceShift = absent > 0 ? Math.round(absent * 0.8) : 0;
  if (diff > 0) return -(performanceShift + Math.floor(absenceShift * 0.25));
  if (diff < 0) return performanceShift + absenceShift;
  return 0;
};

const resolveRangeShift = (
  wins: number,
  rankProgress: number,
  slotRangeByWins?: Partial<Record<number, ExpectedSlotRangeByWinsSpec>>,
): number | undefined => {
  if (!slotRangeByWins) return undefined;
  const spec = slotRangeByWins[wins];
  if (!spec) return undefined;
  const progress = clamp(rankProgress, 0, 1);
  const intensity = spec.sign > 0 ? progress : 1 - progress;
  const magnitude = Math.round(spec.min + (spec.max - spec.min) * intensity);
  // Global slot system: smaller slot means promotion.
  // Range table uses sign=+1 for promotion and sign=-1 for demotion (same as lowerDivision delta),
  // so we invert here when converting into slot shift.
  return spec.sign > 0 ? -magnitude : magnitude;
};

export const resolveExpectedSlotBand = (
  input: ExpectedSlotBandInput,
): ExpectedSlotBand => {
  const {
    currentSlot,
    wins,
    losses,
    absent,
    totalSlots,
    rankProgress = 0.5,
    slotRangeByWins,
    mandatoryDemotion = false,
    mandatoryPromotion = false,
  } = input;
  const shift =
    resolveRangeShift(wins, rankProgress, slotRangeByWins) ??
    resolveBaseShift(wins, losses, absent);
  let expected = clamp(currentSlot + shift, 1, totalSlots);
  const absDiff = Math.abs(wins - losses);
  const bandRadius =
    slotRangeByWins
      ? Math.max(6, Math.round(Math.abs(shift) * 0.2))
      : Math.max(2, 8 - Math.min(6, absDiff));
  let minSlot = clamp(expected - bandRadius, 1, totalSlots);
  let maxSlot = clamp(expected + bandRadius, 1, totalSlots);

  if (mandatoryDemotion) {
    const demotionFloor = clamp(currentSlot + Math.max(2, Math.floor(totalSlots * 0.015)), 1, totalSlots);
    expected = Math.max(expected, demotionFloor);
    minSlot = Math.max(minSlot, currentSlot + 1);
    maxSlot = Math.max(maxSlot, expected);
  }
  if (mandatoryPromotion) {
    const promotionCeiling = clamp(currentSlot - Math.max(2, Math.floor(totalSlots * 0.015)), 1, totalSlots);
    expected = Math.min(expected, promotionCeiling);
    maxSlot = Math.min(maxSlot, currentSlot - 1);
    minSlot = Math.min(minSlot, expected);
  }

  return {
    expectedSlot: clamp(expected, 1, totalSlots),
    minSlot: clamp(Math.min(minSlot, maxSlot), 1, totalSlots),
    maxSlot: clamp(Math.max(minSlot, maxSlot), 1, totalSlots),
  };
};
