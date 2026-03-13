import { RikishiStatus } from '../../models';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { createPlayerActorFromStatus, syncPlayerActorFromStatus } from '../actors/playerBridge';
import { RandomSource } from '../deps';
import { generateUniqueNpcShikona, normalizeShikona } from '../npc/npcShikonaGenerator';
import { PersistentActor } from '../npc/types';
import { SimulationWorld, TopDivision, WorldRikishi } from './types';
import { DIVISION_SIZE, resolvePlayerRankScore, resolveTopDivisionFromRank } from './shared';

const toWorldRikishiFromActor = (
  actor: PersistentActor,
  division: TopDivision,
  rankScore: number,
): WorldRikishi => ({
  id: actor.id,
  shikona: actor.shikona,
  division,
  stableId: actor.stableId,
  basePower: actor.basePower,
  ability: actor.ability,
  uncertainty: actor.uncertainty,
  growthBias: actor.growthBias,
  rankScore,
  volatility: actor.volatility,
  form: actor.form,
  styleBias: actor.styleBias,
  heightCm: actor.heightCm,
  weightKg: actor.weightKg,
  aptitudeTier: actor.aptitudeTier,
  aptitudeFactor: actor.aptitudeFactor,
  aptitudeProfile: actor.aptitudeProfile,
  careerBand: actor.careerBand,
  stagnation: actor.stagnation,
});

const parseActorNumericId = (id: string): number => {
  const match = id.match(/(\d+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const compareActorIdAscending = (a: PersistentActor, b: PersistentActor): number => {
  const aNum = parseActorNumericId(a.id);
  const bNum = parseActorNumericId(b.id);
  if (aNum !== bNum) return aNum - bNum;
  return a.id.localeCompare(b.id);
};

const renameNpcCollidingWithPlayer = (
  world: SimulationWorld,
  playerShikona: string,
  rng: RandomSource,
): void => {
  const normalizedPlayer = normalizeShikona(playerShikona);
  const collidingActiveNpcs = [...world.npcRegistry.values()]
    .filter(
      (actor) =>
        actor.actorType === 'NPC' &&
        actor.active &&
        normalizeShikona(actor.shikona) === normalizedPlayer,
    )
    .sort(compareActorIdAscending);

  for (const npc of collidingActiveNpcs) {
    npc.shikona = generateUniqueNpcShikona(
      npc.stableId,
      npc.currentDivision,
      rng,
      world.npcNameContext,
      world.npcRegistry,
      npc.id,
    );
  }
};

const syncTopRosterNamesFromRegistry = (world: SimulationWorld): void => {
  for (const division of ['Makuuchi', 'Juryo'] as const) {
    world.rosters[division] = world.rosters[division].map((rikishi) => {
      const actor = world.npcRegistry.get(rikishi.id);
      if (!actor) return rikishi;
      return {
        ...rikishi,
        shikona: actor.shikona,
        stableId: actor.stableId,
        aptitudeTier: actor.aptitudeTier,
        aptitudeFactor: actor.aptitudeFactor,
        aptitudeProfile: actor.aptitudeProfile,
        careerBand: actor.careerBand,
        stagnation: actor.stagnation,
      };
    });
  }
};

const syncLowerSeedsFromRegistry = (world: SimulationWorld): void => {
  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    world.lowerRosterSeeds[division] = world.lowerRosterSeeds[division].map((npc) => {
      const actor = world.npcRegistry.get(npc.id);
      if (!actor) return npc;
      return {
        ...npc,
        shikona: actor.shikona,
        stableId: actor.stableId,
        aptitudeTier: actor.aptitudeTier,
        aptitudeFactor: actor.aptitudeFactor,
        aptitudeProfile: actor.aptitudeProfile,
        careerBand: actor.careerBand,
        stagnation: actor.stagnation,
      };
    });
  }

  world.maezumoPool = world.maezumoPool.map((npc) => {
    const actor = world.npcRegistry.get(npc.id);
    if (!actor) return npc;
    return {
      ...npc,
      shikona: actor.shikona,
      stableId: actor.stableId,
      aptitudeTier: actor.aptitudeTier,
      aptitudeFactor: actor.aptitudeFactor,
      aptitudeProfile: actor.aptitudeProfile,
      careerBand: actor.careerBand,
      stagnation: actor.stagnation,
    };
  });
};

export const syncPlayerActorInWorld = (
  world: SimulationWorld,
  status: RikishiStatus,
  rng: RandomSource,
): void => {
  const current = world.actorRegistry.get(PLAYER_ACTOR_ID);
  const nextActor = current
    ? syncPlayerActorFromStatus(current, status)
    : createPlayerActorFromStatus(status);
  world.actorRegistry.set(PLAYER_ACTOR_ID, nextActor);
  world.npcRegistry = world.actorRegistry;
  renameNpcCollidingWithPlayer(world, status.shikona, rng);

  world.rosters.Makuuchi = world.rosters.Makuuchi.filter((rikishi) => rikishi.id !== PLAYER_ACTOR_ID);
  world.rosters.Juryo = world.rosters.Juryo.filter((rikishi) => rikishi.id !== PLAYER_ACTOR_ID);

  const topDivision = resolveTopDivisionFromRank(status.rank);
  if (topDivision) {
    const rankScore = resolvePlayerRankScore(status.rank, world.makuuchiLayout);
    const nextRoster = world.rosters[topDivision]
      .slice()
      .sort((a, b) => a.rankScore - b.rankScore);
    if (nextRoster.length >= DIVISION_SIZE[topDivision]) {
      nextRoster.pop();
    }
    nextRoster.push(toWorldRikishiFromActor(nextActor, topDivision, rankScore));
    world.rosters[topDivision] = nextRoster
      .slice()
      .sort((a, b) => a.rankScore - b.rankScore)
      .slice(0, DIVISION_SIZE[topDivision]);
  }

  syncTopRosterNamesFromRegistry(world);
  syncLowerSeedsFromRegistry(world);
};
