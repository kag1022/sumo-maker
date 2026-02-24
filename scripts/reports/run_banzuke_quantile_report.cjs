const fs = require('fs');
const { execFileSync } = require('child_process');

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.quantilechecks.json'], {
  stdio: 'inherit',
});

fs.mkdirSync('.tmp/quantile-checks', { recursive: true });
fs.writeFileSync('.tmp/quantile-checks/package.json', JSON.stringify({ type: 'commonjs' }));

execFileSync(process.execPath, ['.tmp/quantile-checks/scripts/reports/banzuke_quantile_report.js'], {
  stdio: 'inherit',
});

