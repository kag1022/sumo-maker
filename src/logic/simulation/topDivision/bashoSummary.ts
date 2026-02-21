import { DEFAULT_MAKUUCHI_LAYOUT } from '../../ranking/banzukeLayout';
import { Rank } from '../../models';
import type { MakuuchiLayout } from '../../ranking/banzukeLayout';
import type { NpcBashoAggregate, PlayerBoutDetail } from '../basho';
import { formatKinboshiTitle } from '../titles';
import { resolveTopDivisionRank } from './rank';
import { resolveYushoResolution } from '../yusho';

export const isKinboshiEligibleRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' && rank.name === '前頭';

export const addAbsentBoutDetails = (
  target: PlayerBoutDetail[],
  startDay: number,
  totalBouts: number,
): void => {
  for (let day = startDay; day <= totalBouts; day += 1) {
    target.push({ day, result: 'ABSENT' });
  }
};

export const toNpcAggregateFromTopDivision = (
  division: 'Makuuchi' | 'Juryo',
  participants: Array<{
    id: string;
    shikona: string;
    isPlayer: boolean;
    rankScore: number;
    wins: number;
    losses: number;
  }>,
  numBouts: number,
  options?: {
    yushoWinnerId?: string;
    specialPrizesById?: Map<string, string[]>;
    kinboshiById?: Map<string, number>;
    makuuchiLayout?: MakuuchiLayout;
  },
): NpcBashoAggregate[] => {
  const yushoWinnerId =
    options?.yushoWinnerId ??
    resolveYushoResolution(
      participants.map((participant) => ({
        id: participant.id,
        wins: participant.wins,
        losses: participant.losses,
        rankScore: participant.rankScore,
      })),
      () => 0.5,
    ).winnerId;

  return participants
    .filter((participant) => !participant.isPlayer)
    .map((participant) => {
      const rank = resolveTopDivisionRank(
        division,
        participant.rankScore,
        options?.makuuchiLayout ?? DEFAULT_MAKUUCHI_LAYOUT,
      );
      const absent = Math.max(0, numBouts - (participant.wins + participant.losses));
      const specialPrizes = options?.specialPrizesById?.get(participant.id) ?? [];
      const kinboshi = options?.kinboshiById?.get(participant.id) ?? 0;
      return {
        entityId: participant.id,
        shikona: participant.shikona,
        division,
        rankName: rank.name,
        rankNumber: rank.number,
        rankSide: rank.side,
        wins: participant.wins,
        losses: participant.losses,
        absent,
        titles: [
          ...(participant.id === yushoWinnerId ? ['YUSHO'] : []),
          ...specialPrizes,
          ...(kinboshi > 0 ? [formatKinboshiTitle(kinboshi)] : []),
        ],
      };
    });
};
