#!/usr/bin/env npx tsx
/**
 * scripts/dev/diagnoseFullNpcWorldDistribution.ts
 *
 * Full-NPC observation diagnose harness. Iterates world.actorRegistry every
 * basho via snapshotNpcWorldForDiagnostics (dev-only) instead of relying on
 * the partial npcBashoRecords stream. See
 * docs/npc_rework/npc_observation_gap_report.md.
 *
 * Usage:
 *   npx tsx scripts/dev/diagnoseFullNpcWorldDistribution.ts \
 *       --profile legacy --bashos 120 --seed 7000 [--runs 1] [--ironman-player]
 *
 * Outputs:
 *   docs/npc_rework/full_npc_world_distribution_<profile>.json
 *   docs/npc_rework/full_npc_world_distribution_<profile>.md
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

const BASHOS = argInt('--bashos', 120);
const SEED = argInt('--seed', 7000);
const RUNS = argInt('--runs', 1);
const PROFILE = argStr('--profile', 'legacy') as NpcWorldCalibrationProfile;
const IRONMAN = args.includes('--ironman-player');

type DivisionKey =
  | 'Makuuchi'
  | 'Juryo'
  | 'Makushita'
  | 'Sandanme'
  | 'Jonidan'
  | 'Jonokuchi';

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
  s !== null && (s in DIV_RANK_ORDER);

interface Longitudinal {
  actorId: string;
  firstSeq: number;
  lastSeq: number;
  lastBashoIndex: number;
  finalActive: boolean;
  finalCareerBashoCount: number;
  divisionTenure: Record<DivisionKey, number>;
  highestDivisionRank: number;
  highestBucket: HighestBucket;
  highestDivision: DivisionKey | null;
  highestRankLabel: string | null;
  reachedJuryo: boolean;
  reachedMakuuchi: boolean;
  reachedSanyaku: boolean;
  reachedOzeki: boolean;
  reachedYokozuna: boolean;
  finalDivision: DivisionKey | null;
  careerBand: string | null;
  aptitudeTier: string | null;
  retirementProfile: string | null;
  growthType: string | null;
  abilitySamples: number[];
  divisionsSeenThisBasho: Set<number>; // seq markers for tenure (one tick per basho)
}

const newLongitudinal = (actorId: string, seq: number, bashoIndex: number): Longitudinal => ({
  actorId,
  firstSeq: seq,
  lastSeq: seq,
  lastBashoIndex: bashoIndex,
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
  highestDivision: null,
  highestRankLabel: null,
  reachedJuryo: false,
  reachedMakuuchi: false,
  reachedSanyaku: false,
  reachedOzeki: false,
  reachedYokozuna: false,
  finalDivision: null,
  careerBand: null,
  aptitudeTier: null,
  retirementProfile: null,
  growthType: null,
  abilitySamples: [],
  divisionsSeenThisBasho: new Set(),
});

const classifyBucket = (
  division: DivisionKey,
  rankLabel: string | null,
): { bucket: HighestBucket; rankOrder: number } => {
  if (division === 'Makuuchi') {
    if (rankLabel === '横綱') return { bucket: 'yokozuna', rankOrder: 100 };
    if (rankLabel === '大関') return { bucket: 'ozeki', rankOrder: 90 };
    if (rankLabel === '関脇' || rankLabel === '小結')
      return { bucket: 'sanyaku', rankOrder: 80 };
    return { bucket: 'maegashira', rankOrder: 70 };
  }
  if (division === 'Juryo') return { bucket: 'juryo', rankOrder: 60 };
  if (division === 'Makushita') return { bucket: 'makushita', rankOrder: 40 };
  if (division === 'Sandanme') return { bucket: 'sandanme', rankOrder: 30 };
  if (division === 'Jonidan') return { bucket: 'jonidan', rankOrder: 20 };
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

interface RunAggregate {
  actors: Map<string, Longitudinal>;
  observedBashos: number;
  finalSeq: number;
}

async function runOne(
  profile: NpcWorldCalibrationProfile,
  bashos: number,
  seed: number,
): Promise<RunAggregate> {
  setActiveNpcWorldCalibrationProfile(profile);
  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `npc-world-fullobs-${profile}-${seed}`,
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

  const actors = new Map<string, Longitudinal>();
  let observedBashos = 0;
  let finalSeq = 0;

  for (let b = 0; b < bashos; b++) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED' && !IRONMAN) break;
    finalSeq = step.seq;
    observedBashos += 1;
    const world = runtime.__getWorldForDiagnostics();
    const snapshot = snapshotNpcWorldForDiagnostics(world, { seq: step.seq, bashoIndex: b });

    for (const rec of snapshot) {
      let lg = actors.get(rec.actorId);
      if (!lg) {
        lg = newLongitudinal(rec.actorId, rec.seq, b);
        actors.set(rec.actorId, lg);
      }
      lg.lastSeq = rec.seq;
      lg.lastBashoIndex = b;
      lg.finalActive = rec.active;
      lg.finalCareerBashoCount = rec.careerBashoCount;
      lg.careerBand = rec.careerBand ?? lg.careerBand;
      lg.aptitudeTier = rec.aptitudeTier ?? lg.aptitudeTier;
      lg.retirementProfile = rec.retirementProfile ?? lg.retirementProfile;
      lg.growthType = rec.growthType ?? lg.growthType;
      if (rec.abilitySummary?.total !== undefined) {
        lg.abilitySamples.push(rec.abilitySummary.total);
      }

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
          lg.highestDivision = div;
          lg.highestRankLabel = rec.rankLabel ?? null;
        }
        if ((DIV_RANK_ORDER[div] ?? 0) >= DIV_RANK_ORDER.Juryo) lg.reachedJuryo = true;
        if (div === 'Makuuchi') lg.reachedMakuuchi = true;
        if (
          div === 'Makuuchi' &&
          (rec.rankLabel === '関脇' ||
            rec.rankLabel === '小結' ||
            rec.rankLabel === '大関' ||
            rec.rankLabel === '横綱')
        )
          lg.reachedSanyaku = true;
        if (div === 'Makuuchi' && rec.rankLabel === '大関') lg.reachedOzeki = true;
        if (div === 'Makuuchi' && rec.rankLabel === '横綱') lg.reachedYokozuna = true;
      }
    }
  }

  return { actors, observedBashos, finalSeq };
}

const HIGHEST_BUCKET_KEYS: HighestBucket[] = [
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

interface SummaryShape {
  coverage: {
    totalNpcActors: number;
    activeNpcActors: number;
    retiredNpcActors: number;
    snapshotCount: number;
    observedBashos: number;
    perDivisionCounts: Record<DivisionKey, number>;
  };
  reachRates: { juryo: number; makuuchi: number; sanyaku: number; ozeki: number; yokozuna: number };
  highestBucket: Record<HighestBucket, number>;
  careerBashos: { mean: number; p10: number; p50: number; p90: number; underTwelveRatio: number };
  divisionTenureP50: Record<DivisionKey, number | null>;
  careerBandMix: Record<string, number>;
  aptitudeTierMix: Record<string, number>;
  retirementProfileMix: Record<string, number>;
  growthTypeMix: Record<string, number>;
  abilityAverageByDivision: Record<DivisionKey, number | null>;
  abilityAverageByHighestBucket: Record<HighestBucket, number | null>;
  eraStarDensity: {
    yokozunaLikeCount: number;
    ozekiLikeCount: number;
    sanyakuLikeCount: number;
    makuuchiTopCount: number;
  };
}

const summarize = (run: RunAggregate): SummaryShape => {
  const arr = [...run.actors.values()];
  const totalNpcActors = arr.length;
  const activeNpcActors = arr.filter((a) => a.finalActive).length;
  const retiredNpcActors = totalNpcActors - activeNpcActors;

  const perDivisionCounts: Record<DivisionKey, number> = {
    Makuuchi: 0,
    Juryo: 0,
    Makushita: 0,
    Sandanme: 0,
    Jonidan: 0,
    Jonokuchi: 0,
  };
  for (const a of arr) {
    if (a.finalDivision) perDivisionCounts[a.finalDivision] += 1;
  }

  const reachRates = {
    juryo: totalNpcActors ? arr.filter((a) => a.reachedJuryo).length / totalNpcActors : 0,
    makuuchi: totalNpcActors ? arr.filter((a) => a.reachedMakuuchi).length / totalNpcActors : 0,
    sanyaku: totalNpcActors ? arr.filter((a) => a.reachedSanyaku).length / totalNpcActors : 0,
    ozeki: totalNpcActors ? arr.filter((a) => a.reachedOzeki).length / totalNpcActors : 0,
    yokozuna: totalNpcActors ? arr.filter((a) => a.reachedYokozuna).length / totalNpcActors : 0,
  };

  const highestBucketCounts: Record<HighestBucket, number> = Object.fromEntries(
    HIGHEST_BUCKET_KEYS.map((k) => [k, 0]),
  ) as Record<HighestBucket, number>;
  for (const a of arr) highestBucketCounts[a.highestBucket] += 1;
  const highestBucket: Record<HighestBucket, number> = Object.fromEntries(
    HIGHEST_BUCKET_KEYS.map((k) => [k, totalNpcActors ? highestBucketCounts[k] / totalNpcActors : 0]),
  ) as Record<HighestBucket, number>;

  // Career bashos: prefer finalCareerBashoCount (canonical) over snapshot count.
  const lengths = arr.map((a) => a.finalCareerBashoCount).sort((x, y) => x - y);
  const meanLen = lengths.length ? lengths.reduce((s, v) => s + v, 0) / lengths.length : 0;
  const under12 = lengths.length ? lengths.filter((v) => v < 12).length / lengths.length : 0;

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

  const mixCount = (key: 'careerBand' | 'aptitudeTier' | 'retirementProfile' | 'growthType') => {
    const out: Record<string, number> = {};
    let denom = 0;
    for (const a of arr) {
      const v = a[key] ?? 'UNSET';
      out[v] = (out[v] ?? 0) + 1;
      denom += 1;
    }
    for (const k of Object.keys(out)) out[k] = denom ? out[k] / denom : 0;
    return out;
  };

  const abilityByDivision: Record<DivisionKey, number | null> = {
    Makuuchi: null,
    Juryo: null,
    Makushita: null,
    Sandanme: null,
    Jonidan: null,
    Jonokuchi: null,
  };
  for (const div of Object.keys(abilityByDivision) as DivisionKey[]) {
    const xs = arr
      .filter((a) => a.finalDivision === div && a.abilitySamples.length > 0)
      .map((a) => a.abilitySamples[a.abilitySamples.length - 1]);
    abilityByDivision[div] = xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  }

  const abilityByBucket: Record<HighestBucket, number | null> = Object.fromEntries(
    HIGHEST_BUCKET_KEYS.map((k) => [k, null]),
  ) as Record<HighestBucket, number | null>;
  for (const k of HIGHEST_BUCKET_KEYS) {
    const xs = arr
      .filter((a) => a.highestBucket === k && a.abilitySamples.length > 0)
      .map((a) => a.abilitySamples[a.abilitySamples.length - 1]);
    abilityByBucket[k] = xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
  }

  // Era Star: classify by max sustained rank over career end. Use highestBucket directly.
  const eraStarDensity = {
    yokozunaLikeCount: arr.filter((a) => a.highestBucket === 'yokozuna').length,
    ozekiLikeCount: arr.filter((a) => a.highestBucket === 'ozeki').length,
    sanyakuLikeCount: arr.filter((a) => a.highestBucket === 'sanyaku').length,
    makuuchiTopCount: arr.filter(
      (a) =>
        a.highestBucket === 'maegashira' ||
        a.highestBucket === 'sanyaku' ||
        a.highestBucket === 'ozeki' ||
        a.highestBucket === 'yokozuna',
    ).length,
  };

  return {
    coverage: {
      totalNpcActors,
      activeNpcActors,
      retiredNpcActors,
      snapshotCount: run.actors.size,
      observedBashos: run.observedBashos,
      perDivisionCounts,
    },
    reachRates,
    highestBucket,
    careerBashos: {
      mean: Math.round(meanLen * 100) / 100,
      p10: percentile(lengths, 10),
      p50: percentile(lengths, 50),
      p90: percentile(lengths, 90),
      underTwelveRatio: Math.round(under12 * 10000) / 10000,
    },
    divisionTenureP50: tenureP50,
    careerBandMix: mixCount('careerBand'),
    aptitudeTierMix: mixCount('aptitudeTier'),
    retirementProfileMix: mixCount('retirementProfile'),
    growthTypeMix: mixCount('growthType'),
    abilityAverageByDivision: abilityByDivision,
    abilityAverageByHighestBucket: abilityByBucket,
    eraStarDensity,
  };
};

const aggregateAcrossRuns = (perRun: SummaryShape[]): SummaryShape => {
  // Average each numeric field across runs. Simple equal weighting.
  const n = perRun.length;
  if (n === 1) return perRun[0];
  const accum: any = JSON.parse(JSON.stringify(perRun[0]));
  const addNumeric = (target: any, source: any) => {
    for (const k of Object.keys(source)) {
      const v = source[k];
      if (typeof v === 'number') target[k] = (target[k] ?? 0) + v;
      else if (v && typeof v === 'object' && !Array.isArray(v)) {
        target[k] = target[k] ?? {};
        addNumeric(target[k], v);
      }
    }
  };
  for (let i = 1; i < n; i++) addNumeric(accum, perRun[i]);
  const divNumeric = (target: any) => {
    for (const k of Object.keys(target)) {
      const v = target[k];
      if (typeof v === 'number') target[k] = v / n;
      else if (v && typeof v === 'object' && !Array.isArray(v)) divNumeric(v);
    }
  };
  divNumeric(accum);
  return accum as SummaryShape;
};

const renderMarkdown = (
  profile: string,
  bashos: number,
  seeds: number[],
  summary: SummaryShape,
): string => {
  const fmt = (n: number | null | undefined) =>
    n === null || n === undefined || !Number.isFinite(n) ? 'N/A' : Number(n).toFixed(4);
  const t = NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1;
  const md: string[] = [];
  md.push(`# Full NPC World Distribution — \`${profile}\``);
  md.push('');
  md.push(`bashos: ${bashos} | runs: ${seeds.length} | seeds: ${seeds.join(', ')}`);
  md.push('');
  md.push('Full-observation harness: walks `world.actorRegistry` directly each basho. See docs/npc_rework/npc_observation_gap_report.md.');
  md.push('');
  md.push('## Coverage');
  md.push(`- totalNpcActors: ${summary.coverage.totalNpcActors.toFixed(2)}`);
  md.push(`- active: ${summary.coverage.activeNpcActors.toFixed(2)} | retired: ${summary.coverage.retiredNpcActors.toFixed(2)}`);
  md.push(`- observedBashos: ${summary.coverage.observedBashos.toFixed(2)}`);
  md.push('');
  md.push('## Reach rates (sim vs target)');
  md.push('| KPI | sim | target | delta |');
  md.push('|---|---:|---:|---:|');
  for (const k of ['juryo', 'makuuchi', 'sanyaku', 'ozeki', 'yokozuna'] as const) {
    md.push(`| ${k} | ${fmt(summary.reachRates[k])} | ${fmt(t.reachRates[k])} | ${fmt(summary.reachRates[k] - t.reachRates[k])} |`);
  }
  md.push('');
  md.push('## Highest bucket (exclusive)');
  md.push('| bucket | sim | target |');
  md.push('|---|---:|---:|');
  for (const k of HIGHEST_BUCKET_KEYS) {
    const tv = (t.highestBucket as any)[k];
    md.push(`| ${k} | ${fmt(summary.highestBucket[k])} | ${tv === undefined ? 'N/A' : fmt(tv)} |`);
  }
  md.push('');
  md.push('## Career bashos');
  md.push('| KPI | sim | target |');
  md.push('|---|---:|---:|');
  md.push(`| mean | ${summary.careerBashos.mean.toFixed(2)} | ${t.careerBashos.mean} |`);
  md.push(`| p10 | ${summary.careerBashos.p10} | ${t.careerBashos.p10} |`);
  md.push(`| p50 | ${summary.careerBashos.p50} | ${t.careerBashos.p50} |`);
  md.push(`| p90 | ${summary.careerBashos.p90} | ${t.careerBashos.p90} |`);
  md.push(`| <12 ratio | ${fmt(summary.careerBashos.underTwelveRatio)} | ${fmt(t.careerBashos.underTwelveRatio)} |`);
  md.push('');
  md.push('## Division tenure p50');
  md.push('| division | sim | target |');
  md.push('|---|---:|---:|');
  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi'] as DivisionKey[]) {
    md.push(`| ${div} | ${summary.divisionTenureP50[div] ?? 'N/A'} | ${(t.divisionTenureP50 as any)[div.toLowerCase()]} |`);
  }
  md.push('');
  md.push('## Mix breakdown');
  const mixTable = (label: string, mix: Record<string, number>) => {
    md.push(`### ${label}`);
    md.push('| key | share |');
    md.push('|---|---:|');
    for (const k of Object.keys(mix).sort()) md.push(`| ${k} | ${fmt(mix[k])} |`);
    md.push('');
  };
  mixTable('careerBandMix', summary.careerBandMix);
  mixTable('aptitudeTierMix', summary.aptitudeTierMix);
  mixTable('retirementProfileMix', summary.retirementProfileMix);
  mixTable('growthTypeMix', summary.growthTypeMix);
  md.push('## Era Star density');
  md.push('| key | count |');
  md.push('|---|---:|');
  md.push(`| yokozunaLikeCount | ${summary.eraStarDensity.yokozunaLikeCount.toFixed(2)} |`);
  md.push(`| ozekiLikeCount | ${summary.eraStarDensity.ozekiLikeCount.toFixed(2)} |`);
  md.push(`| sanyakuLikeCount | ${summary.eraStarDensity.sanyakuLikeCount.toFixed(2)} |`);
  md.push(`| makuuchiTopCount | ${summary.eraStarDensity.makuuchiTopCount.toFixed(2)} |`);
  return md.join('\n');
};

async function main() {
  console.log(`Full diagnose: profile=${PROFILE}, bashos=${BASHOS}, runs=${RUNS}, seed=${SEED}`);
  const seeds: number[] = [];
  const summaries: SummaryShape[] = [];
  for (let r = 0; r < RUNS; r++) {
    const seed = SEED + r * 10000;
    seeds.push(seed);
    const t0 = Date.now();
    const run = await runOne(PROFILE, BASHOS, seed);
    const summary = summarize(run);
    summaries.push(summary);
    console.log(
      `  run ${r + 1}/${RUNS} seed=${seed}: pop=${summary.coverage.totalNpcActors} juryoReach=${(summary.reachRates.juryo * 100).toFixed(2)}% (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
    );
  }
  const summary = aggregateAcrossRuns(summaries);

  const outDir = path.join(process.cwd(), 'docs', 'npc_rework');
  fs.mkdirSync(outDir, { recursive: true });
  const baseName = `full_npc_world_distribution_${PROFILE}`;
  fs.writeFileSync(
    path.join(outDir, `${baseName}.json`),
    JSON.stringify(
      {
        profile: PROFILE,
        bashos: BASHOS,
        runs: RUNS,
        seeds,
        summary,
        target: NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1,
      },
      null,
      2,
    ),
    'utf-8',
  );
  fs.writeFileSync(
    path.join(outDir, `${baseName}.md`),
    renderMarkdown(PROFILE, BASHOS, seeds, summary),
    'utf-8',
  );
  console.log(`Wrote: docs/npc_rework/${baseName}.{json,md}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
