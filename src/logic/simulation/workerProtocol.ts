import { BashoRecord, Oyakata, RikishiStatus, SimulationRunOptions, TimelineEvent } from '../models';
import { PauseReason, SimulationProgressSnapshot } from './engine';
import { SimulationModelVersion } from './modelVersion';

export interface SimulationObservationEntry {
  seq: number;
  year: number;
  month: number;
  kind: 'milestone' | 'result' | 'danger' | 'closing';
  headline: string;
  detail: string;
}

export interface StartSimulationMessage {
  type: 'START';
  payload: {
    careerId: string;
    initialStats: RikishiStatus;
    oyakata: Oyakata | null;
    runOptions?: SimulationRunOptions;
    simulationModelVersion?: SimulationModelVersion;
    initialPacing: 'observe' | 'skip_to_end';
  };
}

export interface StopSimulationMessage {
  type: 'STOP';
}

export interface SetPacingMessage {
  type: 'SET_PACING';
  payload: {
    pacing: 'observe' | 'skip_to_end';
  };
}

export type SimulationWorkerRequest =
  | StartSimulationMessage
  | StopSimulationMessage
  | SetPacingMessage;

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
