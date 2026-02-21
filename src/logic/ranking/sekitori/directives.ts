import { normalizeSekitoriLosses } from '../topDivisionRules';
import { BashoRecordHistorySnapshot, BashoRecordSnapshot, TopDirective } from './types';

const isSanyakuName = (name: string): boolean => ['関脇', '小結'].includes(name);

const isSanyakuOrHigherName = (name: string): boolean =>
  ['横綱', '大関', '関脇', '小結'].includes(name);

export const toHistoryScore = (record: BashoRecordHistorySnapshot): number => {
  const losses = normalizeSekitoriLosses(record.wins, record.losses, record.absent);
  const diff = record.wins - losses;
  return diff * 2 + record.wins * 0.45 + (record.yusho ? 5 : 0) + (record.junYusho ? 2.5 : 0);
};

const evaluateYokozunaPromotion = (
  snapshot: BashoRecordSnapshot,
): { promote: boolean; bonus: number } => {
  if (snapshot.rank.name !== '大関') return { promote: false, bonus: 0 };
  const prev = snapshot.pastRecords?.[0];
  if (!prev || prev.rank.name !== '大関') {
    return { promote: false, bonus: snapshot.yusho ? 8 : 0 };
  }

  const totalWins = snapshot.wins + prev.wins;
  const doubleYusho = Boolean(snapshot.yusho && prev.yusho);
  const yushoJun =
    Boolean((snapshot.yusho && prev.junYusho) || (prev.yusho && snapshot.junYusho)) &&
    totalWins >= 27;
  const strongEquivalent = Boolean(snapshot.yusho && totalWins >= 28 && prev.wins >= 13);
  if (doubleYusho) return { promote: true, bonus: 30 };
  if (yushoJun) return { promote: true, bonus: 24 };
  if (strongEquivalent) return { promote: true, bonus: 20 };
  if (snapshot.yusho && totalWins >= 26) return { promote: false, bonus: 14 };
  if (snapshot.yusho) return { promote: false, bonus: 8 };
  return { promote: false, bonus: 0 };
};

const canPromoteToOzeki = (snapshot: BashoRecordSnapshot): boolean => {
  if (!isSanyakuName(snapshot.rank.name)) return false;
  const r2 = snapshot.pastRecords?.[0];
  const r3 = snapshot.pastRecords?.[1];
  if (!r2 || !r3) return false;
  const chain = [snapshot, r2, r3];
  if (!chain.every((record) => isSanyakuOrHigherName(record.rank.name))) return false;
  const total = chain.reduce((sum, record) => sum + record.wins, 0);
  return total >= 33 && snapshot.wins >= 10;
};

export const resolveTopDirective = (snapshot: BashoRecordSnapshot): TopDirective => {
  const yokozunaEval = evaluateYokozunaPromotion(snapshot);
  if (snapshot.rank.name === '横綱') {
    return {
      preferredTopName: '横綱',
      nextIsOzekiKadoban: false,
      nextIsOzekiReturn: false,
      yokozunaPromotionBonus: 0,
    };
  }

  if (snapshot.rank.name === '大関') {
    if (yokozunaEval.promote) {
      return {
        preferredTopName: '横綱',
        nextIsOzekiKadoban: false,
        nextIsOzekiReturn: false,
        yokozunaPromotionBonus: yokozunaEval.bonus,
      };
    }
    if (snapshot.wins >= 8) {
      return {
        preferredTopName: '大関',
        nextIsOzekiKadoban: false,
        nextIsOzekiReturn: false,
        yokozunaPromotionBonus: yokozunaEval.bonus,
      };
    }
    if (snapshot.isOzekiKadoban) {
      return {
        preferredTopName: '関脇',
        nextIsOzekiKadoban: false,
        nextIsOzekiReturn: true,
        yokozunaPromotionBonus: yokozunaEval.bonus,
      };
    }
    return {
      preferredTopName: '大関',
      nextIsOzekiKadoban: true,
      nextIsOzekiReturn: false,
      yokozunaPromotionBonus: yokozunaEval.bonus,
    };
  }

  if (snapshot.rank.name === '関脇' && snapshot.isOzekiReturn && snapshot.wins >= 10) {
    return {
      preferredTopName: '大関',
      nextIsOzekiKadoban: false,
      nextIsOzekiReturn: false,
      yokozunaPromotionBonus: 0,
    };
  }

  if (canPromoteToOzeki(snapshot)) {
    return {
      preferredTopName: '大関',
      nextIsOzekiKadoban: false,
      nextIsOzekiReturn: false,
      yokozunaPromotionBonus: 0,
    };
  }

  if (snapshot.rank.name === '小結' && snapshot.wins >= 9) {
    return {
      preferredTopName: '関脇',
      nextIsOzekiKadoban: false,
      nextIsOzekiReturn: false,
      yokozunaPromotionBonus: 0,
    };
  }

  return {
    preferredTopName: undefined,
    nextIsOzekiKadoban: false,
    nextIsOzekiReturn: false,
    yokozunaPromotionBonus: yokozunaEval.bonus,
  };
};
