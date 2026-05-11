#!/usr/bin/env npx tsx
/**
 * 横綱昇進頻度・過密時 pressure・昇進後成績を再診断する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { evaluateYokozunaPromotion } from '../../src/logic/banzuke/rules/yokozunaPromotion';
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

const BASHO = argInt('--basho', 120);
const SEEDS = argStr('--seeds', argStr('--seed', '20260420'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

type PatternClass = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J';

interface PromotionBashoScore {
  rank: Rank;
  wins: number;
  yusho: boolean;
  junYusho: boolean;
  equivalent: number;
}

interface FollowUpRecord {
  bashoOffset: number;
  wins: number;
  losses: number;
  absent: number;
  yusho: boolean;
  rankName: string;
  active: boolean;
}

interface PromotionTrace {
  basho: number;
  seed: number;
  worldLabel: string;
  eraSnapshotId: string | null;
  eraTags: string[];
  id: string;
  shikona: string;
  decisionBand: string;
  current: PromotionBashoScore;
  previous: PromotionBashoScore;
  currentYokozunaCount: number;
  currentOzekiCount: number;
  populationPressure: number;
  requiredTotalScore: number;
  baselineRequiredTotalScore: number;
  combinedEquivalent: number;
  wouldPromoteWithoutPressure: boolean;
  pressureBlockedPromotion: boolean;
  pressureRelaxedPromotion: boolean;
  actualWinsTotal: number;
  effectiveYushoScore: number;
  patternClasses: PatternClass[];
  followUp: FollowUpRecord[];
  retiredWithin6: boolean;
}

interface WorldDiagnostic {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  promotions: PromotionTrace[];
  pressureCandidates: {
    withoutPressurePromote: number;
    pressureBlocked: number;
    pressureRelaxed: number;
  };
  streaks: {
    yGte6Count: number;
    yGte6Streak: number;
    yoGte9Count: number;
    yoGte9Streak: number;
  };
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const avg = (values: number[]): number | null =>
  values.length === 0 ? null : round3(values.reduce((sum, value) => sum + value, 0) / values.length);

const pct = (count: number, total: number): number =>
  total === 0 ? 0 : round3(count / total);

const histogram = (values: Array<number | string>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const value of values) out[String(value)] = (out[String(value)] ?? 0) + 1;
  return out;
};

const rankLabel = (rank: Rank): string =>
  `${rank.name}${rank.number ?? ''}${rank.side === 'West' ? '西' : '東'}`;

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

const toBashoSnapshot = (
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
  topRankPopulation?: { currentYokozunaCount: number; currentOzekiCount: number },
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
  topRankPopulation,
});

const toEquivalent = (wins: number, yusho?: boolean, junYusho?: boolean): number => {
  if (yusho) {
    if (wins >= 14) return Math.max(wins, 14.5);
    if (wins === 13) return 13.5;
    if (wins === 12) return 12.5;
    if (wins === 11) return 11.5;
    return wins;
  }
  if (junYusho) return Math.max(wins, 13.5);
  return wins;
};

const toPromotionBashoScore = (
  record: { rank: Rank; wins: number; yusho?: boolean; junYusho?: boolean },
): PromotionBashoScore => ({
  rank: record.rank,
  wins: record.wins,
  yusho: record.yusho ?? false,
  junYusho: record.junYusho ?? false,
  equivalent: toEquivalent(record.wins, record.yusho, record.junYusho),
});

const resolvePatternClasses = (
  current: PromotionBashoScore,
  previous: PromotionBashoScore,
  currentYokozunaCount: number,
): PatternClass[] => {
  const classes = new Set<PatternClass>();
  const yushoScores = [current, previous].filter((row) => row.yusho).map((row) => row.wins);
  const hasYushoPair = current.yusho && previous.yusho;
  const hasJunYusho = current.junYusho || previous.junYusho;
  if (hasYushoPair && current.wins >= 14 && previous.wins >= 14) classes.add('A');
  if (hasYushoPair && yushoScores.includes(13) && yushoScores.some((wins) => wins >= 14)) classes.add('B');
  if (hasYushoPair && current.wins === 13 && previous.wins === 13) classes.add('C');
  if (yushoScores.some((wins) => wins <= 12)) classes.add('D');
  if (hasJunYusho && (current.yusho || previous.yusho)) classes.add('E');
  if (hasYushoPair && (current.wins < 14 || previous.wins < 14)) classes.add('F');
  if (currentYokozunaCount >= 4) classes.add('G');
  if (currentYokozunaCount <= 1) classes.add('H');
  if (classes.size === 0 || (classes.size === 1 && (classes.has('G') || classes.has('H')))) classes.add('J');
  return Array.from(classes);
};

const updateStreak = (
  condition: boolean,
  state: { count: number; current: number; max: number },
): void => {
  if (condition) {
    state.count += 1;
    state.current += 1;
    state.max = Math.max(state.max, state.current);
  } else {
    state.current = 0;
  }
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
      careerId: `yokozuna-promotion-frequency-recheck-${spec.key}-${seed}`,
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

  const promotions: PromotionTrace[] = [];
  const pending = new Map<string, PromotionTrace>();
  const pressureCandidates = {
    withoutPressurePromote: 0,
    pressureBlocked: 0,
    pressureRelaxed: 0,
  };
  const yGte6 = { count: 0, current: 0, max: 0 };
  const yoGte9 = { count: 0, current: 0, max: 0 };

  for (let b = 0; b < BASHO; b += 1) {
    const beforeWorld = runtime.__getWorldForDiagnostics();
    const topRankPopulation = {
      currentYokozunaCount: beforeWorld.makuuchiLayout.yokozuna,
      currentOzekiCount: beforeWorld.makuuchiLayout.ozeki,
    };
    updateStreak(topRankPopulation.currentYokozunaCount >= 6, yGte6);
    updateStreak(topRankPopulation.currentYokozunaCount + topRankPopulation.currentOzekiCount >= 9, yoGte9);

    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;

    const world = runtime.__getWorldForDiagnostics();
    const results = world.lastBashoResults.Makuuchi ?? [];
    const resultById = new Map(results.map((result) => [result.id, result]));

    for (const [id, trace] of pending) {
      const result = resultById.get(id);
      const actor = world.actorRegistry.get(id);
      const active = actor?.active !== false;
      if (result?.rank) {
        trace.followUp.push({
          bashoOffset: b + 1 - trace.basho,
          wins: result.wins,
          losses: result.losses,
          absent: result.absent ?? 0,
          yusho: result.yusho ?? false,
          rankName: result.rank.name,
          active,
        });
      } else if (!active) {
        trace.retiredWithin6 = b + 1 - trace.basho <= 6;
      }
      if (trace.followUp.length >= 6 || !active) pending.delete(id);
    }

    for (const result of results) {
      if (!result.rank || result.rank.name !== '大関') continue;
      const pastRecords = (world.recentSekitoriHistory.get(result.id) ?? []).slice(1, 3);
      const snapshot = toBashoSnapshot(result, pastRecords, topRankPopulation);
      const baselineSnapshot = { ...snapshot, topRankPopulation: undefined };
      const actual = evaluateYokozunaPromotion(snapshot).promote;
      const baseline = evaluateYokozunaPromotion(baselineSnapshot).promote;
      if (baseline) pressureCandidates.withoutPressurePromote += 1;
      if (baseline && !actual) pressureCandidates.pressureBlocked += 1;
      if (!baseline && actual) pressureCandidates.pressureRelaxed += 1;
    }

    const allocationPromotions = world.lastAllocations.filter((allocation) =>
      allocation.currentRank.name === '大関' && allocation.nextRank.name === '横綱');

    for (const allocation of allocationPromotions) {
      const result = resultById.get(allocation.id);
      if (!result?.rank) continue;
      const pastRecords = (world.recentSekitoriHistory.get(allocation.id) ?? []).slice(1, 3);
      const previousRecord = pastRecords[0];
      if (!previousRecord) continue;
      const snapshot = toBashoSnapshot(result, pastRecords, topRankPopulation);
      const baselineSnapshot = { ...snapshot, topRankPopulation: undefined };
      const evaluation = evaluateYokozunaPromotion(snapshot);
      const baselineEvaluation = evaluateYokozunaPromotion(baselineSnapshot);
      const current = toPromotionBashoScore(snapshot);
      const previous = toPromotionBashoScore(previousRecord);
      const patternClasses = resolvePatternClasses(
        current,
        previous,
        topRankPopulation.currentYokozunaCount,
      );
      const trace: PromotionTrace = {
        basho: b + 1,
        seed,
        worldLabel: label,
        eraSnapshotId: spec.snapshot?.id ?? null,
        eraTags: spec.snapshot?.eraTags ?? [],
        id: allocation.id,
        shikona: allocation.shikona,
        decisionBand: evaluation.decisionBand,
        current,
        previous,
        currentYokozunaCount: topRankPopulation.currentYokozunaCount,
        currentOzekiCount: topRankPopulation.currentOzekiCount,
        populationPressure: evaluation.evidence.populationPressure,
        requiredTotalScore: evaluation.evidence.requiredTotalScore,
        baselineRequiredTotalScore: baselineEvaluation.evidence.requiredTotalScore,
        combinedEquivalent: evaluation.evidence.combinedEquivalent,
        wouldPromoteWithoutPressure: baselineEvaluation.promote,
        pressureBlockedPromotion: baselineEvaluation.promote && !evaluation.promote,
        pressureRelaxedPromotion: !baselineEvaluation.promote && evaluation.promote,
        actualWinsTotal: current.wins + previous.wins,
        effectiveYushoScore: evaluation.evidence.combinedEquivalent,
        patternClasses,
        followUp: [],
        retiredWithin6: false,
      };
      promotions.push(trace);
      pending.set(allocation.id, trace);
    }
  }

  for (const trace of promotions) {
    const first3 = trace.followUp.slice(0, 3);
    if (
      first3.some((row) => row.wins < row.losses + row.absent) ||
      trace.retiredWithin6
    ) {
      if (!trace.patternClasses.includes('I')) trace.patternClasses.push('I');
    }
  }

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    promotions,
    pressureCandidates,
    streaks: {
      yGte6Count: yGte6.count,
      yGte6Streak: yGte6.max,
      yoGte9Count: yoGte9.count,
      yoGte9Streak: yoGte9.max,
    },
  };
};

const summarizePromotions = (promotions: PromotionTrace[]) => {
  const firstN = (trace: PromotionTrace, count: number): FollowUpRecord[] => trace.followUp.slice(0, count);
  const first3 = promotions.flatMap((trace) => firstN(trace, 3));
  const first6ByTrace = promotions.map((trace) => firstN(trace, 6));
  const first3Makekoshi = promotions.filter((trace) =>
    firstN(trace, 3).some((row) => row.wins < row.losses + row.absent)).length;
  const first3FullAttendanceMakekoshi = promotions.filter((trace) =>
    firstN(trace, 3).some((row) => row.wins < row.losses && row.wins + row.losses === 15 && row.absent === 0)).length;
  const first6Retire = promotions.filter((trace) => trace.retiredWithin6).length;
  const first6Yusho = first6ByTrace.filter((rows) => rows.some((row) => row.yusho)).length;
  const first6KachikoshiRows = first6ByTrace.flatMap((rows) => rows);
  return {
    count: promotions.length,
    per10Years: round3(promotions.length / Math.max(1, BASHO / 60)),
    avgCurrentYokozunaCount: avg(promotions.map((trace) => trace.currentYokozunaCount)),
    avgCurrentOzekiCount: avg(promotions.map((trace) => trace.currentOzekiCount)),
    avgPressure: avg(promotions.map((trace) => trace.populationPressure)),
    yGte4Promotions: promotions.filter((trace) => trace.currentYokozunaCount >= 4).length,
    yGte5Promotions: promotions.filter((trace) => trace.currentYokozunaCount >= 5).length,
    yLte1Promotions: promotions.filter((trace) => trace.currentYokozunaCount <= 1).length,
    currentYokozunaCountHist: histogram(promotions.map((trace) => trace.currentYokozunaCount)),
    pressureHist: histogram(promotions.map((trace) => trace.populationPressure)),
    decisionBandHist: histogram(promotions.map((trace) => trace.decisionBand)),
    classHist: histogram(promotions.flatMap((trace) => trace.patternClasses)),
    yushoWinHist: histogram(promotions.flatMap((trace) =>
      [trace.current, trace.previous].filter((row) => row.yusho).map((row) => row.wins))),
    only14PlusYushoPromotions: promotions.filter((trace) =>
      [trace.current, trace.previous].some((row) => row.yusho && row.wins >= 14) &&
      [trace.current, trace.previous].filter((row) => row.yusho).every((row) => row.wins >= 14)).length,
    includes13OrLowerYushoPromotions: promotions.filter((trace) =>
      [trace.current, trace.previous].some((row) => row.yusho && row.wins <= 13)).length,
    consecutiveYushoPromotions: promotions.filter((trace) => trace.current.yusho && trace.previous.yusho).length,
    yushoJunYushoPromotions: promotions.filter((trace) =>
      (trace.current.yusho && trace.previous.junYusho) ||
      (trace.current.junYusho && trace.previous.yusho)).length,
    first1WinAvg: avg(promotions.flatMap((trace) => firstN(trace, 1).map((row) => row.wins))),
    first3WinAvg: avg(first3.map((row) => row.wins)),
    first3Makekoshi,
    first3FullAttendanceMakekoshi,
    first6Retire,
    first6Yusho,
    first6KachikoshiRate: pct(
      first6KachikoshiRows.filter((row) => row.wins >= row.losses + row.absent).length,
      first6KachikoshiRows.length,
    ),
  };
};

const summarizeWorld = (world: WorldDiagnostic) => ({
  label: world.label,
  seed: world.seed,
  eraSnapshotId: world.eraSnapshotId,
  publicEraLabel: world.publicEraLabel,
  eraTags: world.eraTags,
  promotions: summarizePromotions(world.promotions),
  crowdedPromotions: summarizePromotions(world.promotions.filter((trace) => trace.currentYokozunaCount >= 4)),
  nonCrowdedPromotions: summarizePromotions(world.promotions.filter((trace) => trace.currentYokozunaCount <= 3)),
  pressureCandidates: world.pressureCandidates,
  streaks: world.streaks,
  traces: world.promotions,
});

const writeMarkdown = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const lines: string[] = [
    '# Yokozuna promotion frequency recheck diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseYokozunaPromotionFrequencyRecheck.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | tags | promotions/10y | Y count hist | pressure hist | pressure no/block/relax | Y>=4/Y>=5 | class hist | yusho wins | 14+ only | <=13 yusho | yy / y+jy | post 1W/3W | post MK/full MK/retire/yusho/KK | Y>=6 streak | YO>=9 streak |',
    '| --- | ---:| --- | ---:| --- | --- | --- | --- | --- | --- | ---:| ---:| --- | --- | --- | --- | --- |',
  ];
  for (const summary of summaries) {
    const p = summary.promotions;
    lines.push(
      `| ${summary.label} | ${summary.seed} | ${summary.eraTags.join(', ') || '-'} | ${p.count}/${p.per10Years} | \`${JSON.stringify(p.currentYokozunaCountHist)}\` | \`${JSON.stringify(p.pressureHist)}\` | ${summary.pressureCandidates.withoutPressurePromote}/${summary.pressureCandidates.pressureBlocked}/${summary.pressureCandidates.pressureRelaxed} | ${p.yGte4Promotions}/${p.yGte5Promotions} | \`${JSON.stringify(p.classHist)}\` | \`${JSON.stringify(p.yushoWinHist)}\` | ${p.only14PlusYushoPromotions} | ${p.includes13OrLowerYushoPromotions} | ${p.consecutiveYushoPromotions}/${p.yushoJunYushoPromotions} | ${p.first1WinAvg ?? '-'}/${p.first3WinAvg ?? '-'} | ${p.first3Makekoshi}/${p.first3FullAttendanceMakekoshi}/${p.first6Retire}/${p.first6Yusho}/${p.first6KachikoshiRate} | ${summary.streaks.yGte6Count}/${summary.streaks.yGte6Streak} | ${summary.streaks.yoGte9Count}/${summary.streaks.yoGte9Streak} |`,
    );
  }

  lines.push('');
  lines.push('## Crowded vs Non-Crowded Promotions');
  lines.push('');
  lines.push('| world | seed | bucket | count | post 1W/3W | post MK/full MK/retire/yusho/KK | yusho wins | class hist |');
  lines.push('| --- | ---:| --- | ---:| --- | --- | --- | --- |');
  for (const summary of summaries) {
    for (const [bucket, p] of [
      ['Y>=4', summary.crowdedPromotions],
      ['Y<=3', summary.nonCrowdedPromotions],
    ] as const) {
      lines.push(
        `| ${summary.label} | ${summary.seed} | ${bucket} | ${p.count} | ${p.first1WinAvg ?? '-'}/${p.first3WinAvg ?? '-'} | ${p.first3Makekoshi}/${p.first3FullAttendanceMakekoshi}/${p.first6Retire}/${p.first6Yusho}/${p.first6KachikoshiRate} | \`${JSON.stringify(p.yushoWinHist)}\` | \`${JSON.stringify(p.classHist)}\` |`,
      );
    }
  }

  lines.push('');
  lines.push('## Promotion Traces');
  lines.push('');
  lines.push('| world | seed | basho | rikishi | Y/O | pressure | req/base req | score | decision | current | previous | classes | follow-up |');
  lines.push('| --- | ---:| ---:| --- | --- | ---:| --- | ---:| --- | --- | --- | --- | --- |');
  for (const summary of summaries) {
    for (const trace of summary.traces) {
      const fmt = (row: PromotionBashoScore): string =>
        `${rankLabel(row.rank)} ${row.wins}勝${row.yusho ? 'Y' : ''}${row.junYusho ? 'JY' : ''}=${row.equivalent}`;
      const follow = trace.followUp
        .slice(0, 6)
        .map((row) => `${row.bashoOffset}:${row.wins}-${row.losses}-${row.absent}${row.yusho ? 'Y' : ''}`)
        .join(' ');
      lines.push(
        `| ${summary.label} | ${summary.seed} | ${trace.basho} | ${trace.shikona} | ${trace.currentYokozunaCount}/${trace.currentOzekiCount} | ${trace.populationPressure} | ${trace.requiredTotalScore}/${trace.baselineRequiredTotalScore} | ${trace.combinedEquivalent} | ${trace.decisionBand} | ${fmt(trace.current)} | ${fmt(trace.previous)} | ${trace.patternClasses.join(',')} | ${follow || '-'}${trace.retiredWithin6 ? ' retired<=6' : ''} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Reading Notes');
  lines.push('');
  lines.push('- `pressure no/block/relax` は pressure なしなら昇進していた候補数 / pressure で保留された候補数 / 緩和で昇進した候補数。');
  lines.push('- class A-J は依頼文の分類に対応する。I は昇進後3場所以内の負け越し、または6場所以内引退を含む。');
  lines.push('- `Y>=4` はハード制限ではなく、過密時昇進の診断バケット。');
  fs.writeFileSync(path.join(outDir, 'yokozuna_promotion_frequency_recheck_diagnostics.md'), lines.join('\n'));
};

const writeAudit = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const all = summaries.flatMap((summary) => summary.traces);
  const crowded = all.filter((trace) => trace.currentYokozunaCount >= 4);
  const blocked = summaries.reduce((sum, summary) => sum + summary.pressureCandidates.pressureBlocked, 0);
  const lowYusho = all.filter((trace) =>
    [trace.current, trace.previous].some((row) => row.yusho && row.wins <= 13));
  const soonBad = all.filter((trace) => trace.patternClasses.includes('I'));
  const lines = [
    '# Yokozuna promotion frequency recheck audit',
    '',
    '## Scope',
    '',
    '横綱昇進頻度、過密時 pressure、昇進後1〜6場所の妥当性を監査する。横綱人数上限、降格、強制引退、取組本体変更は対象外。',
    '',
    '## Findings',
    '',
    `- Yokozuna promotions observed: ${all.length}`,
    `- Promotions at Y>=4: ${crowded.length}`,
    `- Promotions including 13-or-lower yusho: ${lowYusho.length}`,
    `- Pressure-blocked candidates: ${blocked}`,
    `- Promotions with early makekoshi/retirement signal: ${soonBad.length}`,
    '',
    '## Interpretation',
    '',
    crowded.length > 0
      ? 'Y>=4 での昇進が一定数ある。pressure は判定に届いているが、過密時に通る候補の後続成績を見て温度調整の要否を判断する。'
      : '今回の診断条件では Y>=4 の昇進は目立たない。過密が続く場合は昇進後滞留または他 world の発生頻度を追加で見る。',
    lowYusho.length > 0
      ? '13勝以下優勝を含む昇進が残る。低勝数優勝の14.5固定底上げは戻っていないが、13勝優勝の扱いが過密時に強い可能性はある。'
      : '13勝以下優勝を含む昇進は目立たない。低勝数優勝補正修正は維持されている。',
    '',
    '## Guardrails',
    '',
    '- 横綱人数ハード上限は入れない。',
    '- 横綱降格、強制引退は入れない。',
    '- battle / torikumi 本体は変更しない。',
    '- retirement pressure と seasonal floor は今回の主修正対象にしない。',
  ];
  fs.writeFileSync(path.join(outDir, 'yokozuna_promotion_frequency_recheck_audit.md'), lines.join('\n'));
};

const main = async (): Promise<void> => {
  const specs = buildWorldSpecs();
  const diagnostics: WorldDiagnostic[] = [];
  for (const seed of SEEDS) {
    for (const spec of specs) {
      const diagnostic = await runWorld(seed, spec);
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }
  const summaries = diagnostics.map(summarizeWorld);
  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'yokozuna_promotion_frequency_recheck_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seeds: SEEDS, summaries, raw: diagnostics }, null, 2),
  );
  writeMarkdown(outDir, summaries);
  writeAudit(outDir, summaries);

  console.log(`Yokozuna promotion frequency recheck — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  for (const summary of summaries) {
    const p = summary.promotions;
    console.log('');
    console.log(`=== ${summary.label} seed=${summary.seed} ===`);
    if (summary.eraTags.length > 0) console.log(`  eraTags=${summary.eraTags.join(',')}`);
    console.log(
      `  promotions=${p.count} per10y=${p.per10Years} Y>=4=${p.yGte4Promotions} Y>=5=${p.yGte5Promotions} avgY/O=${p.avgCurrentYokozunaCount ?? '-'}/${p.avgCurrentOzekiCount ?? '-'} avgPressure=${p.avgPressure ?? '-'}`,
    );
    console.log(
      `  pressure no/block/relax=${summary.pressureCandidates.withoutPressurePromote}/${summary.pressureCandidates.pressureBlocked}/${summary.pressureCandidates.pressureRelaxed}`,
    );
    console.log(
      `  yushoHist=${JSON.stringify(p.yushoWinHist)} lowYushoPromotions=${p.includes13OrLowerYushoPromotions} 14plusOnly=${p.only14PlusYushoPromotions} classes=${JSON.stringify(p.classHist)}`,
    );
    console.log(
      `  post first1/first3 wins=${p.first1WinAvg ?? '-'}/${p.first3WinAvg ?? '-'} mk/fullMk/retire/yusho/kk=${p.first3Makekoshi}/${p.first3FullAttendanceMakekoshi}/${p.first6Retire}/${p.first6Yusho}/${p.first6KachikoshiRate}`,
    );
    console.log(`  streak Y>=6=${summary.streaks.yGte6Count}/${summary.streaks.yGte6Streak} YO>=9=${summary.streaks.yoGte9Count}/${summary.streaks.yoGte9Streak}`);
  }
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
