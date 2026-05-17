import { formatRankMovementDisplay, getRankValueForChart } from "../../../logic/ranking";
import type { CareerTurningPoint, RikishiStatus } from "../../../logic/models";
import type { LocaleCode } from "../../../shared/lib/locale";
import { buildRankChartDataFromStatus } from "./reportShared";
import {
  formatReportBashoCount,
  formatReportBashoLabel,
  formatReportHighestRankLabel,
  formatReportRankLabel,
  formatReportRankMovement,
  formatReportRecordText,
} from "./reportLocale";

export interface RankArcSummaryCard {
  label: string;
  value: string;
  detail: string;
}

export interface RankArcStoryItem {
  key: string;
  bashoSeq: number;
  bashoLabel: string;
  title: string;
  summary: string;
  tone: "brand" | "state" | "warning";
}

export interface RankMovementRow {
  bashoLabel: string;
  rankLabel: string;
  recordText: string;
  nextRankLabel: string;
  deltaText: string;
  deltaKind: "up" | "down" | "stay" | "last" | "entry";
}

export interface ReportRankArcDigest {
  chartPoints: Array<ReturnType<typeof buildRankChartDataFromStatus>[number] & { plotValue: number }>;
  summaryCards: RankArcSummaryCard[];
  storyItems: RankArcStoryItem[];
  movementRows: RankMovementRow[];
}

const TURNING_POINT_EN_LABELS: Record<CareerTurningPoint["kind"], string> = {
  FIRST_SEKITORI: "First Sekitori",
  MAKUUCHI_PROMOTION: "Makuuchi Promotion",
  YUSHO: "Yusho",
  MAJOR_INJURY: "Major Absence",
  JURYO_DROP: "Juryo Drop",
  SLUMP_RECOVERY: "Recovery",
  RETIREMENT: "Retirement",
};

const toTurningPointItem = (point: CareerTurningPoint, locale: LocaleCode): RankArcStoryItem => ({
  key: `turning-${point.bashoSeq}-${point.kind}`,
  bashoSeq: point.bashoSeq,
  bashoLabel: formatReportBashoLabel(point.year, point.month, locale),
  title: locale === "en" ? TURNING_POINT_EN_LABELS[point.kind] : point.label,
  summary: locale === "en" ? "This basho is recorded as a turning point in the saved career." : point.reason,
  tone:
    point.kind === "MAJOR_INJURY" || point.kind === "JURYO_DROP" || point.kind === "RETIREMENT"
      ? "warning"
      : point.kind === "YUSHO" || point.kind === "FIRST_SEKITORI" || point.kind === "MAKUUCHI_PROMOTION"
        ? "state"
        : "brand",
});

const isMaezumoTransition = (from: RikishiStatus["history"]["records"][number], to: RikishiStatus["history"]["records"][number]): boolean =>
  from.rank.division === "Maezumo" || to.rank.division === "Maezumo";

const getRankDelta = (from: RikishiStatus["history"]["records"][number], to: RikishiStatus["history"]["records"][number]): number =>
  (getRankValueForChart(from.rank) - getRankValueForChart(to.rank)) / 2;

export const buildReportRankArcDigest = (
  status: RikishiStatus,
  locale: LocaleCode = "ja",
): ReportRankArcDigest => {
  const records = status.history.records;
  const displayRecords = records.filter((record) => record.rank.division !== "Maezumo");
  const chartPoints = buildRankChartDataFromStatus(status).map((point, index) => {
    const record = displayRecords[index];
    return {
      ...point,
      bashoLabel: record ? formatReportBashoLabel(record.year, record.month, locale) : point.bashoLabel,
      rankLabel: record ? formatReportRankLabel(record.rank, locale) : point.rankLabel,
      highestRankLabel: record ? formatReportHighestRankLabel(record.rank, locale) : point.highestRankLabel,
      plotValue: -1 * point.rankValue,
    };
  });

  const movementRows: RankMovementRow[] = records.map((record, index) => {
    const next = records[index + 1];
    if (!next) {
      return {
        bashoLabel: formatReportBashoLabel(record.year, record.month, locale),
        rankLabel: formatReportRankLabel(record.rank, locale),
        recordText: formatReportRecordText(record.wins, record.losses, record.absent, locale),
        nextRankLabel: locale === "en" ? "Final basho" : "最終場所",
        deltaText: "-",
        deltaKind: "last",
      };
    }

    if (record.rank.division === "Maezumo" && next.rank.division !== "Maezumo") {
      return {
        bashoLabel: formatReportBashoLabel(record.year, record.month, locale),
        rankLabel: formatReportRankLabel(record.rank, locale),
        recordText: formatReportRecordText(record.wins, record.losses, record.absent, locale),
        nextRankLabel: formatReportRankLabel(next.rank, locale),
        deltaText: locale === "en" ? "Entered banzuke" : "番付掲載",
        deltaKind: "entry",
      };
    }

    const delta = getRankDelta(record, next);
    return {
      bashoLabel: formatReportBashoLabel(record.year, record.month, locale),
      rankLabel: formatReportRankLabel(record.rank, locale),
      recordText: formatReportRecordText(record.wins, record.losses, record.absent, locale),
      nextRankLabel: formatReportRankLabel(next.rank, locale),
      deltaText: formatReportRankMovement(record.rank, next.rank, delta, locale),
      deltaKind: delta > 0 ? "up" : delta < 0 ? "down" : "stay",
    };
  });

  const rankedRecords = records.filter((record) => record.rank.division !== "Maezumo");
  const highest = rankedRecords.length > 0
    ? rankedRecords.reduce((best, record) =>
      getRankValueForChart(record.rank) < getRankValueForChart(best.rank) ? record : best,
    )
    : records[0];

  let biggestRise: RankArcSummaryCard | null = null;
  let biggestDrop: RankArcSummaryCard | null = null;
  let longestStay: RankArcSummaryCard | null = null;
  let biggestRiseDelta = 0;
  let biggestDropDelta = 0;
  let longestStayCount = 0;
  let stayCount = 1;

  for (let index = 0; index < records.length; index += 1) {
    const current = records[index];
    const next = records[index + 1];
    if (next) {
      if (isMaezumoTransition(current, next)) {
        continue;
      }
      const delta = getRankDelta(current, next);
      if (delta > biggestRiseDelta) {
        biggestRiseDelta = delta;
        biggestRise = {
          label: locale === "en" ? "Biggest Rise" : "最大上昇",
          value: formatReportBashoLabel(current.year, current.month, locale),
          detail: locale === "en"
            ? `${formatReportRankLabel(current.rank, locale)} to ${formatReportRankLabel(next.rank, locale)}: ${formatReportRankMovement(current.rank, next.rank, delta, locale)}.`
            : `${formatReportRankLabel(current.rank, locale)}から${formatReportRankLabel(next.rank, locale)}へ${formatRankMovementDisplay(current.rank, next.rank, delta)}。`,
        };
      }
      if (Math.abs(delta) > biggestDropDelta && delta < 0) {
        biggestDropDelta = Math.abs(delta);
        biggestDrop = {
          label: locale === "en" ? "Biggest Drop" : "最大下落",
          value: formatReportBashoLabel(current.year, current.month, locale),
          detail: locale === "en"
            ? `${formatReportRankLabel(current.rank, locale)} to ${formatReportRankLabel(next.rank, locale)}: ${formatReportRankMovement(current.rank, next.rank, delta, locale)}.`
            : `${formatReportRankLabel(current.rank, locale)}から${formatReportRankLabel(next.rank, locale)}へ${formatRankMovementDisplay(current.rank, next.rank, delta)}。`,
        };
      }
    }

    if (next && formatReportRankLabel(current.rank, locale) === formatReportRankLabel(next.rank, locale)) {
      stayCount += 1;
    } else {
      if (stayCount > longestStayCount) {
        longestStayCount = stayCount;
        longestStay = {
          label: locale === "en" ? "Longest Plateau" : "停滞の長さ",
          value: formatReportBashoCount(stayCount, locale),
          detail: locale === "en"
            ? `${formatReportRankLabel(current.rank, locale)} held for ${formatReportBashoCount(stayCount, locale)}.`
            : `${formatReportRankLabel(current.rank, locale)}に${stayCount}場所とどまった。`,
        };
      }
      stayCount = 1;
    }
  }

  const storyItems: RankArcStoryItem[] = [
    ...(status.history.careerTurningPoints ?? []).map((point) => toTurningPointItem(point, locale)),
    ...records.flatMap<RankArcStoryItem>((record, index) => {
      const next = records[index + 1];
      if (!next) return [];
      if (record.rank.division === "Maezumo" && next.rank.division !== "Maezumo") {
        return [{
          key: `movement-entry-${index + 1}`,
          bashoSeq: index + 1,
          bashoLabel: formatReportBashoLabel(record.year, record.month, locale),
          title: locale === "en" ? "First Banzuke Entry" : "初めて番付に載る",
          summary: locale === "en"
            ? `Finished maezumo at ${formatReportRecordText(record.wins, record.losses, record.absent, locale)} and entered at ${formatReportRankLabel(next.rank, locale)}.`
            : `前相撲を${formatReportRecordText(record.wins, record.losses, record.absent, locale)}で終え、次は${formatReportRankLabel(next.rank, locale)}から番付に載った。`,
          tone: "brand" as const,
        }];
      }
      if (isMaezumoTransition(record, next)) return [];
      const delta = getRankDelta(record, next);
      if (Math.abs(delta) < 6) return [];
      return [{
        key: `movement-${index + 1}`,
        bashoSeq: index + 1,
        bashoLabel: formatReportBashoLabel(record.year, record.month, locale),
        title: locale === "en" ? (delta > 0 ? "Major Rise" : "Major Drop") : delta > 0 ? "大幅上昇" : "大幅下降",
        summary:
          locale === "en"
            ? `${formatReportRankLabel(record.rank, locale)} with ${formatReportRecordText(record.wins, record.losses, record.absent, locale)} led to ${formatReportRankLabel(next.rank, locale)}.`
            : delta > 0
              ? `${formatReportRankLabel(record.rank, locale)}で${formatReportRecordText(record.wins, record.losses, record.absent, locale)}を残し、次は${formatReportRankLabel(next.rank, locale)}まで上がった。`
              : `${formatReportRankLabel(record.rank, locale)}で${formatReportRecordText(record.wins, record.losses, record.absent, locale)}に終わり、次は${formatReportRankLabel(next.rank, locale)}まで落ちた。`,
        tone: delta > 0 ? "state" as const : "warning" as const,
      }];
    }) as RankArcStoryItem[],
  ]
    .sort((left, right) => right.bashoSeq - left.bashoSeq)
    .filter((item, index, array) => array.findIndex((candidate) => candidate.key === item.key) === index)
    .slice(0, 8);

  return {
    chartPoints,
    summaryCards: [
      highest
        ? {
          label: locale === "en" ? "Peak Rank" : "最高到達点",
          value: formatReportHighestRankLabel(highest.rank, locale),
          detail: locale === "en"
            ? `Reached in ${formatReportBashoLabel(highest.year, highest.month, locale)}`
            : `${formatReportBashoLabel(highest.year, highest.month, locale)}に到達`,
        }
        : null,
      biggestRise,
      biggestDrop,
      longestStay,
    ].filter(Boolean) as RankArcSummaryCard[],
    storyItems,
    movementRows: movementRows.reverse(),
  };
};
