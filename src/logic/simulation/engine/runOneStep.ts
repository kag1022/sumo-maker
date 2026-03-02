import {
  BanzukeEngineVersion,
  RankCalculationOptions,
  RankChangeResult,
  composeNextBanzuke,
} from '../../banzuke';
import { applyGrowth, checkRetirement } from '../../growth';
import { Rank, RikishiStatus } from '../../models';
import {
  BashoSimulationResult,
  runBashoDetailed,
} from '../basho';
import {
  appendBashoEvents,
  finalizeCareer,
  resolvePastRecords,
  updateCareerStats,
} from '../career';
import { SimulationDependencies } from '../deps';
import { resolveLowerDivisionQuotaForPlayer, runLowerDivisionQuotaStep } from '../lowerQuota';
import { LowerDivisionQuotaWorld } from '../lowerQuota';
import { PlayerLowerRecord } from '../lower/types';
import { SimulationModelVersion } from '../modelVersion';
import { intakeNewNpcRecruits } from '../npc/intake';
import { reconcileNpcLeague } from '../npc/leagueReconcile';
import { runNpcRetirementStep } from '../npc/retirement';
import {
  buildSameDivisionLowerNpcRecords,
  buildSekitoriNpcRecords,
  mergeNpcBashoRecords,
} from '../npcRecords';
import {
  resolveSekitoriQuotaForPlayer,
  runSekitoriQuotaStep,
  SekitoriBoundaryWorld,
} from '../sekitoriQuota';
import { updateAbilityAfterBasho } from '../strength/update';
import {
  advanceTopDivisionBanzuke,
  countActiveNpcInWorld,
  resolveTopDivisionFromRank,
  resolveTopDivisionQuotaForPlayer,
  simulateOffscreenSekitoriBasho,
  syncPlayerActorInWorld,
  SimulationWorld,
} from '../world';
import { SimulationDiagnostics } from '../diagnostics';
import { createPopulationSnapshot, createProgressSnapshot } from './progressSnapshot';
import { resolvePauseReason } from './pausePolicy';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { SimulationParams, SimulationStepResult } from './types';

const MONTHS = [1, 3, 5, 7, 9, 11] as const;

export interface EngineRuntimeState {
  status: RikishiStatus;
  year: number;
  monthIndex: number;
  seq: number;
  completed: boolean;
  lastCommitteeWarnings: number;
  lastDiagnostics?: SimulationDiagnostics;
}

export interface RunOneStepContext {
  params: SimulationParams;
  deps: SimulationDependencies;
  simulationModelVersion: SimulationModelVersion;
  banzukeEngineVersion: BanzukeEngineVersion;
  world: SimulationWorld;
  sekitoriBoundaryWorld: SekitoriBoundaryWorld;
  lowerDivisionQuotaWorld: LowerDivisionQuotaWorld;
  state: EngineRuntimeState;
}

export const cloneStatus = (status: RikishiStatus): RikishiStatus =>
  JSON.parse(JSON.stringify(status)) as RikishiStatus;

export const resolveBoundaryAssignedRankForCurrentDivision = (
  currentRank: Rank,
  sekitoriAssigned?: Rank,
  lowerAssigned?: Rank,
): Rank | undefined => {
  if (currentRank.division === 'Makushita') {
    // 幕下在位時は、十両昇進の境界割当を最優先する。
    if (sekitoriAssigned?.division === 'Juryo') {
      return sekitoriAssigned;
    }
    return lowerAssigned ?? sekitoriAssigned;
  }
  if (
    currentRank.division === 'Sandanme' ||
    currentRank.division === 'Jonidan' ||
    currentRank.division === 'Jonokuchi'
  ) {
    return lowerAssigned;
  }
  if (currentRank.division === 'Juryo') {
    return sekitoriAssigned ?? lowerAssigned;
  }
  return sekitoriAssigned ?? lowerAssigned;
};

const resolveCurrentScaleSlots = (
  world: SimulationWorld,
  lowerDivisionQuotaWorld: LowerDivisionQuotaWorld,
): RankCalculationOptions['scaleSlots'] => ({
  Makuuchi: world.rosters.Makuuchi.length,
  Juryo: world.rosters.Juryo.length,
  Makushita: lowerDivisionQuotaWorld.rosters.Makushita.length,
  Sandanme: lowerDivisionQuotaWorld.rosters.Sandanme.length,
  Jonidan: lowerDivisionQuotaWorld.rosters.Jonidan.length,
  Jonokuchi: lowerDivisionQuotaWorld.rosters.Jonokuchi.length,
});

export const runOneStep = async (context: RunOneStepContext): Promise<SimulationStepResult> => {
  const {
    params,
    deps,
    simulationModelVersion,
    banzukeEngineVersion,
    world,
    sekitoriBoundaryWorld,
    lowerDivisionQuotaWorld,
    state,
  } = context;

  if (state.completed) {
    return {
      kind: 'COMPLETED',
      statusSnapshot: cloneStatus(state.status),
      banzukeDecisions: [],
      diagnostics: state.lastDiagnostics,
      events: [],
      progress: createProgressSnapshot(
        state.status,
        world,
        lowerDivisionQuotaWorld,
        state.year,
        MONTHS[Math.min(state.monthIndex, MONTHS.length - 1)],
        state.lastCommitteeWarnings,
        state.lastDiagnostics,
      ),
    };
  }

  const month = MONTHS[state.monthIndex];
  reconcileNpcLeague(world, lowerDivisionQuotaWorld, sekitoriBoundaryWorld, deps.random, state.seq, month);

  const retirementCheck = checkRetirement(state.status);
  if (retirementCheck.shouldRetire) {
    const beforeEvents = state.status.history.events.length;
    state.status = finalizeCareer(state.status, state.year, month, retirementCheck.reason);
    state.completed = true;
    const events = state.status.history.events.slice(beforeEvents);
    return {
      kind: 'COMPLETED',
      statusSnapshot: cloneStatus(state.status),
      banzukeDecisions: [],
      diagnostics: state.lastDiagnostics,
      events,
      pauseReason: 'RETIREMENT',
      progress: createProgressSnapshot(
        state.status,
        world,
        lowerDivisionQuotaWorld,
        state.year,
        month,
        state.lastCommitteeWarnings,
        state.lastDiagnostics,
      ),
    };
  }

  if (state.status.traits.includes('KIBUNYA')) {
    state.status.currentCondition = deps.random() < 0.5 ? 70 : 30;
  }

  syncPlayerActorInWorld(world, state.status, deps.random);

  const currentRank = { ...state.status.rank };
  const playerTopDivision = resolveTopDivisionFromRank(state.status.rank);

  if (!playerTopDivision) {
    simulateOffscreenSekitoriBasho(world, deps.random, simulationModelVersion);
  }

  const bashoResult: BashoSimulationResult = runBashoDetailed(
    state.status,
    state.year,
    month,
    deps.random,
    world,
    lowerDivisionQuotaWorld,
    simulationModelVersion,
  );
  const bashoRecord = bashoResult.playerRecord;
  const lowerPlayerRecord: PlayerLowerRecord | undefined =
    currentRank.division === 'Makushita' ||
      currentRank.division === 'Sandanme' ||
      currentRank.division === 'Jonidan' ||
      currentRank.division === 'Jonokuchi'
      ? {
        rank: currentRank,
        shikona: state.status.shikona,
        stableId: state.status.stableId,
        wins: bashoRecord.wins,
        losses: bashoRecord.losses,
        absent: bashoRecord.absent,
      }
      : undefined;

  advanceTopDivisionBanzuke(world);
  runLowerDivisionQuotaStep(
    lowerDivisionQuotaWorld,
    deps.random,
    lowerPlayerRecord,
    bashoResult.lowerLeagueSnapshots,
    simulationModelVersion,
    banzukeEngineVersion,
  );
  runSekitoriQuotaStep(
    world,
    sekitoriBoundaryWorld,
    deps.random,
    undefined,
    lowerDivisionQuotaWorld,
    simulationModelVersion,
    banzukeEngineVersion,
  );

  state.status.history.records.push(bashoRecord);
  updateCareerStats(state.status, bashoRecord);

  const pastRecords = resolvePastRecords(state.status.history.records);
  const topDivisionQuota = resolveTopDivisionQuotaForPlayer(world, state.status.rank);
  const sekitoriQuota = resolveSekitoriQuotaForPlayer(sekitoriBoundaryWorld, state.status.rank);
  const lowerDivisionQuota = resolveLowerDivisionQuotaForPlayer(lowerDivisionQuotaWorld, state.status.rank);
  const scaleSlots = resolveCurrentScaleSlots(world, lowerDivisionQuotaWorld);
  bashoRecord.scaleSlots = scaleSlots;
  const boundaryAssignedNextRank = resolveBoundaryAssignedRankForCurrentDivision(
    state.status.rank,
    sekitoriQuota?.assignedNextRank,
    lowerDivisionQuota?.assignedNextRank,
  );
  const rankOptions: RankCalculationOptions = {
    ...(topDivisionQuota ? { topDivisionQuota } : {}),
    ...(sekitoriQuota ? { sekitoriQuota } : {}),
    ...(lowerDivisionQuota ? { lowerDivisionQuota } : {}),
    ...(boundaryAssignedNextRank ? { boundaryAssignedNextRank } : {}),
    scaleSlots,
    simulationModelVersion,
    banzukeEngineVersion,
  };

  const committee = composeNextBanzuke({
    careerId: params.careerId ?? 'runtime',
    seq: state.seq + 1,
    year: bashoRecord.year,
    month: bashoRecord.month,
    mode: params.banzukeMode ?? 'SIMULATE',
    random: deps.random,
    entries: [
      {
        id: PLAYER_ACTOR_ID,
        currentRank,
        wins: bashoRecord.wins,
        losses: bashoRecord.losses,
        absent: bashoRecord.absent,
        yusho: bashoRecord.yusho,
        expectedWins: bashoRecord.expectedWins,
        strengthOfSchedule: bashoRecord.strengthOfSchedule,
        performanceOverExpected: bashoRecord.performanceOverExpected,
        historyWindow: pastRecords,
        isOzekiKadoban: state.status.isOzekiKadoban,
        isOzekiReturn: state.status.isOzekiReturn,
        options: {
          ...rankOptions,
          isOzekiReturn: state.status.isOzekiReturn,
        },
        replayNextRank:
          (params.banzukeMode === 'REPLAY'
            ? topDivisionQuota?.assignedNextRank ?? boundaryAssignedNextRank
            : undefined),
      },
    ],
  });
  state.lastCommitteeWarnings = committee.warnings.length;
  const playerAllocation = committee.allocations.find((allocation) => allocation.id === PLAYER_ACTOR_ID);
  if (!playerAllocation) {
    throw new Error('Banzuke allocation for PLAYER is missing');
  }
  const rankChange: RankChangeResult = {
    ...playerAllocation.finalDecision,
    nextRank: playerAllocation.finalRank,
  };

  const beforeEvents = state.status.history.events.length;
  appendBashoEvents(state.status, state.year, month, bashoRecord, rankChange, currentRank);
  const newEvents = state.status.history.events.slice(beforeEvents);

  state.status.rank = rankChange.nextRank;
  state.status.isOzekiKadoban = rankChange.isKadoban;
  state.status.isOzekiReturn = rankChange.isOzekiReturn;
  state.status.ratingState = updateAbilityAfterBasho({
    current: state.status.ratingState,
    actualWins: bashoRecord.wins,
    expectedWins: bashoRecord.expectedWins ?? bashoRecord.wins,
    age: state.status.age,
    careerBashoCount: state.status.history.records.length,
    currentRank: state.status.rank,
  });

  const isNewInjury = state.status.injuryLevel === 0 && bashoRecord.absent > 0;
  state.status = applyGrowth(state.status, params.oyakata, isNewInjury, deps.random);
  syncPlayerActorInWorld(world, state.status, deps.random);

  state.seq += 1;

  runNpcRetirementStep(world.npcRegistry.values(), state.seq, deps.random);

  const activeNpcCount = countActiveNpcInWorld(world);
  const intake = intakeNewNpcRecruits(
    {
      registry: world.npcRegistry,
      maezumoPool: world.maezumoPool,
      nameContext: world.npcNameContext,
      nextNpcSerial: world.nextNpcSerial,
    },
    state.seq,
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
  reconcileNpcLeague(world, lowerDivisionQuotaWorld, sekitoriBoundaryWorld, deps.random, state.seq, month);
  const populationSnapshot = createPopulationSnapshot(world, state.seq, bashoRecord.year, bashoRecord.month);
  state.lastDiagnostics = {
    seq: state.seq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    rank: currentRank,
    wins: bashoRecord.wins,
    losses: bashoRecord.losses,
    absent: bashoRecord.absent,
    expectedWins: bashoRecord.expectedWins ?? bashoRecord.wins,
    strengthOfSchedule: bashoRecord.strengthOfSchedule ?? 0,
    performanceOverExpected:
      bashoRecord.performanceOverExpected ??
      bashoRecord.wins - (bashoRecord.expectedWins ?? bashoRecord.wins),
    promoted: rankChange.event?.includes('PROMOTION') ?? false,
    demoted: rankChange.event?.includes('DEMOTION') ?? false,
    reason: rankChange.event,
    simulationModelVersion,
    banzukeEngineVersion,
  };

  const sekitoriNpc = buildSekitoriNpcRecords(world, world.makuuchiLayout);
  const sameDivisionNpc = buildSameDivisionLowerNpcRecords(lowerDivisionQuotaWorld, currentRank);
  const npcBashoRecords = mergeNpcBashoRecords(
    sekitoriNpc,
    currentRank.division === 'Makuuchi' || currentRank.division === 'Juryo' ? [] : sameDivisionNpc,
  );

  state.monthIndex += 1;
  if (state.monthIndex >= MONTHS.length) {
    state.status.statHistory.push({
      age: state.status.age,
      stats: { ...state.status.stats },
    });
    state.status.age += 1;
    state.year += 1;
    state.monthIndex = 0;
  }

  await deps.yieldControl();

  const progress = createProgressSnapshot(
    state.status,
    world,
    lowerDivisionQuotaWorld,
    state.year,
    MONTHS[state.monthIndex],
    state.lastCommitteeWarnings,
    state.lastDiagnostics,
  );

  return {
    kind: 'BASHO',
    seq: state.seq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    playerRecord: bashoRecord,
    playerBouts: bashoResult.playerBoutDetails,
    npcBashoRecords,
    banzukePopulation: populationSnapshot,
    banzukeDecisions: committee.decisionLogs,
    diagnostics: state.lastDiagnostics,
    lowerDivisionPlacementTrace: lowerDivisionQuotaWorld.lastPlacementTrace.map((row) => ({
      ...row,
      beforeRank: { ...row.beforeRank },
      afterRank: { ...row.afterRank },
    })),
    events: newEvents,
    pauseReason: resolvePauseReason(newEvents),
    statusSnapshot: cloneStatus(state.status),
    progress,
  };
};
