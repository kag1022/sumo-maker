import { Rank } from '../../models';
import { calculateNextRank, getRankValue } from '../../ranking';
import {
  BanzukeCommitteeCase,
  BanzukeComposeAllocation,
  ComposeNextBanzukeInput,
  ComposeNextBanzukeOutput,
} from '../types';
import { reviewBoard } from './reviewBoard';

const compareRank = (a: Rank, b: Rank): number => {
  const av = getRankValue(a);
  const bv = getRankValue(b);
  if (av !== bv) return av - bv;
  if ((a.number ?? 0) !== (b.number ?? 0)) return (a.number ?? 0) - (b.number ?? 0);
  if (a.side !== b.side) return a.side === 'East' ? -1 : 1;
  return 0;
};

const DIVISION_ORDER: Rank['division'][] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];

const hasBoundarySlotJamRisk = (currentRank: Rank, proposalRank: Rank): boolean => {
  if (currentRank.division === proposalRank.division) {
    const current = currentRank.number ?? 1;
    const proposed = proposalRank.number ?? 1;
    return Math.abs(proposed - current) >= 40;
  }

  const currentDivisionIndex = DIVISION_ORDER.indexOf(currentRank.division);
  const proposalDivisionIndex = DIVISION_ORDER.indexOf(proposalRank.division);
  if (currentDivisionIndex < 0 || proposalDivisionIndex < 0) return false;

  // Adjacent division transitions (e.g. Maezumo -> Jonokuchi) are normal and should not be flagged.
  return Math.abs(proposalDivisionIndex - currentDivisionIndex) >= 2;
};

const resolveFlags = (
  currentRank: Rank,
  proposalRank: Rank,
  wins: number,
  losses: number,
  absent: number,
): string[] => {
  const flags: string[] = [];
  const totalLosses = losses + absent;
  const diff = wins - totalLosses;

  if (diff > 0 && compareRank(proposalRank, currentRank) > 0) {
    flags.push('KACHIKOSHI_DEMOTION_RISK');
  }

  if (
    currentRank.division === 'Juryo' &&
    totalLosses > wins &&
    wins >= 6 &&
    proposalRank.division === 'Makushita' &&
    (proposalRank.number ?? 999) > 10
  ) {
    flags.push('LIGHT_MAKEKOSHI_OVER_DEMOTION');
  }

  if (
    currentRank.division === 'Makushita' &&
    wins === 7 &&
    proposalRank.division === 'Makushita' &&
    (proposalRank.number ?? 999) > 15
  ) {
    flags.push('MAKUSHITA_ZENSHO_UNDER_PROMOTION');
  }

  if (hasBoundarySlotJamRisk(currentRank, proposalRank)) {
    flags.push('BOUNDARY_SLOT_JAM');
  }

  return flags;
};

export const composeNextBanzuke = (
  input: ComposeNextBanzukeInput,
): ComposeNextBanzukeOutput => {
  const cases: BanzukeCommitteeCase[] = [];
  const proposedById = new Map<string, BanzukeComposeAllocation['proposedChange']>();

  for (const entry of input.entries) {
    const proposedChange = calculateNextRank(
      {
        year: input.year,
        month: input.month,
        rank: entry.currentRank,
        wins: entry.wins,
        losses: entry.losses,
        absent: entry.absent,
        yusho: false,
        kinboshi: 0,
        specialPrizes: [],
      },
      entry.historyWindow,
      entry.isOzekiKadoban,
      input.random ?? Math.random,
      {
        ...(entry.options ?? {}),
        isOzekiReturn: entry.isOzekiReturn,
      },
    );
    proposedById.set(entry.id, proposedChange);

    const proposalRank =
      input.mode === 'REPLAY' && entry.replayNextRank
        ? entry.replayNextRank
        : proposedChange.nextRank;
    const flags = resolveFlags(
      entry.currentRank,
      proposalRank,
      entry.wins,
      entry.losses,
      entry.absent,
    );
    cases.push({
      id: entry.id,
      currentRank: entry.currentRank,
      result: {
        wins: entry.wins,
        losses: entry.losses,
        absent: entry.absent,
      },
      historyWindow: entry.historyWindow,
      proposalRank,
      flags,
    });
  }

  const reviewed = reviewBoard(cases);
  const reviewedById = new Map(reviewed.decisions.map((decision) => [decision.id, decision]));
  const allocations: BanzukeComposeAllocation[] = [];
  const decisionLogs: ComposeNextBanzukeOutput['decisionLogs'] = [];

  for (const committeeCase of cases) {
    const review = reviewedById.get(committeeCase.id);
    const finalRank = review?.finalRank ?? committeeCase.proposalRank;
    const proposedChange = proposedById.get(committeeCase.id);
    if (!proposedChange) continue;

    allocations.push({
      id: committeeCase.id,
      currentRank: committeeCase.currentRank,
      proposalRank: committeeCase.proposalRank,
      finalRank,
      flags: committeeCase.flags,
      proposedChange,
    });

    decisionLogs.push({
      careerId: input.careerId,
      seq: input.seq,
      rikishiId: committeeCase.id,
      fromRank: committeeCase.currentRank,
      proposedRank: committeeCase.proposalRank,
      finalRank,
      reasons: review?.reasons ?? ['AUTO_ACCEPTED'],
      votes: review?.votes,
    });
  }

  return {
    allocations,
    cases,
    decisionLogs,
    warnings: reviewed.warnings,
  };
};
