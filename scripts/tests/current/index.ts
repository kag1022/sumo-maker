import { TestCase } from '../types';
import { tests as banzukeTests } from './banzuke';
import { tests as gameplayTests } from './gameplay';
import { tests as npcTests } from './npc';
import { tests as persistenceTests } from './persistence';
import { tests as simulationTests } from './simulation';

export const tests: TestCase[] = [
  ...banzukeTests,
  ...simulationTests,
  ...gameplayTests,
  ...persistenceTests,
  ...npcTests,
];
