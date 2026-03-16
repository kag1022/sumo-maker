import { CareerBand, Rank, RatingState } from '../../models';
import { UNIFIED_V1_BALANCE } from '../../balance/unifiedV1';
import { resolveRankBaselineAbility } from './model';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const updateAbilityAfterBasho = (input: {
  current: RatingState;
  actualWins: number;
  expectedWins: number;
  age: number;
  careerBashoCount: number;
  currentRank: Rank;
  careerBand?: CareerBand;
  stagnationPressure?: number;
}): RatingState => {
  const { current, actualWins, expectedWins, age, careerBashoCount, currentRank, careerBand, stagnationPressure } = input;
  let delta = actualWins - expectedWins;
  const pressure = Math.max(0, stagnationPressure ?? 0);
  const isSekitori = currentRank.division === 'Makuuchi' || currentRank.division === 'Juryo';
  const alreadyWinningExpectation = expectedWins >= (isSekitori ? 8.2 : 4.4);
  const positiveBandFactor =
    careerBand === 'ELITE'
      ? 0.98
      : careerBand === 'STRONG'
        ? 0.95
        : careerBand === 'GRINDER'
          ? 0.8
          : careerBand === 'WASHOUT'
            ? 0.62
            : 1;
  const negativeBandFactor =
    careerBand === 'ELITE'
      ? 1.02
      : careerBand === 'STRONG'
        ? 1.05
        : careerBand === 'GRINDER'
          ? 1.16
          : careerBand === 'WASHOUT'
            ? 1.3
            : 1;
  if (delta > 0) {
    delta *= clamp(
      (1 - pressure * 0.18) *
        positiveBandFactor *
        (alreadyWinningExpectation ? 0.7 : 1) *
        (isSekitori ? 0.82 : 0.92),
      0.28,
      1.02,
    );
  } else if (delta < 0) {
    delta *= clamp(
      (1 + pressure * 0.18) *
        negativeBandFactor *
        (alreadyWinningExpectation ? 1.08 : 1) *
        (isSekitori ? 1.08 : 1.02),
      0.96,
      1.72,
    );
  }
  const experienceFactor = Math.max(
    0.65,
    1 - careerBashoCount * UNIFIED_V1_BALANCE.ratingUpdate.experienceUncertaintyDecay * 0.1,
  );
  const youthFactor =
    age <= UNIFIED_V1_BALANCE.ratingUpdate.youthBoostAge
      ? UNIFIED_V1_BALANCE.ratingUpdate.youthBoost
      : 1;
  const k =
    UNIFIED_V1_BALANCE.ratingUpdate.baseK *
    (1 + (current.uncertainty - 1) * UNIFIED_V1_BALANCE.ratingUpdate.uncertaintyK * 0.25) *
    experienceFactor *
    youthFactor;
  const baselineAbility = resolveRankBaselineAbility(currentRank);
  const rawAbility = current.ability + delta * k;
  const meanReversion = clamp(
    UNIFIED_V1_BALANCE.ratingUpdate.meanReversionToRankBaseline +
      (isSekitori ? 0.012 : 0.02) +
      Math.max(0, pressure - 1) * 0.01 +
      (careerBand === 'WASHOUT' ? 0.018 : careerBand === 'GRINDER' ? 0.01 : 0),
    0.02,
    0.08,
  );
  const nextAbility = rawAbility * (1 - meanReversion) + baselineAbility * meanReversion;
  const nextUncertainty = clamp(
    current.uncertainty - UNIFIED_V1_BALANCE.ratingUpdate.experienceUncertaintyDecay,
    UNIFIED_V1_BALANCE.ratingUpdate.minUncertainty,
    UNIFIED_V1_BALANCE.ratingUpdate.maxUncertainty,
  );

  return {
    ability: nextAbility,
    form: clamp(current.form * 0.82 + (delta / 15) * 0.18, -1.2, 1.2),
    uncertainty: nextUncertainty,
    lastBashoExpectedWins: expectedWins,
  };
};
