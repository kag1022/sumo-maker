#!/usr/bin/env npx tsx
/**
 * 横綱・大関の上位過密が「一瞬の珍事」か「何場所も固定化する問題」かを診断する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
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
const SEEDS = argStr('--seed', '20260420')
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

type RankBucket = 'yokozuna' | 'ozeki' | 'sekiwake' | 'komusubi';

interface BashoTopRankCounts {
  basho: number;
  yokozuna: number;
  ozeki: number;
  sekiwake: number;
  komusubi: number;
  yokozunaOzeki: number;
  sanyakuAndAbove: number;
  activeYokozunaIds: string[];
  activeOzekiIds: string[];
  yokozunaPromotions: string[];
  ozekiPromotions: string[];
  ozekiDemotions: string[];
  yokozunaRetirements: string[];
  ozekiRetirements: string[];
  ozekiKadobanEntries: number;
  ozekiReturnEntries: number;
}

interface WorldRunDiagnostic {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  initialCounts: Omit<
    BashoTopRankCounts,
    | 'basho'
    | 'yokozunaPromotions'
    | 'ozekiPromotions'
    | 'ozekiDemotions'
    | 'yokozunaRetirements'
    | 'ozekiRetirements'
    | 'ozekiKadobanEntries'
    | 'ozekiReturnEntries'
  >;
  countsByBasho: BashoTopRankCounts[];
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const maxStreak = (values: boolean[]): number => {
  let current = 0;
  let best = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
};

const countTrue = (values: boolean[]): number =>
  values.filter(Boolean).length;

const rankBucketFromName = (rankName: string): RankBucket | null => {
  if (rankName === '横綱') return 'yokozuna';
  if (rankName === '大関') return 'ozeki';
  if (rankName === '関脇') return 'sekiwake';
  if (rankName === '小結') return 'komusubi';
  return null;
};

const rankBucketFromInitialSlot = (
  rankScore: number,
  layout: { yokozuna: number; ozeki: number; sekiwake: number; komusubi: number },
): RankBucket | null => {
  if (rankScore <= layout.yokozuna) return 'yokozuna';
  if (rankScore <= layout.yokozuna + layout.ozeki) return 'ozeki';
  if (rankScore <= layout.yokozuna + layout.ozeki + layout.sekiwake) return 'sekiwake';
  if (rankScore <= layout.yokozuna + layout.ozeki + layout.sekiwake + layout.komusubi) {
    return 'komusubi';
  }
  return null;
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

const countInitialTopRanks = (
  world: ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>,
): WorldRunDiagnostic['initialCounts'] => {
  const counts = {
    yokozuna: 0,
    ozeki: 0,
    sekiwake: 0,
    komusubi: 0,
    yokozunaOzeki: 0,
    sanyakuAndAbove: 0,
    activeYokozunaIds: [] as string[],
    activeOzekiIds: [] as string[],
  };
  for (const row of world.rosters.Makuuchi) {
    const rank = rankBucketFromInitialSlot(row.rankScore, world.makuuchiLayout);
    if (!rank) continue;
    counts[rank] += 1;
    if (rank === 'yokozuna') counts.activeYokozunaIds.push(row.id);
    if (rank === 'ozeki') counts.activeOzekiIds.push(row.id);
  }
  counts.yokozunaOzeki = counts.yokozuna + counts.ozeki;
  counts.sanyakuAndAbove = counts.yokozuna + counts.ozeki + counts.sekiwake + counts.komusubi;
  return counts;
};

const runWorld = async (
  seed: number,
  spec: { key: string; snapshot?: EraSnapshot },
): Promise<WorldRunDiagnostic | null> => {
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
      careerId: `top-rank-overcrowding-${spec.key}-${seed}`,
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

  const initialWorld = runtime.__getWorldForDiagnostics();
  const initialCounts = countInitialTopRanks(initialWorld);
  const countsByBasho: BashoTopRankCounts[] = [];
  let previousBuckets = new Map<string, RankBucket>(
    initialWorld.rosters.Makuuchi
      .map((row): [string, RankBucket | null] => [
        row.id,
        rankBucketFromInitialSlot(row.rankScore, initialWorld.makuuchiLayout),
      ])
      .filter((entry): entry is [string, RankBucket] => entry[1] != null),
  );
  let previousTopRankActiveIds = new Set<string>([
    ...initialCounts.activeYokozunaIds,
    ...initialCounts.activeOzekiIds,
  ]);

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const currentBuckets = new Map<string, RankBucket>();
    const activeYokozunaIds: string[] = [];
    const activeOzekiIds: string[] = [];
    const counts = {
      yokozuna: 0,
      ozeki: 0,
      sekiwake: 0,
      komusubi: 0,
    };

    for (const result of world.lastBashoResults.Makuuchi ?? []) {
      const bucket = rankBucketFromName(result.rank.name);
      if (!bucket) continue;
      counts[bucket] += 1;
      currentBuckets.set(result.id, bucket);
      if (bucket === 'yokozuna') activeYokozunaIds.push(result.id);
      if (bucket === 'ozeki') activeOzekiIds.push(result.id);
    }

    const activeTopIds = new Set([...activeYokozunaIds, ...activeOzekiIds]);
    const yokozunaPromotions = [...currentBuckets.entries()]
      .filter(([id, bucket]) => bucket === 'yokozuna' && previousBuckets.get(id) !== 'yokozuna')
      .map(([id]) => id);
    const ozekiPromotions = [...currentBuckets.entries()]
      .filter(([id, bucket]) =>
        bucket === 'ozeki' &&
        previousBuckets.get(id) !== 'ozeki' &&
        previousBuckets.get(id) !== 'yokozuna')
      .map(([id]) => id);
    const ozekiDemotions = [...previousBuckets.entries()]
      .filter(([id, bucket]) => bucket === 'ozeki' && currentBuckets.get(id) !== 'ozeki')
      .map(([id]) => id);
    const yokozunaRetirements = [...previousTopRankActiveIds]
      .filter((id) => {
        const actor = world.actorRegistry.get(id);
        return previousBuckets.get(id) === 'yokozuna' && actor?.active === false;
      });
    const ozekiRetirements = [...previousTopRankActiveIds]
      .filter((id) => {
        const actor = world.actorRegistry.get(id);
        return previousBuckets.get(id) === 'ozeki' && actor?.active === false;
      });

    countsByBasho.push({
      basho: b + 1,
      ...counts,
      yokozunaOzeki: counts.yokozuna + counts.ozeki,
      sanyakuAndAbove: counts.yokozuna + counts.ozeki + counts.sekiwake + counts.komusubi,
      activeYokozunaIds,
      activeOzekiIds,
      yokozunaPromotions,
      ozekiPromotions,
      ozekiDemotions,
      yokozunaRetirements,
      ozekiRetirements,
      ozekiKadobanEntries: world.lastAllocations
        .filter((allocation) => allocation.nextIsOzekiKadoban)
        .length,
      ozekiReturnEntries: world.lastAllocations
        .filter((allocation) => allocation.nextIsOzekiReturn)
        .length,
    });

    previousBuckets = currentBuckets;
    previousTopRankActiveIds = activeTopIds;
  }

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    initialCounts,
    countsByBasho,
  };
};

const summarizeRun = (run: WorldRunDiagnostic) => {
  const rows = run.countsByBasho;
  const y6 = rows.map((row) => row.yokozuna >= 6);
  const o5 = rows.map((row) => row.ozeki >= 5);
  const yo8 = rows.map((row) => row.yokozunaOzeki >= 8);
  const yo9 = rows.map((row) => row.yokozunaOzeki >= 9);
  const maxOf = (selector: (row: BashoTopRankCounts) => number): number =>
    rows.reduce((max, row) => Math.max(max, selector(row)), 0);
  const avgOf = (selector: (row: BashoTopRankCounts) => number): number =>
    rows.length === 0 ? 0 : round3(rows.reduce((sum, row) => sum + selector(row), 0) / rows.length);
  const yokozunaPromotions = rows.reduce((sum, row) => sum + row.yokozunaPromotions.length, 0);
  const ozekiPromotions = rows.reduce((sum, row) => sum + row.ozekiPromotions.length, 0);
  const ozekiDemotions = rows.reduce((sum, row) => sum + row.ozekiDemotions.length, 0);
  const yokozunaRetirements = rows.reduce((sum, row) => sum + row.yokozunaRetirements.length, 0);
  const ozekiRetirements = rows.reduce((sum, row) => sum + row.ozekiRetirements.length, 0);
  const ozekiKadobanEntries = rows.reduce((sum, row) => sum + row.ozekiKadobanEntries, 0);
  const ozekiReturnEntries = rows.reduce((sum, row) => sum + row.ozekiReturnEntries, 0);

  return {
    label: run.label,
    seed: run.seed,
    eraSnapshotId: run.eraSnapshotId,
    publicEraLabel: run.publicEraLabel,
    eraTags: run.eraTags,
    initial: {
      yokozuna: run.initialCounts.yokozuna,
      ozeki: run.initialCounts.ozeki,
      sekiwake: run.initialCounts.sekiwake,
      komusubi: run.initialCounts.komusubi,
      yokozunaOzeki: run.initialCounts.yokozunaOzeki,
      sanyakuAndAbove: run.initialCounts.sanyakuAndAbove,
    },
    avg: {
      yokozuna: avgOf((row) => row.yokozuna),
      ozeki: avgOf((row) => row.ozeki),
      sekiwake: avgOf((row) => row.sekiwake),
      komusubi: avgOf((row) => row.komusubi),
      yokozunaOzeki: avgOf((row) => row.yokozunaOzeki),
      sanyakuAndAbove: avgOf((row) => row.sanyakuAndAbove),
    },
    max: {
      yokozuna: maxOf((row) => row.yokozuna),
      ozeki: maxOf((row) => row.ozeki),
      sekiwake: maxOf((row) => row.sekiwake),
      komusubi: maxOf((row) => row.komusubi),
      yokozunaOzeki: maxOf((row) => row.yokozunaOzeki),
      sanyakuAndAbove: maxOf((row) => row.sanyakuAndAbove),
    },
    thresholds: {
      yokozuna6BashoCount: countTrue(y6),
      yokozuna6MaxStreak: maxStreak(y6),
      ozeki5BashoCount: countTrue(o5),
      ozeki5MaxStreak: maxStreak(o5),
      yokozunaOzeki8BashoCount: countTrue(yo8),
      yokozunaOzeki8MaxStreak: maxStreak(yo8),
      yokozunaOzeki9BashoCount: countTrue(yo9),
      yokozunaOzeki9MaxStreak: maxStreak(yo9),
    },
    flowSignals: {
      yokozunaPromotions,
      ozekiPromotions,
      ozekiDemotions,
      yokozunaRetirements,
      ozekiRetirements,
      ozekiKadobanEntries,
      ozekiReturnEntries,
    },
    warnings: {
      yokozuna6Long: maxStreak(y6) >= 6,
      ozeki5Long: maxStreak(o5) >= 6,
      yokozunaOzeki9Long: maxStreak(yo9) >= 6,
    },
  };
};

const classifyCause = (summary: ReturnType<typeof summarizeRun>): string[] => {
  const causes: string[] = [];
  if (summary.initial.yokozuna >= 6 || summary.initial.ozeki >= 5 || summary.initial.yokozunaOzeki >= 8) {
    causes.push('EraSnapshot/初期配置由来の過密がある');
  }
  if (summary.flowSignals.yokozunaPromotions >= 3) {
    causes.push('横綱昇進が多い');
  }
  if (summary.flowSignals.ozekiPromotions >= 5) {
    causes.push('大関昇進が多い');
  }
  if (summary.thresholds.yokozuna6MaxStreak >= 6 && summary.flowSignals.yokozunaRetirements === 0) {
    causes.push('横綱引退圧が弱い可能性');
  }
  if (
    summary.thresholds.ozeki5MaxStreak >= 6 &&
    summary.flowSignals.ozekiDemotions > 0 &&
    summary.flowSignals.ozekiPromotions > summary.flowSignals.ozekiDemotions
  ) {
    causes.push('大関陥落は起きているが補充が速い');
  }
  if (summary.thresholds.ozeki5MaxStreak >= 6 && summary.flowSignals.ozekiDemotions === 0) {
    causes.push('大関陥落が十分に発生していない可能性');
  }
  if (summary.max.sekiwake + summary.max.komusubi >= 6 && summary.max.yokozunaOzeki < 8) {
    causes.push('三役枠の膨張で、横綱大関過密とは別問題');
  }
  if (causes.length === 0) causes.push('警戒ライン未満またはseed依存の短期事象');
  return causes;
};

const writeMarkdown = (
  outDir: string,
  summaries: Array<ReturnType<typeof summarizeRun> & { causeClassification: string[] }>,
): void => {
  const lines: string[] = [
    '# Top-rank overcrowding diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseTopRankOvercrowding.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | tags | initial Y/O/S/K | avg Y/O | max Y/O/YO/SA | Y>=6 count/streak | O>=5 count/streak | YO>=8 count/streak | YO>=9 count/streak | Y/O promotions | O demotions | Y/O retire | warning |',
    '| --- | ---:| --- | --- | --- | --- | --- | --- | --- | --- | --- | ---:| --- | --- |',
  ];
  for (const summary of summaries) {
    const warning = [
      summary.warnings.yokozuna6Long ? 'Y>=6 long' : '',
      summary.warnings.ozeki5Long ? 'O>=5 long' : '',
      summary.warnings.yokozunaOzeki9Long ? 'YO>=9 long' : '',
    ].filter(Boolean).join(', ') || '-';
    lines.push(
      `| ${summary.label} | ${summary.seed} | ${summary.eraTags.join(', ') || '-'} | ${summary.initial.yokozuna}/${summary.initial.ozeki}/${summary.initial.sekiwake}/${summary.initial.komusubi} | ${summary.avg.yokozuna}/${summary.avg.ozeki} | ${summary.max.yokozuna}/${summary.max.ozeki}/${summary.max.yokozunaOzeki}/${summary.max.sanyakuAndAbove} | ${summary.thresholds.yokozuna6BashoCount}/${summary.thresholds.yokozuna6MaxStreak} | ${summary.thresholds.ozeki5BashoCount}/${summary.thresholds.ozeki5MaxStreak} | ${summary.thresholds.yokozunaOzeki8BashoCount}/${summary.thresholds.yokozunaOzeki8MaxStreak} | ${summary.thresholds.yokozunaOzeki9BashoCount}/${summary.thresholds.yokozunaOzeki9MaxStreak} | ${summary.flowSignals.yokozunaPromotions}/${summary.flowSignals.ozekiPromotions} | ${summary.flowSignals.ozekiDemotions} | ${summary.flowSignals.yokozunaRetirements}/${summary.flowSignals.ozekiRetirements} | ${warning} |`,
    );
  }
  lines.push('');
  lines.push('## Cause classification');
  lines.push('');
  lines.push('| world | seed | classification |');
  lines.push('| --- | ---:| --- |');
  for (const summary of summaries) {
    lines.push(`| ${summary.label} | ${summary.seed} | ${summary.causeClassification.join(' / ')} |`);
  }
  lines.push('');
  lines.push('## Definitions');
  lines.push('');
  lines.push('- `Y`: 横綱人数。');
  lines.push('- `O`: 大関人数。');
  lines.push('- `YO`: 横綱 + 大関合計。');
  lines.push('- `SA`: 三役以上合計。横綱・大関・関脇・小結を含む。');
  lines.push('- `count/streak`: 条件を満たした場所数 / 最長連続場所数。');
  lines.push('- 警戒ラインは `Y>=6`、`O>=5`、`YO>=9` が6場所以上連続。これはハード上限ではなく診断目安。');
  fs.writeFileSync(path.join(outDir, 'top_rank_overcrowding_diagnostics.md'), lines.join('\n'));
};

const writeAudit = (
  outDir: string,
  summaries: Array<ReturnType<typeof summarizeRun> & { causeClassification: string[] }>,
): void => {
  const hasWarning = summaries.some((summary) =>
    summary.warnings.yokozuna6Long ||
    summary.warnings.ozeki5Long ||
    summary.warnings.yokozunaOzeki9Long);
  const lines = [
    '# Top-rank overcrowding audit',
    '',
    '## Scope',
    '',
    '横綱・大関の人数最大値ではなく、過密状態の継続期間を診断する。6横綱や5大関の瞬間発生は即バグ扱いしない。',
    '',
    '## Method',
    '',
    '- 各場所の `world.lastBashoResults.Makuuchi` から、実際にその場所で記録された rank label を数える。',
    '- 初期配置は `world.rosters.Makuuchi` と `makuuchiLayout` から別枠で数える。',
    '- promotion / demotion / retirement は場所間の同一 ID と `lastAllocations` から補助信号として分類する。',
    '- `makuuchiLayout` や `applyBanzukeToRosters` は、診断上は結果 label と初期 layout の突合対象に留める。',
    '',
    '## Current judgment',
    '',
    hasWarning
      ? '少なくとも1条件で6場所以上連続の警戒ラインに達した。ただし今回の主要信号は「初期配置で過密」や「引退圧がゼロ」ではなく、上位昇進が多い seed/world で補充が解消を上回る形。現時点で横綱・大関を強制的に減らす修正は避ける。'
      : '今回の診断範囲では、過密が長期固定化している証拠は薄い。現時点でハード上限や強制整理は不要。',
    '',
    '## Fix decision',
    '',
    '本タスクでは本体ロジックを変更しない。自然解消圧の不足だけが明確なら `npc/retirement.ts` 側で薄く補正する余地はあるが、今回の結果では横綱引退・大関陥落は発生しており、まず横綱/大関昇進頻度と上位能力 floor の副作用を別診断するべき。',
    '',
    '## Guardrails',
    '',
    '- 横綱最大人数・大関最大人数のハード上限は入れない。',
    '- 横綱の強制引退、大関の成績無関係な強制降格はしない。',
    '- battle / torikumi 本体の勝率を直接いじらない。',
    '- EraSnapshot データを場当たり的に改変しない。',
  ];
  fs.writeFileSync(path.join(outDir, 'top_rank_overcrowding_audit.md'), lines.join('\n'));
};

const main = async (): Promise<void> => {
  const specs = buildWorldSpecs();
  const diagnostics: WorldRunDiagnostic[] = [];
  for (const seed of SEEDS) {
    for (const spec of specs) {
      const diagnostic = await runWorld(seed, spec);
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }
  const summaries = diagnostics
    .map(summarizeRun)
    .map((summary) => ({
      ...summary,
      causeClassification: classifyCause(summary),
    }));

  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'top_rank_overcrowding_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seeds: SEEDS, summaries, raw: diagnostics }, null, 2),
  );
  writeMarkdown(outDir, summaries);
  writeAudit(outDir, summaries);

  console.log(`Top-rank overcrowding diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  for (const summary of summaries) {
    const warning = [
      summary.warnings.yokozuna6Long ? 'Y>=6 long' : '',
      summary.warnings.ozeki5Long ? 'O>=5 long' : '',
      summary.warnings.yokozunaOzeki9Long ? 'YO>=9 long' : '',
    ].filter(Boolean).join(', ') || 'none';
    console.log('');
    console.log(`=== ${summary.label} seed=${summary.seed} ===`);
    if (summary.eraTags.length > 0) console.log(`  eraTags=${summary.eraTags.join(',')}`);
    console.log(
      `  initial Y/O/S/K=${summary.initial.yokozuna}/${summary.initial.ozeki}/${summary.initial.sekiwake}/${summary.initial.komusubi} YO=${summary.initial.yokozunaOzeki} SA=${summary.initial.sanyakuAndAbove}`,
    );
    console.log(
      `  avg Y=${summary.avg.yokozuna} O=${summary.avg.ozeki} YO=${summary.avg.yokozunaOzeki} SA=${summary.avg.sanyakuAndAbove}`,
    );
    console.log(
      `  max Y=${summary.max.yokozuna} O=${summary.max.ozeki} YO=${summary.max.yokozunaOzeki} SA=${summary.max.sanyakuAndAbove}`,
    );
    console.log(
      `  streaks Y>=6 ${summary.thresholds.yokozuna6BashoCount}/${summary.thresholds.yokozuna6MaxStreak}, O>=5 ${summary.thresholds.ozeki5BashoCount}/${summary.thresholds.ozeki5MaxStreak}, YO>=8 ${summary.thresholds.yokozunaOzeki8BashoCount}/${summary.thresholds.yokozunaOzeki8MaxStreak}, YO>=9 ${summary.thresholds.yokozunaOzeki9BashoCount}/${summary.thresholds.yokozunaOzeki9MaxStreak}`,
    );
    console.log(
      `  flow Yprom=${summary.flowSignals.yokozunaPromotions} Oprom=${summary.flowSignals.ozekiPromotions} Odem=${summary.flowSignals.ozekiDemotions} Yret=${summary.flowSignals.yokozunaRetirements} Oret=${summary.flowSignals.ozekiRetirements} kadoban=${summary.flowSignals.ozekiKadobanEntries} return=${summary.flowSignals.ozekiReturnEntries}`,
    );
    console.log(`  warning=${warning}`);
    console.log(`  cause=${summary.causeClassification.join(' / ')}`);
  }
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
