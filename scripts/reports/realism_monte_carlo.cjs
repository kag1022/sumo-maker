const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const {
  createCareerRateAccumulator,
  finalizeCareerRateAccumulator,
  pushCareerRateSample,
} = require('./_shared/career_rate_metrics.cjs');

const BASELINE_MODEL_VERSION = 'unified-v2-kimarite';
const CANDIDATE_MODEL_VERSION = 'unified-v3-variance';
const BASE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const FIXED_START_YEAR = 2026;
const RELATIVE_TOLERANCE = 0.2;
const RUN_KIND = process.env.REALISM_RUN_KIND || 'acceptance';
const IS_COMPARE_MODE = process.env.REALISM_COMPARE === '1';
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;

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

const APTITUDE_LADDERS = [
  { id: 'ladder1', factors: { C: 0.84, D: 0.68 } },
  { id: 'ladder2', factors: { C: 0.82, D: 0.64 } },
  { id: 'ladder3', factors: { C: 0.8, D: 0.6 } },
];

const OUTPUTS = {
  quick: {
    reportPath: path.join('docs', 'balance', 'unified-v3-realism-quick.md'),
    jsonPath: path.join('.tmp', 'unified-v3-realism-quick.json'),
  },
  aptitude: {
    reportPath: path.join('docs', 'balance', 'unified-v3-aptitude-calibration.md'),
    jsonPath: path.join('.tmp', 'unified-v3-aptitude-calibration.json'),
  },
  acceptanceCompare: {
    reportPath: path.join('docs', 'balance', 'unified-v2-v3-acceptance.md'),
    jsonPath: path.join('.tmp', 'unified-v2-v3-acceptance.json'),
  },
  acceptanceV3: {
    reportPath: path.join('docs', 'balance', 'unified-v3-monte-carlo.md'),
    jsonPath: path.join('.tmp', 'unified-v3-monte-carlo.json'),
  },
};

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
      return buildInitialRikishiFromDraft({
        ...draft,
        selectedStableId: draft.selectedStableId ?? 'stable-001',
      });
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
        yieldControl: async () => {},
      },
    );

    const diagnostics = {
      sameStableViolations: 0,
      sameCardViolations: 0,
      crossDivisionBouts: 0,
      lateCrossDivisionBouts: 0,
      upperRankEarlyDeepOpponents: 0,
      upperRankEarlyTotalOpponents: 0,
    };

    while (true) {
      const step = await engine.runNextBasho();
      if (step.kind === 'BASHO') {
        diagnostics.sameStableViolations += step.diagnostics?.sameStableViolationCount ?? 0;
        diagnostics.sameCardViolations += step.diagnostics?.sameCardViolationCount ?? 0;
        diagnostics.crossDivisionBouts += step.diagnostics?.crossDivisionBoutCount ?? 0;
        diagnostics.lateCrossDivisionBouts += step.diagnostics?.lateCrossDivisionBoutCount ?? 0;

        const isUpperRank =
          step.playerRecord.rank.division === 'Makuuchi' &&
          (step.playerRecord.rank.name === '横綱' ||
            step.playerRecord.rank.name === '大関' ||
            step.playerRecord.rank.name === '関脇' ||
            step.playerRecord.rank.name === '小結');
        if (isUpperRank) {
          for (const bout of step.playerBouts) {
            if (bout.result === 'ABSENT' || bout.day > 5) continue;
            diagnostics.upperRankEarlyTotalOpponents += 1;
            if (bout.opponentRankName === '前頭' && (bout.opponentRankNumber ?? 0) >= 10) {
              diagnostics.upperRankEarlyDeepOpponents += 1;
            }
          }
        }
      }
      if (step.kind === 'COMPLETED') {
        return {
          status: step.statusSnapshot,
          diagnostics,
        };
      }
    }
  };

  const applyAptitudeLadder = (ladder) => {
    if (!ladder || !ladder.factors || !CONSTANTS?.APTITUDE_TIER_DATA) return;
    if (Number.isFinite(ladder.factors.C)) {
      CONSTANTS.APTITUDE_TIER_DATA.C.factor = ladder.factors.C;
      if (CONSTANTS.APTITUDE_PROFILE_DATA?.C) {
        CONSTANTS.APTITUDE_PROFILE_DATA.C.initialFactor = Math.max(0.4, ladder.factors.C * 0.92);
        CONSTANTS.APTITUDE_PROFILE_DATA.C.growthFactor = Math.max(0.45, ladder.factors.C);
        CONSTANTS.APTITUDE_PROFILE_DATA.C.boutFactor = Math.max(0.45, ladder.factors.C * 0.9);
      }
    }
    if (Number.isFinite(ladder.factors.D)) {
      CONSTANTS.APTITUDE_TIER_DATA.D.factor = ladder.factors.D;
      if (CONSTANTS.APTITUDE_PROFILE_DATA?.D) {
        CONSTANTS.APTITUDE_PROFILE_DATA.D.initialFactor = Math.max(0.35, ladder.factors.D * 0.88);
        CONSTANTS.APTITUDE_PROFILE_DATA.D.growthFactor = Math.max(0.4, ladder.factors.D);
        CONSTANTS.APTITUDE_PROFILE_DATA.D.boutFactor = Math.max(0.4, ladder.factors.D * 0.9);
      }
    }
  };

  const executeWorkerTask = async (seed, modelVersion, ladder) => {
    applyAptitudeLadder(ladder);
    const initial = createUneditedScoutInitial(seed);
    const result = await runCareerToEnd(initial, seed, modelVersion);
    const maxRank = result.status.history.maxRank;

    parentPort.postMessage({
      isSekitori: isSekitoriRank(maxRank),
      isMakuuchi: isMakuuchiRank(maxRank),
      isSanyaku: isSanyakuRank(maxRank),
      isYokozuna: isYokozunaRank(maxRank),
      aptitudeTier: initial.aptitudeTier ?? 'B',
      totalWins: result.status.history.totalWins,
      totalLosses: result.status.history.totalLosses,
      totalAbsent: result.status.history.totalAbsent,
      bashoCount: result.status.history.records.length,
      retireAge: result.status.age,
      sameStableViolations: result.diagnostics.sameStableViolations,
      sameCardViolations: result.diagnostics.sameCardViolations,
      crossDivisionBouts: result.diagnostics.crossDivisionBouts,
      lateCrossDivisionBouts: result.diagnostics.lateCrossDivisionBouts,
      upperRankEarlyDeepOpponents: result.diagnostics.upperRankEarlyDeepOpponents,
      upperRankEarlyTotalOpponents: result.diagnostics.upperRankEarlyTotalOpponents,
    });
  };

  executeWorkerTask(workerData.seed, workerData.modelVersion, workerData.ladder).catch((error) => {
    console.error('Worker error:', error);
    process.exit(1);
  });
} else {
  const percentile = (sortedValues, ratio) => {
    if (!sortedValues.length) return Number.NaN;
    const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * ratio)));
    return sortedValues[index];
  };

  const writeFile = (filePath, text) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, text, 'utf8');
  };

  const evaluateBaselineGate = (baseline) => {
    const yokozunaBandPass =
      baseline.yokozunaRate >= BASELINE_GATE.yokozunaMin &&
      baseline.yokozunaRate <= BASELINE_GATE.yokozunaMax;
    const sekitoriPass =
      baseline.sekitoriRate >= BASELINE_GATE.sekitoriMin &&
      baseline.sekitoriRate <= BASELINE_GATE.sekitoriMax;
    const makuuchiPass =
      baseline.makuuchiRate >= BASELINE_GATE.makuuchiMin &&
      baseline.makuuchiRate <= BASELINE_GATE.makuuchiMax;
    const sanyakuPass =
      baseline.sanyakuRate >= BASELINE_GATE.sanyakuMin &&
      baseline.sanyakuRate <= BASELINE_GATE.sanyakuMax;

    return {
      yokozunaBandPass,
      sekitoriPass,
      makuuchiPass,
      sanyakuPass,
      allPass: yokozunaBandPass && sekitoriPass && makuuchiPass && sanyakuPass,
    };
  };

  const evaluateRelativeGate = (baseline, candidate) => {
    const metrics = RELATIVE_METRICS.map(({ key, label }) => {
      const baseRate = baseline[key];
      const candidateRate = candidate[key];
      const delta = candidateRate - baseRate;
      const relativeDelta =
        baseRate === 0
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
      allPass: lowTierPass,
    };
  };

  const evaluateRealismKpiGate = (metrics) => {
    const careerWinRatePass =
      metrics.careerWinRate >= REALISM_KPI_GATE.careerWinRateMin &&
      metrics.careerWinRate <= REALISM_KPI_GATE.careerWinRateMax;
    const nonSekitoriCareerWinRatePass =
      metrics.nonSekitoriCareerWinRate >= REALISM_KPI_GATE.nonSekitoriCareerWinRateMin &&
      metrics.nonSekitoriCareerWinRate <= REALISM_KPI_GATE.nonSekitoriCareerWinRateMax;
    const losingCareerRatePass =
      metrics.losingCareerRate >= REALISM_KPI_GATE.losingCareerRateMin &&
      metrics.losingCareerRate <= REALISM_KPI_GATE.losingCareerRateMax;
    const careerLe35Pass =
      metrics.careerWinRateLe35Rate >= REALISM_KPI_GATE.careerLe35Min &&
      metrics.careerWinRateLe35Rate <= REALISM_KPI_GATE.careerLe35Max;
    const careerLe30Pass = metrics.careerWinRateLe30Rate >= REALISM_KPI_GATE.careerLe30Min;
    const sameStablePass = metrics.sameStableViolations === 0;
    const sameCardPass = metrics.sameCardViolations === 0;

    return {
      careerWinRatePass,
      nonSekitoriCareerWinRatePass,
      losingCareerRatePass,
      careerLe35Pass,
      careerLe30Pass,
      sameStablePass,
      sameCardPass,
      allPass: sameStablePass && sameCardPass,
    };
  };

  const runParallelSimulation = (runs, modelVersion, ladder) =>
    new Promise((resolve, reject) => {
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
      let totalAbsent = 0;
      let totalBasho = 0;
      const retireAges = [];
      const nonSekitoriBashoCounts = [];
      const overallCareerRates = createCareerRateAccumulator();
      const sekitoriCareerRates = createCareerRateAccumulator();
      const nonSekitoriCareerRates = createCareerRateAccumulator();
      let lowTierCount = 0;
      let careerWinRateLe35Count = 0;
      let careerWinRateLe30Count = 0;
      let sameStableViolations = 0;
      let sameCardViolations = 0;
      let crossDivisionBouts = 0;
      let lateCrossDivisionBouts = 0;
      let upperRankEarlyDeepOpponents = 0;
      let upperRankEarlyTotalOpponents = 0;
      const tierBuckets = {
        S: createCareerRateAccumulator(),
        A: createCareerRateAccumulator(),
        B: createCareerRateAccumulator(),
        C: createCareerRateAccumulator(),
        D: createCareerRateAccumulator(),
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

        worker.on('message', (message) => {
          if (message.isSekitori) sekitoriCount += 1;
          if (message.isMakuuchi) makuuchiCount += 1;
          if (message.isSanyaku) sanyakuCount += 1;
          if (message.isYokozuna) yokozunaCount += 1;

          totalWins += message.totalWins;
          totalLosses += message.totalLosses;
          totalAbsent += message.totalAbsent;
          totalBasho += message.bashoCount;
          retireAges.push(message.retireAge);
          const careerSample = pushCareerRateSample(overallCareerRates, {
            wins: message.totalWins,
            losses: message.totalLosses,
            absent: message.totalAbsent,
          });

          if (message.aptitudeTier === 'C' || message.aptitudeTier === 'D') {
            lowTierCount += 1;
          }
          if (careerSample.effectiveWinRate <= 0.35) {
            careerWinRateLe35Count += 1;
          }
          if (careerSample.effectiveWinRate <= 0.3) {
            careerWinRateLe30Count += 1;
          }
          if (tierBuckets[message.aptitudeTier]) {
            pushCareerRateSample(tierBuckets[message.aptitudeTier], {
              wins: message.totalWins,
              losses: message.totalLosses,
              absent: message.totalAbsent,
            });
          }
          if (message.isSekitori) {
            pushCareerRateSample(sekitoriCareerRates, {
              wins: message.totalWins,
              losses: message.totalLosses,
              absent: message.totalAbsent,
            });
          } else {
            pushCareerRateSample(nonSekitoriCareerRates, {
              wins: message.totalWins,
              losses: message.totalLosses,
              absent: message.totalAbsent,
            });
            nonSekitoriBashoCounts.push(message.bashoCount);
          }
          sameStableViolations += message.sameStableViolations ?? 0;
          sameCardViolations += message.sameCardViolations ?? 0;
          crossDivisionBouts += message.crossDivisionBouts ?? 0;
          lateCrossDivisionBouts += message.lateCrossDivisionBouts ?? 0;
          upperRankEarlyDeepOpponents += message.upperRankEarlyDeepOpponents ?? 0;
          upperRankEarlyTotalOpponents += message.upperRankEarlyTotalOpponents ?? 0;

          tasksCompleted += 1;
          if (tasksCompleted % 50 === 0) {
            console.log(
              `baseline_random_scout(${modelVersion}${ladder ? `:${ladder.id}` : ''}): ${tasksCompleted}/${runs} completed`,
            );
          }
        });

        worker.on('error', (error) => reject(error));
        worker.on('exit', (code) => {
          if (code !== 0) {
            reject(new Error(`Worker stopped with exit code ${code}`));
            return;
          }

          if (tasksCompleted >= runs) {
            const sortedRetireAges = retireAges.slice().sort((left, right) => left - right);
            const sortedNonSekitoriBasho = nonSekitoriBashoCounts.slice().sort((left, right) => left - right);
            const overallSummary = finalizeCareerRateAccumulator(overallCareerRates);
            const sekitoriSummary = finalizeCareerRateAccumulator(sekitoriCareerRates);
            const nonSekitoriSummary = finalizeCareerRateAccumulator(nonSekitoriCareerRates);
            resolve({
              sample: runs,
              sekitoriRate: sekitoriCount / runs,
              makuuchiRate: makuuchiCount / runs,
              sanyakuRate: sanyakuCount / runs,
              yokozunaRate: yokozunaCount / runs,
              avgTotalWins: totalWins / runs,
              avgTotalLosses: totalLosses / runs,
              avgTotalAbsent: totalAbsent / runs,
              careerWinRate: overallSummary.officialWinRate,
              careerEffectiveWinRate: overallSummary.effectiveWinRate,
              careerPooledWinRate: overallSummary.pooledWinRate,
              sekitoriCareerSample: sekitoriSummary.sampleCount,
              sekitoriCareerWinRate: sekitoriSummary.officialWinRate,
              sekitoriCareerEffectiveWinRate: sekitoriSummary.effectiveWinRate,
              sekitoriCareerPooledWinRate: sekitoriSummary.pooledWinRate,
              nonSekitoriCareerSample: nonSekitoriSummary.sampleCount,
              nonSekitoriCareerWinRate: nonSekitoriSummary.officialWinRate,
              nonSekitoriCareerEffectiveWinRate: nonSekitoriSummary.effectiveWinRate,
              nonSekitoriCareerPooledWinRate: nonSekitoriSummary.pooledWinRate,
              avgCareerBasho: totalBasho / runs,
              losingCareerRate: overallSummary.losingCareerRate,
              allCareerRetireAgeP50: percentile(sortedRetireAges, 0.5),
              nonSekitoriMedianBasho: percentile(sortedNonSekitoriBasho, 0.5),
              lowTierRate: lowTierCount / runs,
              careerWinRateLe35Rate: careerWinRateLe35Count / runs,
              careerWinRateLe30Rate: careerWinRateLe30Count / runs,
              sameStableViolations,
              sameCardViolations,
              crossDivisionBouts,
              lateCrossDivisionBouts,
              lateCrossDivisionRate:
                crossDivisionBouts > 0 ? lateCrossDivisionBouts / crossDivisionBouts : Number.NaN,
              upperRankEarlyDeepOpponentRate:
                upperRankEarlyTotalOpponents > 0
                  ? upperRankEarlyDeepOpponents / upperRankEarlyTotalOpponents
                  : Number.NaN,
              tierCareerWinRate: {
                S: finalizeCareerRateAccumulator(tierBuckets.S).officialWinRate,
                A: finalizeCareerRateAccumulator(tierBuckets.A).officialWinRate,
                B: finalizeCareerRateAccumulator(tierBuckets.B).officialWinRate,
                C: finalizeCareerRateAccumulator(tierBuckets.C).officialWinRate,
                D: finalizeCareerRateAccumulator(tierBuckets.D).officialWinRate,
              },
              tierCareerEffectiveWinRate: {
                S: finalizeCareerRateAccumulator(tierBuckets.S).effectiveWinRate,
                A: finalizeCareerRateAccumulator(tierBuckets.A).effectiveWinRate,
                B: finalizeCareerRateAccumulator(tierBuckets.B).effectiveWinRate,
                C: finalizeCareerRateAccumulator(tierBuckets.C).effectiveWinRate,
                D: finalizeCareerRateAccumulator(tierBuckets.D).effectiveWinRate,
              },
              tierCareerPooledWinRate: {
                S: finalizeCareerRateAccumulator(tierBuckets.S).pooledWinRate,
                A: finalizeCareerRateAccumulator(tierBuckets.A).pooledWinRate,
                B: finalizeCareerRateAccumulator(tierBuckets.B).pooledWinRate,
                C: finalizeCareerRateAccumulator(tierBuckets.C).pooledWinRate,
                D: finalizeCareerRateAccumulator(tierBuckets.D).pooledWinRate,
              },
            });
          } else {
            scheduleWorker();
          }
        });
      };

      for (let index = 0; index < maxWorkers; index += 1) {
        scheduleWorker();
      }
    });

  const pickOutputPaths = () => {
    if (RUN_KIND === 'quick') return OUTPUTS.quick;
    if (RUN_KIND === 'aptitude') return OUTPUTS.aptitude;
    return IS_COMPARE_MODE ? OUTPUTS.acceptanceCompare : OUTPUTS.acceptanceV3;
  };

  const formatTierWinRateLine = (tierWinRates) =>
    ['S', 'A', 'B', 'C', 'D']
      .map((tier) => `${tier}:${toPctOrNA(tierWinRates[tier])}`)
      .join(' / ');

  const renderGateLine = (label, target, actual, pass) =>
    `- ${label}: target ${target} / actual ${actual} / ${pass ? 'PASS' : 'FAIL'}`;

  const renderMonitorLine = (label, target, actual) =>
    `- ${label}: target ${target} / actual ${actual} / monitor`;

  const renderModelBlock = (lines, title, modelVersion, data) => {
    lines.push(`## ${title}`);
    lines.push('');
    lines.push(`- model: ${modelVersion}`);
    lines.push(`- 関取率: ${toPct(data.sekitoriRate)}`);
    lines.push(`- 幕内率: ${toPct(data.makuuchiRate)}`);
    lines.push(`- 三役率: ${toPct(data.sanyakuRate)}`);
    lines.push(`- 横綱率: ${toPct(data.yokozunaRate)}`);
    lines.push(`- 平均通算: ${data.avgTotalWins.toFixed(1)}勝 ${data.avgTotalLosses.toFixed(1)}敗 ${data.avgTotalAbsent.toFixed(1)}休`);
    lines.push(`- 通算勝率（公式平均）: ${toPct(data.careerWinRate)}`);
    lines.push(`- 通算勝率（有効平均）: ${toPct(data.careerEffectiveWinRate)}`);
    lines.push(`- 通算勝率（legacy pooled）: ${toPct(data.careerPooledWinRate)}`);
    lines.push(`- 通算勝率（関取経験者 / 公式）: ${toPctOrNA(data.sekitoriCareerWinRate)} (n=${data.sekitoriCareerSample})`);
    lines.push(`- 通算勝率（関取経験者 / 有効）: ${toPctOrNA(data.sekitoriCareerEffectiveWinRate)} (n=${data.sekitoriCareerSample})`);
    lines.push(`- 通算勝率（関取経験者 / pooled）: ${toPctOrNA(data.sekitoriCareerPooledWinRate)} (n=${data.sekitoriCareerSample})`);
    lines.push(`- 通算勝率（非関取 / 公式）: ${toPctOrNA(data.nonSekitoriCareerWinRate)} (n=${data.nonSekitoriCareerSample})`);
    lines.push(`- 通算勝率（非関取 / 有効）: ${toPctOrNA(data.nonSekitoriCareerEffectiveWinRate)} (n=${data.nonSekitoriCareerSample})`);
    lines.push(`- 通算勝率（非関取 / pooled）: ${toPctOrNA(data.nonSekitoriCareerPooledWinRate)} (n=${data.nonSekitoriCareerSample})`);
    lines.push(`- 平均場所数: ${data.avgCareerBasho.toFixed(1)}`);
    lines.push(`- 負け越しキャリア率（休場込み）: ${toPct(data.losingCareerRate)}`);
    lines.push(`- 引退年齢中央値: ${Number.isFinite(data.allCareerRetireAgeP50) ? data.allCareerRetireAgeP50.toFixed(1) : 'n/a'}`);
    lines.push(`- 非関取場所数中央値: ${Number.isFinite(data.nonSekitoriMedianBasho) ? data.nonSekitoriMedianBasho.toFixed(1) : 'n/a'}`);
    lines.push('');
  };

  const renderRealismSection = (lines, metrics, gate) => {
    lines.push('## Realism KPI');
    lines.push('');
    lines.push(renderMonitorLine('通算勝率（公式平均）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPct(metrics.careerWinRate)));
    lines.push(renderMonitorLine('通算勝率（有効平均）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPct(metrics.careerEffectiveWinRate)));
    lines.push(renderMonitorLine('通算勝率（legacy pooled）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPct(metrics.careerPooledWinRate)));
    lines.push(renderMonitorLine('非関取通算勝率（公式平均）', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(metrics.nonSekitoriCareerWinRate)));
    lines.push(renderMonitorLine('非関取通算勝率（有効平均）', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(metrics.nonSekitoriCareerEffectiveWinRate)));
    lines.push(renderMonitorLine('非関取通算勝率（legacy pooled）', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(metrics.nonSekitoriCareerPooledWinRate)));
    lines.push(renderMonitorLine('負け越しキャリア率（休場込み）', `${toPct(REALISM_KPI_GATE.losingCareerRateMin)}-${toPct(REALISM_KPI_GATE.losingCareerRateMax)}`, toPct(metrics.losingCareerRate)));
    lines.push(renderMonitorLine('effective career<=35%', `${toPct(REALISM_KPI_GATE.careerLe35Min)}-${toPct(REALISM_KPI_GATE.careerLe35Max)}`, toPct(metrics.careerWinRateLe35Rate)));
    lines.push(renderMonitorLine('effective career<=30%', `>= ${toPct(REALISM_KPI_GATE.careerLe30Min)}`, toPct(metrics.careerWinRateLe30Rate)));
    lines.push(renderGateLine('sameStable', '= 0', String(metrics.sameStableViolations), gate.sameStablePass));
    lines.push(renderGateLine('sameCard', '= 0', String(metrics.sameCardViolations), gate.sameCardPass));
    lines.push(`- lateCrossDivisionDistribution: ${toPctOrNA(metrics.lateCrossDivisionRate)} (late/total, monitor)`);
    lines.push(`- upper-rank opponent profile: ${toPctOrNA(metrics.upperRankEarlyDeepOpponentRate)} (序盤の深い平幕率, monitor)`);
    lines.push('');
  };

  const renderQuickReport = (payload) => {
    const { probe, gateResult } = payload;
    const lines = [
      `# ${CANDIDATE_MODEL_VERSION} Quick Realism Probe`,
      '',
      `- 実行日: ${payload.generatedAt}`,
      `- compiledAt: ${payload.compiledAt ?? 'n/a'}`,
      `- mode: quick`,
      `- candidate 本数: ${probe.sample}`,
      '',
      '## Metrics',
      '',
      renderMonitorLine('通算勝率（公式平均）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPct(probe.metrics.careerWinRate)),
      renderMonitorLine('通算勝率（有効平均）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPct(probe.metrics.careerEffectiveWinRate)),
      renderMonitorLine('通算勝率（legacy pooled）', `${toPct(REALISM_KPI_GATE.careerWinRateMin)}-${toPct(REALISM_KPI_GATE.careerWinRateMax)}`, toPct(probe.metrics.careerPooledWinRate)),
      renderMonitorLine('非関取通算勝率（公式平均）', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(probe.metrics.nonSekitoriCareerWinRate)),
      renderMonitorLine('非関取通算勝率（有効平均）', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(probe.metrics.nonSekitoriCareerEffectiveWinRate)),
      renderMonitorLine('非関取通算勝率（legacy pooled）', `${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMin)}-${toPct(REALISM_KPI_GATE.nonSekitoriCareerWinRateMax)}`, toPctOrNA(probe.metrics.nonSekitoriCareerPooledWinRate)),
      renderMonitorLine('負け越しキャリア率（休場込み）', `${toPct(REALISM_KPI_GATE.losingCareerRateMin)}-${toPct(REALISM_KPI_GATE.losingCareerRateMax)}`, toPct(probe.metrics.losingCareerRate)),
      renderGateLine('引退年齢中央値', 'monitor', Number.isFinite(probe.metrics.allCareerRetireAgeP50) ? probe.metrics.allCareerRetireAgeP50.toFixed(1) : 'n/a', true),
      renderGateLine('非関取場所数中央値', 'monitor', Number.isFinite(probe.metrics.nonSekitoriMedianBasho) ? probe.metrics.nonSekitoriMedianBasho.toFixed(1) : 'n/a', true),
      '',
      `- overall gate: ${gateResult.allPass ? 'PASS' : 'FAIL'}`,
      '',
    ];
    return lines.join('\n');
  };

  const renderAptitudeReport = (payload) => {
    const lines = [
      `# ${CANDIDATE_MODEL_VERSION} Aptitude Calibration`,
      '',
      `- 実行日: ${payload.generatedAt}`,
      `- compiledAt: ${payload.compiledAt ?? 'n/a'}`,
      `- mode: aptitude`,
      `- candidate 本数: ${payload.sample}`,
      '',
      `- gate: lowTier(C+D) ${toPct(APTITUDE_GATES.lowTierMin)}-${toPct(APTITUDE_GATES.lowTierMax)}, career<=35% ${toPct(APTITUDE_GATES.careerLe35Min)}-${toPct(APTITUDE_GATES.careerLe35Max)}, career<=30% >= ${toPct(APTITUDE_GATES.careerLe30Min)}`,
      `- selected ladder: ${payload.selectedLadderId ?? 'none'}`,
      '',
    ];

    for (const ladder of payload.ladders) {
      lines.push(`## ${ladder.id}`);
      lines.push('');
      lines.push(`- factors: C=${ladder.factors.C.toFixed(2)}, D=${ladder.factors.D.toFixed(2)}`);
      lines.push(renderGateLine('lowTier(C+D)', `${toPct(APTITUDE_GATES.lowTierMin)}-${toPct(APTITUDE_GATES.lowTierMax)}`, toPct(ladder.metrics.lowTierRate), ladder.gate.lowTierPass));
      lines.push(renderMonitorLine('effective career<=35%', `${toPct(APTITUDE_GATES.careerLe35Min)}-${toPct(APTITUDE_GATES.careerLe35Max)}`, toPct(ladder.metrics.careerWinRateLe35Rate)));
      lines.push(renderMonitorLine('effective career<=30%', `>= ${toPct(APTITUDE_GATES.careerLe30Min)}`, toPct(ladder.metrics.careerWinRateLe30Rate)));
      lines.push(`- tier別勝率（公式平均）: ${formatTierWinRateLine(ladder.metrics.tierCareerWinRate)}`);
      lines.push(`- tier別勝率（有効平均）: ${formatTierWinRateLine(ladder.metrics.tierCareerEffectiveWinRate)}`);
      lines.push(`- tier別勝率（legacy pooled）: ${formatTierWinRateLine(ladder.metrics.tierCareerPooledWinRate)}`);
      lines.push(`- gate: ${ladder.gate.allPass ? 'PASS' : 'FAIL'}`);
      lines.push('');
    }

    return lines.join('\n');
  };

  const renderAcceptanceReport = (result) => {
    const lines = [];
    if (!IS_COMPARE_MODE) {
      lines.push(`# ${CANDIDATE_MODEL_VERSION} Monte Carlo`);
      lines.push('');
      lines.push(`- 実行日: ${result.generatedAt}`);
      lines.push(`- compiledAt: ${result.compiledAt ?? 'n/a'}`);
      lines.push(`- mode: acceptance`);
      lines.push(`- candidate 本数: ${result.candidate.sample}`);
      lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
      lines.push('');
      renderModelBlock(lines, 'Candidate（無編集ランダムスカウト）', CANDIDATE_MODEL_VERSION, result.candidate);
      renderRealismSection(lines, result.candidate, result.acceptance.realismKpi);
      lines.push('## Gate Result');
      lines.push('');
      lines.push(`- realism KPI gate: ${result.acceptance.realismKpi.allPass ? 'PASS' : 'FAIL'}`);
      lines.push('');
      return lines.join('\n');
    }

    lines.push(`# ${BASELINE_MODEL_VERSION} vs ${CANDIDATE_MODEL_VERSION} Monte Carlo Acceptance`);
    lines.push('');
    lines.push(`- 実行日: ${result.generatedAt}`);
    lines.push(`- compiledAt: ${result.compiledAt ?? 'n/a'}`);
    lines.push(`- mode: acceptance-compare`);
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
    renderRealismSection(lines, result.candidate, result.acceptance.realismKpi);
    lines.push('## Gate Result');
    lines.push('');
    lines.push(`- baseline absolute gate (${BASELINE_MODEL_VERSION}): ${result.acceptance.baseline.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- relative gate (${CANDIDATE_MODEL_VERSION} vs ${BASELINE_MODEL_VERSION}): ${result.acceptance.relative.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- realism KPI gate (${CANDIDATE_MODEL_VERSION}): ${result.acceptance.realismKpi.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- overall: ${result.acceptance.allPass ? 'PASS' : 'FAIL'}`);
    lines.push('');
    return lines.join('\n');
  };

  const buildProbeMetrics = (metrics) => ({
    careerWinRate: metrics.careerWinRate,
    careerEffectiveWinRate: metrics.careerEffectiveWinRate,
    careerPooledWinRate: metrics.careerPooledWinRate,
    sekitoriCareerWinRate: metrics.sekitoriCareerWinRate,
    sekitoriCareerEffectiveWinRate: metrics.sekitoriCareerEffectiveWinRate,
    sekitoriCareerPooledWinRate: metrics.sekitoriCareerPooledWinRate,
    nonSekitoriCareerWinRate: metrics.nonSekitoriCareerWinRate,
    nonSekitoriCareerEffectiveWinRate: metrics.nonSekitoriCareerEffectiveWinRate,
    nonSekitoriCareerPooledWinRate: metrics.nonSekitoriCareerPooledWinRate,
    losingCareerRate: metrics.losingCareerRate,
    careerWinRateLe35Rate: metrics.careerWinRateLe35Rate,
    careerWinRateLe30Rate: metrics.careerWinRateLe30Rate,
    allCareerRetireAgeP50: metrics.allCareerRetireAgeP50,
    nonSekitoriMedianBasho: metrics.nonSekitoriMedianBasho,
    sekitoriRate: metrics.sekitoriRate,
    makuuchiRate: metrics.makuuchiRate,
    sanyakuRate: metrics.sanyakuRate,
    yokozunaRate: metrics.yokozunaRate,
    lowTierRate: metrics.lowTierRate,
    sameStableViolations: metrics.sameStableViolations,
    sameCardViolations: metrics.sameCardViolations,
    crossDivisionBouts: metrics.crossDivisionBouts,
    lateCrossDivisionBouts: metrics.lateCrossDivisionBouts,
    lateCrossDivisionRate: metrics.lateCrossDivisionRate,
    upperRankEarlyDeepOpponentRate: metrics.upperRankEarlyDeepOpponentRate,
    tierCareerWinRate: metrics.tierCareerWinRate,
    tierCareerEffectiveWinRate: metrics.tierCareerEffectiveWinRate,
    tierCareerPooledWinRate: metrics.tierCareerPooledWinRate,
  });

  const main = async () => {
    if (!Number.isFinite(BASE_RUNS) || BASE_RUNS <= 0) {
      throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
    }

    const generatedAt = new Date().toISOString();
    const { reportPath, jsonPath } = pickOutputPaths();

    if (RUN_KIND === 'quick') {
      console.log(`running quick scenario (${BASE_RUNS}): ${CANDIDATE_MODEL_VERSION}`);
      console.time(`${CANDIDATE_MODEL_VERSION} quick simulation time`);
      const candidate = await runParallelSimulation(BASE_RUNS, CANDIDATE_MODEL_VERSION);
      console.timeEnd(`${CANDIDATE_MODEL_VERSION} quick simulation time`);
      const gateResult = evaluateRealismKpiGate(candidate);
      const probe = {
        runKind: 'quick',
        scenarioId: 'candidate',
        sample: candidate.sample,
        modelVersion: CANDIDATE_MODEL_VERSION,
        compiledAt: COMPILED_AT,
        generatedAt,
        metrics: buildProbeMetrics(candidate),
        gateResult,
      };
      const payload = {
        runKind: 'quick',
        generatedAt,
        compiledAt: COMPILED_AT,
        probe,
        gateResult,
      };
      const report = renderQuickReport(payload);
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
        console.log(`running aptitude ladder scenario (${BASE_RUNS}): ${CANDIDATE_MODEL_VERSION} ${ladder.id}`);
        console.time(`${CANDIDATE_MODEL_VERSION}-${ladder.id} simulation time`);
        const metrics = await runParallelSimulation(BASE_RUNS, CANDIDATE_MODEL_VERSION, ladder);
        console.timeEnd(`${CANDIDATE_MODEL_VERSION}-${ladder.id} simulation time`);
        const gate = evaluateAptitudeGate(metrics);
        ladders.push({
          id: ladder.id,
          factors: ladder.factors,
          metrics: buildProbeMetrics(metrics),
          gate,
        });
        if (!selectedLadderId && gate.allPass) {
          selectedLadderId = ladder.id;
        }
      }

      const payload = {
        runKind: 'aptitude',
        scenarioId: 'aptitude-ladder',
        sample: BASE_RUNS,
        modelVersion: CANDIDATE_MODEL_VERSION,
        compiledAt: COMPILED_AT,
        generatedAt,
        selectedLadderId,
        ladders,
        gateResult: {
          allPass: Boolean(selectedLadderId),
        },
      };
      const report = renderAptitudeReport(payload);
      writeFile(reportPath, report);
      writeFile(jsonPath, JSON.stringify(payload, null, 2));
      console.log(report);
      console.log(`report written: ${reportPath}`);
      console.log(`json written: ${jsonPath}`);
      return;
    }

    console.log(`running candidate scenario (${BASE_RUNS}): ${CANDIDATE_MODEL_VERSION}`);
    console.time(`${CANDIDATE_MODEL_VERSION} simulation time`);
    const candidate = await runParallelSimulation(BASE_RUNS, CANDIDATE_MODEL_VERSION);
    console.timeEnd(`${CANDIDATE_MODEL_VERSION} simulation time`);
    const realismKpi = evaluateRealismKpiGate(candidate);

    if (!IS_COMPARE_MODE) {
      const result = {
        runKind: 'acceptance',
        generatedAt,
        compiledAt: COMPILED_AT,
        candidateModelVersion: CANDIDATE_MODEL_VERSION,
        candidate,
        probe: {
          runKind: 'acceptance',
          scenarioId: 'candidate',
          sample: candidate.sample,
          modelVersion: CANDIDATE_MODEL_VERSION,
          compiledAt: COMPILED_AT,
          generatedAt,
          metrics: buildProbeMetrics(candidate),
          gateResult: realismKpi,
        },
        acceptance: {
          realismKpi,
          allPass: realismKpi.allPass,
        },
      };
      const report = renderAcceptanceReport(result);
      writeFile(reportPath, report);
      writeFile(jsonPath, JSON.stringify(result, null, 2));
      console.log(report);
      console.log(`report written: ${reportPath}`);
      console.log(`json written: ${jsonPath}`);
      return;
    }

    console.log(`running baseline scenario (${BASE_RUNS}): ${BASELINE_MODEL_VERSION}`);
    console.time(`${BASELINE_MODEL_VERSION} simulation time`);
    const baseline = await runParallelSimulation(BASE_RUNS, BASELINE_MODEL_VERSION);
    console.timeEnd(`${BASELINE_MODEL_VERSION} simulation time`);
    const baselineGate = evaluateBaselineGate(baseline);
    const relativeGate = evaluateRelativeGate(baseline, candidate);
    const result = {
      runKind: 'acceptance',
      generatedAt,
      compiledAt: COMPILED_AT,
      baselineModelVersion: BASELINE_MODEL_VERSION,
      candidateModelVersion: CANDIDATE_MODEL_VERSION,
      baseline,
      candidate,
      acceptance: {
        baseline: baselineGate,
        relative: relativeGate,
        realismKpi,
        allPass: baselineGate.allPass && relativeGate.allPass && realismKpi.allPass,
      },
      probes: {
        baseline: {
          runKind: 'acceptance',
          scenarioId: 'baseline',
          sample: baseline.sample,
          modelVersion: BASELINE_MODEL_VERSION,
          compiledAt: COMPILED_AT,
          generatedAt,
          metrics: buildProbeMetrics(baseline),
          gateResult: baselineGate,
        },
        candidate: {
          runKind: 'acceptance',
          scenarioId: 'candidate',
          sample: candidate.sample,
          modelVersion: CANDIDATE_MODEL_VERSION,
          compiledAt: COMPILED_AT,
          generatedAt,
          metrics: buildProbeMetrics(candidate),
          gateResult: realismKpi,
        },
      },
    };
    const report = renderAcceptanceReport(result);
    writeFile(reportPath, report);
    writeFile(jsonPath, JSON.stringify(result, null, 2));
    console.log(report);
    console.log(`report written: ${reportPath}`);
    console.log(`json written: ${jsonPath}`);
  };

  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
