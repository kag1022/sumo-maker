import { BashoRecord, CollectionTier, Rank, RikishiStatus } from '../models';
import { getRankValueForChart } from '../ranking';

export const CLEAR_SCORE_VERSION = 1;

export type CareerRecordBadgeKey =
  | 'YOKOZUNA_REACHED'
  | 'OZEKI_REACHED'
  | 'MAKUUCHI_REACHED'
  | 'SEKITORI_REACHED'
  | 'MAKUUCHI_YUSHO'
  | 'JURYO_YUSHO'
  | 'SANSHO'
  | 'KINBOSHI'
  | 'DOUBLE_DIGIT_WINS'
  | 'HIGH_WIN_RATE'
  | 'LONG_CAREER'
  | 'KACHIKOSHI_STREAK';

export interface CareerRecordBadge {
  key: CareerRecordBadgeKey;
  label: string;
  detail: string;
  scoreBonus: number;
}

export interface CareerRecordCatalogEntry {
  key: CareerRecordBadgeKey;
  label: string;
  description: string;
  scoreBonus: number;
  isSecret?: boolean;
}

export interface CareerClearScoreSummary {
  version: typeof CLEAR_SCORE_VERSION;
  clearScore: number;
  competitiveScore: number;
  recordBonus: number;
  rankScore: number;
  featuredBadgeKeys: CareerRecordBadgeKey[];
  badges: CareerRecordBadge[];
}

const formatRankDisplayName = (rank: Rank): string => {
  if (rank.division === 'Maezumo') return '前相撲';
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

const resolveMaxRankScore = (rank: Rank): number => {
  const rankValue = Math.min(470, getRankValueForChart(rank));
  return Math.max(40, Math.round((500 - rankValue) * 0.72));
};

const countMakuuchiBasho = (records: BashoRecord[]): number =>
  records.filter((record) => record.rank.division === 'Makuuchi').length;

const countSekitoriBasho = (records: BashoRecord[]): number =>
  records.filter((record) => record.rank.division === 'Makuuchi' || record.rank.division === 'Juryo').length;

const countSansho = (records: BashoRecord[]): number =>
  records.reduce((sum, record) => sum + (record.specialPrizes?.length ?? 0), 0);

const countKinboshi = (records: BashoRecord[]): number =>
  records.reduce((sum, record) => sum + (record.kinboshi ?? 0), 0);

const countDoubleDigitWins = (records: BashoRecord[]): number =>
  records.filter((record) => record.wins >= 10).length;

const resolveMaxKachikoshiStreak = (records: BashoRecord[]): number => {
  let current = 0;
  let best = 0;
  for (const record of records) {
    if (record.wins > record.losses) {
      current += 1;
      best = Math.max(best, current);
      continue;
    }
    current = 0;
  }
  return best;
};

const createBadge = (
  key: CareerRecordBadgeKey,
  label: string,
  detail: string,
  scoreBonus: number,
): CareerRecordBadge => ({
  key,
  label,
  detail,
  scoreBonus,
});

export const resolveCareerRecordBadgeLabel = (key: CareerRecordBadgeKey): string => {
  if (key === 'YOKOZUNA_REACHED') return '横綱到達';
  if (key === 'OZEKI_REACHED') return '大関到達';
  if (key === 'MAKUUCHI_REACHED') return '幕内到達';
  if (key === 'SEKITORI_REACHED') return '関取到達';
  if (key === 'MAKUUCHI_YUSHO') return '幕内優勝';
  if (key === 'JURYO_YUSHO') return '十両優勝';
  if (key === 'SANSHO') return '三賞獲得';
  if (key === 'KINBOSHI') return '金星獲得';
  if (key === 'DOUBLE_DIGIT_WINS') return '二桁勝利';
  if (key === 'HIGH_WIN_RATE') return '高勝率';
  if (key === 'LONG_CAREER') return '長期在位';
  return '連続勝ち越し';
};

export const resolveRecordCollectionTier = (
  progress: number,
): { tier: CollectionTier; target: number } => {
  if (progress >= 5) return { tier: 'GOLD', target: 5 };
  if (progress >= 3) return { tier: 'SILVER', target: 5 };
  return { tier: 'BRONZE', target: 3 };
};

export const CAREER_RECORD_CATALOG: CareerRecordCatalogEntry[] = [
  { key: 'YOKOZUNA_REACHED', label: '横綱到達', description: '最高位が横綱に到達', scoreBonus: 95 },
  { key: 'OZEKI_REACHED', label: '大関到達', description: '最高位が大関に到達', scoreBonus: 80 },
  { key: 'MAKUUCHI_REACHED', label: '幕内到達', description: '最高位が幕内に到達', scoreBonus: 60 },
  { key: 'SEKITORI_REACHED', label: '関取到達', description: '最高位が十両以上に到達', scoreBonus: 42 },
  { key: 'MAKUUCHI_YUSHO', label: '幕内優勝', description: '幕内最高優勝を達成', scoreBonus: 105 },
  { key: 'JURYO_YUSHO', label: '十両優勝', description: '十両優勝を達成', scoreBonus: 46 },
  { key: 'SANSHO', label: '三賞獲得', description: '殊勲賞・敢闘賞・技能賞を受賞', scoreBonus: 24 },
  { key: 'KINBOSHI', label: '金星獲得', description: '平幕で横綱を破り金星を獲得', scoreBonus: 28 },
  { key: 'DOUBLE_DIGIT_WINS', label: '二桁勝利', description: '1場所で10勝以上を記録', scoreBonus: 22 },
  { key: 'HIGH_WIN_RATE', label: '高勝率', description: '長いキャリアで高い通算勝率を維持', scoreBonus: 26 },
  { key: 'LONG_CAREER', label: '長期在位', description: '長期間にわたり土俵を務め上げる', scoreBonus: 24 },
  { key: 'KACHIKOSHI_STREAK', label: '連続勝ち越し', description: '複数場所にわたり勝ち越しを継続', scoreBonus: 26 },
];

export const listCareerRecordCatalog = (): CareerRecordCatalogEntry[] =>
  CAREER_RECORD_CATALOG.map((entry) => ({ ...entry }));

export const buildCareerRecordBadges = (status: RikishiStatus): CareerRecordBadge[] => {
  const { history } = status;
  const records = history.records;
  const badges: CareerRecordBadge[] = [];
  const maxRankLabel = formatRankDisplayName(history.maxRank);
  const totalDecisions = history.totalWins + history.totalLosses;
  const winRate = totalDecisions > 0 ? history.totalWins / totalDecisions : 0;
  const sanshoCount = countSansho(records);
  const kinboshiCount = countKinboshi(records);
  const doubleDigitWins = countDoubleDigitWins(records);
  const maxKachikoshiStreak = resolveMaxKachikoshiStreak(records);

  if (history.maxRank.name === '横綱') {
    badges.push(createBadge('YOKOZUNA_REACHED', '横綱到達', `${maxRankLabel}まで昇進`, 95));
  } else if (history.maxRank.name === '大関') {
    badges.push(createBadge('OZEKI_REACHED', '大関到達', `${maxRankLabel}まで昇進`, 80));
  } else if (history.maxRank.division === 'Makuuchi') {
    badges.push(createBadge('MAKUUCHI_REACHED', '幕内到達', `${maxRankLabel}まで到達`, 60));
  } else if (history.maxRank.division === 'Juryo') {
    badges.push(createBadge('SEKITORI_REACHED', '関取到達', `${maxRankLabel}まで到達`, 42));
  }

  if (history.yushoCount.makuuchi > 0) {
    badges.push(
      createBadge('MAKUUCHI_YUSHO', '幕内優勝', `幕内優勝 ${history.yushoCount.makuuchi}回`, 105),
    );
  }
  if (history.yushoCount.juryo > 0) {
    badges.push(createBadge('JURYO_YUSHO', '十両優勝', `十両優勝 ${history.yushoCount.juryo}回`, 46));
  }
  if (sanshoCount > 0) {
    badges.push(createBadge('SANSHO', '三賞獲得', `三賞 ${sanshoCount}回`, 24));
  }
  if (kinboshiCount > 0) {
    badges.push(createBadge('KINBOSHI', '金星獲得', `金星 ${kinboshiCount}個`, 28));
  }
  if (doubleDigitWins > 0) {
    badges.push(createBadge('DOUBLE_DIGIT_WINS', '二桁勝利', `二桁勝利 ${doubleDigitWins}場所`, 22));
  }
  if (winRate >= 0.6 && totalDecisions >= 60) {
    badges.push(createBadge('HIGH_WIN_RATE', '高勝率', `通算勝率 ${(winRate * 100).toFixed(1)}%`, 26));
  }
  if (records.length >= 40) {
    badges.push(createBadge('LONG_CAREER', '長期在位', `${records.length}場所を完走`, 24));
  }
  if (maxKachikoshiStreak >= 4) {
    badges.push(
      createBadge('KACHIKOSHI_STREAK', '連続勝ち越し', `${maxKachikoshiStreak}場所連続で勝ち越し`, 26),
    );
  }

  return badges.sort((left, right) => right.scoreBonus - left.scoreBonus || left.label.localeCompare(right.label, 'ja'));
};

export const buildCareerClearScoreSummary = (status: RikishiStatus): CareerClearScoreSummary => {
  const { history } = status;
  const records = history.records;
  const totalDecisions = history.totalWins + history.totalLosses;
  const winRate = totalDecisions > 0 ? history.totalWins / totalDecisions : 0;
  const makuuchiBasho = countMakuuchiBasho(records);
  const sekitoriBasho = countSekitoriBasho(records);
  const sanshoCount = countSansho(records);
  const kinboshiCount = countKinboshi(records);
  const doubleDigitWins = countDoubleDigitWins(records);
  const rankScore = resolveMaxRankScore(history.maxRank);
  const badges = buildCareerRecordBadges(status);
  const recordBonus = badges.reduce((sum, badge) => sum + badge.scoreBonus, 0);

  const competitiveScore =
    rankScore +
    history.yushoCount.makuuchi * 150 +
    history.yushoCount.juryo * 72 +
    history.yushoCount.makushita * 34 +
    history.yushoCount.others * 12 +
    sanshoCount * 14 +
    kinboshiCount * 12 +
    Math.min(96, makuuchiBasho * 4) +
    Math.min(84, sekitoriBasho * 2) +
    Math.min(72, Math.round(records.length * 1.35)) +
    Math.min(72, doubleDigitWins * 8) +
    Math.max(0, Math.round((winRate - 0.5) * 180));

  return {
    version: CLEAR_SCORE_VERSION,
    clearScore: competitiveScore + recordBonus,
    competitiveScore,
    recordBonus,
    rankScore,
    featuredBadgeKeys: badges.slice(0, 3).map((badge) => badge.key),
    badges,
  };
};
