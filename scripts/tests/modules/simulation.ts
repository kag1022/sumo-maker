import { tests as legacyTests } from '../legacy/allCases';
import { createScopedModule } from '../_shared/moduleUtils';

export const simulationTestModule = createScopedModule('simulation', legacyTests, [
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
