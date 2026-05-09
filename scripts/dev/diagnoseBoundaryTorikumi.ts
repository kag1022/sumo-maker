#!/usr/bin/env npx tsx
/**
 * scripts/dev/diagnoseBoundaryTorikumi.ts
 *
 * Phase 7-E 診断: EraSnapshot.boundaryProfile を torikumi 生成へ接続したあと、
 * 幕下上位↔十両下位 (JuryoMakushita boundary) の cross-division 取組が
 * 境界圧 (effectiveIntensity) に応じて自然に増減するか確認する。
 *
 * 対象は scheduler 単体テスト相当の小スコープ:
 *   - 28 Juryo + 30 Makushita upper の合成 participants を構築
 *   - 既存 JuryoMakushita boundary band を有効化
 *   - boundaryContext を { undefined / low / mid / high / 0 } で切替えながら
 *     scheduleTorikumiBasho を 15日フル run
 *   - cross-division 件数 / 関与した Juryo & Makushita ランク帯 / 発生日帯 を集計
 *
 * 取組数制約 (関取15番 / 幕下7番) は scheduler 側で保証される。
 *
 * Usage:
 *   npx tsx scripts/dev/diagnoseBoundaryTorikumi.ts [--basho 12] [--seed 20260414]
 *
 * Output:
 *   docs/design/sekitori_boundary_torikumi_diagnostics.json
 *   docs/design/sekitori_boundary_torikumi_diagnostics.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { listEraSnapshots, getEraSnapshotById } from '../../src/logic/era/eraSnapshot';
import type { EraBoundaryProfile, EraSnapshot } from '../../src/logic/era/types';
import { DEFAULT_TORIKUMI_BOUNDARY_BANDS } from '../../src/logic/simulation/torikumi/policy';
import { scheduleTorikumiBasho } from '../../src/logic/simulation/torikumi/scheduler';
import type {
  TorikumiBoundaryContext,
  TorikumiParticipant,
} from '../../src/logic/simulation/torikumi/types';

const args = process.argv.slice(2);
const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};

const BASHO = argInt('--basho', 12);
const SEED = argInt('--seed', 20260414);

const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const deriveBoundaryContext = (bp: EraBoundaryProfile): TorikumiBoundaryContext => {
  const sek = bp.sekitoriBoundaryPressure ?? 0.5;
  const jur = bp.juryoDemotionPressure ?? 0.5;
  const flag = bp.crossDivisionBoutIntensity ?? 1;
  const raw = flag * (0.5 + 0.5 * sek + 0.25 * jur);
  return {
    sekitoriBoundaryPressure: bp.sekitoriBoundaryPressure,
    makushitaUpperCongestion: bp.makushitaUpperCongestion,
    juryoDemotionPressure: bp.juryoDemotionPressure,
    crossDivisionBoutIntensity: bp.crossDivisionBoutIntensity,
    effectiveIntensity: Math.max(0, Math.min(1.5, raw)),
  };
};

interface BoundaryRunResult {
  label: string;
  contextSummary: string;
  effectiveIntensity: number | null;
  totalRunsAcrossBasho: number;
  crossDivisionBoutCountTotal: number;
  juryoMakushitaBoutCountTotal: number;
  averagePerBasho: number;
  daysHistogram: Record<string, number>;
  juryoRanksInvolved: Record<string, number>;
  makushitaRanksInvolved: Record<string, number>;
  highestMakushitaUpperRank: number | null;
  lowestJuryoLowerRank: number | null;
  scheduleViolationCountTotal: number;
}

const buildParticipants = (rng: () => number): TorikumiParticipant[] => {
  const participants: TorikumiParticipant[] = [];
  // 28 Juryo: 中位は通常配分、下位は make-koshi 寄りに
  for (let n = 1; n <= 14; n += 1) {
    const stableSeed = `j-${n}`;
    const startWins = n <= 5 ? 0 : n >= 12 ? 0 : 0;
    participants.push({
      id: `J${n}E`,
      shikona: `J${n}E`,
      isPlayer: false,
      stableId: `${stableSeed}-east`,
      division: 'Juryo',
      rankScore: (n - 1) * 2 + 1,
      rankName: '十両',
      rankNumber: n,
      power: 95 - n * 1.0 + rng() * 4,
      wins: startWins,
      losses: 0,
      active: true,
      targetBouts: 15,
      boutsDone: 0,
    });
    participants.push({
      id: `J${n}W`,
      shikona: `J${n}W`,
      isPlayer: false,
      stableId: `${stableSeed}-west`,
      division: 'Juryo',
      rankScore: (n - 1) * 2 + 2,
      rankName: '十両',
      rankNumber: n,
      power: 95 - n * 1.0 + rng() * 4,
      wins: startWins,
      losses: 0,
      active: true,
      targetBouts: 15,
      boutsDone: 0,
    });
  }
  // Makushita 幕下上位 7 (boundary band: 1..5 default, intensity>=1.0 で 1..6, >=1.2 で 1..7 まで拡張)
  for (let n = 1; n <= 7; n += 1) {
    participants.push({
      id: `MS${n}E`,
      shikona: `MS${n}E`,
      isPlayer: false,
      stableId: `ms-${n}-east`,
      division: 'Makushita',
      rankScore: (n - 1) * 2 + 1,
      rankName: '幕下',
      rankNumber: n,
      power: 80 - n * 0.5 + rng() * 4,
      wins: 0,
      losses: 0,
      active: true,
      targetBouts: 7,
      boutsDone: 0,
    });
    participants.push({
      id: `MS${n}W`,
      shikona: `MS${n}W`,
      isPlayer: false,
      stableId: `ms-${n}-west`,
      division: 'Makushita',
      rankScore: (n - 1) * 2 + 2,
      rankName: '幕下',
      rankNumber: n,
      power: 80 - n * 0.5 + rng() * 4,
      wins: 0,
      losses: 0,
      active: true,
      targetBouts: 7,
      boutsDone: 0,
    });
  }
  return participants;
};

// Juryo 下位 (band 12-14) を make-koshi 寄り、Makushita 上位を kachi-koshi 寄りに進める。
// scheduler は wins/losses を毎日 1 ずつ更新するため、boundary 候補が成立する条件
// (juryo wins<=8 AND makushita wins>=4) を満たす場面が day 12+ で実際に出現する。
// ここではシナリオを変えず scheduler の自然な勝敗進行に任せる。

const runOnce = (
  ctx: TorikumiBoundaryContext | undefined,
  rng: () => number,
  result: BoundaryRunResult,
): void => {
  const participants = buildParticipants(rng);
  // 簡易勝敗シミュ: 取組ごとに rng でランダム勝敗を割り当てる onPair フック。
  // power 差にわずかなバイアスを乗せ、Juryo 下位は負けやすく、Makushita 上位は勝ちやすくする。
  const apply = (a: TorikumiParticipant, b: TorikumiParticipant): void => {
    const aBias =
      a.division === 'Juryo' && (a.rankNumber ?? 0) >= 12 ? -0.18 : 0;
    const bBias =
      b.division === 'Juryo' && (b.rankNumber ?? 0) >= 12 ? -0.18 : 0;
    const aMs =
      a.division === 'Makushita' && (a.rankNumber ?? 0) <= 7 ? 0.18 : 0;
    const bMs =
      b.division === 'Makushita' && (b.rankNumber ?? 0) <= 7 ? 0.18 : 0;
    const probA =
      0.5 + (a.power - b.power) * 0.01 + aBias - bBias + aMs - bMs;
    const aWon = rng() < Math.max(0.1, Math.min(0.9, probA));
    if (aWon) {
      a.wins += 1;
      b.losses += 1;
    } else {
      b.wins += 1;
      a.losses += 1;
    }
  };

  const out = scheduleTorikumiBasho({
    participants,
    days: Array.from({ length: 15 }, (_, i) => i + 1),
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter(
      (band) => band.id === 'JuryoMakushita',
    ),
    boundaryContext: ctx,
    rng,
    dayEligibility: (p, day) => {
      if (p.division === 'Juryo') return true;
      // Makushita 7 番制: 1,3,5,7,9,11,13 (奇数) — 簡易
      return day % 2 === 1;
    },
    onPair: (pair) => {
      apply(pair.a, pair.b);
    },
  });

  result.crossDivisionBoutCountTotal += out.diagnostics.crossDivisionBoutCount;
  result.juryoMakushitaBoutCountTotal +=
    out.diagnostics.crossDivisionByBoundary?.JuryoMakushita ?? 0;
  result.scheduleViolationCountTotal += out.diagnostics.scheduleViolations.length;

  for (const dayResult of out.days) {
    for (const pair of dayResult.pairs) {
      if (pair.boundaryId !== 'JuryoMakushita') continue;
      const dKey = String(dayResult.day);
      result.daysHistogram[dKey] = (result.daysHistogram[dKey] ?? 0) + 1;
      const juryo = pair.a.division === 'Juryo' ? pair.a : pair.b;
      const makushita = pair.a.division === 'Makushita' ? pair.a : pair.b;
      const jKey = `J${juryo.rankNumber ?? '?'}`;
      const msKey = `MS${makushita.rankNumber ?? '?'}`;
      result.juryoRanksInvolved[jKey] = (result.juryoRanksInvolved[jKey] ?? 0) + 1;
      result.makushitaRanksInvolved[msKey] =
        (result.makushitaRanksInvolved[msKey] ?? 0) + 1;
      const msNumber = makushita.rankNumber ?? 99;
      const jNumber = juryo.rankNumber ?? 99;
      result.highestMakushitaUpperRank =
        result.highestMakushitaUpperRank === null
          ? msNumber
          : Math.min(result.highestMakushitaUpperRank, msNumber);
      result.lowestJuryoLowerRank =
        result.lowestJuryoLowerRank === null
          ? jNumber
          : Math.max(result.lowestJuryoLowerRank, jNumber);
    }
  }
};

const runVariant = (
  label: string,
  ctx: TorikumiBoundaryContext | undefined,
  totalBasho: number,
  baseSeed: number,
): BoundaryRunResult => {
  const result: BoundaryRunResult = {
    label,
    contextSummary: ctx
      ? `intensity=${ctx.effectiveIntensity?.toFixed(3)} sek=${ctx.sekitoriBoundaryPressure?.toFixed(3) ?? '-'} jur=${ctx.juryoDemotionPressure?.toFixed(3) ?? '-'} flag=${ctx.crossDivisionBoutIntensity ?? '-'}`
      : 'undefined (legacy fallback)',
    effectiveIntensity: ctx?.effectiveIntensity ?? null,
    totalRunsAcrossBasho: totalBasho,
    crossDivisionBoutCountTotal: 0,
    juryoMakushitaBoutCountTotal: 0,
    averagePerBasho: 0,
    daysHistogram: {},
    juryoRanksInvolved: {},
    makushitaRanksInvolved: {},
    highestMakushitaUpperRank: null,
    lowestJuryoLowerRank: null,
    scheduleViolationCountTotal: 0,
  };
  for (let i = 0; i < totalBasho; i += 1) {
    const rng = lcg(baseSeed + i * 1009);
    runOnce(ctx, rng, result);
  }
  result.averagePerBasho =
    Math.round((result.juryoMakushitaBoutCountTotal / totalBasho) * 100) / 100;
  return result;
};

const findEraByIdPrefix = (prefix: string): EraSnapshot | undefined =>
  listEraSnapshots().find((s) => s.id.startsWith(prefix));

const main = (): void => {
  const variants: Array<{ label: string; ctx: TorikumiBoundaryContext | undefined }> = [];
  variants.push({ label: 'legacy (undefined)', ctx: undefined });
  // 強制 0 (era 側で「無かった」とされる場合)
  variants.push({
    label: 'forced intensity=0',
    ctx: { effectiveIntensity: 0 },
  });
  // 代表 era
  for (const yearPrefix of ['era-1965', 'era-1985', 'era-2005', 'era-2025']) {
    const snap = findEraByIdPrefix(yearPrefix);
    if (!snap) continue;
    variants.push({
      label: `era:${snap.publicEraLabel} (${snap.id})`,
      ctx: deriveBoundaryContext(snap.boundaryProfile),
    });
  }
  // 高境界圧の合成 ctx (効果差を見るため)
  variants.push({
    label: 'synthetic high intensity (1.4)',
    ctx: { effectiveIntensity: 1.4 },
  });
  variants.push({
    label: 'synthetic low intensity (0.4)',
    ctx: { effectiveIntensity: 0.4 },
  });

  const results = variants.map((v) => runVariant(v.label, v.ctx, BASHO, SEED));

  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'sekitori_boundary_torikumi_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seed: SEED, results }, null, 2),
  );

  console.log(`Boundary torikumi diagnostics — basho=${BASHO} seed=${SEED}`);
  console.log('');
  for (const r of results) {
    console.log(`=== ${r.label} ===`);
    console.log(`  ctx: ${r.contextSummary}`);
    console.log(
      `  JuryoMakushita boundary bouts: total=${r.juryoMakushitaBoutCountTotal} avg/basho=${r.averagePerBasho}`,
    );
    console.log(
      `  days: ${JSON.stringify(r.daysHistogram)}  scheduleViolations=${r.scheduleViolationCountTotal}`,
    );
    console.log(
      `  juryoRanks: ${JSON.stringify(r.juryoRanksInvolved)}  makushitaRanks: ${JSON.stringify(r.makushitaRanksInvolved)}`,
    );
    console.log(
      `  highestMakushitaUpperRank=${r.highestMakushitaUpperRank} lowestJuryoLowerRank=${r.lowestJuryoLowerRank}`,
    );
    console.log('');
  }

  const lines: string[] = [
    '# Sekitori Boundary Torikumi — diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseBoundaryTorikumi.ts\` (basho=${BASHO}, seed=${SEED}).`,
    '',
    '## Cross-division bouts (JuryoMakushita boundary)',
    '',
    '| variant | effectiveIntensity | total | avg/basho | violations |',
    '| --- | ---:| ---:| ---:| ---:|',
  ];
  for (const r of results) {
    lines.push(
      `| ${r.label} | ${r.effectiveIntensity ?? '-'} | ${r.juryoMakushitaBoutCountTotal} | ${r.averagePerBasho} | ${r.scheduleViolationCountTotal} |`,
    );
  }
  lines.push('');
  lines.push('## Day distribution');
  lines.push('');
  lines.push('| variant | day histogram |');
  lines.push('| --- | --- |');
  for (const r of results) {
    lines.push(`| ${r.label} | \`${JSON.stringify(r.daysHistogram)}\` |`);
  }
  lines.push('');
  lines.push('## Involved ranks');
  lines.push('');
  lines.push('| variant | Juryo ranks | Makushita ranks | highest Mks rank | lowest Jur rank |');
  lines.push('| --- | --- | --- | ---:| ---:|');
  for (const r of results) {
    lines.push(
      `| ${r.label} | \`${JSON.stringify(r.juryoRanksInvolved)}\` | \`${JSON.stringify(r.makushitaRanksInvolved)}\` | ${r.highestMakushitaUpperRank ?? '-'} | ${r.lowestJuryoLowerRank ?? '-'} |`,
    );
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push(
    '- `legacy (undefined)` と「標準的な era (effectiveIntensity ~0.85〜1.0)」は近い値になる想定。',
  );
  lines.push(
    '- `forced intensity=0` は disabled 路で 0 件になり「era にこの文化が無かった」扱いを尊重。',
  );
  lines.push(
    '- `synthetic high (1.4)` は day threshold が 11、score multiplier が 1.4 となり強めに発生。',
  );
  lines.push(
    '- 取組数 (関取 15 / 幕下 7) は scheduler 側で既存通り保証され、scheduleViolations は 0 が期待値。',
  );

  fs.writeFileSync(
    path.join(outDir, 'sekitori_boundary_torikumi_diagnostics.md'),
    lines.join('\n'),
  );
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main();
