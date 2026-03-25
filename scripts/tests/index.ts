import { assertModuleCoverage, getTestScope } from './_shared/moduleUtils';
import { banzukeTestModule } from './modules/banzuke';
import { calibrationTestModule } from './modules/calibration';
import { gameplayTestModule } from './modules/gameplay';
import { experienceTestModule } from './modules/experience';
import { npcTestModule } from './modules/npc';
import { persistenceTestModule } from './modules/persistence';
import { tests as legacyTests } from './legacy/allCases';
import { simulationTestModule } from './modules/simulation';
import { TestCase, TestModule } from './types';

const nodeProcess = (globalThis as {
  process?: { argv?: string[]; env?: Record<string, string | undefined>; exitCode?: number };
}).process;

const readArgValue = (args: string[], index: number): string | undefined => {
  const value = args[index + 1];
  return value && !value.startsWith('--') ? value : undefined;
};

const parseCommaList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export const testModules: TestModule[] = [
  calibrationTestModule,
  banzukeTestModule,
  simulationTestModule,
  gameplayTestModule,
  experienceTestModule,
  persistenceTestModule,
  npcTestModule,
];

assertModuleCoverage(testModules, legacyTests);

export const tests: TestCase[] = testModules.flatMap((module) => module.cases);

export const listScopes = (): string[] =>
  [...new Set(tests.map((test) => getTestScope(test.name)))]
    .filter(Boolean)
    .sort();

export const listScopesForTests = (selectedTests: TestCase[]): string[] =>
  [...new Set(selectedTests.map((test) => getTestScope(test.name)))]
    .filter(Boolean)
    .sort();

export const selectTests = (
  cliArgs: string[],
  envVars: Record<string, string | undefined>,
): { selectedTests: TestCase[]; listScopesOnly: boolean } => {
  const grepPatterns: string[] = [...parseCommaList(envVars.TEST_GREP)];
  const scopes: string[] = [...parseCommaList(envVars.TEST_SCOPE).map((scope) => scope.toLowerCase())];
  let listScopesOnly = false;

  for (let i = 0; i < cliArgs.length; i += 1) {
    const arg = cliArgs[i];
    if (arg === '--grep') {
      const pattern = readArgValue(cliArgs, i);
      if (!pattern) {
        throw new Error('Missing value for --grep');
      }
      grepPatterns.push(pattern);
      i += 1;
      continue;
    }
    if (arg === '--scope') {
      const scope = readArgValue(cliArgs, i);
      if (!scope) {
        throw new Error('Missing value for --scope');
      }
      scopes.push(scope.toLowerCase());
      i += 1;
      continue;
    }
    if (arg === '--list-scopes') {
      listScopesOnly = true;
    }
  }

  const grepRegexes = grepPatterns.map((pattern) => new RegExp(pattern, 'i'));
  const selectedTests = tests.filter((test) => {
    const scope = getTestScope(test.name);
    const scopeOk = scopes.length === 0 || scopes.includes(scope);
    const grepOk = grepRegexes.length === 0 || grepRegexes.some((regex) => regex.test(test.name));
    return scopeOk && grepOk;
  });

  return {
    selectedTests,
    listScopesOnly,
  };
};

export const runSelectedTests = async (
  selectedTests: TestCase[],
  logger: Pick<Console, 'log' | 'error'> = console,
): Promise<void> => {
  let passed = 0;
  for (const test of selectedTests) {
    try {
      await test.run();
      passed += 1;
      logger.log(`PASS ${test.name}`);
    } catch (error) {
      logger.error(`FAIL ${test.name}`);
      throw error;
    }
  }

  logger.log(`All tests passed (${passed}/${selectedTests.length})`);
};

export const runFromCli = async (): Promise<void> => {
  const cliArgs = nodeProcess?.argv?.slice(2).filter((arg) => arg !== '--cli') ?? [];
  const envVars = nodeProcess?.env ?? {};
  const { selectedTests, listScopesOnly } = selectTests(cliArgs, envVars);

  if (selectedTests.length === 0 && !listScopesOnly) {
    console.error('No tests selected. Check --scope/--grep or TEST_SCOPE/TEST_GREP values.');
    if (nodeProcess) {
      nodeProcess.exitCode = 1;
    }
    throw new Error('No tests selected');
  }

  if (!listScopesOnly && selectedTests.length !== tests.length) {
    console.log(`Running filtered tests: ${selectedTests.length}/${tests.length}`);
  }

  if (listScopesOnly) {
    console.log(listScopesForTests(selectedTests).join('\n'));
    if (nodeProcess) {
      nodeProcess.exitCode = 0;
    }
    return;
  }

  await runSelectedTests(selectedTests);
};

if (nodeProcess?.argv?.includes('--cli')) {
  runFromCli().catch((error) => {
    console.error(error);
    throw error;
  });
}
