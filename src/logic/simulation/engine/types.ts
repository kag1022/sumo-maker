import { BanzukeDecisionLog, BanzukePopulationSnapshot, BanzukeMode, BanzukeEngineVersion } from '../../banzuke';
import { BashoRecord, Division, Oyakata, Rank, RikishiStatus, SimulationRunOptions, TimelineEvent } from '../../models';
import { NpcBashoAggregate, PlayerBoutDetail } from '../basho';
import { SimulationDiagnostics } from '../diagnostics';
import { LowerDivisionPlacementTraceRow } from '../lower/types';
import { SimulationModelVersion } from '../modelVersion';
import { TopDivision } from '../world';

export interface SimulationParams {
  initialStats: RikishiStatus;
  oyakata: Oyakata | null;
  runOptions?: SimulationRunOptions;
  careerId?: string;
  banzukeMode?: BanzukeMode;
  simulationModelVersion?: SimulationModelVersion;
  banzukeEngineVersion?: BanzukeEngineVersion;
}

export interface BanzukeEntry {
  id: string;
  shikona: string;
  division: TopDivision;
  rankScore: number;
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
}

export interface SimulationProgressSnapshot {
  year: number;
  month: number;
  bashoCount: number;
  currentRank: Rank;
  divisionHeadcount: Record<Division, number>;
  divisionActiveHeadcount: Record<Division, number>;
  lastCommitteeWarnings: number;
  sanshoTotal: number;
  shukunCount: number;
  kantoCount: number;
  ginoCount: number;
  makuuchiSlots: number;
  juryoSlots: number;
  makushitaSlots: number;
  sandanmeSlots: number;
  jonidanSlots: number;
  jonokuchiSlots: number;
  makuuchiActive: number;
  juryoActive: number;
  makushitaActive: number;
  sandanmeActive: number;
  jonidanActive: number;
  jonokuchiActive: number;
  makuuchi: BanzukeEntry[];
  juryo: BanzukeEntry[];
  lastDiagnostics?: SimulationDiagnostics;
}

export type PauseReason = 'PROMOTION' | 'INJURY' | 'RETIREMENT';

export interface BashoStepResult {
  kind: 'BASHO';
  seq: number;
  year: number;
  month: number;
  playerRecord: BashoRecord;
  playerBouts: PlayerBoutDetail[];
  npcBashoRecords: NpcBashoAggregate[];
  banzukePopulation: BanzukePopulationSnapshot;
  banzukeDecisions: BanzukeDecisionLog[];
  diagnostics?: SimulationDiagnostics;
  lowerDivisionPlacementTrace?: LowerDivisionPlacementTraceRow[];
  events: TimelineEvent[];
  pauseReason?: PauseReason;
  statusSnapshot: RikishiStatus;
  progress: SimulationProgressSnapshot;
}

export interface CompletedStepResult {
  kind: 'COMPLETED';
  statusSnapshot: RikishiStatus;
  banzukeDecisions: BanzukeDecisionLog[];
  diagnostics?: SimulationDiagnostics;
  pauseReason?: PauseReason;
  events: TimelineEvent[];
  progress: SimulationProgressSnapshot;
}

export type SimulationStepResult = BashoStepResult | CompletedStepResult;

export interface SimulationEngine {
  runNextBasho: () => Promise<SimulationStepResult>;
  getStatus: () => RikishiStatus;
  isCompleted: () => boolean;
}
