import {
  DEFAULT_MAKUUCHI_LAYOUT,
  MakuuchiLayout,
  resolveTopDivisionRankValueFromRank,
} from '../../banzuke/scale/banzukeLayout';
import { Rank } from '../../models';
import { normalizePlayerAssignedRank } from '../topDivision/playerNormalization';
import { resolvePlayerSanyakuQuota } from '../topDivision/banzuke';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { decodeMakuuchiRankFromScore, resolveTopDivisionFromRank } from './shared';
import { PlayerTopDivisionQuota, SimulationWorld, TopDivision } from './types';

export const resolveTopDivisionQuotaForPlayer = (
  world: SimulationWorld,
  rank: Rank,
): PlayerTopDivisionQuota | undefined => {
  const topDivision = resolveTopDivisionFromRank(rank);
  if (!topDivision) return undefined;
  const normalizedAssignedRank =
    world.lastPlayerAssignedRank && world.lastPlayerAssignedRank.division === 'Makuuchi'
      ? normalizePlayerAssignedRank(world, rank, world.lastPlayerAssignedRank)
      : undefined;
  const playerResult = (
    rank.division === 'Makuuchi' ? world.lastBashoResults.Makuuchi : world.lastBashoResults.Juryo
  )?.find((entry) => entry.id === PLAYER_ACTOR_ID);
  const resolvedSanyakuQuota = resolvePlayerSanyakuQuota(
    normalizedAssignedRank ?? world.lastPlayerAssignedRank,
    {
      currentRank: rank,
      isKachikoshi: playerResult ? playerResult.wins > playerResult.losses + (playerResult.absent ?? 0) : false,
      nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
    },
  );
  const assigned = normalizedAssignedRank ?? world.lastPlayerAssignedRank;
  const canPromoteToMakuuchi = Boolean(
    world.lastExchange.playerPromotedToMakuuchi,
  );
  const canDemoteToJuryo = Boolean(
    world.lastExchange.playerDemotedToJuryo,
  );
  const assignPromote = Boolean(
    assigned && rank.division === 'Juryo' && assigned.division === 'Makuuchi',
  ) && canPromoteToMakuuchi;
  const assignDemote = Boolean(
    assigned && rank.division === 'Makuuchi' && assigned.division === 'Juryo',
  ) && canDemoteToJuryo;

  if (topDivision === 'Makuuchi') {
    return {
      canDemoteToJuryo: canDemoteToJuryo,
      enforcedSanyaku: resolvedSanyakuQuota.enforcedSanyaku,
      assignedNextRank:
        assigned?.division === 'Makuuchi' || assignDemote
          ? assigned
          : undefined,
      nextIsOzekiKadoban: world.lastPlayerAllocation?.nextIsOzekiKadoban,
      nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
    };
  }
  return {
    canPromoteToMakuuchi: canPromoteToMakuuchi,
    assignedNextRank: assignPromote ? normalizedAssignedRank : undefined,
    nextIsOzekiKadoban: world.lastPlayerAllocation?.nextIsOzekiKadoban,
    nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
  };
};

export const resolveTopDivisionRankValue = (
  division: TopDivision,
  rankScore: number,
  makuuchiLayout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): number => {
  if (division === 'Juryo') return 6;
  const rank = decodeMakuuchiRankFromScore(rankScore, makuuchiLayout);
  return resolveTopDivisionRankValueFromRank(rank);
};
