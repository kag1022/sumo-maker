import { tests as currentTests } from '../current/combat';
import { createScopedModule } from '../shared/moduleUtils';

export const combatTestModule = createScopedModule('combat', currentTests, [
  'combat kernel',
  'combat explanation',
  'combat phase',
  'combat profile',
]);
