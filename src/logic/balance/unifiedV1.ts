export const UNIFIED_V1_BALANCE = {
  strength: {
    logisticScale: 0.082,
    styleEdgeBonus: 3.8,
    injuryPenaltyScale: 0.18,
    statsCenter: 35,
    abilityFromStatsWeight: 1.18,
    conditionWeight: 0.16,
    bodyWeight: 0.14,
    derivedOffsetMin: -14,
    derivedOffsetMax: 40,
    derivedOffsetWeight: 0.72,
    ratingAnchorWeight: 0.62,
    traitBonusCap: 12,
    traitBonusWeight: 0.85,
    formWeight: 1.6,
    npcAbilityWeight: 0.62,
    diffSoftCap: 34,
  },
  ratingUpdate: {
    baseK: 1.2,
    uncertaintyK: 1.4,
    minUncertainty: 0.7,
    maxUncertainty: 2.2,
    experienceUncertaintyDecay: 0.025,
    youthBoostAge: 23,
    youthBoost: 1.12,
    meanReversionToRankBaseline: 0.012,
  },
  yokozuna: {
    yushoEquivalentMinScore: 11.5,
    yushoEquivalentTotalMinScore: 24.0,
    strictTwoBashoGate: true,
  },
} as const;

export type UnifiedV1Balance = typeof UNIFIED_V1_BALANCE;
