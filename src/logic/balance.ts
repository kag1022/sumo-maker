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
    /**
     * プレイヤー vs NPC バウトの能力差 soft cap。
     * 既存のキャリブレーションを維持するため Fix-1 では変更せず 34 を据え置く
     * （上限勝率 ~0.94）。
     */
    diffSoftCap: 34,
    /**
     * NPC vs NPC バウト専用の soft cap（Fix-1 で追加）。
     * 旧 cap=34 は下位部屋の能力ばらつきが大きい NPC ペアで決定論的な 7-0/0-7
     * 連勝連敗を生じていた。18 に縮小すると上限勝率 ~0.81 に抑制され、典型的な
     * D=10 付近では実質的影響なし。プレイヤー側の勝率カーブ（負け越しキャリア
     * 形成の主要シグナル）には影響を与えない。
     */
    npcDiffSoftCap: 18,
    /**
     * NPC vs NPC バウトに加えるランダムノイズ（能力スカラ単位の半振幅）。
     * 旧値 1.0 はノイズが小さすぎ、(a) 下位部屋で 7-0/0-7 等の連勝連敗が過剰、
     * (b) 関取で能力差が小さく 7-8/8-7 境界に成績が集中、両方を引き起こしていた。
     * 6.0 にすると典型的能力差 D=10 のペアで per-bout 勝率が 0.55-0.83 に分散し、
     * 7 戦合計で記録分布が中間帯（4-3/5-2/2-5）に広がる。
     * docs/balance/realism-diagnostic.md と realism-fix-plan.md (Fix-1) 参照。
     */
    boutNoiseAmplitude: 8.0,
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
    yushoEquivalentMinScore: 13.0,
    yushoEquivalentTotalMinScore: 29.0,
    strictTwoBashoGate: true,
    /** BORDERLINE審議スコア閾値 (0-100, これ以上で昇進) */
    deliberationThreshold: 65,
  },
} as const;

export type Balance = typeof BALANCE;
