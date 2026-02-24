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

const SIMULATION_MODEL_VERSION = 'unified-v1';
const BASELINE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const J2_MONSTER_RUNS = Number(process.env.REALISM_MC_UPSIDE_RUNS || 500);
const FIXED_START_YEAR = 2026;
const J2_MONSTER_PRESET = 'J2_MONSTER';
const J2_MONSTER_MAX_BASHO = Number(process.env.REALISM_MC_J2_MAX_BASHO || 160);

const REPORT_PATH = path.join('docs', 'balance', 'unified-v1-acceptance.md');
const LEGACY_REPORT_PATH = path.join('docs', 'balance', 'realism-v1-acceptance.md');
const JSON_PATH = path.join('.tmp', 'unified-v1-acceptance.json');
const LEGACY_JSON_PATH = path.join('.tmp', 'realism-v1-acceptance.json');

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

const runCareerToEnd = async (initialStatus, seed) => {
  const simulationRandom = createSeededRandom(seed ^ 0x3c6ef372);
  const engine = createSimulationEngine(
    {
      initialStats: JSON.parse(JSON.stringify(initialStatus)),
      oyakata: null,
      simulationModelVersion: SIMULATION_MODEL_VERSION,
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

const summarizeBaseline = async (runs) => {
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
    const result = await runCareerToEnd(initial, seed);
    const maxRank = result.history.maxRank;

    if (isSekitoriRank(maxRank)) sekitori += 1;
    if (isMakuuchiRank(maxRank)) makuuchi += 1;
    if (isSanyakuRank(maxRank)) sanyaku += 1;
    if (isYokozunaRank(maxRank)) yokozuna += 1;

    totalWins += result.history.totalWins;
    totalLosses += result.history.totalLosses;
    totalBasho += result.history.records.length;

    if ((i + 1) % 50 === 0) {
      console.log(`baseline_random_scout: ${i + 1}/${runs}`);
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

const summarizeJ2Monster = async (runs) => {
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
      simulationModelVersion: SIMULATION_MODEL_VERSION,
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
      console.log(`J2_MONSTER: ${i + 1}/${runs}`);
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

const renderReport = (baseline, j2Monster, acceptance) => {
  const lines = [];
  lines.push('# unified-v1 Monte Carlo Acceptance');
  lines.push('');
  lines.push(`- 実行日: ${new Date().toISOString()}`);
  lines.push(`- モデル: ${SIMULATION_MODEL_VERSION}`);
  lines.push(`- baseline 本数: ${baseline.sample}`);
  lines.push(`- J2_MONSTER 本数: ${j2Monster.sample}`);
  lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
  lines.push('');
  lines.push('## Baseline（無編集ランダムスカウト）');
  lines.push('');
  lines.push(`- 関取率: ${toPct(baseline.sekitoriRate)} (gate >= ${toPct(BASELINE_GATE.sekitoriMin)})`);
  lines.push(`- 幕内率: ${toPct(baseline.makuuchiRate)} (gate >= ${toPct(BASELINE_GATE.makuuchiMin)})`);
  lines.push(`- 三役率: ${toPct(baseline.sanyakuRate)} (gate >= ${toPct(BASELINE_GATE.sanyakuMin)})`);
  lines.push(`- 横綱率: ${toPct(baseline.yokozunaRate)} (gate ${toPct(BASELINE_GATE.yokozunaMin)}〜${toPct(BASELINE_GATE.yokozunaMax)})`);
  lines.push(`- 平均通算: ${baseline.avgTotalWins.toFixed(1)}勝 ${baseline.avgTotalLosses.toFixed(1)}敗`);
  lines.push(`- 平均キャリア場所数: ${baseline.avgCareerBasho.toFixed(1)}`);
  lines.push('');
  lines.push('## J2_MONSTER（ロジック検証プリセット）');
  lines.push('');
  lines.push(`- 横綱率: ${toPct(j2Monster.yokozunaRate)} (gate ${toPct(J2_MONSTER_GATE.yokozunaMin)}〜${toPct(J2_MONSTER_GATE.yokozunaMax)})`);
  lines.push(`- 幕内 8-7/7-8 比率: ${toPct(j2Monster.makuuchiNarrowRate)} (gate ${toPct(J2_MONSTER_GATE.makuuchiNarrowMin)}〜${toPct(J2_MONSTER_GATE.makuuchiNarrowMax)})`);
  lines.push(`- 幕内 10勝以上比率: ${toPct(j2Monster.makuuchiTenPlusRate)} (参考値)`);
  lines.push(`- 平均キャリア場所数: ${j2Monster.avgCareerBasho.toFixed(1)}`);
  lines.push('');
  lines.push('## Gate Result');
  lines.push('');
  lines.push(`- Baseline gate: ${acceptance.baseline.allPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- J2_MONSTER gate: ${acceptance.j2Monster.allPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- Overall: ${acceptance.baseline.allPass && acceptance.j2Monster.allPass ? 'PASS' : 'FAIL'}`);
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

  console.log(`running baseline scenario (${BASELINE_RUNS})...`);
  const baseline = await summarizeBaseline(BASELINE_RUNS);
  console.log(`running J2_MONSTER scenario (${J2_MONSTER_RUNS})...`);
  const j2Monster = await summarizeJ2Monster(J2_MONSTER_RUNS);

  const acceptance = evaluateAcceptance(baseline, j2Monster);
  const report = renderReport(baseline, j2Monster, acceptance);
  const payload = {
    generatedAt: new Date().toISOString(),
    modelVersion: SIMULATION_MODEL_VERSION,
    baseline,
    j2Monster,
    acceptance,
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
