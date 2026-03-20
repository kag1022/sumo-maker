export const HEISEI_BANZUKE_CALIBRATION = {
  boundaryExchange: {
    makuuchiJuryo: {
      averagePromotionsPerBasho: 3.52,
      averageDemotionsPerBasho: 3.28,
      targetCompetitiveSlots: 4,
    },
    juryoMakushita: {
      averagePromotionsPerBasho: 3.35,
      averageDemotionsPerBasho: 3.18,
      targetCompetitiveSlots: 4,
      historicalToleranceGap: -0.45,
      makushitaSevenWinBubbleMaxRank: 18,
      makushitaFallbackMaxRank: 20,
      makushitaFallbackMinWins: 6,
      demotionBaseMakushitaRank: 1,
      demotionMaxMakushitaRank: 3,
      fullAbsenceDemotionMaxMakushitaRank: 6,
      promotionBestJuryoNumber: 13,
      promotionWorstJuryoNumber: 14,
    },
  },
  topDivisionBoundary: {
    bottomMakuuchiRiskStart: 12,
    bottomMakuuchiRiskWeight: 0.55,
    bottomMakuuchiMakekoshiWeight: 1.05,
    topJuryoPromotionCeiling: 4,
    topJuryoPromotionBonus: 5.5,
    topJuryoStrongBonus: 1.25,
    extendedJuryoPromotionCeiling: 7,
    extendedJuryoPromotionBonus: 2.25,
  },
} as const;

export type HeiseiBanzukeCalibration = typeof HEISEI_BANZUKE_CALIBRATION;
