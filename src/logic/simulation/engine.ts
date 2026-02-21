import { applyGrowth, checkRetirement } from '../growth';
import { BashoRecord, Division, Oyakata, Rank, RikishiStatus, TimelineEvent } from '../models';
import { calculateNextRank, RankCalculationOptions, RankChangeResult } from '../ranking';
import { MakuuchiLayout } from '../ranking/banzukeLayout';
import { BashoSimulationResult, NpcBashoAggregate, PlayerBoutDetail, runBashoDetailed } from './basho';
import {
  buildSameDivisionLowerNpcRecords,
  buildSekitoriNpcRecords,
  mergeNpcBashoRecords,
} from './npcRecords';
import { resolveTopDivisionRank } from './topDivision/rank';
import {
  appendBashoEvents,
  appendEntryEvent,
  finalizeCareer,
  initializeSimulationStatus,
  resolvePastRecords,
  updateCareerStats,
} from './career';
import {
  resolveSimulationDependencies,
  SimulationDependencies,
} from './deps';
import {
  createLowerDivisionQuotaWorld,
  resolveLowerDivisionQuotaForPlayer,
  runLowerDivisionQuotaStep,
} from './lowerQuota';
import type { LowerDivisionQuotaWorld } from './lowerQuota';
import {
  createSekitoriBoundaryWorld,
  resolveSekitoriQuotaForPlayer,
  runSekitoriQuotaStep,
} from './sekitoriQuota';
import {
  advanceTopDivisionBanzuke,
  countActiveNpcInWorld,
  createSimulationWorld,
  resolveTopDivisionFromRank,
  resolveTopDivisionQuotaForPlayer,
  simulateOffscreenTopDivisionBasho,
  SimulationWorld,
  TopDivision,
} from './world';
import { RandomSource } from './deps';
import { intakeNewNpcRecruits } from './npc/intake';
import { runNpcRetirementStep } from './npc/retirement';
import { reconcileNpcLeague } from './npc/leagueReconcile';
import {
  BanzukeDecisionLog,
  BanzukeMode,
  BanzukePopulationSnapshot,
  composeNextBanzuke,
} from '../banzuke';

export interface SimulationParams {
  initialStats: RikishiStatus;
  oyakata: Oyakata | null;
  careerId?: string;
  banzukeMode?: BanzukeMode;
}

export interface BanzukeEntry {
  id: string;
  shikona: string;
  division: TopDivision;
  rankScore: number;
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
}

export interface SimulationProgressSnapshot {
  year: number;
  month: number;
  bashoCount: number;
  currentRank: Rank;
  divisionHeadcount: Record<Division, number>;
  divisionActiveHeadcount: Record<Division, number>;
  lastCommitteeWarnings: number;
  sanshoTotal: number;
  shukunCount: number;
  kantoCount: number;
  ginoCount: number;
  makuuchiSlots: number;
  juryoSlots: number;
  makushitaSlots: number;
  sandanmeSlots: number;
  jonidanSlots: number;
  jonokuchiSlots: number;
  makuuchiActive: number;
  juryoActive: number;
  makushitaActive: number;
  sandanmeActive: number;
  jonidanActive: number;
  jonokuchiActive: number;
  makuuchi: BanzukeEntry[];
  juryo: BanzukeEntry[];
}

export type PauseReason = 'PROMOTION' | 'INJURY' | 'RETIREMENT';

export interface BashoStepResult {
  kind: 'BASHO';
  seq: number;
  year: number;
  month: number;
  playerRecord: BashoRecord;
  playerBouts: PlayerBoutDetail[];
  npcBashoRecords: NpcBashoAggregate[];
  banzukePopulation: BanzukePopulationSnapshot;
  banzukeDecisions: BanzukeDecisionLog[];
  events: TimelineEvent[];
  pauseReason?: PauseReason;
  statusSnapshot: RikishiStatus;
  progress: SimulationProgressSnapshot;
}

export interface CompletedStepResult {
  kind: 'COMPLETED';
  statusSnapshot: RikishiStatus;
  banzukeDecisions: BanzukeDecisionLog[];
  pauseReason?: PauseReason;
  events: TimelineEvent[];
  progress: SimulationProgressSnapshot;
}

export type SimulationStepResult = BashoStepResult | CompletedStepResult;

const MONTHS = [1, 3, 5, 7, 9, 11] as const;

const cloneStatus = (status: RikishiStatus): RikishiStatus =>
  JSON.parse(JSON.stringify(status)) as RikishiStatus;

const toTopDivisionBanzuke = (
  division: TopDivision,
  roster: SimulationWorld['rosters'][TopDivision],
  makuuchiLayout: MakuuchiLayout,
): BanzukeEntry[] => roster
  .slice()
  .sort((a, b) => a.rankScore - b.rankScore)
  .map((rikishi) => {
    const rank = resolveTopDivisionRank(division, rikishi.rankScore, makuuchiLayout);
    return {
      id: rikishi.id,
      shikona: rikishi.shikona,
      division,
      rankScore: rikishi.rankScore,
      rankName: rank.name,
      rankNumber: rank.number,
      rankSide: rank.side,
    };
  });

const hasPrize = (
  prizes: string[],
  code: 'SHUKUN' | 'KANTO' | 'GINO',
): boolean => {
  if (code === 'SHUKUN') return prizes.includes('SHUKUN') || prizes.includes('殊勲賞');
  if (code === 'KANTO') return prizes.includes('KANTO') || prizes.includes('敢闘賞');
  return prizes.includes('GINO') || prizes.includes('技能賞');
};

const summarizeSansho = (records: BashoRecord[]): {
  total: number;
  shukun: number;
  kanto: number;
  gino: number;
} => {
  let shukun = 0;
  let kanto = 0;
  let gino = 0;
  for (const record of records) {
    const prizes = record.specialPrizes ?? [];
    if (hasPrize(prizes, 'SHUKUN')) shukun += 1;
    if (hasPrize(prizes, 'KANTO')) kanto += 1;
    if (hasPrize(prizes, 'GINO')) gino += 1;
  }
  return { total: shukun + kanto + gino, shukun, kanto, gino };
};

const DIVISION_KEYS: Division[] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];

const createEmptyDivisionCounter = (): Record<Division, number> => ({
  Makuuchi: 0,
  Juryo: 0,
  Makushita: 0,
  Sandanme: 0,
  Jonidan: 0,
  Jonokuchi: 0,
  Maezumo: 0,
});

const buildDivisionHeadcount = (
  world: SimulationWorld,
): { headcount: Record<Division, number>; activeHeadcount: Record<Division, number> } => {
  const headcount = createEmptyDivisionCounter();
  const activeHeadcount = createEmptyDivisionCounter();

  for (const npc of world.npcRegistry.values()) {
    const division = DIVISION_KEYS.includes(npc.currentDivision) ? npc.currentDivision : 'Maezumo';
    headcount[division] += 1;
    if (npc.active) activeHeadcount[division] += 1;
  }

  return { headcount, activeHeadcount };
};

const createPopulationSnapshot = (
  world: SimulationWorld,
  seq: number,
  year: number,
  month: number,
): BanzukePopulationSnapshot => {
  const counts = buildDivisionHeadcount(world);
  return {
    seq,
    year,
    month,
    headcount: counts.headcount,
    activeHeadcount: counts.activeHeadcount,
  };
};

const createProgressSnapshot = (
  status: RikishiStatus,
  world: SimulationWorld,
  lowerDivisionQuotaWorld: LowerDivisionQuotaWorld,
  year: number,
  month: number,
  lastCommitteeWarnings: number,
): SimulationProgressSnapshot => {
  const sansho = summarizeSansho(status.history.records);
  const counts = buildDivisionHeadcount(world);
  return {
    year,
    month,
    bashoCount: status.history.records.length,
    currentRank: { ...status.rank },
    divisionHeadcount: counts.headcount,
    divisionActiveHeadcount: counts.activeHeadcount,
    lastCommitteeWarnings,
    sanshoTotal: sansho.total,
    shukunCount: sansho.shukun,
    kantoCount: sansho.kanto,
    ginoCount: sansho.gino,
    makuuchiSlots: world.rosters.Makuuchi.length,
    juryoSlots: world.rosters.Juryo.length,
    makushitaSlots: lowerDivisionQuotaWorld.rosters.Makushita.length,
    sandanmeSlots: lowerDivisionQuotaWorld.rosters.Sandanme.length,
    jonidanSlots: lowerDivisionQuotaWorld.rosters.Jonidan.length,
    jonokuchiSlots: lowerDivisionQuotaWorld.rosters.Jonokuchi.length,
    makuuchiActive: world.rosters.Makuuchi.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    juryoActive: world.rosters.Juryo.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    makushitaActive: lowerDivisionQuotaWorld.rosters.Makushita.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    sandanmeActive: lowerDivisionQuotaWorld.rosters.Sandanme.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    jonidanActive: lowerDivisionQuotaWorld.rosters.Jonidan.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    jonokuchiActive: lowerDivisionQuotaWorld.rosters.Jonokuchi.filter(
      (rikishi) => world.npcRegistry.get(rikishi.id)?.active !== false,
    ).length,
    makuuchi: toTopDivisionBanzuke('Makuuchi', world.rosters.Makuuchi, world.makuuchiLayout),
    juryo: toTopDivisionBanzuke('Juryo', world.rosters.Juryo, world.makuuchiLayout),
  };
};

const resolveBoundaryAssignedRankForCurrentDivision = (
  currentRank: Rank,
  ...candidates: Array<Rank | undefined>
): Rank | undefined => {
  for (const candidate of candidates) {
    if (candidate && candidate.division !== currentRank.division) {
      return candidate;
    }
  }
  return undefined;
};

const resolvePauseReason = (events: TimelineEvent[]): PauseReason | undefined => {
  if (events.some((event) => event.type === 'RETIREMENT')) return 'RETIREMENT';
  if (events.some((event) => event.type === 'INJURY')) return 'INJURY';
  if (events.some((event) => event.type === 'PROMOTION')) return 'PROMOTION';
  return undefined;
};

export interface SimulationEngine {
  runNextBasho: () => Promise<SimulationStepResult>;
  getStatus: () => RikishiStatus;
  isCompleted: () => boolean;
}

export const createSimulationEngine = (
  params: SimulationParams,
  dependencies?: Partial<SimulationDependencies>,
): SimulationEngine => {
  const deps = resolveSimulationDependencies(dependencies);
  const world = createSimulationWorld(deps.random);
  const sekitoriBoundaryWorld = createSekitoriBoundaryWorld(deps.random);
  const lowerDivisionQuotaWorld = createLowerDivisionQuotaWorld(deps.random, world);
  sekitoriBoundaryWorld.npcRegistry = world.npcRegistry;
  sekitoriBoundaryWorld.makushitaPool =
    lowerDivisionQuotaWorld.rosters.Makushita as unknown as typeof sekitoriBoundaryWorld.makushitaPool;

  let status = initializeSimulationStatus(params.initialStats);
  let year = deps.getCurrentYear();
  let monthIndex = 0;
  let seq = 0;
  let completed = false;
  let lastCommitteeWarnings = 0;

  appendEntryEvent(status, year);

  const runNextBasho = async (): Promise<SimulationStepResult> => {
    if (completed) {
      return {
        kind: 'COMPLETED',
        statusSnapshot: cloneStatus(status),
        banzukeDecisions: [],
        events: [],
        progress: createProgressSnapshot(
          status,
          world,
          lowerDivisionQuotaWorld,
          year,
          MONTHS[Math.min(monthIndex, MONTHS.length - 1)],
          lastCommitteeWarnings,
        ),
      };
    }

    const month = MONTHS[monthIndex];
    reconcileNpcLeague(world, lowerDivisionQuotaWorld, sekitoriBoundaryWorld, deps.random, seq, month);

    const retirementCheck = checkRetirement(status);
    if (retirementCheck.shouldRetire) {
      const beforeEvents = status.history.events.length;
      status = finalizeCareer(status, year, month, retirementCheck.reason);
      completed = true;
      const events = status.history.events.slice(beforeEvents);
      return {
        kind: 'COMPLETED',
        statusSnapshot: cloneStatus(status),
        banzukeDecisions: [],
        events,
        pauseReason: 'RETIREMENT',
        progress: createProgressSnapshot(
          status,
          world,
          lowerDivisionQuotaWorld,
          year,
          month,
          lastCommitteeWarnings,
        ),
      };
    }

    if (status.traits.includes('KIBUNYA')) {
      status.currentCondition = deps.random() < 0.5 ? 70 : 30;
    }

    const currentRank = { ...status.rank };
    const playerTopDivision = resolveTopDivisionFromRank(status.rank);

    if (playerTopDivision) {
      const otherDivision = playerTopDivision === 'Makuuchi' ? 'Juryo' : 'Makuuchi';
      simulateOffscreenTopDivisionBasho(world, otherDivision, deps.random);
    } else {
      simulateOffscreenTopDivisionBasho(world, 'Makuuchi', deps.random);
      simulateOffscreenTopDivisionBasho(world, 'Juryo', deps.random);
    }

    const bashoResult: BashoSimulationResult = runBashoDetailed(
      status,
      year,
      month,
      deps.random,
      world,
      lowerDivisionQuotaWorld,
    );
    const bashoRecord = bashoResult.playerRecord;

    advanceTopDivisionBanzuke(world);
    runLowerDivisionQuotaStep(
      lowerDivisionQuotaWorld,
      deps.random,
      ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'].includes(status.rank.division)
        ? {
          rank: status.rank,
          shikona: status.shikona,
          wins: bashoRecord.wins,
          losses: bashoRecord.losses,
          absent: bashoRecord.absent,
        }
        : undefined,
    );
    runSekitoriQuotaStep(
      world,
      sekitoriBoundaryWorld,
      deps.random,
      status.rank.division === 'Makushita'
        ? {
          rank: status.rank,
          shikona: status.shikona,
          wins: bashoRecord.wins,
          losses: bashoRecord.losses,
          absent: bashoRecord.absent,
        }
        : undefined,
      lowerDivisionQuotaWorld,
    );

    status.history.records.push(bashoRecord);
    updateCareerStats(status, bashoRecord);

    const pastRecords = resolvePastRecords(status.history.records);
    const topDivisionQuota = resolveTopDivisionQuotaForPlayer(world, status.rank);
    const sekitoriQuota = resolveSekitoriQuotaForPlayer(sekitoriBoundaryWorld, status.rank);
    const lowerDivisionQuota = resolveLowerDivisionQuotaForPlayer(lowerDivisionQuotaWorld, status.rank);
    const boundaryAssignedNextRank = resolveBoundaryAssignedRankForCurrentDivision(
      status.rank,
      sekitoriQuota?.assignedNextRank,
      lowerDivisionQuota?.assignedNextRank,
    );
    const rankOptions: RankCalculationOptions | undefined =
      topDivisionQuota || sekitoriQuota || lowerDivisionQuota || boundaryAssignedNextRank
        ? {
          ...(topDivisionQuota ? { topDivisionQuota } : {}),
          ...(sekitoriQuota ? { sekitoriQuota } : {}),
          ...(lowerDivisionQuota ? { lowerDivisionQuota } : {}),
          ...(boundaryAssignedNextRank ? { boundaryAssignedNextRank } : {}),
        }
        : undefined;

    const committee = composeNextBanzuke({
      careerId: params.careerId ?? 'runtime',
      seq: seq + 1,
      year: bashoRecord.year,
      month: bashoRecord.month,
      mode: params.banzukeMode ?? 'SIMULATE',
      random: deps.random,
      entries: [
        {
          id: 'PLAYER',
          currentRank,
          wins: bashoRecord.wins,
          losses: bashoRecord.losses,
          absent: bashoRecord.absent,
          historyWindow: pastRecords,
          isOzekiKadoban: status.isOzekiKadoban,
          isOzekiReturn: status.isOzekiReturn,
          options: {
            ...(rankOptions ?? {}),
            isOzekiReturn: status.isOzekiReturn,
          },
          replayNextRank:
            (params.banzukeMode === 'REPLAY'
              ? topDivisionQuota?.assignedNextRank ?? boundaryAssignedNextRank
              : undefined),
        },
      ],
    });
    lastCommitteeWarnings = committee.warnings.length;
    const playerAllocation = committee.allocations.find((allocation) => allocation.id === 'PLAYER');
    const rankChange: RankChangeResult = playerAllocation
      ? {
        ...playerAllocation.proposedChange,
        nextRank: playerAllocation.finalRank,
      }
      : calculateNextRank(
        bashoRecord,
        pastRecords,
        status.isOzekiKadoban,
        deps.random,
        {
          ...(rankOptions ?? {}),
          isOzekiReturn: status.isOzekiReturn,
        },
      );

    const beforeEvents = status.history.events.length;
    appendBashoEvents(status, year, month, bashoRecord, rankChange, currentRank);
    const newEvents = status.history.events.slice(beforeEvents);

    status.rank = rankChange.nextRank;
    status.isOzekiKadoban = rankChange.isKadoban;
    status.isOzekiReturn = rankChange.isOzekiReturn;

    const isNewInjury = status.injuryLevel === 0 && bashoRecord.absent > 0;
    status = applyGrowth(status, params.oyakata, isNewInjury, deps.random);

    seq += 1;

    runNpcRetirementStep(world.npcRegistry.values(), seq, deps.random);

    const activeNpcCount = countActiveNpcInWorld(world);
    const intake = intakeNewNpcRecruits(
      {
        registry: world.npcRegistry,
        maezumoPool: world.maezumoPool,
        nameContext: world.npcNameContext,
        nextNpcSerial: world.nextNpcSerial,
      },
      seq,
      month,
      activeNpcCount,
      deps.random,
    );
    world.nextNpcSerial = intake.nextNpcSerial;
    lowerDivisionQuotaWorld.nextNpcSerial = intake.nextNpcSerial;
    if (lowerDivisionQuotaWorld.maezumoPool !== world.maezumoPool) {
      lowerDivisionQuotaWorld.maezumoPool.push(
        ...intake.recruits.map((npc) => ({
          ...(npc as unknown as typeof lowerDivisionQuotaWorld.maezumoPool[number]),
        })),
      );
    }
    reconcileNpcLeague(world, lowerDivisionQuotaWorld, sekitoriBoundaryWorld, deps.random, seq, month);
    const populationSnapshot = createPopulationSnapshot(world, seq, bashoRecord.year, bashoRecord.month);

    const sekitoriNpc = buildSekitoriNpcRecords(world, world.makuuchiLayout);
    const sameDivisionNpc = buildSameDivisionLowerNpcRecords(lowerDivisionQuotaWorld, currentRank);
    const npcBashoRecords = mergeNpcBashoRecords(
      sekitoriNpc,
      currentRank.division === 'Makuuchi' || currentRank.division === 'Juryo' ? [] : sameDivisionNpc,
    );

    monthIndex += 1;
    if (monthIndex >= MONTHS.length) {
      status.statHistory.push({
        age: status.age,
        stats: { ...status.stats },
      });
      status.age += 1;
      year += 1;
      monthIndex = 0;
    }

    await deps.yieldControl();

    const progress = createProgressSnapshot(
      status,
      world,
      lowerDivisionQuotaWorld,
      year,
      MONTHS[monthIndex],
      lastCommitteeWarnings,
    );
    return {
      kind: 'BASHO',
      seq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      playerRecord: bashoRecord,
      playerBouts: bashoResult.playerBoutDetails,
      npcBashoRecords,
      banzukePopulation: populationSnapshot,
      banzukeDecisions: committee.decisionLogs,
      events: newEvents,
      pauseReason: resolvePauseReason(newEvents),
      statusSnapshot: cloneStatus(status),
      progress,
    };
  };

  return {
    runNextBasho,
    getStatus: () => cloneStatus(status),
    isCompleted: () => completed,
  };
};

export const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};
