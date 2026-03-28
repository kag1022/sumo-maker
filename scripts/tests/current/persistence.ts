import { PlayerBoutDetail } from '../../../src/logic/simulation/basho';
import { createSimulationEngine } from '../../../src/logic/simulation/engine';
import { BashoRecord } from '../../../src/logic/models';
import { getDb } from '../../../src/logic/persistence/db';
import { ACHIEVEMENT_CATALOG, evaluateAchievements } from '../../../src/logic/achievements';
import { appendBashoChunk, buildCareerStartYearMonth, commitCareer, createDraftCareer, getCareerSaveIncentiveSummary, isCareerSaved, listCommittedCareers, markCareerCompleted } from '../../../src/logic/persistence/careers';
import { appendBanzukeDecisionLogs, appendBanzukePopulation, getCareerBashoDetail, getCareerHeadToHead, listBanzukeDecisions, listBanzukePopulation, listCareerBashoRecordsBySeq, listCareerImportantTorikumi } from '../../../src/logic/persistence/careerHistory';
import { getCollectionDashboardSummary, getRecordCollectionSummary, listCollectionCatalogEntries, listCollectionSummary, listRecentCollectionUnlocks, listUnlockedCollectionEntries } from '../../../src/logic/persistence/collections';
import { buildCareerClearScoreSummary, buildCareerRecordBadges } from '../../../src/logic/career/clearScore';
import { getWalletState, WALLET_INITIAL_POINTS, spendWalletPoints, WALLET_MAX_POINTS } from '../../../src/logic/persistence/wallet';
import { buildReportHeroSummary } from '../../../src/features/report/utils/reportHero';
import { buildCareerRivalryDigest } from '../../../src/features/report/utils/reportRivalry';
import { buildImportantBanzukeDecisionDigests, buildImportantDecisionDigest, buildImportantTorikumiDigests, buildHoshitoriCareerRecords, buildRankChartData, buildTimelineEventGroups } from '../../../src/features/report/utils/reportTimeline';
import { buildBanzukeSnapshotForSeq } from '../../../src/features/report/utils/reportBanzukeSnapshot';

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
    name: 'report: clear score favors stronger results over lower-division careers',
    run: () => {
      const eliteRecords = [
        { ...createBashoRecord({ division: 'Juryo', name: '十両', number: 1, side: 'East' }, 11, 4), month: 1, yusho: true },
        { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 3, side: 'East' }, 10, 5), month: 3, yusho: false, specialPrizes: ['殊勲賞'], kinboshi: 1 },
        { ...createBashoRecord({ division: 'Makuuchi', name: '関脇', side: 'East' }, 9, 6), month: 5 },
      ];
      const elite = createStatus({
        age: 27,
        rank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        history: {
          records: eliteRecords,
          events: [],
          maxRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
          totalWins: 30,
          totalLosses: 15,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 1, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 18 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });
      const grinder = createStatus({
        age: 23,
        rank: { division: 'Makushita', name: '幕下', number: 8, side: 'East' },
        history: {
          records: [
            { ...createBashoRecord({ division: 'Makushita', name: '幕下', number: 15, side: 'East' }, 5, 2), month: 1 },
            { ...createBashoRecord({ division: 'Makushita', name: '幕下', number: 8, side: 'West' }, 4, 3), month: 3 },
          ],
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', number: 8, side: 'West' },
          totalWins: 9,
          totalLosses: 5,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: { 押し出し: 4 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });

      const eliteScore = buildCareerClearScoreSummary(elite);
      const grinderScore = buildCareerClearScoreSummary(grinder);
      const eliteWithStory = createStatus({
        ...elite,
        history: {
          ...elite.history,
          events: [{ year: 2026, month: 7, type: 'OTHER', description: '大きな転機があった' }],
        },
      });

      assert.ok(eliteScore.clearScore > grinderScore.clearScore, 'Expected elite career to score higher');
      assert.equal(buildCareerClearScoreSummary(eliteWithStory).clearScore, eliteScore.clearScore);
    },
  },
{
    name: 'report: hero summary surfaces life cards and dominant narrative',
    run: () => {
      const status = createStatus({
        age: 29,
        entryAge: 18,
        bodyMetrics: { heightCm: 186, weightKg: 161 },
        buildSummary: {
          oyakataName: '大樹親方',
          amateurBackground: 'HIGH_SCHOOL',
          bodyConstitution: 'HEAVY_BULK',
          heightPotentialCm: 186,
          weightPotentialKg: 178,
          reachDeltaCm: -1,
          spentPoints: 0,
          remainingPoints: 0,
          debtCount: 1,
          debtCards: ['OLD_KNEE'],
          careerBandLabel: '幕内上位圏',
          dominantLifeCard: '背負うもの',
          lifeCards: [
            { slot: '経歴', label: '高卒入門', previewTag: '標準始動', reportLine: '高卒入門の積み上げが土台になった。' },
            { slot: '骨格', label: '重量体', previewTag: '重量の圧', reportLine: '重量体が勝ち方と傷み方を決めた。' },
            { slot: '相撲観', label: 'もろ差し', previewTag: '差し手', reportLine: 'もろ差しの思想が取口を決めた。' },
            { slot: '気質', label: '平常心', previewTag: '平常', reportLine: '平常心が波を抑えた。' },
            { slot: '背負うもの', label: '古傷の膝', previewTag: '膝の不安', reportLine: '古傷の膝が、勝ち方まで変える人生の重さになった。' },
          ],
          lifeCardNarrativeSeeds: {
            dominant: '古傷の膝が、勝ち方まで変える人生の重さになった。',
            burden: '古傷の膝が、勝ち方まで変える人生の重さになった。',
            frameAndInjury: '重量体が、故障の出方と耐え方に影を落とした。',
            designedVsRealized: 'もろ差しを軸に設計され、実戦ではそのズレが見どころになった。',
          },
        },
        history: {
          records: [],
          events: [],
          maxRank: { division: 'Juryo', name: '十両', number: 2, side: 'East' },
          totalWins: 120,
          totalLosses: 88,
          totalAbsent: 12,
          yushoCount: { makuuchi: 0, juryo: 1, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 55 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });

      const summary = buildReportHeroSummary(status);
      assert.equal(summary.lifeCards.length, 5);
      assert.equal(summary.lifeCards[4]?.label, '古傷の膝');
      assert.equal(summary.narrative, '大舞台よりも、一場所ごとの積み上げが印象に残る力士人生です。');
    },
  },
{
    name: 'report: record badges map milestone achievements to factual labels',
    run: () => {
      const status = createStatus({
        age: 29,
        rank: { division: 'Makuuchi', name: '前頭', number: 2, side: 'East' },
        history: {
          records: [
            { ...createBashoRecord({ division: 'Juryo', name: '十両', number: 1, side: 'East' }, 12, 3), month: 1, yusho: true },
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 2, side: 'East' }, 10, 5), month: 3, kinboshi: 1 },
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 1, side: 'West' }, 9, 6), month: 5, specialPrizes: ['敢闘賞'] },
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 4, side: 'East' }, 8, 7), month: 7 },
          ],
          events: [],
          maxRank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'West' },
          totalWins: 39,
          totalLosses: 21,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 1, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 12 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });

      const badgeKeys = buildCareerRecordBadges(status).map((badge) => badge.key);
      assert.ok(badgeKeys.includes('MAKUUCHI_REACHED'));
      assert.ok(badgeKeys.includes('JURYO_YUSHO'));
      assert.ok(badgeKeys.includes('KINBOSHI'));
      assert.ok(badgeKeys.includes('DOUBLE_DIGIT_WINS'));
      assert.ok(badgeKeys.includes('KACHIKOSHI_STREAK'));
    },
  },
{
    name: 'collection: save incentive uses clear score and record collection progress',
    run: async () => {
      await resetDb();

      const baseline = createStatus({
        shikona: '控山',
        age: 23,
        rank: { division: 'Makushita', name: '幕下', number: 20, side: 'East' },
        history: {
          records: [{ ...createBashoRecord({ division: 'Makushita', name: '幕下', number: 20, side: 'East' }, 4, 3), month: 1 }],
          events: [],
          maxRank: { division: 'Makushita', name: '幕下', number: 20, side: 'East' },
          totalWins: 4,
          totalLosses: 3,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: { 押し出し: 2 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });
      const baselineCareerId = await createDraftCareer({
        initialStatus: baseline,
        careerStartYearMonth: buildCareerStartYearMonth(2026, 1),
      });
      await markCareerCompleted(baselineCareerId, baseline);
      await commitCareer(baselineCareerId);

      const contender = createStatus({
        shikona: '挑戦岳',
        age: 28,
        rank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
        history: {
          records: [
            { ...createBashoRecord({ division: 'Juryo', name: '十両', number: 1, side: 'East' }, 11, 4), month: 1, yusho: true },
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 3, side: 'East' }, 10, 5), month: 3, kinboshi: 1 },
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 1, side: 'East' }, 9, 6), month: 5, specialPrizes: ['殊勲賞'] },
          ],
          events: [],
          maxRank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
          totalWins: 30,
          totalLosses: 15,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 1, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 10 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });
      const contenderCareerId = await createDraftCareer({
        initialStatus: contender,
        careerStartYearMonth: buildCareerStartYearMonth(2026, 1),
      });
      await markCareerCompleted(contenderCareerId, contender);

      const preview = await getCareerSaveIncentiveSummary(contender, {
        careerId: contenderCareerId,
        isSaved: false,
        includeOyakata: true,
      });
      assert.equal(preview.projectedBestScoreRank, 1);
      assert.equal(preview.isPersonalBest, true);
      assert.ok(preview.newRecordCount > 0);
      assert.ok(preview.collectionDeltaCount > 0);

      await commitCareer(contenderCareerId);
      const savedRows = await listCommittedCareers();
      const saved = savedRows.find((row) => row.id === contenderCareerId);
      assert.ok(Boolean(saved), 'Expected committed career row');
      assert.ok((saved?.clearScore ?? 0) > 0);
      assert.equal(saved?.bestScoreRank, 1);
      assert.ok((saved?.recordBadgeKeys ?? []).length > 0);

      const recordSummary = await getRecordCollectionSummary();
      assert.ok(recordSummary.count > 0, 'Expected record collection entries after save');
    },
  },
{
    name: 'collection: catalog exposes locked entries as masked placeholders',
    run: async () => {
      await resetDb();
      const entries = await listCollectionCatalogEntries('RECORD');
      assert.ok(entries.length >= 10, 'Expected full record catalog');
      assert.ok(entries.every((entry) => entry.state === 'LOCKED'));
      assert.ok(entries.every((entry) => entry.label === '？？？'));
      assert.ok(entries.every((entry) => entry.meta == null));
    },
  },
{
    name: 'collection: legacy saved careers backfill collection entries without new flags',
    run: async () => {
      await resetDb();

      const status = createStatus({
        shikona: '旧記録山',
        age: 28,
        rank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
        history: {
          records: [
            { ...createBashoRecord({ division: 'Juryo', name: '十両', number: 1, side: 'East' }, 12, 3), month: 1, yusho: true },
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 1, side: 'East' }, 10, 5), month: 3, kinboshi: 1, specialPrizes: ['殊勲賞'] },
          ],
          events: [],
          maxRank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
          totalWins: 22,
          totalLosses: 8,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 1, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 6, 押し出し: 3 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });
      const careerId = await createDraftCareer({
        initialStatus: status,
        careerStartYearMonth: buildCareerStartYearMonth(2026, 1),
      });
      await markCareerCompleted(careerId, status);
      await commitCareer(careerId);

      await getDb().collectionEntries.clear();

      const dashboard = await getCollectionDashboardSummary();
      assert.ok(dashboard.totalUnlocked > 0);
      assert.equal(dashboard.totalNew, 0);

      const recordEntries = await listCollectionCatalogEntries('RECORD');
      assert.ok(recordEntries.some((entry) => entry.state === 'UNLOCKED'));
      assert.ok(recordEntries.every((entry) => entry.state === 'UNLOCKED' ? entry.isNew !== true : true));
    },
  },
{
    name: 'collection: achievement display uses factual names',
    run: () => {
      const names = new Set(ACHIEVEMENT_CATALOG.map((entry) => entry.name));
      assert.ok(names.has('幕内優勝1回'));
      assert.ok(names.has('12場所以内で新入幕'));
      assert.ok(names.has('20種類の決まり手で勝利'));

      const status = createStatus({
        age: 40,
        history: {
          records: [
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 1, side: 'East' }, 15, 0), month: 1, yusho: true },
          ],
          events: [],
          maxRank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
          totalWins: 100,
          totalLosses: 0,
          totalAbsent: 0,
          yushoCount: { makuuchi: 1, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 30 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });
      const labels = evaluateAchievements(status).map((entry) => entry.name);
      assert.ok(labels.includes('幕内優勝1回'));
      assert.ok(labels.includes('幕内全勝優勝1回'));
    },
  },
{
    name: 'collection: kimarite catalog includes 82 official moves plus non-tech metadata',
    run: async () => {
      const entries = await listCollectionCatalogEntries('KIMARITE');
      assert.equal(entries.length, 89);
      const officialCount = entries.filter((entry) => entry.meta?.isNonTechnique !== true).length;
      const nonTechniqueCount = entries.filter((entry) => entry.meta?.isNonTechnique === true).length;
      assert.equal(officialCount, 82);
      assert.equal(nonTechniqueCount, 7);
    },
  },
{
    name: 'collection: dashboard summary and recent unlocks include factual labels',
    run: async () => {
      await resetDb();
      const status = createStatus({
        shikona: '図鑑山',
        age: 27,
        rank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
        history: {
          records: [
            { ...createBashoRecord({ division: 'Juryo', name: '十両', number: 1, side: 'East' }, 12, 3), month: 1, yusho: true },
            { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', number: 1, side: 'East' }, 10, 5), month: 3, kinboshi: 1, specialPrizes: ['殊勲賞'] },
          ],
          events: [],
          maxRank: { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
          totalWins: 22,
          totalLosses: 8,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 1, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 12, 押し出し: 3 },
          bodyTimeline: [],
          highlightEvents: [],
        },
      });
      const careerId = await createDraftCareer({
        initialStatus: status,
        careerStartYearMonth: buildCareerStartYearMonth(2026, 1),
      });
      await markCareerCompleted(careerId, status);
      await commitCareer(careerId);

      const dashboard = await getCollectionDashboardSummary();
      assert.ok(dashboard.totalUnlocked > 0);
      assert.equal(dashboard.rows.length, 3);
      const kimariteRow = dashboard.rows.find((row) => row.type === 'KIMARITE');
      assert.equal(kimariteRow?.total, 82);
      assert.ok(String(kimariteRow?.note).includes('非技'));

      const recent = await listRecentCollectionUnlocks(3);
      assert.ok(recent.length > 0);
      assert.ok(recent.every((entry) => entry.label !== '？？？'));

      const recordEntries = await listCollectionCatalogEntries('RECORD');
      assert.ok(recordEntries.some((entry) => entry.state === 'UNLOCKED' && entry.label === '幕内到達'));
    },
  },
{
    name: 'wallet: phase A starts at 50pt and regenerates 1 point per minute',
    run: async () => {
      await resetDb();
      const atStart = await getWalletState(0);
      assert.equal(atStart.points, 50);
      const at59Sec = await getWalletState(59_000);
      assert.equal(at59Sec.points, 50);
      assert.equal(at59Sec.nextRegenInSec, 1);
      const at60Sec = await getWalletState(60_000);
      assert.equal(at60Sec.points, 51);
      assert.equal(at60Sec.nextRegenInSec, 60);
    },
  },
{
    name: 'wallet: phase A cap is 100pt and offline regen stops at cap',
    run: async () => {
      await resetDb();
      await getWalletState(0);
      const longAfter = await getWalletState(60_000 * 600);
      assert.equal(longAfter.points, WALLET_MAX_POINTS);
      assert.equal(longAfter.cap, WALLET_MAX_POINTS);
      assert.equal(longAfter.nextRegenInSec, 0);
    },
  },
{
    name: 'wallet: spend fails when points are insufficient',
    run: async () => {
      await resetDb();
      const spent = await spendWalletPoints(40, 0);
      assert.equal(spent.ok, true);
      const denied = await spendWalletPoints(20, 0);
      assert.equal(denied.ok, false);
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
    name: 'storage: commitCareer still saves when legacy unofficial kimarite rows exist',
    run: async () => {
      await resetDb();
      const db = getDb();
      await db.collectionEntries.put({
        id: 'KIMARITE:もろ差し',
        type: 'KIMARITE',
        key: 'もろ差し',
        unlockedAt: '2026-01-01T00:00:00.000Z',
        isNew: true,
      });

      const status = createStatus({
        history: {
          records: [],
          events: [
            {
              year: 2032,
              month: 5,
              type: 'RETIREMENT',
              description: '引退',
            },
          ],
          maxRank: { division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 10 },
          totalWins: 12,
          totalLosses: 3,
          totalAbsent: 0,
          yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 3, もろ差し: 2 },
        },
      });
      const careerId = await createDraftCareer({
        initialStatus: status,
        careerStartYearMonth: '2026-01',
      });

      await markCareerCompleted(careerId, status);
      await commitCareer(careerId);

      assert.equal(await isCareerSaved(careerId), true);
      const saved = await db.careers.get(careerId);
      assert.equal(saved?.state, 'shelved');
    },
  },
{
    name: 'storage: commitCareer grants prize reward and still saves',
    run: async () => {
      await resetDb();
      const db = getDb();
      const status = createStatus({
        history: {
          records: [],
          events: [
            {
              year: 2035,
              month: 1,
              type: 'RETIREMENT',
              description: '引退',
            },
          ],
          maxRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
          totalWins: 120,
          totalLosses: 45,
          totalAbsent: 0,
          yushoCount: { makuuchi: 1, juryo: 0, makushita: 0, others: 0 },
          kimariteTotal: { 寄り切り: 20 },
        },
      });
      const careerId = await createDraftCareer({
        initialStatus: status,
        careerStartYearMonth: '2026-01',
      });

      await markCareerCompleted(careerId, status);
      await commitCareer(careerId);

      assert.equal(await isCareerSaved(careerId), true);
      const reward = await db.careerRewardLedger.get(careerId);
      assert.ok(Boolean(reward), 'Expected reward ledger to be written');
      assert.ok((reward?.pointsAwarded ?? 0) > 0, 'Expected positive wallet reward');
      const wallet = await getWalletState();
      assert.ok(wallet.points >= WALLET_INITIAL_POINTS, 'Expected wallet to remain readable after save');
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
          yieldControl: async () => { },
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
    name: 'storage: appendBashoChunk persists important torikumi notes',
    run: async () => {
      await resetDb();
      const initial = createStatus({
        rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
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
          rank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
          wins: 8,
          losses: 7,
          absent: 0,
          yusho: false,
          specialPrizes: [],
        },
        playerBouts: [
          {
            day: 15,
            result: 'LOSS',
            opponentId: 'NPC-Y',
            opponentShikona: '覇王山',
            opponentRankName: '横綱',
            opponentRankSide: 'East',
          },
        ],
        importantTorikumiNotes: [
          {
            day: 15,
            year: 2026,
            month: 1,
            opponentId: 'NPC-Y',
            opponentShikona: '覇王山',
            opponentRank: { division: 'Makuuchi', name: '横綱', side: 'East' },
            trigger: 'YUSHO_RACE',
            summary: '優勝争いの割で組まれた。',
            matchReason: 'YUSHO_RACE',
            relaxationStage: 0,
          },
        ],
        npcRecords: [],
        statusSnapshot: initial,
      });

      const rows = await listCareerImportantTorikumi(careerId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.trigger, 'YUSHO_RACE');
      assert.equal(rows[0]?.opponentShikona, '覇王山');
      assert.equal(rows[0]?.day, 15);
    },
  },
{
    name: 'report: listCareerBashoRecordsBySeq groups saved basho rows by sequence',
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
          wins: 9,
          losses: 6,
          absent: 0,
          yusho: false,
          specialPrizes: [],
        },
        playerBouts: [],
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
        ],
        statusSnapshot: initial,
      });

      const rows = await listCareerBashoRecordsBySeq(careerId);
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.bashoSeq, 1);
      assert.equal(rows[0]?.rows.length, 2);
      assert.equal(rows[0]?.rows.some((row) => row.entityId === 'PLAYER'), true);
      assert.equal(rows[0]?.rows.some((row) => row.entityId === 'NPC-A'), true);
    },
  },
{
    name: 'persistence: getCareerBashoDetail bundles rows bouts torikumi and banzuke logs by bashoSeq',
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
          wins: 9,
          losses: 6,
          absent: 0,
          yusho: false,
          specialPrizes: ['敢闘賞'],
        },
        playerBouts: [
          {
            day: 1,
            result: 'WIN',
            kimarite: '押し出し',
            opponentId: 'NPC-A',
            opponentShikona: '甲山',
            opponentRankName: '十両',
            opponentRankNumber: 8,
            opponentRankSide: 'West',
          },
        ],
        importantTorikumiNotes: [
          {
            day: 1,
            year: 2026,
            month: 1,
            opponentId: 'NPC-A',
            opponentShikona: '甲山',
            opponentRank: { division: 'Juryo', name: '十両', side: 'West', number: 8 },
            trigger: 'SEKITORI_BOUNDARY',
            summary: '関取境界の直接対決で組まれた。',
            matchReason: 'BOUNDARY_CROSSOVER',
            relaxationStage: 0,
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
        ],
        banzukeDecisions: [
          {
            seq: 1,
            rikishiId: 'PLAYER',
            fromRank: { division: 'Makushita', name: '幕下', side: 'East', number: 1 },
            candidateRank: { division: 'Juryo', name: '十両', side: 'East', number: 13 },
            proposedRank: { division: 'Juryo', name: '十両', side: 'East', number: 13 },
            finalRank: { division: 'Juryo', name: '十両', side: 'East', number: 13 },
            wins: 5,
            losses: 2,
            absent: 0,
            reasons: ['AUTO_ACCEPTED'],
          },
        ],
        statusSnapshot: initial,
      });

      const detail = await getCareerBashoDetail(careerId, 1);
      assert.ok(detail);
      assert.equal(detail?.bashoSeq, 1);
      assert.equal(detail?.rows.length, 2);
      assert.equal(detail?.bouts.length, 1);
      assert.equal(detail?.importantTorikumi.length, 1);
      assert.equal(detail?.banzukeDecisions.length, 1);
      assert.equal(detail?.playerRecord?.entityId, 'PLAYER');
      assert.equal(detail?.bouts[0]?.day, 1);
      assert.equal(detail?.importantTorikumi[0]?.trigger, 'SEKITORI_BOUNDARY');
      assert.equal(detail?.banzukeDecisions[0]?.seq, 1);
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
    name: 'report: hoshitori records keep stored basho sequence after maezumo',
    run: () => {
      const records: BashoRecord[] = [
        {
          ...createBashoRecord({ division: 'Maezumo', name: '前相撲', side: 'East', number: 1 }, 3, 0),
          month: 1,
        },
        {
          ...createBashoRecord({ division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 12 }, 5, 2),
          month: 3,
        },
        {
          ...createBashoRecord({ division: 'Jonidan', name: '序二段', side: 'West', number: 87 }, 4, 3),
          month: 5,
        },
      ];
      const joined = buildHoshitoriCareerRecords(records, [
        { bashoSeq: 1, bouts: [{ day: 1, result: 'WIN', kimarite: '押し出し' }] },
        { bashoSeq: 2, bouts: [{ day: 3, result: 'LOSS', kimarite: '寄り切り' }] },
        { bashoSeq: 3, bouts: [{ day: 5, result: 'WIN', kimarite: '送り出し' }] },
      ]);

      assert.equal(joined.length, 2);
      assert.equal(joined[0]?.bashoSeq, 2);
      assert.equal(joined[0]?.displaySlot, 1);
      assert.equal(joined[0]?.bouts[0]?.kimarite, '寄り切り');
      assert.equal(joined[1]?.bashoSeq, 3);
      assert.equal(joined[1]?.displaySlot, 2);
      assert.equal(joined[1]?.bouts[0]?.kimarite, '送り出し');
    },
  },
{
    name: 'report: rank chart uses positive compressed basho slots only',
    run: () => {
      const records: BashoRecord[] = [
        {
          ...createBashoRecord({ division: 'Maezumo', name: '前相撲', side: 'East', number: 1 }, 3, 0),
          month: 1,
        },
        {
          ...createBashoRecord({ division: 'Jonokuchi', name: '序ノ口', side: 'East', number: 15 }, 6, 1),
          month: 3,
        },
        {
          ...createBashoRecord({ division: 'Makushita', name: '幕下', side: 'West', number: 22 }, 5, 2),
          month: 7,
        },
      ];

      const chart = buildRankChartData(records);
      assert.equal(chart.length, 2);
      assert.deepEqual(chart.map((point) => point.slot), [1, 2]);
      assert.ok(chart.every((point) => point.rankValue >= 0), 'Expected non-negative rank values');
      assert.equal(chart[0]?.bashoLabel, '2026年3月');
      assert.equal(chart[1]?.bashoLabel, '2026年7月');
    },
  },
{
    name: 'report: timeline groups same basho events in priority order',
    run: () => {
      const groups = buildTimelineEventGroups([
        { year: 2026, month: 5, type: 'PROMOTION', description: '西十両2枚目へ昇進 (12勝3敗)' },
        { year: 2026, month: 5, type: 'YUSHO', description: '幕下優勝 (西幕下3枚目 / 7勝)' },
        { year: 2026, month: 5, type: 'OTHER', description: '技能賞を受賞' },
        { year: 2026, month: 3, type: 'ENTRY', description: '新弟子として入門。' },
      ]);

      assert.equal(groups.length, 2);
      assert.equal(groups[0]?.month, 5);
      assert.equal(groups[0]?.tagLabel, '優勝');
      assert.deepEqual(groups[0]?.descriptions, [
        '幕下優勝 (西幕下3枚目 / 7勝)',
        '西十両2枚目へ昇進 (12勝3敗)',
        '技能賞を受賞',
      ]);
    },
  },
{
    name: 'report: important banzuke digest includes sekitori and makuuchi promotions only when significant',
    run: () => {
      const status = createStatus();
      status.history.records = [
        {
          ...createBashoRecord({ division: 'Makushita', name: '幕下', side: 'East', number: 2 }, 6, 1),
          month: 1,
        },
        {
          ...createBashoRecord({ division: 'Juryo', name: '十両', side: 'East', number: 1 }, 11, 4),
          month: 3,
        },
        {
          ...createBashoRecord({ division: 'Makuuchi', name: '前頭', side: 'East', number: 10 }, 8, 7),
          month: 5,
        },
      ];

      const digests = buildImportantBanzukeDecisionDigests(status, [
        {
          careerId: 'career',
          seq: 1,
          rikishiId: 'PLAYER',
          fromRank: { division: 'Makushita', name: '幕下', side: 'East', number: 2 },
          proposedRank: { division: 'Juryo', name: '十両', side: 'East', number: 13 },
          finalRank: { division: 'Juryo', name: '十両', side: 'East', number: 13 },
          reasons: ['REVIEW_ACCEPTED'],
        },
        {
          careerId: 'career',
          seq: 2,
          rikishiId: 'PLAYER',
          fromRank: { division: 'Juryo', name: '十両', side: 'East', number: 1 },
          proposedRank: { division: 'Makuuchi', name: '前頭', side: 'West', number: 14 },
          finalRank: { division: 'Makuuchi', name: '前頭', side: 'West', number: 14 },
          reasons: ['REVIEW_ACCEPTED'],
        },
        {
          careerId: 'career',
          seq: 3,
          rikishiId: 'PLAYER',
          fromRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 10 },
          proposedRank: { division: 'Makuuchi', name: '前頭', side: 'West', number: 9 },
          finalRank: { division: 'Makuuchi', name: '前頭', side: 'West', number: 9 },
          reasons: ['REVIEW_ACCEPTED'],
        },
      ], []);

      assert.deepEqual(digests.map((entry) => entry.trigger), ['MAKUUCHI_PROMOTION', 'SEKITORI_PROMOTION']);
    },
  },
{
    name: 'report: important banzuke digest flags kachikoshi hold and sanyaku slot jam',
    run: () => {
      const status = createStatus();
      status.history.records = [
        {
          ...createBashoRecord({ division: 'Makuuchi', name: '前頭', side: 'East', number: 1 }, 8, 7),
          month: 1,
        },
        {
          ...createBashoRecord({ division: 'Makuuchi', name: '前頭', side: 'East', number: 4 }, 12, 3),
          month: 3,
        },
      ];

      const digests = buildImportantBanzukeDecisionDigests(status, [
        {
          careerId: 'career',
          seq: 1,
          rikishiId: 'PLAYER',
          fromRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
          proposedRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
          finalRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
          reasons: ['REVIEW_ACCEPTED'],
        },
        {
          careerId: 'career',
          seq: 2,
          rikishiId: 'PLAYER',
          fromRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 4 },
          proposedRank: { division: 'Makuuchi', name: '小結', side: 'West' },
          finalRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 1 },
          reasons: ['REVIEW_BOUNDARY_SLOT_JAM_NOTED'],
        },
      ], []);

      assert.equal(digests[0]?.trigger, 'SANYAKU_MISSED_BY_SLOT_JAM');
      assert.equal(digests[1]?.trigger, 'KACHIKOSHI_HELD');
    },
  },
{
    name: 'report: important torikumi digest ignores ordinary nearby bouts and keeps yusho race',
    run: () => {
      const digests = buildImportantTorikumiDigests([
        {
          careerId: 'career',
          bashoSeq: 1,
          day: 15,
          year: 2026,
          month: 1,
          opponentId: 'Y1',
          opponentShikona: '覇王山',
          opponentRankName: '横綱',
          opponentRankSide: 'East',
          trigger: 'YUSHO_RACE',
          summary: '優勝争いの割で組まれた。',
          matchReason: 'YUSHO_RACE',
          relaxationStage: 0,
        },
        {
          careerId: 'career',
          bashoSeq: 1,
          day: 8,
          year: 2026,
          month: 1,
          opponentId: 'M8',
          opponentShikona: '平幕山',
          opponentRankName: '前頭',
          opponentRankNumber: 8,
          opponentRankSide: 'West',
          trigger: 'LATE_RELAXATION',
          summary: '制約緩和が深い編成で相手が決まった。',
          matchReason: 'FALLBACK',
          relaxationStage: 3,
        },
      ]);

      assert.equal(digests.length, 2);
      assert.equal(digests[0]?.trigger, 'YUSHO_RACE');
      assert.ok(digests[0]?.detailLine.includes('覇王山'));
    },
  },
{
    name: 'report: important decision digest mixes banzuke and torikumi timeline items',
    run: () => {
      const digest = buildImportantDecisionDigest(
        [
          {
            key: 'banzuke-1',
            bashoSeq: 2,
            bashoLabel: '2026年3月',
            trigger: 'SEKITORI_PROMOTION',
            summary: '関取昇進を決め、東十両13枚目に届いた。',
            resultLine: '結果: 6勝1敗で東十両13枚目へ動いた。',
            reasonLine: '理由: 幕下以下を抜け、関取枠へ届く成績を残した。',
            contextLine: '番付事情: 関取境界での競合を抜けた。',
            recordText: '6勝1敗',
            fromRankLabel: '東幕下2枚目',
            toRankLabel: '東十両13枚目',
            year: 2026,
            month: 3,
          },
        ],
        [
          {
            key: 'torikumi-1',
            bashoSeq: 2,
            bashoLabel: '2026年3月',
            day: 15,
            trigger: 'YUSHO_RACE',
            summary: '優勝争いの割で組まれた。',
            detailLine: '15日目は覇王山（東横綱）と組まれた。',
            opponentId: 'Y1',
            opponentShikona: '覇王山',
            opponentRankLabel: '東横綱',
            year: 2026,
            month: 3,
          },
        ],
      );

      assert.equal(digest.highlights.length, 2);
      assert.equal(digest.timelineItems[0]?.entryType, 'TORIKUMI');
      assert.equal(digest.timelineItems[1]?.entryType, 'BANZUKE');
    },
  },
{
    name: 'report: rivalry digest includes title blocker and era titan with strong evidence only',
    run: () => {
      const status = createStatus({
        rank: { division: 'Makuuchi', name: '小結', side: 'East' },
      });
      status.history.records = [
        { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', side: 'East', number: 1 }, 12, 3), month: 1 },
        { ...createBashoRecord({ division: 'Makuuchi', name: '前頭', side: 'West', number: 2 }, 11, 4), month: 3 },
        { ...createBashoRecord({ division: 'Makuuchi', name: '小結', side: 'East' }, 10, 5), month: 5 },
      ];
      status.history.maxRank = { division: 'Makuuchi', name: '小結', side: 'East' };
      status.history.totalWins = 33;
      status.history.totalLosses = 12;
      status.history.totalAbsent = 0;

      const headToHeadRows = [
        {
          opponentId: 'Y1',
          latestShikona: '北海龍',
          bouts: 6,
          wins: 1,
          losses: 5,
          absences: 0,
          firstSeenSeq: 1,
          lastSeenSeq: 3,
        },
        {
          opponentId: 'F1',
          latestShikona: '富士嶺',
          bouts: 1,
          wins: 0,
          losses: 1,
          absences: 0,
          firstSeenSeq: 2,
          lastSeenSeq: 2,
        },
      ];
      const boutsByBasho: Array<{ bashoSeq: number; bouts: PlayerBoutDetail[] }> = [
        {
          bashoSeq: 1,
          bouts: [{ day: 15, result: 'LOSS', opponentId: 'Y1', opponentShikona: '北海龍' }],
        },
        {
          bashoSeq: 2,
          bouts: [{ day: 14, result: 'LOSS', opponentId: 'Y1', opponentShikona: '北海龍' }],
        },
        {
          bashoSeq: 3,
          bouts: [{ day: 13, result: 'WIN', opponentId: 'Y1', opponentShikona: '北海龍' }],
        },
      ];
      const bashoRowsBySeq = [
        {
          bashoSeq: 1,
          year: 2026,
          month: 1,
          rows: [
            createBashoRecordRow({
              seq: 1,
              entityId: 'PLAYER',
              entityType: 'PLAYER',
              shikona: '試験山',
              division: 'Makuuchi',
              rankName: '前頭',
              rankNumber: 1,
              rankSide: 'East',
              wins: 12,
              losses: 3,
            }),
            createBashoRecordRow({
              seq: 1,
              entityId: 'Y1',
              entityType: 'NPC',
              shikona: '北海龍',
              division: 'Makuuchi',
              rankName: '横綱',
              rankSide: 'East',
              wins: 12,
              losses: 3,
              titles: ['YUSHO'],
            }),
          ],
        },
        {
          bashoSeq: 2,
          year: 2026,
          month: 3,
          rows: [
            createBashoRecordRow({
              seq: 2,
              entityId: 'PLAYER',
              entityType: 'PLAYER',
              shikona: '試験山',
              division: 'Makuuchi',
              rankName: '前頭',
              rankNumber: 2,
              rankSide: 'West',
              wins: 11,
              losses: 4,
            }),
            createBashoRecordRow({
              seq: 2,
              entityId: 'Y1',
              entityType: 'NPC',
              shikona: '北海龍',
              division: 'Makuuchi',
              rankName: '横綱',
              rankSide: 'East',
              wins: 12,
              losses: 3,
              titles: ['YUSHO'],
            }),
            createBashoRecordRow({
              seq: 2,
              entityId: 'F1',
              entityType: 'NPC',
              shikona: '富士嶺',
              division: 'Makuuchi',
              rankName: '前頭',
              rankNumber: 8,
              rankSide: 'West',
              wins: 11,
              losses: 4,
            }),
          ],
        },
        {
          bashoSeq: 3,
          year: 2026,
          month: 5,
          rows: [
            createBashoRecordRow({
              seq: 3,
              entityId: 'PLAYER',
              entityType: 'PLAYER',
              shikona: '試験山',
              division: 'Makuuchi',
              rankName: '小結',
              rankSide: 'East',
              wins: 10,
              losses: 5,
            }),
            createBashoRecordRow({
              seq: 3,
              entityId: 'Y1',
              entityType: 'NPC',
              shikona: '北海龍',
              division: 'Makuuchi',
              rankName: '横綱',
              rankSide: 'East',
              wins: 11,
              losses: 4,
            }),
          ],
        },
      ];

      const digest = buildCareerRivalryDigest(status, headToHeadRows, boutsByBasho, bashoRowsBySeq, []);

      assert.equal(digest.titleBlockers[0]?.opponentId, 'Y1');
      assert.equal(digest.titleBlockers[0]?.evidenceCount, 2);
      assert.equal(digest.eraTitans[0]?.opponentId, 'Y1');
      assert.equal(digest.eraTitans[0]?.yushoCount, 2);
      assert.equal(digest.titleBlockers.some((entry) => entry.opponentId === 'F1'), false);
    },
  },
{
    name: 'report: rivalry digest excludes nemesis with too few bouts',
    run: () => {
      const status = createStatus();
      status.history.records = [
        { ...createBashoRecord({ division: 'Juryo', name: '十両', side: 'East', number: 1 }, 10, 5), month: 1 },
      ];

      const digest = buildCareerRivalryDigest(
        status,
        [
          {
            opponentId: 'R1',
            latestShikona: '雷王',
            bouts: 4,
            wins: 0,
            losses: 4,
            absences: 0,
            firstSeenSeq: 1,
            lastSeenSeq: 1,
          },
        ],
        [{ bashoSeq: 1, bouts: [] }],
        [
          {
            bashoSeq: 1,
            year: 2026,
            month: 1,
            rows: [
              createBashoRecordRow({
                seq: 1,
                entityId: 'PLAYER',
                entityType: 'PLAYER',
                shikona: '試験山',
                division: 'Juryo',
                rankName: '十両',
                rankNumber: 1,
                rankSide: 'East',
                wins: 10,
                losses: 5,
              }),
              createBashoRecordRow({
                seq: 1,
                entityId: 'R1',
                entityType: 'NPC',
                shikona: '雷王',
                division: 'Juryo',
                rankName: '十両',
                rankNumber: 2,
                rankSide: 'West',
                wins: 11,
                losses: 4,
              }),
            ],
          },
        ],
        [],
      );

      assert.equal(digest.nemesis.length, 0);
    },
  },
{
    name: 'report: banzuke snapshot keeps player division only and sorts east before west',
    run: () => {
      const snapshot = buildBanzukeSnapshotForSeq(2, 'Makuuchi', [
        createBashoRecordRow({
          seq: 2,
          entityId: 'J1',
          entityType: 'NPC',
          shikona: '十両海',
          division: 'Juryo',
          rankName: '十両',
          rankNumber: 1,
          rankSide: 'East',
          wins: 10,
          losses: 5,
        }),
        createBashoRecordRow({
          seq: 2,
          entityId: 'R2',
          entityType: 'NPC',
          shikona: '若ノ峰',
          division: 'Makuuchi',
          rankName: '前頭',
          rankNumber: 1,
          rankSide: 'West',
          wins: 8,
          losses: 7,
        }),
        createBashoRecordRow({
          seq: 2,
          entityId: 'PLAYER',
          entityType: 'PLAYER',
          shikona: '試験山',
          division: 'Makuuchi',
          rankName: '前頭',
          rankNumber: 1,
          rankSide: 'East',
          wins: 9,
          losses: 6,
        }),
      ]);

      assert.equal(snapshot.rows.length, 2);
      assert.equal(snapshot.rows[0]?.entityId, 'PLAYER');
      assert.equal(snapshot.rows[1]?.entityId, 'R2');
      assert.equal(snapshot.rows.some((row) => row.entityId === 'J1'), false);
    },
  },
{
    name: 'report: banzuke snapshot can focus around player rank window while keeping highlighted rival',
    run: () => {
      const snapshot = buildBanzukeSnapshotForSeq(2, 'Makuuchi', [
        createBashoRecordRow({
          seq: 2,
          entityId: 'R0',
          entityType: 'NPC',
          shikona: '青嶺',
          division: 'Makuuchi',
          rankName: '前頭',
          rankNumber: 1,
          rankSide: 'East',
          wins: 11,
          losses: 4,
        }),
        createBashoRecordRow({
          seq: 2,
          entityId: 'R1',
          entityType: 'NPC',
          shikona: '黒岳',
          division: 'Makuuchi',
          rankName: '前頭',
          rankNumber: 2,
          rankSide: 'East',
          wins: 9,
          losses: 6,
        }),
        createBashoRecordRow({
          seq: 2,
          entityId: 'PLAYER',
          entityType: 'PLAYER',
          shikona: '試験山',
          division: 'Makuuchi',
          rankName: '前頭',
          rankNumber: 3,
          rankSide: 'East',
          wins: 8,
          losses: 7,
        }),
        createBashoRecordRow({
          seq: 2,
          entityId: 'R2',
          entityType: 'NPC',
          shikona: '若ノ峰',
          division: 'Makuuchi',
          rankName: '前頭',
          rankNumber: 4,
          rankSide: 'West',
          wins: 8,
          losses: 7,
        }),
        createBashoRecordRow({
          seq: 2,
          entityId: 'R3',
          entityType: 'NPC',
          shikona: '白鵬岳',
          division: 'Makuuchi',
          rankName: '前頭',
          rankNumber: 5,
          rankSide: 'East',
          wins: 7,
          losses: 8,
        }),
      ], {
        focusRank: { division: 'Makuuchi', name: '前頭', side: 'East', number: 3 },
        focusEntityIds: ['PLAYER', 'R2'],
        focusWindow: 1,
        entryPoints: ['records'],
        highlightReason: '前頭3枚目周辺だけを抜き出す。',
      });

      assert.equal(snapshot.totalRowCount, 5);
      assert.equal(snapshot.rows.length, 4);
      assert.equal(snapshot.rows.some((row) => row.entityId === 'PLAYER'), true);
      assert.equal(snapshot.rows.some((row) => row.entityId === 'R2'), true);
      assert.equal(snapshot.rows.some((row) => row.entityId === 'R0'), false);
      assert.equal(snapshot.highlightReason, '前頭3枚目周辺だけを抜き出す。');
      assert.equal(snapshot.focusWindow, 1);
    },
  },
{
    name: 'collection: unofficial kimarite entries are filtered and aliases collapse to official names',
    run: async () => {
      await resetDb();
      const db = getDb();
      await db.collectionEntries.bulkPut([
        {
          id: 'KIMARITE:もろ差し',
          type: 'KIMARITE',
          key: 'もろ差し',
          unlockedAt: '2026-03-07T00:00:00.000Z',
          isNew: true,
        },
        {
          id: 'KIMARITE:すくい投げ',
          type: 'KIMARITE',
          key: 'すくい投げ',
          unlockedAt: '2026-03-08T00:00:00.000Z',
          isNew: true,
        },
        {
          id: 'KIMARITE:掬い投げ',
          type: 'KIMARITE',
          key: '掬い投げ',
          unlockedAt: '2026-03-06T00:00:00.000Z',
          isNew: false,
        },
      ]);

      const summary = await listCollectionSummary();
      const details = await listUnlockedCollectionEntries();
      const kimariteSummary = summary.find((row: { type: string }) => row.type === 'KIMARITE');

      assert.equal(kimariteSummary?.count, 1);
      assert.equal(kimariteSummary?.newCount, 1);
      assert.equal(details.some((entry: { label: string }) => entry.label.includes('もろ差し')), false);
      assert.equal(details.filter((entry: { label: string }) => entry.label === '決まり手：掬い投げ').length, 1);
    },
  },
{
    name: 'report: career rate metrics separate simple average from pooled legacy average',
    run: () => {
      const accumulator = createCareerRateAccumulator();
      pushCareerRateSample(accumulator, { wins: 600, losses: 400, absent: 0 });
      pushCareerRateSample(accumulator, { wins: 573, losses: 427, absent: 0 });
      pushCareerRateSample(accumulator, { wins: 23, losses: 37, absent: 0 });
      pushCareerRateSample(accumulator, { wins: 17, losses: 37, absent: 0 });
      const summary = finalizeCareerRateAccumulator(accumulator);
      const expectedAverage = (0.6 + 0.573 + (23 / 60) + (17 / 54)) / 4;

      assert.ok(
        Math.abs(summary.officialWinRate - expectedAverage) < 1e-9,
        `Expected simple average ${expectedAverage}, got ${summary.officialWinRate}`,
      );
      assert.ok(
        summary.pooledWinRate > summary.officialWinRate + 0.09,
        `Expected pooled win rate to stay much higher, got official=${summary.officialWinRate} pooled=${summary.pooledWinRate}`,
      );
    },
  },
{
    name: 'report: career rate metrics treat absences as lower effective win rate and losing careers',
    run: () => {
      const sample = buildCareerRateSample({ wins: 10, losses: 8, absent: 20 });
      assert.ok(sample.officialWinRate > 0.5, `Expected official win rate > 0.5, got ${sample.officialWinRate}`);
      assert.ok(sample.effectiveWinRate < 0.5, `Expected effective win rate < 0.5, got ${sample.effectiveWinRate}`);
      assert.equal(sample.effectiveIsLosing, true);

      const accumulator = createCareerRateAccumulator();
      pushCareerRateSample(accumulator, { wins: 10, losses: 8, absent: 20 });
      pushCareerRateSample(accumulator, { wins: 12, losses: 8, absent: 0 });
      const summary = finalizeCareerRateAccumulator(accumulator);
      assert.equal(summary.losingCareerRate, 0.5);
    },
  }
];
