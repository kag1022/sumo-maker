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
  BoundarySnapshot,
  EMPTY_EXCHANGE,
  PlayerMakushitaRecord,
  PlayerSekitoriQuota,
  SekitoriBoundaryWorld,
  SekitoriExchange,
} from './sekitori/types';
import { resolveSekitoriBoundaryAssignedRank } from '../ranking/sekitoriExpectedCommittee';

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
): SekitoriExchange => {
  boundaryWorld.lastPlayerJuryoHalfStepNudge = 0;
  boundaryWorld.npcRegistry = lowerWorld?.npcRegistry ?? topWorld.npcRegistry;
  if (lowerWorld) {
    boundaryWorld.makushitaPool = lowerWorld.rosters.Makushita as typeof boundaryWorld.makushitaPool;
  }

  const makushitaBase =
    lowerWorld?.lastResults.Makushita && lowerWorld.lastResults.Makushita.length
      ? lowerWorld.lastResults.Makushita
      : simulateMakushitaBoundaryBasho(boundaryWorld, rng);
  const makushitaResults = mergePlayerMakushitaRecord(makushitaBase, playerMakushitaRecord);
  const juryoRaw = topWorld.lastBashoResults.Juryo ?? [];
  const playerJuryoRow = juryoRaw.find((result) => result.id === 'PLAYER');
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
  const forcedDemotedIds = demotedToMakushitaIds.includes('PLAYER')
    ? demotedToMakushitaIds
    : playerJuryoFullAbsence
      ? [...demotedToMakushitaIds, 'PLAYER']
      : demotedToMakushitaIds;
  const forcedPromotedIds =
    playerJuryoFullAbsence && forcedDemotedIds.length > promotedToJuryoIds.length
      ? [
        ...promotedToJuryoIds,
        (
          promotionPool.find((candidate) => !promotedToJuryoIds.includes(candidate.id))?.id ??
          makushitaResults.find((result) => result.id !== 'PLAYER')?.id ??
          makushitaResults[0]?.id
        ) as string,
      ].filter((id, index, arr) => Boolean(id) && arr.indexOf(id) === index)
      : promotedToJuryoIds;
  const resolvedSlots = playerJuryoFullAbsence ? Math.max(1, resolved.slots) : resolved.slots;

  boundaryWorld.lastExchange = {
    slots: resolvedSlots,
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
  if (rank.division === 'Juryo') {
    return {
      canDemoteToMakushita: world.lastExchange.playerDemotedToMakushita,
      enemyHalfStepNudge: world.lastPlayerJuryoHalfStepNudge,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  if (rank.division === 'Makushita') {
    return {
      canPromoteToJuryo: world.lastExchange.playerPromotedToJuryo,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  return undefined;
};
