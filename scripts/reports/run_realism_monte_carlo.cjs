const { execFileSync } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

const args = process.argv.slice(2);

const hasFlag = (flag) => args.includes(flag);

const resolveRunKind = () => {
  if (hasFlag('--quick')) return 'quick';
  if (hasFlag('--aptitude')) return 'aptitude';
  if (hasFlag('--retire')) return 'retire';
  if (hasFlag('--acceptance')) return 'acceptance';
  return process.env.REALISM_RUN_KIND || 'acceptance';
};

const runKind = resolveRunKind();
const compareMode = hasFlag('--compare');
const v3OnlyMode = hasFlag('--v3-only') || (!compareMode && runKind !== 'retire');

const build = ensureSimTestsBuild();
const env = {
  ...process.env,
  REALISM_RUN_KIND: runKind,
  REALISM_COMPARE: compareMode ? '1' : '0',
  REALISM_MC_MODE: v3OnlyMode ? 'v3-only' : 'compare',
  SIMTESTS_COMPILED_AT: build.compiledAt,
};

if (runKind === 'retire') {
  execFileSync(process.execPath, ['scripts/reports/sekitori_retirement_probe.cjs'], {
    stdio: 'inherit',
    env,
  });
  process.exit(0);
}

execFileSync(process.execPath, ['scripts/reports/realism_monte_carlo.cjs', ...args], {
  stdio: 'inherit',
  env,
});
