import { BashoRecordHistorySnapshot } from '../../banzuke/providers/sekitori/types';
import { DEFAULT_MAKUUCHI_LAYOUT } from '../../banzuke/scale/banzukeLayout';
import { DEFAULT_APTITUDE_FACTOR, DEFAULT_APTITUDE_TIER } from '../../constants';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { RandomSource } from '../deps';
import { createInitialNpcUniverse } from '../npc/factory';
import { PersistentActor } from '../npc/types';
import { EMPTY_EXCHANGE } from './shared';
import { SimulationWorld, WorldRikishi } from './types';

export const createSimulationWorld = (rng: RandomSource): SimulationWorld => {
  const universe = createInitialNpcUniverse(rng);
  if (!universe.registry.has(PLAYER_ACTOR_ID)) {
    universe.registry.set(PLAYER_ACTOR_ID, {
      actorId: PLAYER_ACTOR_ID,
      actorType: 'PLAYER',
      id: PLAYER_ACTOR_ID,
      seedId: 'PLAYER',
      shikona: 'PLAYER',
      stableId: 'stable-001',
      division: 'Maezumo',
      currentDivision: 'Maezumo',
      rankScore: 1,
      basePower: 60,
      ability: 60,
      uncertainty: 2,
      form: 1,
      volatility: 1.2,
      styleBias: 'BALANCE',
      heightCm: 180,
      weightKg: 130,
      growthBias: 0,
      aptitudeTier: DEFAULT_APTITUDE_TIER,
      aptitudeFactor: DEFAULT_APTITUDE_FACTOR,
      retirementBias: 0,
      retirementProfile: 'STANDARD',
      entryAge: 15,
      age: 15,
      careerBashoCount: 0,
      active: true,
      entrySeq: 0,
      recentBashoResults: [],
    });
  }
  const toWorldRikishi = (npc: PersistentActor): WorldRikishi => ({
    id: npc.id,
    shikona: npc.shikona,
    division: npc.currentDivision === 'Makuuchi' || npc.currentDivision === 'Juryo'
      ? npc.currentDivision
      : 'Juryo',
    stableId: npc.stableId,
    basePower: npc.basePower,
    ability: npc.ability,
    uncertainty: npc.uncertainty,
    growthBias: npc.growthBias,
    rankScore: npc.rankScore,
    volatility: npc.volatility,
    form: npc.form,
    styleBias: npc.styleBias,
    heightCm: npc.heightCm,
    weightKg: npc.weightKg,
    aptitudeTier: npc.aptitudeTier,
    aptitudeFactor: npc.aptitudeFactor,
  });

  return {
    rosters: {
      Makuuchi: universe.rosters.Makuuchi.map(toWorldRikishi),
      Juryo: universe.rosters.Juryo.map(toWorldRikishi),
    },
    lowerRosterSeeds: {
      Makushita: universe.rosters.Makushita,
      Sandanme: universe.rosters.Sandanme,
      Jonidan: universe.rosters.Jonidan,
      Jonokuchi: universe.rosters.Jonokuchi,
    },
    maezumoPool: universe.maezumoPool,
    actorRegistry: universe.registry,
    npcRegistry: universe.registry,
    npcNameContext: universe.nameContext,
    nextNpcSerial: universe.nextNpcSerial,
    lastBashoResults: {},
    recentSekitoriHistory: new Map<string, BashoRecordHistorySnapshot[]>(),
    ozekiKadobanById: new Map<string, boolean>(),
    ozekiReturnById: new Map<string, boolean>(),
    lastAllocations: [],
    lastExchange: { ...EMPTY_EXCHANGE },
    lastSanyakuQuota: {},
    lastPlayerAssignedRank: undefined,
    lastPlayerAllocation: undefined,
    makuuchiLayout: { ...DEFAULT_MAKUUCHI_LAYOUT },
  };
};
