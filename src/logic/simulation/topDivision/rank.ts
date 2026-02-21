import { DEFAULT_MAKUUCHI_LAYOUT, MakuuchiLayout, decodeMakuuchiRankFromScore } from '../../ranking/banzukeLayout';

export type TopDivisionLike = 'Makuuchi' | 'Juryo';

export const resolveTopDivisionRank = (
  division: TopDivisionLike,
  rankScore: number,
  layout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): { name: string; number?: number; side?: 'East' | 'West' } => {
  if (division === 'Juryo') {
    const bounded = Math.max(1, Math.min(28, rankScore));
    return {
      name: '十両',
      number: Math.floor((bounded - 1) / 2) + 1,
      side: bounded % 2 === 1 ? 'East' : 'West',
    };
  }

  const rank = decodeMakuuchiRankFromScore(rankScore, layout);
  return { name: rank.name, number: rank.number, side: rank.side };
};
