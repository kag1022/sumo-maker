import { calculateNextRank } from '../../../src/logic/banzuke/rules/singleRankChange';
import { generateNextBanzuke } from '../../../src/logic/banzuke/providers/topDivision';
import { BashoRecordSnapshot } from '../../../src/logic/banzuke/providers/sekitori/types';
import { calculateLowerDivisionRankChange, resolveLowerRangeDeltaByScore } from '../../../src/logic/banzuke/rules/lowerDivision';
import { resolveSekitoriDeltaBand } from '../../../src/logic/banzuke/providers/sekitori/bands';
import { resolveTopDirective } from '../../../src/logic/banzuke/providers/sekitori/directives';
import { scoreTopDivisionCandidate } from '../../../src/logic/banzuke/providers/sekitori/scoring';
import { LIMITS } from '../../../src/logic/banzuke/scale/rankLimits';
import { runBashoDetailed } from '../../../src/logic/simulation/basho';
import { createSekitoriBoundaryWorld, resolveSekitoriQuotaForPlayer, runSekitoriQuotaStep } from '../../../src/logic/simulation/sekitoriQuota';
import { resolveSekitoriExchangePolicy } from '../../../src/logic/simulation/sekitori/quota/exchangePolicy';
import { createFacedMap } from '../../../src/logic/simulation/matchmaking';
import { buildLowerDivisionBoutDays, createLowerDivisionBoutDayMap, DEFAULT_TORIKUMI_BOUNDARY_BANDS, resolveLowerDivisionEligibility } from '../../../src/logic/simulation/torikumi/policy';
import { scheduleTorikumiBasho } from '../../../src/logic/simulation/torikumi/scheduler';
import { pairWithinDivision } from '../../../src/logic/simulation/torikumi/scheduler/intraDivision';
import { TorikumiParticipant } from '../../../src/logic/simulation/torikumi/types';
import { createLowerDivisionQuotaWorld, resolveLowerDivisionQuotaForPlayer, runLowerDivisionQuotaStep } from '../../../src/logic/simulation/lowerQuota';
import { resolveBoundaryExchange } from '../../../src/logic/simulation/lower/exchange';
import { BoundarySnapshot as LowerBoundarySnapshot, EMPTY_EXCHANGE as EMPTY_LOWER_EXCHANGE, LOWER_BOUNDARIES } from '../../../src/logic/simulation/lower/types';
import { resolveExpectedSlotBand } from '../../../src/logic/banzuke/providers/expected/slotBands';
import { resolveLowerAssignedNextRank, resolveLowerDivisionPlacements } from '../../../src/logic/banzuke/providers/lowerBoundary';
import { resolveSekitoriBoundaryAssignedRank } from '../../../src/logic/banzuke/providers/sekitoriBoundary';
import { advanceTopDivisionBanzuke, createSimulationWorld, finalizeSekitoriPlayerPlacement, resolveTopDivisionQuotaForPlayer, syncPlayerActorInWorld } from '../../../src/logic/simulation/world';
import { BoundarySnapshot as SekitoriBoundarySnapshot } from '../../../src/logic/simulation/sekitori/types';
import { Rank } from '../../../src/logic/models';
import { composeNextBanzuke, evaluateYokozunaPromotion, maxNumber, optimizeExpectedPlacements, rankNumberSideToSlot, resolveVariableHeadcountByFlow, slotToRankNumberSide } from '../../../src/logic/banzuke';

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

const assertUniqueSekitoriRosterSlots = (
  world: ReturnType<typeof createSimulationWorld>,
  context: string,
): void => {
  const totalPlayerRows = [...world.rosters.Makuuchi, ...world.rosters.Juryo]
    .filter((rikishi) => rikishi.id === 'PLAYER')
    .length;
  assert.ok(totalPlayerRows === 1, `Expected exactly one PLAYER row in ${context}, got ${totalPlayerRows}`);

  for (const division of ['Makuuchi', 'Juryo'] as const) {
    const scores = world.rosters[division].map((rikishi) => rikishi.rankScore);
    assert.ok(
      new Set(scores).size === scores.length,
      `Expected unique ${division} rankScore values in ${context}`,
    );
  }
};

export const tests: TestCase[] = [
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
    name: 'ranking: yokozuna promotion is blocked without consecutive yusho-equivalent',
    run: () => {
      const ozeki: Rank = { division: 'Makuuchi', name: '大関', side: 'East' };
      const prev = createBashoRecord(ozeki, 15, 0);
      prev.yusho = true;
      const current = createBashoRecord(ozeki, 14, 1);
      const result = calculateNextRank(current, [prev], false, () => 0.1);
      assert.equal(result.nextRank.name, '大関');
      assert.equal(result.event, undefined);
    },
  },
{
    name: 'ranking: yokozuna promotion requires a stronger two-basho total than 14Y-13JY',
    run: () => {
      const evalResult = evaluateYokozunaPromotion({
        id: 'ozeki-a',
        shikona: '大関A',
        rank: { division: 'Makuuchi', name: '大関', side: 'East' },
        wins: 14,
        losses: 1,
        absent: 0,
        yusho: true,
        pastRecords: [
          {
            rank: { division: 'Makuuchi', name: '大関', side: 'West' },
            wins: 13,
            losses: 2,
            absent: 0,
            junYusho: true,
          },
        ],
      });
      assert.equal(evalResult.promote, false);
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
    name: 'ranking: ozeki promotion requires all 3 basho at sekiwake/komusubi',
    run: () => {
      const sekiwake: Rank = { division: 'Makuuchi', name: '関脇', side: 'East' };
      const current = createBashoRecord(sekiwake, 12, 3);
      const prev1 = createBashoRecord({ division: 'Makuuchi', name: '小結', side: 'West' }, 12, 3);
      const prev2 = createBashoRecord({ division: 'Makuuchi', name: '前頭', side: 'East', number: 4 }, 9, 6);
      const result = calculateNextRank(current, [prev1, prev2], false, () => 0.5);
      assert.ok(result.nextRank.name !== '大関', 'Maegashira basho should not count toward Ozeki promotion');
    },
  },
{
    name: 'ranking: assigned top ozeki does not bypass 33-win sekiwake/komusubi gate',
    run: () => {
      const sekiwake: Rank = { division: 'Makuuchi', name: '関脇', side: 'East' };
      const current = createBashoRecord(sekiwake, 12, 3);
      const prev1 = createBashoRecord({ division: 'Makuuchi', name: '小結', side: 'East' }, 9, 6);
      const prev2 = createBashoRecord({ division: 'Makuuchi', name: '前頭', side: 'East', number: 4 }, 11, 4);
      const result = calculateNextRank(
        current,
        [prev1, prev2],
        false,
        () => 0.5,
        {
          topDivisionQuota: {
            assignedNextRank: { division: 'Makuuchi', name: '大関', side: 'East' },
          },
        },
      );
      assert.ok(result.nextRank.name !== '大関', 'Assigned Ozeki should be ignored when gate is not met');
    },
  },
{
    name: 'ranking: npc/player ozeki gate parity on eligible 33-win sanyaku chain',
    run: () => {
      const sekiwake: Rank = { division: 'Makuuchi', name: '関脇', side: 'East' };
      const komusubi: Rank = { division: 'Makuuchi', name: '小結', side: 'West' };
      const current = createBashoRecord(sekiwake, 11, 4);
      const prev1 = createBashoRecord(sekiwake, 11, 4);
      const prev2 = createBashoRecord(komusubi, 11, 4);

      const player = calculateNextRank(current, [prev1, prev2], false, () => 0.5);
      assert.equal(player.nextRank.name, '大関');

      const npcDirective = resolveTopDirective({
        id: 'NPC-1',
        shikona: '検証山',
        rank: sekiwake,
        wins: 11,
        losses: 4,
        absent: 0,
        pastRecords: [
          { rank: sekiwake, wins: 11, losses: 4, absent: 0 },
          { rank: komusubi, wins: 11, losses: 4, absent: 0 },
        ],
      });
      assert.equal(npcDirective.preferredTopName, '大関');
    },
  },
{
    name: 'ranking: npc/player ozeki gate parity blocks maegashira-included chain',
    run: () => {
      const sekiwake: Rank = { division: 'Makuuchi', name: '関脇', side: 'East' };
      const komusubi: Rank = { division: 'Makuuchi', name: '小結', side: 'West' };
      const maegashira: Rank = { division: 'Makuuchi', name: '前頭', number: 2, side: 'East' };
      const current = createBashoRecord(sekiwake, 12, 3);
      const prev1 = createBashoRecord(komusubi, 11, 4);
      const prev2 = createBashoRecord(maegashira, 12, 3);

      const player = calculateNextRank(current, [prev1, prev2], false, () => 0.5);
      assert.ok(player.nextRank.name !== '大関');

      const npcDirective = resolveTopDirective({
        id: 'NPC-2',
        shikona: '検証海',
        rank: sekiwake,
        wins: 12,
        losses: 3,
        absent: 0,
        pastRecords: [
          { rank: komusubi, wins: 11, losses: 4, absent: 0 },
          { rank: maegashira, wins: 12, losses: 3, absent: 0 },
        ],
      });
      assert.ok(npcDirective.preferredTopName !== '大関');
    },
  },
{
    name: 'ranking: jonokuchi makekoshi does not demote to maezumo',
    run: () => {
      const jonokuchi: Rank = {
        division: 'Jonokuchi',
        name: '序ノ口',
        side: 'East',
        number: LIMITS.JONOKUCHI_MAX,
      };
      const result = calculateNextRank(createBashoRecord(jonokuchi, 2, 5), [], false, () => 0.5);
      assert.equal(result.nextRank.division, 'Jonokuchi');
      assert.equal(result.nextRank.name, '序ノ口');
    },
  },
{
    name: 'ranking: jonokuchi bottom makekoshi can rise when lower tail is wide',
    run: () => {
      const result = calculateLowerDivisionRankChange(
        createBashoRecord(
          {
            division: 'Jonokuchi',
            name: '序ノ口',
            side: 'West',
            number: 48,
          },
          3,
          4,
        ),
        {
          scaleSlots: {
            Makuuchi: 42,
            Juryo: 28,
            Makushita: 120,
            Sandanme: 180,
            Jonidan: 280,
            Jonokuchi: 96,
          },
        },
        () => 0.5,
      );
      assert.equal(result.nextRank.division, 'Jonokuchi');
      assert.ok(
        (result.nextRank.number ?? 999) < 48,
        `Expected bottom makekoshi to improve inside Jonokuchi, got ${result.nextRank.number}${result.nextRank.side ?? ''}`,
      );
    },
  },
{
    name: 'ranking: jonokuchi full absence is clamped to jonokuchi bottom',
    run: () => {
      const jonokuchi: Rank = {
        division: 'Jonokuchi',
        name: '序ノ口',
        side: 'East',
        number: LIMITS.JONOKUCHI_MAX,
      };
      const result = calculateNextRank(createBashoRecord(jonokuchi, 0, 0, 7), [], false, () => 0.5);
      assert.equal(result.nextRank.division, 'Jonokuchi');
      assert.equal(result.nextRank.number, LIMITS.JONOKUCHI_MAX);
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
    name: 'ranking: lower quota demotion flag is advisory (makushita makekoshi)',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 60 };
      const baseline = calculateNextRank(
        createBashoRecord(makushita, 0, 7),
        [],
        false,
        () => 0.5,
      );
      const flagged = calculateNextRank(
        createBashoRecord(makushita, 0, 7),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canDemoteToSandanme: false } },
      );
      assert.equal(flagged.nextRank.division, baseline.nextRank.division);
      assert.equal(flagged.nextRank.name, baseline.nextRank.name);
      assert.equal(flagged.nextRank.number, baseline.nextRank.number);
      assert.equal(flagged.nextRank.side, baseline.nextRank.side);
    },
  },
{
    name: 'ranking: lower quota demotion flag is advisory (makushita full absence)',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 60 };
      const baseline = calculateNextRank(
        createBashoRecord(makushita, 0, 0, 7),
        [],
        false,
        () => 0.5,
      );
      const flagged = calculateNextRank(
        createBashoRecord(makushita, 0, 0, 7),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canDemoteToSandanme: false } },
      );
      assert.equal(flagged.nextRank.division, baseline.nextRank.division);
      assert.equal(flagged.nextRank.number, baseline.nextRank.number);
    },
  },
{
    name: 'ranking: lower quota promotion flag is advisory (sandanme kachikoshi)',
    run: () => {
      const sandanme: Rank = { division: 'Sandanme', name: '三段目', side: 'East', number: 3 };
      const baseline = calculateNextRank(
        createBashoRecord(sandanme, 6, 1),
        [],
        false,
        () => 0.5,
      );
      const flagged = calculateNextRank(
        createBashoRecord(sandanme, 6, 1),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canPromoteToMakushita: false } },
      );
      assert.equal(flagged.nextRank.division, baseline.nextRank.division);
      assert.equal(flagged.nextRank.number, baseline.nextRank.number);
    },
  },
{
    name: 'ranking: lower quota promotion flag is advisory (sandanme head kachikoshi)',
    run: () => {
      const sandanme: Rank = { division: 'Sandanme', name: '三段目', side: 'East', number: 1 };
      const baseline = calculateNextRank(
        createBashoRecord(sandanme, 4, 3),
        [],
        false,
        () => 0.5,
      );
      const flagged = calculateNextRank(
        createBashoRecord(sandanme, 4, 3),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canPromoteToMakushita: false } },
      );
      assert.equal(flagged.nextRank.division, baseline.nextRank.division);
      assert.equal(flagged.nextRank.number, baseline.nextRank.number);
    },
  },
{
    name: 'ranking: lower quota demotion flag is advisory (jonidan makekoshi)',
    run: () => {
      const jonidan: Rank = { division: 'Jonidan', name: '序二段', side: 'East', number: 100 };
      const baseline = calculateNextRank(
        createBashoRecord(jonidan, 0, 7),
        [],
        false,
        () => 0.5,
      );
      const flagged = calculateNextRank(
        createBashoRecord(jonidan, 0, 7),
        [],
        false,
        () => 0.5,
        { lowerDivisionQuota: { canDemoteToJonokuchi: false } },
      );
      assert.equal(flagged.nextRank.division, baseline.nextRank.division);
      assert.equal(flagged.nextRank.number, baseline.nextRank.number);
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
    name: 'quota: ms13 7-0 reaches juryo when lower sekitori slots open widely',
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
      assert.equal(exchange.reason, 'NORMAL');
    },
  },
{
    name: 'quota: sekitori boundary never promotes makekoshi player from makushita',
    run: () => {
      const juryoResults: SekitoriBoundarySnapshot[] = [
        {
          id: 'Juryo-1',
          shikona: '十両壱',
          isPlayer: false,
          stableId: 'j-1',
          rankScore: 27,
          wins: 5,
          losses: 10,
        },
      ];
      const makushitaResults: SekitoriBoundarySnapshot[] = [
        {
          id: 'PLAYER',
          shikona: '試験山',
          isPlayer: true,
          stableId: 'player-heya',
          rankScore: 1,
          wins: 3,
          losses: 4,
        },
        {
          id: 'Makushita-1',
          shikona: '幕下壱',
          isPlayer: false,
          stableId: 'm-1',
          rankScore: 2,
          wins: 6,
          losses: 1,
        },
      ];
      const assigned = resolveSekitoriBoundaryAssignedRank(
        juryoResults,
        makushitaResults,
        {
          slots: 1,
          promotedToJuryoIds: ['PLAYER'],
          demotedToMakushitaIds: ['Juryo-1'],
          playerPromotedToJuryo: true,
          playerDemotedToMakushita: false,
          reason: 'NORMAL',
        },
        false,
      );
      assert.ok(Boolean(assigned), 'Expected assigned rank');
      assert.equal(assigned?.division, 'Makushita');
      assert.equal(assigned?.name, '幕下');
    },
  },
{
    name: 'quota: sekitori boundary representative fixture resolves player rank on fast path',
    run: () => {
      const assigned = resolveSekitoriBoundaryAssignedRank(
        [
          { id: 'J-keep', shikona: '十残', isPlayer: false, stableId: 'j-1', rankScore: 26, wins: 6, losses: 9 },
          { id: 'PLAYER', shikona: '力士', isPlayer: true, stableId: 'player-heya', rankScore: 28, wins: 5, losses: 10 },
        ],
        [
          { id: 'MS-top', shikona: '幕昇', isPlayer: false, stableId: 'ms-1', rankScore: 1, wins: 6, losses: 1 },
          { id: 'MS-next', shikona: '幕次', isPlayer: false, stableId: 'ms-2', rankScore: 2, wins: 5, losses: 2 },
          { id: 'MS-low', shikona: '幕残', isPlayer: false, stableId: 'ms-3', rankScore: 3, wins: 3, losses: 4 },
        ],
        {
          slots: 1,
          promotedToJuryoIds: ['MS-top'],
          demotedToMakushitaIds: ['PLAYER'],
          playerPromotedToJuryo: false,
          playerDemotedToMakushita: true,
          reason: 'NORMAL',
        },
        false,
      );

      assert.ok(Boolean(assigned), 'Expected player assignment');
      assert.equal(assigned?.division, 'Makushita');
    },
  },
{
    name: 'banzuke scoring: juryo absent never increases candidate score',
    run: () => {
      const baseSnapshot: BashoRecordSnapshot = {
        id: 'J-test',
        shikona: '十両試験',
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 6 },
        wins: 8,
        losses: 7,
        absent: 0,
      };
      const absentSnapshot: BashoRecordSnapshot = {
        ...baseSnapshot,
        absent: 5,
      };
      const baseScore = scoreTopDivisionCandidate(
        baseSnapshot,
        resolveTopDirective(baseSnapshot),
        52,
      );
      const absentScore = scoreTopDivisionCandidate(
        absentSnapshot,
        resolveTopDirective(absentSnapshot),
        52,
      );
      assert.ok(
        absentScore <= baseScore,
        `Expected absent score <= base score, got ${absentScore} > ${baseScore}`,
      );
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
    name: 'quota: sekitori boundary resolves zero slot when makushita has no kachikoshi candidate',
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
      assert.equal(exchange.slots, 0);
    },
  },
{
    name: 'quota: sekitori exchange backfills one weak makushita fallback promotion when needed',
    run: () => {
      const juryoResults: SekitoriBoundarySnapshot[] = [
        {
          id: 'J-keep-1',
          shikona: '十両保留',
          isPlayer: false,
          stableId: 'j-1',
          rankScore: 27,
          wins: 6,
          losses: 9,
        },
      ];
      const makushitaResults: SekitoriBoundarySnapshot[] = [
        {
          id: 'MS-weak-1',
          shikona: '幕下弱候補壱',
          isPlayer: false,
          stableId: 'ms-1',
          rankScore: 41,
          wins: 4,
          losses: 3,
        },
        {
          id: 'MS-weak-2',
          shikona: '幕下弱候補弐',
          isPlayer: false,
          stableId: 'ms-2',
          rankScore: 37,
          wins: 4,
          losses: 3,
        },
      ];

      const resolved = resolveSekitoriExchangePolicy({
        juryoResults,
        makushitaResults,
        playerJuryoIsMakekoshi: false,
        playerJuryoFullAbsence: false,
        playerMakushitaIsKachikoshi: false,
      });

      assert.equal(resolved.exchange.slots, 1);
      assert.equal(resolved.exchange.promotedToJuryoIds.length, 1);
    },
  },
{
    name: 'quota: representative lower-boundary optimizer fixture resolves without fallback',
    run: () => {
      const assignments = optimizeExpectedPlacements([
        {
          id: 'A',
          currentRank: { division: 'Makushita', name: '幕下', side: 'East', number: 3 },
          wins: 6,
          losses: 1,
          absent: 0,
          currentSlot: 5,
          expectedSlot: 2,
          minSlot: 1,
          maxSlot: 4,
          mandatoryDemotion: false,
          mandatoryPromotion: true,
          sourceDivision: 'Makushita',
          score: 320,
        },
        {
          id: 'B',
          currentRank: { division: 'Makushita', name: '幕下', side: 'West', number: 2 },
          wins: 4,
          losses: 3,
          absent: 0,
          currentSlot: 4,
          expectedSlot: 3,
          minSlot: 1,
          maxSlot: 4,
          mandatoryDemotion: false,
          mandatoryPromotion: false,
          sourceDivision: 'Makushita',
          score: 240,
        },
        {
          id: 'C',
          currentRank: { division: 'Makushita', name: '幕下', side: 'East', number: 2 },
          wins: 1,
          losses: 1,
          absent: 0,
          currentSlot: 3,
          expectedSlot: 3,
          minSlot: 2,
          maxSlot: 4,
          mandatoryDemotion: false,
          mandatoryPromotion: false,
          sourceDivision: 'Makushita',
          score: 120,
        },
        {
          id: 'D',
          currentRank: { division: 'Makushita', name: '幕下', side: 'West', number: 1 },
          wins: 2,
          losses: 5,
          absent: 0,
          currentSlot: 2,
          expectedSlot: 4,
          minSlot: 2,
          maxSlot: 5,
          mandatoryDemotion: false,
          mandatoryPromotion: false,
          sourceDivision: 'Makushita',
          score: -40,
        },
        {
          id: 'E',
          currentRank: { division: 'Makushita', name: '幕下', side: 'East', number: 1 },
          wins: 0,
          losses: 7,
          absent: 0,
          currentSlot: 1,
          expectedSlot: 5,
          minSlot: 2,
          maxSlot: 5,
          mandatoryDemotion: true,
          mandatoryPromotion: false,
          sourceDivision: 'Makushita',
          score: -220,
        },
      ], 5);

      assert.ok(Boolean(assignments), 'Expected optimizer to resolve representative fixture');
      assert.equal(assignments?.length, 5);
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
    name: 'quota: lower boundary placements keep kachikoshi above makekoshi in representative fixture',
    run: () => {
      const results = {
        Makushita: [
          { id: 'MS-KK', shikona: '幕勝', isPlayer: false, stableId: 'ms-1', rankScore: 4, wins: 7, losses: 0 },
          { id: 'MS-EV', shikona: '幕均', isPlayer: false, stableId: 'ms-2', rankScore: 2, wins: 1, losses: 1 },
          { id: 'MS-MK', shikona: '幕負', isPlayer: false, stableId: 'ms-3', rankScore: 1, wins: 2, losses: 5 },
        ],
        Sandanme: [
          { id: 'SD-KK', shikona: '三勝', isPlayer: false, stableId: 'sd-1', rankScore: 4, wins: 6, losses: 1 },
          { id: 'SD-EV', shikona: '三均', isPlayer: false, stableId: 'sd-2', rankScore: 2, wins: 1, losses: 1 },
          { id: 'SD-MK', shikona: '三負', isPlayer: false, stableId: 'sd-3', rankScore: 1, wins: 1, losses: 6 },
        ],
        Jonidan: [
          { id: 'JD-KK', shikona: '二勝', isPlayer: false, stableId: 'jd-1', rankScore: 4, wins: 5, losses: 2 },
          { id: 'JD-EV', shikona: '二均', isPlayer: false, stableId: 'jd-2', rankScore: 2, wins: 1, losses: 1 },
          { id: 'JD-MK', shikona: '二負', isPlayer: false, stableId: 'jd-3', rankScore: 1, wins: 0, losses: 7 },
        ],
        Jonokuchi: [
          { id: 'JK-KK', shikona: '口勝', isPlayer: false, stableId: 'jk-1', rankScore: 4, wins: 4, losses: 3 },
          { id: 'JK-EV', shikona: '口均', isPlayer: false, stableId: 'jk-2', rankScore: 2, wins: 1, losses: 1 },
          { id: 'JK-MK', shikona: '口負', isPlayer: false, stableId: 'jk-3', rankScore: 1, wins: 0, losses: 7 },
        ],
      };
      const sizes = {
        Makushita: results.Makushita.length,
        Sandanme: results.Sandanme.length,
        Jonidan: results.Jonidan.length,
        Jonokuchi: results.Jonokuchi.length,
      };
      const offsets = {
        Makushita: 0,
        Sandanme: sizes.Makushita,
        Jonidan: sizes.Makushita + sizes.Sandanme,
        Jonokuchi: sizes.Makushita + sizes.Sandanme + sizes.Jonidan,
      };
      const toGlobalSlot = (placement: { division: keyof typeof offsets; rankScore: number }): number =>
        offsets[placement.division] + placement.rankScore;

      const resolution = resolveLowerDivisionPlacements(results);
      const byId = new Map(resolution.placements.map((placement) => [placement.id, placement]));
      const assertAbove = (higherId: string, lowerId: string): void => {
        const higher = byId.get(higherId);
        const lower = byId.get(lowerId);
        assert.ok(Boolean(higher), `Missing placement for ${higherId}`);
        assert.ok(Boolean(lower), `Missing placement for ${lowerId}`);
        if (!higher || !lower) return;
        assert.ok(
          toGlobalSlot(higher) < toGlobalSlot(lower),
          `Expected ${higherId} above ${lowerId}, got ${toGlobalSlot(higher)} >= ${toGlobalSlot(lower)}`,
        );
      };

      assertAbove('MS-KK', 'MS-MK');
      assertAbove('SD-KK', 'SD-MK');
      assertAbove('JD-KK', 'JD-MK');
      assertAbove('JK-KK', 'JK-MK');
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
    name: 'ranking: komusubi 9-6 stays komusubi when both sekiwake are solid kachikoshi',
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
      assert.equal(allocation?.nextRank.name, '小結');
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
    name: 'ranking: sanyaku minimum keeps east-west pair in stable case',
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
        return row;
      });
      const allocations = generateNextBanzuke(records);
      const sekiwake = allocations.filter((row) => row.nextRank.division === 'Makuuchi' && row.nextRank.name === '関脇');
      const komusubi = allocations.filter((row) => row.nextRank.division === 'Makuuchi' && row.nextRank.name === '小結');
      assert.ok(sekiwake.length >= 2);
      assert.ok(komusubi.length >= 2);
      assert.ok(sekiwake.some((row) => row.nextRank.side === 'East'));
      assert.ok(sekiwake.some((row) => row.nextRank.side === 'West'));
      assert.ok(komusubi.some((row) => row.nextRank.side === 'East'));
      assert.ok(komusubi.some((row) => row.nextRank.side === 'West'));
    },
  },
{
    name: 'ranking: sanyaku fallback does not use deep maegashira marginal kachikoshi',
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
          return createSekitoriSnapshot('K2', { division: 'Makuuchi', name: '小結', side: 'West' }, 4, 11, 0);
        }
        if (row.id === 'M16') {
          return createSekitoriSnapshot(
            'PLAYER',
            { division: 'Makuuchi', name: '前頭', side: 'West', number: 8 },
            8,
            7,
            0,
          );
        }
        return row;
      });
      const allocations = generateNextBanzuke(records);
      const player = allocations.find((row) => row.id === 'PLAYER');
      assert.ok(player);
      assert.ok(player?.nextRank.name !== '小結');
      assert.ok(player?.nextRank.name !== '関脇');
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
    name: 'ranking: sekitori full absence always resolves as a demotion band',
    run: () => {
      const m = resolveSekitoriDeltaBand({
        snapshot: {
          id: 'M',
          shikona: '幕内',
          rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 12 },
          wins: 0,
          losses: 0,
          absent: 15,
        },
        sourceDivision: 'Makuuchi',
        normalizedLosses: 15,
        score: 0,
        currentSlot: 31,
        directive: {
          nextIsOzekiKadoban: false,
          nextIsOzekiReturn: false,
          yokozunaPromotionBonus: 0,
        },
      });
      const j = resolveSekitoriDeltaBand({
        snapshot: {
          id: 'J',
          shikona: '十両',
          rank: { division: 'Juryo', name: '十両', side: 'East', number: 5 },
          wins: 0,
          losses: 0,
          absent: 15,
        },
        sourceDivision: 'Juryo',
        normalizedLosses: 15,
        score: 0,
        currentSlot: 50,
        directive: {
          nextIsOzekiKadoban: false,
          nextIsOzekiReturn: false,
          yokozunaPromotionBonus: 0,
        },
      });
      assert.ok(m.minSlotDelta < 0);
      assert.ok(m.maxSlotDelta < 0);
      assert.ok(j.minSlotDelta < 0);
      assert.ok(j.maxSlotDelta < 0);
      assert.ok(m.maxSlotDelta <= j.maxSlotDelta);
    },
  },
{
    name: 'ranking: makushita10 full absence equals full losses with controlled width',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 10 };
      const absent = calculateNextRank(createBashoRecord(makushita, 0, 0, 7), [], false, () => 0.5);
      const losses = calculateNextRank(createBashoRecord(makushita, 0, 7, 0), [], false, () => 0.5);
      assert.ok(['Makushita', 'Sandanme'].includes(absent.nextRank.division));
      if (absent.nextRank.division === 'Makushita') {
        assert.ok((absent.nextRank.number || 0) >= 24);
      } else {
        assert.ok((absent.nextRank.number || 0) >= 1);
      }
      assert.equal(absent.nextRank.division, losses.nextRank.division);
      assert.equal(absent.nextRank.number, losses.nextRank.number);
    },
  },
{
    name: 'quota: strong juryo leader is resolved through global composition',
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
      assert.ok(world.lastExchange.slots >= 0);
      assert.equal(typeof world.lastExchange.playerPromotedToMakuuchi, 'boolean');
      assert.equal(typeof world.lastExchange.playerDemotedToJuryo, 'boolean');
      if (world.lastExchange.playerPromotedToMakuuchi) {
        assert.equal(world.lastPlayerAssignedRank?.division, 'Makuuchi');
      } else {
        assertRank(
          world.lastPlayerAssignedRank,
          { division: 'Juryo', name: '十両', side: 'East', number: 1 },
          'assigned rank for juryo leader',
        );
      }
      const quota = resolveTopDivisionQuotaForPlayer(world, {
        division: 'Juryo',
        name: '十両',
        side: 'East',
        number: 1,
      });
      assert.equal(
        quota?.canPromoteToMakuuchi,
        world.lastExchange.playerPromotedToMakuuchi,
      );
    },
  },
{
    name: 'quota: makuuchi player keeps assigned sanyaku rank without enforced quota push',
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
      assert.equal(quota?.enforcedSanyaku, undefined);
    },
  },
{
    name: 'quota: advanceTopDivisionBanzuke rebuilds sekitori rosters with one player and unique slots',
    run: () => {
      const makuuchiWorld = createSimulationWorld(() => 0.5);
      makuuchiWorld.lastBashoResults.Makuuchi = Array.from({ length: 42 }, (_, i) => ({
        id: i === 15 ? 'PLAYER' : `Makuuchi-${i}`,
        shikona: i === 15 ? '試験山' : `幕内${i + 1}`,
        isPlayer: i === 15,
        stableId: i === 15 ? 'player-heya' : `m-${i % 8}`,
        rankScore: i + 1,
        wins: i === 15 ? 9 : 8,
        losses: i === 15 ? 6 : 7,
      }));
      makuuchiWorld.lastBashoResults.Juryo = Array.from({ length: 28 }, (_, i) => ({
        id: `Juryo-${i}`,
        shikona: `十両${i + 1}`,
        isPlayer: false,
        stableId: `j-${i % 8}`,
        rankScore: i + 1,
        wins: 8,
        losses: 7,
      }));

      advanceTopDivisionBanzuke(makuuchiWorld);
      assert.equal(makuuchiWorld.rosters.Makuuchi.length, 42);
      assert.equal(makuuchiWorld.rosters.Juryo.length, 28);
      assertUniqueSekitoriRosterSlots(makuuchiWorld, 'advance-top-makuuchi');

      const juryoWorld = createSimulationWorld(() => 0.5);
      juryoWorld.lastBashoResults.Makuuchi = Array.from({ length: 42 }, (_, i) => ({
        id: `Makuuchi-${i}`,
        shikona: `幕内${i + 1}`,
        isPlayer: false,
        stableId: `m-${i % 8}`,
        rankScore: i + 1,
        wins: 8,
        losses: 7,
      }));
      juryoWorld.lastBashoResults.Juryo = Array.from({ length: 28 }, (_, i) => ({
        id: i === 4 ? 'PLAYER' : `Juryo-${i}`,
        shikona: i === 4 ? '試験山' : `十両${i + 1}`,
        isPlayer: i === 4,
        stableId: i === 4 ? 'player-heya' : `j-${i % 8}`,
        rankScore: i + 1,
        wins: i === 4 ? 9 : 8,
        losses: i === 4 ? 6 : 7,
      }));

      advanceTopDivisionBanzuke(juryoWorld);
      assert.equal(juryoWorld.rosters.Makuuchi.length, 42);
      assert.equal(juryoWorld.rosters.Juryo.length, 28);
      assertUniqueSekitoriRosterSlots(juryoWorld, 'advance-top-juryo');
    },
  },
{
    name: 'quota: finalizeSekitoriPlayerPlacement inserts promoted player once and trims juryo tail',
    run: () => {
      const rng = lcg(20260407);
      const world = createSimulationWorld(rng);
      const status = createStatus({
        shikona: '試験山',
        rank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
      });
      const juryoTailId = world.rosters.Juryo[world.rosters.Juryo.length - 1]?.id;

      syncPlayerActorInWorld(world, status, rng);
      finalizeSekitoriPlayerPlacement(world, status);

      assert.equal(world.rosters.Juryo.length, 28);
      assert.equal(world.rosters.Makuuchi.length, 42);
      assertUniqueSekitoriRosterSlots(world, 'finalize-sekitori-player-placement');
      assert.ok(world.rosters.Juryo.some((rikishi) => rikishi.id === 'PLAYER'), 'Expected PLAYER in Juryo roster');
      assert.ok(
        world.rosters.Juryo.some((rikishi) => rikishi.id === 'PLAYER' && rikishi.rankScore === 15),
        'Expected PLAYER to land at East Juryo 8 slot',
      );
      assert.ok(
        !world.rosters.Juryo.some((rikishi) => rikishi.id === juryoTailId),
        'Expected one Juryo tail rikishi to be pushed out of the active roster',
      );
    },
  },
{
    name: 'ranking: assigned yokozuna cannot bypass ozeki-only promotion gate',
    run: () => {
      const sekiwake: Rank = { division: 'Makuuchi', name: '関脇', side: 'East' };
      const current = createBashoRecord(sekiwake, 10, 5);
      const past1 = createBashoRecord(sekiwake, 8, 7);
      const past2 = createBashoRecord(sekiwake, 8, 7);
      const result = calculateNextRank(
        current,
        [past1, past2],
        false,
        () => 0.5,
        {
          topDivisionQuota: {
            assignedNextRank: { division: 'Makuuchi', name: '横綱', side: 'East' },
          },
        },
      );
      assert.equal(result.nextRank.division, 'Makuuchi');
      assert.equal(result.nextRank.name, '関脇');
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
    name: 'ranking: sekitori assigned rank limits deep juryo demotion width',
    run: () => {
      const juryo: Rank = { division: 'Juryo', name: '十両', side: 'West', number: 13 };
      const result = calculateNextRank(
        createBashoRecord(juryo, 6, 9),
        [],
        false,
        () => 0.5,
        {
          sekitoriQuota: {
            canDemoteToMakushita: true,
            assignedNextRank: { division: 'Makushita', name: '幕下', side: 'East', number: 20 },
          },
        },
      );
      assert.equal(result.nextRank.division, 'Makushita');
      assert.equal(result.nextRank.name, '幕下');
      assert.ok((result.nextRank.number || 99) <= 4, `Expected capped demotion, got ${result.nextRank.number}`);
    },
  },
{
    name: 'ranking: sekitori assigned rank limits overly high makushita promotion',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 5 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 6, 1),
        [],
        false,
        () => 0.5,
        {
          sekitoriQuota: {
            canPromoteToJuryo: true,
            assignedNextRank: { division: 'Juryo', name: '十両', side: 'East', number: 5 },
          },
        },
      );
      assert.equal(result.nextRank.division, 'Juryo');
      assert.equal(result.nextRank.name, '十両');
      assert.ok((result.nextRank.number || 0) >= 13, `Expected lower-juryo landing spot, got ${result.nextRank.number}`);
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
    name: 'ranking: makekoshi lower boundary assignment cannot move upward in lower divisions',
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
    name: 'ranking: same-division boundary assignment applies when direction is valid',
    run: () => {
      const jonidan: Rank = { division: 'Jonidan', name: '序二段', side: 'West', number: 70 };
      const result = calculateNextRank(
        createBashoRecord(jonidan, 4, 3),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Jonidan', name: '序二段', side: 'East', number: 5 },
        },
      );
      assert.equal(result.nextRank.division, 'Jonidan');
      assert.equal(result.nextRank.name, '序二段');
      assert.equal(result.nextRank.number, 5);
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
    name: 'ranking: full absence lower boundary assignment cannot move upward',
    run: () => {
      const sandanme: Rank = { division: 'Sandanme', name: '三段目', side: 'West', number: 31 };
      const result = calculateNextRank(
        createBashoRecord(sandanme, 0, 0, 7),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Makushita', name: '幕下', side: 'East', number: 55 },
        },
      );
      assert.ok(result.nextRank.division !== 'Makushita', 'Full absence should never be promoted');
      if (result.nextRank.division === 'Sandanme') {
        assert.ok((result.nextRank.number ?? 0) >= 31, 'Full absence should not move upward');
      }
    },
  },
{
    name: 'quota: lower quota step can consume precomputed league snapshots',
    run: () => {
      const rng = (() => {
        let state = 0x1a2b3c4d;
        return () => {
          state = (1664525 * state + 1013904223) >>> 0;
          return state / 4294967296;
        };
      })();
      const topWorld = createSimulationWorld(rng);
      const lowerWorld = createLowerDivisionQuotaWorld(rng, topWorld);
      const status = createStatus({
        shikona: '統合山',
        rank: { division: 'Sandanme', name: '三段目', side: 'East', number: 70 },
      });
      const basho = runBashoDetailed(status, 2026, 1, rng, topWorld, lowerWorld);
      assert.ok(Boolean(basho.lowerLeagueSnapshots), 'Expected lower league snapshots from lower-division basho');
      const precomputed = JSON.parse(JSON.stringify(basho.lowerLeagueSnapshots)) as NonNullable<typeof basho.lowerLeagueSnapshots>;
      const targetId = lowerWorld.rosters.Makushita[0]?.id;
      assert.ok(Boolean(targetId), 'Expected at least one makushita NPC');
      if (!targetId) return;
      const targetRow = precomputed.Makushita.find((row) => row.id === targetId);
      assert.ok(Boolean(targetRow), 'Expected target NPC row in precomputed makushita snapshots');
      if (!targetRow) return;
      targetRow.wins = 7;
      targetRow.losses = 0;

      runLowerDivisionQuotaStep(
        lowerWorld,
        rng,
        {
          rank: status.rank,
          shikona: status.shikona,
          wins: basho.playerRecord.wins,
          losses: basho.playerRecord.losses,
          absent: basho.playerRecord.absent,
        },
        precomputed,
      );

      const applied = lowerWorld.lastResults.Makushita?.find((row) => row.id === targetId);
      assert.ok(Boolean(applied), 'Expected target NPC row in applied makushita results');
      assert.equal(applied?.wins, 7);
      assert.equal(applied?.losses, 0);
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
    name: 'ranking: makushita kachikoshi ignores downward lower-boundary assignment',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 30 };
      const result = calculateNextRank(
        createBashoRecord(makushita, 7, 0),
        [],
        false,
        () => 0.5,
        {
          boundaryAssignedNextRank: { division: 'Makushita', name: '幕下', side: 'East', number: 35 },
        },
      );
      assert.equal(result.nextRank.division, 'Makushita');
      assert.equal(result.nextRank.name, '幕下');
      assert.ok((result.nextRank.number ?? 99) <= 30, 'Kachikoshi should not be demoted by boundary assignment');
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
      assert.ok(
        assigned?.division === 'Sandanme' ||
        assigned?.division === 'Jonidan' ||
        assigned?.division === 'Jonokuchi',
        `Expected deep demotion from Makushita, got ${assigned?.division}`,
      );
    },
  },
{
    name: 'quota: lower committee never promotes 0-0-7 full absence snapshot',
    run: () => {
      const results = {
        Makushita: [] as LowerBoundarySnapshot[],
        Sandanme: [
          {
            id: 'PLAYER',
            shikona: '試験山',
            isPlayer: true,
            stableId: 'player-heya',
            rankScore: 62, // 三段目31枚目西
            wins: 0,
            losses: 0,
          } satisfies LowerBoundarySnapshot,
        ],
        Jonidan: [] as LowerBoundarySnapshot[],
        Jonokuchi: [] as LowerBoundarySnapshot[],
      };
      const exchanges = {
        MakushitaSandanme: { ...EMPTY_LOWER_EXCHANGE },
        SandanmeJonidan: { ...EMPTY_LOWER_EXCHANGE },
        JonidanJonokuchi: { ...EMPTY_LOWER_EXCHANGE },
      };
      const assigned = resolveLowerAssignedNextRank(results, exchanges, {
        rank: { division: 'Sandanme', name: '三段目', side: 'West', number: 31 },
        shikona: '試験山',
        wins: 0,
        losses: 0,
        absent: 7,
      });
      assert.ok(Boolean(assigned), 'Expected assigned lower rank');
      assert.ok(assigned?.division !== 'Makushita', 'Full absence should never be promoted');
      if (assigned?.division === 'Sandanme') {
        assert.ok((assigned.number ?? 0) >= 31, 'Full absence should not improve rank number');
      }
    },
  },
{
    name: 'quota: lower committee can lift bottom jonokuchi makekoshi when tail expands',
    run: () => {
      const lowerWorld = createLowerDivisionQuotaWorld(() => 0.5);
      const jonokuchiSlotsBefore = lowerWorld.rosters.Jonokuchi.length;
      const jonokuchiBottomNumber = Math.ceil(jonokuchiSlotsBefore / 2);
      for (let i = 0; i < 48; i += 1) {
        lowerWorld.maezumoPool.push({
          id: `TEST-MAE-${i + 1}`,
          seedId: `seed-${i + 1}`,
          shikona: `新弟子${i + 1}`,
          division: 'Maezumo',
          currentDivision: 'Maezumo',
          stableId: `mae-${i % 6}`,
          basePower: 40,
          ability: 40,
          uncertainty: 4,
          rankScore: 1,
          volatility: 1,
          form: 1,
          styleBias: 'PUSH',
          heightCm: 180,
          weightKg: 130,
          active: true,
          entryAge: 18,
          age: 18,
          careerBashoCount: 0,
          entrySeq: 1,
          recentBashoResults: [],
        });
      }

      runLowerDivisionQuotaStep(lowerWorld, () => 0.5, {
        rank: { division: 'Jonokuchi', name: '序ノ口', side: 'West', number: jonokuchiBottomNumber },
        shikona: '試験山',
        wins: 3,
        losses: 4,
        absent: 0,
      });

      const assigned = lowerWorld.lastPlayerAssignedRank;
      assert.ok(Boolean(assigned), 'Expected assigned lower rank');
      assert.equal(assigned?.division, 'Jonokuchi');
      const beforeRelativeTailPosition =
        rankNumberSideToSlot(
          jonokuchiBottomNumber,
          'West',
          jonokuchiSlotsBefore,
        ) / Math.max(1, jonokuchiSlotsBefore);
      const afterRelativeTailPosition =
        rankNumberSideToSlot(
          assigned?.number ?? jonokuchiBottomNumber,
          assigned?.side ?? 'West',
          lowerWorld.rosters.Jonokuchi.length,
        ) / Math.max(1, lowerWorld.rosters.Jonokuchi.length);
      assert.ok(
        afterRelativeTailPosition < beforeRelativeTailPosition,
        `Expected tail expansion to lift bottom makekoshi, got ${assigned?.number}${assigned?.side ?? ''}`,
      );
    },
  },
{
    name: 'quota: assigned juryo promotion rank is normalized into lower maegashira band',
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
      assert.ok((quota?.assignedNextRank?.number ?? 0) >= 14, 'Expected lower maegashira normalization');
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
      assert.ok((highPressureQuota?.assignedNextRank?.number || 99) <= 11);
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
    name: 'ranking: sandanme 6-1 promotion width is widened',
    run: () => {
      const sandanmeRecord = createBashoRecord(
        { division: 'Sandanme', name: '三段目', side: 'East', number: 88 },
        6,
        1,
      );
      const delta = resolveLowerRangeDeltaByScore(sandanmeRecord);
      assert.ok(delta >= 26, `Expected widened sandanme 6-1 delta >= 26, got ${delta}`);
    },
  },
{
    name: 'ranking: sandanme 1-6 demotion width is widened',
    run: () => {
      const sandanmeRecord = createBashoRecord(
        { division: 'Sandanme', name: '三段目', side: 'East', number: 3 },
        1,
        6,
      );
      const delta = resolveLowerRangeDeltaByScore(sandanmeRecord);
      assert.ok(delta <= -51, `Expected widened sandanme 1-6 delta <= -51, got ${delta}`);
    },
  },
{
    name: 'ranking: jonidan 0-7 drops with large width',
    run: () => {
      const jonidan: Rank = {
        division: 'Jonidan',
        name: '序二段',
        side: 'East',
        number: Math.max(60, Math.floor(LIMITS.JONIDAN_MAX * 0.4)),
      };
      const result = calculateNextRank(createBashoRecord(jonidan, 0, 7), [], false, () => 0.0);
      assert.ok(['Jonidan', 'Jonokuchi'].includes(result.nextRank.division));
      if (result.nextRank.division === 'Jonidan') {
        assert.ok((result.nextRank.number || 0) >= Math.floor(LIMITS.JONIDAN_MAX * 0.6));
      } else {
        assert.ok((result.nextRank.number || 0) >= 1);
      }
    },
  },
{
    name: 'ranking: jonidan 7-0 gets boosted promotion width',
    run: () => {
      const startNumber = Math.max(80, Math.floor(LIMITS.JONIDAN_MAX * 0.8));
      const jonidan: Rank = { division: 'Jonidan', name: '序二段', side: 'East', number: startNumber };
      const result = calculateNextRank(createBashoRecord(jonidan, 7, 0), [], false, () => 0.0);
      assert.ok(['Sandanme', 'Jonidan'].includes(result.nextRank.division));
      if (result.nextRank.division === 'Sandanme') {
        assert.ok((result.nextRank.number || 999) <= 95);
      } else {
        const nextNumber = result.nextRank.number || startNumber;
        assert.ok(
          nextNumber <= startNumber - 34,
          `Expected jonidan 7-0 to move up by at least 34 ranks, start=${startNumber}, next=${nextNumber}`,
        );
      }
    },
  },
{
    name: 'ranking: jonidan 5-2 promotion width is widened',
    run: () => {
      const jonidanRecord = createBashoRecord(
        { division: 'Jonidan', name: '序二段', side: 'East', number: LIMITS.JONIDAN_MAX },
        5,
        2,
      );
      const delta = resolveLowerRangeDeltaByScore(jonidanRecord);
      assert.ok(delta >= 18, `Expected widened jonidan delta >= 18, got ${delta}`);
    },
  },
{
    name: 'ranking: jonidan 2-5 demotion width is widened',
    run: () => {
      const jonidanRecord = createBashoRecord(
        { division: 'Jonidan', name: '序二段', side: 'East', number: 1 },
        2,
        5,
      );
      const delta = resolveLowerRangeDeltaByScore(jonidanRecord);
      assert.ok(delta <= -37, `Expected widened jonidan 2-5 delta <= -37, got ${delta}`);
    },
  },
{
    name: 'ranking: jonokuchi 5-2 promotion width is widened',
    run: () => {
      const jonokuchiRecord = createBashoRecord(
        { division: 'Jonokuchi', name: '序ノ口', side: 'East', number: LIMITS.JONOKUCHI_MAX },
        5,
        2,
      );
      const delta = resolveLowerRangeDeltaByScore(jonokuchiRecord);
      assert.ok(delta >= 21, `Expected widened jonokuchi delta >= 21, got ${delta}`);
    },
  },
{
    name: 'ranking: jonokuchi 1-6 demotion width is widened',
    run: () => {
      const jonokuchiRecord = createBashoRecord(
        { division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 1 },
        1,
        6,
      );
      const delta = resolveLowerRangeDeltaByScore(jonokuchiRecord);
      assert.ok(delta <= -57, `Expected widened jonokuchi 1-6 delta <= -57, got ${delta}`);
    },
  },
{
    name: 'ranking: makushita 6-1 keeps clear but controlled promotion width',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 30 };
      const result = calculateNextRank(createBashoRecord(makushita, 6, 1), [], false, () => 0.0);
      assert.equal(result.nextRank.division, 'Makushita');
      assert.ok((result.nextRank.number || 999) <= 22);
    },
  },
{
    name: 'ranking: makushita deep 7-0 gains large promotion without joi-jin teleport',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 56 };
      const result = calculateNextRank(createBashoRecord(makushita, 7, 0), [], false, () => 0.0);
      assert.equal(result.nextRank.division, 'Makushita');
      assert.ok((result.nextRank.number || 999) <= 40, '7-0 should still produce a large jump');
    },
  },
{
    name: 'ranking: makushita 0-7 still has clear demotion width',
    run: () => {
      const makushita: Rank = { division: 'Makushita', name: '幕下', side: 'East', number: 30 };
      const result = calculateNextRank(createBashoRecord(makushita, 0, 7), [], false, () => 0.0);
      assert.ok(['Makushita', 'Sandanme'].includes(result.nextRank.division));
      if (result.nextRank.division === 'Makushita') {
        assert.ok((result.nextRank.number || 0) >= 44);
      } else {
        assert.ok((result.nextRank.number || 0) >= 1);
      }
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
    name: 'banzuke: ozeki consecutive yusho promotes to yokozuna in compose pipeline',
    run: () => {
      const out = composeNextBanzuke({
        careerId: 'case',
        seq: 2,
        year: 2026,
        month: 3,
        mode: 'SIMULATE',
        entries: [
          {
            id: 'PLAYER',
            currentRank: { division: 'Makuuchi', name: '大関', side: 'East' },
            wins: 14,
            losses: 1,
            absent: 0,
            yusho: true,
            historyWindow: [
              createBashoRecord(
                { division: 'Makuuchi', name: '大関', side: 'West' },
                15,
                0,
                0,
                true,
              ),
            ],
          },
        ],
      });

      assert.equal(out.allocations.length, 1);
      const allocation = out.allocations[0];
      assert.equal(allocation.finalRank.division, 'Makuuchi');
      assert.equal(allocation.finalRank.name, '横綱');
      assert.equal(allocation.finalDecision.event, 'PROMOTION_TO_YOKOZUNA');
    },
  },
{
    name: 'banzuke: lower-division 7-0 large promotion is not rejected as boundary jam',
    run: () => {
      const out = composeNextBanzuke({
        careerId: 'case',
        seq: 1,
        year: 2026,
        month: 1,
        mode: 'REPLAY',
        entries: [
          {
            id: 'PLAYER',
            currentRank: { division: 'Sandanme', name: '三段目', side: 'West', number: 86 },
            wins: 7,
            losses: 0,
            absent: 0,
            historyWindow: [],
            replayNextRank: { division: 'Sandanme', name: '三段目', side: 'East', number: 20 },
          },
        ],
      });
      assert.equal(out.allocations.length, 1);
      const allocation = out.allocations[0];
      assert.equal(allocation.finalRank.division, 'Sandanme');
      assert.ok((allocation.finalRank.number ?? 999) <= 20);
      assert.ok(!allocation.flags.includes('BOUNDARY_SLOT_JAM'));
      assert.equal(out.warnings.length, 0);
    },
  },
{
    name: 'banzuke: makushita 7-0 correction is not rejected by review board',
    run: () => {
      const out = composeNextBanzuke({
        careerId: 'case',
        seq: 1,
        year: 2026,
        month: 1,
        mode: 'REPLAY',
        entries: [
          {
            id: 'PLAYER',
            currentRank: { division: 'Makushita', name: '幕下', side: 'East', number: 30 },
            wins: 7,
            losses: 0,
            absent: 0,
            historyWindow: [],
            replayNextRank: { division: 'Makushita', name: '幕下', side: 'West', number: 20 },
          },
        ],
      });

      assert.equal(out.allocations.length, 1);
      const allocation = out.allocations[0];
      assert.equal(allocation.finalRank.division, 'Makushita');
      assert.ok((allocation.finalRank.number ?? 999) <= 15);
      assert.ok(!allocation.finalDecision.reasons.includes('REVIEW_REJECTED_RETAIN_PREV_RANK'));
      assert.equal(out.warnings.length, 0);
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
      assert.equal(
        out.allocations[0].finalRank.number,
        Math.round(LIMITS.JONOKUCHI_MAX * 0.67),
      );
      assert.equal(out.warnings.length, 0);
    },
  },
{
    name: 'torikumi: regular sekitori schedule keeps makuuchi and juryo separate',
    run: () => {
      const participants: TorikumiParticipant[] = [
        createTorikumiParticipant('M16E', 'Makuuchi', '前頭', 16, 'm-a'),
        createTorikumiParticipant('M17E', 'Makuuchi', '前頭', 17, 'm-b'),
        createTorikumiParticipant('J1E', 'Juryo', '十両', 1, 'j-a'),
        createTorikumiParticipant('J2E', 'Juryo', '十両', 2, 'j-b'),
      ];
      const result = scheduleTorikumiBasho({
        participants,
        days: [13],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakuuchiJuryo'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });
      const pairs = result.days[0].pairs;
      assert.equal(pairs.length, 2);
      assert.ok(pairs.every((pair) => !pair.boundaryId));
      assert.ok(pairs.every((pair) => pair.a.division === pair.b.division));
      assert.ok(pairs.some((pair) => pair.a.division === 'Makuuchi' && pair.b.division === 'Makuuchi'));
      assert.ok(pairs.some((pair) => pair.a.division === 'Juryo' && pair.b.division === 'Juryo'));
    },
  },
{
    name: 'torikumi: boundary pairing is not used when same-division pairs are sufficient',
    run: () => {
      const participants: TorikumiParticipant[] = [
        createTorikumiParticipant('M14E', 'Makuuchi', '前頭', 14, 'm-a'),
        createTorikumiParticipant('M15E', 'Makuuchi', '前頭', 15, 'm-b'),
        createTorikumiParticipant('J1E', 'Juryo', '十両', 1, 'j-a'),
        createTorikumiParticipant('J2E', 'Juryo', '十両', 2, 'j-b'),
      ];
      const result = scheduleTorikumiBasho({
        participants,
        days: [7],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakuuchiJuryo'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });
      assert.equal(result.days[0].pairs.length, 2);
      assert.ok(result.days[0].pairs.every((pair) => !pair.boundaryId));
    },
  },
{
    name: 'torikumi: v3 intra-division pairing selects from top3 by weighted roll',
    run: () => {
      const pool: TorikumiParticipant[] = [
        createTorikumiParticipant('MS1', 'Makushita', '幕下', 1, 's1'),
        createTorikumiParticipant('MS2', 'Makushita', '幕下', 2, 's2'),
        createTorikumiParticipant('MS3', 'Makushita', '幕下', 3, 's3'),
        createTorikumiParticipant('MS4', 'Makushita', '幕下', 4, 's4'),
      ];
      const faced = createFacedMap(pool);
      const chosenByBucket = (
        roll: number,
      ): string | undefined => pairWithinDivision(
        pool,
        faced,
        8,
        11,
        sequenceRng([roll]),
      ).pairs[0]?.b.id;

      assert.equal(chosenByBucket(0.69), 'MS2');
      assert.equal(chosenByBucket(0.75), 'MS3');
      assert.equal(chosenByBucket(0.95), 'MS4');
    },
  },
{
    name: 'torikumi: late Juryo-Makushita reserves bubble rikishi for boundary playoffs',
    run: () => {
      const participants: TorikumiParticipant[] = [
        {
          ...createTorikumiParticipant('J13E', 'Juryo', '十両', 13, 'j-a'),
          wins: 5,
          losses: 8,
          boutsDone: 13,
        },
        {
          ...createTorikumiParticipant('J14W', 'Juryo', '十両', 14, 'j-b'),
          wins: 4,
          losses: 9,
          boutsDone: 13,
        },
        {
          ...createTorikumiParticipant('MS2E', 'Makushita', '幕下', 2, 'm-a'),
          wins: 5,
          losses: 1,
          boutsDone: 6,
        },
        {
          ...createTorikumiParticipant('MS4W', 'Makushita', '幕下', 4, 'm-b'),
          wins: 4,
          losses: 2,
          boutsDone: 6,
        },
      ];

      const result = scheduleTorikumiBasho({
        participants,
        days: [14],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'JuryoMakushita'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });

      const dayPairs = result.days[0].pairs;
      assert.equal(dayPairs.length, 2);
      assert.ok(dayPairs.every((pair) => pair.boundaryId === 'JuryoMakushita'));
      assert.ok(dayPairs.some((pair) => pair.a.id === 'J13E' || pair.b.id === 'J13E'));
      assert.ok(dayPairs.some((pair) => pair.a.id === 'J14W' || pair.b.id === 'J14W'));
      assert.ok(dayPairs.some((pair) => pair.a.id === 'MS2E' || pair.b.id === 'MS2E'));
      assert.ok(dayPairs.some((pair) => pair.a.id === 'MS4W' || pair.b.id === 'MS4W'));
    },
  },
{
    name: 'torikumi: Juryo-Makushita exchange is blocked before day 12 and opens on day 12+',
    run: () => {
      const participants: TorikumiParticipant[] = [
        {
          ...createTorikumiParticipant('J12E', 'Juryo', '十両', 12, 'j-a'),
          wins: 7,
          losses: 3,
          boutsDone: 10,
        },
        {
          ...createTorikumiParticipant('J13W', 'Juryo', '十両', 13, 'j-b'),
          wins: 6,
          losses: 4,
          boutsDone: 10,
        },
        {
          ...createTorikumiParticipant('MS1E', 'Makushita', '幕下', 1, 'm-a'),
          wins: 5,
          losses: 0,
          boutsDone: 5,
        },
        {
          ...createTorikumiParticipant('MS3W', 'Makushita', '幕下', 3, 'm-b'),
          wins: 4,
          losses: 1,
          boutsDone: 5,
        },
      ];

      const earlyResult = scheduleTorikumiBasho({
        participants,
        days: [11],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'JuryoMakushita'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });
      const lateParticipants = participants.map((participant) => ({
        ...participant,
        facedIdsThisBasho: [],
      }));
      const lateResult = scheduleTorikumiBasho({
        participants: lateParticipants,
        days: [12],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'JuryoMakushita'),
        facedMap: createFacedMap(lateParticipants),
        dayEligibility: () => true,
      });

      assert.equal(
        earlyResult.days[0].pairs.filter((pair) => pair.boundaryId === 'JuryoMakushita').length,
        0,
      );
      assert.equal(
        lateResult.days[0].pairs.filter((pair) => pair.boundaryId === 'JuryoMakushita').length,
        2,
      );
    },
  },
{
    name: 'torikumi: no rematch and no same-stable constraints are preserved',
    run: () => {
      const participants: TorikumiParticipant[] = [
        createTorikumiParticipant('MS1', 'Makushita', '幕下', 56, 'stable-a'),
        createTorikumiParticipant('MS2', 'Makushita', '幕下', 57, 'stable-b'),
        createTorikumiParticipant('MS3', 'Makushita', '幕下', 58, 'stable-c'),
        createTorikumiParticipant('MS4', 'Makushita', '幕下', 59, 'stable-d'),
        createTorikumiParticipant('SD1', 'Sandanme', '三段目', 1, 'stable-a'),
        createTorikumiParticipant('SD2', 'Sandanme', '三段目', 2, 'stable-b'),
        createTorikumiParticipant('SD3', 'Sandanme', '三段目', 3, 'stable-c'),
        createTorikumiParticipant('SD4', 'Sandanme', '三段目', 4, 'stable-d'),
      ].map((participant) => ({
        ...participant,
        targetBouts: 3,
      }));
      const result = scheduleTorikumiBasho({
        participants,
        days: [1, 3, 5],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakushitaSandanme'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });
      const keys = new Set<string>();
      for (const day of result.days) {
        for (const pair of day.pairs) {
          assert.ok(pair.a.stableId !== pair.b.stableId, 'same-stable pair was generated');
          const key = [pair.a.id, pair.b.id].sort().join(':');
          assert.ok(!keys.has(key), `rematch generated for ${key}`);
          keys.add(key);
        }
      }
    },
  },
{
    name: 'torikumi: late makuuchi title race produces direct bout metadata',
    run: () => {
      const participants: TorikumiParticipant[] = [
        {
          ...createTorikumiParticipant('Y1', 'Makuuchi', '横綱', 1, 'm-a'),
          rankName: '横綱',
          rankNumber: undefined,
          rankScore: 1,
          wins: 12,
          losses: 1,
        },
        {
          ...createTorikumiParticipant('O1', 'Makuuchi', '大関', 1, 'm-b'),
          rankName: '大関',
          rankNumber: undefined,
          rankScore: 2,
          wins: 12,
          losses: 1,
        },
        createTorikumiParticipant('M1E', 'Makuuchi', '前頭', 1, 'm-c'),
        createTorikumiParticipant('M2W', 'Makuuchi', '前頭', 2, 'm-d'),
      ];
      const result = scheduleTorikumiBasho({
        participants,
        days: [13],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakuuchiJuryo'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });
      const directPair = result.days[0].pairs.find((pair) =>
        (pair.a.id === 'Y1' || pair.b.id === 'Y1') &&
        (pair.a.id === 'O1' || pair.b.id === 'O1'));
      assert.ok(Boolean(directPair), 'Expected leader direct bout');
      assert.equal(directPair?.matchReason, 'YUSHO_DIRECT');
      assert.equal(directPair?.titleImplication, 'DIRECT');
      assert.equal(directPair?.phaseId, 'LATE');
    },
  },
{
    name: 'torikumi: diagnostics expose repair histogram and boundary distribution',
    run: () => {
      const participants: TorikumiParticipant[] = [
        {
          ...createTorikumiParticipant('J13E', 'Juryo', '十両', 13, 'j-a'),
          wins: 5,
          losses: 8,
          boutsDone: 13,
        },
        {
          ...createTorikumiParticipant('J14W', 'Juryo', '十両', 14, 'j-b'),
          wins: 4,
          losses: 9,
          boutsDone: 13,
        },
        {
          ...createTorikumiParticipant('MS2E', 'Makushita', '幕下', 2, 'm-a'),
          wins: 5,
          losses: 1,
          boutsDone: 6,
        },
        {
          ...createTorikumiParticipant('MS4W', 'Makushita', '幕下', 4, 'm-b'),
          wins: 4,
          losses: 2,
          boutsDone: 6,
        },
      ];
      const result = scheduleTorikumiBasho({
        participants,
        days: [14],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'JuryoMakushita'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });

      assert.equal(result.diagnostics.sameStableViolationCount, 0);
      assert.equal(result.diagnostics.sameCardViolationCount, 0);
      assert.equal(result.diagnostics.crossDivisionBoutCount, 2);
      assert.equal(result.diagnostics.lateCrossDivisionBoutCount, 2);
      assert.equal(result.diagnostics.scheduleViolations.length, 0);
      assert.equal(result.diagnostics.crossDivisionByBoundary.JuryoMakushita, 2);
      assert.equal(result.diagnostics.repairHistogram['0'], 2);
      assert.equal(result.diagnostics.boundaryActivations[0]?.boundaryId, 'JuryoMakushita');
      assert.equal(result.diagnostics.playerHealthyUnresolvedDays.length, 0);
      assert.equal(result.diagnostics.repairAttempts >= 0, true);
      assert.equal(result.diagnostics.repairSuccessCount >= 0, true);
    },
  },
{
    name: 'torikumi: early ozeki scheduling avoids deep maegashira when upper-rank options exist',
    run: () => {
      const participants: TorikumiParticipant[] = [
        {
          ...createTorikumiParticipant('O1', 'Makuuchi', '大関', 1, 'o'),
          rankName: '大関',
          rankNumber: undefined,
          rankScore: 2,
        },
        {
          ...createTorikumiParticipant('S1', 'Makuuchi', '関脇', 1, 's'),
          rankName: '関脇',
          rankNumber: undefined,
          rankScore: 4,
        },
        createTorikumiParticipant('M2E', 'Makuuchi', '前頭', 2, 'm2'),
        createTorikumiParticipant('M3W', 'Makuuchi', '前頭', 3, 'm3'),
        createTorikumiParticipant('M12E', 'Makuuchi', '前頭', 12, 'm12'),
        createTorikumiParticipant('M13W', 'Makuuchi', '前頭', 13, 'm13'),
      ];
      const result = scheduleTorikumiBasho({
        participants,
        days: [2],
        boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakuuchiJuryo'),
        facedMap: createFacedMap(participants),
        dayEligibility: () => true,
      });
      const ozekiPair = result.days[0].pairs.find((pair) => pair.a.id === 'O1' || pair.b.id === 'O1');
      assert.ok(Boolean(ozekiPair), 'Expected Ozeki pairing');
      const opponent = ozekiPair?.a.id === 'O1' ? ozekiPair.b : ozekiPair?.a;
      assert.ok(Boolean(opponent), 'Expected Ozeki opponent');
      assert.ok(
        opponent?.rankName === '関脇' || ((opponent?.rankNumber ?? 99) <= 3),
        `Unexpected early Ozeki opponent: ${opponent?.rankName}${opponent?.rankNumber ?? ''}`,
      );
    },
  },
{
    name: 'torikumi policy: lower division schedule uses 7 days with 1-2 day rests',
    run: () => {
      const days = buildLowerDivisionBoutDays(lcg(99));
      assert.equal(days.length, 7);
      assert.ok(days[0] >= 1 && days[days.length - 1] <= 15);
      for (let i = 1; i < days.length; i += 1) {
        const diff = days[i] - days[i - 1];
        assert.ok(diff === 2 || diff === 3, `Expected gap 2 or 3, got ${diff}`);
      }
    },
  },
{
    name: 'banzuke: decision logs expose realism rule bucket fields',
    run: () => {
      const result = composeNextBanzuke({
        careerId: 'test-career',
        seq: 1,
        year: 2026,
        month: 3,
        mode: 'SIMULATE',
        entries: [
          {
            id: 'PLAYER',
            currentRank: { division: 'Makuuchi', name: '前頭', number: 8, side: 'East' },
            wins: 8,
            losses: 7,
            absent: 0,
            historyWindow: [createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 9, side: 'West' }, 7, 8)],
          },
        ],
      });
      const log = result.decisionLogs[0];
      assert.equal(log.ruleBucket, 'MAEGASHIRA');
      assert.equal(log.usedBoundaryPressure, false);
      assert.equal(log.usedDiscretion, false);
    },
  },
{
    name: 'torikumi policy: day 14/15 are rare but non-zero in lower schedules',
    run: () => {
      const rng = lcg(20260222);
      const samples = 1200;
      let end14 = 0;
      let end15 = 0;
      for (let i = 0; i < samples; i += 1) {
        const days = buildLowerDivisionBoutDays(rng);
        const last = days[days.length - 1];
        if (last === 14) end14 += 1;
        if (last === 15) end15 += 1;
      }
      const ratio14 = end14 / samples;
      const ratio15 = end15 / samples;
      assert.ok(ratio14 > 0.05 && ratio14 < 0.35, `Expected day14 to be occasional, got ${ratio14}`);
      assert.ok(ratio15 > 0.03 && ratio15 < 0.2, `Expected day15 to be occasional, got ${ratio15}`);
    },
  },
{
    name: 'torikumi policy: day map + eligibility follows generated schedule',
    run: () => {
      const participants: TorikumiParticipant[] = [
        createTorikumiParticipant('L1', 'Makushita', '幕下', 10, 's1'),
        createTorikumiParticipant('L2', 'Sandanme', '三段目', 20, 's2'),
      ];
      const dayMap = createLowerDivisionBoutDayMap(participants, lcg(7));
      const l1Days = [...(dayMap.get('L1') ?? new Set<number>())];
      assert.equal(l1Days.length, 7);
      for (let day = 1; day <= 15; day += 1) {
        const expected = (dayMap.get('L1') ?? new Set<number>()).has(day);
        assert.equal(
          resolveLowerDivisionEligibility(participants[0], day, dayMap),
          expected,
        );
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
  }
];
