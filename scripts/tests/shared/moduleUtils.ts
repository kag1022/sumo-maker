import { TestCase, TestModule } from '../types';

export const getTestScope = (testName: string): string =>
  testName.split(':', 1)[0]?.trim().toLowerCase() ?? '';

export const filterTestsByScopes = (
  tests: TestCase[],
  scopes: readonly string[],
): TestCase[] => {
  const scopeSet = new Set(scopes.map((scope) => scope.toLowerCase()));
  return tests.filter((test) => scopeSet.has(getTestScope(test.name)));
};

export const createScopedModule = (
  id: string,
  tests: TestCase[],
  scopes: readonly string[],
): TestModule => ({
  id,
  cases: filterTestsByScopes(tests, scopes),
});

export const assertModuleCoverage = (
  modules: TestModule[],
  allTests: TestCase[],
): void => {
  const seenNames = new Set<string>();
  const duplicateNames: string[] = [];
  const coveredNames = new Set<string>();

  for (const module of modules) {
    for (const test of module.cases) {
      if (seenNames.has(test.name)) {
        duplicateNames.push(test.name);
      } else {
        seenNames.add(test.name);
      }
      coveredNames.add(test.name);
    }
  }

  const uncoveredNames = allTests
    .map((test) => test.name)
    .filter((name) => !coveredNames.has(name));

  if (duplicateNames.length || uncoveredNames.length) {
    const details = [
      duplicateNames.length
        ? `duplicate: ${duplicateNames.slice(0, 5).join(', ')}`
        : '',
      uncoveredNames.length
        ? `uncovered: ${uncoveredNames.slice(0, 5).join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join(' / ');
    throw new Error(`Invalid test module coverage: ${details}`);
  }
};
