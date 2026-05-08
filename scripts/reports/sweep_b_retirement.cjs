// B-retirement sweep harness (Step 1 / B1–B6).
// READ-ONLY for src/. Applies runtime monkey-patches to compiled
// retirement/shared.js inside per-worker process scope only.
//
// Outputs:
//   docs/realdata_integration/sweep_results/B_retirement.json
//   docs/realdata_integration/sweep_results/B_retirement.md
//   docs/realdata_integration/sweep_results/B_retirement_summary.md
//
// Env:
//   SWEEP_B_SAMPLE  (default 2000) per-level sample size
//   SWEEP_B_QUICK=1 sets sample to 100 for timing probe
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKER_PATH = path.resolve(__dirname, '_shared', 'sweep_b_retirement_worker.cjs');
const OUT_DIR = path.join(REPO_ROOT, 'docs', 'realdata_integration', 'sweep_results');
const REAL_AGG_PATH = path.join(REPO_ROOT, '.tmp', 'realdata_career_aggregate.json');

const POPULATION_KIND = 'historical-like-career';
const POPULATION_PRESET = 'historical-like-v2-high';
const QUICK = process.env.SWEEP_B_QUICK === '1';
const SAMPLE_SIZE = QUICK ? 100 : Number(process.env.SWEEP_B_SAMPLE || 2000);

const HIGHEST_BUCKETS = ['横綱', '大関', '三役', '前頭', '十両', '幕下', '三段目', '序二段', '序ノ口'];
const BASHO_BUCKETS = ['<12', '12-23', '24-35', '36-59', '60-89', '90-119', '>=120'];

const careerBashoBucket = (n) => {
  if (n < 12) return '<12';
  if (n < 24) return '12-23';
  if (n < 36) return '24-35';
  if (n < 60) return '36-59';
  if (n < 90) return '60-89';
  if (n < 120) return '90-119';
  return '>=120';
};

const quantile = (vals, q) => {
  if (!vals.length) return null;
  const arr = [...vals].sort((a, b) => a - b);
  const idx = (arr.length - 1) * q;
  const lo = Math.floor(idx); const hi = Math.ceil(idx);
  if (lo === hi) return arr[lo];
  return arr[lo] + (arr[hi] - arr[lo]) * (idx - lo);
};

const runLevel = (label, overrides, sample) => new Promise((resolve, reject) => {
  const maxWorkers = Math.max(1, Math.min((os.cpus()?.length || 4) - 1, 16, sample));
  const features = [];
  let nextIndex = 0; let active = 0; let completed = 0; let failed = false;
  const startedAt = Date.now();
  const launch = () => {
    if (failed) return;
    while (active < maxWorkers && nextIndex < sample) {
      const idx = nextIndex; nextIndex += 1; active += 1;
      const seed = (((idx + 1) * 2654435761) + 97) >>> 0;
      const w = new Worker(WORKER_PATH, {
        workerData: { seed, populationKind: POPULATION_KIND, populationPreset: POPULATION_PRESET, overrides },
      });
      w.on('message', (m) => features.push(m));
      w.on('error', (e) => { if (!failed) { failed = true; reject(e); } });
      w.on('exit', (code) => {
        if (failed) return;
        active -= 1;
        if (code !== 0) { failed = true; reject(new Error(`worker exit ${code}`)); return; }
        completed += 1;
        if (completed === sample && active === 0) {
          const elapsed = (Date.now() - startedAt) / 1000;
          console.log(`[${label}] done in ${elapsed.toFixed(1)}s`);
          resolve({ features, elapsedSec: elapsed });
        } else launch();
      });
    }
  };
  console.log(`[${label}] starting ${sample} careers x ${maxWorkers} workers, overrides=${JSON.stringify(overrides)}`);
  launch();
});

const aggregate = (features) => {
  const total = features.length;
  const cnt = (pred) => features.filter(pred).length;

  const rateJuryo = cnt((f) => f.reachedJuryo) / total;
  const rateMakuuchi = cnt((f) => f.reachedMakuuchi) / total;
  const rateSanyaku = cnt((f) => f.reachedSanyaku) / total;
  const rateOzeki = cnt((f) => f.reachedOzeki) / total;
  const rateYokozuna = cnt((f) => f.reachedYokozuna) / total;
  const rateMakushita = cnt((f) => f.reachedMakushita) / total;

  const highestBucketRates = {};
  for (const b of HIGHEST_BUCKETS) highestBucketRates[b] = 0;
  for (const f of features) if (f.highestRankBucket) highestBucketRates[f.highestRankBucket] += 1;
  for (const b of HIGHEST_BUCKETS) highestBucketRates[b] /= total;

  const bashoBucketRates = {};
  for (const k of BASHO_BUCKETS) bashoBucketRates[k] = 0;
  for (const f of features) bashoBucketRates[careerBashoBucket(f.careerBasho)] += 1;
  for (const k of BASHO_BUCKETS) bashoBucketRates[k] /= total;

  const careerBashoVals = features.map((f) => f.careerBasho);
  const careerLength = {
    p10: quantile(careerBashoVals, 0.1),
    p50: quantile(careerBashoVals, 0.5),
    p90: quantile(careerBashoVals, 0.9),
    mean: careerBashoVals.reduce((s, v) => s + v, 0) / total,
  };

  const winRateVals = features.map((f) => f.careerWinRate).filter(Number.isFinite);
  const careerWinRateMean = winRateVals.length
    ? winRateVals.reduce((s, v) => s + v, 0) / winRateVals.length : null;

  // retiredAfterKachikoshi
  const retiredAfterKachikoshiRate = cnt((f) => f.retiredAfterKachikoshi) / total;

  // lowWinLongCareerRate: totalBasho >= 12 && careerWinRate < 0.45
  const lowWinLongCareerRate = cnt((f) =>
    f.careerBasho >= 12 && Number.isFinite(f.careerWinRate) && f.careerWinRate < 0.45) / total;

  // retirementReasonDistribution
  const reasonCounts = {};
  for (const f of features) {
    const k = f.retirementReasonCode || 'OTHER';
    reasonCounts[k] = (reasonCounts[k] || 0) + 1;
  }
  const retirementReasonDistribution = {};
  for (const k of Object.keys(reasonCounts)) retirementReasonDistribution[k] = reasonCounts[k] / total;

  // lower7 wins distribution
  const lower7 = {}; let lower7Total = 0;
  for (let w = 0; w <= 7; w += 1) lower7[w] = 0;
  for (const f of features) {
    for (const [k, v] of Object.entries(f.lower7Wins || {})) {
      const w = Number(k);
      if (w >= 0 && w <= 7) { lower7[w] += v; lower7Total += v; }
    }
  }
  const lower7Rates = {};
  for (const k of Object.keys(lower7)) lower7Rates[k] = lower7Total > 0 ? lower7[k] / lower7Total : 0;

  return {
    sample: total,
    rates: {
      makushita: rateMakushita,
      juryo: rateJuryo,
      makuuchi: rateMakuuchi,
      sanyaku: rateSanyaku,
      ozeki: rateOzeki,
      yokozuna: rateYokozuna,
    },
    highestBucket: highestBucketRates,
    bashoBucket: bashoBucketRates,
    careerLength,
    careerWinRateMean,
    retiredAfterKachikoshiRate,
    lowWinLongCareerRate,
    retirementReasonDistribution,
    lower7Rates,
  };
};

// Real KPI extraction from cached aggregate
const loadRealKpis = () => {
  const raw = JSON.parse(fs.readFileSync(REAL_AGG_PATH, 'utf8'));
  const c = raw.cohorts.complete;
  // map highestRank distribution & basho bucket
  const highestBucket = {};
  for (const b of HIGHEST_BUCKETS) {
    highestBucket[b] = c.highestRankDistribution?.[b] ?? 0;
  }
  const bashoBucket = {};
  for (const k of BASHO_BUCKETS) bashoBucket[k] = c.careerBashoBuckets?.[k] ?? 0;
  return {
    sample: c.sample,
    rates: {
      makushita: c.rankRates?.makushitaRate,
      juryo: c.rankRates?.juryoRate,
      makuuchi: c.rankRates?.makuuchiRate,
      sanyaku: c.rankRates?.sanyakuRate,
      ozeki: c.rankRates?.ozekiRate,
      yokozuna: c.rankRates?.yokozunaRate,
    },
    highestBucket,
    bashoBucket,
    careerLength: c.careerLength,
    careerWinRateMean: c.careerWinRate?.mean,
    // real has no retiredAfterKachikoshi etc; left null
    retiredAfterKachikoshiRate: null,
    lowWinLongCareerRate: null,
    retirementReasonDistribution: null,
    lower7Rates: c.lower7WinsRates || null,
  };
};

// Critical KPIs we care about for improved/worsened classification
const CRITICAL_KPIS_PRIMARY = [
  { key: 'careerLength.p10', getter: (k) => k.careerLength?.p10, kind: 'count' },
  { key: 'careerLength.p50', getter: (k) => k.careerLength?.p50, kind: 'count' },
  { key: 'careerLength.p90', getter: (k) => k.careerLength?.p90, kind: 'count' },
  { key: 'bashoBucket.<12', getter: (k) => k.bashoBucket?.['<12'], kind: 'rate' },
  { key: 'bashoBucket.12-23', getter: (k) => k.bashoBucket?.['12-23'], kind: 'rate' },
  { key: 'rates.juryo', getter: (k) => k.rates?.juryo, kind: 'rate' },
  { key: 'rates.makuuchi', getter: (k) => k.rates?.makuuchi, kind: 'rate' },
  { key: 'highestBucket.幕下', getter: (k) => k.highestBucket?.['幕下'], kind: 'rate' },
];

const severity = (real, sim, kind) => {
  if (real == null || sim == null || !Number.isFinite(real) || !Number.isFinite(sim)) return 'data-gap';
  const diff = sim - real;
  if (kind === 'rate') {
    const absDiff = Math.abs(diff);
    const denom = Math.max(Math.abs(real), 0.01);
    const ratio = absDiff / denom;
    if (absDiff <= 0.01) return 'OK';
    if (ratio <= 0.10) return 'OK';
    if (ratio <= 0.25) return 'MINOR';
    if (ratio <= 0.50) return 'MAJOR';
    return 'CRITICAL';
  }
  const denom = Math.max(Math.abs(real), 1);
  const ratio = Math.abs(diff) / denom;
  if (ratio <= 0.10) return 'OK';
  if (ratio <= 0.25) return 'MINOR';
  if (ratio <= 0.50) return 'MAJOR';
  return 'CRITICAL';
};

const sevRank = { 'data-gap': 0, OK: 1, MINOR: 2, MAJOR: 3, CRITICAL: 4 };

// Evaluate failure conditions per level vs baseline + real
const evaluateFailures = (level, baseline, real) => {
  const fails = [];
  // 1) juryo worsens >= -0.5pp vs sim baseline
  if ((level.rates.juryo - baseline.rates.juryo) <= -0.005) {
    fails.push(`A.rate.juryo dropped ${((level.rates.juryo - baseline.rates.juryo) * 100).toFixed(2)}pp vs baseline (>= -0.5pp)`);
  }
  // 2) makuuchi worsens >= -0.3pp
  if ((level.rates.makuuchi - baseline.rates.makuuchi) <= -0.003) {
    fails.push(`A.rate.makuuchi dropped ${((level.rates.makuuchi - baseline.rates.makuuchi) * 100).toFixed(2)}pp vs baseline (>= -0.3pp)`);
  }
  // 3) <12 bucket > 45%
  if (level.bashoBucket['<12'] > 0.45) {
    fails.push(`bashoBucket.<12 = ${(level.bashoBucket['<12'] * 100).toFixed(2)}% > 45%`);
  }
  // 4) retiredAfterKachikoshi >= +50% vs baseline
  if (baseline.retiredAfterKachikoshiRate > 0
    && (level.retiredAfterKachikoshiRate / baseline.retiredAfterKachikoshiRate) >= 1.5) {
    fails.push(`retiredAfterKachikoshiRate ${(level.retiredAfterKachikoshiRate * 100).toFixed(2)}% >= 1.5× baseline (${(baseline.retiredAfterKachikoshiRate * 100).toFixed(2)}%)`);
  }
  // 5) any retirementReasonDistribution single category > 60%
  for (const [k, v] of Object.entries(level.retirementReasonDistribution || {})) {
    if (v > 0.60) fails.push(`retirementReason '${k}' = ${(v * 100).toFixed(2)}% > 60%`);
  }
  // 6) lowWinLongCareerRate increased vs baseline
  if (level.lowWinLongCareerRate > baseline.lowWinLongCareerRate + 0.001) {
    fails.push(`lowWinLongCareerRate ${(level.lowWinLongCareerRate * 100).toFixed(2)}% > baseline ${(baseline.lowWinLongCareerRate * 100).toFixed(2)}%`);
  }
  // 7) careerLength.p90 < real * 0.75
  if (real.careerLength?.p90 && level.careerLength.p90 < real.careerLength.p90 * 0.75) {
    fails.push(`careerLength.p90=${level.careerLength.p90} < real.p90 (${real.careerLength.p90}) * 0.75`);
  }
  // 8) 序ノ口 / 序二段 highestBucket increases > +5pp vs baseline
  for (const b of ['序ノ口', '序二段']) {
    if ((level.highestBucket[b] - baseline.highestBucket[b]) > 0.05) {
      fails.push(`highestBucket.${b} +${((level.highestBucket[b] - baseline.highestBucket[b]) * 100).toFixed(2)}pp > +5pp`);
    }
  }
  return fails;
};

// Score a level: count CRITICALs improved vs worsened relative to baseline
const scoreLevel = (level, baseline, real) => {
  let improvedCriticalCount = 0;
  let worsenedCriticalCount = 0;
  let primaryKpiImprovement = 0;
  for (const def of CRITICAL_KPIS_PRIMARY) {
    const realV = def.getter(real);
    const baseV = def.getter(baseline);
    const lvlV = def.getter(level);
    if (realV == null || baseV == null || lvlV == null) continue;
    const sevBase = severity(realV, baseV, def.kind);
    const sevLvl = severity(realV, lvlV, def.kind);
    // Improvement = severity rank decreases from baseline OR distance to real shrinks
    const baseDist = Math.abs(baseV - realV);
    const lvlDist = Math.abs(lvlV - realV);
    // critical-class movement
    if (sevBase === 'CRITICAL' && sevRank[sevLvl] < sevRank.CRITICAL) improvedCriticalCount += 1;
    if (sevRank[sevLvl] > sevRank[sevBase] && sevRank[sevLvl] >= sevRank.MAJOR) worsenedCriticalCount += 1;
    // primary improvement metric: relative distance reduction
    if (baseDist > 0) primaryKpiImprovement += (baseDist - lvlDist) / Math.max(baseDist, 1e-9);
  }
  return { improvedCriticalCount, worsenedCriticalCount, primaryKpiImprovement };
};

const classify = (best, fails) => {
  if (!best) return 'rejected';
  const guardViol = fails.length;
  if (best.score.improvedCriticalCount >= 2 && best.score.worsenedCriticalCount === 0 && guardViol === 0) {
    return 'recommended';
  }
  if (best.score.improvedCriticalCount > 0 && guardViol === 0) {
    return 'needs-more-sample';
  }
  if (best.score.improvedCriticalCount > 0 && (guardViol > 0 || best.score.worsenedCriticalCount >= 1)) {
    return 'risky';
  }
  return 'rejected';
};

const fmtPct = (v) => (v == null || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(2)}%`);
const fmtNum = (v, d = 2) => (v == null || !Number.isFinite(v) ? 'n/a' : Number(v).toFixed(d));

// Define candidates
const buildCandidates = () => ([
  {
    id: 'B1', paramName: 'earlyExitRollDelta',
    levels: [{ params: { earlyExitRollDelta: 0.05 }, label: 'B1+0.05' },
             { params: { earlyExitRollDelta: 0.10 }, label: 'B1+0.10' }],
  },
  {
    id: 'B2', paramName: 'washoutMultiplier',
    levels: [{ params: { washoutMultiplier: 1.10 }, label: 'B2x1.10' },
             { params: { washoutMultiplier: 1.20 }, label: 'B2x1.20' }],
  },
  {
    id: 'B3', paramName: 'makekoshiStreakThreshold',
    levels: [{ params: { makekoshiStreakThreshold: 4 }, label: 'B3=4' },
             { params: { makekoshiStreakThreshold: 3 }, label: 'B3=3' }],
  },
  {
    id: 'B4', paramName: 'spiritStagnationThresholdBasho',
    levels: [{ params: { spiritStagnationThresholdBasho: 18 }, label: 'B4=18' },
             { params: { spiritStagnationThresholdBasho: 12 }, label: 'B4=12' }],
  },
  {
    id: 'B5', paramName: 'lowerLowWinRetireBoost',
    levels: [{ params: { lowerLowWinRetireBoost: 0.05 }, label: 'B5+0.05' },
             { params: { lowerLowWinRetireBoost: 0.10 }, label: 'B5+0.10' }],
  },
  {
    id: 'B6', paramName: 'sekitoriExperiencedRetireMultiplier',
    levels: [{ params: { sekitoriExperiencedRetireMultiplier: 0.85 }, label: 'B6x0.85' },
             { params: { sekitoriExperiencedRetireMultiplier: 0.75 }, label: 'B6x0.75' }],
  },
]);

const renderSeverityTable = (level, baseline, real) => {
  const rows = [];
  for (const def of CRITICAL_KPIS_PRIMARY) {
    const r = def.getter(real); const b = def.getter(baseline); const l = def.getter(level);
    rows.push(`| \`${def.key}\` | ${fmtNum(r, 4)} | ${fmtNum(b, 4)} | ${fmtNum(l, 4)} | ${severity(r, l, def.kind)} |`);
  }
  return rows;
};

const renderMd = (payload) => {
  const lines = [];
  lines.push('# B-retirement sweep results (Step 1)');
  lines.push('');
  lines.push(`generated: ${payload.meta.generatedAt}`);
  lines.push(`sample/level: ${payload.meta.sampleSizePerLevel}  | wallclock: ${payload.meta.executionTimeSec.toFixed(1)}s`);
  lines.push(`override strategy: ${payload.meta.overrideStrategy}`);
  lines.push(`real cohort: ${payload.meta.realCohortSize} | populationKind=${POPULATION_KIND} preset=${POPULATION_PRESET}`);
  lines.push('');
  lines.push('## Classifications');
  lines.push('');
  lines.push('| id | classification | bestLevel | improved | worsened | primaryImprov | guardViol |');
  lines.push('|---|---|---|---:|---:|---:|---:|');
  for (const c of payload.candidates) {
    const sc = c.score || {};
    lines.push(`| ${c.id} | ${c.classification} | ${c.bestLevel || '-'} | ${sc.improvedCriticalCount ?? '-'} | ${sc.worsenedCriticalCount ?? '-'} | ${fmtNum(sc.primaryKpiImprovement, 3)} | ${sc.guardrailViolationCount ?? '-'} |`);
  }
  lines.push('');
  lines.push('## Baseline (no overrides)');
  lines.push('');
  lines.push('| KPI | real | sim baseline |');
  lines.push('|---|---:|---:|');
  for (const def of CRITICAL_KPIS_PRIMARY) {
    lines.push(`| \`${def.key}\` | ${fmtNum(def.getter(payload.realData.kpis), 4)} | ${fmtNum(def.getter(payload.baseline.kpis), 4)} |`);
  }
  lines.push('');
  for (const c of payload.candidates) {
    lines.push(`## ${c.id} — ${c.paramName}`);
    lines.push('');
    lines.push(`classification: **${c.classification}**, bestLevel: \`${c.bestLevel || '-'}\``);
    lines.push('');
    for (const lv of c.levels) {
      lines.push(`### ${lv.label} — params=\`${JSON.stringify(lv.params)}\``);
      lines.push('');
      lines.push('| KPI | real | baseline | level | sev(level vs real) |');
      lines.push('|---|---:|---:|---:|---|');
      lines.push(...renderSeverityTable(lv.kpis, payload.baseline.kpis, payload.realData.kpis));
      lines.push('');
      lines.push(`- careerLength p10/p50/p90: ${lv.kpis.careerLength.p10}/${lv.kpis.careerLength.p50}/${lv.kpis.careerLength.p90} (real ${payload.realData.kpis.careerLength.p10}/${payload.realData.kpis.careerLength.p50}/${payload.realData.kpis.careerLength.p90})`);
      lines.push(`- bashoBucket.<12: ${fmtPct(lv.kpis.bashoBucket['<12'])}, 12-23: ${fmtPct(lv.kpis.bashoBucket['12-23'])}, >=120: ${fmtPct(lv.kpis.bashoBucket['>=120'])}`);
      lines.push(`- rates juryo/makuuchi: ${fmtPct(lv.kpis.rates.juryo)} / ${fmtPct(lv.kpis.rates.makuuchi)}`);
      lines.push(`- highestBucket 幕下: ${fmtPct(lv.kpis.highestBucket['幕下'])}, 序二段: ${fmtPct(lv.kpis.highestBucket['序二段'])}, 序ノ口: ${fmtPct(lv.kpis.highestBucket['序ノ口'])}`);
      lines.push(`- retiredAfterKachikoshi: ${fmtPct(lv.kpis.retiredAfterKachikoshiRate)} (baseline ${fmtPct(payload.baseline.kpis.retiredAfterKachikoshiRate)})`);
      lines.push(`- lowWinLongCareerRate: ${fmtPct(lv.kpis.lowWinLongCareerRate)} (baseline ${fmtPct(payload.baseline.kpis.lowWinLongCareerRate)})`);
      lines.push(`- retirementReason top: ${Object.entries(lv.kpis.retirementReasonDistribution || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${fmtPct(v)}`).join(', ')}`);
      lines.push(`- score: improved=${lv.score.improvedCriticalCount}, worsened=${lv.score.worsenedCriticalCount}, primaryImprov=${fmtNum(lv.score.primaryKpiImprovement, 3)}`);
      if (lv.failureConditions.length) {
        lines.push(`- **failure conditions:**`);
        for (const f of lv.failureConditions) lines.push(`  - ${f}`);
      } else {
        lines.push(`- failure conditions: none`);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
};

const renderSummaryMd = (payload) => {
  const lines = [];
  lines.push('# B-retirement sweep — summary');
  lines.push('');
  lines.push(`sample/level: ${payload.meta.sampleSizePerLevel} | total wall-clock: ${payload.meta.executionTimeSec.toFixed(1)}s`);
  lines.push('');
  lines.push('## Classification table');
  lines.push('');
  lines.push('| id | classification | bestLevel |');
  lines.push('|---|---|---|');
  for (const c of payload.candidates) {
    lines.push(`| ${c.id} | ${c.classification} | ${c.bestLevel || '-'} |`);
  }
  lines.push('');
  // Top 3 recommended levels
  const allLevels = [];
  for (const c of payload.candidates) {
    for (const lv of c.levels) {
      allLevels.push({ id: c.id, label: lv.label, lv, classification: c.classification });
    }
  }
  const ranked = allLevels
    .filter((x) => x.lv.failureConditions.length === 0)
    .sort((a, b) => b.lv.score.primaryKpiImprovement - a.lv.score.primaryKpiImprovement)
    .slice(0, 3);
  lines.push('## Top 3 levels (no failure conditions, ranked by primaryKpiImprovement)');
  lines.push('');
  if (ranked.length === 0) {
    lines.push('_(none — all levels triggered at least one failure condition or had no improvement)_');
  } else {
    for (const r of ranked) {
      const k = r.lv.kpis;
      const real = payload.realData.kpis;
      const base = payload.baseline.kpis;
      lines.push(`- **${r.label}** (${r.id}): <12 ${fmtPct(base.bashoBucket['<12'])}→${fmtPct(k.bashoBucket['<12'])} (real ${fmtPct(real.bashoBucket['<12'])}); juryo ${fmtPct(base.rates.juryo)}→${fmtPct(k.rates.juryo)} (real ${fmtPct(real.rates.juryo)}); careerLen p50 ${base.careerLength.p50}→${k.careerLength.p50} (real ${real.careerLength.p50}); improved=${r.lv.score.improvedCriticalCount}/8`);
    }
  }
  lines.push('');
  lines.push('## Failure violations seen (across all levels)');
  lines.push('');
  const failBuckets = {};
  for (const c of payload.candidates) for (const lv of c.levels) {
    for (const f of lv.failureConditions) {
      const k = f.split(' ').slice(0, 3).join(' ');
      failBuckets[k] = (failBuckets[k] || 0) + 1;
    }
  }
  for (const [k, n] of Object.entries(failBuckets).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${k} — ${n} occurrence(s)`);
  }
  if (Object.keys(failBuckets).length === 0) lines.push('- none');
  lines.push('');
  lines.push('Full report: `B_retirement.md`. Machine-readable: `B_retirement.json`.');
  return lines.join('\n');
};

const main = async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const realData = loadRealKpis();
  const startedAt = Date.now();

  // baseline
  const baselineRes = await runLevel('baseline', {}, SAMPLE_SIZE);
  const baselineKpis = aggregate(baselineRes.features);

  const candidates = buildCandidates();
  for (const c of candidates) {
    for (const lv of c.levels) {
      const r = await runLevel(`${c.id} ${lv.label}`, lv.params, SAMPLE_SIZE);
      const kp = aggregate(r.features);
      const sc = scoreLevel(kp, baselineKpis, realData);
      const fails = evaluateFailures(kp, baselineKpis, realData);
      lv.kpis = kp;
      lv.score = { ...sc, guardrailViolationCount: fails.length };
      lv.failureConditions = fails;
      lv.elapsedSec = r.elapsedSec;
    }
    // Pick best level: most primaryKpiImprovement among levels with no failures, else any.
    const candidatesNoFail = c.levels.filter((lv) => lv.failureConditions.length === 0);
    const pool = candidatesNoFail.length ? candidatesNoFail : c.levels;
    pool.sort((a, b) => b.score.primaryKpiImprovement - a.score.primaryKpiImprovement);
    const best = pool[0];
    c.bestLevel = best?.label;
    c.score = best?.score;
    c.classification = classify(best, best?.failureConditions || []);
    if (best) c.notes = `bestLevel ${best.label} — chosen by primaryKpiImprovement; no-fail levels: ${candidatesNoFail.length}/${c.levels.length}`;
    else c.notes = 'no levels available';
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  const meta = {
    generatedAt: new Date().toISOString(),
    sampleSizePerLevel: SAMPLE_SIZE,
    baselinePreset: `${POPULATION_KIND}/${POPULATION_PRESET}`,
    overrideStrategy: 'Strategy 2 — runtime monkey-patch of compiled .tmp/sim-tests/.../retirement/shared.js exports (resolveRetirementProfileBiased, resolveRetirementChance) inside each worker; src/ untouched',
    realCohortSize: realData.sample,
    executionTimeSec: elapsed,
  };
  const payload = {
    meta,
    baseline: { kpis: baselineKpis },
    realData: { kpis: realData },
    candidates,
  };

  fs.writeFileSync(path.join(OUT_DIR, 'B_retirement.json'), JSON.stringify(payload, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'B_retirement.md'), renderMd(payload));
  fs.writeFileSync(path.join(OUT_DIR, 'B_retirement_summary.md'), renderSummaryMd(payload));
  console.log(`[sweep-b] wrote outputs to ${OUT_DIR} (total ${elapsed.toFixed(1)}s)`);
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
