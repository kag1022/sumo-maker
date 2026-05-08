// realdata-career-diagnosis-bundle main entrypoint.
// Diagnostic-only. READ-ONLY for production logic.
//
// Compares simulation career output against real-data (1960-07..2026-03)
// across an exhaustive KPI set and writes:
//   - docs/realdata_integration/career_reality_gap.json (full machine-readable)
//   - docs/realdata_integration/career_reality_gap_report.md (full report)
//   - docs/realdata_integration/career_reality_gap_summary.md (1-2 page summary)
//
// 出典:
//   - Real:
//     - sumo-api-db/data/analysis/basho_records_sumo_api_196007_202603.json
//     - sumo-api-db/data/analysis/sekitori_boundary_realdata.json
//     - sumo-api-db/data/analysis/game_calibration_long_range.json
//     - sumo-db/data/analysis/career_calibration_1965plus.json
//   - Sim: runCareerObservation via _shared/realdata_diagnosis_worker.cjs
//
// 環境変数:
//   - REALDATA_DIAGNOSIS_RUNS: simulated career count (default 2000)
//   - REALDATA_POPULATION_KIND (default 'historical-like-career')
//   - REALDATA_POPULATION_PRESET (default 'historical-like-v2-high')
//   - REALDATA_REBUILD_AGGREGATE: '1' to rebuild .tmp aggregate cache
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const {
  loadAggregate,
  HIGHEST_BUCKETS,
  careerBashoBucket,
  winRateBucket,
  quantile,
} = require('./realdata_career_aggregator.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const WORKER_PATH = path.resolve(__dirname, '_shared', 'realdata_diagnosis_worker.cjs');

const RUNS = Number(process.env.REALDATA_DIAGNOSIS_RUNS || 2000);
const POPULATION_KIND = process.env.REALDATA_POPULATION_KIND || 'historical-like-career';
const POPULATION_PRESET = process.env.REALDATA_POPULATION_PRESET || 'historical-like-v2-high';
const REBUILD_AGG = process.env.REALDATA_REBUILD_AGGREGATE === '1';

const DOCS_DIR = path.join(REPO_ROOT, 'docs', 'realdata_integration');
const OUT_JSON = path.join(DOCS_DIR, 'career_reality_gap.json');
const OUT_MD = path.join(DOCS_DIR, 'career_reality_gap_report.md');
const OUT_SUMMARY_MD = path.join(DOCS_DIR, 'career_reality_gap_summary.md');
const SIM_AGG_CACHE = path.join(REPO_ROOT, '.tmp', 'realdata_diagnosis_sim_aggregate.json');

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
};

const pct = (n, d) => (d > 0 ? n / d : 0);

const runParallel = (runs) => new Promise((resolve, reject) => {
  const maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, 16, runs));
  const features = [];
  let nextIndex = 0;
  let active = 0;
  let completed = 0;
  let failed = false;

  const launchNext = () => {
    if (failed) return;
    while (active < maxWorkers && nextIndex < runs) {
      const idx = nextIndex;
      nextIndex += 1;
      active += 1;
      const seed = (((idx + 1) * 2654435761) + 97) >>> 0;
      const worker = new Worker(WORKER_PATH, {
        workerData: { seed, populationKind: POPULATION_KIND, populationPreset: POPULATION_PRESET },
      });
      worker.on('message', (msg) => features.push(msg));
      worker.on('error', (err) => {
        if (failed) return;
        failed = true;
        reject(err);
      });
      worker.on('exit', (code) => {
        if (failed) return;
        active -= 1;
        if (code !== 0) {
          failed = true;
          reject(new Error(`Worker exit ${code}`));
          return;
        }
        completed += 1;
        if (completed % 100 === 0 || completed === runs) {
          console.log(`realdata-diagnosis: sim ${completed}/${runs}`);
        }
        if (completed === runs && active === 0) resolve(features);
        else launchNext();
      });
    }
  };

  console.log(`Starting realdata-diagnosis sim pool: ${maxWorkers} workers, ${runs} runs (${POPULATION_KIND}/${POPULATION_PRESET})`);
  launchNext();
});

// ---------------- sim aggregation ------------------

const aggregateSim = (features) => {
  const total = features.length;
  const reached = (pred) => features.filter(pred).length;

  const reachedMakushita = reached((f) => f.reachedMakushita);
  const reachedJuryo = reached((f) => f.reachedJuryo);
  const reachedMakuuchi = reached((f) => f.reachedMakuuchi);
  const reachedSanyaku = reached((f) => f.reachedSanyaku);
  const reachedOzeki = reached((f) => f.reachedOzeki);
  const reachedYokozuna = reached((f) => f.reachedYokozuna);

  const highestRankDistribution = {};
  for (const b of HIGHEST_BUCKETS) highestRankDistribution[b] = 0;
  for (const f of features) if (f.highestRankBucket) highestRankDistribution[f.highestRankBucket] += 1;
  const highestRankRates = {};
  for (const b of HIGHEST_BUCKETS) highestRankRates[b] = total > 0 ? highestRankDistribution[b] / total : 0;

  const bashoBuckets = {};
  for (const k of ['<12', '12-23', '24-35', '36-59', '60-89', '90-119', '>=120']) bashoBuckets[k] = 0;
  for (const f of features) bashoBuckets[careerBashoBucket(f.careerBasho)] += 1;
  const bashoBucketRates = {};
  for (const k of Object.keys(bashoBuckets)) bashoBucketRates[k] = total > 0 ? bashoBuckets[k] / total : 0;

  const winRateBuckets = {};
  for (const k of ['<0.35', '0.35-0.39', '0.40-0.44', '0.45-0.49', '0.50-0.54', '0.55-0.59', '0.60-0.64', '>=0.65']) {
    winRateBuckets[k] = 0;
  }
  let winRateValid = 0;
  for (const f of features) {
    if (Number.isFinite(f.careerWinRate)) {
      winRateBuckets[winRateBucket(f.careerWinRate)] += 1;
      winRateValid += 1;
    }
  }
  const winRateBucketRates = {};
  for (const k of Object.keys(winRateBuckets)) {
    winRateBucketRates[k] = winRateValid > 0 ? winRateBuckets[k] / winRateValid : 0;
  }

  const fr = (key) => {
    const vals = features.map((f) => f.firstReach[key]).filter(Number.isFinite);
    return { p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9), n: vals.length };
  };

  const careerBashoVals = features.map((f) => f.careerBasho);
  const careerWinRateVals = features.map((f) => f.careerWinRate).filter(Number.isFinite);

  const divisionTenure = {};
  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi']) {
    const vals = features.map((f) => f.divisionCounts[div] || 0).filter((v) => v > 0);
    divisionTenure[div] = {
      n: vals.length,
      p50: quantile(vals, 0.5),
      p90: quantile(vals, 0.9),
      mean: vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
    };
  }

  const perDivisionWinRate = {};
  const perDivisionKachikoshiRate = {};
  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi']) {
    let w = 0, l = 0, kk = 0, basho = 0;
    for (const f of features) {
      w += f.divisionWins[div] || 0;
      l += f.divisionLosses[div] || 0;
      kk += f.divisionKachikoshi[div] || 0;
      basho += f.divisionBoutBashos[div] || 0;
    }
    perDivisionWinRate[div] = w + l > 0 ? w / (w + l) : null;
    perDivisionKachikoshiRate[div] = basho > 0 ? kk / basho : null;
  }

  const lower7Wins = {}; let lower7Total = 0;
  const sek15Wins = {}; let sek15Total = 0;
  for (let i = 0; i <= 7; i += 1) lower7Wins[i] = 0;
  for (let i = 0; i <= 15; i += 1) sek15Wins[i] = 0;
  for (const f of features) {
    for (const [k, v] of Object.entries(f.lower7Wins)) {
      const w = Number(k);
      if (w >= 0 && w <= 7) { lower7Wins[w] += v; lower7Total += v; }
    }
    for (const [k, v] of Object.entries(f.sek15Wins)) {
      const w = Number(k);
      if (w >= 0 && w <= 15) { sek15Wins[w] += v; sek15Total += v; }
    }
  }
  const lower7WinsRates = {};
  for (const k of Object.keys(lower7Wins)) lower7WinsRates[k] = lower7Total > 0 ? lower7Wins[k] / lower7Total : 0;
  const sek15WinsRates = {};
  for (const k of Object.keys(sek15Wins)) sek15WinsRates[k] = sek15Total > 0 ? sek15Wins[k] / sek15Total : 0;

  const pipelineRates = {
    makushitaToJuryoRate: reachedMakushita > 0 ? reachedJuryo / reachedMakushita : null,
    juryoToMakuuchiRate: reachedJuryo > 0 ? reachedMakuuchi / reachedJuryo : null,
    makuuchiToSanyakuRate: reachedMakuuchi > 0 ? reachedSanyaku / reachedMakuuchi : null,
    sanyakuToOzekiRate: reachedSanyaku > 0 ? reachedOzeki / reachedSanyaku : null,
    ozekiToYokozunaRate: reachedOzeki > 0 ? reachedYokozuna / reachedOzeki : null,
  };

  const careerLength = {
    mean: careerBashoVals.length > 0 ? careerBashoVals.reduce((s, v) => s + v, 0) / careerBashoVals.length : null,
    p10: quantile(careerBashoVals, 0.1),
    p50: quantile(careerBashoVals, 0.5),
    p90: quantile(careerBashoVals, 0.9),
  };

  const careerWinRateStats = {
    mean: careerWinRateVals.length > 0 ? careerWinRateVals.reduce((s, v) => s + v, 0) / careerWinRateVals.length : null,
    p10: quantile(careerWinRateVals, 0.1),
    p50: quantile(careerWinRateVals, 0.5),
    p90: quantile(careerWinRateVals, 0.9),
    buckets: winRateBucketRates,
  };

  // sim-only archetype distributions
  const distOf = (key) => {
    const counts = {};
    for (const f of features) {
      const k = f[key] ?? 'unknown';
      counts[k] = (counts[k] || 0) + 1;
    }
    const out = {};
    for (const k of Object.keys(counts).sort()) {
      out[k] = total > 0 ? counts[k] / total : 0;
    }
    return out;
  };

  const archetypeDistributions = {
    aptitudeTier: distOf('aptitudeTier'),
    careerBand: distOf('careerBand'),
    growthType: distOf('growthType'),
    retirementProfile: distOf('retirementProfile'),
    entryPath: distOf('entryPath'),
    bodyType: distOf('bodyType'),
    temperament: distOf('temperament'),
  };

  const traitFlags = {
    tetsujinRate: pct(reached((f) => f.hasTetsujin), total),
    ironmanRate: pct(reached((f) => f.hasIronman), total),
    highDurabilityRate: pct(reached((f) => f.hasHighDurability), total),
  };

  // age-based KPIs (sim has retireAge / entryAge; real does not)
  const retireAges = features.map((f) => f.retireAge).filter(Number.isFinite);
  const entryAges = features.map((f) => f.entryAge).filter(Number.isFinite);
  const ageStats = {
    entryAge: {
      mean: entryAges.length > 0 ? entryAges.reduce((s, v) => s + v, 0) / entryAges.length : null,
      p10: quantile(entryAges, 0.1), p50: quantile(entryAges, 0.5), p90: quantile(entryAges, 0.9),
    },
    retireAge: {
      mean: retireAges.length > 0 ? retireAges.reduce((s, v) => s + v, 0) / retireAges.length : null,
      p10: quantile(retireAges, 0.1), p50: quantile(retireAges, 0.5), p90: quantile(retireAges, 0.9),
    },
  };

  return {
    sample: total,
    rankRates: {
      makushitaRate: pct(reachedMakushita, total),
      juryoRate: pct(reachedJuryo, total),
      sekitoriRate: pct(reachedJuryo, total),
      makuuchiRate: pct(reachedMakuuchi, total),
      sanyakuRate: pct(reachedSanyaku, total),
      ozekiRate: pct(reachedOzeki, total),
      yokozunaRate: pct(reachedYokozuna, total),
    },
    highestRankDistribution: highestRankRates,
    careerBashoBuckets: bashoBucketRates,
    careerLength,
    careerWinRate: careerWinRateStats,
    firstReach: {
      makushita: fr('makushita'),
      juryo: fr('juryo'),
      makuuchi: fr('makuuchi'),
      sanyaku: fr('sanyaku'),
      ozeki: fr('ozeki'),
      yokozuna: fr('yokozuna'),
    },
    divisionTenure,
    perDivisionWinRate,
    perDivisionKachikoshiRate,
    lower7WinsRates,
    sek15WinsRates,
    pipelineRates,
    archetypeDistributions,
    traitFlags,
    ageStats,
  };
};

// ---------------- KPI comparison ------------------

// Severity classification.
//   For "rate" KPIs (0..1): use absolute pct difference.
//     OK: |diff| <= 0.01 OR ratio<=0.10
//     MINOR: ratio<=0.25
//     MAJOR: ratio<=0.50
//     CRITICAL: > 0.50
//   For "count/quantile" (basho counts): use ratio diff with eps=1.
const classifySeverity = (real, sim, kind = 'rate') => {
  if (real == null || sim == null || !Number.isFinite(real) || !Number.isFinite(sim)) {
    return { severity: 'data-gap', diff: null, diffRatio: null };
  }
  const diff = sim - real;
  if (kind === 'rate') {
    const absDiff = Math.abs(diff);
    const denom = Math.max(Math.abs(real), 0.01);
    const ratio = absDiff / denom;
    let sev = 'OK';
    if (absDiff > 0.01) {
      if (ratio <= 0.10) sev = 'OK';
      else if (ratio <= 0.25) sev = 'MINOR';
      else if (ratio <= 0.50) sev = 'MAJOR';
      else sev = 'CRITICAL';
    }
    return { severity: sev, diff, diffRatio: ratio };
  }
  // count/quantile
  const denom = Math.max(Math.abs(real), 1);
  const ratio = Math.abs(diff) / denom;
  let sev = 'OK';
  if (ratio <= 0.10) sev = 'OK';
  else if (ratio <= 0.25) sev = 'MINOR';
  else if (ratio <= 0.50) sev = 'MAJOR';
  else sev = 'CRITICAL';
  return { severity: sev, diff, diffRatio: ratio };
};

const kpi = (key, category, label, real, sim, kind = 'rate', extra = {}) => {
  const cls = classifySeverity(real, sim, kind);
  return {
    kpiKey: key,
    kpiCategory: category,
    label,
    realValue: real,
    simValue: sim,
    diff: cls.diff,
    diffRatio: cls.diffRatio,
    severity: cls.severity,
    kind,
    ...extra,
  };
};

const buildKpiList = (real, sim) => {
  const out = [];

  // --- A. 到達率・最高位分布 ---
  out.push(kpi('A.rate.makushita', 'A_reach', '幕下到達率', real.rankRates.makushitaRate, sim.rankRates.makushitaRate));
  out.push(kpi('A.rate.juryo', 'A_reach', '十両到達率', real.rankRates.juryoRate, sim.rankRates.juryoRate));
  out.push(kpi('A.rate.makuuchi', 'A_reach', '幕内到達率', real.rankRates.makuuchiRate, sim.rankRates.makuuchiRate));
  out.push(kpi('A.rate.sanyaku', 'A_reach', '三役到達率', real.rankRates.sanyakuRate, sim.rankRates.sanyakuRate));
  out.push(kpi('A.rate.ozeki', 'A_reach', '大関到達率', real.rankRates.ozekiRate, sim.rankRates.ozekiRate));
  out.push(kpi('A.rate.yokozuna', 'A_reach', '横綱到達率', real.rankRates.yokozunaRate, sim.rankRates.yokozunaRate));
  for (const b of HIGHEST_BUCKETS) {
    out.push(kpi(`A.highestBucket.${b}`, 'A_reach', `最高位=${b} 比率`,
      real.highestRankDistribution[b], sim.highestRankDistribution[b]));
  }

  // --- B. 到達タイミング ---
  for (const r of ['makushita', 'juryo', 'makuuchi']) {
    const realQ = real.firstReach[r] || {};
    const simQ = sim.firstReach[r] || {};
    out.push(kpi(`B.firstReach.${r}.p10`, 'B_timing', `初${r} P10 (場所数)`,
      realQ.p10, simQ.p10, 'count'));
    out.push(kpi(`B.firstReach.${r}.p50`, 'B_timing', `初${r} P50 (場所数)`,
      realQ.p50, simQ.p50, 'count'));
    out.push(kpi(`B.firstReach.${r}.p90`, 'B_timing', `初${r} P90 (場所数)`,
      realQ.p90, simQ.p90, 'count'));
  }
  // age-based (data-gap)
  for (const a of ['firstJuryoAge', 'firstMakuuchiAge', 'retireAge', 'entryAge']) {
    out.push(kpi(`B.age.${a}`, 'B_timing', `${a} (年齢; real-data unavailable)`, null, null, 'count', {
      note: 'real-data has no birthdate in basho_records — data-definition mismatch',
    }));
  }

  // --- C. キャリア長・引退 ---
  out.push(kpi('C.careerLength.mean', 'C_career', 'キャリア場所数 平均',
    real.careerLength.mean, sim.careerLength.mean, 'count'));
  out.push(kpi('C.careerLength.p10', 'C_career', 'キャリア場所数 P10',
    real.careerLength.p10, sim.careerLength.p10, 'count'));
  out.push(kpi('C.careerLength.p50', 'C_career', 'キャリア場所数 P50',
    real.careerLength.p50, sim.careerLength.p50, 'count'));
  out.push(kpi('C.careerLength.p90', 'C_career', 'キャリア場所数 P90',
    real.careerLength.p90, sim.careerLength.p90, 'count'));
  for (const k of Object.keys(real.careerBashoBuckets)) {
    out.push(kpi(`C.bashoBucket.${k}`, 'C_career', `キャリア場所数バケット=${k} 比率`,
      real.careerBashoBuckets[k], sim.careerBashoBuckets[k]));
  }

  // --- D. 階級別在位 ---
  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi']) {
    const r = real.divisionTenure[div] || {};
    const s = sim.divisionTenure[div] || {};
    out.push(kpi(`D.tenure.${div}.p50`, 'D_tenure', `${div} 在位 P50 (場所数)`, r.p50, s.p50, 'count'));
    out.push(kpi(`D.tenure.${div}.p90`, 'D_tenure', `${div} 在位 P90 (場所数)`, r.p90, s.p90, 'count'));
    out.push(kpi(`D.tenure.${div}.mean`, 'D_tenure', `${div} 在位 平均 (場所数)`, r.mean, s.mean, 'count'));
  }

  // --- E. 勝敗分布 ---
  out.push(kpi('E.careerWinRate.mean', 'E_winloss', 'キャリア勝率 平均',
    real.careerWinRate.mean, sim.careerWinRate.mean));
  out.push(kpi('E.careerWinRate.p10', 'E_winloss', 'キャリア勝率 P10',
    real.careerWinRate.p10, sim.careerWinRate.p10));
  out.push(kpi('E.careerWinRate.p50', 'E_winloss', 'キャリア勝率 P50',
    real.careerWinRate.p50, sim.careerWinRate.p50));
  out.push(kpi('E.careerWinRate.p90', 'E_winloss', 'キャリア勝率 P90',
    real.careerWinRate.p90, sim.careerWinRate.p90));
  for (const k of Object.keys(real.careerWinRate.buckets)) {
    out.push(kpi(`E.winRateBucket.${k}`, 'E_winloss', `キャリア勝率バケット=${k} 比率`,
      real.careerWinRate.buckets[k], sim.careerWinRate.buckets[k]));
  }
  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi']) {
    out.push(kpi(`E.divWinRate.${div}`, 'E_winloss', `${div} 勝率`,
      real.perDivisionWinRate[div], sim.perDivisionWinRate[div]));
    out.push(kpi(`E.divKachikoshi.${div}`, 'E_winloss', `${div} 勝ち越し率/場所`,
      real.perDivisionKachikoshiRate[div], sim.perDivisionKachikoshiRate[div]));
  }
  // 7-bout distribution (lower divisions)
  for (let w = 0; w <= 7; w += 1) {
    out.push(kpi(`E.lower7.wins=${w}`, 'E_winloss', `下位 7番制 勝数=${w} 比率`,
      real.lower7WinsRates[w], sim.lower7WinsRates[w]));
  }
  // 15-bout distribution (sekitori)
  for (let w = 0; w <= 15; w += 1) {
    out.push(kpi(`E.sek15.wins=${w}`, 'E_winloss', `関取 15番制 勝数=${w} 比率`,
      real.sek15WinsRates[w], sim.sek15WinsRates[w]));
  }

  // --- F. パイプライン ---
  for (const k of Object.keys(real.pipelineRates)) {
    out.push(kpi(`F.pipeline.${k}`, 'F_pipeline', `pipeline ${k}`,
      real.pipelineRates[k], sim.pipelineRates[k]));
  }

  // --- G. sim-only archetype (no comparison; record as data-gap) ---
  for (const cat of Object.keys(sim.archetypeDistributions)) {
    for (const v of Object.keys(sim.archetypeDistributions[cat])) {
      out.push(kpi(`G.archetype.${cat}.${v}`, 'G_archetype', `${cat}=${v} 比率 (sim-only)`,
        null, sim.archetypeDistributions[cat][v], 'rate', {
          note: 'sim-only; real-data has no equivalent classification',
        }));
    }
  }
  out.push(kpi('G.trait.tetsujinRate', 'G_archetype', 'TETSUJIN trait 比率 (sim-only)',
    null, sim.traitFlags.tetsujinRate, 'rate', { note: 'sim-only' }));
  out.push(kpi('G.trait.ironmanRate', 'G_archetype', 'IRONMAN profile 比率 (sim-only)',
    null, sim.traitFlags.ironmanRate, 'rate', { note: 'sim-only' }));
  out.push(kpi('G.trait.highDurabilityRate', 'G_archetype', 'highDurability 比率 (sim-only)',
    null, sim.traitFlags.highDurabilityRate, 'rate', { note: 'sim-only' }));

  // --- H. 番付移動 (boundary) ---
  // boundary KPIs from sekitori_boundary_realdata.json (real); sim doesn't
  // produce a directly-aligned aggregate here, so we only surface the real
  // top-line summary as data-gap entries (not gap-classified).
  return out;
};

// ---------------- rendering ------------------

const fmt = (v, digits = 4) => (v == null || !Number.isFinite(v) ? 'n/a' : Number(v).toFixed(digits));
const fmtPct = (v) => (v == null || !Number.isFinite(v) ? 'n/a' : `${(v * 100).toFixed(2)}%`);
const fmtSign = (v) => {
  if (v == null || !Number.isFinite(v)) return 'n/a';
  const s = v >= 0 ? '+' : '';
  return `${s}${v.toFixed(4)}`;
};

const severityRank = { CRITICAL: 4, MAJOR: 3, MINOR: 2, OK: 1, 'data-gap': 0 };

const countSeverities = (kpis) => {
  const counts = { OK: 0, MINOR: 0, MAJOR: 0, CRITICAL: 0, 'data-gap': 0 };
  for (const k of kpis) counts[k.severity] = (counts[k.severity] || 0) + 1;
  return counts;
};

const topWorst = (kpis, n) => kpis
  .filter((k) => k.severity !== 'data-gap' && k.diffRatio != null)
  .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || (b.diffRatio - a.diffRatio))
  .slice(0, n);

const buildFixCandidates = (kpis, sim, real) => {
  const cands = [];
  // Inspect categories with most CRITICAL/MAJOR
  const byCategory = {};
  for (const k of kpis) {
    if (k.severity === 'CRITICAL' || k.severity === 'MAJOR') {
      byCategory[k.kpiCategory] = (byCategory[k.kpiCategory] || []);
      byCategory[k.kpiCategory].push(k);
    }
  }

  // Reach gaps
  if (byCategory.A_reach) {
    const reachKpis = byCategory.A_reach;
    const reachJuryo = kpis.find((k) => k.kpiKey === 'A.rate.juryo');
    const reachMakuuchi = kpis.find((k) => k.kpiKey === 'A.rate.makuuchi');
    cands.push({
      priority: reachKpis.some((k) => k.severity === 'CRITICAL') ? 'P0' : 'P1',
      targetArea: 'initial generation',
      evidence: `A_reach gaps: ${reachKpis.length} 個 (CRITICAL=${reachKpis.filter((k) => k.severity === 'CRITICAL').length}). 例: 十両到達率 real=${fmtPct(reachJuryo?.realValue)} vs sim=${fmtPct(reachJuryo?.simValue)} / 幕内到達率 real=${fmtPct(reachMakuuchi?.realValue)} vs sim=${fmtPct(reachMakuuchi?.simValue)}`,
      proposedAction: 'aptitudeTier 比率と各 tier の ability 開発速度を再キャリブレーション。populationKind/Preset の天井分布を実 cohort（career_calibration_1965plus.json）と突き合わせ。logic変更前に sweep 実験で範囲探索する。',
      risk: '到達率を上げると逆に幕下吸着率が下がりすぎる可能性。lower-division KPI を同時に見る。',
      doNotChangeYet: '本バンドルは診断専用。具体的調整値は別 sweep で検討する。',
    });
  }

  if (byCategory.C_career) {
    const careerKpis = byCategory.C_career;
    const meanKpi = kpis.find((k) => k.kpiKey === 'C.careerLength.mean');
    cands.push({
      priority: careerKpis.some((k) => k.severity === 'CRITICAL') ? 'P0' : 'P1',
      targetArea: 'retirement',
      evidence: `C_career gaps: ${careerKpis.length} 個. 平均 careerBasho real=${fmt(meanKpi?.realValue, 1)} vs sim=${fmt(meanKpi?.simValue, 1)}, バケット分布で <12/12-23 の差大.`,
      proposedAction: 'retirementProfile (EARLY_EXIT / STANDARD / IRONMAN) の roll 分布と、各 profile の引退確率乗数を見直す。SPIRIT/MAKEKOSHI_STREAK 引退の発火条件を実 cohort の早期引退率と突き合わせる。',
      risk: '長キャリア化させすぎると lowWinLongCareer が増えて real から離れる。',
      doNotChangeYet: '退場ロジックは多軸交互作用が強く、単一パラメータ調整では悪化する可能性が高い。',
    });
  }

  if (byCategory.D_tenure) {
    const tenureKpis = byCategory.D_tenure;
    cands.push({
      priority: 'P1',
      targetArea: 'banzuke',
      evidence: `D_tenure gaps: ${tenureKpis.length} 個。階級別の在位場所数分布 (P50/P90/平均) で乖離。`,
      proposedAction: '昇降格基準 (banzuke promotion thresholds) と division-cap headcount を、実 cohort の各 division の在位中央値と突き合わせる。',
      risk: '昇格緩和は到達率を変動させるので A_reach と連動して見る。',
      doNotChangeYet: '本バンドルは診断のみ。banzuke ロジックは別タスク。',
    });
  }

  if (byCategory.E_winloss) {
    const winKpis = byCategory.E_winloss;
    const lower7 = winKpis.filter((k) => k.kpiKey.startsWith('E.lower7'));
    const sek15 = winKpis.filter((k) => k.kpiKey.startsWith('E.sek15'));
    cands.push({
      priority: 'P2',
      targetArea: lower7.length > sek15.length ? 'torikumi' : 'battle',
      evidence: `E_winloss gaps: ${winKpis.length} 個 (lower7=${lower7.length}, sek15=${sek15.length}). 勝敗分布の偏り.`,
      proposedAction: '取組 (torikumi) の対戦相手選定と battle 勝率モデル (calibration) を見直す。実 cohort の wins=4 (lower) / wins=7-8 (sekitori) のヒストグラム形状と突き合わせる。',
      risk: 'kachikoshi 率が変わると banzuke promotion 結果が連動して変わる。',
      doNotChangeYet: 'battle/torikumi/banzuke の三者連動。診断のみ。',
    });
  }

  if (byCategory.F_pipeline) {
    cands.push({
      priority: 'P1',
      targetArea: 'makushita-juryo boundary',
      evidence: `F_pipeline gaps: ${byCategory.F_pipeline.length} 個。makushita→juryo / juryo→makuuchi 通過率の乖離。`,
      proposedAction: '幕下上位5枚目 boundary の昇格基準と十両陥落基準を sekitori_boundary_realdata.json と突き合わせて目標値設定。',
      risk: 'sekitori 率を直接動かす。A_reach と連動。',
      doNotChangeYet: '個別 sweep で調整候補を出してから本体修正に着手する。',
    });
  }

  // sim-only archetype distribution sanity (G is informational)
  cands.push({
    priority: 'P3',
    targetArea: 'initial generation',
    evidence: `sim-only archetype distributions (G_archetype) は real-data に対応概念がないため直接比較不可。aptitudeTier/careerBand/retirementProfile の分布が cohort の最高位分布を再現できるかを次の検証で確認する。`,
    proposedAction: 'aptitudeTier × highest-rank-bucket のクロス集計を作成し、real cohort の highestRankDistribution と一致するか間接検証する。',
    risk: 'archetype ↔ outcome マッピングが暗黙の前提を持っているため、安易な再キャリブレーションは他 KPI を悪化させる。',
    doNotChangeYet: 'B-tier 幕下吸着監査 (memory: project_audit_archetype) と統合して別タスクで扱う。',
  });

  cands.push({
    priority: 'P3',
    targetArea: 'NPC',
    evidence: 'NPC 力士の生成は本バンドルの per-rikishi career 観測対象に含まれない (single career 観測のみ)。NPC 側の在位/勝敗分布は npc_relative_strength_audit (memory) で別途追跡。',
    proposedAction: '本バンドルの sim aggregate と NPC aggregate を将来統合できる形にする (現状はプレイヤー力士単独観測)。',
    risk: 'NPC ロジックの変更は league-wide な balance 影響が大きい。',
    doNotChangeYet: 'npc_relative_strength_audit / makushita_juryo_exchange_audit と並走で扱う。',
  });

  return cands;
};

// ---------------- main ------------------

const renderFullMd = (payload) => {
  const { meta, real, sim, kpis, severityCounts, top10, fixCandidates } = payload;
  const lines = [];
  lines.push('# Career Reality Gap Report');
  lines.push('');
  lines.push('診断専用 (production logic 変更なし). 本レポートは `realdata-career-diagnosis-bundle` の出力です。');
  lines.push('');
  lines.push('## 0. Run Metadata');
  lines.push('');
  lines.push(`- generatedAt: ${meta.generatedAt}`);
  lines.push(`- real-data 出典: ${meta.realSource}`);
  lines.push(`- real cohort: ${meta.realCohortLabel} (sample = ${real.sample})`);
  lines.push(`- real era range: ${meta.eraRange}`);
  lines.push(`- real activeCutoffBashoId: ${meta.activeCutoffBashoId} (この場所以降に出場した力士は active 扱いで除外)`);
  lines.push(`- sim populationKind: ${meta.populationKind}`);
  lines.push(`- sim populationPreset: ${meta.populationPreset}`);
  lines.push(`- sim sample: ${sim.sample}`);
  lines.push(`- env: REALDATA_DIAGNOSIS_RUNS=${process.env.REALDATA_DIAGNOSIS_RUNS || '(default 2000)'}`);
  lines.push('');
  lines.push('## 1. Executive Summary');
  lines.push('');
  lines.push(`- 評価対象 KPI 総数: ${kpis.length}`);
  lines.push(`- 重大度内訳: OK=${severityCounts.OK} / MINOR=${severityCounts.MINOR} / MAJOR=${severityCounts.MAJOR} / CRITICAL=${severityCounts.CRITICAL} / data-gap=${severityCounts['data-gap']}`);
  const compared = kpis.filter((k) => k.severity !== 'data-gap').length;
  const okPct = compared > 0 ? (severityCounts.OK / compared) * 100 : 0;
  lines.push(`- 比較可能 KPI 中 OK 率: ${okPct.toFixed(1)}% (${severityCounts.OK}/${compared})`);
  lines.push('');
  lines.push('## 2. 全体評価');
  lines.push('');
  const totalIssues = severityCounts.MAJOR + severityCounts.CRITICAL;
  if (totalIssues === 0) {
    lines.push('- MAJOR/CRITICAL なし。MINOR 範囲内のズレのみ。');
  } else {
    lines.push(`- MAJOR/CRITICAL 合計 ${totalIssues} 個。修正候補 (Section 11) を参照。`);
  }
  lines.push('');
  lines.push('## 3. Top 10 ズレ (severity × diffRatio)');
  lines.push('');
  lines.push('| # | kpiKey | category | label | real | sim | diff | ratio | severity |');
  lines.push('|---:|---|---|---|---:|---:|---:|---:|---|');
  top10.forEach((k, i) => {
    lines.push(`| ${i + 1} | \`${k.kpiKey}\` | ${k.kpiCategory} | ${k.label} | ${fmt(k.realValue, 4)} | ${fmt(k.simValue, 4)} | ${fmtSign(k.diff)} | ${fmt(k.diffRatio, 3)} | ${k.severity} |`);
  });
  lines.push('');

  const renderSection = (title, prefix) => {
    lines.push(`## ${title}`);
    lines.push('');
    const filtered = kpis.filter((k) => k.kpiCategory === prefix);
    lines.push('| kpiKey | label | real | sim | diff | ratio | severity |');
    lines.push('|---|---|---:|---:|---:|---:|---|');
    for (const k of filtered) {
      lines.push(`| \`${k.kpiKey}\` | ${k.label} | ${fmt(k.realValue, 4)} | ${fmt(k.simValue, 4)} | ${fmtSign(k.diff)} | ${fmt(k.diffRatio, 3)} | ${k.severity} |`);
    }
    lines.push('');
  };

  renderSection('4. 到達率・最高位分布 (A_reach)', 'A_reach');
  renderSection('5. 到達タイミング (B_timing)', 'B_timing');
  renderSection('6. キャリア長・引退 (C_career)', 'C_career');
  renderSection('7. 階級別在位 (D_tenure)', 'D_tenure');
  renderSection('8. 勝敗分布 (E_winloss)', 'E_winloss');
  renderSection('9. パイプライン (F_pipeline)', 'F_pipeline');
  renderSection('10. sim-only archetype 分布 (G_archetype)', 'G_archetype');

  lines.push('## 11. 修正候補 priorities');
  lines.push('');
  lines.push('> 注: 本バンドルは診断専用。下記は「次に何を sweep / 実験すべきか」のプロポーザル。logic 変更は含まない。');
  lines.push('');
  for (const c of fixCandidates) {
    lines.push(`- **${c.priority}** (${c.targetArea})`);
    lines.push(`  - evidence: ${c.evidence}`);
    lines.push(`  - proposedAction: ${c.proposedAction}`);
    lines.push(`  - risk: ${c.risk}`);
    lines.push(`  - doNotChangeYet: ${c.doNotChangeYet}`);
    lines.push('');
  }

  lines.push('## 12. 触らない方がよい領域');
  lines.push('');
  lines.push('- 番付移動詳細 (banzuke transitions): すでに `game_calibration_long_range.json` で別アグリゲートあり。本診断では rank-movement 側の sim 集計を持たないため比較対象外。');
  lines.push('- battle/torikumi の内部判定: 個別観測スクリプト (battle_torikumi_report) で別途扱う。本バンドルは career-level KPI に絞る。');
  lines.push('- NPC 力士の在位分布: 単一 career 観測のため NPC は対象外。npc_relative_strength_audit を参照。');
  lines.push('- B-tier 幕下吸着: project_audit_archetype / project_grinder_genome_rework で個別追跡中。本診断の G_archetype は概況提示のみ。');
  lines.push('');

  lines.push('## 13. 次タスク案');
  lines.push('');
  lines.push('- (1) Top 10 ズレに対応する個別 sweep を別ブランチで設計 (logic 変更なしの parameter sweep)。');
  lines.push('- (2) NPC career aggregation を本バンドルと同じ KPI 形で生成し、player+NPC 統合 cohort で再評価。');
  lines.push('- (3) age-based KPI 復元のため、real-data 側に rikishi_birthdate を結合する ETL を追加 (本バンドル外)。');
  lines.push('- (4) sekitori_boundary_realdata.json と sim 側の boundary 集計を直接比較する H_movement セクションを追加。');
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 出典');
  lines.push('');
  lines.push('- Real-data:');
  lines.push('  - `sumo-api-db/data/analysis/basho_records_sumo_api_196007_202603.json`');
  lines.push('  - `sumo-api-db/data/analysis/sekitori_boundary_realdata.json`');
  lines.push('  - `sumo-api-db/data/analysis/game_calibration_long_range.json`');
  lines.push('  - `sumo-db/data/analysis/career_calibration_1965plus.json` (heisei cohort 比較参考)');
  lines.push('- Sim:');
  lines.push('  - `runCareerObservation` via `scripts/reports/_shared/realdata_diagnosis_worker.cjs`');
  lines.push('');
  return lines.join('\n');
};

const renderSummaryMd = (payload) => {
  const { meta, real, sim, severityCounts, top10, fixCandidates } = payload;
  const lines = [];
  lines.push('# Career Reality Gap — Summary');
  lines.push('');
  lines.push(`generated: ${meta.generatedAt} | real cohort: ${real.sample} | sim sample: ${sim.sample}`);
  lines.push('');
  lines.push('## Severity counts');
  lines.push('');
  lines.push('| OK | MINOR | MAJOR | CRITICAL | data-gap |');
  lines.push('|---:|---:|---:|---:|---:|');
  lines.push(`| ${severityCounts.OK} | ${severityCounts.MINOR} | ${severityCounts.MAJOR} | ${severityCounts.CRITICAL} | ${severityCounts['data-gap']} |`);
  lines.push('');
  lines.push('## Top 10 worst KPIs');
  lines.push('');
  lines.push('| # | kpi | real | sim | ratio | severity |');
  lines.push('|---:|---|---:|---:|---:|---|');
  top10.forEach((k, i) => {
    lines.push(`| ${i + 1} | \`${k.kpiKey}\` | ${fmt(k.realValue, 4)} | ${fmt(k.simValue, 4)} | ${fmt(k.diffRatio, 3)} | ${k.severity} |`);
  });
  lines.push('');
  lines.push('## Top 5 修正候補');
  lines.push('');
  for (const c of fixCandidates.slice(0, 5)) {
    lines.push(`- **${c.priority}** (${c.targetArea}) — ${c.proposedAction}`);
    lines.push(`  - risk: ${c.risk}`);
  }
  lines.push('');
  lines.push('完全レポート: `docs/realdata_integration/career_reality_gap_report.md`');
  return lines.join('\n');
};

const main = async () => {
  if (!Number.isFinite(RUNS) || RUNS <= 0) throw new Error(`Invalid REALDATA_DIAGNOSIS_RUNS: ${RUNS}`);

  console.log(`[realdata-diagnosis] loading real aggregate (rebuild=${REBUILD_AGG})...`);
  const realAgg = loadAggregate({ rebuild: REBUILD_AGG });
  const real = realAgg.cohorts.complete;

  console.log(`[realdata-diagnosis] running ${RUNS} sim careers...`);
  const features = await runParallel(RUNS);
  const sim = aggregateSim(features);
  fs.mkdirSync(path.dirname(SIM_AGG_CACHE), { recursive: true });
  fs.writeFileSync(SIM_AGG_CACHE, JSON.stringify(sim, null, 2), 'utf8');

  const kpis = buildKpiList(real, sim);
  const severityCounts = countSeverities(kpis);
  const top10 = topWorst(kpis, 10);
  const fixCandidates = buildFixCandidates(kpis, sim, real);

  const meta = {
    generatedAt: new Date().toISOString(),
    realSource: realAgg.meta.source,
    realCohortLabel: real.cohortLabel,
    eraRange: realAgg.meta.eraRange,
    activeCutoffBashoId: realAgg.meta.activeCutoffBashoId,
    populationKind: POPULATION_KIND,
    populationPreset: POPULATION_PRESET,
    runs: RUNS,
  };

  const payload = { meta, real, sim, kpis, severityCounts, top10, fixCandidates };

  writeFile(OUT_JSON, JSON.stringify({
    meta,
    realSummary: { sample: real.sample, cohortLabel: real.cohortLabel },
    simSummary: { sample: sim.sample },
    severityCounts,
    top10: top10.map((k) => ({ kpiKey: k.kpiKey, severity: k.severity, diffRatio: k.diffRatio, real: k.realValue, sim: k.simValue })),
    kpis,
    fixCandidates,
  }, null, 2));
  writeFile(OUT_MD, renderFullMd(payload));
  writeFile(OUT_SUMMARY_MD, renderSummaryMd(payload));

  console.log(`[realdata-diagnosis] wrote: ${OUT_JSON}`);
  console.log(`[realdata-diagnosis] wrote: ${OUT_MD}`);
  console.log(`[realdata-diagnosis] wrote: ${OUT_SUMMARY_MD}`);
  console.log(`[realdata-diagnosis] severity: OK=${severityCounts.OK} MINOR=${severityCounts.MINOR} MAJOR=${severityCounts.MAJOR} CRITICAL=${severityCounts.CRITICAL} data-gap=${severityCounts['data-gap']}`);
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
