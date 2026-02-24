import { RikishiStatus } from '../../logic/models';
import {
  BashoStepResult,
  createSeededRandom,
  createSimulationEngine,
} from '../../logic/simulation/engine';
import { NpcBashoAggregate } from '../../logic/simulation/basho';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from '../../logic/simulation/modelVersion';
import { createLogicLabInitialStatus, LOGIC_LAB_DEFAULT_PRESET } from './presets';
import {
  LogicLabBashoLogRow,
  LogicLabInjurySummary,
  LogicLabNpcContext,
  LogicLabNpcContextRow,
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

const toLogRow = (step: BashoStepResult): LogicLabBashoLogRow => {
  const playerDecision = step.banzukeDecisions.find(
    (decision) => decision.rikishiId === 'PLAYER',
  );
  const toEntrySlot = (
    entry: { division: string; rankName: string; rankNumber?: number; rankSide?: 'East' | 'West' },
  ): number => {
    const sideOffset = entry.rankSide === 'West' ? 1 : 0;
    if (entry.division === 'Makuuchi') {
      if (entry.rankName === '横綱') return sideOffset + 1;
      if (entry.rankName === '大関') return sideOffset + 3;
      if (entry.rankName === '関脇') return sideOffset + 5;
      if (entry.rankName === '小結') return sideOffset + 7;
      const n = Math.max(1, Math.min(17, entry.rankNumber ?? 1));
      return 8 + (n - 1) * 2 + sideOffset;
    }
    const maxByDivision: Record<string, number> = {
      Juryo: 14,
      Makushita: 60,
      Sandanme: 90,
      Jonidan: 100,
      Jonokuchi: 32,
    };
    const max = maxByDivision[entry.division] ?? 200;
    const n = Math.max(1, Math.min(max, entry.rankNumber ?? 1));
    return 1 + (n - 1) * 2 + sideOffset;
  };
  const toSlot = (record: NpcBashoAggregate): number => {
    return toEntrySlot({
      division: record.division,
      rankName: record.rankName,
      rankNumber: record.rankNumber,
      rankSide: record.rankSide,
    });
  };

  const formatRankLabel = (rankName: string, rankNumber?: number, rankSide?: 'East' | 'West'): string => {
    const side = rankSide === 'West' ? '西' : '東';
    if (['横綱', '大関', '関脇', '小結'].includes(rankName)) {
      return `${side}${rankName}`;
    }
    return `${side}${rankName}${rankNumber ?? 1}`;
  };
  const formatRank = (rank: { name: string; number?: number; side?: 'East' | 'West' }): string =>
    formatRankLabel(rank.name, rank.number, rank.side);

  const buildNpcContext = (): LogicLabNpcContext | undefined => {
    const lowerTrace = step.lowerDivisionPlacementTrace ?? [];
    const playerTrace = lowerTrace.find((row) => row.id === 'PLAYER');
    if (playerTrace) {
      const playerScoreDiff = playerTrace.scoreDiff;
      const playerBeforeSlot = playerTrace.beforeGlobalSlot;
      const playerAfterSlot = playerTrace.afterGlobalSlot;
      const others = lowerTrace.filter((row) => row.id !== 'PLAYER');
      const outperformedByLowerCount = others.filter((row) =>
        row.beforeGlobalSlot > playerBeforeSlot && row.scoreDiff > playerScoreDiff).length;
      const underperformedByUpperCount = others.filter((row) =>
        row.beforeGlobalSlot < playerBeforeSlot && row.scoreDiff < playerScoreDiff).length;

      const rows: LogicLabNpcContextRow[] = others
        .filter((row) =>
          Math.abs(row.beforeGlobalSlot - playerBeforeSlot) <= 14 ||
          Math.abs(row.afterGlobalSlot - playerAfterSlot) <= 14 ||
          (row.beforeGlobalSlot > playerBeforeSlot && row.scoreDiff >= playerScoreDiff + 2) ||
          (row.beforeGlobalSlot < playerBeforeSlot && row.scoreDiff <= playerScoreDiff - 2))
        .sort((a, b) => a.beforeGlobalSlot - b.beforeGlobalSlot)
        .slice(0, 24)
        .map((row) => ({
          shikona: row.shikona,
          beforeRankLabel: formatRank(row.beforeRank),
          afterRankLabel: formatRank(row.afterRank),
          wins: row.wins,
          losses: row.losses,
          absent: row.absent,
          scoreDiff: row.scoreDiff,
          slotDistanceBefore: row.beforeGlobalSlot - playerBeforeSlot,
          slotDistanceAfter: row.afterGlobalSlot - playerAfterSlot,
          globalMove: row.beforeGlobalSlot - row.afterGlobalSlot,
        }));

      return {
        division: playerTrace.beforeRank.division,
        playerBeforeRankLabel: formatRank(playerTrace.beforeRank),
        playerAfterRankLabel: formatRank(playerTrace.afterRank),
        playerGlobalMove: playerBeforeSlot - playerAfterSlot,
        playerScoreDiff,
        outperformedByLowerCount,
        underperformedByUpperCount,
        rows,
      };
    }

    const division = step.playerRecord.rank.division;
    const sameDivision = step.npcBashoRecords
      .filter((record) => record.division === division);
    if (!sameDivision.length) return undefined;

    const afterEntries = [
      ...step.progress.makuuchi,
      ...step.progress.juryo,
    ];
    const afterById = new Map(afterEntries.map((entry) => [entry.id, entry]));

    const playerRank = step.playerRecord.rank;
    const playerSlot = (() => {
      return toEntrySlot({
        division,
        rankName: playerRank.name,
        rankNumber: playerRank.number,
        rankSide: playerRank.side,
      });
    })();
    const playerAfterSlot =
      step.statusSnapshot.rank.division === division
        ? toEntrySlot({
          division,
          rankName: step.statusSnapshot.rank.name,
          rankNumber: step.statusSnapshot.rank.number,
          rankSide: step.statusSnapshot.rank.side,
        })
        : playerSlot;

    const playerScoreDiff = step.playerRecord.wins - (step.playerRecord.losses + step.playerRecord.absent);
    const withMeta = sameDivision.map((record) => {
      const slot = toSlot(record);
      const scoreDiff = record.wins - (record.losses + record.absent);
      const after = afterById.get(record.entityId);
      const afterRankName = after?.rankName ?? record.rankName;
      const afterRankNumber = after?.rankNumber ?? record.rankNumber;
      const afterRankSide = after?.rankSide ?? record.rankSide;
      const afterSlot = toEntrySlot({
        division: after?.division ?? record.division,
        rankName: afterRankName,
        rankNumber: afterRankNumber,
        rankSide: afterRankSide,
      });
      return {
        record,
        slot,
        afterSlot,
        scoreDiff,
        afterRankName,
        afterRankNumber,
        afterRankSide,
      };
    });

    const outperformedByLowerCount = withMeta.filter((item) =>
      item.slot > playerSlot && item.scoreDiff > playerScoreDiff).length;
    const underperformedByUpperCount = withMeta.filter((item) =>
      item.slot < playerSlot && item.scoreDiff < playerScoreDiff).length;

    const nearbyRows: LogicLabNpcContextRow[] = withMeta
      .filter((item) => Math.abs(item.slot - playerSlot) <= 12 || item.scoreDiff >= playerScoreDiff + 2)
      .sort((a, b) => a.slot - b.slot)
      .slice(0, 18)
      .map((item) => ({
        shikona: item.record.shikona,
        beforeRankLabel: formatRankLabel(item.record.rankName, item.record.rankNumber, item.record.rankSide),
        afterRankLabel: formatRankLabel(item.afterRankName, item.afterRankNumber, item.afterRankSide),
        wins: item.record.wins,
        losses: item.record.losses,
        absent: item.record.absent,
        scoreDiff: item.scoreDiff,
        slotDistanceBefore: item.slot - playerSlot,
        slotDistanceAfter: item.afterSlot - playerAfterSlot,
        globalMove: item.slot - item.afterSlot,
      }));

    const playerRankLabel = formatRankLabel(
      playerRank.name,
      playerRank.number,
      playerRank.side,
    );

    return {
      division,
      playerBeforeRankLabel: playerRankLabel,
      playerAfterRankLabel: formatRank(step.statusSnapshot.rank),
      playerGlobalMove: playerSlot - playerAfterSlot,
      playerScoreDiff,
      outperformedByLowerCount,
      underperformedByUpperCount,
      rows: nearbyRows,
    };
  };

  return {
  seq: step.seq,
  year: step.year,
  month: step.month,
  rankBefore: { ...step.playerRecord.rank },
  rankAfter: { ...step.statusSnapshot.rank },
  banzukeReasons: (playerDecision?.reasons ?? []).slice(0, 3),
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
  npcContext: buildNpcContext(),
  };
};

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
