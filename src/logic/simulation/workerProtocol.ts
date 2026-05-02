import { Oyakata, RikishiStatus, SimulationRunOptions, TimelineEvent } from '../models';
import {
  BashoStepResult,
  CompletedStepResult,
  PauseReason,
  SimulationProgressState,
} from './engine/types';
import { SimulationModelVersion } from './modelVersion';
import {
  SimulationChapterKind,
  SimulationObservationEntry,
} from './runtimeNarrative';
import { DomainEvent, SimulationRuntimeSnapshot } from './runtimeTypes';

export type {
  PauseReason,
  SimulationProgressLite,
  SimulationProgressState,
} from './engine/types';
export type {
  SimulationChapterKind,
  SimulationObservationEntry,
} from './runtimeNarrative';

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

export interface WorkerSeasonStepLitePayload {
  careerId: string;
  mode: 'lite';
  progress: SimulationProgressState;
}

export interface WorkerSeasonStepFullPayload {
  careerId: string;
  mode: 'full';
  progress: SimulationProgressState;
  step: BashoStepResult;
  status: RikishiStatus;
  events: TimelineEvent[];
  domainEvents: DomainEvent[];
  runtime: SimulationRuntimeSnapshot;
  observation: SimulationObservationEntry;
  latestBashoView: LiveBashoViewModel;
  pauseForChapter?: boolean;
}

export interface WorkerSeasonStepMessage {
  type: 'SEASON_STEP';
  payload: WorkerSeasonStepLitePayload | WorkerSeasonStepFullPayload;
}

export interface WorkerRuntimeCompletedMessage {
  type: 'RUNTIME_COMPLETED';
  payload: {
    careerId: string;
    step: CompletedStepResult;
    status: RikishiStatus;
    events: TimelineEvent[];
    domainEvents: DomainEvent[];
    runtime: SimulationRuntimeSnapshot;
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
  | WorkerSeasonStepMessage
  | WorkerRuntimeCompletedMessage
  | WorkerDetailBuildProgressMessage
  | WorkerDetailBuildCompletedMessage
  | WorkerErrorMessage;
