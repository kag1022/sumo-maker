import { InjuryStatusType, Rank, RealismKpiSnapshot } from '../../logic/models';
import { KimariteTuningPresetId } from '../../logic/kimarite/selection';
import { PauseReason } from '../../logic/simulation/engine';
import { SimulationTimingPhase } from '../../logic/simulation/engine';

export type LogicLabPresetId =
  | 'RANDOM_BASELINE'
  | 'LOW_TALENT_CD'
  | 'STANDARD_B_GRINDER'
  | 'HIGH_TALENT_AS';

export type LogicLabRunPhase =
  | 'idle'
  | 'ready'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error';

export type LogicLabStopReason = PauseReason | 'MAX_BASHO_REACHED';

export interface LogicLabRunConfig {
  presetId: LogicLabPresetId;
  seed: number;
  maxBasho: number;
  kimariteTuningPresetId: KimariteTuningPresetId;
}

export interface LogicLabBashoRecordView {
  wins: number;
  losses: number;
  absent: number;
  yusho: boolean;
}

export interface LogicLabNpcContextRow {
  shikona: string;
  beforeRankLabel: string;
  afterRankLabel: string;
  wins: number;
  losses: number;
  absent: number;
  scoreDiff: number;
  slotDistanceBefore: number;
  slotDistanceAfter: number;
  globalMove: number;
}

export interface LogicLabNpcContext {
  division: Rank['division'];
  playerBeforeRankLabel: string;
  playerAfterRankLabel: string;
  playerGlobalMove: number;
  playerScoreDiff: number;
  outperformedByLowerCount: number;
  underperformedByUpperCount: number;
  rows: LogicLabNpcContextRow[];
}

export interface LogicLabInjuryItem {
  name: string;
  severity: number;
  status: InjuryStatusType;
}

export interface LogicLabInjurySummary {
  injuryLevel: number;
  activeCount: number;
  activeInjuries: LogicLabInjuryItem[];
}

export interface LogicLabBashoLogRow {
  seq: number;
  year: number;
  month: number;
  rankBefore: Rank;
  rankAfter: Rank;
  banzukeReasons: string[];
  record: LogicLabBashoRecordView;
  events: string[];
  injurySummary: LogicLabInjurySummary;
  pauseReason?: LogicLabStopReason;
  committeeWarnings: number;
  npcContext?: LogicLabNpcContext;
  kimariteCount?: Record<string, number>;
}

export interface LogicLabSummary {
  bashoCount: number;
  simulationModelVersion: 'v3';
  kimariteTuningPresetId: KimariteTuningPresetId;
  currentRank: Rank;
  maxRank: Rank;
  age: number;
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  sanshoTotal: number;
  shukunCount: number;
  kantoCount: number;
  ginoCount: number;
  injurySummary: LogicLabInjurySummary;
  committeeWarnings: number;
  realismKpi: RealismKpiSnapshot;
  totalMs: number;
  avgMsPerBasho: number;
  slowestBashoMs: number;
  phaseTotalsMs: Record<SimulationTimingPhase, number>;
  phaseShare: Record<SimulationTimingPhase, number>;
  stopReason?: LogicLabStopReason;
}
