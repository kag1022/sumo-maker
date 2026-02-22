import { EnemyStyleBias } from '../../catalog/enemyData';
import { Rank, RikishiStatus } from '../../models';
import { REALISM_V1_BALANCE } from '../../balance/realismV1';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveStyleEdge = (
  mine: EnemyStyleBias | undefined,
  other: EnemyStyleBias | undefined,
): number => {
  if (!mine || !other || mine === 'BALANCE' || other === 'BALANCE' || mine === other) {
    return 0;
  }
  if (
    (mine === 'PUSH' && other === 'TECHNIQUE') ||
    (mine === 'TECHNIQUE' && other === 'GRAPPLE') ||
    (mine === 'GRAPPLE' && other === 'PUSH')
  ) {
    return REALISM_V1_BALANCE.strength.styleEdgeBonus;
  }
  return -REALISM_V1_BALANCE.strength.styleEdgeBonus;
};

const resolveBodyScore = (heightCm: number, weightKg: number): number =>
  (heightCm - 180) * 0.2 + (weightKg - 140) * 0.11;

type DivisionAbilityBand = {
  top: number;
  bottom: number;
  slots: number;
};

const DIVISION_ABILITY_BANDS: Record<Rank['division'], DivisionAbilityBand> = {
  Makuuchi: { top: 136, bottom: 112, slots: 42 },
  Juryo: { top: 110, bottom: 94, slots: 28 },
  Makushita: { top: 96, bottom: 78, slots: 120 },
  Sandanme: { top: 80, bottom: 64, slots: 180 },
  Jonidan: { top: 68, bottom: 54, slots: 200 },
  Jonokuchi: { top: 58, bottom: 46, slots: 60 },
  Maezumo: { top: 44, bottom: 44, slots: 1 },
};

const resolveMakuuchiSlot = (rank: Rank): number => {
  const sideOffset = rank.side === 'West' ? 1 : 0;
  if (rank.name === '横綱') return 1 + sideOffset;
  if (rank.name === '大関') return 3 + sideOffset;
  if (rank.name === '関脇') return 5 + sideOffset;
  if (rank.name === '小結') return 7 + sideOffset;
  const maegashiraNumber = clamp(rank.number || 1, 1, 17);
  return 8 + (maegashiraNumber - 1) * 2 + (sideOffset + 1);
};

const resolveRankSlot = (rank: Rank): number => {
  if (rank.division === 'Maezumo') return 1;
  if (rank.division === 'Makuuchi') return resolveMakuuchiSlot(rank);
  const band = DIVISION_ABILITY_BANDS[rank.division];
  const sideOffset = rank.side === 'West' ? 1 : 0;
  const number = clamp(rank.number || 1, 1, Math.ceil(band.slots / 2));
  return clamp((number - 1) * 2 + sideOffset + 1, 1, band.slots);
};

export const resolveRankBaselineAbility = (rank: Rank): number => {
  const band = DIVISION_ABILITY_BANDS[rank.division];
  if (band.slots <= 1) return band.top;
  const slot = resolveRankSlot(rank);
  const progress = (slot - 1) / (band.slots - 1);
  return band.top - (band.top - band.bottom) * progress;
};

export const resolveAbilityFromStats = (
  stats: RikishiStatus['stats'],
  condition: number,
  bodyMetrics: { heightCm: number; weightKg: number },
  baselineAbility = 74,
): number => {
  const statsAverage = Object.values(stats).reduce((sum, value) => sum + value, 0) / 8;
  const statsDelta =
    (statsAverage - REALISM_V1_BALANCE.strength.statsCenter) *
    REALISM_V1_BALANCE.strength.abilityFromStatsWeight;
  const conditionBias =
    (condition - 50) * REALISM_V1_BALANCE.strength.conditionWeight;
  const bodyBias =
    resolveBodyScore(bodyMetrics.heightCm, bodyMetrics.weightKg) *
    REALISM_V1_BALANCE.strength.bodyWeight;
  return baselineAbility + statsDelta + conditionBias + bodyBias;
};

export const resolvePlayerAbility = (
  status: RikishiStatus,
  fallbackBody: { heightCm: number; weightKg: number },
): number => {
  const baseline = resolveRankBaselineAbility(status.rank);
  const derived = resolveAbilityFromStats(
    status.stats,
    status.currentCondition,
    status.bodyMetrics ?? fallbackBody,
    baseline,
  );
  if (!status.ratingState) return derived;
  const uncertainty = Number.isFinite(status.ratingState.uncertainty)
    ? status.ratingState.uncertainty
    : 1.5;
  const blend = clamp(
    REALISM_V1_BALANCE.strength.derivedAbilityBlend + (uncertainty - 1.4) * 0.06,
    0.24,
    0.44,
  );
  return status.ratingState.ability * (1 - blend) + derived * blend + status.ratingState.form * 2.2;
};

export const resolveNpcAbility = (input: {
  ability?: number;
  basePower?: number;
  form?: number;
}): number => {
  if (Number.isFinite(input.ability)) {
    return input.ability as number;
  }
  const basePower = Number.isFinite(input.basePower) ? (input.basePower as number) : 80;
  const form = Number.isFinite(input.form) ? (input.form as number) : 1;
  return basePower * form;
};

export const resolveBoutWinProb = (input: {
  attackerAbility: number;
  defenderAbility: number;
  attackerStyle?: EnemyStyleBias;
  defenderStyle?: EnemyStyleBias;
  injuryPenalty?: number;
  bonus?: number;
}): number => {
  const styleEdge = resolveStyleEdge(input.attackerStyle, input.defenderStyle);
  const injuryPenalty = (input.injuryPenalty ?? 0) * REALISM_V1_BALANCE.strength.injuryPenaltyScale;
  const diff =
    input.attackerAbility -
    input.defenderAbility +
    styleEdge +
    (input.bonus ?? 0) -
    injuryPenalty;
  return clamp(1 / (1 + Math.exp(-REALISM_V1_BALANCE.strength.logisticScale * diff)), 0.03, 0.97);
};
