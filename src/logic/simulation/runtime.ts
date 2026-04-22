import { normalizeBanzukeEngineVersion } from '../banzuke';
import { createEmptyRuntimeRivalryState } from '../careerRivalry';
import { Division, RikishiStatus } from '../models';
import { appendEntryEvent, initializeSimulationStatus } from './career';
import { buildCareerActorState, buildDomainEvents } from './careerDynamics';
import { resolveSimulationDependencies, SimulationDependencies } from './deps';
import { EngineRuntimeState, RunOneStepContext, cloneStatus, runOneStep } from './engine/runOneStep';
import { SimulationParams, SimulationStepResult } from './engine/types';
import { createLeagueFlowRuntime, LeagueFlowRuntime } from './leagueFlow';
import { resolveSimulationModelBundle } from './modelBundle';
import { normalizeNewRunModelVersion } from './modelVersion';
import {
  LeagueDivisionEntry,
  LeagueDivisionState,
  LeagueState,
  RuntimeTimeline,
  SimulationRuntimeSnapshot,
} from './runtimeTypes';
import {
  countActiveBanzukeHeadcountExcludingMaezumo,
  countActiveMaezumoHeadcount,
  finalizeSekitoriPlayerPlacement,
  syncPlayerActorInWorld,
} from './world';

type RuntimeImplementationState = {
  params: SimulationParams;
  deps: SimulationDependencies;
  simulationModelVersion: ReturnType<typeof normalizeNewRunModelVersion>;
  banzukeEngineVersion: ReturnType<typeof normalizeBanzukeEngineVersion>;
  leagueFlow: LeagueFlowRuntime;
  state: EngineRuntimeState;
  bundle: ReturnType<typeof resolveSimulationModelBundle>;
  timeline: RuntimeTimeline;
};

type SerializedRuntimeImplementationState = Omit<RuntimeImplementationState, 'deps'>;

export interface SerializedSimulationRuntime {
  implementation: SerializedRuntimeImplementationState;
  snapshot: SimulationRuntimeSnapshot;
}

export interface SimulationRuntime {
  readonly bundle: ReturnType<typeof resolveSimulationModelBundle>;
  readonly league: LeagueState;
  readonly actor: SimulationRuntimeSnapshot['actor'];
  readonly timeline: RuntimeTimeline;
  readonly diagnostics: SimulationRuntimeSnapshot['diagnostics'];
  getSnapshot: () => SimulationRuntimeSnapshot;
  runNextSeasonStep: () => Promise<SimulationStepResult>;
  serialize: () => SerializedSimulationRuntime;
  isCompleted: () => boolean;
  getStatus: () => RikishiStatus;
}

const toEntry = (
  row: {
    id: string;
    shikona: string;
    stableId: string;
    rankScore: number;
    active?: boolean;
  },
): LeagueDivisionEntry => ({
  id: row.id,
  shikona: row.shikona,
  stableId: row.stableId,
  rankScore: row.rankScore,
  active: row.active !== false,
});

const buildDivisionState = (
  division: Division,
  rows: LeagueDivisionEntry[],
): LeagueDivisionState => {
  const activeHeadcount = rows.filter((row) => row.active).length;
  return {
    division,
    headcount: rows.length,
    activeHeadcount,
    vacancies: Math.max(0, rows.length - activeHeadcount),
    ranks: rows,
  };
};

const buildLeagueState = (kernel: RuntimeImplementationState): LeagueState => {
  const world = kernel.leagueFlow.world;
  const lowerWorld = kernel.leagueFlow.lowerWorld;
  const activeBanzukeHeadcount = countActiveBanzukeHeadcountExcludingMaezumo(world);
  const maezumoHeadcount = countActiveMaezumoHeadcount(world);

  const divisions: Record<Division, LeagueDivisionState> = {
    Makuuchi: buildDivisionState(
      'Makuuchi',
      world.rosters.Makuuchi.map((row) => toEntry({ ...row, active: true })),
    ),
    Juryo: buildDivisionState(
      'Juryo',
      world.rosters.Juryo.map((row) => toEntry({ ...row, active: true })),
    ),
    Makushita: buildDivisionState(
      'Makushita',
      lowerWorld.rosters.Makushita.map((row) => toEntry(row)),
    ),
    Sandanme: buildDivisionState(
      'Sandanme',
      lowerWorld.rosters.Sandanme.map((row) => toEntry(row)),
    ),
    Jonidan: buildDivisionState(
      'Jonidan',
      lowerWorld.rosters.Jonidan.map((row) => toEntry(row)),
    ),
    Jonokuchi: buildDivisionState(
      'Jonokuchi',
      lowerWorld.rosters.Jonokuchi.map((row) => toEntry(row)),
    ),
    Maezumo: buildDivisionState(
      'Maezumo',
      world.maezumoPool.map((row) => toEntry(row)),
    ),
  };

  const lowerExchanges = Object.values(lowerWorld.lastExchanges ?? {}).reduce((sum, exchange) => (
    sum + (exchange?.slots ?? 0)
  ), 0);
  const topExchangeSlots = kernel.leagueFlow.world.lastExchange?.slots ?? 0;

  return {
    currentSeason: {
      seq: kernel.state.seq,
      year: kernel.state.year,
      month: [1, 3, 5, 7, 9, 11][kernel.state.monthIndex] ?? 1,
    },
    population: {
      totalHeadcount: Object.values(divisions).reduce((sum, division) => sum + division.headcount, 0),
      totalActiveHeadcount: Object.values(divisions).reduce((sum, division) => sum + division.activeHeadcount, 0),
      activeBanzukeHeadcount,
      maezumoHeadcount,
    },
    divisions,
    currentCohort: [...world.npcRegistry.values()]
      .filter((npc) => npc.active && npc.entrySeq === kernel.state.seq)
      .map((npc) => npc.id),
    boundaryContext: {
      headcountPressure:
        Object.values(divisions).reduce((sum, division) => sum + division.vacancies, 0),
      promotionPressure: topExchangeSlots + lowerExchanges,
      demotionPressure: topExchangeSlots + lowerExchanges,
      makushitaExchangeSlots:
        topExchangeSlots + (lowerWorld.lastExchanges.MakushitaSandanme?.slots ?? 0),
    },
  };
};

const buildRuntimeSnapshot = (kernel: RuntimeImplementationState): SimulationRuntimeSnapshot => ({
  bundle: kernel.bundle,
  league: buildLeagueState(kernel),
  actor: buildCareerActorState(
    kernel.state.status,
    kernel.timeline.domainEvents,
  ),
  timeline: {
    timelineEvents: [...kernel.timeline.timelineEvents],
    domainEvents: [...kernel.timeline.domainEvents],
  },
  diagnostics: {
    latest: kernel.state.lastDiagnostics,
    lastCommitteeWarnings: kernel.state.lastCommitteeWarnings,
  },
});

const createKernel = (
  params: SimulationParams,
  dependencies?: Partial<SimulationDependencies>,
): RuntimeImplementationState => {
  const deps = resolveSimulationDependencies(dependencies);
  const bundle = resolveSimulationModelBundle(params.simulationModelVersion);
  const simulationModelVersion = normalizeNewRunModelVersion(bundle.version);
  const banzukeEngineVersion = normalizeBanzukeEngineVersion(params.banzukeEngineVersion);
  const leagueFlow = createLeagueFlowRuntime(deps.random);
  const world = leagueFlow.world;

  const state: EngineRuntimeState = {
    status: initializeSimulationStatus(params.initialStats),
    year: deps.getCurrentYear(),
    monthIndex: 0,
    seq: 0,
    completed: false,
    lastCommitteeWarnings: 0,
    lastDiagnostics: undefined,
    runtimeNarrative: {
      rivalry: createEmptyRuntimeRivalryState(),
    },
  };

  syncPlayerActorInWorld(world, state.status, deps.random);
  finalizeSekitoriPlayerPlacement(world, state.status);
  appendEntryEvent(state.status, state.year);

  return {
    params: {
      ...params,
      simulationModelVersion,
      banzukeEngineVersion,
    },
    deps,
    simulationModelVersion,
    banzukeEngineVersion,
    leagueFlow,
    state,
    bundle,
    timeline: {
      timelineEvents: [...state.status.history.events],
      domainEvents: [],
    },
  };
};

const toRunContext = (kernel: RuntimeImplementationState): RunOneStepContext => ({
  params: kernel.params,
  deps: kernel.deps,
  simulationModelVersion: kernel.simulationModelVersion,
  banzukeEngineVersion: kernel.banzukeEngineVersion,
  world: kernel.leagueFlow.world,
  sekitoriBoundaryWorld: kernel.leagueFlow.boundaryWorld,
  lowerDivisionQuotaWorld: kernel.leagueFlow.lowerWorld,
  state: kernel.state,
});

const createRuntimeFromKernel = (kernel: RuntimeImplementationState): SimulationRuntime => {
  const runNextSeasonStep = async (): Promise<SimulationStepResult> => {
    const previousStatus = cloneStatus(kernel.state.status);
    const step = await runOneStep(toRunContext(kernel));
    const seq = step.kind === 'COMPLETED'
      ? step.progress.bashoCount
      : step.seq;
    const domainEvents = buildDomainEvents({
      seq,
      year: step.progress.year,
      month: step.progress.month,
      events: step.events,
      currentStatus: kernel.state.status,
      previousStatus,
      pauseReason: step.pauseReason,
    });

    kernel.timeline.timelineEvents = [...kernel.timeline.timelineEvents, ...step.events];
    kernel.timeline.domainEvents = [...kernel.timeline.domainEvents, ...domainEvents];
    const runtime = buildRuntimeSnapshot(kernel);

    return {
      ...step,
      domainEvents,
      runtime,
    } as SimulationStepResult;
  };

  return {
    get bundle() {
      return kernel.bundle;
    },
    get league() {
      return buildRuntimeSnapshot(kernel).league;
    },
    get actor() {
      return buildRuntimeSnapshot(kernel).actor;
    },
    get timeline() {
      return buildRuntimeSnapshot(kernel).timeline;
    },
    get diagnostics() {
      return buildRuntimeSnapshot(kernel).diagnostics;
    },
    getSnapshot: () => buildRuntimeSnapshot(kernel),
    runNextSeasonStep,
    serialize: () => ({
      implementation: structuredClone({
        params: kernel.params,
        simulationModelVersion: kernel.simulationModelVersion,
        banzukeEngineVersion: kernel.banzukeEngineVersion,
        leagueFlow: kernel.leagueFlow,
        state: kernel.state,
        bundle: kernel.bundle,
        timeline: kernel.timeline,
      } satisfies SerializedRuntimeImplementationState),
      snapshot: buildRuntimeSnapshot(kernel),
    }),
    isCompleted: () => kernel.state.completed,
    getStatus: () => cloneStatus(kernel.state.status),
  };
};

export const createSimulationRuntime = (
  params: SimulationParams,
  dependencies?: Partial<SimulationDependencies>,
): SimulationRuntime => createRuntimeFromKernel(createKernel(params, dependencies));

export const runSeasonStep = (
  runtime: SimulationRuntime,
): Promise<SimulationStepResult> => runtime.runNextSeasonStep();

export const serializeRuntime = (
  runtime: SimulationRuntime,
): SerializedSimulationRuntime => runtime.serialize();

export const resumeRuntime = (
  serialized: SerializedSimulationRuntime,
  dependencies?: Partial<SimulationDependencies>,
): SimulationRuntime => createRuntimeFromKernel({
  ...structuredClone(serialized.implementation),
  deps: resolveSimulationDependencies(dependencies),
});
