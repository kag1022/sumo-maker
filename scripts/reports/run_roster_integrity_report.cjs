const fs = require('fs');
const { execFileSync } = require('child_process');

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.roster_integrity.json'], {
  stdio: 'inherit',
});

fs.mkdirSync('.tmp/roster-integrity', { recursive: true });
fs.writeFileSync('.tmp/roster-integrity/package.json', JSON.stringify({ type: 'commonjs' }));

execFileSync(process.execPath, ['.tmp/roster-integrity/scripts/reports/roster_integrity_report.js'], {
  stdio: 'inherit',
});

