const fs = require('fs');
const { execFileSync } = require('child_process');

execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.banzukevalidation.json'], {
  stdio: 'inherit',
});

fs.mkdirSync('.tmp/banzuke-validation', { recursive: true });
fs.writeFileSync('.tmp/banzuke-validation/package.json', JSON.stringify({ type: 'commonjs' }));

execFileSync(process.execPath, ['.tmp/banzuke-validation/scripts/reports/banzuke_context_validation.js'], {
  stdio: 'inherit',
});
