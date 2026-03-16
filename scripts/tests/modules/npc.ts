import { tests as legacyTests } from '../legacy/allCases';
import { createScopedModule } from '../_shared/moduleUtils';

export const npcTestModule = createScopedModule('npc', legacyTests, [
  'league',
  'npc intake',
  'npc pipeline',
  'npc shikona',
  'npc stable catalog',
  'npc universe',
  'player name collision',
]);
