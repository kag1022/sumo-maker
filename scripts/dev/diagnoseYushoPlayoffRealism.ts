#!/usr/bin/env npx tsx
/**
 * 優勝・準優勝・優勝決定戦ラベルが横綱昇進を過剰に支えていないか診断する。
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

interface RaceFlag {
  basho: number;
  rank: Rank;
  wins: number;
  yusho: boolean;
  junYusho: boolean;
  topTie: boolean;
  topTieSize: number;
  playoffWinner: boolean;
  playoffRunnerUp: boolean;
}

interface DivisionRaceSummary {
  basho: number;
  yushoCount: number;
  junYushoCount: number;
  topTieSize: number;
  topWins: number;
  yushoIds: string[];
  junYushoIds: string[];
  topTieIds: string[];
  playoffNeeded: boolean;
  playoffResolved: boolean;
  playoffNotResolved: boolean;
}

interface YokozunaPromotionTrace {
  basho: number;
  id: string;
  shikona: string;
  fromRank: string;
  toRank: string;
  record: string;
  decisionBand: string;
  current: RaceFlag | null;
  previous: RaceFlag | null;
  hasPlayoffWindow: boolean;
  hasTopTieWindow: boolean;
  hasPlayoffRunnerUpWindow: boolean;
  currentEquivalent: number;
  previousEquivalent: number;
  combinedEquivalent: number;
}

interface WorldDiagnostic {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  makuuchiRace: DivisionRaceSummary[];
  yokozunaPromotions: YokozunaPromotionTrace[];
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

const summarizeMakuuchiRace = (
  basho: number,
  results: NonNullable<ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>['lastBashoResults']['Makuuchi']>,
): { summary: DivisionRaceSummary; flagsById: Map<string, RaceFlag> } => {
  const topWins = Math.max(...results.map((result) => result.wins));
  const topTieIds = results.filter((result) => result.wins === topWins).map((result) => result.id);
  const yushoIds = results.filter((result) => result.yusho).map((result) => result.id);
  const junYushoIds = results.filter((result) => result.junYusho).map((result) => result.id);
  const playoffNeeded = topTieIds.length >= 2;
  const playoffResolved = playoffNeeded && yushoIds.length === 1;
  const playoffNotResolved = playoffNeeded && !playoffResolved;
  const flagsById = new Map<string, RaceFlag>();

  for (const result of results) {
    const topTie = result.wins === topWins && topTieIds.length >= 2;
    flagsById.set(result.id, {
      basho,
      rank: result.rank ?? { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
      wins: result.wins,
      yusho: result.yusho ?? false,
      junYusho: result.junYusho ?? false,
      topTie,
      topTieSize: topTie ? topTieIds.length : 0,
      playoffWinner: topTie && (result.yusho ?? false),
      playoffRunnerUp: topTie && (result.junYusho ?? false),
    });
  }

  return {
    summary: {
      basho,
      yushoCount: yushoIds.length,
      junYushoCount: junYushoIds.length,
      topTieSize: topTieIds.length,
      topWins,
      yushoIds,
      junYushoIds,
      topTieIds,
      playoffNeeded,
      playoffResolved,
      playoffNotResolved,
    },
    flagsById,
  };
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
      careerId: `yusho-playoff-realism-${spec.key}-${seed}`,
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

  const makuuchiRace: DivisionRaceSummary[] = [];
  const raceHistoryById = new Map<string, RaceFlag[]>();
  const yokozunaPromotions: YokozunaPromotionTrace[] = [];

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const results = world.lastBashoResults.Makuuchi ?? [];
    if (!results.length) continue;

    const { summary, flagsById } = summarizeMakuuchiRace(b + 1, results);
    makuuchiRace.push(summary);
    for (const [id, flag] of flagsById) {
      const history = raceHistoryById.get(id) ?? [];
      raceHistoryById.set(id, [flag, ...history].slice(0, 6));
    }

    const resultById = new Map(results.map((result) => [result.id, result]));
    const promotions = world.lastAllocations.filter((allocation) =>
      allocation.currentRank.name === '大関' && allocation.nextRank.name === '横綱');

    for (const allocation of promotions) {
      const result = resultById.get(allocation.id);
      if (!result?.rank) continue;
      const pastRecords = (world.recentSekitoriHistory.get(allocation.id) ?? []).slice(1, 3);
      const snapshot = toBashoSnapshot(result, pastRecords);
      const evaluation = evaluateYokozunaPromotion(snapshot);
      const raceHistory = raceHistoryById.get(allocation.id) ?? [];
      const current = raceHistory[0] ?? null;
      const previous = raceHistory[1] ?? null;
      const hasPlayoffWindow = Boolean(current?.topTie || previous?.topTie);
      const hasTopTieWindow = Boolean(current?.topTie || previous?.topTie);
      const hasPlayoffRunnerUpWindow = Boolean(current?.playoffRunnerUp || previous?.playoffRunnerUp);

      yokozunaPromotions.push({
        basho: b + 1,
        id: allocation.id,
        shikona: allocation.shikona,
        fromRank: rankLabel(allocation.currentRank),
        toRank: rankLabel(allocation.nextRank),
        record: `${snapshot.wins}-${snapshot.losses}-${snapshot.absent}`,
        decisionBand: evaluation.decisionBand,
        current,
        previous,
        hasPlayoffWindow,
        hasTopTieWindow,
        hasPlayoffRunnerUpWindow,
        currentEquivalent: evaluation.evidence.currentEquivalent,
        previousEquivalent: evaluation.evidence.prevEquivalent,
        combinedEquivalent: evaluation.evidence.combinedEquivalent,
      });
    }
  }

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    makuuchiRace,
    yokozunaPromotions,
  };
};

const histogram = (values: number[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const value of values) out[String(value)] = (out[String(value)] ?? 0) + 1;
  return out;
};

const causeClassification = (world: WorldDiagnostic): string => {
  const multiYusho = world.makuuchiRace.some((race) => race.yushoCount > 1);
  if (multiYusho) return 'A: 同星トップ全員、または複数人が yusho 扱いされている';
  const unresolved = world.makuuchiRace.some((race) => race.playoffNotResolved);
  if (unresolved) return 'E: 診断上、決定戦解決状態の読み取りに不整合がある';
  const playoffRunnerUpPromotions = world.yokozunaPromotions.filter((event) => event.hasPlayoffRunnerUpWindow).length;
  if (playoffRunnerUpPromotions > 0) return 'C/D: 決定戦敗者 junYusho が横綱昇進窓に入っている';
  const junYushoWindowPromotions = world.yokozunaPromotions.filter((event) =>
    Boolean(event.current?.junYusho || event.previous?.junYusho)).length;
  if (junYushoWindowPromotions >= 2) {
    return 'D: junYusho が横綱昇進で強く効いている可能性がある';
  }
  const excessiveJunYusho = world.makuuchiRace.some((race) =>
    race.junYushoCount >= Math.max(4, race.topTieSize + 2));
  if (excessiveJunYusho) return 'B signal: junYusho は広いが横綱昇進主因とは弱い';
  return 'F: yusho / junYusho 生成は上位過密の主因として目立たない';
};

const summarizeWorld = (world: WorldDiagnostic) => {
  const bashoCount = world.makuuchiRace.length;
  const yushoCount = world.makuuchiRace.reduce((sum, race) => sum + race.yushoCount, 0);
  const junYushoCount = world.makuuchiRace.reduce((sum, race) => sum + race.junYushoCount, 0);
  const topTieBashoCount = world.makuuchiRace.filter((race) => race.topTieSize >= 2).length;
  const playoffNeededBashoCount = world.makuuchiRace.filter((race) => race.playoffNeeded).length;
  const playoffResolvedBashoCount = world.makuuchiRace.filter((race) => race.playoffResolved).length;
  const playoffNotResolvedBashoCount = world.makuuchiRace.filter((race) => race.playoffNotResolved).length;
  const multiYushoBashoCount = world.makuuchiRace.filter((race) => race.yushoCount > 1).length;
  const excessiveJunYushoBashoCount = world.makuuchiRace.filter((race) => race.junYushoCount >= 4).length;
  const promotions = world.yokozunaPromotions.length;
  const playoffWindowPromotions = world.yokozunaPromotions.filter((event) => event.hasPlayoffWindow).length;
  const topTieWindowPromotions = world.yokozunaPromotions.filter((event) => event.hasTopTieWindow).length;
  const playoffRunnerUpWindowPromotions = world.yokozunaPromotions.filter((event) => event.hasPlayoffRunnerUpWindow).length;
  const junYushoWindowPromotions = world.yokozunaPromotions.filter((event) =>
    Boolean(event.current?.junYusho || event.previous?.junYusho)).length;
  const yushoWindowPromotions = world.yokozunaPromotions.filter((event) =>
    Boolean(event.current?.yusho || event.previous?.yusho)).length;

  return {
    label: world.label,
    seed: world.seed,
    eraSnapshotId: world.eraSnapshotId,
    publicEraLabel: world.publicEraLabel,
    eraTags: world.eraTags,
    bashoCount,
    yushoCount,
    junYushoCount,
    yushoPerBasho: bashoCount > 0 ? round3(yushoCount / bashoCount) : 0,
    junYushoPerBasho: bashoCount > 0 ? round3(junYushoCount / bashoCount) : 0,
    topTieBashoCount,
    topTieSizeHistogram: histogram(world.makuuchiRace.map((race) => race.topTieSize)),
    playoffNeededBashoCount,
    playoffResolvedBashoCount,
    playoffNotResolvedBashoCount,
    multiYushoBashoCount,
    excessiveJunYushoBashoCount,
    yokozunaPromotions: promotions,
    playoffWindowPromotions,
    topTieWindowPromotions,
    playoffRunnerUpWindowPromotions,
    junYushoWindowPromotions,
    yushoWindowPromotions,
    playoffWindowPromotionRate: promotions > 0 ? round3(playoffWindowPromotions / promotions) : 0,
    playoffRunnerUpPromotionRate: promotions > 0 ? round3(playoffRunnerUpWindowPromotions / promotions) : 0,
    junYushoWindowPromotionRate: promotions > 0 ? round3(junYushoWindowPromotions / promotions) : 0,
    yushoWindowPromotionRate: promotions > 0 ? round3(yushoWindowPromotions / promotions) : 0,
    causeClassification: causeClassification(world),
    promotionTraces: world.yokozunaPromotions,
  };
};

const writeMarkdown = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const lines: string[] = [
    '# Yusho / playoff realism diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseYushoPlayoffRealism.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | tags | basho | yusho/basho | junYusho/basho | top-tie basho | top-tie hist | playoff needed/resolved/unresolved | multi yusho | junYusho>=4 | Y promotions | yusho window | junYusho window | playoff window | playoff runner-up window | classification |',
    '| --- | ---:| --- | ---:| ---:| ---:| ---:| --- | --- | ---:| ---:| ---:| --- | --- | --- | --- |',
  ];
  for (const summary of summaries) {
    lines.push(
      `| ${summary.label} | ${summary.seed} | ${summary.eraTags.join(', ') || '-'} | ${summary.bashoCount} | ${summary.yushoCount}/${summary.yushoPerBasho} | ${summary.junYushoCount}/${summary.junYushoPerBasho} | ${summary.topTieBashoCount} | \`${JSON.stringify(summary.topTieSizeHistogram)}\` | ${summary.playoffNeededBashoCount}/${summary.playoffResolvedBashoCount}/${summary.playoffNotResolvedBashoCount} | ${summary.multiYushoBashoCount} | ${summary.excessiveJunYushoBashoCount} | ${summary.yokozunaPromotions} | ${summary.yushoWindowPromotions}/${summary.yushoWindowPromotionRate} | ${summary.junYushoWindowPromotions}/${summary.junYushoWindowPromotionRate} | ${summary.playoffWindowPromotions}/${summary.playoffWindowPromotionRate} | ${summary.playoffRunnerUpWindowPromotions}/${summary.playoffRunnerUpPromotionRate} | ${summary.causeClassification} |`,
    );
  }

  lines.push('');
  lines.push('## Yokozuna Promotion Traces');
  lines.push('');
  lines.push('| world | seed | basho | rikishi | from -> to | record | decision | current race | previous race | tie/playoff flags |');
  lines.push('| --- | ---:| ---:| --- | --- | --- | --- | --- | --- | --- |');
  for (const summary of summaries) {
    for (const trace of summary.promotionTraces) {
      const formatRace = (race: RaceFlag | null): string => {
        if (!race) return '-';
        const labels = [
          race.yusho ? 'Y' : '',
          race.junYusho ? 'JY' : '',
          race.topTie ? `tie${race.topTieSize}` : '',
          race.playoffWinner ? 'PO-win' : '',
          race.playoffRunnerUp ? 'PO-runner' : '',
        ].filter(Boolean);
        return `${race.wins}勝 ${rankLabel(race.rank)} ${labels.join('/') || '-'}`;
      };
      lines.push(
        `| ${summary.label} | ${summary.seed} | ${trace.basho} | ${trace.shikona} | ${trace.fromRank} -> ${trace.toRank} | ${trace.record} | ${trace.decisionBand} (${trace.currentEquivalent}+${trace.previousEquivalent}=${trace.combinedEquivalent}) | ${formatRace(trace.current)} | ${formatRace(trace.previous)} | tie=${trace.hasTopTieWindow} playoffRunnerUp=${trace.hasPlayoffRunnerUpWindow} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Reading Notes');
  lines.push('');
  lines.push('- `top-tie basho` は幕内で最高勝ち星が複数人いた場所。');
  lines.push('- `playoff resolved` は同星トップがあり、かつ yusho が1人だけ付いた場所。');
  lines.push('- `yusho window` / `junYusho window` は横綱昇進者の直前2場所に、それぞれのラベルが含まれた件数。');
  lines.push('- `playoff runner-up window` は横綱昇進者の直前2場所に、同星トップ決定戦敗者の junYusho が含まれた件数。');
  lines.push('- 本診断は優勝・準優勝ラベルの読み取りと横綱昇進窓の接続だけを見る。人数上限、昇進条件の雑な厳格化、battle/torikumi 改造はしない。');
  fs.writeFileSync(path.join(outDir, 'yusho_playoff_realism_diagnostics.md'), lines.join('\n'));
};

const writeAudit = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const totalMultiYusho = summaries.reduce((sum, summary) => sum + summary.multiYushoBashoCount, 0);
  const totalUnresolved = summaries.reduce((sum, summary) => sum + summary.playoffNotResolvedBashoCount, 0);
  const totalPromotions = summaries.reduce((sum, summary) => sum + summary.yokozunaPromotions, 0);
  const totalRunnerUpWindow = summaries.reduce((sum, summary) => sum + summary.playoffRunnerUpWindowPromotions, 0);
  const totalJunYushoWindow = summaries.reduce((sum, summary) => sum + summary.junYushoWindowPromotions, 0);
  const totalYushoWindow = summaries.reduce((sum, summary) => sum + summary.yushoWindowPromotions, 0);
  const lines = [
    '# Yusho / playoff realism audit',
    '',
    '## Scope',
    '',
    '優勝・準優勝ラベルの生成経路と、横綱昇進判定への接続を監査する。上位昇進条件そのもの、ability floor、人数上限、強制整理は扱わない。',
    '',
    '## Source Findings',
    '',
    '- `src/logic/simulation/yusho.ts` の `resolveYushoResolution` が優勝解決の共通入口。最高勝ち星が複数いる場合は `runPlayoff` で1人の `winnerId` を返す。',
    '- `runPlayoff` は同星者を seed 順に並べた簡易トーナメントで、各番は `resolveBoutWinProb` による簡易 battle。星取表そのものには決定戦の勝敗を加算しない。',
    '- 幕内・十両 NPC は `src/logic/simulation/world/evolveDivision.ts` で `yusho` と `junYusho` を `world.lastBashoResults` と `recentSekitoriHistory` に保存する。',
    '- 幕内・十両の player は `src/logic/simulation/basho/topDivision.ts` で `world.lastBashoResults` から yusho / junYusho を読む。NPC と player でラベル生成源は同じ。',
    '- 下位 division の player は `src/logic/simulation/basho/lowerDivision.ts` で yusho だけ読む。下位では横綱昇進に接続しないため、本診断の主対象ではない。',
    '- `src/logic/banzuke/rules/yokozunaPromotion.ts` は yusho と junYusho の両方を `currentYushoEquivalent` / `prevYushoEquivalent` として扱う。yusho は最低14.5勝相当、junYusho は最低13.5勝相当に底上げされる。',
    '- 横綱昇進判定は決定戦勝者/敗者の明示区別を見ていない。区別は `yusho` と `junYusho` に畳み込まれている。',
    '',
    '## Diagnosis Result',
    '',
    `- Multiple-yusho basho: ${totalMultiYusho}`,
    `- Playoff-not-resolved basho: ${totalUnresolved}`,
    `- Yokozuna promotions: ${totalPromotions}`,
    `- Yokozuna promotions with yusho in 2-basho window: ${totalYushoWindow}`,
    `- Yokozuna promotions with junYusho in 2-basho window: ${totalJunYushoWindow}`,
    `- Yokozuna promotions with playoff runner-up in 2-basho window: ${totalRunnerUpWindow}`,
    '',
    '## Interpretation',
    '',
    totalMultiYusho > 0 || totalUnresolved > 0
      ? '優勝解決の一意性に問題がある。修正するなら yusho を1人に限定する処理を最優先で見るべき。'
      : totalRunnerUpWindow > 0
        ? 'yusho は一意に解決されているが、決定戦敗者 junYusho が横綱昇進で優勝相当として効くケースがある。修正するなら yusho/junYusho の表現を細分化し、決定戦敗者を横綱昇進で実優勝と同格にしない最小変更が妥当。'
        : totalJunYushoWindow >= Math.max(2, Math.ceil(totalPromotions * 0.25))
          ? 'yusho と playoff は一意に解決されているが、junYusho が横綱昇進窓に一定数入っている。修正するなら junYusho の範囲と横綱昇進での重みを別診断するべきで、今回だけで本体修正する根拠はまだ弱い。'
          : 'この診断範囲では、優勝・準優勝ラベル生成は上位過密の主因として目立たない。本体修正は不要。',
    '',
    '## Guardrails',
    '',
    '- 横綱昇進条件を雑に厳格化しない。',
    '- 横綱・大関人数のハード上限は入れない。',
    '- 強制引退、強制降格は入れない。',
    '- battle / torikumi 本体を大改造しない。',
    '- Dexie schema bump はしない。',
  ];
  fs.writeFileSync(path.join(outDir, 'yusho_playoff_realism_audit.md'), lines.join('\n'));
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
    path.join(outDir, 'yusho_playoff_realism_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seeds: SEEDS, summaries, raw: diagnostics }, null, 2),
  );
  writeMarkdown(outDir, summaries);
  writeAudit(outDir, summaries);

  console.log(`Yusho/playoff realism diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  for (const summary of summaries) {
    console.log('');
    console.log(`=== ${summary.label} seed=${summary.seed} ===`);
    if (summary.eraTags.length > 0) console.log(`  eraTags=${summary.eraTags.join(',')}`);
    console.log(
      `  yusho=${summary.yushoCount} (${summary.yushoPerBasho}/basho) junYusho=${summary.junYushoCount} (${summary.junYushoPerBasho}/basho)`,
    );
    console.log(
      `  topTie=${summary.topTieBashoCount} hist=${JSON.stringify(summary.topTieSizeHistogram)} playoff=${summary.playoffNeededBashoCount}/${summary.playoffResolvedBashoCount}/${summary.playoffNotResolvedBashoCount}`,
    );
    console.log(
      `  multiYusho=${summary.multiYushoBashoCount} junYusho>=4=${summary.excessiveJunYushoBashoCount}`,
    );
    console.log(
      `  yokozunaPromotions=${summary.yokozunaPromotions} yushoWindow=${summary.yushoWindowPromotions} junYushoWindow=${summary.junYushoWindowPromotions} playoffWindow=${summary.playoffWindowPromotions} runnerUpWindow=${summary.playoffRunnerUpWindowPromotions}`,
    );
    console.log(`  classification=${summary.causeClassification}`);
  }
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
