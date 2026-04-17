import { getRankValueForChart } from "../../../logic/ranking";
import type { CareerTurningPoint, RikishiStatus } from "../../../logic/models";
import { buildRankChartDataFromStatus, formatBashoLabel, formatRankDisplayName } from "./reportShared";

const formatRecordText = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

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

const deltaLabel = (delta: number): string => {
  if (delta === 0) return "±0";
  const abs = Math.abs(delta);
  return `${delta > 0 ? "+" : "-"}${Number.isInteger(abs) ? abs : abs.toFixed(1)}`;
};

const toTurningPointItem = (point: CareerTurningPoint): RankArcStoryItem => ({
  key: `turning-${point.bashoSeq}-${point.kind}`,
  bashoSeq: point.bashoSeq,
  bashoLabel: formatBashoLabel(point.year, point.month),
  title: point.label,
  summary: point.reason,
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

export const buildReportRankArcDigest = (status: RikishiStatus): ReportRankArcDigest => {
  const records = status.history.records;
  const chartPoints = buildRankChartDataFromStatus(status).map((point) => ({
    ...point,
    plotValue: -1 * point.rankValue,
  }));

  const movementRows: RankMovementRow[] = records.map((record, index) => {
    const next = records[index + 1];
    if (!next) {
      return {
        bashoLabel: formatBashoLabel(record.year, record.month),
        rankLabel: formatRankDisplayName(record.rank),
        recordText: formatRecordText(record.wins, record.losses, record.absent),
        nextRankLabel: "最終場所",
        deltaText: "-",
        deltaKind: "last",
      };
    }

    if (record.rank.division === "Maezumo" && next.rank.division !== "Maezumo") {
      return {
        bashoLabel: formatBashoLabel(record.year, record.month),
        rankLabel: formatRankDisplayName(record.rank),
        recordText: formatRecordText(record.wins, record.losses, record.absent),
        nextRankLabel: formatRankDisplayName(next.rank),
        deltaText: "番付掲載",
        deltaKind: "entry",
      };
    }

    const delta = getRankDelta(record, next);
    return {
      bashoLabel: formatBashoLabel(record.year, record.month),
      rankLabel: formatRankDisplayName(record.rank),
      recordText: formatRecordText(record.wins, record.losses, record.absent),
      nextRankLabel: formatRankDisplayName(next.rank),
      deltaText: deltaLabel(delta),
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
          label: "最大上昇",
          value: formatBashoLabel(current.year, current.month),
          detail: `${formatRankDisplayName(current.rank)}から${formatRankDisplayName(next.rank)}へ${deltaLabel(delta)}動いた。`,
        };
      }
      if (Math.abs(delta) > biggestDropDelta && delta < 0) {
        biggestDropDelta = Math.abs(delta);
        biggestDrop = {
          label: "最大下落",
          value: formatBashoLabel(current.year, current.month),
          detail: `${formatRankDisplayName(current.rank)}から${formatRankDisplayName(next.rank)}へ${deltaLabel(delta)}動いた。`,
        };
      }
    }

    if (next && formatRankDisplayName(current.rank) === formatRankDisplayName(next.rank)) {
      stayCount += 1;
    } else {
      if (stayCount > longestStayCount) {
        longestStayCount = stayCount;
        longestStay = {
          label: "停滞の長さ",
          value: `${stayCount}場所`,
          detail: `${formatRankDisplayName(current.rank)}に${stayCount}場所とどまった。`,
        };
      }
      stayCount = 1;
    }
  }

  const storyItems: RankArcStoryItem[] = [
    ...(status.history.careerTurningPoints ?? []).map(toTurningPointItem),
    ...records.flatMap<RankArcStoryItem>((record, index) => {
      const next = records[index + 1];
      if (!next) return [];
      if (record.rank.division === "Maezumo" && next.rank.division !== "Maezumo") {
        return [{
          key: `movement-entry-${index + 1}`,
          bashoSeq: index + 1,
          bashoLabel: formatBashoLabel(record.year, record.month),
          title: "初めて番付に載る",
          summary: `前相撲を${formatRecordText(record.wins, record.losses, record.absent)}で終え、次は${formatRankDisplayName(next.rank)}から番付に載った。`,
          tone: "brand" as const,
        }];
      }
      if (isMaezumoTransition(record, next)) return [];
      const delta = getRankDelta(record, next);
      if (Math.abs(delta) < 6) return [];
      return [{
        key: `movement-${index + 1}`,
        bashoSeq: index + 1,
        bashoLabel: formatBashoLabel(record.year, record.month),
        title: delta > 0 ? "大幅上昇" : "大幅下降",
        summary:
          delta > 0
            ? `${formatRankDisplayName(record.rank)}で${formatRecordText(record.wins, record.losses, record.absent)}を残し、次は${formatRankDisplayName(next.rank)}まで上がった。`
            : `${formatRankDisplayName(record.rank)}で${formatRecordText(record.wins, record.losses, record.absent)}に終わり、次は${formatRankDisplayName(next.rank)}まで落ちた。`,
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
          label: "最高到達点",
          value: formatRankDisplayName(highest.rank),
          detail: `${formatBashoLabel(highest.year, highest.month)}に到達`,
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
