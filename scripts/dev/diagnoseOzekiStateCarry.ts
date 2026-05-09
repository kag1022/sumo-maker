#!/usr/bin/env npx tsx
/**
 * nextIsOzekiKadoban / nextIsOzekiReturn が
 * allocation -> roster 適用 -> 次場所 rank label のどこで失われるかを追跡する。
 *
 * 制度ロジックは変更しない。applyBanzukeToRosters の順位付けだけを診断側で再現し、
 * `world.lastAllocations`、step終了後ロスター、次場所星取ラベルを同じIDで比較する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { buildMakuuchiLayoutFromRanks, decodeMakuuchiRankFromScore, MakuuchiLayout } from '../../src/logic/banzuke/scale/banzukeLayout';
import type { BanzukeAllocation } from '../../src/logic/banzuke/providers/sekitori/types';
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

const BASHO = argInt('--basho', 18);
const SEED = argInt('--seed', 20260416);

type FlagKind = 'kadoban' | 'return';
type LossBoundary =
  | 'allocation_to_roster_apply'
  | 'roster_apply_to_step_end'
  | 'step_end_to_next_basho_label'
  | 'carried'
  | 'not_applicable';

type TopRankName = '横綱' | '大関' | '関脇' | '小結';

const TOP_RANK_NAMES = new Set<Rank['name']>(['横綱', '大関', '関脇', '小結']);

interface PredictedAppliedRank {
  id: string;
  nextRank: Rank;
  predictedRank: Rank;
  predictedRankScore: number;
}

interface CarryCandidate {
  basho: number;
  id: string;
  shikona: string;
  flag: FlagKind;
  allocationRankName: string;
  allocationRankNumber?: number;
  allocationRankSide?: string;
  predictedRosterRankName: string;
  predictedRosterRankNumber?: number;
  predictedRosterRankSide?: string;
  afterStepRankName: string | null;
  afterStepRankNumber?: number;
  afterStepRankSide?: string;
  nextBashoRankName: string | null;
  nextBashoRankNumber?: number;
  nextBashoRankSide?: string;
  allocationMatchesExpected: boolean;
  rosterApplyMatchesAllocation: boolean;
  stepEndMatchesRosterApply: boolean;
  nextBashoMatchesStepEnd: boolean;
  boundary: LossBoundary;
}

const formatRank = (rank: Rank | null): string => {
  if (!rank) return '-';
  const num = rank.number ? `${rank.number}` : '';
  const side = rank.side === 'West' ? 'W' : rank.side === 'East' ? 'E' : '';
  return `${rank.name}${num}${side}`;
};

const rankSameName = (a: Rank | null, b: Rank | null): boolean =>
  Boolean(a && b && a.division === b.division && a.name === b.name);

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
  return section.start + Math.max(0, Math.min(section.count - 1, toRankOrderIndex(rank)));
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
): Map<string, PredictedAppliedRank> => {
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

  const out = new Map<string, PredictedAppliedRank>();
  sorted.slice(0, 42).forEach((allocation, index) => {
    const predictedRankScore = index + 1;
    out.set(allocation.id, {
      id: allocation.id,
      nextRank: allocation.nextRank,
      predictedRank: decodeMakuuchiRankFromScore(predictedRankScore, nextLayout),
      predictedRankScore,
    });
  });
  return out;
};

const findRosterRank = (
  world: ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>,
  id: string,
): Rank | null => {
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

const resolveBoundary = (
  expectedName: string,
  allocationRank: Rank,
  predictedRank: Rank | null,
  afterStepRank: Rank | null,
  nextBashoRank: Rank | null,
): LossBoundary => {
  if (allocationRank.name !== expectedName) return 'allocation_to_roster_apply';
  if (!rankSameName(predictedRank, allocationRank)) return 'allocation_to_roster_apply';
  if (!rankSameName(afterStepRank, predictedRank)) return 'roster_apply_to_step_end';
  if (!nextBashoRank) return 'carried';
  if (!rankSameName(nextBashoRank, afterStepRank)) return 'step_end_to_next_basho_label';
  return 'carried';
};

const main = async (): Promise<void> => {
  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(SEED));
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `ozeki-state-carry-${SEED}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
    },
    {
      random: createSeededRandom(SEED + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  const candidates: CarryCandidate[] = [];
  let pending: CarryCandidate[] = [];

  for (let basho = 1; basho <= BASHO; basho += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;

    const world = runtime.__getWorldForDiagnostics();
    const resultRankById = new Map(
      (world.lastBashoResults.Makuuchi ?? []).map((result) => [result.id, result.rank]),
    );
    for (const candidate of pending) {
      const nextBashoRank = resultRankById.get(candidate.id) ?? null;
      candidate.nextBashoRankName = nextBashoRank?.name ?? null;
      candidate.nextBashoRankNumber = nextBashoRank?.number;
      candidate.nextBashoRankSide = nextBashoRank?.side;
      const afterStepRank: Rank | null = candidate.afterStepRankName
        ? {
          division: candidate.afterStepRankName === '十両' ? 'Juryo' : 'Makuuchi',
          name: candidate.afterStepRankName as Rank['name'],
          number: candidate.afterStepRankNumber,
          side: candidate.afterStepRankSide as Rank['side'],
        }
        : null;
      candidate.nextBashoMatchesStepEnd = rankSameName(nextBashoRank, afterStepRank);
      if (candidate.boundary === 'carried' && !candidate.nextBashoMatchesStepEnd) {
        candidate.boundary = 'step_end_to_next_basho_label';
      }
    }

    const predictedById = predictAppliedMakuuchiRanks(world.lastAllocations);
    const nextPending: CarryCandidate[] = [];
    for (const allocation of world.lastAllocations) {
      const flag: FlagKind | null = allocation.nextIsOzekiKadoban
        ? 'kadoban'
        : allocation.nextIsOzekiReturn
          ? 'return'
          : null;
      if (!flag) continue;
      const expectedName = flag === 'kadoban' ? '大関' : '関脇';
      const actor = world.actorRegistry.get(allocation.id);
      const predicted = predictedById.get(allocation.id);
      const afterStepRank = findRosterRank(world, allocation.id);
      const boundary = resolveBoundary(
        expectedName,
        allocation.nextRank,
        predicted?.predictedRank ?? null,
        afterStepRank,
        null,
      );
      const candidate: CarryCandidate = {
        basho,
        id: allocation.id,
        shikona: actor?.shikona ?? allocation.id,
        flag,
        allocationRankName: allocation.nextRank.name,
        allocationRankNumber: allocation.nextRank.number,
        allocationRankSide: allocation.nextRank.side,
        predictedRosterRankName: predicted?.predictedRank.name ?? '-',
        predictedRosterRankNumber: predicted?.predictedRank.number,
        predictedRosterRankSide: predicted?.predictedRank.side,
        afterStepRankName: afterStepRank?.name ?? null,
        afterStepRankNumber: afterStepRank?.number,
        afterStepRankSide: afterStepRank?.side,
        nextBashoRankName: null,
        allocationMatchesExpected: allocation.nextRank.name === expectedName,
        rosterApplyMatchesAllocation: rankSameName(predicted?.predictedRank ?? null, allocation.nextRank),
        stepEndMatchesRosterApply: rankSameName(afterStepRank, predicted?.predictedRank ?? null),
        nextBashoMatchesStepEnd: false,
        boundary,
      };
      candidates.push(candidate);
      nextPending.push(candidate);
    }
    pending = nextPending;
  }

  const boundaryCounts = candidates.reduce<Record<LossBoundary, number>>((acc, candidate) => {
    acc[candidate.boundary] = (acc[candidate.boundary] ?? 0) + 1;
    return acc;
  }, {
    allocation_to_roster_apply: 0,
    roster_apply_to_step_end: 0,
    step_end_to_next_basho_label: 0,
    carried: 0,
    not_applicable: 0,
  });

  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'ozeki_state_carry_trace.json'),
    JSON.stringify({ basho: BASHO, seed: SEED, boundaryCounts, candidates }, null, 2),
  );

  const lines = [
    '# Ozeki state carry trace',
    '',
    `Generated by \`scripts/dev/diagnoseOzekiStateCarry.ts\` (basho=${BASHO}, seed=${SEED}).`,
    '',
    '## Boundary counts',
    '',
    '| boundary | count |',
    '| --- | ---:|',
    ...Object.entries(boundaryCounts).map(([boundary, count]) => `| ${boundary} | ${count} |`),
    '',
    '## Candidates',
    '',
    '| basho | flag | shikona | id | allocation | predicted apply | after step | next basho | boundary |',
    '| ---:| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...candidates.map((candidate) => {
      const allocationRank: Rank = {
        division: candidate.allocationRankName === '十両' ? 'Juryo' : 'Makuuchi',
        name: candidate.allocationRankName as Rank['name'],
        number: candidate.allocationRankNumber,
        side: candidate.allocationRankSide as Rank['side'],
      };
      const predictedRank: Rank = {
        division: candidate.predictedRosterRankName === '十両' ? 'Juryo' : 'Makuuchi',
        name: candidate.predictedRosterRankName as Rank['name'],
        number: candidate.predictedRosterRankNumber,
        side: candidate.predictedRosterRankSide as Rank['side'],
      };
      const afterStepRank: Rank | null = candidate.afterStepRankName
        ? {
          division: candidate.afterStepRankName === '十両' ? 'Juryo' : 'Makuuchi',
          name: candidate.afterStepRankName as Rank['name'],
          number: candidate.afterStepRankNumber,
          side: candidate.afterStepRankSide as Rank['side'],
        }
        : null;
      const nextRank: Rank | null = candidate.nextBashoRankName
        ? {
          division: candidate.nextBashoRankName === '十両' ? 'Juryo' : 'Makuuchi',
          name: candidate.nextBashoRankName as Rank['name'],
          number: candidate.nextBashoRankNumber,
          side: candidate.nextBashoRankSide as Rank['side'],
        }
        : null;
      return `| ${candidate.basho} | ${candidate.flag} | ${candidate.shikona} | ${candidate.id} | ${formatRank(allocationRank)} | ${formatRank(predictedRank)} | ${formatRank(afterStepRank)} | ${formatRank(nextRank)} | ${candidate.boundary} |`;
    }),
    '',
    '## Notes',
    '',
    '- `allocation`: `world.lastAllocations` の `nextRank`。',
    '- `predicted apply`: `applyBanzukeToRosters` と同じ順位付けを診断側で再現した直後の想定ラベル。',
    '- `after step`: `runNextSeasonStep()` 完了後の `world.rosters` と `world.makuuchiLayout` から復元したラベル。',
    '- `next basho`: 次回 `runNextSeasonStep()` の `world.lastBashoResults.Makuuchi[].rank`。',
    '- slot の東西・枚目ズレではなく、大関/関脇という rank name が維持されているかで境界分類する。',
  ];
  fs.writeFileSync(path.join(outDir, 'ozeki_state_carry_trace.md'), lines.join('\n'));

  console.log(`Ozeki state carry trace — basho=${BASHO} seed=${SEED}`);
  console.log(boundaryCounts);
  for (const candidate of candidates) {
    console.log(
      [
        `basho=${candidate.basho}`,
        candidate.flag,
        candidate.shikona,
        `allocation=${candidate.allocationRankName}`,
        `predicted=${candidate.predictedRosterRankName}`,
        `afterStep=${candidate.afterStepRankName ?? '-'}`,
        `next=${candidate.nextBashoRankName ?? '-'}`,
        `boundary=${candidate.boundary}`,
      ].join(' '),
    );
  }
  console.log(`Wrote docs/design/ozeki_state_carry_trace.{json,md}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
