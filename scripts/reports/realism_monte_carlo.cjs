const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker } = require('worker_threads');
const { loadCalibrationBundle } = require('./_shared/calibrationTargets.cjs');
const { loadObservationModule } = require('./_shared/observation_module.cjs');

const WORKER_PATH = require.resolve('./_shared/realism_worker.cjs');

const RUN_KIND = process.env.REALISM_RUN_KIND || 'full';
const BASE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;
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
};

const REALISM_KPI_GATE = {
  careerWinRateMin: 0.49,
  careerWinRateMax: 0.52,
  nonSekitoriCareerWinRateMin: 0.45,
  nonSekitoriCareerWinRateMax: 0.49,
  losingCareerRateMin: 0.25,
  losingCareerRateMax: 0.35,
  careerLe35Min: 0.05,
  careerLe35Max: 0.08,
  careerLe30Min: 0.015,
};

const KIMARITE_VARIETY_GATE = {
  PUSH: { p50Min: 10, p50Max: 18, p90Max: 28 },
  GRAPPLE: { p50Min: 14, p50Max: 24, p90Max: 34 },
  TECHNIQUE: { p50Min: 18, p50Max: 32, p90Max: 44 },
  variety20RateMin: 0.03,
  variety20RateMax: 0.35,
};

const APTITUDE_GATES = {
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
const CALIBRATION_ABSOLUTE_TOLERANCE = {
  avgCareerBashoMean: 8,
  avgCareerBashoP50: 8,
  careerWinRateMean: 0.025,
  careerWinRateMedian: 0.025,
};

const toPct = (value) => `${(value * 100).toFixed(2)}%`;
const toPctOrNA = (value) => (Number.isFinite(value) ? toPct(value) : 'n/a');

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const buildCalibrationGate = (aggregate, calibrationTarget) => {
  const realism = aggregate.realism;
  const checks = [
    {
      label: '関取率',
      target: calibrationTarget.rankRates.sekitoriRate,
      actual: realism.sekitoriRate,
      tolerance: CALIBRATION_RATE_TOLERANCE,
      kind: 'rate',
    },
    {
      label: '幕内率',
      target: calibrationTarget.rankRates.makuuchiRate,
      actual: realism.makuuchiRate,
      tolerance: CALIBRATION_RATE_TOLERANCE,
      kind: 'rate',
    },
    {
      label: '三役率',
      target: calibrationTarget.rankRates.sanyakuRate,
      actual: realism.sanyakuRate,
      tolerance: CALIBRATION_RATE_TOLERANCE,
      kind: 'rate',
    },
    {
      label: '横綱率',
      target: calibrationTarget.rankRates.yokozunaRate,
      actual: realism.yokozunaRate,
      tolerance: CALIBRATION_RATE_TOLERANCE,
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

const evaluateRealismKpiGate = (aggregate) => {
  const realism = aggregate.realism;
  return {
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
    allPass: false,
  };
};

const evaluateKimariteVarietyGate = (aggregate) => {
  const style = aggregate.style;
  const bucketPasses = {};
  for (const bucket of ['PUSH', 'GRAPPLE', 'TECHNIQUE']) {
    const sample = style.styleBucketMetrics?.[bucket];
    const gate = KIMARITE_VARIETY_GATE[bucket];
    bucketPasses[bucket] = {
      sample: sample?.sample ?? 0,
      p50Pass:
        !sample?.sample ||
        (sample.uniqueKimariteP50 >= gate.p50Min && sample.uniqueKimariteP50 <= gate.p50Max),
      p90Pass: !sample?.sample || sample.uniqueKimariteP90 <= gate.p90Max,
    };
    bucketPasses[bucket].allPass = bucketPasses[bucket].p50Pass && bucketPasses[bucket].p90Pass;
  }
  const variety20Pass =
    !Number.isFinite(style.kimariteVariety20Rate) ||
    (style.kimariteVariety20Rate >= KIMARITE_VARIETY_GATE.variety20RateMin &&
      style.kimariteVariety20Rate <= KIMARITE_VARIETY_GATE.variety20RateMax);
  return {
    bucketPasses,
    variety20Pass,
    allPass: Object.values(bucketPasses).every((entry) => entry.allPass) && variety20Pass,
  };
};

const evaluateAptitudeGate = (aggregate) => {
  const realism = aggregate.realism;
  return {
    lowTierPass:
      realism.lowTierRate >= APTITUDE_GATES.lowTierMin &&
      realism.lowTierRate <= APTITUDE_GATES.lowTierMax,
    careerLe35Pass:
      realism.careerWinRateLe35Rate >= APTITUDE_GATES.careerLe35Min &&
      realism.careerWinRateLe35Rate <= APTITUDE_GATES.careerLe35Max,
    careerLe30Pass: realism.careerWinRateLe30Rate >= APTITUDE_GATES.careerLe30Min,
    allPass: false,
  };
};

const finalizeGate = (gate) => ({
  ...gate,
  allPass: Object.entries(gate)
    .filter(([key]) => key !== 'allPass')
    .every(([, value]) => value === true),
});

const renderGateLine = (label, target, actual, pass) =>
  `- ${label}: target ${target} / actual ${actual} / ${pass ? 'PASS' : 'FAIL'}`;

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
  lines.push(`- unique kimarite P50: ${Number.isFinite(style.uniqueKimariteP50) ? style.uniqueKimariteP50.toFixed(1) : 'n/a'}`);
  lines.push(`- unique kimarite P90: ${Number.isFinite(style.uniqueKimariteP90) ? style.uniqueKimariteP90.toFixed(1) : 'n/a'}`);
  lines.push(`- top1 share P50: ${toPctOrNA(style.top1MoveShareP50)}`);
  lines.push(`- top3 share P50: ${toPctOrNA(style.top3MoveShareP50)}`);
  lines.push(`- rare move rate: ${toPctOrNA(style.rareMoveRate)}`);
  lines.push(`- 20種類達成率: ${toPctOrNA(style.kimariteVariety20Rate)} / ${gate.variety20Pass ? 'PASS' : 'FAIL'}`);
  for (const bucket of ['PUSH', 'GRAPPLE', 'TECHNIQUE']) {
    const sample = style.styleBucketMetrics?.[bucket];
    const bucketGate = gate.bucketPasses[bucket];
    lines.push(`- ${bucket}: sample=${sample?.sample ?? 0}, unique P50=${Number.isFinite(sample?.uniqueKimariteP50) ? sample.uniqueKimariteP50.toFixed(1) : 'n/a'}, unique P90=${Number.isFinite(sample?.uniqueKimariteP90) ? sample.uniqueKimariteP90.toFixed(1) : 'n/a'} / ${bucketGate.allPass ? 'PASS' : 'FAIL'}`);
  }
  lines.push('');
};

const renderPopulationSection = (lines, aggregate) => {
  const population = aggregate.population;
  lines.push('## Population');
  lines.push('');
  lines.push(`- active headcount median: ${Number.isFinite(population.annualTotalMedian) ? population.annualTotalMedian.toFixed(1) : 'n/a'}`);
  lines.push(`- |delta| median: ${Number.isFinite(population.annualAbsDeltaMedian) ? population.annualAbsDeltaMedian.toFixed(1) : 'n/a'}`);
  lines.push(`- |delta| p90: ${Number.isFinite(population.annualAbsDeltaP90) ? population.annualAbsDeltaP90.toFixed(1) : 'n/a'}`);
  lines.push(`- annual swing median: ${Number.isFinite(population.annualSwingMedian) ? population.annualSwingMedian.toFixed(1) : 'n/a'}`);
  lines.push(`- annual swing p90: ${Number.isFinite(population.annualSwingP90) ? population.annualSwingP90.toFixed(1) : 'n/a'}`);
  lines.push(`- Jonidan swing median: ${Number.isFinite(population.annualJonidanSwingMedian) ? population.annualJonidanSwingMedian.toFixed(1) : 'n/a'}`);
  lines.push(`- Jonokuchi swing median: ${Number.isFinite(population.annualJonokuchiSwingMedian) ? population.annualJonokuchiSwingMedian.toFixed(1) : 'n/a'}`);
  lines.push('');
};

const renderRealismSection = (lines, aggregate, realismGate, calibrationGate) => {
  const realism = aggregate.realism;
  lines.push('## Metrics');
  lines.push('');
  lines.push(renderGateLine('関取率', 'monitor', toPctOrNA(realism.sekitoriRate), true));
  lines.push(renderGateLine('幕内率', 'monitor', toPctOrNA(realism.makuuchiRate), true));
  lines.push(renderGateLine('三役率', 'monitor', toPctOrNA(realism.sanyakuRate), true));
  lines.push(renderGateLine('横綱率', 'monitor', toPctOrNA(realism.yokozunaRate), true));
  lines.push(renderGateLine('通算勝率（公式平均）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPctOrNA(realism.careerWinRate), realismGate.careerWinRatePass));
  lines.push(renderGateLine('非関取通算勝率', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(realism.nonSekitoriCareerWinRate), realismGate.nonSekitoriCareerWinRatePass));
  lines.push(renderGateLine('負け越しキャリア率', `${toPct(REALISM_KPI_GATE.losingCareerRateMin)}-${toPct(REALISM_KPI_GATE.losingCareerRateMax)}`, toPctOrNA(realism.losingCareerRate), realismGate.losingCareerRatePass));
  lines.push(renderGateLine('career<=35%', `${toPct(APTITUDE_GATES.careerLe35Min)}-${toPct(APTITUDE_GATES.careerLe35Max)}`, toPctOrNA(realism.careerWinRateLe35Rate), realismGate.careerLe35Pass));
  lines.push(renderGateLine('career<=30%', `>= ${toPct(APTITUDE_GATES.careerLe30Min)}`, toPctOrNA(realism.careerWinRateLe30Rate), realismGate.careerLe30Pass));
  lines.push(`- 平均場所数: ${Number.isFinite(realism.avgCareerBasho) ? realism.avgCareerBasho.toFixed(2) : 'n/a'}`);
  lines.push(`- 場所数中央値: ${Number.isFinite(realism.careerBashoP50) ? realism.careerBashoP50.toFixed(1) : 'n/a'}`);
  lines.push(`- 引退年齢中央値: ${Number.isFinite(realism.allCareerRetireAgeP50) ? realism.allCareerRetireAgeP50.toFixed(1) : 'n/a'}`);
  lines.push(`- 低Tier率(C+D): ${toPctOrNA(realism.lowTierRate)}`);
  lines.push(`- realism gate: ${realismGate.allPass ? 'PASS' : 'FAIL'}`);
  if (calibrationGate) {
    lines.push(`- calibration gate: ${calibrationGate.allPass ? 'PASS' : 'FAIL'}`);
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

const renderQuickReport = (payload) => {
  const lines = [
    '# Realism Quick Probe',
    '',
    `- 実行日: ${payload.generatedAt}`,
    `- compiledAt: ${payload.compiledAt ?? 'n/a'}`,
    `- mode: quick`,
    `- sample: ${payload.sample}`,
    `- bundle: ${payload.bundleId}`,
    '',
  ];
  renderRealismSection(lines, payload.aggregate, payload.realismGate, payload.calibrationGate);
  renderPipelineSection(lines, payload.aggregate);
  renderStyleSection(lines, payload.aggregate, payload.kimariteGate);
  return lines.join('\n');
};

const renderFullReport = (payload) => {
  const lines = [
    '# Realism Monte Carlo',
    '',
    `- 実行日: ${payload.generatedAt}`,
    `- compiledAt: ${payload.compiledAt ?? 'n/a'}`,
    `- mode: full`,
    `- sample: ${payload.sample}`,
    `- bundle: ${payload.bundleId}`,
    '',
  ];
  renderRealismSection(lines, payload.aggregate, payload.realismGate, payload.calibrationGate);
  renderCalibrationSection(lines, payload.calibrationGate);
  renderPipelineSection(lines, payload.aggregate);
  renderStyleSection(lines, payload.aggregate, payload.kimariteGate);
  renderPopulationSection(lines, payload.aggregate);
  lines.push('## Outliers');
  lines.push('');
  lines.push(`- longest careers: ${payload.aggregate.outliers.longestCareerSeeds.join(', ') || 'none'}`);
  lines.push(`- yokozuna seeds: ${payload.aggregate.outliers.yokozunaSeeds.join(', ') || 'none'}`);
  lines.push(`- late entrant yokozuna heavy seeds: ${payload.aggregate.outliers.highestLateEntrantYokozunaSeeds.join(', ') || 'none'}`);
  lines.push('');
  lines.push(`- overall: ${payload.overallPass ? 'PASS' : 'FAIL'}`);
  lines.push('');
  return lines.join('\n');
};

const renderAptitudeReport = (payload) => {
  const lines = [
    '# Realism Aptitude Calibration',
    '',
    `- 実行日: ${payload.generatedAt}`,
    `- compiledAt: ${payload.compiledAt ?? 'n/a'}`,
    `- mode: aptitude`,
    `- sample: ${payload.sample}`,
    `- selected ladder: ${payload.selectedLadderId ?? 'none'}`,
    '',
  ];

  for (const ladder of payload.ladders) {
    lines.push(`## ${ladder.id}`);
    lines.push('');
    lines.push(`- factors: C=${ladder.factors.C.toFixed(2)}, D=${ladder.factors.D.toFixed(2)}`);
    lines.push(renderGateLine('lowTier(C+D)', `${toPct(APTITUDE_GATES.lowTierMin)}-${toPct(APTITUDE_GATES.lowTierMax)}`, toPctOrNA(ladder.aggregate.realism.lowTierRate), ladder.gate.lowTierPass));
    lines.push(renderGateLine('career<=35%', `${toPct(APTITUDE_GATES.careerLe35Min)}-${toPct(APTITUDE_GATES.careerLe35Max)}`, toPctOrNA(ladder.aggregate.realism.careerWinRateLe35Rate), ladder.gate.careerLe35Pass));
    lines.push(renderGateLine('career<=30%', `>= ${toPct(APTITUDE_GATES.careerLe30Min)}`, toPctOrNA(ladder.aggregate.realism.careerWinRateLe30Rate), ladder.gate.careerLe30Pass));
    lines.push(`- gate: ${ladder.gate.allPass ? 'PASS' : 'FAIL'}`);
    lines.push('');
  }
  return lines.join('\n');
};

const runParallelObservation = (runs, ladder) =>
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
          workerData: { seed, ladder },
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

  if (RUN_KIND === 'aptitude') {
    const ladders = [];
    let selectedLadderId = null;
    for (const ladder of APTITUDE_LADDERS) {
      const { aggregate } = await runParallelObservation(BASE_RUNS, ladder);
      const gate = finalizeGate(evaluateAptitudeGate(aggregate));
      ladders.push({
        id: ladder.id,
        factors: ladder.factors,
        aggregate,
        gate,
      });
      if (!selectedLadderId && gate.allPass) {
        selectedLadderId = ladder.id;
      }
    }

    const payload = {
      runKind: 'aptitude',
      generatedAt,
      compiledAt: COMPILED_AT,
      sample: BASE_RUNS,
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
  const calibrationGate = careerCalibrationTarget ? buildCalibrationGate(aggregate, careerCalibrationTarget) : null;
  const realismGate = finalizeGate(evaluateRealismKpiGate(aggregate));
  const kimariteGate = evaluateKimariteVarietyGate(aggregate);
  const payload = {
    runKind: RUN_KIND,
    generatedAt,
    compiledAt: COMPILED_AT,
    sample: BASE_RUNS,
    bundleId: summaries[0]?.bundleId ?? 'unknown',
    aggregate,
    calibrationGate,
    realismGate,
    kimariteGate,
    overallPass: (calibrationGate?.allPass ?? true) && realismGate.allPass && kimariteGate.allPass,
  };

  const report = RUN_KIND === 'quick'
    ? renderQuickReport(payload)
    : renderFullReport(payload);
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

