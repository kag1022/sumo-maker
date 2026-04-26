import { create } from 'zustand';
import { Oyakata, RikishiStatus, SimulationRunOptions } from '../../../logic/models';
import { normalizeNewRunModelVersion, SimulationModelVersion } from '../../../logic/simulation/modelVersion';
import {
  buildCareerStartYearMonth,
  clearAllStoredData,
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
import { resetLifetimeCareerCount } from '../../../logic/persistence/lifetimeStats';
import { PauseReason } from '../../../logic/simulation/engine';
import {
  resolveSimulationPhaseOnCompletion,
  resolveSimulationPhaseOnStart,
  shouldCaptureObservations,
} from '../../../logic/simulation/appFlow';
import {
  DetailBuildProgress,
  LiveBashoViewModel,
  SimulationDetailPolicy,
  SimulationObservationEntry,
  SimulationProgressState,
  WorkerSeasonStepFullPayload,
  SimulationWorkerRequest,
  SimulationWorkerResponse,
} from '../../../logic/simulation/workerProtocol';
import { DomainEvent, SimulationRuntimeSnapshot } from '../../../logic/simulation/engine';
import { clearStoredTheme } from '../../../shared/lib/theme';

export type SimulationPhase =
  | 'idle'
  | 'simulating'
  | 'chapter_ready'
  | 'reveal_ready'
  | 'running'
  | 'completed'
  | 'error';
export type SimulationPacing = 'chaptered' | 'observe' | 'skip_to_end';
export type SimulationDetailState = 'idle' | 'building' | 'ready' | 'error';

interface SimulationStore {
  phase: SimulationPhase;
  status: RikishiStatus | null;
  runtimeSnapshot: SimulationRuntimeSnapshot | null;
  progress: SimulationProgressState | null;
  currentCareerId: string | null;
  isCurrentCareerSaved: boolean;
  simulationPacing: SimulationPacing;
  simulationDetailPolicy: SimulationDetailPolicy;
  detailState: SimulationDetailState;
  detailBuildProgress: DetailBuildProgress | null;
  latestBashoView: LiveBashoViewModel | null;
  latestEvents: string[];
  latestDomainEvents: DomainEvent[];
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
  clearAllData: () => Promise<void>;
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
  runtimeSnapshot: null,
  progress: null,
  currentCareerId: null,
  isCurrentCareerSaved: false,
  simulationPacing: 'skip_to_end',
  simulationDetailPolicy: 'buffered',
  detailState: 'idle',
  detailBuildProgress: null,
  latestBashoView: null,
  latestEvents: [],
  latestDomainEvents: [],
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
    initialPacing = 'skip_to_end',
  ) => {
    const normalizedModelVersion = normalizeNewRunModelVersion(simulationModelVersion);
    const currentCareerId = get().currentCareerId;
    if (currentCareerId && !get().isCurrentCareerSaved) {
      terminateWorker();
      await discardCareer(currentCareerId);
    }
    terminateWorker();

    const nextDetailPolicy: SimulationDetailPolicy = initialPacing === 'skip_to_end' ? 'buffered' : 'eager';

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

      if (message.type === 'SEASON_STEP') {
        const state = get();
        if (message.payload.mode === 'lite') {
          set({
            phase: state.phase === 'simulating' ? 'simulating' : 'running',
            progress: message.payload.progress,
            currentCareerId: message.payload.careerId,
            isCurrentCareerSaved: false,
            latestPauseReason: undefined,
            errorMessage: undefined,
          });
          return;
        }
        const fullPayload = message.payload as WorkerSeasonStepFullPayload;
        const chapterKind = fullPayload.observation.chapterKind;
        set({
          phase: fullPayload.pauseForChapter
            ? 'chapter_ready'
            : state.phase === 'simulating'
              ? 'simulating'
              : 'running',
          status: fullPayload.status,
          runtimeSnapshot: fullPayload.runtime,
          progress: fullPayload.progress,
          currentCareerId: fullPayload.careerId,
          isCurrentCareerSaved: false,
          latestBashoView: fullPayload.latestBashoView,
          latestEvents: toLatestEvents(fullPayload.events),
          latestDomainEvents: fullPayload.domainEvents,
          observationLog: pushObservation(state.observationLog, fullPayload.observation),
          latestObservation: fullPayload.observation,
          isTerminalChapterReady: false,
          simulationPacing: state.simulationPacing,
          latestPauseReason: chapterKind === 'INJURY' ? 'INJURY' : undefined,
          errorMessage: undefined,
        });
        return;
      }

      if (message.type === 'RUNTIME_COMPLETED') {
        const completedWithObserve = shouldCaptureObservations(get().simulationPacing);
        const nextDetailState = message.payload.detailState;
        set({
          phase: message.payload.pauseForChapter
            ? 'chapter_ready'
            : resolveSimulationPhaseOnCompletion(get().simulationPacing),
          status: message.payload.status,
          runtimeSnapshot: message.payload.runtime,
          progress: message.payload.progress,
          currentCareerId: message.payload.careerId,
          latestBashoView: message.payload.latestBashoView ?? get().latestBashoView,
          latestEvents: completedWithObserve && message.payload.observation
            ? toLatestEvents(message.payload.events)
            : [],
          latestDomainEvents: message.payload.domainEvents,
          observationLog: completedWithObserve
            && message.payload.observation
            ? pushObservation(get().observationLog, message.payload.observation)
            : [],
          latestObservation: completedWithObserve ? message.payload.observation ?? null : null,
          latestPauseReason: completedWithObserve ? message.payload.pauseReason : undefined,
          errorMessage: undefined,
          isCurrentCareerSaved: false,
          isTerminalChapterReady: Boolean(message.payload.pauseForChapter),
          detailState: nextDetailState,
          detailBuildProgress: nextDetailState === 'building'
            ? {
              flushedBashoCount: 0,
              totalBashoCount: message.payload.progress.bashoCount,
            }
            : null,
        });
        if (nextDetailState === 'ready') {
          terminateWorker();
          void get().loadUnshelvedCareers();
        }
        return;
      }

      if (message.type === 'DETAIL_BUILD_PROGRESS') {
        set({
          detailState: 'building',
          detailBuildProgress: message.payload.progress,
          errorMessage: undefined,
        });
        return;
      }

      if (message.type === 'DETAIL_BUILD_COMPLETED') {
        set({
          status: message.payload.status,
          detailState: 'ready',
          detailBuildProgress: message.payload.progress,
          errorMessage: undefined,
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
          detailState: 'error',
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
        detailState: 'error',
        errorMessage: event.message || 'Worker error',
      });
      terminateWorker();
    };

    set({
      phase: resolveSimulationPhaseOnStart(initialPacing),
      status: initialStats,
      runtimeSnapshot: null,
      progress: null,
      currentCareerId: careerId,
      isCurrentCareerSaved: false,
      simulationPacing: initialPacing,
      simulationDetailPolicy: nextDetailPolicy,
      detailState: 'idle',
      detailBuildProgress: null,
      latestBashoView: null,
      latestEvents: [],
      latestDomainEvents: [],
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
        detailPolicy: nextDetailPolicy,
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
      runtimeSnapshot: null,
      progress: null,
      currentCareerId: null,
      isCurrentCareerSaved: false,
      simulationPacing: 'skip_to_end',
      simulationDetailPolicy: 'buffered',
      detailState: 'idle',
      detailBuildProgress: null,
      latestBashoView: null,
      latestEvents: [],
      latestDomainEvents: [],
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
    if (!careerId || get().detailState !== 'ready') return;
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
      runtimeSnapshot: null,
      phase: 'completed',
      progress: null,
      currentCareerId: careerId,
      isCurrentCareerSaved: saved,
      simulationPacing: 'skip_to_end',
      simulationDetailPolicy: 'eager',
      detailState: 'ready',
      detailBuildProgress: null,
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
        simulationPacing: 'skip_to_end',
        simulationDetailPolicy: 'buffered',
        detailState: 'idle',
        detailBuildProgress: null,
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

  clearAllData: async () => {
    terminateWorker();
    await clearAllStoredData();
    resetLifetimeCareerCount();
    clearStoredTheme();
    set({
      phase: 'idle',
      status: null,
      progress: null,
      currentCareerId: null,
      isCurrentCareerSaved: false,
      simulationPacing: 'skip_to_end',
      simulationDetailPolicy: 'buffered',
      detailState: 'idle',
      detailBuildProgress: null,
      latestBashoView: null,
      latestEvents: [],
      observationLog: [],
      latestObservation: null,
      isTerminalChapterReady: false,
      latestPauseReason: undefined,
      hallOfFame: [],
      unshelvedCareers: [],
      errorMessage: undefined,
    });
  },

  resetView: async () => {
    if (get().phase === 'running' || get().phase === 'chapter_ready') {
      await get().stopSimulation();
      return;
    }
    const currentCareerId = get().currentCareerId;
    terminateWorker();
    if (currentCareerId && !get().isCurrentCareerSaved) {
      await discardCareer(currentCareerId);
    }
    set({
      phase: 'idle',
      status: null,
      progress: null,
      currentCareerId: null,
      isCurrentCareerSaved: false,
      simulationPacing: 'skip_to_end',
      simulationDetailPolicy: 'buffered',
      detailState: 'idle',
      detailBuildProgress: null,
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
