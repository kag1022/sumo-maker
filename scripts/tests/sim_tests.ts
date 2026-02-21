import { calculateBattleResult, EnemyStats, generateEnemy } from '../../src/logic/battle';
import { applyGrowth } from '../../src/logic/growth';
import {
  BashoRecordSnapshot,
  calculateNextRank,
  generateNextBanzuke,
  resolveLowerRangeDeltaByScore,
  resolveSekitoriDeltaBand,
} from '../../src/logic/ranking';
import { runSimulation } from '../../src/logic/simulation/runner';
import { runBasho, runBashoDetailed } from '../../src/logic/simulation/basho';
import { resolveYushoResolution } from '../../src/logic/simulation/yusho';
import {
  BashoStepResult,
  SimulationStepResult,
  createSimulationEngine,
} from '../../src/logic/simulation/engine';
import { createInitialNpcUniverse } from '../../src/logic/simulation/npc/factory';
import { intakeNewNpcRecruits } from '../../src/logic/simulation/npc/intake';
import { reconcileNpcLeague } from '../../src/logic/simulation/npc/leagueReconcile';
import { countActiveByStable, NPC_STABLE_CATALOG } from '../../src/logic/simulation/npc/stableCatalog';
import {
  createSekitoriBoundaryWorld,
  resolveSekitoriQuotaForPlayer,
  runSekitoriQuotaStep,
} from '../../src/logic/simulation/sekitoriQuota';
import { createDailyMatchups, createFacedMap } from '../../src/logic/simulation/matchmaking';
import {
  createLowerDivisionQuotaWorld,
  resolveLowerDivisionQuotaForPlayer,
  runLowerDivisionQuotaStep,
} from '../../src/logic/simulation/lowerQuota';
import { resolveBoundaryExchange } from '../../src/logic/simulation/lower/exchange';
import {
  BoundarySnapshot as LowerBoundarySnapshot,
  EMPTY_EXCHANGE as EMPTY_LOWER_EXCHANGE,
  LOWER_BOUNDARIES,
} from '../../src/logic/simulation/lower/types';
import { resolveExpectedSlotBand } from '../../src/logic/ranking/expected/slotBands';
import { resolveLowerAssignedNextRank } from '../../src/logic/ranking/lowerCommittee';
import {
  advanceTopDivisionBanzuke,
  countActiveNpcInWorld,
  createSimulationWorld,
  resolveTopDivisionQuotaForPlayer,
  simulateOffscreenTopDivisionBasho,
} from '../../src/logic/simulation/world';
import { runNpcRetirementStep } from '../../src/logic/simulation/npc/retirement';
import { BashoRecord, Rank, RikishiStatus, Trait } from '../../src/logic/models';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { closeDb, getDb } from '../../src/logic/persistence/db';
import {
  appendBashoChunk,
  appendBanzukeDecisionLogs,
  appendBanzukePopulation,
  buildCareerStartYearMonth,
  commitCareer,
  createDraftCareer,
  getCareerHeadToHead,
  listBanzukeDecisions,
  listBanzukePopulation,
  listCommittedCareers,
  markCareerCompleted,
} from '../../src/logic/persistence/repository';
import {
  composeNextBanzuke,
  maxNumber,
  rankNumberSideToSlot,
  resolveVariableHeadcountByFlow,
  slotToRankNumberSide,
} from '../../src/logic/banzuke';
import {
  getWalletState,
  spendWalletPoints,
  WALLET_MAX_POINTS,
} from '../../src/logic/persistence/wallet';
import {
  resolveScoutOverrideCost,
  resizeTraitSlots,
  selectTraitForSlot,
  resolveTraitSlotCost,
  ScoutDraft,
  ScoutTraitSlotDraft,
} from '../../src/logic/scout/gacha';
import { initializeSimulationStatus } from '../../src/logic/simulation/career';

(globalThis as unknown as { indexedDB: typeof indexedDB }).indexedDB = indexedDB;
(globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

type TestCase = {
  name: string;
  run: () => void | Promise<void>;
};

const assert = {
  equal: (actual: unknown, expected: unknown): void => {
    if (actual !== expected) {
      throw new Error(`Expected ${String(expected)} but got ${String(actual)}`);
    }
  },
  ok: (value: unknown, message = 'Assertion failed'): void => {
    if (!value) {
      throw new Error(message);
    }
  },
  deepEqual: (actual: unknown, expected: unknown): void => {
    const actualJson = JSON.stringify(actual);
    const expectedJson = JSON.stringify(expected);
    if (actualJson !== expectedJson) {
      throw new Error(`Deep equality failed.\nactual: ${actualJson}\nexpected: ${expectedJson}`);
    }
  },
};

const fail = (message: string): never => {
  throw new Error(message);
};

const assertRank = (
  actual: Rank | undefined,
  expected: Rank,
  context = 'rank',
): void => {
  assert.ok(Boolean(actual), `Expected ${context} to be defined`);
  if (!actual) return;
  assert.equal(actual.division, expected.division);
  assert.equal(actual.name, expected.name);
  if (expected.number !== undefined) {
    assert.equal(actual.number, expected.number);
  }
  if (expected.side !== undefined) {
    assert.equal(actual.side, expected.side);
  }
};

const expectBashoStep = (
  step: SimulationStepResult,
  context: string,
): BashoStepResult => {
  if (step.kind === 'BASHO') {
    return step;
  }
  return fail(`Expected BASHO step in ${context}, got ${step.kind}`);
};

const createStatus = (overrides: Partial<RikishiStatus> = {}): RikishiStatus => ({
  heyaId: 'test',
  shikona: '試験山',
  entryAge: 15,
  age: 24,
  rank: { division: 'Makuuchi', name: '前頭', number: 10, side: 'East' },
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
  signatureMoves: ['寄り切り'],
  bodyType: 'NORMAL',
  profile: {
    realName: 'テスト 太郎',
    birthplace: '東京都',
    personality: 'CALM',
  },
  bodyMetrics: {
    heightCm: 182,
    weightKg: 140,
  },
  traits: [],
  durability: 80,
  currentCondition: 50,
  injuryLevel: 0,
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
  ...overrides,
});

const createBashoRecord = (rank: Rank, wins: number, losses: number, absent = 0): BashoRecord => ({
  year: 2026,
  month: 1,
  rank,
  wins,
  losses,
  absent,
  yusho: false,
  specialPrizes: [],
});

const createSekitoriSnapshot = (
  id: string,
  rank: Rank,
  wins: number,
  losses: number,
  absent: number,
): BashoRecordSnapshot => ({
  id,
  shikona: id,
  rank,
  wins,
  losses,
  absent,
});

const buildNeutralSekitoriRecords = (): BashoRecordSnapshot[] => [
  ...Array.from({ length: 42 }, (_, i) =>
    createSekitoriSnapshot(
      `M${i + 1}`,
      {
        division: 'Makuuchi',
        name: '前頭',
        side: i % 2 === 0 ? 'East' : 'West',
        number: Math.floor(i / 2) + 1,
      },
      8,
      7,
      0,
    )),
  ...Array.from({ length: 28 }, (_, i) =>
    createSekitoriSnapshot(
      `J${i + 1}`,
      {
        division: 'Juryo',
        name: '十両',
        side: i % 2 === 0 ? 'East' : 'West',
        number: Math.floor(i / 2) + 1,
      },
      8,
      7,
      0,
    )),
];

const summarizeCareer = (status: RikishiStatus) => ({
  maxRank: status.history.maxRank,
  totals: {
    wins: status.history.totalWins,
    losses: status.history.totalLosses,
    absent: status.history.totalAbsent,
  },
  yushoCount: status.history.yushoCount,
  finalAge: status.age,
  bashoCount: status.history.records.length,
  firstFiveRecords: status.history.records.slice(0, 5).map((record) => ({
    year: record.year,
    month: record.month,
    rank: {
      division: record.rank.division,
      name: record.rank.name,
      number: record.rank.number ?? null,
      side: record.rank.side ?? null,
    },
    wins: record.wins,
    losses: record.losses,
    absent: record.absent,
  })),
  lastFiveRecords: status.history.records.slice(-5).map((record) => ({
    year: record.year,
    month: record.month,
    rank: {
      division: record.rank.division,
      name: record.rank.name,
      number: record.rank.number ?? null,
      side: record.rank.side ?? null,
    },
    wins: record.wins,
    losses: record.losses,
    absent: record.absent,
  })),
  firstFiveEvents: status.history.events.slice(0, 5).map((event) => ({
    year: event.year,
    month: event.month,
    type: event.type,
    description: event.description,
  })),
  lastFiveEvents: status.history.events.slice(-5).map((event) => ({
    year: event.year,
    month: event.month,
    type: event.type,
    description: event.description,
  })),
  retirementReason:
    status.history.events.find((event) => event.type === 'RETIREMENT')?.description ?? null,
});

const sequenceRng = (values: number[]): (() => number) => {
  let idx = 0;
  return () => {
    const value = values[Math.min(idx, values.length - 1)];
    idx += 1;
    return value;
  };
};

const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const pearsonCorrelation = (xs: number[], ys: number[]): number => {
  if (xs.length !== ys.length || xs.length === 0) return 0;
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let numerator = 0;
  let sumSqX = 0;
  let sumSqY = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    numerator += dx * dy;
    sumSqX += dx * dx;
    sumSqY += dy * dy;
  }
  if (sumSqX === 0 || sumSqY === 0) return 0;
  return numerator / Math.sqrt(sumSqX * sumSqY);
};

const SCOUT_SLOT_OPTION_SETS: Trait[][] = [
  ['KYOUSHINZOU', 'RENSHOU_KAIDOU', 'DOHYOUGIWA_MAJUTSU', 'CLUTCH_REVERSAL', 'READ_THE_BOUT'],
  ['RENSHOU_KAIDOU', 'KYOUSHINZOU', 'THRUST_RUSH', 'OPENING_DASH', 'PROTECT_LEAD'],
  ['BELT_COUNTER', 'LONG_REACH', 'HEAVY_PRESSURE', 'SENSHURAKU_KISHITSU', 'TRAILING_FIRE'],
  ['RECOVERY_MONSTER', 'WEAK_LOWER_BACK', 'THRUST_RUSH', 'OPENING_DASH', 'READ_THE_BOUT'],
  ['CLUTCH_REVERSAL', 'BELT_COUNTER', 'LONG_REACH', 'HEAVY_PRESSURE', 'RECOVERY_MONSTER'],
];

const buildScoutTraitSlotDrafts = (
  slots: number,
  selectedTraits: Trait[],
): ScoutTraitSlotDraft[] => {
  const used = new Set<Trait>();
  return Array.from({ length: slots }, (_, slotIndex) => {
    const options = SCOUT_SLOT_OPTION_SETS[slotIndex] ? [...SCOUT_SLOT_OPTION_SETS[slotIndex]] : [];
    const requested = selectedTraits[slotIndex];
    let selected: Trait | null =
      requested && options.includes(requested) && !used.has(requested) ? requested : null;
    if (!selected) {
      selected = options.find((option) => !used.has(option)) ?? null;
    }
    if (selected) used.add(selected);
    return {
      slotIndex,
      options,
      selected,
    };
  });
};

const createScoutDraft = (overrides: Partial<ScoutDraft> = {}): ScoutDraft => {
  const baseTraits: Trait[] = ['KYOUSHINZOU', 'RENSHOU_KAIDOU'];
  const baseSlots = 2;
  const baseDraft: ScoutDraft = {
    shikona: '雷ノ海',
    profile: {
      realName: '山田 太郎',
      birthplace: '東京都',
      personality: 'CALM',
    },
    history: 'HS_GRAD',
    entryDivision: 'Maezumo',
    archetype: 'HARD_WORKER',
    tactics: 'BALANCE',
    signatureMove: '寄り切り',
    bodyType: 'NORMAL',
    bodyMetrics: { heightCm: 182, weightKg: 140 },
    traitSlots: baseSlots,
    traits: baseTraits,
    traitSlotDrafts: buildScoutTraitSlotDrafts(baseSlots, baseTraits),
  };
  const merged = {
    ...baseDraft,
    ...overrides,
  } as ScoutDraft;
  if (!overrides.traitSlotDrafts) {
    merged.traitSlotDrafts = buildScoutTraitSlotDrafts(merged.traitSlots, merged.traits);
  }
  return merged;
};

const resetDb = async (): Promise<void> => {
  closeDb();
  const db = getDb();
  db.close();
  await db.delete();
  await db.open();
};

const tests: TestCase[] = [
  {
    name: 'battle: deterministic win path',
    run: () => {
      const rikishi = createStatus({
        stats: {
          tsuki: 120,
          oshi: 120,
          kumi: 120,
          nage: 120,
          koshi: 120,
          deashi: 120,
          waza: 120,
          power: 120,
        },
      });
      const enemy: EnemyStats = {
        shikona: '弱敵',
        rankValue: 9,
        power: 20,
        heightCm: 176,
        weightKg: 104,
      };
      const result = calculateBattleResult(rikishi, enemy, undefined, () => 0.01);
      assert.equal(result.isWin, true);
      assert.equal(typeof result.kimarite, 'string');
      assert.ok(result.kimarite.length > 0);
    },
  },
  {
    name: 'battle: dohyougiwa reversal can flip a loss',
    run: () => {
      const rikishi = createStatus({
        traits: ['DOHYOUGIWA_MAJUTSU'],
        stats: {
          tsuki: 1,
          oshi: 1,
          kumi: 1,
          nage: 1,
          koshi: 1,
          deashi: 1,
          waza: 1,
          power: 1,
        },
      });
      const enemy: EnemyStats = {
        shikona: '強敵',
        rankValue: 1,
        power: 200,
        heightCm: 192,
        weightKg: 178,
      };
      const rng = sequenceRng([0.99, 0.05, 0.0]);
      const result = calculateBattleResult(rikishi, enemy, undefined, rng);
      assert.equal(result.isWin, true);
    },
  },
  {
    name: 'battle: body metrics size diff affects result',
    run: () => {
      const enemy: EnemyStats = {
        shikona: '互角敵',
        rankValue: 5,
        power: 60,
        heightCm: 182,
        weightKg: 140,
      };
      const small = createStatus({
        bodyType: 'SOPPU',
        bodyMetrics: { heightCm: 172, weightKg: 106 },
      });
      const large = createStatus({
        bodyType: 'ANKO',
        bodyMetrics: { heightCm: 190, weightKg: 196 },
      });
      const smallResult = calculateBattleResult(small, enemy, { day: 3, currentWins: 1, currentLosses: 1, consecutiveWins: 0, isLastDay: false, isYushoContention: false }, () => 0.5);
      const largeResult = calculateBattleResult(large, enemy, { day: 3, currentWins: 1, currentLosses: 1, consecutiveWins: 0, isLastDay: false, isYushoContention: false }, () => 0.5);
      assert.equal(smallResult.isWin, false);
      assert.equal(largeResult.isWin, true);
    },
  },
  {
    name: 'battle: clutch reversal can flip a loss at 4%',
    run: () => {
      const rikishi = createStatus({
        traits: ['CLUTCH_REVERSAL'],
        stats: {
          tsuki: 1,
          oshi: 1,
          kumi: 1,
          nage: 1,
          koshi: 1,
          deashi: 1,
          waza: 1,
          power: 1,
        },
      });
      const enemy: EnemyStats = {
        shikona: '強敵',
        rankValue: 1,
        power: 220,
        heightCm: 194,
        weightKg: 185,
      };
      const rng = sequenceRng([0.99, 0.03, 0.0]);
      const result = calculateBattleResult(rikishi, enemy, undefined, rng);
      assert.equal(result.isWin, true);
    },
  },
  {
    name: 'battle: read-the-bout boosts after previous loss',
    run: () => {
      const rikishi = createStatus({
        traits: ['READ_THE_BOUT'],
      });
      const enemy: EnemyStats = {
        shikona: '五分敵',
        rankValue: 5,
        power: 62,
        heightCm: 182,
        weightKg: 140,
      };
      let foundWinFlip = false;
      for (let i = 1; i < 99; i += 1) {
        const roll = i / 100;
        const withoutLoss = calculateBattleResult(
          rikishi,
          enemy,
          {
            day: 5,
            currentWins: 2,
            currentLosses: 2,
            consecutiveWins: 0,
            isLastDay: false,
            isYushoContention: false,
            previousResult: 'WIN',
          },
          () => roll,
        );
        const afterLoss = calculateBattleResult(
          rikishi,
          enemy,
          {
            day: 6,
            currentWins: 2,
            currentLosses: 3,
            consecutiveWins: 0,
            isLastDay: false,
            isYushoContention: false,
            previousResult: 'LOSS',
          },
          () => roll,
        );
        if (!withoutLoss.isWin && afterLoss.isWin) {
          foundWinFlip = true;
          break;
        }
      }
      assert.equal(foundWinFlip, true);
    },
  },
  {
    name: 'battle: makuuchi fallback enemy can represent yokozuna rank',
    run: () => {
      const enemy = generateEnemy('Makuuchi', 2026, sequenceRng([0, 0.5]));
      assert.equal(enemy.rankName, '横綱');
      assert.equal(enemy.rankValue, 1);
    },
  },
  {
    name: 'battle: fallback enemy body metrics are stable for same seed slot',
    run: () => {
      const a = generateEnemy('Juryo', 2026, sequenceRng([0.25, 0.1]));
      const b = generateEnemy('Juryo', 2026, sequenceRng([0.25, 0.9]));
      assert.equal(a.heightCm, b.heightCm);
      assert.equal(a.weightKg, b.weightKg);
    },
  },
  {
    name: 'battle: fallback enemy applies era-based power drift',
    run: () => {
      const oldEra = generateEnemy('Makushita', 2026, sequenceRng([0.4, 0.5]));
      const futureEra = generateEnemy('Makushita', 2040, sequenceRng([0.4, 0.5]));
      assert.ok(
        futureEra.power > oldEra.power,
        `Expected future era power to be higher: old=${oldEra.power}, future=${futureEra.power}`,
      );
    },
  },
  {
    name: 'yusho: tie at top resolves to a single playoff winner',
    run: () => {
      const resolution = resolveYushoResolution(
        [
          { id: 'A', wins: 12, losses: 3, rankScore: 3, power: 90 },
          { id: 'B', wins: 12, losses: 3, rankScore: 7, power: 88 },
          { id: 'C', wins: 12, losses: 3, rankScore: 12, power: 86 },
          { id: 'D', wins: 11, losses: 4, rankScore: 16, power: 84 },
        ],
        sequenceRng([0.2, 0.8, 0.4, 0.6]),
      );
      assert.ok(Boolean(resolution.winnerId));
      assert.equal(resolution.playoffParticipantIds.length, 3);
      assert.ok(!resolution.junYushoIds.has(resolution.winnerId as string));
    },
  },
  {
    name: 'yusho: even low-win field still produces one winner',
    run: () => {
      const resolution = resolveYushoResolution(
        [
          { id: 'A', wins: 3, losses: 12, rankScore: 20 },
          { id: 'B', wins: 2, losses: 13, rankScore: 18 },
          { id: 'C', wins: 1, losses: 14, rankScore: 12 },
        ],
        () => 0.5,
      );
      assert.equal(resolution.winnerId, 'A');
      assert.equal(resolution.junYushoIds.has('B'), true);
    },
  },
  {
    name: 'growth: deterministic snapshot for balanced rikishi',
    run: () => {
      const result = applyGrowth(createStatus(), null, false, () => 0.5);
      assert.deepEqual(
        result.stats,
        {
          tsuki: 52,
          oshi: 52,
          kumi: 52.15,
          nage: 52,
          koshi: 52.15,
          deashi: 52.15,
          waza: 52,
          power: 52,
        },
      );
      assert.equal(result.injuryLevel, 0);
    },
  },
  {
    name: 'growth: recovery monster increases injury recovery by +1',
    run: () => {
      const base = createStatus({
        age: 28,
        injuries: [
          {
            id: 'inj-1',
            type: 'KNEE',
            name: '膝半月板損傷',
            severity: 6,
            status: 'ACUTE',
            occurredAt: { year: 2026, month: 1 },
          },
        ],
        injuryLevel: 6,
      });
      const normal = applyGrowth({ ...base, traits: [] }, null, false, () => 0.5);
      const boosted = applyGrowth({ ...base, traits: ['RECOVERY_MONSTER'] }, null, false, () => 0.5);
      assert.ok((boosted.injuries[0]?.severity || 99) < (normal.injuries[0]?.severity || 0));
    },
  },
  {
    name: 'compat: initialize status patches missing profile/bodyMetrics',
    run: () => {
      const legacy = {
        ...createStatus(),
        profile: undefined,
        bodyMetrics: undefined,
      } as unknown as RikishiStatus;
      const patched = initializeSimulationStatus(legacy);
      assert.equal(typeof patched.profile.realName, 'string');
      assert.equal(typeof patched.profile.birthplace, 'string');
      assert.ok(Boolean(patched.profile.personality));
      assert.ok(Number.isFinite(patched.bodyMetrics.heightCm));
      assert.ok(Number.isFinite(patched.bodyMetrics.weightKg));
    },
  },
  {
    name: 'ranking: yokozuna is never demoted',
    run: () => {
      const yokozuna: Rank = { division: 'Makuuchi', name: '横綱', side: 'East' };
      const result = calculateNextRank(createBashoRecord(yokozuna, 0, 15), [], false, () => 0.0);
      assert.equal(result.nextRank.name, '横綱');
      assert.equal(result.nextRank.division, 'Makuuchi');
    },
  },
  {
    name: 'ranking: deterministic ozeki promotion branch',
    run: () => {
      const ozeki: Rank = { division: 'Makuuchi', name: '大関', side: 'East' };
      const prev = createBashoRecord(ozeki, 15, 0);
      prev.yusho = true;
      const current = createBashoRecord(ozeki, 14, 1);
      const result = calculateNextRank(current, [prev], false, () => 0.1);
      assert.equal(result.nextRank.name, '横綱');
      assert.equal(result.event, 'PROMOTION_TO_YOKOZUNA');
    },
  },
  {
    name: 'ranking: ozeki kadoban demotion sets return-chance flag',
    run: () => {
      const ozeki: Rank = { division: 'Makuuchi', name: '大関', side: 'East' };
      const result = calculateNextRank(createBashoRecord(ozeki, 7, 8), [], true, () => 0.5);
      assert.equal(result.nextRank.name, '関脇');
      assert.equal(result.isOzekiReturn, true);
      assert.equal(result.isKadoban, false);
    },
  },
  {
    name: 'ranking: sekiwake 10 wins with return-chance returns to ozeki',
    run: () => {
      const sekiwake: Rank = { division: 'Makuuchi', name: '関脇', side: 'East' };
      const result = calculateNextRank(
        createBashoRecord(sekiwake, 10, 5),
        [],
        false,
        () => 0.5,
        { isOzekiReturn: true },
      );
      assert.equal(result.nextRank.name, '大関');
      assert.equal(result.event, 'PROMOTION_TO_OZEKI');
      assert.equal(result.isOzekiReturn, false);
    },
  },
  {
    name: 'ranking: 11-11-11 in sanyaku reaches ozeki',
    run: () => {
      const sekiwake: Rank = { division: 'Makuuchi', name: '関脇', side: 'East' };
      const current = createBashoRecord(sekiwake, 11, 4);
      const prev1 = createBashoRecord(sekiwake, 11, 4);
      const prev2 = createBashoRecord({ division: 'Makuuchi', name: '小結', side: 'West' }, 11, 4);
      const result = calculateNextRank(current, [prev1, prev2], false, () => 0.5);
      assert.equal(result.nextRank.name, '大関');
      assert.equal(result.event, 'PROMOTION_TO_OZEKI');
    },
  },
  {
    name: 'simulation: sekitori basho record totals 15 bouts',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      const status = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 14 },
      });
      const record = runBasho(status, 2026, 1, () => 0.5, world);
      assert.equal(record.wins + record.losses + record.absent, 15);
    },
  },
  {
    name: 'simulation: sekitori division always has exactly one yusho winner',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      const status = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
      });
      runBashoDetailed(status, 2026, 1, () => 0.5, world);
      const results = world.lastBashoResults.Juryo ?? [];
      const yushoCount = results.filter((row) => row.yusho).length;
      assert.equal(yushoCount, 1);
    },
  },
  {
    name: 'simulation: mild injured sekitori can still compete and updates world results',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      const status = createStatus({
        rank: { division: 'Makuuchi', name: '前頭', number: 16, side: 'East' },
        injuryLevel: 3,
      });
      const result = runBashoDetailed(status, 2026, 1, () => 0.5, world);
      assert.equal(result.playerRecord.wins + result.playerRecord.losses + result.playerRecord.absent, 15);
      assert.ok(result.playerRecord.absent < 15, 'Expected mild injury to avoid full basho absence');
      assert.ok((world.lastBashoResults.Makuuchi ?? []).length > 0);
      const playerRow = (world.lastBashoResults.Makuuchi ?? []).find((row) => row.id === 'PLAYER');
      assert.ok(Boolean(playerRow), 'Expected PLAYER in makuuchi world results');
      assert.equal(result.sameDivisionNpcRecords.length > 0, true);
    },
  },
  {
    name: 'simulation: severe injured sekitori is forced to sit out full basho',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      const status = createStatus({
        rank: { division: 'Makuuchi', name: '前頭', number: 16, side: 'East' },
        injuryLevel: 8,
      });
      const result = runBashoDetailed(status, 2026, 1, () => 0.5, world);
      assert.equal(result.playerRecord.absent, 15);
      assert.equal(result.playerRecord.wins, 0);
      assert.equal(result.playerRecord.losses, 0);
      assert.ok((world.lastBashoResults.Makuuchi ?? []).length > 0);
    },
  },
  {
    name: 'simulation: maegashira kinboshi can be recorded with sansho',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.rosters.Makuuchi = world.rosters.Makuuchi.map((npc, index) => ({
        ...npc,
        rankScore: index % 2 === 0 ? 1 : 2,
      }));
      const status = createStatus({
        rank: { division: 'Makuuchi', name: '前頭', number: 16, side: 'East' },
        stats: {
          tsuki: 180,
          oshi: 180,
          kumi: 180,
          nage: 180,
          koshi: 180,
          deashi: 180,
          waza: 180,
          power: 180,
        },
      });
      const result = runBashoDetailed(status, 2026, 1, () => 0.5, world);
      assert.ok((result.playerRecord.kinboshi ?? 0) > 0);
      assert.ok(result.playerRecord.specialPrizes.includes('SHUKUN'));
    },
  },
  {
    name: 'simulation: ozeki does not receive sansho',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      const status = createStatus({
        rank: { division: 'Makuuchi', name: '大関', side: 'East' },
        stats: {
          tsuki: 180,
          oshi: 180,
          kumi: 180,
          nage: 180,
          koshi: 180,
          deashi: 180,
          waza: 180,
          power: 180,
        },
      });
      const result = runBashoDetailed(status, 2026, 1, () => 0.5, world);
      assert.equal(result.playerRecord.specialPrizes.length, 0);
    },
  },
  {
    name: 'ranking: jonokuchi makekoshi does not demote to maezumo',
    run: () => {
      const jonokuchi: Rank = { division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 30 };
      const result = calculateNextRank(createBashoRecord(jonokuchi, 2, 5), [], false, () => 0.5);
      assert.equal(result.nextRank.division, 'Jonokuchi');
      assert.equal(result.nextRank.name, '序ノ口');
      assert.equal(result.nextRank.number, 30);
    },
  },
  {
    name: 'ranking: jonokuchi full absence is clamped to jonokuchi bottom',
    run: () => {
      const jonokuchi: Rank = { division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 30 };
      const result = calculateNextRank(createBashoRecord(jonokuchi, 0, 0, 7), [], false, () => 0.5);
      assert.equal(result.nextRank.division, 'Jonokuchi');
      assert.equal(result.nextRank.number, 30);
    },
  },
  {
    name: 'ranking: maezumo promotes to jonokuchi even with zero wins if not full absence',
    run: () => {
      const maezumo: Rank = { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
      const result = calculateNextRank(createBashoRecord(maezumo, 0, 3, 0), [], false, () => 0.5);
      assert.equal(result.nextRank.division, 'Jonokuchi');
      assert.equal(result.event, 'PROMOTION_TO_JONOKUCHI');
    },
  },
  {
    name: 'ranking: maezumo full absence stays in maezumo',
    run: () => {
      const maezumo: Rank = { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
      const result = calculateNextRank(createBashoRecord(maezumo, 0, 0, 3), [], false, () => 0.5);
      assert.equal(result.nextRank.division, 'Maezumo');
    },
  },
  {
    name: 'ranking: quota can block juryo to makuuchi promotion',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 1 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 10, 5),
        [],
        false,
        () => 0.5,
        { topDivisionQuota: { canPromoteToMakuuchi: false } },
      );
      assert.equal(result.nextRank.division, 'Juryo');
      assert.equal(result.nextRank.name, '十両');
    },
  },
  {
    name: 'ranking: quota can block makuuchi to juryo demotion',
    run: () => {
      const maegashira: Rank = { division: 'Makuuchi', name: '前頭', side: 'East', number: 16 };
      const result = calculateNextRank(
        createBashoRecord(maegashira, 5, 10),
        [],
        false,
        () => 0.5,
        { topDivisionQuota: { canDemoteToJuryo: false } },
      );
      assert.equal(result.nextRank.division, 'Makuuchi');
      assert.equal(result.nextRank.name, '前頭');
    },
  },
  {
    name: 'ranking: sekitori quota can block juryo to makushita demotion',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 14 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 6, 9),
        [],
        false,
        () => 0.5,
        { sekitoriQuota: { canDemoteToMakushita: false } },
      );
      assert.equal(result.nextRank.division, 'Juryo');
      assert.equal(result.nextRank.name, '十両');
    },
  },
  {
    name: 'ranking: juryo full absence follows same quota block as full losses',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 14 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 0, 0, 15),
        [],
        false,
        () => 0.5,
        { sekitoriQuota: { canDemoteToMakushita: false } },
      );
      assert.equal(result.nextRank.division, 'Juryo');
      assert.equal(result.nextRank.name, '十両');
    },
  },
  {
    name: 'ranking: sekitori quota can block makushita to juryo promotion',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 3 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 6, 1),
        [],
        false,
        () => 0.5,
        { sekitoriQuota: { canPromoteToJuryo: false } },
      );
      assert.equal(result.nextRank.division, 'Makushita');
      assert.equal(result.nextRank.name, '幕下');
    },
  },
  {
    name: 'ranking: makushita head kachikoshi is blocked when quota says no slot',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 1 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 4, 3),
        [],
        false,
        () => 0.5,
        { sekitoriQuota: { canPromoteToJuryo: false } },
      );
      assert.equal(result.nextRank.division, 'Makushita');
      assert.equal(result.nextRank.name, '幕下');
    },
  },
  {
    name: 'ranking: lower quota can block makushita to sandanme demotion',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 60 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 0, 7),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canDemoteToSandanme: false } },
      );
      assert.equal(result.nextRank.division, 'Makushita');
      assert.equal(result.nextRank.name, '幕下');
    },
  },
  {
    name: 'ranking: makushita full absence follows same lower quota block as full losses',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 60 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 0, 0, 7),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canDemoteToSandanme: false } },
      );
      assert.equal(result.nextRank.division, 'Makushita');
    },
  },
  {
    name: 'ranking: lower quota can block sandanme to makushita promotion',
    run: () => {
      const sandanme: Rank = { division: 'Sandanme', name: '三段目', side: 'East', number: 3 };
      const result = calculateNextRank(
        createBashoRecord(sandanme, 6, 1),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canPromoteToMakushita: false } },
      );
      assert.equal(result.nextRank.division, 'Sandanme');
      assert.equal(result.nextRank.name, '三段目');
    },
  },
  {
    name: 'ranking: sandanme head kachikoshi is blocked when lower quota says no slot',
    run: () => {
      const sandanme: Rank = { division: 'Sandanme', name: '三段目', side: 'East', number: 1 };
      const result = calculateNextRank(
        createBashoRecord(sandanme, 4, 3),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canPromoteToMakushita: false } },
      );
      assert.equal(result.nextRank.division, 'Sandanme');
      assert.equal(result.nextRank.name, '三段目');
    },
  },
  {
    name: 'ranking: lower quota can block jonidan to jonokuchi demotion',
    run: () => {
      const jonidan: Rank = { division: 'Jonidan', name: '序二段', side: 'East', number: 100 };
      const result = calculateNextRank(
        createBashoRecord(jonidan, 0, 7),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canDemoteToJonokuchi: false } },
      );
      assert.equal(result.nextRank.division, 'Jonidan');
      assert.equal(result.nextRank.name, '序二段');
    },
  },
  {
    name: 'ranking: juryo demotion width deepens with heavier makekoshi',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 14 };
      const mild = calculateNextRank(createBashoRecord(juryo, 7, 8), [], false, () => 0.5);
      const heavy = calculateNextRank(createBashoRecord(juryo, 3, 12), [], false, () => 0.5);
      assert.equal(mild.nextRank.division, 'Makushita');
      assert.equal(heavy.nextRank.division, 'Makushita');
      assert.ok((mild.nextRank.number || 99) < (heavy.nextRank.number || 0));
    },
  },
  {
    name: 'ranking: juryo enemy nudge can change movement by half-rank',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 10 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 8, 7),
        [],
        false,
        () => 0.5,
        { sekitoriQuota: { enemyHalfStepNudge: 1 } },
      );
      assert.equal(result.nextRank.division, 'Juryo');
      assert.equal(result.nextRank.name, '十両');
      assert.equal(result.nextRank.number, 9);
      assert.equal(result.nextRank.side, 'West');
    },
  },
  {
    name: 'ranking: lower-division enemy nudge can change movement by half-rank',
    run: () => {
      const sandanme: Rank = { division: 'Sandanme', name: '三段目', side: 'East', number: 40 };
      const base = calculateNextRank(
        createBashoRecord(sandanme, 4, 3),
        [],
        false,
        () => 0.0,
      );
      const nudged = calculateNextRank(
        createBashoRecord(sandanme, 4, 3),
        [],
        false,
        () => 0.0,
        { lowerDivisionQuota: { enemyHalfStepNudge: 1 } },
      );
      assert.equal(base.nextRank.division, nudged.nextRank.division);
      const baseSlot = ((base.nextRank.number || 1) - 1) * 2 + (base.nextRank.side === 'West' ? 1 : 0);
      const nudgedSlot = ((nudged.nextRank.number || 1) - 1) * 2 + (nudged.nextRank.side === 'West' ? 1 : 0);
      assert.equal(nudgedSlot, baseSlot + 1);
    },
  },
  {
    name: 'ranking: expected slot custom range treats kachikoshi as promotion direction',
    run: () => {
      const kachikoshi = resolveExpectedSlotBand({
        currentSlot: 550,
        wins: 6,
        losses: 1,
        absent: 0,
        totalSlots: 580,
        rankProgress: 0.3,
        slotRangeByWins: {
          6: { min: 80, max: 100, sign: 1 },
        },
      });
      const makekoshi = resolveExpectedSlotBand({
        currentSlot: 550,
        wins: 1,
        losses: 6,
        absent: 0,
        totalSlots: 580,
        rankProgress: 0.7,
        slotRangeByWins: {
          1: { min: 80, max: 100, sign: -1 },
        },
      });
      assert.ok(kachikoshi.expectedSlot < 550, `Expected promotion-direction slot, got ${kachikoshi.expectedSlot}`);
      assert.ok(makekoshi.expectedSlot > 550, `Expected demotion-direction slot, got ${makekoshi.expectedSlot}`);
    },
  },
  {
    name: 'quota: sekitori resolver exposes juryo half-step nudge',
    run: () => {
      const sekitoriWorld = createSekitoriBoundaryWorld(() => 0.5);
      sekitoriWorld.lastPlayerJuryoHalfStepNudge = -1;
      const quota = resolveSekitoriQuotaForPlayer(sekitoriWorld, {
        division: 'Juryo',
        name: '十両',
        side: 'East',
        number: 8,
      });
      assert.equal(quota?.enemyHalfStepNudge, -1);
    },
  },
  {
    name: 'quota: juryo absent is counted as losses for nudge evaluation',
    run: () => {
      const topWorld = createSimulationWorld(() => 0.5);
      topWorld.lastBashoResults.Juryo = [
        {
          id: 'Upper',
          shikona: '上位',
          isPlayer: false,
          stableId: 'j-1',
          rankScore: 9,
          wins: 8,
          losses: 7,
          absent: 0,
        },
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 10,
          wins: 8,
          losses: 7,
          absent: 5,
        },
        {
          id: 'Lower',
          shikona: '下位',
          isPlayer: false,
          stableId: 'j-2',
          rankScore: 11,
          wins: 8,
          losses: 7,
          absent: 0,
        },
      ];

      const sekitoriWorld = createSekitoriBoundaryWorld(() => 0.5);
      runSekitoriQuotaStep(topWorld, sekitoriWorld, () => 0.5);
      const quota = resolveSekitoriQuotaForPlayer(sekitoriWorld, {
        division: 'Juryo',
        name: '十両',
        side: 'East',
        number: 5,
      });
      assert.equal(quota?.enemyHalfStepNudge, 1);
    },
  },
  {
    name: 'quota: lower resolver exposes half-step nudge',
    run: () => {
      const lowerWorld = createLowerDivisionQuotaWorld(() => 0.5);
      lowerWorld.lastPlayerHalfStepNudge.Sandanme = 1;
      const quota = resolveLowerDivisionQuotaForPlayer(lowerWorld, {
        division: 'Sandanme',
        name: '三段目',
        side: 'West',
        number: 20,
      });
      assert.equal(quota?.enemyHalfStepNudge, 1);
    },
  },
  {
    name: 'quota: ms13 7-0 forces juryo promotion slot',
    run: () => {
      const topWorld = createSimulationWorld(() => 0.5);
      topWorld.lastBashoResults.Juryo = Array.from({ length: 28 }, (_, i) => ({
        id: `Juryo-${i}`,
        shikona: `十両${i + 1}`,
        isPlayer: false,
        stableId: `j-${i % 8}`,
        rankScore: i + 1,
        wins: 8,
        losses: 7,
      }));

      const sekitoriWorld = createSekitoriBoundaryWorld(() => 0.5);
      const exchange = runSekitoriQuotaStep(topWorld, sekitoriWorld, () => 0.5, {
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 13 },
        shikona: '試験山',
        wins: 7,
        losses: 0,
        absent: 0,
      });

      assert.equal(exchange.playerPromotedToJuryo, true);
      assert.ok(exchange.slots >= 1);
    },
  },
  {
    name: 'quota: ms1 4-3 forces juryo promotion slot by tsukidashi chain',
    run: () => {
      const topWorld = createSimulationWorld(() => 0.5);
      topWorld.lastBashoResults.Juryo = Array.from({ length: 28 }, (_, i) => ({
        id: `Juryo-${i}`,
        shikona: `十両${i + 1}`,
        isPlayer: false,
        stableId: `j-${i % 8}`,
        rankScore: i + 1,
        wins: 8,
        losses: 7,
      }));

      const sekitoriWorld = createSekitoriBoundaryWorld(() => 0.5);
      const exchange = runSekitoriQuotaStep(topWorld, sekitoriWorld, () => 0.5, {
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 1 },
        shikona: '試験山',
        wins: 4,
        losses: 3,
        absent: 0,
      });

      assert.equal(exchange.playerPromotedToJuryo, true);
      assert.ok(exchange.slots >= 1);
    },
  },
  {
    name: 'quota: sandanme head kachikoshi forces makushita promotion slot',
    run: () => {
      const lowerWorld = createLowerDivisionQuotaWorld(() => 0.5);
      const exchanges = runLowerDivisionQuotaStep(lowerWorld, () => 0.5, {
        rank: { division: 'Sandanme', name: '三段目', side: 'East', number: 1 },
        shikona: '試験山',
        wins: 4,
        losses: 3,
        absent: 0,
      });
      assert.equal(exchanges.MakushitaSandanme.playerPromotedToUpper, true);
      assert.ok(exchanges.MakushitaSandanme.slots >= 1);
    },
  },
  {
    name: 'quota: sekitori boundary keeps at least one slot under neutral records',
    run: () => {
      const topWorld = createSimulationWorld(() => 0.5);
      const sekitoriWorld = createSekitoriBoundaryWorld(() => 0.5);
      const lowerWorld = createLowerDivisionQuotaWorld(() => 0.5, topWorld);

      topWorld.lastBashoResults.Juryo = Array.from({ length: 28 }, (_, i) => ({
        id: `J-neutral-${i + 1}`,
        shikona: `十両中立${i + 1}`,
        isPlayer: false,
        stableId: `j-${i % 8}`,
        rankScore: i + 1,
        wins: 8,
        losses: 7,
        absent: 0,
      }));
      lowerWorld.lastResults.Makushita = Array.from({ length: 120 }, (_, i) => ({
        id: `MS-neutral-${i + 1}`,
        shikona: `幕下中立${i + 1}`,
        isPlayer: false,
        stableId: `ms-${i % 12}`,
        rankScore: i + 1,
        wins: 3,
        losses: 4,
      }));

      const exchange = runSekitoriQuotaStep(
        topWorld,
        sekitoriWorld,
        () => 0.5,
        undefined,
        lowerWorld,
      );
      assert.ok(exchange.slots >= 1, `Expected at least 1 slot, got ${exchange.slots}`);
    },
  },
  {
    name: 'quota: lower boundary keeps at least one slot under neutral records',
    run: () => {
      const spec = LOWER_BOUNDARIES.find((boundary) => boundary.id === 'MakushitaSandanme');
      assert.ok(Boolean(spec), 'Expected MakushitaSandanme boundary spec');
      if (!spec) return;

      const upper = Array.from({ length: 120 }, (_, i) => ({
        id: `MSU-${i + 1}`,
        shikona: `上位${i + 1}`,
        isPlayer: false,
        stableId: `u-${i % 12}`,
        rankScore: i + 1,
        wins: 4,
        losses: 3,
      }));
      const lower = Array.from({ length: 200 }, (_, i) => ({
        id: `SDL-${i + 1}`,
        shikona: `下位${i + 1}`,
        isPlayer: false,
        stableId: `l-${i % 20}`,
        rankScore: i + 1,
        wins: 3,
        losses: 4,
      }));

      const exchange = resolveBoundaryExchange(spec, upper, lower);
      assert.ok(exchange.slots >= 1, `Expected at least 1 slot, got ${exchange.slots}`);
    },
  },
  {
    name: 'quota: lower boundary full-absence player is force-demoted with mandatory reason',
    run: () => {
      const spec = LOWER_BOUNDARIES.find((boundary) => boundary.id === 'MakushitaSandanme');
      assert.ok(Boolean(spec), 'Expected MakushitaSandanme boundary spec');
      if (!spec) return;

      const upper = Array.from({ length: 120 }, (_, i) => ({
        id: i === 119 ? 'PLAYER' : `MSU-ABS-${i + 1}`,
        shikona: i === 119 ? '試験山' : `上位${i + 1}`,
        isPlayer: i === 119,
        stableId: i === 119 ? 'player-heya' : `u-${i % 12}`,
        rankScore: i + 1,
        wins: i === 119 ? 0 : 4,
        losses: i === 119 ? 7 : 3,
      }));
      const lower = Array.from({ length: 200 }, (_, i) => ({
        id: `SDL-ABS-${i + 1}`,
        shikona: `下位${i + 1}`,
        isPlayer: false,
        stableId: `l-${i % 20}`,
        rankScore: i + 1,
        wins: i < 6 ? 6 : 4,
        losses: i < 6 ? 1 : 3,
      }));

      const exchange = resolveBoundaryExchange(spec, upper, lower);
      assert.equal(exchange.playerDemotedToLower, true);
      assert.ok(exchange.demotedToLowerIds.includes('PLAYER'));
      assert.ok(exchange.slots >= 1);
      assert.equal(exchange.reason, 'MANDATORY_ABSENCE_DEMOTION');
    },
  },
  {
    name: 'ranking: makekoshi sets west side',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 7 };
      const result = calculateNextRank(createBashoRecord(juryo, 7, 8), [], false, () => 0.5);
      assert.equal(result.nextRank.side, 'West');
    },
  },
  {
    name: 'ranking: juryo full-absence cannot move up or promote in committee model',
    run: () => {
      const records: BashoRecordSnapshot[] = [
        ...Array.from({ length: 42 }, (_, i) =>
          createSekitoriSnapshot(
            `M${i + 1}`,
            { division: 'Makuuchi', name: '前頭', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          )),
        ...Array.from({ length: 28 }, (_, i) => {
          if (i === 2) {
            return createSekitoriSnapshot(
              'PLAYER',
              { division: 'Juryo', name: '十両', side: 'West', number: 2 },
              0,
              0,
              15,
            );
          }
          return createSekitoriSnapshot(
            `J${i + 1}`,
            { division: 'Juryo', name: '十両', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          );
        }),
      ];
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.ok(Boolean(allocation), 'Expected player allocation');
      assert.equal(allocation?.nextRank.division, 'Juryo');
      assert.ok((allocation?.nextRank.number || 99) >= 2);
    },
  },
  {
    name: 'ranking: maegashira6 8-7 does not overpromote to komusubi',
    run: () => {
      const base: BashoRecordSnapshot[] = [
        ...Array.from({ length: 42 }, (_, i) =>
          createSekitoriSnapshot(
            `M${i + 1}`,
            { division: 'Makuuchi', name: '前頭', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          )),
        ...Array.from({ length: 28 }, (_, i) =>
          createSekitoriSnapshot(
            `J${i + 1}`,
            { division: 'Juryo', name: '十両', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          )),
      ];
      const player = createSekitoriSnapshot(
        'PLAYER',
        { division: 'Makuuchi', name: '前頭', side: 'West', number: 6 },
        8,
        7,
        0,
      );
      const records = base.filter((row) => row.id !== 'M12').concat(player);
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.division, 'Makuuchi');
      assert.equal(allocation?.nextRank.name, '前頭');
      assert.ok((allocation?.nextRank.number || 99) <= 6);
    },
  },
  {
    name: 'ranking: top maegashira 8-7 does not jump into sanyaku',
    run: () => {
      const records = buildNeutralSekitoriRecords().map((row, index) => {
        if (row.id === 'M2') {
          return createSekitoriSnapshot(
            'PLAYER',
            { division: 'Makuuchi', name: '前頭', side: 'West', number: 1 },
            8,
            7,
            0,
          );
        }
        if (index < 8) {
          return createSekitoriSnapshot(
            row.id,
            row.rank,
            5,
            10,
            0,
          );
        }
        return row;
      });
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.division, 'Makuuchi');
      assert.equal(allocation?.nextRank.name, '前頭');
      assert.ok((allocation?.nextRank.number || 99) <= 1);
    },
  },
  {
    name: 'ranking: maegashira15 severe absence makekoshi demotes to juryo in committee',
    run: () => {
      const records: BashoRecordSnapshot[] = [
        ...Array.from({ length: 42 }, (_, i) =>
          createSekitoriSnapshot(
            `M${i + 1}`,
            {
              division: 'Makuuchi',
              name: '前頭',
              side: i % 2 === 0 ? 'East' : 'West',
              number: Math.floor(i / 2) + 1,
            },
            8,
            7,
            0,
          )),
        ...Array.from({ length: 28 }, (_, i) =>
          createSekitoriSnapshot(
            `J${i + 1}`,
            {
              division: 'Juryo',
              name: '十両',
              side: i % 2 === 0 ? 'East' : 'West',
              number: Math.floor(i / 2) + 1,
            },
            i < 8 ? 10 : 8,
            i < 8 ? 5 : 7,
            0,
          )),
      ];
      const player = createSekitoriSnapshot(
        'PLAYER',
        { division: 'Makuuchi', name: '前頭', side: 'West', number: 15 },
        1,
        6,
        8,
      );
      const replaced = records.filter((row) => row.id !== 'M30').concat(player);
      const allocation = generateNextBanzuke(replaced).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.division, 'Juryo');
    },
  },
  {
    name: 'ranking: komusubi 7-8 stays in upper maegashira lane',
    run: () => {
      const base: BashoRecordSnapshot[] = [
        ...Array.from({ length: 42 }, (_, i) =>
          createSekitoriSnapshot(
            `M${i + 1}`,
            { division: 'Makuuchi', name: '前頭', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          )),
        ...Array.from({ length: 28 }, (_, i) =>
          createSekitoriSnapshot(
            `J${i + 1}`,
            { division: 'Juryo', name: '十両', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          )),
      ];
      const player = createSekitoriSnapshot(
        'PLAYER',
        { division: 'Makuuchi', name: '小結', side: 'West' },
        7,
        8,
        0,
      );
      const records = base.filter((row) => row.id !== 'M8').concat(player);
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.division, 'Makuuchi');
      assert.ok(
        allocation?.nextRank.name === '小結' ||
          (allocation?.nextRank.name === '前頭' && (allocation?.nextRank.number || 99) <= 6),
      );
    },
  },
  {
    name: 'ranking: komusubi 10+ is prioritized to sekiwake in committee',
    run: () => {
      const records: BashoRecordSnapshot[] = [
        ...Array.from({ length: 42 }, (_, i) => {
          if (i === 4) {
            return createSekitoriSnapshot(
              'S1',
              { division: 'Makuuchi', name: '関脇', side: 'East' },
              9,
              6,
              0,
            );
          }
          if (i === 5) {
            return createSekitoriSnapshot(
              'S2',
              { division: 'Makuuchi', name: '関脇', side: 'West' },
              8,
              7,
              0,
            );
          }
          if (i === 6) {
            return createSekitoriSnapshot(
              'PLAYER',
              { division: 'Makuuchi', name: '小結', side: 'West' },
              10,
              5,
              0,
            );
          }
          return createSekitoriSnapshot(
            `M${i + 1}`,
            {
              division: 'Makuuchi',
              name: '前頭',
              side: i % 2 === 0 ? 'East' : 'West',
              number: Math.floor(i / 2) + 1,
            },
            8,
            7,
            0,
          );
        }),
        ...Array.from({ length: 28 }, (_, i) =>
          createSekitoriSnapshot(
            `J${i + 1}`,
            { division: 'Juryo', name: '十両', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          )),
      ];
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.division, 'Makuuchi');
      assert.equal(allocation?.nextRank.name, '関脇');
    },
  },
  {
    name: 'ranking: komusubi 9-6 can fill open sekiwake slot before maegashira',
    run: () => {
      const records: BashoRecordSnapshot[] = [
        ...Array.from({ length: 42 }, (_, i) => {
          if (i === 4) {
            return createSekitoriSnapshot(
              'SEKIWAKE_E',
              { division: 'Makuuchi', name: '関脇', side: 'East' },
              8,
              7,
              0,
            );
          }
          if (i === 5) {
            return createSekitoriSnapshot(
              'SEKIWAKE_W',
              { division: 'Makuuchi', name: '関脇', side: 'West' },
              5,
              10,
              0,
            );
          }
          if (i === 6) {
            return createSekitoriSnapshot(
              'PLAYER',
              { division: 'Makuuchi', name: '小結', side: 'West' },
              9,
              6,
              0,
            );
          }
          return createSekitoriSnapshot(
            `M${i + 1}`,
            {
              division: 'Makuuchi',
              name: '前頭',
              side: i % 2 === 0 ? 'East' : 'West',
              number: Math.floor(i / 2) + 1,
            },
            8,
            7,
            0,
          );
        }),
        ...Array.from({ length: 28 }, (_, i) =>
          createSekitoriSnapshot(
            `J${i + 1}`,
            { division: 'Juryo', name: '十両', side: i % 2 === 0 ? 'East' : 'West', number: Math.floor(i / 2) + 1 },
            8,
            7,
            0,
          )),
      ];
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.division, 'Makuuchi');
      assert.equal(allocation?.nextRank.name, '関脇');
    },
  },
  {
    name: 'ranking: komusubi 9-6 can be expanded to sekiwake even when both sekiwake are kachikoshi',
    run: () => {
      const records = buildNeutralSekitoriRecords().map((row) => {
        if (row.id === 'M1') {
          return createSekitoriSnapshot('SEKIWAKE_E', { division: 'Makuuchi', name: '関脇', side: 'East' }, 11, 4, 0);
        }
        if (row.id === 'M2') {
          return createSekitoriSnapshot('SEKIWAKE_W', { division: 'Makuuchi', name: '関脇', side: 'West' }, 10, 5, 0);
        }
        if (row.id === 'M3') {
          return createSekitoriSnapshot('KOMUSUBI_E', { division: 'Makuuchi', name: '小結', side: 'East' }, 10, 5, 0);
        }
        if (row.id === 'M4') {
          return createSekitoriSnapshot('PLAYER', { division: 'Makuuchi', name: '小結', side: 'West' }, 9, 6, 0);
        }
        return row;
      });
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.division, 'Makuuchi');
      assert.equal(allocation?.nextRank.name, '関脇');
    },
  },
  {
    name: 'ranking: maegashira2 9-6 does not pass strict sanyaku gate',
    run: () => {
      const records = buildNeutralSekitoriRecords().map((row) => {
        if (row.id === 'M1') {
          return createSekitoriSnapshot('S1', { division: 'Makuuchi', name: '関脇', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M2') {
          return createSekitoriSnapshot('S2', { division: 'Makuuchi', name: '関脇', side: 'West' }, 8, 7, 0);
        }
        if (row.id === 'M3') {
          return createSekitoriSnapshot('PLAYER', { division: 'Makuuchi', name: '前頭', side: 'East', number: 2 }, 9, 6, 0);
        }
        if (row.id === 'M4') {
          return createSekitoriSnapshot('K1', { division: 'Makuuchi', name: '小結', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M5') {
          return createSekitoriSnapshot('K2', { division: 'Makuuchi', name: '小結', side: 'West' }, 8, 7, 0);
        }
        return row;
      });
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.ok(allocation?.nextRank.name !== '関脇');
      assert.ok(allocation?.nextRank.name !== '小結');
    },
  },
  {
    name: 'ranking: maegashira2 10-5 can be promoted to komusubi by strict gate',
    run: () => {
      const records = buildNeutralSekitoriRecords().map((row) => {
        if (row.id === 'M1') {
          return createSekitoriSnapshot('S1', { division: 'Makuuchi', name: '関脇', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M2') {
          return createSekitoriSnapshot('S2', { division: 'Makuuchi', name: '関脇', side: 'West' }, 8, 7, 0);
        }
        if (row.id === 'M3') {
          return createSekitoriSnapshot('PLAYER', { division: 'Makuuchi', name: '前頭', side: 'East', number: 2 }, 10, 5, 0);
        }
        if (row.id === 'M4') {
          return createSekitoriSnapshot('K1', { division: 'Makuuchi', name: '小結', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M5') {
          return createSekitoriSnapshot('K2', { division: 'Makuuchi', name: '小結', side: 'West' }, 4, 11, 0);
        }
        return row;
      });
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.name, '小結');
    },
  },
  {
    name: 'ranking: maegashira2 11-4 can be promoted to sekiwake by strict gate',
    run: () => {
      const records = buildNeutralSekitoriRecords().map((row) => {
        if (row.id === 'M1') {
          return createSekitoriSnapshot('S1', { division: 'Makuuchi', name: '関脇', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M2') {
          return createSekitoriSnapshot('S2', { division: 'Makuuchi', name: '関脇', side: 'West' }, 4, 11, 0);
        }
        if (row.id === 'M3') {
          return createSekitoriSnapshot('PLAYER', { division: 'Makuuchi', name: '前頭', side: 'East', number: 2 }, 11, 4, 0);
        }
        if (row.id === 'M4') {
          return createSekitoriSnapshot('K1', { division: 'Makuuchi', name: '小結', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M5') {
          return createSekitoriSnapshot('K2', { division: 'Makuuchi', name: '小結', side: 'West' }, 8, 7, 0);
        }
        return row;
      });
      const allocation = generateNextBanzuke(records).find((row) => row.id === 'PLAYER');
      assert.equal(allocation?.nextRank.name, '関脇');
    },
  },
  {
    name: 'ranking: sekiwake count does not exceed cap in normal case',
    run: () => {
      const records = buildNeutralSekitoriRecords().map((row) => {
        if (row.id === 'M1') {
          return createSekitoriSnapshot('S1', { division: 'Makuuchi', name: '関脇', side: 'East' }, 5, 10, 0);
        }
        if (row.id === 'M2') {
          return createSekitoriSnapshot('S2', { division: 'Makuuchi', name: '関脇', side: 'West' }, 5, 10, 0);
        }
        if (row.id === 'M3') {
          return createSekitoriSnapshot('K1', { division: 'Makuuchi', name: '小結', side: 'East', number: 1 }, 9, 6, 0);
        }
        if (row.id === 'M4') {
          return createSekitoriSnapshot('K2', { division: 'Makuuchi', name: '小結', side: 'West', number: 1 }, 9, 6, 0);
        }
        if (row.id === 'M5') {
          return createSekitoriSnapshot('K3', { division: 'Makuuchi', name: '小結', side: 'East', number: 2 }, 9, 6, 0);
        }
        if (row.id === 'M6') {
          return createSekitoriSnapshot('K4', { division: 'Makuuchi', name: '小結', side: 'West', number: 2 }, 9, 6, 0);
        }
        if (row.id === 'M7') {
          return createSekitoriSnapshot('M1E', { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 }, 11, 4, 0);
        }
        if (row.id === 'M8') {
          return createSekitoriSnapshot('M1W', { division: 'Makuuchi', name: '前頭', side: 'West', number: 1 }, 11, 4, 0);
        }
        return row;
      });
      const allocations = generateNextBanzuke(records);
      const sekiwakeCount = allocations.filter((row) => row.nextRank.division === 'Makuuchi' && row.nextRank.name === '関脇').length;
      assert.ok(sekiwakeCount <= 5, `Expected <=5 sekiwake, got ${sekiwakeCount}`);
    },
  },
  {
    name: 'ranking: komusubi count does not exceed cap in normal case',
    run: () => {
      const records = buildNeutralSekitoriRecords().map((row) => {
        if (row.id === 'M1') {
          return createSekitoriSnapshot('S1', { division: 'Makuuchi', name: '関脇', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M2') {
          return createSekitoriSnapshot('S2', { division: 'Makuuchi', name: '関脇', side: 'West' }, 8, 7, 0);
        }
        if (row.id === 'M3') {
          return createSekitoriSnapshot('K1', { division: 'Makuuchi', name: '小結', side: 'East' }, 8, 7, 0);
        }
        if (row.id === 'M4') {
          return createSekitoriSnapshot('K2', { division: 'Makuuchi', name: '小結', side: 'West' }, 8, 7, 0);
        }
        if (row.id === 'M5') {
          return createSekitoriSnapshot('M1E', { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 }, 10, 5, 0);
        }
        if (row.id === 'M6') {
          return createSekitoriSnapshot('M1W', { division: 'Makuuchi', name: '前頭', side: 'West', number: 1 }, 10, 5, 0);
        }
        if (row.id === 'M7') {
          return createSekitoriSnapshot('M2E', { division: 'Makuuchi', name: '前頭', side: 'East', number: 2 }, 10, 5, 0);
        }
        if (row.id === 'M8') {
          return createSekitoriSnapshot('M2W', { division: 'Makuuchi', name: '前頭', side: 'West', number: 2 }, 10, 5, 0);
        }
        return row;
      });
      const allocations = generateNextBanzuke(records);
      const komusubiCount = allocations.filter((row) => row.nextRank.division === 'Makuuchi' && row.nextRank.name === '小結').length;
      assert.ok(komusubiCount <= 4, `Expected <=4 komusubi, got ${komusubiCount}`);
    },
  },
  {
    name: 'ranking: forced sekiwake overflow is temporary and compressed next basho',
    run: () => {
      const round1: BashoRecordSnapshot[] = [
        createSekitoriSnapshot('K1E', { division: 'Makuuchi', name: '小結', side: 'East', number: 1 }, 10, 5, 0),
        createSekitoriSnapshot('K1W', { division: 'Makuuchi', name: '小結', side: 'West', number: 1 }, 10, 5, 0),
        createSekitoriSnapshot('K2E', { division: 'Makuuchi', name: '小結', side: 'East', number: 2 }, 10, 5, 0),
        createSekitoriSnapshot('K2W', { division: 'Makuuchi', name: '小結', side: 'West', number: 2 }, 10, 5, 0),
        createSekitoriSnapshot('K3E', { division: 'Makuuchi', name: '小結', side: 'East', number: 3 }, 10, 5, 0),
        createSekitoriSnapshot('K3W', { division: 'Makuuchi', name: '小結', side: 'West', number: 3 }, 10, 5, 0),
        ...buildNeutralSekitoriRecords().filter((row) => !['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].includes(row.id)),
      ];
      const allocations1 = generateNextBanzuke(round1);
      const sekiwakeCount1 = allocations1.filter((row) => row.nextRank.division === 'Makuuchi' && row.nextRank.name === '関脇').length;
      assert.ok(sekiwakeCount1 >= 6, `Expected forced overflow sekiwake >=6, got ${sekiwakeCount1}`);

      const round2 = allocations1.map((allocation) =>
        createSekitoriSnapshot(
          allocation.id,
          allocation.nextRank,
          8,
          7,
          0,
        ));
      const allocations2 = generateNextBanzuke(round2);
      const sekiwakeCount2 = allocations2.filter((row) => row.nextRank.division === 'Makuuchi' && row.nextRank.name === '関脇').length;
      assert.ok(sekiwakeCount2 <= 5, `Expected compressed sekiwake <=5, got ${sekiwakeCount2}`);
    },
  },
  {
    name: 'ranking: juryo11 full absence equals full losses when quota demotes',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 11 };
      const absent = calculateNextRank(
        createBashoRecord(juryo, 0, 0, 15),
        [],
        false,
        () => 0.5,
        { sekitoriQuota: { canDemoteToMakushita: true } },
      );
      const losses = calculateNextRank(
        createBashoRecord(juryo, 0, 15, 0),
        [],
        false,
        () => 0.5,
        { sekitoriQuota: { canDemoteToMakushita: true } },
      );
      assert.equal(absent.nextRank.division, losses.nextRank.division);
      assert.equal(absent.nextRank.number, losses.nextRank.number);
    },
  },
  {
    name: 'ranking: sekitori full absence uses fixed -15-rank band',
    run: () => {
      const m = resolveSekitoriDeltaBand({
        id: 'M',
        shikona: '幕内',
        rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 12 },
        wins: 0,
        losses: 0,
        absent: 15,
      });
      const j = resolveSekitoriDeltaBand({
        id: 'J',
        shikona: '十両',
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 5 },
        wins: 0,
        losses: 0,
        absent: 15,
      });
      assert.equal(m.minSlotDelta, -30);
      assert.equal(m.maxSlotDelta, -30);
      assert.equal(j.minSlotDelta, -30);
      assert.equal(j.maxSlotDelta, -30);
    },
  },
  {
    name: 'ranking: makushita10 full absence equals full losses with deeper width',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 10 };
      const absent = calculateNextRank(createBashoRecord(makushita, 0, 0, 7), [], false, () => 0.5);
      const losses = calculateNextRank(createBashoRecord(makushita, 0, 7, 0), [], false, () => 0.5);
      assert.ok(['Makushita', 'Sandanme'].includes(absent.nextRank.division));
      if (absent.nextRank.division === 'Makushita') {
        assert.ok((absent.nextRank.number || 0) >= 50);
      } else {
        assert.ok((absent.nextRank.number || 0) >= 1);
      }
      assert.equal(absent.nextRank.division, losses.nextRank.division);
      assert.equal(absent.nextRank.number, losses.nextRank.number);
    },
  },
  {
    name: 'quota: strong juryo leader is evaluated by relative model',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastBashoResults.Makuuchi = Array.from({ length: 42 }, (_, i) => ({
        id: `Makuuchi-${i}`,
        shikona: `幕内${i + 1}`,
        isPlayer: false,
        stableId: `m-${i % 8}`,
        rankScore: i + 1,
        wins: 10,
        losses: 5,
      }));
      world.lastBashoResults.Juryo = Array.from({ length: 28 }, (_, i) => ({
        id: i === 0 ? 'PLAYER' : `Juryo-${i}`,
        shikona: i === 0 ? '試験山' : `十両${i}`,
        isPlayer: i === 0,
        stableId: i === 0 ? 'player-heya' : `j-${i % 8}`,
        rankScore: i + 1,
        wins: i === 0 ? 9 : 7,
        losses: i === 0 ? 6 : 8,
      }));

      advanceTopDivisionBanzuke(world);
      assert.equal(world.lastExchange.playerPromotedToMakuuchi, false);
      assert.equal(world.lastExchange.playerDemotedToJuryo, false);
      assert.equal(world.lastExchange.slots, 0);
      assertRank(
        world.lastPlayerAssignedRank,
        { division: 'Juryo', name: '十両', side: 'East', number: 1 },
        'assigned rank for juryo leader',
      );
      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Juryo',
        name: '十両',
        side: 'East',
        number: 1,
      });
      assert.equal(quota?.canPromoteToMakuuchi, false);
      assert.equal(quota?.assignedNextRank, undefined);
    },
  },
  {
    name: 'quota: makuuchi player receives assigned komusubi rank from global composition',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastBashoResults.Makuuchi = Array.from({ length: 42 }, (_, i) => ({
        id: i === 11 ? 'PLAYER' : `Makuuchi-${i}`,
        shikona: i === 11 ? '試験山' : `幕内${i + 1}`,
        isPlayer: i === 11,
        stableId: i === 11 ? 'player-heya' : `m-${i % 8}`,
        rankScore: i + 1,
        wins: i === 0 ? 14 : i === 1 ? 13 : i === 4 ? 11 : i === 5 ? 10 : i === 11 ? 10 : 8,
        losses: i === 0 ? 1 : i === 1 ? 2 : i === 4 ? 4 : i === 5 ? 5 : i === 11 ? 5 : 7,
      }));
      world.lastBashoResults.Juryo = Array.from({ length: 28 }, (_, i) => ({
        id: `Juryo-${i}`,
        shikona: `十両${i + 1}`,
        isPlayer: false,
        stableId: `j-${i % 8}`,
        rankScore: i + 1,
        wins: 8,
        losses: 7,
      }));

      advanceTopDivisionBanzuke(world);
      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 2,
      });
      assert.ok(
        ['関脇', '小結'].includes(quota?.assignedNextRank?.name || ''),
        'Expected assigned sanyaku rank for player',
      );
      assert.equal(
        quota?.enforcedSanyaku,
        quota?.assignedNextRank?.name === '関脇' ? 'Sekiwake' : 'Komusubi',
      );
    },
  },
  {
    name: 'ranking: makekoshi ignores upward assigned top-division rank',
    run: () => {
      const maegashira: Rank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 5 };
      const result = calculateNextRank(
        createBashoRecord(maegashira, 6, 9),
        [],
        false,
        () => 0.5,
        {
          topDivisionQuota: {
            assignedNextRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 2 },
          },
        },
      );
      assert.equal(result.nextRank.division, 'Makuuchi');
      assert.equal(result.nextRank.name, '前頭');
      assert.equal(result.nextRank.number, 6);
      assert.equal(result.nextRank.side, 'West');
    },
  },
  {
    name: 'ranking: boundary assigned rank overrides lower-division movement',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 48 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 1, 6),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Sandanme', name: '三段目', side: 'East', number: 12 },
        },
      );
      assert.equal(result.nextRank.division, 'Sandanme');
      assert.equal(result.nextRank.name, '三段目');
      assert.equal(result.nextRank.number, 12);
    },
  },
  {
    name: 'ranking: sekitori assigned rank overrides default juryo demotion width',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'West', number: 14 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 0, 0, 15),
        [],
        false,
        () => 0.5,
        {
          sekitoriQuota: {
            canDemoteToMakushita: true,
            assignedNextRank: { division: 'Makushita', name: '幕下', side: 'East', number: 3 },
          },
        },
      );
      assert.equal(result.nextRank.division, 'Makushita');
      assert.equal(result.nextRank.name, '幕下');
      assert.equal(result.nextRank.number, 3);
    },
  },
  {
    name: 'ranking: full absence applies assigned top-division rank consistently',
    run: () => {
      const maegashira: Rank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 11 };
      const result = calculateNextRank(
        createBashoRecord(maegashira, 0, 0, 15),
        [],
        false,
        () => 0.5,
        {
          topDivisionQuota: {
            canDemoteToJuryo: false,
            assignedNextRank: { division: 'Makuuchi', name: '前頭', side: 'West', number: 11 },
          },
        },
      );
      assert.equal(result.nextRank.division, 'Makuuchi');
      assert.equal(result.nextRank.name, '前頭');
      assert.equal(result.nextRank.number, 11);
    },
  },
  {
    name: 'ranking: makekoshi ignores same-division lower boundary assignment',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'West', number: 59 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 2, 5),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Makushita', name: '幕下', side: 'East', number: 58 },
        },
      );
      if (result.nextRank.division === 'Makushita') {
        assert.ok((result.nextRank.number ?? 0) >= 59, 'Makekoshi should not move upward in makushita');
      } else {
        assert.equal(result.nextRank.division, 'Sandanme');
      }
    },
  },
  {
    name: 'ranking: makekoshi lower boundary assignment still cannot stay at same rank',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'West', number: 59 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 3, 4),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Makushita', name: '幕下', side: 'West', number: 59 },
        },
      );
      if (result.nextRank.division === 'Makushita') {
        assert.ok((result.nextRank.number ?? 0) >= 59, 'Makekoshi should not improve rank');
      } else {
        assert.equal(result.nextRank.division, 'Sandanme');
      }
    },
  },
  {
    name: 'ranking: makekoshi juryo assignment cannot move upward',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'West', number: 10 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 5, 10),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Juryo', name: '十両', side: 'East', number: 9 },
        },
      );
      if (result.nextRank.division === 'Juryo') {
        assert.ok((result.nextRank.number ?? 0) >= 10, 'Makekoshi should not improve juryo number');
      } else {
        assert.equal(result.nextRank.division, 'Makushita');
      }
    },
  },
  {
    name: 'ranking: kachikoshi ignores same-division sekitori assignment demotion',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'West', number: 2 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 8, 7),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Juryo', name: '十両', side: 'East', number: 4 },
        },
      );
      assert.equal(result.nextRank.division, 'Juryo');
      assert.ok((result.nextRank.number ?? 99) <= 2, 'Kachikoshi should not be demoted in juryo');
    },
  },
  {
    name: 'ranking: juryo demotion to makushita is capped to calibrated depth',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'East', number: 14 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 6, 9),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Makushita', name: '幕下', side: 'East', number: 57 },
        },
      );
      assert.equal(result.nextRank.division, 'Makushita');
      assert.ok((result.nextRank.number ?? 999) <= 10, 'Demotion depth should stay in upper makushita zone');
    },
  },
  {
    name: 'quota: lower committee full absence applies deep demotion floor',
    run: () => {
      const results = {
        Makushita: [
          {
            id: 'PLAYER',
            shikona: '試験山',
            isPlayer: true,
            stableId: 'player-heya',
            rankScore: 93, // 幕下47枚目東
            wins: 0,
            losses: 7,
          } satisfies LowerBoundarySnapshot,
        ],
        Sandanme: [] as LowerBoundarySnapshot[],
        Jonidan: [] as LowerBoundarySnapshot[],
        Jonokuchi: [] as LowerBoundarySnapshot[],
      };
      const exchanges = {
        MakushitaSandanme: { ...EMPTY_LOWER_EXCHANGE },
        SandanmeJonidan: { ...EMPTY_LOWER_EXCHANGE },
        JonidanJonokuchi: { ...EMPTY_LOWER_EXCHANGE },
      };
      const assigned = resolveLowerAssignedNextRank(results, exchanges, {
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 47 },
        shikona: '試験山',
        wins: 0,
        losses: 0,
        absent: 7,
      });
      assert.ok(Boolean(assigned), 'Expected assigned lower rank');
      assert.equal(assigned?.division, 'Sandanme');
    },
  },
  {
    name: 'quota: assigned juryo promotion rank is normalized to maegashira band',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 1,
        promotedToMakuuchiIds: ['PLAYER'],
        demotedToJuryoIds: ['Makuuchi-41'],
        playerPromotedToMakuuchi: true,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '小結', side: 'East' };
      world.lastBashoResults.Juryo = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 3,
          wins: 11,
          losses: 4,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Juryo',
        name: '十両',
        side: 'East',
        number: 2,
      });
      assert.equal(quota?.assignedNextRank?.division, 'Makuuchi');
      assert.equal(quota?.assignedNextRank?.name, '前頭');
      assert.equal(quota?.assignedNextRank?.number, 15);
    },
  },
  {
    name: 'quota: dominant juryo yusho lane shifts by upper-lane pressure',
    run: () => {
      const buildWorld = (wins: number, losses: number) => {
        const world = createSimulationWorld(() => 0.5);
        world.lastExchange = {
          slots: 1,
          promotedToMakuuchiIds: ['PLAYER'],
          demotedToJuryoIds: ['Makuuchi-41'],
          playerPromotedToMakuuchi: true,
          playerDemotedToJuryo: false,
        };
        world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '小結', side: 'East' };
        world.lastBashoResults.Juryo = [
          {
            id: 'PLAYER',
            shikona: '試験山',
            isPlayer: true,
            stableId: 'player-heya',
            rankScore: 4, // 西十両2
            wins: 15,
            losses: 0,
          },
        ];
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

      const highPressureQuota = resolveTopDivisionQuotaForPlayer(
        buildWorld(5, 10),
        { division: 'Juryo', name: '十両', side: 'West', number: 2 },
      );
      const lowPressureQuota = resolveTopDivisionQuotaForPlayer(
        buildWorld(10, 5),
        { division: 'Juryo', name: '十両', side: 'West', number: 2 },
      );

      assert.equal(highPressureQuota?.assignedNextRank?.name, '前頭');
      assert.equal(lowPressureQuota?.assignedNextRank?.name, '前頭');
      assert.ok((highPressureQuota?.assignedNextRank?.number || 99) <= 10);
      assert.ok((lowPressureQuota?.assignedNextRank?.number || 0) >= 10);
      assert.ok(
        (highPressureQuota?.assignedNextRank?.number || 99) < (lowPressureQuota?.assignedNextRank?.number || 99),
      );
    },
  },
  {
    name: 'quota: komusubi 7-8 cannot be normalized below maegashira6',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 11 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 7,
          wins: 7,
          losses: 8,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '小結',
        side: 'East',
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
        'normalized komusubi7-8 rank',
      );
    },
  },
  {
    name: 'quota: maegashira 8-7 jump is capped to realistic width',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'East', number: 3 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 27,
          wins: 8,
          losses: 7,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 10,
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 9 },
        'normalized maegashira8-7 rank',
      );
    },
  },
  {
    name: 'quota: maegashira8 8-7 varies by upper-lane pressure',
    run: () => {
      const buildWorld = (wins: number, losses: number) => {
        const world = createSimulationWorld(() => 0.5);
        world.lastExchange = {
          slots: 0,
          promotedToMakuuchiIds: [],
          demotedToJuryoIds: [],
          playerPromotedToMakuuchi: false,
          playerDemotedToJuryo: false,
        };
        world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 7 };
        world.lastBashoResults.Makuuchi = [
          {
            id: 'PLAYER',
            shikona: '試験山',
            isPlayer: true,
            stableId: 'player-heya',
            rankScore: 23, // 東前頭8
            wins: 8,
            losses: 7,
          },
          ...Array.from({ length: 12 }, (_, i) => ({
            id: `NPC-${i + 1}`,
            shikona: `NPC-${i + 1}`,
            isPlayer: false,
            stableId: 'npc',
            rankScore: i + 1,
            wins,
            losses,
          })),
        ];
        return world;
      };

      const highPressureQuota = resolveTopDivisionQuotaForPlayer(
        buildWorld(5, 10),
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 8 },
      );
      const lowPressureQuota = resolveTopDivisionQuotaForPlayer(
        buildWorld(10, 5),
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 8 },
      );

      assert.equal(highPressureQuota?.assignedNextRank?.name, '前頭');
      assert.equal(lowPressureQuota?.assignedNextRank?.name, '前頭');
      assert.ok(
        (highPressureQuota?.assignedNextRank?.number || 99) < (lowPressureQuota?.assignedNextRank?.number || 99),
      );
    },
  },
  {
    name: 'quota: maegashira1 7-8 stays above maegashira8 9-6 lane',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 6 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 9, // 東前頭1
          wins: 7,
          losses: 8,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 1,
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 2 },
        'normalized maegashira1-7-8 rank',
      );
    },
  },
  {
    name: 'quota: maegashira8 9-6 does not jump above maegashira4',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 23, // 東前頭8
          wins: 9,
          losses: 6,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 8,
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 5 },
        'normalized maegashira8-9-6 rank',
      );
    },
  },
  {
    name: 'quota: top maegashira 8-7 does not cross into sanyaku',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '小結', side: 'West' };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 9, // 東前頭1
          wins: 8,
          losses: 7,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 1,
      });
      assert.equal(quota?.assignedNextRank?.division, 'Makuuchi');
      assert.equal(quota?.assignedNextRank?.name, '前頭');
      assert.equal(quota?.assignedNextRank?.number, 1);
    },
  },
  {
    name: 'quota: slight kachikoshi can move half-rank by east-west slot',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      // 全体編成結果が「西前頭9」（= 東前頭10から半枚上）だったケースを想定。
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 9 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 27, // 東前頭10
          wins: 8,
          losses: 7,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 10,
      });
      assert.equal(quota?.assignedNextRank?.name, '前頭');
      assert.equal(quota?.assignedNextRank?.number, 9);
      assert.equal(quota?.assignedNextRank?.side, 'West');
    },
  },
  {
    name: 'quota: slight kachikoshi in komusubi can rise by half-rank to sekiwake',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '関脇', side: 'West' };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 7, // 東小結
          wins: 8,
          losses: 7,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '小結',
        side: 'East',
      });
      assert.equal(quota?.assignedNextRank?.name, '関脇');
      assert.equal(quota?.assignedNextRank?.side, 'West');
    },
  },
  {
    name: 'quota: slight makekoshi in sekiwake can fall to komusubi by half-rank',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '小結', side: 'East' };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 5, // 東関脇
          wins: 7,
          losses: 8,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '関脇',
        side: 'East',
      });
      assert.equal(quota?.assignedNextRank?.name, '小結');
      assert.equal(quota?.assignedNextRank?.side, 'East');
    },
  },
  {
    name: 'quota: maegashira13 heavy makekoshi can demote below maegashira13',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 16 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 33, // 東前頭13
          wins: 5,
          losses: 10,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 13,
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'West', number: 17 },
        'normalized maegashira13-5-10 rank',
      );
    },
  },
  {
    name: 'quota: makekoshi maegashira is not promoted to sanyaku',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '小結', side: 'East' };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 23, // 東前頭8
          wins: 7,
          losses: 8,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 8,
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 9 },
        'normalized makekoshi-maegashira rank',
      );
    },
  },
  {
    name: 'quota: heavy makekoshi in maegashira is never kept at same rank',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'West', number: 6 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 20,
          wins: 4,
          losses: 11,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'West',
        number: 6,
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 16 },
        'normalized heavy-makekoshi rank',
      );
    },
  },
  {
    name: 'quota: very heavy makekoshi in maegashira gets deep demotion width',
    run: () => {
      const world = createSimulationWorld(() => 0.5);
      world.lastExchange = {
        slots: 0,
        promotedToMakuuchiIds: [],
        demotedToJuryoIds: [],
        playerPromotedToMakuuchi: false,
        playerDemotedToJuryo: false,
      };
      world.lastPlayerAssignedRank = { division: 'Makuuchi', name: '前頭', side: 'East', number: 8 };
      world.lastBashoResults.Makuuchi = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 17, // 東前頭5
          wins: 1,
          losses: 14,
        },
      ];

      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Makuuchi',
        name: '前頭',
        side: 'East',
        number: 5,
      });
      assertRank(
        quota?.assignedNextRank,
        { division: 'Makuuchi', name: '前頭', side: 'West', number: 14 },
        'normalized very-heavy-makekoshi rank',
      );
    },
  },
  {
    name: 'ranking: sandanme 7-0 gains large promotion width',
    run: () => {
      const sandanme: Rank = { division: 'Sandanme', name: '三段目', side: 'East', number: 80 };
      const result = calculateNextRank(createBashoRecord(sandanme, 7, 0), [], false, () => 0.0);
      assert.ok(['Makushita', 'Sandanme'].includes(result.nextRank.division));
      if (result.nextRank.division === 'Makushita') {
        assert.ok((result.nextRank.number || 999) <= 55, 'Expected promotion zone for dominant 7-0');
      } else {
        assert.ok((result.nextRank.number || 999) <= 50, 'Expected large jump within sandanme');
      }
    },
  },
  {
    name: 'ranking: jonidan 0-7 drops with large width',
    run: () => {
      const jonidan: Rank = { division: 'Jonidan', name: '序二段', side: 'East', number: 60 };
      const result = calculateNextRank(createBashoRecord(jonidan, 0, 7), [], false, () => 0.0);
      assert.ok(['Jonidan', 'Jonokuchi'].includes(result.nextRank.division));
      if (result.nextRank.division === 'Jonidan') {
        assert.ok((result.nextRank.number || 0) >= 95);
      } else {
        assert.ok((result.nextRank.number || 0) >= 1);
      }
    },
  },
  {
    name: 'ranking: jonidan 7-0 gets boosted promotion width',
    run: () => {
      const jonidan: Rank = { division: 'Jonidan', name: '序二段', side: 'East', number: 80 };
      const result = calculateNextRank(createBashoRecord(jonidan, 7, 0), [], false, () => 0.0);
      assert.ok(['Sandanme', 'Jonidan'].includes(result.nextRank.division));
      if (result.nextRank.division === 'Sandanme') {
        assert.ok((result.nextRank.number || 999) <= 95);
      } else {
        assert.ok((result.nextRank.number || 999) <= 40);
      }
    },
  },
  {
    name: 'ranking: jonidan 5-2 promotion width is widened',
    run: () => {
      const jonidanRecord = createBashoRecord(
        { division: 'Jonidan', name: '序二段', side: 'East', number: 80 },
        5,
        2,
      );
      const delta = resolveLowerRangeDeltaByScore(jonidanRecord);
      assert.ok(delta >= 9, `Expected widened jonidan delta >= 9, got ${delta}`);
    },
  },
  {
    name: 'ranking: jonokuchi 5-2 promotion width is widened',
    run: () => {
      const jonokuchiRecord = createBashoRecord(
        { division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 25 },
        5,
        2,
      );
      const delta = resolveLowerRangeDeltaByScore(jonokuchiRecord);
      assert.ok(delta >= 10, `Expected widened jonokuchi delta >= 10, got ${delta}`);
    },
  },
  {
    name: 'ranking: makushita 6-1 has strong promotion width',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 30 };
      const result = calculateNextRank(createBashoRecord(makushita, 6, 1), [], false, () => 0.0);
      assert.equal(result.nextRank.division, 'Makushita');
      assert.ok((result.nextRank.number || 999) <= 18);
    },
  },
  {
    name: 'ranking: makushita deep 7-0 jumps into joi-jin zone',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 56 };
      const result = calculateNextRank(createBashoRecord(makushita, 7, 0), [], false, () => 0.0);
      assert.equal(result.nextRank.division, 'Makushita');
      assert.ok((result.nextRank.number || 999) <= 15, '7-0 should reach top-15 zone');
    },
  },
  {
    name: 'ranking: makushita 0-7 has deep demotion width',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 30 };
      const result = calculateNextRank(createBashoRecord(makushita, 0, 7), [], false, () => 0.0);
      assert.ok(['Makushita', 'Sandanme'].includes(result.nextRank.division));
      if (result.nextRank.division === 'Makushita') {
        assert.ok((result.nextRank.number || 0) >= 55);
      } else {
        assert.ok((result.nextRank.number || 0) >= 1);
      }
    },
  },
  {
    name: 'simulation: deterministic with injected dependencies',
    run: async () => {
      const runOnce = async () => {
        const initial = createStatus({
          age: 18,
          entryAge: 18,
          rank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
          history: {
            records: [],
            events: [],
            maxRank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
            totalWins: 0,
            totalLosses: 0,
            totalAbsent: 0,
            yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
            kimariteTotal: {},
          },
        });

        const result = await runSimulation(
          { initialStats: initial, oyakata: null },
          {
            random: lcg(2026),
            getCurrentYear: () => 2020,
            yieldControl: async () => {},
          },
        );
        return summarizeCareer(result);
      };

      const first = await runOnce();
      const second = await runOnce();
      assert.deepEqual(first, second);
    },
  },
  {
    name: 'simulation engine: completed result is sticky after retirement',
    run: async () => {
      const initial = createStatus({
        age: 45,
        entryAge: 18,
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
      });
      const engine = createSimulationEngine(
        { initialStats: initial, oyakata: null },
        {
          random: lcg(2026),
          getCurrentYear: () => 2026,
          yieldControl: async () => {},
        },
      );

      const first = await engine.runNextBasho();
      assert.equal(first.kind, 'COMPLETED');
      if (first.kind !== 'COMPLETED') {
        fail(`Expected COMPLETED on retirement path, got ${first.kind}`);
      }
      assert.equal(first.pauseReason, 'RETIREMENT');
      assert.ok(
        first.events.some((event) => event.type === 'RETIREMENT'),
        'Expected retirement event on first completed step',
      );
      assert.equal(engine.isCompleted(), true);

      const second = await engine.runNextBasho();
      assert.equal(second.kind, 'COMPLETED');
      if (second.kind !== 'COMPLETED') {
        fail(`Expected sticky COMPLETED result, got ${second.kind}`);
      }
      assert.equal(second.events.length, 0);
      assert.equal(second.pauseReason, undefined);
    },
  },
  {
    name: 'wallet: initial balance and regen timing',
    run: async () => {
      await resetDb();
      const atStart = await getWalletState(0);
      assert.equal(atStart.points, 300);
      const at59Sec = await getWalletState(59_000);
      assert.equal(at59Sec.points, 300);
      const at60Sec = await getWalletState(60_000);
      assert.equal(at60Sec.points, 301);
    },
  },
  {
    name: 'wallet: offline regen is capped at max points',
    run: async () => {
      await resetDb();
      await getWalletState(0);
      const longAfter = await getWalletState(60_000 * 600);
      assert.equal(longAfter.points, WALLET_MAX_POINTS);
    },
  },
  {
    name: 'wallet: spend fails when points are insufficient',
    run: async () => {
      await resetDb();
      const spent = await spendWalletPoints(280, 0);
      assert.equal(spent.ok, true);
      const denied = await spendWalletPoints(30, 0);
      assert.equal(denied.ok, false);
    },
  },
  {
    name: 'scout: override cost follows pricing rules',
    run: () => {
      const base = createScoutDraft({
        history: 'HS_GRAD',
        entryDivision: 'Maezumo',
        bodyType: 'NORMAL',
        traitSlots: 2,
      });
      const expanded = resizeTraitSlots(base, 5, () => 0.5);
      const edited = createScoutDraft({
        ...expanded,
        shikona: `${base.shikona}改`,
        profile: {
          realName: `${base.profile.realName}改`,
          birthplace: `${base.profile.birthplace}改`,
          personality: 'AGGRESSIVE',
        },
        bodyType: 'ANKO',
        history: 'UNI_YOKOZUNA',
        entryDivision: 'Sandanme90',
      });
      const cost = resolveScoutOverrideCost(base, edited);
      assert.equal(cost.breakdown.shikona, 10);
      assert.equal(cost.breakdown.realName, 10);
      assert.equal(cost.breakdown.birthplace, 10);
      assert.equal(cost.breakdown.personality, 10);
      assert.equal(cost.breakdown.bodyType, 40);
      assert.equal(cost.breakdown.traitSlots, 100);
      assert.equal(cost.breakdown.history, 50);
      assert.equal(cost.breakdown.tsukedashi, 60);
      assert.equal(cost.total, 290);
    },
  },
  {
    name: 'scout: resize trait slots preserves existing slot drafts and restores from hidden state',
    run: () => {
      const base = createScoutDraft({
        traitSlots: 2,
        traits: ['KYOUSHINZOU', 'RENSHOU_KAIDOU'],
      });
      const baseSlot0 = base.traitSlotDrafts.find((slot) => slot.slotIndex === 0);
      const baseSlot1 = base.traitSlotDrafts.find((slot) => slot.slotIndex === 1);

      const expanded = resizeTraitSlots(base, 4, () => 0.5);
      assert.equal(expanded.traitSlots, 4);
      assert.deepEqual(expanded.traitSlotDrafts.find((slot) => slot.slotIndex === 0), baseSlot0);
      assert.deepEqual(expanded.traitSlotDrafts.find((slot) => slot.slotIndex === 1), baseSlot1);
      assert.equal(expanded.traitSlotDrafts.filter((slot) => slot.slotIndex < 4).length, 4);
      const expandedSlot2 = expanded.traitSlotDrafts.find((slot) => slot.slotIndex === 2);
      assert.ok(Boolean(expandedSlot2), 'Expected newly added slot draft to exist');

      const hidden = resizeTraitSlots(expanded, 0, () => 0.5);
      assert.equal(hidden.traits.length, 0);

      const restored = resizeTraitSlots(hidden, 4, () => 0.5);
      const restoredSlot2 = restored.traitSlotDrafts.find((slot) => slot.slotIndex === 2);
      assert.deepEqual(restoredSlot2, expandedSlot2);
      assert.deepEqual(restored.traits, expanded.traits);
    },
  },
  {
    name: 'scout: selectTraitForSlot rejects duplicate picks and updates active traits',
    run: () => {
      const base = createScoutDraft({
        traitSlots: 2,
        traits: ['KYOUSHINZOU', 'RENSHOU_KAIDOU'],
      });
      const duplicateDenied = selectTraitForSlot(base, 1, 'KYOUSHINZOU');
      const slot1AfterDenied = duplicateDenied.traitSlotDrafts.find((slot) => slot.slotIndex === 1);
      assert.equal(slot1AfterDenied?.selected, 'RENSHOU_KAIDOU');

      const changed = selectTraitForSlot(base, 1, 'THRUST_RUSH');
      const slot1AfterChange = changed.traitSlotDrafts.find((slot) => slot.slotIndex === 1);
      assert.equal(slot1AfterChange?.selected, 'THRUST_RUSH');
      assert.deepEqual(changed.traits, ['KYOUSHINZOU', 'THRUST_RUSH']);
    },
  },
  {
    name: 'scout: trait slot cost follows progressive pricing table',
    run: () => {
      assert.equal(resolveTraitSlotCost(0), 0);
      assert.equal(resolveTraitSlotCost(1), 10);
      assert.equal(resolveTraitSlotCost(2), 25);
      assert.equal(resolveTraitSlotCost(3), 45);
      assert.equal(resolveTraitSlotCost(4), 70);
      assert.equal(resolveTraitSlotCost(5), 100);
    },
  },
  {
    name: 'storage: draft stores career start year-month',
    run: async () => {
      await resetDb();
      const initial = createStatus({
        history: {
          records: [],
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
          totalWins: 0,
          totalLosses: 0,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
        },
      });
      const careerId = await createDraftCareer({
        initialStatus: initial,
        careerStartYearMonth: buildCareerStartYearMonth(2026, 1),
      });
      const raw = await getDb().careers.get(careerId);
      assert.equal(raw?.careerStartYearMonth, '2026-01');
      assert.equal(raw?.careerEndYearMonth, null);
    },
  },
  {
    name: 'storage: completed career stores end year-month and sorts by end date desc',
    run: async () => {
      await resetDb();
      const first = createStatus();
      first.history.events.push({
        year: 2030,
        month: 11,
        type: 'RETIREMENT',
        description: '引退',
      });
      const firstId = await createDraftCareer({
        initialStatus: first,
        careerStartYearMonth: '2026-01',
      });
      await markCareerCompleted(firstId, first);
      await commitCareer(firstId);

      const second = createStatus();
      second.history.events.push({
        year: 2034,
        month: 3,
        type: 'RETIREMENT',
        description: '引退',
      });
      const secondId = await createDraftCareer({
        initialStatus: second,
        careerStartYearMonth: '2028-01',
      });
      await markCareerCompleted(secondId, second);
      await commitCareer(secondId);

      const list = await listCommittedCareers();
      assert.equal(list.length, 2);
      assert.equal(list[0].id, secondId);
      assert.equal(list[0].careerEndYearMonth, '2034-03');
      assert.equal(list[1].id, firstId);
      assert.equal(list[1].careerEndYearMonth, '2030-11');
    },
  },
  {
    name: 'storage: appendBashoChunk stores only player bout details',
    run: async () => {
      await resetDb();
      const initial = createStatus({
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
        history: {
          records: [],
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
          totalWins: 0,
          totalLosses: 0,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
        },
      });
      const careerId = await createDraftCareer({
        initialStatus: initial,
        careerStartYearMonth: '2026-01',
      });
      const engine = createSimulationEngine(
        { initialStats: initial, oyakata: null },
        {
          random: lcg(1234),
          getCurrentYear: () => 2026,
          yieldControl: async () => {},
        },
      );
      const step = expectBashoStep(
        await engine.runNextBasho(),
        'storage: appendBashoChunk stores only player bout details',
      );

      await appendBashoChunk({
        careerId,
        seq: step.seq,
        playerRecord: step.playerRecord,
        playerBouts: step.playerBouts,
        npcRecords: step.npcBashoRecords,
        statusSnapshot: step.statusSnapshot,
      });

      const storedBouts = await getDb().boutRecords.where('[careerId+bashoSeq]').equals([careerId, step.seq]).toArray();
      assert.equal(storedBouts.length, step.playerBouts.length);
      assert.ok(storedBouts.every((bout) => bout.playerDivision.length > 0));
    },
  },
  {
    name: 'storage: appendBashoChunk stores player sansho and kinboshi titles',
    run: async () => {
      await resetDb();
      const initial = createStatus();
      const careerId = await createDraftCareer({
        initialStatus: initial,
        careerStartYearMonth: '2026-01',
      });
      const playerRecord: BashoRecord = {
        year: 2026,
        month: 1,
        rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 3 },
        wins: 11,
        losses: 4,
        absent: 0,
        yusho: false,
        specialPrizes: ['SHUKUN'],
        kinboshi: 2,
      };

      await appendBashoChunk({
        careerId,
        seq: 1,
        playerRecord,
        playerBouts: [],
        npcRecords: [],
        statusSnapshot: initial,
      });

      const row = await getDb().bashoRecords.get([careerId, 1, 'PLAYER']);
      assert.ok(Boolean(row));
      assert.ok((row?.titles ?? []).includes('SHUKUN'));
      assert.ok((row?.titles ?? []).includes('金星x2'));
    },
  },
  {
    name: 'storage: getCareerHeadToHead aggregates by opponent id and uses latest shikona',
    run: async () => {
      await resetDb();
      const initial = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
      });
      const careerId = await createDraftCareer({
        initialStatus: initial,
        careerStartYearMonth: '2026-01',
      });

      await appendBashoChunk({
        careerId,
        seq: 1,
        playerRecord: {
          year: 2026,
          month: 1,
          rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
          wins: 1,
          losses: 1,
          absent: 13,
          yusho: false,
          specialPrizes: [],
        },
        playerBouts: [
          {
            day: 1,
            result: 'WIN',
            opponentId: 'NPC-A',
            opponentShikona: '甲山',
            opponentRankName: '十両',
            opponentRankNumber: 8,
            opponentRankSide: 'West',
          },
          {
            day: 2,
            result: 'LOSS',
            opponentId: 'NPC-B',
            opponentShikona: '乙海',
            opponentRankName: '十両',
            opponentRankNumber: 9,
            opponentRankSide: 'East',
          },
        ],
        npcRecords: [
          {
            entityId: 'NPC-A',
            shikona: '甲山',
            division: 'Juryo',
            rankName: '十両',
            rankNumber: 8,
            rankSide: 'West',
            wins: 8,
            losses: 7,
            absent: 0,
            titles: [],
          },
          {
            entityId: 'NPC-B',
            shikona: '乙海',
            division: 'Juryo',
            rankName: '十両',
            rankNumber: 9,
            rankSide: 'East',
            wins: 7,
            losses: 8,
            absent: 0,
            titles: [],
          },
        ],
        statusSnapshot: initial,
      });

      await appendBashoChunk({
        careerId,
        seq: 2,
        playerRecord: {
          year: 2026,
          month: 3,
          rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
          wins: 0,
          losses: 0,
          absent: 15,
          yusho: false,
          specialPrizes: [],
        },
        playerBouts: [
          {
            day: 1,
            result: 'ABSENT',
            opponentId: 'NPC-A',
            opponentShikona: '旧名甲山',
            opponentRankName: '十両',
            opponentRankNumber: 8,
            opponentRankSide: 'West',
          },
        ],
        npcRecords: [
          {
            entityId: 'NPC-A',
            shikona: '改名甲山',
            division: 'Juryo',
            rankName: '十両',
            rankNumber: 8,
            rankSide: 'West',
            wins: 9,
            losses: 6,
            absent: 0,
            titles: [],
          },
        ],
        statusSnapshot: initial,
      });

      const rows = await getCareerHeadToHead(careerId);
      const byId = new Map(rows.map((row) => [row.opponentId, row]));
      const a = byId.get('NPC-A');
      const b = byId.get('NPC-B');
      assert.ok(Boolean(a));
      assert.ok(Boolean(b));
      if (!a || !b) return;

      assert.equal(a.latestShikona, '改名甲山');
      assert.equal(a.bouts, 2);
      assert.equal(a.wins, 1);
      assert.equal(a.losses, 0);
      assert.equal(a.absences, 1);
      assert.equal(a.firstSeenSeq, 1);
      assert.equal(a.lastSeenSeq, 2);

      assert.equal(b.latestShikona, '乙海');
      assert.equal(b.bouts, 1);
      assert.equal(b.wins, 0);
      assert.equal(b.losses, 1);
      assert.equal(b.absences, 0);
      assert.equal(b.firstSeenSeq, 1);
      assert.equal(b.lastSeenSeq, 1);
    },
  },
  {
    name: 'storage: banzuke population and decision logs are persisted and listed',
    run: async () => {
      await resetDb();
      const careerId = 'career-banzuke-1';
      await appendBanzukePopulation({
        careerId,
        seq: 1,
        year: 2026,
        month: 1,
        headcount: {
          Makuuchi: 42,
          Juryo: 28,
          Makushita: 120,
          Sandanme: 180,
          Jonidan: 196,
          Jonokuchi: 58,
          Maezumo: 12,
        },
        activeHeadcount: {
          Makuuchi: 42,
          Juryo: 28,
          Makushita: 120,
          Sandanme: 180,
          Jonidan: 196,
          Jonokuchi: 58,
          Maezumo: 12,
        },
      });
      await appendBanzukeDecisionLogs([
        {
          careerId,
          seq: 1,
          rikishiId: 'PLAYER',
          fromRank: { division: 'Juryo', name: '十両', side: 'East', number: 14 },
          proposedRank: { division: 'Makushita', name: '幕下', side: 'East', number: 57 },
          finalRank: { division: 'Makushita', name: '幕下', side: 'East', number: 10 },
          reasons: ['REVIEW_CAP_LIGHT_MAKEKOSHI_DEMOTION'],
          votes: [{ judge: 'ConservativeJudge', score: 1.2 }],
        },
      ]);

      const pops = await listBanzukePopulation(careerId);
      const logs = await listBanzukeDecisions(careerId, 1);
      assert.equal(pops.length, 1);
      assert.equal(logs.length, 1);
      assert.equal(pops[0].headcount.Sandanme, 180);
      assert.equal(logs[0].finalRank.number, 10);
    },
  },
  {
    name: 'banzuke: variable headcount flow follows accounting equation with clamp',
    run: () => {
      const next = resolveVariableHeadcountByFlow(
        {
          previous: 40,
          promotedIn: 6,
          demotedIn: 3,
          promotedOut: 8,
          demotedOut: 2,
          retired: 1,
        },
        20,
        140,
      );
      assert.equal(next, 38);

      const clampedMin = resolveVariableHeadcountByFlow(
        {
          previous: 10,
          promotedIn: 0,
          demotedIn: 0,
          promotedOut: 7,
          demotedOut: 2,
          retired: 3,
        },
        20,
        140,
      );
      assert.equal(clampedMin, 20);
    },
  },
  {
    name: 'banzuke: rank scale roundtrip supports variable slot size',
    run: () => {
      const slot = rankNumberSideToSlot(38, 'West', 140);
      const decoded = slotToRankNumberSide(slot, 140);
      assert.equal(decoded.number, 38);
      assert.equal(decoded.side, 'West');
      assert.equal(maxNumber('Jonokuchi', 140), 70);
    },
  },
  {
    name: 'banzuke: review board suppresses kachikoshi demotion and caps light makekoshi depth',
    run: () => {
      const out = composeNextBanzuke({
        careerId: 'case',
        seq: 1,
        year: 2026,
        month: 1,
        mode: 'REPLAY',
        entries: [
          {
            id: 'A',
            currentRank: { division: 'Juryo', name: '十両', side: 'West', number: 2 },
            wins: 8,
            losses: 7,
            absent: 0,
            historyWindow: [],
            replayNextRank: { division: 'Juryo', name: '十両', side: 'East', number: 4 },
          },
          {
            id: 'B',
            currentRank: { division: 'Juryo', name: '十両', side: 'East', number: 14 },
            wins: 6,
            losses: 9,
            absent: 0,
            historyWindow: [],
            replayNextRank: { division: 'Makushita', name: '幕下', side: 'East', number: 57 },
          },
        ],
      });

      const byId = new Map(out.allocations.map((row) => [row.id, row]));
      const a = byId.get('A');
      const b = byId.get('B');
      assert.ok(Boolean(a));
      assert.ok(Boolean(b));
      if (!a || !b) return;
      assert.equal(a.finalRank.division, 'Juryo');
      assert.ok((a.finalRank.number ?? 99) <= 2);
      if (b.finalRank.division === 'Makushita') {
        assert.ok((b.finalRank.number ?? 999) <= 10);
      } else {
        assert.equal(b.finalRank.division, 'Juryo');
      }
    },
  },
  {
    name: 'banzuke: maezumo non-absence stays promotable to jonokuchi in committee compose',
    run: () => {
      const out = composeNextBanzuke({
        careerId: 'case',
        seq: 1,
        year: 2026,
        month: 1,
        mode: 'SIMULATE',
        entries: [
          {
            id: 'PLAYER',
            currentRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
            wins: 0,
            losses: 3,
            absent: 0,
            historyWindow: [],
          },
        ],
      });

      assert.equal(out.allocations.length, 1);
      assert.equal(out.allocations[0].finalRank.division, 'Jonokuchi');
      assert.equal(out.allocations[0].finalRank.name, '序ノ口');
      assert.equal(out.allocations[0].finalRank.number, 20);
      assert.equal(out.warnings.length, 0);
    },
  },
  {
    name: 'simulation: makushita player stores sekitori + same-division npc aggregates',
    run: async () => {
      const initial = createStatus({
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 18 },
        history: {
          records: [],
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', side: 'East', number: 18 },
          totalWins: 0,
          totalLosses: 0,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
        },
      });
      const engine = createSimulationEngine(
        { initialStats: initial, oyakata: null },
        {
          random: lcg(2026),
          getCurrentYear: () => 2026,
          yieldControl: async () => {},
        },
      );
      const step = expectBashoStep(
        await engine.runNextBasho(),
        'simulation: makushita player stores sekitori + same-division npc aggregates',
      );

      const divisions = new Set(step.npcBashoRecords.map((row) => row.division));
      assert.ok(divisions.has('Makuuchi'));
      assert.ok(divisions.has('Juryo'));
      assert.ok(divisions.has('Makushita'));

      const uniqueIds = new Set(step.npcBashoRecords.map((row) => row.entityId));
      assert.equal(uniqueIds.size, step.npcBashoRecords.length);
    },
  },
  {
    name: 'simulation: makuuchi player stores only sekitori npc aggregates',
    run: async () => {
      const initial = createStatus({
        rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 10 },
        history: {
          records: [],
          events: [],
          maxRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 10 },
          totalWins: 0,
          totalLosses: 0,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
        },
      });
      const engine = createSimulationEngine(
        { initialStats: initial, oyakata: null },
        {
          random: lcg(99),
          getCurrentYear: () => 2026,
          yieldControl: async () => {},
        },
      );
      const step = expectBashoStep(
        await engine.runNextBasho(),
        'simulation: makuuchi player stores only sekitori npc aggregates',
      );

      const divisions = new Set(step.npcBashoRecords.map((row) => row.division));
      assert.ok(divisions.has('Makuuchi'));
      assert.ok(divisions.has('Juryo'));
      assert.ok(!divisions.has('Makushita'));
      assert.ok(!divisions.has('Sandanme'));
      assert.ok(!divisions.has('Jonidan'));
      assert.ok(!divisions.has('Jonokuchi'));
    },
  },
  {
    name: 'simulation: sekitori roster sizes stay fixed at 42/28 across basho progression',
    run: async () => {
      const initial = createStatus({
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
        history: {
          records: [],
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
          totalWins: 0,
          totalLosses: 0,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
        },
      });
      const engine = createSimulationEngine(
        { initialStats: initial, oyakata: null },
        {
          random: lcg(1),
          getCurrentYear: () => 2026,
          yieldControl: async () => {},
        },
      );

      for (let i = 0; i < 40; i += 1) {
        const step = expectBashoStep(
          await engine.runNextBasho(),
          `simulation roster size progression loop #${i + 1}`,
        );
        assert.equal(step.progress.makuuchi.length, 42);
        assert.equal(step.progress.juryo.length, 28);
        assert.equal(step.progress.makuuchiSlots, 42);
        assert.equal(step.progress.juryoSlots, 28);
        assert.equal(step.progress.makuuchiActive, 42);
        assert.equal(step.progress.juryoActive, 28);
        assert.ok(step.progress.sanshoTotal >= 0);
        assert.ok(step.progress.shukunCount >= 0);
        assert.ok(step.progress.kantoCount >= 0);
        assert.ok(step.progress.ginoCount >= 0);
        assert.ok(step.progress.lastCommitteeWarnings >= 0);
        assert.ok(step.progress.divisionHeadcount.Jonokuchi >= 0);
        assert.ok(step.progress.divisionActiveHeadcount.Jonidan >= 0);
        assert.equal(
          step.progress.sanshoTotal,
          step.progress.shukunCount + step.progress.kantoCount + step.progress.ginoCount,
        );
      }
    },
  },
  {
    name: 'league: heavy retirement is reconciled to active 42/28 in top divisions',
    run: () => {
      const rng = lcg(2027);
      const world = createSimulationWorld(rng);
      const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
      const boundaryWorld = createSekitoriBoundaryWorld(rng);
      boundaryWorld.npcRegistry = world.npcRegistry;
      boundaryWorld.makushitaPool =
        lowerWorld.rosters.Makushita as unknown as typeof boundaryWorld.makushitaPool;

      const keepActive = new Set(
        [...world.rosters.Makuuchi, ...world.rosters.Juryo].slice(0, 3).map((row) => row.id),
      );
      for (const row of [...world.rosters.Makuuchi, ...world.rosters.Juryo]) {
        const npc = world.npcRegistry.get(row.id);
        if (!npc) continue;
        if (!keepActive.has(row.id)) npc.active = false;
      }

      reconcileNpcLeague(world, lowerWorld, boundaryWorld, rng, 1, 1);
      const activeMakuuchi = world.rosters.Makuuchi.filter(
        (row) => world.npcRegistry.get(row.id)?.active !== false,
      ).length;
      const activeJuryo = world.rosters.Juryo.filter(
        (row) => world.npcRegistry.get(row.id)?.active !== false,
      ).length;

      assert.equal(world.rosters.Makuuchi.length, 42);
      assert.equal(world.rosters.Juryo.length, 28);
      assert.equal(activeMakuuchi, 42);
      assert.equal(activeJuryo, 28);
      assert.ok(world.rosters.Makuuchi.every((row) => world.npcRegistry.get(row.id)?.active !== false));
      assert.ok(world.rosters.Juryo.every((row) => world.npcRegistry.get(row.id)?.active !== false));
    },
  },
  {
    name: 'league: replenish path uses adjacency moves and intake lands in maezumo first',
    run: () => {
      const rng = lcg(500);
      const world = createSimulationWorld(rng);
      const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
      const boundaryWorld = createSekitoriBoundaryWorld(rng);
      boundaryWorld.npcRegistry = world.npcRegistry;
      boundaryWorld.makushitaPool =
        lowerWorld.rosters.Makushita as unknown as typeof boundaryWorld.makushitaPool;

      for (const npc of world.npcRegistry.values()) {
        npc.active = false;
      }

      const report = reconcileNpcLeague(world, lowerWorld, boundaryWorld, rng, 2, 3);
      const order = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi', 'Maezumo'];
      const toIndex = (division: string | undefined): number => order.indexOf(division || '');

      assert.ok(report.recruited > 0, 'Expected intake recruits under fully depleted league');
      assert.ok(
        report.moves.filter((move) => move.type === 'INTAKE').every((move) => move.to === 'Maezumo'),
        'INTAKE must land in Maezumo first',
      );
      for (const move of report.moves) {
        if (!move.from || move.type === 'INTAKE') continue;
        const fromIdx = toIndex(move.from);
        const toIdx = toIndex(move.to);
        if (move.type === 'PROMOTE') {
          assert.equal(fromIdx - toIdx, 1);
        } else {
          assert.equal(toIdx - fromIdx, 1);
        }
      }
    },
  },
  {
    name: 'matchmaking: staged fallback resolves strict byes with same-stable final stage',
    run: () => {
      const participants = Array.from({ length: 4 }, (_, i) => ({
        id: `X${i + 1}`,
        shikona: `同部屋${i + 1}`,
        isPlayer: false,
        stableId: 'stable-same',
        rankScore: i + 1,
        power: 80,
        wins: 0,
        losses: 0,
        active: true,
      }));
      const faced = createFacedMap(participants);
      const result = createDailyMatchups(participants, faced, () => 0.5, 1, 15);

      assert.equal(result.pairs.length, 2);
      assert.equal(result.byeIds.length, 0);
    },
  },
  {
    name: 'simulation: 360-basho deterministic loop keeps top active shortage at zero',
    run: () => {
      const rng = lcg(7331);
      const world = createSimulationWorld(rng);
      const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
      const boundaryWorld = createSekitoriBoundaryWorld(rng);
      boundaryWorld.npcRegistry = world.npcRegistry;
      boundaryWorld.makushitaPool =
        lowerWorld.rosters.Makushita as unknown as typeof boundaryWorld.makushitaPool;
      const status = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
      });
      const months = [1, 3, 5, 7, 9, 11] as const;
      let seq = 0;

      for (let i = 0; i < 360; i += 1) {
        const month = months[i % months.length];
        const year = 2026 + Math.floor(i / 6);
        reconcileNpcLeague(world, lowerWorld, boundaryWorld, rng, seq, month);

        simulateOffscreenTopDivisionBasho(world, 'Makuuchi', rng);
        runBashoDetailed(status, year, month, rng, world, lowerWorld);
        advanceTopDivisionBanzuke(world);
        runLowerDivisionQuotaStep(lowerWorld, rng);
        runSekitoriQuotaStep(world, boundaryWorld, rng, undefined, lowerWorld);

        seq += 1;
        runNpcRetirementStep(world.npcRegistry.values(), seq, rng);

        const intake = intakeNewNpcRecruits(
          {
            registry: world.npcRegistry,
            maezumoPool: world.maezumoPool,
            nameContext: world.npcNameContext,
            nextNpcSerial: world.nextNpcSerial,
          },
          seq,
          month,
          countActiveNpcInWorld(world),
          rng,
        );
        world.nextNpcSerial = intake.nextNpcSerial;
        lowerWorld.nextNpcSerial = intake.nextNpcSerial;
        if (lowerWorld.maezumoPool !== world.maezumoPool) {
          lowerWorld.maezumoPool.push(
            ...intake.recruits.map((npc) => ({
              ...(npc as unknown as typeof lowerWorld.maezumoPool[number]),
            })),
          );
        }

        reconcileNpcLeague(world, lowerWorld, boundaryWorld, rng, seq, month);

        const activeMakuuchi = world.rosters.Makuuchi.filter(
          (row) => world.npcRegistry.get(row.id)?.active !== false,
        ).length;
        const activeJuryo = world.rosters.Juryo.filter(
          (row) => world.npcRegistry.get(row.id)?.active !== false,
        ).length;
        assert.equal(world.rosters.Makuuchi.length, 42);
        assert.equal(world.rosters.Juryo.length, 28);
        assert.equal(activeMakuuchi, 42);
        assert.equal(activeJuryo, 28);
      }
    },
  },
  {
    name: 'npc stable catalog: size is fixed at 45 entries',
    run: () => {
      assert.equal(NPC_STABLE_CATALOG.length, 45);
    },
  },
  {
    name: 'npc stable catalog: scale distribution matches 1/4/9/15/12/4',
    run: () => {
      const distribution = NPC_STABLE_CATALOG.reduce(
        (acc, stable) => {
          acc[stable.scale] += 1;
          return acc;
        },
        {
          SUPER_GIANT: 0,
          GIANT: 0,
          LARGE: 0,
          MID: 0,
          SMALL: 0,
          TINY: 0,
        } as Record<'SUPER_GIANT' | 'GIANT' | 'LARGE' | 'MID' | 'SMALL' | 'TINY', number>,
      );

      assert.equal(distribution.SUPER_GIANT, 1);
      assert.equal(distribution.GIANT, 4);
      assert.equal(distribution.LARGE, 9);
      assert.equal(distribution.MID, 15);
      assert.equal(distribution.SMALL, 12);
      assert.equal(distribution.TINY, 4);
    },
  },
  {
    name: 'npc stable catalog: small and tiny stables are 16 total',
    run: () => {
      const count = NPC_STABLE_CATALOG.filter(
        (stable) => stable.scale === 'SMALL' || stable.scale === 'TINY',
      ).length;
      assert.equal(count, 16);
    },
  },
  {
    name: 'npc universe: initial active total is 630 and stable headcounts stay near targets',
    run: () => {
      const universe = createInitialNpcUniverse(lcg(2026));
      const counts = countActiveByStable(universe.registry);
      let total = 0;

      for (const stable of NPC_STABLE_CATALOG) {
        const count = counts.get(stable.id) ?? 0;
        total += count;
        assert.ok(count >= Math.max(1, stable.minPreferred - 3));
        if (typeof stable.hardCap === 'number') {
          assert.ok(count <= stable.hardCap);
        } else {
          assert.ok(count <= stable.maxPreferred + 15);
        }
      }

      assert.equal(total, 630);
    },
  },
  {
    name: 'npc universe: initial rank-power correlation is descending in every division',
    run: () => {
      const universe = createInitialNpcUniverse(lcg(2026));
      const divisions: Array<'Makuuchi' | 'Juryo' | 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi'> = [
        'Makuuchi',
        'Juryo',
        'Makushita',
        'Sandanme',
        'Jonidan',
        'Jonokuchi',
      ];
      for (const division of divisions) {
        const roster = universe.rosters[division];
        const correlation = pearsonCorrelation(
          roster.map((npc) => npc.rankScore),
          roster.map((npc) => npc.basePower),
        );
        assert.ok(
          correlation <= -0.25,
          `Expected negative correlation for ${division}, got ${correlation.toFixed(3)}`,
        );
        assert.ok(roster.every((npc) => Number.isFinite(npc.heightCm) && Number.isFinite(npc.weightKg)));
      }
    },
  },
  {
    name: 'npc universe: same seed reproduces stable assignment sequence',
    run: () => {
      const universeA = createInitialNpcUniverse(lcg(77));
      const universeB = createInitialNpcUniverse(lcg(77));
      const toStableSequence = (registry: ReturnType<typeof createInitialNpcUniverse>['registry']): string[] =>
        [...registry.values()]
          .filter((npc) => npc.active)
          .sort((a, b) => Number(a.id.split('-')[1]) - Number(b.id.split('-')[1]))
          .map((npc) => npc.stableId);

      assert.deepEqual(toStableSequence(universeA.registry), toStableSequence(universeB.registry));
    },
  },
  {
    name: 'npc intake: small/tiny hard caps are respected through repeated intake',
    run: () => {
      const universe = createInitialNpcUniverse(lcg(1234));
      const months = [1, 3, 5, 7, 9, 11] as const;
      let seq = 0;

      for (let i = 0; i < 120; i += 1) {
        const activeCount = [...universe.registry.values()].filter((npc) => npc.active).length;
        const month = months[i % months.length];
        const intake = intakeNewNpcRecruits(universe, seq + 1, month, activeCount, lcg(5000 + i));
        universe.nextNpcSerial = intake.nextNpcSerial;
        seq += 1;
        if (activeCount >= 900) break;
      }

      const counts = countActiveByStable(universe.registry);
      for (const stable of NPC_STABLE_CATALOG) {
        if (stable.scale === 'SMALL') {
          assert.ok((counts.get(stable.id) ?? 0) <= 9);
        }
        if (stable.scale === 'TINY') {
          assert.ok((counts.get(stable.id) ?? 0) <= 4);
        }
      }
    },
  },
  {
    name: 'ranking property: generated next ranks stay structurally valid',
    run: () => {
      const rand = lcg(42);
      const allowedNamesByDivision: Record<Rank['division'], string[]> = {
        Makuuchi: ['横綱', '大関', '関脇', '小結', '前頭'],
        Juryo: ['十両'],
        Makushita: ['幕下'],
        Sandanme: ['三段目'],
        Jonidan: ['序二段'],
        Jonokuchi: ['序ノ口'],
        Maezumo: ['前相撲'],
      };
      const divisions: Rank[] = [
        { division: 'Makuuchi', name: '前頭', side: 'East', number: 8 },
        { division: 'Makuuchi', name: '小結', side: 'East' },
        { division: 'Juryo', name: '十両', side: 'East', number: 8 },
        { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
        { division: 'Sandanme', name: '三段目', side: 'East', number: 50 },
        { division: 'Jonidan', name: '序二段', side: 'East', number: 80 },
        { division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 15 },
        { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
      ];

      for (let i = 0; i < 200; i++) {
        const template = divisions[Math.floor(rand() * divisions.length)];
        const rank: Rank = { ...template };
        if (rank.number) {
          rank.number = Math.max(1, Math.floor(rand() * 60));
        }
        const maxWins = rank.division === 'Makuuchi' || rank.division === 'Juryo' ? 15 : 7;
        const wins = Math.floor(rand() * (maxWins + 1));
        const losses = maxWins - wins;
        const record = createBashoRecord(rank, wins, losses);
        const result = calculateNextRank(record, [], false, rand);
        const nextRank = result.nextRank;

        assert.ok(
          allowedNamesByDivision[nextRank.division].includes(nextRank.name),
          `Unexpected rank name for division: ${nextRank.division}/${nextRank.name}`,
        );
        assert.ok(
          nextRank.side === 'East' || nextRank.side === 'West',
          `Expected East/West side, got: ${String(nextRank.side)}`,
        );
        if (typeof nextRank.number === 'number') {
          assert.ok(nextRank.number >= 1);
        }
        if (['Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi', 'Maezumo'].includes(nextRank.division)) {
          assert.ok(typeof nextRank.number === 'number', `Expected rank number in ${nextRank.division}`);
        }
        if (nextRank.division === 'Makuuchi' && nextRank.name === '前頭') {
          assert.ok(typeof nextRank.number === 'number', 'Expected rank number for maegashira');
        }
        if (
          nextRank.division === 'Makuuchi' &&
          ['横綱', '大関', '関脇', '小結'].includes(nextRank.name)
        ) {
          assert.equal(nextRank.number, undefined);
        }
      }
    },
  },
];

let passed = 0;
const run = async () => {
  for (const test of tests) {
    try {
      await test.run();
      passed += 1;
      console.log(`PASS ${test.name}`);
    } catch (error) {
      console.error(`FAIL ${test.name}`);
      throw error;
    }
  }

  console.log(`All tests passed (${passed}/${tests.length})`);
};

run().catch((error) => {
  console.error(error);
  throw error;
});
