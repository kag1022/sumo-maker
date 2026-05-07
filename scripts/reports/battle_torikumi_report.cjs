// Battle / Torikumi Realism Diagnostics Report
// 勝敗ロジックと本割ロジックのリアリティ監査レポート。
// ロジック変更なし。診断専用。

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_PATH = require.resolve('./_shared/battle_torikumi_worker.cjs');

const RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 400);
const POPULATION_KIND = process.env.REALISM_POPULATION_KIND || 'historical-like-career';
const POPULATION_PRESET = process.env.REALISM_POPULATION_PRESET || 'historical-like-v2-high';

const REPORT_MD = path.join('docs', 'balance', 'battle-torikumi-realism-diagnostics.md');
const REPORT_JSON = path.join('.tmp', 'battle-torikumi-realism-diagnostics.json');

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
        worker.on('error', (error) => {
          if (failed) return;
          failed = true;
          reject(error);
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
          if (completed % 50 === 0 || completed === runs) {
            console.log(`battle-torikumi diagnostics: ${completed}/${runs}`);
          }
          launchNext();
          maybeFinish();
        });
      }
    };

    console.log(`Starting battle/torikumi diagnostics pool with ${maxWorkers} workers (${POPULATION_PRESET}, ${runs} runs)...`);
    launchNext();
  });

// ─── Helpers ───────────────────────────────────────────────────────────────

// Flatten all basho records from all careers
const flattenBashoRecords = (careers) => {
  const all = [];
  for (const career of careers) {
    const meta = {
      aptitudeTier: career.aptitudeTier,
      careerBand: career.careerBand,
      growthType: career.growthType,
      retirementProfile: career.retirementProfile,
      reachedJuryo: career.reachedJuryo,
      reachedMakuuchi: career.reachedMakuuchi,
      styleRelevantCeiling: career.styleRelevantCeiling,
    };
    for (const record of (career.bashoRecords ?? [])) {
      all.push({ ...record, ...meta });
    }
  }
  return all;
};

// 星取 bucket label for 7-bout divisions
const record7Label = (wins, losses) => {
  if (wins + losses === 0) return 'absent';
  return `${wins}-${losses}`;
};

// 星取 bucket label for 15-bout divisions
const record15Label = (wins, losses) => {
  if (wins + losses < 12) return `${wins}-${losses}+absent`;
  if (wins >= 14) return `${wins}-${losses}`;
  if (wins >= 12) return `${wins}-${losses}`;
  if (wins >= 10) return `${wins}-${losses}`;
  if (wins >= 8) return `${wins}-${losses}`;
  if (wins <= 3) return '4以下';
  return `${wins}-${losses}`;
};

const rankBandOf = (division, rankNumber) => {
  if (!rankNumber) return 'all';
  if (division === 'Makuuchi') {
    if (rankNumber <= 4) return 'sanyaku';
    if (rankNumber <= 8) return 'upper';
    if (rankNumber <= 14) return 'middle';
    return 'lower';
  }
  if (division === 'Juryo') {
    return rankNumber <= 7 ? 'upper' : 'lower';
  }
  if (division === 'Makushita') {
    if (rankNumber <= 5) return 'upper5';
    if (rankNumber <= 15) return 'upper';
    if (rankNumber <= 30) return 'middle';
    return 'lower';
  }
  if (division === 'Sandanme') {
    if (rankNumber <= 30) return 'upper';
    if (rankNumber <= 60) return 'middle';
    return 'lower';
  }
  return rankNumber <= 20 ? 'upper' : 'lower';
};

// ─── A. 取組編成診断 ────────────────────────────────────────────────────────

const computeTorikumiDiag = (allBasho) => {
  const byDivision = groupBy(allBasho, (b) => b.division);
  const result = {};

  for (const [div, records] of Object.entries(byDivision)) {
    const n = records.length;
    if (n === 0) continue;

    const totalBouts = records.reduce((s, r) => s + (r.totalBouts || 0), 0);
    const crossDivision = records.reduce((s, r) => s + (r.crossDivisionBoutCount || 0), 0);
    const lateCrossDivision = records.reduce((s, r) => s + (r.lateCrossDivisionBoutCount || 0), 0);
    const sameStableViol = records.reduce((s, r) => s + (r.sameStableViolationCount || 0), 0);
    const sameCardViol = records.reduce((s, r) => s + (r.sameCardViolationCount || 0), 0);
    const scheduleViol = records.reduce((s, r) => s + (r.torikumiScheduleViolations || 0), 0);
    const totalRepairs = records.reduce((s, r) => s + (r.totalRepairs || 0), 0);

    const maxRelaxStages = records.map((r) => r.maxRelaxationStage).filter(Number.isFinite);
    const sosValues = records.map((r) => r.strengthOfSchedule).filter(Number.isFinite);

    const srrcValues = records.filter((r) => r.sanyakuRoundRobinCoverageRate != null).map((r) => r.sanyakuRoundRobinCoverageRate);
    const joiValues = records.filter((r) => r.joiAssignmentCoverageRate != null).map((r) => r.joiAssignmentCoverageRate);

    // Relaxation depth distribution across bashos
    const relaxationDepthDist = {};
    for (const r of records) {
      const d = r.maxRelaxationStage ?? 0;
      const key = String(d);
      relaxationDepthDist[key] = (relaxationDepthDist[key] || 0) + 1;
    }

    result[div] = {
      bashoCount: n,
      totalBouts,
      crossDivisionBoutCount: crossDivision,
      crossDivisionRate: pct(crossDivision, totalBouts),
      lateCrossDivisionRate: pct(lateCrossDivision, totalBouts),
      sameStableViolations: sameStableViol,
      sameStableViolationPerBasho: pct(sameStableViol, n),
      sameCardViolations: sameCardViol,
      sameCardViolationPerBasho: pct(sameCardViol, n),
      scheduleViolations: scheduleViol,
      scheduleViolationPerBasho: pct(scheduleViol, n),
      repairsTotal: totalRepairs,
      repairsPerBasho: pct(totalRepairs, n),
      maxRelaxStageP50: quantile(maxRelaxStages, 0.5),
      maxRelaxStageP90: quantile(maxRelaxStages, 0.9),
      relaxationDepthDist,
      sosP50: quantile(sosValues, 0.5),
      sosP90: quantile(sosValues, 0.9),
      sosMean: mean(sosValues),
      sanyakuRRCovMean: srrcValues.length > 0 ? mean(srrcValues) : null,
      joiAssignmentCovMean: joiValues.length > 0 ? mean(joiValues) : null,
    };
  }

  // Upper rank scheduling pressure (early days heavy opponent rate)
  const upperRankBasho = allBasho.filter((b) =>
    (b.division === 'Makuuchi' || b.division === 'Juryo') && b.upperRankEarlyTotal > 0,
  );
  const earlyDeepTotal = upperRankBasho.reduce((s, b) => s + b.upperRankEarlyDeep, 0);
  const earlyOpponentTotal = upperRankBasho.reduce((s, b) => s + b.upperRankEarlyTotal, 0);
  result._upperRankEarlyOpponentRate = pct(earlyDeepTotal, earlyOpponentTotal);
  result._upperRankEarlyBashoCount = upperRankBasho.length;

  return result;
};

// ─── B. 星取分布診断 ────────────────────────────────────────────────────────

const LOWER_DIVISIONS = new Set(['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita']);
const UPPER_DIVISIONS = new Set(['Juryo', 'Makuuchi']);

const computeWinDistDiag = (allBasho) => {
  const byDivision = groupBy(allBasho, (b) => b.division);
  const result = {};

  for (const [div, records] of Object.entries(byDivision)) {
    const is7bout = LOWER_DIVISIONS.has(div);
    const is15bout = UPPER_DIVISIONS.has(div);
    if (!is7bout && !is15bout) continue;

    const withBouts = records.filter((r) => r.totalBouts > 0);
    const n = withBouts.length;
    if (n === 0) continue;

    if (is7bout) {
      const distMap = {};
      const orderedKeys = ['7-0', '6-1', '5-2', '4-3', '3-4', '2-5', '1-6', '0-7'];
      for (const k of orderedKeys) distMap[k] = 0;
      distMap['incomplete'] = 0;

      for (const r of withBouts) {
        const label = `${r.wins}-${r.losses}`;
        if (orderedKeys.includes(label)) {
          distMap[label]++;
        } else {
          distMap['incomplete']++;
        }
      }

      const kachikoshi = (distMap['7-0'] + distMap['6-1'] + distMap['5-2'] + distMap['4-3']);
      const makekoshi = (distMap['3-4'] + distMap['2-5'] + distMap['1-6'] + distMap['0-7']);
      const fiveWins = distMap['7-0'] + distMap['6-1'] + distMap['5-2'];

      result[div] = {
        bashoCount: n,
        distribution: distMap,
        kachikoshiRate: pct(kachikoshi, n),
        makekoshiRate: pct(makekoshi, n),
        fiveWinsPlusRate: pct(fiveWins, n),
        sevenWinsRate: pct(distMap['7-0'], n),
        sixWinsRate: pct(distMap['6-1'], n),
        fiveWinsRate: pct(distMap['5-2'], n),
        fourWinsRate: pct(distMap['4-3'], n),
        threeWinsRate: pct(distMap['3-4'], n),
        avgWins: mean(withBouts.map((r) => r.wins)),
      };
    } else {
      // 15-bout
      const distMap = {};
      const keys15 = ['15-0', '14-1', '13-2', '12-3', '11-4', '10-5', '9-6', '8-7', '7-8', '6-9', '5-10', '4以下'];
      for (const k of keys15) distMap[k] = 0;

      for (const r of withBouts) {
        if (r.totalBouts < 14) {
          // incomplete basho (injuries, etc.) - skip for now
          continue;
        }
        if (r.wins <= 3) {
          distMap['4以下']++;
        } else {
          const label = `${r.wins}-${r.losses}`;
          if (distMap[label] !== undefined) distMap[label]++;
          else distMap['4以下']++;
        }
      }

      const complete15 = withBouts.filter((r) => r.totalBouts >= 14);
      const nc = complete15.length;
      const kachikoshi = complete15.filter((r) => r.wins >= 8).length;
      const tenPlus = complete15.filter((r) => r.wins >= 10).length;
      const elevenPlus = complete15.filter((r) => r.wins >= 11).length;
      const twelveOrMore = complete15.filter((r) => r.wins >= 12).length;

      result[div] = {
        bashoCount: nc,
        distribution: distMap,
        kachikoshiRate: pct(kachikoshi, nc),
        makekoshiRate: pct(nc - kachikoshi, nc),
        tenWinsPlusRate: pct(tenPlus, nc),
        elevenWinsPlusRate: pct(elevenPlus, nc),
        twelveWinsPlusRate: pct(twelveOrMore, nc),
        avgWins: mean(complete15.map((r) => r.wins)),
        winsP10: quantile(complete15.map((r) => r.wins), 0.1),
        winsP50: quantile(complete15.map((r) => r.wins), 0.5),
        winsP90: quantile(complete15.map((r) => r.wins), 0.9),
      };
    }
  }

  return result;
};

// ─── C. 幕下上位診断 ────────────────────────────────────────────────────────

const computeMakushitaUpperDiag = (careers) => {
  // Build upper basho list; use next-frame division to detect Makushita→Juryo promotion
  // (diagnostics.promoted = rank went up at all, including within-Makushita — not usable here)
  const upper = [];
  for (const career of careers) {
    const records = career.bashoRecords ?? [];
    for (let i = 0; i < records.length; i++) {
      const b = records[i];
      if (b.division !== 'Makushita' || (b.rankNumber ?? 99) > 5) continue;
      const nextB = records[i + 1];
      const nextDivision = nextB?.division ?? null;
      const promotedToJuryo = nextDivision === 'Juryo' || nextDivision === 'Makuuchi';
      upper.push({ ...b, promotedToJuryo });
    }
  }

  const n = upper.length;
  if (n === 0) return null;

  const withBouts = upper.filter((b) => b.totalBouts > 0);
  const nb = withBouts.length;
  const fiveWinsPlus = withBouts.filter((b) => b.wins >= 5);
  const fourWins = withBouts.filter((b) => b.wins === 4 && b.losses === 3);
  const sevenWins = withBouts.filter((b) => b.wins === 7);

  const promotedBasho = upper.filter((b) => b.promotedToJuryo);
  const fiveWinsPromoted = fiveWinsPlus.filter((b) => b.promotedToJuryo);
  const fourWinsPromoted = fourWins.filter((b) => b.promotedToJuryo);
  const sevenWinsPromoted = sevenWins.filter((b) => b.promotedToJuryo);

  const fiveWinsNotPromoted = fiveWinsPlus.filter((b) => !b.promotedToJuryo);
  const fiveWinsNotPromotedReasons = {};
  for (const b of fiveWinsNotPromoted) {
    const r = b.rankChangeReason ?? '昇進なし';
    fiveWinsNotPromotedReasons[r] = (fiveWinsNotPromotedReasons[r] || 0) + 1;
  }

  // Star distribution
  const starDist = {};
  const starKeys = ['7-0', '6-1', '5-2', '4-3', '3-4', '2-5', '1-6', '0-7'];
  for (const k of starKeys) starDist[k] = 0;
  for (const b of withBouts) {
    const k = `${b.wins}-${b.losses}`;
    if (starDist[k] !== undefined) starDist[k]++;
  }

  const sosValues = upper.map((b) => b.strengthOfSchedule).filter(Number.isFinite);
  const poeValues = upper.map((b) => b.performanceOverExpected).filter(Number.isFinite);

  return {
    bashoCount: n,
    withBoutsCount: nb,
    starDistribution: starDist,
    kachikoshiRate: pct(withBouts.filter((b) => b.wins >= 4).length, nb),
    fiveWinsPlusRate: pct(fiveWinsPlus.length, nb),
    sevenWinsRate: pct(sevenWins.length, nb),
    avgWins: mean(withBouts.map((b) => b.wins)),
    promotedRate: pct(promotedBasho.length, n),
    fiveWinsPromotedRate: pct(fiveWinsPromoted.length, fiveWinsPlus.length),
    fiveWinsNotPromotedRate: pct(fiveWinsNotPromoted.length, fiveWinsPlus.length),
    fourWinsPromotedRate: pct(fourWinsPromoted.length, fourWins.length),
    sevenWinsPromotedRate: pct(sevenWinsPromoted.length, sevenWins.length),
    fiveWinsNotPromotedReasons,
    sosP50: quantile(sosValues, 0.5),
    sosMean: mean(sosValues),
    performanceOverExpectedMean: mean(poeValues),
    performanceOverExpectedP50: quantile(poeValues, 0.5),
  };
};

// ─── D. 十両診断 ────────────────────────────────────────────────────────────

const computeJuryoDiag = (careers) => {
  // Build juryo basho list; use next-frame division to detect Juryo→Makuuchi promotion/demotion
  // (diagnostics.promoted = rank went up at all — includes within-Juryo rank improvement)
  const juryo = [];
  for (const career of careers) {
    const records = career.bashoRecords ?? [];
    for (let i = 0; i < records.length; i++) {
      const b = records[i];
      if (b.division !== 'Juryo' || b.totalBouts < 14) continue;
      const nextB = records[i + 1];
      const nextDivision = nextB?.division ?? null;
      const promotedToMakuuchi = nextDivision === 'Makuuchi';
      const demotedToMakushita = nextDivision === 'Makushita';
      juryo.push({ ...b, promotedToMakuuchi, demotedToMakushita });
    }
  }

  const n = juryo.length;
  if (n === 0) return null;

  const byBand = {
    upper: juryo.filter((b) => (b.rankNumber ?? 99) <= 7),
    lower: juryo.filter((b) => (b.rankNumber ?? 1) > 7),
  };

  const juryoDiag = (records) => {
    const nr = records.length;
    if (nr === 0) return null;
    const kachikoshi = records.filter((r) => r.wins >= 8);
    const tenPlus = records.filter((r) => r.wins >= 10);
    const elevenPlus = records.filter((r) => r.wins >= 11);
    const makekoshi = records.filter((r) => r.wins < 8);
    const promoted = records.filter((r) => r.promotedToMakuuchi);
    const demoted = records.filter((r) => r.demotedToMakushita);
    const poeValues = records.map((r) => r.performanceOverExpected).filter(Number.isFinite);
    const sosValues = records.map((r) => r.strengthOfSchedule).filter(Number.isFinite);
    const winDist = {};
    for (let w = 0; w <= 15; w++) winDist[String(w)] = 0;
    for (const r of records) winDist[String(Math.min(15, r.wins))]++;

    return {
      bashoCount: nr,
      kachikoshiRate: pct(kachikoshi.length, nr),
      makekoshiRate: pct(makekoshi.length, nr),
      tenWinsPlusRate: pct(tenPlus.length, nr),
      elevenWinsPlusRate: pct(elevenPlus.length, nr),
      promotionToMakuuchiRate: pct(promoted.length, nr),
      demotionToMakushitaRate: pct(demoted.length, nr),
      avgWins: mean(records.map((r) => r.wins)),
      winsP10: quantile(records.map((r) => r.wins), 0.1),
      winsP50: quantile(records.map((r) => r.wins), 0.5),
      winsP90: quantile(records.map((r) => r.wins), 0.9),
      performanceOverExpectedMean: mean(poeValues),
      performanceOverExpectedP50: quantile(poeValues, 0.5),
      sosP50: quantile(sosValues, 0.5),
      sosMean: mean(sosValues),
      winDistribution: winDist,
    };
  };

  return {
    all: juryoDiag(juryo),
    upper: juryoDiag(byBand.upper),
    lower: juryoDiag(byBand.lower),
  };
};

// ─── E. 勝敗確率キャリブレーション診断 ──────────────────────────────────────

const computeCalibrationDiag = (allBasho) => {
  // Group by avgWinProb (expected win rate per basho)
  const withProb = allBasho.filter((b) => b.avgWinProb != null && b.totalBouts > 0);

  const probBucketOf = (prob) => {
    if (prob < 0.30) return '<0.30';
    if (prob < 0.40) return '0.30-0.40';
    if (prob < 0.45) return '0.40-0.45';
    if (prob < 0.50) return '0.45-0.50';
    if (prob < 0.55) return '0.50-0.55';
    if (prob < 0.60) return '0.55-0.60';
    if (prob < 0.70) return '0.60-0.70';
    return '0.70+';
  };

  const byBucket = groupBy(withProb, (b) => probBucketOf(b.avgWinProb));
  const calibration = {};

  for (const [bucket, records] of Object.entries(byBucket)) {
    const nr = records.length;
    const totalBouts = records.reduce((s, r) => s + r.totalBouts, 0);
    const totalWins = records.reduce((s, r) => s + r.wins, 0);
    const expectedWinsSum = records.reduce((s, r) => s + (r.expectedWins ?? 0), 0);
    const avgExpected = pct(expectedWinsSum, totalBouts);
    const avgActual = pct(totalWins, totalBouts);
    const poeValues = records.map((r) => r.performanceOverExpected).filter(Number.isFinite);

    calibration[bucket] = {
      bashoCount: nr,
      totalBouts,
      expectedWinRate: avgExpected,
      actualWinRate: avgActual,
      calibrationError: avgActual - avgExpected,
      performanceOverExpectedMean: mean(poeValues),
      performanceOverExpectedP10: quantile(poeValues, 0.1),
      performanceOverExpectedP90: quantile(poeValues, 0.9),
    };
  }

  // Also compute per-division calibration
  const DIVS = ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi'];
  const byDivision = {};
  for (const div of DIVS) {
    const divRecords = withProb.filter((b) => b.division === div && b.totalBouts > 0);
    if (divRecords.length === 0) continue;
    const totalBouts = divRecords.reduce((s, r) => s + r.totalBouts, 0);
    const totalWins = divRecords.reduce((s, r) => s + r.wins, 0);
    const expectedWinsSum = divRecords.reduce((s, r) => s + (r.expectedWins ?? 0), 0);
    const poeValues = divRecords.map((r) => r.performanceOverExpected).filter(Number.isFinite);
    byDivision[div] = {
      bashoCount: divRecords.length,
      totalBouts,
      expectedWinRate: pct(expectedWinsSum, totalBouts),
      actualWinRate: pct(totalWins, totalBouts),
      calibrationError: pct(totalWins, totalBouts) - pct(expectedWinsSum, totalBouts),
      performanceOverExpectedMean: mean(poeValues),
      performanceOverExpectedP50: quantile(poeValues, 0.5),
    };
  }

  // Basho form delta (variance injection) distribution
  const formDeltas = allBasho.map((b) => b.formDelta).filter(Number.isFinite);

  return {
    byWinProbBucket: calibration,
    byDivision,
    formDelta: {
      mean: mean(formDeltas),
      p10: quantile(formDeltas, 0.1),
      p50: quantile(formDeltas, 0.5),
      p90: quantile(formDeltas, 0.9),
      absP50: quantile(formDeltas.map(Math.abs), 0.5),
      absP90: quantile(formDeltas.map(Math.abs), 0.9),
    },
  };
};

// ─── F. 有望力士潰し合い診断 ─────────────────────────────────────────────────

const computeCandidateCrushingDiag = (careers, allBasho) => {
  // "高ポテンシャル" 定義: aptitudeTier A/S or careerBand STRONG/ELITE
  const highPotCareerSeeds = new Set(
    careers
      .filter((c) => c.aptitudeTier === 'A' || c.aptitudeTier === 'S' || c.careerBand === 'STRONG' || c.careerBand === 'ELITE')
      .map((c) => c.seed),
  );

  const hpBasho = allBasho.filter((b) =>
    careers.some((c) => c.seed === b.seed && highPotCareerSeeds.has(c.seed)),
  );

  // Use upperRankEarlyDeepOpponents ratio as proxy for candidate crushing
  const makushitaHP = hpBasho.filter((b) => b.division === 'Makushita' && (b.rankNumber ?? 99) <= 15);
  const juryoHP = hpBasho.filter((b) => b.division === 'Juryo');
  const makuuchiHP = hpBasho.filter((b) => b.division === 'Makuuchi');

  const earlyDeepRate = (records) => {
    const withData = records.filter((r) => r.upperRankEarlyTotal > 0);
    if (!withData.length) return null;
    const deep = withData.reduce((s, r) => s + r.upperRankEarlyDeep, 0);
    const total = withData.reduce((s, r) => s + r.upperRankEarlyTotal, 0);
    return pct(deep, total);
  };

  const winStats = (records, nBouts) => {
    const withBouts = records.filter((r) => r.totalBouts >= nBouts);
    if (!withBouts.length) return null;
    const fiveWinsPlus = withBouts.filter((r) => r.wins >= 5).length;
    const eightWinsPlus = withBouts.filter((r) => r.wins >= 8).length;
    // nBouts is a minimum-bouts threshold: <14 = 7-bout division (kachikoshi=4+), >=14 = 15-bout (kachikoshi=8+)
    const kachikoshi = nBouts < 14 ? withBouts.filter((r) => r.wins >= 4).length : eightWinsPlus;
    return {
      bashoCount: withBouts.length,
      kachikoshiRate: pct(kachikoshi, withBouts.length),
      avgWins: mean(withBouts.map((r) => r.wins)),
      avgWinProb: mean(withBouts.map((r) => r.avgWinProb).filter(Number.isFinite)),
      avgActualWinRate: pct(
        withBouts.reduce((s, r) => s + r.wins, 0),
        withBouts.reduce((s, r) => s + r.totalBouts, 0),
      ),
    };
  };

  // Reachjuryo rate for high potential careers
  const hpCareers = careers.filter((c) => highPotCareerSeeds.has(c.seed));
  const hpReachedJuryo = hpCareers.filter((c) => c.reachedJuryo).length;
  const hpReachedMakuuchi = hpCareers.filter((c) => c.reachedMakuuchi).length;

  return {
    highPotCareerCount: hpCareers.length,
    highPotJuryoRate: pct(hpReachedJuryo, hpCareers.length),
    highPotMakuuchiRate: pct(hpReachedMakuuchi, hpCareers.length),
    juryoEarlyDeepOpponentRate: earlyDeepRate(juryoHP),
    makuuchiEarlyDeepOpponentRate: earlyDeepRate(makuuchiHP),
    makushitaUpperHPStats: winStats(makushitaHP, 4),
    juryoHPStats: winStats(juryoHP, 14),
    makuuchiHPStats: winStats(makuuchiHP, 14),
  };
};

// ─── 追加: 番付帯別 星取分布 ─────────────────────────────────────────────────

const computeRankBandWinDist = (allBasho) => {
  // Makushita by rank band
  const msByBand = groupBy(
    allBasho.filter((b) => b.division === 'Makushita' && b.totalBouts > 0),
    (b) => rankBandOf('Makushita', b.rankNumber),
  );
  const msResult = {};
  for (const [band, recs] of Object.entries(msByBand)) {
    const dist = {};
    const keys = ['7-0', '6-1', '5-2', '4-3', '3-4', '2-5', '1-6', '0-7'];
    for (const k of keys) dist[k] = 0;
    for (const r of recs) {
      const k = `${r.wins}-${r.losses}`;
      if (dist[k] !== undefined) dist[k]++;
    }
    msResult[band] = {
      bashoCount: recs.length,
      distribution: dist,
      fiveWinsPlusRate: pct((dist['7-0'] + dist['6-1'] + dist['5-2']), recs.length),
      kachikoshiRate: pct((dist['7-0'] + dist['6-1'] + dist['5-2'] + dist['4-3']), recs.length),
    };
  }

  return { Makushita: msResult };
};

// ─── compute all ────────────────────────────────────────────────────────────

const computeAll = (careers) => {
  // Attach seed to each basho record for cross-referencing
  const bashoWithSeed = careers.flatMap((c) =>
    (c.bashoRecords ?? []).map((b) => ({ ...b, seed: c.seed })),
  );

  const torikumi = computeTorikumiDiag(bashoWithSeed);
  const winDist = computeWinDistDiag(bashoWithSeed);
  const makushitaUpper = computeMakushitaUpperDiag(careers);
  const juryo = computeJuryoDiag(careers);
  const calibration = computeCalibrationDiag(bashoWithSeed);
  const candidateCrushing = computeCandidateCrushingDiag(careers, bashoWithSeed);
  const rankBandWinDist = computeRankBandWinDist(bashoWithSeed);

  // Overall career stats for context
  const totalCareers = careers.length;
  const juryoReachRate = pct(careers.filter((c) => c.reachedJuryo).length, totalCareers);
  const makuuchiReachRate = pct(careers.filter((c) => c.reachedMakuuchi).length, totalCareers);
  const allWinRates = careers.map((c) => c.careerWinRate).filter(Number.isFinite);

  return {
    meta: {
      careers: totalCareers,
      totalBashoRecords: bashoWithSeed.length,
      juryoReachRate,
      makuuchiReachRate,
      careerWinRateMean: mean(allWinRates),
      careerWinRateP50: quantile(allWinRates, 0.5),
    },
    torikumi,
    winDist,
    makushitaUpper,
    juryo,
    calibration,
    candidateCrushing,
    rankBandWinDist,
  };
};

// ─── Markdown renderer ───────────────────────────────────────────────────────

const renderMd = (diag, meta) => {
  const lines = [];
  const d = diag;

  lines.push('# Battle / Torikumi Realism Diagnostics');
  lines.push('');
  lines.push('勝敗ロジックと本割ロジックのリアリティ監査レポート。ロジック変更なし、診断専用。');
  lines.push('');
  lines.push('## Run Metadata');
  lines.push('');
  lines.push(`- generatedAt: ${meta.generatedAt}`);
  lines.push(`- sample: ${meta.sample}`);
  lines.push(`- populationKind: ${meta.populationKind}`);
  lines.push(`- populationPreset: ${meta.populationPreset}`);
  lines.push(`- 総キャリア数: ${d.meta.careers}`);
  lines.push(`- 総bashoレコード数: ${d.meta.totalBashoRecords}`);
  lines.push(`- 十両到達率: ${toPct(d.meta.juryoReachRate)}`);
  lines.push(`- 幕内到達率: ${toPct(d.meta.makuuchiReachRate)}`);
  lines.push(`- 通算勝率平均: ${toPct(d.meta.careerWinRateMean)}`);
  lines.push(`- 通算勝率 P50: ${toPct(d.meta.careerWinRateP50)}`);
  lines.push('');

  // A. 取組編成診断
  lines.push('## A. 取組編成診断');
  lines.push('');
  lines.push('> 本割の制約違反・越境戦・relaxation depth を番付別に確認する。');
  lines.push('');
  lines.push('> ※ 越境戦数・同部屋違反・再戦違反・修復回数は league-wide 合計を basho 数で割った「1 basho あたり」の値。下位番付はリーグ全体のスケジューリング結果を示す。');
  lines.push('');
  lines.push('| division | basho数 | 越境戦/basho | 同部屋違反/basho | 再戦違反/basho | 修復回数/basho | relax深度P50 | relax深度P90 | SOS P50 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');
  const divOrder = ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi'];
  for (const div of divOrder) {
    const r = d.torikumi[div];
    if (!r) continue;
    const crossPerBasho = toFixed(r.bashoCount > 0 ? r.crossDivisionBoutCount / r.bashoCount : 0, 1);
    lines.push(`| ${div} | ${r.bashoCount} | ${crossPerBasho} | ${toFixed(r.sameStableViolationPerBasho, 3)} | ${toFixed(r.sameCardViolationPerBasho, 3)} | ${toFixed(r.repairsPerBasho, 1)} | ${toFixed(r.maxRelaxStageP50, 0)} | ${toFixed(r.maxRelaxStageP90, 0)} | ${toFixed(r.sosP50, 1)} |`);
  }
  lines.push('');
  lines.push(`上位番付での序盤厳しい相手率 (upperRankEarlyDeepOpponentRate): ${toPct(d.torikumi._upperRankEarlyOpponentRate)} (basho数: ${d.torikumi._upperRankEarlyBashoCount})`);
  lines.push('');

  // Relaxation depth distribution per div
  lines.push('### relaxation深度分布 (basho単位)');
  lines.push('');
  for (const div of divOrder) {
    const r = d.torikumi[div];
    if (!r || !r.relaxationDepthDist) continue;
    const total = r.bashoCount;
    const dist = Object.entries(r.relaxationDepthDist).sort(([a], [b]) => Number(a) - Number(b));
    const distStr = dist.map(([k, v]) => `stage${k}: ${v} (${toPct(pct(v, total))})`).join(' / ');
    lines.push(`- **${div}**: ${distStr}`);
  }
  lines.push('');
  if (d.torikumi['Makuuchi']?.sanyakuRRCovMean != null) {
    lines.push(`- 三役総当たりカバー率平均 (Makuuchi): ${toPct(d.torikumi['Makuuchi'].sanyakuRRCovMean)}`);
  }
  if (d.torikumi['Makuuchi']?.joiAssignmentCovMean != null) {
    lines.push(`- 上位義務戦カバー率平均 (Makuuchi): ${toPct(d.torikumi['Makuuchi'].joiAssignmentCovMean)}`);
  }
  lines.push('');

  // B. 星取分布診断
  lines.push('## B. 星取分布診断');
  lines.push('');
  lines.push('> 7番制 (幕下以下) と 15番制 (十両・幕内) の星取分布を確認する。');
  lines.push('');

  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita']) {
    const r = d.winDist[div];
    if (!r) continue;
    lines.push(`### ${div} (n=${r.bashoCount})`);
    lines.push('');
    lines.push(`- 勝ち越し率: ${toPct(r.kachikoshiRate)} / 負け越し率: ${toPct(r.makekoshiRate)}`);
    lines.push(`- 5勝以上率: ${toPct(r.fiveWinsPlusRate)} / 平均勝数: ${toFixed(r.avgWins)}`);
    lines.push('');
    lines.push('| 星取 | count | 率 |');
    lines.push('|---|---:|---:|');
    for (const [k, v] of Object.entries(r.distribution)) {
      if (k === 'incomplete' && v === 0) continue;
      lines.push(`| ${k} | ${v} | ${toPct(pct(v, r.bashoCount))} |`);
    }
    lines.push('');
  }

  for (const div of ['Juryo', 'Makuuchi']) {
    const r = d.winDist[div];
    if (!r) continue;
    lines.push(`### ${div} (n=${r.bashoCount})`);
    lines.push('');
    lines.push(`- 勝ち越し率: ${toPct(r.kachikoshiRate)} / 平均勝数: ${toFixed(r.avgWins)}`);
    lines.push(`- 10勝以上率: ${toPct(r.tenWinsPlusRate)} / 11勝以上率: ${toPct(r.elevenWinsPlusRate)} / 12勝以上率: ${toPct(r.twelveWinsPlusRate)}`);
    lines.push(`- 勝数 P10/P50/P90: ${toFixed(r.winsP10, 0)} / ${toFixed(r.winsP50, 0)} / ${toFixed(r.winsP90, 0)}`);
    lines.push('');
    lines.push('| 星取 | count | 率 |');
    lines.push('|---|---:|---:|');
    for (const [k, v] of Object.entries(r.distribution)) {
      if (v === 0) continue;
      lines.push(`| ${k} | ${v} | ${toPct(pct(v, r.bashoCount))} |`);
    }
    lines.push('');
  }

  // B-2. Makushita rank band
  lines.push('### 幕下 rank band 別 星取分布');
  lines.push('');
  const msRBD = d.rankBandWinDist?.Makushita ?? {};
  lines.push('| rankBand | basho数 | 5勝以上率 | 勝ち越し率 | 7-0 | 6-1 | 5-2 | 4-3 | 3-4 | 2-5 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const bandOrder = ['upper5', 'upper', 'middle', 'lower'];
  for (const band of bandOrder) {
    const r = msRBD[band];
    if (!r) continue;
    const dist = r.distribution;
    lines.push(`| ${band} | ${r.bashoCount} | ${toPct(r.fiveWinsPlusRate)} | ${toPct(r.kachikoshiRate)} | ${toPct(pct(dist['7-0'] || 0, r.bashoCount))} | ${toPct(pct(dist['6-1'] || 0, r.bashoCount))} | ${toPct(pct(dist['5-2'] || 0, r.bashoCount))} | ${toPct(pct(dist['4-3'] || 0, r.bashoCount))} | ${toPct(pct(dist['3-4'] || 0, r.bashoCount))} | ${toPct(pct(dist['2-5'] || 0, r.bashoCount))} |`);
  }
  lines.push('');

  // C. 幕下上位診断
  lines.push('## C. 幕下上位診断 (幕下1〜5枚目)');
  lines.push('');
  lines.push('> 十両との境界。5勝以上・昇進審査・通過率を確認する。');
  lines.push('');
  const mu = d.makushitaUpper;
  if (mu) {
    lines.push(`- basho数 (取組あり): ${mu.withBoutsCount} / 全: ${mu.bashoCount}`);
    lines.push(`- 平均勝数: ${toFixed(mu.avgWins)}`);
    lines.push(`- 勝ち越し率 (4-3以上): ${toPct(mu.kachikoshiRate)}`);
    lines.push(`- 5勝以上率: ${toPct(mu.fiveWinsPlusRate)}`);
    lines.push(`- 7勝全勝率: ${toPct(mu.sevenWinsRate)}`);
    lines.push(`- 十両昇進率 (次bashoがJuryo/Makuuchi): ${toPct(mu.promotedRate)}`);
    lines.push(`- 5勝以上で昇進した率: ${toPct(mu.fiveWinsPromotedRate)}`);
    lines.push(`- 5勝以上で昇進できなかった率: ${toPct(mu.fiveWinsNotPromotedRate)}`);
    lines.push(`- 4-3で昇進した率: ${toPct(mu.fourWinsPromotedRate)}`);
    lines.push(`- 7-0で昇進した率: ${toPct(mu.sevenWinsPromotedRate)}`);
    lines.push(`- SOS P50: ${toFixed(mu.sosP50, 1)} (Makushita band top=96 — P50>96 で十両相手が多い)`);
    lines.push(`- performanceOverExpected 平均: ${toFixed(mu.performanceOverExpectedMean)} (負値 = 期待より負け越し)`);
    lines.push('');
    lines.push('#### 星取分布 (幕下上位)');
    lines.push('');
    lines.push('| 星取 | count | 率 |');
    lines.push('|---|---:|---:|');
    for (const [k, v] of Object.entries(mu.starDistribution)) {
      if (v === 0) continue;
      lines.push(`| ${k} | ${v} | ${toPct(pct(v, mu.withBoutsCount))} |`);
    }
    lines.push('');
    if (Object.keys(mu.fiveWinsNotPromotedReasons).length > 0) {
      lines.push('#### 5勝以上で昇進できなかった理由分布');
      lines.push('');
      for (const [reason, count] of Object.entries(mu.fiveWinsNotPromotedReasons)) {
        lines.push(`- ${reason}: ${count}`);
      }
      lines.push('');
    }
  }

  // D. 十両診断
  lines.push('## D. 十両診断');
  lines.push('');
  lines.push('> 十両での勝ち越し率・10勝以上率・幕内昇進率を確認する。');
  lines.push('');
  const jd = d.juryo;
  if (jd) {
    const sections = [['全体', jd.all], ['上位 (1-7枚目)', jd.upper], ['下位 (8-14枚目)', jd.lower]];
    for (const [label, r] of sections) {
      if (!r) continue;
      lines.push(`### 十両 ${label} (n=${r.bashoCount})`);
      lines.push('');
      lines.push(`- 勝ち越し率: ${toPct(r.kachikoshiRate)} / 負け越し率: ${toPct(r.makekoshiRate)}`);
      lines.push(`- 10勝以上率: ${toPct(r.tenWinsPlusRate)} / 11勝以上率: ${toPct(r.elevenWinsPlusRate)}`);
      lines.push(`- 平均勝数: ${toFixed(r.avgWins)} / 勝数 P10/P50/P90: ${toFixed(r.winsP10, 0)} / ${toFixed(r.winsP50, 0)} / ${toFixed(r.winsP90, 0)}`);
      lines.push(`- 幕内昇進率: ${toPct(r.promotionToMakuuchiRate)} / 幕下陥落率: ${toPct(r.demotionToMakushitaRate)}`);
      lines.push(`- SOS 平均: ${toFixed(r.sosMean, 1)} / P50: ${toFixed(r.sosP50, 1)}`);
      lines.push(`- performanceOverExpected 平均: ${toFixed(r.performanceOverExpectedMean)} / P50: ${toFixed(r.performanceOverExpectedP50)}`);
      lines.push('');
      // Win distribution table (compact)
      const winDist = r.winDistribution ?? {};
      const winKeys = Object.keys(winDist).filter((k) => winDist[k] > 0).sort((a, b) => Number(b) - Number(a));
      lines.push('| 勝数 | count | 率 |');
      lines.push('|---|---:|---:|');
      for (const k of winKeys) {
        lines.push(`| ${k} | ${winDist[k]} | ${toPct(pct(winDist[k], r.bashoCount))} |`);
      }
      lines.push('');
    }
  }

  // E. 勝敗確率キャリブレーション診断
  lines.push('## E. 勝敗確率キャリブレーション診断');
  lines.push('');
  lines.push('> expectedWins/totalBouts = basho平均勝率期待値。実際の勝率と比較して calibration を確認する。');
  lines.push('> 完全 calibration なら expectedWinRate ≈ actualWinRate。');
  lines.push('');
  const cal = d.calibration;
  lines.push('### 期待勝率 bucket 別 calibration');
  lines.push('');
  lines.push('| 期待勝率 bucket | basho数 | 期待勝率 | 実際勝率 | calibration誤差 | POE平均 | POE P10 | POE P90 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  const bucketOrder = ['<0.30', '0.30-0.40', '0.40-0.45', '0.45-0.50', '0.50-0.55', '0.55-0.60', '0.60-0.70', '0.70+'];
  for (const bucket of bucketOrder) {
    const r = cal.byWinProbBucket[bucket];
    if (!r) continue;
    lines.push(`| ${bucket} | ${r.bashoCount} | ${toPct(r.expectedWinRate)} | ${toPct(r.actualWinRate)} | ${toFixed(r.calibrationError * 100, 2)}pp | ${toFixed(r.performanceOverExpectedMean)} | ${toFixed(r.performanceOverExpectedP10)} | ${toFixed(r.performanceOverExpectedP90)} |`);
  }
  lines.push('');
  lines.push('### 番付別 calibration');
  lines.push('');
  lines.push('| division | basho数 | 期待勝率 | 実際勝率 | calibration誤差 | POE平均 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const div of divOrder) {
    const r = cal.byDivision[div];
    if (!r) continue;
    lines.push(`| ${div} | ${r.bashoCount} | ${toPct(r.expectedWinRate)} | ${toPct(r.actualWinRate)} | ${toFixed(r.calibrationError * 100, 2)}pp | ${toFixed(r.performanceOverExpectedMean)} |`);
  }
  lines.push('');
  lines.push('### basho形態デルタ (formDelta) 分布');
  lines.push('');
  const fd = cal.formDelta;
  lines.push(`- 平均: ${toFixed(fd.mean)} / P10: ${toFixed(fd.p10)} / P50: ${toFixed(fd.p50)} / P90: ${toFixed(fd.p90)}`);
  lines.push(`- 絶対値 P50/P90: ${toFixed(fd.absP50)} / ${toFixed(fd.absP90)}`);
  lines.push('');

  // F. 有望力士潰し合い診断
  lines.push('## F. 有望力士潰し合い診断');
  lines.push('');
  lines.push('> aptitudeTier A/S または careerBand STRONG/ELITE の高ポテンシャル力士の潰し合いを確認する。');
  lines.push('');
  const cc = d.candidateCrushing;
  if (cc) {
    lines.push(`- 高ポテンシャルキャリア数: ${cc.highPotCareerCount}`);
    lines.push(`- 十両到達率: ${toPct(cc.highPotJuryoRate)}`);
    lines.push(`- 幕内到達率: ${toPct(cc.highPotMakuuchiRate)}`);
    lines.push(`- 十両での序盤厳しい相手率: ${toPct(cc.juryoEarlyDeepOpponentRate)}`);
    lines.push(`- 幕内での序盤厳しい相手率: ${toPct(cc.makuuchiEarlyDeepOpponentRate)}`);
    lines.push('');

    if (cc.makushitaUpperHPStats) {
      const s = cc.makushitaUpperHPStats;
      lines.push(`### 幕下上位 高ポテンシャル力士 (n=${s.bashoCount})`);
      lines.push(`- 勝ち越し率: ${toPct(s.kachikoshiRate)}`);
      lines.push(`- 平均勝数: ${toFixed(s.avgWins)}`);
      lines.push(`- 期待勝率平均: ${toPct(s.avgWinProb)}`);
      lines.push(`- 実際勝率: ${toPct(s.avgActualWinRate)}`);
      lines.push('');
    }
    if (cc.juryoHPStats) {
      const s = cc.juryoHPStats;
      lines.push(`### 十両 高ポテンシャル力士 (n=${s.bashoCount})`);
      lines.push(`- 勝ち越し率: ${toPct(s.kachikoshiRate)}`);
      lines.push(`- 平均勝数: ${toFixed(s.avgWins)}`);
      lines.push(`- 期待勝率平均: ${toPct(s.avgWinProb)}`);
      lines.push(`- 実際勝率: ${toPct(s.avgActualWinRate)}`);
      lines.push('');
    }
  }

  return lines.join('\n');
};

// ─── main ────────────────────────────────────────────────────────────────────

const main = async () => {
  if (!Number.isFinite(RUNS) || RUNS <= 0) {
    throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
  }
  const generatedAt = new Date().toISOString();
  const careers = await runParallel(RUNS);

  const diag = computeAll(careers);
  const meta = {
    generatedAt,
    sample: RUNS,
    populationKind: POPULATION_KIND,
    populationPreset: POPULATION_PRESET,
  };

  writeFile(REPORT_MD, renderMd(diag, meta));
  writeFile(REPORT_JSON, JSON.stringify({ meta, diagnostics: diag }, null, 2));
  console.log(`battle/torikumi diagnostics written: ${REPORT_MD} / ${REPORT_JSON}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
