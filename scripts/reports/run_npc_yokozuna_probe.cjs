const { execFileSync } = require('child_process');
const { ensureSimTestsBuild } = require('../shared/ensure_simtests_build.cjs');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`使い方:
  npm run report:npc:yokozuna
  node scripts/reports/run_npc_yokozuna_probe.cjs

環境変数:
  NPC_YOKOZUNA_RUNS   実行キャリア数（既定: 500）
  NPC_YOKOZUNA_WORKERS ワーカー数（既定: 4）

出力:
  docs/balance/npc-yokozuna-career-probe.md
  .tmp/npc-yokozuna-career-probe.json`);
  process.exit(0);
}

const build = ensureSimTestsBuild();
const env = {
  ...process.env,
  SIMTESTS_COMPILED_AT: build.compiledAt,
};

console.log('後発NPC横綱プローブを実行します。');
execFileSync(process.execPath, ['scripts/reports/npc_yokozuna_career_probe.cjs'], {
  stdio: 'inherit',
  env,
});
