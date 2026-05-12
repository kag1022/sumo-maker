#!/usr/bin/env npx tsx
/**
 * NPC / player の休場パターンを、現行 runtime の保存 row と torikumi diagnostics から集計する診断。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { Division } from '../../src/logic/models';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';

const args = process.argv.slice(2);

const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};

const argStr = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  if (i < 0 || i + 1 >= args.length) return def;
  const values: string[] = [];
  for (let idx = i + 1; idx < args.length; idx += 1) {
    if (args[idx].startsWith('--')) break;
    values.push(args[idx]);
  }
  return values.length > 0 ? values.join(',') : def;
};

const BASHO = argInt('--basho', 120);
const SEEDS = argStr('--seeds', argStr('--seed', '20260420'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr('--worlds', 'legacy,balanced_era,era1993,era2025');

type CauseCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

interface KyujoMetrics {
  bashoCount: number;
  npcSekitoriAppearances: number;
  npcLowerDivisionAppearances: number;
  npcSekitoriFullAttendanceCount: number;
  npcSekitoriPartialKyujoCount: number;
  npcSekitoriFullKyujoCount: number;
  npcSekitoriNearFullKyujoCount: number;
  npcLowerFullAttendanceCount: number;
  npcLowerPartialKyujoCount: number;
  npcLowerFullKyujoCount: number;
  npcLowerNearFullKyujoCount: number;
  playerAppearances: number;
  npcFullAttendanceCount: number;
  npcPartialKyujoCount: number;
  npcFullKyujoCount: number;
  npcNearFullKyujoCount: number;
  npcMidBashoKyujoCount: number;
  playerFullAttendanceCount: number;
  playerPartialKyujoCount: number;
  playerFullKyujoCount: number;
  playerNearFullKyujoCount: number;
  playerMidBashoKyujoCount: number;
  injuryEventCount: number;
  playerInjuryEventCount: number;
  npcFusenBoutRows: number;
  playerFusenWinsFromNpcKyujo: number;
  playerFusenLossesOrAbsences: number;
  npcAbsent1To3: number;
  npcAbsent4To7: number;
  npcAbsent8To14: number;
  npcAbsent15: number;
  playerAbsent1To3: number;
  playerAbsent4To7: number;
  playerAbsent8To14: number;
  playerAbsent15: number;
}

interface WorldSummary {
  worldLabel: string;
  seed: number;
  eraSnapshotId: string | null;
  eraTags: string[];
  metrics: KyujoMetrics;
  cause: CauseCode;
}

const zeroMetrics = (): KyujoMetrics => ({
  bashoCount: 0,
  npcSekitoriAppearances: 0,
  npcLowerDivisionAppearances: 0,
  npcSekitoriFullAttendanceCount: 0,
  npcSekitoriPartialKyujoCount: 0,
  npcSekitoriFullKyujoCount: 0,
  npcSekitoriNearFullKyujoCount: 0,
  npcLowerFullAttendanceCount: 0,
  npcLowerPartialKyujoCount: 0,
  npcLowerFullKyujoCount: 0,
  npcLowerNearFullKyujoCount: 0,
  playerAppearances: 0,
  npcFullAttendanceCount: 0,
  npcPartialKyujoCount: 0,
  npcFullKyujoCount: 0,
  npcNearFullKyujoCount: 0,
  npcMidBashoKyujoCount: 0,
  playerFullAttendanceCount: 0,
  playerPartialKyujoCount: 0,
  playerFullKyujoCount: 0,
  playerNearFullKyujoCount: 0,
  playerMidBashoKyujoCount: 0,
  injuryEventCount: 0,
  playerInjuryEventCount: 0,
  npcFusenBoutRows: 0,
  playerFusenWinsFromNpcKyujo: 0,
  playerFusenLossesOrAbsences: 0,
  npcAbsent1To3: 0,
  npcAbsent4To7: 0,
  npcAbsent8To14: 0,
  npcAbsent15: 0,
  playerAbsent1To3: 0,
  playerAbsent4To7: 0,
  playerAbsent8To14: 0,
  playerAbsent15: 0,
});

const scheduledBouts = (division: Division): number =>
  division === 'Makuuchi' || division === 'Juryo' ? 15 :
    division === 'Maezumo' ? 3 : 7;

const isSekitori = (division: Division): boolean =>
  division === 'Makuuchi' || division === 'Juryo';

const addAbsentBucket = (
  metrics: KyujoMetrics,
  prefix: 'npc' | 'player',
  absent: number,
): void => {
  if (absent >= 15) {
    metrics[`${prefix}Absent15` as keyof KyujoMetrics] += 1;
  } else if (absent >= 8) {
    metrics[`${prefix}Absent8To14` as keyof KyujoMetrics] += 1;
  } else if (absent >= 4) {
    metrics[`${prefix}Absent4To7` as keyof KyujoMetrics] += 1;
  } else if (absent >= 1) {
    metrics[`${prefix}Absent1To3` as keyof KyujoMetrics] += 1;
  }
};

const addAppearance = (
  metrics: KyujoMetrics,
  prefix: 'npc' | 'player',
  division: Division,
  absent: number,
): void => {
  const bouts = scheduledBouts(division);
  if (prefix === 'npc') {
    const category = isSekitori(division) ? 'Sekitori' : 'Lower';
    if (category === 'Sekitori') metrics.npcSekitoriAppearances += 1;
    else metrics.npcLowerDivisionAppearances += 1;
    if (absent <= 0) {
      metrics[`npc${category}FullAttendanceCount` as keyof KyujoMetrics] += 1;
    } else if (absent >= bouts) {
      metrics[`npc${category}FullKyujoCount` as keyof KyujoMetrics] += 1;
    } else {
      metrics[`npc${category}PartialKyujoCount` as keyof KyujoMetrics] += 1;
      if (absent >= Math.max(1, bouts - 1)) {
        metrics[`npc${category}NearFullKyujoCount` as keyof KyujoMetrics] += 1;
      }
    }
  } else {
    metrics.playerAppearances += 1;
  }

  addAbsentBucket(metrics, prefix, absent);

  if (absent <= 0) {
    metrics[`${prefix}FullAttendanceCount` as keyof KyujoMetrics] += 1;
  } else if (absent >= bouts) {
    metrics[`${prefix}FullKyujoCount` as keyof KyujoMetrics] += 1;
  } else {
    metrics[`${prefix}PartialKyujoCount` as keyof KyujoMetrics] += 1;
    metrics[`${prefix}MidBashoKyujoCount` as keyof KyujoMetrics] += 1;
    if (absent >= Math.max(1, bouts - 1)) {
      metrics[`${prefix}NearFullKyujoCount` as keyof KyujoMetrics] += 1;
    }
  }
};

const classifyCause = (metrics: KyujoMetrics): CauseCode => {
  if (metrics.npcSekitoriPartialKyujoCount === 0 && metrics.npcSekitoriFullKyujoCount > 0) return 'B';
  if (metrics.npcSekitoriPartialKyujoCount === 0 && metrics.npcSekitoriFullKyujoCount === 0) return 'A';
  if (metrics.npcFusenBoutRows > 0 && metrics.npcSekitoriPartialKyujoCount === 0) return 'D';
  if (metrics.playerPartialKyujoCount === 0 && metrics.playerInjuryEventCount > 0) return 'E';
  return 'G';
};

const findEraSnapshot = (key: string, usedIds = new Set<string>()): EraSnapshot | undefined => {
  const snapshots = listEraSnapshots();
  const aliases: Record<string, string> = {
    era1965: 'era-1965',
    era1985: 'era-1985',
    era1993: 'era-1993',
    era2005: 'era-2005',
    era2025: 'era-2025',
  };
  const directPrefix = aliases[key] ?? (/^era\d{4}$/.test(key) ? `era-${key.slice(3)}` : undefined);
  if (directPrefix) return snapshots.find((snapshot) => snapshot.id.startsWith(directPrefix));
  if (key.startsWith('era-')) return snapshots.find((snapshot) => snapshot.id === key);
  return snapshots.find(
    (snapshot) => snapshot.eraTags.includes(key as EraTag) && !usedIds.has(snapshot.id),
  );
};

const buildWorldSpecs = (): Array<{ key: string; snapshot?: EraSnapshot }> => {
  const usedIds = new Set<string>();
  return WORLDS_ARG.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((key) => {
      if (key === 'legacy') return { key };
      const snapshot = findEraSnapshot(key, usedIds);
      if (snapshot) usedIds.add(snapshot.id);
      return { key, snapshot };
    });
};

const runWorld = async (
  seed: number,
  spec: { key: string; snapshot?: EraSnapshot },
): Promise<WorldSummary | null> => {
  if (spec.key !== 'legacy' && !spec.snapshot) {
    console.warn(`Unknown world key: ${spec.key}`);
    return null;
  }

  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const worldLabel = spec.key === 'legacy'
    ? 'legacy (undefined)'
    : `era:${spec.snapshot?.publicEraLabel} (${spec.snapshot?.id})`;
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `kyujo-pattern-reality-${spec.key}-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
      __dev_ironmanPlayer: true,
      runOptions: spec.snapshot
        ? {
          eraSnapshotId: spec.snapshot.id,
          eraTags: spec.snapshot.eraTags,
          publicEraLabel: spec.snapshot.publicEraLabel,
        }
        : undefined,
    },
    {
      random: createSeededRandom(seed + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  const metrics = zeroMetrics();

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    metrics.bashoCount += 1;

    addAppearance(metrics, 'player', step.playerRecord.rank.division, step.playerRecord.absent);
    metrics.injuryEventCount += step.events.filter((event) => event.type === 'INJURY').length;
    metrics.playerInjuryEventCount += step.events.filter((event) =>
      event.type === 'INJURY' && event.description.includes('怪我')).length;
    metrics.playerFusenWinsFromNpcKyujo += step.playerBouts.filter((bout) => bout.kimarite === '不戦勝').length;
    metrics.playerFusenLossesOrAbsences += step.playerBouts.filter((bout) =>
      bout.kimarite === '不戦敗' || bout.result === 'ABSENT').length;

    for (const record of step.npcBashoRecords) {
      addAppearance(metrics, 'npc', record.division, record.absent);
    }

    metrics.npcFusenBoutRows +=
      step.diagnostics?.npcTopDivisionBoutRows?.filter((row) => row.fusen).length ?? 0;
  }

  return {
    worldLabel,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    metrics,
    cause: classifyCause(metrics),
  };
};

const writeOutputs = (summaries: WorldSummary[]): void => {
  const docsDir = path.resolve('docs/design');
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, 'kyujo_pattern_reality_diagnostics.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    basho: BASHO,
    seeds: SEEDS,
    summaries,
  }, null, 2));

  const total = summaries.reduce((acc, summary) => {
    for (const [key, value] of Object.entries(summary.metrics)) {
      acc[key] = (acc[key] ?? 0) + value;
    }
    return acc;
  }, zeroMetrics());
  const playerNpcPartialRatio =
    total.npcSekitoriPartialKyujoCount > 0
      ? total.playerPartialKyujoCount / total.npcSekitoriPartialKyujoCount
      : null;

  const md: string[] = [];
  md.push('# Kyujo pattern reality diagnostics');
  md.push('');
  md.push(`Generated by \`scripts/dev/diagnoseKyujoPatternReality.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push('| world | seed | basho | NPC sekitori | NPC sekitori partial | NPC sekitori full | NPC lower | NPC lower partial | NPC lower full | Player app | Player partial | Player full | injury events | NPC fusen rows | cause |');
  md.push('| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| --- |');
  for (const summary of summaries) {
    const m = summary.metrics;
    md.push(`| ${summary.worldLabel} | ${summary.seed} | ${m.bashoCount} | ${m.npcSekitoriAppearances} | ${m.npcSekitoriPartialKyujoCount} | ${m.npcSekitoriFullKyujoCount} | ${m.npcLowerDivisionAppearances} | ${m.npcLowerPartialKyujoCount} | ${m.npcLowerFullKyujoCount} | ${m.playerAppearances} | ${m.playerPartialKyujoCount} | ${m.playerFullKyujoCount} | ${m.injuryEventCount} | ${m.npcFusenBoutRows} | ${summary.cause} |`);
  }
  md.push('');
  md.push('## Total KPI');
  md.push('');
  for (const [key, value] of Object.entries(total)) {
    md.push(`- ${key}: ${value}`);
  }
  md.push(`- playerNpcPartialRatio: ${playerNpcPartialRatio == null ? 'N/A' : playerNpcPartialRatio.toFixed(4)}`);
  md.push('');
  md.push('## Cause Classification');
  md.push('');
  md.push('- A: NPC には途中休場イベントも全休イベントも観測されない。');
  md.push('- B: NPC injuries は場所前全休にしかならず、partial kyujo が観測されない。');
  md.push('- C: torikumi が一括生成で、日別休場を roster 全体へ反映できない構造。');
  md.push('- D: player 由来または事前全休だけが不戦として反映されている。');
  md.push('- E: player injury probability / severity が低く、途中休場がほぼ出ない。');
  md.push('- F: injury severity variation が少ない。');
  md.push('- G: 診断上は partial / full kyujo が観測される。');
  md.push('');
  md.push('## Reading');
  md.push('');
  md.push('- 現行 `TorikumiParticipant` には `bashoKyujo` と `active/kyujo` はあるが、NPC の day-indexed kyujo schedule はない。');
  md.push('- `npcSekitoriPartialKyujoCount` が 0 で `npcSekitoriFullKyujoCount` だけ増える場合、今回は day-by-day torikumi / kyujo 対応へ分けるべき構造問題。');
  fs.writeFileSync(path.join(docsDir, 'kyujo_pattern_reality_diagnostics.md'), `${md.join('\n')}\n`);
};

const main = async (): Promise<void> => {
  const specs = buildWorldSpecs();
  const summaries: WorldSummary[] = [];
  for (const seed of SEEDS) {
    for (const spec of specs) {
      const summary = await runWorld(seed, spec);
      if (summary) summaries.push(summary);
    }
  }
  writeOutputs(summaries);
  const total = summaries.reduce((acc, summary) => {
    for (const [key, value] of Object.entries(summary.metrics)) acc[key] = (acc[key] ?? 0) + value;
    return acc;
  }, zeroMetrics());
  console.log(`Kyujo pattern reality diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  console.log(JSON.stringify(total, null, 2));
  console.log('Wrote docs/design/kyujo_pattern_reality_diagnostics.{json,md}');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
