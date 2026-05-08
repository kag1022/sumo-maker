import type {
  ObservationThemeDefinition,
  ObservationThemeId,
} from './types';

export const OBSERVATION_THEMES: Record<ObservationThemeId, ObservationThemeDefinition> = {
  random: {
    id: 'random',
    label: '完全ランダム',
    description: '従来通りのランダム観測。bias なし、無料で使える基本観測。',
    cost: 0,
    riskText: '結果は完全に運。観測価値も保証されません。',
    bias: {},
  },
  realistic: {
    id: 'realistic',
    label: '現実準拠',
    description: '実データ寄りの母集団。下位止まり・短期キャリアも素直に出やすい。',
    cost: 3,
    riskText: '関取到達は約束されません。下位止まりも頻繁に出ます。',
    bias: {
      aptitudeTierBias: { S: -0.05, A: -0.02, B: 0.04, C: 0.05, D: 0.05 },
      careerBandBias: { GRINDER: 0.1, STANDARD: 0.05, WASHOUT: 0.05 },
      retirementProfileBias: { EARLY_EXIT: 0.04, IRONMAN: -0.02 },
    },
  },
  featured: {
    id: 'featured',
    label: '注目株',
    description: 'B 以上素質や STANDARD/STRONG 寄り。観測価値の高いキャリアを引きやすい。',
    cost: 10,
    riskText: '関取到達を保証するものではありません。怪我や同期環境で潰れることもあります。',
    bias: {
      // No yokozuna factory: S nudge is small and clampWeights caps the top
      // bucket at 0.55 — featured can still roll D, just rarely.
      aptitudeTierBias: { S: 0.04, A: 0.12, B: 0.10, C: -0.05, D: -0.08 },
      careerBandBias: { STRONG: 0.12, STANDARD: 0.08, GRINDER: -0.05, WASHOUT: -0.08 },
      retirementProfileBias: { STANDARD: 0.04, EARLY_EXIT: -0.02 },
      genomeBias: { powerCeiling: 3, techCeiling: 3, ringSense: 2 },
    },
  },
  makushita_wall: {
    id: 'makushita_wall',
    label: '幕下の壁',
    description: '幕下到達〜幕下停滞を観測しやすい。GRINDER/STANDARD 寄り、aptitude B/C 周辺。',
    cost: 8,
    riskText: '十両到達は保証しません。幕下で長く沈むキャリアこそが目的です。',
    bias: {
      // Cap upside but never zero. Even makushita_wall can rarely sneak a
      // juryo touch — that's the point of "wall" not "block".
      aptitudeTierBias: { B: 0.14, C: 0.14, A: -0.06, S: -0.08, D: 0.02 },
      careerBandBias: { GRINDER: 0.20, STANDARD: 0.06, STRONG: -0.1, WASHOUT: -0.05 },
      retirementProfileBias: { IRONMAN: 0.06, EARLY_EXIT: -0.02 },
      genomeBias: { powerCeiling: -2, techCeiling: -2 },
    },
  },
  late_bloomer: {
    id: 'late_bloomer',
    label: '晩成型',
    description: 'growthType LATE 寄り。序盤停滞の副作用がある。',
    cost: 10,
    riskText: '序盤の停滞や、開花前の引退も普通に起こります。',
    bias: {
      growthTypeBias: { LATE: 0.4, NORMAL: -0.1, EARLY: -0.2, GENIUS: -0.05 },
      careerBandBias: { GRINDER: 0.06, STANDARD: 0.04, STRONG: 0.04, WASHOUT: -0.04 },
      retirementProfileBias: { IRONMAN: 0.06, EARLY_EXIT: -0.04 },
      initialStatBias: { tsuki: -1, oshi: -1, kumi: -1, nage: -1, koshi: -1, deashi: -1, waza: -1, power: -1 },
      genomeBias: { lateBloom: 1 },
    },
  },
};

export const listObservationThemes = (): ObservationThemeDefinition[] =>
  (Object.keys(OBSERVATION_THEMES) as ObservationThemeId[]).map((id) => OBSERVATION_THEMES[id]);

export const getObservationTheme = (id: ObservationThemeId): ObservationThemeDefinition =>
  OBSERVATION_THEMES[id];
