import { getRankValueForChart } from '../../src/logic/ranking/rankScore';
import { createSimulationEngine, createSeededRandom } from '../../src/logic/simulation/engine';
import { Rank, RikishiStatus } from '../../src/logic/models';

type Scenario = {
  name: string;
  seeds: number;
  steps: number;
  initial: RikishiStatus;
};

type Transition = {
  scenario: string;
  seed: number;
  seq: number;
  year: number;
  month: number;
  before: Rank;
  after: Rank;
  wins: number;
  losses: number;
  absent: number;
  deltaHalfStep: number;
  deltaRankApprox: number;
  sanyakuMakekoshiCount: number;
  topMaegashiraMakekoshiCount: number;
};

const SIDE_LABEL: Record<NonNullable<Rank['side']>, string> = {
  East: 'E',
  West: 'W',
};

const TOP_NAMES = new Set(['横綱', '大関', '関脇', '小結']);

const toRankLabel = (rank: Rank): string => {
  const side = rank.side ? SIDE_LABEL[rank.side] : '';
  if (rank.division === 'Makuuchi' && TOP_NAMES.has(rank.name)) {
    return `${rank.name}${side}`;
  }
  if (typeof rank.number === 'number') {
    return `${rank.name}${rank.number}${side}`;
  }
  return `${rank.name}${side}`;
};

const rankToHalfStep = (rank: Rank): number => {
  const side = rank.side === 'West' ? 1 : 0;
  return getRankValueForChart(rank) * 2 + side;
};

const defaultStats = {
  tsuki: 80,
  oshi: 80,
  kumi: 80,
  nage: 80,
  koshi: 80,
  deashi: 80,
  waza: 80,
  power: 80,
};

const createStatus = (
  rank: Rank,
  statsBase: number,
  injuryLevel = 0,
): RikishiStatus => ({
  heyaId: 'analysis',
  shikona: '検証山',
  entryAge: 15,
  age: 24,
  rank,
  stats: {
    tsuki: statsBase,
    oshi: statsBase,
    kumi: statsBase,
    nage: statsBase,
    koshi: statsBase,
    deashi: statsBase,
    waza: statsBase,
    power: statsBase,
  },
  potential: 75,
  growthType: 'NORMAL',
  tactics: 'BALANCE',
  archetype: 'HARD_WORKER',
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
  injuryLevel,
  injuries: [],
  isOzekiKadoban: false,
  isOzekiReturn: false,
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
    seeds: 90,
    steps: 24,
    initial: createStatus({ division: 'Makuuchi', name: '前頭', number: 8, side: 'East' }, 82),
  },
  {
    name: 'M2_strong',
    seeds: 90,
    steps: 24,
    initial: createStatus({ division: 'Makuuchi', name: '前頭', number: 2, side: 'East' }, 108),
  },
  {
    name: 'K_balanced',
    seeds: 90,
    steps: 24,
    initial: createStatus({ division: 'Makuuchi', name: '小結', side: 'East' }, 96),
  },
  {
    name: 'S_balanced',
    seeds: 90,
    steps: 24,
    initial: createStatus({ division: 'Makuuchi', name: '関脇', side: 'East' }, 96),
  },
  {
    name: 'J2_monster',
    seeds: 60,
    steps: 24,
    initial: createStatus({ division: 'Juryo', name: '十両', number: 2, side: 'East' }, 170),
  },
  {
    name: 'Ms35_strong',
    seeds: 60,
    steps: 20,
    initial: createStatus({ division: 'Makushita', name: '幕下', number: 35, side: 'East' }, 150),
  },
  {
    name: 'Sd80_strong',
    seeds: 60,
    steps: 20,
    initial: createStatus({ division: 'Sandanme', name: '三段目', number: 80, side: 'East' }, 145),
  },
  {
    name: 'Jd90_mixed',
    seeds: 70,
    steps: 20,
    initial: createStatus({ division: 'Jonidan', name: '序二段', number: 90, side: 'East' }, 95),
  },
  {
    name: 'Sd40_weak',
    seeds: 70,
    steps: 20,
    initial: createStatus({ division: 'Sandanme', name: '三段目', number: 40, side: 'East' }, 45),
  },
  {
    name: 'Jd30_weak',
    seeds: 70,
    steps: 20,
    initial: createStatus({ division: 'Jonidan', name: '序二段', number: 30, side: 'East' }, 45),
  },
  {
    name: 'J12_injured_full_absence',
    seeds: 10,
    steps: 2,
    initial: createStatus({ division: 'Juryo', name: '十両', number: 12, side: 'East' }, 80, 6),
  },
  {
    name: 'M10_injured_full_absence',
    seeds: 10,
    steps: 2,
    initial: createStatus({ division: 'Makuuchi', name: '前頭', number: 10, side: 'East' }, 80, 6),
  },
  {
    name: 'Sd70_injured_full_absence',
    seeds: 10,
    steps: 2,
    initial: createStatus({ division: 'Sandanme', name: '三段目', number: 70, side: 'East' }, 80, 6),
  },
];

const runScenario = async (scenario: Scenario): Promise<Transition[]> => {
  const rows: Transition[] = [];
  for (let seed = 1; seed <= scenario.seeds; seed += 1) {
    const rng = createSeededRandom(seed * 7919 + scenario.name.length * 104729);
    const engine = createSimulationEngine(
      {
        initialStats: JSON.parse(JSON.stringify(scenario.initial)) as RikishiStatus,
        oyakata: null,
      },
      {
        random: rng,
        getCurrentYear: () => 2026,
        yieldControl: async () => {},
      },
    );

    for (let i = 0; i < scenario.steps; i += 1) {
      const step = await engine.runNextBasho();
      if (step.kind !== 'BASHO') break;

      const before = step.playerRecord.rank;
      const after = step.statusSnapshot.rank;
      const beforeHalfStep = rankToHalfStep(before);
      const afterHalfStep = rankToHalfStep(after);
      const deltaHalfStep = beforeHalfStep - afterHalfStep;
      const sanyakuMakekoshiCount = step.npcBashoRecords.filter((row) =>
        row.division === 'Makuuchi' &&
        (row.rankName === '関脇' || row.rankName === '小結') &&
        (row.losses + row.absent) > row.wins).length;
      const topMaegashiraMakekoshiCount = step.npcBashoRecords.filter((row) =>
        row.division === 'Makuuchi' &&
        row.rankName === '前頭' &&
        typeof row.rankNumber === 'number' &&
        row.rankNumber <= 5 &&
        (row.losses + row.absent) > row.wins).length;

      rows.push({
        scenario: scenario.name,
        seed,
        seq: step.seq,
        year: step.year,
        month: step.month,
        before,
        after,
        wins: step.playerRecord.wins,
        losses: step.playerRecord.losses,
        absent: step.playerRecord.absent,
        deltaHalfStep,
        deltaRankApprox: deltaHalfStep / 2,
        sanyakuMakekoshiCount,
        topMaegashiraMakekoshiCount,
      });
    }
  }
  return rows;
};

const byDeltaAsc = (a: Transition, b: Transition): number => a.deltaHalfStep - b.deltaHalfStep;
const byDeltaDesc = (a: Transition, b: Transition): number => b.deltaHalfStep - a.deltaHalfStep;

const pick = (
  transitions: Transition[],
  predicate: (row: Transition) => boolean,
  sorter: (a: Transition, b: Transition) => number,
  limit: number,
): Transition[] => transitions.filter(predicate).sort(sorter).slice(0, limit);

const toPrintable = (rows: Transition[]) => rows.map((row) => ({
  scenario: row.scenario,
  seed: row.seed,
  seq: row.seq,
  ym: `${row.year}-${String(row.month).padStart(2, '0')}`,
  record: `${row.wins}-${row.losses}-${row.absent}`,
  before: toRankLabel(row.before),
  after: toRankLabel(row.after),
  deltaRankApprox: row.deltaRankApprox,
  deltaHalfStep: row.deltaHalfStep,
  sanyakuMakekoshiCount: row.sanyakuMakekoshiCount,
  topMaegashiraMakekoshiCount: row.topMaegashiraMakekoshiCount,
}));

const run = async (): Promise<void> => {
  const all: Transition[] = [];
  for (const scenario of scenarios) {
    const rows = await runScenario(scenario);
    all.push(...rows);
  }

  const m8_87 = all.filter((row) =>
    row.before.division === 'Makuuchi' &&
    row.before.name === '前頭' &&
    row.before.number === 8 &&
    row.wins === 8 &&
    row.losses === 7 &&
    row.absent === 0);
  const m8_87_grouped = Object.entries(
    m8_87.reduce<Record<string, number>>((acc, row) => {
      const key = toRankLabel(row.after);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  )
    .map(([after, count]) => ({ after, count }))
    .sort((a, b) => b.count - a.count);

  const report = {
    meta: {
      totalTransitions: all.length,
      generatedAt: new Date().toISOString(),
      scenarioCount: scenarios.length,
    },
    check1_top_wall_maegashira_8_7: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Makuuchi' &&
          row.before.name === '前頭' &&
          typeof row.before.number === 'number' &&
          row.before.number >= 1 &&
          row.before.number <= 5 &&
          row.wins === 8 &&
          row.losses === 7 &&
          row.absent === 0,
        byDeltaDesc,
        8,
      ),
    ),
    check1_komusubi_9plus: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Makuuchi' &&
          row.before.name === '小結' &&
          row.wins >= 9 &&
          row.absent === 0,
        byDeltaDesc,
        12,
      ),
    ),
    check1_sanyaku_7_8_soft_landing: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Makuuchi' &&
          (row.before.name === '関脇' || row.before.name === '小結') &&
          row.wins === 7 &&
          row.losses + row.absent === 8,
        byDeltaAsc,
        12,
      ),
    ),
    check2_j1to3_14plus: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Juryo' &&
          row.before.name === '十両' &&
          typeof row.before.number === 'number' &&
          row.before.number <= 3 &&
          row.wins >= 14,
        byDeltaDesc,
        12,
      ),
    ),
    check3_juryo_full_absence_or_0_15: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Juryo' &&
          ((row.wins === 0 && row.losses === 0 && row.absent === 15) ||
            (row.wins === 0 && row.losses + row.absent === 15)),
        byDeltaAsc,
        12,
      ),
    ),
    check3_makuuchi_full_absence: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Makuuchi' &&
          row.wins === 0 &&
          row.losses === 0 &&
          row.absent === 15,
        byDeltaAsc,
        12,
      ),
    ),
    check4_lower_7_0_large_jump: toPrintable(
      pick(
        all,
        (row) =>
          ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'].includes(row.before.division) &&
          row.wins === 7 &&
          row.losses === 0 &&
          row.absent === 0,
        byDeltaDesc,
        12,
      ),
    ),
    check4_lower_bad_record_big_drop: toPrintable(
      pick(
        all,
        (row) =>
          ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'].includes(row.before.division) &&
          (row.absent >= 7 || (row.wins <= 1 && row.losses + row.absent >= 6)),
        byDeltaAsc,
        12,
      ),
    ),
    check5_m8_8_7_variation_summary: {
      totalCases: m8_87.length,
      groupedAfterRank: m8_87_grouped.slice(0, 10),
      sample: toPrintable(m8_87.sort(byDeltaDesc).slice(0, 6).concat(m8_87.sort(byDeltaAsc).slice(0, 6))),
    },
    potentialBug_komusubi_9plus_not_promoted: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Makuuchi' &&
          row.before.name === '小結' &&
          row.wins >= 9 &&
          row.after.division === 'Makuuchi' &&
          row.after.name === '小結',
        byDeltaAsc,
        20,
      ),
    ),
    potentialBug_juryo_top_14plus_promoted_to_sanyaku: toPrintable(
      pick(
        all,
        (row) =>
          row.before.division === 'Juryo' &&
          typeof row.before.number === 'number' &&
          row.before.number <= 3 &&
          row.wins >= 14 &&
          row.after.division === 'Makuuchi' &&
          (row.after.name === '関脇' || row.after.name === '小結'),
        byDeltaDesc,
        20,
      ),
    ),
  };

  console.log(JSON.stringify(report, null, 2));
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
