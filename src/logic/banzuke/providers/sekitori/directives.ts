import { normalizeSekitoriLosses } from '../../rules/topDivisionRules';
import { BashoRecordHistorySnapshot, BashoRecordSnapshot, TopDirective } from './types';
import { evaluateYokozunaPromotion } from '../../rules/yokozunaPromotion';
import { canPromoteSnapshotToOzekiBy33Wins } from '../../rules/sanyakuPromotion';

export const toHistoryScore = (record: BashoRecordHistorySnapshot): number => {
  const losses = normalizeSekitoriLosses(record.wins, record.losses, record.absent);
  const diff = record.wins - losses;
  return diff * 2 + record.wins * 0.45 + (record.yusho ? 5 : 0) + (record.junYusho ? 2.5 : 0);
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

  if (canPromoteSnapshotToOzekiBy33Wins(snapshot)) {
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
