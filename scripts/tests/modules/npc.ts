import { tests as currentTests } from '../current/npc';
import { createScopedModule } from '../shared/moduleUtils';

export const npcTestModule = createScopedModule('npc', currentTests, [
  'league',
  'npc intake',
  'npc pipeline',
  'npc realism c1',
  'npc shikona',
  'npc stable catalog',
  'npc universe',
  'population plan',
  'player name collision',
  'player sync',
]);
