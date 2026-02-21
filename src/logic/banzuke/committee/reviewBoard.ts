import { Rank } from '../../models';
import { getRankValue } from '../../ranking';
import { BanzukeCommitteeCase, BanzukeDecisionVote } from '../types';

const DIVISION_ORDER: Rank['division'][] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];

const toRankScore = (rank: Rank): number => {
  const byValue = getRankValue(rank);
  const divisionBias = DIVISION_ORDER.indexOf(rank.division);
  const number = rank.number ?? 0;
  return byValue * 100 + divisionBias * 10 + number;
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
      const base = -Math.abs(compareRank(candidate, input.currentRank));
      if (input.result.wins > input.result.losses && compareRank(candidate, input.currentRank) > 0) return base - 10;
      if (input.result.wins < input.result.losses && compareRank(candidate, input.currentRank) < 0) return base - 12;
      return base;
    },
  },
  {
    id: 'PerformanceJudge',
    weight: 0.4,
    score: (input, candidate) => {
      const diff = input.result.wins - input.result.losses - input.result.absent;
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

const applyFlagDrivenCorrection = (input: BanzukeCommitteeCase): { rank: Rank; reasons: string[] } => {
  let corrected = { ...input.proposalRank };
  const reasons: string[] = [];

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
  reasons: string[];
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
    const accepted = weighted >= -2.5;

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

