#!/usr/bin/env npx tsx
/**
 * scripts/dev/sweepNpcWorldCalibration.ts
 *
 * Iterates each NpcWorldCalibrationProfile, drives a lightweight simulation
 * (60 bashos, single seed per profile by default), and reports KPI deltas
 * against NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1.
 *
 * Lightweight defaults (60 bashos, 1 seed each) are chosen to keep total
 * runtime manageable on a single machine; pass `--bashos N` and `--seed S`
 * to override.
 *
 * Outputs:
 *   docs/npc_rework/npc_world_calibration_sweep.json
 *   docs/npc_rework/npc_world_calibration_sweep.md
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  createSimulationEngine,
  createSeededRandom,
} from '../../src/logic/simulation/engine';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import {
  NpcWorldCalibrationProfile,
  setActiveNpcWorldCalibrationProfile,
} from '../../src/logic/simulation/npc/calibration/profile';
import { NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1 } from '../../src/logic/simulation/npc/calibration/npcWorldTargets';

const args = process.argv.slice(2);
const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};
const BASHOS = argInt('--bashos', 60);
const SEED = argInt('--seed', 7777);

const PROFILES: NpcWorldCalibrationProfile[] = [
  'legacy',
  'realdata_v1',
  'realdata_v1_more_washout',
  'realdata_v1_more_sekitori_candidates',
  'realdata_v1_shorter_careers',
  'realdata_v1_balanced',
];

type DivisionKey =
  | 'Makuuchi'
  | 'Juryo'
  | 'Makushita'
  | 'Sandanme'
  | 'Jonidan'
  | 'Jonokuchi';

interface NpcAcc {
  bashoCount: number;
  reachedJuryo: boolean;
  reachedMakuuchi: boolean;
  reachedSanyaku: boolean;
  reachedOzeki: boolean;
  reachedYokozuna: boolean;
  divisionTenure: Record<DivisionKey, number>;
  lastSeenSeq: number;
}

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const percentile = (sorted: number[], p: number): number => {
  if (!sorted.length) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[i];
};

async function runProfile(profile: NpcWorldCalibrationProfile, bashos: number, seed: number) {
  setActiveNpcWorldCalibrationProfile(profile);
  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const engine = createSimulationEngine(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `npc-world-sweep-${profile}-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
    },
    {
      random: createSeededRandom(seed + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  const npcs = new Map<string, NpcAcc>();
  let lastSeq = 0;
  for (let b = 0; b < bashos; b++) {
    const r = await engine.runNextBasho();
    if (r.kind === 'COMPLETED') break;
    lastSeq = r.seq;
    for (const rec of r.npcBashoRecords) {
      const div = rec.division as DivisionKey;
      let acc = npcs.get(rec.entityId);
      if (!acc) {
        acc = {
          bashoCount: 0,
          reachedJuryo: false,
          reachedMakuuchi: false,
          reachedSanyaku: false,
          reachedOzeki: false,
          reachedYokozuna: false,
          divisionTenure: {
            Makuuchi: 0,
            Juryo: 0,
            Makushita: 0,
            Sandanme: 0,
            Jonidan: 0,
            Jonokuchi: 0,
          },
          lastSeenSeq: r.seq,
        };
        npcs.set(rec.entityId, acc);
      }
      acc.bashoCount += 1;
      acc.lastSeenSeq = r.seq;
      acc.divisionTenure[div] += 1;
      if (div === 'Juryo' || div === 'Makuuchi') acc.reachedJuryo = true;
      if (div === 'Makuuchi') acc.reachedMakuuchi = true;
      if (div === 'Makuuchi' && (rec.rankName === '関脇' || rec.rankName === '小結' || rec.rankName === '大関' || rec.rankName === '横綱'))
        acc.reachedSanyaku = true;
      if (div === 'Makuuchi' && rec.rankName === '大関') acc.reachedOzeki = true;
      if (div === 'Makuuchi' && rec.rankName === '横綱') acc.reachedYokozuna = true;
    }
  }

  const arr = [...npcs.values()];
  const total = arr.length;
  const lengths = arr.map((a) => a.bashoCount).sort((a, b) => a - b);
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
  const reach = (pred: (a: NpcAcc) => boolean) =>
    total ? arr.filter(pred).length / total : 0;
  return {
    profile,
    population: total,
    activeRatio: total ? arr.filter((a) => a.lastSeenSeq === lastSeq).length / total : 0,
    reachRates: {
      juryo: reach((a) => a.reachedJuryo),
      makuuchi: reach((a) => a.reachedMakuuchi),
      sanyaku: reach((a) => a.reachedSanyaku),
      ozeki: reach((a) => a.reachedOzeki),
      yokozuna: reach((a) => a.reachedYokozuna),
    },
    careerBashos: {
      mean: lengths.length ? lengths.reduce((s, v) => s + v, 0) / lengths.length : 0,
      p10: percentile(lengths, 10),
      p50: percentile(lengths, 50),
      p90: percentile(lengths, 90),
      underTwelveRatio: lengths.length
        ? lengths.filter((v) => v < 12).length / lengths.length
        : 0,
    },
    divisionTenureP50: tenureP50,
  };
}

async function main() {
  console.log(`Sweep: bashos=${BASHOS}, seed=${SEED}, profiles=${PROFILES.length}`);
  const rows: any[] = [];
  for (const p of PROFILES) {
    process.stdout.write(`  - ${p}... `);
    const t0 = Date.now();
    const row = await runProfile(p, BASHOS, SEED);
    rows.push(row);
    console.log(`pop=${row.population} juryoReach=${(row.reachRates.juryo * 100).toFixed(2)}% (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  const outDir = path.join(process.cwd(), 'docs', 'npc_rework');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'npc_world_calibration_sweep.json'),
    JSON.stringify(
      {
        bashos: BASHOS,
        seed: SEED,
        target: NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1,
        rows,
      },
      null,
      2,
    ),
    'utf-8',
  );

  const t = NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1;
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : 'N/A');
  const md: string[] = [];
  md.push('# NPC World Calibration Sweep');
  md.push('');
  md.push(`bashos: ${BASHOS} | seed: ${SEED} | profiles: ${PROFILES.length}`);
  md.push('');
  md.push('Lightweight harness: single seed per profile, 60 bashos. Coverage limited to sekitori + player lower division (see diagnoseNpcWorldDistribution.ts coverage note).');
  md.push('');
  md.push('## Reach rates by profile');
  md.push('| profile | pop | juryo | makuuchi | sanyaku | ozeki | yokozuna |');
  md.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    md.push(
      `| ${r.profile} | ${r.population} | ${fmt(r.reachRates.juryo)} | ${fmt(r.reachRates.makuuchi)} | ${fmt(r.reachRates.sanyaku)} | ${fmt(r.reachRates.ozeki)} | ${fmt(r.reachRates.yokozuna)} |`,
    );
  }
  md.push(`| **target** | - | ${fmt(t.reachRates.juryo)} | ${fmt(t.reachRates.makuuchi)} | ${fmt(t.reachRates.sanyaku)} | ${fmt(t.reachRates.ozeki)} | ${fmt(t.reachRates.yokozuna)} |`);
  md.push('');
  md.push('## Career bashos');
  md.push('| profile | mean | p10 | p50 | p90 | <12 |');
  md.push('|---|---:|---:|---:|---:|---:|');
  for (const r of rows) {
    md.push(
      `| ${r.profile} | ${r.careerBashos.mean.toFixed(2)} | ${r.careerBashos.p10} | ${r.careerBashos.p50} | ${r.careerBashos.p90} | ${fmt(r.careerBashos.underTwelveRatio)} |`,
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
  md.push('## Closest-profile heuristic');
  const score = (r: any): number => {
    const rrDelta =
      Math.abs(r.reachRates.juryo - t.reachRates.juryo) * 4 +
      Math.abs(r.reachRates.makuuchi - t.reachRates.makuuchi) * 3 +
      Math.abs(r.reachRates.sanyaku - t.reachRates.sanyaku) * 2;
    const cbDelta =
      Math.abs(r.careerBashos.mean - t.careerBashos.mean) / Math.max(1, t.careerBashos.mean) +
      Math.abs(r.careerBashos.underTwelveRatio - t.careerBashos.underTwelveRatio);
    return rrDelta + cbDelta * 0.5;
  };
  const ranked = [...rows].sort((a, b) => score(a) - score(b));
  md.push('| rank | profile | composite distance |');
  md.push('|---:|---|---:|');
  ranked.forEach((r, i) => md.push(`| ${i + 1} | ${r.profile} | ${score(r).toFixed(4)} |`));
  fs.writeFileSync(path.join(outDir, 'npc_world_calibration_sweep.md'), md.join('\n'), 'utf-8');
  console.log('Wrote: docs/npc_rework/npc_world_calibration_sweep.{json,md}');
  console.log(`Closest profile: ${ranked[0].profile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
