import { RikishiStatus } from '../models';
import { SimulationDependencies } from './deps';
import { SimulationParams } from './engine';
import { createSimulationRuntime, runSeasonStep } from './runtime';

export type { SimulationParams };

export const runSimulation = async (
  params: SimulationParams,
  dependencies?: Partial<SimulationDependencies>,
): Promise<RikishiStatus> => {
  const runtime = createSimulationRuntime(params, dependencies);

  while (true) {
    const step = await runSeasonStep(runtime);
    if (step.kind === 'COMPLETED') {
      return step.statusSnapshot;
    }
  }
};
