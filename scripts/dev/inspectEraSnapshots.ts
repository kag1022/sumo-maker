#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';

const ROOT = process.cwd();
const SNAPSHOT_PATH = path.join(ROOT, 'src', 'logic', 'era', 'data', 'era_snapshots_196007_202603.json');
const DESIGN_DIR = path.join(ROOT, 'docs', 'design');

const readSnapshots = (): EraSnapshot[] =>
  JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8')) as EraSnapshot[];

const round = (value: number, digits = 3): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const summarizeNumeric = (values: number[]): { min: number; max: number; mean: number } => {
  if (values.length === 0) return { min: 0, max: 0, mean: 0 };
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    mean: round(values.reduce((sum, value) => sum + value, 0) / values.length),
  };
};

const main = (): void => {
  const snapshots = readSnapshots();
  const sizeBytes = fs.statSync(SNAPSHOT_PATH).size;
  const tagCounts = new Map<EraTag, number>();
  for (const snapshot of snapshots) {
    for (const tag of snapshot.eraTags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const headcounts = {
    makuuchi: summarizeNumeric(snapshots.map((snapshot) => snapshot.divisionHeadcounts.Makuuchi ?? 0)),
    juryo: summarizeNumeric(snapshots.map((snapshot) => snapshot.divisionHeadcounts.Juryo ?? 0)),
    makushita: summarizeNumeric(snapshots.map((snapshot) => snapshot.divisionHeadcounts.Makushita ?? 0)),
  };
  const topRank = {
    yokozuna: summarizeNumeric(snapshots.map((snapshot) => snapshot.topRankStructure.yokozunaCount)),
    ozeki: summarizeNumeric(snapshots.map((snapshot) => snapshot.topRankStructure.ozekiCount)),
    sanyaku: summarizeNumeric(snapshots.map((snapshot) =>
      snapshot.topRankStructure.sekiwakeCount + snapshot.topRankStructure.komusubiCount)),
  };
  const boundary = {
    sekitoriBoundaryPressure: summarizeNumeric(snapshots.map((snapshot) => snapshot.boundaryProfile.sekitoriBoundaryPressure)),
    crossDivisionBoutIntensity: summarizeNumeric(snapshots.map((snapshot) => snapshot.boundaryProfile.crossDivisionBoutIntensity)),
  };
  const qualityCounts = snapshots.reduce<Record<string, number>>((acc, snapshot) => {
    const key = snapshot.sourceCompleteness?.status ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const output = {
    generatedAt: new Date().toISOString(),
    snapshotCount: snapshots.length,
    sizeBytes,
    qualityCounts,
    tagCounts: Object.fromEntries([...tagCounts.entries()].sort(([left], [right]) => left.localeCompare(right))),
    headcounts,
    topRank,
    boundary,
  };

  fs.mkdirSync(DESIGN_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DESIGN_DIR, 'era_snapshot_inspection.json'),
    `${JSON.stringify(output, null, 2)}\n`,
    'utf-8',
  );

  const md = [
    '# EraSnapshot Inspection',
    '',
    `Generated: ${output.generatedAt}`,
    '',
    `- snapshot count: ${output.snapshotCount}`,
    `- JSON size: ${output.sizeBytes} bytes`,
    `- source quality: ${Object.entries(qualityCounts).map(([key, value]) => `${key}=${value}`).join(', ')}`,
    '',
    '## Era Tags',
    '',
    '| tag | count |',
    '|---|---:|',
    ...Object.entries(output.tagCounts).map(([tag, count]) => `| ${tag} | ${count} |`),
    '',
    '## Headcounts',
    '',
    '| division | min | mean | max |',
    '|---|---:|---:|---:|',
    `| Makuuchi | ${headcounts.makuuchi.min} | ${headcounts.makuuchi.mean} | ${headcounts.makuuchi.max} |`,
    `| Juryo | ${headcounts.juryo.min} | ${headcounts.juryo.mean} | ${headcounts.juryo.max} |`,
    `| Makushita | ${headcounts.makushita.min} | ${headcounts.makushita.mean} | ${headcounts.makushita.max} |`,
    '',
    '## Top Rank',
    '',
    '| rank group | min | mean | max |',
    '|---|---:|---:|---:|',
    `| Yokozuna | ${topRank.yokozuna.min} | ${topRank.yokozuna.mean} | ${topRank.yokozuna.max} |`,
    `| Ozeki | ${topRank.ozeki.min} | ${topRank.ozeki.mean} | ${topRank.ozeki.max} |`,
    `| Sanyaku | ${topRank.sanyaku.min} | ${topRank.sanyaku.mean} | ${topRank.sanyaku.max} |`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(DESIGN_DIR, 'era_snapshot_inspection.md'), md, 'utf-8');
  console.log(JSON.stringify(output, null, 2));
};

main();
