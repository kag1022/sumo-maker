const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const {
  BUNDLE_PATH,
  CAREER_TARGET_PATH,
  loadCalibrationBundle,
} = require('./_shared/calibrationTargets.cjs');
const { loadObservationModule } = require('./_shared/observation_module.cjs');

const WORKER_PATH = require.resolve('./_shared/realism_worker.cjs');
const RUN_KIND = process.env.REALISM_RUN_KIND || 'full';
const DEFAULT_RUNS_BY_MODE = {
  quick: 100,
  full: 1200,
  aptitude: 150,
  population: 400,
};
const BASE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || DEFAULT_RUNS_BY_MODE[RUN_KIND] || DEFAULT_RUNS_BY_MODE.full);
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT ?? null;
const SEED_FORMULA = '(((runIndex + 1) * 2654435761) + 97) >>> 0';
const DEFAULT_POPULATION_KIND_BY_MODE = {
  quick: 'player-scout-default',
  full: 'historical-like-career',
  aptitude: 'player-scout-default',
  population: 'historical-like-career',
};
const SUPPORTED_POPULATION_KINDS = new Set(['player-scout-default', 'historical-like-career']);
const POPULATION_KIND = process.env.REALISM_POPULATION_KIND || DEFAULT_POPULATION_KIND_BY_MODE[RUN_KIND] || 'player-scout-default';
if (!SUPPORTED_POPULATION_KINDS.has(POPULATION_KIND)) {
  throw new Error(`Invalid REALISM_POPULATION_KIND: ${POPULATION_KIND}`);
}
const SUPPORTED_POPULATION_PRESETS = new Set([
  'player-scout-default',
  'historical-like-v1',
  'historical-like-v2-low',
  'historical-like-v2-mid',
  'historical-like-v2-high',
]);
const DEFAULT_POPULATION_PRESET = POPULATION_KIND === 'historical-like-career'
  ? 'historical-like-v1'
  : 'player-scout-default';
const POPULATION_PRESET = process.env.REALISM_POPULATION_PRESET || DEFAULT_POPULATION_PRESET;
if (!SUPPORTED_POPULATION_PRESETS.has(POPULATION_PRESET)) {
  throw new Error(`Invalid REALISM_POPULATION_PRESET: ${POPULATION_PRESET}`);
}
const POPULATION_TUNING_PRESETS = (process.env.REALISM_POPULATION_TUNING_PRESETS || [
  'historical-like-v1',
  'historical-like-v2-low',
  'historical-like-v2-mid',
  'historical-like-v2-high',
].join(','))
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);
for (const preset of POPULATION_TUNING_PRESETS) {
  if (!SUPPORTED_POPULATION_PRESETS.has(preset) || preset === 'player-scout-default') {
    throw new Error(`Invalid population tuning preset: ${preset}`);
  }
}
const DEFAULT_START_YEAR = 2026;
const DEFAULT_SIMULATION_MODEL_VERSION = 'v3';
const OUTPUTS = {
  quick: {
    reportPath: path.join('docs', 'balance', 'realism-quick.md'),
    jsonPath: path.join('.tmp', 'realism-quick.json'),
  },
  full: {
    reportPath: path.join('docs', 'balance', 'realism-monte-carlo.md'),
    jsonPath: path.join('.tmp', 'realism-monte-carlo.json'),
  },
  aptitude: {
    reportPath: path.join('docs', 'balance', 'realism-aptitude.md'),
    jsonPath: path.join('.tmp', 'realism-aptitude.json'),
  },
  population: {
    reportPath: path.join('docs', 'balance', 'population-tuning.md'),
    jsonPath: path.join('.tmp', 'population-tuning.json'),
  },
};

const REALISM_KPI_GATE = {
  source: 'heuristic',
  careerWinRateMin: 0.49,
  careerWinRateMax: 0.52,
  nonSekitoriCareerWinRateMin: 0.45,
  nonSekitoriCareerWinRateMax: 0.50,
  losingCareerRateMin: 0.25,
  losingCareerRateMax: 0.40,
  careerLe35Min: 0.045,
  careerLe35Max: 0.08,
  careerLe30Min: 0.015,
};

const KIMARITE_VARIETY_GATE = {
  source: 'heuristic',
  PUSH: { p50Min: 10, p50Max: 18, p90Max: 28 },
  GRAPPLE: { p50Min: 14, p50Max: 24, p90Max: 34 },
  TECHNIQUE: { p50Min: 18, p50Max: 32, p90Max: 44 },
  variety20RateMin: 0.03,
  variety20RateMax: 0.35,
};

const APTITUDE_GATES = {
  source: 'heuristic',
  lowTierMin: 0.18,
  lowTierMax: 0.22,
  careerLe35Min: 0.05,
  careerLe35Max: 0.08,
  careerLe30Min: 0.015,
};

const APTITUDE_LADDERS = [
  { id: 'ladder1', factors: { C: 0.84, D: 0.68 } },
  { id: 'ladder2', factors: { C: 0.82, D: 0.64 } },
  { id: 'ladder3', factors: { C: 0.8, D: 0.6 } },
];

const CALIBRATION_RATE_TOLERANCE = 0.15;
const CALIBRATION_RATE_ABSOLUTE_FLOOR = 0.035;
const CALIBRATION_ABSOLUTE_TOLERANCE = {
  avgCareerBashoMean: 8,
  avgCareerBashoP50: 8,
  careerWinRateMean: 0.025,
};

const HIGHEST_RANK_BUCKETS = ['横綱', '大関', '三役', '前頭', '十両', '幕下', '三段目', '序二段', '序ノ口'];
const CAREER_BASHO_BUCKETS = ['<12', '12-23', '24-35', '36-59', '60-89', '90-119', '>=120'];
const CAREER_WIN_RATE_BUCKETS = ['<0.35', '0.35-0.39', '0.40-0.44', '0.45-0.49', '0.50-0.54', '0.55-0.59', '0.60-0.64', '>=0.65'];

const toPct = (value) => `${(value * 100).toFixed(2)}%`;
const toPctOrNA = (value) => (Number.isFinite(value) ? toPct(value) : 'n/a');
const toFixedOrNA = (value, digits = 1) => (Number.isFinite(value) ? value.toFixed(digits) : 'n/a');

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const resolvePopulationMetadata = (summaries) => summaries[0]?.population ?? {
  kind: POPULATION_KIND,
  version: 'unknown',
  notes: 'population metadata was not returned by observation summary',
};

const buildRunMetadata = ({
  generatedAt,
  sample,
  bundleId,
  simulationModelVersion,
  targetPath,
  targetSource,
  populationMetadata,
}) => ({
  mode: RUN_KIND,
  sampleSize: sample,
  seedFormula: SEED_FORMULA,
  populationKind: populationMetadata?.kind ?? POPULATION_KIND,
  populationPreset: populationMetadata?.preset ?? POPULATION_PRESET,
  populationVersion: populationMetadata?.version ?? 'unknown',
  populationNotes: populationMetadata?.notes ?? 'n/a',
  startYear: DEFAULT_START_YEAR,
  simulationModelVersion: simulationModelVersion ?? 'unknown',
  generatedAt,
  targetJsonPath: targetPath,
  targetSource,
  gates: {
    realism: { source: REALISM_KPI_GATE.source },
    kimarite: { source: KIMARITE_VARIETY_GATE.source },
    aptitude: { source: APTITUDE_GATES.source },
  },
  compiledAt: COMPILED_AT,
  bundleId: bundleId ?? 'unknown',
});

const buildLightSamples = (summaries) =>
  summaries.map((summary) => ({
    seed: summary.seed,
    entryAge: summary.careerOutcome.entryAge,
    populationPreset: summary.initialPopulation?.populationPreset,
    aptitudeTier: summary.aptitudeTier,
    highestRankBucket: summary.rankOutcome.highestRankBucket,
    careerBasho: summary.careerOutcome.bashoCount,
    retireAge: summary.careerOutcome.retireAge,
    wins: summary.careerOutcome.wins,
    losses: summary.careerOutcome.losses,
    absent: summary.careerOutcome.absent,
    officialWinRate: summary.careerOutcome.officialWinRate,
    effectiveWinRate: summary.careerOutcome.effectiveWinRate,
    reachedSekitori: summary.rankOutcome.isSekitori,
    firstSekitoriBasho: summary.careerOutcome.firstSekitoriBasho ?? null,
    sekitoriBashoCount: summary.careerOutcome.sekitoriBashoCount,
    makuuchiBashoCount: summary.careerOutcome.makuuchiBashoCount,
    totalAbsences: summary.careerOutcome.absent,
    retirementReasonCode: summary.careerOutcome.retirementReasonCode,
    retirementReasonLabel: summary.careerOutcome.retirementReasonLabel,
    retiredAfterKachikoshi: summary.careerOutcome.retiredAfterKachikoshi,
    entryPath: summary.initialPopulation?.entryPath,
    bodySeed: summary.initialPopulation?.bodySeed,
    bodyType: summary.initialPopulation?.bodyType,
    startingHeightCm: summary.initialPopulation?.startingHeightCm,
    startingWeightKg: summary.initialPopulation?.startingWeightKg,
    temperament: summary.initialPopulation?.temperament,
    stableId: summary.initialPopulation?.stableId,
    careerBandLabel: summary.initialPopulation?.careerBandLabel,
  }));

const buildInitialPopulationSummary = (summaries) => {
  const profiles = summaries.map((summary) => summary.initialPopulation).filter(Boolean);
  const sample = profiles.length;
  const countBy = (field) => {
    const counts = {};
    for (const profile of profiles) {
      const key = profile[field] ?? 'unknown';
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return Object.fromEntries(
      Object.entries(counts)
        .sort(([left], [right]) => String(left).localeCompare(String(right), 'ja'))
        .map(([key, count]) => [key, { count, rate: count / Math.max(1, sample) }]),
    );
  };
  const quantiles = (field) => {
    const values = profiles
      .map((profile) => profile[field])
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    if (!values.length) return { p10: Number.NaN, p50: Number.NaN, p90: Number.NaN };
    const at = (ratio) => values[Math.max(0, Math.min(values.length - 1, Math.floor((values.length - 1) * ratio)))];
    return { p10: at(0.1), p50: at(0.5), p90: at(0.9) };
  };
  return {
    sample,
    entryAge: countBy('entryAge'),
    entryPath: countBy('entryPath'),
    aptitudeTier: countBy('aptitudeTier'),
    bodySeed: countBy('bodySeed'),
    bodyType: countBy('bodyType'),
    temperament: countBy('temperament'),
    stableId: countBy('stableId'),
    careerBandLabel: countBy('careerBandLabel'),
    startingHeightCm: quantiles('startingHeightCm'),
    startingWeightKg: quantiles('startingWeightKg'),
  };
};

const normalizeHighestRankTarget = (highestRankTarget = {}) => ({
  横綱: highestRankTarget['横綱'] ?? 0,
  大関: highestRankTarget['大関'] ?? 0,
  三役: (highestRankTarget['関脇'] ?? 0) + (highestRankTarget['小結'] ?? 0),
  前頭: highestRankTarget['前頭'] ?? 0,
  十両: highestRankTarget['十両'] ?? 0,
  幕下: highestRankTarget['幕下'] ?? 0,
  三段目: highestRankTarget['三段目'] ?? 0,
  序二段: highestRankTarget['序二段'] ?? 0,
  序ノ口: highestRankTarget['序ノ口'] ?? 0,
});

const buildBucketComparison = (actualBuckets, targetBuckets, keys) =>
  keys.map((key) => ({
    bucket: key,
    actual: actualBuckets?.[key] ?? 0,
    target: targetBuckets?.[key],
    delta: Number.isFinite(targetBuckets?.[key]) ? (actualBuckets?.[key] ?? 0) - targetBuckets[key] : null,
    mode: Number.isFinite(targetBuckets?.[key]) ? 'compare' : 'observed-only',
  }));

const buildTargetComparisons = (aggregate, careerTarget) => {
  if (!careerTarget) return null;
  const targetBuckets = careerTarget.distributionBuckets ?? {};
  return {
    source: careerTarget.meta?.source ?? 'unknown',
    targetJsonPath: fs.existsSync(BUNDLE_PATH) ? BUNDLE_PATH : CAREER_TARGET_PATH,
    highestRank: buildBucketComparison(
      aggregate.distribution.highestRankBuckets,
      normalizeHighestRankTarget(targetBuckets.highestRank),
      HIGHEST_RANK_BUCKETS,
    ),
    careerBasho: buildBucketComparison(
      aggregate.distribution.careerBashoBuckets,
      targetBuckets.careerBasho ?? {},
      CAREER_BASHO_BUCKETS,
    ),
    careerWinRate: buildBucketComparison(
      aggregate.distribution.careerWinRateBuckets,
      targetBuckets.careerWinRate ?? {},
      CAREER_WIN_RATE_BUCKETS,
    ),
    lowWinLongCareerRate: {
      actual: aggregate.distribution.lowWinLongCareerRate,
      target: careerTarget.longTailSignals?.lowWinLongCareerRate,
      mode: Number.isFinite(careerTarget.longTailSignals?.lowWinLongCareerRate) ? 'compare' : 'observed-only',
    },
  };
};

const buildCalibrationGate = (aggregate, calibrationTarget) => {
  const realism = aggregate.realism;
  const checks = [
    {
      label: '関取率',
      target: calibrationTarget.rankRates.sekitoriRate,
      actual: realism.sekitoriRate,
      tolerance: Math.max(CALIBRATION_RATE_TOLERANCE, CALIBRATION_RATE_ABSOLUTE_FLOOR / calibrationTarget.rankRates.sekitoriRate),
      kind: 'rate',
    },
    {
      label: '幕内率',
      target: calibrationTarget.rankRates.makuuchiRate,
      actual: realism.makuuchiRate,
      tolerance: Math.max(CALIBRATION_RATE_TOLERANCE, CALIBRATION_RATE_ABSOLUTE_FLOOR / calibrationTarget.rankRates.makuuchiRate),
      kind: 'rate',
    },
    {
      label: '三役率',
      target: calibrationTarget.rankRates.sanyakuRate,
      actual: realism.sanyakuRate,
      tolerance: Math.max(CALIBRATION_RATE_TOLERANCE, CALIBRATION_RATE_ABSOLUTE_FLOOR / calibrationTarget.rankRates.sanyakuRate),
      kind: 'rate',
    },
    {
      label: '横綱率',
      target: calibrationTarget.rankRates.yokozunaRate,
      actual: realism.yokozunaRate,
      tolerance: Math.max(CALIBRATION_RATE_TOLERANCE, CALIBRATION_RATE_ABSOLUTE_FLOOR / calibrationTarget.rankRates.yokozunaRate),
      kind: 'rate',
    },
    {
      label: '平均場所数',
      target: calibrationTarget.careerLength.mean,
      actual: realism.avgCareerBasho,
      tolerance: CALIBRATION_ABSOLUTE_TOLERANCE.avgCareerBashoMean,
      kind: 'continuous',
    },
    {
      label: '場所数中央値',
      target: calibrationTarget.careerLength.p50,
      actual: realism.careerBashoP50,
      tolerance: CALIBRATION_ABSOLUTE_TOLERANCE.avgCareerBashoP50,
      kind: 'continuous',
    },
    {
      label: '通算勝率平均',
      target: calibrationTarget.careerWinRate.mean,
      actual: realism.careerWinRate,
      tolerance: CALIBRATION_ABSOLUTE_TOLERANCE.careerWinRateMean,
      kind: 'continuous',
    },
  ].map((entry) => {
    const pass = entry.kind === 'rate'
      ? Number.isFinite(entry.target) &&
      Math.abs((entry.actual - entry.target) / Math.max(entry.target, Number.EPSILON)) <= entry.tolerance
      : Number.isFinite(entry.actual) && Math.abs(entry.actual - entry.target) <= entry.tolerance;
    return {
      ...entry,
      pass,
      source: 'calibration-json',
    };
  });

  return {
    source: calibrationTarget.meta.source,
    era: calibrationTarget.meta.era,
    sampleSize: calibrationTarget.meta.sampleSize,
    checks,
    allPass: checks.every((entry) => entry.pass),
  };
};

const evaluateRealismKpiGate = (aggregate, { strict }) => {
  const realism = aggregate.realism;
  const gate = {
    source: REALISM_KPI_GATE.source,
    mode: strict ? 'gate' : 'warn',
    careerWinRatePass:
      realism.careerWinRate >= REALISM_KPI_GATE.careerWinRateMin &&
      realism.careerWinRate <= REALISM_KPI_GATE.careerWinRateMax,
    nonSekitoriCareerWinRatePass:
      realism.nonSekitoriCareerWinRate >= REALISM_KPI_GATE.nonSekitoriCareerWinRateMin &&
      realism.nonSekitoriCareerWinRate <= REALISM_KPI_GATE.nonSekitoriCareerWinRateMax,
    losingCareerRatePass:
      realism.losingCareerRate >= REALISM_KPI_GATE.losingCareerRateMin &&
      realism.losingCareerRate <= REALISM_KPI_GATE.losingCareerRateMax,
    careerLe35Pass:
      realism.careerWinRateLe35Rate >= REALISM_KPI_GATE.careerLe35Min &&
      realism.careerWinRateLe35Rate <= REALISM_KPI_GATE.careerLe35Max,
    careerLe30Pass: realism.careerWinRateLe30Rate >= REALISM_KPI_GATE.careerLe30Min,
  };
  return {
    ...gate,
    allPass: Object.entries(gate)
      .filter(([key]) => key.endsWith('Pass'))
      .every(([, value]) => value === true),
  };
};

const evaluateKimariteVarietyGate = (aggregate) => {
  const style = aggregate.style;
  const bucketPasses = {};
  for (const bucket of ['PUSH', 'GRAPPLE', 'TECHNIQUE']) {
    const sample = style.styleBucketMetrics?.[bucket];
    const gate = KIMARITE_VARIETY_GATE[bucket];
    const statisticallyMeaningful = (sample?.sample ?? 0) >= 10;
    bucketPasses[bucket] = {
      sample: sample?.sample ?? 0,
      p50Pass:
        !sample?.sample ||
        !statisticallyMeaningful ||
        (sample.uniqueKimariteP50 >= gate.p50Min && sample.uniqueKimariteP50 <= gate.p50Max),
      p90Pass: !sample?.sample || !statisticallyMeaningful || sample.uniqueKimariteP90 <= gate.p90Max,
    };
    bucketPasses[bucket].allPass = bucketPasses[bucket].p50Pass && bucketPasses[bucket].p90Pass;
  }
  const variety20Pass =
    !Number.isFinite(style.kimariteVariety20Rate) ||
    (style.kimariteVariety20Rate >= KIMARITE_VARIETY_GATE.variety20RateMin &&
      style.kimariteVariety20Rate <= KIMARITE_VARIETY_GATE.variety20RateMax);
  return {
    source: KIMARITE_VARIETY_GATE.source,
    bucketPasses,
    variety20Pass,
    allPass: Object.values(bucketPasses).every((entry) => entry.allPass) && variety20Pass,
  };
};

const evaluateAptitudeGate = (aggregate) => {
  const realism = aggregate.realism;
  const gate = {
    source: APTITUDE_GATES.source,
    lowTierPass:
      realism.lowTierRate >= APTITUDE_GATES.lowTierMin &&
      realism.lowTierRate <= APTITUDE_GATES.lowTierMax,
    careerLe35Pass:
      realism.careerWinRateLe35Rate >= APTITUDE_GATES.careerLe35Min &&
      realism.careerWinRateLe35Rate <= APTITUDE_GATES.careerLe35Max,
    careerLe30Pass: realism.careerWinRateLe30Rate >= APTITUDE_GATES.careerLe30Min,
  };
  return {
    ...gate,
    allPass: gate.lowTierPass && gate.careerLe35Pass && gate.careerLe30Pass,
  };
};

const renderGateLine = (label, target, actual, pass, mode = 'gate') =>
  `- ${label}: target ${target} / actual ${actual} / ${mode === 'warn' && !pass ? 'WARN' : pass ? 'PASS' : 'FAIL'}`;

const renderMetadataSection = (lines, metadata) => {
  lines.push('## Run Metadata');
  lines.push('');
  lines.push(`- generatedAt: ${metadata.generatedAt}`);
  lines.push(`- compiledAt: ${metadata.compiledAt ?? 'n/a'}`);
  lines.push(`- mode: ${metadata.mode}`);
  lines.push(`- sample size: ${metadata.sampleSize}`);
  lines.push(`- seed formula: \`${metadata.seedFormula}\``);
  lines.push(`- population kind: ${metadata.populationKind}`);
  lines.push(`- population preset: ${metadata.populationPreset}`);
  lines.push(`- population version: ${metadata.populationVersion}`);
  lines.push(`- population notes: ${metadata.populationNotes}`);
  lines.push(`- startYear: ${metadata.startYear}`);
  lines.push(`- simulationModelVersion: ${metadata.simulationModelVersion}`);
  lines.push(`- target JSON path: ${metadata.targetJsonPath ?? 'n/a'}`);
  lines.push(`- target source: ${metadata.targetSource ?? 'n/a'}`);
  lines.push(`- heuristic gate source: ${metadata.gates.realism.source}`);
  lines.push(`- bundle: ${metadata.bundleId}`);
  lines.push('');
};

const renderInitialDistributionRows = (lines, label, distribution) => {
  lines.push(`- ${label}:`);
  for (const [key, row] of Object.entries(distribution ?? {})) {
    lines.push(`  - ${key}: ${row.count} (${toPctOrNA(row.rate)})`);
  }
};

const renderInitialPopulationSection = (lines, summary) => {
  if (!summary) return;
  lines.push('## Initial Population Summary');
  lines.push('');
  lines.push(`- sample: ${summary.sample}`);
  renderInitialDistributionRows(lines, 'entryAge', summary.entryAge);
  renderInitialDistributionRows(lines, 'entryPath', summary.entryPath);
  renderInitialDistributionRows(lines, 'aptitudeTier', summary.aptitudeTier);
  renderInitialDistributionRows(lines, 'bodySeed', summary.bodySeed);
  renderInitialDistributionRows(lines, 'bodyType', summary.bodyType);
  renderInitialDistributionRows(lines, 'temperament', summary.temperament);
  renderInitialDistributionRows(lines, 'careerBandLabel', summary.careerBandLabel);
  lines.push(`- startingHeightCm P10/P50/P90: ${toFixedOrNA(summary.startingHeightCm.p10)} / ${toFixedOrNA(summary.startingHeightCm.p50)} / ${toFixedOrNA(summary.startingHeightCm.p90)}`);
  lines.push(`- startingWeightKg P10/P50/P90: ${toFixedOrNA(summary.startingWeightKg.p10)} / ${toFixedOrNA(summary.startingWeightKg.p50)} / ${toFixedOrNA(summary.startingWeightKg.p90)}`);
  const stableEntries = Object.entries(summary.stableId ?? {});
  lines.push(`- stableId unique: ${stableEntries.length}`);
  for (const [key, row] of stableEntries.slice(0, 10)) {
    lines.push(`  - ${key}: ${row.count} (${toPctOrNA(row.rate)})`);
  }
  if (stableEntries.length > 10) {
    lines.push(`  - ... ${stableEntries.length - 10} more`);
  }
  lines.push('');
};

const renderRealismSection = (lines, aggregate, realismGate, calibrationGate) => {
  const realism = aggregate.realism;
  lines.push('## Metrics');
  lines.push('');
  lines.push(renderGateLine('関取率', 'monitor', toPctOrNA(realism.sekitoriRate), true, realismGate.mode));
  lines.push(renderGateLine('幕内率', 'monitor', toPctOrNA(realism.makuuchiRate), true, realismGate.mode));
  lines.push(renderGateLine('三役率', 'monitor', toPctOrNA(realism.sanyakuRate), true, realismGate.mode));
  lines.push(renderGateLine('横綱率', 'monitor', toPctOrNA(realism.yokozunaRate), true, realismGate.mode));
  lines.push(renderGateLine('通算勝率（公式平均）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPctOrNA(realism.careerWinRate), realismGate.careerWinRatePass, realismGate.mode));
  lines.push(renderGateLine('非関取通算勝率', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(realism.nonSekitoriCareerWinRate), realismGate.nonSekitoriCareerWinRatePass, realismGate.mode));
  lines.push(renderGateLine('負け越しキャリア率', `${toPct(REALISM_KPI_GATE.losingCareerRateMin)}-${toPct(REALISM_KPI_GATE.losingCareerRateMax)}`, toPctOrNA(realism.losingCareerRate), realismGate.losingCareerRatePass, realismGate.mode));
  lines.push(renderGateLine('career<=35%', `${toPct(REALISM_KPI_GATE.careerLe35Min)}-${toPct(REALISM_KPI_GATE.careerLe35Max)}`, toPctOrNA(realism.careerWinRateLe35Rate), realismGate.careerLe35Pass, realismGate.mode));
  lines.push(renderGateLine('career<=30%', `>= ${toPct(REALISM_KPI_GATE.careerLe30Min)}`, toPctOrNA(realism.careerWinRateLe30Rate), realismGate.careerLe30Pass, realismGate.mode));
  lines.push(`- 平均場所数: ${toFixedOrNA(realism.avgCareerBasho, 2)}`);
  lines.push(`- 場所数中央値: ${toFixedOrNA(realism.careerBashoP50)}`);
  lines.push(`- 引退年齢中央値: ${toFixedOrNA(realism.allCareerRetireAgeP50)}`);
  lines.push(`- 低Tier率(C+D): ${toPctOrNA(realism.lowTierRate)}`);
  lines.push(`- realism ${realismGate.mode}: ${realismGate.allPass ? 'PASS' : realismGate.mode === 'warn' ? 'WARN' : 'FAIL'}`);
  if (calibrationGate) {
    lines.push(`- calibration gate: ${calibrationGate.allPass ? 'PASS' : 'FAIL'}`);
  }
  lines.push('');
};

const renderPopulationSection = (lines, aggregate) => {
  const population = aggregate.population;
  lines.push('## Population');
  lines.push('');
  lines.push(`- active headcount median: ${toFixedOrNA(population.annualTotalMedian)}`);
  lines.push(`- |delta| median: ${toFixedOrNA(population.annualAbsDeltaMedian)}`);
  lines.push(`- |delta| p90: ${toFixedOrNA(population.annualAbsDeltaP90)}`);
  lines.push(`- annual swing median: ${toFixedOrNA(population.annualSwingMedian)}`);
  lines.push(`- annual swing p90: ${toFixedOrNA(population.annualSwingP90)}`);
  lines.push(`- Jonidan swing median: ${toFixedOrNA(population.annualJonidanSwingMedian)}`);
  lines.push(`- Jonokuchi swing median: ${toFixedOrNA(population.annualJonokuchiSwingMedian)}`);
  lines.push('');
};

const renderBucketRows = (lines, rows, labelFormatter = (key) => key) => {
  for (const row of rows) {
    const target = Number.isFinite(row.target) ? toPct(row.target) : 'observed-only';
    const delta = Number.isFinite(row.delta) ? ` / delta ${toPct(row.delta)}` : '';
    lines.push(`- ${labelFormatter(row.bucket)}: actual ${toPctOrNA(row.actual)} / target ${target}${delta}`);
  }
};

const renderHighestRankDistribution = (lines, payload) => {
  lines.push('## Highest Rank Distribution');
  lines.push('');
  const comparison = payload.targetComparisons?.highestRank;
  if (comparison) {
    renderBucketRows(lines, comparison);
  } else {
    for (const bucket of HIGHEST_RANK_BUCKETS) {
      lines.push(`- ${bucket}: ${toPctOrNA(payload.aggregate.distribution.highestRankBuckets[bucket])}`);
    }
  }
  lines.push('');
};

const renderCareerLengthDistribution = (lines, payload) => {
  const distribution = payload.aggregate.distribution;
  lines.push('## Career Length Distribution');
  lines.push('');
  lines.push(`- careerBasho P10/P50/P90: ${toFixedOrNA(distribution.careerBasho.p10)} / ${toFixedOrNA(distribution.careerBasho.p50)} / ${toFixedOrNA(distribution.careerBasho.p90)}`);
  const comparison = payload.targetComparisons?.careerBasho;
  if (comparison) {
    renderBucketRows(lines, comparison);
  } else {
    for (const bucket of CAREER_BASHO_BUCKETS) {
      lines.push(`- ${bucket}: ${toPctOrNA(distribution.careerBashoBuckets[bucket])}`);
    }
  }
  lines.push('');
};

const renderRetirementAgeDistribution = (lines, aggregate) => {
  const retireAge = aggregate.distribution.retireAge;
  lines.push('## Retirement Age Distribution');
  lines.push('');
  lines.push(`- retireAge P10/P50/P90: ${toFixedOrNA(retireAge.p10)} / ${toFixedOrNA(retireAge.p50)} / ${toFixedOrNA(retireAge.p90)}`);
  lines.push('- target: observed-only');
  lines.push('');
};

const renderWinRateDistribution = (lines, payload) => {
  const distribution = payload.aggregate.distribution;
  lines.push('## Win Rate Distribution');
  lines.push('');
  lines.push(`- official P10/P50/P90: ${toPctOrNA(distribution.officialWinRate.p10)} / ${toPctOrNA(distribution.officialWinRate.p50)} / ${toPctOrNA(distribution.officialWinRate.p90)}`);
  lines.push(`- effective P10/P50/P90: ${toPctOrNA(distribution.effectiveWinRate.p10)} / ${toPctOrNA(distribution.effectiveWinRate.p50)} / ${toPctOrNA(distribution.effectiveWinRate.p90)}`);
  const comparison = payload.targetComparisons?.careerWinRate;
  if (comparison) {
    renderBucketRows(lines, comparison);
  } else {
    for (const bucket of CAREER_WIN_RATE_BUCKETS) {
      lines.push(`- ${bucket}: ${toPctOrNA(distribution.careerWinRateBuckets[bucket])}`);
    }
  }
  const lowWin = payload.targetComparisons?.lowWinLongCareerRate;
  if (lowWin) {
    const target = Number.isFinite(lowWin.target) ? toPct(lowWin.target) : 'observed-only';
    lines.push(`- low win long career rate: actual ${toPctOrNA(lowWin.actual)} / target ${target}`);
  }
  lines.push('');
};

const renderAbsenceSection = (lines, aggregate) => {
  const distribution = aggregate.distribution;
  lines.push('## Absence / Injury Signals');
  lines.push('');
  lines.push(`- total absent P50/P90/P99: ${toFixedOrNA(distribution.absent.p50)} / ${toFixedOrNA(distribution.absent.p90)} / ${toFixedOrNA(distribution.absent.p99)}`);
  lines.push(`- absence zero rate: ${toPctOrNA(distribution.absenceZeroRate)}`);
  lines.push(`- full absence basho experience rate: ${toPctOrNA(distribution.fullAbsenceBashoExperienceRate)}`);
  lines.push('- target: observed-only');
  lines.push('');
};

const renderRetirementReasonSection = (lines, aggregate) => {
  const distribution = aggregate.distribution;
  lines.push('## Retirement Reason Distribution');
  lines.push('');
  lines.push(`- 直近勝ち越し後の引退率: ${toPctOrNA(distribution.retiredAfterKachikoshiRate)}`);
  const entries = Object.entries(distribution.retirementReasonDistribution ?? {})
    .sort((left, right) => right[1] - left[1]);
  if (!entries.length) {
    lines.push('- no retirement reasons observed');
  }
  for (const [code, rate] of entries) {
    lines.push(`- ${code}: ${toPctOrNA(rate)}`);
  }
  lines.push('');
};

const renderSekitoriReachSection = (lines, aggregate) => {
  const distribution = aggregate.distribution;
  lines.push('## Sekitori Reach Shape');
  lines.push('');
  lines.push(`- firstSekitoriBasho P10/P50/P90: ${toFixedOrNA(distribution.firstSekitoriBasho.p10)} / ${toFixedOrNA(distribution.firstSekitoriBasho.p50)} / ${toFixedOrNA(distribution.firstSekitoriBasho.p90)}`);
  lines.push(`- sekitoriBashoCount P50/P90: ${toFixedOrNA(distribution.sekitoriBashoCount.p50)} / ${toFixedOrNA(distribution.sekitoriBashoCount.p90)}`);
  lines.push(`- makuuchiBashoCount P50/P90: ${toFixedOrNA(distribution.makuuchiBashoCount.p50)} / ${toFixedOrNA(distribution.makuuchiBashoCount.p90)}`);
  lines.push('- target: observed-only');
  lines.push('');
};

const renderPipelineSection = (lines, aggregate) => {
  const pipeline = aggregate.yokozunaPipeline;
  lines.push('## 横綱パイプライン');
  lines.push('');
  lines.push(`- 大関到達率: ${toPctOrNA(pipeline.ozekiReachRate)}`);
  lines.push(`- 大関13勝以上率: ${toPctOrNA(pipeline.ozeki13WinRate)}`);
  lines.push(`- 大関優勝率: ${toPctOrNA(pipeline.ozekiYushoRate)}`);
  lines.push(`- 連続優勝相当率: ${toPctOrNA(pipeline.backToBackYushoEquivalentRate)}`);
  lines.push(`- 横綱審議到達率: ${toPctOrNA(pipeline.yokozunaDeliberationRate)}`);
  lines.push(`- 横綱昇進率: ${toPctOrNA(pipeline.yokozunaPromotionRate)}`);
  const reasons = Object.entries(pipeline.yokozunaBlockedReasonDistribution);
  if (reasons.length) {
    lines.push('');
    lines.push('- 審議阻害理由:');
    for (const [reason, count] of reasons.sort((left, right) => right[1] - left[1])) {
      lines.push(`  - ${reason}: ${count}`);
    }
  }
  lines.push('');
};

const renderStyleSection = (lines, aggregate, gate) => {
  const style = aggregate.style;
  lines.push('## 技・型');
  lines.push('');
  lines.push(`- unique kimarite P50: ${toFixedOrNA(style.uniqueKimariteP50)}`);
  lines.push(`- unique kimarite P90: ${toFixedOrNA(style.uniqueKimariteP90)}`);
  lines.push(`- top1 share P50: ${toPctOrNA(style.top1MoveShareP50)}`);
  lines.push(`- top3 share P50: ${toPctOrNA(style.top3MoveShareP50)}`);
  lines.push(`- rare move rate: ${toPctOrNA(style.rareMoveRate)}`);
  lines.push(`- 20種類達成率: ${toPctOrNA(style.kimariteVariety20Rate)} / ${gate.variety20Pass ? 'PASS' : 'FAIL'}`);
  for (const bucket of ['PUSH', 'GRAPPLE', 'TECHNIQUE']) {
    const sample = style.styleBucketMetrics?.[bucket];
    const bucketGate = gate.bucketPasses[bucket];
    lines.push(`- ${bucket}: sample=${sample?.sample ?? 0}, unique P50=${toFixedOrNA(sample?.uniqueKimariteP50)}, unique P90=${toFixedOrNA(sample?.uniqueKimariteP90)} / ${bucketGate.allPass ? 'PASS' : 'FAIL'}`);
  }
  lines.push('');
};

const renderCalibrationSection = (lines, calibrationGate) => {
  if (!calibrationGate) return;
  lines.push('## Calibration');
  lines.push('');
  lines.push(`- source: ${calibrationGate.source}`);
  lines.push(`- era: ${calibrationGate.era}`);
  lines.push(`- sampleSize: ${calibrationGate.sampleSize}`);
  lines.push('');
  for (const check of calibrationGate.checks) {
    const targetText = check.kind === 'rate' ? `${toPct(check.target)} +/- ${(check.tolerance * 100).toFixed(0)}%` : `${check.target.toFixed(2)} +/- ${check.tolerance}`;
    const actualText = check.kind === 'rate' ? toPctOrNA(check.actual) : check.actual.toFixed(2);
    lines.push(renderGateLine(check.label, targetText, actualText, check.pass));
  }
  lines.push('');
};

const renderOutliersSection = (lines, aggregate) => {
  lines.push('## Outlier Seeds');
  lines.push('');
  lines.push(`- 最長キャリア: ${aggregate.outliers.longestCareerSeeds.join(', ') || 'none'}`);
  lines.push(`- 最低勝率長期キャリア: ${aggregate.outliers.lowWinLongCareerSeeds.join(', ') || 'none'}`);
  lines.push(`- 最高位上振れ: ${aggregate.outliers.highestRankOutlierSeeds.join(', ') || 'none'}`);
  lines.push(`- 休場過多: ${aggregate.outliers.highAbsenceSeeds.join(', ') || 'none'}`);
  lines.push(`- yokozuna seeds: ${aggregate.outliers.yokozunaSeeds.join(', ') || 'none'}`);
  lines.push(`- late entrant yokozuna heavy seeds: ${aggregate.outliers.highestLateEntrantYokozunaSeeds.join(', ') || 'none'}`);
  lines.push('');
};

const renderReport = (payload) => {
  const title = payload.runKind === 'quick' ? '# Realism Quick Probe' : '# Realism Monte Carlo';
  const lines = [title, ''];
  renderMetadataSection(lines, payload.metadata);
  renderInitialPopulationSection(lines, payload.initialPopulation);
  renderRealismSection(lines, payload.aggregate, payload.realismGate, payload.calibrationGate);
  if (payload.runKind === 'full') {
    renderCalibrationSection(lines, payload.calibrationGate);
  }
  renderPopulationSection(lines, payload.aggregate);
  renderHighestRankDistribution(lines, payload);
  renderCareerLengthDistribution(lines, payload);
  renderRetirementAgeDistribution(lines, payload.aggregate);
  renderWinRateDistribution(lines, payload);
  renderAbsenceSection(lines, payload.aggregate);
  renderRetirementReasonSection(lines, payload.aggregate);
  renderSekitoriReachSection(lines, payload.aggregate);
  renderPipelineSection(lines, payload.aggregate);
  renderStyleSection(lines, payload.aggregate, payload.kimariteGate);
  renderOutliersSection(lines, payload.aggregate);
  lines.push(`- overall: ${payload.overallPass ? 'PASS' : payload.runKind === 'quick' ? 'WARN' : 'FAIL'}`);
  lines.push('');
  return lines.join('\n');
};

const renderAptitudeReport = (payload) => {
  const lines = ['# Realism Aptitude Calibration', ''];
  renderMetadataSection(lines, payload.metadata);
  renderInitialPopulationSection(lines, payload.initialPopulation);
  lines.push(`- selected ladder: ${payload.selectedLadderId ?? 'none'}`);
  lines.push('');

  for (const ladder of payload.ladders) {
    lines.push(`## ${ladder.id}`);
    lines.push('');
    lines.push(`- factors: C=${ladder.factors.C.toFixed(2)}, D=${ladder.factors.D.toFixed(2)}`);
    lines.push(renderGateLine('lowTier(C+D)', `${toPct(APTITUDE_GATES.lowTierMin)}-${toPct(APTITUDE_GATES.lowTierMax)}`, toPctOrNA(ladder.aggregate.realism.lowTierRate), ladder.gate.lowTierPass));
    lines.push(renderGateLine('career<=35%', `${toPct(APTITUDE_GATES.careerLe35Min)}-${toPct(APTITUDE_GATES.careerLe35Max)}`, toPctOrNA(ladder.aggregate.realism.careerWinRateLe35Rate), ladder.gate.careerLe35Pass));
    lines.push(renderGateLine('career<=30%', `>= ${toPct(APTITUDE_GATES.careerLe30Min)}`, toPctOrNA(ladder.aggregate.realism.careerWinRateLe30Rate), ladder.gate.careerLe30Pass));
    lines.push(`- gate: ${ladder.gate.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- samples saved: ${ladder.samples.length}`);
    lines.push('');
  }
  return lines.join('\n');
};

const renderPopulationTuningReport = (payload) => {
  const lines = ['# Historical-Like Population Tuning', ''];
  lines.push('## Run Metadata');
  lines.push('');
  lines.push(`- generatedAt: ${payload.generatedAt}`);
  lines.push(`- compiledAt: ${payload.compiledAt ?? 'n/a'}`);
  lines.push(`- sample size per preset: ${payload.sample}`);
  lines.push(`- population kind: historical-like-career`);
  lines.push(`- presets: ${payload.presets.map((entry) => entry.preset).join(', ')}`);
  lines.push(`- target source: ${payload.targetSource ?? 'n/a'}`);
  lines.push(`- target JSON path: ${payload.targetJsonPath ?? 'n/a'}`);
  lines.push('');

  lines.push('## Comparison Summary');
  lines.push('');
  lines.push('| preset | C+D | B | A+S | LOCAL | SCHOOL | COLLEGE+CHAMPION | sekitoriRate | avgBasho | officialWinRate | calibration |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const entry of payload.presets) {
    const initial = entry.initialPopulation;
    const aptitude = initial.aptitudeTier;
    const entryPath = initial.entryPath;
    const cdRate = (aptitude.C?.rate ?? 0) + (aptitude.D?.rate ?? 0);
    const bRate = aptitude.B?.rate ?? 0;
    const highRate = (aptitude.A?.rate ?? 0) + (aptitude.S?.rate ?? 0);
    const collegeRate = (entryPath.COLLEGE?.rate ?? 0) + (entryPath.CHAMPION?.rate ?? 0);
    lines.push(`| ${entry.preset} | ${toPctOrNA(cdRate)} | ${toPctOrNA(bRate)} | ${toPctOrNA(highRate)} | ${toPctOrNA(entryPath.LOCAL?.rate)} | ${toPctOrNA(entryPath.SCHOOL?.rate)} | ${toPctOrNA(collegeRate)} | ${toPctOrNA(entry.aggregate.realism.sekitoriRate)} | ${toFixedOrNA(entry.aggregate.realism.avgCareerBasho, 2)} | ${toPctOrNA(entry.aggregate.realism.careerWinRate)} | ${entry.calibrationGate?.allPass ? 'PASS' : 'FAIL'} |`);
  }
  lines.push('');

  for (const entry of payload.presets) {
    lines.push(`## ${entry.preset}`);
    lines.push('');
    lines.push(`- version: ${entry.population.version}`);
    lines.push(`- notes: ${entry.population.notes}`);
    lines.push(`- calibration gate: ${entry.calibrationGate?.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- sekitoriRate: ${toPctOrNA(entry.aggregate.realism.sekitoriRate)}`);
    lines.push(`- avgCareerBasho: ${toFixedOrNA(entry.aggregate.realism.avgCareerBasho, 2)}`);
    lines.push(`- official average win rate: ${toPctOrNA(entry.aggregate.realism.careerWinRate)}`);
    lines.push('');
    renderInitialPopulationSection(lines, entry.initialPopulation);
    renderHighestRankDistribution(lines, entry);
    renderCareerLengthDistribution(lines, entry);
    renderWinRateDistribution(lines, entry);
  }

  return lines.join('\n');
};

const runParallelObservation = (runs, ladder, populationPreset = POPULATION_PRESET) =>
  new Promise((resolve, reject) => {
    const maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, 16, runs));
    const summaries = [];
    let nextIndex = 0;
    let activeWorkers = 0;
    let completed = 0;
    let failed = false;

    const maybeFinish = () => {
      if (failed || completed !== runs || activeWorkers !== 0) return;
      const { summarizeObservationBatch } = loadObservationModule();
      resolve({
        summaries,
        aggregate: summarizeObservationBatch(summaries),
      });
    };

    const launchNext = () => {
      if (failed) return;
      while (activeWorkers < maxWorkers && nextIndex < runs) {
        const runIndex = nextIndex;
        nextIndex += 1;
        activeWorkers += 1;
        const seed = (((runIndex + 1) * 2654435761) + 97) >>> 0;
        const worker = new Worker(WORKER_PATH, {
          workerData: { seed, ladder, populationKind: POPULATION_KIND, populationPreset },
        });
        worker.on('message', (message) => {
          summaries.push(message);
        });
        worker.on('error', (error) => {
          if (failed) return;
          failed = true;
          reject(error);
        });
        worker.on('exit', (code) => {
          if (failed) return;
          activeWorkers -= 1;
          if (code !== 0) {
            failed = true;
            reject(new Error(`Worker stopped with exit code ${code}`));
            return;
          }
          completed += 1;
          if (completed % 50 === 0 || completed === runs) {
            console.log(`realism (${RUN_KIND}${ladder ? `:${ladder.id}` : ''}): ${completed}/${runs}`);
          }
          launchNext();
          maybeFinish();
        });
      }
    };

    console.log(`Starting pool with ${maxWorkers} worker threads${ladder ? ` (${ladder.id})` : ''}...`);
    launchNext();
  });

const pickOutputPaths = () => OUTPUTS[RUN_KIND] ?? OUTPUTS.full;

const main = async () => {
  if (!Number.isFinite(BASE_RUNS) || BASE_RUNS <= 0) {
    throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
  }

  const generatedAt = new Date().toISOString();
  const { reportPath, jsonPath } = pickOutputPaths();
  const calibrationBundle = loadCalibrationBundle({ required: RUN_KIND === 'full' || RUN_KIND === 'quick' });
  const careerCalibrationTarget = calibrationBundle?.career ?? null;
  const targetJsonPath = careerCalibrationTarget ? (fs.existsSync(BUNDLE_PATH) ? BUNDLE_PATH : CAREER_TARGET_PATH) : null;
  const targetSource = careerCalibrationTarget?.meta?.source ?? null;

  if (RUN_KIND === 'population') {
    const presets = [];
    for (const preset of POPULATION_TUNING_PRESETS) {
      console.log(`population tuning: ${preset}`);
      const { summaries, aggregate } = await runParallelObservation(BASE_RUNS, undefined, preset);
      const populationMetadata = resolvePopulationMetadata(summaries);
      const calibrationGate = careerCalibrationTarget
        ? buildCalibrationGate(aggregate, careerCalibrationTarget)
        : null;
      presets.push({
        preset,
        population: populationMetadata,
        aggregate,
        initialPopulation: buildInitialPopulationSummary(summaries),
        targetComparisons: careerCalibrationTarget
          ? buildTargetComparisons(aggregate, careerCalibrationTarget)
          : null,
        calibrationGate,
        samples: buildLightSamples(summaries),
      });
    }

    const payload = {
      runKind: 'population',
      mode: 'population',
      generatedAt,
      compiledAt: COMPILED_AT,
      sample: BASE_RUNS,
      sampleSize: BASE_RUNS,
      targetJsonPath,
      targetSource,
      presets,
    };
    const report = renderPopulationTuningReport(payload);
    writeFile(reportPath, report);
    writeFile(jsonPath, JSON.stringify(payload, null, 2));
    console.log(report);
    console.log(`report written: ${reportPath}`);
    console.log(`json written: ${jsonPath}`);
    return;
  }

  if (RUN_KIND === 'aptitude') {
    const ladders = [];
    let selectedLadderId = null;
    for (const ladder of APTITUDE_LADDERS) {
      const { summaries, aggregate } = await runParallelObservation(BASE_RUNS, ladder);
      const gate = evaluateAptitudeGate(aggregate);
      const samples = buildLightSamples(summaries);
      ladders.push({
        id: ladder.id,
        factors: ladder.factors,
        aggregate,
        samples,
        initialPopulation: buildInitialPopulationSummary(summaries),
        population: resolvePopulationMetadata(summaries),
        gate,
      });
      if (!selectedLadderId && gate.allPass) {
        selectedLadderId = ladder.id;
      }
    }

    const metadata = buildRunMetadata({
      generatedAt,
      sample: BASE_RUNS,
      bundleId: ladders[0]?.samples[0]?.bundleId,
      simulationModelVersion: DEFAULT_SIMULATION_MODEL_VERSION,
      targetPath: targetJsonPath,
      targetSource,
      populationMetadata: ladders[0]?.population,
    });
    const payload = {
      runKind: 'aptitude',
      mode: 'aptitude',
      generatedAt,
      compiledAt: COMPILED_AT,
      sample: BASE_RUNS,
      metadata,
      initialPopulation: ladders[0]?.initialPopulation ?? null,
      selectedLadderId,
      ladders,
    };
    const report = renderAptitudeReport(payload);
    writeFile(reportPath, report);
    writeFile(jsonPath, JSON.stringify(payload, null, 2));
    console.log(report);
    console.log(`report written: ${reportPath}`);
    console.log(`json written: ${jsonPath}`);
    return;
  }

  const { summaries, aggregate } = await runParallelObservation(BASE_RUNS);
  const populationMetadata = resolvePopulationMetadata(summaries);
  const initialPopulation = buildInitialPopulationSummary(summaries);
  const calibrationGate = RUN_KIND === 'full' && careerCalibrationTarget
    ? buildCalibrationGate(aggregate, careerCalibrationTarget)
    : null;
  const realismGate = evaluateRealismKpiGate(aggregate, { strict: RUN_KIND === 'full' });
  const kimariteGate = evaluateKimariteVarietyGate(aggregate);
  const targetComparisons = RUN_KIND === 'full' && careerCalibrationTarget
    ? buildTargetComparisons(aggregate, careerCalibrationTarget)
    : null;
  const metadata = buildRunMetadata({
    generatedAt,
    sample: BASE_RUNS,
    bundleId: summaries[0]?.bundleId ?? 'unknown',
    simulationModelVersion: summaries[0]?.modelVersion ?? DEFAULT_SIMULATION_MODEL_VERSION,
    targetPath: targetJsonPath,
    targetSource,
    populationMetadata,
  });
  const payload = {
    runKind: RUN_KIND,
    mode: RUN_KIND,
    generatedAt,
    compiledAt: COMPILED_AT,
    sample: BASE_RUNS,
    sampleSize: BASE_RUNS,
    metadata,
    initialPopulation,
    bundleId: summaries[0]?.bundleId ?? 'unknown',
    aggregate,
    samples: buildLightSamples(summaries),
    targetComparisons,
    calibrationGate,
    realismGate,
    kimariteGate,
    overallPass: RUN_KIND === 'quick'
      ? realismGate.allPass
      : (calibrationGate?.allPass ?? true) && realismGate.allPass && kimariteGate.allPass,
  };

  const report = renderReport(payload);
  writeFile(reportPath, report);
  writeFile(jsonPath, JSON.stringify(payload, null, 2));
  console.log(report);
  console.log(`report written: ${reportPath}`);
  console.log(`json written: ${jsonPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
