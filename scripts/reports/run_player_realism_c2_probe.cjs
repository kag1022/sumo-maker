const { execFileSync } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`使い方:
  node scripts/reports/run_player_realism_c2_probe.cjs

環境変数:
  PLAYER_REALISM_C2_RUNS      実行キャリア数（既定: 160）
  PLAYER_REALISM_C2_WORKERS   ワーカー数（既定: 4）

出力:
  docs/balance/player-realism-c2-probe.md
  .tmp/player-realism-c2-probe.json`);
  process.exit(0);
}

const build = ensureSimTestsBuild();
const env = {
  ...process.env,
  SIMTESTS_COMPILED_AT: build.compiledAt,
};

console.log('C2 player realism probe を実行します。');
execFileSync(process.execPath, ['scripts/reports/player_realism_c2_probe.cjs'], {
  stdio: 'inherit',
  env,
});
