import { RatingState } from '../../models';
import { REALISM_V1_BALANCE } from '../../balance/realismV1';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const updateAbilityAfterBasho = (input: {
  current: RatingState;
  actualWins: number;
  expectedWins: number;
  age: number;
  careerBashoCount: number;
}): RatingState => {
  const { current, actualWins, expectedWins, age, careerBashoCount } = input;
  const delta = actualWins - expectedWins;
  const experienceFactor = Math.max(
    0.65,
    1 - careerBashoCount * REALISM_V1_BALANCE.ratingUpdate.experienceUncertaintyDecay * 0.1,
  );
  const youthFactor =
    age <= REALISM_V1_BALANCE.ratingUpdate.youthBoostAge
      ? REALISM_V1_BALANCE.ratingUpdate.youthBoost
      : 1;
  const k =
    REALISM_V1_BALANCE.ratingUpdate.baseK *
    (1 + (current.uncertainty - 1) * REALISM_V1_BALANCE.ratingUpdate.uncertaintyK * 0.25) *
    experienceFactor *
    youthFactor;
  const nextAbility = current.ability + delta * k;
  const nextUncertainty = clamp(
    current.uncertainty - REALISM_V1_BALANCE.ratingUpdate.experienceUncertaintyDecay,
    REALISM_V1_BALANCE.ratingUpdate.minUncertainty,
    REALISM_V1_BALANCE.ratingUpdate.maxUncertainty,
  );

  return {
    ability: nextAbility,
    form: clamp(current.form * 0.82 + (delta / 15) * 0.18, -1.2, 1.2),
    uncertainty: nextUncertainty,
    lastBashoExpectedWins: expectedWins,
  };
};
