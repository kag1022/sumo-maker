import rawNpcRealismCalibration from '../../../sumo-db/data/analysis/npc_realism_c1_heisei.json';
import { sampleEmpiricalDivisionAge, sampleEmpiricalNpcSeed, resolveEmpiricalNpcRetirementHazard, resolveEmpiricalNpcRetirementLookupMeta } from '../../../src/logic/calibration/npcRealismHeisei';
import { checkRetirement } from '../../../src/logic/growth';
import { createInitialNpcUniverse } from '../../../src/logic/simulation/npc/factory';
import { intakeNewNpcRecruits, resolveIntakeCount } from '../../../src/logic/simulation/npc/intake';
import { reconcileNpcLeague } from '../../../src/logic/simulation/npc/leagueReconcile';
import { ensurePopulationPlan } from '../../../src/logic/simulation/npc/populationPlan';
import { runNpcRetirementStep } from '../../../src/logic/simulation/npc/retirement';
import {
  clearExpiredNpcTsukedashiSpecialRanks,
  createNpcTsukedashiYearPlan,
  NPC_TSUKEDASHI_CONFIG,
} from '../../../src/logic/simulation/npc/tsukedashi';
import { countActiveByStable, NPC_STABLE_CATALOG, resolveIchimonByStableId } from '../../../src/logic/simulation/npc/stableCatalog';
import { createNpcNameContext, generateUniqueNpcShikona, isSurnameShikona } from '../../../src/logic/simulation/npc/npcShikonaGenerator';
import { ActorRegistry } from '../../../src/logic/simulation/npc/types';
import { createSekitoriBoundaryWorld } from '../../../src/logic/simulation/sekitoriQuota';
import { createLowerDivisionQuotaWorld } from '../../../src/logic/simulation/lowerQuota';
import { createSimulationWorld, finalizeSekitoriPlayerPlacement, syncPlayerActorInWorld } from '../../../src/logic/simulation/world';

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

const NPC_REALISM_CALIBRATION = rawNpcRealismCalibration as {
  retirementHazardByState: Record<string, { sampleSize: number }>;
};

export const tests: TestCase[] = [
  {
    name: 'population plan: npc tsukedashi annual plan stays rare and within caps',
    run: () => {
      for (let year = 2026; year < 2146; year += 1) {
        const plan = createNpcTsukedashiYearPlan(year, lcg(year));
        const makushitaCount = plan.entries.filter((entry) => entry.level === 'MAKUSHITA_BOTTOM').length;
        const sandanmeCount = plan.entries.filter((entry) => entry.level === 'SANDANME_BOTTOM').length;
        assert.ok(makushitaCount <= NPC_TSUKEDASHI_CONFIG.maxMakushitaPerYear);
        assert.ok(sandanmeCount <= NPC_TSUKEDASHI_CONFIG.maxSandanmePerYear);
        for (const month of [1, 3, 5, 7, 9, 11]) {
          const monthCount = plan.entries.filter((entry) => entry.month === month).length;
          assert.ok(monthCount <= NPC_TSUKEDASHI_CONFIG.maxPerBasho);
        }
      }
    },
  },
  {
    name: 'npc intake: tsukedashi creates special recruits outside maezumo and expires display flag',
    run: () => {
      const universe = {
        registry: new Map(),
        maezumoPool: [],
        nameContext: createNpcNameContext(),
        nextNpcSerial: 1,
      };
      const plan = {
        sampledAtYear: 2026,
        annualIntakeShock: 0,
        annualRetirementShock: 0,
        annualIntakeHardCap: 10,
        jonidanShock: 0,
        jonokuchiShock: 0,
        lowerDivisionElasticity: 1,
        sampledTotalSwing: 0,
        sampledJonidanSwing: 0,
        sampledJonokuchiSwing: 0,
        npcTsukedashiPlan: {
          sampledAtYear: 2026,
          entries: [
            { id: '2026-makushita-1', month: 3, level: 'MAKUSHITA_BOTTOM' as const },
            { id: '2026-sandanme-1', month: 3, level: 'SANDANME_BOTTOM' as const },
          ],
        },
      };
      const intake = intakeNewNpcRecruits(universe, 12, 3, 10, plan, lcg(2026051303));
      assert.equal(intake.recruits.length, 0);
      assert.equal(intake.tsukedashiRecruits.length, 2);
      assert.equal(universe.maezumoPool.length, 0);
      assert.ok(intake.tsukedashiRecruits.some((npc) => npc.rankSpecialStatus === 'MAKUSHITA_BOTTOM_TSUKEDASHI'));
      assert.ok(intake.tsukedashiRecruits.some((npc) => npc.rankSpecialStatus === 'SANDANME_BOTTOM_TSUKEDASHI'));
      clearExpiredNpcTsukedashiSpecialRanks(universe.registry, 13);
      assert.ok(intake.tsukedashiRecruits.every((npc) => !npc.rankSpecialStatus));
    },
  },
  {
    name: 'npc realism c1: seed sampler is deterministic',
    run: () => {
      const rngA = lcg(20260412);
      const rngB = lcg(20260412);
      const sampleA = Array.from({ length: 8 }, () => sampleEmpiricalNpcSeed(rngA).id);
      const sampleB = Array.from({ length: 8 }, () => sampleEmpiricalNpcSeed(rngB).id);
      assert.deepEqual(sampleA, sampleB);
    },
  },
  {
    name: 'npc realism c1: age sampler stays within division quantile range',
    run: () => {
      for (const division of ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi', 'Maezumo'] as const) {
        for (let index = 0; index < 40; index += 1) {
          const age = sampleEmpiricalDivisionAge(division, lcg(division.length * 100 + index));
          assert.ok(age >= 15 && age <= 45, `Unexpected age ${age} for ${division}`);
        }
      }
    },
  },
  {
    name: 'npc realism c1: low-sample full-key hazard falls back',
    run: () => {
      const lowSampleEntry = Object.entries(NPC_REALISM_CALIBRATION.retirementHazardByState).find(
        ([, row]) => row.sampleSize > 0 && row.sampleSize < 20,
      );
      assert.ok(Boolean(lowSampleEntry), 'Expected at least one low-sample retirement state');
      if (!lowSampleEntry) return;
      const [key] = lowSampleEntry;
      const [division, rankBand, ageBand, resultClass, absenceBand, formerSekitoriFlag] = key.split('|');
      const rankIdentityByBand: Record<string, { rankName: string; rankNumber?: number; currentRankScore: number }> = {
        'Y/O': { rankName: '横綱', rankNumber: 1, currentRankScore: 1 },
        'S/K': { rankName: '関脇', rankNumber: 1, currentRankScore: 5 },
        '1-5': { rankName: division === 'Makuuchi' ? '前頭' : division === 'Makushita' ? '幕下' : '十両', rankNumber: 3, currentRankScore: 5 },
        '6-10': { rankName: '前頭', rankNumber: 8, currentRankScore: 17 },
        '11+': { rankName: '前頭', rankNumber: 12, currentRankScore: 25 },
        '1-3': { rankName: '十両', rankNumber: 2, currentRankScore: 3 },
        '4-7': { rankName: '十両', rankNumber: 5, currentRankScore: 9 },
        '8-11': { rankName: '十両', rankNumber: 9, currentRankScore: 17 },
        '12-14': { rankName: '十両', rankNumber: 13, currentRankScore: 25 },
        '6-15': { rankName: '幕下', rankNumber: 10, currentRankScore: 19 },
        '16-30': { rankName: '幕下', rankNumber: 20, currentRankScore: 39 },
        '31-45': { rankName: '幕下', rankNumber: 40, currentRankScore: 79 },
        '46+': { rankName: '幕下', rankNumber: 50, currentRankScore: 99 },
        '1-10': { rankName: division === 'Sandanme' ? '三段目' : '序ノ口', rankNumber: 6, currentRankScore: 11 },
        '11-30': { rankName: '三段目', rankNumber: 18, currentRankScore: 35 },
        '31-60': { rankName: '三段目', rankNumber: 40, currentRankScore: 79 },
        '61-90': { rankName: '三段目', rankNumber: 72, currentRankScore: 143 },
        '91+': { rankName: '三段目', rankNumber: 100, currentRankScore: 199 },
        '1-20': { rankName: '序二段', rankNumber: 10, currentRankScore: 19 },
        '21-50': { rankName: '序二段', rankNumber: 35, currentRankScore: 69 },
        '51-100': { rankName: '序二段', rankNumber: 75, currentRankScore: 149 },
        '101-150': { rankName: '序二段', rankNumber: 120, currentRankScore: 239 },
        '151+': { rankName: '序二段', rankNumber: 170, currentRankScore: 339 },
        '11-20': { rankName: '序ノ口', rankNumber: 15, currentRankScore: 29 },
        '21-30': { rankName: '序ノ口', rankNumber: 25, currentRankScore: 49 },
        '31+': { rankName: '序ノ口', rankNumber: 35, currentRankScore: 69 },
      };
      const rankIdentity = rankIdentityByBand[rankBand] ?? { rankName: '幕下', rankNumber: 10, currentRankScore: 19 };
      const wins =
        resultClass === 'KK' ? 4 : resultClass === 'EVEN' ? 3 : resultClass === 'MK_LIGHT' ? 2 : 1;
      const losses =
        resultClass === 'KK' ? 3 : resultClass === 'EVEN' ? 3 : resultClass === 'MK_LIGHT' ? 4 : 5;
      const scheduledBouts = division === 'Makuuchi' || division === 'Juryo' ? 15 : 7;
      const absent =
        resultClass === 'FULL_KYUJO'
          ? scheduledBouts
          : absenceBand === '0'
            ? 0
            : absenceBand === '1-2'
              ? 2
              : absenceBand === '3-5'
                ? 4
                : 7;
      const age =
        ageBand === '15-18' ? 17 :
          ageBand === '19-21' ? 20 :
            ageBand === '22-24' ? 23 :
              ageBand === '25-27' ? 26 :
                ageBand === '28-30' ? 29 :
                  ageBand === '31-33' ? 32 :
                    ageBand === '34-36' ? 35 :
                      ageBand === '37-39' ? 38 : 41;
      const meta = resolveEmpiricalNpcRetirementLookupMeta({
        age,
        currentDivision: division as never,
        currentRankScore: rankIdentity.currentRankScore,
        recentBashoResults: [{
          division: division as never,
          rankName: rankIdentity.rankName,
          rankNumber: rankIdentity.rankNumber,
          wins,
          losses,
          absent,
        }],
        formerSekitori: formerSekitoriFlag === '1',
      });
      const hazard = resolveEmpiricalNpcRetirementHazard({
        age,
        currentDivision: division as never,
        currentRankScore: rankIdentity.currentRankScore,
        recentBashoResults: [{
          division: division as never,
          rankName: rankIdentity.rankName,
          rankNumber: rankIdentity.rankNumber,
          wins,
          losses,
          absent,
        }],
        formerSekitori: formerSekitoriFlag === '1',
      });
      assert.ok(meta.fallbackLevel !== 'full', `Expected fallback for low-sample key ${key}, got full`);
      assert.ok(hazard >= 0 && hazard <= 1, `Expected hazard to be normalized, got ${hazard}`);
    },
  },
  {
    name: 'npc realism c1: generated bands diverge from legacy hand weights',
    run: () => {
      const universe = createInitialNpcUniverse(lcg(20260413));
      const all = [
        ...universe.rosters.Makuuchi,
        ...universe.rosters.Juryo,
        ...universe.rosters.Makushita,
        ...universe.rosters.Sandanme,
        ...universe.rosters.Jonidan,
        ...universe.rosters.Jonokuchi,
      ];
      const counts = {
        ELITE: 0,
        STRONG: 0,
        STANDARD: 0,
        GRINDER: 0,
        WASHOUT: 0,
      };
      for (const npc of all) {
        counts[npc.careerBand ?? 'STANDARD'] += 1;
        assert.ok(typeof npc.riseBand === 'number', `Expected riseBand on ${npc.id}`);
      }
      const total = all.length;
      const legacy = { ELITE: 0.04, STRONG: 0.15, STANDARD: 0.43, GRINDER: 0.26, WASHOUT: 0.12 };
      const meanAbsDiff =
        (Math.abs(counts.ELITE / total - legacy.ELITE) +
          Math.abs(counts.STRONG / total - legacy.STRONG) +
          Math.abs(counts.STANDARD / total - legacy.STANDARD) +
          Math.abs(counts.GRINDER / total - legacy.GRINDER) +
          Math.abs(counts.WASHOUT / total - legacy.WASHOUT)) / 5;
      assert.ok(meanAbsDiff >= 0.015, `Expected empirical distribution to differ from legacy weights, got ${meanAbsDiff}`);
    },
  },
  {
    name: 'npc realism c1: positive retirement shock increases retirements without collapse',
    run: () => {
      const buildNpc = (index: number) => ({
        actorId: `NPC-${index}`,
        actorType: 'NPC' as const,
        id: `NPC-${index}`,
        seedId: `NPC-${index}`,
        shikona: `検証${index}`,
        stableId: 'stable-001',
        division: 'Makushita' as const,
        currentDivision: 'Makushita' as const,
        rankScore: 18,
        basePower: 82,
        ability: 84,
        uncertainty: 1.6,
        form: 1,
        volatility: 1.2,
        styleBias: 'BALANCE' as const,
        heightCm: 181,
        weightKg: 143,
        growthBias: 0,
        retirementBias: 0,
        retirementProfile: 'STANDARD' as const,
        aptitudeTier: 'B' as const,
        aptitudeFactor: 1,
        aptitudeProfile: undefined,
        careerBand: 'STANDARD' as const,
        entryAge: 15,
        age: 29,
        careerBashoCount: 84,
        active: true,
        entrySeq: 0,
        riseBand: 2 as const,
        stagnation: {
          pressure: 1.8,
          makekoshiStreak: 0,
          lowWinRateStreak: 0,
          stuckBasho: 0,
          reboundBoost: 0,
        },
        recentBashoResults: [
          { division: 'Makushita' as const, rankName: '幕下', rankNumber: 18, wins: 2, losses: 5, absent: 0 },
          { division: 'Makushita' as const, rankName: '幕下', rankNumber: 22, wins: 3, losses: 4, absent: 0 },
          { division: 'Makushita' as const, rankName: '幕下', rankNumber: 25, wins: 2, losses: 5, absent: 0 },
        ],
      });
      const positive = Array.from({ length: 240 }, (_, index) => buildNpc(index));
      const negative = Array.from({ length: 240 }, (_, index) => buildNpc(index + 300));
      const positiveRetired = runNpcRetirementStep(positive, 1, lcg(20260414), {
        sampledAtYear: 2026,
        annualIntakeShock: 0,
        annualRetirementShock: 0.2,
        annualIntakeHardCap: 760,
        jonidanShock: 0,
        jonokuchiShock: 0,
        lowerDivisionElasticity: 1,
        sampledTotalSwing: 0,
        sampledJonidanSwing: 0,
        sampledJonokuchiSwing: 0,
      }).length;
      const negativeRetired = runNpcRetirementStep(negative, 1, lcg(20260414), {
        sampledAtYear: 2026,
        annualIntakeShock: 0,
        annualRetirementShock: -0.2,
        annualIntakeHardCap: 760,
        jonidanShock: 0,
        jonokuchiShock: 0,
        lowerDivisionElasticity: 1,
        sampledTotalSwing: 0,
        sampledJonidanSwing: 0,
        sampledJonokuchiSwing: 0,
      }).length;
      assert.ok(positiveRetired > negativeRetired, `Expected positive shock retirements > negative, got ${positiveRetired} <= ${negativeRetired}`);
      assert.ok(positiveRetired < positive.length * 0.6, `Expected no collapse, got ${positiveRetired}/${positive.length}`);
    },
  },
  {
    name: 'npc realism c1: player retirement path still follows shared growth logic',
    run: () => {
      const status = createStatus({
        age: 33,
        injuryLevel: 1,
        careerBand: 'STANDARD',
        retirementProfile: 'STANDARD',
        history: {
          records: Array.from({ length: 80 }, () =>
            createBashoRecord(
              { division: 'Makushita', name: '幕下', number: 2, side: 'East' },
              7,
              8,
              0,
            ),
          ),
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', number: 2, side: 'East' },
          totalWins: 560,
          totalLosses: 640,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
          winRouteTotal: {},
          bodyTimeline: [],
          highlightEvents: [],
          traitAwakenings: [],
          careerTurningPoints: [],
          realismKpi: { careerWinRate: 0.466, stagnationPressure: 0.4 },
        },
      });
      const resultLow = checkRetirement(status, () => 0);
      const resultHigh = checkRetirement(status, () => 0.999999);
      assert.ok(resultLow.shouldRetire, 'Expected low roll to retire on player path');
      assert.ok(!resultHigh.shouldRetire, 'Expected high roll to survive on player path');
    },
  },
  {
    name: 'population plan: same year reuses plan and next year resamples',
    run: () => {
      const world = createSimulationWorld(lcg(20260401));
      const plan2026 = ensurePopulationPlan(world, 2026, lcg(20260402));
      const plan2026Again = ensurePopulationPlan(world, 2026, lcg(20260403));
      const plan2027 = ensurePopulationPlan(world, 2027, lcg(20260404));

      assert.equal(plan2026.sampledAtYear, 2026);
      assert.equal(plan2026Again.sampledAtYear, 2026);
      assert.equal(plan2026, plan2026Again);
      assert.equal(plan2027.sampledAtYear, 2027);
      assert.ok(plan2027 !== plan2026, 'Expected population plan to resample on a new year');
    },
  },
  {
    name: 'npc intake: positive intake shock yields more recruits than negative shock',
    run: () => {
      const currentBanzukeHeadcount = 700;
      const positive = resolveIntakeCount(
        3,
        currentBanzukeHeadcount,
        {
          sampledAtYear: 2026,
          annualIntakeShock: 0.24,
          annualRetirementShock: -0.04,
          annualIntakeHardCap: 820,
          jonidanShock: 0.4,
          jonokuchiShock: 0.5,
          lowerDivisionElasticity: 1.15,
          sampledTotalSwing: 50,
          sampledJonidanSwing: 28,
          sampledJonokuchiSwing: 20,
        },
        lcg(11),
      );
      const negative = resolveIntakeCount(
        3,
        currentBanzukeHeadcount,
        {
          sampledAtYear: 2026,
          annualIntakeShock: -0.18,
          annualRetirementShock: 0.08,
          annualIntakeHardCap: 760,
          jonidanShock: -0.3,
          jonokuchiShock: -0.2,
          lowerDivisionElasticity: 0.92,
          sampledTotalSwing: 40,
          sampledJonidanSwing: 24,
          sampledJonokuchiSwing: 18,
        },
        lcg(11),
      );

      assert.ok(positive > negative, `Expected positive shock intake > negative shock, got ${positive} <= ${negative}`);
    },
  },
  {
    name: 'npc pipeline: aptitudeFactor persists through league reconcile outputs',
    run: () => {
      const rng = lcg(20260304);
      const world = createSimulationWorld(rng);
      const lower = createLowerDivisionQuotaWorld(lcg(20260305), world);
      const boundary = createSekitoriBoundaryWorld(lcg(20260306));

      const target = world.lowerRosterSeeds.Makushita[0];
      assert.ok(Boolean(target), 'Expected Makushita seed NPC');
      if (!target) return;
      const persistent = world.npcRegistry.get(target.id);
      assert.ok(Boolean(persistent), 'Expected persistent NPC');
      if (!persistent) return;

      persistent.aptitudeTier = 'D';
      persistent.aptitudeFactor = 0.68;
      target.aptitudeTier = 'D';
      target.aptitudeFactor = 0.68;

      reconcileNpcLeague(world, lower, boundary, lcg(20260307), 1, 1);

      const worldSeed = world.lowerRosterSeeds.Makushita.find((npc) => npc.id === target.id);
      const lowerSeed = lower.rosters.Makushita.find((npc) => npc.id === target.id);
      const boundarySeed = boundary.makushitaPool.find((npc) => npc.id === target.id);
      assert.equal(worldSeed?.aptitudeTier, 'D');
      assert.equal(worldSeed?.aptitudeFactor, 0.68);
      assert.equal(lowerSeed?.aptitudeTier, 'D');
      assert.equal(lowerSeed?.aptitudeFactor, 0.68);
      assert.equal(boundarySeed?.aptitudeTier, 'D');
      assert.equal(boundarySeed?.aptitudeFactor, 0.68);
    },
  },
  {
    name: 'league: reconcile follows lower-division shocks for jonidan and jonokuchi',
    run: () => {
      const rng = lcg(20260405);
      const world = createSimulationWorld(rng);
      const lower = createLowerDivisionQuotaWorld(rng, world);
      const boundary = createSekitoriBoundaryWorld(rng);
      boundary.npcRegistry = world.npcRegistry;
      boundary.makushitaPool =
        lower.rosters.Makushita as unknown as typeof boundary.makushitaPool;

      reconcileNpcLeague(
        world,
        lower,
        boundary,
        lcg(20260406),
        1,
        3,
        {
          sampledAtYear: 2026,
          annualIntakeShock: 0.22,
          annualRetirementShock: -0.05,
          annualIntakeHardCap: 840,
          jonidanShock: 0.85,
          jonokuchiShock: 0.9,
          lowerDivisionElasticity: 1.25,
          sampledTotalSwing: 54,
          sampledJonidanSwing: 32,
          sampledJonokuchiSwing: 24,
        },
      );

      assert.ok(lower.rosters.Jonidan.length >= 260, `Expected Jonidan shock expansion, got ${lower.rosters.Jonidan.length}`);
      assert.ok(lower.rosters.Jonokuchi.length >= 88, `Expected Jonokuchi shock expansion, got ${lower.rosters.Jonokuchi.length}`);
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
    name: 'league: reconcile preserves deterministic promotion order across bucket refills',
    run: () => {
      const rng = lcg(20260411);
      const world = createSimulationWorld(rng);
      const lowerWorld = createLowerDivisionQuotaWorld(rng, world);
      const boundaryWorld = createSekitoriBoundaryWorld(rng);
      boundaryWorld.npcRegistry = world.npcRegistry;
      boundaryWorld.makushitaPool =
        lowerWorld.rosters.Makushita as unknown as typeof boundaryWorld.makushitaPool;

      const expectedMakuuchiPromotions = world.rosters.Juryo.slice(0, 2).map((row) => row.id);
      const expectedJuryoPromotions = lowerWorld.rosters.Makushita.slice(0, 3).map((row) => row.id);

      for (const row of world.rosters.Makuuchi.slice(40)) {
        const npc = world.npcRegistry.get(row.id);
        if (npc) npc.active = false;
      }
      for (const row of world.rosters.Juryo.slice(27)) {
        const npc = world.npcRegistry.get(row.id);
        if (npc) npc.active = false;
      }

      const report = reconcileNpcLeague(world, lowerWorld, boundaryWorld, rng, 1, 1);
      const firstPromotions = report.moves
        .filter((move) => move.type === 'PROMOTE')
        .slice(0, 5)
        .map((move) => ({ id: move.id, from: move.from, to: move.to }));

      assert.equal(report.before.Makuuchi, 40);
      assert.equal(report.before.Juryo, 27);
      assert.equal(report.after.Makuuchi, 42);
      assert.equal(report.after.Juryo, 28);
      assert.deepEqual(firstPromotions, [
        { id: expectedMakuuchiPromotions[0], from: 'Juryo', to: 'Makuuchi' },
        { id: expectedMakuuchiPromotions[1], from: 'Juryo', to: 'Makuuchi' },
        { id: expectedJuryoPromotions[0], from: 'Makushita', to: 'Juryo' },
        { id: expectedJuryoPromotions[1], from: 'Makushita', to: 'Juryo' },
        { id: expectedJuryoPromotions[2], from: 'Makushita', to: 'Juryo' },
      ]);
      assert.equal(
        expectedMakuuchiPromotions.every((id) => world.rosters.Makuuchi.some((row) => row.id === id)),
        true,
      );
      assert.equal(
        expectedJuryoPromotions.every((id) => world.rosters.Juryo.some((row) => row.id === id)),
        true,
      );
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
    name: 'npc stable catalog: ichimon distribution matches 13/11/9/7/5',
    run: () => {
      const distribution = NPC_STABLE_CATALOG.reduce(
        (acc, stable) => {
          acc[stable.ichimonId] += 1;
          return acc;
        },
        {
          TAIJU: 0,
          KUROGANE: 0,
          RAIMEI: 0,
          HAKUTSURU: 0,
          HAYATE: 0,
        } as Record<'TAIJU' | 'KUROGANE' | 'RAIMEI' | 'HAKUTSURU' | 'HAYATE', number>,
      );

      assert.equal(distribution.TAIJU, 13);
      assert.equal(distribution.KUROGANE, 11);
      assert.equal(distribution.RAIMEI, 9);
      assert.equal(distribution.HAKUTSURU, 7);
      assert.equal(distribution.HAYATE, 5);

      for (const stable of NPC_STABLE_CATALOG) {
        assert.equal(resolveIchimonByStableId(stable.id), stable.ichimonId);
      }
    },
  },
  {
    name: 'npc shikona: surname style appears more in lower divisions than sekitori',
    run: () => {
      const topRegistry: ActorRegistry = new Map();
      const topContext = createNpcNameContext();
      const topRng = lcg(20260223);
      let topSurname = 0;
      const topTotal = 1200;
      for (let i = 0; i < topTotal; i += 1) {
        const division = i % 2 === 0 ? 'Makuuchi' : 'Juryo';
        const stableId = `stable-${String((i % 45) + 1).padStart(3, '0')}`;
        const shikona = generateUniqueNpcShikona(
          stableId,
          division,
          topRng,
          topContext,
          topRegistry,
        );
        if (isSurnameShikona(shikona)) topSurname += 1;
        const id = `TOP-${i + 1}`;
        topRegistry.set(id, createMockActor(id, shikona, division, stableId));
      }

      const lowerRegistry: ActorRegistry = new Map();
      const lowerContext = createNpcNameContext();
      const lowerRng = lcg(20260224);
      const lowerDivisions: Array<'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi' | 'Maezumo'> = [
        'Makushita',
        'Sandanme',
        'Jonidan',
        'Jonokuchi',
        'Maezumo',
      ];
      let lowerSurname = 0;
      const lowerTotal = 2200;
      for (let i = 0; i < lowerTotal; i += 1) {
        const division = lowerDivisions[i % lowerDivisions.length];
        const stableId = `stable-${String((i % 45) + 1).padStart(3, '0')}`;
        const shikona = generateUniqueNpcShikona(
          stableId,
          division,
          lowerRng,
          lowerContext,
          lowerRegistry,
        );
        if (isSurnameShikona(shikona)) lowerSurname += 1;
        const id = `LOW-${i + 1}`;
        lowerRegistry.set(id, createMockActor(id, shikona, division, stableId));
      }

      const topRatio = topSurname / topTotal;
      const lowerRatio = lowerSurname / lowerTotal;
      assert.ok(topRatio >= 0.03 && topRatio <= 0.12, `Unexpected sekitori surname ratio: ${topRatio}`);
      assert.ok(lowerRatio >= 0.22 && lowerRatio <= 0.38, `Unexpected lower surname ratio: ${lowerRatio}`);
      assert.ok(lowerRatio > topRatio + 0.12, `Expected lower ratio > top ratio, got ${lowerRatio} vs ${topRatio}`);
    },
  },
  {
    name: 'player name collision: colliding active NPC is renamed while player name is preserved',
    run: () => {
      const rng = lcg(20260225);
      const world = createSimulationWorld(rng);
      const targetNpc = world.rosters.Makuuchi.find((row) => row.id !== 'PLAYER');
      assert.ok(Boolean(targetNpc), 'Expected at least one active makuuchi NPC');
      if (!targetNpc) return;

      const beforeCollisionName = world.npcRegistry.get(targetNpc.id)?.shikona;
      assert.ok(Boolean(beforeCollisionName), 'Collision source shikona is missing');
      if (!beforeCollisionName) return;

      const status = createStatus({
        shikona: beforeCollisionName,
        rank: { division: 'Makuuchi', name: '前頭', number: 9, side: 'East' },
      });

      syncPlayerActorInWorld(world, status, rng);

      assert.equal(world.npcRegistry.get('PLAYER')?.shikona, beforeCollisionName);
      assert.ok(
        world.npcRegistry.get(targetNpc.id)?.shikona !== beforeCollisionName,
        'Colliding NPC should be renamed',
      );
      assertActiveShikonaUnique(world.npcRegistry, 'player-collision');
    },
  },
  {
    name: 'player sync: repeated sync keeps existing sekitori placement stable',
    run: () => {
      const rng = lcg(20260408);
      const world = createSimulationWorld(rng);
      const status = createStatus({
        shikona: '試験山',
        rank: { division: 'Makuuchi', name: '前頭', number: 9, side: 'East' },
      });

      syncPlayerActorInWorld(world, status, rng);
      finalizeSekitoriPlayerPlacement(world, status);
      const before = {
        makuuchi: world.rosters.Makuuchi.map((rikishi) => `${rikishi.id}:${rikishi.rankScore}`),
        juryo: world.rosters.Juryo.map((rikishi) => `${rikishi.id}:${rikishi.rankScore}`),
      };

      syncPlayerActorInWorld(world, status, rng);
      syncPlayerActorInWorld(world, status, rng);

      const after = {
        makuuchi: world.rosters.Makuuchi.map((rikishi) => `${rikishi.id}:${rikishi.rankScore}`),
        juryo: world.rosters.Juryo.map((rikishi) => `${rikishi.id}:${rikishi.rankScore}`),
      };
      const totalPlayerRows = [...world.rosters.Makuuchi, ...world.rosters.Juryo]
        .filter((rikishi) => rikishi.id === 'PLAYER')
        .length;

      assert.equal(world.rosters.Makuuchi.length, 42);
      assert.equal(world.rosters.Juryo.length, 28);
      assert.equal(totalPlayerRows, 1);
      assert.deepEqual(after.makuuchi, before.makuuchi);
      assert.deepEqual(after.juryo, before.juryo);
    },
  },
  {
    name: 'npc universe: initial active total is 718 and stable headcounts stay near targets',
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

      assert.equal(total, 718);
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
        const intake = intakeNewNpcRecruits(universe, seq + 1, month, activeCount, undefined, lcg(5000 + i));
        universe.nextNpcSerial = intake.nextNpcSerial;
        seq += 1;
        assertActiveShikonaUnique(universe.registry, `intake-loop-${i}`);
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
      assertActiveShikonaUnique(universe.registry, 'intake-final');
    },
  }
];
