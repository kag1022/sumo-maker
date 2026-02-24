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

type Judge = {
  id: string;
  weight: number;
  score: (input: BanzukeCommitteeCase, candidate: Rank) => number;
};

const judges: Judge[] = [
  {
    id: 'ConservativeJudge',
    weight: 0.4,
    score: (input, candidate) => {
      const distance = Math.abs(compareRank(candidate, input.currentRank));
      const base = -Math.min(16, distance * 0.25);
      if (input.result.wins > input.result.losses && compareRank(candidate, input.currentRank) > 0) return base - 10;
      if (input.result.wins < input.result.losses && compareRank(candidate, input.currentRank) < 0) return base - 12;
      return base;
    },
  },
  {
    id: 'PerformanceJudge',
    weight: 0.4,
    score: (input, candidate) => {
      const diff = input.performanceOverExpected;
      if (diff >= 0) {
        return compareRank(candidate, input.currentRank) <= 0 ? 8 + diff : -15;
      }
      return compareRank(candidate, input.currentRank) >= 0 ? 8 + Math.abs(diff) : -15;
    },
  },
  {
    id: 'BalanceJudge',
    weight: 0.2,
    score: (input, candidate) => {
      let score = 0;
      if (input.flags.includes('LIGHT_MAKEKOSHI_OVER_DEMOTION') && candidate.division === 'Makushita') {
        score += (candidate.number ?? 999) <= 10 ? 8 : -8;
      }
      if (input.flags.includes('MAKUSHITA_ZENSHO_UNDER_PROMOTION')) {
        if (candidate.division === 'Makushita' && (candidate.number ?? 999) <= 15) score += 8;
      }
      return score;
    },
  },
];

const applyFlagDrivenCorrection = (
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
  }

  if (
    input.flags.includes('LIGHT_MAKEKOSHI_OVER_DEMOTION') &&
    corrected.division === 'Makushita' &&
    (corrected.number ?? 999) > 10
  ) {
    corrected = { ...corrected, number: 10, side: 'East' };
    reasons.push('REVIEW_CAP_LIGHT_MAKEKOSHI_DEMOTION');
  }

  if (
    input.flags.includes('MAKUSHITA_ZENSHO_UNDER_PROMOTION') &&
    corrected.division === 'Makushita' &&
    (corrected.number ?? 999) > 15
  ) {
    corrected = { ...corrected, number: 15, side: 'East' };
    reasons.push('REVIEW_FORCE_MAKUSHITA_ZENSHO_JOI');
  }

  if (
    input.flags.includes('BOUNDARY_SLOT_JAM') &&
    sameDivision(corrected, input.currentRank)
  ) {
    reasons.push('REVIEW_BOUNDARY_SLOT_JAM_NOTED');
  }

  return { rank: corrected, reasons };
};

const scoreCandidate = (input: BanzukeCommitteeCase, candidate: Rank): BanzukeDecisionVote[] =>
  judges.map((judge) => ({
    judge: judge.id,
    score: judge.score(input, candidate) * judge.weight,
  }));

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

    const corrected = applyFlagDrivenCorrection(input);
    const votes = scoreCandidate(input, corrected.rank);
    const weighted = votes.reduce((sum, v) => sum + v.score, 0);
    const forceAcceptByRule = corrected.reasons.includes('REVIEW_FORCE_MAKUSHITA_ZENSHO_JOI');
    const accepted = forceAcceptByRule || weighted >= -2.5;

    if (!accepted) {
      decisions.push({
        id: input.id,
        finalRank: { ...input.currentRank },
        reasons: [...corrected.reasons, 'REVIEW_REJECTED_RETAIN_PREV_RANK'],
        votes,
      });
      warnings.push(`${input.id}:REVIEW_REJECTED`);
      continue;
    }

      decisions.push({
        id: input.id,
        finalRank: corrected.rank,
        reasons: corrected.reasons.length ? corrected.reasons : ['REVIEW_ACCEPTED'],
        votes,
      });
  }

  return { decisions, warnings };
};
