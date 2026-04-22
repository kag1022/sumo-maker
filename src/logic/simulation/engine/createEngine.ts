import { SimulationEngine, SimulationParams } from './types';
import { SimulationDependencies } from '../deps';
import { createSimulationRuntime, runSeasonStep } from '../runtime';
import { cloneStatus } from './runOneStep';

export const createSimulationEngine = (
  params: SimulationParams,
  dependencies?: Partial<SimulationDependencies>,
): SimulationEngine => {
  const runtime = createSimulationRuntime(params, dependencies);

  return {
    runNextBasho: () => runSeasonStep(runtime),
    getStatus: () => cloneStatus(runtime.getStatus()),
    isCompleted: () => runtime.isCompleted(),
  };
};
