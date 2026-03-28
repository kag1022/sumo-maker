import { tests as currentTests } from '../current/simulation';
import { createScopedModule } from '../shared/moduleUtils';

export const simulationTestModule = createScopedModule('simulation', currentTests, [
  'battle',
  'engine',
  'growth',
  'matchmaking',
  'rating',
  'retirement',
  'simulation',
  'simulation engine',
  'simulation model normalization',
  'variance',
  'yusho',
]);
