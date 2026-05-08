#!/usr/bin/env npx tsx
/**
 * scripts/dev/sweepFullNpcWorldCalibration.ts
 *
 * Full-observation sweep across every NpcWorldCalibrationProfile. Uses the
 * dev-only world snapshot module (see docs/npc_rework/npc_observation_gap_report.md).
 *
 * Usage:
 *   npx tsx scripts/dev/sweepFullNpcWorldCalibration.ts \
 *       [--bashos 60] [--seed 7777] [--runs 3] [--profiles a,b,c] [--ironman-player]
 *
 * Outputs:
 *   docs/npc_rework/full_npc_world_calibration_sweep.{json,md}
 */

import * as fs from 'fs';
import * as path from 'path';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import {
  NpcWorldCalibrationProfile,
  setActiveNpcWorldCalibrationProfile,
} from '../../src/logic/simulation/npc/calibration/profile';
import { NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1 } from '../../src/logic/simulation/npc/calibration/npcWorldTargets';
import { snapshotNpcWorldForDiagnostics } from '../../src/logic/simulation/npc/diagnostics/npcWorldSnapshot';

const args = process.argv.slice(2);
const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};
const argStr = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};
const BASHOS = argInt('--bashos', 60);
const SEED = argInt('--seed', 7777);
const RUNS = argInt('--runs', 3);
const PROFILES_ARG = argStr('--profiles', '');
const IRONMAN = args.includes('--ironman-player');
const OUT_PREFIX = argStr('--out-prefix', 'full_npc_world_calibration_sweep');

const ALL_PROFILES: NpcWorldCalibrationProfile[] = [
  'legacy',
  'realdata_v1',
  'realdata_v1_more_washout',
  'realdata_v1_more_sekitori_candidates',
  'realdata_v1_shorter_careers',
  'realdata_v1_balanced',
  'realdata_v2_reach_suppressed',
  'realdata_v2_longer_careers',
  'realdata_v2_lower_heavy',
  'realdata_v2_balanced',
  'realdata_v3_top_suppressed',
  'realdata_v3_short_tail',
  'realdata_v3_final_balanced',
];

const PROFILES = PROFILES_ARG
  ? (PROFILES_ARG.split(',').map((s) => s.trim()) as NpcWorldCalibrationProfile[])
  : ALL_PROFILES;

type DivisionKey = 'Makuuchi' | 'Juryo' | 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
type HighestBucket =
  | 'yokozuna'
  | 'ozeki'
  | 'sanyaku'
  | 'maegashira'
  | 'juryo'
  | 'makushita'
  | 'sandanme'
  | 'jonidan'
  | 'jonokuchi'
  | 'unknown';

const DIV_RANK_ORDER: Record<DivisionKey, number> = {
  Jonokuchi: 1,
  Jonidan: 2,
  Sandanme: 3,
  Makushita: 4,
  Juryo: 5,
  Makuuchi: 6,
};
const isDivisionKey = (s: string | null): s is DivisionKey =>
  s !== null && s in DIV_RANK_ORDER;

interface Lg {
  finalActive: boolean;
  finalCareerBashoCount: number;
  divisionTenure: Record<DivisionKey, number>;
  highestDivisionRank: number;
  highestBucket: HighestBucket;
  finalDivision: DivisionKey | null;
  reachedJuryo: boolean;
  reachedMakuuchi: boolean;
  reachedSanyaku: boolean;
  reachedOzeki: boolean;
  reachedYokozuna: boolean;
}

const newLg = (): Lg => ({
  finalActive: true,
  finalCareerBashoCount: 0,
  divisionTenure: {
    Makuuchi: 0,
    Juryo: 0,
    Makushita: 0,
    Sandanme: 0,
    Jonidan: 0,
    Jonokuchi: 0,
  },
  highestDivisionRank: 0,
  highestBucket: 'unknown',
  finalDivision: null,
  reachedJuryo: false,
  reachedMakuuchi: false,
  reachedSanyaku: false,
  reachedOzeki: false,
  reachedYokozuna: false,
});

const classifyBucket = (
  div: DivisionKey,
  rankLabel: string | null,
): { bucket: HighestBucket; rankOrder: number } => {
  if (div === 'Makuuchi') {
    if (rankLabel === '横綱') return { bucket: 'yokozuna', rankOrder: 100 };
    if (rankLabel === '大関') return { bucket: 'ozeki', rankOrder: 90 };
    if (rankLabel === '関脇' || rankLabel === '小結')
      return { bucket: 'sanyaku', rankOrder: 80 };
    return { bucket: 'maegashira', rankOrder: 70 };
  }
  if (div === 'Juryo') return { bucket: 'juryo', rankOrder: 60 };
  if (div === 'Makushita') return { bucket: 'makushita', rankOrder: 40 };
  if (div === 'Sandanme') return { bucket: 'sandanme', rankOrder: 30 };
  if (div === 'Jonidan') return { bucket: 'jonidan', rankOrder: 20 };
  return { bucket: 'jonokuchi', rankOrder: 10 };
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
};

interface Row {
  profile: NpcWorldCalibrationProfile;
  population: number;
  reachRates: { juryo: number; makuuchi: number; sanyaku: number; ozeki: number; yokozuna: number };
  highestBucket: Record<HighestBucket, number>;
  careerBashos: { mean: number; p10: number; p50: number; p90: number; underTwelveRatio: number };
  divisionTenureP50: Record<DivisionKey, number | null>;
  eraStarDensity: { yokozunaLikeCount: number; makuuchiTopCount: number };
  observedBashos: number;
  score: number;
}

async function runSeed(profile: NpcWorldCalibrationProfile, bashos: number, seed: number) {
  setActiveNpcWorldCalibrationProfile(profile);
  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `npc-world-fullobs-sweep-${profile}-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
      __dev_ironmanPlayer: IRONMAN,
    },
    {
      random: createSeededRandom(seed + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );
  const actors = new Map<string, Lg>();
  let observed = 0;
  for (let b = 0; b < bashos; b++) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED' && !IRONMAN) break;
    observed += 1;
    const world = runtime.__getWorldForDiagnostics();
    const snap = snapshotNpcWorldForDiagnostics(world, { seq: step.seq, bashoIndex: b });
    for (const rec of snap) {
      let lg = actors.get(rec.actorId);
      if (!lg) {
        lg = newLg();
        actors.set(rec.actorId, lg);
      }
      lg.finalActive = rec.active;
      lg.finalCareerBashoCount = rec.careerBashoCount;
      const div = rec.currentDivision;
      if (isDivisionKey(div)) {
        if (rec.active) {
          lg.divisionTenure[div] += 1;
          lg.finalDivision = div;
        }
        const cls = classifyBucket(div, rec.rankLabel);
        if (cls.rankOrder > lg.highestDivisionRank) {
          lg.highestDivisionRank = cls.rankOrder;
          lg.highestBucket = cls.bucket;
        }
        if ((DIV_RANK_ORDER[div] ?? 0) >= DIV_RANK_ORDER.Juryo) lg.reachedJuryo = true;
        if (div === 'Makuuchi') lg.reachedMakuuchi = true;
        if (div === 'Makuuchi' && (rec.rankLabel === '関脇' || rec.rankLabel === '小結' || rec.rankLabel === '大関' || rec.rankLabel === '横綱'))
          lg.reachedSanyaku = true;
        if (div === 'Makuuchi' && rec.rankLabel === '大関') lg.reachedOzeki = true;
        if (div === 'Makuuchi' && rec.rankLabel === '横綱') lg.reachedYokozuna = true;
      }
    }
  }
  return { actors, observed };
}

const HIGHEST_BUCKETS: HighestBucket[] = [
  'yokozuna',
  'ozeki',
  'sanyaku',
  'maegashira',
  'juryo',
  'makushita',
  'sandanme',
  'jonidan',
  'jonokuchi',
  'unknown',
];

const summarizeRun = (
  actors: Map<string, Lg>,
  observed: number,
): Omit<Row, 'profile' | 'score'> => {
  const arr = [...actors.values()];
  const total = arr.length;
  const lengths = arr.map((a) => a.finalCareerBashoCount).sort((a, b) => a - b);
  const tenureP50: Record<DivisionKey, number | null> = {
    Makuuchi: null,
    Juryo: null,
    Makushita: null,
    Sandanme: null,
    Jonidan: null,
    Jonokuchi: null,
  };
  for (const div of Object.keys(tenureP50) as DivisionKey[]) {
    const xs = arr.map((a) => a.divisionTenure[div]).filter((v) => v > 0);
    tenureP50[div] = xs.length ? median(xs) : null;
  }
  const reach = (pred: (a: Lg) => boolean) => (total ? arr.filter(pred).length / total : 0);
  const bucketCounts: Record<HighestBucket, number> = Object.fromEntries(
    HIGHEST_BUCKETS.map((k) => [k, 0]),
  ) as Record<HighestBucket, number>;
  for (const a of arr) bucketCounts[a.highestBucket] += 1;
  const highestBucket: Record<HighestBucket, number> = Object.fromEntries(
    HIGHEST_BUCKETS.map((k) => [k, total ? bucketCounts[k] / total : 0]),
  ) as Record<HighestBucket, number>;
  return {
    population: total,
    reachRates: {
      juryo: reach((a) => a.reachedJuryo),
      makuuchi: reach((a) => a.reachedMakuuchi),
      sanyaku: reach((a) => a.reachedSanyaku),
      ozeki: reach((a) => a.reachedOzeki),
      yokozuna: reach((a) => a.reachedYokozuna),
    },
    highestBucket,
    careerBashos: {
      mean: lengths.length ? lengths.reduce((s, v) => s + v, 0) / lengths.length : 0,
      p10: percentile(lengths, 10),
      p50: percentile(lengths, 50),
      p90: percentile(lengths, 90),
      underTwelveRatio: lengths.length ? lengths.filter((v) => v < 12).length / lengths.length : 0,
    },
    divisionTenureP50: tenureP50,
    eraStarDensity: {
      yokozunaLikeCount: arr.filter((a) => a.highestBucket === 'yokozuna').length,
      makuuchiTopCount: arr.filter(
        (a) =>
          a.highestBucket === 'maegashira' ||
          a.highestBucket === 'sanyaku' ||
          a.highestBucket === 'ozeki' ||
          a.highestBucket === 'yokozuna',
      ).length,
    },
    observedBashos: observed,
  };
};

const averageRows = (rows: Omit<Row, 'profile' | 'score'>[]): Omit<Row, 'profile' | 'score'> => {
  if (rows.length === 1) return rows[0];
  const acc: any = JSON.parse(JSON.stringify(rows[0]));
  for (let i = 1; i < rows.length; i++) {
    const add = (t: any, s: any) => {
      for (const k of Object.keys(s)) {
        const v = s[k];
        if (typeof v === 'number') t[k] = (t[k] ?? 0) + v;
        else if (v && typeof v === 'object' && !Array.isArray(v)) {
          t[k] = t[k] ?? {};
          add(t[k], v);
        }
      }
    };
    add(acc, rows[i]);
  }
  const div = (t: any) => {
    for (const k of Object.keys(t)) {
      const v = t[k];
      if (typeof v === 'number') t[k] = v / rows.length;
      else if (v && typeof v === 'object' && !Array.isArray(v)) div(v);
    }
  };
  div(acc);
  return acc;
};

/**
 * Composite distance score. Smaller is better. See docs/npc_rework/full_npc_world_calibration_tuning_report.md.
 *
 * score =
 *   3.0 * |juryoReach - target| * (juryoReach > target ? 1.5 : 1.0)
 * + 2.5 * |makuuchiReach - target|
 * + 2.0 * highestBucketL1Distance
 * + 2.0 * |careerP50 - 21| / 21
 * + 1.5 * |under12Ratio - 0.3592|
 * + 1.0 * divisionTenureL1Distance(normalized)
 * + 0.5 * eraStarDensityDistance(normalized)
 */
const computeScore = (r: Omit<Row, 'profile' | 'score'>): number => {
  const t = NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1;
  const juryoDelta = Math.abs(r.reachRates.juryo - t.reachRates.juryo);
  const juryoPenalty = r.reachRates.juryo > t.reachRates.juryo ? 1.5 : 1.0;
  const makuuchiDelta = Math.abs(r.reachRates.makuuchi - t.reachRates.makuuchi);
  let bucketL1 = 0;
  for (const k of Object.keys(t.highestBucket) as (keyof typeof t.highestBucket)[]) {
    bucketL1 += Math.abs((r.highestBucket as any)[k] - t.highestBucket[k]);
  }
  const careerP50Delta = Math.abs(r.careerBashos.p50 - t.careerBashos.p50) / t.careerBashos.p50;
  const u12Delta = Math.abs(r.careerBashos.underTwelveRatio - t.careerBashos.underTwelveRatio);
  // Tenure L1, normalized by target value per division.
  const tenureMap: Record<DivisionKey, number> = {
    Jonokuchi: t.divisionTenureP50.jonokuchi,
    Jonidan: t.divisionTenureP50.jonidan,
    Sandanme: t.divisionTenureP50.sandanme,
    Makushita: t.divisionTenureP50.makushita,
    Juryo: t.divisionTenureP50.juryo,
    Makuuchi: t.divisionTenureP50.makuuchi,
  };
  let tenureL1 = 0;
  let tenureN = 0;
  for (const div of Object.keys(tenureMap) as DivisionKey[]) {
    const sim = r.divisionTenureP50[div];
    if (sim === null) continue;
    tenureL1 += Math.abs(sim - tenureMap[div]) / Math.max(1, tenureMap[div]);
    tenureN += 1;
  }
  const tenureNorm = tenureN ? tenureL1 / tenureN : 0;
  // Era star density: compare yokozuna-like count per 1000 actors vs target reach rate.
  const denomPop = Math.max(1, r.population);
  const eraStarSim = r.eraStarDensity.yokozunaLikeCount / denomPop;
  const eraStarTarget = t.reachRates.yokozuna;
  const eraStarDelta = Math.abs(eraStarSim - eraStarTarget) / Math.max(0.001, eraStarTarget);

  return (
    3.0 * juryoDelta * juryoPenalty +
    2.5 * makuuchiDelta +
    2.0 * bucketL1 +
    2.0 * careerP50Delta +
    1.5 * u12Delta +
    1.0 * tenureNorm +
    0.5 * eraStarDelta
  );
};

async function main() {
  console.log(`Sweep (full obs): bashos=${BASHOS}, runs=${RUNS}, baseSeed=${SEED}, profiles=${PROFILES.length}`);
  const rows: Row[] = [];
  for (const p of PROFILES) {
    process.stdout.write(`  - ${p}... `);
    const t0 = Date.now();
    const perRun: Omit<Row, 'profile' | 'score'>[] = [];
    for (let r = 0; r < RUNS; r++) {
      const seed = SEED + r * 1000;
      const { actors, observed } = await runSeed(p, BASHOS, seed);
      perRun.push(summarizeRun(actors, observed));
    }
    const merged = averageRows(perRun);
    const score = computeScore(merged);
    rows.push({ profile: p, ...merged, score });
    console.log(
      `pop=${merged.population.toFixed(0)} juryo=${(merged.reachRates.juryo * 100).toFixed(2)}% score=${score.toFixed(4)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }

  const outDir = path.join(process.cwd(), 'docs', 'npc_rework');
  fs.mkdirSync(outDir, { recursive: true });
  const t = NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1;
  fs.writeFileSync(
    path.join(outDir, `${OUT_PREFIX}.json`),
    JSON.stringify({ bashos: BASHOS, runs: RUNS, baseSeed: SEED, target: t, rows }, null, 2),
    'utf-8',
  );

  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined || !Number.isFinite(n) ? 'N/A' : Number(n).toFixed(4);
  const md: string[] = [];
  md.push('# Full NPC World Calibration Sweep');
  md.push('');
  md.push(`bashos: ${BASHOS} | runs/profile: ${RUNS} | baseSeed: ${SEED} | profiles: ${PROFILES.length}`);
  md.push('');
  md.push('Full-observation harness: walks `world.actorRegistry` directly via dev-only diagnostics module. Composite score formula documented in this file.');
  md.push('');
  md.push('## Composite score formula');
  md.push('```');
  md.push('score =');
  md.push('  3.0 * |juryoReach - target| * (juryoReach > target ? 1.5 : 1.0)');
  md.push('+ 2.5 * |makuuchiReach - target|');
  md.push('+ 2.0 * highestBucketL1Distance');
  md.push('+ 2.0 * |careerP50 - 21| / 21');
  md.push('+ 1.5 * |under12Ratio - 0.3592|');
  md.push('+ 1.0 * divisionTenureL1Distance (normalized per division)');
  md.push('+ 0.5 * eraStarDensityDistance (yokozuna-like vs yokozuna target)');
  md.push('```');
  md.push('');
  md.push('## Reach rates by profile (averaged across runs)');
  md.push('| profile | pop | juryo | makuuchi | sanyaku | ozeki | yokozuna | score |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    md.push(
      `| ${r.profile} | ${r.population.toFixed(0)} | ${fmt(r.reachRates.juryo)} | ${fmt(r.reachRates.makuuchi)} | ${fmt(r.reachRates.sanyaku)} | ${fmt(r.reachRates.ozeki)} | ${fmt(r.reachRates.yokozuna)} | ${r.score.toFixed(4)} |`,
    );
  }
  md.push(`| **target** | - | ${fmt(t.reachRates.juryo)} | ${fmt(t.reachRates.makuuchi)} | ${fmt(t.reachRates.sanyaku)} | ${fmt(t.reachRates.ozeki)} | ${fmt(t.reachRates.yokozuna)} | 0.0000 |`);
  md.push('');
  md.push('## Career bashos');
  md.push('| profile | mean | p10 | p50 | p90 | <12 |');
  md.push('|---|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    md.push(
      `| ${r.profile} | ${r.careerBashos.mean.toFixed(2)} | ${r.careerBashos.p10.toFixed(0)} | ${r.careerBashos.p50.toFixed(0)} | ${r.careerBashos.p90.toFixed(0)} | ${fmt(r.careerBashos.underTwelveRatio)} |`,
    );
  }
  md.push(`| **target** | ${t.careerBashos.mean} | ${t.careerBashos.p10} | ${t.careerBashos.p50} | ${t.careerBashos.p90} | ${fmt(t.careerBashos.underTwelveRatio)} |`);
  md.push('');
  md.push('## Division tenure p50');
  md.push('| profile | Jonokuchi | Jonidan | Sandanme | Makushita | Juryo | Makuuchi |');
  md.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    const dt = r.divisionTenureP50;
    md.push(
      `| ${r.profile} | ${dt.Jonokuchi ?? 'N/A'} | ${dt.Jonidan ?? 'N/A'} | ${dt.Sandanme ?? 'N/A'} | ${dt.Makushita ?? 'N/A'} | ${dt.Juryo ?? 'N/A'} | ${dt.Makuuchi ?? 'N/A'} |`,
    );
  }
  md.push(`| **target** | ${t.divisionTenureP50.jonokuchi} | ${t.divisionTenureP50.jonidan} | ${t.divisionTenureP50.sandanme} | ${t.divisionTenureP50.makushita} | ${t.divisionTenureP50.juryo} | ${t.divisionTenureP50.makuuchi} |`);
  md.push('');
  md.push('## Highest-bucket exclusive shares');
  md.push('| profile | yokozuna | ozeki | sanyaku | maegashira | juryo | makushita | sandanme | jonidan | jonokuchi |');
  md.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    const h = r.highestBucket;
    md.push(
      `| ${r.profile} | ${fmt(h.yokozuna)} | ${fmt(h.ozeki)} | ${fmt(h.sanyaku)} | ${fmt(h.maegashira)} | ${fmt(h.juryo)} | ${fmt(h.makushita)} | ${fmt(h.sandanme)} | ${fmt(h.jonidan)} | ${fmt(h.jonokuchi)} |`,
    );
  }
  md.push(`| **target** | ${fmt(t.highestBucket.yokozuna)} | ${fmt(t.highestBucket.ozeki)} | ${fmt(t.highestBucket.sanyaku)} | ${fmt(t.highestBucket.maegashira)} | ${fmt(t.highestBucket.juryo)} | ${fmt(t.highestBucket.makushita)} | ${fmt(t.highestBucket.sandanme)} | ${fmt(t.highestBucket.jonidan)} | ${fmt(t.highestBucket.jonokuchi)} |`);
  md.push('');
  md.push('## Ranked composite score (lower is better)');
  md.push('| rank | profile | score |');
  md.push('|---:|---|---:|');
  const ranked = [...rows].sort((a, b) => a.score - b.score);
  ranked.forEach((r, i) => md.push(`| ${i + 1} | ${r.profile} | ${r.score.toFixed(4)} |`));

  fs.writeFileSync(
    path.join(outDir, `${OUT_PREFIX}.md`),
    md.join('\n'),
    'utf-8',
  );
  console.log(`Wrote: docs/npc_rework/${OUT_PREFIX}.{json,md}`);
  console.log(`Best profile: ${ranked[0].profile} (score=${ranked[0].score.toFixed(4)})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
