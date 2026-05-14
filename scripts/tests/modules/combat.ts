import { tests as currentTests } from '../current/combat';
import { createScopedModule } from '../shared/moduleUtils';

export const combatTestModule = createScopedModule('combat', currentTests, [
  'combat kernel',
  'combat diagnostic kimarite classifier',
  'combat explanation',
  'combat phase',
  'combat phase route bias',
  'combat profile',
]);
