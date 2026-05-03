import { TestCase, TestModule } from '../types';
import {
  consumeKimariteSelectionWarnings,
  resolveKimariteOutcome,
  setActiveKimariteTuningPreset,
  summarizeKimariteUsage,
} from '../../../src/logic/kimarite/selection';
import { findOfficialKimariteEntry } from '../../../src/logic/kimarite/catalog';
import { resolveEngagementPatternFit, resolveEngagementRouteBias } from '../../../src/logic/kimarite/engagement';
import { reviewBoard } from '../../../src/logic/banzuke/committee/reviewBoard';
import {
  evaluateYokozunaPromotion,
} from '../../../src/logic/banzuke/rules/yokozunaPromotion';
import { evaluateSnapshotOzekiPromotion } from '../../../src/logic/banzuke/rules/sanyakuPromotion';
import { resolveTopDivisionAssignedEventDetail } from '../../../src/logic/banzuke/rules/topDivisionRules';
import { BanzukeCommitteeCase } from '../../../src/logic/banzuke/types';
import {
  buildCareerAnalysisSummary,
  buildCareerComparisonSummary,
  buildCareerStanceAnalysis,
  buildCareerTrajectorySeries,
  buildGenerationSummary,
  listSimilarCareers,
} from '../../../src/logic/career/analysis';
import { RikishiStatus } from '../../../src/logic/models';

const assert = {
  ok(condition: unknown, message: string): void {
    if (!condition) throw new Error(message);
  },
  equal<T>(actual: T, expected: T, message?: string): void {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${String(expected)} but got ${String(actual)}`);
    }
  },
};

const createMinimalCompetitor = () => ({
  style: 'BALANCE' as const,
  bodyType: 'NORMAL' as const,
  heightCm: 180,
  weightKg: 140,
  stats: {},
  traits: [],
  historyCounts: {},
});

const reviewCase: BanzukeCommitteeCase = {
  id: 'case-1',
  currentRank: { division: 'Makushita', name: '幕下', number: 35, side: 'East' },
  proposalRank: { division: 'Makushita', name: '幕下', number: 22, side: 'West' },
  result: { wins: 3, losses: 4, absent: 0 },
  strengthOfSchedule: 0.5,
  expectedWins: 3.4,
  performanceOverExpected: -0.4,
  historyWindow: [],
  flags: ['LIGHT_MAKEKOSHI_OVER_DEMOTION', 'BOUNDARY_SLOT_JAM'],
};

const createAnalysisStatus = (overrides?: Partial<RikishiStatus>): RikishiStatus => ({
  stableId: 'test',
  ichimonId: 'TAIJU',
  stableArchetypeId: 'TRADITIONAL_LARGE',
  shikona: '分析山',
  entryAge: 18,
  age: 34,
  rank: { division: 'Makuuchi', name: '前頭', number: 4, side: 'East' },
  stats: { tsuki: 50, oshi: 50, kumi: 50, nage: 50, koshi: 50, deashi: 50, waza: 50, power: 50 },
  potential: 50,
  growthType: 'LATE',
  tactics: 'BALANCE',
  aptitudeTier: 'A',
  aptitudeFactor: 1,
  signatureMoves: [],
  bodyType: 'NORMAL',
  profile: { realName: '分析 太郎', birthplace: '東京', personality: 'SERIOUS' },
  bodyMetrics: { heightCm: 184, weightKg: 148 },
  traits: [],
  durability: 60,
  currentCondition: 70,
  ratingState: { ability: 60, form: 50, uncertainty: 0.2 },
  injuryLevel: 0,
  injuries: [],
  spirit: 70,
  history: {
    records: [
      { year: 2020, month: 1, rank: { division: 'Makushita', name: '幕下', number: 45 }, wins: 5, losses: 2, absent: 0, yusho: false, specialPrizes: [] },
      { year: 2020, month: 3, rank: { division: 'Makushita', name: '幕下', number: 18 }, wins: 6, losses: 1, absent: 0, yusho: false, specialPrizes: [] },
      { year: 2020, month: 5, rank: { division: 'Juryo', name: '十両', number: 12 }, wins: 9, losses: 6, absent: 0, yusho: false, specialPrizes: [] },
      { year: 2020, month: 7, rank: { division: 'Juryo', name: '十両', number: 4 }, wins: 11, losses: 4, absent: 0, yusho: true, specialPrizes: [] },
      { year: 2020, month: 9, rank: { division: 'Makuuchi', name: '前頭', number: 14 }, wins: 8, losses: 7, absent: 0, yusho: false, specialPrizes: [] },
      { year: 2020, month: 11, rank: { division: 'Makuuchi', name: '前頭', number: 9 }, wins: 0, losses: 0, absent: 15, yusho: false, specialPrizes: [] },
      { year: 2021, month: 1, rank: { division: 'Juryo', name: '十両', number: 2 }, wins: 10, losses: 5, absent: 0, yusho: false, specialPrizes: [] },
      { year: 2021, month: 3, rank: { division: 'Makuuchi', name: '前頭', number: 4 }, wins: 11, losses: 4, absent: 0, yusho: false, junYusho: true, specialPrizes: ['敢闘賞'] },
    ],
    events: [{ year: 2020, month: 11, type: 'INJURY', description: '右膝負傷 重症度 8' }],
    maxRank: { division: 'Makuuchi', name: '前頭', number: 4, side: 'East' },
    totalWins: 60,
    totalLosses: 29,
    totalAbsent: 15,
    yushoCount: { makuuchi: 0, juryo: 1, makushita: 0, others: 0 },
    kimariteTotal: {},
    highlightEvents: [{ bashoSeq: 6, year: 2020, month: 11, tag: 'MAJOR_INJURY', label: '大怪我' }],
  },
  statHistory: [],
  ...overrides,
});

const cases: TestCase[] = [
  {
    name: 'experience: career analysis separates numeric metrics from labels',
    run: () => {
      const summary = buildCareerAnalysisSummary(createAnalysisStatus());
      assert.ok(summary.metrics.firstSekitoriAge !== null, 'expected first sekitori age');
      assert.ok(summary.metrics.comebackCount >= 1, 'expected comeback after absence');
      assert.ok(summary.saveRecommendation.reasons.length > 0, 'expected save reasons');
      assert.ok(summary.autoTags.length > 0, 'expected auto tags');
    },
  },
  {
    name: 'experience: observation stance verdict uses stance-specific evidence',
    run: () => {
      const summary = buildCareerAnalysisSummary(createAnalysisStatus());
      const stance = buildCareerStanceAnalysis(summary, 'INJURY_COMEBACK');
      assert.equal(stance.stanceLabel, '怪我復帰観測');
      assert.ok(stance.highlightRows.some((row) => row.key === 'comebackCount'), 'expected comeback metric');
      assert.ok(stance.reasonLines.length >= 2, 'expected reasons');
    },
  },
  {
    name: 'experience: career comparison emits grounded comments',
    run: () => {
      const left = buildCareerAnalysisSummary(createAnalysisStatus());
      const right = buildCareerAnalysisSummary(createAnalysisStatus({
        shikona: '安定海',
        age: 38,
        history: {
          ...createAnalysisStatus().history,
          maxRank: { division: 'Makuuchi', name: '関脇', side: 'East' },
          totalWins: 90,
          totalLosses: 60,
          totalAbsent: 0,
          records: createAnalysisStatus().history.records.map((record) => ({
            ...record,
            absent: 0,
            wins: Math.max(record.wins, 8),
            losses: record.losses > 7 ? 7 : record.losses,
          })),
        },
      }));
      const comparison = buildCareerComparisonSummary(left, right);
      assert.ok(comparison.metrics.length >= 10, 'expected comparison rows');
      assert.ok(comparison.comments.length > 0, 'expected comparison comments');
    },
  },
  {
    name: 'experience: trajectory series exposes rank and win-rate points',
    run: () => {
      const status = createAnalysisStatus();
      const series = buildCareerTrajectorySeries(status);
      assert.equal(series.length, status.history.records.length);
      assert.ok(series.some((point) => point.marker === 'YUSHO'), 'expected yusho marker');
      assert.ok(series.some((point) => point.marker === 'INJURY'), 'expected injury marker');
      assert.ok(series.every((point) => point.winRate >= 0 && point.winRate <= 1), 'expected normalized win rate');
    },
  },
  {
    name: 'experience: similar career search returns reasons and sorted scores',
    run: () => {
      const target = buildCareerAnalysisSummary(createAnalysisStatus());
      const similar = buildCareerAnalysisSummary(createAnalysisStatus({ shikona: '類似山' }));
      const distant = buildCareerAnalysisSummary(createAnalysisStatus({
        shikona: '遠隔海',
        bodyType: 'ANKO',
        growthType: 'EARLY',
        age: 25,
        history: {
          ...createAnalysisStatus().history,
          maxRank: { division: 'Jonidan', name: '序二段', number: 60 },
          totalWins: 18,
          totalLosses: 42,
          totalAbsent: 0,
          records: createAnalysisStatus().history.records.slice(0, 4).map((record) => ({
            ...record,
            rank: { division: 'Jonidan', name: '序二段', number: 60 },
            wins: 2,
            losses: 5,
            absent: 0,
            yusho: false,
          })),
        },
      }));
      const results = listSimilarCareers(target, [distant, similar], 2);
      assert.equal(results[0].summary.status.shikona, '類似山');
      assert.ok(results[0].similarity.reasons.length > 0, 'expected similarity reasons');
    },
  },
  {
    name: 'experience: generation summary ranks target inside cohort',
    run: () => {
      const target = buildCareerAnalysisSummary(createAnalysisStatus());
      const peer = buildCareerAnalysisSummary(createAnalysisStatus({ shikona: '同期海' }));
      const generation = buildGenerationSummary(target, [peer, target], '2020');
      assert.equal(generation.cohortSize, 2);
      assert.ok(generation.maxRankStanding !== null, 'expected max rank standing');
      assert.ok(generation.notes.length >= 2, 'expected generation notes');
    },
  },
  {
    name: 'experience: kimarite usage summary computes concentration and rarity',
    run: () => {
      const summary = summarizeKimariteUsage({
        押し出し: 20,
        寄り切り: 10,
        上手投げ: 5,
        つき落とし: 4,
      });
      assert.ok(summary.top1MoveShare > 0.45 && summary.top1MoveShare < 0.55, 'top1 share out of expected range');
      assert.ok(summary.top3MoveShare > 0.8, 'top3 share expected > 0.8');
      assert.ok(summary.officialUniqueCount >= 3, 'official unique count expected >= 3');
    },
  },
  {
    name: 'experience: review board exposes applied rule sequence for diagnostics',
    run: () => {
      const result = reviewBoard([reviewCase]);
      assert.equal(result.decisions.length, 1);
      const decision = result.decisions[0];
      assert.ok((decision.appliedRules?.length ?? 0) >= 1, 'expected applied rules to be recorded');
      assert.ok(decision.reasons.includes('AUDIT_CONSTRAINT_HIT'), 'expected constraint reason');
    },
  },

  {
    name: 'experience: yokozuna promotion exposes decision band and evidence',
    run: () => {
      const result = evaluateYokozunaPromotion({
        id: 'player',
        shikona: '検証山',
        rank: { division: 'Makuuchi', name: '大関', side: 'East' },
        wins: 14,
        losses: 1,
        absent: 0,
        yusho: true,
        junYusho: false,
        pastRecords: [
          {
            rank: { division: 'Makuuchi', name: '大関', side: 'West' },
            wins: 13,
            losses: 2,
            absent: 0,
            yusho: false,
            junYusho: true,
          },
        ],
      });
      assert.equal(result.decisionBand, 'BORDERLINE');
      assert.ok(result.evidence.hasEquivalentPair, 'expected equivalent pair evidence');
      assert.ok(result.evidence.hasYushoPair, 'expected yusho pair evidence');
    },
  },
  {
    name: 'experience: ozeki promotion evaluates formal and quality gates',
    run: () => {
      const result = evaluateSnapshotOzekiPromotion({
        id: 'player',
        shikona: '検証山',
        rank: { division: 'Makuuchi', name: '関脇', side: 'East' },
        wins: 11,
        losses: 4,
        absent: 0,
        yusho: false,
        junYusho: false,
        pastRecords: [
          { rank: { division: 'Makuuchi', name: '関脇', side: 'West' }, wins: 11, losses: 4, absent: 0, yusho: false, junYusho: false },
          { rank: { division: 'Makuuchi', name: '小結', side: 'East' }, wins: 11, losses: 4, absent: 0, yusho: false, junYusho: false },
        ],
      });
      assert.ok(result.passedFormal, 'expected formal criteria pass');
      assert.ok(result.recommended, 'expected recommendation pass');
      assert.ok(result.qualityScore >= 34, 'expected quality score threshold');
    },
  },
  {
    name: 'experience: top-division assignment detail includes reason tags',
    run: () => {
      const detail = resolveTopDivisionAssignedEventDetail(
        { division: 'Makuuchi', name: '関脇', side: 'East' },
        { division: 'Makuuchi', name: '小結', side: 'West' },
      );
      assert.equal(detail.eventCode, 'DEMOTION_TO_KOMUSUBI');
      assert.ok(detail.reasonTags.includes('SANYAKU_SLOT_PRESSURE'), 'expected sanyaku reason tag');
    },
  },
  {
    name: 'experience: kimarite warning channel captures impossible pattern fallback',
    run: () => {
      consumeKimariteSelectionWarnings();
      setActiveKimariteTuningPreset('VARIETY_PLUS');
      const outcome = resolveKimariteOutcome({
        winner: createMinimalCompetitor(),
        loser: createMinimalCompetitor(),
        forcePattern: 'NON_TECHNIQUE',
      });
      const warnings = consumeKimariteSelectionWarnings();
      assert.equal(outcome.isNonTechnique, false);
      assert.ok(warnings.some((item) => item.includes('no candidates')), 'expected fallback warning');
    },
  },
  {
    name: 'experience: oshidashi keeps practical access outside pure thrust battles',
    run: () => {
      const oshidashi = findOfficialKimariteEntry('押し出し');
      if (!oshidashi) throw new Error('押し出し catalog entry not found');

      assert.ok(
        resolveEngagementPatternFit(oshidashi, {
          phase: 'BELT_BATTLE',
          defenderCollapsed: false,
          edgeCrisis: false,
          gripEstablished: true,
          weightDomination: false,
        }) >= 0.42,
        'BELT_BATTLE should still allow practical oshidashi access',
      );
      assert.ok(
        resolveEngagementPatternFit(oshidashi, {
          phase: 'MIXED',
          defenderCollapsed: false,
          edgeCrisis: false,
          gripEstablished: false,
          weightDomination: false,
        }) >= 0.9,
        'MIXED should not over-suppress oshidashi',
      );
      assert.ok(
        resolveEngagementPatternFit(oshidashi, {
          phase: 'EDGE_SCRAMBLE',
          defenderCollapsed: false,
          edgeCrisis: true,
          gripEstablished: false,
          weightDomination: false,
        }) >= 0.55,
        'EDGE_SCRAMBLE should preserve tawara oshidashi endings',
      );

      const beltBias = resolveEngagementRouteBias({
        phase: 'BELT_BATTLE',
        defenderCollapsed: false,
        edgeCrisis: false,
        gripEstablished: true,
        weightDomination: false,
      });
      const edgeBias = resolveEngagementRouteBias({
        phase: 'EDGE_SCRAMBLE',
        defenderCollapsed: false,
        edgeCrisis: true,
        gripEstablished: false,
        weightDomination: false,
      });

      assert.ok((beltBias.PUSH_OUT ?? 0) >= 0.35, 'BELT_BATTLE route bias should not hard-kill PUSH_OUT');
      assert.ok((edgeBias.PUSH_OUT ?? 0) >= 0.75, 'EDGE_SCRAMBLE route bias should allow oshidashi at the tawara');
    },
  },
];

export const experienceTestModule: TestModule = {
  id: 'experience',
  cases,
};
