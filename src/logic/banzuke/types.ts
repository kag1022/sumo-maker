import { BashoRecord, Division, Rank } from '../models';
import { SimulationModelVersion } from '../simulation/modelVersion';
import { RankScaleSlots } from './scale/rankLimits';

export type BanzukeMode = 'SIMULATE' | 'REPLAY';
export type BanzukeEngineVersion = 'legacy-v1' | 'optimizer-v1' | 'optimizer-v2';

export type BanzukeProposalSource =
  | 'COMMITTEE_MODEL'
  | 'TOP_DIVISION'
  | 'SEKITORI_BOUNDARY'
  | 'LOWER_BOUNDARY'
  | 'MAEZUMO'
  | 'REPLAY';

export type BanzukeConstraintCode =
  | 'YOKOZUNA_NO_DEMOTION'
  | 'OZEKI_PROMOTION_33WINS_GATE'
  | 'KACHIKOSHI_NO_DEMOTION'
  | 'MAKEKOSHI_NO_PROMOTION'
  | 'FULL_ABSENCE_MIN_DEMOTION';

export type BanzukeDecisionReasonCode =
  | 'AUTO_ACCEPTED'
  | 'REVIEW_ACCEPTED'
  | 'REVIEW_REJECTED_RETAIN_PREV_RANK'
  | 'REVIEW_REVERT_KACHIKOSHI_DEMOTION'
  | 'REVIEW_CAP_LIGHT_MAKEKOSHI_DEMOTION'
  | 'REVIEW_FORCE_MAKUSHITA_ZENSHO_JOI'
  | 'REVIEW_BOUNDARY_SLOT_JAM_NOTED'
  | 'AUDIT_PASS'
  | 'AUDIT_CONSTRAINT_HIT'
  | 'AUDIT_FALLBACK_LEGACY';

export interface RankChangeResult {
  nextRank: Rank;
  event?: string;
  isKadoban?: boolean;
  isOzekiReturn?: boolean;
}

export interface RankCalculationOptions {
  topDivisionQuota?: {
    canPromoteToMakuuchi?: boolean;
    canDemoteToJuryo?: boolean;
    enforcedSanyaku?: 'Sekiwake' | 'Komusubi';
    assignedNextRank?: Rank;
    sanyakuVacancies?: { sekiwake: number; komusubi: number };
  };
  sekitoriQuota?: {
    canPromoteToJuryo?: boolean;
    canDemoteToMakushita?: boolean;
    enemyHalfStepNudge?: number;
    assignedNextRank?: Rank;
  };
  lowerDivisionQuota?: {
    canPromoteToMakushita?: boolean;
    canDemoteToSandanme?: boolean;
    canPromoteToSandanme?: boolean;
    canDemoteToJonidan?: boolean;
    canPromoteToJonidan?: boolean;
    canDemoteToJonokuchi?: boolean;
    enemyHalfStepNudge?: number;
    assignedNextRank?: Rank;
  };
  boundaryAssignedNextRank?: Rank;
  empiricalContext?: {
    recordBucket?: string;
    rankBand?: string;
    performanceOverExpected?: number;
  };
  isOzekiReturn?: boolean;
  /** 停滞圧力 (0-4.2): 高値で不利なサンプリング、rebound時は有利 */
  stagnationPressure?: number;
  scaleSlots?: RankScaleSlots;
  simulationModelVersion?: SimulationModelVersion;
  banzukeEngineVersion?: BanzukeEngineVersion;
}

export interface BanzukeDivisionPolicy {
  division: Division;
  capacityMode: 'FIXED' | 'VARIABLE';
  fixedSlots?: number;
  minSlots?: number;
  softMaxSlots?: number;
  targetSlots?: number;
}

export interface BanzukePopulationSnapshot {
  seq: number;
  year: number;
  month: number;
  headcount: Record<Division, number>;
  activeHeadcount: Record<Division, number>;
  banzukeHeadcountExcludingMaezumo: number;
  maezumoHeadcount: number;
  intakeCountThisBasho: number;
  retiredCountThisBasho: number;
  populationPlanIntakeShock?: number;
  populationPlanRetirementShock?: number;
  populationPlanJonidanShock?: number;
  populationPlanJonokuchiShock?: number;
  populationPlanLowerDivisionElasticity?: number;
}

export interface BanzukeCommitteeCase {
  id: string;
  currentRank: Rank;
  result: {
    wins: number;
    losses: number;
    absent: number;
  };
  strengthOfSchedule: number;
  expectedWins: number;
  performanceOverExpected: number;
  historyWindow: BashoRecord[];
  proposalRank: Rank;
  flags: string[];
}

export interface BanzukeDecisionVote {
  judge: string;
  score: number;
}

export interface BanzukeDecisionLog {
  careerId?: string;
  seq: number;
  rikishiId: string;
  modelVersion?: SimulationModelVersion;
  banzukeEngineVersion?: BanzukeEngineVersion;
  proposalSource?: BanzukeProposalSource;
  fromRank: Rank;
  candidateRank?: Rank;
  proposedRank: Rank;
  finalRank: Rank;
  reasons: BanzukeDecisionReasonCode[];
  constraintHits?: BanzukeConstraintCode[];
  ruleBucket?: 'YOKOZUNA' | 'OZEKI' | 'SANYAKU' | 'MAEGASHIRA' | 'JURYO' | 'LOWER';
  usedBoundaryPressure?: boolean;
  usedDiscretion?: boolean;
  proposalBasis?: 'EMPIRICAL' | 'RULE_OVERRIDE';
  recordBucket?: string;
  rankBand?: string;
  overrideNames?: string[];
  wins?: number;
  losses?: number;
  absent?: number;
  shadowDiff?: {
    rankChanged: boolean;
    eventChanged: boolean;
  };
  votes?: BanzukeDecisionVote[];
}

export interface BanzukeDecisionResult extends RankChangeResult {
  proposalSource: BanzukeProposalSource;
  reasons: BanzukeDecisionReasonCode[];
  constraintHits: BanzukeConstraintCode[];
  proposalBasis?: 'EMPIRICAL' | 'RULE_OVERRIDE';
  recordBucket?: string;
  rankBand?: string;
  overrideNames?: string[];
}

export interface BanzukeComposeEntry {
  id: string;
  currentRank: Rank;
  wins: number;
  losses: number;
  absent: number;
  yusho?: boolean;
  expectedWins?: number;
  strengthOfSchedule?: number;
  performanceOverExpected?: number;
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
  finalDecision: BanzukeDecisionResult;
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

export const normalizeBanzukeEngineVersion = (
  version?: BanzukeEngineVersion,
): BanzukeEngineVersion => {
  if (version === 'optimizer-v2') return version;
  return 'optimizer-v2';
};
