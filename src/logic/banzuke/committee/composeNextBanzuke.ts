import { Rank } from '../../models';
import { getRankValue } from '../../ranking/rankScore';
import { calculateNextRank } from '../rules/singleRankChange';
import {
  BanzukeCommitteeCase,
  BanzukeComposeAllocation,
  BanzukeDecisionReasonCode,
  BanzukeProposalSource,
  ComposeNextBanzukeInput,
  ComposeNextBanzukeOutput,
} from '../types';
import { resolveConstraintHits } from '../rules/constraints';
import { reviewBoard } from './reviewBoard';
import { DEFAULT_SIMULATION_MODEL_VERSION } from '../../simulation/modelVersion';

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
const LOWER_DIVISIONS = new Set<Rank['division']>([
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
]);

const hasBoundarySlotJamRisk = (currentRank: Rank, proposalRank: Rank): boolean => {
  const currentLower = LOWER_DIVISIONS.has(currentRank.division);
  const proposalLower = LOWER_DIVISIONS.has(proposalRank.division);
  // In lower divisions, large movement for dominant records (e.g. 7-0) is expected.
  if (currentLower && proposalLower) return false;

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

const resolveProposalSource = (
  input: ComposeNextBanzukeInput,
  entry: ComposeNextBanzukeInput['entries'][number],
): BanzukeProposalSource => {
  if (input.mode === 'REPLAY' && entry.replayNextRank) return 'REPLAY';
  if (entry.currentRank.division === 'Maezumo') return 'MAEZUMO';
  if (entry.options?.topDivisionQuota?.assignedNextRank) return 'TOP_DIVISION';
  if (entry.options?.sekitoriQuota?.assignedNextRank) return 'SEKITORI_BOUNDARY';
  if (entry.options?.lowerDivisionQuota?.assignedNextRank) return 'LOWER_BOUNDARY';
  return 'COMMITTEE_MODEL';
};

const normalizeReasons = (reasons: BanzukeDecisionReasonCode[] | undefined): BanzukeDecisionReasonCode[] =>
  reasons?.length ? reasons : ['AUTO_ACCEPTED'];

export const composeNextBanzuke = (
  input: ComposeNextBanzukeInput,
): ComposeNextBanzukeOutput => {
  const cases: BanzukeCommitteeCase[] = [];
  const proposedById = new Map<string, BanzukeComposeAllocation['proposedChange']>();
  const proposalSourceById = new Map<string, BanzukeProposalSource>();

  for (const entry of input.entries) {
    const proposalSource = resolveProposalSource(input, entry);
    proposalSourceById.set(entry.id, proposalSource);
    const proposedChange = calculateNextRank(
      {
        year: input.year,
        month: input.month,
        rank: entry.currentRank,
        wins: entry.wins,
        losses: entry.losses,
        absent: entry.absent,
        yusho: entry.yusho ?? false,
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
      expectedWins: entry.expectedWins ?? entry.wins,
      strengthOfSchedule: entry.strengthOfSchedule ?? 0,
      performanceOverExpected:
        entry.performanceOverExpected ?? (entry.wins - (entry.expectedWins ?? entry.wins)),
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
    const reasons = normalizeReasons(review?.reasons);
    const proposedChange = proposedById.get(committeeCase.id);
    const proposalSource = proposalSourceById.get(committeeCase.id) ?? 'COMMITTEE_MODEL';
    if (!proposedChange) continue;
    const constraintHits = resolveConstraintHits({
      currentRank: committeeCase.currentRank,
      finalRank,
      wins: committeeCase.result.wins,
      losses: committeeCase.result.losses,
      absent: committeeCase.result.absent,
      historyWindow: committeeCase.historyWindow,
    });

    allocations.push({
      id: committeeCase.id,
      currentRank: committeeCase.currentRank,
      proposalRank: committeeCase.proposalRank,
      finalRank,
      flags: committeeCase.flags,
      proposedChange,
      finalDecision: {
        ...proposedChange,
        nextRank: finalRank,
        proposalSource,
        reasons,
        constraintHits,
      },
    });

    decisionLogs.push({
      careerId: input.careerId,
      seq: input.seq,
      rikishiId: committeeCase.id,
      modelVersion:
        input.entries.find((entry) => entry.id === committeeCase.id)?.options?.simulationModelVersion ??
        DEFAULT_SIMULATION_MODEL_VERSION,
      proposalSource,
      fromRank: committeeCase.currentRank,
      proposedRank: committeeCase.proposalRank,
      finalRank,
      reasons,
      constraintHits,
      shadowDiff: {
        rankChanged: compareRank(committeeCase.proposalRank, finalRank) !== 0,
        eventChanged: proposedChange.nextRank.name !== finalRank.name ||
          proposedChange.nextRank.division !== finalRank.division,
      },
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
