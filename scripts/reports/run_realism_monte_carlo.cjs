const { execFileSync } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

const args = process.argv.slice(2);
const MODE_FLAGS = new Map([
  ['--quick', 'quick'],
  ['--aptitude', 'aptitude'],
  ['--retire', 'retire'],
  ['--acceptance', 'acceptance'],
]);
const SUPPORTED_FLAGS = new Set([
  ...MODE_FLAGS.keys(),
  '--compare',
  '--v3-only',
  '--help',
  '-h',
]);
const RUN_KIND_LABELS = {
  quick: 'クイック検証',
  aptitude: '素質キャリブレーション',
  retire: '関取引退プローブ',
  acceptance: '受け入れ検証',
};

const hasFlag = (flag) => args.includes(flag);
const printUsage = () => {
  console.log(`使い方:
  node scripts/reports/run_realism_monte_carlo.cjs [モード] [オプション]

モード:
  --quick        クイック検証を実行します
  --acceptance   受け入れ検証を実行します
  --aptitude     素質キャリブレーションを実行します
  --retire       関取引退プローブを実行します

オプション:
  --v3-only      v3 のみで実行します
  --compare      acceptance 専用です。baseline(v2) と candidate(v3) を比較します
  --help, -h     このヘルプを表示します

例:
  npm run report:realism:quick
  npm run report:realism:acceptance
  npm run report:realism:mc
  node scripts/reports/run_realism_monte_carlo.cjs --acceptance --compare`);
};
const failUsage = (message) => {
  console.error(`run_realism_monte_carlo: ${message}`);
  console.error('`--help` で使い方を表示できます。');
  process.exit(1);
};

if (hasFlag('--help') || hasFlag('-h')) {
  printUsage();
  process.exit(0);
}

const unknownArgs = args.filter((arg) => !SUPPORTED_FLAGS.has(arg));
if (unknownArgs.length > 0) {
  failUsage(`未対応の引数です: ${unknownArgs.join(', ')}`);
}

const selectedRunKinds = [...MODE_FLAGS.entries()]
  .filter(([flag]) => hasFlag(flag))
  .map(([, runKind]) => runKind);

if (selectedRunKinds.length > 1) {
  failUsage(`実行モードを同時に複数指定できません: ${selectedRunKinds.join(', ')}`);
}

const resolveRunKind = () => {
  if (selectedRunKinds.length === 1) return selectedRunKinds[0];
  return process.env.REALISM_RUN_KIND || 'acceptance';
};

const runKind = resolveRunKind();
const compareMode = hasFlag('--compare');

if (compareMode && runKind !== 'acceptance') {
  failUsage('--compare は --acceptance と一緒にだけ使えます');
}

if (compareMode && hasFlag('--v3-only')) {
  failUsage('--compare と --v3-only は同時に指定できません');
}

const build = ensureSimTestsBuild();
const env = {
  ...process.env,
  REALISM_RUN_KIND: runKind,
  REALISM_COMPARE: compareMode ? '1' : '0',
  SIMTESTS_COMPILED_AT: build.compiledAt,
};

if (runKind === 'retire') {
  console.log(`${RUN_KIND_LABELS[runKind]}を実行します。`);
  execFileSync(process.execPath, ['scripts/reports/sekitori_retirement_probe.cjs'], {
    stdio: 'inherit',
    env,
  });
  process.exit(0);
}

console.log(`${RUN_KIND_LABELS[runKind]}を実行します。${compareMode ? ' 比較モードです。' : ''}`);
execFileSync(process.execPath, ['scripts/reports/realism_monte_carlo.cjs'], {
  stdio: 'inherit',
  env,
});
