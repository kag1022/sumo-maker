import type { BashoRecord } from "../../../logic/models";
import { Division, Rank, RikishiStatus } from "../../../logic/models";
import type { CareerBashoDetail, CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import { resolveStableById } from "../../../logic/simulation/heya/stableCatalog";
import { getRankValueForChart } from "../../../logic/ranking";
import { formatBashoLabel, formatRankDisplayName } from "../../report/utils/reportShared";

export interface CareerWindowState {
  visibleWindowStartSeq: number;
  visibleWindowEndSeq: number;
}

export type CareerChapterId = "encyclopedia" | "trajectory" | "place";
export type CareerPlaceTabId = "nearby" | "full" | "bouts";
export type CareerLedgerBandKey =
  | "YOKOZUNA"
  | "OZEKI"
  | "SEKIWAKE"
  | "KOMUSUBI"
  | "MAEGASHIRA"
  | "JURYO"
  | "MAKUSHITA"
  | "SANDANME"
  | "JONIDAN"
  | "JONOKUCHI";

export interface CareerLedgerPoint {
  bashoSeq: number;
  bashoLabel: string;
  axisLabel: string;
  year: number;
  month: number;
  rank: Rank;
  rankLabel: string;
  rankShortLabel: string;
  bandKey: CareerLedgerBandKey;
  ordinalBucket: number;
  recordLabel: string;
  recordCompactLabel: string;
  wins: number;
  losses: number;
  absent: number;
  isFullAbsence: boolean;
  eventFlags: Array<"yusho" | "sansho" | "absent">;
  milestoneTags: string[];
  yearBandId: string;
  continuityGroupId: string;
  deltaValue: number;
  deltaLabel: string;
}

export interface CareerYearBand {
  year: number;
  startSeq: number;
  endSeq: number;
  label: string;
  size: number;
}

export interface CareerLedgerModel {
  points: CareerLedgerPoint[];
  yearBands: CareerYearBand[];
}

export interface CareerOverviewModel {
  shikona: string;
  birthplace: string;
  stableName: string;
  totalRecordLabel: string;
  winRateLabel: string;
  careerPeriodLabel: string;
  lifeSummary: string;
  bodyType: RikishiStatus["bodyType"];
}

export interface CareerPlaceSummaryModel {
  bashoLabel: string;
  rankLabel: string;
  recordLabel: string;
  deltaLabel: string;
  milestoneTags: string[];
}

const SANYAKU_NAMES = new Set(["関脇", "小結"]);

const BAND_DEFINITIONS: Array<{ key: CareerLedgerBandKey; label: string; weight: number }> = [
  { key: "YOKOZUNA", label: "横綱", weight: 0.75 },
  { key: "OZEKI", label: "大関", weight: 0.82 },
  { key: "SEKIWAKE", label: "関脇", weight: 0.9 },
  { key: "KOMUSUBI", label: "小結", weight: 0.95 },
  { key: "MAEGASHIRA", label: "前頭", weight: 1.35 },
  { key: "JURYO", label: "十両", weight: 0.9 },
  { key: "MAKUSHITA", label: "幕下", weight: 1.2 },
  { key: "SANDANME", label: "三段目", weight: 1.18 },
  { key: "JONIDAN", label: "序二段", weight: 1.12 },
  { key: "JONOKUCHI", label: "序ノ口", weight: 1.05 },
];

export const CAREER_LEDGER_BANDS = BAND_DEFINITIONS;

const toBandKey = (rank: Rank): CareerLedgerBandKey => {
  if (rank.name === "横綱") return "YOKOZUNA";
  if (rank.name === "大関") return "OZEKI";
  if (rank.name === "関脇") return "SEKIWAKE";
  if (rank.name === "小結") return "KOMUSUBI";
  if (rank.division === "Makuuchi") return "MAEGASHIRA";
  if (rank.division === "Juryo") return "JURYO";
  if (rank.division === "Makushita") return "MAKUSHITA";
  if (rank.division === "Sandanme") return "SANDANME";
  if (rank.division === "Jonidan") return "JONIDAN";
  return "JONOKUCHI";
};

const toOrdinalBucket = (bandKey: CareerLedgerBandKey): number =>
  BAND_DEFINITIONS.findIndex((band) => band.key === bandKey);

const formatCompactRecord = (record: Pick<BashoRecord, "wins" | "losses" | "absent">): string => {
  if (record.absent >= 15 && record.wins === 0 && record.losses === 0) return "全休";
  if (record.absent > 0) return `${record.wins}-${record.losses}-${record.absent}`;
  return `${record.wins}-${record.losses}`;
};

const formatFullRecord = (record: Pick<BashoRecord, "wins" | "losses" | "absent">): string =>
  `${record.wins}勝${record.losses}敗${record.absent > 0 ? `${record.absent}休` : ""}`;

const toShortRankLabel = (rank: Rank): string => {
  if (rank.name === "横綱" || rank.name === "大関" || rank.name === "関脇" || rank.name === "小結") {
    return rank.name;
  }
  if (rank.division === "Makuuchi") return `前${rank.number ?? ""}`;
  if (rank.division === "Juryo") return `十${rank.number ?? ""}`;
  if (rank.division === "Makushita") return `幕${rank.number ?? ""}`;
  if (rank.division === "Sandanme") return `三${rank.number ?? ""}`;
  if (rank.division === "Jonidan") return `二${rank.number ?? ""}`;
  return `口${rank.number ?? ""}`;
};

const resolveMilestoneTags = (
  record: BashoRecord & { bashoSeq: number },
  prev: BashoRecord | undefined,
  lastSeq: number,
  hasSeenJuryo: boolean,
  hasSeenMakuuchi: boolean,
  hasSeenSanyaku: boolean,
  hasSeenOzeki: boolean,
): string[] => {
  const tags: string[] = [];

  if (prev && prev.rank.division !== "Juryo" && record.rank.division === "Juryo") {
    tags.push(hasSeenJuryo ? "再十両" : "新十両");
  }
  if (prev && prev.rank.division !== "Makuuchi" && record.rank.division === "Makuuchi") {
    tags.push(hasSeenMakuuchi ? "再入幕" : "新入幕");
  }
  if (prev && !SANYAKU_NAMES.has(prev.rank.name) && SANYAKU_NAMES.has(record.rank.name)) {
    tags.push(hasSeenSanyaku ? "再三役" : "新三役");
  }
  if (prev && prev.rank.name !== "大関" && record.rank.name === "大関") {
    tags.push(hasSeenOzeki ? "再大関" : "新大関");
  }
  if (prev && prev.rank.name !== "横綱" && record.rank.name === "横綱") {
    tags.push("横綱昇進");
  }
  if (record.bashoSeq === lastSeq) tags.push("引退前最後");

  return [...new Set(tags)];
};

const computeDeltaLabel = (current: BashoRecord, next: BashoRecord | undefined): { deltaValue: number; deltaLabel: string } => {
  if (!next) {
    return { deltaValue: 0, deltaLabel: "-" };
  }
  const currentValue = getRankValueForChart(current.rank);
  const nextValue = getRankValueForChart(next.rank);
  const deltaValue = Math.round((currentValue - nextValue) * 10) / 10;
  if (Math.abs(deltaValue) < 0.01) {
    return { deltaValue, deltaLabel: "据え置き" };
  }
  return {
    deltaValue,
    deltaLabel: deltaValue > 0 ? `+${deltaValue}` : `${deltaValue}`,
  };
};

const buildContinuityGroupIds = (points: Omit<CareerLedgerPoint, "continuityGroupId">[]): CareerLedgerPoint[] => {
  let continuityIndex = 0;
  return points.map((point, index) => {
    const prev = points[index - 1];
    if (!prev || prev.bandKey !== point.bandKey) {
      continuityIndex += 1;
    }
    return {
      ...point,
      continuityGroupId: `${point.bandKey}-${continuityIndex}`,
    };
  });
};

export const buildCareerLedgerModel = (
  status: RikishiStatus,
  _bashoRows: CareerBashoRecordsBySeq[],
): CareerLedgerModel => {
  const records = status.history.records
    .filter((record) => record.rank.division !== "Maezumo")
    .map((record, index) => ({ ...record, bashoSeq: index + 1 }));
  const lastSeq = records.length;
  let hasSeenJuryo = false;
  let hasSeenMakuuchi = false;
  let hasSeenSanyaku = false;
  let hasSeenOzeki = false;

  const rawPoints = records.map((record, index) => {
    const prev = records[index - 1];
    const next = records[index + 1];
    const milestoneTags = resolveMilestoneTags(
      record,
      prev,
      lastSeq,
      hasSeenJuryo,
      hasSeenMakuuchi,
      hasSeenSanyaku,
      hasSeenOzeki,
    );
    if (record.rank.division === "Juryo" || record.rank.division === "Makuuchi") {
      hasSeenJuryo = true;
    }
    if (record.rank.division === "Makuuchi") {
      hasSeenMakuuchi = true;
    }
    if (SANYAKU_NAMES.has(record.rank.name)) {
      hasSeenSanyaku = true;
    }
    if (record.rank.name === "大関" || record.rank.name === "横綱") {
      hasSeenOzeki = true;
    }
    const bandKey = toBandKey(record.rank);
    const { deltaValue, deltaLabel } = computeDeltaLabel(record, next);
    return {
      bashoSeq: record.bashoSeq,
      bashoLabel: formatBashoLabel(record.year, record.month),
      axisLabel:
        index % 3 === 0 || index === records.length - 1
          ? `${record.year}.${String(record.month).padStart(2, "0")}`
          : "",
      year: record.year,
      month: record.month,
      rank: record.rank,
      rankLabel: formatRankDisplayName(record.rank),
      rankShortLabel: toShortRankLabel(record.rank),
      bandKey,
      ordinalBucket: toOrdinalBucket(bandKey),
      recordLabel: formatFullRecord(record),
      recordCompactLabel: formatCompactRecord(record),
      wins: record.wins,
      losses: record.losses,
      absent: record.absent,
      isFullAbsence: record.absent >= 15 && record.wins === 0 && record.losses === 0,
      eventFlags: [
        ...(record.yusho ? (["yusho"] as const) : []),
        ...((record.specialPrizes?.length ?? 0) > 0 ? (["sansho"] as const) : []),
        ...(record.absent > 0 ? (["absent"] as const) : []),
      ],
      milestoneTags,
      yearBandId: String(record.year),
      deltaValue,
      deltaLabel,
    };
  });

  return {
    points: buildContinuityGroupIds(rawPoints),
    yearBands: buildCareerYearBands(
      rawPoints.map((point) => ({
        bashoSeq: point.bashoSeq,
        year: point.year,
        month: point.month,
      })),
    ),
  };
};

export const buildCareerYearBands = (
  points: Array<Pick<CareerLedgerPoint, "bashoSeq" | "year" | "month">>,
): CareerYearBand[] => {
  const grouped = new Map<number, Array<Pick<CareerLedgerPoint, "bashoSeq" | "year" | "month">>>();
  for (const point of points) {
    const current = grouped.get(point.year) ?? [];
    current.push(point);
    grouped.set(point.year, current);
  }

  return [...grouped.entries()].map(([year, yearPoints]) => ({
    year,
    startSeq: yearPoints[0].bashoSeq,
    endSeq: yearPoints[yearPoints.length - 1].bashoSeq,
    label: String(year),
    size: yearPoints.length,
  }));
};

export const buildCareerOverviewModel = (
  status: RikishiStatus,
  _bashoRows: CareerBashoRecordsBySeq[],
): CareerOverviewModel => {
  const records = status.history.records.filter((record) => record.rank.division !== "Maezumo");
  const totalDecisions = status.history.totalWins + status.history.totalLosses;
  const winRate = totalDecisions > 0 ? (status.history.totalWins / totalDecisions) * 100 : 0;
  const careerPeriodLabel =
    records.length > 0
      ? `${formatBashoLabel(records[0].year, records[0].month)} - ${formatBashoLabel(records[records.length - 1].year, records[records.length - 1].month)}`
      : "-";

  return {
    shikona: status.shikona,
    birthplace: status.profile.birthplace,
    stableName: resolveStableById(status.stableId)?.displayName ?? "所属部屋未詳",
    totalRecordLabel: `${status.history.totalWins}勝${status.history.totalLosses}敗${status.history.totalAbsent > 0 ? `${status.history.totalAbsent}休` : ""}`,
    winRateLabel: `${winRate.toFixed(1)}%`,
    careerPeriodLabel,
    lifeSummary:
      status.careerNarrative?.turningPoints[0]?.summary ??
      status.careerNarrative?.careerIdentity ??
      `${status.profile.birthplace}から角界へ入り、${formatRankDisplayName(status.history.maxRank)}まで届いた。`,
    bodyType: status.bodyType,
  };
};

export const buildCareerPlaceSummary = (
  _detail: CareerBashoDetail | null,
  ledgerPoint: CareerLedgerPoint | null,
): CareerPlaceSummaryModel | null => {
  if (!ledgerPoint) return null;
  return {
    bashoLabel: ledgerPoint.bashoLabel,
    rankLabel: ledgerPoint.rankLabel,
    recordLabel: ledgerPoint.recordLabel,
    deltaLabel: ledgerPoint.deltaLabel,
    milestoneTags: ledgerPoint.milestoneTags,
  };
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
  const sorted = listDivisionRows(rows, playerRow);
  const playerIndex = sorted.findIndex((row) => row.entityType === "PLAYER");
  if (playerIndex < 0) return sorted.slice(0, Math.min(sorted.length, range * 2 + 1));
  return sorted.slice(Math.max(0, playerIndex - range), Math.min(sorted.length, playerIndex + range + 1));
};

export const listDivisionRows = (
  rows: BashoRecordRow[],
  playerRow: BashoRecordRow,
): BashoRecordRow[] =>
  rows
    .filter((row) => row.division === playerRow.division)
    .slice()
    .sort((left, right) => rankValueFromRow(left) - rankValueFromRow(right));
