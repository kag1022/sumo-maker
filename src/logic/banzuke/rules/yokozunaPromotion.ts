import { BALANCE } from '../../balance';
import { BashoRecord } from '../../models';
import { BashoRecordSnapshot } from '../providers/sekitori/types';

export type YokozunaPromotionDecisionBand = 'AUTO_PROMOTE' | 'BORDERLINE' | 'BORDERLINE_PROMOTE' | 'REJECT';

export interface YokozunaPromotionEvidence {
  isCurrentOzeki: boolean;
  isPrevOzeki: boolean;
  currentEquivalent: number;
  prevEquivalent: number;
  combinedEquivalent: number;
  currentYusho: boolean;
  currentJunYusho: boolean;
  currentYushoEquivalent: boolean;
  prevYushoEquivalent: boolean;
  hasActualYushoInWindow: boolean;
  hasEquivalentPair: boolean;
  hasYushoPair: boolean;
  hasRealisticTotal: boolean;
}

export interface YokozunaDeliberationContext {
  performanceOverExpected?: number;
  recentWinTrend?: number[];
  hasShukun?: boolean;
}

export interface YokozunaPromotionResult {
  promote: boolean;
  bonus: number;
  score: number;
  decisionBand: YokozunaPromotionDecisionBand;
  evidence: YokozunaPromotionEvidence;
}

const toYushoEquivalentScore = (wins: number): number => {
  if (wins >= 14) return Math.max(wins, 14.5);
  if (wins === 13) return 13.5;
  if (wins === 12) return 12.5;
  if (wins === 11) return 11.5;
  return wins;
};

const toEquivalentScore = (wins: number, yusho?: boolean, junYusho?: boolean): number => {
  if (yusho) return toYushoEquivalentScore(wins);
  if (junYusho) return Math.max(wins, 13.5);
  return wins;
};

const buildYokozunaEvidence = (
  current: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean },
  prev: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean } | undefined,
): YokozunaPromotionEvidence => {
  const currentEquivalent = toEquivalentScore(current.wins, current.yusho, current.junYusho);
  const prevEquivalent = prev
    ? toEquivalentScore(prev.wins, prev.yusho, prev.junYusho)
    : 0;
  const combinedEquivalent = currentEquivalent + prevEquivalent;
  const isCurrentOzeki = current.rankName === '大関';
  const isPrevOzeki = prev?.rankName === '大関';
  const minEquivalent = BALANCE.yokozuna.yushoEquivalentMinScore;
  const hasEquivalentPair = Boolean(isCurrentOzeki && isPrevOzeki && currentEquivalent >= minEquivalent && prevEquivalent >= minEquivalent);
  const currentYushoEquivalent = Boolean(current.yusho || current.junYusho);
  const prevYushoEquivalent = Boolean(prev?.yusho || prev?.junYusho);
  const hasActualYushoInWindow = Boolean(current.yusho || prev?.yusho);
  const hasYushoPair = Boolean(currentYushoEquivalent && prevYushoEquivalent && hasActualYushoInWindow);
  const hasRealisticTotal = combinedEquivalent >= BALANCE.yokozuna.yushoEquivalentTotalMinScore;

  return {
    isCurrentOzeki,
    isPrevOzeki: Boolean(isPrevOzeki),
    currentEquivalent,
    prevEquivalent,
    combinedEquivalent,
    currentYusho: Boolean(current.yusho),
    currentJunYusho: Boolean(current.junYusho),
    currentYushoEquivalent,
    prevYushoEquivalent,
    hasActualYushoInWindow,
    hasEquivalentPair,
    hasYushoPair,
    hasRealisticTotal,
  };
};

const evaluateYokozunaDecisionBand = (
  evidence: YokozunaPromotionEvidence,
): YokozunaPromotionDecisionBand => {
  if (!evidence.isCurrentOzeki || !evidence.isPrevOzeki) return 'REJECT';
  if (evidence.hasEquivalentPair && evidence.hasYushoPair && evidence.hasRealisticTotal) {
    return 'AUTO_PROMOTE';
  }
  if (
    evidence.currentYushoEquivalent &&
    evidence.hasActualYushoInWindow &&
    evidence.currentEquivalent >= BALANCE.yokozuna.yushoEquivalentMinScore &&
    evidence.combinedEquivalent >= BALANCE.yokozuna.yushoEquivalentTotalMinScore - 1
  ) {
    return 'BORDERLINE';
  }
  return 'REJECT';
};

/**
 * 横綱審議委員会の審議をシミュレーションする。
 * BORDERLINE判定時のみ呼ばれ、場所内容・上昇トレンド・殊勲賞等を加味してスコアリング。
 * 歴史的にBORDERLINE相当の約30%が昇進している。
 */
const evaluateYokozunaDeliberation = (
  evidence: YokozunaPromotionEvidence,
  context?: YokozunaDeliberationContext,
): { deliberationScore: number; shouldPromote: boolean } => {
  let score = 0;

  // 今場所優勝: 最大の加点要素
  if (evidence.currentYusho) score += 30;
  // 今場所準優勝
  else if (evidence.currentJunYusho) score += 15;

  // 勝数の絶対的な強さ
  if (evidence.currentEquivalent >= 14) score += 15;
  else if (evidence.currentEquivalent >= 13) score += 8;

  // 2場所の合計の厚み
  if (evidence.combinedEquivalent >= 29) score += 10;
  else if (evidence.combinedEquivalent >= 28) score += 5;

  // 前場所の内容
  if (evidence.prevYushoEquivalent) score += 10;

  // POE（対戦品質を考慮した期待勝数超過）
  if (context?.performanceOverExpected !== undefined) {
    if (context.performanceOverExpected >= 2.0) score += 20;
    else if (context.performanceOverExpected >= 1.0) score += 10;
  }

  // 直近の上昇トレンド
  if (context?.recentWinTrend?.length && context.recentWinTrend.length >= 3) {
    const trend = context.recentWinTrend;
    const isUpward = trend.every((w, i) => i === 0 || w >= trend[i - 1]);
    if (isUpward) score += 15;
  }

  // 殊勲賞保持
  if (context?.hasShukun) score += 10;

  const threshold = BALANCE.yokozuna.deliberationThreshold;
  return {
    deliberationScore: score,
    shouldPromote: score >= threshold,
  };
};

const evaluateCore = (
  current: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean },
  prev: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean } | undefined,
  deliberationContext?: YokozunaDeliberationContext,
): YokozunaPromotionResult => {
  const evidence = buildYokozunaEvidence(current, prev);
  const decisionBand = evaluateYokozunaDecisionBand(evidence);
  if (decisionBand === 'AUTO_PROMOTE') {
    return {
      promote: true,
      bonus: 28,
      score: evidence.combinedEquivalent,
      decisionBand,
      evidence,
    };
  }

  if (decisionBand === 'BORDERLINE') {
    const deliberation = evaluateYokozunaDeliberation(evidence, deliberationContext);
    if (deliberation.shouldPromote) {
      return {
        promote: true,
        bonus: 22,
        score: evidence.combinedEquivalent,
        decisionBand: 'BORDERLINE_PROMOTE',
        evidence,
      };
    }
    return {
      promote: false,
      bonus: 10,
      score: evidence.combinedEquivalent,
      decisionBand,
      evidence,
    };
  }

  return {
    promote: false,
    bonus: current.yusho ? 4 : 0,
    score: evidence.combinedEquivalent,
    decisionBand,
    evidence,
  };
};

export const evaluateYokozunaPromotion = (
  snapshot: BashoRecordSnapshot,
  deliberationContext?: YokozunaDeliberationContext,
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
    deliberationContext,
  );

export const canPromoteToYokozuna = (
  current: BashoRecord,
  pastRecords: BashoRecord[],
  deliberationContext?: YokozunaDeliberationContext,
): boolean => {
  const result = evaluateCore(
    {
      rankName: current.rank.name,
      wins: current.wins,
      yusho: current.yusho,
      junYusho: current.junYusho,
    },
    pastRecords[0]
      ? {
        rankName: pastRecords[0].rank.name,
        wins: pastRecords[0].wins,
        yusho: pastRecords[0].yusho,
        junYusho: pastRecords[0].junYusho,
      }
      : undefined,
    deliberationContext,
  );
  return result.decisionBand === 'AUTO_PROMOTE' || result.decisionBand === 'BORDERLINE_PROMOTE';
};
