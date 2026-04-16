import { tests as currentTests } from '../current/banzuke';
import { createScopedModule } from '../shared/moduleUtils';

export const banzukeTestModule = createScopedModule('banzuke', currentTests, [
  'banzuke',
  'banzuke scoring',
  'quota',
  'ranking',
  'ranking property',
  'torikumi',
  'torikumi policy',
]);
