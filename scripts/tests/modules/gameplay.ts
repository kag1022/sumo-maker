import { tests as currentTests } from '../current/gameplay';
import { createScopedModule } from '../shared/moduleUtils';

export const gameplayTestModule = createScopedModule('gameplay', currentTests, [
  'build vnext',
  'build-lab',
  'career',
  'hoshitori',
  'initialization',
  'kata',
  'kimarite',
  'logic-lab',
  'observation build',
  'scout',
  'style identity',
  'traits',
]);
