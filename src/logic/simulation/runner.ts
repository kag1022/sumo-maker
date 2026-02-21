import { RikishiStatus } from '../models';
import { SimulationDependencies } from './deps';
import {
  createSimulationEngine,
  SimulationParams,
} from './engine';

export type { SimulationParams };

export const runSimulation = async (
  params: SimulationParams,
  dependencies?: Partial<SimulationDependencies>,
): Promise<RikishiStatus> => {
  const engine = createSimulationEngine(params, dependencies);

  while (true) {
    const step = await engine.runNextBasho();
    if (step.kind === 'COMPLETED') {
      return step.statusSnapshot;
    }
  }
};
