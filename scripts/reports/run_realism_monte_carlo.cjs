const fs = require('fs');
const { execFileSync } = require('child_process');

const isV3Only = process.argv.includes('--v3-only');
const env = {
  ...process.env,
  ...(isV3Only ? { REALISM_MC_MODE: 'v3-only' } : {}),
};

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.simtests.json'], {
  stdio: 'inherit',
  env,
});

fs.mkdirSync('.tmp/sim-tests', { recursive: true });
fs.writeFileSync('.tmp/sim-tests/package.json', JSON.stringify({ type: 'commonjs' }));

execFileSync(process.execPath, ['scripts/reports/realism_monte_carlo.cjs'], { stdio: 'inherit', env });
