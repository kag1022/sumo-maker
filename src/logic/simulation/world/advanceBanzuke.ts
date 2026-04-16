import { generateNextBanzuke } from '../../banzuke/providers/topDivision';
import { BanzukeAllocation } from '../../banzuke/providers/sekitori/types';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import {
  applyBanzukeToRosters,
  buildTopDivisionRecords,
  resolvePlayerSanyakuQuota,
} from '../topDivision/banzuke';
import { EMPTY_EXCHANGE, resolvePlayerRankScore } from './shared';
import { SimulationWorld } from './types';

export const advanceTopDivisionBanzuke = (world: SimulationWorld): void => {
  const makuuchiResults = world.lastBashoResults.Makuuchi ?? [];
  const juryoResults = world.lastBashoResults.Juryo ?? [];
  world.lastAllocations = [];
  world.lastPlayerAssignedRank = undefined;
  world.lastPlayerAllocation = undefined;
  world.lastSanyakuQuota = {};
  if (!makuuchiResults.length || !juryoResults.length) {
    world.lastExchange = { ...EMPTY_EXCHANGE };
    return;
  }

  const topDivisionRecords = buildTopDivisionRecords(world);
  const allocations: BanzukeAllocation[] = generateNextBanzuke(topDivisionRecords);
  world.lastAllocations = allocations;

  const promotedToMakuuchiIds = allocations
    .filter(
      (allocation) =>
        allocation.currentRank.division === 'Juryo' && allocation.nextRank.division === 'Makuuchi',
    )
    .map((allocation) => allocation.id);
  const demotedToJuryoIds = allocations
    .filter(
      (allocation) =>
        allocation.currentRank.division === 'Makuuchi' && allocation.nextRank.division === 'Juryo',
    )
    .map((allocation) => allocation.id);

  world.lastExchange = {
    slots: Math.min(promotedToMakuuchiIds.length, demotedToJuryoIds.length),
    promotedToMakuuchiIds,
    demotedToJuryoIds,
    playerPromotedToMakuuchi: promotedToMakuuchiIds.includes(PLAYER_ACTOR_ID),
    playerDemotedToJuryo: demotedToJuryoIds.includes(PLAYER_ACTOR_ID),
  };

  for (const allocation of allocations) {
    world.ozekiKadobanById.set(allocation.id, allocation.nextIsOzekiKadoban);
    world.ozekiReturnById.set(allocation.id, allocation.nextIsOzekiReturn);
  }

  const playerAllocation = allocations.find((allocation) => allocation.id === PLAYER_ACTOR_ID);
  const playerRecord = topDivisionRecords.find((record) => record.id === PLAYER_ACTOR_ID);
  world.lastPlayerAllocation = playerAllocation;
  world.lastPlayerAssignedRank = playerAllocation?.nextRank;
  world.lastSanyakuQuota = resolvePlayerSanyakuQuota(world.lastPlayerAssignedRank, {
    currentRank: playerAllocation?.currentRank,
    isKachikoshi:
      playerRecord ? playerRecord.wins > playerRecord.losses + playerRecord.absent : false,
    nextIsOzekiReturn: playerAllocation?.nextIsOzekiReturn,
  });
  applyBanzukeToRosters(world, allocations, (rank, layout) =>
    resolvePlayerRankScore(rank, layout),
  );

  for (const division of ['Makuuchi', 'Juryo'] as const) {
    for (const rikishi of world.rosters[division]) {
      const registryNpc = world.npcRegistry.get(rikishi.id);
      if (!registryNpc) continue;
      registryNpc.division = division;
      registryNpc.currentDivision = division;
      registryNpc.rankScore = rikishi.rankScore;
      registryNpc.basePower = rikishi.basePower;
      registryNpc.ability = rikishi.ability;
      registryNpc.uncertainty = rikishi.uncertainty;
      registryNpc.growthBias = rikishi.growthBias;
      registryNpc.form = rikishi.form;
      registryNpc.volatility = rikishi.volatility;
      registryNpc.styleBias = rikishi.styleBias;
      registryNpc.heightCm = rikishi.heightCm;
      registryNpc.weightKg = rikishi.weightKg;
      registryNpc.aptitudeTier = rikishi.aptitudeTier;
      registryNpc.aptitudeFactor = rikishi.aptitudeFactor;
      rikishi.shikona = registryNpc.shikona;
    }
  }
};
