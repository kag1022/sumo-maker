import { CareerBand, CareerSeedBiases, Rank, RatingState } from '../../models';
import { BALANCE } from '../../balance';
import { applyPlayerEmpiricalProgressClamp } from '../playerRealism';
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
  maxRank: Rank;
  absent: number;
  careerBand?: CareerBand;
  stagnationPressure?: number;
  careerSeedBiases?: CareerSeedBiases;
}): RatingState => {
  const { current, actualWins, expectedWins, age, careerBashoCount, currentRank, maxRank, absent, careerBand, stagnationPressure, careerSeedBiases } = input;
  let delta = actualWins - expectedWins;
  const pressure = Math.max(0, stagnationPressure ?? 0);
  const isSekitori = currentRank.division === 'Makuuchi' || currentRank.division === 'Juryo';
  const alreadyWinningExpectation = expectedWins >= (isSekitori ? 8.2 : 4.4);
  const volatilityBias = careerSeedBiases?.volatilityBias ?? 0;
  const reboundBias = careerSeedBiases?.reboundBias ?? 0;
  const clutchBias = careerSeedBiases?.clutchBias ?? 0;
  const slumpResistanceBias = careerSeedBiases?.slumpResistanceBias ?? 0;
  const positiveBandFactor =
    careerBand === 'ELITE'
      ? 0.98
      : careerBand === 'STRONG'
        ? 0.95
        : careerBand === 'GRINDER'
          ? 0.88
          : careerBand === 'WASHOUT'
            ? 0.74
            : 1;
  const negativeBandFactor =
    careerBand === 'ELITE'
      ? 1.02
      : careerBand === 'STRONG'
        ? 1.05
        : careerBand === 'GRINDER'
          ? 1.1
          : careerBand === 'WASHOUT'
            ? 1.18
            : 1;
  if (delta > 0) {
    delta *= clamp(
      (1 - pressure * 0.18) *
        positiveBandFactor *
        (1 + reboundBias * 0.05 + clutchBias * 0.04) *
        (alreadyWinningExpectation ? 0.7 : 1) *
        (isSekitori ? 0.82 : 0.92),
      0.28,
      1.02,
    );
  } else if (delta < 0) {
    delta *= clamp(
      (1 + pressure * 0.18) *
        negativeBandFactor *
        (1 + volatilityBias * 0.06 - slumpResistanceBias * 0.05) *
        (alreadyWinningExpectation ? 1.08 : 1) *
        (isSekitori ? 1.08 : 1.02),
      0.96,
      1.72,
    );
  }
  const experienceFactor = Math.max(
    0.65,
    1 - careerBashoCount * BALANCE.ratingUpdate.experienceUncertaintyDecay * 0.1,
  );
  const youthFactor =
    age <= BALANCE.ratingUpdate.youthBoostAge
      ? BALANCE.ratingUpdate.youthBoost
      : 1;
  const k =
    BALANCE.ratingUpdate.baseK *
    (1 + (current.uncertainty - 1) * BALANCE.ratingUpdate.uncertaintyK * 0.25) *
    experienceFactor *
    youthFactor *
    Math.max(0.88, 1 + (careerSeedBiases?.styleSettlingBias ?? 0) * 0.03);
  const baselineAbility = resolveRankBaselineAbility(currentRank);
  const rawAbility = current.ability + delta * k;
  const meanReversion = clamp(
      BALANCE.ratingUpdate.meanReversionToRankBaseline +
      (isSekitori ? 0.012 : 0.02) +
      Math.max(0, pressure - 1) * 0.01 +
      (careerBand === 'WASHOUT' ? 0.012 : careerBand === 'GRINDER' ? 0.006 : 0),
    0.02,
    0.08,
  );
  const nextAbility = rawAbility * (1 - meanReversion) + baselineAbility * meanReversion;
  const nextUncertainty = clamp(
    current.uncertainty - BALANCE.ratingUpdate.experienceUncertaintyDecay,
    BALANCE.ratingUpdate.minUncertainty,
    BALANCE.ratingUpdate.maxUncertainty,
  );

  const nextState = {
    ability: nextAbility,
    form: clamp(current.form * (0.82 + volatilityBias * 0.01) + (delta / 15) * (0.18 + clutchBias * 0.01), -1.2, 1.2),
    uncertainty: nextUncertainty,
    lastBashoExpectedWins: expectedWins,
  };
  return applyPlayerEmpiricalProgressClamp({
    current,
    next: nextState,
    age,
    careerBashoCount,
    currentRank,
    absent,
    maxRank,
  });
};
