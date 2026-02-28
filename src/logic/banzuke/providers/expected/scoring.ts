import { Rank } from '../../../models';
import { getRankValue } from '../../../ranking/rankScore';

const resolveRankBase = (rank: Rank): number => {
  const base = 1000 - getRankValue(rank) * 6;
  if (rank.division === 'Makuuchi' || rank.division === 'Juryo') {
    return base + 5000; // 関取の特権スコア（幕下以下とは絶対に混ざらない）
  }
  return base;
};

export const resolveExpectedPlacementScore = (
  rank: Rank,
  wins: number,
  losses: number,
  absent: number,
  mandatoryDemotion: boolean,
  mandatoryPromotion: boolean,
): number => {
  const effectiveLosses = losses + absent;
  const diff = wins - effectiveLosses;
  const kachikoshi = Math.max(0, diff);
  const makekoshi = Math.max(0, -diff);
  const mandatoryBonus = mandatoryPromotion ? 180 : mandatoryDemotion ? -180 : 0;
  return (
    resolveRankBase(rank) +
    wins * 18 -
    losses * 16 -
    absent * 22 +
    kachikoshi * 28 -
    makekoshi * 30 +
    mandatoryBonus
  );
};
