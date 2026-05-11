#!/usr/bin/env npx tsx
/**
 * 大関昇進カウントが、formal gate / allocation / roster apply / 次場所 label の
 * どこで materialize しているかを監査する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { decodeMakuuchiRankFromScore } from '../../src/logic/banzuke/scale/banzukeLayout';
import { evaluateSnapshotOzekiPromotion } from '../../src/logic/banzuke/rules/sanyakuPromotion';
import type { BashoRecordHistorySnapshot, BashoRecordSnapshot } from '../../src/logic/banzuke/providers/sekitori/types';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import type { Rank } from '../../src/logic/models';
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

const BASHO = argInt('--basho', 60);
const SEEDS = argStr('--seeds', argStr('--seed', '20260420'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

interface OzekiMaterializationTrace {
  worldLabel: string;
  seed: number;
  basho: number;
  id: string;
  shikona: string;
  previousBashoRank: string | null;
  bashoStartRank: string | null;
  currentResultRank: string;
  allocationCurrentRank: string;
  allocationNextRank: string;
  rosterAfterApplyRank: string | null;
  nextBashoResultRank: string | null;
  wins: number;
  losses: number;
  absent: number;
  recentWins: number[];
  recentRanks: string[];
  isOzekiReturnAtStart: boolean;
  formalRecommendedWithoutReturn: boolean;
  formalRecommendedWithReturn: boolean;
  ozekiReturnGatePassed: boolean;
  materializedInRoster: boolean;
  materializedNextBasho: boolean | null;
  allocationRosterMismatch: boolean;
  previousWasOzeki: boolean;
  likelyDiagnosis: string;
}

interface WorldDiagnostic {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  traces: OzekiMaterializationTrace[];
}

const rankLabel = (rank: Rank): string =>
  rank.division === 'Makuuchi'
    ? `${rank.name}${rank.number ?? ''}${rank.side === 'West' ? '西' : '東'}`
    : `${rank.name}${rank.number ?? ''}${rank.side === 'West' ? '西' : '東'}`;

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

const rosterRankLabel = (
  world: ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>,
  id: string,
): string | null => {
  const row = world.rosters.Makuuchi.find((rikishi) => rikishi.id === id);
  if (!row) return null;
  return rankLabel(decodeMakuuchiRankFromScore(row.rankScore, world.makuuchiLayout));
};

const toSnapshot = (
  result: {
    id: string;
    shikona: string;
    rank?: Rank;
    wins: number;
    losses: number;
    absent?: number;
    expectedWins?: number;
    strengthOfSchedule?: number;
    performanceOverExpected?: number;
    yusho?: boolean;
    junYusho?: boolean;
    specialPrizes?: string[];
  },
  pastRecords: BashoRecordHistorySnapshot[],
  isOzekiReturn: boolean,
): BashoRecordSnapshot => ({
  id: result.id,
  shikona: result.shikona,
  rank: result.rank ?? { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
  wins: result.wins,
  losses: result.losses,
  absent: result.absent ?? 0,
  expectedWins: result.expectedWins,
  strengthOfSchedule: result.strengthOfSchedule,
  performanceOverExpected: result.performanceOverExpected,
  yusho: result.yusho ?? false,
  junYusho: result.junYusho ?? false,
  specialPrizes: result.specialPrizes ?? [],
  pastRecords,
  isOzekiReturn,
});

const classifyTrace = (input: {
  allocationCurrentRank: Rank;
  allocationNextRank: Rank;
  isOzekiReturnAtStart: boolean;
  formalRecommendedWithoutReturn: boolean;
  formalRecommendedWithReturn: boolean;
  ozekiReturnGatePassed: boolean;
  previousWasOzeki: boolean;
  allocationRosterMismatch: boolean;
}): string => {
  if (input.allocationRosterMismatch) return 'allocation_to_roster_mismatch';
  if (input.allocationCurrentRank.name === '大関') return 'existing_ozeki_internal_move';
  if (input.isOzekiReturnAtStart && input.ozekiReturnGatePassed) return 'ozeki_return_materialized';
  if (input.formalRecommendedWithoutReturn || input.formalRecommendedWithReturn) return 'valid_new_ozeki_promotion';
  if (input.previousWasOzeki) return 'diagnostic_miscount_previous_ozeki_state';
  return 'formal_reject_materialized';
};

const runWorld = async (
  seed: number,
  spec: { key: string; snapshot?: EraSnapshot },
): Promise<WorldDiagnostic | null> => {
  if (spec.key !== 'legacy' && !spec.snapshot) {
    console.warn(`Unknown world key: ${spec.key}`);
    return null;
  }

  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const label = spec.key === 'legacy'
    ? 'legacy (undefined)'
    : `era:${spec.snapshot?.publicEraLabel} (${spec.snapshot?.id})`;
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `ozeki-promotion-materialization-${spec.key}-${seed}`,
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

  const traces: OzekiMaterializationTrace[] = [];
  const pendingNextBasho = new Map<string, OzekiMaterializationTrace>();
  let previousResultRankById = new Map<string, string>();

  for (let b = 0; b < BASHO; b += 1) {
    const beforeWorld = runtime.__getWorldForDiagnostics();
    const bashoStartRankById = new Map(
      beforeWorld.rosters.Makuuchi.map((row) => [
        row.id,
        rankLabel(decodeMakuuchiRankFromScore(row.rankScore, beforeWorld.makuuchiLayout)),
      ]),
    );
    const ozekiReturnAtStart = new Map(beforeWorld.ozekiReturnById);

    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const currentResultRankById = new Map<string, string>();
    for (const result of world.lastBashoResults.Makuuchi ?? []) {
      if (result.rank) {
        const labelForResult = rankLabel(result.rank);
        currentResultRankById.set(result.id, labelForResult);
        const pending = pendingNextBasho.get(result.id);
        if (pending) {
          pending.nextBashoResultRank = labelForResult;
          pending.materializedNextBasho = result.rank.name === '大関';
          pendingNextBasho.delete(result.id);
        }
      }
    }

    const resultById = new Map((world.lastBashoResults.Makuuchi ?? []).map((result) => [result.id, result]));
    for (const allocation of world.lastAllocations) {
      if (allocation.nextRank.division !== 'Makuuchi' || allocation.nextRank.name !== '大関') continue;
      const result = resultById.get(allocation.id);
      if (!result?.rank) continue;
      const history = world.recentSekitoriHistory.get(allocation.id) ?? [];
      const pastRecords = history.slice(1, 3);
      const isOzekiReturnAtStart = ozekiReturnAtStart.get(allocation.id) ?? false;
      const snapshotWithoutReturn = toSnapshot(result, pastRecords, false);
      const snapshotWithReturn = toSnapshot(result, pastRecords, isOzekiReturnAtStart);
      const evalWithoutReturn = evaluateSnapshotOzekiPromotion(snapshotWithoutReturn);
      const evalWithReturn = evaluateSnapshotOzekiPromotion(snapshotWithReturn);
      const rosterAfterApplyRank = rosterRankLabel(world, allocation.id);
      const allocationCurrentRank = rankLabel(allocation.currentRank);
      const allocationNextRank = rankLabel(allocation.nextRank);
      const previousBashoRank = previousResultRankById.get(allocation.id) ?? null;
      const traceBase = {
        allocationCurrentRank: allocation.currentRank,
        allocationNextRank: allocation.nextRank,
        isOzekiReturnAtStart,
        formalRecommendedWithoutReturn: evalWithoutReturn.recommended,
        formalRecommendedWithReturn: evalWithReturn.recommended,
        ozekiReturnGatePassed:
          isOzekiReturnAtStart && result.rank.name === '関脇' && result.wins >= 10,
        previousWasOzeki:
          previousBashoRank?.startsWith('大関') === true ||
          bashoStartRankById.get(allocation.id)?.startsWith('大関') === true,
        allocationRosterMismatch:
          allocation.nextRank.name === '大関' && rosterAfterApplyRank?.startsWith('大関') !== true,
      };
      const trace: OzekiMaterializationTrace = {
        worldLabel: label,
        seed,
        basho: b + 1,
        id: allocation.id,
        shikona: allocation.shikona,
        previousBashoRank,
        bashoStartRank: bashoStartRankById.get(allocation.id) ?? null,
        currentResultRank: rankLabel(result.rank),
        allocationCurrentRank,
        allocationNextRank,
        rosterAfterApplyRank,
        nextBashoResultRank: null,
        wins: result.wins,
        losses: result.losses,
        absent: result.absent ?? 0,
        recentWins: [result.wins, ...pastRecords.map((record) => record.wins)],
        recentRanks: [result.rank, ...pastRecords.map((record) => record.rank)].map(rankLabel),
        isOzekiReturnAtStart,
        formalRecommendedWithoutReturn: evalWithoutReturn.recommended,
        formalRecommendedWithReturn: evalWithReturn.recommended,
        ozekiReturnGatePassed: traceBase.ozekiReturnGatePassed,
        materializedInRoster: rosterAfterApplyRank?.startsWith('大関') === true,
        materializedNextBasho: null,
        allocationRosterMismatch: traceBase.allocationRosterMismatch,
        previousWasOzeki: traceBase.previousWasOzeki,
        likelyDiagnosis: classifyTrace(traceBase),
      };
      traces.push(trace);
      pendingNextBasho.set(allocation.id, trace);
    }

    previousResultRankById = currentResultRankById;
  }

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    traces,
  };
};

const summarizeWorld = (world: WorldDiagnostic) => {
  const count = (predicate: (trace: OzekiMaterializationTrace) => boolean): number =>
    world.traces.filter(predicate).length;
  const byDiagnosis = world.traces.reduce<Record<string, number>>((acc, trace) => {
    acc[trace.likelyDiagnosis] = (acc[trace.likelyDiagnosis] ?? 0) + 1;
    return acc;
  }, {});
  return {
    label: world.label,
    seed: world.seed,
    eraSnapshotId: world.eraSnapshotId,
    publicEraLabel: world.publicEraLabel,
    eraTags: world.eraTags,
    totalOzekiNextRank: world.traces.length,
    formalRejectMaterialized: count((trace) => trace.likelyDiagnosis === 'formal_reject_materialized'),
    ozekiReturns: count((trace) => trace.likelyDiagnosis === 'ozeki_return_materialized'),
    validNewPromotions: count((trace) => trace.likelyDiagnosis === 'valid_new_ozeki_promotion'),
    rosterMismatches: count((trace) => trace.allocationRosterMismatch),
    existingOzekiMoves: count((trace) => trace.likelyDiagnosis === 'existing_ozeki_internal_move'),
    byDiagnosis,
  };
};

const writeDocs = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
  diagnostics: WorldDiagnostic[],
): void => {
  const allTraces = diagnostics.flatMap((world) => world.traces);
  const interesting = allTraces.filter((trace) =>
    trace.likelyDiagnosis === 'formal_reject_materialized' ||
    trace.likelyDiagnosis === 'allocation_to_roster_mismatch' ||
    trace.likelyDiagnosis === 'ozeki_return_materialized');

  const md: string[] = [
    '# Ozeki promotion materialization diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseOzekiPromotionMaterialization.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | tags | allocation next O | valid new O | O return | formal reject materialized | existing O move | roster mismatch | diagnosis counts |',
    '| --- | ---:| --- | ---:| ---:| ---:| ---:| ---:| ---:| --- |',
  ];
  for (const summary of summaries) {
    md.push(
      `| ${summary.label} | ${summary.seed} | ${summary.eraTags.join(', ') || '-'} | ${summary.totalOzekiNextRank} | ${summary.validNewPromotions} | ${summary.ozekiReturns} | ${summary.formalRejectMaterialized} | ${summary.existingOzekiMoves} | ${summary.rosterMismatches} | ${Object.entries(summary.byDiagnosis).map(([key, value]) => `${key}:${value}`).join(', ') || '-'} |`,
    );
  }
  md.push('');
  md.push('## Interesting traces');
  md.push('');
  md.push('| world | seed | basho | id | prev / start / current / allocation / roster / next | record | recent wins | recent ranks | return? | formal no-return / with-return | diagnosis |');
  md.push('| --- | ---:| ---:| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const trace of interesting) {
    md.push(
      `| ${trace.worldLabel} | ${trace.seed} | ${trace.basho} | ${trace.id} | ${trace.previousBashoRank ?? '-'} / ${trace.bashoStartRank ?? '-'} / ${trace.currentResultRank} / ${trace.allocationCurrentRank}->${trace.allocationNextRank} / ${trace.rosterAfterApplyRank ?? '-'} / ${trace.nextBashoResultRank ?? '-'} | ${trace.wins}-${trace.losses}-${trace.absent} | ${trace.recentWins.join('/')} | ${trace.recentRanks.join(' / ')} | ${trace.isOzekiReturnAtStart ? 'yes' : 'no'} | ${trace.formalRecommendedWithoutReturn ? 'yes' : 'no'} / ${trace.formalRecommendedWithReturn ? 'yes' : 'no'} | ${trace.likelyDiagnosis} |`,
    );
  }
  md.push('');
  md.push('## Reading');
  md.push('');
  md.push('- `formal reject materialized` は、大関特例復帰でも33勝新大関でもないのに `allocation.nextRank=大関` かつ roster/次場所で大関になったケース。');
  md.push('- `ozeki_return_materialized` は、`world.ozekiReturnById` が立っている関脇10勝以上の特例復帰。new O promotion と分けて数えるべき。');
  md.push('- `allocation_to_roster_mismatch` は `BanzukeAllocation.nextRank` と `applyBanzukeToRosters` 後の label が食い違うケース。');
  fs.writeFileSync(path.join(outDir, 'ozeki_promotion_materialization_diagnostics.md'), md.join('\n'));

  const audit: string[] = [
    '# Ozeki promotion materialization audit',
    '',
    '## Scope',
    '',
    '大関昇進頻度診断で suspicious と出た REJECT 相当の候補が、本当に大関として materialize しているかを確認する。',
    '',
    '## Result',
    '',
    summaries.some((summary) => summary.formalRejectMaterialized > 0)
      ? 'formal gate を満たさないまま大関として materialize するケースが残っている。本体修正候補だが、昇進条件を厳しくする前に allocation / return-state carry の境界を最小修正すべき。'
      : 'formal gate REJECT のまま大関として materialize する本体バグは、この診断範囲では確認されない。前回の suspicious は主に診断側が大関特例復帰または既存大関状態を new O promotion と混同した可能性が高い。',
    '',
    '## Fix decision',
    '',
    '本体ロジックは変更しない。診断側は `isOzekiReturn` を渡し、新大関昇進と大関特例復帰を分離して読む必要がある。',
    '',
    '## Guardrails',
    '',
    '- 大関昇進条件をこの結果だけで厳格化しない。',
    '- 横綱・大関人数ハード上限を入れない。',
    '- 強制引退・強制降格を入れない。',
    '- battle / torikumi 本体を触らない。',
  ];
  fs.writeFileSync(path.join(outDir, 'ozeki_promotion_materialization_audit.md'), audit.join('\n'));
};

const main = async (): Promise<void> => {
  const diagnostics: WorldDiagnostic[] = [];
  for (const seed of SEEDS) {
    for (const spec of buildWorldSpecs()) {
      const diagnostic = await runWorld(seed, spec);
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }
  const summaries = diagnostics.map(summarizeWorld);
  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'ozeki_promotion_materialization_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seeds: SEEDS, summaries, raw: diagnostics }, null, 2),
  );
  writeDocs(outDir, summaries, diagnostics);

  console.log(`Ozeki promotion materialization diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  for (const summary of summaries) {
    console.log('');
    console.log(`=== ${summary.label} seed=${summary.seed} ===`);
    if (summary.eraTags.length > 0) console.log(`  eraTags=${summary.eraTags.join(',')}`);
    console.log(
      `  nextO=${summary.totalOzekiNextRank} validNew=${summary.validNewPromotions} returns=${summary.ozekiReturns} formalRejectMaterialized=${summary.formalRejectMaterialized} existingO=${summary.existingOzekiMoves} rosterMismatch=${summary.rosterMismatches}`,
    );
    console.log(
      `  diagnosis=${Object.entries(summary.byDiagnosis).map(([key, value]) => `${key}:${value}`).join(', ') || '-'}`,
    );
  }
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
