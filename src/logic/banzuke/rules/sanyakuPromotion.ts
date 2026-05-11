import { BashoRecord } from '../../models';
import { BashoRecordSnapshot } from '../providers/sekitori/types';
import { TopRankPopulationContext, resolveOzekiPromotionPressure } from './topRankPromotionPressure';

type OzekiPromotionRecord = {
  rankName: string;
  wins: number;
};

export interface OzekiPromotionEvaluation {
  passedFormal: boolean;
  qualityScore: number;
  recommended: boolean;
  totalWins: number;
  requiredTotalWins: number;
  requiredQualityScore: number;
  populationPressure: number;
  currentOzekiCount?: number;
}

export const isSanyakuName = (name: string): boolean =>
  name === '関脇' || name === '小結';

const evaluateOzekiPromotionCore = (
  current: OzekiPromotionRecord,
  prev1?: OzekiPromotionRecord,
  prev2?: OzekiPromotionRecord,
  populationContext?: TopRankPopulationContext,
): OzekiPromotionEvaluation => {
  const populationPressure = resolveOzekiPromotionPressure(populationContext?.currentOzekiCount);
  const requiredTotalWins = 33 + populationPressure;
  const requiredQualityScore = 34 + Math.max(0, populationPressure * 0.5);
  const reject = (): OzekiPromotionEvaluation => ({
    passedFormal: false,
    qualityScore: 0,
    recommended: false,
    totalWins: 0,
    requiredTotalWins,
    requiredQualityScore,
    populationPressure,
    currentOzekiCount: populationContext?.currentOzekiCount,
  });

  if (!isSanyakuName(current.rankName) || !prev1 || !prev2) {
    return reject();
  }

  const chain = [current, prev1, prev2];
  if (!chain.every((record) => isSanyakuName(record.rankName))) {
    return reject();
  }

  const totalWins = chain.reduce((sum, record) => sum + record.wins, 0);
  const passedFormal = totalWins >= requiredTotalWins && current.wins >= 10;

  const currentWeight = current.rankName === '関脇' ? 1.05 : 1;
  const consistencyBonus = Math.max(0, Math.min(prev1.wins, prev2.wins) - 10) * 0.35;
  const explosiveBonus = current.wins >= 12 ? 1.25 : current.wins >= 11 ? 0.6 : 0;
  const qualityScore = totalWins * currentWeight + consistencyBonus + explosiveBonus;
  const recommended = passedFormal && qualityScore >= requiredQualityScore;

  return {
    passedFormal,
    qualityScore,
    recommended,
    totalWins,
    requiredTotalWins,
    requiredQualityScore,
    populationPressure,
    currentOzekiCount: populationContext?.currentOzekiCount,
  };
};

export const evaluateOzekiPromotion = (
  currentRecord: BashoRecord,
  historyWindow: BashoRecord[],
  populationContext?: TopRankPopulationContext,
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
    populationContext,
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
    snapshot.topRankPopulation,
  );

export const canPromoteToOzekiBy33Wins = (
  currentRecord: BashoRecord,
  historyWindow: BashoRecord[],
  populationContext?: TopRankPopulationContext,
): boolean =>
  evaluateOzekiPromotion(currentRecord, historyWindow, populationContext).recommended;

export const canPromoteSnapshotToOzekiBy33Wins = (
  snapshot: BashoRecordSnapshot,
): boolean =>
  evaluateSnapshotOzekiPromotion(snapshot).recommended;
