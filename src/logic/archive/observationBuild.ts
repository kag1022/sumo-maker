import { OBSERVATION_THEMES, getObservationTheme } from './observationThemes';
import type {
  ObservationBiasDefinition,
  ObservationBuildConfig,
  ObservationModifierDefinition,
  ObservationModifierGroup,
  ObservationModifierId,
  ObservationThemeId,
} from './types';

export const OBSERVATION_MODIFIERS: Record<ObservationModifierId, ObservationModifierDefinition> = {
  small_body: {
    id: 'small_body',
    label: '小兵型',
    description: '出足・技術・投げ寄り。絶対筋力や耐久に不利が出やすい。',
    cost: 4,
    exclusiveGroup: 'body',
    bias: {
      initialStatBias: { deashi: 2, waza: 2, nage: 1, power: -3 },
      bodyMetricsBias: { heightCm: -3, weightKg: -10 },
      genomeBias: { technicalAffinity: 4, speedCeiling: 2, powerCeiling: -3 },
    },
  },
  large_body: {
    id: 'large_body',
    label: '大型型',
    description: '押し・組力・絶対筋力寄り。出足や怪我リスクにわずかに不利。',
    cost: 4,
    exclusiveGroup: 'body',
    bias: {
      initialStatBias: { oshi: 2, kumi: 2, power: 3, deashi: -2 },
      bodyMetricsBias: { heightCm: 3, weightKg: 12 },
      injuryRiskBias: 0.05,
      genomeBias: { oshiAffinity: 4, powerCeiling: 3, speedCeiling: -2 },
    },
  },
  oshizumo_style: {
    id: 'oshizumo_style',
    label: '押し相撲型',
    description: '押し・出足・絶対筋力寄り。',
    cost: 4,
    exclusiveGroup: 'style',
    bias: {
      initialStatBias: { oshi: 3, tsuki: 2, deashi: 2, power: 1 },
      genomeBias: { oshiAffinity: 5, powerCeiling: 2 },
    },
  },
  technical_style: {
    id: 'technical_style',
    label: '技巧派型',
    description: '技術・投げ・組力寄り。',
    cost: 5,
    exclusiveGroup: 'style',
    bias: {
      initialStatBias: { waza: 3, nage: 2, kumi: 2 },
      genomeBias: { technicalAffinity: 5, ringSense: 2 },
    },
  },
  late_growth_bias: {
    id: 'late_growth_bias',
    label: '晩成寄り',
    description: 'growthType LATE 寄り。序盤は伸びにくい。',
    cost: 6,
    exclusiveGroup: 'growth',
    bias: {
      growthTypeBias: { LATE: 0.5, EARLY: -0.25, NORMAL: -0.1 },
      initialStatBias: { tsuki: -2, oshi: -2, kumi: -2, nage: -1, koshi: -1, deashi: -2, waza: -1, power: -2 },
      careerBandBias: { GRINDER: 0.04, STANDARD: 0.04 },
      genomeBias: { lateBloom: 1 },
    },
  },
  stable_temperament: {
    id: 'stable_temperament',
    label: '安定型',
    description: 'retirementProfile やムラを安定側へ。大爆発はやや少ない。',
    cost: 5,
    exclusiveGroup: 'risk',
    bias: {
      varianceBias: -0.15,
      // Note: retirementProfile values are STANDARD / EARLY_EXIT / IRONMAN
      // (not 'STABLE'/'EARLY'). Use canonical keys.
      retirementProfileBias: { STANDARD: 0.10, IRONMAN: 0.04, EARLY_EXIT: -0.05 },
    },
  },
  volatile_temperament: {
    id: 'volatile_temperament',
    label: 'ムラが大きい',
    description: '上振れ/下振れの振れ幅が増える。',
    cost: -2,
    riskText: '怪我・短期失速・連敗も発生しやすくなる。',
    bias: {
      varianceBias: 0.25,
      retirementProfileBias: { EARLY_EXIT: 0.04, IRONMAN: 0.04, STANDARD: -0.06 },
    },
  },
  injury_risk_high: {
    id: 'injury_risk_high',
    label: '怪我リスク高め',
    description: '怪我や短期失速リスクを少し上げる。',
    cost: -3,
    riskText: '長期休場や早期引退の確率が上がる。',
    bias: {
      injuryRiskBias: 0.18,
    },
  },
};

export const listObservationModifiers = (): ObservationModifierDefinition[] =>
  (Object.keys(OBSERVATION_MODIFIERS) as ObservationModifierId[]).map((id) => OBSERVATION_MODIFIERS[id]);

export const getObservationModifier = (id: ObservationModifierId): ObservationModifierDefinition =>
  OBSERVATION_MODIFIERS[id];

export interface BuildValidationResult {
  ok: boolean;
  errors: string[];
}

export const validateBuild = (
  themeId: ObservationThemeId,
  modifierIds: ObservationModifierId[],
): BuildValidationResult => {
  const errors: string[] = [];
  if (!OBSERVATION_THEMES[themeId]) {
    errors.push(`未知の観測テーマ: ${themeId}`);
  }
  const groupCounts: Record<ObservationModifierGroup, number> = {
    body: 0,
    style: 0,
    growth: 0,
    risk: 0,
  };
  const seen = new Set<ObservationModifierId>();
  for (const id of modifierIds) {
    if (seen.has(id)) {
      errors.push(`重複したビルド: ${id}`);
      continue;
    }
    seen.add(id);
    const def = OBSERVATION_MODIFIERS[id];
    if (!def) {
      errors.push(`未知のビルド: ${id}`);
      continue;
    }
    if (def.exclusiveGroup) {
      groupCounts[def.exclusiveGroup] += 1;
    }
  }
  for (const group of ['body', 'style', 'growth'] as const) {
    if (groupCounts[group] > 1) {
      errors.push(`${group} 系のビルドは 1 つまでです。`);
    }
  }
  return { ok: errors.length === 0, errors };
};

export const computeBuildCost = (
  themeId: ObservationThemeId,
  modifierIds: ObservationModifierId[],
): number => {
  const theme = getObservationTheme(themeId);
  let total = theme?.cost ?? 0;
  for (const id of modifierIds) {
    const def = OBSERVATION_MODIFIERS[id];
    if (!def) continue;
    total += def.cost;
  }
  return Math.max(0, total);
};

const mergeRecord = (
  acc: Record<string, number> | undefined,
  next: Record<string, number> | undefined,
): Record<string, number> | undefined => {
  if (!next) return acc;
  const out: Record<string, number> = { ...(acc ?? {}) };
  for (const [k, v] of Object.entries(next)) {
    out[k] = (out[k] ?? 0) + v;
  }
  return out;
};

export const composeBias = (
  themeId: ObservationThemeId,
  modifierIds: ObservationModifierId[],
): ObservationBiasDefinition => {
  const theme = getObservationTheme(themeId);
  const biases: ObservationBiasDefinition[] = [theme?.bias ?? {}];
  for (const id of modifierIds) {
    const def = OBSERVATION_MODIFIERS[id];
    if (def) biases.push(def.bias);
  }

  let aptitudeTierBias: Record<string, number> | undefined;
  let entryArchetypeBias: Record<string, number> | undefined;
  let careerBandBias: Record<string, number> | undefined;
  let growthTypeBias: Record<string, number> | undefined;
  let retirementProfileBias: Record<string, number> | undefined;
  let genomeBias: Record<string, number> | undefined;
  let initialStatBias: Record<string, number> | undefined;
  let heightCm = 0;
  let weightKg = 0;
  let injuryRiskBias = 0;
  let varianceBias = 0;

  for (const b of biases) {
    entryArchetypeBias = mergeRecord(entryArchetypeBias, b.entryArchetypeBias);
    aptitudeTierBias = mergeRecord(aptitudeTierBias, b.aptitudeTierBias);
    careerBandBias = mergeRecord(careerBandBias, b.careerBandBias);
    growthTypeBias = mergeRecord(growthTypeBias, b.growthTypeBias);
    retirementProfileBias = mergeRecord(retirementProfileBias, b.retirementProfileBias);
    genomeBias = mergeRecord(genomeBias, b.genomeBias);
    initialStatBias = mergeRecord(initialStatBias, b.initialStatBias);
    if (b.bodyMetricsBias?.heightCm) heightCm += b.bodyMetricsBias.heightCm;
    if (b.bodyMetricsBias?.weightKg) weightKg += b.bodyMetricsBias.weightKg;
    if (b.injuryRiskBias) injuryRiskBias += b.injuryRiskBias;
    if (b.varianceBias) varianceBias += b.varianceBias;
  }

  return {
    entryArchetypeBias,
    aptitudeTierBias,
    careerBandBias,
    growthTypeBias,
    retirementProfileBias,
    genomeBias,
    initialStatBias,
    bodyMetricsBias: heightCm || weightKg ? { heightCm, weightKg } : undefined,
    injuryRiskBias: injuryRiskBias || undefined,
    varianceBias: varianceBias || undefined,
  };
};

export const buildObservationConfig = (
  themeId: ObservationThemeId,
  modifierIds: ObservationModifierId[],
): ObservationBuildConfig => ({
  themeId,
  modifierIds,
  totalCost: computeBuildCost(themeId, modifierIds),
});
