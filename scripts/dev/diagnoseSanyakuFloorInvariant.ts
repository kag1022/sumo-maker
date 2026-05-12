#!/usr/bin/env npx tsx
/**
 * 関脇・小結 minimum invariant を allocation -> roster apply -> 次場所 label の境界で追跡する診断。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import {
  buildMakuuchiLayoutFromRanks,
  decodeMakuuchiRankFromScore,
  MakuuchiLayout,
} from '../../src/logic/banzuke/scale/banzukeLayout';
import type { BanzukeAllocation } from '../../src/logic/banzuke/providers/sekitori/types';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { Rank } from '../../src/logic/models';
import { PLAYER_ACTOR_ID } from '../../src/logic/simulation/actors/constants';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';
import { resolvePlayerRankScore } from '../../src/logic/simulation/world/shared';

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

const BASHO = argInt('--basho', 72);
const SEEDS = argStr('--seeds', argStr('--seed', '20260420'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

type TopRankName = '横綱' | '大関' | '関脇' | '小結';
type CauseCode = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';

interface RankCounts {
  yokozuna: number;
  ozeki: number;
  sekiwake: number;
  komusubi: number;
  sanyakuTotal: number;
}

interface SanyakuFloorTrace {
  worldLabel: string;
  seed: number;
  basho: number;
  allocation: RankCounts;
  predictedRoster: RankCounts;
  rosterAfterApply: RankCounts;
  nextBashoLabel: RankCounts | null;
  allocationToRosterMismatch: boolean;
  rosterToNextLabelMismatch: boolean;
  reasonCode: string;
  cause: CauseCode;
  sampleAllocationRanks: string[];
  sampleRosterRanks: string[];
}

interface WorldSummary {
  worldLabel: string;
  seed: number;
  eraSnapshotId: string | null;
  eraTags: string[];
  metrics: Record<string, number>;
  traces: SanyakuFloorTrace[];
}

type DiagnosticWorld = NonNullable<ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>>;

const TOP_RANK_NAMES = new Set<Rank['name']>(['横綱', '大関', '関脇', '小結']);

const rankLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (rank.division === 'Makuuchi' && TOP_RANK_NAMES.has(rank.name)) {
    const number = rank.number && rank.number > 1 ? String(rank.number) : '';
    return `${side}${rank.name}${number}`;
  }
  return `${side}${rank.name}${rank.number ?? ''}`;
};

const countRanks = (ranks: Rank[]): RankCounts => {
  const counts = ranks.reduce<RankCounts>(
    (acc, rank) => {
      if (rank.division !== 'Makuuchi') return acc;
      if (rank.name === '横綱') acc.yokozuna += 1;
      if (rank.name === '大関') acc.ozeki += 1;
      if (rank.name === '関脇') acc.sekiwake += 1;
      if (rank.name === '小結') acc.komusubi += 1;
      return acc;
    },
    { yokozuna: 0, ozeki: 0, sekiwake: 0, komusubi: 0, sanyakuTotal: 0 },
  );
  counts.sanyakuTotal = counts.yokozuna + counts.ozeki + counts.sekiwake + counts.komusubi;
  return counts;
};

const countLayout = (layout: MakuuchiLayout): RankCounts => ({
  yokozuna: layout.yokozuna,
  ozeki: layout.ozeki,
  sekiwake: layout.sekiwake,
  komusubi: layout.komusubi,
  sanyakuTotal: layout.yokozuna + layout.ozeki + layout.sekiwake + layout.komusubi,
});

const sameCounts = (a: RankCounts, b: RankCounts): boolean =>
  a.yokozuna === b.yokozuna &&
  a.ozeki === b.ozeki &&
  a.sekiwake === b.sekiwake &&
  a.komusubi === b.komusubi;

const hasSanyakuFloorViolation = (counts: RankCounts): boolean =>
  counts.sekiwake < 2 || counts.komusubi < 2;

const resolveTopRankSection = (
  rankName: TopRankName,
  layout: MakuuchiLayout,
): { start: number; count: number } => {
  const yokozunaStart = 1;
  const ozekiStart = yokozunaStart + layout.yokozuna;
  const sekiwakeStart = ozekiStart + layout.ozeki;
  const komusubiStart = sekiwakeStart + layout.sekiwake;
  if (rankName === '横綱') return { start: yokozunaStart, count: layout.yokozuna };
  if (rankName === '大関') return { start: ozekiStart, count: layout.ozeki };
  if (rankName === '関脇') return { start: sekiwakeStart, count: layout.sekiwake };
  return { start: komusubiStart, count: layout.komusubi };
};

const toRankOrderIndex = (rank: Rank): number => {
  const number = Math.max(1, rank.number || 1);
  return (number - 1) * 2 + (rank.side === 'West' ? 1 : 0);
};

const resolveRosterDivisionRankScore = (
  allocation: BanzukeAllocation,
  layout: MakuuchiLayout,
): number => {
  const rank = allocation.nextRank;
  if (rank.division !== 'Makuuchi' || !TOP_RANK_NAMES.has(rank.name)) {
    return resolvePlayerRankScore(rank, layout);
  }
  const section = resolveTopRankSection(rank.name as TopRankName, layout);
  if (section.count <= 0) return resolvePlayerRankScore(rank, layout);
  const indexInSection = Math.max(0, Math.min(section.count - 1, toRankOrderIndex(rank)));
  return section.start + indexInSection;
};

const resolveRosterSortScore = (
  allocation: BanzukeAllocation,
  layout: MakuuchiLayout,
): number => {
  const rankScore = resolveRosterDivisionRankScore(allocation, layout);
  return allocation.nextRank.division === 'Juryo' ? 42 + rankScore : rankScore;
};

const compareAllocationForRoster = (
  a: BanzukeAllocation,
  b: BanzukeAllocation,
  layout: MakuuchiLayout,
): number => {
  const aScore = resolveRosterSortScore(a, layout);
  const bScore = resolveRosterSortScore(b, layout);
  if (aScore !== bScore) return aScore - bScore;
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
};

const predictAppliedMakuuchiRanks = (
  allocations: BanzukeAllocation[],
): Rank[] => {
  const nextLayout = buildMakuuchiLayoutFromRanks(
    allocations
      .map((allocation) => allocation.nextRank)
      .filter((rank) => rank.division === 'Makuuchi'),
  );
  const sorted = allocations
    .filter((allocation) =>
      allocation.nextRank.division === 'Makuuchi' || allocation.nextRank.division === 'Juryo')
    .sort((left, right) => {
      const rankOrder = compareAllocationForRoster(left, right, nextLayout);
      if (rankOrder !== 0) return rankOrder;
      if (left.id === PLAYER_ACTOR_ID) return -1;
      if (right.id === PLAYER_ACTOR_ID) return 1;
      return left.id.localeCompare(right.id);
    });

  return sorted.slice(0, 42).map((_allocation, index) =>
    decodeMakuuchiRankFromScore(index + 1, nextLayout));
};

const resolveRosterRanks = (world: DiagnosticWorld): Rank[] =>
  world.rosters.Makuuchi
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((row) => decodeMakuuchiRankFromScore(row.rankScore, world.makuuchiLayout));

const zeroMetrics = (): Record<string, number> => ({
  bashoCount: 0,
  sekiwakeUnder2Count: 0,
  komusubiUnder2Count: 0,
  sekiwakeZeroCount: 0,
  komusubiZeroCount: 0,
  allocationSekiwakeUnder2Count: 0,
  allocationKomusubiUnder2Count: 0,
  rosterSekiwakeUnder2Count: 0,
  rosterKomusubiUnder2Count: 0,
  nextLabelSekiwakeUnder2Count: 0,
  nextLabelKomusubiUnder2Count: 0,
  allocationToRosterMismatchCount: 0,
  rosterToNextLabelMismatchCount: 0,
});

const classifyCause = (
  allocation: RankCounts,
  predictedRoster: RankCounts,
  rosterAfterApply: RankCounts,
  nextBashoLabel: RankCounts | null,
): CauseCode => {
  if (hasSanyakuFloorViolation(allocation)) return 'A';
  if (hasSanyakuFloorViolation(predictedRoster)) return 'E';
  if (hasSanyakuFloorViolation(rosterAfterApply)) return 'E';
  if (nextBashoLabel && hasSanyakuFloorViolation(nextBashoLabel)) return 'D';
  if (!sameCounts(allocation, predictedRoster)) return 'E';
  if (!sameCounts(predictedRoster, rosterAfterApply)) return 'E';
  if (nextBashoLabel && !sameCounts(rosterAfterApply, nextBashoLabel)) return 'D';
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
      careerId: `sanyaku-floor-invariant-${spec.key}-${seed}`,
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
  const traces: SanyakuFloorTrace[] = [];
  let pendingRosterCounts: RankCounts | null = null;

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const allocationRanks = world.lastAllocations
      .map((allocation) => allocation.nextRank)
      .filter((rank) => rank.division === 'Makuuchi');
    const allocation = countLayout(buildMakuuchiLayoutFromRanks(allocationRanks));
    const predictedRosterRanks = predictAppliedMakuuchiRanks(world.lastAllocations);
    const predictedRoster = countRanks(predictedRosterRanks);
    const rosterRanks = resolveRosterRanks(world);
    const rosterAfterApply = countLayout(world.makuuchiLayout);
    const resultRanks = (world.lastBashoResults.Makuuchi ?? [])
      .map((row) => row.rank)
      .filter((rank): rank is Rank => Boolean(rank));
    const nextBashoLabel = pendingRosterCounts ? countRanks(resultRanks) : null;
    const allocationToRosterMismatch = !sameCounts(allocation, rosterAfterApply);
    const rosterToNextLabelMismatch =
      Boolean(nextBashoLabel && pendingRosterCounts && !sameCounts(pendingRosterCounts, nextBashoLabel));

    metrics.bashoCount += 1;
    if (rosterAfterApply.sekiwake < 2) metrics.sekiwakeUnder2Count += 1;
    if (rosterAfterApply.komusubi < 2) metrics.komusubiUnder2Count += 1;
    if (rosterAfterApply.sekiwake === 0) metrics.sekiwakeZeroCount += 1;
    if (rosterAfterApply.komusubi === 0) metrics.komusubiZeroCount += 1;
    if (allocation.sekiwake < 2) metrics.allocationSekiwakeUnder2Count += 1;
    if (allocation.komusubi < 2) metrics.allocationKomusubiUnder2Count += 1;
    if (predictedRoster.sekiwake < 2) metrics.rosterSekiwakeUnder2Count += 1;
    if (predictedRoster.komusubi < 2) metrics.rosterKomusubiUnder2Count += 1;
    if (nextBashoLabel?.sekiwake != null && nextBashoLabel.sekiwake < 2) metrics.nextLabelSekiwakeUnder2Count += 1;
    if (nextBashoLabel?.komusubi != null && nextBashoLabel.komusubi < 2) metrics.nextLabelKomusubiUnder2Count += 1;
    if (allocationToRosterMismatch) metrics.allocationToRosterMismatchCount += 1;
    if (rosterToNextLabelMismatch) metrics.rosterToNextLabelMismatchCount += 1;

    const cause = classifyCause(allocation, predictedRoster, rosterAfterApply, nextBashoLabel);
    if (
      cause !== 'G' ||
      hasSanyakuFloorViolation(allocation) ||
      hasSanyakuFloorViolation(rosterAfterApply) ||
      rosterToNextLabelMismatch
    ) {
      traces.push({
        worldLabel,
        seed,
        basho: b + 1,
        allocation,
        predictedRoster,
        rosterAfterApply,
        nextBashoLabel,
        allocationToRosterMismatch,
        rosterToNextLabelMismatch,
        reasonCode: hasSanyakuFloorViolation(allocation)
          ? 'allocation_sanyaku_floor_violation'
          : hasSanyakuFloorViolation(rosterAfterApply)
            ? 'roster_sanyaku_floor_violation'
            : rosterToNextLabelMismatch
              ? 'roster_to_next_label_mismatch'
              : 'layout_count_mismatch',
        cause,
        sampleAllocationRanks: allocationRanks.slice(0, 16).map(rankLabel),
        sampleRosterRanks: rosterRanks.slice(0, 16).map(rankLabel),
      });
    }

    pendingRosterCounts = rosterAfterApply;
  }

  return {
    worldLabel,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    metrics,
    traces,
  };
};

const writeOutputs = (summaries: WorldSummary[]): void => {
  const docsDir = path.resolve('docs/design');
  fs.mkdirSync(docsDir, { recursive: true });
  const jsonPath = path.join(docsDir, 'sanyaku_floor_invariant_diagnostics.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    basho: BASHO,
    seeds: SEEDS,
    summaries,
  }, null, 2));

  const total = summaries.reduce((acc, summary) => {
    for (const [key, value] of Object.entries(summary.metrics)) acc[key] = (acc[key] ?? 0) + value;
    return acc;
  }, zeroMetrics());

  const md: string[] = [];
  md.push('# Sanyaku floor invariant diagnostics');
  md.push('');
  md.push(`Generated by \`scripts/dev/diagnoseSanyakuFloorInvariant.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push('| world | seed | basho | S<2 | K<2 | S=0 | K=0 | allocation S<2 | allocation K<2 | roster S<2 | roster K<2 | next S<2 | next K<2 | allocation mismatch | next label mismatch |');
  md.push('| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|');
  for (const summary of summaries) {
    const m = summary.metrics;
    md.push(`| ${summary.worldLabel} | ${summary.seed} | ${m.bashoCount} | ${m.sekiwakeUnder2Count} | ${m.komusubiUnder2Count} | ${m.sekiwakeZeroCount} | ${m.komusubiZeroCount} | ${m.allocationSekiwakeUnder2Count} | ${m.allocationKomusubiUnder2Count} | ${m.rosterSekiwakeUnder2Count} | ${m.rosterKomusubiUnder2Count} | ${m.nextLabelSekiwakeUnder2Count} | ${m.nextLabelKomusubiUnder2Count} | ${m.allocationToRosterMismatchCount} | ${m.rosterToNextLabelMismatchCount} |`);
  }
  md.push('');
  md.push('## Total KPI');
  md.push('');
  for (const [key, value] of Object.entries(total)) {
    md.push(`- ${key}: ${value}`);
  }
  md.push('');
  md.push('## Cause Classification');
  md.push('');
  md.push('- A: makuuchiLayout / allocation の生成時点で S/K minimum がない。');
  md.push('- B: ensureSanyakuFloor が機能していない。');
  md.push('- C: 横綱・大関保護の副作用で S/K が押し出されている。');
  md.push('- D: reconcileNpcLeague または次場所結果 label で S/K section が崩れている。');
  md.push('- E: applyBanzukeToRosters で allocation と roster rank label がずれている。');
  md.push('- F: UI 読み取り問題。');
  md.push('- G: 診断側の読み取り問題、または問題なし。');
  md.push('');
  md.push('## Interesting Traces');
  md.push('');
  const traces = summaries.flatMap((summary) => summary.traces).slice(0, 80);
  if (traces.length === 0) {
    md.push('S/K floor violation trace はなし。');
  } else {
    md.push('| world | seed | basho | allocation Y/O/S/K | roster Y/O/S/K | next label Y/O/S/K | reason | cause | allocation sample | roster sample |');
    md.push('| --- | ---:| ---:| --- | --- | --- | --- | --- | --- | --- |');
    for (const trace of traces) {
      const toCell = (counts: RankCounts | null): string =>
        counts ? `${counts.yokozuna}/${counts.ozeki}/${counts.sekiwake}/${counts.komusubi}` : '-';
      md.push(`| ${trace.worldLabel} | ${trace.seed} | ${trace.basho} | ${toCell(trace.allocation)} | ${toCell(trace.rosterAfterApply)} | ${toCell(trace.nextBashoLabel)} | ${trace.reasonCode} | ${trace.cause} | ${trace.sampleAllocationRanks.join(' ')} | ${trace.sampleRosterRanks.join(' ')} |`);
    }
  }
  md.push('');
  md.push('## Reading');
  md.push('');
  md.push('- `allocation` は `generateNextBanzuke` が返した `nextRank` から構築した layout。');
  md.push('- `rosterAfterApply` は `applyBanzukeToRosters` 後の `world.makuuchiLayout`。');
  md.push('- `nextBashoLabel` は次の場所結果 row に保存された開始番付 label。');
  fs.writeFileSync(path.join(docsDir, 'sanyaku_floor_invariant_diagnostics.md'), `${md.join('\n')}\n`);
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
  console.log(`Sanyaku floor invariant diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  console.log(JSON.stringify(total, null, 2));
  console.log('Wrote docs/design/sanyaku_floor_invariant_diagnostics.{json,md}');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
