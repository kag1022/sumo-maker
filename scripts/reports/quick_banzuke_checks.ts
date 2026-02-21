import { Rank, RikishiStatus } from '../../src/logic/models';
import { createSeededRandom, createSimulationEngine } from '../../src/logic/simulation/engine';
import { createSimulationWorld, resolveTopDivisionQuotaForPlayer } from '../../src/logic/simulation/world';

type Scenario = {
  name: string;
  initial: RikishiStatus;
  seeds: number;
  steps: number;
};

type QuickSummary = {
  meta: {
    transitions: number;
    scenarios: number;
  };
  checks: {
    topMaegashira87ToSanyaku: number;
    juryoTop14PlusToSanyaku: number;
    komusubi9PlusStayedKomusubi: number;
  };
  signals: {
    maegashira8_87CaseCount: number;
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

const toRankLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? 'W' : 'E';
  if (rank.division === 'Makuuchi' && TOP_NAMES.has(rank.name)) {
    return `${rank.name}${side}`;
  }
  if (typeof rank.number === 'number') {
    return `${rank.name}${rank.number}${side}`;
  }
  return `${rank.name}${side}`;
};

const createStatus = (rank: Rank, base: number): RikishiStatus => ({
  heyaId: 'quick-check',
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
  injuryLevel: 0,
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

const run = async (): Promise<void> => {
  let transitions = 0;
  let topMaegashira87ToSanyaku = 0;
  let juryoTop14PlusToSanyaku = 0;
  let komusubi9PlusStayedKomusubi = 0;
  let maegashira8_87CaseCount = 0;
  const m8After = new Set<string>();
  const juryoTopAfter = new Set<string>();
  const lower70After = new Set<string>();
  const lowerBadAfter = new Set<string>();

  for (const scenario of scenarios) {
    for (let seed = 1; seed <= scenario.seeds; seed += 1) {
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
        const after = step.statusSnapshot.rank;
        const wins = step.playerRecord.wins;
        const losses = step.playerRecord.losses;
        const absent = step.playerRecord.absent;

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
            komusubi9PlusStayedKomusubi += 1;
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
    }
  }

  const summary: QuickSummary = {
    meta: {
      transitions,
      scenarios: scenarios.length,
    },
    checks: {
      topMaegashira87ToSanyaku,
      juryoTop14PlusToSanyaku,
      komusubi9PlusStayedKomusubi,
    },
    signals: {
      maegashira8_87CaseCount,
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

  console.log(JSON.stringify(summary, null, 2));
};

run();
