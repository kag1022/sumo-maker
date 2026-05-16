import type { Rank, RankSpecialStatus } from '../models';

export type RankDisplayLocale = 'ja' | 'en';

export const RANK_SPECIAL_STATUS_LABELS: Record<Exclude<RankSpecialStatus, 'NONE'>, string> = {
  MAKUSHITA_BOTTOM_TSUKEDASHI: '幕下最下位格付出',
  SANDANME_BOTTOM_TSUKEDASHI: '三段目最下位格付出',
};

const RANK_SPECIAL_STATUS_EN_LABELS: Record<Exclude<RankSpecialStatus, 'NONE'>, string> = {
  MAKUSHITA_BOTTOM_TSUKEDASHI: 'Makushita bottom tsukedashi',
  SANDANME_BOTTOM_TSUKEDASHI: 'Sandanme bottom tsukedashi',
};

const TOP_RANK_EN_LABELS: Record<string, string> = {
  横綱: 'Yokozuna',
  大関: 'Ozeki',
  関脇: 'Sekiwake',
  小結: 'Komusubi',
};

const DIVISION_EN_LABELS: Record<string, string> = {
  Makuuchi: 'Maegashira',
  Juryo: 'Juryo',
  Makushita: 'Makushita',
  Sandanme: 'Sandanme',
  Jonidan: 'Jonidan',
  Jonokuchi: 'Jonokuchi',
  Maezumo: 'Maezumo',
};

const SIDE_EN_LABELS: Record<string, string> = {
  East: 'E',
  West: 'W',
};

const formatRankSpecialStatusLabel = (
  status: Exclude<RankSpecialStatus, 'NONE'>,
  locale: RankDisplayLocale,
): string =>
  locale === 'en' ? RANK_SPECIAL_STATUS_EN_LABELS[status] : RANK_SPECIAL_STATUS_LABELS[status];

const resolveRankNameLabel = (rank: Rank, locale: RankDisplayLocale): string => {
  if (locale === 'en') {
    return TOP_RANK_EN_LABELS[rank.name] ?? DIVISION_EN_LABELS[rank.division] ?? rank.name;
  }
  return rank.name;
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

export const formatRankDisplayName = (
  rank: Rank,
  locale: RankDisplayLocale = 'ja',
): string => {
  if (rank.specialStatus && rank.specialStatus !== 'NONE') {
    return formatRankSpecialStatusLabel(rank.specialStatus, locale);
  }
  if (rank.division === 'Maezumo') return locale === 'en' ? 'Maezumo' : '前相撲';
  if (locale === 'en') {
    const side = rank.side ? SIDE_EN_LABELS[rank.side] : '';
    const prefix = side ? `${side} ` : '';
    const rankName = resolveRankNameLabel(rank, locale);
    if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${prefix}${rankName}`;
    const number = rank.number || 1;
    return `${prefix}${rankName} ${number}`;
  }
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

export const formatHighestRankDisplayName = (
  rank: Rank,
  locale: RankDisplayLocale = 'ja',
): string => {
  if (rank.specialStatus && rank.specialStatus !== 'NONE') {
    return formatRankSpecialStatusLabel(rank.specialStatus, locale);
  }
  if (rank.division === 'Maezumo') return locale === 'en' ? 'Maezumo' : '前相撲';
  if (locale === 'en') {
    const rankName = resolveRankNameLabel(rank, locale);
    if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return rankName;
    const number = rank.number || 1;
    return `${rankName} ${number}`;
  }
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
  locale: RankDisplayLocale = 'ja',
): string => {
  if (!nextRank) return '-';
  if (Math.abs(deltaValue) < 0.01) return locale === 'en' ? 'No change' : '変動なし';
  if (resolveMovementCategory(currentRank) !== resolveMovementCategory(nextRank)) {
    const target = resolveMovementTargetLabel(nextRank);
    if (deltaValue > 0) {
      if (locale === 'en') {
        return nextRank.division === 'Makuuchi' && !isNamedTopRank(nextRank)
          ? 'Top division debut'
          : `Promoted to ${formatHighestRankDisplayName(nextRank, 'en')}`;
      }
      return nextRank.division === 'Makuuchi' && !isNamedTopRank(nextRank) ? '入幕' : `${target}昇進`;
    }
    if (locale === 'en') return `Dropped to ${formatHighestRankDisplayName(nextRank, 'en')}`;
    if (nextRank.division === 'Juryo') return '十両陥落';
    if (nextRank.division === 'Makushita') return '幕下陥落';
    return `${target}降下`;
  }
  return locale === 'en'
    ? `${deltaValue > 0 ? '+' : ''}${deltaValue} slots`
    : deltaValue > 0 ? `+${deltaValue}枚` : `${deltaValue}枚`;
};
