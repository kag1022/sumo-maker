import { tests as currentTests } from '../current/persistence';
import { createScopedModule } from '../shared/moduleUtils';

export const persistenceTestModule = createScopedModule('persistence', currentTests, [
  'collection',
  'persistence',
  'report',
  'storage',
  'wallet',
]);
