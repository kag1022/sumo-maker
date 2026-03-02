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
    return {
      canDemoteToSandanme: assignDemote || world.lastExchanges.MakushitaSandanme.playerDemotedToLower,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Makushita,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  if (rank.division === 'Sandanme') {
    return {
      canPromoteToMakushita: assignPromote || world.lastExchanges.MakushitaSandanme.playerPromotedToUpper,
      canDemoteToJonidan: assignDemote || world.lastExchanges.SandanmeJonidan.playerDemotedToLower,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Sandanme,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  if (rank.division === 'Jonidan') {
    return {
      canPromoteToSandanme: assignPromote || world.lastExchanges.SandanmeJonidan.playerPromotedToUpper,
      canDemoteToJonokuchi: assignDemote || world.lastExchanges.JonidanJonokuchi.playerDemotedToLower,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Jonidan,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  if (rank.division === 'Jonokuchi') {
    return {
      canPromoteToJonidan: assignPromote || world.lastExchanges.JonidanJonokuchi.playerPromotedToUpper,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Jonokuchi,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  return undefined;
};
