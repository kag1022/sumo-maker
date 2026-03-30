import { BashoRecord, Oyakata, Rank, RikishiStatus, SimulationRunOptions, TimelineEvent } from '../models';
import { PauseReason, SimulationProgressSnapshot } from './engine';
import { SimulationModelVersion } from './modelVersion';

export interface SimulationObservationEntry {
  seq: number;
  year: number;
  month: number;
  kind: 'milestone' | 'result' | 'danger' | 'closing';
  chapterKind: SimulationChapterKind | null;
  headline: string;
  detail: string;
}

export type SimulationChapterKind =
  | 'DEBUT'
  | 'SEKITORI'
  | 'SANYAKU'
  | 'TITLE_RACE'
  | 'INJURY'
  | 'RETIREMENT'
  | 'EPILOGUE';

export type LiveBashoTone = 'title' | 'promotion' | 'demotion' | 'duty' | 'normal';

export interface FeaturedBoutModel {
  day: number | null;
  kindLabel: string;
  summary: string;
  matchup: string;
  phaseLabel: string;
  tone: LiveBashoTone;
}

export interface TorikumiSlateItemModel {
  id: string;
  day: number;
  kindLabel: string;
  summary: string;
  matchup: string;
  phaseLabel: string;
  tone: LiveBashoTone;
  isFeatured?: boolean;
}

export interface LiveBashoRaceSummaryItem {
  id: string;
  label: string;
  value: string;
  tone: LiveBashoTone;
}

export interface LiveBashoDiagnosticsSummary {
  scheduleViolations: number;
  repairCount: number;
  crossDivisionBoutCount: number;
  lateDirectTitleBoutCount: number;
}

export interface LiveBashoViewModel {
  seq: number;
  year: number;
  month: number;
  day: number | null;
  currentAge: number | null;
  playerDivision: string;
  currentRank: string;
  currentRecord: string;
  phaseId: string;
  chapterKind: SimulationChapterKind | null;
  chapterTitle: string;
  chapterReason: string;
  heroMoment: string;
  nextBeatLabel: string;
  contentionTier: 'Leader' | 'Contender' | 'Outside';
  titleImplication: 'DIRECT' | 'CHASE' | 'NONE';
  boundaryImplication: 'PROMOTION' | 'DEMOTION' | 'NONE';
  featuredBout: FeaturedBoutModel | null;
  torikumiSlate: TorikumiSlateItemModel[];
  raceSummary: LiveBashoRaceSummaryItem[];
  plannedNextPlayerDay: number | null;
  latestDiagnosticsSummary: LiveBashoDiagnosticsSummary;
}

export type SimulationDetailPolicy = 'buffered' | 'eager';

export interface SimulationProgressLite {
  year: number;
  month: number;
  bashoCount: number;
  currentRank: Rank;
}

export type SimulationProgressState = SimulationProgressSnapshot | SimulationProgressLite;

export interface DetailBuildProgress {
  flushedBashoCount: number;
  totalBashoCount: number;
}

export interface StartSimulationMessage {
  type: 'START';
  payload: {
    careerId: string;
    initialStats: RikishiStatus;
    oyakata: Oyakata | null;
    runOptions?: SimulationRunOptions;
    simulationModelVersion?: SimulationModelVersion;
    initialPacing: 'chaptered' | 'observe' | 'skip_to_end';
    detailPolicy: SimulationDetailPolicy;
  };
}

export interface StopSimulationMessage {
  type: 'STOP';
}

export interface SetPacingMessage {
  type: 'SET_PACING';
  payload: {
    pacing: 'chaptered' | 'observe' | 'skip_to_end';
  };
}

export interface ResumeSimulationMessage {
  type: 'RESUME';
}

export type SimulationWorkerRequest =
  | StartSimulationMessage
  | StopSimulationMessage
  | SetPacingMessage
  | ResumeSimulationMessage;

export interface WorkerProgressMessage {
  type: 'BASHO_PROGRESS';
  payload: {
    mode: 'full' | 'lite';
    careerId: string;
    progress: SimulationProgressState;
    seq?: number;
    year?: number;
    month?: number;
    playerRecord?: BashoRecord;
    status?: RikishiStatus;
    events?: TimelineEvent[];
    observation?: SimulationObservationEntry;
    latestBashoView?: LiveBashoViewModel;
    pauseForChapter?: boolean;
  };
}

export interface WorkerCompletedMessage {
  type: 'COMPLETED';
  payload: {
    careerId: string;
    status: RikishiStatus;
    events: TimelineEvent[];
    progress: SimulationProgressState;
    observation?: SimulationObservationEntry;
    pauseReason?: PauseReason;
    latestBashoView?: LiveBashoViewModel | null;
    pauseForChapter?: boolean;
    detailState: 'building' | 'ready';
  };
}

export interface WorkerDetailBuildProgressMessage {
  type: 'DETAIL_BUILD_PROGRESS';
  payload: {
    careerId: string;
    progress: DetailBuildProgress;
  };
}

export interface WorkerDetailBuildCompletedMessage {
  type: 'DETAIL_BUILD_COMPLETED';
  payload: {
    careerId: string;
    status: RikishiStatus;
    progress: DetailBuildProgress;
  };
}

export interface WorkerErrorMessage {
  type: 'ERROR';
  payload: {
    careerId?: string;
    message: string;
  };
}

export type SimulationWorkerResponse =
  | WorkerProgressMessage
  | WorkerCompletedMessage
  | WorkerDetailBuildProgressMessage
  | WorkerDetailBuildCompletedMessage
  | WorkerErrorMessage;
