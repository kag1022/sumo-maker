const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const BASELINE_MODEL_VERSION = 'unified-v2-kimarite';
const CANDIDATE_MODEL_VERSION = 'unified-v3-variance';
const BASELINE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const FIXED_START_YEAR = 2026;
const RELATIVE_TOLERANCE = 0.2;
const EXECUTION_MODE =
  process.env.REALISM_MC_MODE === 'v3-only' ||
    process.env.REALISM_MC_V3_ONLY === '1'
    ? 'v3-only'
    : 'compare';
const IS_V3_ONLY_MODE = EXECUTION_MODE === 'v3-only';

const REPORT_PATH = IS_V3_ONLY_MODE
  ? path.join('docs', 'balance', 'unified-v3-monte-carlo.md')
  : path.join('docs', 'balance', 'unified-v2-v3-acceptance.md');
const JSON_PATH = IS_V3_ONLY_MODE
  ? path.join('.tmp', 'unified-v3-monte-carlo.json')
  : path.join('.tmp', 'unified-v2-v3-acceptance.json');

const BASELINE_GATE = {
  yokozunaMin: 0.004,
  yokozunaMax: 0.006,
  sekitoriMin: 0.3,
  sekitoriMax: 0.4,
  makuuchiMin: 0.09,
  makuuchiMax: 0.11,
  sanyakuMin: 0.018,
  sanyakuMax: 0.022,
};

const RELATIVE_METRICS = [
  { key: 'sekitoriRate', label: '関取率' },
  { key: 'makuuchiRate', label: '幕内率' },
  { key: 'sanyakuRate', label: '三役率' },
  { key: 'yokozunaRate', label: '横綱率' },
];

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

const TOP_DIVISION_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const toPct = (value) => `${(value * 100).toFixed(2)}%`;
const toPctOrNA = (value) => (Number.isFinite(value) ? toPct(value) : 'n/a');

const isSekitoriRank = (rank) => rank.division === 'Makuuchi' || rank.division === 'Juryo';
const isMakuuchiRank = (rank) => rank.division === 'Makuuchi';
const isSanyakuRank = (rank) => rank.division === 'Makuuchi' && TOP_DIVISION_NAMES.has(rank.name);
const isYokozunaRank = (rank) => rank.division === 'Makuuchi' && rank.name === '横綱';

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
  const { CONSTANTS } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'constants.js',
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
      const preparedDraft = {
        ...draft,
        selectedStableId: draft.selectedStableId ?? 'stable-001',
      };
      return buildInitialRikishiFromDraft(preparedDraft);
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
        yieldControl: async () => { },
      },
    );

    while (true) {
      const step = await engine.runNextBasho();
      if (step.kind === 'COMPLETED') {
        return step.statusSnapshot;
      }
    }
  };

  const applyAptitudeLadder = (ladder) => {
    if (!ladder || !ladder.factors || !CONSTANTS?.APTITUDE_TIER_DATA) return;
    if (Number.isFinite(ladder.factors.C)) {
      CONSTANTS.APTITUDE_TIER_DATA.C.factor = ladder.factors.C;
    }
    if (Number.isFinite(ladder.factors.D)) {
      CONSTANTS.APTITUDE_TIER_DATA.D.factor = ladder.factors.D;
    }
  };

  const executeWorkerTask = async (seed, modelVersion, ladder) => {
    applyAptitudeLadder(ladder);
    const initial = createUneditedScoutInitial(seed);
    const result = await runCareerToEnd(initial, seed, modelVersion);
    const maxRank = result.history.maxRank;
    const careerWinRate = result.history.totalWins / Math.max(1, result.history.totalWins + result.history.totalLosses);

    parentPort.postMessage({
      isSekitori: isSekitoriRank(maxRank),
      isMakuuchi: isMakuuchiRank(maxRank),
      isSanyaku: isSanyakuRank(maxRank),
      isYokozuna: isYokozunaRank(maxRank),
      aptitudeTier: initial.aptitudeTier ?? 'B',
      careerWinRate,
      totalWins: result.history.totalWins,
      totalLosses: result.history.totalLosses,
      bashoCount: result.history.records.length,
    });
  };

  executeWorkerTask(workerData.seed, workerData.modelVersion, workerData.ladder).catch((err) => {
    console.error('Worker error:', err);
    process.exit(1);
  });
} else {
  const evaluateBaselineGate = (baseline) => {
    const baselineYokozunaPass =
      baseline.yokozunaRate >= BASELINE_GATE.yokozunaMin &&
      baseline.yokozunaRate <= BASELINE_GATE.yokozunaMax;
    const baselineSekitoriPass =
      baseline.sekitoriRate >= BASELINE_GATE.sekitoriMin &&
      baseline.sekitoriRate <= BASELINE_GATE.sekitoriMax;
    const baselineMakuuchiPass =
      baseline.makuuchiRate >= BASELINE_GATE.makuuchiMin &&
      baseline.makuuchiRate <= BASELINE_GATE.makuuchiMax;
    const baselineSanyakuPass =
      baseline.sanyakuRate >= BASELINE_GATE.sanyakuMin &&
      baseline.sanyakuRate <= BASELINE_GATE.sanyakuMax;

    return {
      yokozunaBandPass: baselineYokozunaPass,
      sekitoriPass: baselineSekitoriPass,
      makuuchiPass: baselineMakuuchiPass,
      sanyakuPass: baselineSanyakuPass,
      allPass:
        baselineYokozunaPass &&
        baselineSekitoriPass &&
        baselineMakuuchiPass &&
        baselineSanyakuPass,
    };
  };

  const evaluateRelativeGate = (baseline, candidate) => {
    const metrics = RELATIVE_METRICS.map(({ key, label }) => {
      const baseRate = baseline[key];
      const candidateRate = candidate[key];
      const delta = candidateRate - baseRate;
      const relativeDelta = baseRate === 0
        ? (candidateRate === 0 ? 0 : Number.POSITIVE_INFINITY)
        : delta / baseRate;
      const pass = Number.isFinite(relativeDelta) && Math.abs(relativeDelta) <= RELATIVE_TOLERANCE;
      return {
        key,
        label,
        baseRate,
        candidateRate,
        delta,
        relativeDelta,
        pass,
      };
    });

    return {
      tolerance: RELATIVE_TOLERANCE,
      metrics,
      allPass: metrics.every((metric) => metric.pass),
    };
  };

  const evaluateAptitudeGate = (metrics) => {
    const lowTierPass =
      metrics.lowTierRate >= APTITUDE_GATES.lowTierMin &&
      metrics.lowTierRate <= APTITUDE_GATES.lowTierMax;
    const careerLe35Pass =
      metrics.careerWinRateLe35Rate >= APTITUDE_GATES.careerLe35Min &&
      metrics.careerWinRateLe35Rate <= APTITUDE_GATES.careerLe35Max;
    const careerLe30Pass = metrics.careerWinRateLe30Rate >= APTITUDE_GATES.careerLe30Min;
    return {
      lowTierPass,
      careerLe35Pass,
      careerLe30Pass,
      allPass: lowTierPass && careerLe35Pass && careerLe30Pass,
    };
  };

  const renderModelBlock = (lines, title, modelVersion, data) => {
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(`- model: ${modelVersion}`);
    lines.push(`- 関取率: ${toPct(data.sekitoriRate)}`);
    lines.push(`- 幕内率: ${toPct(data.makuuchiRate)}`);
    lines.push(`- 三役率: ${toPct(data.sanyakuRate)}`);
    lines.push(`- 横綱率: ${toPct(data.yokozunaRate)}`);
    lines.push(`- 平均通算: ${data.avgTotalWins.toFixed(1)}勝 ${data.avgTotalLosses.toFixed(1)}敗`);
    lines.push(`- 通算勝率: ${toPct(data.careerWinRate)}`);
    lines.push(
      `- 通算勝率（関取経験者）: ${toPctOrNA(data.sekitoriCareerWinRate)} (n=${data.sekitoriCareerSample})`,
    );
    lines.push(
      `- 通算勝率（非関取）: ${toPctOrNA(data.nonSekitoriCareerWinRate)} (n=${data.nonSekitoriCareerSample})`,
    );
    lines.push(`- 平均場所数: ${data.avgCareerBasho.toFixed(1)}`);
    lines.push('');
  };

  const formatTierWinRateLine = (tierWinRates) => {
    const ordered = ['S', 'A', 'B', 'C', 'D'];
    return ordered
      .map((tier) => `${tier}:${toPctOrNA(tierWinRates[tier])}`)
      .join(' / ');
  };

  const renderAptitudeCalibrationSection = (lines, aptitudeCalibration) => {
    if (!aptitudeCalibration) return;
    lines.push('## Aptitude Calibration');
    lines.push('');
    lines.push(
      `- gate: lowTier(C+D) ${toPct(APTITUDE_GATES.lowTierMin)}-${toPct(APTITUDE_GATES.lowTierMax)}, ` +
      `career<=35% ${toPct(APTITUDE_GATES.careerLe35Min)}-${toPct(APTITUDE_GATES.careerLe35Max)}, ` +
      `career<=30% >= ${toPct(APTITUDE_GATES.careerLe30Min)}`,
    );
    lines.push(`- selected ladder: ${aptitudeCalibration.selectedLadderId ?? 'none'}`);
    lines.push('');
    for (const ladder of aptitudeCalibration.ladders) {
      lines.push(`### ${ladder.id}`);
      lines.push('');
      lines.push(`- factors: C=${ladder.factors.C.toFixed(2)}, D=${ladder.factors.D.toFixed(2)}`);
      lines.push(`- lowTierRate(C+D): ${toPct(ladder.metrics.lowTierRate)}`);
      lines.push(`- careerWinRate<=0.35: ${toPct(ladder.metrics.careerWinRateLe35Rate)}`);
      lines.push(`- careerWinRate<=0.30: ${toPct(ladder.metrics.careerWinRateLe30Rate)}`);
      lines.push(`- tier別勝率: ${formatTierWinRateLine(ladder.metrics.tierCareerWinRate)}`);
      lines.push(`- gate: ${ladder.gate.allPass ? 'PASS' : 'FAIL'}`);
      lines.push('');
    }
  };

  const renderReport = (result) => {
    const lines = [];
    if (result.mode === 'v3-only') {
      lines.push(`# ${CANDIDATE_MODEL_VERSION} Monte Carlo`);
      lines.push('');
      lines.push(`- 実行日: ${new Date().toISOString()}`);
      lines.push(`- mode: v3-only`);
      lines.push(`- candidate 本数: ${result.candidate.sample}`);
      lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
      lines.push('');
      renderModelBlock(lines, 'Candidate（無編集ランダムスカウト）', CANDIDATE_MODEL_VERSION, result.candidate);
      renderAptitudeCalibrationSection(lines, result.aptitudeCalibration);
      lines.push('## Gate Result');
      lines.push('');
      lines.push(`- aptitude ladder gate: ${result.acceptance.aptitude.allPass ? 'PASS' : 'FAIL'}`);
      lines.push(`- selected ladder: ${result.acceptance.aptitude.selectedLadderId ?? 'none'}`);
      lines.push('');
      return lines.join('\n');
    }

    lines.push(`# ${BASELINE_MODEL_VERSION} vs ${CANDIDATE_MODEL_VERSION} Monte Carlo Acceptance`);
    lines.push('');
    lines.push(`- 実行日: ${new Date().toISOString()}`);
    lines.push(`- mode: compare`);
    lines.push(`- baseline 本数: ${result.baseline.sample}`);
    lines.push(`- candidate 本数: ${result.candidate.sample}`);
    lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
    lines.push(`- 相対許容幅: +/-${(RELATIVE_TOLERANCE * 100).toFixed(0)}%`);
    lines.push('');

    renderModelBlock(lines, 'Baseline（無編集ランダムスカウト）', BASELINE_MODEL_VERSION, result.baseline);
    renderModelBlock(lines, 'Candidate（無編集ランダムスカウト）', CANDIDATE_MODEL_VERSION, result.candidate);

    lines.push('## Relative Diff (Candidate vs Baseline)');
    lines.push('');
    for (const metric of result.acceptance.relative.metrics) {
      const deltaText = Number.isFinite(metric.relativeDelta)
        ? `${metric.relativeDelta >= 0 ? '+' : ''}${(metric.relativeDelta * 100).toFixed(2)}%`
        : 'n/a';
      lines.push(`- ${metric.label}: ${deltaText} (${metric.pass ? 'PASS' : 'FAIL'})`);
    }
    lines.push('');

    renderAptitudeCalibrationSection(lines, result.aptitudeCalibration);

    lines.push('## Gate Result');
    lines.push('');
    lines.push(`- baseline absolute gate (${BASELINE_MODEL_VERSION}): ${result.acceptance.baseline.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- relative gate (${CANDIDATE_MODEL_VERSION} vs ${BASELINE_MODEL_VERSION}): ${result.acceptance.relative.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- overall: ${result.acceptance.allPass ? 'PASS' : 'FAIL'}`);
    lines.push('');

    return lines.join('\n');
  };

  const writeFile = (filePath, text) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, 'utf8');
  };

  const runParallelSimulation = (runs, modelVersion, ladder) => {
    return new Promise((resolve, reject) => {
      const maxWorkers = Math.max(1, Math.min(os.cpus().length - 1, 16));
      console.log(
        `Starting pool with ${maxWorkers} worker threads for ${modelVersion}${ladder ? ` (${ladder.id})` : ''}...`,
      );

      let sekitoriCount = 0;
      let makuuchiCount = 0;
      let sanyakuCount = 0;
      let yokozunaCount = 0;
      let totalWins = 0;
      let totalLosses = 0;
      let totalBasho = 0;
      let sekitoriCareerSample = 0;
      let sekitoriCareerWins = 0;
      let sekitoriCareerLosses = 0;
      let nonSekitoriCareerSample = 0;
      let nonSekitoriCareerWins = 0;
      let nonSekitoriCareerLosses = 0;
      let lowTierCount = 0;
      let careerWinRateLe35Count = 0;
      let careerWinRateLe30Count = 0;
      const tierBuckets = {
        S: { wins: 0, losses: 0, sample: 0 },
        A: { wins: 0, losses: 0, sample: 0 },
        B: { wins: 0, losses: 0, sample: 0 },
        C: { wins: 0, losses: 0, sample: 0 },
        D: { wins: 0, losses: 0, sample: 0 },
      };

      let tasksCompleted = 0;
      let taskIndex = 0;

      const scheduleWorker = () => {
        if (taskIndex >= runs) return;

        const currentTaskIndex = taskIndex;
        taskIndex += 1;

        const seed = ((currentTaskIndex + 1) * 2654435761 + 97) >>> 0;
        const worker = new Worker(__filename, {
          workerData: { seed, modelVersion, ladder },
        });

        worker.on('message', (msg) => {
          if (msg.isSekitori) sekitoriCount += 1;
          if (msg.isMakuuchi) makuuchiCount += 1;
          if (msg.isSanyaku) sanyakuCount += 1;
          if (msg.isYokozuna) yokozunaCount += 1;

          totalWins += msg.totalWins;
          totalLosses += msg.totalLosses;
          totalBasho += msg.bashoCount;
          if (msg.aptitudeTier === 'C' || msg.aptitudeTier === 'D') {
            lowTierCount += 1;
          }
          if (msg.careerWinRate <= 0.35) {
            careerWinRateLe35Count += 1;
          }
          if (msg.careerWinRate <= 0.3) {
            careerWinRateLe30Count += 1;
          }
          if (tierBuckets[msg.aptitudeTier]) {
            const bucket = tierBuckets[msg.aptitudeTier];
            bucket.wins += msg.totalWins;
            bucket.losses += msg.totalLosses;
            bucket.sample += 1;
          }
          if (msg.isSekitori) {
            sekitoriCareerSample += 1;
            sekitoriCareerWins += msg.totalWins;
            sekitoriCareerLosses += msg.totalLosses;
          } else {
            nonSekitoriCareerSample += 1;
            nonSekitoriCareerWins += msg.totalWins;
            nonSekitoriCareerLosses += msg.totalLosses;
          }

          tasksCompleted += 1;
          if (tasksCompleted % 50 === 0) {
            console.log(
              `baseline_random_scout(${modelVersion}${ladder ? `:${ladder.id}` : ''}): ${tasksCompleted}/${runs} completed`,
            );
          }
        });

        worker.on('error', (err) => {
          console.error(`Worker error on task ${currentTaskIndex}:`, err);
          reject(err);
        });

        worker.on('exit', (code) => {
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
              careerWinRate: totalWins / Math.max(1, totalWins + totalLosses),
              sekitoriCareerSample,
              sekitoriCareerWinRate:
                sekitoriCareerSample > 0
                  ? sekitoriCareerWins / Math.max(1, sekitoriCareerWins + sekitoriCareerLosses)
                  : Number.NaN,
              nonSekitoriCareerSample,
              nonSekitoriCareerWinRate:
                nonSekitoriCareerSample > 0
                  ? nonSekitoriCareerWins / Math.max(1, nonSekitoriCareerWins + nonSekitoriCareerLosses)
                  : Number.NaN,
              avgCareerBasho: totalBasho / runs,
              lowTierRate: lowTierCount / runs,
              careerWinRateLe35Rate: careerWinRateLe35Count / runs,
              careerWinRateLe30Rate: careerWinRateLe30Count / runs,
              tierCareerWinRate: {
                S: tierBuckets.S.sample > 0 ? tierBuckets.S.wins / Math.max(1, tierBuckets.S.wins + tierBuckets.S.losses) : Number.NaN,
                A: tierBuckets.A.sample > 0 ? tierBuckets.A.wins / Math.max(1, tierBuckets.A.wins + tierBuckets.A.losses) : Number.NaN,
                B: tierBuckets.B.sample > 0 ? tierBuckets.B.wins / Math.max(1, tierBuckets.B.wins + tierBuckets.B.losses) : Number.NaN,
                C: tierBuckets.C.sample > 0 ? tierBuckets.C.wins / Math.max(1, tierBuckets.C.wins + tierBuckets.C.losses) : Number.NaN,
                D: tierBuckets.D.sample > 0 ? tierBuckets.D.wins / Math.max(1, tierBuckets.D.wins + tierBuckets.D.losses) : Number.NaN,
              },
            });
          } else {
            scheduleWorker();
          }
        });
      };

      for (let i = 0; i < maxWorkers; i++) {
        scheduleWorker();
      }
    });
  };

  const main = async () => {
    if (!Number.isFinite(BASELINE_RUNS) || BASELINE_RUNS <= 0) {
      throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
    }

    console.log(`running candidate scenario (${BASELINE_RUNS}): ${CANDIDATE_MODEL_VERSION}`);
    console.time(`${CANDIDATE_MODEL_VERSION} simulation time`);
    const candidateResult = await runParallelSimulation(BASELINE_RUNS, CANDIDATE_MODEL_VERSION);
    console.timeEnd(`${CANDIDATE_MODEL_VERSION} simulation time`);

    const aptitudeCalibration = {
      ladders: [],
      selectedLadderId: null,
    };
    for (const ladder of APTITUDE_LADDERS) {
      console.log(
        `running aptitude ladder scenario (${BASELINE_RUNS}): ${CANDIDATE_MODEL_VERSION} ${ladder.id}`,
      );
      console.time(`${CANDIDATE_MODEL_VERSION}-${ladder.id} simulation time`);
      const metrics = await runParallelSimulation(BASELINE_RUNS, CANDIDATE_MODEL_VERSION, ladder);
      console.timeEnd(`${CANDIDATE_MODEL_VERSION}-${ladder.id} simulation time`);
      const gate = evaluateAptitudeGate(metrics);
      aptitudeCalibration.ladders.push({
        id: ladder.id,
        factors: ladder.factors,
        metrics,
        gate,
      });
      if (!aptitudeCalibration.selectedLadderId && gate.allPass) {
        aptitudeCalibration.selectedLadderId = ladder.id;
      }
    }
    const selectedLadder = aptitudeCalibration.ladders.find(
      (ladder) => ladder.id === aptitudeCalibration.selectedLadderId,
    );
    const aptitudeAcceptance = selectedLadder
      ? {
        ...selectedLadder.gate,
        selectedLadderId: selectedLadder.id,
      }
      : {
        lowTierPass: false,
        careerLe35Pass: false,
        careerLe30Pass: false,
        allPass: false,
        selectedLadderId: null,
      };

    let result;
    if (IS_V3_ONLY_MODE) {
      result = {
        mode: 'v3-only',
        candidateModelVersion: CANDIDATE_MODEL_VERSION,
        candidate: candidateResult,
        acceptance: {
          aptitude: aptitudeAcceptance,
          allPass: aptitudeAcceptance.allPass,
        },
        aptitudeCalibration,
      };
    } else {
      console.log(`running baseline scenario (${BASELINE_RUNS}): ${BASELINE_MODEL_VERSION}`);
      console.time(`${BASELINE_MODEL_VERSION} simulation time`);
      const baselineResult = await runParallelSimulation(BASELINE_RUNS, BASELINE_MODEL_VERSION);
      console.timeEnd(`${BASELINE_MODEL_VERSION} simulation time`);

      const baselineGate = evaluateBaselineGate(baselineResult);
      const relativeGate = evaluateRelativeGate(baselineResult, candidateResult);
      result = {
        mode: 'compare',
        baselineModelVersion: BASELINE_MODEL_VERSION,
        candidateModelVersion: CANDIDATE_MODEL_VERSION,
        baseline: baselineResult,
        candidate: candidateResult,
        acceptance: {
          baseline: baselineGate,
          relative: relativeGate,
          aptitude: aptitudeAcceptance,
          allPass: baselineGate.allPass && relativeGate.allPass && aptitudeAcceptance.allPass,
        },
        aptitudeCalibration,
      };
    }

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
