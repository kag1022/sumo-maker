const { execFileSync } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

const MODE_VALUES = new Set(['quick', 'full', 'aptitude', 'retire', 'population']);
const MODE_ALIASES = {
  '--quick': 'quick',
  '--full': 'full',
  '--aptitude': 'aptitude',
  '--retire': 'retire',
  '--population': 'population',
};
const RUN_KIND_LABELS = {
  quick: 'クイック検証',
  full: '本番観測',
  aptitude: '素質キャリブレーション',
  retire: '関取引退プローブ',
  population: 'historical-like population tuning',
};

const args = process.argv.slice(2);

const printUsage = () => {
  console.log(`使い方:
  node scripts/reports/run_realism_monte_carlo.cjs --mode <quick|full|aptitude|retire|population> [オプション]

モード:
  --mode quick         クイック検証
  --mode full          現行モデルの本番 Monte Carlo
  --mode aptitude      素質 tier キャリブレーション
  --mode retire        関取引退プローブ
  --mode population    historical-like population preset 比較

互換:
  --quick / --full / --aptitude / --retire / --population は --mode 相当

決まり手分布のみを見たい場合は \`npm run report:kimarite\` を使用してください。
`);
};

const fail = (message) => {
  console.error(`run_realism_monte_carlo: ${message}`);
  console.error('`--help` で使い方を表示できます。');
  process.exit(1);
};

if (args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

const resolveMode = () => {
  const modeIdx = args.indexOf('--mode');
  if (modeIdx >= 0) {
    const value = args[modeIdx + 1];
    if (!value || !MODE_VALUES.has(value)) {
      fail(`--mode に ${[...MODE_VALUES].join('|')} を指定してください`);
    }
    return value;
  }
  const matchedAliases = Object.entries(MODE_ALIASES)
    .filter(([flag]) => args.includes(flag))
    .map(([, mode]) => mode);
  if (matchedAliases.length > 1) {
    fail(`実行モードを同時に複数指定できません: ${matchedAliases.join(', ')}`);
  }
  if (matchedAliases.length === 1) return matchedAliases[0];
  return process.env.REALISM_RUN_KIND || 'full';
};

const mode = resolveMode();
const build = ensureSimTestsBuild();
const env = {
  ...process.env,
  REALISM_RUN_KIND: mode,
  SIMTESTS_COMPILED_AT: build.compiledAt,
};

const scriptByMode = {
  retire: 'scripts/reports/sekitori_retirement_probe.cjs',
  quick: 'scripts/reports/realism_monte_carlo.cjs',
  aptitude: 'scripts/reports/realism_monte_carlo.cjs',
  full: 'scripts/reports/realism_monte_carlo.cjs',
  population: 'scripts/reports/realism_monte_carlo.cjs',
};

console.log(`${RUN_KIND_LABELS[mode]}を実行します。`);
execFileSync(process.execPath, [scriptByMode[mode]], { stdio: 'inherit', env });

