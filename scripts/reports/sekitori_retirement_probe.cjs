const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./_shared/observation_module.cjs');

const RUNS = Number(process.env.PROBE_RUNS || 400);
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;
const JSON_PATH = path.join('.tmp', 'sekitori-retirement-probe.json');
const REPORT_PATH = path.join('docs', 'balance', 'sekitori-retirement-probe.md');
const RETIREMENT_PROBE_GATE = {
  losingCareerRateMin: 0.25,
  losingCareerRateMax: 0.35,
  allCareerRetireAgeP50Min: 24,
  avgCareerBashoMin: 40,
};

const toPct = (value) => `${(value * 100).toFixed(2)}%`;

if (!isMainThread) {
  const { runCareerObservation } = loadObservationModule();
  runCareerObservation({ seed: workerData.seed })
    .then((result) => parentPort.postMessage(result.summary))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  const runParallel = (runs) =>
    new Promise((resolve, reject) => {
      const maxWorkers = Math.max(1, Math.min((os.cpus()?.length || 2) - 1, 12, runs));
      const summaries = [];
      let nextTask = 0;
      let activeWorkers = 0;
      let completed = 0;
      let failed = false;

      const maybeFinish = () => {
        if (failed || completed !== runs || activeWorkers !== 0) return;
        const { summarizeObservationBatch } = loadObservationModule();
        resolve({ summaries, aggregate: summarizeObservationBatch(summaries) });
      };

      const launchNext = () => {
        if (failed) return;
        while (nextTask < runs && activeWorkers < maxWorkers) {
          const current = nextTask;
          nextTask += 1;
          activeWorkers += 1;
          const seed = ((current + 1) * 2654435761 + 97) >>> 0;
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
              reject(new Error(`Worker exited with code ${code}`));
              return;
            }
            completed += 1;
            if (completed % 50 === 0 || completed === runs) {
              console.log(`progress ${completed}/${runs}`);
            }
            launchNext();
            maybeFinish();
          });
        }
      };

      launchNext();
    });

  const renderReport = (payload) => {
    const { aggregate, gateResult, generatedAt } = payload;
    const lines = [];
    lines.push('# sekitori + retirement probe');
    lines.push('');
    lines.push(`- generatedAt: ${generatedAt}`);
    lines.push(`- compiledAt: ${COMPILED_AT ?? 'n/a'}`);
    lines.push('- runKind: retire');
    lines.push(`- runs: ${RUNS}`);
    lines.push('');
    lines.push('## Metrics');
    lines.push('');
    lines.push(`- 負け越しキャリア率(休場込み): target ${toPct(RETIREMENT_PROBE_GATE.losingCareerRateMin)}-${toPct(RETIREMENT_PROBE_GATE.losingCareerRateMax)} / actual ${toPct(aggregate.realism.losingCareerRate)} / ${gateResult.losingCareerRatePass ? 'PASS' : 'FAIL'}`);
    lines.push(`- 引退年齢中央値: target >= ${RETIREMENT_PROBE_GATE.allCareerRetireAgeP50Min.toFixed(1)} / actual ${aggregate.realism.allCareerRetireAgeP50.toFixed(2)} / ${gateResult.allCareerRetireAgeP50Pass ? 'PASS' : 'FAIL'}`);
    lines.push(`- 平均場所数: target >= ${RETIREMENT_PROBE_GATE.avgCareerBashoMin.toFixed(1)} / actual ${aggregate.realism.avgCareerBasho.toFixed(2)} / ${gateResult.avgCareerBashoPass ? 'PASS' : 'FAIL'}`);
    lines.push(`- 関取率: ${toPct(aggregate.realism.sekitoriRate)}`);
    lines.push(`- 幕内率: ${toPct(aggregate.realism.makuuchiRate)}`);
    lines.push(`- 通算勝率（公式平均）: ${toPct(aggregate.realism.careerWinRate)}`);
    lines.push(`- 通算勝率（有効平均）: ${toPct(aggregate.realism.careerEffectiveWinRate)}`);
    lines.push(`- 通算勝率（legacy pooled）: ${toPct(aggregate.realism.careerPooledWinRate)}`);
    lines.push('');
    lines.push(`- overall gate: ${gateResult.allPass ? 'PASS' : 'FAIL'}`);
    lines.push('');
    return lines.join('\n');
  };

  (async () => {
    const { aggregate } = await runParallel(RUNS);
    const gateResult = {
      losingCareerRatePass:
        aggregate.realism.losingCareerRate >= RETIREMENT_PROBE_GATE.losingCareerRateMin &&
        aggregate.realism.losingCareerRate <= RETIREMENT_PROBE_GATE.losingCareerRateMax,
      allCareerRetireAgeP50Pass:
        aggregate.realism.allCareerRetireAgeP50 >= RETIREMENT_PROBE_GATE.allCareerRetireAgeP50Min,
      avgCareerBashoPass: aggregate.realism.avgCareerBasho >= RETIREMENT_PROBE_GATE.avgCareerBashoMin,
    };
    gateResult.allPass =
      gateResult.losingCareerRatePass &&
      gateResult.allCareerRetireAgeP50Pass &&
      gateResult.avgCareerBashoPass;

    const payload = {
      runKind: 'retire',
      generatedAt: new Date().toISOString(),
      compiledAt: COMPILED_AT ?? null,
      aggregate,
      gateResult,
    };

    fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
    fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2));
    fs.writeFileSync(REPORT_PATH, renderReport(payload));
    console.log(JSON.stringify(payload, null, 2));
    console.log(`report written: ${REPORT_PATH}`);
    console.log(`json written: ${JSON_PATH}`);
  })().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

