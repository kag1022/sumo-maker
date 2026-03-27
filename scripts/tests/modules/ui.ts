import { TestCase, TestModule } from "../types";
import { buildLiveBashoView, resolveBashoStakeLabel } from "../../../src/features/bashoHub/utils/liveBashoView";
import { buildBanzukeReviewTabModel } from "../../../src/features/report/utils/banzukeReview";
import type { CareerBashoDetail, CareerBashoRecordsBySeq } from "../../../src/logic/persistence/careerHistory";

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

const createDetail = (): { detail: CareerBashoDetail; bashoRows: CareerBashoRecordsBySeq[] } => ({
  detail: {
    bashoSeq: 1,
    year: 2026,
    month: 3,
    playerRecord: {
      careerId: "career-1",
      seq: 1,
      entityId: "PLAYER",
      entityType: "PLAYER",
      year: 2026,
      month: 3,
      shikona: "検証山",
      division: "Makushita",
      rankName: "幕下",
      rankNumber: 4,
      rankSide: "East",
      wins: 6,
      losses: 1,
      absent: 0,
      titles: [],
    },
    rows: [
      {
        careerId: "career-1",
        seq: 1,
        entityId: "npc-1",
        entityType: "NPC",
        year: 2026,
        month: 3,
        shikona: "相手海",
        division: "Makushita",
        rankName: "幕下",
        rankNumber: 3,
        rankSide: "West",
        wins: 4,
        losses: 3,
        absent: 0,
        titles: [],
      },
      {
        careerId: "career-1",
        seq: 1,
        entityId: "PLAYER",
        entityType: "PLAYER",
        year: 2026,
        month: 3,
        shikona: "検証山",
        division: "Makushita",
        rankName: "幕下",
        rankNumber: 4,
        rankSide: "East",
        wins: 6,
        losses: 1,
        absent: 0,
        titles: [],
      },
      {
        careerId: "career-1",
        seq: 1,
        entityId: "npc-2",
        entityType: "NPC",
        year: 2026,
        month: 3,
        shikona: "境界富士",
        division: "Makushita",
        rankName: "幕下",
        rankNumber: 5,
        rankSide: "East",
        wins: 3,
        losses: 4,
        absent: 0,
        titles: [],
      },
    ],
    bouts: [],
    importantTorikumi: [],
    banzukeDecisions: [
      {
        seq: 1,
        rikishiId: "PLAYER",
        fromRank: { division: "Makushita", name: "幕下", number: 4, side: "East" },
        proposedRank: { division: "Juryo", name: "十両", number: 13, side: "West" },
        finalRank: { division: "Juryo", name: "十両", number: 13, side: "West" },
        reasons: ["REVIEW_ACCEPTED"],
        constraintHits: [],
        proposalBasis: "EMPIRICAL",
        recordBucket: "6-1-0",
        rankBand: "MS_TOP_5",
        overrideNames: [],
      },
    ],
    diagnostics: {
      seq: 1,
      year: 2026,
        month: 3,
        rank: { division: "Makushita", name: "幕下", number: 4, side: "East" },
        wins: 6,
        losses: 1,
        absent: 0,
        expectedWins: 4,
        strengthOfSchedule: 0,
        performanceOverExpected: 2,
        promoted: true,
        demoted: false,
        simulationModelVersion: "v3",
        torikumiRepairHistogram: { "1": 2 },
        torikumiScheduleViolations: 0,
        crossDivisionBoutCount: 1,
        torikumiLateDirectTitleBoutCount: 0,
      },
  },
  bashoRows: [
    {
      bashoSeq: 1,
      year: 2026,
      month: 3,
      rows: [],
    },
    {
      bashoSeq: 2,
      year: 2026,
      month: 5,
      rows: [
        {
          careerId: "career-1",
          seq: 2,
          entityId: "PLAYER",
          entityType: "PLAYER",
          year: 2026,
          month: 5,
          shikona: "検証山",
          division: "Juryo",
          rankName: "十両",
          rankNumber: 13,
          rankSide: "West",
          wins: 0,
          losses: 0,
          absent: 0,
          titles: [],
        },
      ],
    },
  ],
});

const cases: TestCase[] = [
  {
    name: "experience: basho stake labels translate scheduler codes into UI copy",
    run: () => {
      assert.equal(resolveBashoStakeLabel("YUSHO_DIRECT"), "優勝直接戦");
      assert.equal(resolveBashoStakeLabel("JURYO_BOUNDARY"), "十両・幕下入れ替え戦");
    },
  },
  {
    name: "experience: live basho view prefers featured stakes over generic bouts",
    run: () => {
      const view = buildLiveBashoView({
        seq: 12,
        year: 2026,
        month: 5,
        playerRecord: {
          year: 2026,
          month: 5,
          rank: { division: "Juryo", name: "十両", number: 13, side: "West" },
          wins: 9,
          losses: 6,
          absent: 0,
          yusho: false,
          specialPrizes: [],
        },
        playerBouts: [
          {
            day: 13,
            result: "WIN",
            opponentId: "npc-1",
            opponentShikona: "相手海",
            opponentRankName: "幕下",
            opponentRankNumber: 1,
            opponentRankSide: "East",
          },
        ],
        importantTorikumiNotes: [
          {
            day: 13,
            year: 2026,
            month: 5,
            opponentId: "npc-1",
            opponentShikona: "相手海",
            opponentRank: { division: "Makushita", name: "幕下", number: 1, side: "East" },
            trigger: "JURYO_BOUNDARY",
            summary: "十両昇降の直接評価として組まれた。",
            matchReason: "JURYO_MAKUSHITA_EXCHANGE",
            relaxationStage: 0,
            phaseId: "LATE",
            contentionTier: "Contender",
            titleImplication: "NONE",
            boundaryImplication: "PROMOTION",
          },
        ],
      });
      assert.equal(view.featuredBout?.kindLabel, "十両・幕下入れ替え戦");
      assert.equal(view.boundaryImplication, "PROMOTION");
    },
  },
  {
    name: "experience: banzuke review model summarizes empirical decision and nearby movement",
    run: () => {
      const { detail, bashoRows } = createDetail();
      const model = buildBanzukeReviewTabModel({ detail, bashoRows });
      assert.ok(model, "expected review model");
      assert.equal(model?.lane.toRankLabel, "西十両13枚目");
      assert.ok(model?.summaryLines[0].includes("実測帯"), "expected empirical summary");
      assert.ok(model?.nearbyRows.some((row) => row.isPlayer && row.movementText.includes("西十両13枚目")), "expected player movement");
    },
  },
];

export const uiTestModule: TestModule = {
  id: "ui",
  cases,
};
