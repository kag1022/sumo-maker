import { getRankValueForChart } from '../../src/logic/ranking/rankScore';
import { createSimulationEngine, createSeededRandom } from '../../src/logic/simulation/engine';
import { Rank, RikishiStatus } from '../../src/logic/models';

type Scenario = {
  name: string;
  initial: RikishiStatus;
  seeds: number;
  steps: number;
};

const toHalfStep = (rank: Rank): number => {
  const side = rank.side === 'West' ? 1 : 0;
  return getRankValueForChart(rank) * 2 + side;
};

const createStatus = (rank: Rank, base: number): RikishiStatus => ({
  heyaId: 'quantile-check',
  shikona: '分析山',
  entryAge: 15,
  age: 23,
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
  potential: 74,
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
    heightCm: 182,
    weightKg: 142,
  },
  traits: [],
  durability: 84,
  currentCondition: 54,
  ratingState: {
    ability: base * 1.04,
    form: 0,
    uncertainty: 2.1,
  },
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
    name: 'J8_balanced',
    initial: createStatus({ division: 'Juryo', name: '十両', number: 8, side: 'East' }, 95),
    seeds: 14,
    steps: 14,
  },
  {
    name: 'Ms35_strong',
    initial: createStatus({ division: 'Makushita', name: '幕下', number: 35, side: 'East' }, 130),
    seeds: 14,
    steps: 12,
  },
  {
    name: 'Sd75_mixed',
    initial: createStatus({ division: 'Sandanme', name: '三段目', number: 75, side: 'East' }, 110),
    seeds: 12,
    steps: 12,
  },
  {
    name: 'Jd90_mixed',
    initial: createStatus({ division: 'Jonidan', name: '序二段', number: 90, side: 'East' }, 104),
    seeds: 12,
    steps: 12,
  },
];

type QuantileSummary = {
  key: string;
  count: number;
  p10: number;
  p50: number;
  p90: number;
  min: number;
  max: number;
};

const quantile = (sorted: number[], q: number): number => {
  if (!sorted.length) return 0;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  const t = pos - lo;
  return sorted[lo] + (sorted[hi] - sorted[lo]) * t;
};

const summarize = (key: string, values: number[]): QuantileSummary => {
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    key,
    count: sorted.length,
    p10: Number(quantile(sorted, 0.1).toFixed(2)),
    p50: Number(quantile(sorted, 0.5).toFixed(2)),
    p90: Number(quantile(sorted, 0.9).toFixed(2)),
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
};

const run = async (): Promise<void> => {
  let transitions = 0;
  const bucket = new Map<string, number[]>();

  for (const scenario of scenarios) {
    for (let seed = 1; seed <= scenario.seeds; seed += 1) {
      const random = createSeededRandom(seed * 6151 + scenario.name.length * 131);
      const engine = createSimulationEngine(
        {
          initialStats: JSON.parse(JSON.stringify(scenario.initial)) as RikishiStatus,
          oyakata: null,
          banzukeEngineVersion: 'optimizer-v1',
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
        const deltaHalfStep = toHalfStep(before) - toHalfStep(after);
        const key = `${before.division}:${step.playerRecord.wins}-${step.playerRecord.losses}-${step.playerRecord.absent}`;
        const list = bucket.get(key) ?? [];
        list.push(deltaHalfStep);
        bucket.set(key, list);
      }
    }
  }

  const summaries = [...bucket.entries()]
    .filter(([, values]) => values.length >= 6)
    .map(([key, values]) => summarize(key, values))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);

  console.log(JSON.stringify({
    meta: {
      transitions,
      scenarioCount: scenarios.length,
      generatedAt: new Date().toISOString(),
      engineVersion: 'optimizer-v1',
    },
    quantiles: summaries,
  }, null, 2));
};

run().catch((error) => {
  console.error(error);
  throw error;
});
