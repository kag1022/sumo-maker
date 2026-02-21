import { Rank } from '../../models';
import { getRankValue } from '../rankScore';

const resolveRankBase = (rank: Rank): number => 1000 - getRankValue(rank) * 6;

export const resolveExpectedPlacementScore = (
  rank: Rank,
  wins: number,
  losses: number,
  absent: number,
  mandatoryDemotion: boolean,
  mandatoryPromotion: boolean,
): number => {
  const diff = wins - losses;
  const kachikoshi = Math.max(0, diff);
  const makekoshi = Math.max(0, -diff);
  const mandatoryBonus = mandatoryPromotion ? 180 : mandatoryDemotion ? -180 : 0;
  return (
    resolveRankBase(rank) +
    wins * 18 -
    losses * 16 -
    absent * 14 +
    kachikoshi * 28 -
    makekoshi * 24 +
    mandatoryBonus
  );
};
