import { BALANCE } from '../../balance';
import { BashoRecord } from '../../models';
import { BashoRecordSnapshot } from '../providers/sekitori/types';

export type YokozunaPromotionDecisionBand = 'AUTO_PROMOTE' | 'BORDERLINE' | 'REJECT';

export interface YokozunaPromotionEvidence {
  isCurrentOzeki: boolean;
  isPrevOzeki: boolean;
  currentEquivalent: number;
  prevEquivalent: number;
  combinedEquivalent: number;
  currentYusho: boolean;
  currentJunYusho: boolean;
  prevYushoEquivalent: boolean;
  hasEquivalentPair: boolean;
  hasYushoPair: boolean;
  hasRealisticTotal: boolean;
}

export interface YokozunaPromotionResult {
  promote: boolean;
  bonus: number;
  score: number;
  decisionBand: YokozunaPromotionDecisionBand;
  evidence: YokozunaPromotionEvidence;
}

const toEquivalentScore = (wins: number, yusho?: boolean, junYusho?: boolean): number => {
  if (yusho) return Math.max(wins, 14.5);
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
  const prevYushoEquivalent = Boolean(prev?.yusho || prev?.junYusho);
  const hasYushoPair = Boolean(current.yusho && prevYushoEquivalent);
  const hasRealisticTotal = combinedEquivalent >= BALANCE.yokozuna.yushoEquivalentTotalMinScore;

  return {
    isCurrentOzeki,
    isPrevOzeki: Boolean(isPrevOzeki),
    currentEquivalent,
    prevEquivalent,
    combinedEquivalent,
    currentYusho: Boolean(current.yusho),
    currentJunYusho: Boolean(current.junYusho),
    prevYushoEquivalent,
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
    evidence.currentYusho &&
    evidence.currentEquivalent >= BALANCE.yokozuna.yushoEquivalentMinScore &&
    evidence.combinedEquivalent >= BALANCE.yokozuna.yushoEquivalentTotalMinScore - 1
  ) {
    return 'BORDERLINE';
  }
  return 'REJECT';
};

const evaluateCore = (
  current: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean },
  prev: { rankName: string; wins: number; yusho?: boolean; junYusho?: boolean } | undefined,
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
  ).decisionBand === 'AUTO_PROMOTE';
