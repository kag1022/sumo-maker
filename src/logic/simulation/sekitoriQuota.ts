import { Rank } from '../models';
import { RandomSource } from './deps';
import { computeNeighborHalfStepNudge } from './boundary/shared';
import { SimulationWorld } from './world';
import { LowerDivisionQuotaWorld } from './lowerQuota';
import {
  buildJuryoDemotionCandidates,
  buildJuryoFallbackDemotionCandidates,
  buildMakushitaFallbackPromotionCandidates,
  buildMakushitaPromotionCandidates,
  resolveExchangeSlots,
} from './sekitori/candidates';
import {
  applyNpcExchange,
  createSekitoriMakushitaPool,
  mergePlayerMakushitaRecord,
  simulateMakushitaBoundaryBasho,
} from './sekitori/pool';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from './modelVersion';
import {
  BoundarySnapshot,
  EMPTY_EXCHANGE,
  PlayerMakushitaRecord,
  PlayerSekitoriQuota,
  SekitoriBoundaryWorld,
  SekitoriExchange,
} from './sekitori/types';
import { resolveSekitoriBoundaryAssignedRank } from '../banzuke/providers/sekitoriBoundary';

export type {
  PlayerSekitoriQuota,
  SekitoriBoundaryWorld,
  SekitoriExchange,
};

export const createSekitoriBoundaryWorld = (rng: RandomSource): SekitoriBoundaryWorld => ({
  makushitaPool: createSekitoriMakushitaPool(rng),
  lastMakushitaResults: [],
  lastExchange: { ...EMPTY_EXCHANGE },
  lastPlayerJuryoHalfStepNudge: 0,
  lastPlayerAssignedRank: undefined,
  npcRegistry: undefined,
});

export const runSekitoriQuotaStep = (
  topWorld: SimulationWorld,
  boundaryWorld: SekitoriBoundaryWorld,
  rng: RandomSource,
  playerMakushitaRecord?: PlayerMakushitaRecord,
  lowerWorld?: LowerDivisionQuotaWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): SekitoriExchange => {
  boundaryWorld.lastPlayerJuryoHalfStepNudge = 0;
  boundaryWorld.npcRegistry = lowerWorld?.npcRegistry ?? topWorld.npcRegistry;
  if (lowerWorld) {
    boundaryWorld.makushitaPool = lowerWorld.rosters.Makushita as typeof boundaryWorld.makushitaPool;
  }

  const makushitaBase =
    lowerWorld?.lastResults.Makushita && lowerWorld.lastResults.Makushita.length
      ? lowerWorld.lastResults.Makushita
      : simulateMakushitaBoundaryBasho(boundaryWorld, rng, simulationModelVersion);
  const makushitaResults = mergePlayerMakushitaRecord(makushitaBase, playerMakushitaRecord);
  const playerMakushitaRow = makushitaResults.find((result) => result.id === 'PLAYER');
  const playerMakushitaIsKachikoshi = Boolean(
    playerMakushitaRow && playerMakushitaRow.wins > playerMakushitaRow.losses,
  );
  const juryoRaw = topWorld.lastBashoResults.Juryo ?? [];
  const playerJuryoRow = juryoRaw.find((result) => result.id === 'PLAYER');
  const playerJuryoIsMakekoshi = Boolean(
    playerJuryoRow &&
    (playerJuryoRow.wins <
      (playerJuryoRow.losses +
        (playerJuryoRow.absent ?? Math.max(0, 15 - (playerJuryoRow.wins + playerJuryoRow.losses))))),
  );
  const playerJuryoFullAbsence = Boolean(
    playerJuryoRow &&
    (playerJuryoRow.absent ?? Math.max(0, 15 - (playerJuryoRow.wins + playerJuryoRow.losses))) >= 15,
  );
  const juryoResults: BoundarySnapshot[] = juryoRaw.map((result) => ({
    id: result.id,
    shikona: result.shikona,
    isPlayer: result.isPlayer,
    stableId: result.stableId,
    rankScore: result.rankScore,
    wins: result.wins,
    losses:
      result.losses +
      (result.absent ?? Math.max(0, 15 - (result.wins + result.losses))),
  }));
  boundaryWorld.lastPlayerJuryoHalfStepNudge = computeNeighborHalfStepNudge(juryoResults);

  if (!juryoResults.length || !makushitaResults.length) {
    boundaryWorld.lastExchange = { ...EMPTY_EXCHANGE };
    return boundaryWorld.lastExchange;
  }

  let demotionPool = buildJuryoDemotionCandidates(juryoResults);
  let promotionPool = buildMakushitaPromotionCandidates(makushitaResults);
  const mandatoryPromotions = promotionPool.filter((candidate) => candidate.mandatory).length;
  if (!demotionPool.length && !promotionPool.length) {
    demotionPool = buildJuryoFallbackDemotionCandidates(juryoResults, new Set<string>());
    promotionPool = buildMakushitaFallbackPromotionCandidates(
      makushitaResults,
      new Set<string>(),
    );
  }

  if (promotionPool.length && (demotionPool.length === 0 || mandatoryPromotions > demotionPool.length)) {
    const exclude = new Set(demotionPool.map((candidate) => candidate.id));
    const fallbackDemotions = buildJuryoFallbackDemotionCandidates(juryoResults, exclude);
    const minimumDemotions = Math.min(juryoResults.length, Math.max(1, mandatoryPromotions));
    demotionPool = demotionPool.concat(fallbackDemotions).slice(0, minimumDemotions);
  }
  if (demotionPool.length && (promotionPool.length === 0 || demotionPool.length > promotionPool.length)) {
    const exclude = new Set(promotionPool.map((candidate) => candidate.id));
    const fallbackPromotions = buildMakushitaFallbackPromotionCandidates(makushitaResults, exclude);
    const minimumPromotions = Math.min(
      makushitaResults.length,
      Math.max(1, demotionPool.length),
    );
    promotionPool = promotionPool.concat(fallbackPromotions).slice(0, minimumPromotions);
  }

  const resolved = resolveExchangeSlots(demotionPool, promotionPool);
  const demotedToMakushitaIds = resolved.demotions.map((candidate) => candidate.id);
  const promotedToJuryoIds = resolved.promotions.map((candidate) => candidate.id);
  const forcedDemotedIdsRaw = demotedToMakushitaIds.includes('PLAYER')
    ? demotedToMakushitaIds
    : playerJuryoFullAbsence
      ? [...demotedToMakushitaIds, 'PLAYER']
      : demotedToMakushitaIds;
  const forcedPromotedIdsRaw =
    playerJuryoFullAbsence && forcedDemotedIdsRaw.length > promotedToJuryoIds.length
      ? [
        ...promotedToJuryoIds,
        (
          promotionPool.find((candidate) => !promotedToJuryoIds.includes(candidate.id))?.id ??
          makushitaResults.find((result) => result.id !== 'PLAYER')?.id ??
          makushitaResults[0]?.id
        ) as string,
      ].filter((id, index, arr) => Boolean(id) && arr.indexOf(id) === index)
      : promotedToJuryoIds;
  const forcedDemotedIds = forcedDemotedIdsRaw.filter((id) =>
    id !== 'PLAYER' || playerJuryoFullAbsence || playerJuryoIsMakekoshi);
  const forcedPromotedIds = forcedPromotedIdsRaw.filter((id) =>
    id !== 'PLAYER' || playerMakushitaIsKachikoshi);
  const resolvedSlots = playerJuryoFullAbsence ? Math.max(1, resolved.slots) : resolved.slots;
  const normalizedSlots = Math.min(resolvedSlots, forcedPromotedIds.length, forcedDemotedIds.length);

  boundaryWorld.lastExchange = {
    slots: normalizedSlots,
    promotedToJuryoIds: forcedPromotedIds,
    demotedToMakushitaIds: forcedDemotedIds,
    playerPromotedToJuryo: forcedPromotedIds.includes('PLAYER'),
    playerDemotedToMakushita: forcedDemotedIds.includes('PLAYER'),
    reason: playerJuryoFullAbsence ? 'MANDATORY_ABSENCE_DEMOTION' : 'NORMAL',
  };
  boundaryWorld.lastPlayerAssignedRank = resolveSekitoriBoundaryAssignedRank(
    juryoResults,
    makushitaResults,
    boundaryWorld.lastExchange,
    playerJuryoFullAbsence,
  );

  applyNpcExchange(topWorld, boundaryWorld, forcedPromotedIds, forcedDemotedIds);
  if (lowerWorld) {
    lowerWorld.rosters.Makushita = boundaryWorld.makushitaPool as unknown as LowerDivisionQuotaWorld['rosters']['Makushita'];
  }
  return boundaryWorld.lastExchange;
};

export const resolveSekitoriQuotaForPlayer = (
  world: SekitoriBoundaryWorld,
  rank: Rank,
): PlayerSekitoriQuota | undefined => {
  const assigned = world.lastPlayerAssignedRank;
  if (rank.division === 'Juryo') {
    const boundaryAssigned =
      assigned && assigned.division === 'Makushita' ? assigned : undefined;
    return {
      canDemoteToMakushita: world.lastExchange.playerDemotedToMakushita,
      enemyHalfStepNudge: world.lastPlayerJuryoHalfStepNudge,
      assignedNextRank: boundaryAssigned,
    };
  }
  if (rank.division === 'Makushita') {
    const boundaryAssigned =
      assigned && assigned.division === 'Juryo' ? assigned : undefined;
    return {
      canPromoteToJuryo: world.lastExchange.playerPromotedToJuryo,
      assignedNextRank: boundaryAssigned,
    };
  }
  return undefined;
};
