import { StableArchetypeId } from '../../models';

export interface StableTrainingModifiers {
  growth8: Record<'tsuki' | 'oshi' | 'kumi' | 'nage' | 'koshi' | 'deashi' | 'waza' | 'power', number>;
  injuryRiskMultiplier: number;
  recoveryRateMultiplier: number;
  chronicResistanceBonus: number;
}

export interface StableArchetypeDefinition {
  id: StableArchetypeId;
  displayName: string;
  description: string;
  training: StableTrainingModifiers;
}

export const STABLE_ARCHETYPE_CATALOG: StableArchetypeDefinition[] = [
  {
    id: 'TRADITIONAL_LARGE',
    displayName: '伝統大部屋',
    description: '基礎鍛錬を重視する王道育成。',
    training: {
      growth8: { tsuki: 1.0, oshi: 1.0, kumi: 1.1, nage: 1.05, koshi: 1.1, deashi: 0.95, waza: 1.0, power: 1.05 },
      injuryRiskMultiplier: 0.97,
      recoveryRateMultiplier: 1.02,
      chronicResistanceBonus: 4,
    },
  },
  {
    id: 'TSUKI_OSHI_GROUP',
    displayName: '突き押し集団',
    description: '立合いの圧と回転力を鍛え上げる。',
    training: {
      growth8: { tsuki: 1.16, oshi: 1.14, kumi: 0.92, nage: 0.92, koshi: 0.95, deashi: 1.08, waza: 0.96, power: 1.05 },
      injuryRiskMultiplier: 1.06,
      recoveryRateMultiplier: 0.98,
      chronicResistanceBonus: -2,
    },
  },
  {
    id: 'GIANT_YOTSU',
    displayName: '巨漢四つ相撲',
    description: '組み止める力で土俵際を制圧する。',
    training: {
      growth8: { tsuki: 0.9, oshi: 0.98, kumi: 1.15, nage: 1.1, koshi: 1.13, deashi: 0.9, waza: 0.93, power: 1.16 },
      injuryRiskMultiplier: 1.03,
      recoveryRateMultiplier: 0.97,
      chronicResistanceBonus: 0,
    },
  },
  {
    id: 'TECHNICAL_SMALL',
    displayName: '業師の小部屋',
    description: '小兵でも勝つための技術継承に特化。',
    training: {
      growth8: { tsuki: 0.96, oshi: 0.94, kumi: 0.98, nage: 1.12, koshi: 0.95, deashi: 1.08, waza: 1.18, power: 0.88 },
      injuryRiskMultiplier: 0.99,
      recoveryRateMultiplier: 1.08,
      chronicResistanceBonus: 8,
    },
  },
  {
    id: 'MODERN_SCIENCE',
    displayName: '近代科学',
    description: '計測と分析で効率良く能力を伸ばす。',
    training: {
      growth8: { tsuki: 1.05, oshi: 1.05, kumi: 1.04, nage: 1.02, koshi: 1.02, deashi: 1.05, waza: 1.04, power: 1.08 },
      injuryRiskMultiplier: 0.92,
      recoveryRateMultiplier: 1.14,
      chronicResistanceBonus: 10,
    },
  },
  {
    id: 'MASTER_DISCIPLE',
    displayName: '師弟二人三脚',
    description: '個別最適の濃密指導で弱点を補強。',
    training: {
      growth8: { tsuki: 1.0, oshi: 1.0, kumi: 1.0, nage: 1.0, koshi: 1.0, deashi: 1.0, waza: 1.0, power: 1.0 },
      injuryRiskMultiplier: 1.0,
      recoveryRateMultiplier: 1.0,
      chronicResistanceBonus: 0,
    },
  },
];

export const STABLE_ARCHETYPE_BY_ID: Record<StableArchetypeId, StableArchetypeDefinition> = {
  TRADITIONAL_LARGE: STABLE_ARCHETYPE_CATALOG[0],
  TSUKI_OSHI_GROUP: STABLE_ARCHETYPE_CATALOG[1],
  GIANT_YOTSU: STABLE_ARCHETYPE_CATALOG[2],
  TECHNICAL_SMALL: STABLE_ARCHETYPE_CATALOG[3],
  MODERN_SCIENCE: STABLE_ARCHETYPE_CATALOG[4],
  MASTER_DISCIPLE: STABLE_ARCHETYPE_CATALOG[5],
};
