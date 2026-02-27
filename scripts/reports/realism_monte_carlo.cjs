const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const TARGET_MODEL_VERSION = 'unified-v2-kimarite';
const BASELINE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const FIXED_START_YEAR = 2026;

const REPORT_PATH = path.join('docs', 'balance', `${TARGET_MODEL_VERSION}-acceptance.md`);
const JSON_PATH = path.join('.tmp', `${TARGET_MODEL_VERSION}-acceptance.json`);

const BASELINE_GATE = {
  yokozunaMin: 0.003,
  yokozunaMax: 0.008,
  sekitoriMin: 0.6,
  makuuchiMin: 0.35,
  sanyakuMin: 0.02,
};

const TOP_DIVISION_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const toPct = (value) => `${(value * 100).toFixed(2)}%`;

const isSekitoriRank = (rank) => rank.division === 'Makuuchi' || rank.division === 'Juryo';
const isMakuuchiRank = (rank) => rank.division === 'Makuuchi';
const isSanyakuRank = (rank) => rank.division === 'Makuuchi' && TOP_DIVISION_NAMES.has(rank.name);
const isYokozunaRank = (rank) => rank.division === 'Makuuchi' && rank.name === '横綱';

if (!isMainThread) {
  // --- WORKER THREAD ---
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
      return buildInitialRikishiFromDraft(draft);
    });
  };

  const runCareerToEnd = async (initialStatus, seed, modelVersion) => {
    const simulationRandom = createSeededRandom(seed ^ 0x3c6ef372);
    const engine = createSimulationEngine(
      {
        initialStats: JSON.parse(JSON.stringify(initialStatus)),
        oyakata: null,
        simulationModelVersion: modelVersion,
      },
      {
        random: simulationRandom,
        getCurrentYear: () => FIXED_START_YEAR,
        yieldControl: async () => { }, // No need to yield heavily in workers
      },
    );

    while (true) {
      const step = await engine.runNextBasho();
      if (step.kind === 'COMPLETED') {
        return step.statusSnapshot;
      }
    }
  };

  const executeWorkerTask = async (seed, modelVersion) => {
    const initial = createUneditedScoutInitial(seed);
    const result = await runCareerToEnd(initial, seed, modelVersion);
    const maxRank = result.history.maxRank;

    parentPort.postMessage({
      isSekitori: isSekitoriRank(maxRank),
      isMakuuchi: isMakuuchiRank(maxRank),
      isSanyaku: isSanyakuRank(maxRank),
      isYokozuna: isYokozunaRank(maxRank),
      totalWins: result.history.totalWins,
      totalLosses: result.history.totalLosses,
      bashoCount: result.history.records.length,
    });
  };

  executeWorkerTask(workerData.seed, workerData.modelVersion).catch((err) => {
    console.error('Worker error:', err);
    process.exit(1);
  });
} else {
  // --- MAIN THREAD ---
  const evaluateAcceptance = (baseline) => {
    const baselineYokozunaPass =
      baseline.yokozunaRate >= BASELINE_GATE.yokozunaMin &&
      baseline.yokozunaRate <= BASELINE_GATE.yokozunaMax;
    const baselineSekitoriPass = baseline.sekitoriRate >= BASELINE_GATE.sekitoriMin;
    const baselineMakuuchiPass = baseline.makuuchiRate >= BASELINE_GATE.makuuchiMin;
    const baselineSanyakuPass = baseline.sanyakuRate >= BASELINE_GATE.sanyakuMin;

    return {
      baseline: {
        yokozunaBandPass: baselineYokozunaPass,
        sekitoriPass: baselineSekitoriPass,
        makuuchiPass: baselineMakuuchiPass,
        sanyakuPass: baselineSanyakuPass,
        allPass:
          baselineYokozunaPass &&
          baselineSekitoriPass &&
          baselineMakuuchiPass &&
          baselineSanyakuPass,
      },
    };
  };

  const renderReport = (result) => {
    const lines = [];
    lines.push(`# ${TARGET_MODEL_VERSION} Monte Carlo Acceptance (Multi-Threaded)`);
    lines.push('');
    lines.push(`- 実行日: ${new Date().toISOString()}`);
    lines.push(`- model: ${TARGET_MODEL_VERSION}`);
    lines.push(`- baseline 本数: ${result.baseline.sample}`);
    lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
    lines.push('');
    lines.push('## Baseline（無編集ランダムスカウト）');
    lines.push('');
    lines.push(`- 関取率: ${toPct(result.baseline.sekitoriRate)}`);
    lines.push(`- 幕内率: ${toPct(result.baseline.makuuchiRate)}`);
    lines.push(`- 三役率: ${toPct(result.baseline.sanyakuRate)}`);
    lines.push(`- 横綱率: ${toPct(result.baseline.yokozunaRate)}`);
    lines.push(`- 平均通算: ${result.baseline.avgTotalWins.toFixed(1)}勝 ${result.baseline.avgTotalLosses.toFixed(1)}敗`);
    lines.push('');
    lines.push('## Gate Result');
    lines.push('');
    lines.push(`- baseline gate: ${result.acceptance.baseline.allPass ? 'PASS' : 'FAIL'}`);
    lines.push('');
    return lines.join('\n');
  };

  const writeFile = (filePath, text) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, 'utf8');
  };

  const runParallelSimulation = (runs, modelVersion) => {
    return new Promise((resolve, reject) => {
      // Use available CPU cores, leaving maybe 1 for the OS, max 16.
      const maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, 16));
      console.log(`Starting pool with ${maxWorkers} worker threads...`);

      let sekitoriCount = 0;
      let makuuchiCount = 0;
      let sanyakuCount = 0;
      let yokozunaCount = 0;
      let totalWins = 0;
      let totalLosses = 0;
      let totalBasho = 0;

      let tasksCompleted = 0;
      let taskIndex = 0;
      let activeWorkers = 0;

      const scheduleWorker = () => {
        if (taskIndex >= runs) {
          return;
        }

        const currentTaskIndex = taskIndex;
        taskIndex += 1;
        activeWorkers += 1;

        const seed = ((currentTaskIndex + 1) * 2654435761 + 97) >>> 0;

        const worker = new Worker(__filename, {
          workerData: { seed, modelVersion },
        });

        worker.on('message', (msg) => {
          if (msg.isSekitori) sekitoriCount += 1;
          if (msg.isMakuuchi) makuuchiCount += 1;
          if (msg.isSanyaku) sanyakuCount += 1;
          if (msg.isYokozuna) yokozunaCount += 1;

          totalWins += msg.totalWins;
          totalLosses += msg.totalLosses;
          totalBasho += msg.bashoCount;

          tasksCompleted += 1;
          if (tasksCompleted % 50 === 0) {
            console.log(`baseline_random_scout(${modelVersion}): ${tasksCompleted}/${runs} completed`);
          }
        });

        worker.on('error', (err) => {
          console.error(`Worker error on task ${currentTaskIndex}:`, err);
          reject(err);
        });

        worker.on('exit', (code) => {
          activeWorkers -= 1;
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
            return;
          }

          if (tasksCompleted >= runs) {
            resolve({
              sample: runs,
              sekitoriCount,
              makuuchiCount,
              sanyakuCount,
              yokozunaCount,
              sekitoriRate: sekitoriCount / runs,
              makuuchiRate: makuuchiCount / runs,
              sanyakuRate: sanyakuCount / runs,
              yokozunaRate: yokozunaCount / runs,
              avgTotalWins: totalWins / runs,
              avgTotalLosses: totalLosses / runs,
              avgCareerBasho: totalBasho / runs,
            });
          } else {
            // Schedule the next one to keep the pool full
            scheduleWorker();
          }
        });
      };

      // Fill the worker pool initially
      for (let i = 0; i < maxWorkers; i++) {
        scheduleWorker();
      }
    });
  };

  const main = async () => {
    if (!Number.isFinite(BASELINE_RUNS) || BASELINE_RUNS <= 0) {
      throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
    }

    console.log(`running baseline scenario (${BASELINE_RUNS})...`);
    console.time('Simulation Time');
    const baselineResult = await runParallelSimulation(BASELINE_RUNS, TARGET_MODEL_VERSION);
    console.timeEnd('Simulation Time');

    const result = {
      modelVersion: TARGET_MODEL_VERSION,
      baseline: baselineResult,
      acceptance: evaluateAcceptance(baselineResult),
    };

    const report = renderReport(result);
    const payload = {
      generatedAt: new Date().toISOString(),
      result,
    };

    writeFile(REPORT_PATH, report);
    writeFile(JSON_PATH, JSON.stringify(payload, null, 2));

    console.log(report);
    console.log('');
    console.log(`report written: ${REPORT_PATH}`);
    console.log(`json written: ${JSON_PATH}`);
  };

  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
