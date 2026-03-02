import {
  DEFAULT_MAKUUCHI_LAYOUT,
  MakuuchiLayout,
  resolveTopDivisionRankValueFromRank,
} from '../../banzuke/scale/banzukeLayout';
import { Rank } from '../../models';
import { normalizePlayerAssignedRank } from '../topDivision/playerNormalization';
import { resolvePlayerSanyakuQuota } from '../topDivision/banzuke';
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
  const resolvedSanyakuQuota = resolvePlayerSanyakuQuota(
    normalizedAssignedRank ?? world.lastPlayerAssignedRank,
  );
  const assigned = normalizedAssignedRank ?? world.lastPlayerAssignedRank;
  const assignPromote = Boolean(
    assigned && rank.division === 'Juryo' && assigned.division === 'Makuuchi',
  );
  const assignDemote = Boolean(
    assigned && rank.division === 'Makuuchi' && assigned.division === 'Juryo',
  );

  if (topDivision === 'Makuuchi') {
    return {
      canDemoteToJuryo: assignDemote || world.lastExchange.playerDemotedToJuryo,
      enforcedSanyaku: resolvedSanyakuQuota.enforcedSanyaku,
      assignedNextRank: normalizedAssignedRank,
      nextIsOzekiKadoban: world.lastPlayerAllocation?.nextIsOzekiKadoban,
      nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
    };
  }
  return {
    canPromoteToMakuuchi: assignPromote || world.lastExchange.playerPromotedToMakuuchi,
    assignedNextRank: normalizedAssignedRank,
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
