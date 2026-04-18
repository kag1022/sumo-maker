const { execFileSync } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

// ============================================================================
// run_realism_monte_carlo.cjs — CLI ラッパ
//
// 使い方:
//   node scripts/reports/run_realism_monte_carlo.cjs --mode <quick|acceptance|aptitude|retire> [options]
//
// 互換フラグ (既存 npm scripts):
//   --quick       = --mode quick
//   --acceptance  = --mode acceptance
//   --aptitude    = --mode aptitude
//   --retire      = --mode retire
//   --compare     acceptance 時に v2 baseline 比較を追加
//   --v3-only     compare せず v3 のみ (default)
//
// 決まり手分布を測るだけなら `npm run report:kimarite` の方が高速・正確。
// 本ツールは「プレイヤキャリアを最後まで回す」career metrics 用。
// ============================================================================

const MODE_VALUES = new Set(['quick', 'acceptance', 'aptitude', 'retire']);
const MODE_ALIASES = {
  '--quick': 'quick',
  '--acceptance': 'acceptance',
  '--aptitude': 'aptitude',
  '--retire': 'retire',
};
const RUN_KIND_LABELS = {
  quick: 'クイック検証',
  acceptance: '受け入れ検証',
  aptitude: '素質キャリブレーション',
  retire: '関取引退プローブ',
};

const args = process.argv.slice(2);

const printUsage = () => {
  console.log(`使い方:
  node scripts/reports/run_realism_monte_carlo.cjs --mode <quick|acceptance|aptitude|retire> [オプション]

モード:
  --mode quick         クイック検証 (プレイヤ 1 人 × N 回)
  --mode acceptance    受け入れ検証 (候補 v3 の評価、必要に応じて v2 比較)
  --mode aptitude      素質 tier キャリブレーション
  --mode retire        関取引退プローブ (別スクリプト)

互換:
  --quick / --acceptance / --aptitude / --retire は --mode 相当

オプション:
  --v3-only      候補 v3 のみ実行 (acceptance 時の既定)
  --compare      acceptance 時に baseline v2 と比較
  --help, -h     このヘルプ

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

// --mode X もしくは --quick / --acceptance / --aptitude / --retire を拾う
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
  return process.env.REALISM_RUN_KIND || 'acceptance';
};

const mode = resolveMode();
const compareMode = args.includes('--compare');
const v3Only = args.includes('--v3-only');

if (compareMode && mode !== 'acceptance') {
  fail('--compare は acceptance モードでのみ有効です');
}
if (compareMode && v3Only) {
  fail('--compare と --v3-only は同時に指定できません');
}

const build = ensureSimTestsBuild();
const env = {
  ...process.env,
  REALISM_RUN_KIND: mode,
  REALISM_COMPARE: compareMode ? '1' : '0',
  SIMTESTS_COMPILED_AT: build.compiledAt,
};

const scriptByMode = {
  retire: 'scripts/reports/sekitori_retirement_probe.cjs',
  quick: 'scripts/reports/realism_monte_carlo.cjs',
  aptitude: 'scripts/reports/realism_monte_carlo.cjs',
  acceptance: 'scripts/reports/realism_monte_carlo.cjs',
};

console.log(
  `${RUN_KIND_LABELS[mode]}を実行します。${mode === 'acceptance' && compareMode ? ' (baseline 比較モード)' : ''}`,
);

execFileSync(process.execPath, [scriptByMode[mode]], { stdio: 'inherit', env });
