import { Rank, RatingState } from '../../models';
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
}): RatingState => {
  const { current, actualWins, expectedWins, age, careerBashoCount, currentRank } = input;
  const delta = actualWins - expectedWins;
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
  const meanReversion = UNIFIED_V1_BALANCE.ratingUpdate.meanReversionToRankBaseline;
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
