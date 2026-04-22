const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./_shared/observation_module.cjs');

const BASE_RUNS = Number(process.env.NPC_YOKOZUNA_RUNS || 500);
const BASE_WORKERS = Number(process.env.NPC_YOKOZUNA_WORKERS || 4);
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;
const REPORT_PATH = path.join('docs', 'balance', 'npc-yokozuna-career-probe.md');
const JSON_PATH = path.join('.tmp', 'npc-yokozuna-career-probe.json');

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const percentile = (values, ratio) => {
  if (!values.length) return Number.NaN;
  const sorted = values.slice().sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;

const toPct = (value) => `${(value * 100).toFixed(2)}%`;

if (!isMainThread) {
  const { runCareerObservation } = loadObservationModule();
  runCareerObservation({ seed: workerData.seed })
    .then((result) => parentPort.postMessage(result.summary))
    .catch((error) => {
      console.error('Worker error:', error);
      process.exit(1);
    });
} else {
  const runParallelSimulation = (runs) =>
    new Promise((resolve, reject) => {
      const maxWorkers = Math.max(1, Math.min(BASE_WORKERS, os.cpus().length - 1 || 1, runs));
      const summaries = [];
      let nextIndex = 0;
      let activeWorkers = 0;
      let completed = 0;
      let failed = false;

      const maybeFinish = () => {
        if (failed || completed !== runs || activeWorkers !== 0) return;
        const lateEntrantYokozunaCounts = summaries.map((summary) => summary.leagueOutcome.lateEntrantYokozunaCount);
        const lateEntrantCounts = summaries.map((summary) => summary.leagueOutcome.lateEntrantCount);
        const bashoCounts = summaries.map((summary) => summary.careerOutcome.bashoCount);
        resolve({
          sample: runs,
          avgLateEntrantYokozunaCount: mean(lateEntrantYokozunaCounts),
          lateEntrantYokozunaCountP50: percentile(lateEntrantYokozunaCounts, 0.5),
          lateEntrantYokozunaCountP90: percentile(lateEntrantYokozunaCounts, 0.9),
          maxLateEntrantYokozunaCount: Math.max(...lateEntrantYokozunaCounts, 0),
          careersWithLateEntrantYokozuna:
            summaries.filter((summary) => summary.leagueOutcome.lateEntrantYokozunaCount >= 1).length,
          careersWithTwoOrMoreLateEntrantYokozuna:
            summaries.filter((summary) => summary.leagueOutcome.lateEntrantYokozunaCount >= 2).length,
          avgLateEntrantCount: mean(lateEntrantCounts),
          lateEntrantCountP50: percentile(lateEntrantCounts, 0.5),
          lateEntrantCountP90: percentile(lateEntrantCounts, 0.9),
          avgCareerBashoCount: mean(bashoCounts),
          careerBashoCountP50: percentile(bashoCounts, 0.5),
          careerBashoCountP90: percentile(bashoCounts, 0.9),
          highCountExamples: summaries
            .slice()
            .sort(
              (left, right) =>
                right.leagueOutcome.lateEntrantYokozunaCount - left.leagueOutcome.lateEntrantYokozunaCount ||
                left.careerOutcome.bashoCount - right.careerOutcome.bashoCount,
            )
            .slice(0, 10),
        });
      };

      const launchNext = () => {
        if (failed) return;
        while (nextIndex < runs && activeWorkers < maxWorkers) {
          const runIndex = nextIndex;
          nextIndex += 1;
          activeWorkers += 1;
          const seed = (((runIndex + 1) * 2654435761) + 0x51ed270b) >>> 0;
          const worker = new Worker(__filename, { workerData: { seed } });
          worker.on('message', (message) => {
            summaries.push(message);
          });
          worker.on('error', (error) => {
            if (failed) return;
            failed = true;
            reject(error);
          });
          worker.on('exit', (code) => {
            if (failed) return;
            activeWorkers -= 1;
            if (code !== 0) {
              failed = true;
              reject(new Error(`Worker stopped with exit code ${code}`));
              return;
            }
            completed += 1;
            launchNext();
            maybeFinish();
          });
        }
      };

      console.log(`Starting ${runs} careers with ${maxWorkers} worker threads...`);
      launchNext();
    });

  const renderReport = (payload) => {
    const lines = [];
    lines.push('# 後発NPC横綱キャリアプローブ');
    lines.push('');
    lines.push(`- 実行日: ${payload.generatedAt}`);
    lines.push(`- compiledAt: ${payload.compiledAt ?? 'n/a'}`);
    lines.push(`- 実行キャリア数: ${payload.metrics.sample}`);
    lines.push('- 集計定義: observation summary の lateEntrant / lateEntrantYokozuna を使用');
    lines.push('');
    lines.push('## サマリー');
    lines.push('');
    lines.push(`- 平均後発横綱数/キャリア: ${payload.metrics.avgLateEntrantYokozunaCount.toFixed(3)}`);
    lines.push(`- 中央値: ${payload.metrics.lateEntrantYokozunaCountP50.toFixed(0)}`);
    lines.push(`- P90: ${payload.metrics.lateEntrantYokozunaCountP90.toFixed(0)}`);
    lines.push(`- 最大: ${payload.metrics.maxLateEntrantYokozunaCount}`);
    lines.push(`- 1人以上生まれる率: ${toPct(payload.metrics.careersWithLateEntrantYokozuna / payload.metrics.sample)}`);
    lines.push(`- 2人以上生まれる率: ${toPct(payload.metrics.careersWithTwoOrMoreLateEntrantYokozuna / payload.metrics.sample)}`);
    lines.push(`- 平均後発入門者数: ${payload.metrics.avgLateEntrantCount.toFixed(1)} (P50 ${payload.metrics.lateEntrantCountP50.toFixed(0)} / P90 ${payload.metrics.lateEntrantCountP90.toFixed(0)})`);
    lines.push(`- 平均プレイヤーキャリア長: ${payload.metrics.avgCareerBashoCount.toFixed(1)}場所 (P50 ${payload.metrics.careerBashoCountP50.toFixed(0)} / P90 ${payload.metrics.careerBashoCountP90.toFixed(0)})`);
    lines.push('');
    lines.push('## 上振れキャリア例');
    lines.push('');
    lines.push('| seed | 後発横綱数 | 後発入門者数 | キャリア長 | 最高位 | 素質 |');
    lines.push('|---:|---:|---:|---:|---|---|');
    for (const summary of payload.metrics.highCountExamples) {
      lines.push(`| ${summary.seed} | ${summary.leagueOutcome.lateEntrantYokozunaCount} | ${summary.leagueOutcome.lateEntrantCount} | ${summary.careerOutcome.bashoCount} | ${summary.rankOutcome.maxRank.division} ${summary.rankOutcome.maxRank.name} | ${summary.aptitudeTier} |`);
    }
    lines.push('');
    return lines.join('\n');
  };

  (async () => {
    const metrics = await runParallelSimulation(BASE_RUNS);
    const payload = {
      generatedAt: new Date().toISOString(),
      compiledAt: COMPILED_AT ?? null,
      metrics,
    };
    const report = renderReport(payload);
    writeFile(REPORT_PATH, report);
    writeFile(JSON_PATH, JSON.stringify(payload, null, 2));
    console.log(report);
    console.log(`report written: ${REPORT_PATH}`);
    console.log(`json written: ${JSON_PATH}`);
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

