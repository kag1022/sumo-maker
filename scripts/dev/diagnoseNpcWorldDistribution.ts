#!/usr/bin/env npx tsx
/**
 * scripts/dev/diagnoseNpcWorldDistribution.ts
 *
 * Drives the production simulation engine for ~120 bashos and aggregates
 * NPC career KPIs (highest division, career bashos, division tenure,
 * active/retired) using the per-step `npcBashoRecords` emitted by
 * runOneStep.
 *
 * COVERAGE NOTE: `npcBashoRecords` only contains NPCs in Makuuchi/Juryo
 * (sekitori) plus the player's current lower division. Lower-division NPCs
 * outside the player's division are NOT observed here. KPIs that depend on
 * full lower-division coverage (e.g. Jonokuchi tenure, full career length
 * for never-promoted NPCs) are therefore reported as N/A or partial.
 *
 * Usage: npx tsx scripts/dev/diagnoseNpcWorldDistribution.ts [--bashos N]
 *        [--profile <legacy|realdata_v1|...>] [--seed N]
 *
 * Outputs:
 *   docs/npc_rework/npc_world_distribution_current.json
 *   docs/npc_rework/npc_world_distribution_current.md
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
const argStr = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : def;
};

const BASHOS = argInt('--bashos', 120);
const SEED = argInt('--seed', 7000);
const PROFILE = argStr('--profile', 'legacy') as NpcWorldCalibrationProfile;

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
  | 'jonokuchi';

const DIV_RANK_ORDER: Record<DivisionKey, number> = {
  Jonokuchi: 1,
  Jonidan: 2,
  Sandanme: 3,
  Makushita: 4,
  Juryo: 5,
  Makuuchi: 6,
};

interface NpcAcc {
  id: string;
  firstSeenSeq: number;
  lastSeenSeq: number;
  bashoCount: number;
  divisionTenure: Record<DivisionKey, number>;
  highestBucket: HighestBucket;
  highestDivisionRank: number;
  reachedJuryo: boolean;
  reachedMakuuchi: boolean;
  reachedSanyaku: boolean;
  reachedOzeki: boolean;
  reachedYokozuna: boolean;
}

const newAcc = (id: string, seq: number): NpcAcc => ({
  id,
  firstSeenSeq: seq,
  lastSeenSeq: seq,
  bashoCount: 0,
  divisionTenure: {
    Makuuchi: 0,
    Juryo: 0,
    Makushita: 0,
    Sandanme: 0,
    Jonidan: 0,
    Jonokuchi: 0,
  },
  highestBucket: 'jonokuchi',
  highestDivisionRank: 0,
  reachedJuryo: false,
  reachedMakuuchi: false,
  reachedSanyaku: false,
  reachedOzeki: false,
  reachedYokozuna: false,
});

const classifyBucket = (
  division: DivisionKey,
  rankName: string | undefined,
): { bucket: HighestBucket; rankOrder: number } => {
  if (division === 'Makuuchi') {
    if (rankName === '横綱') return { bucket: 'yokozuna', rankOrder: 100 };
    if (rankName === '大関') return { bucket: 'ozeki', rankOrder: 90 };
    if (rankName === '関脇' || rankName === '小結')
      return { bucket: 'sanyaku', rankOrder: 80 };
    return { bucket: 'maegashira', rankOrder: 70 };
  }
  if (division === 'Juryo') return { bucket: 'juryo', rankOrder: 60 };
  if (division === 'Makushita') return { bucket: 'makushita', rankOrder: 40 };
  if (division === 'Sandanme') return { bucket: 'sandanme', rankOrder: 30 };
  if (division === 'Jonidan') return { bucket: 'jonidan', rankOrder: 20 };
  return { bucket: 'jonokuchi', rankOrder: 10 };
};

const percentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
};

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

async function runOne(profile: NpcWorldCalibrationProfile, bashos: number, seed: number) {
  setActiveNpcWorldCalibrationProfile(profile);
  const initialStatus = createLogicLabInitialStatus(
    'RANDOM_BASELINE',
    createSeededRandom(seed),
  );
  const engine = createSimulationEngine(
    {
      initialStats: initialStatus,
      oyakata: null,
      careerId: `npc-world-diag-${profile}-${seed}`,
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
    const result = await engine.runNextBasho();
    if (result.kind === 'COMPLETED') break;
    lastSeq = result.seq;
    for (const rec of result.npcBashoRecords) {
      const division = rec.division as DivisionKey;
      let acc = npcs.get(rec.entityId);
      if (!acc) {
        acc = newAcc(rec.entityId, result.seq);
        npcs.set(rec.entityId, acc);
      }
      acc.lastSeenSeq = result.seq;
      acc.bashoCount += 1;
      acc.divisionTenure[division] = (acc.divisionTenure[division] ?? 0) + 1;
      const cls = classifyBucket(division, rec.rankName);
      if (cls.rankOrder > acc.highestDivisionRank) {
        acc.highestDivisionRank = cls.rankOrder;
        acc.highestBucket = cls.bucket;
      }
      if ((DIV_RANK_ORDER[division] ?? 0) >= DIV_RANK_ORDER.Juryo) acc.reachedJuryo = true;
      if (division === 'Makuuchi') acc.reachedMakuuchi = true;
      if (
        division === 'Makuuchi' &&
        (rec.rankName === '関脇' ||
          rec.rankName === '小結' ||
          rec.rankName === '大関' ||
          rec.rankName === '横綱')
      )
        acc.reachedSanyaku = true;
      if (division === 'Makuuchi' && rec.rankName === '大関') acc.reachedOzeki = true;
      if (division === 'Makuuchi' && rec.rankName === '横綱') acc.reachedYokozuna = true;
    }
  }

  return { npcs, lastSeq };
}

const summarize = (
  npcs: Map<string, NpcAcc>,
  lastSeq: number,
): {
  population: number;
  active: number;
  retired: number;
  reachRates: {
    juryo: number;
    makuuchi: number;
    sanyaku: number;
    ozeki: number;
    yokozuna: number;
  };
  highestBucket: Record<HighestBucket, number>;
  careerBashos: { mean: number; p10: number; p50: number; p90: number; underTwelveRatio: number };
  divisionTenureP50: Record<DivisionKey, number | null>;
  sekitoriCandidateCount: number;
} => {
  const arr = [...npcs.values()];
  const total = arr.length;
  const active = arr.filter((a) => a.lastSeenSeq === lastSeq).length;
  const retired = total - active;

  const reachJuryo = arr.filter((a) => a.reachedJuryo).length;
  const reachMakuuchi = arr.filter((a) => a.reachedMakuuchi).length;
  const reachSanyaku = arr.filter((a) => a.reachedSanyaku).length;
  const reachOzeki = arr.filter((a) => a.reachedOzeki).length;
  const reachYokozuna = arr.filter((a) => a.reachedYokozuna).length;

  const highestCounts: Record<HighestBucket, number> = {
    yokozuna: 0,
    ozeki: 0,
    sanyaku: 0,
    maegashira: 0,
    juryo: 0,
    makushita: 0,
    sandanme: 0,
    jonidan: 0,
    jonokuchi: 0,
  };
  for (const a of arr) highestCounts[a.highestBucket] += 1;
  const highestBucket: Record<HighestBucket, number> = { ...highestCounts };
  for (const k of Object.keys(highestBucket) as HighestBucket[]) {
    highestBucket[k] = total ? highestBucket[k] / total : 0;
  }

  const lengths = arr.map((a) => a.bashoCount).sort((a, b) => a - b);
  const mean = lengths.reduce((s, v) => s + v, 0) / Math.max(1, lengths.length);
  const underTwelve = lengths.filter((v) => v < 12).length / Math.max(1, lengths.length);

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

  return {
    population: total,
    active,
    retired,
    reachRates: {
      juryo: total ? reachJuryo / total : 0,
      makuuchi: total ? reachMakuuchi / total : 0,
      sanyaku: total ? reachSanyaku / total : 0,
      ozeki: total ? reachOzeki / total : 0,
      yokozuna: total ? reachYokozuna / total : 0,
    },
    highestBucket,
    careerBashos: {
      mean: Math.round(mean * 100) / 100,
      p10: percentile(lengths, 10),
      p50: percentile(lengths, 50),
      p90: percentile(lengths, 90),
      underTwelveRatio: Math.round(underTwelve * 10000) / 10000,
    },
    divisionTenureP50: tenureP50,
    sekitoriCandidateCount: reachJuryo,
  };
};

async function main() {
  console.log(`Diagnosis: profile=${PROFILE}, bashos=${BASHOS}, seed=${SEED}`);
  const { npcs, lastSeq } = await runOne(PROFILE, BASHOS, SEED);
  const summary = summarize(npcs, lastSeq);
  const target = NPC_WORLD_TARGET_DISTRIBUTION_REALDATA_V1;

  const output = {
    profile: PROFILE,
    bashos: BASHOS,
    seed: SEED,
    lastSeq,
    coverage: {
      note:
        'npcBashoRecords covers Makuuchi/Juryo + player current lower division only. Lower-division-only NPCs outside player division are unobserved.',
    },
    summary,
    target,
  };

  const outDir = path.join(process.cwd(), 'docs', 'npc_rework');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'npc_world_distribution_current.json'),
    JSON.stringify(output, null, 2),
    'utf-8',
  );

  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(4) : 'N/A');
  const md: string[] = [];
  md.push('# NPC World Distribution — Current');
  md.push('');
  md.push(`profile: \`${PROFILE}\` | bashos: ${BASHOS} | seed: ${SEED} | population observed: ${summary.population} (active=${summary.active}, retired=${summary.retired})`);
  md.push('');
  md.push('Coverage gap: per-basho NPC records cover sekitori divisions and the player current lower division. Lower-division NPCs outside player division are unobserved; reach-rate KPIs and lower-division tenures should be read with that caveat (see `coverage` field in JSON).');
  md.push('');
  md.push('## Reach rates (sim vs real target)');
  md.push('| KPI | sim | target | delta |');
  md.push('|---|---:|---:|---:|');
  const rr = summary.reachRates;
  const tr = target.reachRates;
  md.push(`| juryo | ${fmt(rr.juryo)} | ${fmt(tr.juryo)} | ${fmt(rr.juryo - tr.juryo)} |`);
  md.push(`| makuuchi | ${fmt(rr.makuuchi)} | ${fmt(tr.makuuchi)} | ${fmt(rr.makuuchi - tr.makuuchi)} |`);
  md.push(`| sanyaku | ${fmt(rr.sanyaku)} | ${fmt(tr.sanyaku)} | ${fmt(rr.sanyaku - tr.sanyaku)} |`);
  md.push(`| ozeki | ${fmt(rr.ozeki)} | ${fmt(tr.ozeki)} | ${fmt(rr.ozeki - tr.ozeki)} |`);
  md.push(`| yokozuna | ${fmt(rr.yokozuna)} | ${fmt(tr.yokozuna)} | ${fmt(rr.yokozuna - tr.yokozuna)} |`);
  md.push('');
  md.push('## Career bashos');
  md.push('| KPI | sim | target |');
  md.push('|---|---:|---:|');
  md.push(`| mean | ${summary.careerBashos.mean} | ${target.careerBashos.mean} |`);
  md.push(`| p10 | ${summary.careerBashos.p10} | ${target.careerBashos.p10} |`);
  md.push(`| p50 | ${summary.careerBashos.p50} | ${target.careerBashos.p50} |`);
  md.push(`| p90 | ${summary.careerBashos.p90} | ${target.careerBashos.p90} |`);
  md.push(`| <12 ratio | ${summary.careerBashos.underTwelveRatio} | ${target.careerBashos.underTwelveRatio} |`);
  md.push('');
  md.push('## Division tenure p50');
  md.push('| Division | sim | target |');
  md.push('|---|---:|---:|');
  const tp = summary.divisionTenureP50;
  const tt = target.divisionTenureP50;
  md.push(`| Jonokuchi | ${tp.Jonokuchi ?? 'N/A'} | ${tt.jonokuchi} |`);
  md.push(`| Jonidan | ${tp.Jonidan ?? 'N/A'} | ${tt.jonidan} |`);
  md.push(`| Sandanme | ${tp.Sandanme ?? 'N/A'} | ${tt.sandanme} |`);
  md.push(`| Makushita | ${tp.Makushita ?? 'N/A'} | ${tt.makushita} |`);
  md.push(`| Juryo | ${tp.Juryo ?? 'N/A'} | ${tt.juryo} |`);
  md.push(`| Makuuchi | ${tp.Makuuchi ?? 'N/A'} | ${tt.makuuchi} |`);
  md.push('');
  md.push('## Highest-bucket distribution');
  md.push('| Bucket | sim | target |');
  md.push('|---|---:|---:|');
  for (const k of Object.keys(target.highestBucket) as (keyof typeof target.highestBucket)[]) {
    md.push(`| ${k} | ${fmt(summary.highestBucket[k as HighestBucket])} | ${fmt(target.highestBucket[k])} |`);
  }
  md.push('');
  md.push(`Sekitori candidates (reached juryo+): ${summary.sekitoriCandidateCount}`);

  fs.writeFileSync(
    path.join(outDir, 'npc_world_distribution_current.md'),
    md.join('\n'),
    'utf-8',
  );

  console.log(`Wrote: docs/npc_rework/npc_world_distribution_current.{json,md}`);
  console.log(`Sekitori reach: ${(summary.reachRates.juryo * 100).toFixed(2)}% (target ${(target.reachRates.juryo * 100).toFixed(2)}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
