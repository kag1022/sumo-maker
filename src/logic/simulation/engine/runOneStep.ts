import {
  BanzukeEngineVersion,
  RankCalculationOptions,
  RankChangeResult,
  composeNextBanzuke,
} from '../../banzuke';
import { resolveRuntimeRankBand, resolveRuntimeRecordBucket } from '../../banzuke/providers/runtimeMetadata';
import { applyGrowth, checkRetirement } from '../../growth';
import { Rank, RikishiStatus } from '../../models';
import {
  BashoSimulationResult,
  runBashoDetailed,
} from '../basho';
import {
  runAttritionLeaguePhase,
  runPreseasonLeaguePhase,
  runPromotionLeaguePhase,
} from './seasonPhases';
import {
  appendBashoEvents,
  finalizeCareer,
  resolvePastRecords,
  updateCareerStats,
} from '../career';
import { SimulationDependencies } from '../deps';
import { resolveLowerDivisionQuotaForPlayer } from '../lowerQuota';
import { LowerDivisionQuotaWorld } from '../lowerQuota';
import { PlayerLowerRecord } from '../lower/types';
import { SimulationModelVersion } from '../modelVersion';
import {
  buildSameDivisionLowerNpcRecords,
  buildSekitoriNpcRecords,
  mergeNpcBashoRecords,
} from '../npcRecords';
import {
  resolveSekitoriQuotaForPlayer,
  SekitoriBoundaryWorld,
} from '../sekitoriQuota';
import { updateAbilityAfterBasho } from '../strength/update';
import { resolvePlayerStagnationState } from '../playerRealism';
import { resolveBashoFormDelta, updateConditionForV3 } from '../variance/bashoVariance';
import { updateStyleIdentityAfterBasho } from '../../style/identity';
import {
  applySpiritChangeAfterBasho,
  ensureCareerRecordStatus,
  pushBodyTimelinePoint,
  withRivalSummary,
} from '../../careerNarrative';
import { applyTraitAwakeningsForBasho } from '../../traits';
import {
  appendRuntimeRivalryStep,
  buildCareerRivalryDigest,
} from '../../careerRivalry';
import { buildCareerRealismSnapshot, updateStagnationState } from '../realism';
import { evolveKimariteRepertoireAfterBasho } from '../../kimarite/repertoire';
import {
  resolveTopDivisionFromRank,
  resolveTopDivisionQuotaForPlayer,
  simulateOffscreenSekitoriBasho,
  syncPlayerActorInWorld,
  finalizeSekitoriPlayerPlacement,
  SimulationWorld,
} from '../world';
import { SimulationDiagnostics } from '../diagnostics';
import { createPopulationSnapshot, createProgressLite, createProgressSnapshot } from './progressSnapshot';
import { resolvePauseReason } from './pausePolicy';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import {
  appendStagnationAdvisoryEvent,
  recordBashoMilestones,
  recordSlumpRecoveryMilestone,
} from '../careerMilestones';
import {
  RuntimeNarrativeState,
  SimulationParams,
  SimulationStepResult,
  SimulationTimingBreakdown,
  SimulationTimingPhase,
} from './types';

const MONTHS = [1, 3, 5, 7, 9, 11] as const;
const EMPTY_SIMULATION_TIMING_PHASES: Record<SimulationTimingPhase, number> = {
  pre_reconcile: 0,
  basho_simulation: 0,
  quota_and_banzuke: 0,
  post_basho_maintenance: 0,
  postprocess: 0,
};

export interface EngineRuntimeState {
  status: RikishiStatus;
  year: number;
  monthIndex: number;
  seq: number;
  completed: boolean;
  lastCommitteeWarnings: number;
  lastDiagnostics?: SimulationDiagnostics;
  runtimeNarrative: RuntimeNarrativeState;
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

const createTimingBreakdown = (
  phases?: Partial<Record<SimulationTimingPhase, number>>,
): SimulationTimingBreakdown => {
  const nextPhases = {
    ...EMPTY_SIMULATION_TIMING_PHASES,
    ...(phases ?? {}),
  };
  return {
    totalMs: Object.values(nextPhases).reduce((sum, value) => sum + value, 0),
    phases: nextPhases,
  };
};

const enrichStatusWithRuntimeNarrative = (
  status: RikishiStatus,
  runtimeNarrative: RuntimeNarrativeState,
): RikishiStatus => {
  const normalized = ensureCareerRecordStatus(status);
  const rivalryDigest = buildCareerRivalryDigest(
    normalized,
    runtimeNarrative.rivalry.headToHeadRows,
    runtimeNarrative.rivalry.boutsByBasho,
    runtimeNarrative.rivalry.bashoRowsBySeq,
  );
  const next = withRivalSummary(normalized, runtimeNarrative.rivalry.headToHeadRows);
  return {
    ...next,
    careerRivalryDigest: rivalryDigest,
  };
};

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

const buildProgressSnapshot = (
  context: Pick<RunOneStepContext, 'params' | 'world' | 'lowerDivisionQuotaWorld' | 'state'>,
  year: number,
  month: number,
) => {
  const { params, world, lowerDivisionQuotaWorld, state } = context;
  return params.progressSnapshotMode === 'lite'
    ? createProgressLite(state.status, year, month)
    : createProgressSnapshot(
      state.status,
      world,
      lowerDivisionQuotaWorld,
      year,
      month,
      state.lastCommitteeWarnings,
      state.lastDiagnostics,
    );
};

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
  const startMs = deps.now();
  const phaseTimings: Record<SimulationTimingPhase, number> = {
    ...EMPTY_SIMULATION_TIMING_PHASES,
  };
  let phaseStartMs = startMs;
  const finishPhase = (phase: SimulationTimingPhase): void => {
    const now = deps.now();
    phaseTimings[phase] += Math.max(0, now - phaseStartMs);
    phaseStartMs = now;
  };

  if (state.completed) {
    const finalStatus = enrichStatusWithRuntimeNarrative(state.status, state.runtimeNarrative);
    return {
      kind: 'COMPLETED',
      statusSnapshot: cloneStatus(finalStatus),
      banzukeDecisions: [],
      diagnostics: state.lastDiagnostics,
      events: [],
      progress: buildProgressSnapshot(
        context,
        state.year,
        MONTHS[Math.min(state.monthIndex, MONTHS.length - 1)],
      ),
      timing: createTimingBreakdown(),
    };
  }

  const month = MONTHS[state.monthIndex];
  const { populationPlan } = runPreseasonLeaguePhase(
    {
      world,
      lowerDivisionQuotaWorld,
      sekitoriBoundaryWorld,
    },
    deps.random,
    state.year,
    state.seq,
    month,
  );

  // DEV-ONLY: __dev_ironmanPlayer が真のときは引退判定をスキップし
  // NPC世界の観測を指定basho数まで継続させる。
  // 本番ゲーム・通常プレイでは params.__dev_ironmanPlayer は undefined のため挙動不変。
  if (params.__dev_ironmanPlayer) {
    // ironman: skip retirement check, player continues playing
  } else {
    const retirementCheck = checkRetirement(state.status, deps.random);
    if (retirementCheck.shouldRetire) {
      const beforeEvents = state.status.history.events.length;
      state.status = finalizeCareer(state.status, state.year, month, retirementCheck.reason);
      state.completed = true;
      const events = state.status.history.events.slice(beforeEvents);
      const finalStatus = enrichStatusWithRuntimeNarrative(state.status, state.runtimeNarrative);
      return {
        kind: 'COMPLETED',
        statusSnapshot: cloneStatus(finalStatus),
        banzukeDecisions: [],
        diagnostics: state.lastDiagnostics,
        events,
        pauseReason: 'RETIREMENT',
        progress: buildProgressSnapshot(context, state.year, month),
        timing: createTimingBreakdown({
          pre_reconcile: Math.max(0, deps.now() - startMs),
        }),
      };
    }
  } // DEV-ONLY: closes if (params.__dev_ironmanPlayer) else block

  if (state.status.traits.includes('KIBUNYA')) {
    state.status.currentCondition = deps.random() < 0.5 ? 70 : 30;
  }

  syncPlayerActorInWorld(world, state.status, deps.random);

  const currentRank = { ...state.status.rank };
  const bashoMakuuchiLayout = { ...world.makuuchiLayout };
  const stagnationPressureBeforeBasho = state.status.stagnation?.pressure ?? 0;
  const stagnationBeforeBasho = resolvePlayerStagnationState({
    age: state.status.age,
    careerBashoCount: state.status.history.records.length,
    currentRank,
    maxRank: state.status.history.maxRank,
    recentRecords: state.status.history.records.slice(-6),
    formerSekitori:
      state.status.history.maxRank.division === 'Makuuchi' || state.status.history.maxRank.division === 'Juryo',
  });
  const playerTopDivision = resolveTopDivisionFromRank(state.status.rank);
  finishPhase('pre_reconcile');

  if (!playerTopDivision) {
    simulateOffscreenSekitoriBasho(world, deps.random);
  }
  const conditionBeforeBasho = state.status.currentCondition;
  const playerBashoFormDelta =
    resolveBashoFormDelta({
      uncertainty: state.status.ratingState.uncertainty,
      volatility: 1.2,
      rng: deps.random,
    }).bashoFormDelta;

  const bashoResult: BashoSimulationResult = runBashoDetailed(
    state.status,
    state.year,
    month,
    deps.random,
    world,
    lowerDivisionQuotaWorld,
    simulationModelVersion,
    playerBashoFormDelta,
  );
  finishPhase('basho_simulation');
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

  runPromotionLeaguePhase(
    {
      world,
      lowerDivisionQuotaWorld,
      sekitoriBoundaryWorld,
    },
    deps.random,
    {
      playerRecord: lowerPlayerRecord,
      precomputedLeagueResults: bashoResult.lowerLeagueSnapshots,
      banzukeEngineVersion,
    },
  );

  state.status.history.records.push(bashoRecord);
  updateCareerStats(state.status, bashoRecord);
  state.status = updateStyleIdentityAfterBasho(
    state.status,
    bashoRecord,
    state.seq + 1,
    bashoResult.playerBoutDetails,
  );
  state.status.kimariteRepertoire = evolveKimariteRepertoireAfterBasho(
    state.status,
    bashoRecord,
    state.seq + 1,
  ).kimariteRepertoire;

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
    empiricalContext: {
      recordBucket: resolveRuntimeRecordBucket(
        bashoRecord.wins,
        bashoRecord.losses,
        bashoRecord.absent,
      ),
      rankBand: resolveRuntimeRankBand(
        currentRank.division,
        currentRank.name,
        currentRank.number,
      ),
      performanceOverExpected: bashoRecord.performanceOverExpected,
    },
    stagnationPressure: stagnationPressureBeforeBasho,
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
        junYusho: bashoRecord.junYusho,
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
  finishPhase('quota_and_banzuke');

  const beforeEvents = state.status.history.events.length;
  appendBashoEvents(state.status, state.year, month, bashoRecord, rankChange, currentRank);
  let newEvents = state.status.history.events.slice(beforeEvents);
  const stagnationAfterBasho = resolvePlayerStagnationState({
    age: state.status.age,
    careerBashoCount: state.status.history.records.length,
    currentRank: rankChange.nextRank,
    maxRank: state.status.history.maxRank,
    recentRecords: state.status.history.records.slice(-6),
    formerSekitori:
      state.status.history.maxRank.division === 'Makuuchi' || state.status.history.maxRank.division === 'Juryo',
  });
  newEvents = appendStagnationAdvisoryEvent({
    events: newEvents,
    year: bashoRecord.year,
    month: bashoRecord.month,
    before: stagnationBeforeBasho,
    after: stagnationAfterBasho,
  });

  const spiritDelta = applySpiritChangeAfterBasho({
    status: state.status,
    record: bashoRecord,
    previousRank: currentRank,
    nextRank: rankChange.nextRank,
    newEvents,
  });
  const spiritPromotionMod = params.oyakata?.spiritMods?.promotionBonus ?? 1;
  const spiritInjuryMod = params.oyakata?.spiritMods?.injuryPenalty ?? 1;
  const spiritSlumpMod = params.oyakata?.spiritMods?.slumpPenalty ?? 1;
  let adjustedSpiritDelta = spiritDelta;
  if (adjustedSpiritDelta > 0) adjustedSpiritDelta = Math.round(adjustedSpiritDelta * spiritPromotionMod);
  if (adjustedSpiritDelta < 0 && newEvents.some((event) => event.type === 'INJURY')) {
    adjustedSpiritDelta = Math.round(adjustedSpiritDelta * spiritInjuryMod);
  }
  if (adjustedSpiritDelta < 0 && !newEvents.some((event) => event.type === 'INJURY')) {
    adjustedSpiritDelta = Math.round(adjustedSpiritDelta * spiritSlumpMod);
  }
  state.status.spirit = Math.max(-20, Math.min(100, state.status.spirit + adjustedSpiritDelta));

  const bashoSeq = state.seq + 1;
  recordBashoMilestones({
    status: state.status,
    bashoSeq,
    bashoRecord,
    currentRank,
    nextRank: rankChange.nextRank,
    events: newEvents,
  });

  state.status.rank = rankChange.nextRank;
  state.status.isOzekiKadoban = rankChange.isKadoban;
  state.status.isOzekiReturn = rankChange.isOzekiReturn;
  state.status.stagnation = updateStagnationState(state.status.stagnation, {
    wins: bashoRecord.wins,
    losses: bashoRecord.losses,
    absent: bashoRecord.absent,
    division: currentRank.division,
    promotedToSekitori:
      (currentRank.division !== 'Juryo' && currentRank.division !== 'Makuuchi') &&
      (rankChange.nextRank.division === 'Juryo' || rankChange.nextRank.division === 'Makuuchi'),
    careerBand: state.status.careerBand,
    temperamentBiases: state.status.careerSeed?.biases,
  });
  recordSlumpRecoveryMilestone({
    status: state.status,
    bashoSeq,
    bashoRecord,
    stagnationPressureBeforeBasho,
  });
  state.status.ratingState = updateAbilityAfterBasho({
    current: state.status.ratingState,
    actualWins: bashoRecord.wins,
    expectedWins: bashoRecord.expectedWins ?? bashoRecord.wins,
    age: state.status.age,
    careerBashoCount: state.status.history.records.length,
    currentRank: state.status.rank,
    maxRank: state.status.history.maxRank,
    absent: bashoRecord.absent,
    recentRecords: state.status.history.records.slice(-6),
    careerBand: state.status.careerBand,
    stagnationPressure: state.status.stagnation?.pressure ?? 0,
    careerSeedBiases: state.status.careerSeed?.biases,
  });

  const isNewInjury = state.status.injuryLevel === 0 && bashoRecord.absent > 0;
  state.status = applyGrowth(state.status, params.oyakata, isNewInjury, deps.random);
  const traitAwakeningResult = applyTraitAwakeningsForBasho({
    status: state.status,
    bashoSeq,
    bashoRecord,
    playerBouts: bashoResult.playerBoutDetails,
    importantTorikumiNotes: bashoResult.importantTorikumiNotes,
    currentRank,
    nextRank: rankChange.nextRank,
  });
  if (traitAwakeningResult.events.length > 0) {
    newEvents = [...newEvents, ...traitAwakeningResult.events];
  }
  bashoRecord.bodyWeightKg = Math.round(state.status.bodyMetrics.weightKg * 10) / 10;
  pushBodyTimelinePoint(state.status.history, bashoRecord, bashoSeq, state.status.bodyMetrics.weightKg);
  state.status = ensureCareerRecordStatus(state.status);
  state.status.history.realismKpi = buildCareerRealismSnapshot(state.status);
  state.status.currentCondition = updateConditionForV3({
    previousCondition: conditionBeforeBasho,
    actualWins: bashoRecord.wins,
    expectedWins: bashoRecord.expectedWins ?? bashoRecord.wins,
    bashoFormDelta: playerBashoFormDelta,
    rng: deps.random,
  });
  syncPlayerActorInWorld(world, state.status, deps.random);
  if (
    (currentRank.division !== 'Juryo' && currentRank.division !== 'Makuuchi') &&
    (state.status.rank.division === 'Juryo' || state.status.rank.division === 'Makuuchi')
  ) {
    finalizeSekitoriPlayerPlacement(world, state.status);
  }

  state.seq += 1;

  const populationAdvance = runAttritionLeaguePhase(
    {
      world,
      lowerDivisionQuotaWorld,
      sekitoriBoundaryWorld,
    },
    deps.random,
    populationPlan,
    state.seq,
    month,
  );
  const retiredNpcCareerBashoCounts = populationAdvance.retiredIds
    .map((id) => world.npcRegistry.get(id)?.careerBashoCount)
    .filter((count): count is number => Number.isFinite(count));
  const populationSnapshot = createPopulationSnapshot(
    world,
    state.seq,
    bashoRecord.year,
    bashoRecord.month,
    {
      intakeCountThisBasho: populationAdvance.recruitedIds.length,
      retiredCountThisBasho: populationAdvance.retiredIds.length,
    },
  );
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
    torikumiRelaxationHistogram: bashoResult.torikumiDiagnostics?.torikumiRelaxationHistogram,
    crossDivisionBoutCount: bashoResult.torikumiDiagnostics?.crossDivisionBoutCount,
    lateCrossDivisionBoutCount: bashoResult.torikumiDiagnostics?.lateCrossDivisionBoutCount,
    sameStableViolationCount: bashoResult.torikumiDiagnostics?.sameStableViolationCount,
    sameCardViolationCount: bashoResult.torikumiDiagnostics?.sameCardViolationCount,
    torikumiRepairHistogram: bashoResult.torikumiDiagnostics?.repairHistogram,
    torikumiScheduleViolations: bashoResult.torikumiDiagnostics?.scheduleViolations.length,
    torikumiLateDirectTitleBoutCount: bashoResult.torikumiDiagnostics?.lateDirectTitleBoutCount,
    sanyakuRoundRobinCoverageRate: bashoResult.torikumiDiagnostics?.sanyakuRoundRobinCoverageRate,
    joiAssignmentCoverageRate: bashoResult.torikumiDiagnostics?.joiAssignmentCoverageRate,
    yokozunaOzekiTailBoutRatio: bashoResult.torikumiDiagnostics?.yokozunaOzekiTailBoutRatio,
    npcTopDivisionBoutRows:
      bashoResult.torikumiDiagnostics?.npcTopDivisionBoutRows ??
      world.lastTopDivisionBoutRows,
    fusenPairCount:
      bashoResult.torikumiDiagnostics?.fusenPairCount ??
      world.lastTopDivisionBoutRows?.filter((row) => row.fusenPair).length,
    doubleKyujoCount:
      bashoResult.torikumiDiagnostics?.doubleKyujoCount ??
      world.lastTopDivisionBoutRows?.filter((row) => row.doubleKyujo).length,
    bashoVariance: {
      playerBashoFormDelta,
      conditionBefore: conditionBeforeBasho,
      conditionAfter: state.status.currentCondition,
    },
  };

  const sekitoriNpc = buildSekitoriNpcRecords(world, bashoMakuuchiLayout);
  const sameDivisionNpc = buildSameDivisionLowerNpcRecords(lowerDivisionQuotaWorld, currentRank);
  const npcBashoRecords = mergeNpcBashoRecords(
    sekitoriNpc,
    currentRank.division === 'Makuuchi' || currentRank.division === 'Juryo' ? [] : sameDivisionNpc,
  );
  state.runtimeNarrative.rivalry = appendRuntimeRivalryStep(state.runtimeNarrative.rivalry, {
    bashoSeq: state.seq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    shikona: state.status.shikona,
    playerRank: currentRank,
    playerWins: bashoRecord.wins,
    playerLosses: bashoRecord.losses,
    playerAbsent: bashoRecord.absent,
    playerTitles: [
      ...(bashoRecord.yusho ? ['YUSHO'] : []),
      ...(bashoRecord.specialPrizes ?? []),
      ...((bashoRecord.kinboshi ?? 0) > 0 ? [`KINBOSHI_${bashoRecord.kinboshi}`] : []),
    ],
    playerBouts: bashoResult.playerBoutDetails,
    npcRows: npcBashoRecords.map((row) => ({
      seq: state.seq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      entityId: row.entityId,
      entityType: 'NPC',
      shikona: row.shikona,
      division: row.division,
      rankName: row.rankName,
      rankNumber: row.rankNumber,
      rankSide: row.rankSide,
      wins: row.wins,
      losses: row.losses,
      absent: row.absent,
      titles: [...row.titles],
    })),
  });
  finishPhase('post_basho_maintenance');

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

  const progress = buildProgressSnapshot(context, state.year, MONTHS[state.monthIndex]);
  const eventPauseReason = resolvePauseReason(newEvents);
  const statusSnapshot =
    context.params.bashoSnapshotMode === 'none' ? undefined : cloneStatus(state.status);
  finishPhase('postprocess');

  return {
    kind: 'BASHO',
    seq: state.seq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    playerRecord: bashoRecord,
    playerBouts: bashoResult.playerBoutDetails,
    importantTorikumiNotes: bashoResult.importantTorikumiNotes,
    npcBashoRecords,
    retiredNpcCareerBashoCounts,
    banzukePopulation: populationSnapshot,
    banzukeDecisions: committee.decisionLogs,
    diagnostics: state.lastDiagnostics,
    lowerDivisionPlacementTrace: lowerDivisionQuotaWorld.lastPlacementTrace.map((row) => ({
      ...row,
      beforeRank: { ...row.beforeRank },
      afterRank: { ...row.afterRank },
    })),
    events: newEvents,
    pauseReason: eventPauseReason,
    statusSnapshot,
    progress,
    timing: createTimingBreakdown(phaseTimings),
  };
};
