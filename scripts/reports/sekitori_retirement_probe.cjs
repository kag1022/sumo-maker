const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const RUNS = Number(process.env.PROBE_RUNS || 400);
const MODEL = process.env.PROBE_MODEL || 'unified-v2-kimarite';
const START_YEAR = Number(process.env.PROBE_START_YEAR || 2026);
const JSON_PATH = path.join('docs', 'balance', 'sekitori-retirement-probe.json');
const REPORT_PATH = path.join('docs', 'balance', 'sekitori-retirement-probe.md');

const toPct = (value) => `${(value * 100).toFixed(2)}%`;

const quantile = (sorted, q) => {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const t = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
};

if (!isMainThread) {
  const { createSimulationEngine, createSeededRandom } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'engine.js',
  ));
  const { rollScoutDraft, buildInitialRikishiFromDraft } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'scout',
    'gacha.js',
  ));

  const withPatchedMathRandom = (randomFn, run) => {
    const original = Math.random;
    Math.random = randomFn;
    try {
      return run();
    } finally {
      Math.random = original;
    }
  };

  const createUneditedScoutInitial = (seed) => {
    const draftRandom = createSeededRandom(seed ^ 0xa5a5a5a5);
    return withPatchedMathRandom(draftRandom, () => {
      const draft = rollScoutDraft(draftRandom);
      return buildInitialRikishiFromDraft({
        ...draft,
        selectedStableId: draft.selectedStableId ?? 'stable-001',
      });
    });
  };

  const runCareerToEnd = async (initialStatus, seed) => {
    const simulationRandom = createSeededRandom(seed ^ 0x3c6ef372);
    const engine = createSimulationEngine(
      {
        initialStats: JSON.parse(JSON.stringify(initialStatus)),
        oyakata: null,
        simulationModelVersion: MODEL,
      },
      {
        random: simulationRandom,
        getCurrentYear: () => START_YEAR,
        yieldControl: async () => { },
      },
    );
    while (true) {
      const step = await engine.runNextBasho();
      if (step.kind === 'COMPLETED') {
        return step.statusSnapshot;
      }
    }
  };

  (async () => {
    const seed = workerData.seed;
    const initial = createUneditedScoutInitial(seed);
    const result = await runCareerToEnd(initial, seed);
    const records = result.history.records;
    const maxRank = result.history.maxRank;
    const juryoBasho = records.filter((record) => record.rank.division === 'Juryo').length;
    const wins = result.history.totalWins;
    const losses = result.history.totalLosses;
    const totalMatches = wins + losses;
    const winRate = totalMatches > 0 ? wins / totalMatches : 0.5;

    parentPort.postMessage({
      maxDivision: maxRank.division,
      juryoBasho,
      wins,
      losses,
      bashoCount: records.length,
      winRate,
      retireAge: result.age,
      retirementProfile: result.retirementProfile ?? 'STANDARD',
    });
  })().catch((error) => {
    console.error(error);
    process.exit(1);
  });
} else {
  execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.simtests.json'], {
    stdio: 'inherit',
  });
  fs.mkdirSync('.tmp/sim-tests', { recursive: true });
  fs.writeFileSync('.tmp/sim-tests/package.json', JSON.stringify({ type: 'commonjs' }));

  const maxWorkers = Math.max(1, Math.min((os.cpus()?.length || 2) - 1, 12));
  let nextTask = 0;
  let completed = 0;

  let sekitori = 0;
  let makuuchi = 0;
  let juryoOnly = 0;
  let juryoOnlyOneBasho = 0;
  let losingCareer = 0;
  let ironmanLosing = 0;
  let totalWins = 0;
  let totalLosses = 0;
  let totalBasho = 0;
  const allRetireAges = [];
  const sekitoriRetireAges = [];
  const profileCounts = { EARLY_EXIT: 0, STANDARD: 0, IRONMAN: 0 };

  const juryoTenureBucketsWithinJuryoOnly = {
    one: 0,
    twoToThree: 0,
    fourToNine: 0,
    tenPlus: 0,
  };

  const runWorker = (taskIndex) =>
    new Promise((resolve, reject) => {
      const seed = ((taskIndex + 1) * 2654435761 + 97) >>> 0;
      const worker = new Worker(__filename, {
        workerData: { seed },
      });
      worker.on('message', (msg) => {
        const isSekitori = msg.maxDivision === 'Juryo' || msg.maxDivision === 'Makuuchi';
        const isMakuuchi = msg.maxDivision === 'Makuuchi';
        if (isSekitori) sekitori += 1;
        if (isMakuuchi) makuuchi += 1;
        if (isSekitori) sekitoriRetireAges.push(msg.retireAge);
        allRetireAges.push(msg.retireAge);

        if (msg.maxDivision === 'Juryo') {
          juryoOnly += 1;
          if (msg.juryoBasho <= 1) {
            juryoOnlyOneBasho += 1;
            juryoTenureBucketsWithinJuryoOnly.one += 1;
          } else if (msg.juryoBasho <= 3) {
            juryoTenureBucketsWithinJuryoOnly.twoToThree += 1;
          } else if (msg.juryoBasho <= 9) {
            juryoTenureBucketsWithinJuryoOnly.fourToNine += 1;
          } else {
            juryoTenureBucketsWithinJuryoOnly.tenPlus += 1;
          }
        }

        if (msg.winRate < 0.5) {
          losingCareer += 1;
          if (msg.bashoCount >= 130) {
            ironmanLosing += 1;
          }
        }
        if (msg.retirementProfile in profileCounts) {
          profileCounts[msg.retirementProfile] += 1;
        }

        totalWins += msg.wins;
        totalLosses += msg.losses;
        totalBasho += msg.bashoCount;
      });
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Worker exited with code ${code}`));
      });
    });

  const workerLoop = async () => {
    while (true) {
      const current = nextTask;
      nextTask += 1;
      if (current >= RUNS) return;
      await runWorker(current);
      completed += 1;
      if (completed % 50 === 0) {
        console.log(`progress ${completed}/${RUNS}`);
      }
    }
  };

  const renderReport = (summary) => {
    const lines = [];
    lines.push('# sekitori + retirement probe');
    lines.push('');
    lines.push(`- generatedAt: ${new Date().toISOString()}`);
    lines.push(`- model: ${MODEL}`);
    lines.push(`- runs: ${RUNS}`);
    lines.push('');
    lines.push('## Metrics');
    lines.push('');
    lines.push(`- sekitoriRate: ${toPct(summary.sekitoriRate)}`);
    lines.push(`- makuuchiRate: ${toPct(summary.makuuchiRate)}`);
    lines.push(`- juryoOnlyOneBashoShareWithinJuryoOnly: ${toPct(summary.juryoOnlyOneBashoShareWithinJuryoOnly)}`);
    lines.push(`- careerWinRate: ${toPct(summary.careerWinRate)}`);
    lines.push(`- losingCareerRate: ${toPct(summary.losingCareerRate)}`);
    lines.push(`- ironmanLosingRate: ${toPct(summary.ironmanLosingRate)}`);
    lines.push(`- allCareerRetireAgeP50: ${summary.allCareerRetireAgeP50.toFixed(2)}`);
    lines.push(`- sekitoriCareerRetireAgeP50: ${summary.sekitoriCareerRetireAgeP50.toFixed(2)}`);
    lines.push(`- avgCareerBasho: ${summary.avgCareerBasho.toFixed(2)}`);
    lines.push('');
    lines.push('## Profile mix');
    lines.push('');
    lines.push(`- EARLY_EXIT: ${summary.profileCounts.EARLY_EXIT}`);
    lines.push(`- STANDARD: ${summary.profileCounts.STANDARD}`);
    lines.push(`- IRONMAN: ${summary.profileCounts.IRONMAN}`);
    lines.push('');
    return lines.join('\n');
  };

  const main = async () => {
    await Promise.all(Array.from({ length: Math.min(maxWorkers, RUNS) }, () => workerLoop()));

    allRetireAges.sort((a, b) => a - b);
    sekitoriRetireAges.sort((a, b) => a - b);

    const summary = {
      model: MODEL,
      runs: RUNS,
      sekitoriRate: sekitori / RUNS,
      makuuchiRate: makuuchi / RUNS,
      juryoOnlyRate: juryoOnly / RUNS,
      juryoOnlyOneBashoRate: juryoOnlyOneBasho / RUNS,
      juryoOnlyOneBashoShareWithinJuryoOnly:
        juryoOnly > 0 ? juryoOnlyOneBasho / juryoOnly : 0,
      careerWinRate: totalWins / Math.max(1, totalWins + totalLosses),
      losingCareerRate: losingCareer / RUNS,
      ironmanLosingRate: ironmanLosing / RUNS,
      allCareerRetireAgeP50: quantile(allRetireAges, 0.5),
      sekitoriCareerRetireAgeP50: quantile(sekitoriRetireAges, 0.5),
      avgCareerBasho: totalBasho / RUNS,
      juryoTenureBucketsWithinJuryoOnly,
      profileCounts,
    };

    fs.mkdirSync(path.dirname(JSON_PATH), { recursive: true });
    fs.writeFileSync(JSON_PATH, JSON.stringify(summary, null, 2));
    fs.writeFileSync(REPORT_PATH, renderReport(summary));

    console.log(JSON.stringify(summary, null, 2));
    console.log(`report written: ${REPORT_PATH}`);
    console.log(`json written: ${JSON_PATH}`);
  };

  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
