const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./_shared/observation_module.cjs');

const RUNS = Number(process.env.PROBE_RUNS || process.env.REALISM_MC_BASE_RUNS || 600);
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT ?? null;
const JSON_PATH = path.join('.tmp', 'sekitori-retirement-probe.json');
const REPORT_PATH = path.join('docs', 'balance', 'sekitori-retirement-probe.md');
const SEED_FORMULA = '((runIndex + 1) * 2654435761 + 97) >>> 0';
const RETIREMENT_PROBE_GATE = {
  source: 'heuristic',
  losingCareerRateMin: 0.25,
  losingCareerRateMax: 0.35,
  allCareerRetireAgeP50Min: 24,
  avgCareerBashoMin: 40,
};

const toPct = (value) => `${(value * 100).toFixed(2)}%`;
const toPctOrNA = (value) => (Number.isFinite(value) ? toPct(value) : 'n/a');
const toFixedOrNA = (value, digits = 2) => (Number.isFinite(value) ? value.toFixed(digits) : 'n/a');

const buildLightSamples = (summaries) =>
  summaries.map((summary) => ({
    seed: summary.seed,
    entryAge: summary.careerOutcome.entryAge,
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
  }));

const buildMetadata = (generatedAt, sample, firstSummary) => ({
  mode: 'retire',
  sampleSize: sample,
  seedFormula: SEED_FORMULA,
  populationKind: 'player-scout-default',
  startYear: 2026,
  simulationModelVersion: firstSummary?.modelVersion ?? 'unknown',
  generatedAt,
  targetJsonPath: null,
  targetSource: null,
  gates: {
    retirement: { source: RETIREMENT_PROBE_GATE.source },
  },
  compiledAt: COMPILED_AT,
  bundleId: firstSummary?.bundleId ?? 'unknown',
});

if (!isMainThread) {
  const { runCareerObservation } = loadObservationModule();
  runCareerObservation({ seed: workerData.seed })
    .then((result) => parentPort.postMessage(result.summary))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  const runParallel = (runs) =>
    new Promise((resolve, reject) => {
      const maxWorkers = Math.max(1, Math.min((os.cpus()?.length || 2) - 1, 12, runs));
      const summaries = [];
      let nextTask = 0;
      let activeWorkers = 0;
      let completed = 0;
      let failed = false;

      const maybeFinish = () => {
        if (failed || completed !== runs || activeWorkers !== 0) return;
        const { summarizeObservationBatch } = loadObservationModule();
        const sekitoriSummaries = summaries.filter((summary) => summary.rankOutcome.isSekitori);
        resolve({
          summaries,
          aggregate: summarizeObservationBatch(summaries),
          sekitoriAggregate: sekitoriSummaries.length ? summarizeObservationBatch(sekitoriSummaries) : null,
          sekitoriSummaries,
        });
      };

      const launchNext = () => {
        if (failed) return;
        while (nextTask < runs && activeWorkers < maxWorkers) {
          const current = nextTask;
          nextTask += 1;
          activeWorkers += 1;
          const seed = ((current + 1) * 2654435761 + 97) >>> 0;
          const worker = new Worker(__filename, { workerData: { seed } });
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
              reject(new Error(`Worker exited with code ${code}`));
              return;
            }
            completed += 1;
            if (completed % 50 === 0 || completed === runs) {
              console.log(`progress ${completed}/${runs}`);
            }
            launchNext();
            maybeFinish();
          });
        }
      };

      launchNext();
    });

  const evaluateGate = (aggregate) => {
    const gateResult = {
      source: RETIREMENT_PROBE_GATE.source,
      losingCareerRatePass:
        aggregate.realism.losingCareerRate >= RETIREMENT_PROBE_GATE.losingCareerRateMin &&
        aggregate.realism.losingCareerRate <= RETIREMENT_PROBE_GATE.losingCareerRateMax,
      allCareerRetireAgeP50Pass:
        aggregate.realism.allCareerRetireAgeP50 >= RETIREMENT_PROBE_GATE.allCareerRetireAgeP50Min,
      avgCareerBashoPass: aggregate.realism.avgCareerBasho >= RETIREMENT_PROBE_GATE.avgCareerBashoMin,
    };
    gateResult.allPass =
      gateResult.losingCareerRatePass &&
      gateResult.allCareerRetireAgeP50Pass &&
      gateResult.avgCareerBashoPass;
    return gateResult;
  };

  const renderAggregateBlock = (lines, title, aggregate, gateResult = null) => {
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(`- sample: ${aggregate.realism.sample}`);
    lines.push(`- 関取率: ${toPctOrNA(aggregate.realism.sekitoriRate)}`);
    lines.push(`- 幕内率: ${toPctOrNA(aggregate.realism.makuuchiRate)}`);
    lines.push(`- 負け越しキャリア率(休場込み): ${toPctOrNA(aggregate.realism.losingCareerRate)}`);
    lines.push(`- 引退年齢 P10/P50/P90: ${toFixedOrNA(aggregate.distribution.retireAge.p10)} / ${toFixedOrNA(aggregate.distribution.retireAge.p50)} / ${toFixedOrNA(aggregate.distribution.retireAge.p90)}`);
    lines.push(`- 平均場所数: ${toFixedOrNA(aggregate.realism.avgCareerBasho)}`);
    lines.push(`- careerBasho P10/P50/P90: ${toFixedOrNA(aggregate.distribution.careerBasho.p10)} / ${toFixedOrNA(aggregate.distribution.careerBasho.p50)} / ${toFixedOrNA(aggregate.distribution.careerBasho.p90)}`);
    lines.push(`- 関取在位 P50/P90: ${toFixedOrNA(aggregate.distribution.sekitoriBashoCount.p50)} / ${toFixedOrNA(aggregate.distribution.sekitoriBashoCount.p90)}`);
    lines.push(`- 幕内在位 P50/P90: ${toFixedOrNA(aggregate.distribution.makuuchiBashoCount.p50)} / ${toFixedOrNA(aggregate.distribution.makuuchiBashoCount.p90)}`);
    lines.push(`- 通算勝率（公式平均）: ${toPctOrNA(aggregate.realism.careerWinRate)}`);
    lines.push(`- 通算勝率（有効平均）: ${toPctOrNA(aggregate.realism.careerEffectiveWinRate)}`);
    lines.push(`- 休場 P50/P90/P99: ${toFixedOrNA(aggregate.distribution.absent.p50)} / ${toFixedOrNA(aggregate.distribution.absent.p90)} / ${toFixedOrNA(aggregate.distribution.absent.p99)}`);
    lines.push(`- 直近勝ち越し後の引退率: ${toPctOrNA(aggregate.distribution.retiredAfterKachikoshiRate)}`);
    lines.push('');
    lines.push('### 引退理由分布');
    const reasonEntries = Object.entries(aggregate.distribution.retirementReasonDistribution ?? {})
      .sort((left, right) => right[1] - left[1]);
    if (!reasonEntries.length) {
      lines.push('- no retirement reasons observed');
    }
    for (const [code, rate] of reasonEntries) {
      lines.push(`- ${code}: ${toPctOrNA(rate)}`);
    }
    if (gateResult) {
      lines.push('');
      lines.push(`- 負け越しキャリア率 target ${toPct(RETIREMENT_PROBE_GATE.losingCareerRateMin)}-${toPct(RETIREMENT_PROBE_GATE.losingCareerRateMax)} / ${gateResult.losingCareerRatePass ? 'PASS' : 'FAIL'}`);
      lines.push(`- 引退年齢中央値 target >= ${RETIREMENT_PROBE_GATE.allCareerRetireAgeP50Min.toFixed(1)} / ${gateResult.allCareerRetireAgeP50Pass ? 'PASS' : 'FAIL'}`);
      lines.push(`- 平均場所数 target >= ${RETIREMENT_PROBE_GATE.avgCareerBashoMin.toFixed(1)} / ${gateResult.avgCareerBashoPass ? 'PASS' : 'FAIL'}`);
      lines.push(`- overall gate: ${gateResult.allPass ? 'PASS' : 'FAIL'}`);
    }
    lines.push('');
  };

  const renderReport = (payload) => {
    const lines = [];
    lines.push('# Sekitori Retirement Probe');
    lines.push('');
    lines.push('## Run Metadata');
    lines.push('');
    lines.push(`- generatedAt: ${payload.metadata.generatedAt}`);
    lines.push(`- compiledAt: ${payload.metadata.compiledAt ?? 'n/a'}`);
    lines.push(`- mode: ${payload.metadata.mode}`);
    lines.push(`- sample size: ${payload.metadata.sampleSize}`);
    lines.push(`- seed formula: \`${payload.metadata.seedFormula}\``);
    lines.push(`- population kind: ${payload.metadata.populationKind}`);
    lines.push(`- simulationModelVersion: ${payload.metadata.simulationModelVersion}`);
    lines.push(`- target source: ${payload.metadata.gates.retirement.source}`);
    lines.push('');
    renderAggregateBlock(lines, 'All Careers', payload.aggregate, payload.gateResult);
    if (payload.sekitoriAggregate) {
      renderAggregateBlock(lines, 'Sekitori Reached Subset', payload.sekitoriAggregate);
    } else {
      lines.push('## Sekitori Reached Subset');
      lines.push('');
      lines.push('- sample: 0');
      lines.push('');
    }
    lines.push('## Outlier Seeds');
    lines.push('');
    lines.push(`- 最長キャリア: ${payload.aggregate.outliers.longestCareerSeeds.join(', ') || 'none'}`);
    lines.push(`- 最低勝率長期キャリア: ${payload.aggregate.outliers.lowWinLongCareerSeeds.join(', ') || 'none'}`);
    lines.push(`- 休場過多: ${payload.aggregate.outliers.highAbsenceSeeds.join(', ') || 'none'}`);
    lines.push('');
    return lines.join('\n');
  };

  (async () => {
    const { summaries, aggregate, sekitoriAggregate, sekitoriSummaries } = await runParallel(RUNS);
    const gateResult = evaluateGate(aggregate);
    const generatedAt = new Date().toISOString();
    const payload = {
      runKind: 'retire',
      mode: 'retire',
      generatedAt,
      compiledAt: COMPILED_AT,
      sample: RUNS,
      sampleSize: RUNS,
      metadata: buildMetadata(generatedAt, RUNS, summaries[0]),
      aggregate,
      sekitoriAggregate,
      samples: buildLightSamples(summaries),
      sekitoriSamples: buildLightSamples(sekitoriSummaries),
      gateResult,
    };

    fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
    fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2));
    fs.writeFileSync(REPORT_PATH, renderReport(payload));
    console.log(JSON.stringify({
      runKind: payload.runKind,
      sample: payload.sample,
      sekitoriSample: payload.sekitoriSamples.length,
      gateResult,
    }, null, 2));
    console.log(`report written: ${REPORT_PATH}`);
    console.log(`json written: ${JSON_PATH}`);
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
