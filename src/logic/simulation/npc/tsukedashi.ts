import type { RandomSource } from '../deps';
import type { NpcRegistry } from './types';

const OFFICIAL_BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;

export type NpcTsukedashiLevel = 'MAKUSHITA_BOTTOM' | 'SANDANME_BOTTOM';

export interface NpcTsukedashiEntry {
  id: string;
  month: number;
  level: NpcTsukedashiLevel;
  consumed?: boolean;
}

export interface NpcTsukedashiYearPlan {
  sampledAtYear: number;
  entries: NpcTsukedashiEntry[];
}

export const NPC_TSUKEDASHI_CONFIG = {
  maxMakushitaPerYear: 2,
  maxSandanmePerYear: 4,
  maxPerBasho: 2,
} as const;

const pickWeightedCount = (
  rng: RandomSource,
  entries: Array<{ count: number; weight: number }>,
): number => {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.count;
  }
  return entries[entries.length - 1].count;
};

const pickAvailableMonth = (
  rng: RandomSource,
  monthCounts: Map<number, number>,
): number => {
  const available = OFFICIAL_BASHO_MONTHS.filter((month) =>
    (monthCounts.get(month) ?? 0) < NPC_TSUKEDASHI_CONFIG.maxPerBasho);
  const candidates = available.length ? available : [...OFFICIAL_BASHO_MONTHS];
  const month = candidates[Math.floor(rng() * candidates.length)] ?? 1;
  monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
  return month;
};

export const createNpcTsukedashiYearPlan = (
  year: number,
  rng: RandomSource,
): NpcTsukedashiYearPlan => {
  const makushitaCount = pickWeightedCount(rng, [
    { count: 0, weight: 86 },
    { count: 1, weight: 12 },
    { count: 2, weight: 2 },
  ]);
  const sandanmeCount = pickWeightedCount(rng, [
    { count: 0, weight: 72 },
    { count: 1, weight: 20 },
    { count: 2, weight: 6 },
    { count: 3, weight: 1.5 },
    { count: 4, weight: 0.5 },
  ]);
  const entries: NpcTsukedashiEntry[] = [];
  const monthCounts = new Map<number, number>();
  const pushEntries = (level: NpcTsukedashiLevel, count: number): void => {
    for (let index = 0; index < count; index += 1) {
      entries.push({
        id: `${year}-${level}-${index + 1}`,
        level,
        month: pickAvailableMonth(rng, monthCounts),
      });
    }
  };

  pushEntries('MAKUSHITA_BOTTOM', Math.min(makushitaCount, NPC_TSUKEDASHI_CONFIG.maxMakushitaPerYear));
  pushEntries('SANDANME_BOTTOM', Math.min(sandanmeCount, NPC_TSUKEDASHI_CONFIG.maxSandanmePerYear));
  return {
    sampledAtYear: year,
    entries: entries.sort((left, right) => left.month - right.month || left.level.localeCompare(right.level)),
  };
};

export const consumeNpcTsukedashiForBasho = (
  plan: NpcTsukedashiYearPlan | undefined,
  month: number,
): Record<NpcTsukedashiLevel, number> => {
  const counts: Record<NpcTsukedashiLevel, number> = {
    MAKUSHITA_BOTTOM: 0,
    SANDANME_BOTTOM: 0,
  };
  if (!plan) return counts;
  for (const entry of plan.entries) {
    if (entry.consumed || entry.month !== month) continue;
    entry.consumed = true;
    counts[entry.level] += 1;
  }
  return counts;
};

export const clearExpiredNpcTsukedashiSpecialRanks = (
  registry: NpcRegistry,
  seq: number,
): void => {
  for (const npc of registry.values()) {
    if (!npc.rankSpecialExpiresAfterSeq || npc.rankSpecialExpiresAfterSeq > seq) continue;
    npc.rankSpecialStatus = undefined;
    npc.rankSpecialExpiresAfterSeq = undefined;
  }
};
