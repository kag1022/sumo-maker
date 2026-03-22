import { BanzukeEngineVersion } from '../../banzuke';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  normalizeNewRunModelVersion,
} from '../modelVersion';
import {
  createLowerDivisionQuotaWorld,
} from '../lowerQuota';
import {
  createSekitoriBoundaryWorld,
} from '../sekitoriQuota';
import { appendEntryEvent, initializeSimulationStatus } from '../career';
import { createEmptyRuntimeRivalryState } from '../../careerRivalry';
import { resolveSimulationDependencies, SimulationDependencies } from '../deps';
import { createSimulationWorld, syncPlayerActorInWorld } from '../world';
import { SimulationEngine, SimulationParams } from './types';
import { cloneStatus, EngineRuntimeState, runOneStep } from './runOneStep';

export const createSimulationEngine = (
  params: SimulationParams,
  dependencies?: Partial<SimulationDependencies>,
): SimulationEngine => {
  const deps = resolveSimulationDependencies(dependencies);
  const simulationModelVersion = normalizeNewRunModelVersion(
    params.simulationModelVersion ?? DEFAULT_SIMULATION_MODEL_VERSION,
  );
  const banzukeEngineVersion: BanzukeEngineVersion =
    params.banzukeEngineVersion ?? 'optimizer-v1';
  const world = createSimulationWorld(deps.random);
  const sekitoriBoundaryWorld = createSekitoriBoundaryWorld(deps.random);
  const lowerDivisionQuotaWorld = createLowerDivisionQuotaWorld(deps.random, world);
  sekitoriBoundaryWorld.npcRegistry = world.npcRegistry;
  sekitoriBoundaryWorld.makushitaPool =
    lowerDivisionQuotaWorld.rosters.Makushita as unknown as typeof sekitoriBoundaryWorld.makushitaPool;

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
  appendEntryEvent(state.status, state.year);

  return {
    runNextBasho: () => runOneStep({
      params,
      deps,
      simulationModelVersion,
      banzukeEngineVersion,
      world,
      sekitoriBoundaryWorld,
      lowerDivisionQuotaWorld,
      state,
    }),
    getStatus: () => cloneStatus(state.status),
    isCompleted: () => state.completed,
  };
};
