import type { EnemyStyleBias } from '../catalog/enemyData';
import type { Division, Rank } from '../models';
import type { SimulationModelVersion } from './modelVersion';
import type { BanzukeEngineVersion } from '../banzuke/types';
import type { BashoFormatKind } from './basho/formatPolicy';

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
