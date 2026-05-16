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
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

export const formatHighestRankDisplayName = (rank: Rank): string => {
  if (rank.specialStatus && rank.specialStatus !== 'NONE') {
    return RANK_SPECIAL_STATUS_LABELS[rank.specialStatus];
  }
  if (rank.division === 'Maezumo') return '前相撲';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return rank.name;
  const number = rank.number || 1;
  return number === 1 ? `${rank.name}筆頭` : `${rank.name}${number}枚目`;
};

const isNamedTopRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' && ['横綱', '大関', '関脇', '小結'].includes(rank.name);

const resolveMovementCategory = (rank: Rank): string => {
  if (isNamedTopRank(rank)) return rank.name;
  return rank.division === 'Makuuchi' ? '前頭' : rank.division;
};

const resolveMovementTargetLabel = (rank: Rank): string => {
  if (rank.name === '横綱') return '横綱';
  if (rank.name === '大関') return '大関';
  if (rank.name === '関脇') return '関脇';
  if (rank.name === '小結') return '小結';
  if (rank.division === 'Makuuchi') return '平幕';
  if (rank.division === 'Juryo') return '十両';
  if (rank.division === 'Makushita') return '幕下';
  if (rank.division === 'Sandanme') return '三段目';
  if (rank.division === 'Jonidan') return '序二段';
  if (rank.division === 'Jonokuchi') return '序ノ口';
  return '前相撲';
};

export const formatRankMovementDisplay = (
  currentRank: Rank,
  nextRank: Rank | undefined,
  deltaValue: number,
): string => {
  if (!nextRank) return '-';
  if (Math.abs(deltaValue) < 0.01) return '変動なし';
  if (resolveMovementCategory(currentRank) !== resolveMovementCategory(nextRank)) {
    const target = resolveMovementTargetLabel(nextRank);
    if (deltaValue > 0) {
      return nextRank.division === 'Makuuchi' && !isNamedTopRank(nextRank) ? '入幕' : `${target}昇進`;
    }
    if (nextRank.division === 'Juryo') return '十両陥落';
    if (nextRank.division === 'Makushita') return '幕下陥落';
    return `${target}降下`;
  }
  return deltaValue > 0 ? `+${deltaValue}枚` : `${deltaValue}枚`;
};
