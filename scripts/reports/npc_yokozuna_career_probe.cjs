const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');

const BASE_RUNS = Number(process.env.NPC_YOKOZUNA_RUNS || 500);
const BASE_WORKERS = Number(process.env.NPC_YOKOZUNA_WORKERS || 4);
const FIXED_START_YEAR = 2026;
const MODEL_VERSION = 'v3';
const BANZUKE_ENGINE_VERSION = 'optimizer-v2';
const COMPILED_AT = process.env.SIMTESTS_COMPILED_AT;
const REPORT_PATH = path.join('docs', 'balance', 'npc-yokozuna-career-probe.md');
const JSON_PATH = path.join('.tmp', 'npc-yokozuna-career-probe.json');

const writeFile = (filePath, text) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const percentile = (sortedValues, ratio) => {
  if (!sortedValues.length) return Number.NaN;
  const index = Math.max(0, Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * ratio)));
  return sortedValues[index];
};

const mean = (values) =>
  values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number.NaN;

const toPct = (value) => `${(value * 100).toFixed(2)}%`;

if (!isMainThread) {
  const { createSeededRandom } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'engine',
    'random.js',
  ));
  const { createSimulationWorld, finalizeSekitoriPlayerPlacement, syncPlayerActorInWorld } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'world',
    'index.js',
  ));
  const { createLowerDivisionQuotaWorld } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'lowerQuota.js',
  ));
  const { createSekitoriBoundaryWorld } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'sekitoriQuota.js',
  ));
  const { appendEntryEvent, initializeSimulationStatus } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'career.js',
  ));
  const { createEmptyRuntimeRivalryState } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'careerRivalry.js',
  ));
  const { runOneStep } = require(path.join(
    process.cwd(),
    '.tmp',
    'sim-tests',
    'src',
    'logic',
    'simulation',
    'engine',
    'runOneStep.js',
  ));
  const { buildInitialRikishiFromDraft, rollScoutDraft } = require(path.join(
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

  const summarizeCareer = async (seed) => {
    const initial = createUneditedScoutInitial(seed);
    const random = createSeededRandom(seed ^ 0x3c6ef372);
    const world = createSimulationWorld(random);
    const sekitoriBoundaryWorld = createSekitoriBoundaryWorld(random);
    const lowerDivisionQuotaWorld = createLowerDivisionQuotaWorld(random, world);
    sekitoriBoundaryWorld.npcRegistry = world.npcRegistry;
    sekitoriBoundaryWorld.makushitaPool =
      lowerDivisionQuotaWorld.rosters.Makushita;

    const state = {
      status: initializeSimulationStatus(initial),
      year: FIXED_START_YEAR,
      monthIndex: 0,
      seq: 0,
      completed: false,
      lastCommitteeWarnings: 0,
      lastDiagnostics: undefined,
      runtimeNarrative: {
        rivalry: createEmptyRuntimeRivalryState(),
      },
    };

    syncPlayerActorInWorld(world, state.status, random);
    finalizeSekitoriPlayerPlacement(world, state.status);
    appendEntryEvent(state.status, state.year);

    const lateEntrantYokozunaIds = new Set();
    let firstLateEntrantYokozunaSeq = null;

    while (true) {
      const step = await runOneStep({
        params: {
          initialStats: initial,
          oyakata: null,
          progressSnapshotMode: 'lite',
          bashoSnapshotMode: 'none',
        },
        deps: {
          random,
          getCurrentYear: () => FIXED_START_YEAR,
          yieldControl: async () => {},
        },
        simulationModelVersion: MODEL_VERSION,
        banzukeEngineVersion: BANZUKE_ENGINE_VERSION,
        world,
        sekitoriBoundaryWorld,
        lowerDivisionQuotaWorld,
        state,
      });

      if (step.kind === 'BASHO') {
        for (const row of step.npcBashoRecords) {
          if (row.division !== 'Makuuchi' || row.rankName !== '横綱') continue;
          const actor = world.npcRegistry.get(row.entityId);
          if (!actor || actor.actorType !== 'NPC' || actor.entrySeq <= 0) continue;
          lateEntrantYokozunaIds.add(row.entityId);
          if (firstLateEntrantYokozunaSeq == null) {
            firstLateEntrantYokozunaSeq = step.seq;
          }
        }
      }

      if (step.kind === 'COMPLETED') {
        break;
      }
    }

    let lateEntrantCount = 0;
    for (const actor of world.npcRegistry.values()) {
      if (actor.actorType === 'NPC' && actor.entrySeq > 0) {
        lateEntrantCount += 1;
      }
    }

    parentPort.postMessage({
      seed,
      playerAptitudeTier: initial.aptitudeTier ?? 'B',
      playerMaxRank: state.status.history.maxRank,
      careerBashoCount: state.status.history.records.length,
      lateEntrantCount,
      lateEntrantYokozunaCount: lateEntrantYokozunaIds.size,
      firstLateEntrantYokozunaSeq,
    });
  };

  summarizeCareer(workerData.seed).catch((error) => {
    console.error('Worker error:', error);
    process.exit(1);
  });
} else {
  const runParallelSimulation = (runs) =>
    new Promise((resolve, reject) => {
      const maxWorkers = Math.max(1, Math.min(BASE_WORKERS, os.cpus().length - 1 || 1));
      const samples = [];
      const histogram = new Map();
      let completed = 0;
      let nextIndex = 0;
      let activeWorkers = 0;
      let failed = false;

      const maybeFinish = () => {
        if (completed !== runs || failed) return;

        const yokozunaCounts = samples
          .map((sample) => sample.lateEntrantYokozunaCount)
          .sort((left, right) => left - right);
        const bashoCounts = samples
          .map((sample) => sample.careerBashoCount)
          .sort((left, right) => left - right);
        const lateEntrantCounts = samples
          .map((sample) => sample.lateEntrantCount)
          .sort((left, right) => left - right);
        const firstYokozunaSeqs = samples
          .map((sample) => sample.firstLateEntrantYokozunaSeq)
          .filter((value) => Number.isFinite(value))
          .sort((left, right) => left - right);
        const sortedHistogram = [...histogram.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([count, careers]) => ({
            count,
            careers,
            rate: careers / runs,
          }));
        const highCountExamples = samples
          .slice()
          .sort((left, right) =>
            right.lateEntrantYokozunaCount - left.lateEntrantYokozunaCount ||
            left.careerBashoCount - right.careerBashoCount)
          .slice(0, 10);

        resolve({
          sample: runs,
          maxWorkers,
          avgLateEntrantYokozunaCount: mean(yokozunaCounts),
          lateEntrantYokozunaCountP50: percentile(yokozunaCounts, 0.5),
          lateEntrantYokozunaCountP90: percentile(yokozunaCounts, 0.9),
          maxLateEntrantYokozunaCount: yokozunaCounts[yokozunaCounts.length - 1] ?? 0,
          careersWithLateEntrantYokozuna: samples.filter((sample) => sample.lateEntrantYokozunaCount >= 1).length,
          careersWithTwoOrMoreLateEntrantYokozuna: samples.filter((sample) => sample.lateEntrantYokozunaCount >= 2).length,
          avgCareerBashoCount: mean(bashoCounts),
          careerBashoCountP50: percentile(bashoCounts, 0.5),
          careerBashoCountP90: percentile(bashoCounts, 0.9),
          avgLateEntrantCount: mean(lateEntrantCounts),
          lateEntrantCountP50: percentile(lateEntrantCounts, 0.5),
          lateEntrantCountP90: percentile(lateEntrantCounts, 0.9),
          avgFirstLateEntrantYokozunaSeq: mean(firstYokozunaSeqs),
          firstLateEntrantYokozunaSeqP50: percentile(firstYokozunaSeqs, 0.5),
          distribution: sortedHistogram,
          highCountExamples,
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
            samples.push(message);
            histogram.set(
              message.lateEntrantYokozunaCount,
              (histogram.get(message.lateEntrantYokozunaCount) ?? 0) + 1,
            );
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
    lines.push(`- 開始年: ${FIXED_START_YEAR} 固定`);
    lines.push(`- モデル: ${MODEL_VERSION} / ${BANZUKE_ENGINE_VERSION}`);
    lines.push('- 集計定義: `entrySeq > 0` の後発NPCが、プレイヤー現役中に一度でも `横綱` 行へ到達したら 1 名として数える');
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
    if (Number.isFinite(payload.metrics.avgFirstLateEntrantYokozunaSeq)) {
      lines.push(`- 初の後発横綱が出る最初の場所: 平均 ${payload.metrics.avgFirstLateEntrantYokozunaSeq.toFixed(1)} 場所目 / 中央値 ${payload.metrics.firstLateEntrantYokozunaSeqP50.toFixed(0)} 場所目`);
    } else {
      lines.push('- 初の後発横綱が出る最初の場所: 該当なし');
    }
    lines.push('');
    lines.push('## 分布');
    lines.push('');
    lines.push('| 後発横綱数 | キャリア数 | 割合 |');
    lines.push('|---:|---:|---:|');
    for (const row of payload.metrics.distribution) {
      lines.push(`| ${row.count} | ${row.careers} | ${toPct(row.rate)} |`);
    }
    lines.push('');
    lines.push('## 上振れキャリア例');
    lines.push('');
    lines.push('| seed | 後発横綱数 | 初到達場所 | 後発入門者数 | キャリア長 | プレイヤー最高位 | 素質 |');
    lines.push('|---:|---:|---:|---:|---:|---|---|');
    for (const row of payload.metrics.highCountExamples) {
      const maxRankLabel =
        row.playerMaxRank?.name && row.playerMaxRank?.number
          ? `${row.playerMaxRank.name}${row.playerMaxRank.number}`
          : row.playerMaxRank?.name ?? '不明';
      lines.push(
        `| ${row.seed} | ${row.lateEntrantYokozunaCount} | ${row.firstLateEntrantYokozunaSeq ?? '-'} | ${row.lateEntrantCount} | ${row.careerBashoCount} | ${maxRankLabel} | ${row.playerAptitudeTier} |`,
      );
    }
    lines.push('');
    lines.push('## 読み方');
    lines.push('');
    lines.push('- この数値が 0 に張り付くなら、後発育成ラインが横綱まで届く前にプレイヤーキャリアが閉じている可能性が高いです。');
    lines.push('- 逆に 1.0 を大きく超えるなら、後発NPCの上位天井か寿命が強すぎて、毎キャリア複数横綱が量産されます。');
    lines.push('- まずは「1人以上率」と「初到達場所」を見て、後発の伸び始めが遅すぎるのか、上振れが多すぎるのかを切り分けるのが有効です。');
    lines.push('');
    return lines.join('\n');
  };

  const main = async () => {
    if (!Number.isFinite(BASE_RUNS) || BASE_RUNS <= 0) {
      throw new Error(`Invalid NPC_YOKOZUNA_RUNS: ${process.env.NPC_YOKOZUNA_RUNS}`);
    }

    const generatedAt = new Date().toISOString();
    const metrics = await runParallelSimulation(BASE_RUNS);
    const payload = {
      generatedAt,
      compiledAt: COMPILED_AT,
      metrics,
    };
    const report = renderReport(payload);
    writeFile(REPORT_PATH, report);
    writeFile(JSON_PATH, JSON.stringify(payload, null, 2));
    console.log(report);
    console.log(`report written: ${REPORT_PATH}`);
    console.log(`json written: ${JSON_PATH}`);
  };

  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
