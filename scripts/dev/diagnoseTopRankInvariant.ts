#!/usr/bin/env npx tsx
/**
 * NPC 横綱・大関の制度 invariant を、allocation -> roster apply -> 次場所結果 label
 * の境界ごとに追跡する診断。
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

interface TopRankTrace {
  worldLabel: string;
  seed: number;
  basho: number;
  id: string;
  shikona: string;
  previousRank: string | null;
  startRank: string | null;
  currentRank: string;
  currentResult: string;
  allocationCurrentRank: string;
  allocationNextRank: string;
  predictedRosterRank: string | null;
  rankAfterApplyBanzukeToRosters: string | null;
  nextBashoRankLabel: string | null;
  retirementFlag: boolean;
  kadobanFlagBefore: boolean;
  nextKadobanFlag: boolean;
  ozekiReturnFlagBefore: boolean;
  nextOzekiReturnFlag: boolean;
  sourceFile: string;
  reasonCode: string;
  cause: CauseCode;
}

interface WorldSummary {
  worldLabel: string;
  seed: number;
  eraSnapshotId: string | null;
  eraTags: string[];
  metrics: Record<string, number>;
  traces: TopRankTrace[];
}

const TOP_RANK_NAMES = new Set<Rank['name']>(['横綱', '大関', '関脇', '小結']);

const rankLabel = (rank: Rank | null | undefined): string | null => {
  if (!rank) return null;
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (rank.division === 'Makuuchi' && TOP_RANK_NAMES.has(rank.name)) return `${side}${rank.name}`;
  const number = rank.number ?? '';
  return `${side}${rank.name}${number}`;
};

const resultLabel = (wins: number, losses: number, absent = 0): string =>
  `${wins}-${losses}-${absent}`;

const isRankName = (rank: Rank | null | undefined, name: string): boolean =>
  rank?.division === 'Makuuchi' && rank.name === name;

const isBelowOzeki = (rank: Rank | null | undefined): boolean =>
  Boolean(rank && (!isRankName(rank, '横綱') && !isRankName(rank, '大関')));

const sameRankName = (a: Rank | null | undefined, b: Rank | null | undefined): boolean =>
  Boolean(a && b && a.division === b.division && a.name === b.name);

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
): Map<string, Rank> => {
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

  const out = new Map<string, Rank>();
  sorted.slice(0, 42).forEach((allocation, index) => {
    out.set(allocation.id, decodeMakuuchiRankFromScore(index + 1, nextLayout));
  });
  return out;
};

type DiagnosticWorld = NonNullable<ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>>;

const findRosterRank = (world: DiagnosticWorld, id: string): Rank | null => {
  const makuuchi = world.rosters.Makuuchi.find((row) => row.id === id);
  if (makuuchi) return decodeMakuuchiRankFromScore(makuuchi.rankScore, world.makuuchiLayout);
  const juryo = world.rosters.Juryo.find((row) => row.id === id);
  if (juryo) {
    return {
      division: 'Juryo',
      name: '十両',
      number: Math.floor((juryo.rankScore - 1) / 2) + 1,
      side: juryo.rankScore % 2 === 1 ? 'East' : 'West',
    };
  }
  return null;
};

const zeroMetrics = (): Record<string, number> => ({
  yokozunaDemotionCount: 0,
  yokozunaActiveRankChangeCount: 0,
  yokozunaRetirementCount: 0,
  yokozunaBadRecordButActiveCount: 0,
  ozekiDirectDemotionCount: 0,
  ozekiDemotionWithoutKadobanCount: 0,
  ozekiDemotionToNonSekiwakeCount: 0,
  ozekiKadobanEntryCount: 0,
  ozekiKadobanSurvivalCount: 0,
  ozekiKadobanFailureCount: 0,
  ozekiReturnCount: 0,
  allocationToRosterMismatchCount: 0,
  rosterApplyToNextBashoMismatchCount: 0,
  uiRankSourceMismatchCount: 0,
});

const classifyCause = (
  allocation: BanzukeAllocation,
  predictedRank: Rank | null,
  afterRank: Rank | null,
  nextBashoRank: Rank | null,
): CauseCode => {
  if (allocation.currentRank.name === '横綱' && allocation.nextRank.name !== '横綱') return 'A';
  if (allocation.currentRank.name === '大関') {
    if (allocation.nextRank.name !== '大関' && allocation.nextRank.name !== '関脇') return 'A';
    if (allocation.nextRank.name === '関脇' && !allocation.nextIsOzekiReturn) return 'E';
  }
  if (predictedRank && !sameRankName(predictedRank, allocation.nextRank)) return 'C';
  if (afterRank && !sameRankName(afterRank, predictedRank)) return 'B';
  if (nextBashoRank && afterRank && !sameRankName(nextBashoRank, afterRank)) return 'D';
  return 'G';
};

const pushTrace = (
  traces: TopRankTrace[],
  input: {
    worldLabel: string;
    seed: number;
    basho: number;
    allocation: BanzukeAllocation;
    previousRank: Rank | null;
    startRank: Rank | null;
    resultRank: Rank | null;
    wins: number;
    losses: number;
    absent: number;
    predictedRank: Rank | null;
    afterRank: Rank | null;
    nextBashoRank: Rank | null;
    retirementFlag: boolean;
    kadobanFlagBefore: boolean;
    ozekiReturnFlagBefore: boolean;
    reasonCode: string;
  },
): void => {
  traces.push({
    worldLabel: input.worldLabel,
    seed: input.seed,
    basho: input.basho,
    id: input.allocation.id,
    shikona: input.allocation.shikona,
    previousRank: rankLabel(input.previousRank),
    startRank: rankLabel(input.startRank),
    currentRank: rankLabel(input.resultRank) ?? '-',
    currentResult: resultLabel(input.wins, input.losses, input.absent),
    allocationCurrentRank: rankLabel(input.allocation.currentRank) ?? '-',
    allocationNextRank: rankLabel(input.allocation.nextRank) ?? '-',
    predictedRosterRank: rankLabel(input.predictedRank),
    rankAfterApplyBanzukeToRosters: rankLabel(input.afterRank),
    nextBashoRankLabel: rankLabel(input.nextBashoRank),
    retirementFlag: input.retirementFlag,
    kadobanFlagBefore: input.kadobanFlagBefore,
    nextKadobanFlag: input.allocation.nextIsOzekiKadoban,
    ozekiReturnFlagBefore: input.ozekiReturnFlagBefore,
    nextOzekiReturnFlag: input.allocation.nextIsOzekiReturn,
    sourceFile: 'src/logic/banzuke/providers/topDivision.ts; src/logic/simulation/topDivision/banzuke.ts',
    reasonCode: input.reasonCode,
    cause: classifyCause(input.allocation, input.predictedRank, input.afterRank, input.nextBashoRank),
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
      careerId: `top-rank-invariant-${spec.key}-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
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
  const traces: TopRankTrace[] = [];
  let previousResultRankById = new Map<string, Rank>();
  const pendingNextBasho = new Map<string, {
    allocation: BanzukeAllocation;
    afterRank: Rank | null;
    reasonCode: string;
  }>();

  for (let b = 0; b < BASHO; b += 1) {
    const beforeWorld = runtime.__getWorldForDiagnostics();
    const startRankById = new Map(
      beforeWorld.rosters.Makuuchi.map((row) => [
        row.id,
        decodeMakuuchiRankFromScore(row.rankScore, beforeWorld.makuuchiLayout),
      ]),
    );
    const kadobanBefore = new Map(beforeWorld.ozekiKadobanById);
    const ozekiReturnBefore = new Map(beforeWorld.ozekiReturnById);

    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const resultById = new Map((world.lastBashoResults.Makuuchi ?? []).map((result) => [result.id, result]));
    const currentResultRankById = new Map<string, Rank>();

    for (const result of world.lastBashoResults.Makuuchi ?? []) {
      if (result.rank) currentResultRankById.set(result.id, result.rank);
      const pending = pendingNextBasho.get(result.id);
      if (pending && result.rank && pending.afterRank && !sameRankName(result.rank, pending.afterRank)) {
        metrics.rosterApplyToNextBashoMismatchCount += 1;
      }
      pendingNextBasho.delete(result.id);
    }

    const predictedById = predictAppliedMakuuchiRanks(world.lastAllocations);
    const retiredIds = new Set((step.retiredNpcCareerBashoCounts ?? []).map((_count, index) => `${index}`));

    for (const allocation of world.lastAllocations) {
      if (allocation.id === PLAYER_ACTOR_ID) continue;
      const result = resultById.get(allocation.id);
      if (!result?.rank) continue;
      const previousRank = previousResultRankById.get(allocation.id) ?? null;
      const startRank = startRankById.get(allocation.id) ?? null;
      const predictedRank = predictedById.get(allocation.id) ?? null;
      const afterRank = findRosterRank(world, allocation.id);
      const wins = result.wins;
      const losses = result.losses;
      const absent = result.absent ?? 0;
      const effectiveLosses = losses + absent;
      const badRecord = wins < effectiveLosses;
      const activeAfterApply = Boolean(afterRank);
      const retired = !activeAfterApply || retiredIds.has(allocation.id);
      const isTopInvariantRelevant =
        allocation.currentRank.name === '横綱' ||
        allocation.currentRank.name === '大関' ||
        allocation.nextRank.name === '横綱' ||
        allocation.nextRank.name === '大関';
      const allocationRosterMismatch = predictedRank
        ? !sameRankName(predictedRank, allocation.nextRank)
        : false;
      if (allocationRosterMismatch && isTopInvariantRelevant) {
        metrics.allocationToRosterMismatchCount += 1;
      }

      let reasonCode: string | null = null;
      if (isRankName(allocation.currentRank, '横綱')) {
        if (allocation.nextRank.name !== '横綱') {
          metrics.yokozunaDemotionCount += 1;
          reasonCode = 'yokozuna_allocation_demotion';
        }
        if (activeAfterApply && afterRank?.name !== '横綱') {
          metrics.yokozunaActiveRankChangeCount += 1;
          reasonCode = reasonCode ?? 'yokozuna_active_rank_change';
        }
        if (!activeAfterApply) metrics.yokozunaRetirementCount += 1;
        if (badRecord && activeAfterApply) metrics.yokozunaBadRecordButActiveCount += 1;
      }

      if (isRankName(allocation.currentRank, '大関')) {
        if (allocation.nextIsOzekiKadoban) metrics.ozekiKadobanEntryCount += 1;
        if (allocation.nextIsOzekiReturn) {
          metrics.ozekiKadobanFailureCount += 1;
        } else if (kadobanBefore.get(allocation.id) && allocation.nextRank.name === '大関') {
          metrics.ozekiKadobanSurvivalCount += 1;
        }
        if (isBelowOzeki(allocation.nextRank)) {
          metrics.ozekiDirectDemotionCount += 1;
          reasonCode = reasonCode ?? 'ozeki_left_ozeki';
          if (!kadobanBefore.get(allocation.id)) {
            metrics.ozekiDemotionWithoutKadobanCount += 1;
            reasonCode = 'ozeki_demotion_without_kadoban';
          }
          if (allocation.nextRank.name !== '関脇') {
            metrics.ozekiDemotionToNonSekiwakeCount += 1;
            reasonCode = 'ozeki_demotion_to_non_sekiwake';
          }
        }
        if (activeAfterApply && isBelowOzeki(afterRank) && allocation.nextRank.name === '大関') {
          reasonCode = reasonCode ?? 'ozeki_roster_apply_rank_loss';
        }
      }

      if (
        allocation.currentRank.name === '関脇' &&
        ozekiReturnBefore.get(allocation.id) &&
        allocation.nextRank.name === '大関'
      ) {
        metrics.ozekiReturnCount += 1;
      }

      if (allocationRosterMismatch && isTopInvariantRelevant) {
        reasonCode = reasonCode ?? 'allocation_to_roster_mismatch';
      }

      if (reasonCode) {
        pushTrace(traces, {
          worldLabel,
          seed,
          basho: b + 1,
          allocation,
          previousRank,
          startRank,
          resultRank: result.rank,
          wins,
          losses,
          absent,
          predictedRank,
          afterRank,
          nextBashoRank: null,
          retirementFlag: retired,
          kadobanFlagBefore: kadobanBefore.get(allocation.id) ?? false,
          ozekiReturnFlagBefore: ozekiReturnBefore.get(allocation.id) ?? false,
          reasonCode,
        });
      }

      if (afterRank && (allocation.currentRank.name === '横綱' || allocation.currentRank.name === '大関')) {
        pendingNextBasho.set(allocation.id, {
          allocation,
          afterRank,
          reasonCode: reasonCode ?? 'top_rank_pending_next_label',
        });
      }
    }

    previousResultRankById = currentResultRankById;
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
  const jsonPath = path.join(docsDir, 'top_rank_invariant_diagnostics.json');
  fs.writeFileSync(jsonPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    basho: BASHO,
    seeds: SEEDS,
    summaries,
  }, null, 2));

  const total = zeroMetrics();
  for (const summary of summaries) {
    for (const [key, value] of Object.entries(summary.metrics)) {
      total[key] = (total[key] ?? 0) + value;
    }
  }

  const md: string[] = [];
  md.push('# Top rank invariant diagnostics');
  md.push('');
  md.push(`Generated by \`scripts/dev/diagnoseTopRankInvariant.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`);
  md.push('');
  md.push('## Summary');
  md.push('');
  md.push('| world | seed | Y demotion | Y active change | Y retire | Y bad active | O direct demotion | O no-kadoban demotion | O non-sekiwake demotion | O kadoban entry | O kadoban survival | O kadoban failure | O return | allocation mismatch | next label mismatch |');
  md.push('| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|');
  for (const summary of summaries) {
    const m = summary.metrics;
    md.push(`| ${summary.worldLabel} | ${summary.seed} | ${m.yokozunaDemotionCount} | ${m.yokozunaActiveRankChangeCount} | ${m.yokozunaRetirementCount} | ${m.yokozunaBadRecordButActiveCount} | ${m.ozekiDirectDemotionCount} | ${m.ozekiDemotionWithoutKadobanCount} | ${m.ozekiDemotionToNonSekiwakeCount} | ${m.ozekiKadobanEntryCount} | ${m.ozekiKadobanSurvivalCount} | ${m.ozekiKadobanFailureCount} | ${m.ozekiReturnCount} | ${m.allocationToRosterMismatchCount} | ${m.rosterApplyToNextBashoMismatchCount} |`);
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
  md.push('- A: banzuke allocation が横綱・大関を制度外に割り当てた。');
  md.push('- B: applyBanzukeToRosters 後に allocation と異なる rank name になった。');
  md.push('- C: makuuchiLayout 再配置で top rank section から漏れた。');
  md.push('- D: 次場所結果 label が roster apply 後 rank と異なる。UI 表示も同じ保存 row を読むため UI 表示問題候補。');
  md.push('- E: 大関カド番 / 復帰状態の carry に問題がある。');
  md.push('- F: 診断側の rank 読み取りミス。');
  md.push('- G: 問題なし、または制度上許容される状態。');
  md.push('');
  md.push('## Interesting Traces');
  md.push('');
  const traces = summaries.flatMap((summary) => summary.traces).slice(0, 80);
  if (traces.length === 0) {
    md.push('Invariant violation trace はなし。');
  } else {
    md.push('| world | seed | basho | id | shikona | prev / start / current / allocation / roster / next | result | retired | kadoban before/next | return before/next | reason | cause |');
    md.push('| --- | ---:| ---:| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const trace of traces) {
      md.push(`| ${trace.worldLabel} | ${trace.seed} | ${trace.basho} | ${trace.id} | ${trace.shikona} | ${trace.previousRank ?? '-'} / ${trace.startRank ?? '-'} / ${trace.currentRank} / ${trace.allocationNextRank} / ${trace.rankAfterApplyBanzukeToRosters ?? '-'} / ${trace.nextBashoRankLabel ?? '-'} | ${trace.currentResult} | ${trace.retirementFlag ? 'yes' : 'no'} | ${trace.kadobanFlagBefore ? 'yes' : 'no'}/${trace.nextKadobanFlag ? 'yes' : 'no'} | ${trace.ozekiReturnFlagBefore ? 'yes' : 'no'}/${trace.nextOzekiReturnFlag ? 'yes' : 'no'} | ${trace.reasonCode} | ${trace.cause} |`);
    }
  }
  md.push('');
  md.push('## Reading');
  md.push('');
  md.push('- CareerResult / Report UI は保存済み `BashoRecordRow` 由来の `record.rank` または detail row の `rankName/rankNumber/rankSide` を表示しており、NPC top rank 表示も runtime の `npcBashoRecords` / detail rows に依存する。');
  md.push('- そのため `rankAfterApplyBanzukeToRosters` と `nextBashoRankLabel` が一致していれば、少なくとも次場所開始時 label は本体データと同じ source を読んでいる。');
  md.push('- `yokozunaBadRecordButActiveCount` は横綱の負け越し後も現役である数で、降格ではない。強制引退禁止のため、これは retirement pressure 観測値として読む。');
  fs.writeFileSync(path.join(docsDir, 'top_rank_invariant_diagnostics.md'), `${md.join('\n')}\n`);
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
  console.log(`Top rank invariant diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  console.log(JSON.stringify(total, null, 2));
  console.log('Wrote docs/design/top_rank_invariant_diagnostics.{json,md}');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
