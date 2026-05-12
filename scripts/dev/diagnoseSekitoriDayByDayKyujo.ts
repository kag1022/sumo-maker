#!/usr/bin/env npx tsx
/**
 * 関取 NPC の日別休場 contract を、場所別成績と torikumi trace から診断する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
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

type RankGroup = 'yokozuna' | 'ozeki' | 'makuuchi' | 'juryo';

interface Metrics {
  bashoCount: number;
  npcSekitoriAppearances: number;
  npcSekitoriFullAttendanceCount: number;
  npcSekitoriPartialKyujoCount: number;
  npcSekitoriFullKyujoCount: number;
  playerAppearances: number;
  playerPartialKyujoCount: number;
  playerFullKyujoCount: number;
  absentDaysDistribution: Record<string, number>;
  kyujoStartDayDistribution: Record<string, number>;
  fusenWinCount: number;
  fusenLossCount: number;
  npcFusenRows: number;
  playerFusenRows: number;
  yokozunaPartialKyujoCount: number;
  ozekiPartialKyujoCount: number;
  makuuchiPartialKyujoCount: number;
  juryoPartialKyujoCount: number;
  partialKyujoAfterInjuryEventCount: number;
  scheduledBoutBecameFusenCount: number;
  dayEligibilityViolations: number;
  participantWithBoutAfterKyujoStartDayCount: number;
  recordTotalConsistencyViolations: number;
}

interface WorldSummary {
  worldLabel: string;
  seed: number;
  eraSnapshotId: string | null;
  eraTags: string[];
  metrics: Metrics;
}

const zeroMetrics = (): Metrics => ({
  bashoCount: 0,
  npcSekitoriAppearances: 0,
  npcSekitoriFullAttendanceCount: 0,
  npcSekitoriPartialKyujoCount: 0,
  npcSekitoriFullKyujoCount: 0,
  playerAppearances: 0,
  playerPartialKyujoCount: 0,
  playerFullKyujoCount: 0,
  absentDaysDistribution: {},
  kyujoStartDayDistribution: {},
  fusenWinCount: 0,
  fusenLossCount: 0,
  npcFusenRows: 0,
  playerFusenRows: 0,
  yokozunaPartialKyujoCount: 0,
  ozekiPartialKyujoCount: 0,
  makuuchiPartialKyujoCount: 0,
  juryoPartialKyujoCount: 0,
  partialKyujoAfterInjuryEventCount: 0,
  scheduledBoutBecameFusenCount: 0,
  dayEligibilityViolations: 0,
  participantWithBoutAfterKyujoStartDayCount: 0,
  recordTotalConsistencyViolations: 0,
});

const increment = (bucket: Record<string, number>, key: string): void => {
  bucket[key] = (bucket[key] ?? 0) + 1;
};

const rankGroup = (division: string, rankName?: string): RankGroup => {
  if (rankName === '横綱') return 'yokozuna';
  if (rankName === '大関') return 'ozeki';
  if (division === 'Makuuchi') return 'makuuchi';
  return 'juryo';
};

const addPartialRankGroup = (metrics: Metrics, group: RankGroup): void => {
  if (group === 'yokozuna') metrics.yokozunaPartialKyujoCount += 1;
  else if (group === 'ozeki') metrics.ozekiPartialKyujoCount += 1;
  else if (group === 'makuuchi') metrics.makuuchiPartialKyujoCount += 1;
  else metrics.juryoPartialKyujoCount += 1;
};

const addSekitoriRecord = (
  metrics: Metrics,
  record: {
    division: string;
    rankName?: string;
    wins: number;
    losses: number;
    absent: number;
  },
  actor: 'npc' | 'player',
): void => {
  const total = record.wins + record.losses + record.absent;
  if (total !== 15) metrics.recordTotalConsistencyViolations += 1;
  increment(metrics.absentDaysDistribution, String(record.absent));

  if (actor === 'player') {
    metrics.playerAppearances += 1;
    if (record.absent >= 15) metrics.playerFullKyujoCount += 1;
    else if (record.absent > 0) metrics.playerPartialKyujoCount += 1;
    return;
  }

  metrics.npcSekitoriAppearances += 1;
  if (record.absent <= 0) {
    metrics.npcSekitoriFullAttendanceCount += 1;
    return;
  }
  if (record.absent >= 15) {
    metrics.npcSekitoriFullKyujoCount += 1;
    return;
  }

  metrics.npcSekitoriPartialKyujoCount += 1;
  const startDay = 16 - record.absent;
  increment(metrics.kyujoStartDayDistribution, String(startDay));
  addPartialRankGroup(metrics, rankGroup(record.division, record.rankName));
};

const scheduledBouts = (division: string): number =>
  division === 'Makuuchi' || division === 'Juryo' ? 15 :
    division === 'Maezumo' ? 3 : 7;

const addPlayerRecord = (
  metrics: Metrics,
  record: {
    division: string;
    absent: number;
  },
): void => {
  metrics.playerAppearances += 1;
  const bouts = scheduledBouts(record.division);
  if (record.absent >= bouts) metrics.playerFullKyujoCount += 1;
  else if (record.absent > 0) metrics.playerPartialKyujoCount += 1;
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
      careerId: `sekitori-day-by-day-kyujo-${spec.key}-${seed}`,
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

    addPlayerRecord(metrics, {
      division: step.playerRecord.rank.division,
      absent: step.playerRecord.absent,
    });
    if (
      (step.playerRecord.rank.division === 'Makuuchi' || step.playerRecord.rank.division === 'Juryo') &&
      step.playerRecord.wins + step.playerRecord.losses + step.playerRecord.absent !== 15
    ) {
      metrics.recordTotalConsistencyViolations += 1;
    }

    const hasInjuryEvent = step.events.some((event) => event.type === 'INJURY');
    if (hasInjuryEvent && step.playerRecord.absent > 0 && step.playerRecord.absent < 15) {
      metrics.partialKyujoAfterInjuryEventCount += 1;
    }

    metrics.playerFusenRows += step.playerBouts.filter((bout) =>
      bout.kimarite === '不戦勝' || bout.kimarite === '不戦敗').length;
    metrics.fusenWinCount += step.playerBouts.filter((bout) => bout.kimarite === '不戦勝').length;
    metrics.fusenLossCount += step.playerBouts.filter((bout) => bout.kimarite === '不戦敗').length;

    for (const record of step.npcBashoRecords) {
      if (record.division !== 'Makuuchi' && record.division !== 'Juryo') continue;
      addSekitoriRecord(metrics, {
        division: record.division,
        rankName: record.rankName,
        wins: record.wins,
        losses: record.losses,
        absent: record.absent,
      }, 'npc');
    }

    const rows = step.diagnostics?.npcTopDivisionBoutRows ?? [];
    metrics.npcFusenRows += rows.filter((row) => row.fusen).length;
    metrics.scheduledBoutBecameFusenCount += rows.filter((row) => row.fusen).length;
    metrics.dayEligibilityViolations += rows.filter((row) => row.scheduledAfterKyujoStart).length;
    metrics.participantWithBoutAfterKyujoStartDayCount += rows.filter((row) =>
      row.scheduledAfterKyujoStart).length;
  }

  return {
    worldLabel,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    metrics,
  };
};

const mergeMetrics = (summaries: WorldSummary[]): Metrics => {
  const total = zeroMetrics();
  for (const summary of summaries) {
    const metrics = summary.metrics;
    total.bashoCount += metrics.bashoCount;
    total.npcSekitoriAppearances += metrics.npcSekitoriAppearances;
    total.npcSekitoriFullAttendanceCount += metrics.npcSekitoriFullAttendanceCount;
    total.npcSekitoriPartialKyujoCount += metrics.npcSekitoriPartialKyujoCount;
    total.npcSekitoriFullKyujoCount += metrics.npcSekitoriFullKyujoCount;
    total.playerAppearances += metrics.playerAppearances;
    total.playerPartialKyujoCount += metrics.playerPartialKyujoCount;
    total.playerFullKyujoCount += metrics.playerFullKyujoCount;
    total.fusenWinCount += metrics.fusenWinCount;
    total.fusenLossCount += metrics.fusenLossCount;
    total.npcFusenRows += metrics.npcFusenRows;
    total.playerFusenRows += metrics.playerFusenRows;
    total.yokozunaPartialKyujoCount += metrics.yokozunaPartialKyujoCount;
    total.ozekiPartialKyujoCount += metrics.ozekiPartialKyujoCount;
    total.makuuchiPartialKyujoCount += metrics.makuuchiPartialKyujoCount;
    total.juryoPartialKyujoCount += metrics.juryoPartialKyujoCount;
    total.partialKyujoAfterInjuryEventCount += metrics.partialKyujoAfterInjuryEventCount;
    total.scheduledBoutBecameFusenCount += metrics.scheduledBoutBecameFusenCount;
    total.dayEligibilityViolations += metrics.dayEligibilityViolations;
    total.participantWithBoutAfterKyujoStartDayCount += metrics.participantWithBoutAfterKyujoStartDayCount;
    total.recordTotalConsistencyViolations += metrics.recordTotalConsistencyViolations;
    for (const [bucket, count] of Object.entries(metrics.absentDaysDistribution)) {
      total.absentDaysDistribution[bucket] = (total.absentDaysDistribution[bucket] ?? 0) + count;
    }
    for (const [bucket, count] of Object.entries(metrics.kyujoStartDayDistribution)) {
      total.kyujoStartDayDistribution[bucket] = (total.kyujoStartDayDistribution[bucket] ?? 0) + count;
    }
  }
  return total;
};

const writeOutputs = (summaries: WorldSummary[]): void => {
  const docsDir = path.resolve('docs/design');
  fs.mkdirSync(docsDir, { recursive: true });
  const total = mergeMetrics(summaries);
  fs.writeFileSync(path.join(docsDir, 'sekitori_day_by_day_kyujo_diagnostics.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    basho: BASHO,
    seeds: SEEDS,
    summaries,
    total,
  }, null, 2));

  const md: string[] = [];
  md.push('# Sekitori day-by-day kyujo diagnostics');
  md.push('');
  md.push(`Generated by \`scripts/dev/diagnoseSekitoriDayByDayKyujo.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push('| world | seed | basho | NPC sekitori | NPC partial | NPC full | Player partial | Player full | NPC fusen rows | eligibility violations | total violations |');
  md.push('| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|');
  for (const summary of summaries) {
    const m = summary.metrics;
    md.push(`| ${summary.worldLabel} | ${summary.seed} | ${m.bashoCount} | ${m.npcSekitoriAppearances} | ${m.npcSekitoriPartialKyujoCount} | ${m.npcSekitoriFullKyujoCount} | ${m.playerPartialKyujoCount} | ${m.playerFullKyujoCount} | ${m.npcFusenRows} | ${m.dayEligibilityViolations} | ${m.recordTotalConsistencyViolations} |`);
  }
  md.push('');
  md.push('## Total KPI');
  md.push('');
  for (const [key, value] of Object.entries(total)) {
    md.push(`- ${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }
  md.push('');
  md.push('## Reading');
  md.push('');
  md.push('- `npcSekitoriPartialKyujoCount` は `0 < absent < 15` の関取 NPC 場所を数える。');
  md.push('- `kyujoStartDayDistribution` は `16 - absent` から推定する。現行 MVP は日別再編成なので、途中休場後の通常取組は組まれない。');
  md.push('- `npcFusenRows` は既存の全休・active false 由来の不戦 trace。途中休場 MVP は事前 eligibility 除外のため、partial 由来の不戦は増やさない。');
  md.push('- `recordTotalConsistencyViolations` は関取の `wins + losses + absent !== 15`。ここが 0 であることを hard gate とする。');
  fs.writeFileSync(path.join(docsDir, 'sekitori_day_by_day_kyujo_diagnostics.md'), `${md.join('\n')}\n`);
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
  const total = mergeMetrics(summaries);
  console.log(`Sekitori day-by-day kyujo diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  console.log(JSON.stringify(total, null, 2));
  console.log('Wrote docs/design/sekitori_day_by_day_kyujo_diagnostics.{json,md}');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
