const path = require('path');
const { parentPort, workerData } = require('worker_threads');

// realism_monte_carlo.cjs から呼ばれるワーカー本体。
// 1 つの seed で 1 人の力士をキャリア終了までシミュレートし、
// 統計用の集計メッセージを parentPort へ返す。

const FIXED_START_YEAR = 2026;

const TOP_DIVISION_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const isSekitoriRank = (rank) => rank.division === 'Makuuchi' || rank.division === 'Juryo';
const isMakuuchiRank = (rank) => rank.division === 'Makuuchi';
const isSanyakuRank = (rank) => rank.division === 'Makuuchi' && TOP_DIVISION_NAMES.has(rank.name);
const isYokozunaRank = (rank) => rank.division === 'Makuuchi' && rank.name === '横綱';

const simPath = (...segments) =>
  path.join(process.cwd(), '.tmp', 'sim-tests', 'src', ...segments);

const { createSimulationEngine, createSeededRandom } = require(
  simPath('logic', 'simulation', 'engine.js'),
);
const { buildInitialRikishiFromDraft, rollScoutDraft } = require(
  simPath('logic', 'scout', 'gacha.js'),
);
const { CONSTANTS } = require(simPath('logic', 'constants.js'));
const { listOfficialWinningKimariteCatalog } = require(
  simPath('logic', 'kimarite', 'catalog.js'),
);
const { ensureKimariteRepertoire } = require(simPath('logic', 'kimarite', 'repertoire.js'));
const {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveInternalStrengthStyles,
  resolveInternalWeakStyles,
} = require(simPath('logic', 'style', 'identity.js'));

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

// !!! 注意 !!!
// ここで集計する kimariteTotal は「プレイヤが勝った取組のみ」の kimarite 分布。
// NPC vs NPC の kimarite は simulateNpcBout が計算しないため含まれない。
// 全力士・全取組の分布を正確に見たい場合は npm run report:kimarite を使用する。
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
    familyWeights.set(row.entry.family, (familyWeights.get(row.entry.family) ?? 0) + row.count);
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
      return { status: step.statusSnapshot, diagnostics };
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
  const normalizedStatus = ensureKimariteRepertoire(ensureStyleIdentityProfile(result.status));
  const strengths = resolveDisplayedStrengthStyles(normalizedStatus.styleIdentityProfile);
  const weaknesses = resolveDisplayedWeakStyles(normalizedStatus.styleIdentityProfile);
  const internalStrengths = resolveInternalStrengthStyles(normalizedStatus.styleIdentityProfile);
  const internalWeaknesses = resolveInternalWeakStyles(normalizedStatus.styleIdentityProfile);

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
    strengthStyleCount: strengths.length,
    weakStyleCount: weaknesses.length,
    internalStrengthStyleCount: internalStrengths.length,
    internalWeakStyleCount: internalWeaknesses.length,
    noStyleIdentity: strengths.length === 0,
    repertoireUnsettled: normalizedStatus.kimariteRepertoire?.provisional !== false,
    repertoireSettledAtBashoSeq: normalizedStatus.kimariteRepertoire?.settledAtBashoSeq,
    kimariteVariety20Reached:
      kimariteVarietyEligible && kimariteMetrics.uniqueOfficialKimariteCount >= 20,
  });
};

executeWorkerTask(workerData.seed, workerData.modelVersion, workerData.ladder).catch((error) => {
  console.error('Worker error:', error);
  process.exit(1);
});
