const fs = require('fs');
const path = require('path');

const { createInitialRikishi } = require(path.join(
  process.cwd(),
  '.tmp',
  'sim-tests',
  'src',
  'logic',
  'initialization.js',
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
const { createSeededRandom, createSimulationEngine } = require(path.join(
  process.cwd(),
  '.tmp',
  'sim-tests',
  'src',
  'logic',
  'simulation',
  'engine.js',
));

const SIMULATION_MODEL_VERSION = 'realism-v1';
const BASELINE_RUNS = Number(process.env.REALISM_MC_BASE_RUNS || 500);
const UPSIDE_RUNS = Number(process.env.REALISM_MC_UPSIDE_RUNS || 500);
const FIXED_START_YEAR = 2026;

const REPORT_PATH = path.join('docs', 'balance', 'realism-v1-acceptance.md');
const JSON_PATH = path.join('.tmp', 'realism-v1-acceptance.json');

const GATE = {
  yokozunaMin: 0.005,
  yokozunaMax: 0.01,
  sekitoriMin: 0.6,
  makuuchiMin: 0.35,
  sanyakuMin: 0.02,
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

const createUneditedScoutInitial = (seed) => {
  const draftRandom = createSeededRandom(seed ^ 0xa5a5a5a5);
  return withPatchedMathRandom(draftRandom, () => {
    const draft = rollScoutDraft(draftRandom);
    return buildInitialRikishiFromDraft(draft);
  });
};

const createUpsidePresetInitial = (seed) => {
  const initialRandom = createSeededRandom(seed ^ 0x51ed270b);
  return createInitialRikishi(
    {
      shikona: `上振山${seed % 1000}`,
      age: 22,
      startingRank: { division: 'Makushita', name: '幕下', number: 60, side: 'East' },
      archetype: 'UNIVERSITY_YOKOZUNA',
      tactics: 'BALANCE',
      signatureMove: '上手投げ',
      bodyType: 'MUSCULAR',
      traits: ['KYOUSHINZOU', 'HEAVY_PRESSURE', 'CLUTCH_REVERSAL'],
      historyBonus: 12,
      entryDivision: 'Makushita60',
      profile: {
        realName: '上振 太郎',
        birthplace: '東京都',
        personality: 'AGGRESSIVE',
      },
      bodyMetrics: {
        heightCm: 190,
        weightKg: 182,
      },
    },
    initialRandom,
  );
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

const summarizeScenario = async (label, runs, createInitial) => {
  let sekitori = 0;
  let makuuchi = 0;
  let sanyaku = 0;
  let yokozuna = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalBasho = 0;

  for (let i = 0; i < runs; i += 1) {
    const seed = ((i + 1) * 2654435761 + label.length * 97) >>> 0;
    const initial = createInitial(seed);
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
      console.log(`${label}: ${i + 1}/${runs}`);
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

const erf = (x) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX));
  return sign * y;
};

const normalCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

const twoProportionZ = (x1, n1, x2, n2) => {
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pooled = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));
  if (se === 0) return p2 > p1 ? Number.POSITIVE_INFINITY : 0;
  return (p2 - p1) / se;
};

const evaluateAcceptance = (baseline, upside) => {
  const yokozunaBandPass =
    baseline.yokozunaRate >= GATE.yokozunaMin && baseline.yokozunaRate <= GATE.yokozunaMax;
  const sekitoriPass = baseline.sekitoriRate >= GATE.sekitoriMin;
  const makuuchiPass = baseline.makuuchiRate >= GATE.makuuchiMin;
  const sanyakuPass = baseline.sanyakuRate >= GATE.sanyakuMin;

  const z = twoProportionZ(
    baseline.yokozunaCount,
    baseline.sample,
    upside.yokozunaCount,
    upside.sample,
  );
  const oneSidedP = 1 - normalCdf(z);
  const upsideHigher = upside.yokozunaRate > baseline.yokozunaRate;
  const upsideSignificant = upsideHigher && z >= 1.645;

  return {
    baseline: {
      yokozunaBandPass,
      sekitoriPass,
      makuuchiPass,
      sanyakuPass,
      allPass: yokozunaBandPass && sekitoriPass && makuuchiPass && sanyakuPass,
    },
    upside: {
      higherThanBaseline: upsideHigher,
      zScore: Number.isFinite(z) ? z : 99,
      oneSidedPValue: oneSidedP,
      significancePass: upsideSignificant,
    },
  };
};

const renderReport = (baseline, upside, acceptance) => {
  const lines = [];
  lines.push('# realism-v1 Monte Carlo Acceptance');
  lines.push('');
  lines.push(`- 実行日: ${new Date().toISOString()}`);
  lines.push(`- モデル: ${SIMULATION_MODEL_VERSION}`);
  lines.push(`- ベースライン本数: ${baseline.sample}`);
  lines.push(`- 上振れプリセット本数: ${upside.sample}`);
  lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
  lines.push('');
  lines.push('## Baseline（無編集ランダムスカウト）');
  lines.push('');
  lines.push(`- 関取率: ${toPct(baseline.sekitoriRate)} (gate >= ${toPct(GATE.sekitoriMin)})`);
  lines.push(`- 幕内率: ${toPct(baseline.makuuchiRate)} (gate >= ${toPct(GATE.makuuchiMin)})`);
  lines.push(`- 三役率: ${toPct(baseline.sanyakuRate)} (gate >= ${toPct(GATE.sanyakuMin)})`);
  lines.push(`- 横綱率: ${toPct(baseline.yokozunaRate)} (gate ${toPct(GATE.yokozunaMin)}〜${toPct(GATE.yokozunaMax)})`);
  lines.push(`- 平均通算: ${baseline.avgTotalWins.toFixed(1)}勝 ${baseline.avgTotalLosses.toFixed(1)}敗`);
  lines.push(`- 平均キャリア場所数: ${baseline.avgCareerBasho.toFixed(1)}`);
  lines.push('');
  lines.push('## Upside（上振れプリセット）');
  lines.push('');
  lines.push(`- 関取率: ${toPct(upside.sekitoriRate)}`);
  lines.push(`- 幕内率: ${toPct(upside.makuuchiRate)}`);
  lines.push(`- 三役率: ${toPct(upside.sanyakuRate)}`);
  lines.push(`- 横綱率: ${toPct(upside.yokozunaRate)}`);
  lines.push(`- 横綱率差分: ${toPct(upside.yokozunaRate - baseline.yokozunaRate)}`);
  lines.push(`- 差分検定（片側 z）: z=${acceptance.upside.zScore.toFixed(3)}, p=${acceptance.upside.oneSidedPValue.toExponential(3)}`);
  lines.push('');
  lines.push('## Gate Result');
  lines.push('');
  lines.push(`- Baseline gate: ${acceptance.baseline.allPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- Upside gate: ${acceptance.upside.significancePass ? 'PASS' : 'FAIL'}`);
  lines.push(`- Overall: ${acceptance.baseline.allPass && acceptance.upside.significancePass ? 'PASS' : 'FAIL'}`);
  lines.push('');
  return lines.join('\n');
};

const main = async () => {
  if (!Number.isFinite(BASELINE_RUNS) || BASELINE_RUNS <= 0) {
    throw new Error(`Invalid REALISM_MC_BASE_RUNS: ${process.env.REALISM_MC_BASE_RUNS}`);
  }
  if (!Number.isFinite(UPSIDE_RUNS) || UPSIDE_RUNS <= 0) {
    throw new Error(`Invalid REALISM_MC_UPSIDE_RUNS: ${process.env.REALISM_MC_UPSIDE_RUNS}`);
  }

  console.log(`running baseline scenario (${BASELINE_RUNS})...`);
  const baseline = await summarizeScenario('baseline_random_scout', BASELINE_RUNS, createUneditedScoutInitial);
  console.log(`running upside scenario (${UPSIDE_RUNS})...`);
  const upside = await summarizeScenario('upside_preset', UPSIDE_RUNS, createUpsidePresetInitial);

  const acceptance = evaluateAcceptance(baseline, upside);
  const report = renderReport(baseline, upside, acceptance);

  const payload = {
    generatedAt: new Date().toISOString(),
    modelVersion: SIMULATION_MODEL_VERSION,
    baseline,
    upside,
    acceptance,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2), 'utf8');

  console.log(report);
  console.log('');
  console.log(`report written: ${REPORT_PATH}`);
  console.log(`json written: ${JSON_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
