import type { BashoRecord } from "../../../logic/models";
import { Rank, RikishiStatus } from "../../../logic/models";
import type { CareerBashoDetail, CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import { resolveStableById } from "../../../logic/simulation/heya/stableCatalog";
import { formatHighestRankDisplayName, formatRankDisplayName, formatRankMovementDisplay, getRankValueForChart } from "../../../logic/ranking";
import { formatBashoLabel } from "../../../logic/bashoLabels";

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
  rankValue: number;
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

export interface CareerRankScaleBand {
  key: CareerLedgerBandKey;
  label: string;
  min: number;
  max: number;
  weight: number;
}

export interface CareerRankScaleLayoutBand extends CareerRankScaleBand {
  y: number;
  height: number;
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

export interface CareerDesignReadingRow {
  label: string;
  designed: string;
  interpreted: string;
  realized: string;
}

export interface CareerOutcomeGap {
  axis: string;
  expected: string;
  actual: string;
  note: string;
}

export interface CareerDesignReadingModel {
  premiseRows: CareerDesignReadingRow[];
  interpretationRows: CareerDesignReadingRow[];
  divergenceLines: string[];
  outcomeGaps: CareerOutcomeGap[];
  debugRows: Array<{ label: string; value: string }>;
  feedbackReportText: string;
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

export const CAREER_RANK_SCALE_BANDS: CareerRankScaleBand[] = [
  { key: "YOKOZUNA", label: "横綱", min: 0, max: 9, weight: 0.5 },
  { key: "OZEKI", label: "大関", min: 10, max: 19, weight: 0.5 },
  { key: "SEKIWAKE", label: "関脇", min: 20, max: 29, weight: 0.5 },
  { key: "KOMUSUBI", label: "小結", min: 30, max: 39, weight: 0.5 },
  { key: "MAEGASHIRA", label: "前頭", min: 40, max: 59, weight: 0.95 },
  { key: "JURYO", label: "十両", min: 60, max: 79, weight: 0.95 },
  { key: "MAKUSHITA", label: "幕下", min: 80, max: 149, weight: 2.25 },
  { key: "SANDANME", label: "三段目", min: 150, max: 259, weight: 3.1 },
  { key: "JONIDAN", label: "序二段", min: 260, max: 369, weight: 3.1 },
  { key: "JONOKUCHI", label: "序ノ口", min: 370, max: 460, weight: 2.45 },
];

export const getCareerRankScaleLayout = (plotHeight: number): CareerRankScaleLayoutBand[] => {
  const totalWeight = CAREER_RANK_SCALE_BANDS.reduce((sum, band) => sum + band.weight, 0);
  let cursor = 0;
  return CAREER_RANK_SCALE_BANDS.map((band) => {
    const height = (band.weight / totalWeight) * plotHeight;
    const result = {
      ...band,
      y: cursor,
      height,
    };
    cursor += height;
    return result;
  });
};

export const getCareerRankScalePosition = (
  rankValue: number,
  layout: CareerRankScaleLayoutBand[],
): { y: number; band: CareerRankScaleLayoutBand } => {
  const band =
    layout.find((entry) => rankValue >= entry.min && rankValue <= entry.max) ??
    layout[layout.length - 1];
  const range = Math.max(1, band.max - band.min);
  const ratio = Math.max(0, Math.min(1, (rankValue - band.min) / range));
  return {
    y: band.y + band.height * (0.12 + ratio * 0.76),
    band,
  };
};

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
  hasSeenKomusubi: boolean,
  hasSeenSekiwake: boolean,
  hasSeenOzeki: boolean,
): string[] => {
  const tags: string[] = [];

  if (prev && prev.rank.division !== "Juryo" && record.rank.division === "Juryo") {
    tags.push(hasSeenJuryo ? "再十両" : "新十両");
  }
  if (prev && prev.rank.division !== "Makuuchi" && record.rank.division === "Makuuchi") {
    tags.push(hasSeenMakuuchi ? "再入幕" : "新入幕");
  }
  const isPromotionToCurrentRank = prev
    ? getRankValueForChart(prev.rank) > getRankValueForChart(record.rank)
    : false;
  if (prev && isPromotionToCurrentRank && SANYAKU_NAMES.has(record.rank.name) && prev.rank.name !== record.rank.name) {
    if (record.rank.name === "関脇") {
      tags.push(hasSeenSekiwake ? "再関脇" : "新関脇");
    } else {
      tags.push(hasSeenKomusubi ? "再小結" : "新小結");
    }
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
    return { deltaValue, deltaLabel: "変動なし" };
  }
  return {
    deltaValue,
    deltaLabel: formatRankMovementDisplay(current.rank, next.rank, deltaValue),
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

const formatDesignRealization = (status: RikishiStatus, category: string): string => {
  const records = status.history.records.filter((record) => record.rank.division !== "Maezumo");
  const yushoTotal = status.history.yushoCount.makuuchi + status.history.yushoCount.juryo + status.history.yushoCount.makushita + status.history.yushoCount.others;
  const injuryBasho = records.filter((record) => record.absent > 0).length;
  if (category === "入門背景" || category === "年齢・開始条件") {
    return `${records.length}場所を記録し、最高位は${formatHighestRankDisplayName(status.history.maxRank)}。`;
  }
  if (category === "身体的前提") {
    return `${Math.round(status.bodyMetrics.heightCm)}cm・${Math.round(status.bodyMetrics.weightKg)}kgで引退時点の体格が残った。`;
  }
  if (category === "部屋・環境") {
    return `${resolveStableById(status.stableId)?.displayName ?? "所属部屋未詳"}所属として記録された。`;
  }
  if (category === "気質") {
    return status.careerNarrative?.careerIdentity ?? "気質の発現は番付推移と取組記録から読む。";
  }
  if (category === "期待") {
    return yushoTotal > 0 ? `優勝${yushoTotal}回まで届いた。` : `${formatHighestRankDisplayName(status.history.maxRank)}まで届いた。`;
  }
  if (category === "不安材料") {
    return injuryBasho > 0 ? `${injuryBasho}場所で休場が記録された。` : "休場の少ない一代として終わった。";
  }
  return "実際の発現は、観測結果と各章の記録で読む。";
};

const buildCareerOutcomeGapPlaceholders = (
  rows: CareerDesignReadingRow[],
): CareerOutcomeGap[] =>
  rows.slice(0, 3).map((row) => ({
    axis: row.label,
    expected: row.designed,
    actual: row.realized,
    note: "現段階では採点せず、将来の差分評価の入力として扱う。",
  }));

const formatCareerSeedForReport = (status: RikishiStatus): string => {
  if (!status.careerSeed) return "未保持";
  return JSON.stringify({
    entryAge: status.careerSeed.entryAge,
    entryPath: status.careerSeed.entryPath,
    temperament: status.careerSeed.temperament,
    bodySeed: status.careerSeed.bodySeed,
    stableId: status.careerSeed.stableId,
    primaryStyle: status.careerSeed.primaryStyle,
    secondaryStyle: status.careerSeed.secondaryStyle,
    biases: status.careerSeed.biases,
  });
};

const buildFeedbackReportText = (input: {
  status: RikishiStatus;
  careerId?: string | null;
  highestRankLabel: string;
  finalBashoLabel: string;
  premiseRows: CareerDesignReadingRow[];
  interpretationRows: CareerDesignReadingRow[];
}): string => {
  const designRows = (input.premiseRows.length > 0 ? input.premiseRows : input.interpretationRows).slice(0, 5);
  const realizedRows = designRows.slice(0, 5);
  return [
    "sumo-maker 結果報告",
    `careerId: ${input.careerId ?? "未保存/未確定"}`,
    `careerSeed: ${formatCareerSeedForReport(input.status)}`,
    "modelVersion: 未保持",
    `四股名: ${input.status.shikona}`,
    `最高位: ${input.highestRankLabel}`,
    `通算成績: ${formatFullRecord({
      wins: input.status.history.totalWins,
      losses: input.status.history.totalLosses,
      absent: input.status.history.totalAbsent,
    })}`,
    `引退年齢/最終場所: ${input.status.age}歳 / ${input.finalBashoLabel}`,
    "",
    "設計時の前提:",
    ...designRows.map((row) => `- ${row.label}: ${row.designed}`),
    "",
    "実際に発現したキャリア傾向:",
    ...realizedRows.map((row) => `- ${row.label}: ${row.realized}`),
  ].join("\n");
};

export const buildCareerDesignReadingModel = (
  status: RikishiStatus,
  options?: { careerId?: string | null },
): CareerDesignReadingModel => {
  const summary = status.buildSummary;
  const premiseRows: CareerDesignReadingRow[] =
    summary?.designPremises?.map((premise) => ({
      label: premise.category,
      designed: premise.summary,
      interpreted: premise.interpretation,
      realized: formatDesignRealization(status, premise.category),
    })) ?? [];
  const interpretation = summary?.designInterpretation;
  const interpretationRows: CareerDesignReadingRow[] = interpretation
    ? [
      { label: "成長", designed: "成長傾向", interpreted: interpretation.growth, realized: formatDesignRealization(status, "年齢・開始条件") },
      { label: "耐久", designed: "怪我・継続性", interpreted: interpretation.durability, realized: formatDesignRealization(status, "不安材料") },
      { label: "安定", designed: "気質の出方", interpreted: interpretation.stability, realized: formatDesignRealization(status, "気質") },
      { label: "昇進", designed: "番付上昇", interpreted: interpretation.promotion, realized: formatDesignRealization(status, "期待") },
      { label: "揺らぎ", designed: "想定との差", interpreted: interpretation.variance, realized: status.careerNarrative?.retirementDigest ?? "最終章の読後感として判断する。" },
    ]
    : [];

  const primaryRows = premiseRows.length > 0 ? premiseRows : interpretationRows;
  const finalRecord = status.history.records
    .filter((record) => record.rank.division !== "Maezumo")
    .slice(-1)[0];
  const highestRankLabel = formatHighestRankDisplayName(status.history.maxRank);
  const finalBashoLabel = finalRecord ? formatBashoLabel(finalRecord.year, finalRecord.month) : "未記録";
  return {
    premiseRows,
    interpretationRows,
    divergenceLines: [
      "ここでは設計前提と実結果を断定的に採点しない。",
      "想定と違った点、予想外に面白かった点は、この表示モデル上では premiseRows / interpretationRows の realized 側に集約する。",
    ],
    outcomeGaps: buildCareerOutcomeGapPlaceholders(primaryRows),
    debugRows: [
      options?.careerId ? { label: "careerId", value: options.careerId } : null,
      status.careerSeed ? { label: "careerSeed", value: "保存済み" } : null,
      { label: "modelVersion", value: "結果ステータス単体では未保持" },
    ].filter((row): row is { label: string; value: string } => Boolean(row)),
    feedbackReportText: buildFeedbackReportText({
      status,
      careerId: options?.careerId,
      highestRankLabel,
      finalBashoLabel,
      premiseRows,
      interpretationRows,
    }),
  };
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
  let hasSeenKomusubi = false;
  let hasSeenSekiwake = false;
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
      hasSeenKomusubi,
      hasSeenSekiwake,
      hasSeenOzeki,
    );
    if (record.rank.division === "Juryo" || record.rank.division === "Makuuchi") {
      hasSeenJuryo = true;
    }
    if (record.rank.division === "Makuuchi") {
      hasSeenMakuuchi = true;
    }
    if (record.rank.name === "小結") {
      hasSeenKomusubi = true;
    }
    if (record.rank.name === "関脇") {
      hasSeenSekiwake = true;
    }
    if (record.rank.name === "大関" || record.rank.name === "横綱") {
      hasSeenOzeki = true;
    }
    const rankValue = getRankValueForChart(record.rank);
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
      rankValue,
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

  const highestIndex = rawPoints.reduce<number>((bestIndex, point, index) => {
    const best = rawPoints[bestIndex];
    return point.rankValue < best.rankValue ? index : bestIndex;
  }, 0);
  rawPoints[highestIndex]?.milestoneTags.unshift("最高位到達");

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
      `${status.profile.birthplace}から角界へ入り、${formatHighestRankDisplayName(status.history.maxRank)}まで届いた。`,
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

export {
  buildCareerWorldSummary,
  buildCareerRaritySummary,
  buildCareerWorldNarrative,
  formatCareerPosition,
  selectKeyNpcCards,
  formatRivalDescription,
  formatGenerationPeerDescription,
  formatDominanceLabel,
  formatEraStarYushoNote,
  buildRivalViewModels,
  buildPeerSections,
  buildEraStarViewModels,
} from "../../../logic/simulation/npc/summary";
export type {
  CareerWorldSummary,
  CareerRaritySummary,
  NotableNpcSummary,
  EraStarNpcSummary,
  RivalryKind,
  RarityTier,
  CareerPositionViewModel,
  KeyNpcCard,
  PeerSection,
  EraStarViewModel,
  RivalViewModel,
} from "../../../logic/simulation/npc/summary";
