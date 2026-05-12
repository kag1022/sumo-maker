#!/usr/bin/env npx tsx
/**
 * 横綱の15日皆勤負け越しが、期待勝数・対戦相手・在位期間・状態のどこから
 * 発生しているかを分解する診断。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';
import type { DivisionBashoSnapshot } from '../../src/logic/simulation/world/types';

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
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

type RankBucket = '横綱' | '大関' | '三役' | '平幕' | 'その他';
type TenureBucket = 'new1to3' | 'mid4to12' | 'long13plus';
type AgeBucket = 'u24' | '24to27' | '28to31' | '32plus';

interface StatBucket {
  count: number;
  makekoshi: number;
  winsSum: number;
  expectedWinsSum: number;
  performanceSum: number;
  abilitySum: number;
  seasonalAbilitySum: number;
  basePowerSum: number;
  opponentAbilitySum: number;
}

interface BoutBucket {
  bouts: number;
  wins: number;
  expectedWins: number;
}

interface Metrics {
  yokozunaAppearances: number;
  fullAttendanceMakekoshiCount: number;
  fullAttendanceMakekoshiRate: number;
  actualWinsAvg: number;
  expectedWinsAvg: number;
  performanceOverExpectedAvg: number;
  makekoshiActualWinsAvg: number;
  makekoshiExpectedWinsAvg: number;
  makekoshiPerformanceOverExpectedAvg: number;
  makekoshiAbilityAvg: number;
  makekoshiSeasonalAbilityAvg: number;
  makekoshiBasePowerAvg: number;
  makekoshiOpponentAbilityAvg: number;
  yokozunaVsYokozunaBoutRate: number;
}

interface Trace {
  world: string;
  seed: number;
  basho: number;
  id: string;
  shikona: string;
  result: string;
  expectedWins: number;
  performanceOverExpected: number;
  age: number | null;
  careerStage: string | null;
  yokozunaTenure: number;
  ability: number | null;
  seasonalAbility: number | null;
  basePower: number | null;
  opponentMix: Record<RankBucket, string>;
}

interface WorldSummary {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  eraTags: string[];
  metrics: Metrics;
  byAge: Record<AgeBucket, StatBucket>;
  byCareerStage: Record<string, StatBucket>;
  byTenure: Record<TenureBucket, StatBucket>;
  byYokozunaCount: Record<string, StatBucket>;
  boutByOpponentRank: Record<RankBucket, BoutBucket>;
  traces: Trace[];
}

type RuntimeWorld = ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>;
type BoutRow = NonNullable<RuntimeWorld['lastTopDivisionBoutRows']>[number];

const zeroStat = (): StatBucket => ({
  count: 0,
  makekoshi: 0,
  winsSum: 0,
  expectedWinsSum: 0,
  performanceSum: 0,
  abilitySum: 0,
  seasonalAbilitySum: 0,
  basePowerSum: 0,
  opponentAbilitySum: 0,
});

const zeroBout = (): BoutBucket => ({ bouts: 0, wins: 0, expectedWins: 0 });

const rankBuckets = (): Record<RankBucket, BoutBucket> => ({
  横綱: zeroBout(),
  大関: zeroBout(),
  三役: zeroBout(),
  平幕: zeroBout(),
  その他: zeroBout(),
});

const ageBucket = (age: number | undefined): AgeBucket => {
  if (age == null) return 'u24';
  if (age < 24) return 'u24';
  if (age <= 27) return '24to27';
  if (age <= 31) return '28to31';
  return '32plus';
};

const tenureBucket = (tenure: number): TenureBucket => {
  if (tenure <= 3) return 'new1to3';
  if (tenure <= 12) return 'mid4to12';
  return 'long13plus';
};

const opponentBucket = (rankName?: string): RankBucket => {
  if (rankName === '横綱') return '横綱';
  if (rankName === '大関') return '大関';
  if (rankName === '関脇' || rankName === '小結') return '三役';
  if (rankName === '前頭') return '平幕';
  return 'その他';
};

const addStat = (
  bucket: StatBucket,
  result: DivisionBashoSnapshot,
  input: {
    makekoshi: boolean;
    ability: number;
    seasonalAbility: number;
    basePower: number;
    opponentAbility: number;
  },
): void => {
  bucket.count += 1;
  if (input.makekoshi) bucket.makekoshi += 1;
  bucket.winsSum += result.wins;
  bucket.expectedWinsSum += result.expectedWins ?? 0;
  bucket.performanceSum += result.performanceOverExpected ?? result.wins - (result.expectedWins ?? result.wins);
  bucket.abilitySum += input.ability;
  bucket.seasonalAbilitySum += input.seasonalAbility;
  bucket.basePowerSum += input.basePower;
  bucket.opponentAbilitySum += input.opponentAbility;
};

const mergeStat = (into: StatBucket, from: StatBucket): void => {
  into.count += from.count;
  into.makekoshi += from.makekoshi;
  into.winsSum += from.winsSum;
  into.expectedWinsSum += from.expectedWinsSum;
  into.performanceSum += from.performanceSum;
  into.abilitySum += from.abilitySum;
  into.seasonalAbilitySum += from.seasonalAbilitySum;
  into.basePowerSum += from.basePowerSum;
  into.opponentAbilitySum += from.opponentAbilitySum;
};

const pct = (num: number, den: number): number =>
  den > 0 ? Math.round((num / den) * 10000) / 100 : 0;

const avg = (sum: number, count: number): number =>
  count > 0 ? Math.round((sum / count) * 100) / 100 : 0;

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

const isYokozuna = (result: DivisionBashoSnapshot): boolean =>
  result.rank?.division === 'Makuuchi' && result.rank.name === '横綱';

const isFullAttendanceMakekoshi = (result: DivisionBashoSnapshot): boolean =>
  result.wins + result.losses === 15 && (result.absent ?? 0) === 0 && result.wins < result.losses;

const collectBoutStats = (
  yokozunaId: string,
  rows: BoutRow[] | undefined,
): { byRank: Record<RankBucket, BoutBucket>; yokozunaBoutCount: number } => {
  const byRank = rankBuckets();
  let yokozunaBoutCount = 0;
  for (const row of rows ?? []) {
    const isA = row.aId === yokozunaId;
    const isB = row.bId === yokozunaId;
    if (!isA && !isB) continue;
    const bucket = opponentBucket(isA ? row.bRankName : row.aRankName);
    const won = isA ? row.aWon === true : row.aWon === false;
    const expected = isA ? row.aWinProbability ?? 0 : 1 - (row.aWinProbability ?? 1);
    byRank[bucket].bouts += 1;
    if (won) byRank[bucket].wins += 1;
    byRank[bucket].expectedWins += expected;
    if (bucket === '横綱') yokozunaBoutCount += 1;
  }
  return { byRank, yokozunaBoutCount };
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
  const label = spec.key === 'legacy'
    ? 'legacy (undefined)'
    : `era:${spec.snapshot?.publicEraLabel} (${spec.snapshot?.id})`;
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `yokozuna-full-attendance-makekoshi-cause-${spec.key}-${seed}`,
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

  const all = zeroStat();
  const makekoshiOnly = zeroStat();
  const byAge: Record<AgeBucket, StatBucket> = {
    u24: zeroStat(),
    '24to27': zeroStat(),
    '28to31': zeroStat(),
    '32plus': zeroStat(),
  };
  const byCareerStage: Record<string, StatBucket> = {};
  const byTenure: Record<TenureBucket, StatBucket> = {
    new1to3: zeroStat(),
    mid4to12: zeroStat(),
    long13plus: zeroStat(),
  };
  const byYokozunaCount: Record<string, StatBucket> = {};
  const boutByOpponentRank = rankBuckets();
  const yokozunaTenureById = new Map<string, number>();
  const traces: Trace[] = [];
  let yokozunaVsYokozunaBouts = 0;
  let yokozunaBouts = 0;

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world: RuntimeWorld = runtime.__getWorldForDiagnostics();
    const boutRows = (world.lastTopDivisionBoutRows ?? []).filter((row) => row.division === 'Makuuchi');
    const yokozunaResults = (world.lastBashoResults.Makuuchi ?? []).filter(isYokozuna);
    const yokozunaCountKey = yokozunaResults.length >= 6 ? 'Y>=6' : yokozunaResults.length >= 4 ? 'Y4-5' : 'Y<=3';
    byYokozunaCount[yokozunaCountKey] = byYokozunaCount[yokozunaCountKey] ?? zeroStat();

    for (const result of yokozunaResults) {
      const npc = world.actorRegistry.get(result.id);
      const tenure = (yokozunaTenureById.get(result.id) ?? 0) + 1;
      yokozunaTenureById.set(result.id, tenure);
      const makekoshi = isFullAttendanceMakekoshi(result);
      const ability = npc?.ability ?? 0;
      const basePower = npc?.basePower ?? 0;
      const seasonalAbility = ability + (npc?.form ?? 1) * 3.2;
      const opponentAbility = result.strengthOfSchedule ?? 0;
      const statInput = { makekoshi, ability, seasonalAbility, basePower, opponentAbility };
      addStat(all, result, statInput);
      addStat(byAge[ageBucket(npc?.age)], result, statInput);
      const stage = npc?.initialCareerStage ?? 'unknown';
      byCareerStage[stage] = byCareerStage[stage] ?? zeroStat();
      addStat(byCareerStage[stage], result, statInput);
      addStat(byTenure[tenureBucket(tenure)], result, statInput);
      addStat(byYokozunaCount[yokozunaCountKey], result, statInput);
      if (makekoshi) addStat(makekoshiOnly, result, statInput);

      const boutStats = collectBoutStats(result.id, boutRows);
      for (const bucket of Object.keys(boutStats.byRank) as RankBucket[]) {
        boutByOpponentRank[bucket].bouts += boutStats.byRank[bucket].bouts;
        boutByOpponentRank[bucket].wins += boutStats.byRank[bucket].wins;
        boutByOpponentRank[bucket].expectedWins += boutStats.byRank[bucket].expectedWins;
      }
      yokozunaVsYokozunaBouts += boutStats.yokozunaBoutCount;
      yokozunaBouts += Object.values(boutStats.byRank).reduce((sum, row) => sum + row.bouts, 0);

      if (makekoshi && traces.length < 120) {
        traces.push({
          world: label,
          seed,
          basho: b + 1,
          id: result.id,
          shikona: result.shikona,
          result: `${result.wins}-${result.losses}-${result.absent ?? 0}`,
          expectedWins: Math.round((result.expectedWins ?? 0) * 100) / 100,
          performanceOverExpected: Math.round((result.performanceOverExpected ?? 0) * 100) / 100,
          age: npc?.age ?? null,
          careerStage: npc?.initialCareerStage ?? null,
          yokozunaTenure: tenure,
          ability: npc?.ability ?? null,
          seasonalAbility,
          basePower: npc?.basePower ?? null,
          opponentMix: Object.fromEntries(
            Object.entries(boutStats.byRank).map(([key, value]) => [
              key,
              `${value.wins}/${value.bouts}`,
            ]),
          ) as Record<RankBucket, string>,
        });
      }
    }
  }

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    metrics: {
      yokozunaAppearances: all.count,
      fullAttendanceMakekoshiCount: makekoshiOnly.count,
      fullAttendanceMakekoshiRate: pct(makekoshiOnly.count, all.count),
      actualWinsAvg: avg(all.winsSum, all.count),
      expectedWinsAvg: avg(all.expectedWinsSum, all.count),
      performanceOverExpectedAvg: avg(all.performanceSum, all.count),
      makekoshiActualWinsAvg: avg(makekoshiOnly.winsSum, makekoshiOnly.count),
      makekoshiExpectedWinsAvg: avg(makekoshiOnly.expectedWinsSum, makekoshiOnly.count),
      makekoshiPerformanceOverExpectedAvg: avg(makekoshiOnly.performanceSum, makekoshiOnly.count),
      makekoshiAbilityAvg: avg(makekoshiOnly.abilitySum, makekoshiOnly.count),
      makekoshiSeasonalAbilityAvg: avg(makekoshiOnly.seasonalAbilitySum, makekoshiOnly.count),
      makekoshiBasePowerAvg: avg(makekoshiOnly.basePowerSum, makekoshiOnly.count),
      makekoshiOpponentAbilityAvg: avg(makekoshiOnly.opponentAbilitySum, makekoshiOnly.count),
      yokozunaVsYokozunaBoutRate: pct(yokozunaVsYokozunaBouts, yokozunaBouts),
    },
    byAge,
    byCareerStage,
    byTenure,
    byYokozunaCount,
    boutByOpponentRank,
    traces,
  };
};

const summarizeBucket = (bucket: StatBucket): string =>
  `${bucket.makekoshi}/${bucket.count} (${pct(bucket.makekoshi, bucket.count)}%), EW ${avg(bucket.expectedWinsSum, bucket.count)}, W ${avg(bucket.winsSum, bucket.count)}`;

const mergeSummaries = (summaries: WorldSummary[]) => {
  const all = zeroStat();
  const makekoshi = zeroStat();
  const byAge: Record<string, StatBucket> = {};
  const byStage: Record<string, StatBucket> = {};
  const byTenure: Record<string, StatBucket> = {};
  const byYokozunaCount: Record<string, StatBucket> = {};
  const bouts = rankBuckets();
  for (const summary of summaries) {
    const worldAll = zeroStat();
    worldAll.count = summary.metrics.yokozunaAppearances;
    worldAll.makekoshi = summary.metrics.fullAttendanceMakekoshiCount;
    worldAll.winsSum = summary.metrics.actualWinsAvg * summary.metrics.yokozunaAppearances;
    worldAll.expectedWinsSum = summary.metrics.expectedWinsAvg * summary.metrics.yokozunaAppearances;
    worldAll.performanceSum = summary.metrics.performanceOverExpectedAvg * summary.metrics.yokozunaAppearances;
    mergeStat(all, worldAll);
    const worldMk = zeroStat();
    worldMk.count = summary.metrics.fullAttendanceMakekoshiCount;
    worldMk.winsSum = summary.metrics.makekoshiActualWinsAvg * worldMk.count;
    worldMk.expectedWinsSum = summary.metrics.makekoshiExpectedWinsAvg * worldMk.count;
    worldMk.performanceSum = summary.metrics.makekoshiPerformanceOverExpectedAvg * worldMk.count;
    mergeStat(makekoshi, worldMk);
    for (const [key, value] of Object.entries(summary.byAge)) {
      byAge[key] = byAge[key] ?? zeroStat();
      mergeStat(byAge[key], value);
    }
    for (const [key, value] of Object.entries(summary.byCareerStage)) {
      byStage[key] = byStage[key] ?? zeroStat();
      mergeStat(byStage[key], value);
    }
    for (const [key, value] of Object.entries(summary.byTenure)) {
      byTenure[key] = byTenure[key] ?? zeroStat();
      mergeStat(byTenure[key], value);
    }
    for (const [key, value] of Object.entries(summary.byYokozunaCount)) {
      byYokozunaCount[key] = byYokozunaCount[key] ?? zeroStat();
      mergeStat(byYokozunaCount[key], value);
    }
    for (const key of Object.keys(summary.boutByOpponentRank) as RankBucket[]) {
      bouts[key].bouts += summary.boutByOpponentRank[key].bouts;
      bouts[key].wins += summary.boutByOpponentRank[key].wins;
      bouts[key].expectedWins += summary.boutByOpponentRank[key].expectedWins;
    }
  }
  return { all, makekoshi, byAge, byStage, byTenure, byYokozunaCount, bouts };
};

const classifyCause = (merged: ReturnType<typeof mergeSummaries>): string[] => {
  const causes: string[] = [];
  const rate = pct(merged.makekoshi.count, merged.all.count);
  const mkExpected = avg(merged.makekoshi.expectedWinsSum, merged.makekoshi.count);
  const allExpected = avg(merged.all.expectedWinsSum, merged.all.count);
  const mkPerf = avg(merged.makekoshi.performanceSum, merged.makekoshi.count);
  const allPerf = avg(merged.all.performanceSum, merged.all.count);
  const newRate = pct(merged.byTenure.new1to3?.makekoshi ?? 0, merged.byTenure.new1to3?.count ?? 0);
  const y6Rate = pct(merged.byYokozunaCount['Y>=6']?.makekoshi ?? 0, merged.byYokozunaCount['Y>=6']?.count ?? 0);
  const yokozunaBoutRate = pct(merged.bouts.横綱.bouts, Object.values(merged.bouts).reduce((sum, row) => sum + row.bouts, 0));
  if (newRate > rate + 8) causes.push('A: 横綱昇進直後の実力が足りていない');
  if (y6Rate > rate + 5 || yokozunaBoutRate > 20) causes.push('B: 横綱過密により横綱同士・上位同士で星を潰し合っている');
  if (mkExpected < 8) causes.push('C: 横綱の expected wins がそもそも低い');
  if (allExpected >= 8 && allPerf <= -0.5 && mkPerf <= -1.5) {
    causes.push('D: expected wins は高いが actual wins が低く、battle variance が大きすぎる');
  }
  if (allExpected < 8) causes.push('E: 横綱の seasonal ability / top-rank floor が不十分');
  if (mkExpected < allExpected - 1 && avg(merged.makekoshi.opponentAbilitySum, merged.makekoshi.count) > 120) causes.push('G: torikumi が横綱に厳しすぎる可能性');
  if (rate > 20) causes.push('I: retirement pressure だけではなく、昇進頻度または上位人数の問題');
  if (causes.length === 0) causes.push('H: 診断側の読み取り問題、または今回KPIでは決定打なし');
  return causes;
};

const writeOutputs = (summaries: WorldSummary[]): void => {
  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  const merged = mergeSummaries(summaries);
  const causes = classifyCause(merged);
  fs.writeFileSync(
    path.join(outDir, 'yokozuna_full_attendance_makekoshi_cause_diagnostics.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), basho: BASHO, seeds: SEEDS, causes, summaries }, null, 2),
  );

  const md: string[] = [
    '# Yokozuna full attendance makekoshi cause diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseYokozunaFullAttendanceMakekoshiCause.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | Y app | full att MK | W avg | EW avg | perf avg | MK W/EW/perf | MK ability/seasonal/base | MK opp ability | Y-vs-Y bout rate |',
    '| --- | ---:| ---:| ---:| ---:| ---:| ---:| --- | --- | ---:| ---:|',
  ];
  for (const summary of summaries) {
    const m = summary.metrics;
    md.push(`| ${summary.label} | ${summary.seed} | ${m.yokozunaAppearances} | ${m.fullAttendanceMakekoshiCount} (${m.fullAttendanceMakekoshiRate}%) | ${m.actualWinsAvg} | ${m.expectedWinsAvg} | ${m.performanceOverExpectedAvg} | ${m.makekoshiActualWinsAvg}/${m.makekoshiExpectedWinsAvg}/${m.makekoshiPerformanceOverExpectedAvg} | ${m.makekoshiAbilityAvg}/${m.makekoshiSeasonalAbilityAvg}/${m.makekoshiBasePowerAvg} | ${m.makekoshiOpponentAbilityAvg} | ${m.yokozunaVsYokozunaBoutRate}% |`);
  }
  md.push('');
  md.push('## Total KPI');
  md.push('');
  md.push(`- yokozuna appearances: ${merged.all.count}`);
  md.push(`- fullAttendanceMakekoshi count / rate: ${merged.makekoshi.count} (${pct(merged.makekoshi.count, merged.all.count)}%)`);
  md.push(`- yokozuna actual wins avg: ${avg(merged.all.winsSum, merged.all.count)}`);
  md.push(`- yokozuna expected wins avg: ${avg(merged.all.expectedWinsSum, merged.all.count)}`);
  md.push(`- yokozuna performance over expected avg: ${avg(merged.all.performanceSum, merged.all.count)}`);
  md.push(`- makekoshi actual / expected / performance: ${avg(merged.makekoshi.winsSum, merged.makekoshi.count)} / ${avg(merged.makekoshi.expectedWinsSum, merged.makekoshi.count)} / ${avg(merged.makekoshi.performanceSum, merged.makekoshi.count)}`);
  md.push('');
  md.push('## Tenure');
  md.push('');
  for (const [key, bucket] of Object.entries(merged.byTenure)) md.push(`- ${key}: ${summarizeBucket(bucket)}`);
  md.push('');
  md.push('## Age');
  md.push('');
  for (const [key, bucket] of Object.entries(merged.byAge)) md.push(`- ${key}: ${summarizeBucket(bucket)}`);
  md.push('');
  md.push('## Career Stage');
  md.push('');
  for (const [key, bucket] of Object.entries(merged.byStage)) md.push(`- ${key}: ${summarizeBucket(bucket)}`);
  md.push('');
  md.push('## Yokozuna Count');
  md.push('');
  for (const [key, bucket] of Object.entries(merged.byYokozunaCount)) md.push(`- ${key}: ${summarizeBucket(bucket)}`);
  md.push('');
  md.push('## Opponent Rank');
  md.push('');
  md.push('| opponent | bouts | wins | win rate | expected wins |');
  md.push('| --- | ---:| ---:| ---:| ---:|');
  for (const [key, bucket] of Object.entries(merged.bouts) as Array<[RankBucket, BoutBucket]>) {
    md.push(`| ${key} | ${bucket.bouts} | ${bucket.wins} | ${pct(bucket.wins, bucket.bouts)}% | ${avg(bucket.expectedWins, bucket.bouts)} |`);
  }
  md.push('');
  md.push('## Cause Classification');
  md.push('');
  for (const cause of causes) md.push(`- ${cause}`);
  md.push('');
  md.push('## Reading');
  md.push('');
  md.push('- `expected wins` が低い場合、横綱として15日出る品質または相手編成の問題を疑う。');
  md.push('- `expected wins` は高いのに実勝数だけ低い場合、battle variance の過大を疑う。');
  md.push('- 昇進直後 bucket が突出する場合、昇進条件の残課題として扱う。ただし今回は昇進条件を雑に再調整しない。');
  md.push('- Y>=6 bucket や横綱同士対戦率が突出する場合、過密と星の潰し合いが主因。');
  md.push('');
  md.push('## Interesting Traces');
  md.push('');
  md.push('| world | seed | basho | id | shikona | result | EW | perf | age | stage | tenure | ability/seasonal/base | opponent mix |');
  md.push('| --- | ---:| ---:| --- | --- | --- | ---:| ---:| ---:| --- | ---:| --- | --- |');
  for (const trace of summaries.flatMap((summary) => summary.traces).slice(0, 80)) {
    md.push(`| ${trace.world} | ${trace.seed} | ${trace.basho} | ${trace.id} | ${trace.shikona} | ${trace.result} | ${trace.expectedWins} | ${trace.performanceOverExpected} | ${trace.age ?? '-'} | ${trace.careerStage ?? '-'} | ${trace.yokozunaTenure} | ${trace.ability?.toFixed(1) ?? '-'}/${trace.seasonalAbility?.toFixed(1) ?? '-'}/${trace.basePower?.toFixed(1) ?? '-'} | Y ${trace.opponentMix.横綱}, O ${trace.opponentMix.大関}, S ${trace.opponentMix.三役}, M ${trace.opponentMix.平幕} |`);
  }
  fs.writeFileSync(path.join(outDir, 'yokozuna_full_attendance_makekoshi_cause_diagnostics.md'), `${md.join('\n')}\n`);

  const audit = [
    '# Yokozuna full attendance makekoshi cause audit',
    '',
    '## Scope',
    '',
    '横綱の15日皆勤負け越しを、retirement 後処理ではなく発生原因側から診断する。',
    '',
    '## Method',
    '',
    '- `world.lastBashoResults.Makuuchi` から横綱の actual wins / expected wins / performance over expected を読む。',
    '- `npcTopDivisionBoutRows` で横綱の相手 rank と勝率を集計する。',
    '- 横綱在位 1-3 / 4-12 / 13+ 場所、年齢、careerStage、横綱人数 bucket で分解する。',
    '',
    '## Guardrails',
    '',
    '- 横綱降格は入れない。',
    '- 横綱人数ハード上限は入れない。',
    '- 成績だけの即強制引退は入れない。',
    '- battle / torikumi 本体は、診断根拠が出るまで大改造しない。',
  ];
  fs.writeFileSync(path.join(outDir, 'yokozuna_full_attendance_makekoshi_cause_audit.md'), `${audit.join('\n')}\n`);
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
  const merged = mergeSummaries(summaries);
  console.log(`Yokozuna full-attendance makekoshi cause diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  console.log(JSON.stringify({
    yokozunaAppearances: merged.all.count,
    fullAttendanceMakekoshi: merged.makekoshi.count,
    rate: pct(merged.makekoshi.count, merged.all.count),
    expectedWinsAvg: avg(merged.all.expectedWinsSum, merged.all.count),
    makekoshiExpectedWinsAvg: avg(merged.makekoshi.expectedWinsSum, merged.makekoshi.count),
    makekoshiPerformanceAvg: avg(merged.makekoshi.performanceSum, merged.makekoshi.count),
    causes: classifyCause(merged),
  }, null, 2));
  console.log('Wrote docs/design/yokozuna_full_attendance_makekoshi_cause_{audit,diagnostics}.{md,json}');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
