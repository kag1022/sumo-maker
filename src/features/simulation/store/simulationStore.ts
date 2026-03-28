import { create } from 'zustand';
import { Oyakata, RikishiStatus, SimulationRunOptions } from '../../../logic/models';
import { normalizeNewRunModelVersion, SimulationModelVersion } from '../../../logic/simulation/modelVersion';
import {
  buildCareerStartYearMonth,
  createDraftCareer,
  deleteCareer,
  discardCareer,
  isCareerSaved,
  listShelvedCareers,
  listUnshelvedCareers,
  loadCareerStatus,
  shelveCareer,
  type CareerListItem,
} from '../../../logic/persistence/careers';
import { PauseReason, SimulationProgressSnapshot } from '../../../logic/simulation/engine';
import {
  resolveSimulationPhaseOnCompletion,
  resolveSimulationPhaseOnStart,
  shouldCaptureObservations,
} from '../../../logic/simulation/appFlow';
import {
  LiveBashoViewModel,
  SimulationObservationEntry,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from '../../../logic/simulation/workerProtocol';

export type SimulationPhase =
  | 'idle'
  | 'simulating'
  | 'chapter_ready'
  | 'reveal_ready'
  | 'running'
  | 'completed'
  | 'error';
export type SimulationPacing = 'chaptered' | 'observe' | 'skip_to_end';

interface SimulationStore {
  phase: SimulationPhase;
  status: RikishiStatus | null;
  progress: SimulationProgressSnapshot | null;
  currentCareerId: string | null;
  isCurrentCareerSaved: boolean;
  simulationPacing: SimulationPacing;
  latestBashoView: LiveBashoViewModel | null;
  latestEvents: string[];
  observationLog: SimulationObservationEntry[];
  latestObservation: SimulationObservationEntry | null;
  isTerminalChapterReady: boolean;
  latestPauseReason?: PauseReason;
  hallOfFame: CareerListItem[];
  unshelvedCareers: CareerListItem[];
  errorMessage?: string;
  setSimulationPacing: (pacing: SimulationPacing) => void;
  continueChapter: () => void;
  startSimulation: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    runOptions?: SimulationRunOptions,
    simulationModelVersion?: SimulationModelVersion,
    initialPacing?: SimulationPacing,
  ) => Promise<void>;
  skipToEnd: () => void;
  revealCurrentResult: () => void;
  stopSimulation: () => Promise<void>;
  saveCurrentCareer: () => Promise<void>;
  loadHallOfFame: () => Promise<void>;
  loadUnshelvedCareers: () => Promise<void>;
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

const pushObservation = (
  current: SimulationObservationEntry[],
  next: SimulationObservationEntry,
): SimulationObservationEntry[] => [next, ...current].slice(0, 14);

export const useSimulationStore = create<SimulationStore>((set, get) => ({
  phase: 'idle',
  status: null,
  progress: null,
  currentCareerId: null,
  isCurrentCareerSaved: false,
  simulationPacing: 'chaptered',
  latestBashoView: null,
  latestEvents: [],
  observationLog: [],
  latestObservation: null,
  isTerminalChapterReady: false,
  latestPauseReason: undefined,
  hallOfFame: [],
  unshelvedCareers: [],
  errorMessage: undefined,

  setSimulationPacing: (pacing) => {
    postToWorker({ type: 'SET_PACING', payload: { pacing } });
    set({ simulationPacing: pacing });
  },

  continueChapter: () => {
    const state = get();
    if (state.phase !== 'chapter_ready') return;
    if (state.isTerminalChapterReady) {
      set({
        phase: 'completed',
        isTerminalChapterReady: false,
      });
      return;
    }
    postToWorker({ type: 'RESUME' });
    set({
      phase: 'running',
      isTerminalChapterReady: false,
      latestPauseReason: undefined,
    });
  },

  startSimulation: async (
    initialStats,
    oyakata,
    runOptions,
    simulationModelVersion,
    initialPacing = 'chaptered',
  ) => {
    const normalizedModelVersion = normalizeNewRunModelVersion(simulationModelVersion);
    const currentCareerId = get().currentCareerId;
    if (currentCareerId && !get().isCurrentCareerSaved) {
      await discardCareer(currentCareerId);
    }

    terminateWorker();

    const now = new Date();
    const careerId = await createDraftCareer({
      initialStatus: initialStats,
      careerStartYearMonth: buildCareerStartYearMonth(now.getFullYear(), 1),
      simulationModelVersion: normalizedModelVersion,
      selectedOyakataId: runOptions?.selectedOyakataId,
    });

    worker = new Worker(new URL('../workers/simulation.worker.ts', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event: MessageEvent<SimulationWorkerResponse>) => {
      const message = event.data;

      if (message.type === 'BASHO_PROGRESS') {
        const state = get();
        const chapterKind = message.payload.observation.chapterKind;
        set({
          phase: message.payload.pauseForChapter
            ? 'chapter_ready'
            : state.phase === 'simulating'
              ? 'simulating'
              : 'running',
          status: message.payload.status,
          progress: message.payload.progress,
          currentCareerId: message.payload.careerId,
          isCurrentCareerSaved: false,
          latestBashoView: message.payload.latestBashoView,
          latestEvents: toLatestEvents(message.payload.events),
          observationLog: pushObservation(state.observationLog, message.payload.observation),
          latestObservation: message.payload.observation,
          isTerminalChapterReady: false,
          simulationPacing: state.simulationPacing,
          latestPauseReason: chapterKind === 'INJURY' ? 'INJURY' : undefined,
          errorMessage: undefined,
        });
        return;
      }

      if (message.type === 'COMPLETED') {
        const completedWithObserve = shouldCaptureObservations(get().simulationPacing);
        set({
          phase: message.payload.pauseForChapter
            ? 'chapter_ready'
            : resolveSimulationPhaseOnCompletion(get().simulationPacing),
          status: message.payload.status,
          progress: message.payload.progress,
          currentCareerId: message.payload.careerId,
          latestBashoView: message.payload.latestBashoView ?? get().latestBashoView,
          latestEvents: completedWithObserve ? toLatestEvents(message.payload.events) : [],
          observationLog: completedWithObserve
            ? pushObservation(get().observationLog, message.payload.observation)
            : [],
          latestObservation: completedWithObserve ? message.payload.observation : null,
          latestPauseReason: completedWithObserve ? message.payload.pauseReason : undefined,
          errorMessage: undefined,
          isCurrentCareerSaved: false,
          isTerminalChapterReady: Boolean(message.payload.pauseForChapter),
        });
        terminateWorker();
        void get().loadUnshelvedCareers();
        return;
      }

      if (message.type === 'ERROR') {
        set({
          phase: 'error',
          latestBashoView: null,
          latestObservation: null,
          isTerminalChapterReady: false,
          errorMessage: message.payload.message,
        });
        terminateWorker();
      }
    };

    worker.onerror = (event) => {
      set({
        phase: 'error',
        latestBashoView: null,
        latestObservation: null,
        isTerminalChapterReady: false,
        errorMessage: event.message || 'Worker error',
      });
      terminateWorker();
    };

    set({
      phase: resolveSimulationPhaseOnStart(initialPacing),
      status: null,
      progress: null,
      currentCareerId: careerId,
      isCurrentCareerSaved: false,
      simulationPacing: initialPacing,
      latestBashoView: null,
      latestEvents: [],
      observationLog: [],
      latestObservation: null,
      isTerminalChapterReady: false,
      latestPauseReason: undefined,
      errorMessage: undefined,
    });

    postToWorker({
      type: 'START',
      payload: {
        careerId,
        initialStats,
        oyakata,
        runOptions,
        simulationModelVersion: normalizedModelVersion,
        initialPacing,
      },
    });
  },

  skipToEnd: () => {
    const state = get();
    postToWorker({ type: 'SET_PACING', payload: { pacing: 'skip_to_end' } });
    set({
      simulationPacing: 'skip_to_end',
      phase:
        state.phase === 'chapter_ready'
          ? state.isTerminalChapterReady
            ? 'completed'
            : 'running'
          : state.phase,
      isTerminalChapterReady: false,
    });
  },

  revealCurrentResult: () => {
    if (get().phase !== 'reveal_ready' || !get().status) return;
    set({ phase: 'completed' });
  },

  stopSimulation: async () => {
    const careerId = get().currentCareerId;
    postToWorker({ type: 'STOP' });
    terminateWorker();
    if (careerId && !get().isCurrentCareerSaved) {
      await discardCareer(careerId);
    }
    set({
      phase: 'idle',
      status: null,
      progress: null,
      currentCareerId: null,
      isCurrentCareerSaved: false,
      simulationPacing: 'chaptered',
      latestBashoView: null,
      latestEvents: [],
      observationLog: [],
      latestObservation: null,
      isTerminalChapterReady: false,
      latestPauseReason: undefined,
      errorMessage: undefined,
    });
    await get().loadUnshelvedCareers();
  },

  saveCurrentCareer: async () => {
    const careerId = get().currentCareerId;
    if (!careerId) return;
    await shelveCareer(careerId);
    const saved = await isCareerSaved(careerId);
    const refreshedStatus = await loadCareerStatus(careerId);
    set({
      isCurrentCareerSaved: saved,
      ...(refreshedStatus ? { status: refreshedStatus } : {}),
    });
    await get().loadHallOfFame();
    await get().loadUnshelvedCareers();
  },

  loadHallOfFame: async () => {
    const hallOfFame = await listShelvedCareers();
    set({ hallOfFame });
  },

  loadUnshelvedCareers: async () => {
    const unshelvedCareers = await listUnshelvedCareers();
    set({ unshelvedCareers });
  },

  openCareer: async (careerId) => {
    const status = await loadCareerStatus(careerId);
    if (!status) return;

    const saved = await isCareerSaved(careerId);
    set({
      status,
      phase: 'completed',
      progress: null,
      currentCareerId: careerId,
      isCurrentCareerSaved: saved,
      simulationPacing: 'chaptered',
      latestBashoView: null,
      latestEvents: [],
      observationLog: [],
      latestObservation: null,
      isTerminalChapterReady: false,
      latestPauseReason: undefined,
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
        simulationPacing: 'chaptered',
        latestBashoView: null,
        latestEvents: [],
        observationLog: [],
        latestObservation: null,
        isTerminalChapterReady: false,
        latestPauseReason: undefined,
      });
    }
    await get().loadHallOfFame();
    await get().loadUnshelvedCareers();
  },

  resetView: async () => {
    if (get().phase === 'running' || get().phase === 'chapter_ready') {
      await get().stopSimulation();
      return;
    }
    const currentCareerId = get().currentCareerId;
    if (currentCareerId && !get().isCurrentCareerSaved) {
      await discardCareer(currentCareerId);
    }
    set({
      phase: 'idle',
      status: null,
      progress: null,
      currentCareerId: null,
      isCurrentCareerSaved: false,
      simulationPacing: 'chaptered',
      latestBashoView: null,
      latestEvents: [],
      observationLog: [],
      latestObservation: null,
      isTerminalChapterReady: false,
      latestPauseReason: undefined,
      errorMessage: undefined,
    });
    await get().loadUnshelvedCareers();
  },
}));
