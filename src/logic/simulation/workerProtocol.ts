import { BashoRecord, Oyakata, RikishiStatus, SimulationRunOptions, TimelineEvent } from '../models';
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

export interface StartSimulationMessage {
  type: 'START';
  payload: {
    careerId: string;
    initialStats: RikishiStatus;
    oyakata: Oyakata | null;
    runOptions?: SimulationRunOptions;
    simulationModelVersion?: SimulationModelVersion;
    initialPacing: 'chaptered' | 'observe' | 'skip_to_end';
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
    careerId: string;
    seq: number;
    year: number;
    month: number;
    playerRecord: BashoRecord;
    status: RikishiStatus;
    events: TimelineEvent[];
    progress: SimulationProgressSnapshot;
    observation: SimulationObservationEntry;
    latestBashoView: LiveBashoViewModel;
    pauseForChapter?: boolean;
  };
}

export interface WorkerCompletedMessage {
  type: 'COMPLETED';
  payload: {
    careerId: string;
    status: RikishiStatus;
    events: TimelineEvent[];
    progress: SimulationProgressSnapshot;
    observation: SimulationObservationEntry;
    pauseReason?: PauseReason;
    latestBashoView?: LiveBashoViewModel | null;
    pauseForChapter?: boolean;
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
  | WorkerErrorMessage;
