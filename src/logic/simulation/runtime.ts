import { normalizeBanzukeEngineVersion } from '../banzuke';
import { createEmptyRuntimeRivalryState } from '../careerRivalry';
import { RikishiStatus } from '../models';
import { appendEntryEvent, initializeSimulationStatus } from './career';
import { buildCareerActorState, buildDomainEvents } from './careerDynamics';
import { resolveSimulationDependencies, SimulationDependencies } from './deps';
import { EngineRuntimeState, RunOneStepContext, cloneStatus, runOneStep } from './engine/runOneStep';
import { SimulationParams, SimulationStepResult } from './engine/types';
import { createLeagueFlowRuntime, LeagueFlowRuntime } from './leagueFlow';
import { buildLeagueState } from './leagueState';
import { resolveSimulationModelBundle } from './modelBundle';
import { normalizeNewRunModelVersion } from './modelVersion';
import {
  LeagueState,
  RuntimeTimeline,
  SimulationRuntimeSnapshot,
} from './runtimeTypes';
import {
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

const buildRuntimeSnapshot = (kernel: RuntimeImplementationState): SimulationRuntimeSnapshot => ({
  bundle: kernel.bundle,
  league: buildLeagueState({
    leagueFlow: kernel.leagueFlow,
    seq: kernel.state.seq,
    year: kernel.state.year,
    monthIndex: kernel.state.monthIndex,
  }),
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
