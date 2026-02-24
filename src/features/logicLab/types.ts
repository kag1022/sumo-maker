import { InjuryStatusType, Rank } from '../../logic/models';
import { PauseReason } from '../../logic/simulation/engine';
import { SimulationModelVersion } from '../../logic/simulation/modelVersion';

export type LogicLabPresetId =
  | 'M8_BALANCED'
  | 'J2_MONSTER'
  | 'K_BALANCED'
  | 'SD70_MIX'
  | 'JD70_MIX'
  | 'JK_MONSTER';

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
  simulationModelVersion: SimulationModelVersion;
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
}

export interface LogicLabSummary {
  bashoCount: number;
  simulationModelVersion: SimulationModelVersion;
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
  stopReason?: LogicLabStopReason;
}

export interface LogicLabComparisonResult {
  config: {
    presetId: LogicLabPresetId;
    seed: number;
    maxBasho: number;
  };
  legacy: LogicLabSummary;
  realism: LogicLabSummary;
}
