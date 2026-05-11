#!/usr/bin/env npx tsx
/**
 * 横綱昇進で低勝数優勝を 14.5 勝相当に底上げする評価が強すぎないか診断する。
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

const BASHO = argInt('--basho', 60);
const SEEDS = argStr('--seeds', argStr('--seed', '20260420'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

type PromotionDecisionBand = 'AUTO_PROMOTE' | 'BORDERLINE' | 'BORDERLINE_PROMOTE' | 'REJECT';

interface PromotionBashoScore {
  rank: Rank;
  wins: number;
  yusho: boolean;
  junYusho: boolean;
  actualEquivalent: number;
  noYushoFloorEquivalent: number;
  noLowYushoFloorEquivalent: number;
}

interface YokozunaPromotionScoreTrace {
  basho: number;
  id: string;
  shikona: string;
  fromRank: string;
  toRank: string;
  decisionBand: PromotionDecisionBand;
  current: PromotionBashoScore;
  previous: PromotionBashoScore;
  actualWinsTotal: number;
  actualEquivalentTotal: number;
  noYushoFloorTotal: number;
  noLowYushoFloorTotal: number;
  lowYushoCount: number;
  lowYushoWins: number[];
  wouldPromoteWithoutYushoFloor: boolean;
  wouldPromoteWithoutLowYushoFloor: boolean;
  lowYushoFloorCritical: boolean;
  yushoFloorLift: number;
  lowYushoFloorLift: number;
}

interface WorldDiagnostic {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  yokozunaPromotions: YokozunaPromotionScoreTrace[];
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

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
});

const toActualEquivalent = (wins: number, yusho?: boolean, junYusho?: boolean): number => {
  if (yusho) return Math.max(wins, 14.5);
  if (junYusho) return Math.max(wins, 13.5);
  return wins;
};

const toNoYushoFloorEquivalent = (wins: number, yusho?: boolean, junYusho?: boolean): number => {
  if (yusho) return wins;
  if (junYusho) return Math.max(wins, 13.5);
  return wins;
};

const toNoLowYushoFloorEquivalent = (wins: number, yusho?: boolean, junYusho?: boolean): number => {
  if (yusho && wins < 14) return wins;
  if (yusho) return Math.max(wins, 14.5);
  if (junYusho) return Math.max(wins, 13.5);
  return wins;
};

const evaluatePromoteFromScores = (
  current: PromotionBashoScore,
  previous: PromotionBashoScore,
  currentEquivalent: number,
  previousEquivalent: number,
): boolean => {
  const isCurrentOzeki = current.rank.name === '大関';
  const isPrevOzeki = previous.rank.name === '大関';
  const currentYushoEquivalent = current.yusho || current.junYusho;
  const prevYushoEquivalent = previous.yusho || previous.junYusho;
  const hasActualYushoInWindow = current.yusho || previous.yusho;
  return Boolean(
    isCurrentOzeki &&
      isPrevOzeki &&
      currentEquivalent >= 13 &&
      previousEquivalent >= 13 &&
      currentYushoEquivalent &&
      prevYushoEquivalent &&
      hasActualYushoInWindow &&
      currentEquivalent + previousEquivalent >= 29,
  );
};

const toPromotionBashoScore = (
  record: { rank: Rank; wins: number; yusho?: boolean; junYusho?: boolean },
): PromotionBashoScore => ({
  rank: record.rank,
  wins: record.wins,
  yusho: record.yusho ?? false,
  junYusho: record.junYusho ?? false,
  actualEquivalent: toActualEquivalent(record.wins, record.yusho, record.junYusho),
  noYushoFloorEquivalent: toNoYushoFloorEquivalent(record.wins, record.yusho, record.junYusho),
  noLowYushoFloorEquivalent: toNoLowYushoFloorEquivalent(record.wins, record.yusho, record.junYusho),
});

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
      careerId: `yokozuna-yusho-score-${spec.key}-${seed}`,
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

  const yokozunaPromotions: YokozunaPromotionScoreTrace[] = [];

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const results = world.lastBashoResults.Makuuchi ?? [];
    const resultById = new Map(results.map((result) => [result.id, result]));
    const promotions = world.lastAllocations.filter((allocation) =>
      allocation.currentRank.name === '大関' && allocation.nextRank.name === '横綱');

    for (const allocation of promotions) {
      const result = resultById.get(allocation.id);
      if (!result?.rank) continue;
      const pastRecords = (world.recentSekitoriHistory.get(allocation.id) ?? []).slice(1, 3);
      const previousRecord = pastRecords[0];
      if (!previousRecord) continue;
      const snapshot = toBashoSnapshot(result, pastRecords);
      const evaluation = evaluateYokozunaPromotion(snapshot);
      const current = toPromotionBashoScore(snapshot);
      const previous = toPromotionBashoScore(previousRecord);
      const actualWinsTotal = current.wins + previous.wins;
      const actualEquivalentTotal = current.actualEquivalent + previous.actualEquivalent;
      const noYushoFloorTotal = current.noYushoFloorEquivalent + previous.noYushoFloorEquivalent;
      const noLowYushoFloorTotal = current.noLowYushoFloorEquivalent + previous.noLowYushoFloorEquivalent;
      const lowYushoWins = [current, previous]
        .filter((record) => record.yusho && record.wins < 14)
        .map((record) => record.wins);
      const wouldPromoteWithoutYushoFloor = evaluatePromoteFromScores(
        current,
        previous,
        current.noYushoFloorEquivalent,
        previous.noYushoFloorEquivalent,
      );
      const wouldPromoteWithoutLowYushoFloor = evaluatePromoteFromScores(
        current,
        previous,
        current.noLowYushoFloorEquivalent,
        previous.noLowYushoFloorEquivalent,
      );

      yokozunaPromotions.push({
        basho: b + 1,
        id: allocation.id,
        shikona: allocation.shikona,
        fromRank: rankLabel(allocation.currentRank),
        toRank: rankLabel(allocation.nextRank),
        decisionBand: evaluation.decisionBand,
        current,
        previous,
        actualWinsTotal,
        actualEquivalentTotal,
        noYushoFloorTotal,
        noLowYushoFloorTotal,
        lowYushoCount: lowYushoWins.length,
        lowYushoWins,
        wouldPromoteWithoutYushoFloor,
        wouldPromoteWithoutLowYushoFloor,
        lowYushoFloorCritical: evaluation.promote && !wouldPromoteWithoutLowYushoFloor,
        yushoFloorLift: round3(actualEquivalentTotal - noYushoFloorTotal),
        lowYushoFloorLift: round3(actualEquivalentTotal - noLowYushoFloorTotal),
      });
    }
  }

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    yokozunaPromotions,
  };
};

const histogram = (values: Array<number | string>): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const value of values) out[String(value)] = (out[String(value)] ?? 0) + 1;
  return out;
};

const avg = (values: number[]): number | null =>
  values.length === 0 ? null : round3(values.reduce((sum, value) => sum + value, 0) / values.length);

const summarizeWorld = (world: WorldDiagnostic) => {
  const promotions = world.yokozunaPromotions;
  const lowYushoCritical = promotions.filter((event) => event.lowYushoFloorCritical);
  const autoPromotes = promotions.filter((event) => event.decisionBand === 'AUTO_PROMOTE');
  return {
    label: world.label,
    seed: world.seed,
    eraSnapshotId: world.eraSnapshotId,
    publicEraLabel: world.publicEraLabel,
    eraTags: world.eraTags,
    yokozunaPromotions: promotions.length,
    autoPromotes: autoPromotes.length,
    actualWinsTotalHistogram: histogram(promotions.map((event) => event.actualWinsTotal)),
    autoActualWinsTotalHistogram: histogram(autoPromotes.map((event) => event.actualWinsTotal)),
    yushoWinHistogram: histogram(promotions.flatMap((event) =>
      [event.current, event.previous]
        .filter((record) => record.yusho)
        .map((record) => record.wins))),
    lowYushoPromotionCount: promotions.filter((event) => event.lowYushoCount > 0).length,
    lowYushoCriticalCount: lowYushoCritical.length,
    lowYushoCriticalRate: promotions.length > 0 ? round3(lowYushoCritical.length / promotions.length) : 0,
    avgActualWinsTotal: avg(promotions.map((event) => event.actualWinsTotal)),
    avgActualEquivalentTotal: avg(promotions.map((event) => event.actualEquivalentTotal)),
    avgNoYushoFloorTotal: avg(promotions.map((event) => event.noYushoFloorTotal)),
    avgNoLowYushoFloorTotal: avg(promotions.map((event) => event.noLowYushoFloorTotal)),
    avgYushoFloorLift: avg(promotions.map((event) => event.yushoFloorLift)),
    avgLowYushoFloorLift: avg(promotions.map((event) => event.lowYushoFloorLift)),
    lowYushoCritical,
    promotionTraces: promotions,
  };
};

const writeMarkdown = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const lines: string[] = [
    '# Yokozuna promotion yusho score diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseYokozunaPromotionYushoScore.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | tags | Y promotions | AUTO | actual wins total hist | AUTO actual wins hist | yusho wins hist | low-yusho promotions | low-yusho critical | avg actual/equiv/no-yusho/no-low | avg lift yusho/low |',
    '| --- | ---:| --- | ---:| ---:| --- | --- | --- | ---:| --- | --- | --- |',
  ];
  for (const summary of summaries) {
    lines.push(
      `| ${summary.label} | ${summary.seed} | ${summary.eraTags.join(', ') || '-'} | ${summary.yokozunaPromotions} | ${summary.autoPromotes} | \`${JSON.stringify(summary.actualWinsTotalHistogram)}\` | \`${JSON.stringify(summary.autoActualWinsTotalHistogram)}\` | \`${JSON.stringify(summary.yushoWinHistogram)}\` | ${summary.lowYushoPromotionCount} | ${summary.lowYushoCriticalCount}/${summary.lowYushoCriticalRate} | ${summary.avgActualWinsTotal ?? '-'}/${summary.avgActualEquivalentTotal ?? '-'}/${summary.avgNoYushoFloorTotal ?? '-'}/${summary.avgNoLowYushoFloorTotal ?? '-'} | ${summary.avgYushoFloorLift ?? '-'}/${summary.avgLowYushoFloorLift ?? '-'} |`,
    );
  }

  lines.push('');
  lines.push('## Low-Yusho Critical Promotions');
  lines.push('');
  lines.push('| world | seed | basho | rikishi | decision | actual wins | equivalent | no-yusho | no-low-yusho | current | previous | lift |');
  lines.push('| --- | ---:| ---:| --- | --- | ---:| ---:| ---:| ---:| --- | --- | ---:|');
  for (const summary of summaries) {
    for (const event of summary.lowYushoCritical) {
      const format = (record: PromotionBashoScore): string =>
        `${rankLabel(record.rank)} ${record.wins}勝${record.yusho ? ' Y' : ''}${record.junYusho ? ' JY' : ''}`;
      lines.push(
        `| ${summary.label} | ${summary.seed} | ${event.basho} | ${event.shikona} | ${event.decisionBand} | ${event.actualWinsTotal} | ${event.actualEquivalentTotal} | ${event.noYushoFloorTotal} | ${event.noLowYushoFloorTotal} | ${format(event.current)} | ${format(event.previous)} | ${event.lowYushoFloorLift} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Reading Notes');
  lines.push('');
  lines.push('- `actual wins total` は横綱昇進者の直前2場所の実勝数合計。');
  lines.push('- `equivalent` は現行 `yusho -> max(wins, 14.5)` / `junYusho -> max(wins, 13.5)` 後の合計。');
  lines.push('- `no-yusho` は yusho の 14.5 固定底上げだけを外した合計。junYusho 補正は残す。');
  lines.push('- `no-low-yusho` は 14勝未満の yusho だけ 14.5 底上げを外し、14勝以上優勝は現行通り残した合計。');
  lines.push('- `low-yusho critical` は現行では昇進するが、14勝未満優勝の底上げを外すと AUTO 条件を満たさないケース。');
  fs.writeFileSync(path.join(outDir, 'yokozuna_promotion_yusho_score_diagnostics.md'), lines.join('\n'));
};

const writeAudit = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const totalPromotions = summaries.reduce((sum, summary) => sum + summary.yokozunaPromotions, 0);
  const totalAuto = summaries.reduce((sum, summary) => sum + summary.autoPromotes, 0);
  const totalLowYusho = summaries.reduce((sum, summary) => sum + summary.lowYushoPromotionCount, 0);
  const totalCritical = summaries.reduce((sum, summary) => sum + summary.lowYushoCriticalCount, 0);
  const crowdedCritical = summaries
    .filter((summary) => summary.eraTags.includes('ozeki_crowded') || summary.eraTags.includes('yokozuna_stable'))
    .reduce((sum, summary) => sum + summary.lowYushoCriticalCount, 0);
  const lines = [
    '# Yokozuna promotion yusho score audit',
    '',
    '## Scope',
    '',
    '横綱昇進における yusho / junYusho の勝数換算を監査する。優勝ラベル生成、人数上限、強制整理、battle / torikumi は変更対象にしない。',
    '',
    '## Source Finding',
    '',
    '- `src/logic/banzuke/rules/yokozunaPromotion.ts` は yusho を `Math.max(wins, 14.5)`、junYusho を `Math.max(wins, 13.5)` に換算する。',
    '- AUTO_PROMOTE は大関2場所、各場所13相当以上、直前2場所に yusho/junYusho 相当があり、かつ実優勝を含み、補正後合計29相当以上で成立する。',
    '- このため、11勝優勝や12勝優勝でも yusho が付くと 14.5 相当に跳ね上がり、2場所合計の実勝数が低くても AUTO_PROMOTE になり得る。',
    '',
    '## Diagnosis Result',
    '',
    `- Yokozuna promotions: ${totalPromotions}`,
    `- AUTO_PROMOTE: ${totalAuto}`,
    `- Promotions with at least one 11-13 win yusho in the 2-basho window: ${totalLowYusho}`,
    `- Promotions that would fail without low-yusho floor: ${totalCritical}`,
    `- Low-yusho critical promotions in crowded/stable top-rank worlds: ${crowdedCritical}`,
    '',
    '## Interpretation',
    '',
    totalCritical > 0
      ? '低勝数優勝の 14.5 固定底上げは、横綱昇進を実際に押し上げている。修正するなら yusho を無価値にせず、14勝未満優勝だけ換算値を弱めるのが最小で筋がよい。'
      : '今回の診断範囲では、低勝数優勝の固定底上げが横綱昇進の成立条件を直接変えているケースは確認されない。本体修正は不要。',
    '',
    '## Guardrails',
    '',
    '- 横綱昇進条件を雑に厳格化しない。',
    '- yusho を無価値にしない。',
    '- 14勝以上の優勝評価は現行通り強く扱う。',
    '- 人数ハード上限、強制引退、強制降格は入れない。',
    '- Dexie schema bump はしない。',
  ];
  fs.writeFileSync(path.join(outDir, 'yokozuna_promotion_yusho_score_audit.md'), lines.join('\n'));
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
    path.join(outDir, 'yokozuna_promotion_yusho_score_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seeds: SEEDS, summaries, raw: diagnostics }, null, 2),
  );
  writeMarkdown(outDir, summaries);
  writeAudit(outDir, summaries);

  console.log(`Yokozuna promotion yusho score diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  for (const summary of summaries) {
    console.log('');
    console.log(`=== ${summary.label} seed=${summary.seed} ===`);
    if (summary.eraTags.length > 0) console.log(`  eraTags=${summary.eraTags.join(',')}`);
    console.log(
      `  yokozunaPromotions=${summary.yokozunaPromotions} auto=${summary.autoPromotes} lowYusho=${summary.lowYushoPromotionCount} critical=${summary.lowYushoCriticalCount}`,
    );
    console.log(
      `  actualWinsTotalHist=${JSON.stringify(summary.actualWinsTotalHistogram)} autoActualWinsHist=${JSON.stringify(summary.autoActualWinsTotalHistogram)}`,
    );
    console.log(`  yushoWinHist=${JSON.stringify(summary.yushoWinHistogram)}`);
    console.log(
      `  avg actual/equiv/noYusho/noLow=${summary.avgActualWinsTotal ?? '-'}/${summary.avgActualEquivalentTotal ?? '-'}/${summary.avgNoYushoFloorTotal ?? '-'}/${summary.avgNoLowYushoFloorTotal ?? '-'}`,
    );
  }
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
