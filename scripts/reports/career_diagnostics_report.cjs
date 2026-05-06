// Diagnostic-only report for sekitori pipeline + washout retirement analysis.
// Reads career observations and aggregates new diagnostic metrics.
// No simulation logic changed; no balance values modified.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');

const WORKER_PATH = require.resolve('./_shared/diagnostics_worker.cjs');

const RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 400);
const POPULATION_KIND = process.env.REALISM_POPULATION_KIND || 'historical-like-career';
const POPULATION_PRESET = process.env.REALISM_POPULATION_PRESET || 'historical-like-v2-high';
const REPORT_KIND = (process.argv[2] || '--all').replace(/^--/, '');

const PIPELINE_MD = path.join('docs', 'balance', 'sekitori-pipeline-diagnostics.md');
const PIPELINE_JSON = path.join('.tmp', 'sekitori-pipeline-diagnostics.json');
const WASHOUT_MD = path.join('docs', 'balance', 'washout-retirement-diagnostics.md');
const WASHOUT_JSON = path.join('.tmp', 'washout-retirement-diagnostics.json');

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const pct = (numerator, denominator) =>
  denominator > 0 ? numerator / denominator : 0;
const toPct = (value) => (Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : 'n/a');
const toFixed = (value, digits = 2) =>
  Number.isFinite(value) ? value.toFixed(digits) : 'n/a';

const quantile = (values, ratio) => {
  if (!values.length) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const runParallel = (runs) =>
  new Promise((resolve, reject) => {
    const maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, 16, runs));
    const features = [];
    let nextIndex = 0;
    let active = 0;
    let completed = 0;
    let failed = false;

    const maybeFinish = () => {
      if (failed || completed !== runs || active !== 0) return;
      resolve(features);
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
        worker.on('message', (message) => features.push(message));
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
            console.log(`diagnostics: ${completed}/${runs}`);
          }
          launchNext();
          maybeFinish();
        });
      }
    };

    console.log(`Starting diagnostics pool with ${maxWorkers} workers (${POPULATION_PRESET}, ${runs} runs)...`);
    launchNext();
  });

const careerBashoBucket = (count) => {
  if (count < 12) return '<12';
  if (count < 24) return '12-23';
  if (count < 36) return '24-35';
  if (count < 60) return '36-59';
  return '60+';
};

const groupBy = (items, key) => {
  const out = {};
  for (const item of items) {
    const value = key(item) ?? 'unknown';
    if (!out[value]) out[value] = [];
    out[value].push(item);
  }
  return out;
};

const distributionOf = (items, key) => {
  const groups = groupBy(items, key);
  const total = items.length;
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([k, v]) => [k, { count: v.length, rate: pct(v.length, total) }]),
  );
};

const computePipelineDiagnostics = (features) => {
  const sample = features.length;
  const reachedMakushita = features.filter((f) => f.reachedMakushita);
  const reachedMakushitaUpper = features.filter((f) => f.reachedMakushitaUpper);
  const reachedJuryo = features.filter((f) => f.reachedJuryo);
  const reachedMakuuchi = features.filter((f) => f.reachedMakuuchi);

  const highestMakushita = features.filter((f) => f.highestRankBucket === '幕下');
  const highestJuryo = features.filter((f) => f.highestRankBucket === '十両');

  const firstMakushitaBashos = reachedMakushita.map((f) => f.firstMakushitaBasho).filter(Number.isFinite);
  const firstJuryoBashos = reachedJuryo.map((f) => f.firstJuryoBasho).filter(Number.isFinite);
  const firstMakuuchiBashos = reachedMakuuchi.map((f) => f.firstMakuuchiBasho).filter(Number.isFinite);

  const makushitaTenures = reachedMakushita.map((f) => f.makushitaCount);
  const juryoTenures = reachedJuryo.map((f) => f.juryoCount);

  const juryoPromotionCandidates = features.reduce((s, f) => s + (f.juryoPromotionCandidate || 0), 0);
  const juryoPromotionPassedOver = features.reduce((s, f) => s + (f.juryoPromotionPassedOver || 0), 0);

  const fallJuryo5 = reachedJuryo.filter((f) => f.fallBackToMakushitaWithin5OfJuryo === true).length;
  const fallMakuuchi5 = reachedMakuuchi.filter((f) => f.fallBackToJuryoWithin5OfMakuuchi === true).length;

  const sekitoriWinRates = reachedJuryo
    .map((f) => f.sekitoriWinRate)
    .filter((v) => Number.isFinite(v));
  const sekitoriWinRateMean =
    sekitoriWinRates.length > 0 ? sekitoriWinRates.reduce((a, b) => a + b, 0) / sekitoriWinRates.length : null;

  const byAptitude = groupBy(features, (f) => f.aptitudeTier);
  const byEntryPath = groupBy(features, (f) => f.entryPath);
  const byCareerBand = groupBy(features, (f) => f.careerBand ?? 'unknown');
  const byGrowthType = groupBy(features, (f) => f.growthType ?? 'unknown');
  const byRetirementProfile = groupBy(features, (f) => f.retirementProfile ?? 'unknown');

  const breakdown = (groups) =>
    Object.fromEntries(
      Object.entries(groups).map(([key, list]) => [
        key,
        {
          count: list.length,
          reachedMakushitaRate: pct(list.filter((f) => f.reachedMakushita).length, list.length),
          reachedJuryoRate: pct(list.filter((f) => f.reachedJuryo).length, list.length),
          reachedMakuuchiRate: pct(list.filter((f) => f.reachedMakuuchi).length, list.length),
          highestMakushitaRate: pct(list.filter((f) => f.highestRankBucket === '幕下').length, list.length),
          highestJuryoRate: pct(list.filter((f) => f.highestRankBucket === '十両').length, list.length),
          highestMakuuchiRate: pct(list.filter((f) => f.highestRankBucket === '前頭').length, list.length),
        },
      ]),
    );

  // aptitudeTier × careerBand 交差集計
  const crossTabTierBand = {};
  for (const [tier, tierList] of Object.entries(byAptitude)) {
    crossTabTierBand[tier] = breakdown(groupBy(tierList, (f) => f.careerBand ?? 'unknown'));
  }

  // aptitudeTier × growthType 交差集計
  const crossTabTierGrowth = {};
  for (const [tier, tierList] of Object.entries(byAptitude)) {
    crossTabTierGrowth[tier] = breakdown(groupBy(tierList, (f) => f.growthType ?? 'unknown'));
  }

  // aptitudeTier × retirementProfile 交差集計
  const crossTabTierRetirement = {};
  for (const [tier, tierList] of Object.entries(byAptitude)) {
    crossTabTierRetirement[tier] = breakdown(groupBy(tierList, (f) => f.retirementProfile ?? 'unknown'));
  }

  // aptitudeTier × entryPath × careerBand 3段集計 (Bのみ詳細)
  const bTierFeatures = byAptitude['B'] ?? [];
  const bTierByBand = breakdown(groupBy(bTierFeatures, (f) => f.careerBand ?? 'unknown'));
  const bTierByGrowth = breakdown(groupBy(bTierFeatures, (f) => f.growthType ?? 'unknown'));
  const bTierByPath = breakdown(groupBy(bTierFeatures, (f) => f.entryPath ?? 'unknown'));
  const bTierByRetirement = breakdown(groupBy(bTierFeatures, (f) => f.retirementProfile ?? 'unknown'));

  return {
    sample,
    reach: {
      makushitaReachRate: pct(reachedMakushita.length, sample),
      makushitaUpperReachRate: pct(reachedMakushitaUpper.length, sample),
      juryoReachRate: pct(reachedJuryo.length, sample),
      makuuchiReachRate: pct(reachedMakuuchi.length, sample),
      makushitaToJuryoRate: pct(reachedJuryo.length, reachedMakushita.length),
      juryoToMakuuchiRate: pct(reachedMakuuchi.length, reachedJuryo.length),
      makushitaUpperToJuryoMissRate: pct(
        reachedMakushitaUpper.filter((f) => !f.reachedJuryo).length,
        reachedMakushitaUpper.length,
      ),
    },
    firstReachQuantiles: {
      firstMakushita: { p10: quantile(firstMakushitaBashos, 0.1), p50: quantile(firstMakushitaBashos, 0.5), p90: quantile(firstMakushitaBashos, 0.9) },
      firstJuryo: { p10: quantile(firstJuryoBashos, 0.1), p50: quantile(firstJuryoBashos, 0.5), p90: quantile(firstJuryoBashos, 0.9) },
      firstMakuuchi: { p10: quantile(firstMakuuchiBashos, 0.1), p50: quantile(firstMakuuchiBashos, 0.5), p90: quantile(firstMakuuchiBashos, 0.9) },
    },
    tenure: {
      makushita: { p50: quantile(makushitaTenures, 0.5), p90: quantile(makushitaTenures, 0.9) },
      juryo: { p50: quantile(juryoTenures, 0.5), p90: quantile(juryoTenures, 0.9) },
    },
    highestMakushitaProfile: {
      total: highestMakushita.length,
      makushitaUpperReached: highestMakushita.filter((f) => f.reachedMakushitaUpper).length,
      makushitaUpperReachedRate: pct(
        highestMakushita.filter((f) => f.reachedMakushitaUpper).length,
        highestMakushita.length,
      ),
    },
    highestJuryoProfile: {
      total: highestJuryo.length,
      juryoTenureP50: quantile(highestJuryo.map((f) => f.juryoCount), 0.5),
      juryoTenureP90: quantile(highestJuryo.map((f) => f.juryoCount), 0.9),
    },
    fallBack: {
      juryoFallBackWithin5Count: fallJuryo5,
      juryoFallBackWithin5Rate: pct(fallJuryo5, reachedJuryo.length),
      makuuchiFallBackWithin5Count: fallMakuuchi5,
      makuuchiFallBackWithin5Rate: pct(fallMakuuchi5, reachedMakuuchi.length),
    },
    promotionReview: {
      juryoCandidateBashoCount: juryoPromotionCandidates,
      juryoPassedOverBashoCount: juryoPromotionPassedOver,
      passOverRate: pct(juryoPromotionPassedOver, juryoPromotionCandidates),
    },
    sekitoriWinRateMean,
    byAptitudeTier: breakdown(byAptitude),
    byEntryPath: breakdown(byEntryPath),
    byCareerBand: breakdown(byCareerBand),
    byGrowthType: breakdown(byGrowthType),
    byRetirementProfile: breakdown(byRetirementProfile),
    crossTabTierBand,
    crossTabTierGrowth,
    crossTabTierRetirement,
    bTierAnalysis: {
      total: bTierFeatures.length,
      byBand: bTierByBand,
      byGrowth: bTierByGrowth,
      byEntryPath: bTierByPath,
      byRetirement: bTierByRetirement,
    },
  };
};

const computeWashoutDiagnostics = (features) => {
  const sample = features.length;
  const buckets = ['<12', '12-23', '24-35', '36-59', '60+'];
  const grouped = groupBy(features, (f) => careerBashoBucket(f.careerBasho));

  const bucketSummary = {};
  for (const bucket of buckets) {
    const list = grouped[bucket] ?? [];
    const reasonDist = distributionOf(list, (f) => f.retirementReasonCode);
    bucketSummary[bucket] = {
      count: list.length,
      rate: pct(list.length, sample),
      retirementReasons: reasonDist,
      retiredAfterKachikoshiRate: pct(list.filter((f) => f.retiredAfterKachikoshi).length, list.length),
      lastBashoKachikoshiRate: pct(list.filter((f) => f.lastBashoKachikoshi === true).length, list.length),
      careerWinRateMean:
        list.length > 0
          ? list.reduce((s, f) => s + (Number.isFinite(f.careerWinRate) ? f.careerWinRate : 0), 0) / list.length
          : null,
      lowerStagnationBashoP50: quantile(list.map((f) => f.lowerStagnationBasho), 0.5),
      lowerStagnationBashoP90: quantile(list.map((f) => f.lowerStagnationBasho), 0.9),
    };
  }

  const earlyWashout = (grouped['<12'] ?? []).concat(grouped['12-23'] ?? []);
  const earlyWashoutInitial = {
    aptitudeTier: distributionOf(earlyWashout, (f) => f.aptitudeTier),
    entryPath: distributionOf(earlyWashout, (f) => f.entryPath),
    entryAge: distributionOf(earlyWashout, (f) => String(f.entryAge ?? 'unknown')),
    bodyType: distributionOf(earlyWashout, (f) => f.bodyType),
    temperament: distributionOf(earlyWashout, (f) => f.temperament),
  };

  const washoutLt12 = grouped['<12'] ?? [];
  const washout1223 = grouped['12-23'] ?? [];
  const reasonShare = (list, code) =>
    pct(list.filter((f) => f.retirementReasonCode === code).length, list.length);

  const lowWinLongCareer = features.filter((f) => f.lowWinLongCareer);

  return {
    sample,
    careerBashoBuckets: bucketSummary,
    earlyWashoutInitialDistribution: earlyWashoutInitial,
    keyReasonShares: {
      lt12: {
        SPIRIT: reasonShare(washoutLt12, 'SPIRIT'),
        MAKEKOSHI_STREAK: reasonShare(washoutLt12, 'MAKEKOSHI_STREAK'),
        CHRONIC_INJURY: reasonShare(washoutLt12, 'CHRONIC_INJURY'),
      },
      bucket1223: {
        SPIRIT: reasonShare(washout1223, 'SPIRIT'),
        MAKEKOSHI_STREAK: reasonShare(washout1223, 'MAKEKOSHI_STREAK'),
        CHRONIC_INJURY: reasonShare(washout1223, 'CHRONIC_INJURY'),
      },
    },
    longestNoMaxRankUpdate: {
      p50: quantile(features.map((f) => f.longestNoMaxRankUpdate), 0.5),
      p90: quantile(features.map((f) => f.longestNoMaxRankUpdate), 0.9),
    },
    lowWinLongCareer: {
      count: lowWinLongCareer.length,
      rate: pct(lowWinLongCareer.length, sample),
    },
    lowerStagnation: {
      jonokuchiP50: quantile(features.map((f) => f.jonokuchiCount), 0.5),
      jonokuchiP90: quantile(features.map((f) => f.jonokuchiCount), 0.9),
      jonidanP50: quantile(features.map((f) => f.jonidanCount), 0.5),
      jonidanP90: quantile(features.map((f) => f.jonidanCount), 0.9),
      sandanmeP50: quantile(features.map((f) => f.sandanmeCount), 0.5),
      sandanmeP90: quantile(features.map((f) => f.sandanmeCount), 0.9),
    },
  };
};

const renderPipelineMd = (diag, meta) => {
  const lines = [];
  lines.push('# Sekitori Pipeline Diagnostics');
  lines.push('');
  lines.push('診断専用レポート (logic変更なし)。幕下〜十両〜幕内の到達/昇進/陥落特性を可視化します。');
  lines.push('');
  lines.push('## Run Metadata');
  lines.push('');
  lines.push(`- generatedAt: ${meta.generatedAt}`);
  lines.push(`- sample: ${diag.sample}`);
  lines.push(`- populationKind: ${meta.populationKind}`);
  lines.push(`- populationPreset: ${meta.populationPreset}`);
  lines.push('');
  lines.push('## 到達率');
  lines.push('');
  lines.push(`- 幕下到達率: ${toPct(diag.reach.makushitaReachRate)}`);
  lines.push(`- 幕下上位(<=5)到達率: ${toPct(diag.reach.makushitaUpperReachRate)}`);
  lines.push(`- 十両到達率: ${toPct(diag.reach.juryoReachRate)}`);
  lines.push(`- 幕内到達率: ${toPct(diag.reach.makuuchiReachRate)}`);
  lines.push(`- 幕下→十両 到達率: ${toPct(diag.reach.makushitaToJuryoRate)}`);
  lines.push(`- 十両→幕内 到達率: ${toPct(diag.reach.juryoToMakuuchiRate)}`);
  lines.push(`- 幕下上位到達者の十両未昇進率: ${toPct(diag.reach.makushitaUpperToJuryoMissRate)}`);
  lines.push('');
  lines.push('## 初到達場所数 (P10/P50/P90)');
  lines.push('');
  const fr = diag.firstReachQuantiles;
  lines.push(`- 初幕下: ${toFixed(fr.firstMakushita.p10, 0)} / ${toFixed(fr.firstMakushita.p50, 0)} / ${toFixed(fr.firstMakushita.p90, 0)}`);
  lines.push(`- 初十両: ${toFixed(fr.firstJuryo.p10, 0)} / ${toFixed(fr.firstJuryo.p50, 0)} / ${toFixed(fr.firstJuryo.p90, 0)}`);
  lines.push(`- 初幕内: ${toFixed(fr.firstMakuuchi.p10, 0)} / ${toFixed(fr.firstMakuuchi.p50, 0)} / ${toFixed(fr.firstMakuuchi.p90, 0)}`);
  lines.push('');
  lines.push('## 在位場所数 (P50/P90)');
  lines.push('');
  lines.push(`- 幕下: ${toFixed(diag.tenure.makushita.p50, 0)} / ${toFixed(diag.tenure.makushita.p90, 0)}`);
  lines.push(`- 十両: ${toFixed(diag.tenure.juryo.p50, 0)} / ${toFixed(diag.tenure.juryo.p90, 0)}`);
  lines.push('');
  lines.push('## 最高位プロファイル');
  lines.push('');
  lines.push(`- 最高位幕下: ${diag.highestMakushitaProfile.total} (うち幕下上位到達 ${diag.highestMakushitaProfile.makushitaUpperReached} / ${toPct(diag.highestMakushitaProfile.makushitaUpperReachedRate)})`);
  lines.push(`- 最高位十両: ${diag.highestJuryoProfile.total} (juryo在位 P50/P90 = ${toFixed(diag.highestJuryoProfile.juryoTenureP50, 0)} / ${toFixed(diag.highestJuryoProfile.juryoTenureP90, 0)})`);
  lines.push('');
  lines.push('## 陥落 (5場所以内)');
  lines.push('');
  lines.push(`- 十両到達後5場所以内に幕下陥落: ${diag.fallBack.juryoFallBackWithin5Count} (${toPct(diag.fallBack.juryoFallBackWithin5Rate)})`);
  lines.push(`- 幕内到達後5場所以内に十両陥落: ${diag.fallBack.makuuchiFallBackWithin5Count} (${toPct(diag.fallBack.makuuchiFallBackWithin5Rate)})`);
  lines.push('');
  lines.push('## 十両→幕内 昇進審査 (frame.promotionReview)');
  lines.push('');
  lines.push(`- 候補場所数: ${diag.promotionReview.juryoCandidateBashoCount}`);
  lines.push(`- 見送り場所数: ${diag.promotionReview.juryoPassedOverBashoCount}`);
  lines.push(`- 見送り率: ${toPct(diag.promotionReview.passOverRate)}`);
  lines.push('');
  lines.push(`- 十両到達者 平均勝率: ${toPct(diag.sekitoriWinRateMean)}`);
  lines.push('');
  lines.push('## aptitudeTier別');
  lines.push('');
  lines.push('| tier | count | 幕下到達 | 十両到達 | 幕内到達 | 最高位幕下 | 最高位十両 | 最高位前頭 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');
  for (const [tier, row] of Object.entries(diag.byAptitudeTier)) {
    lines.push(`| ${tier} | ${row.count} | ${toPct(row.reachedMakushitaRate)} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} | ${toPct(row.highestMakushitaRate)} | ${toPct(row.highestJuryoRate)} | ${toPct(row.highestMakuuchiRate)} |`);
  }
  lines.push('');
  lines.push('## entryPath別');
  lines.push('');
  lines.push('| path | count | 幕下到達 | 十両到達 | 幕内到達 |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const [path, row] of Object.entries(diag.byEntryPath)) {
    lines.push(`| ${path} | ${row.count} | ${toPct(row.reachedMakushitaRate)} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} |`);
  }
  lines.push('');
  lines.push('## careerBand別 (aptitudeTier以外の強さ決定要素)');
  lines.push('');
  lines.push('> careerBand は aptitudeTier とは独立に rollCareerBandForAptitude でロールされる。');
  lines.push('> ELITE/STRONG: abilityBias+/growthBias+ / GRINDER/WASHOUT: abilityBias-/growthBias- で到達率が変わる。');
  lines.push('');
  lines.push('| band | count | 幕下到達 | 十両到達 | 幕内到達 | 最高位幕下 | 最高位前頭 |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const [band, row] of Object.entries(diag.byCareerBand || {})) {
    lines.push(`| ${band} | ${row.count} | ${toPct(row.reachedMakushitaRate)} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} | ${toPct(row.highestMakushitaRate)} | ${toPct(row.highestMakuuchiRate)} |`);
  }
  lines.push('');
  lines.push('## growthType別');
  lines.push('');
  lines.push('> EARLY: peakEnd=25 / NORMAL: peakEnd=29 / LATE: peakEnd=33 / GENIUS: peakEnd=30');
  lines.push('');
  lines.push('| growthType | count | 幕下到達 | 十両到達 | 幕内到達 | 最高位前頭 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [gt, row] of Object.entries(diag.byGrowthType || {})) {
    lines.push(`| ${gt} | ${row.count} | ${toPct(row.reachedMakushitaRate)} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} | ${toPct(row.highestMakuuchiRate)} |`);
  }
  lines.push('');
  lines.push('## retirementProfile別');
  lines.push('');
  lines.push('> EARLY_EXIT: 引退確率 ×1.08 / STANDARD: ×1.0 / IRONMAN: ×0.65 (シコナ+stable+ageのハッシュで決定)');
  lines.push('');
  lines.push('| profile | count | 幕下到達 | 十両到達 | 幕内到達 | 最高位前頭 |');
  lines.push('|---|---:|---:|---:|---:|---:|');
  for (const [rp, row] of Object.entries(diag.byRetirementProfile || {})) {
    lines.push(`| ${rp} | ${row.count} | ${toPct(row.reachedMakushitaRate)} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} | ${toPct(row.highestMakuuchiRate)} |`);
  }
  lines.push('');
  lines.push('## aptitudeTier × careerBand 交差集計');
  lines.push('');
  lines.push('> B tier の中で幕下止まり型 (GRINDER/WASHOUT) と関取候補型 (STANDARD/STRONG) の分布を確認する。');
  lines.push('');
  for (const [tier, bandBreakdown] of Object.entries(diag.crossTabTierBand || {})) {
    lines.push(`### tier=${tier}`);
    lines.push('');
    lines.push('| band | count | 十両到達 | 幕内到達 | 最高位幕下 |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const [band, row] of Object.entries(bandBreakdown)) {
      lines.push(`| ${band} | ${row.count} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} | ${toPct(row.highestMakushitaRate)} |`);
    }
    lines.push('');
  }
  lines.push('## aptitudeTier × growthType 交差集計');
  lines.push('');
  for (const [tier, growthBreakdown] of Object.entries(diag.crossTabTierGrowth || {})) {
    lines.push(`### tier=${tier}`);
    lines.push('');
    lines.push('| growthType | count | 十両到達 | 幕内到達 |');
    lines.push('|---|---:|---:|---:|');
    for (const [gt, row] of Object.entries(growthBreakdown)) {
      lines.push(`| ${gt} | ${row.count} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} |`);
    }
    lines.push('');
  }
  lines.push('## aptitudeTier × retirementProfile 交差集計');
  lines.push('');
  for (const [tier, rpBreakdown] of Object.entries(diag.crossTabTierRetirement || {})) {
    lines.push(`### tier=${tier}`);
    lines.push('');
    lines.push('| retirementProfile | count | 十両到達 | 幕内到達 |');
    lines.push('|---|---:|---:|---:|');
    for (const [rp, row] of Object.entries(rpBreakdown)) {
      lines.push(`| ${rp} | ${row.count} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} |`);
    }
    lines.push('');
  }
  lines.push('## B tier 詳細分析');
  lines.push('');
  lines.push('> B tier 内部の幕下吸着要因を探る。careerBand/growthType/retirementProfile の分布で差が出るか確認する。');
  lines.push('');
  if (diag.bTierAnalysis) {
    const bt = diag.bTierAnalysis;
    lines.push(`B tier サンプル: ${bt.total}`);
    lines.push('');
    lines.push('### B tier × careerBand');
    lines.push('');
    lines.push('| band | count | 十両到達 | 幕内到達 | 最高位幕下 |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const [band, row] of Object.entries(bt.byBand || {})) {
      lines.push(`| ${band} | ${row.count} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} | ${toPct(row.highestMakushitaRate)} |`);
    }
    lines.push('');
    lines.push('### B tier × growthType');
    lines.push('');
    lines.push('| growthType | count | 十両到達 | 幕内到達 |');
    lines.push('|---|---:|---:|---:|');
    for (const [gt, row] of Object.entries(bt.byGrowth || {})) {
      lines.push(`| ${gt} | ${row.count} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} |`);
    }
    lines.push('');
    lines.push('### B tier × retirementProfile');
    lines.push('');
    lines.push('| retirementProfile | count | 十両到達 | 幕内到達 |');
    lines.push('|---|---:|---:|---:|');
    for (const [rp, row] of Object.entries(bt.byRetirement || {})) {
      lines.push(`| ${rp} | ${row.count} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} |`);
    }
    lines.push('');
    lines.push('### B tier × entryPath');
    lines.push('');
    lines.push('| path | count | 十両到達 | 幕内到達 |');
    lines.push('|---|---:|---:|---:|');
    for (const [path, row] of Object.entries(bt.byEntryPath || {})) {
      lines.push(`| ${path} | ${row.count} | ${toPct(row.reachedJuryoRate)} | ${toPct(row.reachedMakuuchiRate)} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
};

const renderWashoutMd = (diag, meta) => {
  const lines = [];
  lines.push('# Washout / Early Retirement Diagnostics');
  lines.push('');
  lines.push('診断専用レポート (logic変更なし)。短期離脱・中期引退の特性を可視化します。');
  lines.push('');
  lines.push('## Run Metadata');
  lines.push('');
  lines.push(`- generatedAt: ${meta.generatedAt}`);
  lines.push(`- sample: ${diag.sample}`);
  lines.push(`- populationKind: ${meta.populationKind}`);
  lines.push(`- populationPreset: ${meta.populationPreset}`);
  lines.push('');
  lines.push('## careerBasho bucket × retirementReason');
  lines.push('');
  for (const [bucket, row] of Object.entries(diag.careerBashoBuckets)) {
    lines.push(`### ${bucket} (${row.count}, ${toPct(row.rate)})`);
    lines.push('');
    lines.push(`- 通算勝率平均: ${toPct(row.careerWinRateMean)}`);
    lines.push(`- 直近場所勝ち越し率: ${toPct(row.lastBashoKachikoshiRate)}`);
    lines.push(`- 直近勝ち越し後引退率 (retiredAfterKachikoshi): ${toPct(row.retiredAfterKachikoshiRate)}`);
    lines.push(`- 下位停滞場所数 P50/P90: ${toFixed(row.lowerStagnationBashoP50, 0)} / ${toFixed(row.lowerStagnationBashoP90, 0)}`);
    lines.push('- retirementReason 内訳:');
    for (const [code, info] of Object.entries(row.retirementReasons)) {
      lines.push(`  - ${code}: ${info.count} (${toPct(info.rate)})`);
    }
    lines.push('');
  }
  lines.push('## 早期離脱 (<24場所) の初期条件分布');
  lines.push('');
  for (const [field, dist] of Object.entries(diag.earlyWashoutInitialDistribution)) {
    lines.push(`- ${field}:`);
    for (const [k, info] of Object.entries(dist)) {
      lines.push(`  - ${k}: ${info.count} (${toPct(info.rate)})`);
    }
  }
  lines.push('');
  lines.push('## 主要 retirementReason 比率');
  lines.push('');
  lines.push(`- <12 SPIRIT: ${toPct(diag.keyReasonShares.lt12.SPIRIT)} / MAKEKOSHI_STREAK: ${toPct(diag.keyReasonShares.lt12.MAKEKOSHI_STREAK)} / CHRONIC_INJURY: ${toPct(diag.keyReasonShares.lt12.CHRONIC_INJURY)}`);
  lines.push(`- 12-23 SPIRIT: ${toPct(diag.keyReasonShares.bucket1223.SPIRIT)} / MAKEKOSHI_STREAK: ${toPct(diag.keyReasonShares.bucket1223.MAKEKOSHI_STREAK)} / CHRONIC_INJURY: ${toPct(diag.keyReasonShares.bucket1223.CHRONIC_INJURY)}`);
  lines.push('');
  lines.push('## 最高位更新なし期間 (longestNoMaxRankUpdate)');
  lines.push('');
  lines.push(`- P50/P90: ${toFixed(diag.longestNoMaxRankUpdate.p50, 0)} / ${toFixed(diag.longestNoMaxRankUpdate.p90, 0)}`);
  lines.push('');
  lines.push('## 低勝率 (<45%) かつ12場所以上の力士');
  lines.push('');
  lines.push(`- ${diag.lowWinLongCareer.count} (${toPct(diag.lowWinLongCareer.rate)})`);
  lines.push('');
  lines.push('## 下位番付停滞場所数 P50/P90');
  lines.push('');
  lines.push(`- 序ノ口: ${toFixed(diag.lowerStagnation.jonokuchiP50, 0)} / ${toFixed(diag.lowerStagnation.jonokuchiP90, 0)}`);
  lines.push(`- 序二段: ${toFixed(diag.lowerStagnation.jonidanP50, 0)} / ${toFixed(diag.lowerStagnation.jonidanP90, 0)}`);
  lines.push(`- 三段目: ${toFixed(diag.lowerStagnation.sandanmeP50, 0)} / ${toFixed(diag.lowerStagnation.sandanmeP90, 0)}`);
  lines.push('');
  return lines.join('\n');
};

const main = async () => {
  if (!Number.isFinite(RUNS) || RUNS <= 0) {
    throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
  }
  const generatedAt = new Date().toISOString();
  const features = await runParallel(RUNS);
  const meta = {
    generatedAt,
    populationKind: POPULATION_KIND,
    populationPreset: POPULATION_PRESET,
    sample: features.length,
  };

  if (REPORT_KIND === 'pipeline' || REPORT_KIND === 'all') {
    const diag = computePipelineDiagnostics(features);
    const payload = { meta, diagnostics: diag };
    writeFile(PIPELINE_MD, renderPipelineMd(diag, meta));
    writeFile(PIPELINE_JSON, JSON.stringify(payload, null, 2));
    console.log(`pipeline diagnostics written: ${PIPELINE_MD} / ${PIPELINE_JSON}`);
  }
  if (REPORT_KIND === 'washout' || REPORT_KIND === 'all') {
    const diag = computeWashoutDiagnostics(features);
    const payload = { meta, diagnostics: diag };
    writeFile(WASHOUT_MD, renderWashoutMd(diag, meta));
    writeFile(WASHOUT_JSON, JSON.stringify(payload, null, 2));
    console.log(`washout diagnostics written: ${WASHOUT_MD} / ${WASHOUT_JSON}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
