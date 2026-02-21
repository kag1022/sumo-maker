import { RikishiStatus, Rank } from './models';

export type AchievementRarity = 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  rarity: AchievementRarity;
  icon: string; // Emoji or Icon name
}

// Helper to check rank division
const isMakuuchi = (rank: Rank) => rank.division === 'Makuuchi';
const hasPrize = (prizes: string[], code: 'SHUKUN' | 'KANTO' | 'GINO'): boolean => {
  if (code === 'SHUKUN') return prizes.includes('SHUKUN') || prizes.includes('殊勲賞');
  if (code === 'KANTO') return prizes.includes('KANTO') || prizes.includes('敢闘賞');
  return prizes.includes('GINO') || prizes.includes('技能賞');
};

export const evaluateAchievements = (status: RikishiStatus): Achievement[] => {
  const achievements: Achievement[] = [];
  const { history, age } = status;
  const { records, yushoCount, totalWins, totalAbsent } = history;

  const makuuchiRecords = records.filter(r => isMakuuchi(r.rank));
  const bashoCount = records.length;

  // 1. Yusho (Championship) Achievements
  if (yushoCount.makuuchi > 0) {
    if (yushoCount.makuuchi >= 20) {
      achievements.push({ id: 'YUSHO_20', name: '大横綱', description: '幕内優勝20回以上を達成', rarity: 'LEGENDARY', icon: '🏆' });
    } else if (yushoCount.makuuchi >= 10) {
      achievements.push({ id: 'YUSHO_10', name: '名横綱', description: '幕内優勝10回を達成', rarity: 'EPIC', icon: '🏆' });
    } else {
      achievements.push({ id: 'YUSHO_1', name: '賜杯の重み', description: '幕内最高優勝を達成', rarity: 'RARE', icon: '🏆' });
    }
  }

  // 2. Undefeated Champion (Zensho Yusho)
  const zenshoCount = makuuchiRecords.filter(r => r.wins === 15 && r.yusho).length;
  if (zenshoCount > 0) {
    if (zenshoCount >= 5) {
      achievements.push({ id: 'ZENSHO_5', name: '無敵艦隊', description: '幕内全勝優勝を5回達成', rarity: 'LEGENDARY', icon: '✨' });
    } else {
      achievements.push({ id: 'ZENSHO_1', name: '完全優勝', description: '幕内全勝優勝を達成', rarity: 'EPIC', icon: '✨' });
    }
  }

  // 3. Career Wins
  if (totalWins >= 1000) {
    achievements.push({ id: 'WINS_1000', name: '千勝力士', description: '通算1000勝を達成', rarity: 'LEGENDARY', icon: '💯' });
  } else if (totalWins >= 500) {
    achievements.push({ id: 'WINS_500', name: '名力士の証', description: '通算500勝を達成', rarity: 'RARE', icon: '💯' });
  }

  // 4. Longevity & Health
  if (age >= 40) {
    achievements.push({ id: 'AGE_40', name: '生涯現役', description: '40歳以上まで現役を続行', rarity: 'EPIC', icon: '👴' });
  }

  if (bashoCount >= 60 && totalAbsent === 0) {
    achievements.push({ id: 'IRONMAN', name: '鉄の肉体', description: '10年間（60場所）以上、無休場', rarity: 'EPIC', icon: '🦾' });
  }

  // 5. Winning Streaks / Consistency
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

  if (maxKachiKoshiStreak >= 30) {
    achievements.push({ id: 'STREAK_30', name: '黄金時代', description: '幕内で30場所連続勝ち越し', rarity: 'LEGENDARY', icon: '☀️' });
  } else if (maxKachiKoshiStreak >= 15) {
    achievements.push({ id: 'STREAK_15', name: '安定勢力', description: '幕内で15場所連続勝ち越し', rarity: 'RARE', icon: '☀️' });
  }

  // 6. Rapid Promotion
  // Find index of first makuuchi appearance
  const firstMakuuchiIdx = records.findIndex(r => isMakuuchi(r.rank));
  if (firstMakuuchiIdx !== -1 && firstMakuuchiIdx <= 12) {
    // Reached makuuchi in 2 years (12 basho) or less
    achievements.push({ id: 'RAPID_PROMOTION', name: 'スピード出世', description: '入門から12場所以内で新入幕', rarity: 'EPIC', icon: '🚀' });
  }

  // 7. Special Prizes (Sansho)
  let shukun = 0, kanto = 0, gino = 0;
  for (const r of makuuchiRecords) {
    if (hasPrize(r.specialPrizes, 'SHUKUN')) shukun++;
    if (hasPrize(r.specialPrizes, 'KANTO')) kanto++;
    if (hasPrize(r.specialPrizes, 'GINO')) gino++;
  }
  const totalSansho = shukun + kanto + gino;
  if (totalSansho >= 10) {
    achievements.push({ id: 'SANSHO_10', name: '三賞常連', description: '三賞を合計10回以上受賞', rarity: 'RARE', icon: '🏅' });
  }
  if (shukun >= 5 && kanto >= 5 && gino >= 5) {
    achievements.push({ id: 'SANSHO_ALL', name: '万能型力士', description: '殊勲・敢闘・技能賞を各5回以上受賞', rarity: 'EPIC', icon: '🎖️' });
  }

  // 8. Participation in Makushita/Juryo Yusho
  if (yushoCount.juryo > 0 && yushoCount.makushita > 0 && yushoCount.makuuchi > 0) {
    achievements.push({ id: 'GRAND_SLAM', name: 'グランドスラム', description: '幕下・十両・幕内の各段で優勝', rarity: 'EPIC', icon: '🪜' });
  }

  // Fallback for no achievements just to show something
  if (achievements.length === 0 && totalWins > 0) {
    achievements.push({ id: 'FIRST_STEP', name: '土俵への一歩', description: '大相撲の舞台で初勝利を挙げる', rarity: 'COMMON', icon: '🌱' });
  }

  return achievements;
};
