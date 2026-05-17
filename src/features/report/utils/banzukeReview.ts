import type { Rank } from "../../../logic/models";
import type {
  CareerBashoDetail,
  CareerBashoRecordsBySeq,
} from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import { getRankValueForChart } from "../../../logic/ranking";
import type { LocaleCode } from "../../../shared/lib/locale";
import type {
  BanzukeReviewDecisionItem,
  BanzukeReviewTabModel,
} from "../../shared/models/banzukeReview";
import { groupNearbyRanks } from "../../shared/utils/banzukeRows";
import { buildImportantTorikumiDigests } from "./reportShared";
import {
  formatReportBashoLabel,
  formatReportRankLabel,
  formatReportRecordText,
} from "./reportLocale";

const toRankFromRow = (row: BashoRecordRow): Rank => ({
  division: row.division as Rank["division"],
  name: row.rankName,
  number: row.rankNumber,
  side: row.rankSide,
  specialStatus: row.rankSpecialStatus,
});

const resolveMovementText = (
  row: BashoRecordRow,
  nextRows: BashoRecordRow[] | undefined,
  playerDecision?: CareerBashoDetail["banzukeDecisions"][number],
  locale: LocaleCode = "ja",
): string => {
  const nextRow = nextRows?.find((candidate) => candidate.entityId === row.entityId);
  const currentRank = toRankFromRow(row);
  const nextRank =
    nextRow
      ? toRankFromRow(nextRow)
      : row.entityType === "PLAYER"
        ? playerDecision?.finalRank
        : undefined;

  if (!nextRank) return locale === "en" ? "No decision" : "判定外";
  const delta = getRankValueForChart(currentRank) - getRankValueForChart(nextRank);
  if (Math.abs(delta) < 0.01) return locale === "en" ? "Held" : "据え置き";
  return `${delta > 0 ? (locale === "en" ? "Up" : "昇") : (locale === "en" ? "Down" : "降")} -> ${formatReportRankLabel(nextRank, locale)}`;
};

export const buildBanzukeReviewTabModel = ({
  detail,
  bashoRows,
  locale = "ja",
}: {
  detail: CareerBashoDetail | null;
  bashoRows: CareerBashoRecordsBySeq[];
  locale?: LocaleCode;
}): BanzukeReviewTabModel | null => {
  if (!detail?.playerRecord) return null;

  const playerDecision = detail.banzukeDecisions.find((log) => log.rikishiId === "PLAYER") ?? detail.banzukeDecisions[0];
  const fromRankLabel = playerDecision
    ? formatReportRankLabel(playerDecision.fromRank, locale)
    : formatReportRankLabel(toRankFromRow(detail.playerRecord), locale);
  const toRankLabel = playerDecision
    ? formatReportRankLabel(playerDecision.finalRank, locale)
    : formatReportRankLabel(toRankFromRow(detail.playerRecord), locale);
  const empiricalBandLabel = [playerDecision?.rankBand, playerDecision?.recordBucket]
    .filter(Boolean)
    .join(" / ") || (locale === "en" ? "No empirical band" : "実測帯未記録");
  const proposalBasis = playerDecision?.proposalBasis ?? "UNKNOWN";
  const nextRows = bashoRows.find((row) => row.bashoSeq === detail.bashoSeq + 1)?.rows;
  const nearbyRows = groupNearbyRanks(detail.rows, detail.playerRecord, 4).map((row) => ({
    entityId: row.entityId,
    shikona: row.shikona,
    rankLabel: formatReportRankLabel(toRankFromRow(row), locale),
    recordText: formatReportRecordText(row.wins, row.losses, row.absent, locale),
    movementText: resolveMovementText(row, nextRows, playerDecision, locale),
    isPlayer: row.entityType === "PLAYER",
  }));
  const summaryLines = [
    locale === "en"
      ? `${fromRankLabel} with ${formatReportRecordText(detail.playerRecord.wins, detail.playerRecord.losses, detail.playerRecord.absent, locale)} was reviewed toward ${toRankLabel}.`
      : `${fromRankLabel}で${formatReportRecordText(detail.playerRecord.wins, detail.playerRecord.losses, detail.playerRecord.absent, locale)}。${proposalBasis === "RULE_OVERRIDE" ? "制度例外を上書きに含めて" : "実測帯を主軸に"}${toRankLabel}へ判定。`,
    locale === "en" ? `Decision band: ${empiricalBandLabel}` : `判定帯: ${empiricalBandLabel}`,
    playerDecision?.overrideNames?.length
      ? locale === "en" ? "Rule override was applied." : `上書き: ${playerDecision.overrideNames.join(" / ")}`
      : detail.diagnostics
        ? locale === "en"
          ? `Schedule audit: repairs ${Object.values(detail.diagnostics.torikumiRepairHistogram ?? {}).reduce((sum, count) => sum + count, 0)} / violations ${detail.diagnostics.torikumiScheduleViolations ?? 0}`
          : `編成監査: 修復 ${Object.values(detail.diagnostics.torikumiRepairHistogram ?? {}).reduce((sum, count) => sum + count, 0)} / 違反 ${detail.diagnostics.torikumiScheduleViolations ?? 0}`
        : locale === "en" ? "No rule override." : "制度上書きなし。",
  ];
  const decisionItems: BanzukeReviewDecisionItem[] = [
    {
      id: "basis",
      title: locale === "en" ? "Decision Basis" : "判定方式",
      detail:
        proposalBasis === "RULE_OVERRIDE"
          ? locale === "en" ? "The final rank was adjusted by a rule override." : "実測帯を起点に、制度例外で最終位を補正した。"
          : proposalBasis === "EMPIRICAL"
            ? locale === "en" ? "The empirical proposal was accepted." : "実測帯の提案をそのまま採用した。"
            : locale === "en" ? "The saved banzuke log is incomplete." : "番付審議ログが不足している。",
      tone: proposalBasis === "RULE_OVERRIDE" ? "override" : "empirical",
    },
    ...(playerDecision?.overrideNames?.length
      ? [{
        id: "override",
        title: locale === "en" ? "Rule Override" : "制度上書き",
        detail: locale === "en" ? "One or more rule overrides affected the final rank." : playerDecision.overrideNames.join(" / "),
        tone: "override" as const,
      }]
      : []),
    ...(playerDecision?.reasons?.length
      ? [{
        id: "reasons",
        title: locale === "en" ? "Reason Log" : "判断ログ",
        detail: locale === "en" ? playerDecision.reasons.join(" / ") : playerDecision.reasons.join(" / "),
        tone: "info" as const,
      }]
      : []),
    ...(detail.diagnostics
      ? [{
        id: "diagnostics",
        title: locale === "en" ? "Basho Audit" : "場所監査",
        detail: locale === "en"
          ? `Repairs ${Object.values(detail.diagnostics.torikumiRepairHistogram ?? {}).reduce((sum, count) => sum + count, 0)} / cross-division ${detail.diagnostics.crossDivisionBoutCount ?? 0} / direct title bouts ${detail.diagnostics.torikumiLateDirectTitleBoutCount ?? 0}`
          : `修復 ${Object.values(detail.diagnostics.torikumiRepairHistogram ?? {}).reduce((sum, count) => sum + count, 0)} / 越境 ${detail.diagnostics.crossDivisionBoutCount ?? 0} / 直接戦 ${detail.diagnostics.torikumiLateDirectTitleBoutCount ?? 0}`,
        tone: "info" as const,
      }]
      : []),
  ];
  const supplementalTorikumi = buildImportantTorikumiDigests(detail.importantTorikumi)
    .slice(0, 2)
    .map((item) => ({
      id: item.key,
      label: locale === "en"
        ? `${formatReportBashoLabel(item.year, item.month, locale)} day ${item.day} / supplemental bout`
        : `${item.bashoLabel} ${item.day}日目 / ${item.summary}`,
      detail: locale === "en" ? "This bout was saved as a notable scheduling decision." : item.detailLine,
    }));

  return {
    bashoLabel: formatReportBashoLabel(detail.year, detail.month, locale),
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
