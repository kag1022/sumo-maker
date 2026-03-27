import { resolveLowerDivisionPlacements } from '../banzuke/providers/lowerBoundary';
import { BanzukeEngineVersion } from '../banzuke/types';
import { computeNeighborHalfStepNudge } from './boundary/shared';
import { RandomSource } from './deps';
import {
  BoundarySnapshot,
  LowerBoundaryExchange,
  LowerBoundaryId,
  LowerDivision,
  LowerDivisionQuotaWorld,
  PlayerLowerDivisionQuota,
  PlayerLowerRecord,
} from './lower/types';

import { buildPlacementTrace } from './lower/quota/placementTrace';
import {
  applyLowerDivisionPlacements,
  deriveExchangesFromPlacements,
  mergePlayerRecord,
} from './lower/quota/placements';
import { evolveLowerLeagueFromSnapshots } from './lower/quota/rosterEvolution';
import {
  LowerLeagueSnapshots,
  simulateLowerLeagueBasho,
} from './lower/quota/leagueSimulation';
import { promoteMaezumoToJonokuchi } from './lower/quota/maezumoPromotion';
import { createLowerDivisionQuotaWorld } from './lower/quota/worldFactory';
import { resolveLowerDivisionQuotaForPlayer } from './lower/quota/playerQuota';
import { pruneRetiredLowerRosters } from './lower/quota/prune';

export type {
  LowerBoundaryExchange,
  LowerDivisionQuotaWorld,
  PlayerLowerDivisionQuota,
};
export type { LowerLeagueSnapshots };

export {
  createLowerDivisionQuotaWorld,
  resolveLowerDivisionQuotaForPlayer,
  pruneRetiredLowerRosters,
};

export const runLowerDivisionQuotaStep = (
  world: LowerDivisionQuotaWorld,
  rng: RandomSource,
  playerRecord?: PlayerLowerRecord,
  precomputedLeagueResults?: LowerLeagueSnapshots,
  banzukeEngineVersion: BanzukeEngineVersion = 'optimizer-v2',
): Record<LowerBoundaryId, LowerBoundaryExchange> => {
  promoteMaezumoToJonokuchi(world, rng);
  const lowerLeagueRaw =
    precomputedLeagueResults ??
    simulateLowerLeagueBasho(world, rng);
  if (precomputedLeagueResults) {
    evolveLowerLeagueFromSnapshots(world, lowerLeagueRaw, rng);
  }
  const slotsByDivision: Record<LowerDivision, number> = {
    Makushita: world.rosters.Makushita.length,
    Sandanme: world.rosters.Sandanme.length,
    Jonidan: world.rosters.Jonidan.length,
    Jonokuchi: world.rosters.Jonokuchi.length,
  };
  const results: Record<LowerDivision, BoundarySnapshot[]> = {
    Makushita: mergePlayerRecord(lowerLeagueRaw.Makushita, 'Makushita', playerRecord, slotsByDivision),
    Sandanme: mergePlayerRecord(lowerLeagueRaw.Sandanme, 'Sandanme', playerRecord, slotsByDivision),
    Jonidan: mergePlayerRecord(lowerLeagueRaw.Jonidan, 'Jonidan', playerRecord, slotsByDivision),
    Jonokuchi: mergePlayerRecord(lowerLeagueRaw.Jonokuchi, 'Jonokuchi', playerRecord, slotsByDivision),
  };
  world.lastPlayerHalfStepNudge = {
    Makushita: computeNeighborHalfStepNudge(results.Makushita),
    Sandanme: computeNeighborHalfStepNudge(results.Sandanme),
    Jonidan: computeNeighborHalfStepNudge(results.Jonidan),
    Jonokuchi: computeNeighborHalfStepNudge(results.Jonokuchi),
  };

  world.lastResults = results;
  const placementResolution = resolveLowerDivisionPlacements(
    results,
    playerRecord,
    banzukeEngineVersion,
  );
  world.lastPlacementTrace = buildPlacementTrace(results, placementResolution.placements);
  applyLowerDivisionPlacements(world, placementResolution.placements);
  world.lastExchanges = deriveExchangesFromPlacements(results, placementResolution.placements);
  world.lastPlayerAssignedRank = placementResolution.playerAssignedRank;

  return world.lastExchanges;
};
