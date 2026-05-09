#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';
import type { EraSnapshot } from '../../src/logic/era/types';

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, 'src', 'logic', 'era', 'data', 'era_snapshots_196007_202603.json');
const SOURCE_ENTRY_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'era_banzuke_entries_196007_202603.json');
const DESIGN_DIR = path.join(ROOT, 'docs', 'design');

interface SourceNameEntry {
  shikonaEn?: string;
}

interface Finding {
  path: string;
  reason: string;
  value?: string;
}

const FORBIDDEN_FIELD_PATTERNS = [
  /rikishi/i,
  /shikona/i,
  /realName/i,
  /person/i,
  /opponent/i,
  /mapping/i,
];

const ALLOWED_SOURCE_WORDS = new Set([
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Yokozuna',
  'Ozeki',
  'Sekiwake',
  'Komusubi',
  'Maegashira',
]);

const ALLOWED_FIELD_PATHS = new Set([
  '$[].id',
  '$[].sourceBashoKey',
  '$[].sourceLabelInternal',
  '$[].publicEraLabel',
  '$[].eraTags',
  '$[].anonymity.oneToOnePersonMapping',
  '$[].anonymity.usesRealNames',
  '$[].anonymity.usesRealShikona',
]);

const normalizePath = (pathValue: string): string =>
  pathValue.replace(/\[\d+\]/g, '[]');

const collectFieldFindings = (value: unknown, pathValue: string, findings: Finding[]): void => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectFieldFindings(item, `${pathValue}[${index}]`, findings));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${pathValue}.${key}`;
    const normalized = normalizePath(childPath);
    if (!ALLOWED_FIELD_PATHS.has(normalized) && FORBIDDEN_FIELD_PATTERNS.some((pattern) => pattern.test(key))) {
      findings.push({ path: childPath, reason: 'forbidden identifying field name' });
    }
    collectFieldFindings(child, childPath, findings);
  }
};

const main = (): void => {
  const snapshots = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as EraSnapshot[];
  const snapshotText = fs.readFileSync(SNAPSHOT_PATH, 'utf-8');
  const sourceEntries = fs.existsSync(SOURCE_ENTRY_PATH)
    ? JSON.parse(fs.readFileSync(SOURCE_ENTRY_PATH, 'utf-8')) as SourceNameEntry[]
    : [];
  const sourceNames = new Set(
    sourceEntries
      .map((entry) => entry.shikonaEn?.trim())
      .filter((value): value is string => Boolean(
        value &&
        value.length >= 4 &&
        !ALLOWED_SOURCE_WORDS.has(value),
      )),
  );

  const findings: Finding[] = [];
  collectFieldFindings(snapshots, '$', findings);

  snapshots.forEach((snapshot, index) => {
    if (snapshot.anonymity.usesRealNames !== false) {
      findings.push({ path: `$[${index}].anonymity.usesRealNames`, reason: 'must be false' });
    }
    if (snapshot.anonymity.usesRealShikona !== false) {
      findings.push({ path: `$[${index}].anonymity.usesRealShikona`, reason: 'must be false' });
    }
    if (snapshot.anonymity.oneToOnePersonMapping !== false) {
      findings.push({ path: `$[${index}].anonymity.oneToOnePersonMapping`, reason: 'must be false' });
    }
  });

  const leakedNames: string[] = [];
  for (const name of sourceNames) {
    if (snapshotText.includes(name)) {
      leakedNames.push(name);
      if (leakedNames.length >= 20) break;
    }
  }
  for (const name of leakedNames) {
    findings.push({ path: '$', reason: 'source shikona string appears in snapshot JSON', value: name });
  }

  const result = {
    generatedAt: new Date().toISOString(),
    snapshotCount: snapshots.length,
    sourceNameSampleSize: sourceNames.size,
    ok: findings.length === 0,
    findings,
  };

  fs.mkdirSync(DESIGN_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DESIGN_DIR, 'era_snapshot_anonymity_validation.json'),
    `${JSON.stringify(result, null, 2)}\n`,
    'utf-8',
  );
  const md = [
    '# EraSnapshot Anonymity Validation',
    '',
    `Generated: ${result.generatedAt}`,
    '',
    `- snapshots checked: ${result.snapshotCount}`,
    `- source shikona strings checked: ${result.sourceNameSampleSize}`,
    `- result: ${result.ok ? 'PASS' : 'FAIL'}`,
    '',
    '## Checks',
    '',
    '- no `rikishi*`, `shikona*`, `opponent*`, real-person, or mapping fields outside the explicit anonymity flags',
    '- `usesRealNames`, `usesRealShikona`, and `oneToOnePersonMapping` are all `false`',
    '- source shikona strings from the intermediate file do not appear in the bundled snapshot JSON',
    '',
    result.findings.length === 0
      ? 'No findings.'
      : result.findings.map((finding) => `- ${finding.path}: ${finding.reason}${finding.value ? ` (${finding.value})` : ''}`).join('\n'),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(DESIGN_DIR, 'era_snapshot_anonymity_validation.md'), md, 'utf-8');
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
};

main();
