import { create } from 'zustand';
import { LOGIC_LAB_DEFAULT_PRESET } from '../presets';
import {
  createLogicLabRun,
  LOGIC_LAB_DEFAULT_MAX_BASHO,
  LOGIC_LAB_DEFAULT_SEED,
  LogicLabRunHandle,
  normalizeLogicLabMaxBasho,
  normalizeLogicLabSeed,
} from '../runner';
import {
  LogicLabBashoLogRow,

  LogicLabPresetId,
  LogicLabRunConfig,
  LogicLabRunPhase,
  LogicLabSummary,
} from '../types';


type StepOutcome = 'continue' | 'paused' | 'completed' | 'stale' | 'error';

interface LogicLabStore {
  phase: LogicLabRunPhase;
  presetId: LogicLabPresetId;
  seedInput: string;
  maxBashoInput: string;
  runConfig: LogicLabRunConfig | null;
  summary: LogicLabSummary | null;
  logs: LogicLabBashoLogRow[];
  selectedLogIndex: number | null;

  autoPlay: boolean;
  runToken: number;
  errorMessage?: string;
  setPresetId: (presetId: LogicLabPresetId) => void;
  setSeedInput: (seedInput: string) => void;
  setMaxBashoInput: (maxBashoInput: string) => void;
  startRun: () => Promise<void>;
  stepOne: () => Promise<void>;
  startAutoPlay: () => Promise<void>;
  pauseAutoPlay: () => void;
  runToEnd: () => Promise<void>;

  selectLogIndex: (index: number | null) => void;
  resetRun: () => void;
}

let activeRun: LogicLabRunHandle | null = null;

const parseRunConfig = (
  store: Pick<LogicLabStore, 'presetId' | 'seedInput' | 'maxBashoInput'>,
): LogicLabRunConfig => ({
  presetId: store.presetId,
  seed: normalizeLogicLabSeed(store.seedInput),
  maxBasho: normalizeLogicLabMaxBasho(store.maxBashoInput),
});

export const useLogicLabStore = create<LogicLabStore>((set, get) => {
  const runSingleStep = async (runToken: number): Promise<StepOutcome> => {
    if (!activeRun) return 'error';

    try {
      const step = await activeRun.step();
      if (get().runToken !== runToken) {
        return 'stale';
      }

      if (step.kind === 'BASHO') {
        set((state) => ({
          phase: step.phase,
          summary: step.summary,
          logs: [...state.logs, step.logRow],
          selectedLogIndex: state.logs.length,
          autoPlay: step.phase === 'running' ? state.autoPlay : false,
          errorMessage: undefined,
        }));
        if (step.phase === 'completed') return 'completed';
        if (step.phase === 'paused') return 'paused';
        return 'continue';
      }

      set({
        phase: 'completed',
        summary: step.summary,
        autoPlay: false,
        errorMessage: undefined,
      });
      return 'completed';
    } catch (error) {
      if (get().runToken !== runToken) return 'stale';
      set({
        phase: 'error',
        autoPlay: false,
        errorMessage: error instanceof Error ? error.message : 'Unknown logic-lab error',
      });
      return 'error';
    }
  };

  return {
    phase: 'idle',
    presetId: LOGIC_LAB_DEFAULT_PRESET,
    seedInput: String(LOGIC_LAB_DEFAULT_SEED),
    maxBashoInput: String(LOGIC_LAB_DEFAULT_MAX_BASHO),
    runConfig: null,
    summary: null,
    logs: [],
    selectedLogIndex: null,
    autoPlay: false,

    runToken: 0,
    errorMessage: undefined,

    setPresetId: (presetId) => set({ presetId }),
    setSeedInput: (seedInput) => set({ seedInput }),
    setMaxBashoInput: (maxBashoInput) => set({ maxBashoInput }),

    startRun: async () => {
      const nextToken = get().runToken + 1;
      set({ runToken: nextToken, autoPlay: false, errorMessage: undefined });

      try {
        const config = parseRunConfig(get());
        activeRun = createLogicLabRun(config);
        set({
          phase: 'ready',
          runConfig: activeRun.config,
          summary: activeRun.getSummary(),
          logs: [],
          selectedLogIndex: null,
          seedInput: String(activeRun.config.seed),
          maxBashoInput: String(activeRun.config.maxBasho),
          errorMessage: undefined,
        });
      } catch (error) {
        activeRun = null;
        set({
          phase: 'error',
          runConfig: null,
          summary: null,
          logs: [],
          selectedLogIndex: null,
          autoPlay: false,
          errorMessage: error instanceof Error ? error.message : 'Failed to start logic-lab run',
        });
      }
    },

    stepOne: async () => {
      if (!activeRun) {
        await get().startRun();
        if (!activeRun) return;
      }
      const nextToken = get().runToken + 1;
      set({ runToken: nextToken, autoPlay: false, phase: 'running', errorMessage: undefined });
      await runSingleStep(nextToken);
    },

    startAutoPlay: async () => {
      if (!activeRun) {
        await get().startRun();
        if (!activeRun) return;
      }

      const nextToken = get().runToken + 1;
      set({ runToken: nextToken, autoPlay: true, phase: 'running', errorMessage: undefined });

      while (true) {
        const state = get();
        if (state.runToken !== nextToken || !state.autoPlay) break;

        const outcome = await runSingleStep(nextToken);
        if (outcome !== 'continue') {
          if (get().runToken === nextToken) {
            set({ autoPlay: false });
          }
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },

    pauseAutoPlay: () => {
      const nextToken = get().runToken + 1;
      set((state) => ({
        runToken: nextToken,
        autoPlay: false,
        phase: state.phase === 'running' ? 'paused' : state.phase,
      }));
    },

    runToEnd: async () => {
      if (!activeRun) {
        await get().startRun();
        if (!activeRun) return;
      }

      const nextToken = get().runToken + 1;
      set({ runToken: nextToken, autoPlay: false, phase: 'running', errorMessage: undefined });

      while (true) {
        if (get().runToken !== nextToken) break;
        const outcome = await runSingleStep(nextToken);
        if (outcome === 'completed' || outcome === 'stale' || outcome === 'error') {
          break;
        }
      }
    },



    selectLogIndex: (index) => set({ selectedLogIndex: index }),

    resetRun: () => {
      const nextToken = get().runToken + 1;
      activeRun = null;
      set((state) => ({
        runToken: nextToken,
        phase: 'idle',
        runConfig: null,
        summary: null,
        logs: [],
        selectedLogIndex: null,
        comparison: null,
        comparisonBusy: false,
        autoPlay: false,
        errorMessage: undefined,
        presetId: state.presetId,
        seedInput: state.seedInput,
        maxBashoInput: state.maxBashoInput,
      }));
    },
  };
});
