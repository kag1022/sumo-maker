const { execFileSync } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

ensureSimTestsBuild();
execFileSync(process.execPath, ['scripts/reports/entry_archetype_balance.cjs'], {
  stdio: 'inherit',
});
