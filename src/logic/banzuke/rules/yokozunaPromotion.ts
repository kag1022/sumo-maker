import { UNIFIED_V1_BALANCE } from '../../balance/unifiedV1';
import { BashoRecord } from '../../models';
import { BashoRecordSnapshot } from '../providers/sekitori/types';

export interface YokozunaPromotionResult {
  promote: boolean;
  bonus: number;
  score: number;
}

const toEquivalentScore = (wins: number, yusho?: boolean, junYusho?: boolean): number => {
  if (yusho) return Math.max(wins, 14.5);
  if (junYusho) return Math.max(wins, 13.5);
  return wins;
};

const evaluateCore = (
  current: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean },
  prev: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean } | undefined,
): YokozunaPromotionResult => {
  if (current.rankName !== '大関') {
    return { promote: false, bonus: 0, score: 0 };
  }
  if (!prev || prev.rankName !== '大関') {
    const score = toEquivalentScore(current.wins, current.yusho, current.junYusho);
    return { promote: false, bonus: current.yusho ? 8 : 0, score };
  }

  const currentScore = toEquivalentScore(current.wins, current.yusho, current.junYusho);
  const prevScore = toEquivalentScore(prev.wins, prev.yusho, prev.junYusho);
  const score = currentScore + prevScore;
  const minEquivalent = UNIFIED_V1_BALANCE.yokozuna.yushoEquivalentMinScore;
  const hasEquivalent = currentScore >= minEquivalent && prevScore >= minEquivalent;
  const prevYushoEquivalent = Boolean(
    prev.yusho || prev.junYusho || prevScore >= minEquivalent,
  );
  const hasYushoPair = Boolean(current.yusho && prevYushoEquivalent);
  const hasRealisticTotal = score >= UNIFIED_V1_BALANCE.yokozuna.yushoEquivalentTotalMinScore;
  const promote = hasEquivalent && hasYushoPair && hasRealisticTotal;
  if (promote) return { promote: true, bonus: 28, score };
  if (current.yusho && score >= 27) return { promote: false, bonus: 14, score };
  if (current.yusho) return { promote: false, bonus: 8, score };
  return { promote: false, bonus: 0, score };
};

export const evaluateYokozunaPromotion = (
  snapshot: BashoRecordSnapshot,
): YokozunaPromotionResult =>
  evaluateCore(
    {
      rankName: snapshot.rank.name,
      wins: snapshot.wins,
      yusho: snapshot.yusho,
      junYusho: snapshot.junYusho,
    },
    snapshot.pastRecords?.[0]
      ? {
        rankName: snapshot.pastRecords[0].rank.name,
        wins: snapshot.pastRecords[0].wins,
        yusho: snapshot.pastRecords[0].yusho,
        junYusho: snapshot.pastRecords[0].junYusho,
      }
      : undefined,
  );

export const canPromoteToYokozuna = (
  current: BashoRecord,
  pastRecords: BashoRecord[],
): boolean =>
  evaluateCore(
    {
      rankName: current.rank.name,
      wins: current.wins,
      yusho: current.yusho,
      junYusho: false,
    },
    pastRecords[0]
      ? {
        rankName: pastRecords[0].rank.name,
        wins: pastRecords[0].wins,
        yusho: pastRecords[0].yusho,
        junYusho: false,
      }
      : undefined,
  ).promote;
