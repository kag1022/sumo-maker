import { Rank } from '../../../models';
import { clamp } from '../../boundary/shared';
import {
  BoundarySnapshot,
  MAKUSHITA_POOL_SIZE,
  PlayerMakushitaRecord,
} from '../types';

const resolvePlayerMakushitaRankScore = (rank: Rank): number => {
  const number = clamp(rank.number || 1, 1, 60);
  const sideOffset = rank.side === 'West' ? 1 : 0;
  return clamp(1 + (number - 1) * 2 + sideOffset, 1, MAKUSHITA_POOL_SIZE);
};

export const mergePlayerMakushitaRecord = (
  baseResults: BoundarySnapshot[],
  playerRecord?: PlayerMakushitaRecord,
): BoundarySnapshot[] => {
  if (!playerRecord || playerRecord.rank.division !== 'Makushita') {
    return baseResults;
  }

  const playerSnapshot: BoundarySnapshot = {
    id: 'PLAYER',
    shikona: playerRecord.shikona,
    isPlayer: true,
    stableId: playerRecord.stableId ?? 'stable-001',
    rankScore: resolvePlayerMakushitaRankScore(playerRecord.rank),
    wins: playerRecord.wins,
    losses: playerRecord.losses + playerRecord.absent,
  };

  return baseResults.filter((result) => result.id !== 'PLAYER').concat(playerSnapshot);
};
