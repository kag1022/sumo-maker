import { tests as legacyTests } from '../legacy/allCases';
import { createScopedModule } from '../_shared/moduleUtils';

export const persistenceTestModule = createScopedModule('persistence', legacyTests, [
  'collection',
  'compat',
  'report',
  'storage',
  'wallet',
]);
