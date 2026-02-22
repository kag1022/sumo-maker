import { RikishiStatus } from '../../logic/models';
import {
  BashoStepResult,
  createSeededRandom,
  createSimulationEngine,
} from '../../logic/simulation/engine';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from '../../logic/simulation/modelVersion';
import { createLogicLabInitialStatus, LOGIC_LAB_DEFAULT_PRESET } from './presets';
import {
  LogicLabBashoLogRow,
  LogicLabInjurySummary,
  LogicLabRunConfig,
  LogicLabRunPhase,
  LogicLabStopReason,
  LogicLabSummary,
} from './types';

export const LOGIC_LAB_DEFAULT_SEED = 7331;
export const LOGIC_LAB_DEFAULT_MAX_BASHO = 240;
export const LOGIC_LAB_MAX_BASHO_LIMIT = 300;
const LOGIC_LAB_FIXED_START_YEAR = 2026;

const hasPrize = (
  prizes: string[],
  code: 'SHUKUN' | 'KANTO' | 'GINO',
): boolean => {
  if (code === 'SHUKUN') return prizes.includes('SHUKUN') || prizes.includes('殊勲賞');
  if (code === 'KANTO') return prizes.includes('KANTO') || prizes.includes('敢闘賞');
  return prizes.includes('GINO') || prizes.includes('技能賞');
};

const summarizeSansho = (status: RikishiStatus): {
  total: number;
  shukun: number;
  kanto: number;
  gino: number;
} => {
  let shukun = 0;
  let kanto = 0;
  let gino = 0;
  for (const record of status.history.records) {
    const prizes = record.specialPrizes ?? [];
    if (hasPrize(prizes, 'SHUKUN')) shukun += 1;
    if (hasPrize(prizes, 'KANTO')) kanto += 1;
    if (hasPrize(prizes, 'GINO')) gino += 1;
  }
  return {
    total: shukun + kanto + gino,
    shukun,
    kanto,
    gino,
  };
};

const buildInjurySummary = (status: RikishiStatus): LogicLabInjurySummary => {
  const activeInjuries = (status.injuries ?? [])
    .filter((injury) => injury.status !== 'HEALED')
    .map((injury) => ({
      name: injury.name,
      severity: injury.severity,
      status: injury.status,
    }));
  return {
    injuryLevel: status.injuryLevel,
    activeCount: activeInjuries.length,
    activeInjuries,
  };
};

const buildSummary = (
  status: RikishiStatus,
  simulationModelVersion: SimulationModelVersion,
  committeeWarnings: number,
  stopReason?: LogicLabStopReason,
): LogicLabSummary => {
  const sansho = summarizeSansho(status);
  return {
    bashoCount: status.history.records.length,
    simulationModelVersion,
    currentRank: { ...status.rank },
    maxRank: { ...status.history.maxRank },
    age: status.age,
    totalWins: status.history.totalWins,
    totalLosses: status.history.totalLosses,
    totalAbsent: status.history.totalAbsent,
    sanshoTotal: sansho.total,
    shukunCount: sansho.shukun,
    kantoCount: sansho.kanto,
    ginoCount: sansho.gino,
    injurySummary: buildInjurySummary(status),
    committeeWarnings,
    ...(stopReason ? { stopReason } : {}),
  };
};

const toLogRow = (step: BashoStepResult): LogicLabBashoLogRow => ({
  seq: step.seq,
  year: step.year,
  month: step.month,
  rankBefore: { ...step.playerRecord.rank },
  rankAfter: { ...step.statusSnapshot.rank },
  record: {
    wins: step.playerRecord.wins,
    losses: step.playerRecord.losses,
    absent: step.playerRecord.absent,
    yusho: step.playerRecord.yusho,
  },
  events: step.events.map((event) => event.description),
  injurySummary: buildInjurySummary(step.statusSnapshot),
  ...(step.pauseReason ? { pauseReason: step.pauseReason } : {}),
  committeeWarnings: step.progress.lastCommitteeWarnings,
});

export const normalizeLogicLabSeed = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return LOGIC_LAB_DEFAULT_SEED;
  return (Math.trunc(parsed) >>> 0);
};

export const normalizeLogicLabMaxBasho = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return LOGIC_LAB_DEFAULT_MAX_BASHO;
  const floored = Math.floor(parsed);
  return Math.max(1, Math.min(LOGIC_LAB_MAX_BASHO_LIMIT, floored));
};

export interface LogicLabRunStepBasho {
  kind: 'BASHO';
  phase: LogicLabRunPhase;
  logRow: LogicLabBashoLogRow;
  summary: LogicLabSummary;
}

export interface LogicLabRunStepCompleted {
  kind: 'COMPLETED';
  phase: LogicLabRunPhase;
  summary: LogicLabSummary;
}

export type LogicLabRunStep = LogicLabRunStepBasho | LogicLabRunStepCompleted;

export interface LogicLabRunHandle {
  config: LogicLabRunConfig;
  initialStatus: RikishiStatus;
  getSummary: () => LogicLabSummary;
  step: () => Promise<LogicLabRunStep>;
}

export const createLogicLabRun = (
  partialConfig: Partial<LogicLabRunConfig> = {},
): LogicLabRunHandle => {
  const config: LogicLabRunConfig = {
    presetId: partialConfig.presetId ?? LOGIC_LAB_DEFAULT_PRESET,
    seed: normalizeLogicLabSeed(partialConfig.seed),
    maxBasho: normalizeLogicLabMaxBasho(partialConfig.maxBasho),
    simulationModelVersion:
      partialConfig.simulationModelVersion ?? DEFAULT_SIMULATION_MODEL_VERSION,
  };

  const initialRng = createSeededRandom(config.seed ^ 0x9e3779b9);
  const simRng = createSeededRandom(config.seed ^ 0x85ebca6b);
  const initialStatus = createLogicLabInitialStatus(config.presetId, initialRng);
  const engine = createSimulationEngine(
    {
      initialStats: initialStatus,
      oyakata: null,
      careerId: `logic-lab-${config.presetId}-${config.seed}-${config.simulationModelVersion}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: config.simulationModelVersion,
    },
    {
      random: simRng,
      getCurrentYear: () => LOGIC_LAB_FIXED_START_YEAR,
      yieldControl: async () => {},
    },
  );

  let completed = false;
  let currentStatus = JSON.parse(JSON.stringify(initialStatus)) as RikishiStatus;
  let currentWarnings = 0;
  let stopReason: LogicLabStopReason | undefined;

  const getSummary = (): LogicLabSummary =>
    buildSummary(currentStatus, config.simulationModelVersion, currentWarnings, stopReason);

  const step = async (): Promise<LogicLabRunStep> => {
    if (completed || currentStatus.history.records.length >= config.maxBasho) {
      if (!completed && currentStatus.history.records.length >= config.maxBasho) {
        stopReason = 'MAX_BASHO_REACHED';
      }
      completed = true;
      return {
        kind: 'COMPLETED',
        phase: 'completed',
        summary: getSummary(),
      };
    }

    const result = await engine.runNextBasho();
    if (result.kind === 'BASHO') {
      currentStatus = result.statusSnapshot;
      currentWarnings = result.progress.lastCommitteeWarnings;
      const reachedLimit = currentStatus.history.records.length >= config.maxBasho;
      if (reachedLimit) {
        completed = true;
        stopReason = 'MAX_BASHO_REACHED';
      }
      return {
        kind: 'BASHO',
        phase: reachedLimit ? 'completed' : result.pauseReason ? 'paused' : 'running',
        logRow: toLogRow(result),
        summary: getSummary(),
      };
    }

    currentStatus = result.statusSnapshot;
    currentWarnings = result.progress.lastCommitteeWarnings;
    stopReason = result.pauseReason;
    completed = true;
    return {
      kind: 'COMPLETED',
      phase: 'completed',
      summary: getSummary(),
    };
  };

  return {
    config,
    initialStatus: JSON.parse(JSON.stringify(initialStatus)) as RikishiStatus,
    getSummary,
    step,
  };
};

export const runLogicLabToEnd = async (
  config: Partial<LogicLabRunConfig> = {},
): Promise<{ summary: LogicLabSummary; logs: LogicLabBashoLogRow[] }> => {
  const run = createLogicLabRun(config);
  const logs: LogicLabBashoLogRow[] = [];

  while (true) {
    const step = await run.step();
    if (step.kind === 'BASHO') {
      logs.push(step.logRow);
      continue;
    }
    return {
      summary: step.summary,
      logs,
    };
  }
};
