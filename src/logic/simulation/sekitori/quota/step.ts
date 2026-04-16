import { resolveSekitoriBoundaryAssignedRank } from '../../../banzuke/providers/sekitoriBoundary';
import { RandomSource } from '../../deps';
import { LowerDivisionQuotaWorld } from '../../lowerQuota';

import { applyNpcExchange } from '../pool/applyExchange';
import { createSekitoriMakushitaPool } from '../pool/factory';
import { mergePlayerMakushitaRecord } from '../pool/mergePlayer';
import { simulateMakushitaBoundaryBasho } from '../pool/simulate';
import {
  BoundarySnapshot,
  EMPTY_EXCHANGE,
  PlayerMakushitaRecord,
  SekitoriBoundaryWorld,
  SekitoriExchange,
} from '../types';
import { computeNeighborHalfStepNudge } from '../../boundary/shared';
import { SimulationWorld } from '../../world';
import { resolveSekitoriExchangePolicy } from './exchangePolicy';

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

  const resolved = resolveSekitoriExchangePolicy({
    juryoResults,
    makushitaResults,
    playerJuryoIsMakekoshi,
    playerJuryoFullAbsence,
    playerMakushitaIsKachikoshi,
  });

  boundaryWorld.lastExchange = resolved.exchange;
  boundaryWorld.lastPlayerAssignedRank = resolveSekitoriBoundaryAssignedRank(
    juryoResults,
    makushitaResults,
    boundaryWorld.lastExchange,
    playerJuryoFullAbsence,
  );

  applyNpcExchange(
    topWorld,
    boundaryWorld,
    resolved.promotedToJuryoIds,
    resolved.demotedToMakushitaIds,
  );
  if (lowerWorld) {
    lowerWorld.rosters.Makushita = boundaryWorld.makushitaPool as unknown as LowerDivisionQuotaWorld['rosters']['Makushita'];
  }
  return boundaryWorld.lastExchange;
};
