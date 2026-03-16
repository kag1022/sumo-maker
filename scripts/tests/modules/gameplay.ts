import { tests as legacyTests } from '../legacy/allCases';
import { createScopedModule } from '../_shared/moduleUtils';

export const gameplayTestModule = createScopedModule('gameplay', legacyTests, [
  'build vnext',
  'build-lab',
  'career',
  'hoshitori',
  'initialization',
  'kata',
  'kimarite',
  'logic-lab',
  'scout',
]);
