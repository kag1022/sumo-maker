import fs from 'fs';
import os from 'os';
import path from 'path';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { Rank, RikishiStatus } from '../../src/logic/models';
import { createSeededRandom, createSimulationEngine } from '../../src/logic/simulation/engine';
import { createSimulationWorld, resolveTopDivisionQuotaForPlayer } from '../../src/logic/simulation/world';

type Scenario = {
  name: string;
  initial: RikishiStatus;
  seeds: number;
  steps: number;
};

type ConstraintBucket = 'YOKOZUNA' | 'OZEKI' | 'SANYAKU' | 'MAEGASHIRA' | 'JURYO' | 'LOWER';

type ScenarioTask = {
  scenario: Scenario;
  seed: number;
};

type ScenarioRunResult = {
  transitions: number;
  topMaegashira87ToSanyaku: number;
  juryoTop14PlusToSanyaku: number;
  komusubiPromotionPressureStayedKomusubi: number;
  komusubi9PlusContextualStay: number;
  maegashira8_87CaseCount: number;
  maegashira8_87AfterRanks: string[];
  juryoTop14PlusAfterRanks: string[];
  lower70AfterRanks: string[];
  lowerBadAfterRanks: string[];
  constraintHitsByBucket: Record<ConstraintBucket, number>;
};

type QuickSummary = {
  generatedAt: string;
  meta: {
    transitions: number;
    scenarios: number;
  };
  verdict: {
    overall: 'PASS' | 'WARN';
    headline: string;
  };
  checks: {
    topMaegashira87ToSanyaku: number;
    juryoTop14PlusToSanyaku: number;
    komusubiPromotionPressureStayedKomusubi: number;
    constraintHitsByBucket: Record<string, number>;
  };
  signals: {
    maegashira8_87CaseCount: number;
    komusubi9PlusContextualStay: number;
    maegashira8_87AfterRanks: string[];
    juryoTop14PlusAfterRanks: string[];
    lower70AfterRankCount: number;
    lower70AfterRanksSample: string[];
    lowerBadAfterRankCount: number;
    lowerBadAfterRanksSample: string[];
    syntheticMaegashira8_87HighPressure?: string;
    syntheticMaegashira8_87LowPressure?: string;
    syntheticJuryo15_0HighPressure?: string;
    syntheticJuryo15_0LowPressure?: string;
  };
};

const TOP_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const REPORT_PATH = path.join('docs', 'balance', 'banzuke-quick-checks.md');
const JSON_PATH = path.join('.tmp', 'banzuke-quick-checks.json');
const DEFAULT_WORKER_LIMIT = Number(process.env.BANZUKE_QUICK_WORKERS || 0);
const resolveAvailableWorkers = (): number => {
  const available =
    typeof os.availableParallelism === 'function'
      ? os.availableParallelism()
      : os.cpus().length;
  if (DEFAULT_WORKER_LIMIT > 0) {
    return Math.max(1, DEFAULT_WORKER_LIMIT);
  }
  return Math.max(1, Math.min(8, available - 1 || 1));
};
const createEmptyConstraintHits = (): Record<ConstraintBucket, number> => ({
  YOKOZUNA: 0,
  OZEKI: 0,
  SANYAKU: 0,
  MAEGASHIRA: 0,
  JURYO: 0,
  LOWER: 0,
});

const toRankLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : '東';
  if (rank.division === 'Makuuchi' && TOP_NAMES.has(rank.name)) {
    return `${rank.name}${side}`;
  }
  if (typeof rank.number === 'number') {
    return `${rank.name}${rank.number}${side}`;
  }
  return `${rank.name}${side}`;
};

const createStatus = (rank: Rank, base: number): RikishiStatus => ({
  stableId: 'stable-001',
  ichimonId: 'TAIJU',
  stableArchetypeId: 'MASTER_DISCIPLE',
  shikona: '検証山',
  entryAge: 15,
  age: 24,
  rank,
  stats: {
    tsuki: base,
    oshi: base,
    kumi: base,
    nage: base,
    koshi: base,
    deashi: base,
    waza: base,
    power: base,
  },
  potential: 75,
  growthType: 'NORMAL',
  tactics: 'BALANCE',
  archetype: 'HARD_WORKER',
  aptitudeTier: 'B',
  aptitudeFactor: 1,
  signatureMoves: ['寄り切り'],
  bodyType: 'NORMAL',
  profile: {
    realName: '分析 太郎',
    birthplace: '東京都',
    personality: 'CALM',
  },
  bodyMetrics: {
    heightCm: 183,
    weightKg: 146,
  },
  traits: [],
  durability: 85,
  currentCondition: 55,
  ratingState: {
    ability: base * 1.05,
    form: 0,
    uncertainty: 2.1,
  },
  injuryLevel: 0,
  injuries: [],
  isOzekiKadoban: false,
  isOzekiReturn: false,
  spirit: 70,
  history: {
    records: [],
    events: [],
    maxRank: rank,
    totalWins: 0,
    totalLosses: 0,
    totalAbsent: 0,
    yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
    kimariteTotal: {},
  },
  statHistory: [],
});

const scenarios: Scenario[] = [
  {
    name: 'M8_balanced',
    initial: createStatus({ division: 'Makuuchi', name: '前頭', number: 8, side: 'East' }, 76),
    seeds: 24,
    steps: 14,
  },
  {
    name: 'J2_monster',
    initial: createStatus({ division: 'Juryo', name: '十両', number: 2, side: 'East' }, 168),
    seeds: 18,
    steps: 12,
  },
  {
    name: 'K_balanced',
    initial: createStatus({ division: 'Makuuchi', name: '小結', side: 'East' }, 96),
    seeds: 18,
    steps: 12,
  },
  {
    name: 'lower_mix_sd',
    initial: createStatus({ division: 'Sandanme', name: '三段目', number: 70, side: 'East' }, 112),
    seeds: 14,
    steps: 10,
  },
  {
    name: 'lower_mix_jd',
    initial: createStatus({ division: 'Jonidan', name: '序二段', number: 70, side: 'East' }, 110),
    seeds: 14,
    steps: 10,
  },
];

const writeFile = (filePath: string, text: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const formatRankList = (items: string[]): string => (items.length ? items.join(' / ') : 'なし');

const sumConstraintHits = (constraintHitsByBucket: Record<string, number>): number =>
  Object.values(constraintHitsByBucket).reduce((sum, value) => sum + value, 0);

const buildVerdict = (
  topMaegashira87ToSanyaku: number,
  juryoTop14PlusToSanyaku: number,
  komusubiPromotionPressureStayedKomusubi: number,
): QuickSummary['verdict'] => {
  const hardFailures =
    topMaegashira87ToSanyaku +
    juryoTop14PlusToSanyaku +
    komusubiPromotionPressureStayedKomusubi;
  if (hardFailures === 0) {
    return {
      overall: 'PASS',
      headline: '重大な番付回帰は検出されませんでした。',
    };
  }
  return {
    overall: 'WARN',
    headline: '禁止したい番付回帰が検出されました。詳細を確認してください。',
  };
};

const renderJudgeLine = (
  label: string,
  count: number,
  passWhenZero = true,
): string => `- ${label}: ${count}件 ${passWhenZero && count === 0 ? 'PASS' : count === 0 ? 'INFO' : 'WARN'}`;

const renderConstraintHits = (constraintHitsByBucket: Record<string, number>): string[] => {
  const bucketLabels: Record<string, string> = {
    YOKOZUNA: '横綱',
    OZEKI: '大関',
    SANYAKU: '三役',
    MAEGASHIRA: '前頭',
    JURYO: '十両',
    LOWER: '幕下以下',
  };
  return Object.entries(constraintHitsByBucket).map(([bucket, count]) =>
    `- ${bucketLabels[bucket] ?? bucket}: ${count}件`);
};

const renderReport = (summary: QuickSummary): string => {
  const constraintHitTotal = sumConstraintHits(summary.checks.constraintHitsByBucket);
  const lines = [
    '# 番付 Quick Check',
    '',
    `- 実行日: ${summary.generatedAt}`,
    `- 総合判定: ${summary.verdict.overall}`,
    `- 所見: ${summary.verdict.headline}`,
    `- 対象シナリオ数: ${summary.meta.scenarios}`,
    `- 観測した遷移数: ${summary.meta.transitions}`,
    '',
    '## 重大回帰チェック',
    '',
    renderJudgeLine('前頭上位 8-7 が三役へ飛ぶ', summary.checks.topMaegashira87ToSanyaku),
    renderJudgeLine('十両上位 14勝以上が三役へ飛ぶ', summary.checks.juryoTop14PlusToSanyaku),
    renderJudgeLine('小結 昇進圧力ありの小結据え置き', summary.checks.komusubiPromotionPressureStayedKomusubi),
    '',
    '## 制約ヒット回数',
    '',
    `- 合計: ${constraintHitTotal}件`,
    '- 注記: これは「危険バグ件数」ではなく、番付制約ロジックが効いた回数です。',
    ...renderConstraintHits(summary.checks.constraintHitsByBucket),
    '',
    '## 観測シグナル',
    '',
    `- 前頭8の 8-7 ケース数: ${summary.signals.maegashira8_87CaseCount}件`,
    `- 小結9勝以上の文脈上許容する据え置き: ${summary.signals.komusubi9PlusContextualStay}件`,
    `- 前頭8の 8-7 着地: ${formatRankList(summary.signals.maegashira8_87AfterRanks)}`,
    `- 十両上位 14勝以上 の着地: ${formatRankList(summary.signals.juryoTop14PlusAfterRanks)}`,
    `- 幕下以下 7-0 の着地バリエーション数: ${summary.signals.lower70AfterRankCount}`,
    `- 幕下以下 7-0 の着地サンプル: ${formatRankList(summary.signals.lower70AfterRanksSample)}`,
    `- 幕下以下 大負け・全休 の着地バリエーション数: ${summary.signals.lowerBadAfterRankCount}`,
    `- 幕下以下 大負け・全休 の着地サンプル: ${formatRankList(summary.signals.lowerBadAfterRanksSample)}`,
    '',
    '## 圧力差の人工ケース',
    '',
    `- 前頭8 8-7 高圧時: ${summary.signals.syntheticMaegashira8_87HighPressure ?? 'なし'}`,
    `- 前頭8 8-7 低圧時: ${summary.signals.syntheticMaegashira8_87LowPressure ?? 'なし'}`,
    `- 十両2 15-0 高圧時: ${summary.signals.syntheticJuryo15_0HighPressure ?? 'なし'}`,
    `- 十両2 15-0 低圧時: ${summary.signals.syntheticJuryo15_0LowPressure ?? 'なし'}`,
    '',
    '## 読み方',
    '',
    '- 重大回帰チェックがすべて 0件なら、既知の危険回帰は再発していません。',
    '- 制約ヒット回数は多くても即バグではありません。大関帯は出やすい項目です。',
    '- 観測シグナルでは、着地が完全固定になっていないかと、圧力差で着地が変わるかを見ます。',
    '',
  ];
  return lines.join('\n');
};

const runScenarioTask = async ({ scenario, seed }: ScenarioTask): Promise<ScenarioRunResult> => {
  let transitions = 0;
  let topMaegashira87ToSanyaku = 0;
  let juryoTop14PlusToSanyaku = 0;
  let komusubiPromotionPressureStayedKomusubi = 0;
  let komusubi9PlusContextualStay = 0;
  let maegashira8_87CaseCount = 0;
  const m8After = new Set<string>();
  const juryoTopAfter = new Set<string>();
  const lower70After = new Set<string>();
  const lowerBadAfter = new Set<string>();
  const constraintHitsByBucket = createEmptyConstraintHits();

  const random = createSeededRandom(seed * 4099 + scenario.name.length * 97);
  const engine = createSimulationEngine(
    {
      initialStats: JSON.parse(JSON.stringify(scenario.initial)) as RikishiStatus,
      oyakata: null,
    },
    {
      random,
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  for (let i = 0; i < scenario.steps; i += 1) {
    const step = await engine.runNextBasho();
    if (step.kind !== 'BASHO') break;
    transitions += 1;
    const before = step.playerRecord.rank;
    const after = step.statusSnapshot?.rank ?? step.playerRecord.rank;
    const wins = step.playerRecord.wins;
    const losses = step.playerRecord.losses;
    const absent = step.playerRecord.absent;
    const sekiwakeMakekoshiCount = step.npcBashoRecords.filter((record) =>
      record.division === 'Makuuchi' &&
      record.rankName === '関脇' &&
      record.wins < record.losses + record.absent).length;
    const playerDecision = step.banzukeDecisions.find((decision) => decision.rikishiId === 'PLAYER');
    if (playerDecision?.constraintHits?.length) {
      const bucket = (playerDecision.ruleBucket ?? 'LOWER') as ConstraintBucket;
      constraintHitsByBucket[bucket] = (constraintHitsByBucket[bucket] ?? 0) + 1;
    }

    if (
      before.division === 'Makuuchi' &&
      before.name === '前頭' &&
      typeof before.number === 'number' &&
      before.number >= 1 &&
      before.number <= 5 &&
      wins === 8 &&
      losses === 7 &&
      absent === 0 &&
      (after.name === '関脇' || after.name === '小結')
    ) {
      topMaegashira87ToSanyaku += 1;
    }

    if (
      before.division === 'Juryo' &&
      typeof before.number === 'number' &&
      before.number <= 3 &&
      wins >= 14
    ) {
      juryoTopAfter.add(toRankLabel(after));
      if (after.division === 'Makuuchi' && (after.name === '関脇' || after.name === '小結')) {
        juryoTop14PlusToSanyaku += 1;
      }
    }

    if (
      before.division === 'Makuuchi' &&
      before.name === '小結' &&
      wins >= 9
    ) {
      if (after.division === 'Makuuchi' && after.name === '小結') {
        const hasPromotionPressure = wins >= 10 || sekiwakeMakekoshiCount > 0;
        if (hasPromotionPressure) {
          komusubiPromotionPressureStayedKomusubi += 1;
        } else {
          komusubi9PlusContextualStay += 1;
        }
      }
    }

    if (
      before.division === 'Makuuchi' &&
      before.name === '前頭' &&
      before.number === 8 &&
      wins === 8 &&
      losses === 7 &&
      absent === 0
    ) {
      maegashira8_87CaseCount += 1;
      m8After.add(toRankLabel(after));
    }

    if (
      (before.division === 'Makushita' ||
        before.division === 'Sandanme' ||
        before.division === 'Jonidan' ||
        before.division === 'Jonokuchi') &&
      wins === 7 &&
      losses === 0 &&
      absent === 0
    ) {
      lower70After.add(toRankLabel(after));
    }

    if (
      (before.division === 'Makushita' ||
        before.division === 'Sandanme' ||
        before.division === 'Jonidan' ||
        before.division === 'Jonokuchi') &&
      (absent >= 7 || (wins <= 1 && losses + absent >= 6))
    ) {
      lowerBadAfter.add(toRankLabel(after));
    }
  }

  return {
    transitions,
    topMaegashira87ToSanyaku,
    juryoTop14PlusToSanyaku,
    komusubiPromotionPressureStayedKomusubi,
    komusubi9PlusContextualStay,
    maegashira8_87CaseCount,
    maegashira8_87AfterRanks: [...m8After],
    juryoTop14PlusAfterRanks: [...juryoTopAfter],
    lower70AfterRanks: [...lower70After],
    lowerBadAfterRanks: [...lowerBadAfter],
    constraintHitsByBucket,
  };
};

const runScenarioTasksParallel = async (tasks: ScenarioTask[]): Promise<ScenarioRunResult[]> => {
  if (tasks.length === 0) return [];
  const workerCount = Math.min(resolveAvailableWorkers(), tasks.length);
  if (workerCount <= 1) {
    return Promise.all(tasks.map((task) => runScenarioTask(task)));
  }

  console.log(`quick banzuke checks: tasks=${tasks.length}, workers=${workerCount}`);

  return new Promise((resolve, reject) => {
    const results: ScenarioRunResult[] = new Array(tasks.length);
    let activeWorkers = 0;
    let completed = 0;
    let nextIndex = 0;
    let failed = false;

    const launchNext = (): void => {
      if (failed) return;
      if (completed === tasks.length && activeWorkers === 0) {
        resolve(results);
        return;
      }
      while (activeWorkers < workerCount && nextIndex < tasks.length) {
        const taskIndex = nextIndex;
        const task = tasks[nextIndex];
        nextIndex += 1;
        activeWorkers += 1;

        const worker = new Worker(__filename, {
          workerData: task,
        });

        worker.on('message', (message: ScenarioRunResult) => {
          results[taskIndex] = message;
          completed += 1;
          if (completed % 12 === 0 || completed === tasks.length) {
            console.log(`quick banzuke checks: completed ${completed}/${tasks.length}`);
          }
        });
        worker.on('error', (error) => {
          failed = true;
          reject(error);
        });
        worker.on('exit', (code) => {
          activeWorkers -= 1;
          if (!failed && code !== 0) {
            failed = true;
            reject(new Error(`quick banzuke worker exited with code ${code}`));
            return;
          }
          launchNext();
        });
      }
    };

    launchNext();
  });
};

const runMain = async (): Promise<void> => {
  let transitions = 0;
  let topMaegashira87ToSanyaku = 0;
  let juryoTop14PlusToSanyaku = 0;
  let komusubiPromotionPressureStayedKomusubi = 0;
  let komusubi9PlusContextualStay = 0;
  let maegashira8_87CaseCount = 0;
  const m8After = new Set<string>();
  const juryoTopAfter = new Set<string>();
  const lower70After = new Set<string>();
  const lowerBadAfter = new Set<string>();
  const constraintHitsByBucket = createEmptyConstraintHits();
  const tasks = scenarios.flatMap((scenario) =>
    Array.from({ length: scenario.seeds }, (_, index) => ({
      scenario,
      seed: index + 1,
    })),
  );
  const taskResults = await runScenarioTasksParallel(tasks);

  for (const result of taskResults) {
    transitions += result.transitions;
    topMaegashira87ToSanyaku += result.topMaegashira87ToSanyaku;
    juryoTop14PlusToSanyaku += result.juryoTop14PlusToSanyaku;
    komusubiPromotionPressureStayedKomusubi += result.komusubiPromotionPressureStayedKomusubi;
    komusubi9PlusContextualStay += result.komusubi9PlusContextualStay;
    maegashira8_87CaseCount += result.maegashira8_87CaseCount;
    for (const rank of result.maegashira8_87AfterRanks) m8After.add(rank);
    for (const rank of result.juryoTop14PlusAfterRanks) juryoTopAfter.add(rank);
    for (const rank of result.lower70AfterRanks) lower70After.add(rank);
    for (const rank of result.lowerBadAfterRanks) lowerBadAfter.add(rank);
    for (const bucket of Object.keys(constraintHitsByBucket) as ConstraintBucket[]) {
      constraintHitsByBucket[bucket] += result.constraintHitsByBucket[bucket] ?? 0;
    }
  }

  const summary: QuickSummary = {
    generatedAt: new Date().toISOString(),
    meta: {
      transitions,
      scenarios: scenarios.length,
    },
    verdict: buildVerdict(
      topMaegashira87ToSanyaku,
      juryoTop14PlusToSanyaku,
      komusubiPromotionPressureStayedKomusubi,
    ),
    checks: {
      topMaegashira87ToSanyaku,
      juryoTop14PlusToSanyaku,
      komusubiPromotionPressureStayedKomusubi,
      constraintHitsByBucket,
    },
    signals: {
      maegashira8_87CaseCount,
      komusubi9PlusContextualStay,
      maegashira8_87AfterRanks: [...m8After].sort(),
      juryoTop14PlusAfterRanks: [...juryoTopAfter].sort(),
      lower70AfterRankCount: lower70After.size,
      lower70AfterRanksSample: [...lower70After].sort().slice(0, 20),
      lowerBadAfterRankCount: lowerBadAfter.size,
      lowerBadAfterRanksSample: [...lowerBadAfter].sort().slice(0, 20),
    },
  };

  const buildPressureWorld = (wins: number, losses: number) => {
    const world = createSimulationWorld(() => 0.5);
    world.lastExchange = {
      slots: 1,
      promotedToMakuuchiIds: ['PLAYER'],
      demotedToJuryoIds: ['Makuuchi-41'],
      playerPromotedToMakuuchi: true,
      playerDemotedToJuryo: false,
    };
    world.lastBashoResults.Makuuchi = Array.from({ length: 12 }, (_, i) => ({
      id: `NPC-${i + 1}`,
      shikona: `NPC-${i + 1}`,
      isPlayer: false,
      stableId: 'npc',
      rankScore: i + 1,
      wins,
      losses,
    }));
    return world;
  };

  const m8HighWorld = buildPressureWorld(5, 10);
  m8HighWorld.lastExchange = {
    slots: 0,
    promotedToMakuuchiIds: [],
    demotedToJuryoIds: [],
    playerPromotedToMakuuchi: false,
    playerDemotedToJuryo: false,
  };
  m8HighWorld.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 7 };
  m8HighWorld.lastBashoResults.Makuuchi = [
    {
      id: 'PLAYER',
      shikona: '試験山',
      isPlayer: true,
      stableId: 'player-heya',
      rankScore: 23,
      wins: 8,
      losses: 7,
    },
    ...(m8HighWorld.lastBashoResults.Makuuchi ?? []),
  ];

  const m8LowWorld = buildPressureWorld(10, 5);
  m8LowWorld.lastExchange = {
    slots: 0,
    promotedToMakuuchiIds: [],
    demotedToJuryoIds: [],
    playerPromotedToMakuuchi: false,
    playerDemotedToJuryo: false,
  };
  m8LowWorld.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 7 };
  m8LowWorld.lastBashoResults.Makuuchi = [
    {
      id: 'PLAYER',
      shikona: '試験山',
      isPlayer: true,
      stableId: 'player-heya',
      rankScore: 23,
      wins: 8,
      losses: 7,
    },
    ...(m8LowWorld.lastBashoResults.Makuuchi ?? []),
  ];

  const m8HighQuota = resolveTopDivisionQuotaForPlayer(
    m8HighWorld,
    { division: 'Makuuchi', name: '前頭', side: 'East', number: 8 },
  );
  const m8LowQuota = resolveTopDivisionQuotaForPlayer(
    m8LowWorld,
    { division: 'Makuuchi', name: '前頭', side: 'East', number: 8 },
  );

  const juryoHighWorld = buildPressureWorld(5, 10);
  juryoHighWorld.lastPlayerAssignedRank = { division: 'Makuuchi', name: '小結', side: 'East' };
  juryoHighWorld.lastBashoResults.Juryo = [
    {
      id: 'PLAYER',
      shikona: '試験山',
      isPlayer: true,
      stableId: 'player-heya',
      rankScore: 4,
      wins: 15,
      losses: 0,
    },
  ];
  const juryoLowWorld = buildPressureWorld(10, 5);
  juryoLowWorld.lastPlayerAssignedRank = { division: 'Makuuchi', name: '小結', side: 'East' };
  juryoLowWorld.lastBashoResults.Juryo = [
    {
      id: 'PLAYER',
      shikona: '試験山',
      isPlayer: true,
      stableId: 'player-heya',
      rankScore: 4,
      wins: 15,
      losses: 0,
    },
  ];
  const juryoHighQuota = resolveTopDivisionQuotaForPlayer(
    juryoHighWorld,
    { division: 'Juryo', name: '十両', side: 'West', number: 2 },
  );
  const juryoLowQuota = resolveTopDivisionQuotaForPlayer(
    juryoLowWorld,
    { division: 'Juryo', name: '十両', side: 'West', number: 2 },
  );

  summary.signals.syntheticMaegashira8_87HighPressure =
    m8HighQuota?.assignedNextRank ? toRankLabel(m8HighQuota.assignedNextRank) : undefined;
  summary.signals.syntheticMaegashira8_87LowPressure =
    m8LowQuota?.assignedNextRank ? toRankLabel(m8LowQuota.assignedNextRank) : undefined;
  summary.signals.syntheticJuryo15_0HighPressure =
    juryoHighQuota?.assignedNextRank ? toRankLabel(juryoHighQuota.assignedNextRank) : undefined;
  summary.signals.syntheticJuryo15_0LowPressure =
    juryoLowQuota?.assignedNextRank ? toRankLabel(juryoLowQuota.assignedNextRank) : undefined;

  const report = renderReport(summary);
  writeFile(REPORT_PATH, report);
  writeFile(JSON_PATH, JSON.stringify(summary, null, 2));

  console.log(report);
  console.log(`report written: ${REPORT_PATH}`);
  console.log(`json written: ${JSON_PATH}`);
};

if (!isMainThread) {
  runScenarioTask(workerData as ScenarioTask)
    .then((result) => {
      parentPort?.postMessage(result);
    })
    .catch((error) => {
      throw error;
    });
} else {
  runMain().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
