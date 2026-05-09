#!/usr/bin/env npx tsx
/**
 * EraSnapshot 適用後の横綱・大関・三役NPCについて、初期能力・年齢・
 * careerStage と複数場所の星取を診断する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import type { MakuuchiLayout } from '../../src/logic/banzuke/scale/banzukeLayout';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot } from '../../src/logic/era/types';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import type { PersistentActor } from '../../src/logic/simulation/npc/types';
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

const BASHO = argInt('--basho', 6);
const SEED = argInt('--seed', 20260415);
const WORLDS_ARG = argStr('--worlds', 'legacy,era1985,era2005');

const TOP_RANK_NAMES = ['横綱', '大関', '関脇', '小結'] as const;
type TopRank = (typeof TOP_RANK_NAMES)[number];

interface InitialTopRankProfile {
  rosterIndex: number;
  age: number;
  ability: number;
  initialCareerStage: string | null;
  syntheticCareerStartYear: number | null;
}

interface BashoRecord {
  basho: number;
  rankLabel: TopRank;
  wins: number;
  losses: number;
  absent: number;
  actorId: string;
  age: number;
  initialCareerStage: string | null;
  ability: number | null;
  expectedWins: number | null;
  strengthOfSchedule: number | null;
}

interface WorldDiagnostic {
  label: string;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  initialTopSanyaku: {
    yokozuna: InitialTopRankProfile[];
    ozeki: InitialTopRankProfile[];
    sanyaku: InitialTopRankProfile[];
  };
  initialAbilityP50: { yokozuna: number | null; ozeki: number | null; sanyaku: number | null };
  initialAgeP50: { yokozuna: number | null; ozeki: number | null; sanyaku: number | null };
  records: BashoRecord[];
  retiredYokozunaCount: number;
  retiredOzekiCount: number;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const median = (xs: number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const isMakekoshi = (wins: number, losses: number): boolean =>
  wins < losses;

const isSevereMakekoshi = (wins: number, losses: number): boolean => {
  const total = wins + losses;
  if (total === 0) return false;
  return wins / total <= 0.35;
};

const collectInitialTopRank = (
  registry: Map<string, PersistentActor>,
  layout: MakuuchiLayout,
): WorldDiagnostic['initialTopSanyaku'] => {
  const makuuchi = [...registry.values()]
    .filter((a) => a.actorType === 'NPC' && a.division === 'Makuuchi')
    .sort((a, b) => a.rankScore - b.rankScore);
  const slots = {
    yokozuna: layout.yokozuna,
    ozeki: layout.ozeki,
    sanyaku: layout.sekiwake + layout.komusubi,
  };
  const make = (start: number, count: number): InitialTopRankProfile[] =>
    makuuchi.slice(start, start + count).map((a, i) => ({
      rosterIndex: start + i,
      age: a.age,
      ability: a.ability,
      initialCareerStage: a.initialCareerStage ?? null,
      syntheticCareerStartYear: a.syntheticCareerStartYear ?? null,
    }));
  return {
    yokozuna: make(0, slots.yokozuna),
    ozeki: make(slots.yokozuna, slots.ozeki),
    sanyaku: make(slots.yokozuna + slots.ozeki, slots.sanyaku),
  };
};

const findEraSnapshot = (key: string): EraSnapshot | undefined => {
  const all = listEraSnapshots();
  const aliases: Record<string, string> = {
    era1965: 'era-1965',
    era1985: 'era-1985',
    era1993: 'era-1993',
    era2005: 'era-2005',
    era2025: 'era-2025',
  };
  const prefix = aliases[key] ?? (/^era\d{4}$/.test(key) ? `era-${key.slice(3)}` : undefined);
  if (prefix) return all.find((s) => s.id.startsWith(prefix));
  if (key.startsWith('era-')) return all.find((s) => s.id === key);
  return undefined;
};

const runWorld = async (
  label: string,
  eraSnapshotId: string | undefined,
  publicEraLabel: string | undefined,
  eraTags: string[],
): Promise<WorldDiagnostic> => {
  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(SEED));
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `top-rank-diag-${label}-${SEED}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
      runOptions: eraSnapshotId
        ? { eraSnapshotId, eraTags, publicEraLabel: publicEraLabel ?? undefined }
        : undefined,
    },
    {
      random: createSeededRandom(SEED + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  const initialWorld = runtime.__getWorldForDiagnostics();
  const initialTopSanyaku = collectInitialTopRank(
    initialWorld.actorRegistry,
    initialWorld.makuuchiLayout,
  );
  const records: BashoRecord[] = [];
  let retiredYokozunaCount = 0;
  let retiredOzekiCount = 0;
  const previouslyActiveYokozuna = new Set<string>();
  const previouslyActiveOzeki = new Set<string>();

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const activeThisBasho = { yokozuna: new Set<string>(), ozeki: new Set<string>() };

    for (const rec of world.lastBashoResults.Makuuchi ?? []) {
      const rankLabel = rec.rank.name as TopRank;
      if (!TOP_RANK_NAMES.includes(rankLabel)) continue;
      const actor = world.actorRegistry.get(rec.id);
      records.push({
        basho: b + 1,
        rankLabel,
        wins: rec.wins,
        losses: rec.losses,
        absent: rec.absent ?? 0,
        actorId: rec.id,
        age: actor?.age ?? -1,
        initialCareerStage: actor?.initialCareerStage ?? null,
        ability: actor?.ability ?? null,
        expectedWins: rec.expectedWins ?? null,
        strengthOfSchedule: rec.strengthOfSchedule ?? null,
      });
      if (rankLabel === '横綱') activeThisBasho.yokozuna.add(rec.id);
      if (rankLabel === '大関') activeThisBasho.ozeki.add(rec.id);
    }

    for (const id of previouslyActiveYokozuna) {
      const actor = world.actorRegistry.get(id);
      if (actor && !actor.active) {
        retiredYokozunaCount += 1;
        previouslyActiveYokozuna.delete(id);
      }
    }
    for (const id of previouslyActiveOzeki) {
      const actor = world.actorRegistry.get(id);
      if (actor && !actor.active) {
        retiredOzekiCount += 1;
        previouslyActiveOzeki.delete(id);
      }
    }
    for (const id of activeThisBasho.yokozuna) previouslyActiveYokozuna.add(id);
    for (const id of activeThisBasho.ozeki) previouslyActiveOzeki.add(id);
  }

  return {
    label,
    eraSnapshotId: eraSnapshotId ?? null,
    publicEraLabel: publicEraLabel ?? null,
    eraTags,
    initialTopSanyaku,
    initialAbilityP50: {
      yokozuna: median(initialTopSanyaku.yokozuna.map((p) => p.ability)),
      ozeki: median(initialTopSanyaku.ozeki.map((p) => p.ability)),
      sanyaku: median(initialTopSanyaku.sanyaku.map((p) => p.ability)),
    },
    initialAgeP50: {
      yokozuna: median(initialTopSanyaku.yokozuna.map((p) => p.age)),
      ozeki: median(initialTopSanyaku.ozeki.map((p) => p.age)),
      sanyaku: median(initialTopSanyaku.sanyaku.map((p) => p.age)),
    },
    records,
    retiredYokozunaCount,
    retiredOzekiCount,
  };
};

const summarizeRecords = (records: BashoRecord[], rank: TopRank) => {
  const filtered = records.filter((r) => r.rankLabel === rank);
  const total = filtered.length;
  const wins = filtered.reduce((s, r) => s + r.wins, 0);
  const losses = filtered.reduce((s, r) => s + r.losses, 0);
  const absences = filtered.reduce((s, r) => s + r.absent, 0);
  const expectedWins = filtered.reduce((s, r) => s + (r.expectedWins ?? 0), 0);
  const sosValues = filtered
    .map((r) => r.strengthOfSchedule)
    .filter((v): v is number => typeof v === 'number');
  const makekoshi = filtered.filter((r) => isMakekoshi(r.wins, r.losses)).length;
  const severe = filtered.filter((r) => isSevereMakekoshi(r.wins, r.losses)).length;
  const kachikoshi = filtered.filter((r) => r.wins > r.losses + r.absent).length;

  return {
    rank,
    total,
    makekoshi,
    severe,
    kachikoshi,
    absences,
    winRateAvg: total === 0 ? 0 : round3(wins / Math.max(1, wins + losses + absences)),
    avgWins: total === 0 ? 0 : round3(wins / total),
    avgExpectedWins: total === 0 ? 0 : round3(expectedWins / total),
    avgStrengthOfSchedule:
      sosValues.length === 0
        ? null
        : round3(sosValues.reduce((s, v) => s + v, 0) / sosValues.length),
    makekoshiRate: total === 0 ? 0 : round3(makekoshi / total),
    severeRate: total === 0 ? 0 : round3(severe / total),
  };
};

const summarizeCauseSignals = (records: BashoRecord[]) => {
  const severeTopRank = records.filter((r) =>
    (r.rankLabel === '横綱' || r.rankLabel === '大関') &&
    isSevereMakekoshi(r.wins, r.losses));
  if (severeTopRank.length === 0) return null;
  return {
    severeTopRankOccurrences: severeTopRank.length,
    lowAbilityShare: round3(
      severeTopRank.filter((r) => (r.ability ?? 999) < 115).length / severeTopRank.length,
    ),
    highStrengthOfScheduleShare: round3(
      severeTopRank.filter((r) => (r.strengthOfSchedule ?? 0) >= 125).length / severeTopRank.length,
    ),
    absenceShare: round3(severeTopRank.filter((r) => r.absent > 0).length / severeTopRank.length),
    underExpectedShare: round3(
      severeTopRank.filter((r) => r.expectedWins != null && r.wins + 2 <= r.expectedWins).length /
        severeTopRank.length,
    ),
  };
};

const main = async (): Promise<void> => {
  const diagnostics: WorldDiagnostic[] = [];
  for (const key of WORLDS_ARG.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (key === 'legacy') {
      diagnostics.push(await runWorld('legacy (undefined)', undefined, undefined, []));
      continue;
    }
    const snap = findEraSnapshot(key);
    if (!snap) {
      console.warn(`Unknown world key: ${key}`);
      continue;
    }
    diagnostics.push(
      await runWorld(`era:${snap.publicEraLabel} (${snap.id})`, snap.id, snap.publicEraLabel, snap.eraTags),
    );
  }

  const summaryPerWorld = diagnostics.map((d) => ({
    label: d.label,
    eraSnapshotId: d.eraSnapshotId,
    publicEraLabel: d.publicEraLabel,
    eraTags: d.eraTags,
    initialAbilityP50: d.initialAbilityP50,
    initialAgeP50: d.initialAgeP50,
    initialTopSanyaku: d.initialTopSanyaku,
    yokozuna: summarizeRecords(d.records, '横綱'),
    ozeki: summarizeRecords(d.records, '大関'),
    sekiwake: summarizeRecords(d.records, '関脇'),
    komusubi: summarizeRecords(d.records, '小結'),
    retiredYokozunaCount: d.retiredYokozunaCount,
    retiredOzekiCount: d.retiredOzekiCount,
    decliningYokozunaWorstRecord: (() => {
      const declining = d.records.filter(
        (r) => r.rankLabel === '横綱' && r.initialCareerStage === 'declining',
      );
      if (declining.length === 0) return null;
      const severeCount = declining.filter((r) => isSevereMakekoshi(r.wins, r.losses)).length;
      return {
        totalBashoOccurrences: declining.length,
        severeCount,
        averageWins: round3(declining.reduce((sum, r) => sum + r.wins, 0) / declining.length),
        severeRate: round3(severeCount / declining.length),
      };
    })(),
    causeSignals: summarizeCauseSignals(d.records),
  }));

  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'top_rank_consistency_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seed: SEED, summaries: summaryPerWorld, raw: diagnostics }, null, 2),
  );

  console.log(`Top-rank consistency diagnostics — basho=${BASHO} seed=${SEED}`);
  for (const s of summaryPerWorld) {
    console.log('');
    console.log(`=== ${s.label} ===`);
    console.log(
      `  initial ability p50: yokozuna=${s.initialAbilityP50.yokozuna} ozeki=${s.initialAbilityP50.ozeki} sanyaku=${s.initialAbilityP50.sanyaku}`,
    );
    console.log(
      `  initial age p50: yokozuna=${s.initialAgeP50.yokozuna} ozeki=${s.initialAgeP50.ozeki} sanyaku=${s.initialAgeP50.sanyaku}`,
    );
    if (s.eraTags.length > 0) console.log(`  eraTags=${s.eraTags.join(',')}`);
    for (const r of [s.yokozuna, s.ozeki, s.sekiwake, s.komusubi]) {
      console.log(
        `  ${r.rank} occurrences=${r.total} winRate=${r.winRateAvg} avgW=${r.avgWins} expW=${r.avgExpectedWins} sos=${r.avgStrengthOfSchedule ?? '-'} absent=${r.absences} makekoshi=${r.makekoshi}/${r.total} (${r.makekoshiRate}) severe=${r.severe}/${r.total} (${r.severeRate}) kk=${r.kachikoshi}`,
      );
    }
    console.log(`  retired during run: yokozuna=${s.retiredYokozunaCount} ozeki=${s.retiredOzekiCount}`);
    if (s.decliningYokozunaWorstRecord) {
      console.log(
        `  declining yokozuna occurrences=${s.decliningYokozunaWorstRecord.totalBashoOccurrences} avgW=${s.decliningYokozunaWorstRecord.averageWins} severe=${s.decliningYokozunaWorstRecord.severeCount} (${s.decliningYokozunaWorstRecord.severeRate})`,
      );
    }
    if (s.causeSignals) {
      console.log(
        `  severe cause signals: lowAbility=${s.causeSignals.lowAbilityShare} highSoS=${s.causeSignals.highStrengthOfScheduleShare} absence=${s.causeSignals.absenceShare} underExpected=${s.causeSignals.underExpectedShare}`,
      );
    }
  }

  const lines: string[] = [
    '# Top-rank consistency — diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseTopRankConsistency.ts\` (basho=${BASHO}, seed=${SEED}).`,
    '',
    '## Initial top-sanyaku ability / age (median)',
    '',
    '| world | tags | yokozuna abil | ozeki abil | sanyaku abil | yokozuna age | ozeki age | sanyaku age |',
    '| --- | --- | ---:| ---:| ---:| ---:| ---:| ---:|',
  ];
  for (const s of summaryPerWorld) {
    lines.push(
      `| ${s.label} | ${s.eraTags.join(', ') || '-'} | ${s.initialAbilityP50.yokozuna ?? '-'} | ${s.initialAbilityP50.ozeki ?? '-'} | ${s.initialAbilityP50.sanyaku ?? '-'} | ${s.initialAgeP50.yokozuna ?? '-'} | ${s.initialAgeP50.ozeki ?? '-'} | ${s.initialAgeP50.sanyaku ?? '-'} |`,
    );
  }
  lines.push('');
  lines.push('## Records summary (rank-occurrences across all bashos)');
  lines.push('');
  lines.push('| world | rank | n | winRate | avgW | expW | sos | absent | makekoshi | severe | retired |');
  lines.push('| --- | --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|');
  for (const s of summaryPerWorld) {
    for (const r of [s.yokozuna, s.ozeki, s.sekiwake, s.komusubi]) {
      const retired =
        r.rank === '横綱' ? s.retiredYokozunaCount : r.rank === '大関' ? s.retiredOzekiCount : '-';
      lines.push(
        `| ${s.label} | ${r.rank} | ${r.total} | ${r.winRateAvg} | ${r.avgWins} | ${r.avgExpectedWins} | ${r.avgStrengthOfSchedule ?? '-'} | ${r.absences} | ${r.makekoshi} (${r.makekoshiRate}) | ${r.severe} (${r.severeRate}) | ${retired} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Severe top-rank cause signals');
  lines.push('');
  lines.push('| world | severe n | low ability | high SoS | absence | under expected |');
  lines.push('| --- | ---:| ---:| ---:| ---:| ---:|');
  for (const s of summaryPerWorld) {
    const c = s.causeSignals;
    lines.push(
      `| ${s.label} | ${c?.severeTopRankOccurrences ?? 0} | ${c?.lowAbilityShare ?? '-'} | ${c?.highStrengthOfScheduleShare ?? '-'} | ${c?.absenceShare ?? '-'} | ${c?.underExpectedShare ?? '-'} |`,
    );
  }
  lines.push('');
  lines.push('## Initial top-sanyaku detail (rosterIndex / age / stage / ability)');
  lines.push('');
  for (const s of summaryPerWorld) {
    lines.push(`### ${s.label}`);
    lines.push('');
    lines.push('| slot | rosterIdx | age | stage | ability |');
    lines.push('| --- | ---:| ---:| --- | ---:|');
    for (const p of s.initialTopSanyaku.yokozuna) {
      lines.push(`| Yokozuna | ${p.rosterIndex} | ${p.age} | ${p.initialCareerStage ?? '-'} | ${Math.round(p.ability * 10) / 10} |`);
    }
    for (const p of s.initialTopSanyaku.ozeki) {
      lines.push(`| Ozeki | ${p.rosterIndex} | ${p.age} | ${p.initialCareerStage ?? '-'} | ${Math.round(p.ability * 10) / 10} |`);
    }
    for (const p of s.initialTopSanyaku.sanyaku) {
      lines.push(`| Sanyaku | ${p.rosterIndex} | ${p.age} | ${p.initialCareerStage ?? '-'} | ${Math.round(p.ability * 10) / 10} |`);
    }
    lines.push('');
  }

  fs.writeFileSync(path.join(outDir, 'top_rank_consistency_diagnostics.md'), lines.join('\n'));
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
