import { calculateBattleResult, EnemyStats, generateEnemy } from '../../../src/logic/battle';
import { applyGrowth, checkRetirement } from '../../../src/logic/growth';
import { HEISEI_POPULATION_CALIBRATION } from '../../../src/logic/calibration/populationHeisei';
import { runSimulation } from '../../../src/logic/simulation/runner';
import { runBasho, runBashoDetailed } from '../../../src/logic/simulation/basho';
import { buildLeagueState } from '../../../src/logic/simulation/leagueState';
import { normalizeNewRunModelVersion, normalizeSimulationModelVersion } from '../../../src/logic/simulation/modelVersion';
import { resolveRuntimeNarrativeStep } from '../../../src/logic/simulation/runtimeNarrative';
import { resolveYushoResolution } from '../../../src/logic/simulation/yusho';
import {
  advanceLeaguePopulation,
  applyLeaguePromotionFlow,
  createLeagueFlowRuntime,
  createSimulationEngine,
  createSimulationRuntime,
  prepareLeagueForBasho,
  runCareerObservation,
  runObservationVerificationSample,
  resumeRuntime,
  resolveBoundaryAssignedRankForCurrentDivision,
  resolveSimulationModelBundle,
  type CareerObservationSummary,
  type SimulationProgressSnapshot,
} from '../../../src/logic/simulation/engine';
import { createSekitoriBoundaryWorld, runSekitoriQuotaStep } from '../../../src/logic/simulation/sekitoriQuota';
import { createDailyMatchups, createFacedMap, simulateNpcBout } from '../../../src/logic/simulation/matchmaking';
import { createLowerDivisionQuotaWorld, runLowerDivisionQuotaStep } from '../../../src/logic/simulation/lowerQuota';
import {
  advanceTopDivisionBanzuke,
  countActiveBanzukeHeadcountExcludingMaezumo,
  createSimulationWorld,
  simulateOffscreenSekitoriBasho,
} from '../../../src/logic/simulation/world';
import { resolveRetirementChance } from '../../../src/logic/simulation/retirement/shared';
import { Rank } from '../../../src/logic/models';
import {
  applyPlayerInitialAbilityCap,
  applyPlayerEmpiricalProgressClamp,
  resolvePlayerFavoriteCompression,
  resolvePlayerNormalDivisionCompression,
  resolvePlayerOpeningBonusAttenuation,
  resolvePlayerStagnationBattlePenalty,
  resolvePlayerStagnationRetentionPressure,
  resolvePlayerStagnationState,
  resolvePlayerRetentionModifier,
} from '../../../src/logic/simulation/playerRealism';
import { calculateMomentumBonus, resolvePlayerAbility, resolveRankBaselineAbility } from '../../../src/logic/simulation/strength/model';
import { updateAbilityAfterBasho } from '../../../src/logic/simulation/strength/update';
import { resolveBashoFormDelta } from '../../../src/logic/simulation/variance/bashoVariance';
import { LOGIC_LAB_DEFAULT_PRESET } from '../../../src/features/logicLab/presets';
import { runLogicLabToEnd } from '../../../src/features/logicLab/runner';

import type { TestCase } from '../types';
import {
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
} from '../shared/currentHelpers';

const assertUniqueProgressSlots = (
  entries: SimulationProgressSnapshot['makuuchi'],
  division: 'Makuuchi' | 'Juryo',
  context: string,
): void => {
  const scores = entries.map((entry) => entry.rankScore);
  assert.ok(
    new Set(scores).size === scores.length,
    `Expected unique ${division} rankScore values in ${context}`,
  );
  const playerCount = entries.filter((entry) => entry.id === 'PLAYER').length;
  assert.ok(playerCount <= 1, `Expected at most one PLAYER entry in ${division} for ${context}`);
};

const assertUniqueTopRosterSlots = (
  world: ReturnType<typeof createSimulationWorld>,
  context: string,
): void => {
  for (const division of ['Makuuchi', 'Juryo'] as const) {
    const scores = world.rosters[division].map((entry) => entry.rankScore);
    assert.ok(
      new Set(scores).size === scores.length,
      `Expected unique ${division} rankScore values in ${context}`,
    );
  }
  const playerCount = [...world.rosters.Makuuchi, ...world.rosters.Juryo]
    .filter((entry) => entry.id === 'PLAYER')
    .length;
  assert.ok(playerCount <= 1, `Expected at most one PLAYER row in ${context}`);
};

export const tests: TestCase[] = [
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
    name: 'battle: deterministic win path (unified-v2-kimarite)',
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
    name: 'battle: dohyougiwa reversal requires close high-pressure context',
    run: () => {
      const rikishi = createStatus({
        traits: ['DOHYOUGIWA_MAJUTSU'],
      });
      const enemy: EnemyStats = {
        shikona: '五分敵',
        rankValue: 2,
        power: 96,
        ability: 96,
        heightCm: 186,
        weightKg: 149,
      };
      const normal = calculateBattleResult(
        rikishi,
        enemy,
        {
          day: 10,
          currentWins: 4,
          currentLosses: 5,
          consecutiveWins: 0,
          currentWinStreak: 0,
          currentLossStreak: 1,
          opponentWinStreak: 1,
          opponentLossStreak: 0,
          isLastDay: false,
          isYushoContention: false,
          previousResult: 'LOSS',
        },
        sequenceRng([0.55, 0.0, 0.0]),
      );
      const highPressure = calculateBattleResult(
        rikishi,
        enemy,
        {
          day: 15,
          currentWins: 6,
          currentLosses: 8,
          consecutiveWins: 0,
          currentWinStreak: 0,
          currentLossStreak: 1,
          opponentWinStreak: 1,
          opponentLossStreak: 0,
          isLastDay: true,
          isYushoContention: true,
          titleImplication: 'DIRECT',
          previousResult: 'LOSS',
        },
        sequenceRng([0.55, 0.05, 0.0]),
      );
      assert.equal(normal.isWin, false);
      assert.equal(highPressure.isWin, true);
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
      assert.ok(largeResult.winProbability > smallResult.winProbability);
    },
  },
  {
    name: 'battle: unified win probability stays inside hard clamp',
    run: () => {
      const strong = createStatus({
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
        ratingState: {
          ability: 170,
          form: 0,
          uncertainty: 1,
        },
      });
      const weak = createStatus({
        stats: {
          tsuki: 20,
          oshi: 20,
          kumi: 20,
          nage: 20,
          koshi: 20,
          deashi: 20,
          waza: 20,
          power: 20,
        },
        ratingState: {
          ability: 45,
          form: 0,
          uncertainty: 1,
        },
      });

      const weakEnemy: EnemyStats = {
        shikona: '弱敵',
        rankValue: 6,
        power: 32,
        ability: 30,
        heightCm: 176,
        weightKg: 108,
      };
      const strongEnemy: EnemyStats = {
        shikona: '強敵',
        rankValue: 1,
        power: 180,
        ability: 46,
        heightCm: 194,
        weightKg: 188,
      };

      const high = calculateBattleResult(strong, weakEnemy, undefined, () => 0.5);
      const low = calculateBattleResult(weak, strongEnemy, undefined, () => 0.5);

      assert.ok(high.winProbability >= 0.03 && high.winProbability <= 0.97);
      assert.ok(low.winProbability >= 0.03 && low.winProbability <= 0.97);
    },
  },
  {
    name: 'battle: stronger stats monotonically raise unified win probability',
    run: () => {
      const low = createStatus({
        stats: {
          tsuki: 40,
          oshi: 40,
          kumi: 40,
          nage: 40,
          koshi: 40,
          deashi: 40,
          waza: 40,
          power: 40,
        },
        ratingState: {
          ability: 88,
          form: 0,
          uncertainty: 1.2,
        },
      });
      const high = createStatus({
        stats: {
          tsuki: 70,
          oshi: 70,
          kumi: 70,
          nage: 70,
          koshi: 70,
          deashi: 70,
          waza: 70,
          power: 70,
        },
        ratingState: {
          ability: 118,
          form: 0,
          uncertainty: 1.2,
        },
      });
      const enemy: EnemyStats = {
        shikona: '同格敵',
        rankValue: 5,
        power: 96,
        ability: 96,
        heightCm: 184,
        weightKg: 150,
      };

      const lowResult = calculateBattleResult(low, enemy, undefined, () => 0.5);
      const highResult = calculateBattleResult(high, enemy, undefined, () => 0.5);
      assert.ok(highResult.winProbability > lowResult.winProbability);
    },
  },
  {
    name: 'battle: player favorite compression applies half-strength B3 compression at 3-5 basho',
    run: () => {
      const rank: Rank = { division: 'Makushita', name: '幕下', number: 10, side: 'East' };
      const compressed = resolvePlayerFavoriteCompression({
        winProbability: 0.74,
        baselineWinProbability: 0.66,
        projectedExpectedWins: 5.2,
        careerBashoCount: 5,
        currentRank: rank,
      });
      assert.ok(compressed < 0.74, `Expected B3 half compression before 6 basho, got ${compressed}`);
    },
  },
  {
    name: 'battle: opening bonus attenuation only reduces upside above baseline',
    run: () => {
      const attenuated = resolvePlayerOpeningBonusAttenuation({
        rawWinProbability: 0.72,
        baselineWinProbability: 0.60,
        careerBashoCount: 4,
      });
      const expected = 0.60 + (0.72 - 0.60) * 0.70;
      const unchanged = resolvePlayerOpeningBonusAttenuation({
        rawWinProbability: 0.48,
        baselineWinProbability: 0.52,
        careerBashoCount: 4,
      });
      assert.ok(Math.abs(attenuated - expected) < 1e-9, `Expected ${expected}, got ${attenuated}`);
      assert.equal(unchanged, 0.48);
    },
  },
  {
    name: 'battle: player favorite compression leaves underdog path untouched',
    run: () => {
      const rank: Rank = { division: 'Juryo', name: '十両', number: 3, side: 'East' };
      const base = resolvePlayerFavoriteCompression({
        winProbability: 0.49,
        projectedExpectedWins: 8.8,
        careerBashoCount: 18,
        currentRank: rank,
      });
      assert.equal(base, 0.49);
    },
  },
  {
    name: 'battle: player favorite compression is stronger in sanyaku than lower divisions',
    run: () => {
      const lower = resolvePlayerFavoriteCompression({
        winProbability: 0.78,
        projectedExpectedWins: 5.0,
        careerBashoCount: 24,
        currentRank: { division: 'Sandanme', name: '三段目', number: 25, side: 'East' },
      });
      const sanyaku = resolvePlayerFavoriteCompression({
        winProbability: 0.78,
        projectedExpectedWins: 9.0,
        careerBashoCount: 24,
        currentRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
      });
      assert.ok(sanyaku < lower, `Expected sanyaku compression < lower division, got ${sanyaku} >= ${lower}`);
    },
  },
  {
    name: 'retirement: last 6 bad results escalate from stalled to critical',
    run: () => {
      const rank: Rank = { division: 'Makushita', name: '幕下', number: 18, side: 'East' };
      const stalled = resolvePlayerStagnationState({
        age: 26,
        careerBashoCount: 20,
        currentRank: rank,
        maxRank: rank,
        recentRecords: [
          createBashoRecord(rank, 4, 3, 0),
          createBashoRecord(rank, 2, 5, 0),
          createBashoRecord(rank, 3, 4, 0),
          createBashoRecord(rank, 4, 3, 0),
          createBashoRecord(rank, 2, 5, 0),
          createBashoRecord(rank, 1, 6, 0),
        ],
        formerSekitori: false,
      });
      const critical = resolvePlayerStagnationState({
        age: 26,
        careerBashoCount: 20,
        currentRank: rank,
        maxRank: rank,
        recentRecords: [
          createBashoRecord(rank, 2, 5, 0),
          createBashoRecord(rank, 3, 4, 0),
          createBashoRecord(rank, 2, 5, 0),
          createBashoRecord(rank, 0, 0, 7),
          createBashoRecord(rank, 0, 0, 7),
          createBashoRecord(rank, 1, 6, 0),
        ],
        formerSekitori: false,
      });
      assert.equal(stalled.band, 'STALLED');
      assert.equal(critical.band, 'CRITICAL');
    },
  },
  {
    name: 'retirement: makushita top without kachikoshi becomes stalled',
    run: () => {
      const rank: Rank = { division: 'Makushita', name: '幕下', number: 12, side: 'East' };
      const resolution = resolvePlayerStagnationState({
        age: 24,
        careerBashoCount: 30,
        currentRank: rank,
        maxRank: rank,
        recentRecords: [
          createBashoRecord(rank, 3, 4, 0),
          createBashoRecord(rank, 3, 4, 0),
          createBashoRecord(rank, 0, 0, 7),
          createBashoRecord(rank, 3, 4, 0),
        ],
        formerSekitori: false,
      });
      assert.ok(
        resolution.band === 'STALLED' || resolution.band === 'CRITICAL',
        `Expected stalled or critical, got ${resolution.band}`,
      );
      assert.equal(resolution.isMakushitaTop15, true);
    },
  },
  {
    name: 'retirement: young single full kyujo grace relaxes one level only',
    run: () => {
      const rank: Rank = { division: 'Sandanme', name: '三段目', number: 22, side: 'East' };
      const resolution = resolvePlayerStagnationState({
        age: 20,
        careerBashoCount: 10,
        currentRank: rank,
        maxRank: rank,
        recentRecords: [
          createBashoRecord(rank, 4, 3, 0),
          createBashoRecord(rank, 5, 2, 0),
          createBashoRecord(rank, 4, 3, 0),
          createBashoRecord(rank, 0, 0, 7),
        ],
        fullKyujoStreak: 1,
        formerSekitori: false,
      });
      assert.equal(resolution.band, 'NORMAL');
      assert.equal(resolution.graceApplied, true);
    },
  },
  {
    name: 'retirement: makekoshi-driven slide does not receive injury grace',
    run: () => {
      const rank: Rank = { division: 'Sandanme', name: '三段目', number: 22, side: 'East' };
      const resolution = resolvePlayerStagnationState({
        age: 20,
        careerBashoCount: 10,
        currentRank: rank,
        maxRank: rank,
        recentRecords: [
          createBashoRecord(rank, 2, 5, 0),
          createBashoRecord(rank, 3, 4, 0),
          createBashoRecord(rank, 4, 3, 0),
          createBashoRecord(rank, 0, 0, 7),
        ],
        fullKyujoStreak: 1,
        formerSekitori: false,
      });
      assert.equal(resolution.band, 'STALLED');
      assert.equal(resolution.graceApplied, false);
    },
  },
  {
    name: 'battle: stagnation battle penalty only affects favorite side',
    run: () => {
      const stagnation = {
        band: 'CRITICAL' as const,
        badResultCount: 5,
        fullKyujoStreak: 2,
        isMakushitaTop15: false,
        isMakushitaTop10: false,
        graceApplied: false,
      };
      const rank: Rank = { division: 'Makushita', name: '幕下', number: 9, side: 'East' };
      const favoritePenalty = resolvePlayerStagnationBattlePenalty({
        winProbability: 0.62,
        currentRank: rank,
        stagnation,
      });
      const underdogPenalty = resolvePlayerStagnationBattlePenalty({
        winProbability: 0.48,
        currentRank: rank,
        stagnation,
      });
      assert.ok(favoritePenalty > 0);
      assert.equal(underdogPenalty, 0);
    },
  },
  {
    name: 'battle: stalled lower-division compression is tighter than neutral',
    run: () => {
      const rank: Rank = { division: 'Makushita', name: '幕下', number: 11, side: 'East' };
      const neutral = resolvePlayerFavoriteCompression({
        winProbability: 0.74,
        projectedExpectedWins: 5.1,
        careerBashoCount: 24,
        currentRank: rank,
      });
      const stalled = resolvePlayerFavoriteCompression({
        winProbability: 0.74,
        projectedExpectedWins: 5.1,
        careerBashoCount: 24,
        currentRank: rank,
        stagnation: {
          band: 'STALLED',
          badResultCount: 3,
          fullKyujoStreak: 0,
          isMakushitaTop15: true,
          isMakushitaTop10: false,
          graceApplied: false,
        },
      });
      assert.ok(stalled < neutral, `Expected stalled compression < neutral, got ${stalled} >= ${neutral}`);
    },
  },
  {
    name: 'battle: normal lower-division compression reaches full strength after 6 basho',
    run: () => {
      const rank: Rank = { division: 'Jonidan', name: '序二段', number: 35, side: 'East' };
      const half = resolvePlayerNormalDivisionCompression({
        careerBashoCount: 4,
        currentRank: rank,
        winProbability: 0.66,
      });
      const full = resolvePlayerNormalDivisionCompression({
        careerBashoCount: 8,
        currentRank: rank,
        winProbability: 0.66,
      });
      assert.equal(half, 0.04);
      assert.equal(full, 0.08);
    },
  },
  {
    name: 'battle: pre-6 stagnation does not add battle penalty',
    run: () => {
      const rank: Rank = { division: 'Makushita', name: '幕下', number: 11, side: 'East' };
      const neutral = resolvePlayerFavoriteCompression({
        winProbability: 0.74,
        baselineWinProbability: 0.66,
        projectedExpectedWins: 5.0,
        careerBashoCount: 5,
        currentRank: rank,
      });
      const critical = resolvePlayerFavoriteCompression({
        winProbability: 0.74,
        baselineWinProbability: 0.66,
        projectedExpectedWins: 5.0,
        careerBashoCount: 5,
        currentRank: rank,
        stagnation: {
          band: 'CRITICAL',
          badResultCount: 5,
          fullKyujoStreak: 2,
          isMakushitaTop15: true,
          isMakushitaTop10: false,
          graceApplied: false,
        },
      });
      assert.equal(critical, neutral);
    },
  },
  {
    name: 'growth: full kyujo clamps positive player progress to zero',
    run: () => {
      const current = {
        ability: 96,
        form: 0.1,
        uncertainty: 1.2,
        lastBashoExpectedWins: 4.2,
      };
      const next = {
        ability: 101,
        form: 0.35,
        uncertainty: 1.1,
        lastBashoExpectedWins: 4.2,
      };
      const clamped = applyPlayerEmpiricalProgressClamp({
        current,
        next,
        age: 26,
        careerBashoCount: 30,
        currentRank: { division: 'Makushita', name: '幕下', number: 8, side: 'East' },
        absent: 7,
        maxRank: { division: 'Makushita', name: '幕下', number: 2, side: 'East' },
        stagnation: {
          band: 'CRITICAL',
          badResultCount: 5,
          fullKyujoStreak: 1,
          isMakushitaTop15: true,
          isMakushitaTop10: true,
          graceApplied: false,
        },
      });
      assert.equal(clamped.ability, current.ability);
      assert.equal(clamped.form, current.form);
    },
  },
  {
    name: 'growth: early stagnation does not penalize pre-6-basho progress',
    run: () => {
      const current = {
        ability: 82,
        form: 0,
        uncertainty: 1.4,
        lastBashoExpectedWins: 4.1,
      };
      const next = {
        ability: 90,
        form: 0.4,
        uncertainty: 1.3,
        lastBashoExpectedWins: 4.1,
      };
      const currentRank: Rank = { division: 'Makushita', name: '幕下', number: 18, side: 'East' };
      const stalled = applyPlayerEmpiricalProgressClamp({
        current,
        next,
        age: 20,
        careerBashoCount: 4,
        currentRank,
        absent: 0,
        maxRank: currentRank,
        stagnation: {
          band: 'CRITICAL',
          badResultCount: 5,
          fullKyujoStreak: 2,
          isMakushitaTop15: false,
          isMakushitaTop10: false,
          graceApplied: false,
        },
      });
      const neutral = applyPlayerEmpiricalProgressClamp({
        current,
        next,
        age: 20,
        careerBashoCount: 4,
        currentRank,
        absent: 0,
        maxRank: currentRank,
      });
      assert.equal(stalled.ability, neutral.ability);
      assert.equal(stalled.form, neutral.form);
    },
  },
  {
    name: 'growth: player empirical clamp applies age and division soft cap',
    run: () => {
      const current = {
        ability: 130,
        form: 0,
        uncertainty: 0.9,
        lastBashoExpectedWins: 8.8,
      };
      const next = {
        ability: 150,
        form: 0.4,
        uncertainty: 0.85,
        lastBashoExpectedWins: 8.8,
      };
      const currentRank: Rank = { division: 'Makuuchi', name: '前頭', number: 4, side: 'East' };
      const clamped = applyPlayerEmpiricalProgressClamp({
        current,
        next,
        age: 34,
        careerBashoCount: 80,
        currentRank,
        absent: 0,
        maxRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
      });
      const cap = resolveRankBaselineAbility(currentRank) + 15;
      assert.ok(clamped.ability <= cap, `Expected clamped ability <= ${cap}, got ${clamped.ability}`);
    },
  },
  {
    name: 'growth: initial ability cap only compresses the upper side',
    run: () => {
      const rank: Rank = { division: 'Jonidan', name: '序二段', number: 50, side: 'East' };
      const baseline = resolveRankBaselineAbility(rank);
      const below = applyPlayerInitialAbilityCap({
        ability: baseline - 6,
        rank,
      });
      const above = applyPlayerInitialAbilityCap({
        ability: baseline + 18,
        rank,
      });
      assert.equal(below, baseline - 6);
      assert.ok(above < baseline + 18, `Expected upper clamp to compress, got ${above}`);
      assert.ok(above > baseline + 8, `Expected soft cap, got ${above}`);
    },
  },
  {
    name: 'battle: higher player aptitudeFactor increases win rate under same stats',
    run: () => {
      const enemy: EnemyStats = {
        shikona: '同格敵',
        rankValue: 6,
        power: 95,
        ability: 95,
        styleBias: 'BALANCE',
        heightCm: 184,
        weightKg: 145,
      };
      const factors = [0.68, 0.84, 1.0, 1.08, 1.16];
      const winRates: number[] = [];
      for (const factor of factors) {
        const trials = 1800;
        const rng = lcg(9100 + Math.round(factor * 100));
        let wins = 0;
        for (let i = 0; i < trials; i += 1) {
          const status = createStatus({
            aptitudeFactor: factor,
            stats: {
              tsuki: 62,
              oshi: 62,
              kumi: 62,
              nage: 62,
              koshi: 62,
              deashi: 62,
              waza: 62,
              power: 62,
            },
            ratingState: {
              ability: 96,
              form: 0,
              uncertainty: 1.1,
            },
          });
          const result = calculateBattleResult(
            status,
            enemy,
            {
              day: 6,
              currentWins: 2,
              currentLosses: 3,
              consecutiveWins: 0,
              isLastDay: false,
              isYushoContention: false,
            },
            rng,
          );
          if (result.isWin) wins += 1;
        }
        winRates.push(wins / trials);
      }
      for (let i = 1; i < winRates.length; i += 1) {
        assert.ok(
          winRates[i] > winRates[i - 1],
          `Expected monotonic win rates, got ${winRates.join(',')}`,
        );
      }
    },
  },
  {
    name: 'matchmaking: higher aptitudeFactor increases npc-vs-npc win rate',
    run: () => {
      const factors = [0.68, 0.84, 1.0, 1.08, 1.16];
      const winRates: number[] = [];
      for (const factor of factors) {
        const trials = 2200;
        const rng = lcg(12200 + Math.round(factor * 100));
        let wins = 0;
        for (let i = 0; i < trials; i += 1) {
          const a = {
            id: 'A',
            shikona: '甲',
            isPlayer: false,
            stableId: 'stable-001',
            rankScore: 1,
            power: 95,
            ability: 95,
            styleBias: 'BALANCE' as const,
            aptitudeFactor: factor,
            wins: 0,
            losses: 0,
            active: true,
          };
          const b = {
            id: 'B',
            shikona: '乙',
            isPlayer: false,
            stableId: 'stable-001',
            rankScore: 2,
            power: 95,
            ability: 95,
            styleBias: 'BALANCE' as const,
            aptitudeFactor: 1.0,
            wins: 0,
            losses: 0,
            active: true,
          };
          simulateNpcBout(a, b, rng);
          if (a.wins > 0) wins += 1;
        }
        winRates.push(wins / trials);
      }
      for (let i = 1; i < winRates.length; i += 1) {
        assert.ok(
          winRates[i] > winRates[i - 1],
          `Expected monotonic npc win rates, got ${winRates.join(',')}`,
        );
      }
    },
  },
  {
    name: 'battle: momentum bonus is non-linear and spikes from 3-streak',
    run: () => {
      const s2 = calculateMomentumBonus(2);
      const s3 = calculateMomentumBonus(3);
      const s4 = calculateMomentumBonus(4);
      const s5 = calculateMomentumBonus(5);
      const l5 = calculateMomentumBonus(-5);

      assert.ok(s2 > 0);
      assert.ok(s3 > s2);
      assert.ok((s4 - s3) > (s3 - s2), 'Expected acceleration from 3-streak');
      assert.ok((s5 - s4) > (s4 - s3), 'Expected further acceleration at high streak');
      assert.ok(l5 < 0 && Math.abs(l5) > s3);
    },
  },
  {
    name: 'battle: momentum streak context widens win probability spread',
    run: () => {
      const status = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 7 },
        stats: {
          tsuki: 68,
          oshi: 66,
          kumi: 64,
          nage: 62,
          koshi: 67,
          deashi: 66,
          waza: 63,
          power: 69,
        },
      });
      const enemy: EnemyStats = {
        shikona: '勢い検証敵',
        rankValue: 6,
        power: 98,
        ability: 98,
        heightCm: 186,
        weightKg: 148,
      };
      const neutral = calculateBattleResult(
        status,
        enemy,
        {
          day: 9,
          currentWins: 4,
          currentLosses: 4,
          consecutiveWins: 0,
          currentWinStreak: 0,
          currentLossStreak: 0,
          opponentWinStreak: 0,
          opponentLossStreak: 0,
          isLastDay: false,
          isYushoContention: false,
          previousResult: 'WIN',
        },
        () => 0.5,
      );
      const hot = calculateBattleResult(
        status,
        enemy,
        {
          day: 9,
          currentWins: 6,
          currentLosses: 2,
          consecutiveWins: 4,
          currentWinStreak: 4,
          currentLossStreak: 0,
          opponentWinStreak: 0,
          opponentLossStreak: 3,
          isLastDay: false,
          isYushoContention: false,
          previousResult: 'WIN',
        },
        () => 0.5,
      );
      const cold = calculateBattleResult(
        status,
        enemy,
        {
          day: 9,
          currentWins: 2,
          currentLosses: 6,
          consecutiveWins: 0,
          currentWinStreak: 0,
          currentLossStreak: 4,
          opponentWinStreak: 3,
          opponentLossStreak: 0,
          isLastDay: false,
          isYushoContention: false,
          previousResult: 'LOSS',
        },
        () => 0.5,
      );

      assert.ok(hot.winProbability > neutral.winProbability);
      assert.ok(neutral.winProbability > cold.winProbability);
      assert.ok(hot.winProbability - cold.winProbability > 0.2);
    },
  },
  {
    name: 'battle: trait bonus is capped in unified ability resolver',
    run: () => {
      const status = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 3 },
        ratingState: {
          ability: 120,
          form: 0,
          uncertainty: 1.1,
        },
      });
      const fallbackBody = status.bodyMetrics ?? { heightCm: 182, weightKg: 140 };
      const base = resolvePlayerAbility(status, fallbackBody, 0);
      const boosted = resolvePlayerAbility(status, fallbackBody, 999);
      const dropped = resolvePlayerAbility(status, fallbackBody, -999);
      const capDelta = 12 * 0.85;

      assert.ok(Math.abs((boosted - base) - capDelta) < 1e-6);
      assert.ok(Math.abs((base - dropped) - capDelta) < 1e-6);
    },
  },
  {
    name: 'rating: actual wins above expected increases ability',
    run: () => {
      const next = updateAbilityAfterBasho({
        current: {
          ability: 100,
          form: 0,
          uncertainty: 1.1,
        },
        actualWins: 10,
        expectedWins: 7,
        age: 24,
        careerBashoCount: 40,
        currentRank: { division: 'Juryo', name: '十両', side: 'East', number: 3 },
        maxRank: { division: 'Juryo', name: '十両', side: 'East', number: 1 },
        absent: 0,
        recentRecords: [],
      });

      assert.ok(
        next.ability > 100,
        `Expected ability increase when actual > expected, got ${next.ability}`,
      );
    },
  },
  {
    name: 'rating: actual wins below expected decreases ability',
    run: () => {
      const next = updateAbilityAfterBasho({
        current: {
          ability: 100,
          form: 0,
          uncertainty: 1.1,
        },
        actualWins: 5,
        expectedWins: 8,
        age: 24,
        careerBashoCount: 40,
        currentRank: { division: 'Juryo', name: '十両', side: 'East', number: 3 },
        maxRank: { division: 'Juryo', name: '十両', side: 'East', number: 1 },
        absent: 0,
        recentRecords: [],
      });

      assert.ok(
        next.ability < 100,
        `Expected ability decrease when actual < expected, got ${next.ability}`,
      );
    },
  },
  {
    name: 'rating: mean reversion pulls ability toward rank baseline',
    run: () => {
      const rank: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 40 };
      const baseline = resolveRankBaselineAbility(rank);
      const currentAbility = baseline + 28;
      const next = updateAbilityAfterBasho({
        current: {
          ability: currentAbility,
          form: 0,
          uncertainty: 1.1,
        },
        actualWins: 4,
        expectedWins: 4,
        age: 25,
        careerBashoCount: 80,
        currentRank: rank,
        maxRank: rank,
        absent: 0,
        recentRecords: [],
      });

      assert.ok(next.ability < currentAbility);
      assert.ok(next.ability > baseline);
    },
  },
  {
    name: 'battle: clutch reversal does not flip overwhelming underdog losses',
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
        ability: 220,
        heightCm: 194,
        weightKg: 185,
      };
      const rng = sequenceRng([0.99, 0.03, 0.0]);
      const result = calculateBattleResult(
        rikishi,
        enemy,
        {
          day: 15,
          currentWins: 6,
          currentLosses: 8,
          consecutiveWins: 0,
          currentWinStreak: 0,
          currentLossStreak: 2,
          opponentWinStreak: 3,
          opponentLossStreak: 0,
          isLastDay: true,
          isYushoContention: true,
          titleImplication: 'DIRECT',
          previousResult: 'LOSS',
        },
        rng,
      );
      assert.equal(result.isWin, false);
    },
  },
  {
    name: 'battle: opponent metadata affects player-side win probability',
    run: () => {
      const rikishi = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 6 },
        ratingState: {
          ability: 102,
          form: 0,
          uncertainty: 1.1,
        },
      });
      const baseEnemy: EnemyStats = {
        shikona: '同格敵',
        rankValue: 6,
        power: 96,
        ability: 96,
        heightCm: 184,
        weightKg: 148,
      };
      const favorable = calculateBattleResult(
        rikishi,
        {
          ...baseEnemy,
          aptitudeProfile: { initialFactor: 0.7, growthFactor: 0.72, boutFactor: 0.7, longevityFactor: 0.85 },
          careerBand: 'WASHOUT',
          stagnation: { pressure: 2.6, makekoshiStreak: 3, lowWinRateStreak: 3, stuckBasho: 5, reboundBoost: 0 },
        },
        { day: 7, currentWins: 3, currentLosses: 3, consecutiveWins: 0, isLastDay: false, isYushoContention: false },
        () => 0.5,
      );
      const dangerous = calculateBattleResult(
        rikishi,
        {
          ...baseEnemy,
          aptitudeProfile: { initialFactor: 1.08, growthFactor: 1.1, boutFactor: 1.12, longevityFactor: 1.02 },
          careerBand: 'ELITE',
          stagnation: { pressure: 0, makekoshiStreak: 0, lowWinRateStreak: 0, stuckBasho: 0, reboundBoost: 0.1 },
        },
        { day: 7, currentWins: 3, currentLosses: 3, consecutiveWins: 0, isLastDay: false, isYushoContention: false },
        () => 0.5,
      );
      assert.ok(favorable.winProbability > dangerous.winProbability);
    },
  },
  {
    name: 'battle: kyoushinzou only applies in clutch contexts',
    run: () => {
      const base = createStatus({
        rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 4 },
      });
      const clutch = createStatus({
        rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 4 },
        traits: ['KYOUSHINZOU'],
      });
      const enemy: EnemyStats = {
        shikona: '上位敵',
        rankValue: 2,
        power: 108,
        ability: 108,
        heightCm: 188,
        weightKg: 158,
      };
      const regularBase = calculateBattleResult(
        base,
        enemy,
        { day: 4, currentWins: 1, currentLosses: 2, consecutiveWins: 0, isLastDay: false, isYushoContention: false },
        () => 0.5,
      );
      const regularClutch = calculateBattleResult(
        clutch,
        enemy,
        { day: 4, currentWins: 1, currentLosses: 2, consecutiveWins: 0, isLastDay: false, isYushoContention: false },
        () => 0.5,
      );
      const titleBase = calculateBattleResult(
        base,
        enemy,
        {
          day: 15,
          currentWins: 6,
          currentLosses: 7,
          consecutiveWins: 0,
          isLastDay: true,
          isYushoContention: true,
          titleImplication: 'DIRECT',
        },
        () => 0.5,
      );
      const titleClutch = calculateBattleResult(
        clutch,
        enemy,
        {
          day: 15,
          currentWins: 6,
          currentLosses: 7,
          consecutiveWins: 0,
          isLastDay: true,
          isYushoContention: true,
          titleImplication: 'DIRECT',
        },
        () => 0.5,
      );
      assert.equal(regularClutch.winProbability, regularBase.winProbability);
      assert.ok(titleClutch.winProbability > titleBase.winProbability);
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
    name: 'battle: kimarite alias normalized in v2',
    run: () => {
      const rikishi = createStatus({
        bodyType: 'SOPPU',
        tactics: 'TECHNIQUE',
        stats: {
          tsuki: 55,
          oshi: 40,
          kumi: 30,
          nage: 88,
          koshi: 35,
          deashi: 78,
          waza: 96,
          power: 42,
        },
      });
      const enemy: EnemyStats = {
        shikona: '技巧敵',
        rankValue: 5,
        power: 85,
        heightCm: 188,
        weightKg: 166,
        styleBias: 'GRAPPLE',
      };
      for (let i = 0; i < 30; i += 1) {
        const result = calculateBattleResult(rikishi, enemy, undefined, lcg(300 + i));
        assert.ok(result.kimarite !== 'すくい投げ');
      }
    },
  },
  {
    name: 'battle: kimariteDelta clamp is reflected in v2 winProbability',
    run: () => {
      const rikishi = createStatus({
        stats: {
          tsuki: 99,
          oshi: 99,
          kumi: 99,
          nage: 99,
          koshi: 99,
          deashi: 99,
          waza: 99,
          power: 99,
        },
      });
      const enemy: EnemyStats = {
        shikona: '均衡敵',
        rankValue: 4,
        power: 98,
        ability: 98,
        heightCm: 186,
        weightKg: 154,
        styleBias: 'BALANCE',
      };
      const v2 = calculateBattleResult(rikishi, enemy, undefined, () => 0.5);
      const v3 = calculateBattleResult(rikishi, enemy, undefined, () => 0.5);
      assert.ok(Math.abs(v3.winProbability - v2.winProbability) <= 0.061);
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
    name: 'yusho: playoff uses ability beyond rank seed',
    run: () => {
      const resolution = resolveYushoResolution(
        [
          { id: 'A', wins: 12, losses: 3, rankScore: 3, power: 82, ability: 82 },
          { id: 'B', wins: 12, losses: 3, rankScore: 7, power: 125, ability: 130 },
        ],
        () => 0.8,
      );
      assert.equal(resolution.winnerId, 'B');
      assert.equal(resolution.playoffParticipantIds.length, 2);
      assert.equal(resolution.junYushoIds.has('A'), true);
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
          tsuki: 51.64,
          oshi: 51.64,
          kumi: 51.79,
          nage: 51.64,
          koshi: 51.79,
          deashi: 51.79,
          waza: 51.64,
          power: 51.64,
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
    name: 'growth: healthy young rikishi regains weight toward baseline gradually',
    run: () => {
      const result = applyGrowth(createStatus({
        age: 26,
        bodyMetrics: { heightCm: 182, weightKg: 145 },
        buildSummary: {
          oyakataName: '大寿',
          amateurBackground: 'HIGH_SCHOOL',
          bodyConstitution: 'BALANCED_FRAME',
          heightPotentialCm: 184,
          weightPotentialKg: 150,
          reachDeltaCm: 0,
          spentPoints: 40,
          remainingPoints: 10,
          debtCount: 0,
          careerBandLabel: '標準',
        },
      }), null, false, () => 0.5);
      assert.ok(Math.abs(result.bodyMetrics.weightKg - 146.2) < 0.001);
    },
  },
  {
    name: 'growth: older rikishi regains weight more slowly than young rikishi',
    run: () => {
      const baseSummary = {
        oyakataName: '大寿',
        amateurBackground: 'HIGH_SCHOOL' as const,
        bodyConstitution: 'BALANCED_FRAME' as const,
        heightPotentialCm: 184,
        weightPotentialKg: 150,
        reachDeltaCm: 0,
        spentPoints: 40,
        remainingPoints: 10,
        debtCount: 0,
        careerBandLabel: '標準',
      };
      const young = applyGrowth(createStatus({
        age: 26,
        bodyMetrics: { heightCm: 182, weightKg: 145 },
        buildSummary: baseSummary,
      }), null, false, () => 0.5);
      const veteran = applyGrowth(createStatus({
        age: 34,
        bodyMetrics: { heightCm: 182, weightKg: 145 },
        buildSummary: baseSummary,
      }), null, false, () => 0.5);
      assert.ok(young.bodyMetrics.weightKg > veteran.bodyMetrics.weightKg);
      assert.ok(Math.abs(veteran.bodyMetrics.weightKg - 145.6) < 0.001);
    },
  },
  {
    name: 'growth: 22-year-old entrant does not gain height after debut',
    run: () => {
      const result = applyGrowth(createStatus({
        entryAge: 22,
        age: 22,
        bodyMetrics: { heightCm: 188, weightKg: 149 },
        buildSummary: {
          oyakataName: '大寿',
          amateurBackground: 'COLLEGE_YOKOZUNA',
          bodyConstitution: 'BALANCED_FRAME',
          heightPotentialCm: 191,
          weightPotentialKg: 165,
          reachDeltaCm: 0,
          spentPoints: 40,
          remainingPoints: 10,
          debtCount: 0,
          careerBandLabel: '標準',
        },
      }), null, false, () => 0.5);
      assert.equal(result.bodyMetrics.heightCm, 188);
      assert.ok(result.bodyMetrics.weightKg > 149);
    },
  },
  {
    name: 'growth: severe injury and near-full absence cause sharp weight loss',
    run: () => {
      const heavy = applyGrowth(createStatus({
        age: 27,
        bodyMetrics: { heightCm: 182, weightKg: 150 },
        buildSummary: {
          oyakataName: '大寿',
          amateurBackground: 'HIGH_SCHOOL',
          bodyConstitution: 'BALANCED_FRAME',
          heightPotentialCm: 184,
          weightPotentialKg: 150,
          reachDeltaCm: 0,
          spentPoints: 40,
          remainingPoints: 10,
          debtCount: 0,
          careerBandLabel: '標準',
        },
        injuries: [
          {
            id: 'inj-heavy',
            type: 'KNEE',
            name: '重度右膝半月板損傷',
            severity: 8,
            status: 'ACUTE',
            occurredAt: { year: 2026, month: 1 },
          },
        ],
        injuryLevel: 8,
        history: {
          ...createStatus().history,
          records: [
            createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 10, side: 'East' }, 0, 0, 15),
          ],
        },
      }), null, false, () => 0.5);
      const light = applyGrowth(createStatus({
        age: 27,
        bodyMetrics: { heightCm: 182, weightKg: 150 },
        buildSummary: {
          oyakataName: '大寿',
          amateurBackground: 'HIGH_SCHOOL',
          bodyConstitution: 'BALANCED_FRAME',
          heightPotentialCm: 184,
          weightPotentialKg: 150,
          reachDeltaCm: 0,
          spentPoints: 40,
          remainingPoints: 10,
          debtCount: 0,
          careerBandLabel: '標準',
        },
        injuries: [
          {
            id: 'inj-light',
            type: 'KNEE',
            name: '軽度右膝痛',
            severity: 3,
            status: 'ACUTE',
            occurredAt: { year: 2026, month: 1 },
          },
        ],
        injuryLevel: 3,
      }), null, false, () => 0.5);
      assert.ok(Math.abs(heavy.bodyMetrics.weightKg - 141) < 0.001);
      assert.ok(light.bodyMetrics.weightKg > heavy.bodyMetrics.weightKg);
    },
  },
  {
    name: 'growth: consecutive absences compound weight loss',
    run: () => {
      const rank: Rank = { division: 'Makuuchi', name: '前頭', number: 10, side: 'East' };
      const single = applyGrowth(createStatus({
        age: 26,
        bodyMetrics: { heightCm: 182, weightKg: 150 },
        buildSummary: {
          oyakataName: '大寿',
          amateurBackground: 'HIGH_SCHOOL',
          bodyConstitution: 'BALANCED_FRAME',
          heightPotentialCm: 184,
          weightPotentialKg: 150,
          reachDeltaCm: 0,
          spentPoints: 40,
          remainingPoints: 10,
          debtCount: 0,
          careerBandLabel: '標準',
        },
        history: {
          ...createStatus().history,
          records: [createBashoRecord(rank, 0, 0, 15)],
        },
      }), null, false, () => 0.5);
      const consecutive = applyGrowth(createStatus({
        age: 26,
        bodyMetrics: { heightCm: 182, weightKg: 150 },
        buildSummary: {
          oyakataName: '大寿',
          amateurBackground: 'HIGH_SCHOOL',
          bodyConstitution: 'BALANCED_FRAME',
          heightPotentialCm: 184,
          weightPotentialKg: 150,
          reachDeltaCm: 0,
          spentPoints: 40,
          remainingPoints: 10,
          debtCount: 0,
          careerBandLabel: '標準',
        },
        history: {
          ...createStatus().history,
          records: [createBashoRecord(rank, 0, 0, 15), createBashoRecord(rank, 0, 0, 15)],
        },
      }), null, false, () => 0.5);
      assert.ok(consecutive.bodyMetrics.weightKg < single.bodyMetrics.weightKg);
      assert.ok(Math.abs(single.bodyMetrics.weightKg - 146.4) < 0.001);
      assert.ok(Math.abs(consecutive.bodyMetrics.weightKg - 144.9) < 0.001);
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
      const result = runBashoDetailed(status, 2026, 1, () => 0.01, world);
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
    name: 'simulation: healthy lower-division player finishes seven bouts in reproduced shortage seeds',
    run: () => {
      const cases: Array<{ seed: number; rank: Rank }> = [
        { seed: 56, rank: { division: 'Makushita', name: '幕下', side: 'East', number: 1 } },
        { seed: 1, rank: { division: 'Makushita', name: '幕下', side: 'East', number: 59 } },
        { seed: 1, rank: { division: 'Jonidan', name: '序二段', side: 'East', number: 99 } },
      ];

      for (const testCase of cases) {
        const rng = lcg(testCase.seed);
        const world = createSimulationWorld(rng);
        const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
        const status = createStatus({ rank: testCase.rank, traits: ['BUJI_KORE_MEIBA'] });
        const result = runBashoDetailed(status, 2026, 1, rng, world, lowerWorld);
        const diagnostics = result.torikumiDiagnostics;
        const healthyUnresolvedDays = diagnostics?.playerHealthyUnresolvedDays ?? [];
        const playerScheduleViolations = diagnostics?.scheduleViolations.filter((entry) =>
          entry.participantIds.includes('PLAYER')) ?? [];
        const actualBouts = result.playerBoutDetails.filter((bout) => bout.result !== 'ABSENT');

        assert.ok(
          healthyUnresolvedDays.length === 0,
          `Expected no healthy unresolved days for ${testCase.rank.division}${testCase.rank.number ?? ''} seed ${testCase.seed}`,
        );
        assert.ok(
          playerScheduleViolations.length === 0,
          `Expected PLAYER to avoid unresolved leftovers for ${testCase.rank.division}${testCase.rank.number ?? ''} seed ${testCase.seed}`,
        );
        assert.ok(
          result.playerBoutDetails.every((bout) => bout.result !== 'ABSENT'),
          `Expected healthy player to avoid ABSENT rows for ${testCase.rank.division}${testCase.rank.number ?? ''} seed ${testCase.seed}`,
        );
        assert.ok(
          actualBouts.length === 7,
          `Expected seven actual bouts for ${testCase.rank.division}${testCase.rank.number ?? ''} seed ${testCase.seed}`,
        );
      }
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
      const result = runBashoDetailed(status, 2026, 1, () => 0.01, world);
      const kinboshi = result.playerRecord.kinboshi ?? 0;
      assert.ok(kinboshi >= 0);
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
    name: 'engine: makushita boundary resolver prioritizes sekitori promotion rank',
    run: () => {
      const resolved = resolveBoundaryAssignedRankForCurrentDivision(
        { division: 'Makushita', name: '幕下', side: 'East', number: 2 },
        { division: 'Juryo', name: '十両', side: 'East', number: 14 },
        { division: 'Makushita', name: '幕下', side: 'West', number: 3 },
      );
      assert.ok(Boolean(resolved), 'Expected resolved boundary rank');
      assert.equal(resolved?.division, 'Juryo');
      assert.equal(resolved?.name, '十両');
      assert.equal(resolved?.number, 14);
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
            yieldControl: async () => { },
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
    name: 'simulation: model request keeps explicit model version in new runs',
    run: async () => {
      for (const requested of ['v3'] as const) {
        const initial = createStatus({
          age: 20,
          entryAge: 20,
          rank: { division: 'Makushita', name: '幕下', side: 'East', number: 25 },
          history: {
            records: [],
            events: [],
            maxRank: { division: 'Makushita', name: '幕下', side: 'East', number: 25 },
            totalWins: 0,
            totalLosses: 0,
            totalAbsent: 0,
            yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
            kimariteTotal: {},
          },
        });
        const engine = createSimulationEngine(
          {
            initialStats: initial,
            oyakata: null,
            simulationModelVersion: requested,
          },
          {
            random: lcg(1986),
            getCurrentYear: () => 2026,
            yieldControl: async () => { },
          },
        );

        const step = expectBashoStep(
          await engine.runNextBasho(),
          `simulation model normalization (${requested})`,
        );

        assert.equal(step.diagnostics?.simulationModelVersion, requested);
        assert.ok(
          step.banzukeDecisions.every((decision) => decision.modelVersion === requested),
          `Expected ${requested} modelVersion logs`,
        );
      }
    },
  },
  {
    name: 'simulation: default new run model version is v3',
    run: async () => {
      const initial = createStatus({
        age: 20,
        entryAge: 20,
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 25 },
      });
      const engine = createSimulationEngine(
        {
          initialStats: initial,
          oyakata: null,
        },
        {
          random: lcg(2027),
          getCurrentYear: () => 2026,
          yieldControl: async () => { },
        },
      );

      const step = expectBashoStep(await engine.runNextBasho(), 'default model version');
      assert.equal(step.diagnostics?.simulationModelVersion, 'v3');
    },
  },
  {
    name: 'simulation: legacy model values normalize to v3 on load',
    run: () => {
      assert.equal(normalizeSimulationModelVersion('legacy-v6'), 'v3');
      assert.equal(normalizeSimulationModelVersion('realism-v1'), 'v3');
      assert.equal(normalizeSimulationModelVersion('unified-v1'), 'v3');
      assert.equal(normalizeSimulationModelVersion('unified-v2-kimarite'), 'v3');
      assert.equal(normalizeSimulationModelVersion('unified-v3-variance'), 'v3');
      assert.equal(normalizeSimulationModelVersion(undefined), 'v3');
      assert.equal(normalizeSimulationModelVersion('unknown-model'), 'v3');
    },
  },
  {
    name: 'simulation: new run model normalizer defaults to v3',
    run: () => {
      assert.equal(normalizeNewRunModelVersion(undefined), 'v3');
      assert.equal(normalizeNewRunModelVersion('unknown-model'), 'v3');
      assert.equal(normalizeNewRunModelVersion('unified-v2-kimarite'), 'v3');
      assert.equal(normalizeNewRunModelVersion('unified-v3-variance'), 'v3');
    },
  },
  {
    name: 'variance: same seed resolves identical bashoFormDelta and event',
    run: () => {
      const rollA = resolveBashoFormDelta({
        uncertainty: 2.4,
        volatility: 1.6,
        rng: lcg(77),
      });
      const rollB = resolveBashoFormDelta({
        uncertainty: 2.4,
        volatility: 1.6,
        rng: lcg(77),
      });
      const rollC = resolveBashoFormDelta({
        uncertainty: 2.4,
        volatility: 1.6,
        rng: lcg(78),
      });

      assert.deepEqual(rollA, rollB);
      assert.ok(
        rollA.bashoFormDelta !== rollC.bashoFormDelta || rollA.event !== rollC.event,
        'Different seeds should usually produce different variance outcomes',
      );
    },
  },
  {
    name: 'variance: tail event thresholds trigger expected event bands',
    run: () => {
      const cases: Array<{ tailRoll: number; expected: string }> = [
        { tailRoll: 0.049, expected: 'MAJOR_SLUMP' },
        { tailRoll: 0.05, expected: 'MAJOR_SURGE' },
        { tailRoll: 0.09, expected: 'MILD_SLUMP' },
        { tailRoll: 0.19, expected: 'MILD_SURGE' },
        { tailRoll: 0.28, expected: 'NONE' },
      ];

      for (const testCase of cases) {
        const roll = resolveBashoFormDelta({
          uncertainty: 0,
          volatility: 0,
          rng: sequenceRng([1, 0.5, testCase.tailRoll, 0]),
        });
        assert.equal(roll.event, testCase.expected);
      }
    },
  },
  {
    name: 'simulation engine: completed result is sticky after retirement',
    run: async () => {
      const initial = createStatus({
        age: 50,
        entryAge: 18,
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
      });
      const engine = createSimulationEngine(
        { initialStats: initial, oyakata: null },
        {
          random: lcg(2026),
          getCurrentYear: () => 2026,
          yieldControl: async () => { },
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
    name: 'simulation model normalization',
    run: async () => {
      const RUNS: Array<{ requested: any; expected: any }> = [
        { requested: 'v3', expected: 'v3' },
        { requested: undefined, expected: 'v3' },
        { requested: 'unified-v2-kimarite', expected: 'v3' },
        { requested: 'unified-v3-variance', expected: 'v3' },
      ];
      for (const { requested, expected } of RUNS) {
        const initial = createStatus({
          age: 20,
          entryAge: 20,
          rank: { division: 'Makushita', name: '幕下', side: 'East', number: 25 },
          history: {
            records: [],
            events: [],
            maxRank: { division: 'Makushita', name: '幕下', side: 'East', number: 25 },
            totalWins: 0,
            totalLosses: 0,
            totalAbsent: 0,
            yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
            kimariteTotal: {},
          },
        });
        const engine = createSimulationEngine(
          {
            initialStats: initial,
            oyakata: null,
            simulationModelVersion: requested as any,
          },
          {
            random: lcg(1986),
            getCurrentYear: () => 2026,
            yieldControl: async () => { },
          },
        );

        const step = expectBashoStep(
          await engine.runNextBasho(),
          `simulation model normalization (${requested})`,
        );

        assert.equal(step.diagnostics?.simulationModelVersion, expected);
        assert.ok(
          step.banzukeDecisions.every((decision) => decision.modelVersion === expected),
        );
      }
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
          yieldControl: async () => { },
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

      const sameDivisionRows = step.npcBashoRecords
        .filter((row) => row.division === 'Makushita')
        .map((row) => ({
          division: row.division,
          rankName: row.rankName,
          rankNumber: row.rankNumber,
          rankSide: row.rankSide,
        }));
      sameDivisionRows.push({
        division: step.playerRecord.rank.division,
        rankName: step.playerRecord.rank.name,
        rankNumber: step.playerRecord.rank.number,
        rankSide: step.playerRecord.rank.side,
      });
      const rankKeys = sameDivisionRows.map((row) =>
        `${row.division}:${row.rankName}:${row.rankNumber ?? ''}:${row.rankSide ?? ''}`);
      assert.ok(
        new Set(rankKeys).size === rankKeys.length,
        'Expected lower-division result rows to keep rank keys unique around the player',
      );
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
          yieldControl: async () => { },
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
    name: 'simulation: logic-lab summary includes per-career timing totals and phase share',
    run: async () => {
      const { summary, logs } = await runLogicLabToEnd({
        presetId: LOGIC_LAB_DEFAULT_PRESET,
        seed: 7331,
        maxBasho: 8,
      });
      const phaseTotalSum = (Object.values(summary.phaseTotalsMs) as number[])
        .reduce((sum, value) => sum + value, 0);
      const phaseShareSum = (Object.values(summary.phaseShare) as number[])
        .reduce((sum, value) => sum + value, 0);

      assert.equal(summary.bashoCount, logs.length);
      assert.ok(summary.totalMs > 0, `Expected totalMs > 0, got ${summary.totalMs}`);
      assert.equal(summary.avgMsPerBasho, summary.totalMs / summary.bashoCount);
      assert.ok(summary.slowestBashoMs >= summary.avgMsPerBasho);
      assert.ok(Math.abs(phaseTotalSum - summary.totalMs) < 1e-6);
      assert.ok(Math.abs(phaseShareSum - 1) < 1e-6);
      assert.ok(summary.phaseTotalsMs.basho_simulation > 0);
    },
  },
  {
    name: 'simulation: offscreen sekitori lite path preserves roster sizes and result shapes',
    run: () => {
      const rng = lcg(44);
      const world = createSimulationWorld(rng);

      simulateOffscreenSekitoriBasho(world, rng);

      assert.equal(world.rosters.Makuuchi.length, 42);
      assert.equal(world.rosters.Juryo.length, 28);
      assert.equal(world.lastBashoResults.Makuuchi?.length, 42);
      assert.equal(world.lastBashoResults.Juryo?.length, 28);
      assertUniqueTopRosterSlots(world, 'offscreen-sekitori-lite');
      assert.ok(
        world.lastBashoResults.Makuuchi?.every((row) => row.rank?.division === 'Makuuchi') ?? false,
        'Expected all offscreen Makuuchi records to stay in Makuuchi',
      );
      assert.ok(
        world.lastBashoResults.Juryo?.every((row) => row.rank?.division === 'Juryo') ?? false,
        'Expected all offscreen Juryo records to stay in Juryo',
      );
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
          yieldControl: async () => { },
        },
      );

      let observedSteps = 0;
      for (let i = 0; i < 40; i += 1) {
        const step = await engine.runNextBasho();
        const progress = step.progress as SimulationProgressSnapshot;
        observedSteps += 1;
        assert.equal(progress.makuuchi.length, 42);
        assert.equal(progress.juryo.length, 28);
        assertUniqueProgressSlots(progress.makuuchi, 'Makuuchi', `engine-progress-${i}`);
        assertUniqueProgressSlots(progress.juryo, 'Juryo', `engine-progress-${i}`);
        assert.equal(progress.makuuchiSlots, 42);
        assert.equal(progress.juryoSlots, 28);
        assert.equal(progress.makuuchiActive, 42);
        assert.equal(progress.juryoActive, 28);
        assert.ok(progress.sanshoTotal >= 0);
        assert.ok(progress.shukunCount >= 0);
        assert.ok(progress.kantoCount >= 0);
        assert.ok(progress.ginoCount >= 0);
        assert.ok(progress.lastCommitteeWarnings >= 0);
        assert.ok(progress.divisionHeadcount.Jonokuchi >= 0);
        assert.ok(progress.divisionActiveHeadcount.Jonidan >= 0);
        assert.equal(
          progress.sanshoTotal,
          progress.shukunCount + progress.kantoCount + progress.ginoCount,
        );
        if (step.kind === 'COMPLETED') break;
      }
      assert.ok(observedSteps >= 1);
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
      const leagueFlow = createLeagueFlowRuntime(rng);
      const { world, lowerWorld } = leagueFlow;
      const status = createStatus({
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
      });
      const months = [1, 3, 5, 7, 9, 11] as const;
      let seq = 0;

      for (let i = 0; i < 360; i += 1) {
        const month = months[i % months.length];
        const year = 2026 + Math.floor(i / 6);
        prepareLeagueForBasho(leagueFlow, rng, year, seq, month);

        runBashoDetailed(status, year, month, rng, world, lowerWorld);
        advanceTopDivisionBanzuke(world);
        applyLeaguePromotionFlow(leagueFlow, rng);

        seq += 1;
        advanceLeaguePopulation(leagueFlow, rng, seq, month);

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
        assertUniqueTopRosterSlots(world, `simulation-loop-${i}`);
        assertActiveShikonaUnique(world.npcRegistry, `simulation-loop-${i}`);
      }
    },
  },
  {
    name: 'population realism: 5 seed x 20 year heisei band stays in range',
    suite: 'verification',
    run: async () => {
      const aggregate = await runObservationVerificationSample(
        Array.from({ length: 5 }, (_, index) => ({
          seed: 9601 + index,
          startYear: 2026,
          initialStatus: createStatus({
            age: 18,
            entryAge: 18,
            rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
          }),
        })),
      );
      const totalHeadcountReference =
        HEISEI_POPULATION_CALIBRATION.bashoLevelReference.totalHeadcount;
      const totalSwingReference = HEISEI_POPULATION_CALIBRATION.annualTotalSwing;
      const jonidanSwingReference = HEISEI_POPULATION_CALIBRATION.annualJonidanSwing;
      const jonokuchiSwingReference = HEISEI_POPULATION_CALIBRATION.annualJonokuchiSwing;

      assert.ok(
        aggregate.population.annualTotalMedian >= totalHeadcountReference.p10 &&
        aggregate.population.annualTotalMedian <= totalHeadcountReference.p90,
        `Unexpected total median: ${aggregate.population.annualTotalMedian}`,
      );
      assert.ok(
        aggregate.population.annualAbsDeltaMedian >= 10 &&
        aggregate.population.annualAbsDeltaMedian <= 18,
        `Unexpected abs(delta) median: ${aggregate.population.annualAbsDeltaMedian}`,
      );
      assert.ok(
        aggregate.population.annualAbsDeltaP90 >= 30 &&
        aggregate.population.annualAbsDeltaP90 <= 50,
        `Unexpected abs(delta) p90: ${aggregate.population.annualAbsDeltaP90}`,
      );
      assert.ok(
        aggregate.population.annualSwingMedian >= totalSwingReference.p10 &&
        aggregate.population.annualSwingMedian <= totalSwingReference.p90,
        `Unexpected annual swing median: ${aggregate.population.annualSwingMedian}`,
      );
      assert.ok(
        aggregate.population.annualSwingP90 >= totalSwingReference.p50 &&
        aggregate.population.annualSwingP90 <= totalSwingReference.max,
        `Unexpected annual swing p90: ${aggregate.population.annualSwingP90}`,
      );
      assert.ok(
        aggregate.population.annualJonidanSwingMedian >= jonidanSwingReference.p10 &&
        aggregate.population.annualJonidanSwingMedian <= jonidanSwingReference.p90,
        `Unexpected Jonidan swing median: ${aggregate.population.annualJonidanSwingMedian}`,
      );
      assert.ok(
        aggregate.population.annualJonokuchiSwingMedian >= jonokuchiSwingReference.p10 &&
        aggregate.population.annualJonokuchiSwingMedian <= jonokuchiSwingReference.p90,
        `Unexpected Jonokuchi swing median: ${aggregate.population.annualJonokuchiSwingMedian}`,
      );
    },
  },
  {
    name: 'observation: career summary and runtime snapshot stay aligned',
    run: async () => {
      const result = await runCareerObservation({
        seed: 777,
        startYear: 2026,
        initialStatus: createStatus({
          age: 18,
          entryAge: 18,
          rank: { division: 'Makushita', name: '幕下', side: 'East', number: 18 },
        }),
      });

      const summary: CareerObservationSummary = result.summary;
      assert.equal(summary.careerOutcome.bashoCount, result.finalStatus.history.records.length);
      assert.equal(summary.rankOutcome.maxRank.division, result.finalStatus.history.maxRank.division);
      assert.equal(summary.rankOutcome.maxRank.name, result.finalStatus.history.maxRank.name);
      assert.equal(result.runtime.actor.status.history.records.length, result.finalStatus.history.records.length);
      assert.ok(result.frames.length >= 1, 'Expected at least one observation frame');
      assert.ok(
        result.frames.every((frame) => frame.runtime.bundle.id === result.runtime.bundle.id),
        'Expected stable bundle id across observation frames',
      );
    },
  },
  {
    name: 'retirement: player retention modifier is neutral only before age 24 and 18 basho',
    run: () => {
      const modifier = resolvePlayerRetentionModifier({
        age: 23,
        careerBashoCount: 17,
        currentDivision: 'Makushita',
        currentRank: { division: 'Makushita', name: '幕下', number: 15, side: 'East' },
        maxRank: { division: 'Makushita', name: '幕下', number: 2, side: 'East' },
        recentRecords: Array.from({ length: 6 }, () =>
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 15, side: 'East' }, 2, 5, 0),
        ),
        fullKyujoStreak: 0,
        formerSekitori: false,
      });
      assert.equal(modifier, 1);
    },
  },
  {
    name: 'retirement: pre-6 stagnation pressure stays neutral without double full kyujo',
    run: () => {
      const modifier = resolvePlayerRetentionModifier({
        age: 26,
        careerBashoCount: 4,
        currentDivision: 'Makushita',
        currentRank: { division: 'Makushita', name: '幕下', number: 22, side: 'East' },
        maxRank: { division: 'Makushita', name: '幕下', number: 10, side: 'East' },
        recentRecords: [
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 2, 5, 0),
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 3, 4, 0),
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 2, 5, 0),
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 0, 0, 7),
        ],
        fullKyujoStreak: 1,
        formerSekitori: false,
      });
      assert.equal(modifier, 1);
    },
  },
  {
    name: 'retirement: pre-6 double full kyujo still raises retention modifier',
    run: () => {
      const modifier = resolvePlayerRetentionModifier({
        age: 26,
        careerBashoCount: 4,
        currentDivision: 'Makushita',
        currentRank: { division: 'Makushita', name: '幕下', number: 22, side: 'East' },
        maxRank: { division: 'Makushita', name: '幕下', number: 10, side: 'East' },
        recentRecords: [
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 2, 5, 0),
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 2, 5, 0),
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 0, 0, 7),
          createBashoRecord({ division: 'Makushita', name: '幕下', number: 22, side: 'East' }, 0, 0, 7),
        ],
        fullKyujoStreak: 2,
        formerSekitori: false,
      });
      assert.ok(modifier > 1, `Expected double full kyujo modifier > 1, got ${modifier}`);
    },
  },
  {
    name: 'retirement: player retention modifier rises for non-sekitori stagnation and kyujo streak',
    run: () => {
      const currentRank: Rank = { division: 'Makushita', name: '幕下', number: 35, side: 'East' };
      const stagnant = resolvePlayerRetentionModifier({
        age: 32,
        careerBashoCount: 72,
        currentDivision: 'Makushita',
        currentRank,
        maxRank: currentRank,
        recentRecords: [
          createBashoRecord(currentRank, 2, 5, 0),
          createBashoRecord(currentRank, 3, 4, 0),
          createBashoRecord(currentRank, 1, 6, 0),
          createBashoRecord(currentRank, 0, 0, 7),
          createBashoRecord(currentRank, 0, 0, 7),
          createBashoRecord(currentRank, 2, 5, 0),
        ],
        fullKyujoStreak: 2,
        formerSekitori: false,
      });
      const neutral = resolvePlayerRetentionModifier({
        age: 32,
        careerBashoCount: 72,
        currentDivision: 'Makushita',
        currentRank,
        maxRank: currentRank,
        recentRecords: Array.from({ length: 6 }, () => createBashoRecord(currentRank, 4, 3, 0)),
        fullKyujoStreak: 0,
        formerSekitori: false,
      });
      assert.ok(stagnant > neutral, `Expected stagnant modifier > neutral, got ${stagnant} <= ${neutral}`);
    },
  },
  {
    name: 'retirement: makushita top15 stagnation adds extra retention pressure',
    run: () => {
      const top15Rank: Rank = { division: 'Makushita', name: '幕下', number: 12, side: 'East' };
      const lowerRank: Rank = { division: 'Makushita', name: '幕下', number: 28, side: 'East' };
      const stagnation = resolvePlayerStagnationState({
        age: 29,
        careerBashoCount: 40,
        currentRank: top15Rank,
        maxRank: top15Rank,
        recentRecords: [
          createBashoRecord(top15Rank, 3, 4, 0),
          createBashoRecord(top15Rank, 2, 5, 0),
          createBashoRecord(top15Rank, 3, 4, 0),
          createBashoRecord(top15Rank, 0, 0, 7),
        ],
        formerSekitori: false,
      });
      const topPressure = resolvePlayerStagnationRetentionPressure({
        currentDivision: 'Makushita',
        currentRank: top15Rank,
        stagnation,
      });
      const lowerPressure = resolvePlayerStagnationRetentionPressure({
        currentDivision: 'Makushita',
        currentRank: lowerRank,
        stagnation: {
          ...stagnation,
          isMakushitaTop15: false,
          isMakushitaTop10: false,
        },
      });
      assert.ok(topPressure > lowerPressure, `Expected top15 pressure > lower pressure, got ${topPressure} <= ${lowerPressure}`);
    },
  },
  {
    name: 'retirement: critical top15 non-sekitori pressure reaches 3.75x before clamp',
    run: () => {
      const critical = resolvePlayerStagnationRetentionPressure({
        currentDivision: 'Makushita',
        currentRank: { division: 'Makushita', name: '幕下', number: 12, side: 'East' },
        stagnation: {
          band: 'CRITICAL',
          badResultCount: 5,
          fullKyujoStreak: 2,
          isMakushitaTop15: true,
          isMakushitaTop10: false,
          graceApplied: false,
        },
      });
      assert.equal(critical, 3.75);
    },
  },
  {
    name: 'retirement: profile bias ordering is EARLY_EXIT > STANDARD > IRONMAN',
    run: () => {
      const baseInput = {
        age: 20,
        injuryLevel: 2,
        currentDivision: 'Makushita' as const,
        isFormerSekitori: false,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 0,
        retirementBias: 1,
        careerBashoCount: 40,
        careerWinRate: 0.47,
      };
      const early = resolveRetirementChance({ ...baseInput, profile: 'EARLY_EXIT' });
      const standard = resolveRetirementChance({ ...baseInput, profile: 'STANDARD' });
      const ironman = resolveRetirementChance({ ...baseInput, profile: 'IRONMAN' });
      assert.ok(early > standard, `Expected EARLY_EXIT > STANDARD, got ${early} <= ${standard}`);
      assert.ok(standard > ironman, `Expected STANDARD > IRONMAN, got ${standard} <= ${ironman}`);
    },
  },
  {
    name: 'retirement: hazard group age ordering keeps non-sekitori highest and active-sekitori lowest',
    run: () => {
      const common = {
        injuryLevel: 1,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 0,
        profile: 'STANDARD' as const,
        retirementBias: 1,
        careerBashoCount: 40,
        careerWinRate: 0.5,
      };
      const nonSekitori = resolveRetirementChance({
        ...common,
        age: 24,
        currentDivision: 'Makushita',
        isFormerSekitori: false,
      });
      const activeSekitori = resolveRetirementChance({
        ...common,
        age: 30,
        currentDivision: 'Juryo',
        isFormerSekitori: true,
      });
      const formerSekitoriLower = resolveRetirementChance({
        ...common,
        age: 30,
        currentDivision: 'Makushita',
        isFormerSekitori: true,
      });
      assert.ok(
        nonSekitori > formerSekitoriLower,
        `Expected NON_SEKITORI > FORMER_SEKITORI_LOWER, got ${nonSekitori} <= ${formerSekitoriLower}`,
      );
      assert.ok(
        formerSekitoriLower > activeSekitori,
        `Expected FORMER_SEKITORI_LOWER > ACTIVE_SEKITORI, got ${formerSekitoriLower} <= ${activeSekitori}`,
      );
    },
  },
  {
    name: 'retirement: makekoshi penalty increase is stronger for non-sekitori than former sekitori lower',
    run: () => {
      const nonBase = resolveRetirementChance({
        age: 26,
        injuryLevel: 0,
        currentDivision: 'Makushita',
        isFormerSekitori: false,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 0,
        profile: 'STANDARD',
        retirementBias: 1,
        careerBashoCount: 40,
        careerWinRate: 0.48,
      });
      const nonWithStreak = resolveRetirementChance({
        age: 26,
        injuryLevel: 0,
        currentDivision: 'Makushita',
        isFormerSekitori: false,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 6,
        profile: 'STANDARD',
        retirementBias: 1,
        careerBashoCount: 40,
        careerWinRate: 0.48,
      });
      const formerBase = resolveRetirementChance({
        age: 26,
        injuryLevel: 0,
        currentDivision: 'Makushita',
        isFormerSekitori: true,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 0,
        profile: 'STANDARD',
        retirementBias: 1,
        careerBashoCount: 24,
        careerWinRate: 0.48,
      });
      const formerWithStreak = resolveRetirementChance({
        age: 26,
        injuryLevel: 0,
        currentDivision: 'Makushita',
        isFormerSekitori: true,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 6,
        profile: 'STANDARD',
        retirementBias: 1,
        careerBashoCount: 24,
        careerWinRate: 0.48,
      });
      const nonDelta = nonWithStreak - nonBase;
      const formerDelta = formerWithStreak - formerBase;
      assert.ok(nonDelta > formerDelta, `Expected non-sekitori delta > former-sekitori delta, got ${nonDelta} <= ${formerDelta}`);
    },
  },
  {
    name: 'retirement: weak lower-division career bands no longer receive survival protection',
    run: () => {
      const base = {
        age: 27,
        injuryLevel: 1,
        currentDivision: 'Makushita' as const,
        isFormerSekitori: false,
        consecutiveAbsence: 1,
        consecutiveMakekoshi: 4,
        profile: 'STANDARD' as const,
        retirementBias: 1,
        careerBashoCount: 72,
        careerWinRate: 0.45,
        stagnationPressure: 2.2,
      };
      const standard = resolveRetirementChance({
        ...base,
        careerBand: 'STANDARD',
      });
      const grinder = resolveRetirementChance({
        ...base,
        careerBand: 'GRINDER',
      });
      const washout = resolveRetirementChance({
        ...base,
        careerBand: 'WASHOUT',
      });
      assert.ok(grinder > standard, `Expected GRINDER hazard > STANDARD, got ${grinder} <= ${standard}`);
      assert.ok(washout > grinder, `Expected WASHOUT hazard > GRINDER, got ${washout} <= ${grinder}`);
    },
  },
  {
    name: 'retirement: former sekitori low win-rate longevity protection lowers hazard',
    run: () => {
      const base = {
        age: 34,
        injuryLevel: 1,
        currentDivision: 'Makushita' as const,
        isFormerSekitori: true,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 5,
        profile: 'STANDARD' as const,
        retirementBias: 1,
        careerBashoCount: 100,
      };
      const protectedChance = resolveRetirementChance({
        ...base,
        careerWinRate: 0.49,
      });
      const unprotectedChance = resolveRetirementChance({
        ...base,
        careerWinRate: 0.51,
      });
      assert.ok(
        protectedChance < unprotectedChance,
        `Expected low win-rate protection to lower hazard, got ${protectedChance} >= ${unprotectedChance}`,
      );
    },
  },
  {
    name: 'retirement: ironman losing protection triggers from 100 basho onward',
    run: () => {
      const base = {
        age: 36,
        injuryLevel: 2,
        currentDivision: 'Makushita' as const,
        isFormerSekitori: true,
        consecutiveAbsence: 0,
        consecutiveMakekoshi: 6,
        profile: 'IRONMAN' as const,
        retirementBias: 1,
        careerWinRate: 0.49,
      };
      const protectedChance = resolveRetirementChance({
        ...base,
        careerBashoCount: 100,
      });
      const preThresholdChance = resolveRetirementChance({
        ...base,
        careerBashoCount: 99,
      });
      assert.ok(
        protectedChance < preThresholdChance,
        `Expected IRONMAN protection at >=100 basho, got ${protectedChance} >= ${preThresholdChance}`,
      );
    },
  },
  {
    name: 'retirement: age limit always retires regardless of random roll',
    run: () => {
      const status = createStatus({ age: 50, retirementProfile: 'IRONMAN' });
      const result = checkRetirement(status, () => 0.9999);
      assert.equal(result.shouldRetire, true);
    },
  },
  {
    name: 'retirement: ten consecutive absences always retire regardless of random roll',
    run: () => {
      const rank: Rank = { division: 'Makushita', name: '幕下', number: 25, side: 'East' };
      const status = createStatus({
        age: 23,
        rank,
        retirementProfile: 'STANDARD',
        history: {
          records: Array.from({ length: 10 }, () => createBashoRecord(rank, 0, 0, 7)),
          events: [],
          maxRank: rank,
          totalWins: 0,
          totalLosses: 0,
          totalAbsent: 70,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
        },
      });
      const result = checkRetirement(status, () => 0.9999);
      assert.equal(result.shouldRetire, true);
    },
  },
  {
    name: 'simulation runtime: league state builder centralizes population totals',
    run: () => {
      const leagueFlow = createLeagueFlowRuntime(lcg(1399));
      const league = buildLeagueState({
        leagueFlow,
        seq: 0,
        year: 2026,
        monthIndex: 0,
      });
      const divisionTotal = Object.values(league.divisions)
        .reduce((sum, division) => sum + division.headcount, 0);
      const activeDivisionTotal = Object.values(league.divisions)
        .reduce((sum, division) => sum + division.activeHeadcount, 0);

      assert.equal(league.currentSeason.month, 1);
      assert.equal(league.population.totalHeadcount, divisionTotal);
      assert.equal(league.population.totalActiveHeadcount, activeDivisionTotal);
      assert.ok(league.boundaryContext.headcountPressure >= 0);
    },
  },
  {
    name: 'simulation runtime: initial snapshot centralizes bundle league actor and timeline',
    run: () => {
      const initialStats = createStatus({
        rank: { division: 'Makushita', name: '幕下', number: 18, side: 'East' },
      });
      const runtime = createSimulationRuntime(
        {
          initialStats,
          oyakata: null,
          simulationModelVersion: 'v3',
          progressSnapshotMode: 'full',
          bashoSnapshotMode: 'full',
        },
        {
          random: lcg(1401),
          getCurrentYear: () => 2026,
          now: () => 0,
          yieldControl: async () => {},
        },
      );
      const snapshot = runtime.getSnapshot();
      const bundle = resolveSimulationModelBundle('v3');

      assert.equal(runtime.bundle.id, bundle.id);
      assert.equal(snapshot.bundle.id, bundle.id);
      assert.equal(snapshot.actor.status.shikona, initialStats.shikona);
      assert.equal(snapshot.league.currentSeason.seq, 0);
      assert.ok(snapshot.league.population.totalHeadcount > 0);
      assert.ok(snapshot.league.divisions.Makushita.headcount > 0);
      assert.equal(snapshot.timeline.domainEvents.length, 0);
    },
  },
  {
    name: 'simulation runtime: season step emits runtime snapshot and domain events array',
    run: async () => {
      const runtime = createSimulationRuntime(
        {
          initialStats: createStatus({
            rank: { division: 'Makushita', name: '幕下', number: 24, side: 'East' },
          }),
          oyakata: null,
          simulationModelVersion: 'v3',
          progressSnapshotMode: 'full',
          bashoSnapshotMode: 'full',
        },
        {
          random: lcg(1402),
          getCurrentYear: () => 2026,
          now: () => 0,
          yieldControl: async () => {},
        },
      );
      const step = expectBashoStep(
        await runtime.runNextSeasonStep(),
        'runtime snapshot emission',
      );
      assert.ok(Array.isArray(step.domainEvents));
      assert.ok(step.runtime !== undefined);
      assert.equal(step.runtime?.league.currentSeason.seq, step.seq);
      assert.equal(
        step.runtime?.timeline.domainEvents.length,
        step.domainEvents?.length ?? 0,
      );
    },
  },
  {
    name: 'simulation runtime: chapter observation resolves outside worker',
    run: async () => {
      const runtime = createSimulationRuntime(
        {
          initialStats: createStatus({
            rank: { division: 'Makushita', name: '幕下', number: 24, side: 'East' },
          }),
          oyakata: null,
          simulationModelVersion: 'v3',
          progressSnapshotMode: 'full',
          bashoSnapshotMode: 'full',
        },
        {
          random: lcg(1404),
          getCurrentYear: () => 2026,
          now: () => 0,
          yieldControl: async () => {},
        },
      );
      const step = expectBashoStep(
        await runtime.runNextSeasonStep(),
        'runtime narrative first step',
      );
      const narrative = resolveRuntimeNarrativeStep({
        step,
        seenChapterKinds: new Set(),
        pacing: 'chaptered',
      });

      assert.equal(narrative.chapterKind, 'DEBUT');
      assert.equal(narrative.markChapterKind, 'DEBUT');
      assert.equal(narrative.observation.kind, 'milestone');
      assert.equal(narrative.pauseForChapter, true);
    },
  },
  {
    name: 'simulation runtime: resumeRuntime preserves state graph and continues progression',
    run: async () => {
      const runtime = createSimulationRuntime(
        {
          initialStats: createStatus({
            rank: { division: 'Sandanme', name: '三段目', number: 32, side: 'East' },
          }),
          oyakata: null,
          simulationModelVersion: 'v3',
          progressSnapshotMode: 'full',
          bashoSnapshotMode: 'full',
        },
        {
          random: lcg(1403),
          getCurrentYear: () => 2026,
          now: () => 0,
          yieldControl: async () => {},
        },
      );
      const firstStep = expectBashoStep(
        await runtime.runNextSeasonStep(),
        'runtime resume first step',
      );

      const resumed = resumeRuntime(runtime.serialize());
      const resumedSnapshot = resumed.getSnapshot();
      assert.equal(resumedSnapshot.league.currentSeason.seq, 1);
      assert.equal(
        resumedSnapshot.timeline.domainEvents.length,
        runtime.getSnapshot().timeline.domainEvents.length,
      );

      const secondStep = expectBashoStep(
        await resumed.runNextSeasonStep(),
        'runtime resume second step',
      );
      assert.equal(secondStep.seq, 2);
    },
  }
];
