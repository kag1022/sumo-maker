// Makushita-Juryo Exchange Strength Diagnostics
// 幕下上位と十両下位の入れ替え戦構造を考慮した相対強度の診断。
// crossDivisionBoutCount によるクロスDiv対戦の有無と、rankBand別SOS異常を診断する。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_PATH = require.resolve('./_shared/npc_strength_worker.cjs');

const RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 400);
const POPULATION_KIND = process.env.REALISM_POPULATION_KIND || 'historical-like-career';
const POPULATION_PRESET = process.env.REALISM_POPULATION_PRESET || 'historical-like-v2-high';

const REPORT_MD = path.join('docs', 'balance', 'makushita-juryo-exchange-diagnostics.md');
const REPORT_JSON = path.join('.tmp', 'makushita-juryo-exchange-diagnostics.json');

// Makushita ability band ceiling and Juryo lower threshold
const MAKUSHITA_BAND_CEILING = 96;
const JURYO_LEVEL_THRESHOLD = 100; // SOS > 100 = clearly Juryo-class opponents

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
            console.log(`exchange diagnostics: ${completed}/${runs}`);
          }
          launchNext();
          maybeFinish();
        });
      }
    };

    console.log(`Starting Makushita-Juryo exchange diagnostics pool (${maxWorkers} workers, ${runs} runs)...`);
    launchNext();
  });

// ─── Helpers ───────────────────────────────────────────────────────────────

const flattenBashoRecords = (careers) => {
  const all = [];
  for (const career of careers) {
    const meta = {
      seed: career.seed,
      aptitudeTier: career.aptitudeTier,
      careerBand: career.careerBand,
      growthType: career.growthType,
      entryPath: career.entryPath,
      reachedJuryo: career.reachedJuryo,
    };
    for (const b of (career.bashoRecords ?? [])) {
      all.push({ ...b, ...meta });
    }
  }
  return all;
};

const bandStats = (records) => {
  const withBouts = records.filter((r) => r.totalBouts > 0);
  if (!withBouts.length) return null;
  const sosVals = withBouts.map((r) => r.strengthOfSchedule).filter(Number.isFinite);
  const ewVals = withBouts.map((r) => r.expectedWinRate).filter(Number.isFinite);
  const cdCounts = withBouts.map((r) => r.crossDivisionBoutCount).filter((v) => v != null);
  const totalWins = withBouts.reduce((s, r) => s + r.wins, 0);
  const totalBouts = withBouts.reduce((s, r) => s + r.totalBouts, 0);

  const highSos96 = withBouts.filter((r) => (r.strengthOfSchedule ?? 0) > MAKUSHITA_BAND_CEILING).length;
  const highSos100 = withBouts.filter((r) => (r.strengthOfSchedule ?? 0) > JURYO_LEVEL_THRESHOLD).length;
  const kachikoshi = withBouts.filter((r) => r.wins >= 4).length;
  const fiveWins = withBouts.filter((r) => r.wins >= 5).length;
  const crossDivBashos = cdCounts.filter((v) => v > 0).length;
  const crossDivBouts = cdCounts.reduce((s, v) => s + v, 0);

  return {
    n: withBouts.length,
    totalBouts,
    sosP10: quantile(sosVals, 0.1),
    sosP50: quantile(sosVals, 0.5),
    sosP90: quantile(sosVals, 0.9),
    sosMean: mean(sosVals),
    highSosRate96: pct(highSos96, withBouts.length),
    highSosRate100: pct(highSos100, withBouts.length),
    ewRateMean: mean(ewVals),
    ewRateP50: quantile(ewVals, 0.5),
    actualWinRate: pct(totalWins, totalBouts),
    kachikoshiRate: pct(kachikoshi, withBouts.length),
    fiveWinsPlusRate: pct(fiveWins, withBouts.length),
    crossDivBashoRate: pct(crossDivBashos, cdCounts.length > 0 ? cdCounts.length : 1),
    crossDivBoutRate: cdCounts.length > 0 ? pct(crossDivBouts, withBouts.reduce((s, r) => s + r.totalBouts, 0)) : null,
    crossDivBoutCountP50: cdCounts.length > 0 ? quantile(cdCounts, 0.5) : null,
    crossDivBoutCountMax: cdCounts.length > 0 ? Math.max(...cdCounts) : null,
  };
};

// ─── 1. 幕下上位 vs クロスディビジョン対戦診断 ──────────────────────────

const computeUpper5CrossDivDiag = (careers) => {
  const upper5Bashos = [];

  for (const career of careers) {
    const records = career.bashoRecords ?? [];
    for (let i = 0; i < records.length; i++) {
      const b = records[i];
      if (b.division !== 'Makushita' || (b.rankNumber ?? 99) > 5 || b.totalBouts < 1) continue;
      const nextB = records[i + 1];
      const promotedToJuryo = nextB?.division === 'Juryo' || nextB?.division === 'Makuuchi';
      upper5Bashos.push({ ...b, promotedToJuryo, careerBand: career.careerBand });
    }
  }

  if (!upper5Bashos.length) return null;

  // Split by whether cross-div bouts occurred
  const hasCrossDiv = upper5Bashos.filter((b) => (b.crossDivisionBoutCount ?? 0) > 0);
  const noCrossDiv = upper5Bashos.filter((b) => (b.crossDivisionBoutCount ?? 0) === 0);

  // Distribution of crossDivisionBoutCount values
  const cdCounts = upper5Bashos.map((b) => b.crossDivisionBoutCount ?? 0);
  const cdDist = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  for (const v of cdCounts) {
    if (v === 0) cdDist[0]++;
    else if (v === 1) cdDist[1]++;
    else if (v === 2) cdDist[2]++;
    else cdDist['3+']++;
  }

  const sosWith = hasCrossDiv.map((b) => b.strengthOfSchedule).filter(Number.isFinite);
  const sosWithout = noCrossDiv.map((b) => b.strengthOfSchedule).filter(Number.isFinite);
  const fiveWinsWithPromo = upper5Bashos.filter((b) => b.wins >= 5 && b.promotedToJuryo).length;
  const fiveWinsNoPromo = upper5Bashos.filter((b) => b.wins >= 5 && !b.promotedToJuryo).length;
  const fiveWinsTotal = upper5Bashos.filter((b) => b.wins >= 5).length;

  return {
    totalBashos: upper5Bashos.length,
    withCrossDiv: hasCrossDiv.length,
    withoutCrossDiv: noCrossDiv.length,
    crossDivBashoRate: pct(hasCrossDiv.length, upper5Bashos.length),
    cdCountDist: cdDist,
    cdCountP50: quantile(cdCounts, 0.5),
    cdCountP90: quantile(cdCounts, 0.9),
    cdCountMax: Math.max(...cdCounts),
    // SOS comparison
    sosAll: {
      p50: quantile(upper5Bashos.map((b) => b.strengthOfSchedule).filter(Number.isFinite), 0.5),
      p90: quantile(upper5Bashos.map((b) => b.strengthOfSchedule).filter(Number.isFinite), 0.9),
    },
    sosWith: {
      p50: quantile(sosWith, 0.5),
      p90: quantile(sosWith, 0.9),
    },
    sosWithout: {
      p50: quantile(sosWithout, 0.5),
      p90: quantile(sosWithout, 0.9),
    },
    // Win stats for bashos with/without cross-div bouts
    ewRateMeanWithCrossDiv: mean(hasCrossDiv.map((b) => b.expectedWinRate).filter(Number.isFinite)),
    ewRateMeanNoCrossDiv: mean(noCrossDiv.map((b) => b.expectedWinRate).filter(Number.isFinite)),
    promoRateAll: pct(upper5Bashos.filter((b) => b.promotedToJuryo).length, upper5Bashos.length),
    promoRateAfterFiveWins: pct(fiveWinsWithPromo, fiveWinsTotal),
    missedPromoRate: pct(fiveWinsNoPromo, fiveWinsTotal),
    kachikoshiRate: pct(upper5Bashos.filter((b) => b.wins >= 4).length, upper5Bashos.length),
    fiveWinsPlusRate: pct(fiveWinsTotal, upper5Bashos.length),
  };
};

// ─── 2. rankBand別 詳細診断 ───────────────────────────────────────────────

const computeRankBandStrengthDiag = (allBasho) => {
  const msRecords = allBasho.filter((b) => b.division === 'Makushita' && b.totalBouts > 0);
  const result = {};
  for (const band of ['upper5', 'upper', 'middle', 'lower']) {
    const recs = msRecords.filter((b) => b.rankBand === band);
    result[band] = bandStats(recs);
  }
  return result;
};

// ─── 3. 幕下中下位の異常検出 ─────────────────────────────────────────────

const computeMiddleLowerAnomalies = (allBasho) => {
  const middle = allBasho.filter(
    (b) => b.division === 'Makushita' && b.rankBand === 'middle' && b.totalBouts > 0,
  );
  const lower = allBasho.filter(
    (b) => b.division === 'Makushita' && b.rankBand === 'lower' && b.totalBouts > 0,
  );

  const anomalyStats = (records, label) => {
    if (!records.length) return null;
    const aboveCeiling = records.filter((r) => (r.strengthOfSchedule ?? 0) > MAKUSHITA_BAND_CEILING);
    const juryoLevel = records.filter((r) => (r.strengthOfSchedule ?? 0) > JURYO_LEVEL_THRESHOLD);
    const cdNonZero = records.filter((r) => (r.crossDivisionBoutCount ?? 0) > 0);
    const cdCounts = records.map((r) => r.crossDivisionBoutCount ?? 0);

    // Among Juryo-level SOS bashos: win rate and ewRate
    const jlEwVals = juryoLevel.map((r) => r.expectedWinRate).filter(Number.isFinite);
    const jlWins = juryoLevel.reduce((s, r) => s + r.wins, 0);
    const jlBouts = juryoLevel.reduce((s, r) => s + r.totalBouts, 0);

    return {
      label,
      n: records.length,
      aboveCeilingCount: aboveCeiling.length,
      aboveCeilingRate: pct(aboveCeiling.length, records.length),
      juryoLevelCount: juryoLevel.length,
      juryoLevelRate: pct(juryoLevel.length, records.length),
      crossDivNonZeroCount: cdNonZero.length,
      crossDivNonZeroRate: pct(cdNonZero.length, records.length),
      crossDivCountMax: Math.max(...cdCounts, 0),
      // Impact on players with high-SOS opponents
      juryoLevelAvgEwRate: mean(jlEwVals),
      juryoLevelActualWinRate: jlBouts > 0 ? pct(jlWins, jlBouts) : null,
      juryoLevelKachikoshiRate: pct(juryoLevel.filter((r) => r.wins >= 4).length, juryoLevel.length),
    };
  };

  return {
    middle: anomalyStats(middle, 'middle'),
    lower: anomalyStats(lower, 'lower'),
  };
};

// ─── 4. 十両下位 (rank 8-14) 診断 ────────────────────────────────────────

const computeJuryoLowerDiag = (careers) => {
  const juryoLower = [];

  for (const career of careers) {
    const records = career.bashoRecords ?? [];
    for (let i = 0; i < records.length; i++) {
      const b = records[i];
      if (b.division !== 'Juryo' || (b.rankNumber ?? 0) < 8) continue;
      if (b.totalBouts < 14) continue; // require full 15-bout basho
      const nextB = records[i + 1];
      const demotedToMakushita = nextB?.division === 'Makushita';
      const nextDivision = nextB?.division ?? null;
      juryoLower.push({
        ...b,
        demotedToMakushita,
        nextDivision,
        careerBand: career.careerBand,
      });
    }
  }

  if (!juryoLower.length) return null;

  const n = juryoLower.length;
  const kachikoshi = juryoLower.filter((b) => b.wins >= 8).length;
  const lowWins5 = juryoLower.filter((b) => b.wins <= 5).length;
  const lowWins7 = juryoLower.filter((b) => b.wins <= 7).length;
  const demoted = juryoLower.filter((b) => b.demotedToMakushita).length;
  const cdCounts = juryoLower.map((b) => b.crossDivisionBoutCount ?? 0);
  const crossDivBashos = cdCounts.filter((v) => v > 0).length;

  // Breakdown by wins
  const winsDist = {};
  for (const b of juryoLower) {
    const key = b.wins <= 4 ? '≤4' : String(b.wins);
    winsDist[key] = (winsDist[key] ?? 0) + 1;
  }

  // Demotion rate by win count bracket
  const wins5Bashos = juryoLower.filter((b) => b.wins === 5);
  const wins6Bashos = juryoLower.filter((b) => b.wins === 6);
  const wins7Bashos = juryoLower.filter((b) => b.wins === 7);
  const wins8Bashos = juryoLower.filter((b) => b.wins === 8);

  return {
    n,
    kachikoshiRate: pct(kachikoshi, n),
    lowWins5Rate: pct(lowWins5, n),
    lowWins7Rate: pct(lowWins7, n),
    demotionRate: pct(demoted, n),
    crossDivBashoRate: pct(crossDivBashos, n),
    crossDivBoutCountP50: quantile(cdCounts, 0.5),
    crossDivBoutCountP90: quantile(cdCounts, 0.9),
    crossDivBoutCountMax: Math.max(...cdCounts, 0),
    survivedWithLowWins: pct(wins5Bashos.filter((b) => !b.demotedToMakushita).length, wins5Bashos.length || 1),
    // Demotion rate by bracket
    demotionByWins: {
      '5': { n: wins5Bashos.length, demotionRate: pct(wins5Bashos.filter((b) => b.demotedToMakushita).length, wins5Bashos.length || 1) },
      '6': { n: wins6Bashos.length, demotionRate: pct(wins6Bashos.filter((b) => b.demotedToMakushita).length, wins6Bashos.length || 1) },
      '7': { n: wins7Bashos.length, demotionRate: pct(wins7Bashos.filter((b) => b.demotedToMakushita).length, wins7Bashos.length || 1) },
      '8': { n: wins8Bashos.length, demotionRate: pct(wins8Bashos.filter((b) => b.demotedToMakushita).length, wins8Bashos.length || 1) },
    },
    winsDist,
  };
};

// ─── 5. 入れ替え収支診断 ──────────────────────────────────────────────────

const computeExchangeBalance = (careers) => {
  let totalPromotions = 0;      // Makushita upper5 → Juryo
  let totalDemotions = 0;       // Juryo → Makushita
  let fiveWinsInUpper5 = 0;     // upper5 with 5+ wins (promotion-eligible)
  let fiveWinsPromoted = 0;     // upper5 5+ wins → promoted
  let fiveWinsNotPromoted = 0;  // upper5 5+ wins → NOT promoted (見送り)
  let fourWinsPromoted = 0;     // upper5 4-3 → promoted
  let juryoDemotedCount = 0;    // Juryo losses that led to demotion
  let juryoSurvivedLowWins = 0; // Juryo ≤7 wins but survived

  for (const career of careers) {
    const records = career.bashoRecords ?? [];
    for (let i = 0; i < records.length; i++) {
      const b = records[i];
      const nextB = records[i + 1];
      if (!nextB) continue;

      // Makushita upper5 promotions
      if (b.division === 'Makushita' && (b.rankNumber ?? 99) <= 5 && b.totalBouts >= 7) {
        const promoted = nextB.division === 'Juryo' || nextB.division === 'Makuuchi';
        if (b.wins >= 5) {
          fiveWinsInUpper5++;
          if (promoted) fiveWinsPromoted++;
          else fiveWinsNotPromoted++;
        }
        if (b.wins === 4 && promoted) fourWinsPromoted++;
        if (promoted) totalPromotions++;
      }

      // Juryo demotions
      if (b.division === 'Juryo' && b.totalBouts >= 14) {
        if (nextB.division === 'Makushita') {
          totalDemotions++;
          juryoDemotedCount++;
        } else if (b.wins <= 7) {
          juryoSurvivedLowWins++;
        }
      }
    }
  }

  return {
    totalPromotions,
    totalDemotions,
    balanceDiff: totalPromotions - totalDemotions,
    fiveWinsInUpper5,
    fiveWinsPromoted,
    fiveWinsNotPromoted,
    fiveWinsPromoRate: pct(fiveWinsPromoted, fiveWinsInUpper5),
    missedPromoRate: pct(fiveWinsNotPromoted, fiveWinsInUpper5),
    fourWinsPromoted,
    juryoSurvivedLowWins,
    avgPromotionsPerCareer: pct(totalPromotions, careers.length),
    avgDemotionsPerCareer: pct(totalDemotions, careers.length),
  };
};

// ─── 6. NPC power range 静的分析 ─────────────────────────────────────────

const NPC_POWER_RANGES = {
  Makuuchi: { min: 100, max: 165 },
  Juryo: { min: 78, max: 130 },
  Makushita: { min: 68, max: 104 },
  Sandanme: { min: 56, max: 92 },
  Jonidan: { min: 45, max: 82 },
  Jonokuchi: { min: 35, max: 72 },
  Maezumo: { min: 28, max: 60 },
};

const DIVISION_ABILITY_BANDS = {
  Makuuchi: { top: 156, bottom: 112 },
  Juryo: { top: 120, bottom: 90 },
  Makushita: { top: 96, bottom: 78 },
  Sandanme: { top: 80, bottom: 64 },
  Jonidan: { top: 68, bottom: 54 },
  Jonokuchi: { top: 58, bottom: 46 },
};

// Ability formula can exceed range.max:
// ability = basePower*(0.82 + boutFactor*0.08) + seed.basePower*0.12 + noise + growthBias*5.2 + abilityBias*0.6
// boutFactor can be ~1.5 → 104*(0.82 + 0.12) + 100*0.12 + growthBias*5.2 ≈ 111+
// Softening clamp: [range.min, range.max + 16] → Makushita max actual = 120
const SOFTENING_BUFFER = 16; // current uniform buffer in factory.ts (all divisions)

const computeNpcRangeAnalysis = () => {
  const divisions = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
  return divisions.map((div) => {
    const range = NPC_POWER_RANGES[div];
    const band = DIVISION_ABILITY_BANDS[div];
    const gapRangeMaxToBandTop = range ? range.max - (band?.top ?? 0) : null;
    const maxPossibleAbility = range ? range.max + SOFTENING_BUFFER : null;
    return {
      division: div,
      rangeMin: range?.min,
      rangeMax: range?.max,
      bandTop: band?.top,
      bandBottom: band?.bottom,
      gapRangeMaxToBandTop,
      maxPossibleAbility,
    };
  });
};

// ─── compute all ─────────────────────────────────────────────────────────

const computeAll = (careers) => {
  const allBasho = flattenBashoRecords(careers);

  return {
    meta: {
      careers: careers.length,
      totalBashoRecords: allBasho.length,
      juryoReachRate: pct(careers.filter((c) => c.reachedJuryo).length, careers.length),
    },
    upper5CrossDivDiag: computeUpper5CrossDivDiag(careers),
    rankBandStrength: computeRankBandStrengthDiag(allBasho),
    middleLowerAnomalies: computeMiddleLowerAnomalies(allBasho),
    juryoLowerDiag: computeJuryoLowerDiag(careers),
    exchangeBalance: computeExchangeBalance(careers),
    npcRangeAnalysis: computeNpcRangeAnalysis(),
  };
};

// ─── Markdown renderer ──────────────────────────────────────────────────

const renderMd = (diag, meta) => {
  const lines = [];

  lines.push('# Makushita-Juryo Exchange Strength Diagnostics');
  lines.push('');
  lines.push('幕下上位と十両下位の入れ替え戦構造を考慮した相対強度診断。');
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
  lines.push('');

  // ─── 1. 幕下上位 vs クロスディビジョン対戦 ────────────────────────────
  lines.push('## 1. 幕下上位 vs クロスディビジョン対戦診断');
  lines.push('');
  lines.push('> crossDivisionBoutCount = SimulationDiagnostics.crossDivisionBoutCount per basho');
  lines.push('> SOS = 全対戦相手 ability の平均。クロス対戦時は十両NPCが含まれるためSOSが高くなる。');
  lines.push('');

  const u5 = diag.upper5CrossDivDiag;
  if (u5) {
    lines.push(`- 幕下上位5枚目以内 basho数: ${u5.totalBashos}`);
    lines.push(`- クロスDiv対戦あり basho: ${u5.withCrossDiv} (${toPct(u5.crossDivBashoRate)})`);
    lines.push(`- クロスDiv対戦なし basho: ${u5.withoutCrossDiv}`);
    lines.push(`- crossDivisionBoutCount P50/P90/Max: ${u5.cdCountP50} / ${u5.cdCountP90} / ${u5.cdCountMax}`);
    lines.push('');

    lines.push('### crossDivisionBoutCount 分布');
    lines.push('');
    lines.push('| crossDivBouts | basho数 | 割合 |');
    lines.push('|---|---:|---:|');
    for (const [k, v] of Object.entries(u5.cdCountDist)) {
      lines.push(`| ${k} | ${v} | ${toPct(pct(v, u5.totalBashos))} |`);
    }
    lines.push('');

    lines.push('### クロスDiv有無別 SOS・勝率');
    lines.push('');
    lines.push('| 区分 | SOS P50 | SOS P90 | ewRate |');
    lines.push('|---|---:|---:|---:|');
    lines.push(`| クロスDiv対戦あり (n=${u5.withCrossDiv}) | ${toFixed(u5.sosWith?.p50)} | ${toFixed(u5.sosWith?.p90)} | ${toPct(u5.ewRateMeanWithCrossDiv)} |`);
    lines.push(`| クロスDiv対戦なし (n=${u5.withoutCrossDiv}) | ${toFixed(u5.sosWithout?.p50)} | ${toFixed(u5.sosWithout?.p90)} | ${toPct(u5.ewRateMeanNoCrossDiv)} |`);
    lines.push(`| 全体 | ${toFixed(u5.sosAll?.p50)} | ${toFixed(u5.sosAll?.p90)} | n/a |`);
    lines.push('');

    lines.push('### 5勝以上時の昇進処理');
    lines.push('');
    lines.push(`- kachikoshi率: ${toPct(u5.kachikoshiRate)}`);
    lines.push(`- 5勝以上率: ${toPct(u5.fiveWinsPlusRate)}`);
    lines.push(`- 5勝以上時の昇進率: ${toPct(u5.promoRateAfterFiveWins)}`);
    lines.push(`- 5勝以上なのに昇進しなかった率 (見送り): ${toPct(u5.missedPromoRate)}`);
    lines.push(`- 全体昇進率: ${toPct(u5.promoRateAll)}`);
    lines.push('');
  } else {
    lines.push('(幕下上位到達キャリアなし)');
    lines.push('');
  }

  // ─── 2. rankBand別 詳細診断 ─────────────────────────────────────────
  lines.push('## 2. rankBand別 NPC強度診断');
  lines.push('');
  lines.push(`> highSosRate_96: SOS > ${MAKUSHITA_BAND_CEILING} (幕下band ceiling超過) の basho率`);
  lines.push(`> highSosRate_100: SOS > ${JURYO_LEVEL_THRESHOLD} (十両下限相当) の basho率`);
  lines.push('> crossDivBashoRate: crossDivisionBoutCount > 0 の basho率');
  lines.push('');
  lines.push('| rankBand | n | SOS P10 | P50 | P90 | SOS>96率 | SOS>100率 | CrossDiv率 | ewRate | kachikoshi | 5勝+率 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');

  const rb = diag.rankBandStrength;
  for (const band of ['upper5', 'upper', 'middle', 'lower']) {
    const r = rb[band];
    if (!r) continue;
    lines.push(`| ${band} | ${r.n} | ${toFixed(r.sosP10)} | ${toFixed(r.sosP50)} | ${toFixed(r.sosP90)} | ${toPct(r.highSosRate96)} | ${toPct(r.highSosRate100)} | ${toPct(r.crossDivBashoRate)} | ${toPct(r.ewRateMean)} | ${toPct(r.kachikoshiRate)} | ${toPct(r.fiveWinsPlusRate)} |`);
  }
  lines.push('');
  lines.push('> Makushita band: top=96 / bottom=78。Juryo band: top=120 / bottom=90。');
  lines.push('');

  // ─── 3. 幕下中下位の異常検出 ────────────────────────────────────────
  lines.push('## 3. 幕下中下位の異常検出');
  lines.push('');
  lines.push('> middle = rank 16-30、lower = rank 31+');
  lines.push('> 中下位に十両級 (SOS > 100) の対戦相手が混入していないか確認する。');
  lines.push('');

  const ml = diag.middleLowerAnomalies;
  if (ml) {
    for (const key of ['middle', 'lower']) {
      const r = ml[key];
      if (!r) continue;
      lines.push(`### 幕下${key === 'middle' ? '中位 (rank 16-30)' : '下位 (rank 31+)'}`);
      lines.push('');
      lines.push(`- basho数: ${r.n}`);
      lines.push(`- SOS > 96 (band ceiling超過) basho: ${r.aboveCeilingCount} (${toPct(r.aboveCeilingRate)})`);
      lines.push(`- SOS > 100 (十両下限相当) basho: ${r.juryoLevelCount} (${toPct(r.juryoLevelRate)})`);
      lines.push(`- crossDivisionBoutCount > 0 basho: ${r.crossDivNonZeroCount} (${toPct(r.crossDivNonZeroRate)})`);
      lines.push(`- crossDivisionBoutCount 最大値: ${r.crossDivCountMax}`);
      if (r.juryoLevelCount > 0) {
        lines.push(`- 十両級SOS basho での ewRate: ${toPct(r.juryoLevelAvgEwRate)}`);
        lines.push(`- 十両級SOS basho での 実績勝率: ${toPct(r.juryoLevelActualWinRate)}`);
        lines.push(`- 十両級SOS basho での kachikoshi率: ${toPct(r.juryoLevelKachikoshiRate)}`);
      }
      lines.push('');
    }
  }

  // ─── 4. 十両下位診断 ─────────────────────────────────────────────────
  lines.push('## 4. 十両下位 (rank 8-14) 診断');
  lines.push('');

  const jl = diag.juryoLowerDiag;
  if (jl) {
    lines.push(`- basho数 (15番完走): ${jl.n}`);
    lines.push(`- kachikoshi率 (8勝+): ${toPct(jl.kachikoshiRate)}`);
    lines.push(`- 5勝以下率: ${toPct(jl.lowWins5Rate)}`);
    lines.push(`- 7勝以下 (負け越し): ${toPct(jl.lowWins7Rate)}`);
    lines.push(`- 幕下陥落率: ${toPct(jl.demotionRate)}`);
    lines.push(`- クロスDiv対戦あり basho率: ${toPct(jl.crossDivBashoRate)}`);
    lines.push(`- crossDivisionBoutCount P50/P90/Max: ${jl.crossDivBoutCountP50} / ${jl.crossDivBoutCountP90} / ${jl.crossDivBoutCountMax}`);
    lines.push(`- 5勝で幕下残留 (生き残り)率: ${toPct(jl.survivedWithLowWins)}`);
    lines.push('');

    lines.push('### 勝ち星別 幕下降下率');
    lines.push('');
    lines.push('| 勝ち星 | basho数 | 幕下降下率 |');
    lines.push('|---|---:|---:|');
    for (const [k, v] of Object.entries(jl.demotionByWins ?? {})) {
      lines.push(`| ${k}勝 | ${v.n} | ${toPct(v.demotionRate)} |`);
    }
    lines.push('');

    lines.push('### 勝ち星分布');
    lines.push('');
    lines.push('| 勝ち星 | basho数 |');
    lines.push('|---|---:|');
    const winsOrder = ['≤4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'];
    for (const k of winsOrder) {
      if (jl.winsDist[k]) lines.push(`| ${k} | ${jl.winsDist[k]} |`);
    }
    lines.push('');
  } else {
    lines.push('(十両下位データなし)');
    lines.push('');
  }

  // ─── 5. 入れ替え収支診断 ──────────────────────────────────────────────
  lines.push('## 5. 入れ替え収支診断');
  lines.push('');

  const eb = diag.exchangeBalance;
  if (eb) {
    lines.push(`- 幕下→十両 昇進総数: ${eb.totalPromotions}`);
    lines.push(`- 十両→幕下 降下総数: ${eb.totalDemotions}`);
    lines.push(`- 収支差 (昇進 - 降下): ${eb.balanceDiff}`);
    lines.push(`- 1キャリア平均 昇進回数: ${toFixed(eb.avgPromotionsPerCareer, 3)}`);
    lines.push(`- 1キャリア平均 降下回数: ${toFixed(eb.avgDemotionsPerCareer, 3)}`);
    lines.push('');
    lines.push('### 幕下上位5枚目 5勝以上時の昇進処理');
    lines.push('');
    lines.push(`- 幕下上位5枚目で5勝以上の basho数: ${eb.fiveWinsInUpper5}`);
    lines.push(`- そのうち昇進: ${eb.fiveWinsPromoted} (${toPct(eb.fiveWinsPromoRate)})`);
    lines.push(`- そのうち見送り (昇進せず): ${eb.fiveWinsNotPromoted} (${toPct(eb.missedPromoRate)})`);
    lines.push(`- 4-3 で昇進: ${eb.fourWinsPromoted}`);
    lines.push(`- 十両で7勝以下だったが残留: ${eb.juryoSurvivedLowWins}`);
    lines.push('');
  }

  // ─── 6. NPC power range 静的分析 ─────────────────────────────────────
  lines.push('## 6. NPC生成レンジ診断 (静的分析)');
  lines.push('');
  lines.push('> NPC ability 計算式:');
  lines.push('> `ability = clamp(basePower*(0.82 + boutFactor*0.08) + seed.basePower*0.12 + noise + growthBias*5.2 + abilityBias*0.6, range.min, range.max)`');
  lines.push('> **修正済 (2026-05-07)**: ability 計算式の結果を range.max にクランプ。修正前は ability が range.max を超えることがあった。');
  lines.push('> softening: `clamp(anchor*0.72 + ability*0.28, range.min, range.max + 16)`');
  lines.push('> → 修正後: ability ≤ range.max のため softening 上限 range.max + 16 は実質到達しない。');
  lines.push('');
  lines.push('| division | range min | range max | band top | gap(max-top) | 旧実効上限(max+16) |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const r of diag.npcRangeAnalysis) {
    lines.push(`| ${r.division} | ${r.rangeMin ?? 'n/a'} | ${r.rangeMax ?? 'n/a'} | ${r.bandTop ?? 'n/a'} | ${r.gapRangeMaxToBandTop ?? 'n/a'} | ${r.maxPossibleAbility ?? 'n/a'} |`);
  }
  lines.push('');
  lines.push('### 修正前の問題');
  lines.push('');
  lines.push('1. 修正前は `ability` 計算式が `range.max` を超えることがあった。');
  lines.push('   - 最大例: `basePower=104, boutFactor=1.5, seed.basePower=100, growthBias=0.3`');
  lines.push('   - → `ability ≈ 111` → softening 後も ~111 で幕下NPC が十両下限水準に');
  lines.push('2. 修正後: `ability = clamp(..., range.min, range.max)` で最大 104 にクランプ。');
  lines.push('3. 中位での SOS P90: 102.03 → 101.34 に改善 (1000サンプル比較)。');
  lines.push('4. 下位での SOS P90: 94.44 → 94.00 に改善 (band ceiling 96 以下に維持)。');
  lines.push('');
  lines.push('### ⚠️ crossDivisionBoutCount の解釈注意');
  lines.push('');
  lines.push('`crossDivisionBoutCount` は **世界レベルのクロスDiv対戦数** (幕下分全体) であり、');
  lines.push('当該observed力士が個人的にクロスDiv対戦をした数ではない。');
  lines.push('- 全Makushita rankBand で 100% (25-30 件/場所) → 幕下全体で毎場所 25-30 組のクロスDiv対戦が行われている');
  lines.push('- 十両側の observed 力士では 0% → クロスDiv統計は下位部門側のフレームに格納される');
  lines.push('- 個人レベルでのクロスDiv診断には、対戦別相手Division追跡が必要 (現在未実装)。');
  lines.push('');

  return lines.join('\n');
};

// ─── Main ────────────────────────────────────────────────────────────────

const main = async () => {
  const careers = await runParallel(RUNS);

  console.log('Computing Makushita-Juryo exchange diagnostics...');
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
  console.log(`Exchange diagnostics written: ${REPORT_MD} / ${REPORT_JSON}`);
};

main().catch((error) => {
  console.error('Exchange diagnostics error:', error);
  process.exit(1);
});
