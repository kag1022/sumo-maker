import { CONSTANTS } from '../constants';
import { Rank } from '../models';

// ランクの強さを数値化（比較用）
// 小さいほど偉い
export const getRankValue = (rank: Rank): number => {
  if (rank.division === 'Makuuchi') {
    if (rank.name === '横綱') return 0;
    if (rank.name === '大関') return 10;
    if (rank.name === '関脇') return 20;
    if (rank.name === '小結') return 30;
    return 40 + (rank.number || 1);
  }

  const base =
    (CONSTANTS.RANK_VALUE[rank.division as keyof typeof CONSTANTS.RANK_VALUE] || 100) * 100;
  return base + (rank.number || 1);
};

// グラフ表示用ランク値（視認性重視のスケール）
export const getRankValueForChart = (rank: Rank): number => {
  if (rank.division === 'Makuuchi') {
    if (rank.name === '横綱') return 0;
    if (rank.name === '大関') return 10;
    if (rank.name === '関脇') return 20;
    if (rank.name === '小結') return 30;
    return 40 + (rank.number || 1);
  }
  if (rank.division === 'Juryo') return 60 + (rank.number || 1);
  if (rank.division === 'Makushita') return 80 + (rank.number || 1);
  if (rank.division === 'Sandanme') return 150 + (rank.number || 1);
  if (rank.division === 'Jonidan') return 260 + (rank.number || 1);
  if (rank.division === 'Jonokuchi') return 370 + (rank.number || 1);
  return 600;
};
