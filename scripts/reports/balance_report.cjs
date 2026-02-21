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
const { getRankValue } = require(path.join(
  process.cwd(),
  '.tmp',
  'sim-tests',
  'src',
  'logic',
  'ranking.js',
));
const { runSimulation } = require(path.join(
  process.cwd(),
  '.tmp',
  'sim-tests',
  'src',
  'logic',
  'runner.js',
));

const RUNS_PER_SCENARIO = 500;
const REPORT_PATH = path.join('docs', 'balance-report-500.md');
const FIXED_START_YEAR = 2020;

const HISTORY_OPTIONS = {
  JHS_GRAD: { age: 15, bonus: 0 },
  HS_GRAD: { age: 18, bonus: 3 },
  HS_YOKOZUNA: { age: 18, bonus: 8 },
  UNI_YOKOZUNA: { age: 22, bonus: 12, canTsukedashi: true },
};

const SCENARIOS = [
  {
    id: 'baseline',
    label: '基準: HARD_WORKER / NORMAL / 無スキル',
    archetype: 'HARD_WORKER',
    history: 'HS_GRAD',
    entryDivision: 'Maezumo',
    tactics: 'BALANCE',
    signatureMove: '寄り切り',
    bodyType: 'NORMAL',
    traits: [],
  },
  {
    id: 'talent_genius',
    label: '才能比較: GENIUS',
    archetype: 'GENIUS',
    history: 'HS_GRAD',
    entryDivision: 'Maezumo',
    tactics: 'BALANCE',
    signatureMove: '寄り切り',
    bodyType: 'NORMAL',
    traits: [],
  },
  {
    id: 'talent_monster',
    label: '才能比較: MONSTER',
    archetype: 'MONSTER',
    history: 'HS_GRAD',
    entryDivision: 'Maezumo',
    tactics: 'BALANCE',
    signatureMove: '寄り切り',
    bodyType: 'NORMAL',
    traits: [],
  },
  {
    id: 'body_muscular',
    label: '体格比較: MUSCULAR',
    archetype: 'HARD_WORKER',
    history: 'HS_GRAD',
    entryDivision: 'Maezumo',
    tactics: 'BALANCE',
    signatureMove: '寄り切り',
    bodyType: 'MUSCULAR',
    traits: [],
  },
  {
    id: 'skill_package',
    label: 'スキル比較: KYOUSHINZOU + KINBOSHI + RENSHOU',
    archetype: 'HARD_WORKER',
    history: 'HS_GRAD',
    entryDivision: 'Maezumo',
    tactics: 'BALANCE',
    signatureMove: '寄り切り',
    bodyType: 'NORMAL',
    traits: ['KYOUSHINZOU', 'KINBOSHI_HUNTER', 'RENSHOU_KAIDOU'],
  },
  {
    id: 'all_in',
    label: '上振れ構成: MONSTER + MUSCULAR + 高校横綱 + 強スキル',
    archetype: 'MONSTER',
    history: 'HS_YOKOZUNA',
    entryDivision: 'Maezumo',
    tactics: 'BALANCE',
    signatureMove: '上手投げ',
    bodyType: 'MUSCULAR',
    traits: ['KYOUSHINZOU', 'KINBOSHI_HUNTER', 'OOBUTAI_NO_ONI'],
  },
];

const toPct = (value) => `${(value * 100).toFixed(1)}%`;

const createSeededRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

const withPatchedMathRandom = (randomFn, run) => {
  const original = Math.random;
  Math.random = randomFn;
  try {
    return run();
  } finally {
    Math.random = original;
  }
};

const resolveStartingRank = (history, entryDivision) => {
  const historyData = HISTORY_OPTIONS[history];
  if (!historyData.canTsukedashi) {
    return { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
  }
  if (entryDivision === 'Makushita60') {
    return { division: 'Makushita', name: '幕下', side: 'East', number: 60 };
  }
  if (entryDivision === 'Sandanme90') {
    return { division: 'Sandanme', name: '三段目', side: 'East', number: 90 };
  }
  return { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
};

const buildInitialStatus = (scenario, initSeed) => {
  const historyData = HISTORY_OPTIONS[scenario.history];
  return withPatchedMathRandom(createSeededRandom(initSeed), () =>
    createInitialRikishi({
      shikona: `検証${scenario.id}`,
      age: historyData.age,
      startingRank: resolveStartingRank(scenario.history, scenario.entryDivision),
      archetype: scenario.archetype,
      tactics: scenario.tactics,
      signatureMove: scenario.signatureMove,
      bodyType: scenario.bodyType,
      traits: scenario.traits,
      historyBonus: historyData.bonus,
      entryDivision: historyData.canTsukedashi ? scenario.entryDivision : undefined,
    }),
  );
};

const summarizeScenario = async (scenario, runs) => {
  let sekitori = 0;
  let makuuchi = 0;
  let sanyaku = 0;
  let ozekiOrAbove = 0;
  let yokozuna = 0;
  let totalBasho = 0;
  let totalWinRate = 0;
  let totalWins = 0;
  let totalRankValue = 0;

  for (let i = 0; i < runs; i += 1) {
    const baseSeed = ((i + 1) * 2654435761 + scenario.id.length * 97) >>> 0;
    const initial = buildInitialStatus(scenario, baseSeed ^ 0xa5a5a5a5);
    const simulationRandom = createSeededRandom(baseSeed ^ 0x3c6ef372);
    const result = await runSimulation(
      { initialStats: initial, oyakata: null },
      {
        random: simulationRandom,
        getCurrentYear: () => FIXED_START_YEAR,
        yieldControl: async () => {},
      },
    );

    const maxRank = result.history.maxRank;
    const isSekitori = maxRank.division === 'Makuuchi' || maxRank.division === 'Juryo';
    const isMakuuchi = maxRank.division === 'Makuuchi';
    const isSanyaku = isMakuuchi && ['横綱', '大関', '関脇', '小結'].includes(maxRank.name);
    const isOzekiOrAbove = isMakuuchi && ['横綱', '大関'].includes(maxRank.name);
    const isYokozuna = isMakuuchi && maxRank.name === '横綱';

    if (isSekitori) sekitori += 1;
    if (isMakuuchi) makuuchi += 1;
    if (isSanyaku) sanyaku += 1;
    if (isOzekiOrAbove) ozekiOrAbove += 1;
    if (isYokozuna) yokozuna += 1;

    totalBasho += result.history.records.length;
    totalWins += result.history.totalWins;
    totalRankValue += getRankValue(maxRank);
    const effectiveMatches = result.history.totalWins + result.history.totalLosses;
    totalWinRate += effectiveMatches > 0 ? result.history.totalWins / effectiveMatches : 0;
  }

  return {
    sample: runs,
    sekitoriRate: sekitori / runs,
    makuuchiRate: makuuchi / runs,
    sanyakuRate: sanyaku / runs,
    ozekiOrAboveRate: ozekiOrAbove / runs,
    yokozunaRate: yokozuna / runs,
    avgCareerBasho: totalBasho / runs,
    avgWinRate: totalWinRate / runs,
    avgTotalWins: totalWins / runs,
    avgRankValue: totalRankValue / runs,
  };
};

const formatDelta = (current, base, percent = true) => {
  const delta = current - base;
  if (percent) return `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pp`;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`;
};

const renderReport = (results) => {
  const baseline = results.find((entry) => entry.scenario.id === 'baseline');
  if (!baseline) throw new Error('baseline scenario is missing');

  const lines = [];
  lines.push('# バランス比較レポート (500本シミュ)');
  lines.push('');
  lines.push(`- 実行日: ${new Date().toISOString()}`);
  lines.push(`- サンプル数: 各シナリオ ${RUNS_PER_SCENARIO} 本`);
  lines.push(`- シミュ開始年: ${FIXED_START_YEAR} 年固定`);
  lines.push('- 乱数: LCG seed 固定（再現可能）');
  lines.push('');
  lines.push('## 結果サマリー');
  lines.push('');
  lines.push('| シナリオ | 関取率 | 幕内率 | 三役率 | 大関以上率 | 横綱率 | 平均通算勝利 | 平均勝率 | 平均最高位Value(低いほど上位) |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|');

  for (const { scenario, summary } of results) {
    lines.push(
      `| ${scenario.label} | ${toPct(summary.sekitoriRate)} | ${toPct(summary.makuuchiRate)} | ${toPct(summary.sanyakuRate)} | ${toPct(summary.ozekiOrAboveRate)} | ${toPct(summary.yokozunaRate)} | ${summary.avgTotalWins.toFixed(1)} | ${toPct(summary.avgWinRate)} | ${summary.avgRankValue.toFixed(1)} |`,
    );
  }

  lines.push('');
  lines.push('## 基準比 (baseline 比較)');
  lines.push('');
  lines.push('| シナリオ | 関取率Δ | 幕内率Δ | 三役率Δ | 大関以上率Δ | 横綱率Δ | 平均通算勝利Δ | 平均勝率Δ |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|');

  for (const { scenario, summary } of results) {
    if (scenario.id === 'baseline') continue;
    lines.push(
      `| ${scenario.label} | ${formatDelta(summary.sekitoriRate, baseline.summary.sekitoriRate)} | ${formatDelta(summary.makuuchiRate, baseline.summary.makuuchiRate)} | ${formatDelta(summary.sanyakuRate, baseline.summary.sanyakuRate)} | ${formatDelta(summary.ozekiOrAboveRate, baseline.summary.ozekiOrAboveRate)} | ${formatDelta(summary.yokozunaRate, baseline.summary.yokozunaRate)} | ${formatDelta(summary.avgTotalWins, baseline.summary.avgTotalWins, false)} | ${formatDelta(summary.avgWinRate, baseline.summary.avgWinRate)} |`,
    );
  }

  lines.push('');
  lines.push('## 所見');
  lines.push('');
  lines.push('- 才能差 (`GENIUS`, `MONSTER`) が段階的に効いているか、baseline 比の三役率/横綱率で確認できます。');
  lines.push('- `MUSCULAR` の寄与が才能より上回り過ぎる場合は、成長補正か怪我補正の再調整が必要です。');
  lines.push('- 強スキル3点セットが baseline を大きく超える場合は、単体倍率か重複時の減衰を追加してください。');
  lines.push('- `all_in` が他シナリオを極端に引き離す場合は、上振れ構成にソフトキャップを検討してください。');
  lines.push('');

  return lines.join('\n');
};

const main = async () => {
  const results = [];
  for (const scenario of SCENARIOS) {
    console.log(`running scenario: ${scenario.id} (${RUNS_PER_SCENARIO} runs)`);
    const summary = await summarizeScenario(scenario, RUNS_PER_SCENARIO);
    results.push({ scenario, summary });
  }

  const report = renderReport(results);
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  console.log(`report written: ${REPORT_PATH}`);
};

main().catch((error) => {
  console.error(error);
  throw error;
});
