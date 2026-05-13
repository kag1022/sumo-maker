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
import type { EraSnapshot } from '../../era/types';
import { RandomSource } from '../deps';
import { resolveLegacyAptitudeFactor } from '../realism';
import {
  EraCareerStage,
  gateStageForTopSanyaku,
  reshapeAbilityToEra,
  resolveEraBody,
  resolveEraDivisionSlots,
  resolveEraTopSanyakuSlotCount,
  sampleEraAge,
  sampleEraCareerStage,
  synthesizeEraCareerMeta,
} from './eraIntegration';
import { createNpcNameContext, generateUniqueNpcShikona } from './npcShikonaGenerator';
import { samplePlannedCareerBasho } from './plannedCareer';
import {
  getActiveNpcWorldCalibrationProfile,
  sampleProfileAptitudeTier,
  sampleProfileCareerBand,
  sampleProfileRetirementProfile,
} from './calibration/profile';
import { buildInitialStableAssignmentSequence } from './stableCatalog';
import {
  NpcUniverse,
  PersistentNpc,
} from './types';
import type { NpcTsukedashiLevel } from './tsukedashi';

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

const inferInitialCareerBashoCount = (
  division: Division,
  currentAge: number,
  rng: RandomSource,
): { entryAge: number; careerBashoCount: number } => {
  const entryAgeBase =
    division === 'Makuuchi' || division === 'Juryo'
      ? 15 + rng() * 3
      : division === 'Makushita' || division === 'Sandanme'
        ? 15 + rng() * 2.5
        : 15 + rng() * 1.5;
  const minimumByDivision: Record<Division, number> = {
    Makuuchi: 18,
    Juryo: 12,
    Makushita: 4,
    Sandanme: 2,
    Jonidan: 0,
    Jonokuchi: 0,
    Maezumo: 0,
  };
  const rawCareerBasho = Math.round(Math.max(0, currentAge - entryAgeBase) * 6 + rng() * 5);
  const careerBashoCount = Math.max(minimumByDivision[division], rawCareerBasho);
  const entryAge = Math.max(15, currentAge - Math.floor(careerBashoCount / 6));
  return { entryAge, careerBashoCount };
};

const pickSeed = (division: Division, index: number): EnemySeedProfile => {
  const seeds = ENEMY_SEED_POOL[division];
  return seeds[index % seeds.length];
};

interface EraNpcContext {
  eraSnapshot?: EraSnapshot;
  rosterIndex: number;
  topSanyakuCount: number;
  currentYear: number;
}

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
  eraContext?: EraNpcContext,
): PersistentNpc => {
  const range = POWER_RANGE[division];
  const shikona = generateUniqueNpcShikona(
    stableId,
    division,
    rng,
    nameContext,
    registry,
  );
  const eraSnapshot = eraContext?.eraSnapshot;
  const currentAge =
    sampleEraAge(division, rng, eraSnapshot) ?? sampleEmpiricalDivisionAge(division, rng);
  const careerAge = inferInitialCareerBashoCount(division, currentAge, rng);
  const body = resolveEnemySeedBodyMetrics(division, `${seed.seedId}-${serial}`);
  const eraBody = resolveEraBody(division, eraSnapshot);
  // Era body p50 が指定されていれば、seed 由来 body と 0.6/0.4 で混ぜて era 寄りに引く。
  const blendedHeight =
    eraBody?.heightP50 != null
      ? clamp(body.heightCm * 0.4 + eraBody.heightP50 * 0.6, 165, 210)
      : body.heightCm;
  const blendedWeight =
    eraBody?.weightP50 != null
      ? clamp(body.weightKg * 0.4 + eraBody.weightP50 * 0.6, 90, 230)
      : body.weightKg;
  const empiricalSeed = sampleEmpiricalNpcSeed(rng);
  const profile = getActiveNpcWorldCalibrationProfile();
  const careerBand =
    profile === 'legacy'
      ? empiricalSeed.careerBand
      : sampleProfileCareerBand(rng, profile) ?? empiricalSeed.careerBand;
  const bandBias = CONSTANTS.CAREER_BAND_DATA[careerBand];
  const aptitudeTier =
    profile === 'legacy'
      ? empiricalSeed.aptitudeTier
      : sampleProfileAptitudeTier(rng, profile) ?? empiricalSeed.aptitudeTier;
  const aptitudeProfile = resolveAptitudeProfile(aptitudeTier);
  const basePower = clamp(
    seed.basePower +
      bandBias.abilityBias +
      randomNoise(rng, seed.powerVariance + (careerBand === 'WASHOUT' ? 1.4 : 0.6)),
    range.min,
    range.max,
  );
  const baseAbility = clamp(
    basePower * (0.82 + aptitudeProfile.boutFactor * 0.08) +
      seed.basePower * 0.12 +
      randomNoise(rng, 2.1) +
      seed.growthBias * 5.2 +
      bandBias.abilityBias * 0.6,
    range.min,
    range.max,
  );
  const ability = clamp(
    reshapeAbilityToEra(baseAbility, division, rng, eraSnapshot),
    range.min,
    range.max,
  );
  const aptitudeFactor = resolveLegacyAptitudeFactor(aptitudeProfile, aptitudeTier);
  const retirementProfile =
    profile === 'legacy'
      ? empiricalSeed.retirementProfile
      : sampleProfileRetirementProfile(rng, profile) ?? empiricalSeed.retirementProfile;

  // Era career stage と synthetic meta。Era 不在時はすべて undefined で legacy 動作。
  let eraStage: EraCareerStage | undefined;
  let syntheticCareerStartYear: number | undefined;
  let initialCareerStage: EraCareerStage | undefined;
  let resolvedEntryAge = careerAge.entryAge;
  let resolvedCareerBashoCount = careerAge.careerBashoCount;
  if (eraSnapshot && eraContext) {
    const sampledStage = sampleEraCareerStage(division, rng, eraSnapshot);
    eraStage = gateStageForTopSanyaku(
      division,
      eraContext.rosterIndex,
      eraContext.topSanyakuCount,
      sampledStage,
      rng,
    );
    if (eraStage) {
      const meta = synthesizeEraCareerMeta(eraStage, currentAge, eraContext.currentYear, rng);
      syntheticCareerStartYear = meta.syntheticCareerStartYear;
      initialCareerStage = meta.initialCareerStage;
      // 既存の careerBashoCount/entryAge を era meta で上書き (age と整合済み)。
      resolvedEntryAge = meta.entryAge;
      resolvedCareerBashoCount = Math.max(careerAge.careerBashoCount, meta.syntheticCareerBashoCount);
    }
  }

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
    heightCm: blendedHeight,
    weightKg: blendedWeight,
    growthBias: seed.growthBias,
    aptitudeTier,
    aptitudeFactor,
    aptitudeProfile,
    careerBand,
    retirementBias: seed.retirementBias,
    retirementProfile,
    entryAge: resolvedEntryAge,
    age: currentAge,
    careerBashoCount: resolvedCareerBashoCount,
    plannedCareerBasho: samplePlannedCareerBasho(rng),
    syntheticCareerStartYear,
    initialCareerStage,
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
  eraOptions?: { eraSnapshot?: EraSnapshot; topSanyakuCount: number; currentYear: number },
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
      eraOptions
        ? {
          eraSnapshot: eraOptions.eraSnapshot,
          rosterIndex: index,
          topSanyakuCount: eraOptions.topSanyakuCount,
          currentYear: eraOptions.currentYear,
        }
        : undefined,
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

export interface CreateInitialNpcUniverseOptions {
  eraSnapshot?: EraSnapshot;
  currentYear?: number;
}

export const createInitialNpcUniverse = (
  rng: RandomSource,
  options?: CreateInitialNpcUniverseOptions,
): NpcUniverse => {
  const registry = new Map<string, PersistentNpc>();
  const nameContext = createNpcNameContext();
  const serialCursor = { value: 1 };
  const eraSnapshot = options?.eraSnapshot;
  const currentYear = options?.currentYear ?? new Date().getFullYear();
  const slots = resolveEraDivisionSlots(eraSnapshot);
  const topSanyakuCount = resolveEraTopSanyakuSlotCount(eraSnapshot);
  const totalInitialCount =
    slots.Makuuchi +
    slots.Juryo +
    slots.Makushita +
    slots.Sandanme +
    slots.Jonidan +
    slots.Jonokuchi;
  const stableAssignments = buildInitialStableAssignmentSequence(totalInitialCount);
  const stableCursor = { value: 0 };
  const eraOptions = eraSnapshot
    ? { eraSnapshot, topSanyakuCount, currentYear }
    : undefined;

  const rosters = {
    Makuuchi: createDivisionRoster(
      'Makuuchi',
      slots.Makuuchi,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
      eraOptions,
    ),
    Juryo: createDivisionRoster(
      'Juryo',
      slots.Juryo,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
      eraOptions,
    ),
    Makushita: createDivisionRoster(
      'Makushita',
      slots.Makushita,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
      eraOptions,
    ),
    Sandanme: createDivisionRoster(
      'Sandanme',
      slots.Sandanme,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
      eraOptions,
    ),
    Jonidan: createDivisionRoster(
      'Jonidan',
      slots.Jonidan,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
      eraOptions,
    ),
    Jonokuchi: createDivisionRoster(
      'Jonokuchi',
      slots.Jonokuchi,
      stableAssignments,
      stableCursor,
      0,
      serialCursor,
      registry,
      nameContext,
      rng,
      eraOptions,
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

export const createTsukedashiRecruit = (
  rng: RandomSource,
  seq: number,
  serialCursor: { value: number },
  registry: NpcUniverse['registry'],
  nameContext: NpcUniverse['nameContext'],
  stableId: string,
  level: NpcTsukedashiLevel,
): PersistentNpc => {
  const division = level === 'MAKUSHITA_BOTTOM' ? 'Makushita' : 'Sandanme';
  const rankScore = level === 'MAKUSHITA_BOTTOM' ? 112 : 190;
  const seed = pickSeed(division, serialCursor.value);
  const npc = createNpc(
    division,
    rankScore,
    stableId,
    seq,
    serialCursor.value,
    seed,
    rng,
    nameContext,
    registry,
  );
  serialCursor.value += 1;
  const aptitudeTier = level === 'MAKUSHITA_BOTTOM' ? 'A' : 'B';
  const aptitudeProfile = resolveAptitudeProfile(aptitudeTier);
  const boost = level === 'MAKUSHITA_BOTTOM'
    ? { basePower: 18, ability: 16, growthBias: 0.38 }
    : { basePower: 12, ability: 11, growthBias: 0.28 };
  npc.entryArchetype = level === 'MAKUSHITA_BOTTOM' ? 'ELITE_TSUKEDASHI' : 'TSUKEDASHI';
  npc.rankSpecialStatus = level === 'MAKUSHITA_BOTTOM'
    ? 'MAKUSHITA_BOTTOM_TSUKEDASHI'
    : 'SANDANME_BOTTOM_TSUKEDASHI';
  npc.rankSpecialExpiresAfterSeq = seq + 1;
  npc.rankScore = rankScore;
  npc.basePower = clamp(npc.basePower + boost.basePower, POWER_RANGE[division].min, POWER_RANGE[division].max + 24);
  npc.ability = clamp(npc.ability + boost.ability, POWER_RANGE[division].min, POWER_RANGE[division].max + 26);
  npc.growthBias = clamp(npc.growthBias + boost.growthBias, -0.8, 1.4);
  npc.aptitudeTier = aptitudeTier;
  npc.aptitudeProfile = aptitudeProfile;
  npc.aptitudeFactor = resolveLegacyAptitudeFactor(aptitudeProfile, aptitudeTier);
  npc.careerBand = level === 'MAKUSHITA_BOTTOM' ? 'STRONG' : 'STANDARD';
  npc.entryAge = 22;
  npc.age = Math.max(npc.age, 22);
  npc.careerBashoCount = 0;
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
