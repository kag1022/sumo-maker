const fs = require('fs');
const { execFileSync } = require('child_process');

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.quickchecks.json'], {
  stdio: 'inherit',
});

fs.mkdirSync('.tmp/quick-checks', { recursive: true });
fs.writeFileSync('.tmp/quick-checks/package.json', JSON.stringify({ type: 'commonjs' }));

execFileSync(process.execPath, ['.tmp/quick-checks/scripts/reports/lower_division_banzuke_movement.js'], {
  stdio: 'inherit',
});
