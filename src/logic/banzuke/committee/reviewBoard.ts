import { Rank } from '../../models';
import { LIMITS } from '../scale/rankLimits';
import {
  BanzukeCommitteeCase,
  BanzukeDecisionReasonCode,
  BanzukeDecisionVote,
} from '../types';

const toRankScore = (rank: Rank): number => {
  const sideOffset = rank.side === 'West' ? 1 : 0;
  if (rank.division === 'Makuuchi') {
    if (rank.name === '横綱') return sideOffset;
    if (rank.name === '大関') return 2 + sideOffset;
    if (rank.name === '関脇') return 4 + sideOffset;
    if (rank.name === '小結') return 6 + sideOffset;
    const num = Math.max(1, Math.min(LIMITS.MAEGASHIRA_MAX, rank.number ?? 1));
    return 8 + (num - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Juryo') {
    const num = Math.max(1, Math.min(LIMITS.JURYO_MAX, rank.number ?? 1));
    return 8 + LIMITS.MAEGASHIRA_MAX * 2 + (num - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Makushita') {
    const num = Math.max(1, Math.min(LIMITS.MAKUSHITA_MAX, rank.number ?? 1));
    return 8 + (LIMITS.MAEGASHIRA_MAX + LIMITS.JURYO_MAX) * 2 + (num - 1) * 2 + sideOffset;
  }
  if (rank.division === 'Sandanme') {
    const num = Math.max(1, Math.min(LIMITS.SANDANME_MAX, rank.number ?? 1));
    return (
      8 +
      (LIMITS.MAEGASHIRA_MAX + LIMITS.JURYO_MAX + LIMITS.MAKUSHITA_MAX) * 2 +
      (num - 1) * 2 +
      sideOffset
    );
  }
  if (rank.division === 'Jonidan') {
    const num = Math.max(1, Math.min(LIMITS.JONIDAN_MAX, rank.number ?? 1));
    return (
      8 +
      (LIMITS.MAEGASHIRA_MAX + LIMITS.JURYO_MAX + LIMITS.MAKUSHITA_MAX + LIMITS.SANDANME_MAX) * 2 +
      (num - 1) * 2 +
      sideOffset
    );
  }
  if (rank.division === 'Jonokuchi') {
    const num = Math.max(1, Math.min(LIMITS.JONOKUCHI_MAX, rank.number ?? 1));
    return (
      8 +
      (
        LIMITS.MAEGASHIRA_MAX +
        LIMITS.JURYO_MAX +
        LIMITS.MAKUSHITA_MAX +
        LIMITS.SANDANME_MAX +
        LIMITS.JONIDAN_MAX
      ) * 2 +
      (num - 1) * 2 +
      sideOffset
    );
  }
  return 8 + (
    LIMITS.MAEGASHIRA_MAX +
    LIMITS.JURYO_MAX +
    LIMITS.MAKUSHITA_MAX +
    LIMITS.SANDANME_MAX +
    LIMITS.JONIDAN_MAX +
    LIMITS.JONOKUCHI_MAX
  ) * 2;
};

const compareRank = (a: Rank, b: Rank): number => toRankScore(a) - toRankScore(b);
const sameDivision = (a: Rank, b: Rank): boolean => a.division === b.division;

interface ReviewRule {
  id: string;
  priority: number;
  predicate: (input: BanzukeCommitteeCase, corrected: Rank) => boolean;
  apply: (input: BanzukeCommitteeCase, corrected: Rank) => {
    rank: Rank;
    reasons: BanzukeDecisionReasonCode[];
  };
}

const REVIEW_RULES: ReviewRule[] = [
  {
    id: 'KACHIKOSHI_DEMOTION_GUARD',
    priority: 100,
    predicate: (input: BanzukeCommitteeCase, corrected: Rank) =>
      input.flags.includes('KACHIKOSHI_DEMOTION_RISK') &&
      compareRank(corrected, input.currentRank) > 0,
    apply: (input: BanzukeCommitteeCase) => ({
      rank: { ...input.currentRank },
      reasons: ['REVIEW_REVERT_KACHIKOSHI_DEMOTION', 'AUDIT_CONSTRAINT_HIT'] as BanzukeDecisionReasonCode[],
    }),
  },
  {
    id: 'LIGHT_MAKEKOSHI_CAP',
    priority: 80,
    predicate: (input: BanzukeCommitteeCase, corrected: Rank) =>
      input.flags.includes('LIGHT_MAKEKOSHI_OVER_DEMOTION') &&
      corrected.division === 'Makushita' &&
      (corrected.number ?? 999) > 10,
    apply: (_input: BanzukeCommitteeCase, corrected: Rank) => ({
      rank: { ...corrected, number: 10, side: 'East' as const },
      reasons: ['REVIEW_CAP_LIGHT_MAKEKOSHI_DEMOTION', 'AUDIT_CONSTRAINT_HIT'] as BanzukeDecisionReasonCode[],
    }),
  },
  {
    id: 'MAKUSHITA_ZENSHO_JOI',
    priority: 70,
    predicate: (input: BanzukeCommitteeCase, corrected: Rank) =>
      input.flags.includes('MAKUSHITA_ZENSHO_UNDER_PROMOTION') &&
      corrected.division === 'Makushita' &&
      (corrected.number ?? 999) > 15,
    apply: (_input: BanzukeCommitteeCase, corrected: Rank) => ({
      rank: { ...corrected, number: 15, side: 'East' as const },
      reasons: ['REVIEW_FORCE_MAKUSHITA_ZENSHO_JOI', 'AUDIT_CONSTRAINT_HIT'] as BanzukeDecisionReasonCode[],
    }),
  },
  {
    id: 'BOUNDARY_JAM_NOTE',
    priority: 10,
    predicate: (input: BanzukeCommitteeCase, corrected: Rank) =>
      input.flags.includes('BOUNDARY_SLOT_JAM') && sameDivision(corrected, input.currentRank),
    apply: (_input: BanzukeCommitteeCase, corrected: Rank) => ({
      rank: { ...corrected },
      reasons: ['REVIEW_BOUNDARY_SLOT_JAM_NOTED'] as BanzukeDecisionReasonCode[],
    }),
  },
].sort((a, b) => b.priority - a.priority);

const applyAuditCorrection = (
  input: BanzukeCommitteeCase,
): { rank: Rank; reasons: BanzukeDecisionReasonCode[]; appliedRules: string[] } => {
  let corrected = { ...input.proposalRank };
  const reasons: BanzukeDecisionReasonCode[] = [];
  const appliedRules: string[] = [];

  for (const rule of REVIEW_RULES) {
    if (!rule.predicate(input, corrected)) continue;
    const result = rule.apply(input, corrected);
    corrected = { ...result.rank };
    reasons.push(...result.reasons);
    appliedRules.push(rule.id);
  }

  if (!reasons.length) {
    reasons.push('AUDIT_PASS');
  }

  return { rank: corrected, reasons: [...new Set(reasons)], appliedRules };
};

export interface ReviewBoardDecision {
  id: string;
  finalRank: Rank;
  reasons: BanzukeDecisionReasonCode[];
  votes: BanzukeDecisionVote[];
  appliedRules?: string[];
}

export const reviewBoard = (
  cases: BanzukeCommitteeCase[],
): { decisions: ReviewBoardDecision[]; warnings: string[] } => {
  const decisions: ReviewBoardDecision[] = [];
  const warnings: string[] = [];

  for (const input of cases) {
    if (!input.flags.length) {
      decisions.push({
        id: input.id,
        finalRank: { ...input.proposalRank },
        reasons: ['AUTO_ACCEPTED'],
        votes: [],
        appliedRules: [],
      });
      continue;
    }

    const corrected = applyAuditCorrection(input);
    decisions.push({
      id: input.id,
      finalRank: corrected.rank,
      reasons: corrected.reasons,
      votes: [],
      appliedRules: corrected.appliedRules,
    });
  }

  return { decisions, warnings };
};
