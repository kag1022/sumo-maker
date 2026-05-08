// NPC Relative Strength Diagnostics Report
// observed力士とNPC幕下層の相対強度を診断する。ロジック変更なし。診断専用。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_PATH = require.resolve('./_shared/npc_strength_worker.cjs');

const RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 400);
const POPULATION_KIND = process.env.REALISM_POPULATION_KIND || 'historical-like-career';
const POPULATION_PRESET = process.env.REALISM_POPULATION_PRESET || 'historical-like-v2-high';

const REPORT_MD = path.join('docs', 'balance', 'npc-relative-strength-diagnostics.md');
const REPORT_JSON = path.join('.tmp', 'npc-relative-strength-diagnostics.json');

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const pct = (n, d) => (d > 0 ? n / d : 0);
const toPct = (v) => (Number.isFinite(v) ? `${(v * 100).toFixed(2)}%` : 'n/a');
const toFixed = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');

const quantile = (values, ratio) => {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[idx];
};

const mean = (values) => {
  const finite = values.filter(Number.isFinite);
  return finite.length > 0 ? finite.reduce((s, v) => s + v, 0) / finite.length : null;
};

const groupBy = (items, key) => {
  const out = {};
  for (const item of items) {
    const v = key(item) ?? 'unknown';
    if (!out[v]) out[v] = [];
    out[v].push(item);
  }
  return out;
};

// ─── Parallel runner ───────────────────────────────────────────────────────

const runParallel = (runs) =>
  new Promise((resolve, reject) => {
    const maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, 16, runs));
    const careers = [];
    let nextIndex = 0;
    let active = 0;
    let completed = 0;
    let failed = false;

    const maybeFinish = () => {
      if (failed || completed !== runs || active !== 0) return;
      resolve(careers);
    };

    const launchNext = () => {
      if (failed) return;
      while (active < maxWorkers && nextIndex < runs) {
        const runIndex = nextIndex;
        nextIndex += 1;
        active += 1;
        const seed = (((runIndex + 1) * 2654435761) + 97) >>> 0;
        const worker = new Worker(WORKER_PATH, {
          workerData: { seed, populationKind: POPULATION_KIND, populationPreset: POPULATION_PRESET },
        });
        worker.on('message', (msg) => careers.push(msg));
        worker.on('error', (error) => { if (!failed) { failed = true; reject(error); } });
        worker.on('exit', (code) => {
          if (failed) return;
          active -= 1;
          if (code !== 0) { failed = true; reject(new Error(`Worker exit ${code}`)); return; }
          completed += 1;
          if (completed % 50 === 0 || completed === runs) {
            console.log(`npc-strength diagnostics: ${completed}/${runs}`);
          }
          launchNext();
          maybeFinish();
        });
      }
    };

    console.log(`Starting NPC strength diagnostics pool with ${maxWorkers} workers (${POPULATION_PRESET}, ${runs} runs)...`);
    launchNext();
  });

// ─── Helpers ───────────────────────────────────────────────────────────────

// Flatten basho records from all careers, attaching career metadata
const flattenBashoRecords = (careers) => {
  const all = [];
  for (const career of careers) {
    const meta = {
      seed: career.seed,
      aptitudeTier: career.aptitudeTier,
      careerBand: career.careerBand,
      growthType: career.growthType,
      retirementProfile: career.retirementProfile,
      entryPath: career.entryPath,
      styleRelevantCeiling: career.styleRelevantCeiling,
      reachedJuryo: career.reachedJuryo,
      reachedMakuuchi: career.reachedMakuuchi,
    };
    for (const b of (career.bashoRecords ?? [])) {
      all.push({ ...b, ...meta });
    }
  }
  return all;
};

// Per-division stats (ability vs SOS, ewRate, etc.)
const divisionStats = (records) => {
  const withBouts = records.filter((r) => r.totalBouts > 0);
  const n = withBouts.length;
  if (n === 0) return null;

  const sosValues = withBouts.map((r) => r.strengthOfSchedule).filter(Number.isFinite);
  const ipaValues = withBouts.map((r) => r.impliedPlayerAbility).filter(Number.isFinite);
  const ratingValues = withBouts.map((r) => r.playerRatingAbility).filter(Number.isFinite);
  const ewRateValues = withBouts.map((r) => r.expectedWinRate).filter(Number.isFinite);
  const actualValues = withBouts.map((r) => r.actualWinRate).filter(Number.isFinite);
  const gapValues = withBouts.map((r) => r.abilityGap).filter(Number.isFinite);

  const totalWins = withBouts.reduce((s, r) => s + r.wins, 0);
  const totalBouts = withBouts.reduce((s, r) => s + r.totalBouts, 0);
  const totalExpected = withBouts.reduce((s, r) => s + (r.expectedWins ?? 0), 0);

  return {
    bashoCount: n,
    totalBouts,
    // Opponent (NPC) ability from strengthOfSchedule
    sosP10: quantile(sosValues, 0.1),
    sosP50: quantile(sosValues, 0.5),
    sosP90: quantile(sosValues, 0.9),
    sosMean: mean(sosValues),
    // Implied player effective ability (derived from ewRate + SOS)
    ipaP10: quantile(ipaValues, 0.1),
    ipaP50: quantile(ipaValues, 0.5),
    ipaP90: quantile(ipaValues, 0.9),
    ipaMean: mean(ipaValues),
    // Player base rating (raw ratingState.ability, before form)
    ratingP50: quantile(ratingValues, 0.5),
    ratingMean: mean(ratingValues),
    // Ability gap (implied player ability - mean opponent ability)
    abilityGapP50: quantile(gapValues, 0.5),
    abilityGapMean: mean(gapValues),
    // Win rates
    expectedWinRate: pct(totalExpected, totalBouts),
    actualWinRate: pct(totalWins, totalBouts),
    expectedWinRateP50: quantile(ewRateValues, 0.5),
  };
};

// ─── A. Division別 ability 分布 ───────────────────────────────────────────

const computeDivisionStrengthDiag = (allBasho) => {
  const DIV_ORDER = ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi'];
  const byDiv = groupBy(allBasho, (b) => b.division);
  const result = {};
  for (const div of DIV_ORDER) {
    const records = byDiv[div] ?? [];
    result[div] = divisionStats(records);
  }

  // Makushita by rank band
  const msRecords = allBasho.filter((b) => b.division === 'Makushita');
  const byBand = groupBy(msRecords, (b) => b.rankBand);
  result._makushitaByBand = {};
  for (const band of ['upper5', 'upper', 'middle', 'lower']) {
    result._makushitaByBand[band] = divisionStats(byBand[band] ?? []);
  }

  return result;
};

// ─── B. 幕下到達時の力士状態 ─────────────────────────────────────────────

const computeFirstMakushitaState = (careers) => {
  const entries = [];
  for (const career of careers) {
    const records = career.bashoRecords ?? [];
    // Sort by seq to find the first Makushita basho
    const msRecords = records
      .filter((b) => b.division === 'Makushita')
      .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    if (msRecords.length === 0) continue;
    const first = msRecords[0];

    // Previous 3 basho (before first Makushita)
    const firstIdx = records.findIndex((b) => b.seq === first.seq);
    const prev3 = records.slice(Math.max(0, firstIdx - 3), firstIdx);
    const prev3Wins = prev3.reduce((s, b) => s + b.wins, 0);
    const prev3Bouts = prev3.reduce((s, b) => s + b.totalBouts, 0);
    const prev3WinRate = prev3Bouts > 0 ? prev3Wins / prev3Bouts : null;

    // First 3 Makushita basho win rate
    const first3Ms = msRecords.slice(0, 3);
    const f3Wins = first3Ms.reduce((s, b) => s + b.wins, 0);
    const f3Bouts = first3Ms.reduce((s, b) => s + b.totalBouts, 0);
    const first3WinRate = f3Bouts > 0 ? f3Wins / f3Bouts : null;

    entries.push({
      aptitudeTier: career.aptitudeTier,
      careerBand: career.careerBand,
      growthType: career.growthType,
      retirementProfile: career.retirementProfile,
      entryPath: career.entryPath,
      styleRelevantCeiling: career.styleRelevantCeiling,
      reachedJuryo: career.reachedJuryo,
      reachedMakuuchi: career.reachedMakuuchi,
      careerBashoAtFirstMakushita: firstIdx,
      // First Makushita basho details
      firstMakushitaSeq: first.seq,
      firstMakushitaYear: first.year,
      firstMakushitaRankNumber: first.rankNumber,
      firstMakushitaSos: first.strengthOfSchedule,
      firstMakushitaIpa: first.impliedPlayerAbility,
      firstMakushitaRatingAbility: first.playerRatingAbility,
      firstMakushitaEwRate: first.expectedWinRate,
      firstMakushitaWins: first.wins,
      firstMakushitaLosses: first.losses,
      prev3WinRate,
      first3WinRate,
      first3Records: first3Ms.map((b) => `${b.wins}-${b.losses}`).join(' / '),
      first3AvgSos: mean(first3Ms.map((b) => b.strengthOfSchedule).filter(Number.isFinite)),
      first3AvgEwRate: mean(first3Ms.map((b) => b.expectedWinRate).filter(Number.isFinite)),
      first3AvgIpa: mean(first3Ms.map((b) => b.impliedPlayerAbility).filter(Number.isFinite)),
    });
  }
  return entries;
};

// ─── C. 幕下NPC強度分布 ──────────────────────────────────────────────────

const computeNpcStrengthDist = (allBasho) => {
  // SOS = mean opponent (NPC) ability per basho.
  // Aggregated by division and rank band gives the NPC ability distribution.
  const DIV_ORDER = ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi'];
  const byDiv = groupBy(allBasho.filter((b) => b.totalBouts > 0), (b) => b.division);
  const result = {};
  for (const div of DIV_ORDER) {
    const records = byDiv[div] ?? [];
    const sosByBand = {};
    for (const b of records) {
      const band = b.rankBand ?? 'all';
      if (!sosByBand[band]) sosByBand[band] = [];
      if (Number.isFinite(b.strengthOfSchedule)) sosByBand[band].push(b.strengthOfSchedule);
    }
    const allSos = records.map((r) => r.strengthOfSchedule).filter(Number.isFinite);
    const bandStats = {};
    for (const [band, vals] of Object.entries(sosByBand)) {
      bandStats[band] = {
        n: vals.length,
        p10: quantile(vals, 0.1),
        p50: quantile(vals, 0.5),
        p90: quantile(vals, 0.9),
        mean: mean(vals),
      };
    }
    result[div] = {
      bashoCount: records.length,
      sosP10: quantile(allSos, 0.1),
      sosP50: quantile(allSos, 0.5),
      sosP90: quantile(allSos, 0.9),
      sosMean: mean(allSos),
      byBand: bandStats,
    };
  }
  return result;
};

// ─── D. careerBand×aptitudeTier 別 幕下 ewRate ───────────────────────────

const computeMakushitaEwRateCrossTabs = (allBasho) => {
  const ms = allBasho.filter((b) => b.division === 'Makushita' && b.totalBouts > 0 && b.expectedWinRate != null);
  if (ms.length === 0) return {};

  const computeStats = (records) => {
    if (!records.length) return null;
    const ewVals = records.map((r) => r.expectedWinRate).filter(Number.isFinite);
    const ipaVals = records.map((r) => r.impliedPlayerAbility).filter(Number.isFinite);
    const sosVals = records.map((r) => r.strengthOfSchedule).filter(Number.isFinite);
    const totalWins = records.reduce((s, r) => s + r.wins, 0);
    const totalBouts = records.reduce((s, r) => s + r.totalBouts, 0);
    return {
      n: records.length,
      ewRateMean: mean(ewVals),
      ewRateP50: quantile(ewVals, 0.5),
      ipaMean: mean(ipaVals),
      ipaP50: quantile(ipaVals, 0.5),
      sosMean: mean(sosVals),
      sosP50: quantile(sosVals, 0.5),
      actualWinRate: pct(totalWins, totalBouts),
      kachikoshiRate: pct(records.filter((r) => r.wins >= 4).length, records.length),
    };
  };

  // careerBand × aptitudeTier
  const BANDS = ['ELITE', 'STRONG', 'STANDARD', 'GRINDER', 'WASHOUT'];
  const TIERS = ['S', 'A', 'B', 'C', 'D'];
  const byBand = {};
  for (const band of BANDS) {
    const recs = ms.filter((b) => b.careerBand === band);
    if (recs.length === 0) continue;
    byBand[band] = computeStats(recs);
    // By tier within this band
    byBand[band]._byTier = {};
    for (const tier of TIERS) {
      const tr = recs.filter((b) => b.aptitudeTier === tier);
      if (tr.length >= 5) byBand[band]._byTier[tier] = computeStats(tr);
    }
  }

  // Entry path
  const byEntryPath = {};
  const byEP = groupBy(ms, (b) => b.entryPath ?? 'unknown');
  for (const [ep, recs] of Object.entries(byEP)) {
    if (recs.length >= 5) byEntryPath[ep] = computeStats(recs);
  }

  // Growth type
  const byGrowthType = {};
  const byGT = groupBy(ms, (b) => b.growthType ?? 'unknown');
  for (const [gt, recs] of Object.entries(byGT)) {
    if (recs.length >= 5) byGrowthType[gt] = computeStats(recs);
  }

  // styleRelevantCeiling bucket
  const ceilingBucket = (c) => {
    if (c == null) return 'unknown';
    if (c < 55) return '<55';
    if (c < 60) return '55-59';
    if (c < 65) return '60-64';
    if (c < 70) return '65-69';
    if (c < 75) return '70-74';
    return '75+';
  };
  const byCeiling = {};
  const byCB = groupBy(ms, (b) => ceilingBucket(b.styleRelevantCeiling));
  for (const [cb, recs] of Object.entries(byCB)) {
    if (recs.length >= 5) byCeiling[cb] = computeStats(recs);
  }

  return { byCareerBand: byBand, byEntryPath, byGrowthType, byCeilingBucket: byCeiling };
};

// ─── E. 幕下上位候補の強度 ────────────────────────────────────────────────

const computeMakushitaUpperCandidates = (careers) => {
  // Per-career: find careers that reached Makushita upper (rank 1-5)
  const candidates = [];
  for (const career of careers) {
    const records = career.bashoRecords ?? [];
    const upper5 = records.filter((b) => b.division === 'Makushita' && (b.rankNumber ?? 99) <= 5 && b.totalBouts > 0);
    if (upper5.length === 0) continue;

    const sosVals = upper5.map((b) => b.strengthOfSchedule).filter(Number.isFinite);
    const ipaVals = upper5.map((b) => b.impliedPlayerAbility).filter(Number.isFinite);
    const ratingVals = upper5.map((b) => b.playerRatingAbility).filter(Number.isFinite);
    const ewVals = upper5.map((b) => b.expectedWinRate).filter(Number.isFinite);
    const fiveWinsBashosCount = upper5.filter((b) => b.wins >= 5).length;

    // Determine promotion to Juryo: next frame after Makushita upper basho is Juryo?
    let juryoPromotionCount = 0;
    for (let i = 0; i < records.length; i++) {
      const b = records[i];
      if (b.division !== 'Makushita' || (b.rankNumber ?? 99) > 5) continue;
      const nextB = records[i + 1];
      if (nextB?.division === 'Juryo' || nextB?.division === 'Makuuchi') juryoPromotionCount++;
    }

    const totalWins = upper5.reduce((s, b) => s + b.wins, 0);
    const totalBouts = upper5.reduce((s, b) => s + b.totalBouts, 0);

    candidates.push({
      aptitudeTier: career.aptitudeTier,
      careerBand: career.careerBand,
      growthType: career.growthType,
      entryPath: career.entryPath,
      styleRelevantCeiling: career.styleRelevantCeiling,
      reachedJuryo: career.reachedJuryo,
      reachedMakuuchi: career.reachedMakuuchi,
      upper5BashoCount: upper5.length,
      sosP50: quantile(sosVals, 0.5),
      ipaP50: quantile(ipaVals, 0.5),
      ratingP50: quantile(ratingVals, 0.5),
      ewRateMean: mean(ewVals),
      actualWinRate: pct(totalWins, totalBouts),
      fiveWinsPlusRate: pct(fiveWinsBashosCount, upper5.length),
      juryoPromotionRate: pct(juryoPromotionCount, upper5.length),
    });
  }

  if (candidates.length === 0) return null;

  const sosP50vals = candidates.map((c) => c.sosP50).filter(Number.isFinite);
  const ipaP50vals = candidates.map((c) => c.ipaP50).filter(Number.isFinite);
  const ratingP50vals = candidates.map((c) => c.ratingP50).filter(Number.isFinite);
  const ewVals = candidates.map((c) => c.ewRateMean).filter(Number.isFinite);
  const fiveVals = candidates.map((c) => c.fiveWinsPlusRate).filter(Number.isFinite);
  const promoVals = candidates.map((c) => c.juryoPromotionRate).filter(Number.isFinite);

  // By careerBand
  const byBand = {};
  for (const [band, grp] of Object.entries(groupBy(candidates, (c) => c.careerBand ?? 'unknown'))) {
    if (grp.length < 2) continue;
    byBand[band] = {
      n: grp.length,
      sosP50: quantile(grp.map((c) => c.sosP50).filter(Number.isFinite), 0.5),
      ipaP50: quantile(grp.map((c) => c.ipaP50).filter(Number.isFinite), 0.5),
      ewRateMean: mean(grp.map((c) => c.ewRateMean).filter(Number.isFinite)),
      fiveWinsPlusRate: mean(grp.map((c) => c.fiveWinsPlusRate).filter(Number.isFinite)),
      juryoPromotionRate: mean(grp.map((c) => c.juryoPromotionRate).filter(Number.isFinite)),
    };
  }

  return {
    candidateCount: candidates.length,
    sosP10: quantile(sosP50vals, 0.1),
    sosP50: quantile(sosP50vals, 0.5),
    sosP90: quantile(sosP50vals, 0.9),
    ipaP10: quantile(ipaP50vals, 0.1),
    ipaP50: quantile(ipaP50vals, 0.5),
    ipaP90: quantile(ipaP50vals, 0.9),
    ratingP50: quantile(ratingP50vals, 0.5),
    ewRateMean: mean(ewVals),
    fiveWinsPlusRate: mean(fiveVals),
    juryoPromotionRate: mean(promoVals),
    byCareerBand: byBand,
  };
};

// ─── compute all ─────────────────────────────────────────────────────────

const computeAll = (careers) => {
  const allBasho = flattenBashoRecords(careers);
  const totalCareers = careers.length;
  const juryoReachRate = pct(careers.filter((c) => c.reachedJuryo).length, totalCareers);
  const makuuchiReachRate = pct(careers.filter((c) => c.reachedMakuuchi).length, totalCareers);

  return {
    meta: {
      careers: totalCareers,
      totalBashoRecords: allBasho.length,
      juryoReachRate,
      makuuchiReachRate,
    },
    divisionStrength: computeDivisionStrengthDiag(allBasho),
    firstMakushitaEntries: computeFirstMakushitaState(careers),
    npcStrengthDist: computeNpcStrengthDist(allBasho),
    makushitaCrossTabs: computeMakushitaEwRateCrossTabs(allBasho),
    makushitaUpperCandidates: computeMakushitaUpperCandidates(careers),
  };
};

// ─── Markdown renderer ──────────────────────────────────────────────────

const renderMd = (diag, meta) => {
  const lines = [];

  lines.push('# NPC Relative Strength Diagnostics');
  lines.push('');
  lines.push('observed力士とNPC力士の相対強度診断。ロジック変更なし、診断専用。');
  lines.push('');
  lines.push('## Run Metadata');
  lines.push('');
  lines.push(`- generatedAt: ${meta.generatedAt}`);
  lines.push(`- sample: ${meta.sample}`);
  lines.push(`- populationKind: ${meta.populationKind}`);
  lines.push(`- populationPreset: ${meta.populationPreset}`);
  lines.push(`- 総キャリア数: ${diag.meta.careers}`);
  lines.push(`- 総bashoレコード数: ${diag.meta.totalBashoRecords}`);
  lines.push(`- 十両到達率: ${toPct(diag.meta.juryoReachRate)}`);
  lines.push(`- 幕内到達率: ${toPct(diag.meta.makuuchiReachRate)}`);
  lines.push('');

  // ─── A. Division別 ────────────────────────────────────────────────────
  lines.push('## A. Division別 相対強度');
  lines.push('');
  lines.push('> impliedPlayerAbility = SOS + logit(expectedWinRate) / 0.082 (モデルの logistic scale を使用)');
  lines.push('> SOS = strengthOfSchedule = NPC 対戦相手の ability 平均値 (bout単位)');
  lines.push('> ratingAbility = frame.runtime.actor.status.ratingState.ability (form反映前の base rating)');
  lines.push('');

  const DIV_ORDER = ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi'];
  lines.push('| division | basho数 | NPC SOS P50 | IPA P50 | rating P50 | gap P50 | ewRate | actualRate |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const div of DIV_ORDER) {
    const r = diag.divisionStrength[div];
    if (!r) continue;
    lines.push(`| ${div} | ${r.bashoCount} | ${toFixed(r.sosP50)} | ${toFixed(r.ipaP50)} | ${toFixed(r.ratingP50)} | ${toFixed(r.abilityGapP50)} | ${toPct(r.expectedWinRate)} | ${toPct(r.actualWinRate)} |`);
  }
  lines.push('');
  lines.push('> gap P50 = IPA P50 − SOS P50: 負値 = 力士の実効能力が相手より低い');
  lines.push('');

  // Makushita by rank band
  lines.push('### 幕下 rank band 別 相対強度');
  lines.push('');
  lines.push('| rankBand | basho数 | NPC SOS P50 | SOS P90 | IPA P50 | rating P50 | gap P50 | ewRate |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  const msbd = diag.divisionStrength._makushitaByBand ?? {};
  for (const band of ['upper5', 'upper', 'middle', 'lower']) {
    const r = msbd[band];
    if (!r) continue;
    lines.push(`| ${band} | ${r.bashoCount} | ${toFixed(r.sosP50)} | ${toFixed(r.sosP90)} | ${toFixed(r.ipaP50)} | ${toFixed(r.ratingP50)} | ${toFixed(r.abilityGapP50)} | ${toPct(r.expectedWinRate)} |`);
  }
  lines.push('');
  lines.push('> Makushita ability band: top=96 / bottom=78。SOS > 96 の場合、NPC 相手が幕下上限を超えている。');
  lines.push('');

  // ─── B. 幕下到達時の状態 ─────────────────────────────────────────────
  lines.push('## B. 幕下到達時の力士状態');
  lines.push('');
  const fme = diag.firstMakushitaEntries ?? [];
  const fmeN = fme.length;
  lines.push(`- 幕下到達キャリア数: ${fmeN}`);

  if (fmeN > 0) {
    const sosVals = fme.map((e) => e.firstMakushitaSos).filter(Number.isFinite);
    const ipaVals = fme.map((e) => e.firstMakushitaIpa).filter(Number.isFinite);
    const ratingVals = fme.map((e) => e.firstMakushitaRatingAbility).filter(Number.isFinite);
    const ewVals = fme.map((e) => e.firstMakushitaEwRate).filter(Number.isFinite);
    const careerBashoCounts = fme.map((e) => e.careerBashoAtFirstMakushita).filter(Number.isFinite);
    const prev3Vals = fme.map((e) => e.prev3WinRate).filter(Number.isFinite);
    const first3Vals = fme.map((e) => e.first3WinRate).filter(Number.isFinite);
    const first3SosVals = fme.map((e) => e.first3AvgSos).filter(Number.isFinite);
    const first3IpaVals = fme.map((e) => e.first3AvgIpa).filter(Number.isFinite);

    lines.push(`- キャリア basho数 P50 (初幕下到達時): ${toFixed(quantile(careerBashoCounts, 0.5), 0)}`);
    lines.push(`- 初幕下 NPC SOS P50: ${toFixed(quantile(sosVals, 0.5))}`);
    lines.push(`- 初幕下 IPA P50: ${toFixed(quantile(ipaVals, 0.5))}`);
    lines.push(`- 初幕下 rating P50: ${toFixed(quantile(ratingVals, 0.5))}`);
    lines.push(`- 初幕下 expectedWinRate P50: ${toPct(quantile(ewVals, 0.5))}`);
    lines.push(`- 前3場所 勝率 P50: ${toPct(quantile(prev3Vals, 0.5))}`);
    lines.push(`- 初幕下3場所 勝率 P50: ${toPct(quantile(first3Vals, 0.5))}`);
    lines.push(`- 初幕下3場所 SOS P50: ${toFixed(quantile(first3SosVals, 0.5))}`);
    lines.push(`- 初幕下3場所 IPA P50: ${toFixed(quantile(first3IpaVals, 0.5))}`);
    lines.push('');

    // By careerBand
    lines.push('### 幕下到達時の状態 (careerBand別)');
    lines.push('');
    lines.push('| careerBand | n | 初幕下SOS P50 | 初幕下IPA P50 | rating P50 | ewRate P50 | 初幕下3場所 勝率 | 十両到達率 |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
    const byBand = groupBy(fme, (e) => e.careerBand ?? 'unknown');
    for (const band of ['ELITE', 'STRONG', 'STANDARD', 'GRINDER', 'WASHOUT']) {
      const grp = byBand[band];
      if (!grp?.length) continue;
      const gSos = quantile(grp.map((e) => e.firstMakushitaSos).filter(Number.isFinite), 0.5);
      const gIpa = quantile(grp.map((e) => e.firstMakushitaIpa).filter(Number.isFinite), 0.5);
      const gRating = quantile(grp.map((e) => e.firstMakushitaRatingAbility).filter(Number.isFinite), 0.5);
      const gEw = quantile(grp.map((e) => e.firstMakushitaEwRate).filter(Number.isFinite), 0.5);
      const gF3 = mean(grp.map((e) => e.first3WinRate).filter(Number.isFinite));
      const gJuryo = pct(grp.filter((e) => e.reachedJuryo).length, grp.length);
      lines.push(`| ${band} | ${grp.length} | ${toFixed(gSos)} | ${toFixed(gIpa)} | ${toFixed(gRating)} | ${toPct(gEw)} | ${toPct(gF3)} | ${toPct(gJuryo)} |`);
    }
    lines.push('');

    // By aptitudeTier
    lines.push('### 幕下到達時の状態 (aptitudeTier別)');
    lines.push('');
    lines.push('| aptitudeTier | n | 初幕下SOS P50 | 初幕下IPA P50 | ewRate P50 | 初幕下3場所 勝率 | 十両到達率 |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    const byTier = groupBy(fme, (e) => e.aptitudeTier ?? 'unknown');
    for (const tier of ['S', 'A', 'B', 'C', 'D']) {
      const grp = byTier[tier];
      if (!grp?.length) continue;
      const gSos = quantile(grp.map((e) => e.firstMakushitaSos).filter(Number.isFinite), 0.5);
      const gIpa = quantile(grp.map((e) => e.firstMakushitaIpa).filter(Number.isFinite), 0.5);
      const gEw = quantile(grp.map((e) => e.firstMakushitaEwRate).filter(Number.isFinite), 0.5);
      const gF3 = mean(grp.map((e) => e.first3WinRate).filter(Number.isFinite));
      const gJuryo = pct(grp.filter((e) => e.reachedJuryo).length, grp.length);
      lines.push(`| ${tier} | ${grp.length} | ${toFixed(gSos)} | ${toFixed(gIpa)} | ${toPct(gEw)} | ${toPct(gF3)} | ${toPct(gJuryo)} |`);
    }
    lines.push('');
  }

  // ─── C. 幕下NPC強度分布 ─────────────────────────────────────────────
  lines.push('## C. NPC Ability 分布 (SOS ベース)');
  lines.push('');
  lines.push('> SOS = 全対戦相手 ability の平均。各 basho の SOS 分布を集計することで、各番付でのNPC能力水準を推定する。');
  lines.push('');
  lines.push('| division | basho数 | NPC SOS P10 | P50 | P90 | 平均 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const div of DIV_ORDER) {
    const r = diag.npcStrengthDist[div];
    if (!r) continue;
    lines.push(`| ${div} | ${r.bashoCount} | ${toFixed(r.sosP10)} | ${toFixed(r.sosP50)} | ${toFixed(r.sosP90)} | ${toFixed(r.sosMean)} |`);
  }
  lines.push('');
  lines.push('### 幕下 NPC ability (rank band別)');
  lines.push('');
  lines.push('| rankBand | n | SOS P10 | P50 | P90 | 平均 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  const msNpc = diag.npcStrengthDist['Makushita']?.byBand ?? {};
  for (const band of ['upper5', 'upper', 'middle', 'lower']) {
    const r = msNpc[band];
    if (!r) continue;
    lines.push(`| ${band} | ${r.n} | ${toFixed(r.p10)} | ${toFixed(r.p50)} | ${toFixed(r.p90)} | ${toFixed(r.mean)} |`);
  }
  lines.push('');
  lines.push('> 参考 DIVISION_ABILITY_BANDS Makushita: top=96 / bottom=78。Juryo: top=120 / bottom=90。');
  lines.push('> NPC factory Makushita power range: min=68 / max=104 (band上限 96 を超える NPC が存在しうる)。');
  lines.push('');

  // ─── D. careerBand別 幕下 ewRate ─────────────────────────────────────
  lines.push('## D. careerBand × aptitudeTier 別 幕下 expectedWinRate');
  lines.push('');
  const ct = diag.makushitaCrossTabs;

  lines.push('### careerBand別 幕下 expectedWinRate');
  lines.push('');
  lines.push('| careerBand | n | ewRate mean | ewRate P50 | IPA P50 | SOS P50 | actualWinRate | kachikoshi率 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const band of ['ELITE', 'STRONG', 'STANDARD', 'GRINDER', 'WASHOUT']) {
    const r = ct?.byCareerBand?.[band];
    if (!r) continue;
    lines.push(`| ${band} | ${r.n} | ${toPct(r.ewRateMean)} | ${toPct(r.ewRateP50)} | ${toFixed(r.ipaP50)} | ${toFixed(r.sosP50)} | ${toPct(r.actualWinRate)} | ${toPct(r.kachikoshiRate)} |`);

    // By tier within band
    const byTier = r._byTier ?? {};
    for (const tier of ['S', 'A', 'B', 'C', 'D']) {
      const tr = byTier[tier];
      if (!tr) continue;
      lines.push(`| ${band}×${tier} | ${tr.n} | ${toPct(tr.ewRateMean)} | ${toPct(tr.ewRateP50)} | ${toFixed(tr.ipaP50)} | ${toFixed(tr.sosP50)} | ${toPct(tr.actualWinRate)} | ${toPct(tr.kachikoshiRate)} |`);
    }
  }
  lines.push('');

  lines.push('### entryPath別 幕下 expectedWinRate');
  lines.push('');
  lines.push('| entryPath | n | ewRate mean | IPA P50 | SOS P50 | kachikoshi率 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  const epOrder = Object.keys(ct?.byEntryPath ?? {}).sort();
  for (const ep of epOrder) {
    const r = ct?.byEntryPath?.[ep];
    if (!r) continue;
    lines.push(`| ${ep} | ${r.n} | ${toPct(r.ewRateMean)} | ${toFixed(r.ipaP50)} | ${toFixed(r.sosP50)} | ${toPct(r.kachikoshiRate)} |`);
  }
  lines.push('');

  lines.push('### growthType別 幕下 expectedWinRate');
  lines.push('');
  lines.push('| growthType | n | ewRate mean | IPA P50 | SOS P50 | kachikoshi率 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  const gtOrder = Object.keys(ct?.byGrowthType ?? {}).sort();
  for (const gt of gtOrder) {
    const r = ct?.byGrowthType?.[gt];
    if (!r) continue;
    lines.push(`| ${gt} | ${r.n} | ${toPct(r.ewRateMean)} | ${toFixed(r.ipaP50)} | ${toFixed(r.sosP50)} | ${toPct(r.kachikoshiRate)} |`);
  }
  lines.push('');

  lines.push('### styleRelevantCeiling bucket別 幕下 expectedWinRate');
  lines.push('');
  lines.push('| ceilingBucket | n | ewRate mean | IPA P50 | kachikoshi率 |');
  lines.push('|---|---:|---:|---:|---:|');
  const cbOrder = ['<55', '55-59', '60-64', '65-69', '70-74', '75+', 'unknown'];
  for (const cb of cbOrder) {
    const r = ct?.byCeilingBucket?.[cb];
    if (!r) continue;
    lines.push(`| ${cb} | ${r.n} | ${toPct(r.ewRateMean)} | ${toFixed(r.ipaP50)} | ${toPct(r.kachikoshiRate)} |`);
  }
  lines.push('');

  // ─── E. 幕下上位候補の強度 ───────────────────────────────────────────
  lines.push('## E. 幕下上位候補 (rank 1-5) の強度');
  lines.push('');
  const muc = diag.makushitaUpperCandidates;
  if (muc) {
    lines.push(`- 幕下上位到達キャリア数: ${muc.candidateCount}`);
    lines.push(`- NPC SOS P50 (median across careers): ${toFixed(muc.sosP50)}`);
    lines.push(`- IPA P50: ${toFixed(muc.ipaP50)}`);
    lines.push(`- IPA P10/P90: ${toFixed(muc.ipaP10)} / ${toFixed(muc.ipaP90)}`);
    lines.push(`- rating ability P50: ${toFixed(muc.ratingP50)}`);
    lines.push(`- expectedWinRate 平均: ${toPct(muc.ewRateMean)}`);
    lines.push(`- 5勝以上率 平均: ${toPct(muc.fiveWinsPlusRate)}`);
    lines.push(`- 十両昇進率 平均: ${toPct(muc.juryoPromotionRate)}`);
    lines.push('');
    lines.push('### 幕下上位候補 careerBand別');
    lines.push('');
    lines.push('| careerBand | n | SOS P50 | IPA P50 | ewRate | 5勝+率 | 昇進率 |');
    lines.push('|---|---:|---:|---:|---:|---:|---:|');
    for (const [band, r] of Object.entries(muc.byCareerBand ?? {})) {
      lines.push(`| ${band} | ${r.n} | ${toFixed(r.sosP50)} | ${toFixed(r.ipaP50)} | ${toPct(r.ewRateMean)} | ${toPct(r.fiveWinsPlusRate)} | ${toPct(r.juryoPromotionRate)} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

// ─── Main ────────────────────────────────────────────────────────────────

const main = async () => {
  const careers = await runParallel(RUNS);

  console.log('Computing NPC relative strength diagnostics...');
  const diag = computeAll(careers);

  const metaInfo = {
    generatedAt: new Date().toISOString(),
    sample: RUNS,
    populationKind: POPULATION_KIND,
    populationPreset: POPULATION_PRESET,
  };

  const md = renderMd(diag, metaInfo);
  const json = JSON.stringify({ meta: metaInfo, ...diag }, null, 2);

  writeFile(REPORT_MD, md);
  writeFile(REPORT_JSON, json);
  console.log(`NPC strength diagnostics written: ${REPORT_MD} / ${REPORT_JSON}`);
};

main().catch((error) => {
  console.error('NPC strength report error:', error);
  process.exit(1);
});
