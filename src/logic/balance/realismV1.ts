export const REALISM_V1_BALANCE = {
  strength: {
    logisticScale: 0.065,
    styleEdgeBonus: 5.5,
    injuryPenaltyScale: 0.14,
    statsCenter: 35,
    abilityFromStatsWeight: 1.18,
    conditionWeight: 0.16,
    bodyWeight: 0.14,
    derivedAbilityBlend: 0.32,
  },
  ratingUpdate: {
    baseK: 1.2,
    uncertaintyK: 1.6,
    minUncertainty: 0.6,
    maxUncertainty: 2.4,
    experienceUncertaintyDecay: 0.03,
    youthBoostAge: 23,
    youthBoost: 1.12,
  },
  torikumi: {
    sameScoreWeightCap: 78,
    earlyRankDistanceWeight: 13,
    midRankDistanceWeight: 11,
    lateRankDistanceWeight: 10,
    earlyScoreDistanceWeight: 20,
    midScoreDistanceWeight: 36,
    lateScoreDistanceWeight: 50,
    boundaryVacancyWeight: 20,
    boundaryPromotionPressureWeight: 14,
    boundaryLateDayWeight: 12,
  },
  yokozuna: {
    yushoEquivalentMinScore: 13.5,
    strictTwoBashoGate: true,
  },
} as const;

export type RealismV1Balance = typeof REALISM_V1_BALANCE;
