import { Rank } from '../../../models';
import { PlayerSekitoriQuota, SekitoriBoundaryWorld } from '../types';

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
      assignedNextRank: world.lastExchange.playerDemotedToMakushita ? boundaryAssigned : undefined,
    };
  }
  if (rank.division === 'Makushita') {
    const boundaryAssigned =
      assigned && assigned.division === 'Juryo' ? assigned : undefined;
    return {
      canPromoteToJuryo: world.lastExchange.playerPromotedToJuryo,
      assignedNextRank: world.lastExchange.playerPromotedToJuryo ? boundaryAssigned : undefined,
    };
  }
  return undefined;
};
