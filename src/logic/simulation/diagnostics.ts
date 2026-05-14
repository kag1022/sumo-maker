import type { EnemyStyleBias } from '../catalog/enemyData';
import type { Division, Rank, WinRoute } from '../models';
import type { SimulationModelVersion } from './modelVersion';
import type { BanzukeEngineVersion } from '../banzuke/types';
import type { BashoFormatKind, BoutPressureContext } from './basho/formatPolicy';
import type { CombatStyle } from './combat/types';
import type { PreBoutPhaseWeights } from './combat/preBoutPhase';
import type { BoutEngagement } from '../kimarite/engagement';
import type { BoutFlowDiagnosticSnapshot } from './combat/boutFlowDiagnosticSnapshot';

export interface SimulationDiagnostics {
  seq: number;
  year: number;
  month: number;
  rank: Rank;
  wins: number;
  losses: number;
  absent: number;
  expectedWins: number;
  strengthOfSchedule: number;
  performanceOverExpected: number;
  promoted: boolean;
  demoted: boolean;
  reason?: string;
  simulationModelVersion: SimulationModelVersion;
  banzukeEngineVersion?: BanzukeEngineVersion;
  torikumiRelaxationHistogram?: Record<string, number>;
  crossDivisionBoutCount?: number;
  lateCrossDivisionBoutCount?: number;
  sameStableViolationCount?: number;
  sameCardViolationCount?: number;
  torikumiRepairHistogram?: Record<string, number>;
  torikumiScheduleViolations?: number;
  torikumiLateDirectTitleBoutCount?: number;
  sanyakuRoundRobinCoverageRate?: number;
  joiAssignmentCoverageRate?: number;
  yokozunaOzekiTailBoutRatio?: number;
  npcTopDivisionBoutRows?: Array<{
    day: number;
    aId: string;
    bId: string;
    aRankName?: string;
    bRankName?: string;
    aWon?: boolean;
    aWinProbability?: number;
    aAbility?: number;
    bAbility?: number;
    fusen?: boolean;
    fusenPair?: boolean;
    fusenWinnerId?: string;
    fusenLoserId?: string;
    fusenReason?: 'partial_kyujo' | 'basho_kyujo' | 'inactive';
    doubleKyujo?: boolean;
    doubleKyujoParticipantIds?: string[];
    scheduledAfterKyujoStart?: boolean;
  }>;
  fusenPairCount?: number;
  doubleKyujoCount?: number;
  bashoVariance?: {
    playerBashoFormDelta: number;
    conditionBefore: number;
    conditionAfter: number;
  };
}

export type BoutWinProbSnapshotSource = 'PLAYER_BOUT' | 'NPC_BOUT';

export type BoutWinProbSnapshotCall =
  | 'PLAYER_BASE'
  | 'PLAYER_BASELINE'
  | 'NPC_MAIN';

export interface BoutWinProbSnapshotRunContext {
  runLabel?: string;
  seed?: number;
}

export interface BoutWinProbSnapshot {
  source: BoutWinProbSnapshotSource;
  call: BoutWinProbSnapshotCall;
  runLabel?: string;
  seed?: number;
  division?: Division;
  formatKind?: BashoFormatKind;
  totalBouts?: number;
  calendarDay?: number;
  boutOrdinal?: number;
  attackerAbility: number;
  defenderAbility: number;
  attackerStyle?: EnemyStyleBias;
  defenderStyle?: EnemyStyleBias;
  injuryPenalty?: number;
  bonus?: number;
  diffSoftCap?: number;
  probability: number;
  baseWinProbability?: number;
  baselineWinProbability?: number;
  compressedWinProbability?: number;
  projectedExpectedWins?: number;
  pressure?: {
    isKachiMakeDecider?: boolean;
    isKachikoshiDecider?: boolean;
    isMakekoshiDecider?: boolean;
    isFinalBout?: boolean;
    isYushoRelevant?: boolean;
    isPromotionRelevant?: boolean;
    isDemotionRelevant?: boolean;
  };
  currentWins?: number;
  currentLosses?: number;
  currentWinStreak?: number;
  currentLossStreak?: number;
  opponentWinStreak?: number;
  opponentLossStreak?: number;
  injuryPenaltySource?: 'player.injuryLevel';
  traitGenomeSummary?: {
    traitCount: number;
    hasGenome: boolean;
    basePower: number;
    modifiedPower: number;
    bonus: number;
  };
  playerOpponentForm?: {
    enemyAbilityInput?: number;
    enemyPower: number;
    enemyBashoFormDelta?: number;
    enemyAbilityRawUsed: number;
    enemyAbilityRawIfSingleForm: number;
    enemyAbilityRawIfDuplicateForm: number;
    enemyAbilityUsed: number;
    enemyAbilityIfSingleForm: number;
    enemyAbilityIfDuplicateForm: number;
    estimatedExtraEnemyAbility: number;
    estimatedDuplicateEnemyAbility: number;
    baseWinProbabilityIfSingleForm: number;
    baselineWinProbabilityIfSingleForm: number;
    baseWinProbabilityIfDuplicateForm: number;
    baselineWinProbabilityIfDuplicateForm: number;
  };
  npc?: {
    aAbilityBeforeProbability?: number;
    bAbilityBeforeProbability?: number;
    aBashoFormDelta?: number;
    bBashoFormDelta?: number;
    aStableFactor?: number;
    bStableFactor?: number;
    aCompetitiveFactor?: number;
    bCompetitiveFactor?: number;
    aNoise?: number;
    bNoise?: number;
    aScoreMomentum?: number;
    bScoreMomentum?: number;
    aStreakMomentum?: number;
    bStreakMomentum?: number;
    aExpectedWinsBefore?: number;
    bExpectedWinsBefore?: number;
    aKyujo?: boolean;
    bKyujo?: boolean;
    fusen?: boolean;
  };
}

type BoutWinProbSnapshotCollector = (snapshot: BoutWinProbSnapshot) => void;

let boutWinProbSnapshotCollector: BoutWinProbSnapshotCollector | null = null;
let boutWinProbSnapshotRunContext: BoutWinProbSnapshotRunContext = {};

export const recordBoutWinProbSnapshot = (
  snapshot: BoutWinProbSnapshot,
): void => {
  if (!boutWinProbSnapshotCollector) return;
  boutWinProbSnapshotCollector({
    ...boutWinProbSnapshotRunContext,
    ...snapshot,
  });
};

export const isBoutWinProbSnapshotEnabled = (): boolean =>
  boutWinProbSnapshotCollector !== null;

export const withBoutWinProbSnapshotCollector = async <T>(
  context: BoutWinProbSnapshotRunContext,
  collector: BoutWinProbSnapshotCollector,
  run: () => Promise<T> | T,
): Promise<T> => {
  const previousCollector = boutWinProbSnapshotCollector;
  const previousContext = boutWinProbSnapshotRunContext;
  boutWinProbSnapshotCollector = collector;
  boutWinProbSnapshotRunContext = context;
  try {
    return await run();
  } finally {
    boutWinProbSnapshotCollector = previousCollector;
    boutWinProbSnapshotRunContext = previousContext;
  }
};

export type PreBoutPhaseSnapshotSource = 'PLAYER_BOUT';

export interface PreBoutPhaseSnapshotRunContext {
  runLabel?: string;
  seed?: number;
}

export interface PreBoutPhaseSnapshot {
  source: PreBoutPhaseSnapshotSource;
  runLabel?: string;
  seed?: number;
  division?: Division;
  formatKind?: BashoFormatKind;
  calendarDay?: number;
  boutOrdinal?: number;
  attackerStyle?: CombatStyle;
  defenderStyle?: CombatStyle;
  attackerBodyScore?: number;
  defenderBodyScore?: number;
  pressure?: Partial<BoutPressureContext>;
  weights: PreBoutPhaseWeights;
  reasonTags: readonly string[];
}

type PreBoutPhaseSnapshotCollector = (snapshot: PreBoutPhaseSnapshot) => void;

let preBoutPhaseSnapshotCollector: PreBoutPhaseSnapshotCollector | null = null;
let preBoutPhaseSnapshotRunContext: PreBoutPhaseSnapshotRunContext = {};

export const recordPreBoutPhaseSnapshot = (
  snapshot: PreBoutPhaseSnapshot,
): void => {
  if (!preBoutPhaseSnapshotCollector) return;
  preBoutPhaseSnapshotCollector({
    ...preBoutPhaseSnapshotRunContext,
    ...snapshot,
  });
};

export const isPreBoutPhaseSnapshotEnabled = (): boolean =>
  preBoutPhaseSnapshotCollector !== null;

export const withPreBoutPhaseSnapshotCollector = async <T>(
  context: PreBoutPhaseSnapshotRunContext,
  collector: PreBoutPhaseSnapshotCollector,
  run: () => Promise<T> | T,
): Promise<T> => {
  const previousCollector = preBoutPhaseSnapshotCollector;
  const previousContext = preBoutPhaseSnapshotRunContext;
  preBoutPhaseSnapshotCollector = collector;
  preBoutPhaseSnapshotRunContext = context;
  try {
    return await run();
  } finally {
    preBoutPhaseSnapshotCollector = previousCollector;
    preBoutPhaseSnapshotRunContext = previousContext;
  }
};

export type BoutExplanationSnapshotSource = 'PLAYER_BOUT';

export type ExplanationFactorDirection =
  | 'FOR_ATTACKER'
  | 'FOR_DEFENDER'
  | 'NEUTRAL';

export type ExplanationFactorKind =
  | 'ABILITY'
  | 'STYLE'
  | 'BODY'
  | 'FORM'
  | 'PRESSURE'
  | 'MOMENTUM'
  | 'INJURY'
  | 'KIMARITE'
  | 'PHASE'
  | 'REALISM'
  | 'UNKNOWN';

export type ExplanationFactorStrength =
  | 'SMALL'
  | 'MEDIUM'
  | 'LARGE';

export interface BoutExplanationFactor {
  kind: ExplanationFactorKind;
  direction: ExplanationFactorDirection;
  strength: ExplanationFactorStrength;
  label: string;
}

export interface BoutExplanationSnapshotRunContext {
  runLabel?: string;
  seed?: number;
}

export interface BoutExplanationSnapshot {
  source: BoutExplanationSnapshotSource;
  runLabel?: string;
  seed?: number;
  division?: Division;
  rank?: Rank;
  formatKind?: BashoFormatKind;
  totalBouts?: number;
  calendarDay?: number;
  boutOrdinal?: number;
  currentWins?: number;
  currentLosses?: number;
  currentWinStreak?: number;
  currentLossStreak?: number;
  previousResult?: 'WIN' | 'LOSS' | 'ABSENT';
  titleImplication?: 'DIRECT' | 'CHASE' | 'NONE';
  boundaryImplication?: 'PROMOTION' | 'DEMOTION' | 'NONE';
  isKinboshiContext?: boolean;
  baseWinProbability?: number;
  winProbability?: number;
  baselineWinProbability?: number;
  compressedWinProbability?: number;
  preBoutPhaseWeights?: PreBoutPhaseWeights;
  preBoutPhaseReasonTags?: readonly string[];
  pressure?: Partial<BoutPressureContext>;
  kimarite?: string;
  winRoute?: WinRoute;
  boutEngagement?: BoutEngagement;
  kimaritePattern?: string;
  factors: readonly BoutExplanationFactor[];
  shortCommentaryDraft?: string;
}

type BoutExplanationSnapshotCollector = (snapshot: BoutExplanationSnapshot) => void;

let boutExplanationSnapshotCollector: BoutExplanationSnapshotCollector | null = null;
let boutExplanationSnapshotRunContext: BoutExplanationSnapshotRunContext = {};

export const recordBoutExplanationSnapshot = (
  snapshot: BoutExplanationSnapshot,
): void => {
  if (!boutExplanationSnapshotCollector) return;
  boutExplanationSnapshotCollector({
    ...boutExplanationSnapshotRunContext,
    ...snapshot,
  });
};

export const isBoutExplanationSnapshotEnabled = (): boolean =>
  boutExplanationSnapshotCollector !== null;

export const withBoutExplanationSnapshotCollector = async <T>(
  context: BoutExplanationSnapshotRunContext,
  collector: BoutExplanationSnapshotCollector,
  run: () => Promise<T> | T,
): Promise<T> => {
  const previousCollector = boutExplanationSnapshotCollector;
  const previousContext = boutExplanationSnapshotRunContext;
  boutExplanationSnapshotCollector = collector;
  boutExplanationSnapshotRunContext = context;
  try {
    return await run();
  } finally {
    boutExplanationSnapshotCollector = previousCollector;
    boutExplanationSnapshotRunContext = previousContext;
  }
};

export interface BoutFlowDiagnosticSnapshotRunContext {
  runLabel?: string;
  seed?: number;
}

type CollectedBoutFlowDiagnosticSnapshot =
  BoutFlowDiagnosticSnapshot & BoutFlowDiagnosticSnapshotRunContext;

type BoutFlowDiagnosticSnapshotCollector = (snapshot: CollectedBoutFlowDiagnosticSnapshot) => void;

let boutFlowDiagnosticSnapshotCollector: BoutFlowDiagnosticSnapshotCollector | null = null;
let boutFlowDiagnosticSnapshotRunContext: BoutFlowDiagnosticSnapshotRunContext = {};

export const recordBoutFlowDiagnosticSnapshot = (
  snapshot: BoutFlowDiagnosticSnapshot,
): void => {
  if (!boutFlowDiagnosticSnapshotCollector) return;
  boutFlowDiagnosticSnapshotCollector({
    ...boutFlowDiagnosticSnapshotRunContext,
    ...snapshot,
  });
};

export const isBoutFlowDiagnosticSnapshotEnabled = (): boolean =>
  boutFlowDiagnosticSnapshotCollector !== null;

export const withBoutFlowDiagnosticSnapshotCollector = async <T>(
  context: BoutFlowDiagnosticSnapshotRunContext,
  collector: BoutFlowDiagnosticSnapshotCollector,
  run: () => Promise<T> | T,
): Promise<T> => {
  const previousCollector = boutFlowDiagnosticSnapshotCollector;
  const previousContext = boutFlowDiagnosticSnapshotRunContext;
  boutFlowDiagnosticSnapshotCollector = collector;
  boutFlowDiagnosticSnapshotRunContext = context;
  try {
    return await run();
  } finally {
    boutFlowDiagnosticSnapshotCollector = previousCollector;
    boutFlowDiagnosticSnapshotRunContext = previousContext;
  }
};
