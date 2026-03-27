import type { Rank } from "../../../logic/models";
import type {
  CareerBashoDetail,
  CareerBashoRecordsBySeq,
} from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import { getRankValueForChart } from "../../../logic/ranking";
import { groupNearbyRanks } from "../../careerResult/utils/careerResultModel";
import {
  buildImportantTorikumiDigests,
  formatBashoLabel,
  formatRankDisplayName,
} from "./reportShared";

export interface BanzukeReviewNearbyRow {
  entityId: string;
  shikona: string;
  rankLabel: string;
  recordText: string;
  movementText: string;
  isPlayer: boolean;
}

export interface BanzukeReviewDecisionItem {
  id: string;
  title: string;
  detail: string;
  tone: "empirical" | "override" | "info";
}

export interface BanzukeReviewTabModel {
  bashoLabel: string;
  lane: {
    fromRankLabel: string;
    empiricalBandLabel: string;
    toRankLabel: string;
    proposalBasis: "EMPIRICAL" | "RULE_OVERRIDE" | "UNKNOWN";
  };
  summaryLines: string[];
  nearbyRows: BanzukeReviewNearbyRow[];
  decisionItems: BanzukeReviewDecisionItem[];
  supplementalTorikumi: Array<{
    id: string;
    label: string;
    detail: string;
  }>;
}

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const toRankFromRow = (row: BashoRecordRow): Rank => ({
  division: row.division as Rank["division"],
  name: row.rankName,
  number: row.rankNumber,
  side: row.rankSide,
});

const resolveMovementText = (
  row: BashoRecordRow,
  nextRows: BashoRecordRow[] | undefined,
  playerDecision?: CareerBashoDetail["banzukeDecisions"][number],
): string => {
  const nextRow = nextRows?.find((candidate) => candidate.entityId === row.entityId);
  const currentRank = toRankFromRow(row);
  const nextRank =
    nextRow
      ? toRankFromRow(nextRow)
      : row.entityType === "PLAYER"
        ? playerDecision?.finalRank
        : undefined;

  if (!nextRank) return "判定外";
  const delta = getRankValueForChart(currentRank) - getRankValueForChart(nextRank);
  if (Math.abs(delta) < 0.01) return "据え置き";
  return `${delta > 0 ? "昇" : "降"} -> ${formatRankDisplayName(nextRank)}`;
};

export const buildBanzukeReviewTabModel = ({
  detail,
  bashoRows,
}: {
  detail: CareerBashoDetail | null;
  bashoRows: CareerBashoRecordsBySeq[];
}): BanzukeReviewTabModel | null => {
  if (!detail?.playerRecord) return null;

  const playerDecision = detail.banzukeDecisions.find((log) => log.rikishiId === "PLAYER") ?? detail.banzukeDecisions[0];
  const fromRankLabel = playerDecision
    ? formatRankDisplayName(playerDecision.fromRank)
    : formatRankDisplayName(toRankFromRow(detail.playerRecord));
  const toRankLabel = playerDecision
    ? formatRankDisplayName(playerDecision.finalRank)
    : formatRankDisplayName(toRankFromRow(detail.playerRecord));
  const empiricalBandLabel = [playerDecision?.rankBand, playerDecision?.recordBucket]
    .filter(Boolean)
    .join(" / ") || "実測帯未記録";
  const proposalBasis = playerDecision?.proposalBasis ?? "UNKNOWN";
  const nextRows = bashoRows.find((row) => row.bashoSeq === detail.bashoSeq + 1)?.rows;
  const nearbyRows = groupNearbyRanks(detail.rows, detail.playerRecord, 4).map((row) => ({
    entityId: row.entityId,
    shikona: row.shikona,
    rankLabel: formatRankDisplayName(toRankFromRow(row)),
    recordText: formatRecordText(row.wins, row.losses, row.absent),
    movementText: resolveMovementText(row, nextRows, playerDecision),
    isPlayer: row.entityType === "PLAYER",
  }));
  const summaryLines = [
    `${fromRankLabel}で${formatRecordText(detail.playerRecord.wins, detail.playerRecord.losses, detail.playerRecord.absent)}。${proposalBasis === "RULE_OVERRIDE" ? "制度例外を上書きに含めて" : "実測帯を主軸に"}${toRankLabel}へ判定。`,
    `判定帯: ${empiricalBandLabel}`,
    playerDecision?.overrideNames?.length
      ? `上書き: ${playerDecision.overrideNames.join(" / ")}`
      : detail.diagnostics
        ? `編成監査: 修復 ${Object.values(detail.diagnostics.torikumiRepairHistogram ?? {}).reduce((sum, count) => sum + count, 0)} / 違反 ${detail.diagnostics.torikumiScheduleViolations ?? 0}`
        : "制度上書きなし。",
  ];
  const decisionItems: BanzukeReviewDecisionItem[] = [
    {
      id: "basis",
      title: "判定方式",
      detail:
        proposalBasis === "RULE_OVERRIDE"
          ? "実測帯を起点に、制度例外で最終位を補正した。"
          : proposalBasis === "EMPIRICAL"
            ? "実測帯の提案をそのまま採用した。"
            : "番付審議ログが不足している。",
      tone: proposalBasis === "RULE_OVERRIDE" ? "override" : "empirical",
    },
    ...(playerDecision?.overrideNames?.length
      ? [{
        id: "override",
        title: "制度上書き",
        detail: playerDecision.overrideNames.join(" / "),
        tone: "override" as const,
      }]
      : []),
    ...(playerDecision?.reasons?.length
      ? [{
        id: "reasons",
        title: "判断ログ",
        detail: playerDecision.reasons.join(" / "),
        tone: "info" as const,
      }]
      : []),
    ...(detail.diagnostics
      ? [{
        id: "diagnostics",
        title: "場所監査",
        detail: `修復 ${Object.values(detail.diagnostics.torikumiRepairHistogram ?? {}).reduce((sum, count) => sum + count, 0)} / 越境 ${detail.diagnostics.crossDivisionBoutCount ?? 0} / 直接戦 ${detail.diagnostics.torikumiLateDirectTitleBoutCount ?? 0}`,
        tone: "info" as const,
      }]
      : []),
  ];
  const supplementalTorikumi = buildImportantTorikumiDigests(detail.importantTorikumi)
    .slice(0, 2)
    .map((item) => ({
      id: item.key,
      label: `${item.bashoLabel} ${item.day}日目 / ${item.summary}`,
      detail: item.detailLine,
    }));

  return {
    bashoLabel: formatBashoLabel(detail.year, detail.month),
    lane: {
      fromRankLabel,
      empiricalBandLabel,
      toRankLabel,
      proposalBasis,
    },
    summaryLines,
    nearbyRows,
    decisionItems,
    supplementalTorikumi,
  };
};
