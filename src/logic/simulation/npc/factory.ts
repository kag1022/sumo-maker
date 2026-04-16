import { Division } from '../../models';
import { resolveAptitudeProfile, CONSTANTS } from '../../constants';
import {
  ENEMY_SEED_POOL,
  EnemySeedProfile,
  resolveEnemySeedBodyMetrics,
} from '../../catalog/enemyData';
import {
  sampleEmpiricalDivisionAge,
  sampleEmpiricalNpcSeed,
} from '../../calibration/npcRealismHeisei';
import { RandomSource } from '../deps';
import { resolveLegacyAptitudeFactor } from '../realism';
import { createNpcNameContext, generateUniqueNpcShikona } from './npcShikonaGenerator';
import { buildInitialStableAssignmentSequence } from './stableCatalog';
import {
  LOWER_DIVISION_SLOTS,
  NpcUniverse,
  PersistentNpc,
  TOP_DIVISION_SLOTS,
} from './types';

const POWER_RANGE: Record<Division, { min: number; max: number }> = {
  Makuuchi: { min: 100, max: 165 },
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
  registry: NpcUniverse['registry'],
): PersistentNpc => {
  const range = POWER_RANGE[division];
  const shikona = generateUniqueNpcShikona(
    stableId,
    division,
    rng,
    nameContext,
    registry,
  );
  const entryAge = sampleEmpiricalDivisionAge(division, rng);
  const body = resolveEnemySeedBodyMetrics(division, `${seed.seedId}-${serial}`);
  const empiricalSeed = sampleEmpiricalNpcSeed(rng);
  const careerBand = empiricalSeed.careerBand;
  const bandBias = CONSTANTS.CAREER_BAND_DATA[careerBand];
  const aptitudeTier = empiricalSeed.aptitudeTier;
  const aptitudeProfile = resolveAptitudeProfile(aptitudeTier);
  const basePower = clamp(
    seed.basePower +
      bandBias.abilityBias +
      randomNoise(rng, seed.powerVariance + (careerBand === 'WASHOUT' ? 1.4 : 0.6)),
    range.min,
    range.max,
  );
  const ability =
    basePower * (0.82 + aptitudeProfile.boutFactor * 0.08) +
    seed.basePower * 0.12 +
    randomNoise(rng, 2.1) +
    seed.growthBias * 5.2 +
    bandBias.abilityBias * 0.6;
  const aptitudeFactor = resolveLegacyAptitudeFactor(aptitudeProfile, aptitudeTier);
  const retirementProfile = empiricalSeed.retirementProfile;
  return {
    actorId: `NPC-${serial}`,
    actorType: 'NPC',
    id: `NPC-${serial}`,
    seedId: seed.seedId,
    shikona,
    stableId,
    division,
    currentDivision: division,
    rankScore,
    basePower,
    ability,
    uncertainty: clamp(2.2 - rankScore * 0.004 + randomNoise(rng, 0.2), 0.7, 2.4),
    form: clamp(1 + randomNoise(rng, 0.05), 0.85, 1.15),
    volatility: clamp(seed.volatilityBase + rng() * 1.1, 0.75, 3.8),
    styleBias: seed.styleBias,
    heightCm: body.heightCm,
    weightKg: body.weightKg,
    growthBias: seed.growthBias,
    aptitudeTier,
    aptitudeFactor,
    aptitudeProfile,
    careerBand,
    retirementBias: seed.retirementBias,
    retirementProfile,
    entryAge,
    age: entryAge,
    careerBashoCount: 0,
    active: true,
    entrySeq: seq,
    riseBand: empiricalSeed.riseBand,
    stagnation: {
      pressure: careerBand === 'ELITE' ? 0 : careerBand === 'STRONG' ? 0.1 : careerBand === 'STANDARD' ? 0.35 : careerBand === 'GRINDER' ? 0.8 : 1.1,
      makekoshiStreak: 0,
      lowWinRateStreak: 0,
      stuckBasho: 0,
      reboundBoost: 0,
    },
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
      registry,
    );
    serialCursor.value += 1;
    roster.push(npc);
    registry.set(npc.id, npc);
  }

  const divisionRange = POWER_RANGE[division];
  const rankedRoster = roster
    .slice()
    .sort((a, b) => {
      const aScore = a.ability + a.growthBias * 14 + (a.form - 1) * 18;
      const bScore = b.ability + b.growthBias * 14 + (b.form - 1) * 18;
      if (bScore !== aScore) return bScore - aScore;
      return a.id.localeCompare(b.id);
    })
    .map((npc, index, ordered) => {
      const percentile = ordered.length <= 1 ? 0.5 : 1 - index / (ordered.length - 1);
      const sortedAbilities = ordered.map((row) => row.ability).sort((a, b) => a - b);
      const anchorIndex = clamp(
        Math.round((sortedAbilities.length - 1) * percentile),
        0,
        Math.max(0, sortedAbilities.length - 1),
      );
      const anchorAbility = sortedAbilities[anchorIndex] ?? npc.ability;
      const softenedAbility = clamp(
        anchorAbility * 0.72 + npc.ability * 0.28,
        divisionRange.min,
        divisionRange.max + 16,
      );
      return { ...npc, ability: softenedAbility, rankScore: index + 1 };
    });

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
    registry,
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
