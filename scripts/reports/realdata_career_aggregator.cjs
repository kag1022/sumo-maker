// Real-data career aggregator (read-only).
// Reads sumo-api-db/data/analysis/basho_records_sumo_api_196007_202603.json,
// groups records by rikishiId, reconstructs careers, and emits a compact
// career-KPI aggregate JSON cached at .tmp/realdata_career_aggregate.json.
//
// 出典:
//   - sumo-api-db/data/analysis/basho_records_sumo_api_196007_202603.json
//     (per-basho per-rikishi records, 1960-07 .. 2026-03)
//   - sumo-api-db/data/analysis/sekitori_boundary_realdata.json (boundary KPIs)
//   - sumo-api-db/data/analysis/game_calibration_long_range.json (rank-movement)
//
// 注意: real-data には birthdate / debut age がないため、年齢 KPI は null マーク。
//       「complete career」は最終出場場所が ACTIVE_CUTOFF_BASHO_ID より前のもの。

'use strict';

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SOURCE_BASHO_RECORDS = path.join(
  REPO_ROOT,
  'sumo-api-db', 'data', 'analysis', 'basho_records_sumo_api_196007_202603.json',
);
const SOURCE_SEKITORI_BOUNDARY = path.join(
  REPO_ROOT,
  'sumo-api-db', 'data', 'analysis', 'sekitori_boundary_realdata.json',
);
const SOURCE_LONG_RANGE = path.join(
  REPO_ROOT,
  'sumo-api-db', 'data', 'analysis', 'game_calibration_long_range.json',
);
const CACHE_PATH = path.join(REPO_ROOT, '.tmp', 'realdata_career_aggregate.json');

// Last basho id beyond which we treat a rikishi's career as still active
// (i.e. they may continue, so we can't classify retirement KPIs reliably).
// Anyone whose latest record is in 2024-01 or later is excluded from
// "complete career" cohort. Keep two basho buffers (~12 months) before now.
const ACTIVE_CUTOFF_BASHO_ID = '202401'; // exclusive: complete career means lastBashoId < this

const DIVISION_TO_HIGHEST_BUCKET_DIVISION = {
  Makuuchi: 'Makuuchi',
  Juryo: 'Juryo',
  Makushita: 'Makushita',
  Sandanme: 'Sandanme',
  Jonidan: 'Jonidan',
  Jonokuchi: 'Jonokuchi',
};

// Highest-rank bucket order for ordering.
// We also separately classify Makuuchi into 横綱/大関/三役/前頭 via banzukeLabel.
const HIGHEST_BUCKETS = ['横綱', '大関', '三役', '前頭', '十両', '幕下', '三段目', '序二段', '序ノ口'];

const MAKUUCHI_RANK_REGEX = /^(東|西)?(横綱|大関|関脇|小結|前頭)(\d+)?枚目?$/;

const SANYAKU_RANKS = new Set(['横綱', '大関', '関脇', '小結']);

// Highest-rank bucket for one record from its division + banzukeLabel.
const recordHighestBucket = (record) => {
  const label = record.banzukeLabel || '';
  if (record.division === 'Makuuchi') {
    const m = label.match(MAKUUCHI_RANK_REGEX);
    const rank = m ? m[2] : null;
    if (rank === '横綱') return '横綱';
    if (rank === '大関') return '大関';
    if (rank === '関脇' || rank === '小結') return '三役';
    return '前頭';
  }
  if (record.division === 'Juryo') return '十両';
  if (record.division === 'Makushita') return '幕下';
  if (record.division === 'Sandanme') return '三段目';
  if (record.division === 'Jonidan') return '序二段';
  if (record.division === 'Jonokuchi') return '序ノ口';
  return null;
};

// Higher index = higher rank
const bucketIndex = (bucket) => {
  const idx = HIGHEST_BUCKETS.indexOf(bucket);
  return idx < 0 ? -1 : (HIGHEST_BUCKETS.length - 1 - idx); // 0..8
};

const careerBashoBucket = (count) => {
  if (count < 12) return '<12';
  if (count < 24) return '12-23';
  if (count < 36) return '24-35';
  if (count < 60) return '36-59';
  if (count < 90) return '60-89';
  if (count < 120) return '90-119';
  return '>=120';
};

const winRateBucket = (rate) => {
  if (!Number.isFinite(rate)) return 'n/a';
  if (rate < 0.35) return '<0.35';
  if (rate < 0.40) return '0.35-0.39';
  if (rate < 0.45) return '0.40-0.44';
  if (rate < 0.50) return '0.45-0.49';
  if (rate < 0.55) return '0.50-0.54';
  if (rate < 0.60) return '0.55-0.59';
  if (rate < 0.65) return '0.60-0.64';
  return '>=0.65';
};

const quantile = (values, ratio) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[idx];
};

const distributionRates = (items, keyFn, allKeys = null) => {
  const counts = {};
  let total = 0;
  for (const it of items) {
    const k = keyFn(it);
    if (k == null) continue;
    counts[k] = (counts[k] || 0) + 1;
    total += 1;
  }
  const out = {};
  const keys = allKeys ?? Object.keys(counts).sort();
  for (const k of keys) out[k] = total > 0 ? (counts[k] || 0) / total : 0;
  return out;
};

// Build one career object from a list of records (sorted by bashoId asc).
const buildCareer = (records) => {
  records.sort((a, b) => a.bashoId.localeCompare(b.bashoId));
  let bestBucketIdx = -1;
  let bestBucket = null;
  let firstReachByBucket = {}; // bucketName -> basho index (1-based)
  const divisionCounts = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  let sanyakuCount = 0;
  let ozekiCount = 0;
  let yokozunaCount = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalAbsences = 0;

  // 7-bout (lower divisions) and 15-bout (sekitori) result distribution
  // Bucketed by wins (0..7 or 0..15)
  const lower7Wins = {}; // wins -> count of basho appearances
  const sek15Wins = {};
  // kachikoshi flag per division
  const kachikoshiCounts = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  const divisionBoutBashos = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  const divisionWinTotals = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };
  const divisionLossTotals = {
    Makuuchi: 0, Juryo: 0, Makushita: 0, Sandanme: 0, Jonidan: 0, Jonokuchi: 0,
  };

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const bucket = recordHighestBucket(r);
    if (bucket) {
      const idx = bucketIndex(bucket);
      if (idx > bestBucketIdx) {
        bestBucketIdx = idx;
        bestBucket = bucket;
      }
      if (firstReachByBucket[bucket] == null) firstReachByBucket[bucket] = i + 1;
    }
    const div = r.division;
    if (div && divisionCounts[div] != null) {
      divisionCounts[div] += 1;
      const wins = r.wins || 0;
      const losses = r.losses || 0;
      totalWins += wins;
      totalLosses += losses;
      totalAbsences += r.absences || 0;
      divisionWinTotals[div] += wins;
      divisionLossTotals[div] += losses;
      if (wins + losses > 0) {
        divisionBoutBashos[div] += 1;
        if (wins > losses) kachikoshiCounts[div] += 1;
      }
      if (div === 'Makuuchi') {
        const m = (r.banzukeLabel || '').match(MAKUUCHI_RANK_REGEX);
        const rank = m ? m[2] : null;
        if (rank === '横綱') yokozunaCount += 1;
        if (rank === '大関') ozekiCount += 1;
        if (rank && SANYAKU_RANKS.has(rank)) sanyakuCount += 1;
      }
      // wins distribution buckets
      if (div === 'Makuuchi' || div === 'Juryo') {
        if (wins + losses + (r.absences || 0) > 0) {
          sek15Wins[wins] = (sek15Wins[wins] || 0) + 1;
        }
      } else {
        if (wins + losses > 0) {
          lower7Wins[wins] = (lower7Wins[wins] || 0) + 1;
        }
      }
    }
  }

  // Derived first-reach for hierarchical buckets (any rank at-or-above target).
  // We'll express: firstReach for makushita = first basho where division == Makushita or above
  const firstReachAtOrAbove = (predicate) => {
    for (let i = 0; i < records.length; i += 1) if (predicate(records[i])) return i + 1;
    return null;
  };
  const firstMakushita = firstReachAtOrAbove((r) => ['Makushita', 'Juryo', 'Makuuchi'].includes(r.division));
  const firstJuryo = firstReachAtOrAbove((r) => ['Juryo', 'Makuuchi'].includes(r.division));
  const firstMakuuchi = firstReachAtOrAbove((r) => r.division === 'Makuuchi');
  const firstSanyaku = firstReachAtOrAbove((r) => {
    if (r.division !== 'Makuuchi') return false;
    const m = (r.banzukeLabel || '').match(MAKUUCHI_RANK_REGEX);
    return m && SANYAKU_RANKS.has(m[2]);
  });
  const firstOzeki = firstReachAtOrAbove((r) => {
    if (r.division !== 'Makuuchi') return false;
    const m = (r.banzukeLabel || '').match(MAKUUCHI_RANK_REGEX);
    return m && (m[2] === '大関' || m[2] === '横綱');
  });
  const firstYokozuna = firstReachAtOrAbove((r) => {
    if (r.division !== 'Makuuchi') return false;
    const m = (r.banzukeLabel || '').match(MAKUUCHI_RANK_REGEX);
    return m && m[2] === '横綱';
  });

  const careerBasho = records.length;
  const totalBouts = totalWins + totalLosses;
  const careerWinRate = totalBouts > 0 ? totalWins / totalBouts : null;

  const lastBashoId = records[records.length - 1]?.bashoId ?? null;
  const firstBashoId = records[0]?.bashoId ?? null;

  return {
    careerBasho,
    firstBashoId,
    lastBashoId,
    highestRankBucket: bestBucket,
    firstReachByBucket,
    firstMakushitaBasho: firstMakushita,
    firstJuryoBasho: firstJuryo,
    firstMakuuchiBasho: firstMakuuchi,
    firstSanyakuBasho: firstSanyaku,
    firstOzekiBasho: firstOzeki,
    firstYokozunaBasho: firstYokozuna,
    reachedMakushita: firstMakushita != null,
    reachedJuryo: firstJuryo != null,
    reachedMakuuchi: firstMakuuchi != null,
    reachedSanyaku: firstSanyaku != null,
    reachedOzeki: firstOzeki != null,
    reachedYokozuna: firstYokozuna != null,
    divisionCounts,
    sanyakuCount,
    ozekiCount,
    yokozunaCount,
    totalWins,
    totalLosses,
    totalAbsences,
    careerWinRate,
    divisionBoutBashos,
    divisionWinTotals,
    divisionLossTotals,
    kachikoshiCounts,
    lower7Wins,
    sek15Wins,
  };
};

const aggregateCareers = (careers, label) => {
  const total = careers.length;
  const reached = (pred) => careers.filter(pred).length;
  const reachedMakushita = reached((c) => c.reachedMakushita);
  const reachedJuryo = reached((c) => c.reachedJuryo);
  const reachedMakuuchi = reached((c) => c.reachedMakuuchi);
  const reachedSanyaku = reached((c) => c.reachedSanyaku);
  const reachedOzeki = reached((c) => c.reachedOzeki);
  const reachedYokozuna = reached((c) => c.reachedYokozuna);

  const highestRankDistribution = {};
  for (const b of HIGHEST_BUCKETS) highestRankDistribution[b] = 0;
  for (const c of careers) if (c.highestRankBucket) highestRankDistribution[c.highestRankBucket] += 1;
  const highestRankRates = {};
  for (const b of HIGHEST_BUCKETS) {
    highestRankRates[b] = total > 0 ? highestRankDistribution[b] / total : 0;
  }

  const careerBashoBuckets = {};
  for (const k of ['<12', '12-23', '24-35', '36-59', '60-89', '90-119', '>=120']) careerBashoBuckets[k] = 0;
  for (const c of careers) careerBashoBuckets[careerBashoBucket(c.careerBasho)] += 1;
  const careerBashoBucketRates = {};
  for (const k of Object.keys(careerBashoBuckets)) {
    careerBashoBucketRates[k] = total > 0 ? careerBashoBuckets[k] / total : 0;
  }

  const winRateBuckets = {};
  for (const k of ['<0.35', '0.35-0.39', '0.40-0.44', '0.45-0.49', '0.50-0.54', '0.55-0.59', '0.60-0.64', '>=0.65']) {
    winRateBuckets[k] = 0;
  }
  let winRateValid = 0;
  for (const c of careers) {
    if (Number.isFinite(c.careerWinRate)) {
      winRateBuckets[winRateBucket(c.careerWinRate)] += 1;
      winRateValid += 1;
    }
  }
  const winRateBucketRates = {};
  for (const k of Object.keys(winRateBuckets)) {
    winRateBucketRates[k] = winRateValid > 0 ? winRateBuckets[k] / winRateValid : 0;
  }

  // first-reach quantiles
  const fr = (key) => {
    const vals = careers.map((c) => c[key]).filter(Number.isFinite);
    return { p10: quantile(vals, 0.1), p50: quantile(vals, 0.5), p90: quantile(vals, 0.9), n: vals.length };
  };

  const careerBashoVals = careers.map((c) => c.careerBasho);
  const careerWinRateVals = careers.map((c) => c.careerWinRate).filter(Number.isFinite);

  // division residence
  const divisionTenure = {};
  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi']) {
    const vals = careers.map((c) => c.divisionCounts[div]).filter((v) => v > 0);
    divisionTenure[div] = {
      n: vals.length,
      p50: quantile(vals, 0.5),
      p90: quantile(vals, 0.9),
      mean: vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null,
    };
  }

  // per-division win rate
  const perDivisionWinRate = {};
  const perDivisionKachikoshiRate = {};
  for (const div of ['Jonokuchi', 'Jonidan', 'Sandanme', 'Makushita', 'Juryo', 'Makuuchi']) {
    let w = 0, l = 0, kk = 0, basho = 0;
    for (const c of careers) {
      w += c.divisionWinTotals[div];
      l += c.divisionLossTotals[div];
      kk += c.kachikoshiCounts[div];
      basho += c.divisionBoutBashos[div];
    }
    perDivisionWinRate[div] = w + l > 0 ? w / (w + l) : null;
    perDivisionKachikoshiRate[div] = basho > 0 ? kk / basho : null;
  }

  // 7-bout and 15-bout wins distribution (across all basho appearances pooled)
  const lower7Wins = {};
  const sek15Wins = {};
  for (let i = 0; i <= 7; i += 1) lower7Wins[i] = 0;
  for (let i = 0; i <= 15; i += 1) sek15Wins[i] = 0;
  let lower7Total = 0;
  let sek15Total = 0;
  for (const c of careers) {
    for (const [k, v] of Object.entries(c.lower7Wins)) {
      const wins = Number(k);
      if (wins >= 0 && wins <= 7) {
        lower7Wins[wins] += v;
        lower7Total += v;
      }
    }
    for (const [k, v] of Object.entries(c.sek15Wins)) {
      const wins = Number(k);
      if (wins >= 0 && wins <= 15) {
        sek15Wins[wins] += v;
        sek15Total += v;
      }
    }
  }
  const lower7WinsRates = {};
  for (const k of Object.keys(lower7Wins)) {
    lower7WinsRates[k] = lower7Total > 0 ? lower7Wins[k] / lower7Total : 0;
  }
  const sek15WinsRates = {};
  for (const k of Object.keys(sek15Wins)) {
    sek15WinsRates[k] = sek15Total > 0 ? sek15Wins[k] / sek15Total : 0;
  }

  // pipeline rates
  const pipelineRates = {
    makushitaToJuryoRate: reachedMakushita > 0 ? reachedJuryo / reachedMakushita : null,
    juryoToMakuuchiRate: reachedJuryo > 0 ? reachedMakuuchi / reachedJuryo : null,
    makuuchiToSanyakuRate: reachedMakuuchi > 0 ? reachedSanyaku / reachedMakuuchi : null,
    sanyakuToOzekiRate: reachedSanyaku > 0 ? reachedOzeki / reachedSanyaku : null,
    ozekiToYokozunaRate: reachedOzeki > 0 ? reachedYokozuna / reachedOzeki : null,
  };

  // career length stats
  const careerLengthStats = {
    mean: careerBashoVals.length > 0 ? careerBashoVals.reduce((s, v) => s + v, 0) / careerBashoVals.length : null,
    p10: quantile(careerBashoVals, 0.1),
    p50: quantile(careerBashoVals, 0.5),
    p90: quantile(careerBashoVals, 0.9),
  };

  return {
    cohortLabel: label,
    sample: total,
    rankRates: {
      makushitaRate: total > 0 ? reachedMakushita / total : 0,
      juryoRate: total > 0 ? reachedJuryo / total : 0,
      sekitoriRate: total > 0 ? reachedJuryo / total : 0, // alias
      makuuchiRate: total > 0 ? reachedMakuuchi / total : 0,
      sanyakuRate: total > 0 ? reachedSanyaku / total : 0,
      ozekiRate: total > 0 ? reachedOzeki / total : 0,
      yokozunaRate: total > 0 ? reachedYokozuna / total : 0,
    },
    highestRankDistribution: highestRankRates,
    careerBashoBuckets: careerBashoBucketRates,
    careerWinRate: {
      mean: careerWinRateVals.length > 0 ? careerWinRateVals.reduce((s, v) => s + v, 0) / careerWinRateVals.length : null,
      p10: quantile(careerWinRateVals, 0.1),
      p50: quantile(careerWinRateVals, 0.5),
      p90: quantile(careerWinRateVals, 0.9),
      buckets: winRateBucketRates,
    },
    careerLength: careerLengthStats,
    firstReach: {
      makushita: fr('firstMakushitaBasho'),
      juryo: fr('firstJuryoBasho'),
      makuuchi: fr('firstMakuuchiBasho'),
      sanyaku: fr('firstSanyakuBasho'),
      ozeki: fr('firstOzekiBasho'),
      yokozuna: fr('firstYokozunaBasho'),
    },
    divisionTenure,
    perDivisionWinRate,
    perDivisionKachikoshiRate,
    lower7WinsRates,
    sek15WinsRates,
    pipelineRates,
  };
};

const loadAggregate = ({ rebuild = false } = {}) => {
  if (!rebuild && fs.existsSync(CACHE_PATH)) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (cached && cached.meta && cached.complete) return cached;
    } catch (_e) {
      // fall through to rebuild
    }
  }

  if (!fs.existsSync(SOURCE_BASHO_RECORDS)) {
    throw new Error(`Source not found: ${SOURCE_BASHO_RECORDS}`);
  }

  const raw = JSON.parse(fs.readFileSync(SOURCE_BASHO_RECORDS, 'utf8'));
  const byRikishi = new Map();
  for (const rec of raw) {
    const id = rec.rikishiId;
    if (!byRikishi.has(id)) byRikishi.set(id, []);
    byRikishi.get(id).push(rec);
  }

  const careersAll = [];
  const careersComplete = [];
  for (const [, recs] of byRikishi) {
    const c = buildCareer(recs);
    careersAll.push(c);
    if (c.lastBashoId && c.lastBashoId < ACTIVE_CUTOFF_BASHO_ID) careersComplete.push(c);
  }

  // boundary KPIs from existing aggregate
  let boundary = null;
  if (fs.existsSync(SOURCE_SEKITORI_BOUNDARY)) {
    try { boundary = JSON.parse(fs.readFileSync(SOURCE_SEKITORI_BOUNDARY, 'utf8')); } catch (_e) {}
  }

  // long-range rank movement aggregate (just record meta)
  let longRangeMeta = null;
  if (fs.existsSync(SOURCE_LONG_RANGE)) {
    try {
      const lr = JSON.parse(fs.readFileSync(SOURCE_LONG_RANGE, 'utf8'));
      longRangeMeta = lr.meta || null;
    } catch (_e) {}
  }

  const result = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'sumo-api-db/data/analysis/basho_records_sumo_api_196007_202603.json',
      eraRange: '1960-07 .. 2026-03',
      activeCutoffBashoId: ACTIVE_CUTOFF_BASHO_ID,
      uniqueRikishi: byRikishi.size,
      sampleAll: careersAll.length,
      sampleComplete: careersComplete.length,
      ageDataAvailable: false,
      ageDataNote: 'birthdate / debut age fields are not available in basho_records — age KPIs marked null',
      sources: {
        bashoRecords: 'sumo-api-db/data/analysis/basho_records_sumo_api_196007_202603.json',
        sekitoriBoundary: 'sumo-api-db/data/analysis/sekitori_boundary_realdata.json',
        longRange: 'sumo-api-db/data/analysis/game_calibration_long_range.json',
        heiseiCohort: 'sumo-db/data/analysis/career_calibration_1965plus.json',
      },
    },
    cohorts: {
      all: aggregateCareers(careersAll, 'all (1960-07..2026-03, includes active)'),
      complete: aggregateCareers(careersComplete, `complete (lastBasho < ${ACTIVE_CUTOFF_BASHO_ID})`),
    },
    boundary,
    longRangeMeta,
    complete: true,
  };

  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(result, null, 2), 'utf8');
  return result;
};

if (require.main === module) {
  const rebuild = process.argv.includes('--rebuild');
  console.time('aggregate');
  const out = loadAggregate({ rebuild });
  console.timeEnd('aggregate');
  console.log(`unique rikishi: ${out.meta.uniqueRikishi}`);
  console.log(`complete-career sample: ${out.meta.sampleComplete}`);
  console.log(`cached at: ${CACHE_PATH}`);
}

module.exports = {
  loadAggregate,
  CACHE_PATH,
  ACTIVE_CUTOFF_BASHO_ID,
  HIGHEST_BUCKETS,
  bucketIndex,
  recordHighestBucket,
  careerBashoBucket,
  winRateBucket,
  quantile,
  distributionRates,
};
