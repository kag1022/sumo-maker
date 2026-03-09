import { ENEMY_BODY_METRIC_BASE } from '../../../catalog/enemyData';
import { RandomSource } from '../../deps';
import { createInitialNpcUniverse } from '../../npc/factory';
import { PersistentNpc } from '../../npc/types';
import {
  EMPTY_EXCHANGE,
  LowerDivision,
  LowerDivisionQuotaWorld,
  LowerNpc,
} from '../../lower/types';
import { SimulationWorld } from '../../world';

const toLowerNpc = (division: LowerDivision, npc: LowerNpc | PersistentNpc): LowerNpc => ({
  ...npc,
  division,
  currentDivision: division,
  styleBias: npc.styleBias ?? 'BALANCE',
  heightCm: npc.heightCm ?? ENEMY_BODY_METRIC_BASE[division].heightCm,
  weightKg: npc.weightKg ?? ENEMY_BODY_METRIC_BASE[division].weightKg,
  active: npc.active ?? true,
  recentBashoResults: npc.recentBashoResults ?? [],
});

export const createLowerDivisionQuotaWorld = (
  rng: RandomSource,
  sourceWorld?: SimulationWorld,
): LowerDivisionQuotaWorld => {
  const universe = createInitialNpcUniverse(rng);
  const seedRosters = sourceWorld?.lowerRosterSeeds ?? {
    Makushita: universe.rosters.Makushita,
    Sandanme: universe.rosters.Sandanme,
    Jonidan: universe.rosters.Jonidan,
    Jonokuchi: universe.rosters.Jonokuchi,
  };
  const npcRegistry = sourceWorld?.npcRegistry ?? universe.registry;
  const npcNameContext = sourceWorld?.npcNameContext ?? universe.nameContext;
  const nextNpcSerial = sourceWorld?.nextNpcSerial ?? universe.nextNpcSerial;
  const maezumoPool = sourceWorld?.maezumoPool ?? universe.maezumoPool;

  return {
    rosters: {
      Makushita: seedRosters.Makushita.map((npc) => toLowerNpc('Makushita', npc)),
      Sandanme: seedRosters.Sandanme.map((npc) => toLowerNpc('Sandanme', npc)),
      Jonidan: seedRosters.Jonidan.map((npc) => toLowerNpc('Jonidan', npc)),
      Jonokuchi: seedRosters.Jonokuchi.map((npc) => toLowerNpc('Jonokuchi', npc)),
    },
    maezumoPool: maezumoPool.map((npc) => ({
      ...npc,
      division: 'Maezumo',
      currentDivision: 'Maezumo',
      rankScore: 1,
      active: npc.active ?? true,
      recentBashoResults: npc.recentBashoResults ?? [],
    })),
    lastResults: {},
    lastExchanges: {
      MakushitaSandanme: { ...EMPTY_EXCHANGE },
      SandanmeJonidan: { ...EMPTY_EXCHANGE },
      JonidanJonokuchi: { ...EMPTY_EXCHANGE },
    },
    lastPlayerHalfStepNudge: {
      Makushita: 0,
      Sandanme: 0,
      Jonidan: 0,
      Jonokuchi: 0,
    },
    lastPlayerAssignedRank: undefined,
    lastPlacementTrace: [],
    npcRegistry,
    npcNameContext,
    nextNpcSerial,
    lastMaezumoPromotions: [],
  };
};
