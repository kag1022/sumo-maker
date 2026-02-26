import { RikishiStatus, Rank } from './models';

export type AchievementRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type AchievementCategory =
  | 'YUSHO'
  | 'ZENSHO'
  | 'WINS'
  | 'AGE'
  | 'IRONMAN'
  | 'STREAK'
  | 'RAPID_PROMOTION'
  | 'SANSHO'
  | 'GRAND_SLAM'
  | 'KINBOSHI'
  | 'KIMARITE_VARIETY'
  | 'FIRST_STEP';
export type AchievementIconKey =
  | 'trophy'
  | 'sparkles'
  | 'swords'
  | 'timer'
  | 'sun'
  | 'rocket'
  | 'medal'
  | 'ladder'
  | 'star'
  | 'shield'
  | 'seedling';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  rarity: AchievementRarity;
  iconKey: AchievementIconKey;
  category: AchievementCategory;
  tier: number;
}

// Helper to check rank division
const isMakuuchi = (rank: Rank) => rank.division === 'Makuuchi';
const hasPrize = (prizes: string[], code: 'SHUKUN' | 'KANTO' | 'GINO'): boolean => {
  if (code === 'SHUKUN') return prizes.includes('SHUKUN') || prizes.includes('殊勲賞');
  if (code === 'KANTO') return prizes.includes('KANTO') || prizes.includes('敢闘賞');
  return prizes.includes('GINO') || prizes.includes('技能賞');
};

type AchievementContext = {
  yushoMakuuchi: number;
  yushoJuryo: number;
  yushoMakushita: number;
  totalWins: number;
  totalAbsent: number;
  age: number;
  bashoCount: number;
  zenshoCount: number;
  maxKachiKoshiStreak: number;
  firstMakuuchiIdx: number;
  shukun: number;
  kanto: number;
  gino: number;
  totalSansho: number;
  kinboshiTotal: number;
  kimariteVarietyCount: number;
};

type AchievementRule = Achievement & {
  isUnlocked: (context: AchievementContext) => boolean;
};

const RULES: AchievementRule[] = [
  {
    id: 'YUSHO_1',
    name: '賜杯の重み',
    description: '幕内最高優勝を達成',
    rarity: 'RARE',
    iconKey: 'trophy',
    category: 'YUSHO',
    tier: 1,
    isUnlocked: (c) => c.yushoMakuuchi >= 1,
  },
  {
    id: 'YUSHO_10',
    name: '名横綱',
    description: '幕内優勝10回を達成',
    rarity: 'EPIC',
    iconKey: 'trophy',
    category: 'YUSHO',
    tier: 2,
    isUnlocked: (c) => c.yushoMakuuchi >= 10,
  },
  {
    id: 'YUSHO_20',
    name: '大横綱',
    description: '幕内優勝20回以上を達成',
    rarity: 'LEGENDARY',
    iconKey: 'trophy',
    category: 'YUSHO',
    tier: 3,
    isUnlocked: (c) => c.yushoMakuuchi >= 20,
  },
  {
    id: 'ZENSHO_1',
    name: '完全優勝',
    description: '幕内全勝優勝を達成',
    rarity: 'EPIC',
    iconKey: 'sparkles',
    category: 'ZENSHO',
    tier: 1,
    isUnlocked: (c) => c.zenshoCount >= 1,
  },
  {
    id: 'ZENSHO_5',
    name: '無敵艦隊',
    description: '幕内全勝優勝を5回達成',
    rarity: 'LEGENDARY',
    iconKey: 'sparkles',
    category: 'ZENSHO',
    tier: 2,
    isUnlocked: (c) => c.zenshoCount >= 5,
  },
  {
    id: 'WINS_100',
    name: '百勝到達',
    description: '通算100勝を達成',
    rarity: 'COMMON',
    iconKey: 'swords',
    category: 'WINS',
    tier: 1,
    isUnlocked: (c) => c.totalWins >= 100,
  },
  {
    id: 'WINS_300',
    name: '勝ち星街道',
    description: '通算300勝を達成',
    rarity: 'RARE',
    iconKey: 'swords',
    category: 'WINS',
    tier: 2,
    isUnlocked: (c) => c.totalWins >= 300,
  },
  {
    id: 'WINS_500',
    name: '名力士の証',
    description: '通算500勝を達成',
    rarity: 'RARE',
    iconKey: 'swords',
    category: 'WINS',
    tier: 3,
    isUnlocked: (c) => c.totalWins >= 500,
  },
  {
    id: 'WINS_1000',
    name: '千勝力士',
    description: '通算1000勝を達成',
    rarity: 'LEGENDARY',
    iconKey: 'swords',
    category: 'WINS',
    tier: 4,
    isUnlocked: (c) => c.totalWins >= 1000,
  },
  {
    id: 'AGE_35',
    name: '熟練の域',
    description: '35歳以上まで現役を続行',
    rarity: 'RARE',
    iconKey: 'timer',
    category: 'AGE',
    tier: 1,
    isUnlocked: (c) => c.age >= 35,
  },
  {
    id: 'AGE_40',
    name: '生涯現役',
    description: '40歳以上まで現役を続行',
    rarity: 'EPIC',
    iconKey: 'timer',
    category: 'AGE',
    tier: 2,
    isUnlocked: (c) => c.age >= 40,
  },
  {
    id: 'IRONMAN_30',
    name: '頑健不動',
    description: '5年間（30場所）以上、無休場',
    rarity: 'RARE',
    iconKey: 'shield',
    category: 'IRONMAN',
    tier: 1,
    isUnlocked: (c) => c.bashoCount >= 30 && c.totalAbsent === 0,
  },
  {
    id: 'IRONMAN',
    name: '鉄の肉体',
    description: '10年間（60場所）以上、無休場',
    rarity: 'EPIC',
    iconKey: 'shield',
    category: 'IRONMAN',
    tier: 2,
    isUnlocked: (c) => c.bashoCount >= 60 && c.totalAbsent === 0,
  },
  {
    id: 'STREAK_8',
    name: '上昇気流',
    description: '幕内で8場所連続勝ち越し',
    rarity: 'COMMON',
    iconKey: 'sun',
    category: 'STREAK',
    tier: 1,
    isUnlocked: (c) => c.maxKachiKoshiStreak >= 8,
  },
  {
    id: 'STREAK_15',
    name: '安定勢力',
    description: '幕内で15場所連続勝ち越し',
    rarity: 'RARE',
    iconKey: 'sun',
    category: 'STREAK',
    tier: 2,
    isUnlocked: (c) => c.maxKachiKoshiStreak >= 15,
  },
  {
    id: 'STREAK_30',
    name: '黄金時代',
    description: '幕内で30場所連続勝ち越し',
    rarity: 'LEGENDARY',
    iconKey: 'sun',
    category: 'STREAK',
    tier: 3,
    isUnlocked: (c) => c.maxKachiKoshiStreak >= 30,
  },
  {
    id: 'RAPID_PROMOTION_18',
    name: '急成長株',
    description: '入門から18場所以内で新入幕',
    rarity: 'RARE',
    iconKey: 'rocket',
    category: 'RAPID_PROMOTION',
    tier: 1,
    isUnlocked: (c) => c.firstMakuuchiIdx !== -1 && c.firstMakuuchiIdx <= 18,
  },
  {
    id: 'RAPID_PROMOTION',
    name: 'スピード出世',
    description: '入門から12場所以内で新入幕',
    rarity: 'EPIC',
    iconKey: 'rocket',
    category: 'RAPID_PROMOTION',
    tier: 2,
    isUnlocked: (c) => c.firstMakuuchiIdx !== -1 && c.firstMakuuchiIdx <= 12,
  },
  {
    id: 'SANSHO_3',
    name: '三賞の芽',
    description: '三賞を合計3回以上受賞',
    rarity: 'COMMON',
    iconKey: 'medal',
    category: 'SANSHO',
    tier: 1,
    isUnlocked: (c) => c.totalSansho >= 3,
  },
  {
    id: 'SANSHO_10',
    name: '三賞常連',
    description: '三賞を合計10回以上受賞',
    rarity: 'RARE',
    iconKey: 'medal',
    category: 'SANSHO',
    tier: 2,
    isUnlocked: (c) => c.totalSansho >= 10,
  },
  {
    id: 'SANSHO_ALL',
    name: '万能型力士',
    description: '殊勲・敢闘・技能賞を各5回以上受賞',
    rarity: 'EPIC',
    iconKey: 'medal',
    category: 'SANSHO',
    tier: 3,
    isUnlocked: (c) => c.shukun >= 5 && c.kanto >= 5 && c.gino >= 5,
  },
  {
    id: 'GRAND_SLAM',
    name: 'グランドスラム',
    description: '幕下・十両・幕内の各段で優勝',
    rarity: 'EPIC',
    iconKey: 'ladder',
    category: 'GRAND_SLAM',
    tier: 1,
    isUnlocked: (c) => c.yushoJuryo > 0 && c.yushoMakushita > 0 && c.yushoMakuuchi > 0,
  },
  {
    id: 'KINBOSHI_1',
    name: '金星ハンター',
    description: '金星を1個以上獲得',
    rarity: 'RARE',
    iconKey: 'star',
    category: 'KINBOSHI',
    tier: 1,
    isUnlocked: (c) => c.kinboshiTotal >= 1,
  },
  {
    id: 'KINBOSHI_5',
    name: '横綱キラー',
    description: '金星を5個以上獲得',
    rarity: 'EPIC',
    iconKey: 'star',
    category: 'KINBOSHI',
    tier: 2,
    isUnlocked: (c) => c.kinboshiTotal >= 5,
  },
  {
    id: 'KIMARITE_10',
    name: '技の博覧会',
    description: '通算10種類以上の決まり手で勝利',
    rarity: 'EPIC',
    iconKey: 'sparkles',
    category: 'KIMARITE_VARIETY',
    tier: 1,
    isUnlocked: (c) => c.kimariteVarietyCount >= 10,
  },
];

const FIRST_STEP_FALLBACK: Achievement = {
  id: 'FIRST_STEP',
  name: '土俵への一歩',
  description: '大相撲の舞台で初勝利を挙げる',
  rarity: 'COMMON',
  iconKey: 'seedling',
  category: 'FIRST_STEP',
  tier: 1,
};

const RARITY_ORDER: Record<AchievementRarity, number> = {
  LEGENDARY: 0,
  EPIC: 1,
  RARE: 2,
  COMMON: 3,
};

const toContext = (status: RikishiStatus): AchievementContext => {
  const { history, age } = status;
  const { records, yushoCount, totalWins, totalAbsent } = history;

  const makuuchiRecords = records.filter(r => isMakuuchi(r.rank));
  const bashoCount = records.length;
  const zenshoCount = makuuchiRecords.filter(r => r.wins === 15 && r.yusho).length;
  let kachiKoshiStreak = 0;
  let maxKachiKoshiStreak = 0;
  for (const r of makuuchiRecords) {
    if (r.wins >= 8) {
      kachiKoshiStreak++;
      if (kachiKoshiStreak > maxKachiKoshiStreak) maxKachiKoshiStreak = kachiKoshiStreak;
    } else {
      kachiKoshiStreak = 0;
    }
  }
  const firstMakuuchiIdx = records.findIndex(r => isMakuuchi(r.rank));
  let shukun = 0, kanto = 0, gino = 0;
  for (const r of makuuchiRecords) {
    if (hasPrize(r.specialPrizes, 'SHUKUN')) shukun++;
    if (hasPrize(r.specialPrizes, 'KANTO')) kanto++;
    if (hasPrize(r.specialPrizes, 'GINO')) gino++;
  }
  const totalSansho = shukun + kanto + gino;
  const kinboshiTotal = makuuchiRecords.reduce((sum, r) => sum + (r.kinboshi || 0), 0);
  const kimariteVarietyCount = Object.entries(history.kimariteTotal || {}).filter(([, count]) => count > 0).length;

  return {
    yushoMakuuchi: yushoCount.makuuchi,
    yushoJuryo: yushoCount.juryo,
    yushoMakushita: yushoCount.makushita,
    totalWins,
    totalAbsent,
    age,
    bashoCount,
    zenshoCount,
    maxKachiKoshiStreak,
    firstMakuuchiIdx,
    shukun,
    kanto,
    gino,
    totalSansho,
    kinboshiTotal,
    kimariteVarietyCount,
  };
};

const toDisplayAchievements = (unlocked: Achievement[]): Achievement[] => {
  const bestByCategory = new Map<AchievementCategory, Achievement>();
  for (const achievement of unlocked) {
    const current = bestByCategory.get(achievement.category);
    if (!current || achievement.tier > current.tier) {
      bestByCategory.set(achievement.category, achievement);
    }
  }
  return Array.from(bestByCategory.values()).sort((a, b) => {
    const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
    if (rarityDiff !== 0) return rarityDiff;
    if (a.category === b.category) return b.tier - a.tier;
    return a.category.localeCompare(b.category);
  });
};

export const evaluateAchievementProgress = (status: RikishiStatus): { unlocked: Achievement[]; display: Achievement[] } => {
  const context = toContext(status);
  const unlocked = RULES
    .filter((rule) => rule.isUnlocked(context))
    .map(({ isUnlocked: _isUnlocked, ...achievement }) => achievement)
    .sort((a, b) => {
      const rarityDiff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
      if (rarityDiff !== 0) return rarityDiff;
      if (a.category === b.category) return a.tier - b.tier;
      return a.category.localeCompare(b.category);
    });

  const unlockedWithFallback = unlocked.length === 0 && context.totalWins > 0
    ? [FIRST_STEP_FALLBACK]
    : unlocked;

  return {
    unlocked: unlockedWithFallback,
    display: toDisplayAchievements(unlockedWithFallback),
  };
};

export const evaluateAchievements = (status: RikishiStatus): Achievement[] => {
  return evaluateAchievementProgress(status).display;
};
