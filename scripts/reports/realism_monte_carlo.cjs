const fs = require('fs');
const path = require('path');

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
const { runLogicLabToEnd } = require(path.join(
  process.cwd(),
  '.tmp',
  'sim-tests',
  'src',
  'features',
  'logicLab',
  'runner.js',
));

const CURRENT_MODEL_VERSION = 'unified-v1';
const NEXT_MODEL_VERSION = 'unified-v2-kimarite';
const BASELINE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const J2_MONSTER_RUNS = Number(process.env.REALISM_MC_UPSIDE_RUNS || 500);
const FIXED_START_YEAR = 2026;
const J2_MONSTER_PRESET = 'J2_MONSTER';
const J2_MONSTER_MAX_BASHO = Number(process.env.REALISM_MC_J2_MAX_BASHO || 160);

const REPORT_PATH = path.join('docs', 'balance', 'unified-v2-kimarite-acceptance.md');
const LEGACY_REPORT_PATH = path.join('docs', 'balance', 'unified-v1-acceptance.md');
const JSON_PATH = path.join('.tmp', 'unified-v2-kimarite-acceptance.json');
const LEGACY_JSON_PATH = path.join('.tmp', 'unified-v1-acceptance.json');

const BASELINE_GATE = {
  yokozunaMin: 0.003,
  yokozunaMax: 0.008,
  sekitoriMin: 0.6,
  makuuchiMin: 0.35,
  sanyakuMin: 0.02,
};

const J2_MONSTER_GATE = {
  yokozunaMin: 0.3,
  yokozunaMax: 0.6,
  makuuchiNarrowMin: 0.2,
  makuuchiNarrowMax: 0.4,
};

const TOP_DIVISION_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const toPct = (value) => `${(value * 100).toFixed(2)}%`;

const withPatchedMathRandom = (randomFn, run) => {
  const original = Math.random;
  Math.random = randomFn;
  try {
    return run();
  } finally {
    Math.random = original;
  }
};

const isSekitoriRank = (rank) => rank.division === 'Makuuchi' || rank.division === 'Juryo';
const isMakuuchiRank = (rank) => rank.division === 'Makuuchi';
const isSanyakuRank = (rank) => rank.division === 'Makuuchi' && TOP_DIVISION_NAMES.has(rank.name);
const isYokozunaRank = (rank) => rank.division === 'Makuuchi' && rank.name === '横綱';
const isNarrowMakuuchiRecord = (wins, losses, absent) =>
  absent === 0 && ((wins === 8 && losses === 7) || (wins === 7 && losses === 8));

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
      yieldControl: async () => {},
    },
  );

  while (true) {
    const step = await engine.runNextBasho();
    if (step.kind === 'COMPLETED') {
      return step.statusSnapshot;
    }
  }
};

const summarizeBaseline = async (runs, modelVersion) => {
  let sekitori = 0;
  let makuuchi = 0;
  let sanyaku = 0;
  let yokozuna = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalBasho = 0;

  for (let i = 0; i < runs; i += 1) {
    const seed = ((i + 1) * 2654435761 + 97) >>> 0;
    const initial = createUneditedScoutInitial(seed);
    const result = await runCareerToEnd(initial, seed, modelVersion);
    const maxRank = result.history.maxRank;

    if (isSekitoriRank(maxRank)) sekitori += 1;
    if (isMakuuchiRank(maxRank)) makuuchi += 1;
    if (isSanyakuRank(maxRank)) sanyaku += 1;
    if (isYokozunaRank(maxRank)) yokozuna += 1;

    totalWins += result.history.totalWins;
    totalLosses += result.history.totalLosses;
    totalBasho += result.history.records.length;

    if ((i + 1) % 50 === 0) {
      console.log(`baseline_random_scout(${modelVersion}): ${i + 1}/${runs}`);
    }
  }

  return {
    sample: runs,
    sekitoriCount: sekitori,
    makuuchiCount: makuuchi,
    sanyakuCount: sanyaku,
    yokozunaCount: yokozuna,
    sekitoriRate: sekitori / runs,
    makuuchiRate: makuuchi / runs,
    sanyakuRate: sanyaku / runs,
    yokozunaRate: yokozuna / runs,
    avgTotalWins: totalWins / runs,
    avgTotalLosses: totalLosses / runs,
    avgCareerBasho: totalBasho / runs,
  };
};

const summarizeJ2Monster = async (runs, modelVersion) => {
  let yokozunaCount = 0;
  let makuuchiBashoCount = 0;
  let makuuchiNarrowCount = 0;
  let makuuchiTenPlusCount = 0;
  let totalBasho = 0;

  for (let i = 0; i < runs; i += 1) {
    const seed = ((i + 1) * 1103515245 + 12345) >>> 0;
    const result = await runLogicLabToEnd({
      presetId: J2_MONSTER_PRESET,
      seed,
      maxBasho: J2_MONSTER_MAX_BASHO,
      simulationModelVersion: modelVersion,
    });

    if (isYokozunaRank(result.summary.maxRank)) {
      yokozunaCount += 1;
    }

    for (const row of result.logs) {
      if (row.rankBefore.division !== 'Makuuchi') continue;
      makuuchiBashoCount += 1;
      if (isNarrowMakuuchiRecord(row.record.wins, row.record.losses, row.record.absent)) {
        makuuchiNarrowCount += 1;
      }
      if (row.record.absent === 0 && row.record.wins >= 10) {
        makuuchiTenPlusCount += 1;
      }
    }

    totalBasho += result.summary.bashoCount;
    if ((i + 1) % 50 === 0) {
      console.log(`J2_MONSTER(${modelVersion}): ${i + 1}/${runs}`);
    }
  }

  return {
    sample: runs,
    yokozunaCount,
    yokozunaRate: yokozunaCount / runs,
    makuuchiBashoCount,
    makuuchiNarrowCount,
    makuuchiNarrowRate:
      makuuchiBashoCount > 0 ? makuuchiNarrowCount / makuuchiBashoCount : 0,
    makuuchiTenPlusCount,
    makuuchiTenPlusRate:
      makuuchiBashoCount > 0 ? makuuchiTenPlusCount / makuuchiBashoCount : 0,
    avgCareerBasho: totalBasho / runs,
  };
};

const evaluateAcceptance = (baseline, j2Monster) => {
  const baselineYokozunaPass =
    baseline.yokozunaRate >= BASELINE_GATE.yokozunaMin &&
    baseline.yokozunaRate <= BASELINE_GATE.yokozunaMax;
  const baselineSekitoriPass = baseline.sekitoriRate >= BASELINE_GATE.sekitoriMin;
  const baselineMakuuchiPass = baseline.makuuchiRate >= BASELINE_GATE.makuuchiMin;
  const baselineSanyakuPass = baseline.sanyakuRate >= BASELINE_GATE.sanyakuMin;

  const j2YokozunaPass =
    j2Monster.yokozunaRate >= J2_MONSTER_GATE.yokozunaMin &&
    j2Monster.yokozunaRate <= J2_MONSTER_GATE.yokozunaMax;
  const j2NarrowPass =
    j2Monster.makuuchiNarrowRate >= J2_MONSTER_GATE.makuuchiNarrowMin &&
    j2Monster.makuuchiNarrowRate <= J2_MONSTER_GATE.makuuchiNarrowMax;

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
    j2Monster: {
      yokozunaBandPass: j2YokozunaPass,
      makuuchiNarrowBandPass: j2NarrowPass,
      allPass: j2YokozunaPass && j2NarrowPass,
    },
  };
};

const renderReport = (current, next) => {
  const lines = [];
  lines.push('# unified-v2-kimarite Monte Carlo Acceptance');
  lines.push('');
  lines.push(`- 実行日: ${new Date().toISOString()}`);
  lines.push(`- current: ${CURRENT_MODEL_VERSION}`);
  lines.push(`- next: ${NEXT_MODEL_VERSION}`);
  lines.push(`- baseline 本数: ${current.baseline.sample}`);
  lines.push(`- J2_MONSTER 本数: ${current.j2Monster.sample}`);
  lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
  lines.push('');
  lines.push('## Baseline（無編集ランダムスカウト）');
  lines.push('');
  lines.push(`- 関取率: ${toPct(current.baseline.sekitoriRate)} -> ${toPct(next.baseline.sekitoriRate)}`);
  lines.push(`- 幕内率: ${toPct(current.baseline.makuuchiRate)} -> ${toPct(next.baseline.makuuchiRate)}`);
  lines.push(`- 三役率: ${toPct(current.baseline.sanyakuRate)} -> ${toPct(next.baseline.sanyakuRate)}`);
  lines.push(`- 横綱率: ${toPct(current.baseline.yokozunaRate)} -> ${toPct(next.baseline.yokozunaRate)}`);
  lines.push(`- 平均通算: ${current.baseline.avgTotalWins.toFixed(1)}勝 ${current.baseline.avgTotalLosses.toFixed(1)}敗 -> ${next.baseline.avgTotalWins.toFixed(1)}勝 ${next.baseline.avgTotalLosses.toFixed(1)}敗`);
  lines.push('');
  lines.push('## J2_MONSTER（ロジック検証プリセット）');
  lines.push('');
  lines.push(`- 横綱率: ${toPct(current.j2Monster.yokozunaRate)} -> ${toPct(next.j2Monster.yokozunaRate)}`);
  lines.push(`- 幕内 8-7/7-8 比率: ${toPct(current.j2Monster.makuuchiNarrowRate)} -> ${toPct(next.j2Monster.makuuchiNarrowRate)}`);
  lines.push(`- 幕内 10勝以上比率: ${toPct(current.j2Monster.makuuchiTenPlusRate)} -> ${toPct(next.j2Monster.makuuchiTenPlusRate)}`);
  lines.push('');
  lines.push('## Gate Result');
  lines.push('');
  lines.push(`- current baseline gate: ${current.acceptance.baseline.allPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- current J2 gate: ${current.acceptance.j2Monster.allPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- next baseline gate: ${next.acceptance.baseline.allPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- next J2 gate: ${next.acceptance.j2Monster.allPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- next overall: ${next.acceptance.baseline.allPass && next.acceptance.j2Monster.allPass ? 'PASS' : 'FAIL'}`);
  lines.push('');
  return lines.join('\n');
};

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const main = async () => {
  if (!Number.isFinite(BASELINE_RUNS) || BASELINE_RUNS <= 0) {
    throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
  }
  if (!Number.isFinite(J2_MONSTER_RUNS) || J2_MONSTER_RUNS <= 0) {
    throw new Error(`Invalid REALISM_MC_UPSIDE_RUNS: ${process.env.REALISM_MC_UPSIDE_RUNS}`);
  }

  console.log(`running baseline scenario current (${BASELINE_RUNS})...`);
  const baselineCurrent = await summarizeBaseline(BASELINE_RUNS, CURRENT_MODEL_VERSION);
  console.log(`running J2_MONSTER scenario current (${J2_MONSTER_RUNS})...`);
  const j2Current = await summarizeJ2Monster(J2_MONSTER_RUNS, CURRENT_MODEL_VERSION);
  console.log(`running baseline scenario next (${BASELINE_RUNS})...`);
  const baselineNext = await summarizeBaseline(BASELINE_RUNS, NEXT_MODEL_VERSION);
  console.log(`running J2_MONSTER scenario next (${J2_MONSTER_RUNS})...`);
  const j2Next = await summarizeJ2Monster(J2_MONSTER_RUNS, NEXT_MODEL_VERSION);

  const current = {
    modelVersion: CURRENT_MODEL_VERSION,
    baseline: baselineCurrent,
    j2Monster: j2Current,
    acceptance: evaluateAcceptance(baselineCurrent, j2Current),
  };
  const next = {
    modelVersion: NEXT_MODEL_VERSION,
    baseline: baselineNext,
    j2Monster: j2Next,
    acceptance: evaluateAcceptance(baselineNext, j2Next),
  };

  const report = renderReport(current, next);
  const payload = {
    generatedAt: new Date().toISOString(),
    current,
    next,
  };

  writeFile(REPORT_PATH, report);
  writeFile(LEGACY_REPORT_PATH, report);
  writeFile(JSON_PATH, JSON.stringify(payload, null, 2));
  writeFile(LEGACY_JSON_PATH, JSON.stringify(payload, null, 2));

  console.log(report);
  console.log('');
  console.log(`report written: ${REPORT_PATH}`);
  console.log(`report alias written: ${LEGACY_REPORT_PATH}`);
  console.log(`json written: ${JSON_PATH}`);
  console.log(`json alias written: ${LEGACY_JSON_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
