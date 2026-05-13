import fs from 'fs';
import path from 'path';
import { TestCase, TestModule } from '../types';

const ROOT_DIR = process.cwd();
const LOGIC_DIR = path.join(ROOT_DIR, 'src', 'logic');
const WORKER_PATH = path.join(ROOT_DIR, 'src', 'features', 'simulation', 'workers', 'simulation.worker.ts');

const assert = {
  ok(condition: unknown, message: string): void {
    if (!condition) {
      throw new Error(message);
    }
  },
};

const toRepoPath = (filePath: string): string =>
  path.relative(ROOT_DIR, filePath).split(path.sep).join('/');

const collectImportSpecifiers = (source: string): string[] => {
  const importPattern = /\bfrom\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;
  const specifiers: string[] = [];
  for (const match of source.matchAll(importPattern)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      specifiers.push(specifier);
    }
  }
  return specifiers;
};

const resolveRelativeImport = (fromFile: string, specifier: string): string | null => {
  if (!specifier.startsWith('.')) return null;
  return toRepoPath(path.resolve(path.dirname(fromFile), specifier));
};

const listSourceFiles = (dirPath: string): string[] => {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : [];
  });
};

const tests: TestCase[] = [
  {
    name: 'architecture: simulation worker does not import UI features',
    run: () => {
      const source = fs.readFileSync(WORKER_PATH, 'utf8');
      const forbiddenImports = collectImportSpecifiers(source)
        .map((specifier) => resolveRelativeImport(WORKER_PATH, specifier))
        .filter((resolvedPath): resolvedPath is string => Boolean(resolvedPath))
        .filter((resolvedPath) =>
          resolvedPath.startsWith('src/features/') &&
          !resolvedPath.startsWith('src/features/simulation/'),
        );

      assert.ok(
        forbiddenImports.length === 0,
        `simulation.worker.ts must not import UI feature modules: ${forbiddenImports.join(', ')}`,
      );
    },
  },
  {
    name: 'architecture: logic layer stays independent from React and features',
    run: () => {
      const violations = listSourceFiles(LOGIC_DIR).flatMap((filePath) => {
        const source = fs.readFileSync(filePath, 'utf8');
        return collectImportSpecifiers(source)
          .map((specifier) => {
            const resolvedPath = resolveRelativeImport(filePath, specifier);
            const isReactImport = specifier === 'react' || specifier.startsWith('react/');
            const isFeatureImport = Boolean(resolvedPath?.startsWith('src/features/'));
            return isReactImport || isFeatureImport
              ? `${toRepoPath(filePath)} -> ${specifier}`
              : null;
          })
          .filter((violation): violation is string => Boolean(violation));
      });

      assert.ok(
        violations.length === 0,
        `src/logic must not import React or feature modules: ${violations.join(', ')}`,
      );
    },
  },
];

export const architectureTestModule: TestModule = {
  id: 'architecture',
  cases: tests,
};
