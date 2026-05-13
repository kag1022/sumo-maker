import { createInitialRikishi } from '../../../src/logic/initialization';
import { calculateBattleResult } from '../../../src/logic/battle';
import { PlayerBoutDetail } from '../../../src/logic/simulation/basho';
import { BashoRecord, BuildSpecVNext, Trait } from '../../../src/logic/models';
import { findOfficialKimariteEntry, listNonTechniqueCatalog, listOfficialWinningKimariteCatalog, normalizeKimariteName } from '../../../src/logic/kimarite/catalog';
import { inferBodyTypeFromMetrics, resolveKimariteOutcome } from '../../../src/logic/kimarite/selection';
import { KIMARITE_CATALOG } from '../../../src/logic/kimarite/catalog';
import { ensureKimariteRepertoire, evolveKimariteRepertoireAfterBasho } from '../../../src/logic/kimarite/repertoire';
import { buildInitialRikishiFromDraft, rollScoutDraft } from '../../../src/logic/scout/gacha';
import { buildInitialRikishiForObservationPopulation } from '../../../src/logic/scout/populations';
import { CONSTANTS } from '../../../src/logic/constants';
import { formatRankDisplayName } from '../../../src/logic/ranking';
import { appendBashoEvents } from '../../../src/logic/simulation/career';
import { BUILD_COST, buildInitialRikishiFromSpec, calculateBuildCost, calculateBuildCostVNext, createDefaultBuildSpec, createDefaultBuildSpecVNext, getStarterOyakataBlueprints, isBuildSpecVNextBmiValid, resolveDisplayedAptitudeTier } from '../../../src/logic/build/buildLab';
import { ensureKataProfile, resolveKataDisplay, updateKataProfileAfterBasho } from '../../../src/logic/style/kata';
import { ensureStyleEvolutionProfile, updateStyleEvolutionAfterBasho } from '../../../src/logic/style/evolution';
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveInternalWeakStyles,
  resolveStyleMatchupDelta,
} from '../../../src/logic/style/identity';
import { buildHoshitoriGrid } from '../../../src/features/report/utils/hoshitori';
import { createLogicLabInitialStatus, LOGIC_LAB_DEFAULT_PRESET } from '../../../src/features/logicLab/presets';
import { runLogicLabToEnd } from '../../../src/features/logicLab/runner';
import { resolveSimulationPhaseOnCompletion, resolveSimulationPhaseOnStart, shouldCaptureObservations } from '../../../src/logic/simulation/appFlow';
import { applyTraitAwakeningsForBasho, buildLockedTraitJourney } from '../../../src/logic/traits';

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

export const tests: TestCase[] = [
  {
    name: 'initialization: entry archetype keeps aptitude initial ability separate from ceiling',
    run: () => {
      const baseParams = {
        shikona: '照ノ浜',
        age: 18,
        startingRank: { division: 'Maezumo' as const, name: '前相撲', side: 'East' as const, number: 1 },
        archetype: 'HARD_WORKER' as const,
        tactics: 'BALANCE' as const,
        signatureMove: '',
        bodyType: 'NORMAL' as const,
        traits: [],
        historyBonus: 0,
        stableId: 'stable-001',
        ichimonId: 'TAIJU' as const,
        stableArchetypeId: 'TRADITIONAL_LARGE' as const,
      };
      const highAptitude = createInitialRikishi({
        ...baseParams,
        aptitudeTier: 'S',
        entryArchetype: 'ORDINARY_RECRUIT',
      }, lcg(2026051301));
      const lowAptitude = createInitialRikishi({
        ...baseParams,
        aptitudeTier: 'D',
        entryArchetype: 'ORDINARY_RECRUIT',
      }, lcg(2026051301));
      assert.equal(highAptitude.potential, lowAptitude.potential);
      assert.ok(
        highAptitude.ratingState.ability > lowAptitude.ratingState.ability,
        `S tier ability ${highAptitude.ratingState.ability} should exceed D tier ${lowAptitude.ratingState.ability}`,
      );
    },
  },
  {
    name: 'initialization: tsukedashi uses one-basho special bottom rank display',
    run: () => {
      const status = createInitialRikishi({
        shikona: '付出山',
        age: 22,
        startingRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
        archetype: 'HARD_WORKER',
        entryArchetype: 'ELITE_TSUKEDASHI',
        aptitudeTier: 'A',
        tactics: 'BALANCE',
        signatureMove: '',
        bodyType: 'NORMAL',
        traits: [],
        historyBonus: 0,
        stableId: 'stable-001',
        ichimonId: 'TAIJU',
        stableArchetypeId: 'TRADITIONAL_LARGE',
      }, lcg(2026051302));
      assert.equal(status.entryArchetype, 'ELITE_TSUKEDASHI');
      assert.equal(status.rank.specialStatus, 'MAKUSHITA_BOTTOM_TSUKEDASHI');
      assert.equal(status.entryDivision, 'Makushita60');
      assert.equal(formatRankDisplayName(status.rank), '幕下最下位格付出');
    },
  },
  {
    name: 'kimarite: official catalog exposes exactly 82 winning kimarite',
    run: async () => {
      const official = listOfficialWinningKimariteCatalog();
      const unique = new Set(official.map((entry) => entry.name));
      assert.equal(official.length, 82);
      assert.equal(unique.size, 82);
    },
  },
  {
    name: 'kimarite: non-tech catalog stays separate',
    run: () => {
      const official = listOfficialWinningKimariteCatalog();
      const nonTech = listNonTechniqueCatalog();
      assert.ok(nonTech.length >= 5);
      assert.ok(nonTech.every((entry) => !official.some((officialEntry) => officialEntry.name === entry.name)));
    },
  },
  {
    name: 'kimarite: alias normalization maps legacy labels to canonical names',
    run: () => {
      assert.equal(normalizeKimariteName('すくい投げ'), '掬い投げ');
      assert.equal(normalizeKimariteName('不戦勝'), '不戦');
      assert.equal(normalizeKimariteName('不戦敗'), '不戦');
    },
  },
  {
    name: 'kimarite: extreme backward body drop requires compatible pattern',
    run: () => {
      const winner = {
        style: 'PUSH' as const,
        bodyType: 'ANKO' as const,
        heightCm: 178,
        weightKg: 165,
        stats: { tsuki: 95, oshi: 95, power: 92, waza: 45, nage: 40, deashi: 58, kumi: 42, koshi: 48 },
        traits: ['TSUPPARI_TOKKA'] as Trait[],
        historyCounts: { 押し出し: 20 },
      };
      const loser = {
        style: 'PUSH' as const,
        bodyType: inferBodyTypeFromMetrics(182, 145),
        heightCm: 182,
        weightKg: 145,
        stats: { tsuki: 70, oshi: 72, power: 68 },
        traits: [],
        historyCounts: {},
      };
      const seen = new Set<string>();
      for (let index = 0; index < 200; index += 1) {
        const result = resolveKimariteOutcome({
          winner,
          loser,
          rng: lcg(index + 1),
          forcePattern: 'PUSH_ADVANCE',
          allowNonTechnique: false,
          boutContext: {
            isHighPressure: false,
            isLastDay: false,
            isUnderdog: false,
            isEdgeCandidate: false,
            weightDiff: 20,
            heightDiff: -4,
          },
        });
        seen.add(result.kimarite);
      }
      assert.ok(!seen.has('居反り'));
      assert.ok(!seen.has('伝え反り'));
    },
  },
  {
    name: 'kimarite: push style stays on push and pull shelves in normal context',
    run: () => {
      const winner = {
        style: 'PUSH' as const,
        bodyType: 'ANKO' as const,
        heightCm: 181,
        weightKg: 168,
        stats: { tsuki: 98, oshi: 101, power: 95, waza: 52, nage: 40, deashi: 76, kumi: 48, koshi: 50 },
        traits: ['TSUPPARI_TOKKA', 'HEAVY_PRESSURE'] as Trait[],
        historyCounts: { 押し出し: 18, 押し倒し: 8, 引き落とし: 5 },
      };
      const loser = {
        style: 'GRAPPLE' as const,
        bodyType: 'MUSCULAR' as const,
        heightCm: 184,
        weightKg: 150,
        stats: { tsuki: 64, oshi: 66, power: 70, kumi: 74, koshi: 72, waza: 48, nage: 46, deashi: 60 },
        traits: [],
        historyCounts: {},
      };
      const familyCounts = new Map<string, number>();
      for (let index = 0; index < 500; index += 1) {
        const result = resolveKimariteOutcome({
          winner,
          loser,
          rng: lcg(index + 101),
          allowNonTechnique: false,
          boutContext: {
            isHighPressure: false,
            isLastDay: false,
            isUnderdog: false,
            isEdgeCandidate: false,
            weightDiff: 18,
            heightDiff: -3,
          },
        });
        const entry = findOfficialKimariteEntry(result.kimarite);
        if (entry) {
          familyCounts.set(entry.family, (familyCounts.get(entry.family) ?? 0) + 1);
        }
      }
      const pushAndTwist =
        (familyCounts.get('PUSH_THRUST') ?? 0) +
        (familyCounts.get('TWIST_DOWN') ?? 0);
      // PUSH 型は基本 push/pull を中心にする。engagement モデル導入後は
      // 相手と絡んで外無双 / 送り系 / 反り系が 1% 程度まで漏れうるのが現実。
      // 0 == strict ではなく "ほぼ 0" を要求する。
      assert.ok((familyCounts.get('TRIP_PICK') ?? 0) <= 5, `TRIP_PICK expected <=5, got ${familyCounts.get('TRIP_PICK') ?? 0}/500`);
      assert.ok((familyCounts.get('REAR') ?? 0) <= 5, `REAR expected <=5, got ${familyCounts.get('REAR') ?? 0}/500`);
      assert.ok((familyCounts.get('BACKWARD_BODY_DROP') ?? 0) <= 3, `BACKWARD_BODY_DROP expected <=3, got ${familyCounts.get('BACKWARD_BODY_DROP') ?? 0}/500`);
      assert.ok(pushAndTwist / 500 > 0.9, `Expected push/pull shelves to dominate, got ${pushAndTwist}/500`);
    },
  },
  {
    name: 'kimarite: grapple style concentrates on force-out and throw in normal context',
    run: () => {
      const winner = {
        style: 'GRAPPLE' as const,
        bodyType: 'MUSCULAR' as const,
        heightCm: 185,
        weightKg: 156,
        stats: { tsuki: 52, oshi: 50, power: 91, kumi: 98, koshi: 96, waza: 58, nage: 78, deashi: 70 },
        traits: ['YOTSU_NO_ONI', 'BELT_COUNTER'] as Trait[],
        historyCounts: { 寄り切り: 20, 上手投げ: 8, 下手投げ: 5 },
      };
      const loser = {
        style: 'PUSH' as const,
        bodyType: 'ANKO' as const,
        heightCm: 180,
        weightKg: 162,
        stats: { tsuki: 72, oshi: 78, power: 88, kumi: 54, koshi: 58, waza: 44, nage: 40, deashi: 62 },
        traits: [],
        historyCounts: {},
      };
      const familyCounts = new Map<string, number>();
      for (let index = 0; index < 500; index += 1) {
        const result = resolveKimariteOutcome({
          winner,
          loser,
          rng: lcg(index + 701),
          allowNonTechnique: false,
          boutContext: {
            isHighPressure: false,
            isLastDay: false,
            isUnderdog: false,
            isEdgeCandidate: false,
            weightDiff: -6,
            heightDiff: 5,
          },
        });
        const entry = findOfficialKimariteEntry(result.kimarite);
        if (entry) {
          familyCounts.set(entry.family, (familyCounts.get(entry.family) ?? 0) + 1);
        }
      }
      const mainFamilies =
        (familyCounts.get('FORCE_OUT') ?? 0) +
        (familyCounts.get('THROW') ?? 0) +
        (familyCounts.get('TWIST_DOWN') ?? 0);
      // GRAPPLE 型は寄り・投げを主軸にしつつ、長いキャリアでは捻り系も実用棚に入る。
      // engagement 経由で後ろ系 / 反り系が 1% 程度漏れうる。
      assert.ok((familyCounts.get('REAR') ?? 0) <= 5, `REAR expected <=5, got ${familyCounts.get('REAR') ?? 0}/500`);
      assert.ok((familyCounts.get('BACKWARD_BODY_DROP') ?? 0) <= 3, `BACKWARD_BODY_DROP expected <=3, got ${familyCounts.get('BACKWARD_BODY_DROP') ?? 0}/500`);
      assert.ok(mainFamilies / 500 > 0.94, `Expected belt/throw/twist shelves to dominate, got ${mainFamilies}/500`);
    },
  },
  {
    name: 'kimarite: extreme floor remains non-zero for compatible pattern',
    run: () => {
      const winner = {
        style: 'TECHNIQUE' as const,
        bodyType: 'SOPPU' as const,
        heightCm: 191,
        weightKg: 122,
        stats: { waza: 105, nage: 94, deashi: 88, kumi: 64, koshi: 60, tsuki: 52, oshi: 48, power: 46 },
        traits: ['ARAWAZASHI', 'CLUTCH_REVERSAL', 'READ_THE_BOUT'] as Trait[],
        historyCounts: {},
      };
      const loser = {
        style: 'GRAPPLE' as const,
        bodyType: 'MUSCULAR' as const,
        heightCm: 185,
        weightKg: 132,
        stats: { power: 72, kumi: 68, koshi: 66 },
        traits: [],
        historyCounts: {},
      };
      let extremeCount = 0;
      for (let index = 0; index < 5000; index += 1) {
        const result = resolveKimariteOutcome({
          winner,
          loser,
          rng: lcg(index + 77),
          forcePattern: 'BACKWARD_ARCH',
          allowNonTechnique: false,
          boutContext: {
            isHighPressure: true,
            isLastDay: true,
            isUnderdog: true,
            isEdgeCandidate: true,
            weightDiff: -10,
            heightDiff: 6,
          },
        });
        if (['居反り', '掛け反り', '撞木反り', '外たすき反り', 'たすき反り', '伝え反り'].includes(result.kimarite)) {
          extremeCount += 1;
        }
      }
      assert.ok(extremeCount > 0, 'Expected at least one extreme backward-body-drop selection');
    },
  },
  {
    name: 'kimarite: edge context unlocks rare reversals for technique specialists',
    run: () => {
      const winner = {
        style: 'TECHNIQUE' as const,
        bodyType: 'SOPPU' as const,
        heightCm: 190,
        weightKg: 123,
        stats: { waza: 108, nage: 92, deashi: 86, kumi: 60, koshi: 58, tsuki: 54, oshi: 50, power: 45 },
        traits: ['ARAWAZASHI', 'CLUTCH_REVERSAL', 'READ_THE_BOUT'] as Trait[],
        historyCounts: { 叩き込み: 10, 突き落とし: 7, 上手投げ: 5 },
      };
      const loser = {
        style: 'GRAPPLE' as const,
        bodyType: 'MUSCULAR' as const,
        heightCm: 184,
        weightKg: 136,
        stats: { power: 74, kumi: 70, koshi: 68, tsuki: 56, oshi: 54, waza: 45, nage: 48, deashi: 58 },
        traits: [],
        historyCounts: {},
      };
      const edgeContext = {
        isHighPressure: true,
        isLastDay: true,
        isUnderdog: true,
        isEdgeCandidate: true,
        weightDiff: -13,
        heightDiff: 6,
      };
      const unlocked = resolveKimariteOutcome({
        winner,
        loser,
        rng: sequenceRng([0.5, 0.999, 0]),
        allowedRoute: 'EDGE_REVERSAL',
        allowNonTechnique: false,
        boutContext: edgeContext,
      });
      const locked = resolveKimariteOutcome({
        winner,
        loser,
        rng: sequenceRng([0.5, 0.999, 0]),
        allowedRoute: 'EDGE_REVERSAL',
        allowNonTechnique: false,
        boutContext: { ...edgeContext, isEdgeCandidate: false },
      });
      const rareReversals = ['うっちゃり', '後ろもたれ', '居反り', '掛け反り', '撞木反り', '外たすき反り', 'たすき反り', '伝え反り'];
      assert.ok(rareReversals.includes(unlocked.kimarite), `Expected edge context to unlock a rare reversal, got ${unlocked.kimarite}`);
      assert.ok(!rareReversals.includes(locked.kimarite), `Expected non-edge context to keep rare reversals locked, got ${locked.kimarite}`);
    },
  },
  {
    name: 'kimarite: initial rikishi gets seeded repertoire and empty win-route history',
    run: () => {
      const rikishi = createInitialRikishi({
        shikona: '試験山',
        age: 15,
        startingRank: { division: 'Jonokuchi', name: '序ノ口', number: 12, side: 'East' },
        archetype: 'AVG_JOE',
        tactics: 'PUSH',
        signatureMove: '押し出し',
        bodyType: 'ANKO',
        traits: ['TSUPPARI_TOKKA'],
        historyBonus: 0,
        stableId: 'stable-001',
        ichimonId: 'TAIJU',
        stableArchetypeId: 'TRADITIONAL_LARGE',
      });
      const repertoireSize = rikishi.kimariteRepertoire?.entries.length ?? 0;
      assert.ok(repertoireSize >= 7 && repertoireSize <= 10, `unexpected repertoire size: ${repertoireSize}`);
      assert.deepEqual(rikishi.kimariteRepertoire?.primaryRoutes, ['PUSH_OUT']);
      assert.ok((rikishi.kimariteRepertoire?.secondaryRoutes.length ?? 0) <= 2);
      assert.deepEqual(rikishi.history.winRouteTotal, {});
    },
  },
  {
    name: 'kimarite: ensureKimariteRepertoire backfills legacy status',
    run: () => {
      const legacy = createStatus({
        tactics: 'GRAPPLE',
        bodyType: 'MUSCULAR',
        traits: ['YOTSU_NO_ONI'],
        signatureMoves: ['寄り切り'],
      });
      delete (legacy as typeof legacy & { kimariteRepertoire?: unknown }).kimariteRepertoire;
      const normalized = ensureKimariteRepertoire(legacy);
      assert.ok(Boolean(normalized.kimariteRepertoire));
      assert.ok(normalized.kimariteRepertoire?.primaryRoutes.includes('BELT_FORCE'));
      assert.ok(normalized.kimariteRepertoire?.entries.some((entry) => entry.kimarite === '寄り切り'));
      assert.equal(normalized.kimariteRepertoire?.routeLockConfidence, 0);
    },
  },
  {
    name: 'style identity: internal weakness can drive matchup before display weakness appears',
    run: () => {
      const status = ensureStyleIdentityProfile(createStatus({}));
      const profile = status.styleIdentityProfile!;
      profile.styles.TSUKI_OSHI.resistance = -10;
      profile.styles.POWER_PRESSURE.resistance = -6;
      profile.styles.TSUKI_OSHI.sample = 60;
      profile.styles.POWER_PRESSURE.sample = 60;
      profile.styles.YOTSU.sample = 60;
      profile.styles.MOROZASHI.sample = 60;
      profile.styles.DOHYOUGIWA.sample = 60;
      profile.styles.NAGE_TECH.sample = 60;

      assert.deepEqual(resolveDisplayedWeakStyles(profile), []);
      assert.deepEqual(resolveInternalWeakStyles(profile), ['TSUKI_OSHI']);
      const matchupDelta = resolveStyleMatchupDelta(profile, 'PUSH');
      assert.ok(Math.abs(matchupDelta + 0.0288) < 1e-9, `unexpected matchup delta: ${matchupDelta}`);
    },
  },
  {
    name: 'kimarite: grapple provisional repertoire keeps two secondary routes',
    run: () => {
      const status = createStatus({
        tactics: 'GRAPPLE',
        bodyType: 'MUSCULAR',
        traits: ['YOTSU_NO_ONI'],
        signatureMoves: ['寄り切り'],
      });
      delete (status as typeof status & { kimariteRepertoire?: unknown }).kimariteRepertoire;
      const normalized = ensureKimariteRepertoire(status);

      assert.equal(normalized.kimariteRepertoire?.provisional, true);
      assert.deepEqual(normalized.kimariteRepertoire?.secondaryRoutes, ['THROW_BREAK', 'PULL_DOWN']);
    },
  },
  {
    name: 'kimarite: repertoire does not settle after a single dominant basho',
    run: () => {
      let status = ensureStyleIdentityProfile(createStatus({
        tactics: 'GRAPPLE',
        bodyType: 'MUSCULAR',
        traits: ['YOTSU_NO_ONI'],
        signatureMoves: ['寄り切り'],
      }));
      status.styleIdentityProfile!.styles.YOTSU.aptitude = 22;
      status.styleIdentityProfile!.styles.YOTSU.sample = 80;
      status.styleIdentityProfile!.styles.MOROZASHI.sample = 80;
      status.styleIdentityProfile!.styles.TSUKI_OSHI.sample = 80;
      status.styleIdentityProfile!.styles.POWER_PRESSURE.sample = 80;
      status.styleIdentityProfile!.styles.DOHYOUGIWA.sample = 80;
      status.styleIdentityProfile!.styles.NAGE_TECH.sample = 80;
      status = ensureKimariteRepertoire(status);

      const basho = {
        ...createBashoRecord(status.rank, 9, 6, 0),
        kimariteCount: { 寄り切り: 5, 上手投げ: 2, 引き落とし: 2 },
        winRouteCount: { BELT_FORCE: 7, THROW_BREAK: 2 },
      };
      const evolved = evolveKimariteRepertoireAfterBasho(status, basho, 12);

      assert.equal(evolved.kimariteRepertoire?.provisional, true);
      assert.equal(evolved.kimariteRepertoire?.routeLockConfidence, 1);
      assert.equal(evolved.kimariteRepertoire?.settledAtBashoSeq, undefined);
    },
  },
  {
    name: 'kata: lightweight overachiever trends toward technique styles',
    run: () => {
      let status = ensureStyleEvolutionProfile(createStatus({
        tactics: 'GRAPPLE',
        bodyType: 'SOPPU',
        bodyMetrics: { heightCm: 181, weightKg: 124, reachDeltaCm: 2 },
        stableArchetypeId: 'TECHNICAL_SMALL',
        signatureMoves: [],
        stats: { tsuki: 58, oshi: 55, deashi: 94, power: 54, kumi: 76, koshi: 72, waza: 101, nage: 97 },
      }));
      const records: BashoRecord[] = [
        {
          ...createBashoRecord(status.rank, 10, 5, 0),
          performanceOverExpected: 2.2,
          kimariteCount: { 上手投げ: 4, 下手投げ: 2, 叩き込み: 2, 引き落とし: 2 },
          winRouteCount: { THROW_BREAK: 5, PULL_DOWN: 4, EDGE_REVERSAL: 1 },
        },
        {
          ...createBashoRecord(status.rank, 9, 6, 0),
          performanceOverExpected: 1.7,
          kimariteCount: { 上手投げ: 3, 小手投げ: 2, 叩き込み: 2, 引き落とし: 2 },
          winRouteCount: { THROW_BREAK: 4, PULL_DOWN: 4, EDGE_REVERSAL: 1 },
        },
      ];
      status.history.records.push(...records);
      const firstBranchRecord = {
        ...createBashoRecord(status.rank, 11, 4, 0),
        performanceOverExpected: 2.8,
        kimariteCount: { 上手投げ: 4, 掬い投げ: 2, 叩き込み: 3, 引き落とし: 2 },
        winRouteCount: { THROW_BREAK: 5, PULL_DOWN: 5, EDGE_REVERSAL: 1 },
        specialPrizes: ['技能賞'],
      };
      status.history.records.push(firstBranchRecord);
      status = updateStyleEvolutionAfterBasho(status, firstBranchRecord, 9);
      const secondBranchRecord = {
        ...createBashoRecord(status.rank, 10, 5, 0),
        performanceOverExpected: 2.4,
        kimariteCount: { 上手投げ: 3, 下手投げ: 2, 叩き込み: 3, 引き落とし: 2 },
        winRouteCount: { THROW_BREAK: 4, PULL_DOWN: 5, EDGE_REVERSAL: 1 },
      };
      status.history.records.push(secondBranchRecord);
      status = updateStyleEvolutionAfterBasho(status, secondBranchRecord, 10);
      const normalized = ensureStyleIdentityProfile(status);
      const strengths = resolveDisplayedStrengthStyles(normalized.styleIdentityProfile);
      const nageTech = normalized.styleIdentityProfile?.styles.NAGE_TECH?.aptitude ?? 0;
      const dohyougiwa = normalized.styleIdentityProfile?.styles.DOHYOUGIWA?.aptitude ?? 0;

      assert.ok(nageTech > 0 || dohyougiwa > 0);
      assert.ok(
        strengths.length === 0 ||
        strengths.includes('NAGE_TECH') ||
        strengths.includes('DOHYOUGIWA'),
      );
    },
  },
  {
    name: 'kimarite: battle result carries route on decisive win',
    run: () => {
      const rikishi = createStatus({
        tactics: 'PUSH',
        bodyType: 'ANKO',
        traits: ['TSUPPARI_TOKKA', 'HEAVY_PRESSURE'],
        signatureMoves: ['押し出し'],
        stats: { tsuki: 105, oshi: 110, deashi: 88, power: 98, kumi: 46, koshi: 50, waza: 44, nage: 40 },
      });
      const result = calculateBattleResult(
        ensureKimariteRepertoire(rikishi),
        {
          id: 'enemy-001',
          shikona: '敵ノ海',
          rankValue: 18,
          rankName: '前頭',
          rankNumber: 15,
          rankSide: 'West',
          power: 52,
          ability: 54,
          styleBias: 'GRAPPLE',
          heightCm: 180,
          weightKg: 146,
        },
        {
          day: 3,
          currentWins: 2,
          currentLosses: 0,
          consecutiveWins: 2,
          currentWinStreak: 2,
          currentLossStreak: 0,
          isLastDay: false,
          isYushoContention: false,
          previousResult: 'WIN',
        },
        () => 0.01,
      );
      assert.equal(result.isWin, true);
      assert.ok(Boolean(result.winRoute));
    },
  },
  {
    name: 'scout: aptitude tier distribution follows entry-path based draft model',
    run: () => {
      const runs = 6000;
      const rng = lcg(20260301);
      const counts: Record<'S' | 'A' | 'B' | 'C' | 'D', number> = {
        S: 0,
        A: 0,
        B: 0,
        C: 0,
        D: 0,
      };
      const expectedRates: Record<'S' | 'A' | 'B' | 'C' | 'D', number> = {
        S: 0.008,
        A: 0.126,
        B: 0.633,
        C: 0.193,
        D: 0.041,
      };
      for (let i = 0; i < runs; i += 1) {
        const draft = rollScoutDraft(rng);
        counts[draft.aptitudeTier] += 1;
      }
      for (const tier of ['S', 'A', 'B', 'C', 'D'] as const) {
        const actual = counts[tier] / runs;
        const expected = expectedRates[tier];
        assert.ok(
          Math.abs(actual - expected) <= 0.02,
          `Aptitude ${tier} distribution out of range: actual=${actual}, expected=${expected}`,
        );
      }
    },
  },
  {
    name: 'scout: rolled draft gets a default stable assignment',
    run: () => {
      const draft = rollScoutDraft(lcg(20260313));
      assert.equal(draft.selectedStableId, 'stable-001');
    },
  },
  {
    name: 'scout: historical-like population separates calibration intake from player scout',
    run: () => {
      const runs = 1000;
      const rng = lcg(20260507);
      let age22Count = 0;
      let lowTierCount = 0;
      let normalOrSoppuCount = 0;
      const stableIds = new Set<string>();
      for (let i = 0; i < runs; i += 1) {
        const rikishi = buildInitialRikishiForObservationPopulation('historical-like-career', rng);
        if (rikishi.entryAge === 22) age22Count += 1;
        if (rikishi.aptitudeTier === 'C' || rikishi.aptitudeTier === 'D') lowTierCount += 1;
        if (rikishi.bodyType === 'NORMAL' || rikishi.bodyType === 'SOPPU') normalOrSoppuCount += 1;
        if (rikishi.stableId) stableIds.add(rikishi.stableId);
      }

      assert.ok(age22Count / runs < 0.08, `22歳入口が多すぎます: ${age22Count}`);
      assert.ok(lowTierCount / runs > 0.55, `C/D tier が historical-like として薄すぎます: ${lowTierCount}`);
      assert.ok(normalOrSoppuCount / runs > 0.2, `NORMAL/SOPPU 体格が薄すぎます: ${normalOrSoppuCount}`);
      assert.ok(stableIds.size > 20, `部屋分散が不足しています: ${stableIds.size}`);
    },
  },
  {
    name: 'scout: player default population keeps starter stable boundary',
    run: () => {
      const rng = lcg(20260508);
      for (let i = 0; i < 50; i += 1) {
        const rikishi = buildInitialRikishiForObservationPopulation('player-scout-default', rng);
        assert.equal(rikishi.stableId, 'stable-001');
      }
    },
  },
  {
    name: 'scout: historical-like v2-mid preset raises B tier without changing player scout',
    run: () => {
      const runs = 1000;
      const rng = lcg(20260509);
      let bTierCount = 0;
      let dTierCount = 0;
      let collegeOrChampionCount = 0;
      for (let i = 0; i < runs; i += 1) {
        const rikishi = buildInitialRikishiForObservationPopulation(
          'historical-like-career',
          rng,
          'historical-like-v2-mid',
        );
        if (rikishi.aptitudeTier === 'B') bTierCount += 1;
        if (rikishi.aptitudeTier === 'D') dTierCount += 1;
        if (rikishi.careerSeed?.entryPath === 'COLLEGE' || rikishi.careerSeed?.entryPath === 'CHAMPION') {
          collegeOrChampionCount += 1;
        }
      }

      assert.ok(bTierCount / runs >= 0.35, `B tier が薄すぎます: ${bTierCount}`);
      assert.ok(dTierCount / runs <= 0.18, `D tier が厚すぎます: ${dTierCount}`);
      assert.ok(collegeOrChampionCount / runs >= 0.07, `大学・実績層が薄すぎます: ${collegeOrChampionCount}`);
    },
  },
  {
    name: 'scout: draft aptitude tier is applied to generated growth profile',
    run: () => {
      const rikishi = buildInitialRikishiFromDraft(createScoutDraft({
        entryPath: 'LOCAL',
        aptitudeTier: 'C',
      }));
      assert.equal(rikishi.aptitudeTier, 'C');
      assert.deepEqual(rikishi.aptitudeProfile, CONSTANTS.APTITUDE_PROFILE_DATA.C);
    },
  },
  {
    name: 'scout: buildInitialRikishiFromDraft falls back when stable is missing',
    run: () => {
      const rikishi = buildInitialRikishiFromDraft({
        ...createScoutDraft(),
        selectedStableId: null,
      });
      assert.equal(rikishi.stableId, 'stable-001');
      assert.equal(rikishi.ichimonId, 'TAIJU');
    },
  },
  {
    name: 'scout: 22-year-old tsukedashi keeps peak height at entry',
    run: () => {
      const rikishi = buildInitialRikishiFromDraft({
        ...createScoutDraft(),
        entryAge: 22,
        entryPath: 'CHAMPION',
        startingHeightCm: 188,
        startingWeightKg: 149,
      });
      assert.equal(rikishi.entryAge, 22);
      assert.equal(rikishi.bodyMetrics.heightCm, 188);
      assert.equal(rikishi.careerSeed?.peakHeightCm, 188);
      assert.equal(rikishi.buildSummary?.heightPotentialCm, 188);
      assert.ok((rikishi.careerSeed?.peakWeightKg ?? 0) >= 149);
    },
  },
  {
    name: 'build vnext: college tsukedashi starts at full planned height',
    run: () => {
      const starter = getStarterOyakataBlueprints()[0];
      const rikishi = buildInitialRikishiFromSpec({
        ...createDefaultBuildSpecVNext(starter.id),
        amateurBackground: 'COLLEGE_YOKOZUNA',
        heightPotentialCm: 190,
        weightPotentialKg: 162,
      }, starter);
      assert.equal(rikishi.entryAge, 22);
      assert.equal(rikishi.bodyMetrics.heightCm, 190);
      assert.equal(rikishi.buildSummary?.heightPotentialCm, 190);
    },
  },
  {
    name: 'initialization: average initial stats are monotonic by aptitude tier',
    run: () => {
      const samples = 320;
      const tiers: Array<'S' | 'A' | 'B' | 'C' | 'D'> = ['S', 'A', 'B', 'C', 'D'];
      const averages: Record<'S' | 'A' | 'B' | 'C' | 'D', number> = {
        S: 0,
        A: 0,
        B: 0,
        C: 0,
        D: 0,
      };
      for (const tier of tiers) {
        let total = 0;
        for (let i = 0; i < samples; i += 1) {
          const seed = 20260310 + i;
          const status = createInitialRikishi(
            {
              shikona: '素質検証',
              age: 18,
              startingRank: { division: 'Maezumo', name: '前相撲', number: 1, side: 'East' },
              archetype: 'HARD_WORKER',
              aptitudeTier: tier,
              aptitudeFactor: CONSTANTS.APTITUDE_TIER_DATA[tier].factor,
              tactics: 'BALANCE',
              signatureMove: '寄り切り',
              bodyType: 'NORMAL',
              traits: [],
              historyBonus: 0,
              stableId: 'stable-001',
              ichimonId: 'TAIJU',
              stableArchetypeId: 'MASTER_DISCIPLE',
            },
            lcg(seed),
          );
          const avgStat = Object.values(status.stats).reduce((sum, value) => sum + value, 0) / 8;
          total += avgStat;
        }
        averages[tier] = total / samples;
      }
      assert.ok(averages.S > averages.A);
      assert.ok(averages.A > averages.B);
      assert.ok(averages.B > averages.C);
      assert.ok(averages.C > averages.D);
    },
  },
  {
    name: 'build vnext: cost curve is nonlinear and BMI floor is enforced',
    run: () => {
      const starter = getStarterOyakataBlueprints()[0];
      const base = createDefaultBuildSpecVNext(starter.id);
      const extreme = {
        ...base,
        heightPotentialCm: 204,
        weightPotentialKg: 240,
        reachDeltaCm: 8,
      };
      const baseCost = calculateBuildCostVNext(base, starter).total;
      const extremeCost = calculateBuildCostVNext(extreme, starter).total;
      assert.ok(extremeCost > baseCost + 20, 'Expected extreme body plan to cost much more');

      const bmiInvalid = {
        ...base,
        heightPotentialCm: 204,
        weightPotentialKg: 110,
        amateurBackground: 'MIDDLE_SCHOOL' as const,
      };
      assert.equal(isBuildSpecVNextBmiValid(bmiInvalid), false);
    },
  },
  {
    name: 'build vnext: generated rikishi reflects selected oyakata and style design',
    run: () => {
      const starter = getStarterOyakataBlueprints()[1];
      const spec: BuildSpecVNext = {
        ...createDefaultBuildSpecVNext(starter.id),
        primaryStyle: 'TSUKI_OSHI' as const,
        secondaryStyle: 'DOHYOUGIWA' as const,
        debtCards: ['LATE_START'],
      };
      const status = buildInitialRikishiFromSpec(spec, starter);
      const normalized = ensureStyleIdentityProfile(status);
      assert.equal(status.mentorId, starter.id);
      assert.equal(status.ichimonId, starter.ichimonId);
      assert.ok(Boolean(normalized.styleIdentityProfile), 'Expected style identity profile');
      assert.deepEqual(resolveDisplayedStrengthStyles(normalized.styleIdentityProfile), []);
      assert.equal(status.buildSummary?.debtCount, 1);
      assert.equal(status.spirit > 0, true);
    },
  },
  {
    name: 'traits: build vnext starts with locked trait journey and no active traits',
    run: () => {
      const starter = getStarterOyakataBlueprints()[0];
      const status = buildInitialRikishiFromSpec({
        ...createDefaultBuildSpecVNext(starter.id),
        bodyConstitution: 'LONG_REACH',
        injuryResistance: 'IRON_BODY',
        mentalTrait: 'BIG_STAGE',
      }, starter);

      assert.deepEqual(status.traits, []);
      assert.ok((status.traitJourney?.length ?? 0) >= 5, 'Expected locked trait journey entries');
      assert.ok(status.traitJourney?.every((entry) => entry.state === 'LOCKED'));
      assert.ok(status.traitJourney?.some((entry) => entry.trait === 'LONG_REACH' && entry.source === 'BODY_CONSTITUTION'));
      assert.ok(status.traitJourney?.some((entry) => entry.trait === 'BUJI_KORE_MEIBA' && entry.source === 'INJURY_RESISTANCE'));
      assert.ok(status.traitJourney?.some((entry) => entry.trait === 'OOBUTAI_NO_ONI' && entry.source === 'MENTAL_TRAIT'));
    },
  },
  {
    name: 'traits: basho awakening learns once and records a dedicated timeline event',
    run: () => {
      const status = createStatus({
        bodyMetrics: { heightCm: 189, weightKg: 148 },
        traits: [],
        traitJourney: buildLockedTraitJourney([
          { source: 'BODY_CONSTITUTION', traits: ['LONG_REACH'] },
        ]),
        history: {
          records: [
            {
              ...createBashoRecord({ division: 'Makushita', name: '幕下', number: 3, side: 'East' }, 5, 2),
              year: 2026,
              month: 1,
            },
          ],
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', number: 3, side: 'East' },
          totalWins: 5,
          totalLosses: 2,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: {},
          bodyTimeline: [],
          highlightEvents: [],
          traitAwakenings: [],
        },
      });

      const first = applyTraitAwakeningsForBasho({
        status,
        bashoSeq: 1,
        bashoRecord: status.history.records[0],
        playerBouts: [],
        currentRank: { division: 'Makushita', name: '幕下', number: 3, side: 'East' },
        nextRank: { division: 'Makushita', name: '幕下', number: 1, side: 'East' },
      });
      const second = applyTraitAwakeningsForBasho({
        status,
        bashoSeq: 1,
        bashoRecord: status.history.records[0],
        playerBouts: [],
        currentRank: { division: 'Makushita', name: '幕下', number: 3, side: 'East' },
        nextRank: { division: 'Makushita', name: '幕下', number: 1, side: 'East' },
      });

      assert.equal(first.awakenings.length, 1);
      assert.equal(first.events[0]?.type, 'TRAIT_AWAKENING');
      assert.deepEqual(status.traits, ['LONG_REACH']);
      assert.equal(status.history.traitAwakenings?.length, 1);
      assert.equal(second.awakenings.length, 0);
      assert.equal(status.history.events.filter((event) => event.type === 'TRAIT_AWAKENING').length, 1);
    },
  },
  {
    name: 'hoshitori: sekitori grid fills all 15 days',
    run: () => {
      const bouts: PlayerBoutDetail[] = Array.from({ length: 15 }, (_, index) => ({
        day: index + 1,
        result: index % 2 === 0 ? 'WIN' : 'LOSS',
      }));
      const grid = buildHoshitoriGrid(bouts, 'Makuuchi');
      assert.equal(grid.length, 15);
      assert.ok(grid.every((bout) => bout !== null));
      assert.equal(grid[0]?.day, 1);
      assert.equal(grid[14]?.day, 15);
    },
  },
  {
    name: 'hoshitori: lower-division sparse days keep null slots',
    run: () => {
      const scheduledDays = [1, 3, 5, 7, 9, 11, 13];
      const bouts: PlayerBoutDetail[] = scheduledDays.map((day) => ({
        day,
        result: 'WIN',
      }));
      const grid = buildHoshitoriGrid(bouts, 'Makushita');

      for (let day = 1; day <= 15; day += 1) {
        const cell = grid[day - 1];
        if (scheduledDays.includes(day)) {
          assert.ok(cell !== null, `Expected day ${day} to be occupied`);
        } else {
          assert.equal(cell, null);
        }
      }
    },
  },
  {
    name: 'hoshitori: out-of-range days are ignored',
    run: () => {
      const bouts: PlayerBoutDetail[] = [
        { day: 0, result: 'WIN' },
        { day: 16, result: 'LOSS' },
        { day: 8, result: 'ABSENT' },
      ];
      const grid = buildHoshitoriGrid(bouts, 'Juryo');
      assert.equal(grid[0], null);
      assert.equal(grid[7]?.result, 'ABSENT');
      assert.equal(grid[14], null);
    },
  },
  {
    name: 'hoshitori: duplicate day keeps latest bout',
    run: () => {
      const bouts: PlayerBoutDetail[] = [
        { day: 4, result: 'WIN', kimarite: '押し出し' },
        { day: 4, result: 'LOSS', kimarite: '不戦敗' },
      ];
      const grid = buildHoshitoriGrid(bouts, 'Juryo');
      assert.equal(grid[3]?.result, 'LOSS');
      assert.equal(grid[3]?.kimarite, '不戦敗');
    },
  },
  {
    name: 'hoshitori: maezumo is unsupported for display grid',
    run: () => {
      const bouts: PlayerBoutDetail[] = [
        { day: 1, result: 'WIN', kimarite: '押し出し' },
      ];
      const grid = buildHoshitoriGrid(bouts, 'Maezumo');
      assert.equal(grid.length, 0);
    },
  },
  {
    name: 'kimarite: catalog excludes unofficial names and includes official additions',
    run: () => {
      const names = new Set(KIMARITE_CATALOG.map((entry) => entry.name));
      assert.equal(names.has('電車道'), false);
      assert.equal(names.has('もろ差し'), false);
      assert.ok(names.has('浴びせ倒し'));
      assert.ok(names.has('送り倒し'));
      assert.ok(names.has('極め出し'));
      assert.ok(names.has('下手出し投げ'));
      assert.ok(names.has('引っ掛け'));
    },
  },
  {
    name: 'career: basho event descriptions use full rank labels',
    run: () => {
      const status = createStatus({
        rank: { division: 'Makushita', name: '幕下', side: 'East', number: 3 },
      });
      const bashoRecord = createBashoRecord(status.rank, 7, 0, 0, true);
      appendBashoEvents(
        status,
        2026,
        5,
        bashoRecord,
        {
          nextRank: { division: 'Juryo', name: '十両', side: 'West', number: 13 },
          event: 'PROMOTION_TO_JURYO',
        },
        status.rank,
      );

      assert.equal(status.history.events[0]?.description, '西十両13枚目へ昇進 (7勝0敗)');
      assert.equal(status.history.events[1]?.description, '幕下優勝 (東幕下3枚目 / 7勝)');
    },
  },
  {
    name: 'career: standard start resolves to hidden simulation and reveal-ready completion',
    run: () => {
      assert.equal(resolveSimulationPhaseOnStart('skip_to_end'), 'simulating');
      assert.equal(resolveSimulationPhaseOnCompletion('skip_to_end'), 'reveal_ready');
      assert.equal(shouldCaptureObservations('skip_to_end'), false);
    },
  },
  {
    name: 'career: observe start resolves to running and completed phases with observation capture',
    run: () => {
      assert.equal(resolveSimulationPhaseOnStart('observe'), 'running');
      assert.equal(resolveSimulationPhaseOnCompletion('observe'), 'completed');
      assert.equal(shouldCaptureObservations('observe'), true);
    },
  },
  {
    name: 'logic-lab: realism presets initialize with distinct ability bands',
    run: () => {
      const low = createLogicLabInitialStatus('LOW_TALENT_CD', () => 0.5);
      const grinder = createLogicLabInitialStatus('STANDARD_B_GRINDER', () => 0.5);
      const high = createLogicLabInitialStatus('HIGH_TALENT_AS', () => 0.5);

      assert.ok(low.ratingState.ability < grinder.ratingState.ability, 'Low talent should start below grinder');
      assert.ok(grinder.ratingState.ability < high.ratingState.ability, 'Grinder should start below high talent');
      assert.ok(high.ratingState.ability >= 90, `High talent ability too low: ${high.ratingState.ability}`);
    },
  },
  {
    name: 'logic-lab: same preset and seed are deterministic',
    run: async () => {
      const first = await runLogicLabToEnd({
        presetId: LOGIC_LAB_DEFAULT_PRESET,
        seed: 7331,
        maxBasho: 120,
      });
      const second = await runLogicLabToEnd({
        presetId: LOGIC_LAB_DEFAULT_PRESET,
        seed: 7331,
        maxBasho: 120,
      });

      assert.equal(first.logs.length, second.logs.length);
      assert.deepEqual(first.summary.currentRank, second.summary.currentRank);
      assert.equal(first.summary.totalWins, second.summary.totalWins);
      assert.equal(first.summary.totalLosses, second.summary.totalLosses);
      assert.equal(first.summary.totalAbsent, second.summary.totalAbsent);
    },
  },
  {
    name: 'logic-lab: different seed changes major outcomes',
    run: async () => {
      const first = await runLogicLabToEnd({
        presetId: LOGIC_LAB_DEFAULT_PRESET,
        seed: 7331,
        maxBasho: 120,
      });
      const second = await runLogicLabToEnd({
        presetId: LOGIC_LAB_DEFAULT_PRESET,
        seed: 8128,
        maxBasho: 120,
      });

      const changed =
        JSON.stringify(first.summary.currentRank) !== JSON.stringify(second.summary.currentRank) ||
        first.summary.totalWins !== second.summary.totalWins ||
        first.summary.totalLosses !== second.summary.totalLosses ||
        first.summary.totalAbsent !== second.summary.totalAbsent ||
        first.logs.length !== second.logs.length;

      assert.ok(changed, 'Expected different seed to change at least one major metric');
    },
  },
  {
    name: 'logic-lab: max basho limit safely stops run',
    run: async () => {
      const result = await runLogicLabToEnd({
        presetId: LOGIC_LAB_DEFAULT_PRESET,
        seed: 7331,
        maxBasho: 3,
      });

      assert.equal(result.logs.length, 3);
      assert.equal(result.summary.bashoCount, 3);
      assert.equal(result.summary.stopReason, 'MAX_BASHO_REACHED');
    },
  },
  {
    name: 'build-lab: aptitude reveal and tune costs are applied only when revealed',
    run: () => {
      const spec = createDefaultBuildSpec();
      const hidden = calculateBuildCost(spec);
      assert.equal(resolveDisplayedAptitudeTier(spec), undefined);
      assert.equal(hidden.breakdown.aptitudeReveal, 0);
      assert.equal(hidden.breakdown.aptitudeTune, 0);

      const revealed = {
        ...spec,
        aptitudePlan: {
          reveal: true as const,
          tuneStep: 2 as const,
        },
      };
      const opened = calculateBuildCost(revealed);
      assert.equal(resolveDisplayedAptitudeTier(revealed), revealed.aptitudeBaseTier);
      assert.equal(opened.breakdown.aptitudeReveal, BUILD_COST.APTITUDE_REVEAL);
      assert.equal(opened.breakdown.aptitudeTune, BUILD_COST.APTITUDE_TUNE_STEP * 2);
    },
  },
  {
    name: 'kata: unresolved profile is displayed as none',
    run: () => {
      const status = createStatus();
      const display = resolveKataDisplay(status.kataProfile);
      assert.equal(display.styleLabel, 'なし');
      assert.equal(display.dominantMoveLabel, '');
    },
  },
  {
    name: 'kata: settles only after sustained confidence conditions',
    run: () => {
      let status = createStatus({
        tactics: 'BALANCE',
        signatureMoves: [],
        stats: {
          tsuki: 128,
          oshi: 126,
          kumi: 78,
          nage: 70,
          koshi: 82,
          deashi: 120,
          waza: 72,
          power: 118,
        },
      });
      for (let seq = 1; seq <= 15; seq += 1) {
        const record: BashoRecord = {
          ...createBashoRecord(status.rank, 14, 1, 0),
          kimariteCount: { 押し出し: 10, 突き出し: 3, 突き落とし: 1 },
        };
        status.history.records.push(record);
        status = updateKataProfileAfterBasho(status, record, seq);
      }
      assert.equal(status.kataProfile?.settled, true);
      assert.ok(Boolean(status.kataProfile?.displayName));
      assert.ok((status.signatureMoves?.length ?? 0) > 0);
    },
  },
  {
    name: 'kata: heavy absence path can remain unsettled',
    run: () => {
      let status = createStatus({
        tactics: 'BALANCE',
        signatureMoves: [],
        stats: {
          tsuki: 92,
          oshi: 93,
          kumi: 94,
          nage: 95,
          koshi: 92,
          deashi: 93,
          waza: 94,
          power: 95,
        },
      });
      for (let seq = 1; seq <= 14; seq += 1) {
        const record: BashoRecord = {
          ...createBashoRecord(status.rank, 3, 2, 10),
          kimariteCount: { 押し出し: 1, 寄り切り: 1, 叩き込み: 1 },
        };
        status.history.records.push(record);
        status = updateKataProfileAfterBasho(status, record, seq);
      }
      assert.ok(status.kataProfile?.settled !== true);
      assert.equal(resolveKataDisplay(status.kataProfile).styleLabel, 'なし');
    },
  },
  {
    name: 'kata: legacy status can be backfilled without crash',
    run: () => {
      const legacy = createStatus({
        tactics: 'GRAPPLE',
        signatureMoves: ['寄り切り'],
      });
      const normalized = ensureKataProfile({ ...legacy, kataProfile: undefined });
      assert.ok(Boolean(normalized.kataProfile));
      assert.equal(normalized.kataProfile?.settled, true);
      assert.equal(resolveKataDisplay(normalized.kataProfile).styleLabel.includes('寄り'), true);
    },
  }
];
