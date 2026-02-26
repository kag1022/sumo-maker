const fs = require('fs');
const { execFileSync } = require('child_process');
const passthroughArgs = process.argv.slice(2);

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.simtests.json'], {
  stdio: 'inherit',
});

fs.mkdirSync('.tmp/sim-tests', { recursive: true });
fs.writeFileSync('.tmp/sim-tests/package.json', JSON.stringify({ type: 'commonjs' }));

execFileSync(process.execPath, ['.tmp/sim-tests/scripts/tests/sim_tests.js', ...passthroughArgs], { stdio: 'inherit' });
