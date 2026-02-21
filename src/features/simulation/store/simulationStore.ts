import { create } from 'zustand';
import { Oyakata, RikishiStatus } from '../../../logic/models';
import {
  buildCareerStartYearMonth,
  commitCareer,
  createDraftCareer,
  deleteCareer,
  discardDraftCareer,
  isCareerSaved,
  listCommittedCareers,
  loadCareerStatus,
  type CareerListItem,
} from '../../../logic/persistence/repository';
import {
  PauseReason,
  SimulationProgressSnapshot,
} from '../../../logic/simulation/engine';
import {
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from '../../../logic/simulation/workerProtocol';

export type SimulationPhase = 'idle' | 'running' | 'paused' | 'completed' | 'error';

interface SimulationStore {
  phase: SimulationPhase;
  status: RikishiStatus | null;
  progress: SimulationProgressSnapshot | null;
  currentCareerId: string | null;
  isCurrentCareerSaved: boolean;
  isSkipToEnd: boolean;
  pauseReason?: PauseReason;
  latestEvents: string[];
  hallOfFame: CareerListItem[];
  errorMessage?: string;
  startSimulation: (initialStats: RikishiStatus, oyakata: Oyakata | null) => Promise<void>;
  pauseSimulation: () => void;
  resumeSimulation: () => void;
  skipToEnd: () => void;
  stopSimulation: () => Promise<void>;
  saveCurrentCareer: () => Promise<void>;
  loadHallOfFame: () => Promise<void>;
  openCareer: (careerId: string) => Promise<void>;
  deleteCareerById: (careerId: string) => Promise<void>;
  resetView: () => Promise<void>;
}

let worker: Worker | null = null;

const terminateWorker = (): void => {
  if (!worker) return;
  worker.terminate();
  worker = null;
};

const postToWorker = (message: SimulationWorkerRequest): void => {
  if (!worker) return;
  worker.postMessage(message);
};

const toLatestEvents = (events: { description: string }[]): string[] =>
  events.map((event) => event.description).slice(-3).reverse();

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  phase: 'idle',
  status: null,
  progress: null,
  currentCareerId: null,
  isCurrentCareerSaved: false,
  isSkipToEnd: false,
  pauseReason: undefined,
  latestEvents: [],
  hallOfFame: [],
  errorMessage: undefined,

  startSimulation: async (initialStats, oyakata) => {
    const currentCareerId = get().currentCareerId;
    if (currentCareerId && !get().isCurrentCareerSaved) {
      await discardDraftCareer(currentCareerId);
    }

    terminateWorker();

    const now = new Date();
    const careerId = await createDraftCareer({
      initialStatus: initialStats,
      careerStartYearMonth: buildCareerStartYearMonth(now.getFullYear(), 1),
    });

    worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const message = event.data;

      if (message.type === 'BASHO_PROGRESS') {
        set({
          phase: 'running',
          status: message.payload.status,
          progress: message.payload.progress,
          currentCareerId: message.payload.careerId,
          isCurrentCareerSaved: false,
          latestEvents: toLatestEvents(message.payload.events),
          pauseReason: undefined,
          errorMessage: undefined,
        });
        return;
      }

      if (message.type === 'PAUSED') {
        const shouldSkip = get().isSkipToEnd;
        if (shouldSkip) {
          set({
            phase: 'running',
            status: message.payload.status,
            progress: message.payload.progress,
            currentCareerId: message.payload.careerId,
            latestEvents: toLatestEvents(message.payload.events),
            pauseReason: undefined,
            errorMessage: undefined,
          });
          postToWorker({ type: 'RESUME' });
          return;
        }
        set({
          phase: 'paused',
          status: message.payload.status,
          progress: message.payload.progress,
          currentCareerId: message.payload.careerId,
          latestEvents: toLatestEvents(message.payload.events),
          pauseReason: message.payload.reason,
          errorMessage: undefined,
        });
        return;
      }

      if (message.type === 'COMPLETED') {
        set({
          phase: 'completed',
          status: message.payload.status,
          progress: message.payload.progress,
          currentCareerId: message.payload.careerId,
          latestEvents: toLatestEvents(message.payload.events),
          pauseReason: undefined,
          errorMessage: undefined,
          isCurrentCareerSaved: false,
          isSkipToEnd: false,
        });
        terminateWorker();
        return;
      }

      if (message.type === 'ERROR') {
        set({
          phase: 'error',
          errorMessage: message.payload.message,
        });
        terminateWorker();
      }
    };

    worker.onerror = (event) => {
      set({
        phase: 'error',
        errorMessage: event.message || 'Worker error',
      });
      terminateWorker();
    };

    set({
      phase: 'running',
      status: null,
      progress: null,
      currentCareerId: careerId,
      isCurrentCareerSaved: false,
      isSkipToEnd: false,
      pauseReason: undefined,
      latestEvents: [],
      errorMessage: undefined,
    });

    postToWorker({
      type: 'START',
      payload: {
        careerId,
        initialStats,
        oyakata,
      },
    });
  },

  pauseSimulation: () => {
    postToWorker({ type: 'PAUSE' });
  },

  resumeSimulation: () => {
    const phase = get().phase;
    if (phase !== 'paused') return;
    postToWorker({ type: 'RESUME' });
    set({ phase: 'running', pauseReason: undefined });
  },

  skipToEnd: () => {
    const phase = get().phase;
    set({ isSkipToEnd: true });
    if (phase === 'paused') {
      postToWorker({ type: 'RESUME' });
      set({ phase: 'running', pauseReason: undefined });
    }
  },

  stopSimulation: async () => {
    const careerId = get().currentCareerId;
    postToWorker({ type: 'STOP' });
    terminateWorker();
    if (careerId && !get().isCurrentCareerSaved) {
      await discardDraftCareer(careerId);
    }
    set({
      phase: 'idle',
      status: null,
      progress: null,
      currentCareerId: null,
      isCurrentCareerSaved: false,
      isSkipToEnd: false,
      pauseReason: undefined,
      latestEvents: [],
      errorMessage: undefined,
    });
  },

  saveCurrentCareer: async () => {
    const careerId = get().currentCareerId;
    if (!careerId) return;
    await commitCareer(careerId);
    const saved = await isCareerSaved(careerId);
    set({ isCurrentCareerSaved: saved });
    await get().loadHallOfFame();
  },

  loadHallOfFame: async () => {
    const hallOfFame = await listCommittedCareers();
    set({ hallOfFame });
  },

  openCareer: async (careerId) => {
    const status = await loadCareerStatus(careerId);
    if (!status) return;

    set({
      status,
      phase: 'completed',
      currentCareerId: careerId,
      isCurrentCareerSaved: true,
      isSkipToEnd: false,
      pauseReason: undefined,
      latestEvents: [],
      errorMessage: undefined,
    });
  },

  deleteCareerById: async (careerId) => {
    await deleteCareer(careerId);
    const currentCareerId = get().currentCareerId;
    if (currentCareerId === careerId) {
      set({
        currentCareerId: null,
        status: null,
        phase: 'idle',
        progress: null,
        isCurrentCareerSaved: false,
        isSkipToEnd: false,
        latestEvents: [],
      });
    }
    await get().loadHallOfFame();
  },

  resetView: async () => {
    if (get().phase === 'running' || get().phase === 'paused') {
      await get().stopSimulation();
      return;
    }
    set({
      phase: 'idle',
      status: null,
      progress: null,
      currentCareerId: null,
      isCurrentCareerSaved: false,
      isSkipToEnd: false,
      pauseReason: undefined,
      latestEvents: [],
      errorMessage: undefined,
    });
  },
}));
