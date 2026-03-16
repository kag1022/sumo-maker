/**
 * シミュレーション・バランス定数
 *
 * すべてのバランス調整パラメータをこのファイルに集約する。
 * 旧 balance/realismV1.ts (torikumi) と balance/unifiedV1.ts (strength, ratingUpdate, yokozuna)
 * を統合したもの。
 */
export const BALANCE = {
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
    yushoEquivalentMinScore: 11.5,
    yushoEquivalentTotalMinScore: 24.0,
    strictTwoBashoGate: true,
  },
} as const;

export type Balance = typeof BALANCE;
