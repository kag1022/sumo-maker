import { BashoRecord } from '../../models';
import { BashoRecordSnapshot } from '../providers/sekitori/types';

type OzekiPromotionRecord = {
  rankName: string;
  wins: number;
};

export interface OzekiPromotionEvaluation {
  passedFormal: boolean;
  qualityScore: number;
  recommended: boolean;
  totalWins: number;
}

export const isSanyakuName = (name: string): boolean =>
  name === '関脇' || name === '小結';

const evaluateOzekiPromotionCore = (
  current: OzekiPromotionRecord,
  prev1?: OzekiPromotionRecord,
  prev2?: OzekiPromotionRecord,
): OzekiPromotionEvaluation => {
  if (!isSanyakuName(current.rankName) || !prev1 || !prev2) {
    return { passedFormal: false, qualityScore: 0, recommended: false, totalWins: 0 };
  }

  const chain = [current, prev1, prev2];
  if (!chain.every((record) => isSanyakuName(record.rankName))) {
    return { passedFormal: false, qualityScore: 0, recommended: false, totalWins: 0 };
  }

  const totalWins = chain.reduce((sum, record) => sum + record.wins, 0);
  const passedFormal = totalWins >= 33 && current.wins >= 10;

  const currentWeight = current.rankName === '関脇' ? 1.05 : 1;
  const consistencyBonus = Math.max(0, Math.min(prev1.wins, prev2.wins) - 10) * 0.35;
  const explosiveBonus = current.wins >= 12 ? 1.25 : current.wins >= 11 ? 0.6 : 0;
  const qualityScore = totalWins * currentWeight + consistencyBonus + explosiveBonus;
  const recommended = passedFormal && qualityScore >= 34;

  return {
    passedFormal,
    qualityScore,
    recommended,
    totalWins,
  };
};

export const evaluateOzekiPromotion = (
  currentRecord: BashoRecord,
  historyWindow: BashoRecord[],
): OzekiPromotionEvaluation =>
  evaluateOzekiPromotionCore(
    {
      rankName: currentRecord.rank.name,
      wins: currentRecord.wins,
    },
    historyWindow[0]
      ? {
        rankName: historyWindow[0].rank.name,
        wins: historyWindow[0].wins,
      }
      : undefined,
    historyWindow[1]
      ? {
        rankName: historyWindow[1].rank.name,
        wins: historyWindow[1].wins,
      }
      : undefined,
  );

export const evaluateSnapshotOzekiPromotion = (
  snapshot: BashoRecordSnapshot,
): OzekiPromotionEvaluation =>
  evaluateOzekiPromotionCore(
    {
      rankName: snapshot.rank.name,
      wins: snapshot.wins,
    },
    snapshot.pastRecords?.[0]
      ? {
        rankName: snapshot.pastRecords[0].rank.name,
        wins: snapshot.pastRecords[0].wins,
      }
      : undefined,
    snapshot.pastRecords?.[1]
      ? {
        rankName: snapshot.pastRecords[1].rank.name,
        wins: snapshot.pastRecords[1].wins,
      }
      : undefined,
  );

export const canPromoteToOzekiBy33Wins = (
  currentRecord: BashoRecord,
  historyWindow: BashoRecord[],
): boolean =>
  evaluateOzekiPromotion(currentRecord, historyWindow).recommended;

export const canPromoteSnapshotToOzekiBy33Wins = (
  snapshot: BashoRecordSnapshot,
): boolean =>
  evaluateSnapshotOzekiPromotion(snapshot).recommended;
