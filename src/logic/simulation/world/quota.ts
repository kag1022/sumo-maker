import {
  DEFAULT_MAKUUCHI_LAYOUT,
  MakuuchiLayout,
  resolveTopDivisionRankValueFromRank,
} from '../../banzuke/scale/banzukeLayout';
import { Rank } from '../../models';
import { buildTopDivisionRecords, resolvePlayerSanyakuQuota } from '../topDivision/banzuke';
import { generateNextBanzuke } from '../../banzuke/providers/topDivision';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { decodeMakuuchiRankFromScore, resolveTopDivisionFromRank } from './shared';
import { PlayerTopDivisionQuota, SimulationWorld, TopDivision } from './types';

const resolveAssignedRankFromSharedBanzuke = (
  world: SimulationWorld,
): Rank | undefined => {
  if (world.lastPlayerAssignedRank && world.lastPlayerAllocation?.id === PLAYER_ACTOR_ID) {
    return world.lastPlayerAssignedRank;
  }
  const topDivisionRecords = buildTopDivisionRecords(world);
  if (!topDivisionRecords.some((record) => record.id === PLAYER_ACTOR_ID)) {
    return world.lastPlayerAssignedRank;
  }
  return generateNextBanzuke(topDivisionRecords).find((allocation) => allocation.id === PLAYER_ACTOR_ID)?.nextRank
    ?? world.lastPlayerAssignedRank;
};

const resolveUpperLanePressure = (world: SimulationWorld): number => {
  const makuuchi = world.lastBashoResults.Makuuchi ?? [];
  let collapse = 0;
  let blocker = 0;
  for (const row of makuuchi) {
    if (row.id === PLAYER_ACTOR_ID) continue;
    if (row.rankScore > 12) continue;
    const diff = row.wins - (row.losses + (row.absent ?? 0));
    if (diff < 0) collapse += 1;
    if (diff >= 2) blocker += 1;
  }
  return collapse - blocker;
};

const normalizeManualAssignedMakuuchiRank = (
  world: SimulationWorld,
  currentRank: Rank,
  assignedRank: Rank,
  playerResult: NonNullable<SimulationWorld['lastBashoResults']['Makuuchi']>[number],
): Rank => {
  const losses = playerResult.losses + (playerResult.absent ?? 0);
  const diff = playerResult.wins - losses;

  if (currentRank.name === '小結') {
    if (diff > 0 && assignedRank.name === '関脇') return assignedRank;
    if (diff < 0) {
      if (assignedRank.name === '前頭') {
        return { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 };
      }
      return { division: 'Makuuchi', name: '小結', side: 'East' };
    }
    return assignedRank;
  }

  if (currentRank.name === '関脇') {
    if (diff < 0 && assignedRank.name === '小結') return assignedRank;
    return assignedRank;
  }

  if (currentRank.name !== '前頭') return assignedRank;

  const currentNumber = currentRank.number ?? 17;
  if (diff > 0) {
    let targetNumber = currentNumber;
    if (diff === 1) {
      const pressureBonus = currentNumber <= 8 && resolveUpperLanePressure(world) > 0 ? 1 : 0;
      targetNumber = Math.max(1, currentNumber - 1 - pressureBonus);
    } else {
      targetNumber = Math.max(1, currentNumber - Math.min(diff, currentNumber - 1));
    }
    const targetSide =
      assignedRank.name === '前頭' && (assignedRank.number ?? 99) === targetNumber
        ? (assignedRank.side ?? 'East')
        : 'East';
    return { division: 'Makuuchi', name: '前頭', side: targetSide, number: targetNumber };
  }

  if (diff < 0) {
    const deficit = Math.abs(diff);
    const shift =
      deficit === 1
        ? 1
        : deficit <= 5
          ? deficit - 1
          : Math.min(currentNumber <= 5 ? 9 : 10, deficit + 3);
    const targetNumber = Math.min(17, currentNumber + shift);
    const targetSide =
      deficit === 1
        ? 'East'
        : currentRank.side === 'East' ? 'West' : 'East';
    return { division: 'Makuuchi', name: '前頭', side: targetSide, number: targetNumber };
  }

  return assignedRank.name === '前頭'
    ? { division: 'Makuuchi', name: '前頭', side: assignedRank.side ?? 'East', number: assignedRank.number ?? currentNumber }
    : { division: 'Makuuchi', name: '前頭', side: 'East', number: currentNumber };
};

const normalizeManualAssignedJuryoRank = (
  world: SimulationWorld,
  currentRank: Rank,
  assignedRank: Rank,
  playerResult: NonNullable<SimulationWorld['lastBashoResults']['Juryo']>[number],
): Rank => {
  if (assignedRank.division !== 'Makuuchi') return assignedRank;
  const currentNumber = currentRank.number ?? 14;
  const losses = playerResult.losses + (playerResult.absent ?? 0);
  const wins = playerResult.wins;
  const diff = wins - losses;
  const pressure = resolveUpperLanePressure(world);

  let targetNumber = currentNumber <= 2 ? 14 : currentNumber <= 4 ? 15 : 16;
  if (wins >= 15 && currentNumber <= 2) {
    targetNumber = pressure > 0 ? 10 : 11;
  } else if (wins >= 11 && currentNumber <= 2) {
    targetNumber = 14;
  } else if (wins >= 10 && currentNumber <= 4) {
    targetNumber = pressure > 0 ? 12 : 13;
  } else if (diff >= 4 && currentNumber <= 7) {
    targetNumber = pressure > 0 ? 13 : 14;
  }

  return {
    division: 'Makuuchi',
    name: '前頭',
    side: 'East',
    number: targetNumber,
  };
};

export const resolveTopDivisionQuotaForPlayer = (
  world: SimulationWorld,
  rank: Rank,
): PlayerTopDivisionQuota | undefined => {
  const topDivision = resolveTopDivisionFromRank(rank);
  if (!topDivision) return undefined;
  const resolvedAssignedRank = resolveAssignedRankFromSharedBanzuke(world);
  const playerResult = (
    rank.division === 'Makuuchi' ? world.lastBashoResults.Makuuchi : world.lastBashoResults.Juryo
  )?.find((entry) => entry.id === PLAYER_ACTOR_ID);
  const resolvedSanyakuQuota = resolvePlayerSanyakuQuota(
    resolvedAssignedRank,
    {
      currentRank: rank,
      isKachikoshi: playerResult ? playerResult.wins > playerResult.losses + (playerResult.absent ?? 0) : false,
      nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
    },
  );
  const manualAssignedRank =
    !world.lastPlayerAllocation &&
    rank.division === 'Makuuchi' &&
    playerResult &&
    world.lastPlayerAssignedRank?.division === 'Makuuchi'
      ? normalizeManualAssignedMakuuchiRank(world, rank, world.lastPlayerAssignedRank, playerResult)
      : undefined;
  const juryoPlayerResult =
    rank.division === 'Juryo'
      ? world.lastBashoResults.Juryo?.find((entry) => entry.id === PLAYER_ACTOR_ID)
      : undefined;
  const manualJuryoAssignedRank =
    !world.lastPlayerAllocation &&
    rank.division === 'Juryo' &&
    juryoPlayerResult &&
    world.lastPlayerAssignedRank
      ? normalizeManualAssignedJuryoRank(world, rank, world.lastPlayerAssignedRank, juryoPlayerResult)
      : undefined;
  const manualSanyakuAssigned =
    !world.lastPlayerAllocation &&
    rank.division === 'Makuuchi' &&
    (rank.name === '関脇' || rank.name === '小結') &&
    world.lastPlayerAssignedRank?.division === 'Makuuchi' &&
    (world.lastPlayerAssignedRank.name === '関脇' || world.lastPlayerAssignedRank.name === '小結')
      ? world.lastPlayerAssignedRank
      : undefined;
  const assigned = manualSanyakuAssigned ?? manualAssignedRank ?? manualJuryoAssignedRank ?? resolvedAssignedRank;
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
    assignedNextRank: assignPromote ? assigned : undefined,
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
