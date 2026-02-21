import { Rank } from '../models';

export const SEKITORI_BOUTS = 15;

export const normalizeSekitoriLosses = (
  wins: number,
  losses: number,
  absent = 0,
  totalBouts = SEKITORI_BOUTS,
): number => losses + absent + Math.max(0, totalBouts - (wins + losses + absent));

export const resolveTopDivisionAssignedEvent = (
  currentRank: Rank,
  nextRank: Rank,
): string | undefined => {
  if (currentRank.division !== nextRank.division) {
    if (currentRank.division === 'Juryo' && nextRank.division === 'Makuuchi') {
      return 'PROMOTION_TO_MAKUUCHI';
    }
    if (currentRank.division === 'Makuuchi' && nextRank.division === 'Juryo') {
      return 'DEMOTION_TO_JURYO';
    }
    return undefined;
  }

  if (currentRank.division !== 'Makuuchi' || nextRank.division !== 'Makuuchi') return undefined;
  if (currentRank.name === nextRank.name) return undefined;

  if (nextRank.name === '関脇') return 'PROMOTION_TO_SEKIWAKE';
  if (nextRank.name === '小結' && currentRank.name === '関脇') return 'DEMOTION_TO_KOMUSUBI';
  if (nextRank.name === '小結') return 'PROMOTION_TO_KOMUSUBI';
  if (nextRank.name === '前頭') return 'DEMOTION_TO_MAEGASHIRA';
  return undefined;
};
