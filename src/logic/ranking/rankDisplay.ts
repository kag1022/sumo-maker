import type { Rank, RankSpecialStatus } from '../models';

export const RANK_SPECIAL_STATUS_LABELS: Record<Exclude<RankSpecialStatus, 'NONE'>, string> = {
  MAKUSHITA_BOTTOM_TSUKEDASHI: '幕下最下位格付出',
  SANDANME_BOTTOM_TSUKEDASHI: '三段目最下位格付出',
};

export const createMakushitaBottomTsukedashiRank = (): Rank => ({
  division: 'Makushita',
  name: '幕下',
  number: 60,
  specialStatus: 'MAKUSHITA_BOTTOM_TSUKEDASHI',
});

export const createSandanmeBottomTsukedashiRank = (): Rank => ({
  division: 'Sandanme',
  name: '三段目',
  number: 100,
  specialStatus: 'SANDANME_BOTTOM_TSUKEDASHI',
});

export const stripRankSpecialStatus = (rank: Rank): Rank => {
  const nextRank = { ...rank };
  delete nextRank.specialStatus;
  return nextRank;
};

export const formatRankDisplayName = (rank: Rank): string => {
  if (rank.specialStatus && rank.specialStatus !== 'NONE') {
    return RANK_SPECIAL_STATUS_LABELS[rank.specialStatus];
  }
  if (rank.division === 'Maezumo') return '前相撲';
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}枚目`;
};
