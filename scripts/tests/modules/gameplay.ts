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
  'scout',
  'style identity',
  'traits',
]);
