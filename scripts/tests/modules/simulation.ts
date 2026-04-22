import { tests as currentTests } from '../current/simulation';
import { createScopedModule } from '../shared/moduleUtils';

export const simulationTestModule = createScopedModule('simulation', currentTests, [
  'battle',
  'engine',
  'growth',
  'matchmaking',
  'observation',
  'population realism',
  'rating',
  'retirement',
  'runtime',
  'simulation',
  'simulation engine',
  'simulation runtime',
  'simulation model normalization',
  'variance',
  'yusho',
]);
