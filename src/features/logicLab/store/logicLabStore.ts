import { create } from 'zustand';
import { SimulationModelVersion } from '../../../logic/simulation/modelVersion';
import { LOGIC_LAB_DEFAULT_PRESET } from '../presets';
import {
  createLogicLabRun,
  LOGIC_LAB_DEFAULT_MAX_BASHO,
  LOGIC_LAB_DEFAULT_SEED,
  LogicLabRunHandle,
  normalizeLogicLabMaxBasho,
  normalizeLogicLabSeed,
  runLogicLabToEnd,
} from '../runner';
import {
  LogicLabBashoLogRow,
  LogicLabComparisonResult,
  LogicLabPresetId,
  LogicLabRunConfig,
  LogicLabRunPhase,
  LogicLabSummary,
} from '../types';

type StepOutcome = 'continue' | 'paused' | 'completed' | 'stale' | 'error';

interface LogicLabStore {
  phase: LogicLabRunPhase;
  presetId: LogicLabPresetId;
  simulationModelVersion: SimulationModelVersion;
  seedInput: string;
  maxBashoInput: string;
  runConfig: LogicLabRunConfig | null;
  summary: LogicLabSummary | null;
  logs: LogicLabBashoLogRow[];
  selectedLogIndex: number | null;
  comparison: LogicLabComparisonResult | null;
  comparisonBusy: boolean;
  autoPlay: boolean;
  runToken: number;
  errorMessage?: string;
  setPresetId: (presetId: LogicLabPresetId) => void;
  setSimulationModelVersion: (simulationModelVersion: SimulationModelVersion) => void;
  setSeedInput: (seedInput: string) => void;
  setMaxBashoInput: (maxBashoInput: string) => void;
  startRun: () => Promise<void>;
  stepOne: () => Promise<void>;
  startAutoPlay: () => Promise<void>;
  pauseAutoPlay: () => void;
  runToEnd: () => Promise<void>;
  runComparison: () => Promise<void>;
  selectLogIndex: (index: number | null) => void;
  resetRun: () => void;
}

let activeRun: LogicLabRunHandle | null = null;

const parseRunConfig = (
  store: Pick<LogicLabStore, 'presetId' | 'simulationModelVersion' | 'seedInput' | 'maxBashoInput'>,
): LogicLabRunConfig => ({
  presetId: store.presetId,
  simulationModelVersion: store.simulationModelVersion,
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
    simulationModelVersion: 'legacy-v6',
    seedInput: String(LOGIC_LAB_DEFAULT_SEED),
    maxBashoInput: String(LOGIC_LAB_DEFAULT_MAX_BASHO),
    runConfig: null,
    summary: null,
    logs: [],
    selectedLogIndex: null,
    comparison: null,
    comparisonBusy: false,
    autoPlay: false,
    runToken: 0,
    errorMessage: undefined,

    setPresetId: (presetId) => set({ presetId }),
    setSimulationModelVersion: (simulationModelVersion) => set({ simulationModelVersion }),
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
          comparison: null,
          comparisonBusy: false,
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
          comparison: null,
          comparisonBusy: false,
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

    runComparison: async () => {
      const config = parseRunConfig(get());
      const nextToken = get().runToken + 1;
      set({
        runToken: nextToken,
        autoPlay: false,
        comparison: null,
        comparisonBusy: true,
        errorMessage: undefined,
      });

      try {
        const [legacy, realism] = await Promise.all([
          runLogicLabToEnd({
            presetId: config.presetId,
            seed: config.seed,
            maxBasho: config.maxBasho,
            simulationModelVersion: 'legacy-v6',
          }),
          runLogicLabToEnd({
            presetId: config.presetId,
            seed: config.seed,
            maxBasho: config.maxBasho,
            simulationModelVersion: 'realism-v1',
          }),
        ]);

        if (get().runToken !== nextToken) return;
        set({
          comparison: {
            config: {
              presetId: config.presetId,
              seed: config.seed,
              maxBasho: config.maxBasho,
            },
            legacy: legacy.summary,
            realism: realism.summary,
          },
          comparisonBusy: false,
          errorMessage: undefined,
        });
      } catch (error) {
        if (get().runToken !== nextToken) return;
        set({
          comparisonBusy: false,
          errorMessage: error instanceof Error ? error.message : 'Failed to compare logic-lab models',
        });
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
        simulationModelVersion: state.simulationModelVersion,
        seedInput: state.seedInput,
        maxBashoInput: state.maxBashoInput,
      }));
    },
  };
});
