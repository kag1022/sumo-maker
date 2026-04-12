const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const {
  createCareerRateAccumulator,
  finalizeCareerRateAccumulator,
  pushCareerRateSample,
} = require('./_shared/career_rate_metrics.cjs');

const BASE_RUNS = Number(process.env.PLAYER_REALISM_C2_RUNS || 160);
const BASE_WORKERS = Number(process.env.PLAYER_REALISM_C2_WORKERS || 4);
const FIXED_START_YEAR = 2026;
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;
const REPORT_PATH = path.join('docs', 'balance', 'player-realism-c2-probe.md');
const JSON_PATH = path.join('.tmp', 'player-realism-c2-probe.json');

const C1_BASELINE = {
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

const percentile = (sortedValues, ratio) => {
  if (!sortedValues.length) return Number.NaN;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
};

const toPct = (value) => `${(value * 100).toFixed(2)}%`;
const toPctOrNA = (value) => (Number.isFinite(value) ? toPct(value) : 'n/a');

if (!isMainThread) {
  const { createSimulationEngine, createSeededRandom } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'engine.js',
  ));
  const { buildInitialRikishiFromDraft, rollScoutDraft } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'scout',
    'gacha.js',
  ));

  const withPatchedMathRandom = (randomFn, run) => {
    const original = Math.random;
    Math.random = randomFn;
    try {
      return run();
    } finally {
      Math.random = original;
    }
  };

  const createUneditedScoutInitial = (seed) => {
    const draftRandom = createSeededRandom(seed ^ 0xa5a5a5a5);
    return withPatchedMathRandom(draftRandom, () => {
      const draft = rollScoutDraft(draftRandom);
      return buildInitialRikishiFromDraft({
        ...draft,
        selectedStableId: draft.selectedStableId ?? 'stable-001',
      });
    });
  };

  const runCareerToEnd = async (seed) => {
    const initial = createUneditedScoutInitial(seed);
    const simulationRandom = createSeededRandom(seed ^ 0x3c6ef372);
    const engine = createSimulationEngine(
      {
        initialStats: JSON.parse(JSON.stringify(initial)),
        oyakata: null,
      },
      {
        random: simulationRandom,
        getCurrentYear: () => FIXED_START_YEAR,
        yieldControl: async () => {},
      },
    );

    while (true) {
      const step = await engine.runNextBasho();
      if (step.kind === 'COMPLETED') {
        const status = step.statusSnapshot;
        const maxRank = status.history.maxRank;
        parentPort.postMessage({
          seed,
          isSekitori: maxRank.division === 'Makuuchi' || maxRank.division === 'Juryo',
          wins: status.history.totalWins,
          losses: status.history.totalLosses,
          absent: status.history.totalAbsent,
          bashoCount: status.history.records.length,
        });
        return;
      }
    }
  };

  (async () => {
    for (const seed of workerData.seeds) {
      await runCareerToEnd(seed);
    }
  })().catch((error) => {
    console.error('Worker error:', error);
    process.exit(1);
  });
} else {
  const splitSeedsIntoChunks = (runs, workerLimit) => {
    const chunks = Array.from({ length: workerLimit }, () => []);
    for (let index = 0; index < runs; index += 1) {
      chunks[index % workerLimit].push(index + 1);
    }
    return chunks.filter((chunk) => chunk.length > 0);
  };

  const runParallel = (runs) =>
    new Promise((resolve, reject) => {
      const workerLimit = Math.max(1, Math.min(BASE_WORKERS, os.cpus().length - 1 || 1, runs));
      const seedChunks = splitSeedsIntoChunks(runs, workerLimit);
      const results = [];
      let completed = 0;
      let activeWorkers = 0;
      let failed = false;

      const finishIfReady = () => {
        if (!failed && completed === runs && activeWorkers === 0) {
          resolve(results);
        }
      };

      console.log(`player realism c2 probe: runs=${runs}, workers=${seedChunks.length}`);
      for (const seeds of seedChunks) {
        activeWorkers += 1;
        const worker = new Worker(__filename, {
          workerData: { seeds },
        });
        worker.on('message', (message) => {
          results.push(message);
          completed += 1;
          if (completed % 20 === 0 || completed === runs) {
            console.log(`player realism c2 probe: completed ${completed}/${runs}`);
          }
        });
        worker.on('error', (error) => {
          failed = true;
          reject(error);
        });
        worker.on('exit', (code) => {
          activeWorkers -= 1;
          if (!failed && code !== 0) {
            failed = true;
            reject(new Error(`player realism c2 probe worker exited with code ${code}`));
            return;
          }
          finishIfReady();
        });
      }
    });

  const renderComparisonLine = (label, baseline, actual, direction) => {
    const pass =
      direction === 'down'
        ? actual < baseline
        : actual > baseline;
    return `- ${label}: baseline ${Number.isFinite(baseline) ? (baseline > 1 ? baseline.toFixed(2) : toPct(baseline)) : 'n/a'} / actual ${Number.isFinite(actual) ? (actual > 1 ? actual.toFixed(2) : toPct(actual)) : 'n/a'} / ${pass ? 'PASS' : 'FAIL'}`;
  };

  const renderReport = (payload) => {
    const { generatedAt, runs, metrics, improvements } = payload;
    return [
      '# Player Realism C2 Probe',
      '',
      `- 実行日: ${generatedAt}`,
      `- compiledAt: ${COMPILED_AT ?? 'unknown'}`,
      `- sample: ${runs}`,
      '',
      '## Metrics',
      '',
      `- 通算勝率（公式平均）: ${toPct(metrics.careerWinRate)}`,
      `- 非関取通算勝率（公式平均）: ${toPctOrNA(metrics.nonSekitoriCareerWinRate)}`,
      `- 負け越しキャリア率（休場込み）: ${toPct(metrics.losingCareerRate)}`,
      `- 関取率: ${toPct(metrics.sekitoriRate)}`,
      `- 平均場所数: ${metrics.avgCareerBasho.toFixed(2)}`,
      `- 場所数中央値: ${metrics.careerBashoP50.toFixed(1)}`,
      '',
      '## C1 Baseline Comparison',
      '',
      renderComparisonLine('通算勝率', C1_BASELINE.careerWinRate, metrics.careerWinRate, 'down'),
      renderComparisonLine('非関取通算勝率', C1_BASELINE.nonSekitoriCareerWinRate, metrics.nonSekitoriCareerWinRate, 'down'),
      renderComparisonLine('負け越しキャリア率', C1_BASELINE.losingCareerRate, metrics.losingCareerRate, 'up'),
      renderComparisonLine('関取率', C1_BASELINE.sekitoriRate, metrics.sekitoriRate, 'down'),
      renderComparisonLine('平均場所数', C1_BASELINE.avgCareerBasho, metrics.avgCareerBasho, 'down'),
      renderComparisonLine('場所数中央値', C1_BASELINE.careerBashoP50, metrics.careerBashoP50, 'down'),
      '',
      `- overall: ${improvements.allPass ? 'PASS' : 'FAIL'}`,
      '',
    ].join('\n');
  };

  (async () => {
    const workerResults = await runParallel(BASE_RUNS);
    const overall = createCareerRateAccumulator();
    const nonSekitori = createCareerRateAccumulator();
    const bashoCounts = [];
    let sekitoriCount = 0;

    for (const result of workerResults) {
      pushCareerRateSample(overall, result);
      bashoCounts.push(result.bashoCount);
      if (result.isSekitori) {
        sekitoriCount += 1;
      } else {
        pushCareerRateSample(nonSekitori, result);
      }
    }

    const overallSummary = finalizeCareerRateAccumulator(overall);
    const nonSekitoriSummary = finalizeCareerRateAccumulator(nonSekitori);
    const sortedBasho = bashoCounts.slice().sort((a, b) => a - b);
    const metrics = {
      careerWinRate: overallSummary.officialWinRate,
      nonSekitoriCareerWinRate: nonSekitoriSummary.officialWinRate,
      losingCareerRate: overallSummary.losingCareerRate,
      sekitoriRate: sekitoriCount / Math.max(1, workerResults.length),
      avgCareerBasho: workerResults.reduce((sum, row) => sum + row.bashoCount, 0) / Math.max(1, workerResults.length),
      careerBashoP50: percentile(sortedBasho, 0.5),
    };
    const improvements = {
      careerWinRateDown: metrics.careerWinRate < C1_BASELINE.careerWinRate,
      nonSekitoriCareerWinRateDown: metrics.nonSekitoriCareerWinRate < C1_BASELINE.nonSekitoriCareerWinRate,
      losingCareerRateUp: metrics.losingCareerRate > C1_BASELINE.losingCareerRate,
      sekitoriRateDown: metrics.sekitoriRate < C1_BASELINE.sekitoriRate,
      avgCareerBashoDown: metrics.avgCareerBasho < C1_BASELINE.avgCareerBasho,
      careerBashoP50Down: metrics.careerBashoP50 < C1_BASELINE.careerBashoP50,
    };
    improvements.allPass = Object.values(improvements).every(Boolean);

    const payload = {
      generatedAt: new Date().toISOString(),
      compiledAt: COMPILED_AT ?? null,
      runs: BASE_RUNS,
      baseline: C1_BASELINE,
      metrics,
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
