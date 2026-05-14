import { assertModuleCoverage, getTestScope } from './shared/moduleUtils';
import { tests as compatTests } from './compat';
import { tests as currentTests } from './current';
import { architectureTestModule } from './modules/architecture';
import { banzukeTestModule } from './modules/banzuke';
import { calibrationTestModule } from './modules/calibration';
import { combatTestModule } from './modules/combat';
import { compatTestModule } from './modules/compat';
import { gameplayTestModule } from './modules/gameplay';
import { experienceTestModule } from './modules/experience';
import { npcTestModule } from './modules/npc';
import { persistenceTestModule } from './modules/persistence';
import { simulationTestModule } from './modules/simulation';
import { uiTestModule } from './modules/ui';
import { TestCase, TestModule, TestSuite } from './types';

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

const TEST_SUITES: readonly TestSuite[] = ['unit', 'verification', 'docs'];

export const getTestSuite = (test: TestCase): TestSuite => test.suite ?? 'unit';

const normalizeSuites = (values: string[]): TestSuite[] => {
  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)
    .flatMap((value) => (value === 'all' ? [] : [value]));
  const invalid = normalized.filter((value): value is string => !TEST_SUITES.includes(value as TestSuite));
  if (invalid.length > 0) {
    throw new Error(`Unknown test suite: ${invalid.join(', ')}`);
  }
  return [...new Set(normalized as TestSuite[])];
};

export const testModules: TestModule[] = [
  architectureTestModule,
  calibrationTestModule,
  combatTestModule,
  compatTestModule,
  banzukeTestModule,
  simulationTestModule,
  gameplayTestModule,
  experienceTestModule,
  persistenceTestModule,
  npcTestModule,
  uiTestModule,
];

assertModuleCoverage(testModules, [...compatTests, ...currentTests]);

export const tests: TestCase[] = testModules.flatMap((module) => module.cases);

export const listScopes = (): string[] =>
  [...new Set(tests.map((test) => getTestScope(test.name)))]
    .filter(Boolean)
    .sort();

export const listScopesForTests = (selectedTests: TestCase[]): string[] =>
  [...new Set(selectedTests.map((test) => getTestScope(test.name)))]
    .filter(Boolean)
    .sort();

export const listSuitesForTests = (selectedTests: TestCase[]): TestSuite[] =>
  [...new Set(selectedTests.map((test) => getTestSuite(test)))]
    .sort() as TestSuite[];

export const selectTests = (
  cliArgs: string[],
  envVars: Record<string, string | undefined>,
): { selectedTests: TestCase[]; listScopesOnly: boolean } => {
  const grepPatterns: string[] = [...parseCommaList(envVars.TEST_GREP)];
  const scopes: string[] = [...parseCommaList(envVars.TEST_SCOPE).map((scope) => scope.toLowerCase())];
  const suites: TestSuite[] = normalizeSuites(parseCommaList(envVars.TEST_SUITE));
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
    if (arg === '--suite') {
      const suite = readArgValue(cliArgs, i);
      if (!suite) {
        throw new Error('Missing value for --suite');
      }
      suites.push(...normalizeSuites([suite]));
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
    const suiteOk = suites.length === 0 || suites.includes(getTestSuite(test));
    const grepOk = grepRegexes.length === 0 || grepRegexes.some((regex) => regex.test(test.name));
    return scopeOk && suiteOk && grepOk;
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
    const selectedSuites = listSuitesForTests(selectedTests);
    const suiteLabel = selectedSuites.length > 0 ? ` [${selectedSuites.join(', ')}]` : '';
    console.log(`Running filtered tests${suiteLabel}: ${selectedTests.length}/${tests.length}`);
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
