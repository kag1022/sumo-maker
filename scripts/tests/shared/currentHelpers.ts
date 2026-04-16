import { calculateBattleResult, EnemyStats, generateEnemy } from '../../../src/logic/battle';
import { applyGrowth, checkRetirement } from '../../../src/logic/growth';
import { createInitialRikishi } from '../../../src/logic/initialization';
import { calculateNextRank } from '../../../src/logic/banzuke/rules/singleRankChange';
import { generateNextBanzuke } from '../../../src/logic/banzuke/providers/topDivision';
import { BashoRecordSnapshot } from '../../../src/logic/banzuke/providers/sekitori/types';
import { resolveLowerRangeDeltaByScore } from '../../../src/logic/banzuke/rules/lowerDivision';
import { resolveSekitoriDeltaBand } from '../../../src/logic/banzuke/providers/sekitori/bands';
import { resolveTopDirective } from '../../../src/logic/banzuke/providers/sekitori/directives';
import { scoreTopDivisionCandidate } from '../../../src/logic/banzuke/providers/sekitori/scoring';
import { LIMITS } from '../../../src/logic/banzuke/scale/rankLimits';
import { runSimulation } from '../../../src/logic/simulation/runner';
import { PlayerBoutDetail, runBasho, runBashoDetailed } from '../../../src/logic/simulation/basho';
import { normalizeNewRunModelVersion, normalizeSimulationModelVersion } from '../../../src/logic/simulation/modelVersion';
import { resolveYushoResolution } from '../../../src/logic/simulation/yusho';
import {
  BashoStepResult,
  SimulationStepResult,
  createSimulationEngine,
  resolveBoundaryAssignedRankForCurrentDivision,
} from '../../../src/logic/simulation/engine';
import { createInitialNpcUniverse } from '../../../src/logic/simulation/npc/factory';
import { intakeNewNpcRecruits } from '../../../src/logic/simulation/npc/intake';
import { reconcileNpcLeague } from '../../../src/logic/simulation/npc/leagueReconcile';
import {
  countActiveByStable,
  NPC_STABLE_CATALOG,
  resolveIchimonByStableId,
} from '../../../src/logic/simulation/npc/stableCatalog';
import {
  createNpcNameContext,
  generateUniqueNpcShikona,
  isSurnameShikona,
  normalizeShikona,
} from '../../../src/logic/simulation/npc/npcShikonaGenerator';
import { ActorRegistry, PersistentActor } from '../../../src/logic/simulation/npc/types';
import {
  createSekitoriBoundaryWorld,
  resolveSekitoriQuotaForPlayer,
  runSekitoriQuotaStep,
} from '../../../src/logic/simulation/sekitoriQuota';
import { resolveSekitoriExchangePolicy } from '../../../src/logic/simulation/sekitori/quota/exchangePolicy';
import { createDailyMatchups, createFacedMap, simulateNpcBout } from '../../../src/logic/simulation/matchmaking';
import {
  buildLowerDivisionBoutDays,
  createLowerDivisionBoutDayMap,
  DEFAULT_TORIKUMI_BOUNDARY_BANDS,
  resolveLowerDivisionEligibility,
} from '../../../src/logic/simulation/torikumi/policy';
import { scheduleTorikumiBasho } from '../../../src/logic/simulation/torikumi/scheduler';
import { pairWithinDivision } from '../../../src/logic/simulation/torikumi/scheduler/intraDivision';
import { TorikumiParticipant } from '../../../src/logic/simulation/torikumi/types';
import {
  createLowerDivisionQuotaWorld,
  resolveLowerDivisionQuotaForPlayer,
  runLowerDivisionQuotaStep,
} from '../../../src/logic/simulation/lowerQuota';
import { resolveBoundaryExchange } from '../../../src/logic/simulation/lower/exchange';
import {
  BoundarySnapshot as LowerBoundarySnapshot,
  EMPTY_EXCHANGE as EMPTY_LOWER_EXCHANGE,
  LOWER_BOUNDARIES,
} from '../../../src/logic/simulation/lower/types';
import { resolveExpectedSlotBand } from '../../../src/logic/banzuke/providers/expected/slotBands';
import { resolveLowerAssignedNextRank } from '../../../src/logic/banzuke/providers/lowerBoundary';
import { resolveSekitoriBoundaryAssignedRank } from '../../../src/logic/banzuke/providers/sekitoriBoundary';
import {
  advanceTopDivisionBanzuke,
  countActiveNpcInWorld,
  createSimulationWorld,
  resolveTopDivisionQuotaForPlayer,
  syncPlayerActorInWorld,
} from '../../../src/logic/simulation/world';
import { BoundarySnapshot as SekitoriBoundarySnapshot } from '../../../src/logic/simulation/sekitori/types';
import { runNpcRetirementStep } from '../../../src/logic/simulation/npc/retirement';
import { resolveRetirementChance } from '../../../src/logic/simulation/retirement/shared';
import { BashoRecord, BuildSpecVNext, Rank, RikishiStatus, Trait } from '../../../src/logic/models';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { closeDb, getDb } from '../../../src/logic/persistence/db';
import {
  ACHIEVEMENT_CATALOG,
  evaluateAchievements,
} from '../../../src/logic/achievements';
import {
  appendBashoChunk,
  buildCareerStartYearMonth,
  commitCareer,
  createDraftCareer,
  getCareerSaveIncentiveSummary,
  isCareerSaved,
  listCommittedCareers,
  markCareerCompleted,
} from '../../../src/logic/persistence/careers';
import {
  appendBanzukeDecisionLogs,
  appendBanzukePopulation,
  getCareerBashoDetail,
  getCareerHeadToHead,
  listBanzukeDecisions,
  listBanzukePopulation,
  listCareerBashoRecordsBySeq,
  listCareerImportantTorikumi,
} from '../../../src/logic/persistence/careerHistory';
import {
  getCollectionDashboardSummary,
  getRecordCollectionSummary,
  listCollectionCatalogEntries,
  listCollectionSummary,
  listRecentCollectionUnlocks,
  listUnlockedCollectionEntries,
} from '../../../src/logic/persistence/collections';
import {
  buildCareerClearScoreSummary,
  buildCareerRecordBadges,
} from '../../../src/logic/career/clearScore';
import {
  listNonTechniqueCatalog,
  listOfficialWinningKimariteCatalog,
  normalizeKimariteName,
} from '../../../src/logic/kimarite/catalog';
import {
  inferBodyTypeFromMetrics,
  resolveKimariteOutcome,
} from '../../../src/logic/kimarite/selection';
import {
  composeNextBanzuke,
  evaluateYokozunaPromotion,
  maxNumber,
  rankNumberSideToSlot,
  resolveVariableHeadcountByFlow,
  slotToRankNumberSide,
} from '../../../src/logic/banzuke';
import {
  getWalletState,
  WALLET_INITIAL_POINTS,
  spendWalletPoints,
  WALLET_MAX_POINTS,
} from '../../../src/logic/persistence/wallet';
import { KIMARITE_CATALOG } from '../../../src/logic/kimarite/catalog';
import {
  buildInitialRikishiFromDraft,
  rollScoutDraft,
  ScoutDraft,
} from '../../../src/logic/scout/gacha';
import { CONSTANTS } from '../../../src/logic/constants';
import { appendBashoEvents, initializeSimulationStatus } from '../../../src/logic/simulation/career';
import {
  BUILD_COST,
  buildInitialRikishiFromSpec,
  calculateBuildCost,
  calculateBuildCostVNext,
  createDefaultBuildSpec,
  createDefaultBuildSpecVNext,
  getStarterOyakataBlueprints,
  isBuildSpecVNextBmiValid,
  resolveDisplayedAptitudeTier,
} from '../../../src/logic/build/buildLab';
import { ensureKataProfile, resolveKataDisplay, updateKataProfileAfterBasho } from '../../../src/logic/style/kata';
import { buildHoshitoriGrid } from '../../../src/features/report/utils/hoshitori';
import { buildReportHeroSummary } from '../../../src/features/report/utils/reportHero';
import {
  buildCareerRivalryDigest,
} from '../../../src/features/report/utils/reportRivalry';
import {
  buildImportantBanzukeDecisionDigests,
  buildImportantDecisionDigest,
  buildImportantTorikumiDigests,
  buildHoshitoriCareerRecords,
  buildRankChartData,
  buildTimelineEventGroups,
} from '../../../src/features/report/utils/reportTimeline';
import {
  buildBanzukeSnapshotForSeq,
} from '../../../src/features/report/utils/reportBanzukeSnapshot';
import {
  createLogicLabInitialStatus,
  LOGIC_LAB_DEFAULT_PRESET,
} from '../../../src/features/logicLab/presets';
import {
  runLogicLabToEnd,
} from '../../../src/features/logicLab/runner';
import {
  calculateMomentumBonus,
  resolvePlayerAbility,
  resolveRankBaselineAbility,
} from '../../../src/logic/simulation/strength/model';
import { updateAbilityAfterBasho } from '../../../src/logic/simulation/strength/update';
import { resolveBashoFormDelta } from '../../../src/logic/simulation/variance/bashoVariance';
import {
  resolveSimulationPhaseOnCompletion,
  resolveSimulationPhaseOnStart,
  shouldCaptureObservations,
} from '../../../src/logic/simulation/appFlow';
const path = require('path');
const {
  createCareerRateAccumulator,
  finalizeCareerRateAccumulator,
  pushCareerRateSample,
  buildCareerRateSample,
} = require(path.join(process.cwd(), 'scripts', 'reports', '_shared', 'career_rate_metrics.cjs'));

(globalThis as unknown as { indexedDB: typeof indexedDB }).indexedDB = indexedDB;
(globalThis as unknown as { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

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

const createStatus = (overrides: Partial<RikishiStatus> = {}): RikishiStatus => {
  const base: RikishiStatus = {
    stableId: 'stable-001',
    ichimonId: 'TAIJU',
    stableArchetypeId: 'MASTER_DISCIPLE',
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
    aptitudeTier: 'B',
    aptitudeFactor: 1,
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
    ratingState: {
      ability: 60,
      form: 0,
      uncertainty: 2.2,
    },
    injuryLevel: 0,
    injuries: [],
    isOzekiKadoban: false,
    isOzekiReturn: false,
    spirit: 70,
    history: {
      records: [],
      events: [],
      maxRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
      totalWins: 0,
      totalLosses: 0,
      totalAbsent: 0,
      yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
      kimariteTotal: {},
      bodyTimeline: [],
      highlightEvents: [],
    },
    statHistory: [],
    ...overrides,
  };
  if (!overrides.ratingState) {
    const avg = Object.values(base.stats).reduce((sum, value) => sum + value, 0) / 8;
    base.ratingState = {
      ability: avg * 1.08,
      form: 0,
      uncertainty: 2.2,
    };
  }
  return base;
};

const createBashoRecord = (
  rank: Rank,
  wins: number,
  losses: number,
  absent = 0,
  yusho = false,
): BashoRecord => ({
  year: 2026,
  month: 1,
  rank,
  wins,
  losses,
  absent,
  yusho,
  specialPrizes: [],
});

const createBashoRecordRow = ({
  seq,
  entityId,
  entityType,
  shikona,
  division,
  rankName,
  rankNumber,
  rankSide,
  wins,
  losses,
  absent = 0,
  titles = [],
}: {
  seq: number;
  entityId: string;
  entityType: 'PLAYER' | 'NPC';
  shikona: string;
  division: string;
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  wins: number;
  losses: number;
  absent?: number;
  titles?: string[];
}) => ({
  careerId: 'career-report',
  seq,
  entityId,
  entityType,
  year: 2026,
  month: seq * 2 - 1,
  shikona,
  division,
  rankName,
  rankNumber,
  rankSide,
  wins,
  losses,
  absent,
  titles,
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

const createMockActor = (
  id: string,
  shikona: string,
  division: PersistentActor['division'],
  stableId = 'stable-001',
): PersistentActor => ({
  actorId: id,
  actorType: id === 'PLAYER' ? 'PLAYER' : 'NPC',
  id,
  seedId: id,
  shikona,
  stableId,
  division,
  currentDivision: division,
  rankScore: 1,
  basePower: 70,
  ability: 70,
  uncertainty: 1.4,
  form: 1,
  volatility: 1.2,
  styleBias: 'BALANCE',
  heightCm: 182,
  weightKg: 140,
  growthBias: 0,
  aptitudeTier: 'B',
  aptitudeFactor: 1,
  retirementBias: 0,
  entryAge: 18,
  age: 18,
  careerBashoCount: 0,
  active: true,
  entrySeq: 0,
  recentBashoResults: [],
});

const assertActiveShikonaUnique = (
  registry: ActorRegistry,
  context: string,
): void => {
  const active = [...registry.values()].filter((actor) => actor.active);
  const normalized = active.map((actor) => normalizeShikona(actor.shikona));
  const unique = new Set(normalized);
  assert.equal(
    unique.size,
    normalized.length,
  );
  assert.ok(unique.size === normalized.length, `duplicate shikona detected in ${context}`);
};

const createTorikumiParticipant = (
  id: string,
  division: TorikumiParticipant['division'],
  rankName: string,
  rankNumber: number,
  stableId: string,
): TorikumiParticipant => ({
  id,
  shikona: id,
  isPlayer: false,
  stableId,
  division,
  rankScore: Math.max(1, rankNumber * 2 - 1),
  rankName,
  rankNumber,
  power: 80,
  wins: 0,
  losses: 0,
  active: true,
  targetBouts: division === 'Makuuchi' || division === 'Juryo' ? 15 : 7,
  boutsDone: 0,
});

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

const createScoutDraft = (overrides: Partial<ScoutDraft> = {}): ScoutDraft => {
  const baseDraft: ScoutDraft = {
    shikona: '雷ノ海',
    birthplace: '東京都',
    profile: {
      realName: '山田 太郎',
      birthplace: '東京都',
      personality: 'CALM',
    },
    entryAge: 18,
    startingHeightCm: 183,
    startingWeightKg: 132,
    entryPath: 'SCHOOL',
    temperament: 'STEADY',
    bodySeed: 'BALANCED',
    selectedStableId: 'stable-025',
    aptitudeTier: 'B',
  };
  return {
    ...baseDraft,
    ...overrides,
  };
};

const resetDb = async (): Promise<void> => {
  closeDb();
  const db = getDb();
  db.close();
  await db.delete();
  await db.open();
};


export {
  assert,
  fail,
  assertRank,
  expectBashoStep,
  createStatus,
  createBashoRecord,
  createBashoRecordRow,
  createSekitoriSnapshot,
  buildNeutralSekitoriRecords,
  summarizeCareer,
  sequenceRng,
  lcg,
  createMockActor,
  assertActiveShikonaUnique,
  createTorikumiParticipant,
  pearsonCorrelation,
  createScoutDraft,
  resetDb,
  createCareerRateAccumulator,
  finalizeCareerRateAccumulator,
  pushCareerRateSample,
  buildCareerRateSample,
};
