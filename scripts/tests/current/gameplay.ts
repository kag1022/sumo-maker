import { createInitialRikishi } from '../../../src/logic/initialization';
import { PlayerBoutDetail } from '../../../src/logic/simulation/basho';
import { BashoRecord, BuildSpecVNext, Trait } from '../../../src/logic/models';
import { listNonTechniqueCatalog, listOfficialWinningKimariteCatalog, normalizeKimariteName } from '../../../src/logic/kimarite/catalog';
import { inferBodyTypeFromMetrics, resolveKimariteOutcome } from '../../../src/logic/kimarite/selection';
import { KIMARITE_CATALOG } from '../../../src/logic/kimarite/catalog';
import { buildInitialRikishiFromDraft, rollScoutDraft } from '../../../src/logic/scout/gacha';
import { CONSTANTS } from '../../../src/logic/constants';
import { appendBashoEvents } from '../../../src/logic/simulation/career';
import { BUILD_COST, buildInitialRikishiFromSpec, calculateBuildCost, calculateBuildCostVNext, createDefaultBuildSpec, createDefaultBuildSpecVNext, getStarterOyakataBlueprints, isBuildSpecVNextBmiValid, resolveDisplayedAptitudeTier } from '../../../src/logic/build/buildLab';
import { ensureKataProfile, resolveKataDisplay, updateKataProfileAfterBasho } from '../../../src/logic/style/kata';
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
        });
        seen.add(result.kimarite);
      }
      assert.ok(!seen.has('居反り'));
      assert.ok(!seen.has('伝え反り'));
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
        });
        if (['居反り', '掛け反り', '撞木反り', '外たすき反り', 'たすき反り', '伝え反り'].includes(result.kimarite)) {
          extremeCount += 1;
        }
      }
      assert.ok(extremeCount > 0, 'Expected at least one extreme backward-body-drop selection');
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
        S: 0,
        A: 1 / 6,
        B: 1 / 2,
        C: 1 / 3,
        D: 0,
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
      assert.equal(status.mentorId, starter.id);
      assert.equal(status.ichimonId, starter.ichimonId);
      assert.ok(Boolean(status.designedStyleProfile), 'Expected designed style profile');
      assert.equal(status.designedStyleProfile?.dominant, starter.secretStyle);
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
