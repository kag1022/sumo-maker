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

const applyAuditCorrection = (
  input: BanzukeCommitteeCase,
): { rank: Rank; reasons: BanzukeDecisionReasonCode[] } => {
  let corrected = { ...input.proposalRank };
  const reasons: BanzukeDecisionReasonCode[] = [];

  if (
    input.flags.includes('KACHIKOSHI_DEMOTION_RISK') &&
    compareRank(corrected, input.currentRank) > 0
  ) {
    corrected = { ...input.currentRank };
    reasons.push('REVIEW_REVERT_KACHIKOSHI_DEMOTION');
    reasons.push('AUDIT_CONSTRAINT_HIT');
  }

  if (
    input.flags.includes('LIGHT_MAKEKOSHI_OVER_DEMOTION') &&
    corrected.division === 'Makushita' &&
    (corrected.number ?? 999) > 10
  ) {
    corrected = { ...corrected, number: 10, side: 'East' };
    reasons.push('REVIEW_CAP_LIGHT_MAKEKOSHI_DEMOTION');
    reasons.push('AUDIT_CONSTRAINT_HIT');
  }

  if (
    input.flags.includes('MAKUSHITA_ZENSHO_UNDER_PROMOTION') &&
    corrected.division === 'Makushita' &&
    (corrected.number ?? 999) > 15
  ) {
    corrected = { ...corrected, number: 15, side: 'East' };
    reasons.push('REVIEW_FORCE_MAKUSHITA_ZENSHO_JOI');
    reasons.push('AUDIT_CONSTRAINT_HIT');
  }

  if (
    input.flags.includes('BOUNDARY_SLOT_JAM') &&
    sameDivision(corrected, input.currentRank)
  ) {
    reasons.push('REVIEW_BOUNDARY_SLOT_JAM_NOTED');
  }

  if (!reasons.length) {
    reasons.push('AUDIT_PASS');
  }

  return { rank: corrected, reasons: [...new Set(reasons)] };
};

export interface ReviewBoardDecision {
  id: string;
  finalRank: Rank;
  reasons: BanzukeDecisionReasonCode[];
  votes: BanzukeDecisionVote[];
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
      });
      continue;
    }

    const corrected = applyAuditCorrection(input);
    decisions.push({
      id: input.id,
      finalRank: corrected.rank,
      reasons: corrected.reasons,
      votes: [],
    });
  }

  return { decisions, warnings };
};
