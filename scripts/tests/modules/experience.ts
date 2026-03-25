import { TestCase, TestModule } from '../types';
import {
  consumeKimariteSelectionWarnings,
  resolveKimariteOutcome,
  setActiveKimariteTuningPreset,
  summarizeKimariteUsage,
} from '../../../src/logic/kimarite/selection';
import { reviewBoard } from '../../../src/logic/banzuke/committee/reviewBoard';
import {
  evaluateYokozunaPromotion,
} from '../../../src/logic/banzuke/rules/yokozunaPromotion';
import { evaluateSnapshotOzekiPromotion } from '../../../src/logic/banzuke/rules/sanyakuPromotion';
import { resolveTopDivisionAssignedEventDetail } from '../../../src/logic/banzuke/rules/topDivisionRules';
import { BanzukeCommitteeCase } from '../../../src/logic/banzuke/types';

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

const cases: TestCase[] = [
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
      assert.equal(result.decisionBand, 'AUTO_PROMOTE');
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
];

export const experienceTestModule: TestModule = {
  id: 'experience',
  cases,
};
