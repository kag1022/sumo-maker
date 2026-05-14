import type { EnemyStats, EnemyStyleBias } from '../../catalog/enemyData';
import { ENEMY_BODY_METRIC_BASE } from '../../catalog/enemyData';
import type { BodyType, Division, RikishiStatus, TacticsType } from '../../models';
import {
  resolvePlayerAbility,
  resolveRankBaselineAbility,
} from '../strength/model';
import { resolveCompetitiveFactor } from '../realism';
import { resolveStableById } from '../heya/stableCatalog';
import { STABLE_ARCHETYPE_BY_ID } from '../heya/stableArchetypeCatalog';
import type { BashoFormatKind } from '../basho/formatPolicy';
import type { PersistentActor } from '../npc/types';
import type { TorikumiParticipant } from '../torikumi/types';
import type { BashoCombatProfile, CombatProfileSource, CombatStyle } from './types';

const DEFAULT_PLAYER_BODY_METRICS: Record<BodyType, { heightCm: number; weightKg: number }> = {
  NORMAL: { heightCm: 182, weightKg: 138 },
  SOPPU: { heightCm: 186, weightKg: 124 },
  ANKO: { heightCm: 180, weightKg: 162 },
  MUSCULAR: { heightCm: 184, weightKg: 152 },
};

const resolveAverage = (values: number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);

const toCombatStyle = (style: TacticsType | EnemyStyleBias | undefined): CombatStyle | undefined => {
  if (!style) return undefined;
  return style === 'BALANCE' ? 'BALANCED' : style;
};

const resolveBodyScore = (heightCm: number, weightKg: number): number =>
  (heightCm - 180) * 0.2 + (weightKg - 140) * 0.11;

export const resolveStablePerformanceFactor = (stableId?: string): number => {
  if (!stableId) return 1;
  const stable = resolveStableById(stableId);
  if (!stable) return 1;
  const training = STABLE_ARCHETYPE_BY_ID[stable.archetypeId]?.training;
  if (!training) return 1;
  const growth = training.growth8;
  const avg =
    (growth.tsuki + growth.oshi + growth.kumi + growth.nage + growth.koshi + growth.deashi + growth.waza + growth.power) / 8;
  return Math.max(0.9, Math.min(1.1, avg));
};

export interface BuildPlayerBashoCombatProfileInput {
  status: RikishiStatus;
  id?: string;
  formatKind?: BashoFormatKind;
  bashoFormDelta?: number;
}

export const buildPlayerBashoCombatProfile = ({
  status,
  id = 'PLAYER',
  formatKind,
  bashoFormDelta = 0,
}: BuildPlayerBashoCombatProfileInput): BashoCombatProfile => {
  const bodyMetrics = status.bodyMetrics ?? DEFAULT_PLAYER_BODY_METRICS[status.bodyType];
  const conditionMod = 1 + ((status.currentCondition - 50) / 200);
  const stats = status.stats;
  const basePower = resolveAverage(Object.values(stats)) * conditionMod;
  const rankBaselineAbility = resolveRankBaselineAbility(status.rank);
  return {
    id,
    name: status.shikona,
    division: status.rank.division,
    formatKind,
    source: 'PLAYER',
    basePower,
    baseAbility: resolvePlayerAbility(status, bodyMetrics),
    bashoFormDelta,
    competitiveFactor: resolveCompetitiveFactor(status),
    stablePerformanceFactor: resolveStablePerformanceFactor(status.stableId),
    heightCm: bodyMetrics.heightCm,
    weightKg: bodyMetrics.weightKg,
    style: toCombatStyle(status.tactics),
    rankBaselineAbility,
    bodyScore: resolveBodyScore(bodyMetrics.heightCm, bodyMetrics.weightKg),
    pushStrength: resolveAverage([stats.tsuki, stats.oshi, stats.deashi]),
    beltStrength: resolveAverage([stats.kumi, stats.nage, stats.koshi]),
    techniqueStrength: resolveAverage([stats.waza, stats.nage, stats.deashi]),
    edgeStrength: resolveAverage([stats.koshi, stats.waza]),
  };
};

type NpcCombatProfileSource = Extract<CombatProfileSource, 'NPC' | 'GENERATED_OPPONENT'>;

type NpcProfileInputSource = Partial<Pick<
  PersistentActor,
  | 'actorId'
  | 'id'
  | 'shikona'
  | 'division'
  | 'currentDivision'
  | 'basePower'
  | 'ability'
  | 'stableId'
  | 'styleBias'
  | 'heightCm'
  | 'weightKg'
  | 'rankScore'
  | 'aptitudeTier'
  | 'aptitudeFactor'
  | 'aptitudeProfile'
  | 'careerBand'
  | 'stagnation'
>> & Partial<Pick<
  TorikumiParticipant,
  | 'bashoFormDelta'
  | 'power'
  | 'rankName'
  | 'rankNumber'
>>;

export interface BuildNpcBashoCombatProfileInput {
  npc: NpcProfileInputSource;
  division?: Division;
  formatKind?: BashoFormatKind;
  source?: NpcCombatProfileSource;
}

export const buildNpcBashoCombatProfile = ({
  npc,
  division,
  formatKind,
  source = 'NPC',
}: BuildNpcBashoCombatProfileInput): BashoCombatProfile => {
  const resolvedDivision = division ?? npc.division ?? npc.currentDivision ?? 'Makushita';
  const bodyFallback = ENEMY_BODY_METRIC_BASE[resolvedDivision];
  const basePower = npc.power ?? npc.basePower ?? npc.ability ?? 80;
  const heightCm = npc.heightCm ?? bodyFallback.heightCm;
  const weightKg = npc.weightKg ?? bodyFallback.weightKg;
  return {
    id: npc.id ?? npc.actorId ?? 'NPC',
    name: npc.shikona ?? 'NPC',
    division: resolvedDivision,
    formatKind,
    source,
    basePower,
    baseAbility: npc.ability,
    bashoFormDelta: npc.bashoFormDelta ?? 0,
    competitiveFactor: resolveCompetitiveFactor(npc),
    stablePerformanceFactor: resolveStablePerformanceFactor(npc.stableId),
    heightCm,
    weightKg,
    style: toCombatStyle(npc.styleBias),
    styleBias: npc.styleBias,
    rankValue: npc.rankScore,
    bodyScore: resolveBodyScore(heightCm, weightKg),
  };
};

export interface BuildGeneratedOpponentBashoCombatProfileInput {
  enemy: EnemyStats;
  division: Division;
  formatKind?: BashoFormatKind;
}

export const buildGeneratedOpponentBashoCombatProfile = ({
  enemy,
  division,
  formatKind,
}: BuildGeneratedOpponentBashoCombatProfileInput): BashoCombatProfile =>
  buildNpcBashoCombatProfile({
    npc: {
      id: enemy.id,
      shikona: enemy.shikona,
      division,
      power: enemy.power,
      ability: enemy.ability,
      styleBias: enemy.styleBias,
      heightCm: enemy.heightCm,
      weightKg: enemy.weightKg,
      aptitudeFactor: enemy.aptitudeFactor,
      rankScore: enemy.rankValue,
    },
    division,
    formatKind,
    source: 'GENERATED_OPPONENT',
  });
