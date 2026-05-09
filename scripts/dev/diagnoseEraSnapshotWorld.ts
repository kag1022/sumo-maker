#!/usr/bin/env npx tsx
/**
 * scripts/dev/diagnoseEraSnapshotWorld.ts
 *
 * Phase 7-D 診断: EraSnapshot を NPC factory に注入した直後の初期 world
 * (= 場所進行ゼロ) の分布を、複数の EraSnapshot と legacy (undefined) で比較する。
 *
 * - player は除外して NPC のみ集計
 * - division headcount / age p25/p50/p75 / body height/weight p50 /
 *   ability p25/p50/p75 / careerStage 分布 / syntheticCareerStartYear ユニーク数 /
 *   topRankStructure と Makuuchi 上位 stage gating の効果
 *
 * Usage:
 *   npx tsx scripts/dev/diagnoseEraSnapshotWorld.ts [--seed N] [--ids id1,id2,...]
 *
 * Output:
 *   docs/design/era_snapshot_world_diagnostics_data.json
 *   docs/design/era_snapshot_world_diagnostics.md (実測値セクションを上書き)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createSimulationWorld } from '../../src/logic/simulation/world/factory';
import { listEraSnapshots, getEraSnapshotById } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot } from '../../src/logic/era/types';
import type { PersistentActor } from '../../src/logic/simulation/npc/types';
import type { ActiveDivision } from '../../src/logic/simulation/npc/types';
import { resolveEraDivisionSlots, resolveEraTopSanyakuSlotCount } from '../../src/logic/simulation/npc/eraIntegration';

const args = process.argv.slice(2);
const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};
const argStr = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};

const SEED = argInt('--seed', 20260413);
const IDS_ARG = argStr('--ids', '');

const lcg = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

const ACTIVE_DIVISIONS: ActiveDivision[] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
];

const quantile = (sorted: number[], q: number): number => {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)));
  return sorted[idx];
};

interface DivisionStats {
  count: number;
  ageP25: number;
  ageP50: number;
  ageP75: number;
  heightP50: number;
  weightP50: number;
  abilityP25: number;
  abilityP50: number;
  abilityP75: number;
  stageHistogram: Record<string, number>;
}

interface WorldStats {
  label: string;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  resolvedSlots: ReturnType<typeof resolveEraDivisionSlots>;
  topSanyakuCount: number;
  divisionStats: Record<ActiveDivision, DivisionStats>;
  totalNpc: number;
  syntheticStartYearUnique: number;
  syntheticStartYearMin: number | null;
  syntheticStartYearMax: number | null;
  topMakuuchiStageHistogram: Record<string, number>;
  topMakuuchiRookieRisingCount: number;
}

const buildDivisionStats = (npcs: PersistentActor[]): DivisionStats => {
  const ages = npcs.map((n) => n.age).sort((a, b) => a - b);
  const heights = npcs.map((n) => n.heightCm).sort((a, b) => a - b);
  const weights = npcs.map((n) => n.weightKg).sort((a, b) => a - b);
  const abilities = npcs.map((n) => n.ability).sort((a, b) => a - b);
  const stageHistogram: Record<string, number> = {};
  for (const npc of npcs) {
    const key = npc.initialCareerStage ?? 'undefined';
    stageHistogram[key] = (stageHistogram[key] ?? 0) + 1;
  }
  return {
    count: npcs.length,
    ageP25: quantile(ages, 0.25),
    ageP50: quantile(ages, 0.5),
    ageP75: quantile(ages, 0.75),
    heightP50: Math.round(quantile(heights, 0.5) * 10) / 10,
    weightP50: Math.round(quantile(weights, 0.5) * 10) / 10,
    abilityP25: Math.round(quantile(abilities, 0.25) * 10) / 10,
    abilityP50: Math.round(quantile(abilities, 0.5) * 10) / 10,
    abilityP75: Math.round(quantile(abilities, 0.75) * 10) / 10,
    stageHistogram,
  };
};

const collectWorldStats = (label: string, eraSnapshot: EraSnapshot | undefined): WorldStats => {
  const rng = lcg(SEED);
  const world = createSimulationWorld(rng, { eraSnapshot, currentYear: 2026 });
  const allNpc: PersistentActor[] = [];
  for (const actor of world.actorRegistry.values()) {
    if (actor.actorType === 'PLAYER') continue;
    allNpc.push(actor);
  }
  const byDivision = (div: ActiveDivision): PersistentActor[] =>
    allNpc.filter((n) => n.division === div);

  const divisionStats = {} as Record<ActiveDivision, DivisionStats>;
  for (const div of ACTIVE_DIVISIONS) {
    divisionStats[div] = buildDivisionStats(byDivision(div));
  }

  const startYears = allNpc
    .map((n) => n.syntheticCareerStartYear)
    .filter((y): y is number => typeof y === 'number');
  const startYearUnique = new Set(startYears).size;
  const startYearMin = startYears.length > 0 ? Math.min(...startYears) : null;
  const startYearMax = startYears.length > 0 ? Math.max(...startYears) : null;

  const topSanyakuCount = resolveEraTopSanyakuSlotCount(eraSnapshot);
  const makuuchi = byDivision('Makuuchi').slice().sort((a, b) => a.rankScore - b.rankScore);
  const topMakuuchi = makuuchi.slice(0, topSanyakuCount);
  const topStageHistogram: Record<string, number> = {};
  for (const npc of topMakuuchi) {
    const key = npc.initialCareerStage ?? 'undefined';
    topStageHistogram[key] = (topStageHistogram[key] ?? 0) + 1;
  }
  const topRookieRising =
    (topStageHistogram.rookie ?? 0) + (topStageHistogram.rising ?? 0);

  return {
    label,
    eraSnapshotId: eraSnapshot?.id ?? null,
    publicEraLabel: eraSnapshot?.publicEraLabel ?? null,
    resolvedSlots: resolveEraDivisionSlots(eraSnapshot),
    topSanyakuCount,
    divisionStats,
    totalNpc: allNpc.length,
    syntheticStartYearUnique: startYearUnique,
    syntheticStartYearMin: startYearMin,
    syntheticStartYearMax: startYearMax,
    topMakuuchiStageHistogram: topStageHistogram,
    topMakuuchiRookieRisingCount: topRookieRising,
  };
};

const pickSampleSnapshots = (): EraSnapshot[] => {
  if (IDS_ARG.trim().length > 0) {
    return IDS_ARG.split(',')
      .map((id) => getEraSnapshotById(id.trim()))
      .filter((s): s is EraSnapshot => s != null);
  }
  // Default: 1965 / 1985 / 2005 / 2025 周辺の代表的場所を1つずつ
  const all = listEraSnapshots();
  const find = (yearPrefix: string): EraSnapshot | undefined =>
    all.find((s) => s.id.startsWith(yearPrefix)) ?? undefined;
  const candidates = [find('1965'), find('1985'), find('2005'), find('2025')].filter(
    (s): s is EraSnapshot => s != null,
  );
  if (candidates.length === 0) {
    // fallback: first 4 evenly spaced
    const step = Math.max(1, Math.floor(all.length / 4));
    return [0, 1, 2, 3].map((i) => all[i * step]).filter((s): s is EraSnapshot => s != null);
  }
  return candidates;
};

const main = (): void => {
  const samples = pickSampleSnapshots();
  const worlds: WorldStats[] = [];
  worlds.push(collectWorldStats('legacy (undefined)', undefined));
  for (const snap of samples) {
    worlds.push(collectWorldStats(`era:${snap.publicEraLabel} (${snap.id})`, snap));
  }

  // JSON 出力
  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'era_snapshot_world_diagnostics_data.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ seed: SEED, worlds }, null, 2));

  // Console summary
  console.log(`Seed: ${SEED}`);
  console.log(`Worlds compared: ${worlds.length} (legacy + ${samples.length} eras)`);
  console.log('');
  for (const w of worlds) {
    console.log(`=== ${w.label} ===`);
    console.log(`  totalNpc=${w.totalNpc}  topSanyakuCount=${w.topSanyakuCount}`);
    console.log(
      `  syntheticStartYear: unique=${w.syntheticStartYearUnique} min=${w.syntheticStartYearMin} max=${w.syntheticStartYearMax}`,
    );
    console.log(
      `  topMakuuchi rookie+rising=${w.topMakuuchiRookieRisingCount} hist=${JSON.stringify(w.topMakuuchiStageHistogram)}`,
    );
    for (const div of ACTIVE_DIVISIONS) {
      const s = w.divisionStats[div];
      console.log(
        `  ${div.padEnd(10)} n=${String(s.count).padStart(3)} age p25/50/75=${s.ageP25}/${s.ageP50}/${s.ageP75} ` +
          `body h=${s.heightP50} w=${s.weightP50} ability p25/50/75=${s.abilityP25}/${s.abilityP50}/${s.abilityP75}`,
      );
    }
    console.log('');
  }

  // Markdown 実測値セクションを既存 diagnostics.md に上書き挿入
  const mdPath = path.join(outDir, 'era_snapshot_world_diagnostics.md');
  const existing = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '';
  const marker = '\n## 実測値 (auto-generated by diagnoseEraSnapshotWorld.ts)\n';
  const head = existing.includes(marker) ? existing.slice(0, existing.indexOf(marker)) : existing;
  const lines: string[] = [marker];
  lines.push(`Seed: \`${SEED}\` / Worlds: ${worlds.length} (legacy + ${samples.length} eras)`);
  lines.push('');
  lines.push('### Division headcount (resolved slots)');
  lines.push('');
  lines.push('| world | Mak | Jur | Mks | San | Jod | Jok | total |');
  lines.push('| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:|');
  for (const w of worlds) {
    const s = w.resolvedSlots;
    lines.push(
      `| ${w.label} | ${s.Makuuchi} | ${s.Juryo} | ${s.Makushita} | ${s.Sandanme} | ${s.Jonidan} | ${s.Jonokuchi} | ${w.totalNpc} |`,
    );
  }
  lines.push('');
  lines.push('### Age p50 / Body p50 / Ability p50 by division');
  lines.push('');
  for (const div of ACTIVE_DIVISIONS) {
    lines.push(`#### ${div}`);
    lines.push('');
    lines.push('| world | n | age p25/50/75 | h p50 | w p50 | ability p25/50/75 |');
    lines.push('| --- | ---:| --- | ---:| ---:| --- |');
    for (const w of worlds) {
      const s = w.divisionStats[div];
      lines.push(
        `| ${w.label} | ${s.count} | ${s.ageP25}/${s.ageP50}/${s.ageP75} | ${s.heightP50} | ${s.weightP50} | ${s.abilityP25}/${s.abilityP50}/${s.abilityP75} |`,
      );
    }
    lines.push('');
  }
  lines.push('### Synthetic career start year (NPC 同期問題)');
  lines.push('');
  lines.push('| world | unique | min | max |');
  lines.push('| --- | ---:| ---:| ---:|');
  for (const w of worlds) {
    lines.push(
      `| ${w.label} | ${w.syntheticStartYearUnique} | ${w.syntheticStartYearMin ?? '-'} | ${w.syntheticStartYearMax ?? '-'} |`,
    );
  }
  lines.push('');
  lines.push('### Makuuchi top sanyaku slots — career stage gating');
  lines.push('');
  lines.push('| world | topSanyakuCount | rookie+rising | histogram |');
  lines.push('| --- | ---:| ---:| --- |');
  for (const w of worlds) {
    lines.push(
      `| ${w.label} | ${w.topSanyakuCount} | ${w.topMakuuchiRookieRisingCount} | \`${JSON.stringify(w.topMakuuchiStageHistogram)}\` |`,
    );
  }
  lines.push('');
  lines.push('### Career stage histogram by division (era worlds)');
  lines.push('');
  for (const w of worlds) {
    if (!w.eraSnapshotId) continue;
    lines.push(`#### ${w.label}`);
    lines.push('');
    lines.push('| division | histogram |');
    lines.push('| --- | --- |');
    for (const div of ACTIVE_DIVISIONS) {
      lines.push(`| ${div} | \`${JSON.stringify(w.divisionStats[div].stageHistogram)}\` |`);
    }
    lines.push('');
  }

  fs.writeFileSync(mdPath, head + lines.join('\n'));
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${mdPath} (auto-generated section appended)`);
};

main();
