import { tests as currentTests } from '../current/npc';
import { createScopedModule } from '../shared/moduleUtils';

export const npcTestModule = createScopedModule('npc', currentTests, [
  'league',
  'npc intake',
  'npc pipeline',
  'npc shikona',
  'npc stable catalog',
  'npc universe',
  'player name collision',
]);
