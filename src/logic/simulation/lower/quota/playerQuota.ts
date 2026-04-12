import { Rank } from '../../../models';
import {
  LowerDivisionQuotaWorld,
  PlayerLowerDivisionQuota,
} from '../../lower/types';

export const resolveLowerDivisionQuotaForPlayer = (
  world: LowerDivisionQuotaWorld,
  rank: Rank,
): PlayerLowerDivisionQuota | undefined => {
  const assigned = world.lastPlayerAssignedRank;
  const assignPromote =
    assigned &&
    ((rank.division === 'Sandanme' && assigned.division === 'Makushita') ||
      (rank.division === 'Jonidan' && assigned.division === 'Sandanme') ||
      (rank.division === 'Jonokuchi' && assigned.division === 'Jonidan'));
  const assignDemote =
    assigned &&
    ((rank.division === 'Makushita' && assigned.division === 'Sandanme') ||
      (rank.division === 'Sandanme' && assigned.division === 'Jonidan') ||
      (rank.division === 'Jonidan' && assigned.division === 'Jonokuchi'));

  if (rank.division === 'Makushita') {
    const canDemote = Boolean(world.lastExchanges.MakushitaSandanme.playerDemotedToLower);
    return {
      canDemoteToSandanme: canDemote,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Makushita,
      assignedNextRank: canDemote && assignDemote ? world.lastPlayerAssignedRank : undefined,
    };
  }
  if (rank.division === 'Sandanme') {
    const canPromote = Boolean(world.lastExchanges.MakushitaSandanme.playerPromotedToUpper);
    const canDemote = Boolean(world.lastExchanges.SandanmeJonidan.playerDemotedToLower);
    return {
      canPromoteToMakushita: canPromote,
      canDemoteToJonidan: canDemote,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Sandanme,
      assignedNextRank:
        (canPromote && assignPromote) || (canDemote && assignDemote)
          ? world.lastPlayerAssignedRank
          : undefined,
    };
  }
  if (rank.division === 'Jonidan') {
    const canPromote = Boolean(world.lastExchanges.SandanmeJonidan.playerPromotedToUpper);
    const canDemote = Boolean(world.lastExchanges.JonidanJonokuchi.playerDemotedToLower);
    return {
      canPromoteToSandanme: canPromote,
      canDemoteToJonokuchi: canDemote,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Jonidan,
      assignedNextRank:
        (canPromote && assignPromote) || (canDemote && assignDemote)
          ? world.lastPlayerAssignedRank
          : undefined,
    };
  }
  if (rank.division === 'Jonokuchi') {
    const canPromote = Boolean(world.lastExchanges.JonidanJonokuchi.playerPromotedToUpper);
    return {
      canPromoteToJonidan: canPromote,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Jonokuchi,
      assignedNextRank: canPromote && assignPromote ? world.lastPlayerAssignedRank : undefined,
    };
  }
  return undefined;
};
