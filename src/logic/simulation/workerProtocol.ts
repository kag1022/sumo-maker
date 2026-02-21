import { BashoRecord, Oyakata, RikishiStatus, TimelineEvent } from '../models';
import { PauseReason, SimulationProgressSnapshot } from './engine';

export interface StartSimulationMessage {
  type: 'START';
  payload: {
    careerId: string;
    initialStats: RikishiStatus;
    oyakata: Oyakata | null;
  };
}

export interface PauseSimulationMessage {
  type: 'PAUSE';
}

export interface ResumeSimulationMessage {
  type: 'RESUME';
}

export interface StopSimulationMessage {
  type: 'STOP';
}

export type SimulationWorkerRequest =
  | StartSimulationMessage
  | PauseSimulationMessage
  | ResumeSimulationMessage
  | StopSimulationMessage;

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
  };
}

export interface WorkerPausedMessage {
  type: 'PAUSED';
  payload: {
    careerId: string;
    reason: PauseReason;
    status: RikishiStatus;
    events: TimelineEvent[];
    progress: SimulationProgressSnapshot;
  };
}

export interface WorkerCompletedMessage {
  type: 'COMPLETED';
  payload: {
    careerId: string;
    status: RikishiStatus;
    events: TimelineEvent[];
    progress: SimulationProgressSnapshot;
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
  | WorkerPausedMessage
  | WorkerCompletedMessage
  | WorkerErrorMessage;
