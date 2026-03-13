import { tests as legacyTests } from '../legacy/allCases';
import { createScopedModule } from '../_shared/moduleUtils';

export const banzukeTestModule = createScopedModule('banzuke', legacyTests, [
  'banzuke',
  'banzuke scoring',
  'quota',
  'ranking',
  'ranking property',
  'torikumi',
  'torikumi policy',
]);
