import { BashoRecord, CollectionTier, Rank, RikishiStatus } from '../models';
import { formatHighestRankDisplayName, getRankValueForChart } from '../ranking';

export const CLEAR_SCORE_VERSION = 3;

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

export type CareerClearScoreCategoryKey =
  | 'RANK_REACHED'
  | 'WINS_BUILT'
  | 'HONORS_RECORDED'
  | 'CAREER_CHARACTER';

export interface CareerClearScoreItem {
  label: string;
  detail: string;
  score: number;
}

export interface CareerClearScoreCategory {
  key: CareerClearScoreCategoryKey;
  label: string;
  detail: string;
  score: number;
  maxScore: number;
  items: CareerClearScoreItem[];
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
  categories: CareerClearScoreCategory[];
  featuredBadgeKeys: CareerRecordBadgeKey[];
  badges: CareerRecordBadge[];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundScore = (value: number): number => Math.round(value);

const sumItems = (items: CareerClearScoreItem[], maxScore: number): number =>
  clamp(roundScore(items.reduce((sum, item) => sum + item.score, 0)), 0, maxScore);

const resolveMaxRankScore = (rank: Rank): number => {
  const number = rank.number ?? 1;
  if (rank.name === '横綱') return 1350;
  if (rank.name === '大関') return 1150;
  if (rank.name === '関脇') return 1000;
  if (rank.name === '小結') return 920;
  if (rank.division === 'Makuuchi') return roundScore(clamp(840 - number * 8, 650, 820));
  if (rank.division === 'Juryo') return roundScore(clamp(590 - number * 10, 410, 570));
  if (rank.division === 'Makushita') return roundScore(clamp(420 - number * 3, 235, 410));
  if (rank.division === 'Sandanme') return roundScore(clamp(330 - number * 1.35, 170, 315));
  if (rank.division === 'Jonidan') return roundScore(clamp(190 - number * 0.8, 95, 178));
  if (rank.division === 'Jonokuchi') return roundScore(clamp(118 - number * 0.72, 58, 110));
  return 35;
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

const countJunYusho = (records: BashoRecord[]): number =>
  records.filter((record) => record.junYusho).length;

const countKachikoshi = (records: BashoRecord[]): number =>
  records.filter((record) => record.wins > record.losses).length;

const resolveRankMovementStats = (
  records: BashoRecord[],
): { maxRise: number; maxDrop: number; peakIndex: number } => {
  const rankedRecords = records.filter((record) => record.rank.division !== 'Maezumo');
  if (!rankedRecords.length) return { maxRise: 0, maxDrop: 0, peakIndex: -1 };
  const values = rankedRecords.map((record) => getRankValueForChart(record.rank));
  let maxRise = 0;
  let maxDrop = 0;
  let peakIndex = 0;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] < values[peakIndex]) peakIndex = index;
    if (index === 0) continue;
    maxRise = Math.max(maxRise, values[index - 1] - values[index]);
    maxDrop = Math.max(maxDrop, values[index] - values[index - 1]);
  }
  return { maxRise, maxDrop, peakIndex };
};

const buildScoreCategory = (
  key: CareerClearScoreCategoryKey,
  label: string,
  detail: string,
  maxScore: number,
  items: CareerClearScoreItem[],
): CareerClearScoreCategory => ({
  key,
  label,
  detail,
  maxScore,
  items: items.filter((item) => item.score > 0),
  score: sumItems(items, maxScore),
});

const buildClearScoreCategories = (
  status: RikishiStatus,
  options: {
    rankScore: number;
    makuuchiBasho: number;
    sekitoriBasho: number;
    sanshoCount: number;
    kinboshiCount: number;
    doubleDigitWins: number;
    maxKachikoshiStreak: number;
  },
): CareerClearScoreCategory[] => {
  const { history } = status;
  const records = history.records;
  const totalDecisions = history.totalWins + history.totalLosses;
  const winRate = totalDecisions > 0 ? history.totalWins / totalDecisions : 0;
  const kachikoshiCount = countKachikoshi(records);
  const junYushoCount = countJunYusho(records);
  const movement = resolveRankMovementStats(records);
  const peakLate = movement.peakIndex >= Math.floor(records.length * 0.62) && records.length >= 18;
  const rankLabel = formatHighestRankDisplayName(history.maxRank);

  const rankCategory = buildScoreCategory(
    'RANK_REACHED',
    '到達した地位',
    '最高位と関取到達を評価',
    1450,
    [
      {
        label: '最高位',
        detail: `${rankLabel}まで番付を上げた`,
        score: options.rankScore,
      },
      {
        label: '幕内在位',
        detail: `${options.makuuchiBasho}場所`,
        score: Math.min(80, options.makuuchiBasho * 2.2),
      },
      {
        label: '関取在位',
        detail: `${options.sekitoriBasho}場所`,
        score: Math.min(50, options.sekitoriBasho * 1.1),
      },
    ],
  );

  const winsCategory = buildScoreCategory(
    'WINS_BUILT',
    '積み上げた白星',
    '通算勝利、勝率、勝ち越しの安定を評価',
    420,
    [
      {
        label: '通算勝利',
        detail: `${history.totalWins}勝`,
        score: Math.min(180, history.totalWins * 0.45),
      },
      {
        label: '勝率上積み',
        detail: totalDecisions > 0 ? `通算勝率 ${(winRate * 100).toFixed(1)}%` : '取組なし',
        score: Math.max(0, Math.min(75, (winRate - 0.5) * 350)),
      },
      {
        label: '勝ち越し',
        detail: `${kachikoshiCount}場所`,
        score: Math.min(42, kachikoshiCount * 1.6),
      },
      {
        label: '連続勝ち越し',
        detail: `${options.maxKachikoshiStreak}場所連続`,
        score: options.maxKachikoshiStreak >= 3 ? Math.min(30, options.maxKachikoshiStreak * 5) : 0,
      },
    ],
  );

  const honorsCategory = buildScoreCategory(
    'HONORS_RECORDED',
    '記録に残る実績',
    '優勝、三賞、金星、二桁勝利を評価',
    1100,
    [
      {
        label: '幕内優勝',
        detail: `${history.yushoCount.makuuchi}回`,
        score: history.yushoCount.makuuchi * 180,
      },
      {
        label: '十両優勝',
        detail: `${history.yushoCount.juryo}回`,
        score: history.yushoCount.juryo * 75,
      },
      {
        label: '下位優勝',
        detail: `${history.yushoCount.makushita + history.yushoCount.others}回`,
        score: history.yushoCount.makushita * 45 + history.yushoCount.others * 22,
      },
      {
        label: '準優勝',
        detail: `${junYushoCount}回`,
        score: Math.min(120, junYushoCount * 35),
      },
      {
        label: '三賞',
        detail: `${options.sanshoCount}回`,
        score: Math.min(180, options.sanshoCount * 36),
      },
      {
        label: '金星',
        detail: `${options.kinboshiCount}個`,
        score: Math.min(150, options.kinboshiCount * 30),
      },
      {
        label: '二桁勝利',
        detail: `${options.doubleDigitWins}場所`,
        score: Math.min(130, options.doubleDigitWins * 22),
      },
    ],
  );

  const characterCategory = buildScoreCategory(
    'CAREER_CHARACTER',
    'この一代らしさ',
    '長さ、浮沈、晩成、終盤の伸びを評価',
    420,
    [
      {
        label: '在位の長さ',
        detail: `${records.length}場所`,
        score: Math.min(170, records.length * 2.25),
      },
      {
        label: '番付上昇幅',
        detail: movement.maxRise > 0 ? `番付推移で最大${Math.round(movement.maxRise)}相当上昇` : '大きな上昇なし',
        score: Math.min(95, movement.maxRise * 0.9),
      },
      {
        label: '浮沈の大きさ',
        detail: movement.maxDrop > 0 ? `番付推移で最大${Math.round(movement.maxDrop)}相当下降` : '大きな下降なし',
        score: movement.maxDrop >= 35 ? Math.min(60, movement.maxDrop * 0.45) : 0,
      },
      {
        label: '晩成の山',
        detail: peakLate ? 'キャリア後半に最高位を更新' : '最高位は前半から中盤',
        score: peakLate ? 55 : 0,
      },
      {
        label: '休まず残した記録',
        detail: history.totalAbsent > 0 ? `${history.totalAbsent}休` : '休場なし',
        score: history.totalAbsent === 0 && records.length >= 18 ? 40 : 0,
      },
    ],
  );

  return [rankCategory, winsCategory, honorsCategory, characterCategory];
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
  const maxRankLabel = formatHighestRankDisplayName(history.maxRank);
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
  const makuuchiBasho = countMakuuchiBasho(records);
  const sekitoriBasho = countSekitoriBasho(records);
  const sanshoCount = countSansho(records);
  const kinboshiCount = countKinboshi(records);
  const doubleDigitWins = countDoubleDigitWins(records);
  const maxKachikoshiStreak = resolveMaxKachikoshiStreak(records);
  const rankScore = resolveMaxRankScore(history.maxRank);
  const badges = buildCareerRecordBadges(status);
  const recordBonus = badges.reduce((sum, badge) => sum + badge.scoreBonus, 0);
  const categories = buildClearScoreCategories(status, {
    rankScore,
    makuuchiBasho,
    sekitoriBasho,
    sanshoCount,
    kinboshiCount,
    doubleDigitWins,
    maxKachikoshiStreak,
  });
  const competitiveScore = categories.reduce((sum, category) => sum + category.score, 0);

  return {
    version: CLEAR_SCORE_VERSION,
    clearScore: competitiveScore,
    competitiveScore,
    recordBonus,
    rankScore,
    categories,
    featuredBadgeKeys: badges.slice(0, 3).map((badge) => badge.key),
    badges,
  };
};
