const fs = require('fs');
const path = require('path');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

// ============================================================================
// 決まり手分布 Monte Carlo — 軽量・高速版
//
// 従来の realism_monte_carlo.cjs は「プレイヤ 1 人のキャリア × N 回」で
// 決まり手を集計していたため:
//   - プレイヤ自身の style が分布に強く寄与（NPC 対戦は集計対象外）
//   - 1 run あたり数百場所 × 15 番 ≒ 数千 bout を回す必要があり遅い
//   - metric が「キャリア集計の平均」か「全 bout を合算」か混在して読み難い
//
// 本ツールは resolveKimariteOutcome() を直接呼び、
// ターゲット style 分布の合成力士プール × ランダムペアを M bout サンプル。
//   - キャリア依存を排除
//   - 10,000 bout でも数秒
//   - 出力は「全体 / winner.style 別 / engagement 別 / family 別」と
//     明確に分解されているので、どこで押し出しが膨らんでいるか即特定可能。
// ============================================================================

const DEFAULTS = {
  bouts: 10_000,
  seed: 0xdeadbeef,
  styleDistribution: { PUSH: 0.30, GRAPPLE: 0.42, TECHNIQUE: 0.20, BALANCE: 0.08 },
  baselineFile: '.tmp/kimarite-distribution-baseline.json',
  reportFile: 'docs/balance/kimarite-distribution.md',
};

const parseCli = (argv) => {
  const options = { ...DEFAULTS, save: false, compare: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--bouts' && argv[i + 1]) {
      options.bouts = Number(argv[++i]);
    } else if (arg === '--seed' && argv[i + 1]) {
      options.seed = Number(argv[++i]);
    } else if (arg === '--save') {
      options.save = true;
    } else if (arg === '--compare') {
      options.compare = true;
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg.startsWith('--')) {
      console.warn(`unknown flag: ${arg}`);
    }
  }
  return options;
};

const printUsage = () => {
  console.log(`使い方:
  node scripts/reports/kimarite_distribution.cjs [オプション]

オプション:
  --bouts N        取組数 (既定: ${DEFAULTS.bouts})
  --seed N         乱数 seed (既定: ${DEFAULTS.seed})
  --save           現在の結果を baseline(${DEFAULTS.baselineFile}) に保存
  --compare        baseline と比較して差分を出力
  --help, -h       このヘルプ

短いループ向けの軽量 MC です。キャリア依存を排除した状態で
「engagement/pattern/style が決まり手分布にどう寄与しているか」を
直接観測します。
`);
};

const createSeededRandom = (seed) => {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
};

const weightedPick = (entries, rng) => {
  const total = entries.reduce((sum, e) => sum + Math.max(0, e.weight), 0);
  if (total <= 0) return entries[0].value;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

// ----- 合成力士生成 --------------------------------------------------------

const BODY_TYPES = ['NORMAL', 'SOPPU', 'ANKO', 'MUSCULAR'];
const TRAITS = [
  'POWER_PRESSURE_ATTACK',
  'MAKIKAE_MASTER',
  'DOHYOUGIWA_MAJUTSU',
  'CLUTCH_REVERSAL',
  'READ_THE_BOUT',
  'ARAWAZASHI',
  'CROUCHING_TIGER',
  'OSHIZUMOU',
  'ROLLING_ARMS',
  'COUNTER_KING',
];

// style に応じた stat 分布（平均, 分散）。押し系は tsuki/oshi が高め、など。
const STAT_PROFILES = {
  PUSH:      { tsuki: [70, 10], oshi: [72, 10], kumi: [48, 10], nage: [42, 8],  koshi: [55, 10], deashi: [62, 8],  waza: [45, 10], power: [68, 10] },
  GRAPPLE:   { tsuki: [52, 10], oshi: [55, 10], kumi: [72, 10], nage: [62, 10], koshi: [68, 10], deashi: [55, 10], waza: [52, 10], power: [62, 10] },
  TECHNIQUE: { tsuki: [55, 10], oshi: [55, 10], kumi: [58, 10], nage: [68, 10], koshi: [62, 10], deashi: [62, 10], waza: [74, 8],  power: [52, 10] },
  BALANCE:   { tsuki: [58, 10], oshi: [60, 10], kumi: [60, 10], nage: [58, 10], koshi: [60, 10], deashi: [58, 10], waza: [58, 10], power: [60, 10] },
};

const BODY_PROFILES = {
  PUSH:      { heightCm: [185, 5], weightKg: [160, 15], bodyTypeBias: { NORMAL: 0.3, ANKO: 0.3, MUSCULAR: 0.3, SOPPU: 0.1 } },
  GRAPPLE:   { heightCm: [184, 5], weightKg: [165, 15], bodyTypeBias: { NORMAL: 0.3, ANKO: 0.35, MUSCULAR: 0.25, SOPPU: 0.1 } },
  TECHNIQUE: { heightCm: [180, 5], weightKg: [140, 15], bodyTypeBias: { NORMAL: 0.3, SOPPU: 0.4, MUSCULAR: 0.2, ANKO: 0.1 } },
  BALANCE:   { heightCm: [183, 5], weightKg: [155, 15], bodyTypeBias: { NORMAL: 0.4, ANKO: 0.2, MUSCULAR: 0.25, SOPPU: 0.15 } },
};

const normalSample = (mean, stdev, rng) => {
  // Box-Muller
  const u1 = Math.max(1e-9, rng());
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + stdev * z;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const pickByWeightMap = (map, rng) => {
  const entries = Object.entries(map);
  return weightedPick(entries.map(([key, weight]) => ({ value: key, weight })), rng);
};

const generateRikishi = (style, rng) => {
  const statProfile = STAT_PROFILES[style];
  const bodyProfile = BODY_PROFILES[style];
  const stats = {};
  for (const [key, [mean, stdev]] of Object.entries(statProfile)) {
    stats[key] = Math.round(clamp(normalSample(mean, stdev, rng), 20, 120));
  }
  const traits = [];
  const traitCount = Math.floor(rng() * 3);
  for (let i = 0; i < traitCount; i += 1) {
    const trait = TRAITS[Math.floor(rng() * TRAITS.length)];
    if (!traits.includes(trait)) traits.push(trait);
  }
  return {
    style,
    bodyType: pickByWeightMap(bodyProfile.bodyTypeBias, rng),
    heightCm: Math.round(clamp(normalSample(bodyProfile.heightCm[0], bodyProfile.heightCm[1], rng), 170, 200)),
    weightKg: Math.round(clamp(normalSample(bodyProfile.weightKg[0], bodyProfile.weightKg[1], rng), 100, 220)),
    stats,
    traits,
    strongStyles: [],
    weakStyles: [],
  };
};

const buildPool = (styleDist, totalPopulation, rng) => {
  const pool = [];
  for (const [style, rate] of Object.entries(styleDist)) {
    const count = Math.round(totalPopulation * rate);
    for (let i = 0; i < count; i += 1) pool.push(generateRikishi(style, rng));
  }
  return pool;
};

// ----- 集計 ----------------------------------------------------------------

const percentile = (sortedValues, ratio) => {
  if (!sortedValues.length) return Number.NaN;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
};

const toPct = (value) => `${(value * 100).toFixed(2)}%`;

const runSimulation = (options) => {
  const build = ensureSimTestsBuild();
  const { resolveKimariteOutcome } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'kimarite',
    'selection.js',
  ));
  const { resolveBoutEngagement } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'kimarite',
    'engagement.js',
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
  const catalog = new Map(listOfficialWinningKimariteCatalog().map((entry) => [entry.name, entry]));

  const rng = createSeededRandom(options.seed);
  const pool = buildPool(options.styleDistribution, 200, rng);

  const totals = {
    kimariteCounts: new Map(),
    styleCounts: new Map(), // style → {kimarite → count}
    phaseCounts: new Map(), // phase → {kimarite → count}
    familyCounts: new Map(),
    phaseTotals: new Map(),
    styleTotals: new Map(),
  };

  for (let i = 0; i < options.bouts; i += 1) {
    const a = pool[Math.floor(rng() * pool.length)];
    const b = pool[Math.floor(rng() * pool.length)];
    if (a === b) continue;
    // a を勝者と仮定（勝敗決定ロジックを回避し、kimarite 選択そのものを観測する）
    const boutContext = {
      isEdgeCandidate: rng() < 0.1,
      loserExhausted: rng() < 0.08,
      dominance: (rng() - 0.5) * 1.2,
    };
    const engagement = resolveBoutEngagement(a, b, boutContext, rng);
    const outcome = resolveKimariteOutcome({
      winner: a,
      loser: b,
      rng,
      boutContext: { ...boutContext, engagement },
    });
    const name = outcome.kimarite;
    const entry = catalog.get(name);
    const family = entry?.family ?? 'UNKNOWN';

    totals.kimariteCounts.set(name, (totals.kimariteCounts.get(name) ?? 0) + 1);
    totals.familyCounts.set(family, (totals.familyCounts.get(family) ?? 0) + 1);

    // winner.style 別
    if (!totals.styleCounts.has(a.style)) totals.styleCounts.set(a.style, new Map());
    const styleBucket = totals.styleCounts.get(a.style);
    styleBucket.set(name, (styleBucket.get(name) ?? 0) + 1);
    totals.styleTotals.set(a.style, (totals.styleTotals.get(a.style) ?? 0) + 1);

    // engagement.phase 別
    if (!totals.phaseCounts.has(engagement.phase)) totals.phaseCounts.set(engagement.phase, new Map());
    const phaseBucket = totals.phaseCounts.get(engagement.phase);
    phaseBucket.set(name, (phaseBucket.get(name) ?? 0) + 1);
    totals.phaseTotals.set(engagement.phase, (totals.phaseTotals.get(engagement.phase) ?? 0) + 1);
  }

  return { totals, compiledAt: build.compiledAt };
};

// ----- 出力 ----------------------------------------------------------------

const topN = (map, n) => {
  return [...map.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, n);
};

const renderTopList = (map, total, n) => {
  const lines = [];
  for (const [name, count] of topN(map, n)) {
    lines.push(`  - ${name}: ${count} (${toPct(count / total)})`);
  }
  return lines;
};

const computeStats = (totals) => {
  const totalBouts = [...totals.kimariteCounts.values()].reduce((sum, v) => sum + v, 0);
  const topKimarite = topN(totals.kimariteCounts, 15).map(([name, count]) => ({
    name,
    count,
    share: count / totalBouts,
  }));
  const topFamily = topN(totals.familyCounts, 10).map(([name, count]) => ({
    name,
    count,
    share: count / totalBouts,
  }));
  const stylesBreakdown = {};
  for (const [style, styleMap] of totals.styleCounts.entries()) {
    const styleTotal = totals.styleTotals.get(style);
    stylesBreakdown[style] = {
      total: styleTotal,
      top: topN(styleMap, 10).map(([name, count]) => ({ name, count, share: count / styleTotal })),
    };
  }
  const phaseBreakdown = {};
  for (const [phase, phaseMap] of totals.phaseCounts.entries()) {
    const phaseTotal = totals.phaseTotals.get(phase);
    phaseBreakdown[phase] = {
      total: phaseTotal,
      top: topN(phaseMap, 10).map(([name, count]) => ({ name, count, share: count / phaseTotal })),
    };
  }
  const uniqueKimarite = totals.kimariteCounts.size;
  return { totalBouts, topKimarite, topFamily, stylesBreakdown, phaseBreakdown, uniqueKimarite };
};

const renderMarkdown = (stats, options) => {
  const lines = [];
  lines.push('# 決まり手分布 Monte Carlo');
  lines.push('');
  lines.push(`- 取組数: ${stats.totalBouts}`);
  lines.push(`- seed: ${options.seed}`);
  lines.push(`- unique kimarite: ${stats.uniqueKimarite}`);
  lines.push('');
  lines.push('## 全体 Top 15');
  for (const row of stats.topKimarite) {
    lines.push(`  - ${row.name}: ${row.count} (${toPct(row.share)})`);
  }
  lines.push('');
  lines.push('## 家族別');
  for (const row of stats.topFamily) {
    lines.push(`  - ${row.name}: ${row.count} (${toPct(row.share)})`);
  }
  lines.push('');
  lines.push('## winner.style 別 (Top 10)');
  for (const style of ['PUSH', 'GRAPPLE', 'TECHNIQUE', 'BALANCE']) {
    const entry = stats.stylesBreakdown[style];
    if (!entry) continue;
    lines.push(`### ${style} (${entry.total} bouts)`);
    for (const row of entry.top) {
      lines.push(`  - ${row.name}: ${row.count} (${toPct(row.share)})`);
    }
    lines.push('');
  }
  lines.push('## engagement.phase 別 (Top 10)');
  for (const phase of ['THRUST_BATTLE', 'BELT_BATTLE', 'MIXED', 'EDGE_SCRAMBLE', 'QUICK_COLLAPSE']) {
    const entry = stats.phaseBreakdown[phase];
    if (!entry) continue;
    lines.push(`### ${phase} (${entry.total} bouts)`);
    for (const row of entry.top) {
      lines.push(`  - ${row.name}: ${row.count} (${toPct(row.share)})`);
    }
    lines.push('');
  }
  return lines.join('\n');
};

const renderDiff = (current, baseline) => {
  const lines = [];
  lines.push('# 決まり手分布 差分');
  lines.push('');
  lines.push(`- 取組数: ${baseline.totalBouts} → ${current.totalBouts}`);
  lines.push(`- unique kimarite: ${baseline.uniqueKimarite} → ${current.uniqueKimarite}`);
  lines.push('');
  lines.push('## 全体 Top 15 差分');
  const baselineMap = new Map(baseline.topKimarite.map((row) => [row.name, row.share]));
  const currentMap = new Map(current.topKimarite.map((row) => [row.name, row.share]));
  const keys = new Set([...baselineMap.keys(), ...currentMap.keys()]);
  const rows = [...keys].map((name) => {
    const b = baselineMap.get(name) ?? 0;
    const c = currentMap.get(name) ?? 0;
    return { name, baseline: b, current: c, delta: c - b };
  }).sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
  for (const row of rows.slice(0, 20)) {
    const sign = row.delta >= 0 ? '+' : '';
    lines.push(`  - ${row.name}: ${toPct(row.baseline)} → ${toPct(row.current)} (${sign}${(row.delta * 100).toFixed(2)}pt)`);
  }
  return lines.join('\n');
};

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const readBaseline = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    console.warn(`baseline 読み込み失敗: ${error.message}`);
    return null;
  }
};

const main = () => {
  const options = parseCli(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  const { totals } = runSimulation(options);
  const stats = computeStats(totals);
  const markdown = renderMarkdown(stats, options);
  writeFile(options.reportFile, markdown);
  console.log(markdown);
  console.log('');
  console.log(`→ ${options.reportFile} に書き出しました。`);

  if (options.save) {
    writeFile(options.baselineFile, JSON.stringify(stats, null, 2));
    console.log(`→ baseline を ${options.baselineFile} に保存しました。`);
  }

  if (options.compare) {
    const baseline = readBaseline(options.baselineFile);
    if (!baseline) {
      console.log(`baseline(${options.baselineFile}) がありません。 --save で先に保存してください。`);
      return;
    }
    console.log('');
    console.log(renderDiff(stats, baseline));
  }
};

main();
