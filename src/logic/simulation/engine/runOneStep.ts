import {
  BanzukeEngineVersion,
  RankCalculationOptions,
  RankChangeResult,
  composeNextBanzuke,
} from '../../banzuke';
import { resolveEmpiricalRankBand, resolveEmpiricalRecordBucket } from '../../banzuke/providers/empirical';
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
import { ensurePopulationPlan } from '../npc/populationPlan';
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
import { resolveBashoFormDelta, updateConditionForV3 } from '../variance/bashoVariance';
import { updateKataProfileAfterBasho } from '../../style/kata';
import {
  applySpiritChangeAfterBasho,
  ensureCareerRecordStatus,
  pushBodyTimelinePoint,
  pushCareerTurningPoint,
  pushHighlightEvent,
  setCareerTurningPoint,
  withRivalSummary,
} from '../../careerNarrative';
import { applyTraitAwakeningsForBasho } from '../../traits';
import { resolveRealizedStyleProfile } from '../../styleProfile';
import {
  appendRuntimeRivalryStep,
  buildCareerRivalryDigest,
} from '../../careerRivalry';
import { buildCareerRealismSnapshot, updateStagnationState } from '../realism';
import {
  advanceTopDivisionBanzuke,
  countActiveBanzukeHeadcountExcludingMaezumo,
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
import { RuntimeNarrativeState, SimulationParams, SimulationStepResult } from './types';

const MONTHS = [1, 3, 5, 7, 9, 11] as const;

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
    };
  }

  const month = MONTHS[state.monthIndex];
  const populationPlan = ensurePopulationPlan(world, state.year, deps.random);
  reconcileNpcLeague(
    world,
    lowerDivisionQuotaWorld,
    sekitoriBoundaryWorld,
    deps.random,
    state.seq,
    month,
    populationPlan,
  );

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
    };
  }

  if (state.status.traits.includes('KIBUNYA')) {
    state.status.currentCondition = deps.random() < 0.5 ? 70 : 30;
  }

  syncPlayerActorInWorld(world, state.status, deps.random);

  const currentRank = { ...state.status.rank };
  const bashoMakuuchiLayout = { ...world.makuuchiLayout };
  const stagnationPressureBeforeBasho = state.status.stagnation?.pressure ?? 0;
  const playerTopDivision = resolveTopDivisionFromRank(state.status.rank);

  if (!playerTopDivision) {
    simulateOffscreenSekitoriBasho(world, deps.random);
  }
  const conditionBeforeBasho = state.status.currentCondition;
  const playerBashoFormDelta =
    true
      ? resolveBashoFormDelta({
        uncertainty: state.status.ratingState.uncertainty,
        volatility: 1.2,
        rng: deps.random,
      }).bashoFormDelta
      : 0;

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
    banzukeEngineVersion,
  );
  runSekitoriQuotaStep(
    world,
    sekitoriBoundaryWorld,
    deps.random,
    undefined,
    lowerDivisionQuotaWorld,
  );

  state.status.history.records.push(bashoRecord);
  updateCareerStats(state.status, bashoRecord);
  state.status = updateKataProfileAfterBasho(state.status, bashoRecord, state.seq + 1);

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
      recordBucket: resolveEmpiricalRecordBucket(
        bashoRecord.wins,
        bashoRecord.losses,
        bashoRecord.absent,
      ),
      rankBand: resolveEmpiricalRankBand(
        currentRank.division,
        currentRank.name,
        currentRank.number,
      ),
    },
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
  let newEvents = state.status.history.events.slice(beforeEvents);

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
  if (bashoRecord.yusho) {
    pushHighlightEvent(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'YUSHO',
      label: '優勝',
    });
    pushCareerTurningPoint(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'YUSHO',
      label: currentRank.division === 'Makuuchi' ? '幕内優勝' : '優勝',
      reason:
        currentRank.division === 'Makuuchi'
          ? `${bashoRecord.year}年${bashoRecord.month}月に幕内優勝。力士人生の景色を変えた。`
          : `${bashoRecord.year}年${bashoRecord.month}月に${currentRank.division}で優勝。番付の流れを一段押し上げた。`,
      severity: currentRank.division === 'Makuuchi' ? 10 : currentRank.division === 'Juryo' ? 8 : 6,
    });
  }
  if ((bashoRecord.kinboshi ?? 0) > 0) {
    pushHighlightEvent(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'KINBOSHI',
      label: '金星',
    });
  }
  if (newEvents.some((event) => event.type === 'PROMOTION')) {
    pushHighlightEvent(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'PROMOTION',
      label: '昇進',
    });
  }
  if (
    (currentRank.division === 'Makushita' || currentRank.division === 'Sandanme' || currentRank.division === 'Jonidan' || currentRank.division === 'Jonokuchi') &&
    (rankChange.nextRank.division === 'Juryo' || rankChange.nextRank.division === 'Makuuchi')
  ) {
    pushHighlightEvent(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'FIRST_SEKITORI',
      label: '初関取',
    });
    pushCareerTurningPoint(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'FIRST_SEKITORI',
      label: '初関取',
      reason: `${bashoRecord.year}年${bashoRecord.month}月に関取へ届き、人生の見られ方が変わった。`,
      severity: 7,
    });
  }
  if (currentRank.division === 'Juryo' && rankChange.nextRank.division === 'Makuuchi') {
    pushCareerTurningPoint(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'MAKUUCHI_PROMOTION',
      label: '新入幕',
      reason: `${bashoRecord.year}年${bashoRecord.month}月を越えて新入幕。相撲人生の主戦場が変わった。`,
      severity: 8,
    });
  }
  if (currentRank.division === 'Juryo' && rankChange.nextRank.division === 'Makushita') {
    pushHighlightEvent(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      tag: 'JURYO_DROP',
      label: '十両陥落',
    });
    pushCareerTurningPoint(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'JURYO_DROP',
      label: '十両陥落',
      reason: `${bashoRecord.year}年${bashoRecord.month}月に関取の座を失い、人生の重心が揺れた。`,
      severity: 7,
    });
  }
  const majorInjuryEvent = newEvents.find((event) => event.type === 'INJURY' && /重症度 (\d+)/.test(event.description));
  if (majorInjuryEvent) {
    const severityMatch = majorInjuryEvent.description.match(/重症度 (\d+)/);
    const severity = severityMatch ? Number(severityMatch[1]) : 0;
    if (severity >= 7) {
      pushHighlightEvent(state.status.history, {
        bashoSeq,
        year: bashoRecord.year,
        month: bashoRecord.month,
        tag: 'MAJOR_INJURY',
        label: '大怪我',
      });
      setCareerTurningPoint(state.status.history, {
        bashoSeq,
        year: bashoRecord.year,
        month: bashoRecord.month,
        kind: 'MAJOR_INJURY',
        label: '大怪我',
        reason: majorInjuryEvent.description,
        severity,
      });
    }
  }

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
  if (
    stagnationPressureBeforeBasho >= 3 &&
    (state.status.stagnation?.pressure ?? 0) <= 1 &&
    bashoRecord.wins >= 10 &&
    bashoRecord.wins > bashoRecord.losses + bashoRecord.absent
  ) {
    pushCareerTurningPoint(state.status.history, {
      bashoSeq,
      year: bashoRecord.year,
      month: bashoRecord.month,
      kind: 'SLUMP_RECOVERY',
      label: '停滞脱出',
      reason: `${bashoRecord.year}年${bashoRecord.month}月に勝ち星をまとめ、長い停滞から立て直した。`,
      severity: 6,
    });
  }
  state.status.ratingState = updateAbilityAfterBasho({
    current: state.status.ratingState,
    actualWins: bashoRecord.wins,
    expectedWins: bashoRecord.expectedWins ?? bashoRecord.wins,
    age: state.status.age,
    careerBashoCount: state.status.history.records.length,
    currentRank: state.status.rank,
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
  state.status.realizedStyleProfile = resolveRealizedStyleProfile(state.status);
  state.status = ensureCareerRecordStatus(state.status);
  state.status.history.realismKpi = buildCareerRealismSnapshot(state.status);
  if (true) {
    state.status.currentCondition = updateConditionForV3({
      previousCondition: conditionBeforeBasho,
      actualWins: bashoRecord.wins,
      expectedWins: bashoRecord.expectedWins ?? bashoRecord.wins,
      bashoFormDelta: playerBashoFormDelta,
      rng: deps.random,
    });
  }
  syncPlayerActorInWorld(world, state.status, deps.random);
  if (
    (currentRank.division !== 'Juryo' && currentRank.division !== 'Makuuchi') &&
    (state.status.rank.division === 'Juryo' || state.status.rank.division === 'Makuuchi')
  ) {
    finalizeSekitoriPlayerPlacement(world, state.status);
  }

  state.seq += 1;

  const retiredIds = runNpcRetirementStep(
    world.npcRegistry.values(),
    state.seq,
    deps.random,
    populationPlan,
  );

  const activeBanzukeHeadcount = countActiveBanzukeHeadcountExcludingMaezumo(world);
  const intake = intakeNewNpcRecruits(
    {
      registry: world.npcRegistry,
      maezumoPool: world.maezumoPool,
      nameContext: world.npcNameContext,
      nextNpcSerial: world.nextNpcSerial,
    },
    state.seq,
    month,
    activeBanzukeHeadcount,
    populationPlan,
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
  reconcileNpcLeague(
    world,
    lowerDivisionQuotaWorld,
    sekitoriBoundaryWorld,
    deps.random,
    state.seq,
    month,
    populationPlan,
  );
  const populationSnapshot = createPopulationSnapshot(
    world,
    state.seq,
    bashoRecord.year,
    bashoRecord.month,
    {
      intakeCountThisBasho: intake.recruits.length,
      retiredCountThisBasho: retiredIds.length,
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
    ...(true
      ? {
        bashoVariance: {
          playerBashoFormDelta,
          conditionBefore: conditionBeforeBasho,
          conditionAfter: state.status.currentCondition,
        },
      }
      : {}),
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

  return {
    kind: 'BASHO',
    seq: state.seq,
    year: bashoRecord.year,
    month: bashoRecord.month,
    playerRecord: bashoRecord,
    playerBouts: bashoResult.playerBoutDetails,
    importantTorikumiNotes: bashoResult.importantTorikumiNotes,
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
    pauseReason: eventPauseReason,
    statusSnapshot: context.params.bashoSnapshotMode === 'none' ? undefined : cloneStatus(state.status),
    progress,
  };
};
