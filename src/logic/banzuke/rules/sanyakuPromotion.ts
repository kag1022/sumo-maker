import { BashoRecord } from '../../models';
import { BashoRecordSnapshot } from '../providers/sekitori/types';

type OzekiPromotionRecord = {
  rankName: string;
  wins: number;
};

export const isSanyakuName = (name: string): boolean =>
  name === '関脇' || name === '小結';

const canPromoteToOzekiBy33WinsCore = (
  current: OzekiPromotionRecord,
  prev1?: OzekiPromotionRecord,
  prev2?: OzekiPromotionRecord,
): boolean => {
  if (!isSanyakuName(current.rankName)) return false;
  if (!prev1 || !prev2) return false;
  const chain = [current, prev1, prev2];
  if (!chain.every((record) => isSanyakuName(record.rankName))) return false;
  const totalWins = chain.reduce((sum, record) => sum + record.wins, 0);
  return totalWins >= 33 && current.wins >= 10;
};

export const canPromoteToOzekiBy33Wins = (
  currentRecord: BashoRecord,
  historyWindow: BashoRecord[],
): boolean =>
  canPromoteToOzekiBy33WinsCore(
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

export const canPromoteSnapshotToOzekiBy33Wins = (
  snapshot: BashoRecordSnapshot,
): boolean =>
  canPromoteToOzekiBy33WinsCore(
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
