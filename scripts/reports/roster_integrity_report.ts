import { RikishiStatus } from '../../src/logic/models';
import { runBashoDetailed } from '../../src/logic/simulation/basho';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import {
  advanceLeaguePopulation,
  applyLeaguePromotionFlow,
  createLeagueFlowRuntime,
  prepareLeagueForBasho,
} from '../../src/logic/simulation/engine';
import {
  advanceTopDivisionBanzuke,
  countActiveNpcInWorld,
  simulateOffscreenTopDivisionBasho,
} from '../../src/logic/simulation/world';

type Summary = {
  seed: number;
  bashoCount: number;
  minActive: {
    makuuchi: number;
    juryo: number;
  };
  maxByeRate: {
    makuuchi: number;
    juryo: number;
  };
  topWins: {
    makuuchi: Record<string, number>;
    juryo: Record<string, number>;
  };
};

const createStatus = (): RikishiStatus => ({
  stableId: 'stable-001',
  ichimonId: 'TAIJU',
  stableArchetypeId: 'MASTER_DISCIPLE',
  shikona: '検証山',
  entryAge: 15,
  age: 24,
  rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
  stats: {
    tsuki: 50,
    oshi: 50,
    kumi: 50,
    nage: 50,
    koshi: 50,
    deashi: 50,
    waza: 50,
    power: 50,
  },
  potential: 60,
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
    heightCm: 182,
    weightKg: 140,
  },
  traits: [],
  spirit: 0,
  durability: 80,
  currentCondition: 50,
  injuryLevel: 0,
  ratingState: {
    ability: 82,
    form: 0,
    uncertainty: 1,
  },
  injuries: [],
  isOzekiKadoban: false,
  isOzekiReturn: false,
  history: {
    records: [],
    events: [],
    maxRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
    totalWins: 0,
    totalLosses: 0,
    totalAbsent: 0,
    yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
    kimariteTotal: {},
  },
  statHistory: [],
});

const recordTopWins = (hist: Record<string, number>, topWins: number): void => {
  const key = String(topWins);
  hist[key] = (hist[key] || 0) + 1;
};

const run = (): void => {
  const seed = 7331;
  const rng = createSeededRandom(seed);
  const leagueFlow = createLeagueFlowRuntime(rng);
  const { world, lowerWorld } = leagueFlow;
  const status = createStatus();
  const months = [1, 3, 5, 7, 9, 11] as const;
  let seq = 0;

  const summary: Summary = {
    seed,
    bashoCount: 360,
    minActive: {
      makuuchi: Number.POSITIVE_INFINITY,
      juryo: Number.POSITIVE_INFINITY,
    },
    maxByeRate: {
      makuuchi: 0,
      juryo: 0,
    },
    topWins: {
      makuuchi: {},
      juryo: {},
    },
  };

  for (let i = 0; i < summary.bashoCount; i += 1) {
    const month = months[i % months.length];
    const year = 2026 + Math.floor(i / 6);

    prepareLeagueForBasho(leagueFlow, rng, year, seq, month);

    simulateOffscreenTopDivisionBasho(world, 'Makuuchi', rng);
    runBashoDetailed(status, year, month, rng, world, lowerWorld);
    const makuuchiRows = world.lastBashoResults.Makuuchi ?? [];
    const juryoRows = world.lastBashoResults.Juryo ?? [];
    const makuuchiTopWins = makuuchiRows.length ? Math.max(...makuuchiRows.map((row) => row.wins)) : 0;
    const juryoTopWins = juryoRows.length ? Math.max(...juryoRows.map((row) => row.wins)) : 0;
    recordTopWins(summary.topWins.makuuchi, makuuchiTopWins);
    recordTopWins(summary.topWins.juryo, juryoTopWins);

    const makuuchiByeRate = makuuchiRows.length
      ? makuuchiRows.reduce((acc, row) => acc + (row.absent ?? Math.max(0, 15 - (row.wins + row.losses))), 0) /
        (makuuchiRows.length * 15)
      : 0;
    const juryoByeRate = juryoRows.length
      ? juryoRows.reduce((acc, row) => acc + (row.absent ?? Math.max(0, 15 - (row.wins + row.losses))), 0) /
        (juryoRows.length * 15)
      : 0;
    summary.maxByeRate.makuuchi = Math.max(summary.maxByeRate.makuuchi, makuuchiByeRate);
    summary.maxByeRate.juryo = Math.max(summary.maxByeRate.juryo, juryoByeRate);

    advanceTopDivisionBanzuke(world);
    applyLeaguePromotionFlow(leagueFlow, rng);

    seq += 1;
    advanceLeaguePopulation(leagueFlow, rng, seq, month);

    const makuuchiActive = world.rosters.Makuuchi.filter(
      (row) => world.npcRegistry.get(row.id)?.active !== false,
    ).length;
    const juryoActive = world.rosters.Juryo.filter(
      (row) => world.npcRegistry.get(row.id)?.active !== false,
    ).length;
    summary.minActive.makuuchi = Math.min(summary.minActive.makuuchi, makuuchiActive);
    summary.minActive.juryo = Math.min(summary.minActive.juryo, juryoActive);
  }

  console.log(JSON.stringify(summary, null, 2));
};

run();
