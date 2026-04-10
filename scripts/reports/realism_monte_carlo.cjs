const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const {
  createCareerRateAccumulator,
  finalizeCareerRateAccumulator,
  pushCareerRateSample,
} = require('./_shared/career_rate_metrics.cjs');
const { loadCalibrationBundle } = require('./_shared/calibrationTargets.cjs');

const BASELINE_MODEL_VERSION = 'unified-v2-kimarite';
const CANDIDATE_MODEL_VERSION = 'unified-v3-variance';
const BASE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const FIXED_START_YEAR = 2026;
const RELATIVE_TOLERANCE = 0.2;
const CALIBRATION_RATE_TOLERANCE = 0.15;
const CALIBRATION_ABSOLUTE_TOLERANCE = {
  avgCareerBashoMean: 8,
  avgCareerBashoP50: 8,
  careerWinRateMean: 0.025,
  careerWinRateMedian: 0.025,
};
const RUN_KIND = process.env.REALISM_RUN_KIND || 'acceptance';
const IS_COMPARE_MODE = process.env.REALISM_COMPARE === '1';
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;

const RELATIVE_METRICS = [
  { key: 'sekitoriRate', label: '関取率' },
  { key: 'makuuchiRate', label: '幕内率' },
  { key: 'sanyakuRate', label: '三役率' },
  { key: 'yokozunaRate', label: '横綱率' },
];

const CALIBRATION_RATE_METRICS = [
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

const KIMARITE_VARIETY_GATE = {
  PUSH: { p50Min: 10, p50Max: 18, p90Max: 28 },
  GRAPPLE: { p50Min: 14, p50Max: 24, p90Max: 34 },
  TECHNIQUE: { p50Min: 18, p50Max: 32, p90Max: 44 },
  variety20RateMin: 0.03,
  variety20RateMax: 0.35,
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
  const { listOfficialWinningKimariteCatalog } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'kimarite',
    'catalog.js',
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

  const OFFICIAL_KIMARITE_MAP = new Map(
    listOfficialWinningKimariteCatalog().map((entry) => [entry.name, entry]),
  );

  const resolveStyleBucketFromFamily = (family) => {
    if (family === 'PUSH_THRUST') return 'PUSH';
    if (family === 'FORCE_OUT') return 'GRAPPLE';
    return 'TECHNIQUE';
  };

  const summarizeKimariteMetrics = (kimariteTotal) => {
    const entries = Object.entries(kimariteTotal || {})
      .filter(([, count]) => count > 0)
      .map(([name, count]) => ({ name, count, entry: OFFICIAL_KIMARITE_MAP.get(name) }))
      .filter((row) => row.entry);
    if (!entries.length) {
      return {
        uniqueOfficialKimariteCount: 0,
        top1MoveShare: Number.NaN,
        top3MoveShare: Number.NaN,
        rareMoveRate: Number.NaN,
        dominantStyleBucket: null,
      };
    }

    const total = entries.reduce((sum, row) => sum + row.count, 0);
    const sorted = entries.slice().sort((left, right) => right.count - left.count);
    let rareCount = 0;
    const familyWeights = new Map();
    for (const row of entries) {
      familyWeights.set(
        row.entry.family,
        (familyWeights.get(row.entry.family) ?? 0) + row.count,
      );
      if (row.entry.rarityBucket === 'RARE' || row.entry.rarityBucket === 'EXTREME') {
        rareCount += row.count;
      }
    }
    const dominantFamily = [...familyWeights.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
    return {
      uniqueOfficialKimariteCount: entries.length,
      top1MoveShare: sorted[0].count / total,
      top3MoveShare: sorted.slice(0, 3).reduce((sum, row) => sum + row.count, 0) / total,
      rareMoveRate: rareCount / total,
      dominantStyleBucket: dominantFamily ? resolveStyleBucketFromFamily(dominantFamily) : null,
    };
  };

  const summarizeWinRouteMetrics = (winRouteTotal) => {
    const entries = Object.entries(winRouteTotal || {}).filter(([, count]) => count > 0);
    if (!entries.length) {
      return {
        dominantRoute: null,
        dominantRouteShare: Number.NaN,
        top2RouteShare: Number.NaN,
      };
    }
    const sorted = entries.slice().sort((left, right) => right[1] - left[1]);
    const total = sorted.reduce((sum, [, count]) => sum + count, 0);
    return {
      dominantRoute: sorted[0]?.[0] ?? null,
      dominantRouteShare: sorted[0] ? sorted[0][1] / total : Number.NaN,
      top2RouteShare: sorted.slice(0, 2).reduce((sum, [, count]) => sum + count, 0) / total,
    };
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
    const kimariteMetrics = summarizeKimariteMetrics(result.status.history.kimariteTotal);
    const winRouteMetrics = summarizeWinRouteMetrics(result.status.history.winRouteTotal);
    const kimariteVarietyEligible =
      result.status.history.totalWins >= 100 && result.status.history.records.length >= 20;

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
      kimariteVarietyEligible,
      uniqueOfficialKimariteCount: kimariteMetrics.uniqueOfficialKimariteCount,
      top1MoveShare: kimariteMetrics.top1MoveShare,
      top3MoveShare: kimariteMetrics.top3MoveShare,
      rareMoveRate: kimariteMetrics.rareMoveRate,
      dominantStyleBucket: kimariteMetrics.dominantStyleBucket,
      dominantRoute: winRouteMetrics.dominantRoute,
      dominantRouteShare: winRouteMetrics.dominantRouteShare,
      top2RouteShare: winRouteMetrics.top2RouteShare,
      winRouteCounts: result.status.history.winRouteTotal,
      kimariteCounts: result.status.history.kimariteTotal,
      kimariteVariety20Reached:
        kimariteVarietyEligible && kimariteMetrics.uniqueOfficialKimariteCount >= 20,
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

  const buildCalibrationGate = (metrics, calibrationTarget) => {
    const rateChecks = CALIBRATION_RATE_METRICS.map(({ key, label }) => {
      const target = calibrationTarget.rankRates[key];
      const actual = metrics[key];
      const delta = actual - target;
      const relativeDelta = target === 0 ? (actual === 0 ? 0 : Number.POSITIVE_INFINITY) : delta / target;
      return {
        key,
        label,
        kind: 'rate',
        target,
        actual,
        delta,
        tolerance: CALIBRATION_RATE_TOLERANCE,
        pass: Number.isFinite(relativeDelta) && Math.abs(relativeDelta) <= CALIBRATION_RATE_TOLERANCE,
      };
    });

    const continuousChecks = [
      {
        key: 'avgCareerBashoMean',
        label: '平均場所数',
        target: calibrationTarget.careerLength.mean,
        actual: metrics.avgCareerBasho,
        tolerance: CALIBRATION_ABSOLUTE_TOLERANCE.avgCareerBashoMean,
      },
      {
        key: 'avgCareerBashoP50',
        label: '場所数中央値',
        target: calibrationTarget.careerLength.p50,
        actual: metrics.careerBashoP50,
        tolerance: CALIBRATION_ABSOLUTE_TOLERANCE.avgCareerBashoP50,
      },
      {
        key: 'careerWinRateMean',
        label: '通算勝率平均',
        target: calibrationTarget.careerWinRate.mean,
        actual: metrics.careerWinRate,
        tolerance: CALIBRATION_ABSOLUTE_TOLERANCE.careerWinRateMean,
      },
      {
        key: 'careerWinRateMedian',
        label: '通算勝率中央値',
        target: calibrationTarget.careerWinRate.median,
        actual: metrics.careerWinRateP50,
        tolerance: CALIBRATION_ABSOLUTE_TOLERANCE.careerWinRateMedian,
      },
    ].map((entry) => ({
      ...entry,
      kind: 'continuous',
      delta: entry.actual - entry.target,
      pass: Number.isFinite(entry.actual) && Math.abs(entry.actual - entry.target) <= entry.tolerance,
    }));

    return {
      source: calibrationTarget.meta.source,
      era: calibrationTarget.meta.era,
      sampleSize: calibrationTarget.meta.sampleSize,
      checks: rateChecks.concat(continuousChecks),
      allPass: rateChecks.concat(continuousChecks).every((entry) => entry.pass),
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

  const evaluateKimariteVarietyGate = (metrics) => {
    const bucketPasses = Object.fromEntries(
      Object.entries(KIMARITE_VARIETY_GATE)
        .filter(([key]) => key === 'PUSH' || key === 'GRAPPLE' || key === 'TECHNIQUE')
        .map(([bucket, gate]) => {
          const sample = metrics.styleBucketMetrics?.[bucket];
          if (!sample || !sample.sample) {
            return [bucket, { sample: 0, p50Pass: true, p90Pass: true, allPass: true }];
          }
          const p50Pass =
            sample.uniqueKimariteP50 >= gate.p50Min && sample.uniqueKimariteP50 <= gate.p50Max;
          const p90Pass = sample.uniqueKimariteP90 <= gate.p90Max;
          return [bucket, { sample: sample.sample, p50Pass, p90Pass, allPass: p50Pass && p90Pass }];
        }),
    );
    const variety20Pass =
      !Number.isFinite(metrics.kimariteVariety20Rate) ||
      (metrics.kimariteVariety20Rate >= KIMARITE_VARIETY_GATE.variety20RateMin &&
        metrics.kimariteVariety20Rate <= KIMARITE_VARIETY_GATE.variety20RateMax);
    return {
      bucketPasses,
      variety20Pass,
      allPass:
        Object.values(bucketPasses).every((entry) => entry.allPass) &&
        variety20Pass,
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
      const careerBashoCounts = [];
      const officialCareerWinRates = [];
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
      const uniqueOfficialKimariteCounts = [];
      const top1MoveShares = [];
      const top3MoveShares = [];
      const dominantRouteShares = [];
      const top2RouteShares = [];
      const rareMoveRates = [];
      const aggregateKimariteCounts = new Map();
      const aggregateWinRouteCounts = new Map();
      let kimariteVarietyEligibleCount = 0;
      let kimariteVariety20Count = 0;
      const styleBucketMetrics = {
        PUSH: { uniqueCounts: [], top1Shares: [], top3Shares: [], rareRates: [] },
        GRAPPLE: { uniqueCounts: [], top1Shares: [], top3Shares: [], rareRates: [] },
        TECHNIQUE: { uniqueCounts: [], top1Shares: [], top3Shares: [], rareRates: [] },
      };
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
          careerBashoCounts.push(message.bashoCount);
          const careerSample = pushCareerRateSample(overallCareerRates, {
            wins: message.totalWins,
            losses: message.totalLosses,
            absent: message.totalAbsent,
          });
          officialCareerWinRates.push(careerSample.officialWinRate);

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
          if (message.kimariteVarietyEligible) {
            kimariteVarietyEligibleCount += 1;
            if (message.kimariteVariety20Reached) kimariteVariety20Count += 1;
            if (Number.isFinite(message.uniqueOfficialKimariteCount)) {
              uniqueOfficialKimariteCounts.push(message.uniqueOfficialKimariteCount);
            }
            if (Number.isFinite(message.top1MoveShare)) {
              top1MoveShares.push(message.top1MoveShare);
            }
            if (Number.isFinite(message.top3MoveShare)) {
              top3MoveShares.push(message.top3MoveShare);
            }
            if (Number.isFinite(message.rareMoveRate)) {
              rareMoveRates.push(message.rareMoveRate);
            }
            if (Number.isFinite(message.dominantRouteShare)) {
              dominantRouteShares.push(message.dominantRouteShare);
            }
            if (Number.isFinite(message.top2RouteShare)) {
              top2RouteShares.push(message.top2RouteShare);
            }
            if (message.dominantStyleBucket && styleBucketMetrics[message.dominantStyleBucket]) {
              styleBucketMetrics[message.dominantStyleBucket].uniqueCounts.push(
                message.uniqueOfficialKimariteCount,
              );
              styleBucketMetrics[message.dominantStyleBucket].top1Shares.push(
                message.top1MoveShare,
              );
              styleBucketMetrics[message.dominantStyleBucket].top3Shares.push(
                message.top3MoveShare,
              );
              styleBucketMetrics[message.dominantStyleBucket].rareRates.push(
                message.rareMoveRate,
              );
            }
          }
          for (const [name, count] of Object.entries(message.kimariteCounts || {})) {
            if (!Number.isFinite(count) || count <= 0) continue;
            aggregateKimariteCounts.set(name, (aggregateKimariteCounts.get(name) ?? 0) + count);
          }
          for (const [name, count] of Object.entries(message.winRouteCounts || {})) {
            if (!Number.isFinite(count) || count <= 0) continue;
            aggregateWinRouteCounts.set(name, (aggregateWinRouteCounts.get(name) ?? 0) + count);
          }

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
            const sortedCareerBashoCounts = careerBashoCounts.slice().sort((left, right) => left - right);
            const sortedOfficialCareerWinRates = officialCareerWinRates.slice().sort((left, right) => left - right);
            const sortedNonSekitoriBasho = nonSekitoriBashoCounts.slice().sort((left, right) => left - right);
            const sortedUniqueOfficialKimariteCounts = uniqueOfficialKimariteCounts.slice().sort((left, right) => left - right);
            const sortedTop1MoveShares = top1MoveShares.slice().sort((left, right) => left - right);
            const sortedTop3MoveShares = top3MoveShares.slice().sort((left, right) => left - right);
            const sortedDominantRouteShares = dominantRouteShares.slice().sort((left, right) => left - right);
            const sortedTop2RouteShares = top2RouteShares.slice().sort((left, right) => left - right);
            const totalKimariteCount = [...aggregateKimariteCounts.values()].reduce((sum, value) => sum + value, 0);
            const topKimarite = [...aggregateKimariteCounts.entries()]
              .sort((left, right) => right[1] - left[1])
              .slice(0, 10)
              .map(([name, count]) => ({
                name,
                count,
                share: totalKimariteCount > 0 ? count / totalKimariteCount : Number.NaN,
              }));
            const totalWinRouteCount = [...aggregateWinRouteCounts.values()].reduce((sum, value) => sum + value, 0);
            const topWinRoutes = [...aggregateWinRouteCounts.entries()]
              .sort((left, right) => right[1] - left[1])
              .map(([name, count]) => ({
                name,
                count,
                share: totalWinRouteCount > 0 ? count / totalWinRouteCount : Number.NaN,
              }));
            const overallSummary = finalizeCareerRateAccumulator(overallCareerRates);
            const sekitoriSummary = finalizeCareerRateAccumulator(sekitoriCareerRates);
            const nonSekitoriSummary = finalizeCareerRateAccumulator(nonSekitoriCareerRates);
            const finalizedStyleBucketMetrics = Object.fromEntries(
              Object.entries(styleBucketMetrics).map(([bucket, values]) => {
                const uniqueCounts = values.uniqueCounts.slice().sort((left, right) => left - right);
                const top1Shares = values.top1Shares.slice().sort((left, right) => left - right);
                const top3Shares = values.top3Shares.slice().sort((left, right) => left - right);
                return [bucket, {
                  sample: values.uniqueCounts.length,
                  uniqueKimariteP50: percentile(uniqueCounts, 0.5),
                  uniqueKimariteP90: percentile(uniqueCounts, 0.9),
                  top1MoveShareP50: percentile(top1Shares, 0.5),
                  top3MoveShareP50: percentile(top3Shares, 0.5),
                  rareMoveRate:
                    values.rareRates.length > 0
                      ? values.rareRates.reduce((sum, value) => sum + value, 0) / values.rareRates.length
                      : Number.NaN,
                }];
              }),
            );
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
              careerBashoP50: percentile(sortedCareerBashoCounts, 0.5),
              losingCareerRate: overallSummary.losingCareerRate,
              careerWinRateP50: percentile(sortedOfficialCareerWinRates, 0.5),
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
              uniqueKimariteP50: percentile(sortedUniqueOfficialKimariteCounts, 0.5),
              uniqueKimariteP90: percentile(sortedUniqueOfficialKimariteCounts, 0.9),
              topMoveShareP50: percentile(sortedTop1MoveShares, 0.5),
              top3MoveShareP50: percentile(sortedTop3MoveShares, 0.5),
              dominantRouteShareP50: percentile(sortedDominantRouteShares, 0.5),
              top2RouteShareP50: percentile(sortedTop2RouteShares, 0.5),
              rareMoveRate:
                rareMoveRates.length > 0
                  ? rareMoveRates.reduce((sum, value) => sum + value, 0) / rareMoveRates.length
                  : Number.NaN,
              topKimarite,
              topWinRoutes,
              kimariteVariety20Rate:
                kimariteVarietyEligibleCount > 0
                  ? kimariteVariety20Count / kimariteVarietyEligibleCount
                  : Number.NaN,
              styleBucketMetrics: finalizedStyleBucketMetrics,
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

  const formatCalibrationValue = (entry, value) => {
    if (!Number.isFinite(value)) return 'n/a';
    if (entry.kind === 'rate') return toPct(value);
    return value.toFixed(2);
  };

  const formatCalibrationTolerance = (entry) =>
    entry.kind === 'rate'
      ? `±${(entry.tolerance * 100).toFixed(0)}%`
      : `±${entry.tolerance.toFixed(2)}`;

  const renderCalibrationSection = (lines, gate) => {
    lines.push('## Calibration Target');
    lines.push('');
    lines.push(`- source: ${gate.source}`);
    lines.push(`- era: ${gate.era}`);
    lines.push(`- target sampleSize: ${gate.sampleSize}`);
    lines.push('');
    for (const entry of gate.checks) {
      const deltaText = Number.isFinite(entry.delta)
        ? (entry.kind === 'rate' ? toPct(entry.delta) : entry.delta.toFixed(2))
        : 'n/a';
      lines.push(
        `- ${entry.label}: target ${formatCalibrationValue(entry, entry.target)} / actual ${formatCalibrationValue(entry, entry.actual)} / delta ${deltaText} / tolerance ${formatCalibrationTolerance(entry)} / ${entry.pass ? 'PASS' : 'FAIL'}`,
      );
    }
    lines.push('');
  };

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
    lines.push(`- 通算勝率（公式中央値）: ${toPctOrNA(data.careerWinRateP50)}`);
    lines.push(`- 通算勝率（有効平均）: ${toPct(data.careerEffectiveWinRate)}`);
    lines.push(`- 通算勝率（legacy pooled）: ${toPct(data.careerPooledWinRate)}`);
    lines.push(`- 通算勝率（関取経験者 / 公式）: ${toPctOrNA(data.sekitoriCareerWinRate)} (n=${data.sekitoriCareerSample})`);
    lines.push(`- 通算勝率（関取経験者 / 有効）: ${toPctOrNA(data.sekitoriCareerEffectiveWinRate)} (n=${data.sekitoriCareerSample})`);
    lines.push(`- 通算勝率（関取経験者 / pooled）: ${toPctOrNA(data.sekitoriCareerPooledWinRate)} (n=${data.sekitoriCareerSample})`);
    lines.push(`- 通算勝率（非関取 / 公式）: ${toPctOrNA(data.nonSekitoriCareerWinRate)} (n=${data.nonSekitoriCareerSample})`);
    lines.push(`- 通算勝率（非関取 / 有効）: ${toPctOrNA(data.nonSekitoriCareerEffectiveWinRate)} (n=${data.nonSekitoriCareerSample})`);
    lines.push(`- 通算勝率（非関取 / pooled）: ${toPctOrNA(data.nonSekitoriCareerPooledWinRate)} (n=${data.nonSekitoriCareerSample})`);
    lines.push(`- 平均場所数: ${data.avgCareerBasho.toFixed(1)}`);
    lines.push(`- 場所数中央値: ${Number.isFinite(data.careerBashoP50) ? data.careerBashoP50.toFixed(1) : 'n/a'}`);
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

  const renderKimariteVarietySection = (lines, metrics, gate) => {
    lines.push('## Kimarite Variety');
    lines.push('');
    lines.push(renderMonitorLine('通算種類数 P50', 'style-bucket target', Number.isFinite(metrics.uniqueKimariteP50) ? String(metrics.uniqueKimariteP50.toFixed(1)) : 'n/a'));
    lines.push(renderMonitorLine('通算種類数 P90', 'style-bucket target', Number.isFinite(metrics.uniqueKimariteP90) ? String(metrics.uniqueKimariteP90.toFixed(1)) : 'n/a'));
    lines.push(renderMonitorLine('主力1手比率 P50', 'monitor', toPctOrNA(metrics.topMoveShareP50)));
    lines.push(renderMonitorLine('主力3手比率 P50', 'monitor', toPctOrNA(metrics.top3MoveShareP50)));
    lines.push(renderMonitorLine('勝ち筋支配率 P50', 'monitor', toPctOrNA(metrics.dominantRouteShareP50)));
    lines.push(renderMonitorLine('勝ち筋上位2本比率 P50', 'monitor', toPctOrNA(metrics.top2RouteShareP50)));
    lines.push(renderMonitorLine('レア技率', 'monitor', toPctOrNA(metrics.rareMoveRate)));
    lines.push(renderGateLine('20種類達成率', `${toPct(KIMARITE_VARIETY_GATE.variety20RateMin)}-${toPct(KIMARITE_VARIETY_GATE.variety20RateMax)}`, toPctOrNA(metrics.kimariteVariety20Rate), gate.variety20Pass));
    for (const bucket of ['PUSH', 'GRAPPLE', 'TECHNIQUE']) {
      const sample = metrics.styleBucketMetrics?.[bucket];
      const bucketGate = gate.bucketPasses[bucket];
      const target = KIMARITE_VARIETY_GATE[bucket];
      lines.push(
        renderGateLine(
          `${bucket} unique P50`,
          `${target.p50Min}-${target.p50Max}`,
          sample?.sample ? sample.uniqueKimariteP50.toFixed(1) : 'n/a',
          bucketGate.p50Pass,
        ),
      );
      lines.push(
        renderGateLine(
          `${bucket} unique P90`,
          `<= ${target.p90Max}`,
          sample?.sample ? sample.uniqueKimariteP90.toFixed(1) : 'n/a',
          bucketGate.p90Pass,
        ),
      );
    }
    if (metrics.topKimarite?.length) {
      lines.push('');
      lines.push('- simulated top10:');
      for (const row of metrics.topKimarite) {
        lines.push(`  - ${row.name}: ${row.count} (${toPctOrNA(row.share)})`);
      }
    }
    if (metrics.topWinRoutes?.length) {
      lines.push('');
      lines.push('- win routes:');
      for (const row of metrics.topWinRoutes) {
        lines.push(`  - ${row.name}: ${row.count} (${toPctOrNA(row.share)})`);
      }
    }
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
    if (payload.calibrationGate) {
      renderCalibrationSection(lines, payload.calibrationGate);
      lines.push(`- calibration gate: ${payload.calibrationGate.allPass ? 'PASS' : 'FAIL'}`);
      lines.push('');
    }
    renderKimariteVarietySection(lines, probe.metrics, payload.kimariteVarietyGate);
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
      renderCalibrationSection(lines, result.acceptance.calibration);
      renderRealismSection(lines, result.candidate, result.acceptance.realismKpi);
      renderKimariteVarietySection(lines, result.candidate, result.acceptance.kimariteVariety);
      lines.push('## Gate Result');
      lines.push('');
      lines.push(`- calibration gate: ${result.acceptance.calibration.allPass ? 'PASS' : 'FAIL'}`);
      lines.push(`- realism KPI gate: ${result.acceptance.realismKpi.allPass ? 'PASS' : 'FAIL'}`);
      lines.push(`- kimarite variety gate: ${result.acceptance.kimariteVariety.allPass ? 'PASS' : 'FAIL'}`);
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
    renderCalibrationSection(lines, result.acceptance.calibration);
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
    renderKimariteVarietySection(lines, result.candidate, result.acceptance.kimariteVariety);
    lines.push('## Gate Result');
    lines.push('');
    lines.push(`- calibration gate (${CANDIDATE_MODEL_VERSION}): ${result.acceptance.calibration.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- relative gate (${CANDIDATE_MODEL_VERSION} vs ${BASELINE_MODEL_VERSION}): ${result.acceptance.relative.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- realism KPI gate (${CANDIDATE_MODEL_VERSION}): ${result.acceptance.realismKpi.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- kimarite variety gate (${CANDIDATE_MODEL_VERSION}): ${result.acceptance.kimariteVariety.allPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- overall: ${result.acceptance.allPass ? 'PASS' : 'FAIL'}`);
    lines.push('');
    return lines.join('\n');
  };

  const buildProbeMetrics = (metrics) => ({
    careerWinRate: metrics.careerWinRate,
    careerWinRateP50: metrics.careerWinRateP50,
    careerEffectiveWinRate: metrics.careerEffectiveWinRate,
    careerPooledWinRate: metrics.careerPooledWinRate,
    sekitoriCareerWinRate: metrics.sekitoriCareerWinRate,
    sekitoriCareerEffectiveWinRate: metrics.sekitoriCareerEffectiveWinRate,
    sekitoriCareerPooledWinRate: metrics.sekitoriCareerPooledWinRate,
    nonSekitoriCareerWinRate: metrics.nonSekitoriCareerWinRate,
    nonSekitoriCareerEffectiveWinRate: metrics.nonSekitoriCareerEffectiveWinRate,
    nonSekitoriCareerPooledWinRate: metrics.nonSekitoriCareerPooledWinRate,
    losingCareerRate: metrics.losingCareerRate,
    avgCareerBasho: metrics.avgCareerBasho,
    careerBashoP50: metrics.careerBashoP50,
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
    uniqueKimariteP50: metrics.uniqueKimariteP50,
    uniqueKimariteP90: metrics.uniqueKimariteP90,
    topMoveShareP50: metrics.topMoveShareP50,
    top3MoveShareP50: metrics.top3MoveShareP50,
    dominantRouteShareP50: metrics.dominantRouteShareP50,
    top2RouteShareP50: metrics.top2RouteShareP50,
    rareMoveRate: metrics.rareMoveRate,
    topKimarite: metrics.topKimarite,
    topWinRoutes: metrics.topWinRoutes,
    kimariteVariety20Rate: metrics.kimariteVariety20Rate,
    styleBucketMetrics: metrics.styleBucketMetrics,
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
    const calibrationBundle = loadCalibrationBundle({ required: RUN_KIND === 'acceptance' });
    const careerCalibrationTarget = calibrationBundle?.career ?? null;

    if (RUN_KIND === 'quick') {
      console.log(`running quick scenario (${BASE_RUNS}): ${CANDIDATE_MODEL_VERSION}`);
      console.time(`${CANDIDATE_MODEL_VERSION} quick simulation time`);
      const candidate = await runParallelSimulation(BASE_RUNS, CANDIDATE_MODEL_VERSION);
      console.timeEnd(`${CANDIDATE_MODEL_VERSION} quick simulation time`);
      const gateResult = evaluateRealismKpiGate(candidate);
      const kimariteVarietyGate = evaluateKimariteVarietyGate(candidate);
      const calibrationGate = careerCalibrationTarget
        ? buildCalibrationGate(candidate, careerCalibrationTarget)
        : null;
      const probe = {
        runKind: 'quick',
        scenarioId: 'candidate',
        sample: candidate.sample,
        modelVersion: CANDIDATE_MODEL_VERSION,
        compiledAt: COMPILED_AT,
        generatedAt,
        metrics: buildProbeMetrics(candidate),
        gateResult: {
          ...gateResult,
          calibrationPass: calibrationGate?.allPass ?? null,
          kimariteVarietyPass: kimariteVarietyGate.allPass,
        },
      };
      const payload = {
        runKind: 'quick',
        generatedAt,
        compiledAt: COMPILED_AT,
        probe,
        gateResult,
        calibrationGate,
        kimariteVarietyGate,
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
    const calibrationGate = buildCalibrationGate(candidate, careerCalibrationTarget);
    const realismKpi = evaluateRealismKpiGate(candidate);
    const kimariteVariety = evaluateKimariteVarietyGate(candidate);

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
          calibration: calibrationGate,
          realismKpi,
          kimariteVariety,
          allPass: calibrationGate.allPass && realismKpi.allPass && kimariteVariety.allPass,
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
        calibration: calibrationGate,
        relative: relativeGate,
        realismKpi,
        kimariteVariety,
        allPass: calibrationGate.allPass && relativeGate.allPass && realismKpi.allPass && kimariteVariety.allPass,
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
          gateResult: {
            calibrationPass: null,
            relativePass: relativeGate.allPass,
          },
        },
        candidate: {
          runKind: 'acceptance',
          scenarioId: 'candidate',
          sample: candidate.sample,
          modelVersion: CANDIDATE_MODEL_VERSION,
          compiledAt: COMPILED_AT,
          generatedAt,
          metrics: buildProbeMetrics(candidate),
          gateResult: {
            calibrationPass: calibrationGate.allPass,
            ...realismKpi,
            kimariteVarietyPass: kimariteVariety.allPass,
          },
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
