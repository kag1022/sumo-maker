import type { BashoRecordRow } from "../../../logic/persistence/db";
import { Division, Rank, RikishiStatus } from "../../../logic/models";
import { getRankValueForChart } from "../../../logic/ranking";
import { formatBashoLabel, formatRankDisplayName } from "../../report/utils/reportShared";

export interface CareerRankFlowPoint {
  bashoSeq: number;
  bashoLabel: string;
  axisLabel: string;
  rankValue: number;
  rankLabel: string;
  recordLabel: string;
  performanceLabel: string;
  marker: string;
  delta: number;
  contextLabel: string;
  year: number;
  month: number;
  rank: Rank;
  movementType: MovementType;
  movementMagnitude: number;
  eventFlags: Array<"yusho" | "sansho" | "absent">;
}

export interface CareerWindowState {
  visibleWindowStartSeq: number;
  visibleWindowEndSeq: number;
}

export type MovementType = "rise" | "flat" | "fall" | "absence";

export const getCareerValueForFlow = (status: RikishiStatus): CareerRankFlowPoint[] => {
  const records = status.history.records
    .filter((record) => record.rank.division !== "Maezumo")
    .map((record, index) => ({ ...record, bashoSeq: index + 1 }));

  return records.map((record, index) => {
    const prev = records[index - 1];
    const next = records[index + 1];
    const currentValue = getRankValueForChart(record.rank);
    const nextValue = next ? getRankValueForChart(next.rank) : currentValue;
    const delta = Math.round((currentValue - nextValue) * 10) / 10;
    const marker = record.yusho
      ? "優"
      : (record.specialPrizes?.length ?? 0) > 0
        ? "賞"
        : record.absent > 0
          ? "休"
          : "";
    const movementType: MovementType =
      record.absent >= 3
        ? "absence"
        : delta > 0.4
          ? "rise"
          : delta < -0.4
            ? "fall"
            : "flat";
    const contextLabel = prev
      ? `${formatRankDisplayName(prev.rank)} -> ${formatRankDisplayName(record.rank)}`
      : "";
    return {
      bashoSeq: record.bashoSeq,
      bashoLabel: formatBashoLabel(record.year, record.month),
      axisLabel: index % 3 === 0 || index === records.length - 1 ? `${record.year}.${String(record.month).padStart(2, "0")}` : "",
      rankValue: currentValue,
      rankLabel: formatRankDisplayName(record.rank),
      recordLabel: `${record.wins}勝${record.losses}敗${record.absent > 0 ? `${record.absent}休` : ""}`,
      performanceLabel: `${record.performanceOverExpected?.toFixed(1) ?? "0.0"}`,
      marker,
      delta,
      contextLabel,
      year: record.year,
      month: record.month,
      rank: record.rank,
      movementType,
      movementMagnitude: Math.min(6, Math.max(Math.abs(delta), record.absent > 0 ? record.absent / 2 : 0)),
      eventFlags: [
        ...(record.yusho ? (["yusho"] as const) : []),
        ...((record.specialPrizes?.length ?? 0) > 0 ? (["sansho"] as const) : []),
        ...(record.absent > 0 ? (["absent"] as const) : []),
      ],
    };
  });
};

export const buildCareerYearBands = (flow: CareerRankFlowPoint[]) => {
  const grouped = new Map<number, CareerRankFlowPoint[]>();
  for (const point of flow) {
    const current = grouped.get(point.year) ?? [];
    current.push(point);
    grouped.set(point.year, current);
  }

  return [...grouped.entries()].map(([year, points]) => ({
    year,
    startSeq: points[0].bashoSeq,
    endSeq: points[points.length - 1].bashoSeq,
    label: String(year),
    size: points.length,
  }));
};

const rankValueFromRow = (row: BashoRecordRow): number =>
  getRankValueForChart({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
  });

export const groupNearbyRanks = (
  rows: BashoRecordRow[],
  playerRow: BashoRecordRow,
  range: number,
): BashoRecordRow[] => {
  const sorted = rows
    .filter((row) => row.division === playerRow.division)
    .slice()
    .sort((left, right) => rankValueFromRow(left) - rankValueFromRow(right));
  const playerIndex = sorted.findIndex((row) => row.entityType === "PLAYER");
  if (playerIndex < 0) return sorted.slice(0, Math.min(sorted.length, range * 2 + 1));
  return sorted.slice(Math.max(0, playerIndex - range), Math.min(sorted.length, playerIndex + range + 1));
};
