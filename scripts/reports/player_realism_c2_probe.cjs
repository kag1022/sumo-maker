const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./_shared/observation_module.cjs');

const BASE_RUNS = Number(process.env.PLAYER_REALISM_C2_RUNS || 160);
const BASE_WORKERS = Number(process.env.PLAYER_REALISM_C2_WORKERS || 4);
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;
const REPORT_PATH = path.join('docs', 'balance', 'player-realism-c2-probe.md');
const JSON_PATH = path.join('.tmp', 'player-realism-c2-probe.json');

const HISTORICAL_BENCHMARK = {
  careerWinRate: 0.5639396817984932,
  nonSekitoriCareerWinRate: 0.5258176860204574,
  losingCareerRate: 0.124,
  sekitoriRate: 0.528,
  avgCareerBasho: 93.976,
  careerBashoP50: 95,
};

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const toPct = (value) => `${(value * 100).toFixed(2)}%`;
const toPctOrNA = (value) => (Number.isFinite(value) ? toPct(value) : 'n/a');

if (!isMainThread) {
  const { runCareerObservation } = loadObservationModule();
  runCareerObservation({ seed: workerData.seed })
    .then((result) => parentPort.postMessage(result.summary))
    .catch((error) => {
      console.error('Worker error:', error);
      process.exit(1);
    });
} else {
  const runParallel = (runs) =>
    new Promise((resolve, reject) => {
      const workerLimit = Math.max(1, Math.min(BASE_WORKERS, os.cpus().length - 1 || 1, runs));
      const summaries = [];
      let nextIndex = 0;
      let activeWorkers = 0;
      let completed = 0;
      let failed = false;

      const maybeFinish = () => {
        if (failed || completed !== runs || activeWorkers !== 0) return;
        const { summarizeObservationBatch } = loadObservationModule();
        resolve(summarizeObservationBatch(summaries));
      };

      const launchNext = () => {
        if (failed) return;
        while (nextIndex < runs && activeWorkers < workerLimit) {
          const runIndex = nextIndex;
          nextIndex += 1;
          activeWorkers += 1;
          const seed = runIndex + 1;
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
              reject(new Error(`player realism c2 probe worker exited with code ${code}`));
              return;
            }
            completed += 1;
            if (completed % 20 === 0 || completed === runs) {
              console.log(`player realism c2 probe: completed ${completed}/${runs}`);
            }
            launchNext();
            maybeFinish();
          });
        }
      };

      console.log(`player realism c2 probe: runs=${runs}, workers=${workerLimit}`);
      launchNext();
    });

  const renderComparisonLine = (label, benchmark, actual, direction) => {
    const pass = direction === 'down' ? actual < benchmark : actual > benchmark;
    return `- ${label}: historicalBenchmark ${Number.isFinite(benchmark) ? (benchmark > 1 ? benchmark.toFixed(2) : toPct(benchmark)) : 'n/a'} / actual ${Number.isFinite(actual) ? (actual > 1 ? actual.toFixed(2) : toPct(actual)) : 'n/a'} / ${pass ? 'PASS' : 'FAIL'}`;
  };

  const renderReport = (payload) => {
    const { generatedAt, runs, aggregate, improvements } = payload;
    return [
      '# Player Realism C2 Probe',
      '',
      `- 実行日: ${generatedAt}`,
      `- compiledAt: ${COMPILED_AT ?? 'unknown'}`,
      `- sample: ${runs}`,
      '',
      '## Metrics',
      '',
      `- 通算勝率（公式平均）: ${toPct(aggregate.realism.careerWinRate)}`,
      `- 非関取通算勝率（公式平均）: ${toPctOrNA(aggregate.realism.nonSekitoriCareerWinRate)}`,
      `- 負け越しキャリア率（休場込み）: ${toPct(aggregate.realism.losingCareerRate)}`,
      `- 関取率: ${toPct(aggregate.realism.sekitoriRate)}`,
      `- 平均場所数: ${aggregate.realism.avgCareerBasho.toFixed(2)}`,
      `- 場所数中央値: ${aggregate.realism.careerBashoP50.toFixed(1)}`,
      '',
      '## Historical Benchmark Comparison',
      '',
      renderComparisonLine('通算勝率', HISTORICAL_BENCHMARK.careerWinRate, aggregate.realism.careerWinRate, 'down'),
      renderComparisonLine('非関取通算勝率', HISTORICAL_BENCHMARK.nonSekitoriCareerWinRate, aggregate.realism.nonSekitoriCareerWinRate, 'down'),
      renderComparisonLine('負け越しキャリア率', HISTORICAL_BENCHMARK.losingCareerRate, aggregate.realism.losingCareerRate, 'up'),
      renderComparisonLine('関取率', HISTORICAL_BENCHMARK.sekitoriRate, aggregate.realism.sekitoriRate, 'down'),
      renderComparisonLine('平均場所数', HISTORICAL_BENCHMARK.avgCareerBasho, aggregate.realism.avgCareerBasho, 'down'),
      renderComparisonLine('場所数中央値', HISTORICAL_BENCHMARK.careerBashoP50, aggregate.realism.careerBashoP50, 'down'),
      '',
      `- overall: ${improvements.allPass ? 'PASS' : 'FAIL'}`,
      '',
    ].join('\n');
  };

  (async () => {
    const aggregate = await runParallel(BASE_RUNS);
    const improvements = {
      careerWinRateDown: aggregate.realism.careerWinRate < HISTORICAL_BENCHMARK.careerWinRate,
      nonSekitoriCareerWinRateDown:
        aggregate.realism.nonSekitoriCareerWinRate < HISTORICAL_BENCHMARK.nonSekitoriCareerWinRate,
      losingCareerRateUp: aggregate.realism.losingCareerRate > HISTORICAL_BENCHMARK.losingCareerRate,
      sekitoriRateDown: aggregate.realism.sekitoriRate < HISTORICAL_BENCHMARK.sekitoriRate,
      avgCareerBashoDown: aggregate.realism.avgCareerBasho < HISTORICAL_BENCHMARK.avgCareerBasho,
      careerBashoP50Down: aggregate.realism.careerBashoP50 < HISTORICAL_BENCHMARK.careerBashoP50,
    };
    improvements.allPass = Object.values(improvements).every(Boolean);

    const payload = {
      generatedAt: new Date().toISOString(),
      compiledAt: COMPILED_AT ?? null,
      runs: BASE_RUNS,
      historicalBenchmark: HISTORICAL_BENCHMARK,
      aggregate,
      improvements,
    };
    const report = renderReport(payload);
    writeFile(REPORT_PATH, report);
    writeFile(JSON_PATH, JSON.stringify(payload, null, 2));
    console.log(report);
    console.log(`report written: ${REPORT_PATH}`);
    console.log(`json written: ${JSON_PATH}`);
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

