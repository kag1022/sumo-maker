import { BashoRecord, Division, Rank } from '../models';
import { RankCalculationOptions, RankChangeResult } from '../ranking/options';

export type BanzukeMode = 'SIMULATE' | 'REPLAY';

export interface BanzukeDivisionPolicy {
  division: Division;
  capacityMode: 'FIXED' | 'VARIABLE';
  fixedSlots?: number;
  minSlots?: number;
  softMaxSlots?: number;
}

export interface BanzukePopulationSnapshot {
  seq: number;
  year: number;
  month: number;
  headcount: Record<Division, number>;
  activeHeadcount: Record<Division, number>;
}

export interface BanzukeCommitteeCase {
  id: string;
  currentRank: Rank;
  result: {
    wins: number;
    losses: number;
    absent: number;
  };
  historyWindow: BashoRecord[];
  proposalRank: Rank;
  flags: string[];
}

export interface BanzukeDecisionVote {
  judge: string;
  score: number;
}

export interface BanzukeDecisionLog {
  careerId: string;
  seq: number;
  rikishiId: string;
  fromRank: Rank;
  proposedRank: Rank;
  finalRank: Rank;
  reasons: string[];
  votes?: BanzukeDecisionVote[];
}

export interface BanzukeComposeEntry {
  id: string;
  currentRank: Rank;
  wins: number;
  losses: number;
  absent: number;
  historyWindow: BashoRecord[];
  isOzekiKadoban?: boolean;
  isOzekiReturn?: boolean;
  options?: RankCalculationOptions;
  replayNextRank?: Rank;
}

export interface BanzukeComposeAllocation {
  id: string;
  currentRank: Rank;
  proposalRank: Rank;
  finalRank: Rank;
  flags: string[];
  proposedChange: RankChangeResult;
}

export interface ComposeNextBanzukeInput {
  careerId: string;
  seq: number;
  year: number;
  month: number;
  mode: BanzukeMode;
  entries: BanzukeComposeEntry[];
  random?: () => number;
}

export interface ComposeNextBanzukeOutput {
  allocations: BanzukeComposeAllocation[];
  cases: BanzukeCommitteeCase[];
  decisionLogs: BanzukeDecisionLog[];
  warnings: string[];
}
