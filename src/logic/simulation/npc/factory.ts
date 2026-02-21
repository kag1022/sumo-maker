import { Division } from '../../models';
import {
  ENEMY_SEED_POOL,
  EnemySeedProfile,
  resolveEnemySeedBodyMetrics,
} from '../../catalog/enemyData';
import { RandomSource } from '../deps';
import { createNpcNameContext, generateUniqueNpcShikona } from './npcShikonaGenerator';
import { buildInitialStableAssignmentSequence } from './stableCatalog';
import {
  LOWER_DIVISION_SLOTS,
  NpcUniverse,
  PersistentNpc,
  TOP_DIVISION_SLOTS,
} from './types';

const POWER_RANGE: Record<Division, { min: number; max: number }> = {
  Makuuchi: { min: 95, max: 165 },
  Juryo: { min: 78, max: 130 },
  Makushita: { min: 68, max: 104 },
  Sandanme: { min: 56, max: 92 },
  Jonidan: { min: 45, max: 82 },
  Jonokuchi: { min: 35, max: 72 },
  Maezumo: { min: 28, max: 60 },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const randomNoise = (rng: RandomSource, amplitude: number): number =>
  (rng() * 2 - 1) * amplitude;

const pickSeed = (division: Division, index: number): EnemySeedProfile => {
  const seeds = ENEMY_SEED_POOL[division];
  return seeds[index % seeds.length];
};

const createNpc = (
  division: Division,
  rankScore: number,
  stableId: string,
  seq: number,
  serial: number,
  seed: EnemySeedProfile,
  rng: RandomSource,
  nameContext: NpcUniverse['nameContext'],
): PersistentNpc => {
  const range = POWER_RANGE[division];
  const shikona = generateUniqueNpcShikona(stableId, rng, nameContext);
  const entryAge = 15 + Math.floor(rng() * 10);
  const body = resolveEnemySeedBodyMetrics(division, `${seed.seedId}-${serial}`);
  return {
    id: `NPC-${serial}`,
    seedId: seed.seedId,
    shikona,
    stableId,
    division,
    currentDivision: division,
    rankScore,
    basePower: clamp(seed.basePower + randomNoise(rng, seed.powerVariance), range.min, range.max),
    form: clamp(1 + randomNoise(rng, 0.05), 0.85, 1.15),
    volatility: clamp(seed.volatilityBase + rng() * 1.1, 0.75, 3.8),
    styleBias: seed.styleBias,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    growthBias: seed.growthBias,
    retirementBias: seed.retirementBias,
    entryAge,
    age: entryAge,
    careerBashoCount: 0,
    active: true,
    entrySeq: seq,
    riseBand: undefined,
    recentBashoResults: [],
  };
};

const createDivisionRoster = (
  division: Division,
  size: number,
  stableAssignments: string[],
  stableCursor: { value: number },
  seq: number,
  serialCursor: { value: number },
  registry: NpcUniverse['registry'],
  nameContext: NpcUniverse['nameContext'],
  rng: RandomSource,
): PersistentNpc[] => {
  const roster: PersistentNpc[] = [];
  for (let index = 0; index < size; index += 1) {
    const stableId =
      stableAssignments[stableCursor.value] ??
      stableAssignments[stableAssignments.length - 1] ??
      'stable-001';
    stableCursor.value += 1;
    const seed = pickSeed(division, index);
    const npc = createNpc(
      division,
      index + 1,
      stableId,
      seq,
      serialCursor.value,
      seed,
      rng,
      nameContext,
    );
    serialCursor.value += 1;
    roster.push(npc);
  }

  const rankedRoster = roster
    .slice()
    .sort((a, b) => {
      const aScore = a.basePower + a.growthBias * 14 + (a.form - 1) * 18;
      const bScore = b.basePower + b.growthBias * 14 + (b.form - 1) * 18;
      if (bScore !== aScore) return bScore - aScore;
      return a.id.localeCompare(b.id);
    })
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));

  for (const npc of rankedRoster) {
    registry.set(npc.id, npc);
  }
  return rankedRoster;
};

export const createInitialNpcUniverse = (rng: RandomSource): NpcUniverse => {
  const registry = new Map<string, PersistentNpc>();
  const nameContext = createNpcNameContext();
  const serialCursor = { value: 1 };
  const totalInitialCount =
    TOP_DIVISION_SLOTS.Makuuchi +
    TOP_DIVISION_SLOTS.Juryo +
    LOWER_DIVISION_SLOTS.Makushita +
    LOWER_DIVISION_SLOTS.Sandanme +
    LOWER_DIVISION_SLOTS.Jonidan +
    LOWER_DIVISION_SLOTS.Jonokuchi;
  const stableAssignments = buildInitialStableAssignmentSequence(totalInitialCount);
  const stableCursor = { value: 0 };

  const rosters = {
    Makuuchi: createDivisionRoster(
      'Makuuchi',
      TOP_DIVISION_SLOTS.Makuuchi,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
    ),
    Juryo: createDivisionRoster(
      'Juryo',
      TOP_DIVISION_SLOTS.Juryo,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
    ),
    Makushita: createDivisionRoster(
      'Makushita',
      LOWER_DIVISION_SLOTS.Makushita,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
    ),
    Sandanme: createDivisionRoster(
      'Sandanme',
      LOWER_DIVISION_SLOTS.Sandanme,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
    ),
    Jonidan: createDivisionRoster(
      'Jonidan',
      LOWER_DIVISION_SLOTS.Jonidan,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
    ),
    Jonokuchi: createDivisionRoster(
      'Jonokuchi',
      LOWER_DIVISION_SLOTS.Jonokuchi,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
    ),
  };

  return {
    registry,
    rosters,
    maezumoPool: [],
    nameContext,
    nextNpcSerial: serialCursor.value,
  };
};

export const createMaezumoRecruit = (
  rng: RandomSource,
  seq: number,
  serialCursor: { value: number },
  registry: NpcUniverse['registry'],
  nameContext: NpcUniverse['nameContext'],
  stableId: string,
): PersistentNpc => {
  const index = serialCursor.value % ENEMY_SEED_POOL.Maezumo.length;
  const seed = pickSeed('Maezumo', index);
  const npc = createNpc(
    'Maezumo',
    1,
    stableId,
    seq,
    serialCursor.value,
    seed,
    rng,
    nameContext,
  );
  serialCursor.value += 1;
  registry.set(npc.id, npc);
  return npc;
};

export const countActiveNpc = (registry: NpcUniverse['registry']): number => {
  let count = 0;
  for (const npc of registry.values()) {
    if (npc.active) count += 1;
  }
  return count;
};
