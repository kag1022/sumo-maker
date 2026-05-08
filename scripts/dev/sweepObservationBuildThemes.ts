#!/usr/bin/env npx tsx
/**
 * scripts/dev/sweepObservationBuildThemes.ts
 *
 * Pragmatic INPUT-DISTRIBUTION sweep for the observation-build deep-bias
 * system. For each (theme + modifiers) combo we:
 *   1. seed Math.random via a deterministic prng,
 *   2. roll a scout draft + initial RikishiStatus,
 *   3. apply observation-build bias,
 *   4. record the post-bias decision points (aptitudeTier, careerBand,
 *      growthType, retirementProfile, height/weight, stat sum, genome
 *      summary).
 *
 * Limitation: this script does NOT run full careers. The original spec called
 * for full-career KPIs (basho count, juryo reach %, archive category %) but
 * the simulation engine is heavyweight and tightly coupled to UI-side state
 * (Dexie etc). Per the spec's documented fallback, we prove the bias *shifts
 * the draft-generation distribution* — the input the engine consumes — and
 * leave full-career validation to the in-app sweep.
 *
 * Usage:
 *   npx tsx scripts/dev/sweepObservationBuildThemes.ts --runs 30 --seed 8100
 *
 * Outputs:
 *   docs/design/observation_build_theme_sweep.json
 *   docs/design/observation_build_theme_sweep.md
 */

import * as fs from 'fs';
import * as path from 'path';
import { rollScoutDraft, buildInitialRikishiFromDraft } from '../../src/logic/scout/gacha';
import { applyObservationBuildBias } from '../../src/logic/archive/applyObservationBuildBias';
import { buildObservationConfig } from '../../src/logic/archive/observationBuild';
import type {
  ObservationModifierId,
  ObservationThemeId,
} from '../../src/logic/archive/types';

interface ComboSpec {
  label: string;
  themeId: ObservationThemeId;
  modifierIds: ObservationModifierId[];
}

const COMBOS: ComboSpec[] = [
  { label: 'random', themeId: 'random', modifierIds: [] },
  { label: 'realistic', themeId: 'realistic', modifierIds: [] },
  { label: 'featured', themeId: 'featured', modifierIds: [] },
  { label: 'makushita_wall', themeId: 'makushita_wall', modifierIds: [] },
  { label: 'late_bloomer', themeId: 'late_bloomer', modifierIds: [] },
  { label: 'random+large_body', themeId: 'random', modifierIds: ['large_body'] },
  { label: 'random+small_body', themeId: 'random', modifierIds: ['small_body'] },
  { label: 'featured+stable_temperament', themeId: 'featured', modifierIds: ['stable_temperament'] },
  { label: 'late_bloomer+late_growth_bias', themeId: 'late_bloomer', modifierIds: ['late_growth_bias'] },
  { label: 'makushita_wall+volatile_temperament', themeId: 'makushita_wall', modifierIds: ['volatile_temperament'] },
];

const args = process.argv.slice(2);
const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};
const RUNS = argInt('--runs', 30);
const SEED = argInt('--seed', 8100);

// mulberry32 prng (used to seed Math.random globally for deterministic gacha rolls)
const mulberry32 = (seed: number): (() => number) => {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

interface RunSummary {
  label: string;
  runs: number;
  aptitudeTier: Record<string, number>;
  careerBand: Record<string, number>;
  growthType: Record<string, number>;
  retirementProfile: Record<string, number>;
  avgHeightCm: number;
  avgWeightKg: number;
  avgStatSum: number;
  avgGenomePower: number;
  avgGenomeTech: number;
  avgGenomeSpeed: number;
  avgGenomeMaturationAge: number;
  avgInjuryRisk: number;
  avgFormVolatility: number;
}

const incr = (rec: Record<string, number>, key: string | undefined) => {
  if (!key) return;
  rec[key] = (rec[key] ?? 0) + 1;
};

const runCombo = (combo: ComboSpec, baseSeed: number): RunSummary => {
  const summary: RunSummary = {
    label: combo.label,
    runs: RUNS,
    aptitudeTier: {},
    careerBand: {},
    growthType: {},
    retirementProfile: {},
    avgHeightCm: 0,
    avgWeightKg: 0,
    avgStatSum: 0,
    avgGenomePower: 0,
    avgGenomeTech: 0,
    avgGenomeSpeed: 0,
    avgGenomeMaturationAge: 0,
    avgInjuryRisk: 0,
    avgFormVolatility: 0,
  };

  for (let i = 0; i < RUNS; i++) {
    const rng = mulberry32(baseSeed + i * 9973);
    // Patch global Math.random for the duration of one roll.
    const origRandom = Math.random;
    Math.random = rng;
    try {
      const draft = rollScoutDraft(rng);
      const baseStatus = buildInitialRikishiFromDraft(draft);
      const config = buildObservationConfig(combo.themeId, combo.modifierIds);
      const { status } = applyObservationBuildBias(baseStatus, config, rng);

      incr(summary.aptitudeTier, status.aptitudeTier);
      incr(summary.careerBand, status.careerBand);
      incr(summary.growthType, status.growthType);
      incr(summary.retirementProfile, status.retirementProfile);
      summary.avgHeightCm += status.bodyMetrics.heightCm ?? 0;
      summary.avgWeightKg += status.bodyMetrics.weightKg ?? 0;
      summary.avgStatSum += Object.values(status.stats).reduce((a, b) => a + b, 0);
      if (status.genome) {
        summary.avgGenomePower += status.genome.base.powerCeiling;
        summary.avgGenomeTech += status.genome.base.techCeiling;
        summary.avgGenomeSpeed += status.genome.base.speedCeiling;
        summary.avgGenomeMaturationAge += status.genome.growth.maturationAge;
        summary.avgInjuryRisk += status.genome.durability.baseInjuryRisk;
        summary.avgFormVolatility += status.genome.variance.formVolatility;
      }
    } finally {
      Math.random = origRandom;
    }
  }
  summary.avgHeightCm = +(summary.avgHeightCm / RUNS).toFixed(2);
  summary.avgWeightKg = +(summary.avgWeightKg / RUNS).toFixed(2);
  summary.avgStatSum = +(summary.avgStatSum / RUNS).toFixed(2);
  summary.avgGenomePower = +(summary.avgGenomePower / RUNS).toFixed(2);
  summary.avgGenomeTech = +(summary.avgGenomeTech / RUNS).toFixed(2);
  summary.avgGenomeSpeed = +(summary.avgGenomeSpeed / RUNS).toFixed(2);
  summary.avgGenomeMaturationAge = +(summary.avgGenomeMaturationAge / RUNS).toFixed(2);
  summary.avgInjuryRisk = +(summary.avgInjuryRisk / RUNS).toFixed(3);
  summary.avgFormVolatility = +(summary.avgFormVolatility / RUNS).toFixed(2);
  return summary;
};

const pct = (rec: Record<string, number>, total: number): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) {
    out[k] = `${((v / total) * 100).toFixed(1)}%`;
  }
  return out;
};

const main = () => {
  console.log(`[sweep] runs=${RUNS} seed=${SEED} combos=${COMBOS.length}`);
  const results: RunSummary[] = [];
  for (const combo of COMBOS) {
    process.stdout.write(`  - ${combo.label} ... `);
    const t0 = Date.now();
    const r = runCombo(combo, SEED + combo.label.length * 31);
    console.log(`done (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    results.push(r);
  }

  const outDir = path.join(process.cwd(), 'docs', 'design');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'observation_build_theme_sweep.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ runs: RUNS, seed: SEED, results }, null, 2));

  const lines: string[] = [];
  lines.push('# Observation Build — Theme/Modifier Sweep');
  lines.push('');
  lines.push(`Runs: ${RUNS}, seed: ${SEED}.`);
  lines.push('');
  lines.push('**Limitation**: this sweep proves the bias shifts the *draft-generation distribution* (the input the simulation engine consumes). It does not run full careers — the simulation engine is heavyweight and tightly coupled to UI-side state. Full-career KPIs (basho count, juryo reach %, archive category %) are deferred to in-app validation.');
  lines.push('');

  // aptitudeTier table
  lines.push('## Aptitude Tier distribution');
  lines.push('');
  lines.push('| Combo | S | A | B | C | D |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const p = pct(r.aptitudeTier, r.runs);
    lines.push(`| ${r.label} | ${p.S ?? '0%'} | ${p.A ?? '0%'} | ${p.B ?? '0%'} | ${p.C ?? '0%'} | ${p.D ?? '0%'} |`);
  }
  lines.push('');

  lines.push('## Career Band distribution');
  lines.push('');
  lines.push('| Combo | ELITE | STRONG | STANDARD | GRINDER | WASHOUT |');
  lines.push('|---|---|---|---|---|---|');
  for (const r of results) {
    const p = pct(r.careerBand, r.runs);
    lines.push(`| ${r.label} | ${p.ELITE ?? '0%'} | ${p.STRONG ?? '0%'} | ${p.STANDARD ?? '0%'} | ${p.GRINDER ?? '0%'} | ${p.WASHOUT ?? '0%'} |`);
  }
  lines.push('');

  lines.push('## Growth Type distribution');
  lines.push('');
  lines.push('| Combo | EARLY | NORMAL | LATE | GENIUS |');
  lines.push('|---|---|---|---|---|');
  for (const r of results) {
    const p = pct(r.growthType, r.runs);
    lines.push(`| ${r.label} | ${p.EARLY ?? '0%'} | ${p.NORMAL ?? '0%'} | ${p.LATE ?? '0%'} | ${p.GENIUS ?? '0%'} |`);
  }
  lines.push('');

  lines.push('## Retirement Profile distribution');
  lines.push('');
  lines.push('| Combo | EARLY_EXIT | STANDARD | IRONMAN |');
  lines.push('|---|---|---|---|');
  for (const r of results) {
    const p = pct(r.retirementProfile, r.runs);
    lines.push(`| ${r.label} | ${p.EARLY_EXIT ?? '0%'} | ${p.STANDARD ?? '0%'} | ${p.IRONMAN ?? '0%'} |`);
  }
  lines.push('');

  lines.push('## Body / stat / genome averages');
  lines.push('');
  lines.push('| Combo | Height(cm) | Weight(kg) | StatSum | gPower | gTech | gSpeed | gMatAge | InjRisk | FormVol |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    lines.push(`| ${r.label} | ${r.avgHeightCm} | ${r.avgWeightKg} | ${r.avgStatSum} | ${r.avgGenomePower} | ${r.avgGenomeTech} | ${r.avgGenomeSpeed} | ${r.avgGenomeMaturationAge} | ${r.avgInjuryRisk} | ${r.avgFormVolatility} |`);
  }
  lines.push('');

  lines.push('## Guardrail check');
  lines.push('');
  lines.push('Verifying no combo has any *single-bucket monopoly* (i.e. no combo forces a result):');
  lines.push('');
  let guardrailIssues = 0;
  for (const r of results) {
    for (const [field, dist] of Object.entries({
      aptitudeTier: r.aptitudeTier,
      careerBand: r.careerBand,
      growthType: r.growthType,
      retirementProfile: r.retirementProfile,
    })) {
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      for (const [k, v] of Object.entries(dist)) {
        if (v / total >= 0.95) {
          lines.push(`- WARN ${r.label} / ${field}: ${k} = ${(v / total * 100).toFixed(1)}% (≥95%, possibly too dominant)`);
          guardrailIssues++;
        }
      }
    }
  }
  if (guardrailIssues === 0) {
    lines.push('- OK: no bucket exceeds 95% in any combo. Tail outcomes always reachable.');
  }

  const mdPath = path.join(outDir, 'observation_build_theme_sweep.md');
  fs.writeFileSync(mdPath, lines.join('\n'));

  console.log(`\nWrote: ${jsonPath}`);
  console.log(`Wrote: ${mdPath}`);
};

main();
