import React from "react";
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Crown, MapPinned, ScrollText, TrendingUp } from "lucide-react";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { formatHighestRankDisplayName } from "../../../logic/ranking";
import { Button } from "../../../shared/ui/Button";
import { BashoHeatmapStrip } from "./BashoHeatmapStrip";
import {
  CAREER_LEDGER_BANDS,
  getCareerRankScaleLayout,
  getCareerRankScalePosition,
  type CareerLedgerModel,
  type CareerLedgerPoint,
  type CareerPlaceSummaryModel,
  type CareerWindowState,
} from "../utils/careerResultModel";
import styles from "./CareerTrajectoryChapter.module.css";

interface CareerTrajectoryChapterProps {
  ledger: CareerLedgerModel;
  selectedPoint: CareerLedgerPoint | null;
  selectionSummary: CareerPlaceSummaryModel | null;
  detail: CareerBashoDetail | null;
  detailLoading: boolean;
  hasPersistence: boolean;
  viewState: CareerWindowState & { selectedBashoSeq: number | null };
  onSelectBasho: (bashoSeq: number) => void;
  onWindowChange: (window: CareerWindowState) => void;
  onOpenChapter: (chapter: "place" | "encyclopedia") => void;
}

type TrajectoryMode = "standard" | "milestones";

const MILESTONE_PRIORITY = [
  "最高位到達",
  "横綱昇進",
  "新大関",
  "再大関",
  "新関脇",
  "再関脇",
  "新小結",
  "再小結",
  "新入幕",
  "再入幕",
  "新十両",
  "再十両",
  "横綱",
  "大関",
  "三役",
  "引退前最後",
] as const;

const HIDDEN_VISUAL_TAGS = new Set<string>();
const GRAPH_TEXT_LABELS = new Set(["最高位到達", "横綱昇進", "新大関"]);
const PROMOTION_MARKER_TAGS = new Set(["横綱昇進", "新大関", "再大関", "新関脇", "再関脇", "新小結", "再小結", "新入幕", "再入幕", "新十両", "再十両"]);

const AXIS_GROUP_LABELS: Array<{
  key: CareerLedgerPoint["bandKey"];
  label: string;
  includes: CareerLedgerPoint["bandKey"][];
}> = [
  { key: "YOKOZUNA", label: "横綱・大関", includes: ["YOKOZUNA", "OZEKI"] },
  { key: "SEKIWAKE", label: "三役", includes: ["SEKIWAKE", "KOMUSUBI"] },
  { key: "MAEGASHIRA", label: "幕内", includes: ["MAEGASHIRA"] },
  { key: "JURYO", label: "十両", includes: ["JURYO"] },
  { key: "MAKUSHITA", label: "幕下", includes: ["MAKUSHITA"] },
  { key: "SANDANME", label: "三段目以下", includes: ["SANDANME", "JONIDAN", "JONOKUCHI"] },
];

const resolvePrimaryMilestone = (tags: string[]): string | null => {
  const visibleTags = tags.filter((tag) => !HIDDEN_VISUAL_TAGS.has(tag));
  for (const tag of MILESTONE_PRIORITY) {
    if (visibleTags.includes(tag)) return tag;
  }
  return visibleTags[0] ?? null;
};

const resolveTrajectoryTone = (point: CareerLedgerPoint | null): "up" | "down" | "flat" => {
  if (!point || Math.abs(point.deltaValue) < 0.01) return "flat";
  return point.deltaValue > 0 ? "up" : "down";
};

const LIFE_LINE_WIDTH = 960;
const LIFE_LINE_HEIGHT = 270;
const LIFE_LINE_PADDING = {
  top: 30,
  right: 28,
  bottom: 34,
  left: 52,
} as const;
const BIG_DELTA_THRESHOLD = 6;
const STAGNATION_MIN_BASHO = 10;
const MAX_LIFE_LINE_EVENTS = 6;
const SEKITORI_BANDS = new Set<CareerLedgerPoint["bandKey"]>(["YOKOZUNA", "OZEKI", "SEKIWAKE", "KOMUSUBI", "MAEGASHIRA", "JURYO"]);

interface LifeLinePoint extends CareerLedgerPoint {
  x: number;
  y: number;
  label: string | null;
  labelPriority: number;
  isSelected: boolean;
  isPeak: boolean;
  isPromoted: boolean;
  isBigMove: boolean;
}

type TrajectoryAnnotationKind = "peak" | "rise" | "fall" | "stagnation" | "return";

interface TrajectoryAnnotation {
  kind: TrajectoryAnnotationKind;
  label: string;
  summary: string;
  point: CareerLedgerPoint;
  startPoint?: CareerLedgerPoint;
  length?: number;
  value?: number;
}

interface TrajectorySummary {
  peak: CareerLedgerPoint | null;
  maxRise: TrajectoryAnnotation | null;
  maxFall: TrajectoryAnnotation | null;
  longestStagnation: TrajectoryAnnotation | null;
  sekitoriCount: number;
  annotations: TrajectoryAnnotation[];
}

const toDeltaText = (point: CareerLedgerPoint): string => {
  return point.deltaLabel;
};

const resolvePointLabel = (point: CareerLedgerPoint, isPeak: boolean): { label: string | null; priority: number } => {
  const milestone = resolvePrimaryMilestone(point.milestoneTags);
  if (isPeak) return { label: "最高位", priority: 100 };
  if (milestone && GRAPH_TEXT_LABELS.has(milestone)) return { label: milestone, priority: 90 };
  return { label: null, priority: 0 };
};

const getBandLabel = (bandKey: CareerLedgerPoint["bandKey"]): string =>
  CAREER_LEDGER_BANDS.find((band) => band.key === bandKey)?.label ?? bandKey;

const isReturnTarget = (point: CareerLedgerPoint): boolean =>
  SEKITORI_BANDS.has(point.bandKey) ||
  (point.bandKey === "MAKUSHITA" && (point.rank.number ?? 99) <= 15);

const getAnnotationTone = (kind: TrajectoryAnnotationKind): "peak" | "rise" | "fall" | "stagnation" | "return" => kind;

const summarizeAnnotation = (annotation: TrajectoryAnnotation): string => {
  if (annotation.kind === "peak") return `${annotation.point.bashoLabel} / ${formatHighestRankDisplayName(annotation.point.rank)} / ${annotation.point.recordLabel}`;
  if (annotation.kind === "rise") return `${annotation.point.bashoLabel}から${annotation.point.deltaLabel}`;
  if (annotation.kind === "fall") return `${annotation.point.bashoLabel}から${annotation.point.deltaLabel}`;
  if (annotation.kind === "stagnation") return `${getBandLabel(annotation.point.bandKey)}に${annotation.length ?? 0}場所`;
  return `${annotation.point.bashoLabel} / ${annotation.point.rankLabel}へ戻る`;
};

const buildTrajectorySummary = (points: CareerLedgerPoint[]): TrajectorySummary => {
  if (points.length === 0) {
    return {
      peak: null,
      maxRise: null,
      maxFall: null,
      longestStagnation: null,
      sekitoriCount: 0,
      annotations: [],
    };
  }

  const peak = points.reduce((best, point) => (point.rankValue < best.rankValue ? point : best), points[0]);
  const maxRisePoint = points.reduce<CareerLedgerPoint | null>((best, point) =>
    point.deltaValue > 0 && (!best || point.deltaValue > best.deltaValue) ? point : best, null);
  const maxFallPoint = points.reduce<CareerLedgerPoint | null>((worst, point) =>
    point.deltaValue < 0 && (!worst || point.deltaValue < worst.deltaValue) ? point : worst, null);

  let longestStagnation: TrajectoryAnnotation | null = null;
  let runStart = 0;
  for (let index = 1; index <= points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (current && current.bandKey === previous.bandKey) continue;
    const length = index - runStart;
    if (length >= STAGNATION_MIN_BASHO && (!longestStagnation || length > (longestStagnation.length ?? 0))) {
      const startPoint = points[runStart];
      longestStagnation = {
        kind: "stagnation",
        label: "停滞",
        summary: `${getBandLabel(startPoint.bandKey)}に${length}場所`,
        point: previous,
        startPoint,
        length,
      };
    }
    runStart = index;
  }

  const returnAnnotations: TrajectoryAnnotation[] = [];
  let hasReachedTarget = false;
  let dropStart: CareerLedgerPoint | null = null;
  for (const point of points) {
    if (isReturnTarget(point)) {
      if (dropStart) {
        returnAnnotations.push({
          kind: "return",
          label: "復帰",
          summary: `${dropStart.bashoLabel}から落ちた後、${point.bashoLabel}に${point.rankLabel}へ戻る`,
          point,
          startPoint: dropStart,
        });
        dropStart = null;
      }
      hasReachedTarget = true;
    } else if (hasReachedTarget && !dropStart) {
      dropStart = point;
    }
  }

  const maxRise = maxRisePoint && maxRisePoint.deltaValue >= BIG_DELTA_THRESHOLD
    ? {
      kind: "rise" as const,
      label: "急上昇",
      summary: `${maxRisePoint.bashoLabel}から${maxRisePoint.deltaLabel}`,
      point: maxRisePoint,
      value: maxRisePoint.deltaValue,
    }
    : null;
  const maxFall = maxFallPoint && Math.abs(maxFallPoint.deltaValue) >= BIG_DELTA_THRESHOLD
    ? {
      kind: "fall" as const,
      label: "急落",
      summary: `${maxFallPoint.bashoLabel}から${maxFallPoint.deltaLabel}`,
      point: maxFallPoint,
      value: maxFallPoint.deltaValue,
    }
    : null;
  const peakAnnotation: TrajectoryAnnotation = {
    kind: "peak",
    label: "最高位",
    summary: `${peak.bashoLabel} / ${formatHighestRankDisplayName(peak.rank)} / ${peak.recordLabel}`,
    point: peak,
  };
  const sekitoriCount = points.filter((point) => SEKITORI_BANDS.has(point.bandKey)).length;
  const annotations = [
    peakAnnotation,
    ...(maxRise ? [maxRise] : []),
    ...(maxFall ? [maxFall] : []),
    ...(longestStagnation ? [longestStagnation] : []),
    ...returnAnnotations.slice(0, 2),
  ];

  return {
    peak,
    maxRise,
    maxFall,
    longestStagnation,
    sekitoriCount,
    annotations,
  };
};

const buildLifeLinePoints = (
  points: CareerLedgerPoint[],
  selectedBashoSeq: number | undefined,
): LifeLinePoint[] => {
  if (points.length === 0) return [];
  const xRange = Math.max(1, points.length - 1);
  const plotWidth = LIFE_LINE_WIDTH - LIFE_LINE_PADDING.left - LIFE_LINE_PADDING.right;
  const plotHeight = LIFE_LINE_HEIGHT - LIFE_LINE_PADDING.top - LIFE_LINE_PADDING.bottom;
  const bandLayout = getCareerRankScaleLayout(plotHeight);
  const peakSeq = points.reduce((best, point) => (point.rankValue < best.rankValue ? point : best), points[0]).bashoSeq;
  const minLabelGap = points.length > 72 ? 84 : points.length > 42 ? 70 : 54;
  const sortedLabelCandidates = points
    .map((point, index) => {
      const isPeak = point.bashoSeq === peakSeq;
      const { label, priority } = resolvePointLabel(point, isPeak);
      const x = LIFE_LINE_PADDING.left + (index / xRange) * plotWidth;
      const y = LIFE_LINE_PADDING.top + getCareerRankScalePosition(point.rankValue, bandLayout).y;
      return {
        ...point,
        x,
        y,
        label,
        labelPriority: priority,
        isSelected: point.bashoSeq === selectedBashoSeq,
        isPeak,
        isPromoted: point.milestoneTags.some((tag) => PROMOTION_MARKER_TAGS.has(tag)),
        isBigMove: Math.abs(point.deltaValue) >= BIG_DELTA_THRESHOLD,
      };
    })
    .sort((left, right) => right.labelPriority - left.labelPriority);

  const acceptedLabels: LifeLinePoint[] = [];
  const bySeq = new Map<number, LifeLinePoint>();
  for (const candidate of sortedLabelCandidates) {
    const alwaysShow = candidate.isPeak || candidate.isPromoted || candidate.isSelected;
    const crowded = acceptedLabels.some((accepted) => Math.abs(accepted.x - candidate.x) < minLabelGap && Math.abs(accepted.y - candidate.y) < 34);
    const point = {
      ...candidate,
      label: candidate.label && (alwaysShow || !crowded) ? candidate.label : null,
    };
    if (point.label) acceptedLabels.push(point);
    bySeq.set(point.bashoSeq, point);
  }

  return points.map((point) => bySeq.get(point.bashoSeq)).filter((point): point is LifeLinePoint => Boolean(point));
};

const resolveAxisGroupY = (
  group: (typeof AXIS_GROUP_LABELS)[number],
  layout: ReturnType<typeof getCareerRankScaleLayout>,
): number => {
  const groupBands = layout.filter((band) => group.includes.includes(band.key));
  const first = groupBands[0] ?? layout[0];
  const last = groupBands[groupBands.length - 1] ?? first;
  return first.y + (last.y + last.height - first.y) / 2;
};

const buildLifeLineEvents = (points: LifeLinePoint[]): LifeLinePoint[] =>
  points
    .filter((point) => point.isSelected || point.isPeak || point.isPromoted || point.isBigMove)
    .slice()
    .sort((left, right) => {
      if (left.isSelected !== right.isSelected) return left.isSelected ? -1 : 1;
      if (left.isPeak !== right.isPeak) return left.isPeak ? -1 : 1;
      if (left.isPromoted !== right.isPromoted) return left.isPromoted ? -1 : 1;
      return Math.abs(right.deltaValue) - Math.abs(left.deltaValue);
    })
    .slice(0, MAX_LIFE_LINE_EVENTS)
    .sort((left, right) => left.bashoSeq - right.bashoSeq);

const resolveEventLabel = (point: LifeLinePoint): string => {
  const milestone = resolvePrimaryMilestone(point.milestoneTags);
  if (milestone) return milestone;
  if (point.isBigMove) return toDeltaText(point);
  return point.rankShortLabel;
};

const BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;

const BASHO_MONTH_LABELS: Record<number, string> = {
  1: "初",
  3: "春",
  5: "夏",
  7: "名",
  9: "秋",
  11: "九",
};

const toMonthColumn = (month: number): number => Math.max(1, BASHO_MONTHS.indexOf(month as typeof BASHO_MONTHS[number]) + 1);

const toBandRow = (point: CareerLedgerPoint): number =>
  Math.max(1, CAREER_LEDGER_BANDS.findIndex((band) => band.key === point.bandKey) + 1);

const summarizeYear = (points: CareerLedgerPoint[]) => {
  const first = points[0] ?? null;
  const last = points[points.length - 1] ?? null;
  const best = points.reduce<CareerLedgerPoint | null>((currentBest, point) => {
    if (!currentBest) return point;
    return point.ordinalBucket < currentBest.ordinalBucket ? point : currentBest;
  }, null);
  const wins = points.reduce((sum, point) => sum + point.wins, 0);
  const losses = points.reduce((sum, point) => sum + point.losses, 0);
  const absent = points.reduce((sum, point) => sum + point.absent, 0);
  const milestoneLabels = points
    .map((point) => resolvePrimaryMilestone(point.milestoneTags))
    .filter((label): label is string => Boolean(label));
  const yushoCount = points.filter((point) => point.eventFlags.includes("yusho")).length;

  return {
    first,
    last,
    best,
    recordLabel: `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`,
    milestoneLabels: [...new Set(milestoneLabels)],
    yushoCount,
  };
};

export const CareerTrajectoryChapter: React.FC<CareerTrajectoryChapterProps> = ({
  ledger,
  selectedPoint,
  selectionSummary,
  detail,
  detailLoading,
  hasPersistence,
  viewState,
  onSelectBasho,
  onWindowChange: _onWindowChange,
  onOpenChapter,
}) => {
  const [mode, setMode] = React.useState<TrajectoryMode>("standard");

  const visiblePoints = React.useMemo(
    () => ledger.points,
    [ledger.points],
  );

  const selectedIndex = React.useMemo(
    () => ledger.points.findIndex((point) => point.bashoSeq === selectedPoint?.bashoSeq),
    [ledger.points, selectedPoint?.bashoSeq],
  );
  const previousPoint = selectedIndex > 0 ? ledger.points[selectedIndex - 1] : null;
  const nextPoint = selectedIndex >= 0 && selectedIndex < ledger.points.length - 1 ? ledger.points[selectedIndex + 1] : null;
  const headlineMilestone = resolvePrimaryMilestone(selectedPoint?.milestoneTags ?? []);
  const detailTags = React.useMemo(() => {
    const source = selectionSummary?.milestoneTags ?? selectedPoint?.milestoneTags ?? [];
    return source.filter((tag) => !HIDDEN_VISUAL_TAGS.has(tag));
  }, [selectedPoint?.milestoneTags, selectionSummary?.milestoneTags]);
  const summaryNote =
    detail?.importantTorikumi?.[0]?.summary ??
    (hasPersistence ? "この場所では大きな節目は記録されていません。" : "保存後にこの場所の要点を確認できます。");
  const trajectorySummary = React.useMemo(
    () => buildTrajectorySummary(ledger.points),
    [ledger.points],
  );
  const peakPoint = trajectorySummary.peak;
  const sekitoriCount = trajectorySummary.sekitoriCount;
  const selectedOrdinal = selectedIndex >= 0 ? selectedIndex + 1 : null;
  const trajectoryTone = resolveTrajectoryTone(selectedPoint);
  const pointsByYear = React.useMemo(() => {
    const grouped = new Map<number, CareerLedgerPoint[]>();
    for (const point of visiblePoints) {
      const yearPoints = grouped.get(point.year) ?? [];
      yearPoints.push(point);
      grouped.set(point.year, yearPoints);
    }
    return grouped;
  }, [visiblePoints]);
  const [selectedYear, setSelectedYear] = React.useState<number | null>(null);
  const resolvedSelectedYear = selectedYear ?? selectedPoint?.year ?? ledger.yearBands[ledger.yearBands.length - 1]?.year ?? null;
  const selectedYearPoints = React.useMemo(
    () => (resolvedSelectedYear ? pointsByYear.get(resolvedSelectedYear) ?? [] : []),
    [pointsByYear, resolvedSelectedYear],
  );
  const selectedYearSummary = React.useMemo(
    () => summarizeYear(selectedYearPoints),
    [selectedYearPoints],
  );
  React.useEffect(() => {
    if (selectedPoint?.year) {
      setSelectedYear(selectedPoint.year);
    }
  }, [selectedPoint?.year]);
  const readableMilestones = React.useMemo(
    () =>
      ledger.points
        .map((point) => ({ point, label: resolvePrimaryMilestone(point.milestoneTags) }))
        .filter((entry): entry is { point: CareerLedgerPoint; label: string } => Boolean(entry.label)),
    [ledger.points],
  );
  const lifeLinePoints = React.useMemo(
    () => buildLifeLinePoints(ledger.points, selectedPoint?.bashoSeq),
    [ledger.points, selectedPoint?.bashoSeq],
  );
  const lifeLinePath = React.useMemo(
    () =>
      lifeLinePoints
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
        .join(" "),
    [lifeLinePoints],
  );
  const lifeLineAreaPath = React.useMemo(() => {
    if (lifeLinePoints.length === 0) return "";
    const first = lifeLinePoints[0];
    const last = lifeLinePoints[lifeLinePoints.length - 1];
    const bottom = LIFE_LINE_HEIGHT - LIFE_LINE_PADDING.bottom;
    return `${lifeLinePath} L ${last.x.toFixed(1)} ${bottom} L ${first.x.toFixed(1)} ${bottom} Z`;
  }, [lifeLinePath, lifeLinePoints]);
  const lifeLineEvents = React.useMemo(() => {
    const annotationSeqs = new Set(trajectorySummary.annotations.map((annotation) => annotation.point.bashoSeq));
    const eventPoints = buildLifeLineEvents(lifeLinePoints).filter((point) => !annotationSeqs.has(point.bashoSeq));
    return eventPoints.slice(0, Math.max(0, MAX_LIFE_LINE_EVENTS - trajectorySummary.annotations.length));
  }, [lifeLinePoints, trajectorySummary.annotations]);
  const lifeLineAxisLayout = React.useMemo(
    () => getCareerRankScaleLayout(LIFE_LINE_HEIGHT - LIFE_LINE_PADDING.top - LIFE_LINE_PADDING.bottom),
    [],
  );

  return (
    <section className={styles.shell}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>番付推移</div>
          <h2 className={styles.title}>番付履歴簿</h2>
          <p className={styles.lead}>出世、停滞、陥落、復帰を一枚の番付巻物として読む。</p>
        </div>
        <div className={styles.headStamp} aria-hidden="true">
          推移
        </div>
      </div>

      <div className={styles.summaryRail}>
        <article className={styles.summaryTile}>
          <Crown className="h-4 w-4" />
          <span>最高位</span>
          <strong>{peakPoint ? formatHighestRankDisplayName(peakPoint.rank) : "-"}</strong>
        </article>
        <article className={styles.summaryTile}>
          <ArrowUpRight className="h-4 w-4" />
          <span>最大上昇</span>
          <strong>{trajectorySummary.maxRise ? trajectorySummary.maxRise.point.deltaLabel : "該当なし"}</strong>
        </article>
        <article className={styles.summaryTile}>
          <ArrowDownRight className="h-4 w-4" />
          <span>最大下降</span>
          <strong>{trajectorySummary.maxFall ? trajectorySummary.maxFall.point.deltaLabel : "該当なし"}</strong>
        </article>
        <article className={styles.summaryTile}>
          <MapPinned className="h-4 w-4" />
          <span>最長停滞帯</span>
          <strong>{trajectorySummary.longestStagnation ? trajectorySummary.longestStagnation.summary : "短期推移"}</strong>
        </article>
        <article className={styles.summaryTile}>
          <TrendingUp className="h-4 w-4" />
          <span>関取在位</span>
          <strong>{sekitoriCount}場所</strong>
        </article>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.modeBar} role="tablist" aria-label="番付推移の表示モード">
          <button
            type="button"
            className={styles.modeChip}
            data-active={mode === "standard"}
            onClick={() => setMode("standard")}
          >
            標準
          </button>
          <button
            type="button"
            className={styles.modeChip}
            data-active={mode === "milestones"}
            onClick={() => setMode("milestones")}
          >
            節目強調
          </button>
        </div>
        <div className={styles.selectionPill}>
          <span>{selectedOrdinal ? `${selectedOrdinal}/${ledger.points.length}` : "-/-"}</span>
          <strong>{selectedPoint?.bashoLabel ?? "場所未選択"}</strong>
        </div>
      </div>

      <div className={styles.lifeLinePanel}>
        <div className={styles.lifeLineHead}>
          <div>
            <span className={styles.summaryKicker}>番付人生ライン</span>
            <h4>入門から引退まで</h4>
          </div>
          <div className={styles.lifeLineHint}>上ほど高位 / 文字は重要節目だけ表示 / 点で場所選択</div>
        </div>
        <div className={styles.lifeLineFrame}>
          <svg
            className={styles.lifeLineSvg}
            viewBox={`0 0 ${LIFE_LINE_WIDTH} ${LIFE_LINE_HEIGHT}`}
            role="img"
            aria-label="入門から引退までの番付推移グラフ"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="careerLifeLineInk" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgb(var(--twc-text-faint))" stopOpacity="0.52" />
                <stop offset="42%" stopColor="rgb(var(--twc-brand))" stopOpacity="0.9" />
                <stop offset="100%" stopColor="rgb(var(--twc-award))" stopOpacity="0.95" />
              </linearGradient>
              <linearGradient id="careerLifeLineWash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--twc-brand))" stopOpacity="0.18" />
                <stop offset="100%" stopColor="rgb(var(--twc-bg))" stopOpacity="0" />
              </linearGradient>
            </defs>
            {lifeLineAxisLayout.map((band) => {
              const y = LIFE_LINE_PADDING.top + band.y;
              return (
                <g key={`life-band-${band.key}`}>
                  <rect
                    x={LIFE_LINE_PADDING.left}
                    y={y}
                    width={LIFE_LINE_WIDTH - LIFE_LINE_PADDING.left - LIFE_LINE_PADDING.right}
                    height={band.height}
                    className={styles.lifeLineBand}
                    data-band={band.key}
                  />
                  <line x1={LIFE_LINE_PADDING.left} x2={LIFE_LINE_WIDTH - LIFE_LINE_PADDING.right} y1={y} y2={y} className={styles.lifeLineGrid} />
                </g>
              );
            })}
            {AXIS_GROUP_LABELS.map((group) => {
              const y = LIFE_LINE_PADDING.top + resolveAxisGroupY(group, lifeLineAxisLayout);
              return (
                <text key={`life-axis-group-${group.key}`} x={LIFE_LINE_PADDING.left - 8} y={y + 4} className={styles.lifeLineBandLabel}>
                  {group.label}
                </text>
              );
            })}
            <text x="12" y={LIFE_LINE_PADDING.top + 4} className={styles.lifeLineAxis}>高位</text>
            <text x="12" y={LIFE_LINE_HEIGHT - LIFE_LINE_PADDING.bottom + 4} className={styles.lifeLineAxis}>下位</text>
            {lifeLineAreaPath ? <path d={lifeLineAreaPath} className={styles.lifeLineArea} /> : null}
            {lifeLinePath ? <path d={lifeLinePath} className={styles.lifeLineGhostPath} /> : null}
            {lifeLinePoints.map((point, index) => {
              const next = lifeLinePoints[index + 1];
              if (!next) return null;
              return (
                <line
                  key={`life-segment-${point.bashoSeq}-${next.bashoSeq}`}
                  x1={point.x}
                  y1={point.y}
                  x2={next.x}
                  y2={next.y}
                  className={styles.lifeLineSegment}
                  data-tone={point.deltaValue > 0 ? "up" : point.deltaValue < 0 ? "down" : "flat"}
                />
              );
            })}
            {lifeLinePoints.map((point) => {
              const deltaText = toDeltaText(point);
              return (
                <g
                  key={`life-point-${point.bashoSeq}`}
                  className={styles.lifeLinePoint}
                  data-selected={point.isSelected}
                  data-peak={point.isPeak}
                  data-promoted={point.isPromoted}
                  data-big={point.isBigMove}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectBasho(point.bashoSeq)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelectBasho(point.bashoSeq);
                    }
                  }}
                >
                  <title>{`${point.bashoLabel} / ${point.rankLabel} / ${point.recordLabel} / ${deltaText}`}</title>
                  <circle cx={point.x} cy={point.y} r={point.isSelected ? 7 : point.isPeak || point.isPromoted ? 6 : 4} />
                  {point.label && (point.isSelected || point.isPeak || point.isPromoted) ? (
                    <>
                      <line x1={point.x} x2={point.x} y1={point.y - 7} y2={Math.max(13, point.y - 24)} className={styles.lifeLineLabelStem} />
                      <text x={point.x} y={Math.max(12, point.y - 29)} className={styles.lifeLineLabel}>{point.label}</text>
                    </>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>
        <div className={styles.annotationRail}>
          {trajectorySummary.annotations.map((annotation) => (
            <button
              key={`annotation-${annotation.kind}-${annotation.point.bashoSeq}`}
              type="button"
              className={styles.annotationItem}
              data-tone={getAnnotationTone(annotation.kind)}
              data-active={annotation.point.bashoSeq === selectedPoint?.bashoSeq}
              onClick={() => onSelectBasho(annotation.point.bashoSeq)}
            >
              <span>{annotation.label}</span>
              <strong>{annotation.kind === "peak" ? formatHighestRankDisplayName(annotation.point.rank) : summarizeAnnotation(annotation)}</strong>
              <em>{annotation.point.bashoLabel} / {annotation.point.recordLabel}</em>
            </button>
          ))}
          {lifeLineEvents.map((point) => {
            const label = resolveEventLabel(point);
            return (
              <button
                key={`life-event-${point.bashoSeq}-${label}`}
                type="button"
                className={styles.annotationItem}
                data-tone={point.isPromoted ? "rise" : point.deltaValue < 0 ? "fall" : "return"}
                data-active={point.isSelected}
                onClick={() => onSelectBasho(point.bashoSeq)}
              >
                <span>{label}</span>
                <strong>{point.rankLabel}</strong>
                <em>{point.bashoLabel} / {toDeltaText(point)}</em>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.detailPanel} data-tone={trajectoryTone}>
          <div>
            <div className={styles.summaryKicker}>選択中の場所</div>
            <h3 className={styles.detailTitle}>
              {selectionSummary?.bashoLabel ?? selectedPoint?.bashoLabel ?? "場所未選択"}
            </h3>
            <p className={styles.detailCopy}>
              {selectionSummary?.recordLabel ?? "場所を選ぶと、この場所の意味を右側で読めます。"}
            </p>
          </div>

          <div className={styles.positionRibbon}>
            <span>{selectedOrdinal ? `第${selectedOrdinal}場所` : "未選択"}</span>
            <strong>{selectionSummary?.deltaLabel ?? "-"}</strong>
          </div>

          <div className={styles.detailMetrics}>
            <article className={styles.detailMetric}>
              <span className={styles.detailMetricLabel}>場所</span>
              <strong className={styles.detailMetricValue}>{selectionSummary?.bashoLabel ?? "-"}</strong>
            </article>
            <article className={styles.detailMetric}>
              <span className={styles.detailMetricLabel}>番付</span>
              <strong className={styles.detailMetricValue}>{selectionSummary?.rankLabel ?? "-"}</strong>
            </article>
            <article className={styles.detailMetric}>
              <span className={styles.detailMetricLabel}>成績</span>
              <strong className={styles.detailMetricValue}>{selectionSummary?.recordLabel ?? "-"}</strong>
            </article>
            <article className={styles.detailMetric}>
              <span className={styles.detailMetricLabel}>昇降幅</span>
              <strong className={styles.detailMetricValue}>{selectionSummary?.deltaLabel ?? "-"}</strong>
            </article>
          </div>

          <div className={styles.detailTags}>
            {(detailTags.length ? detailTags : headlineMilestone ? [headlineMilestone] : []).map((tag) => (
              <span key={tag} className={styles.detailTag}>
                {tag}
              </span>
            ))}
          </div>

          <div className={styles.detailNote}>
            <div className={styles.detailNoteLabel}>この場所の要点</div>
            <p className={styles.detailNoteText}>{detailLoading ? "読込中" : summaryNote}</p>
          </div>

          <div className={styles.detailCompare}>
            <div className={styles.detailNoteLabel}>前後比較</div>
            <div className={styles.detailCompareGrid}>
              <article className={styles.detailCompareItem}>
                <span className={styles.detailCompareLabel}>前の場所</span>
                <strong className={styles.detailCompareValue}>{previousPoint ? `${previousPoint.bashoLabel} / ${previousPoint.rankLabel}` : "なし"}</strong>
                <em className={styles.detailCompareMeta}>{previousPoint?.recordLabel ?? "比較対象なし"}</em>
              </article>
              <article className={styles.detailCompareItem}>
                <span className={styles.detailCompareLabel}>次の場所</span>
                <strong className={styles.detailCompareValue}>{nextPoint ? `${nextPoint.bashoLabel} / ${nextPoint.rankLabel}` : "なし"}</strong>
                <em className={styles.detailCompareMeta}>{nextPoint?.recordLabel ?? "比較対象なし"}</em>
              </article>
            </div>
          </div>

          <div className={styles.detailActions}>
            <Button type="button" variant="secondary" onClick={() => selectedPoint && onOpenChapter("place")} disabled={!selectedPoint}>
              <ArrowRight className="mr-2 h-4 w-4" />
              場所別を開く
            </Button>
            <Button type="button" variant="ghost" onClick={() => selectedPoint && onOpenChapter("encyclopedia")} disabled={!selectedPoint}>
              <ScrollText className="mr-2 h-4 w-4" />
              力士名鑑へ戻る
            </Button>
          </div>
        </aside>

        <div className={styles.mainPanel}>
          <div className={styles.chartHeader}>
            <div>
              <span className={styles.summaryKicker}>番付年表</span>
              <h3 className={styles.chartTitle}>年度検分</h3>
            </div>
            <div className={styles.chartLegend}>
              <span><i data-kind="rank" />在位</span>
              <span><i data-kind="yusho" />優勝</span>
              <span><i data-kind="event" />節目</span>
              <span><i data-kind="absence" />休場</span>
            </div>
          </div>

          <div className={styles.yearSelector}>
            {ledger.yearBands.map((yearBand) => {
              const yearPoints = pointsByYear.get(yearBand.year) ?? [];
              const summary = summarizeYear(yearPoints);
              const active = resolvedSelectedYear === yearBand.year;
              const hasMilestone = summary.milestoneLabels.length > 0;
              return (
                <button
                  key={`year-select-${yearBand.year}`}
                  type="button"
                  className={styles.yearSelectButton}
                  data-active={active}
                  data-event={hasMilestone}
                  onClick={() => setSelectedYear(yearBand.year)}
                >
                  <strong>{yearBand.label}</strong>
                  <span>{summary.best?.rankShortLabel ?? "-"}</span>
                  {summary.yushoCount > 0 ? <em>優勝 {summary.yushoCount}</em> : hasMilestone ? <em>{summary.milestoneLabels[0]}</em> : null}
                </button>
              );
            })}
          </div>

          <div className={styles.focusYear}>
            <div className={styles.focusYearHead}>
              <div>
                <span className={styles.summaryKicker}>選択年度</span>
                <h4>{resolvedSelectedYear ?? "-"}年</h4>
              </div>
              <div className={styles.focusYearStats}>
                <span>最高 {selectedYearSummary.best ? formatHighestRankDisplayName(selectedYearSummary.best.rank) : "-"}</span>
                <span>{selectedYearSummary.recordLabel}</span>
                <span>{selectedYearPoints.length}場所</span>
              </div>
            </div>

            <div className={styles.banzukeBoard}>
              <div className={styles.bandIndex} aria-hidden="true">
                {CAREER_LEDGER_BANDS.map((band) => (
                  <span key={`band-index-${band.key}`} data-band={band.key}>{band.label}</span>
                ))}
              </div>

              <section className={styles.yearCard}>
                <div className={styles.monthHeader} aria-hidden="true">
                  {BASHO_MONTHS.map((month) => (
                    <span key={`${resolvedSelectedYear}-${month}`}>{BASHO_MONTH_LABELS[month]}</span>
                  ))}
                </div>
                <div className={styles.yearTable}>
                  {CAREER_LEDGER_BANDS.map((band) => (
                    <div key={`${resolvedSelectedYear}-${band.key}`} className={styles.yearBandRow} data-band={band.key} />
                  ))}
                  {selectedYearPoints.map((point) => {
                    const isSelected = point.bashoSeq === selectedPoint?.bashoSeq;
                    const hasMilestone = point.milestoneTags.length > 0;
                    const hasYusho = point.eventFlags.includes("yusho");
                    const primaryMilestone = resolvePrimaryMilestone(point.milestoneTags);
                    return (
                      <motion.button
                        layout
                        key={`year-point-${point.bashoSeq}`}
                        type="button"
                        className={styles.yearCell}
                        data-selected={isSelected}
                        data-absence={point.isFullAbsence}
                        data-event={hasMilestone}
                        data-yusho={hasYusho}
                        data-muted={mode === "milestones" && !hasMilestone && !isSelected}
                        title={`${point.bashoLabel} / ${point.rankLabel} / ${point.recordLabel}`}
                        style={{
                          gridColumn: toMonthColumn(point.month),
                          gridRow: toBandRow(point),
                        }}
                        onClick={() => onSelectBasho(point.bashoSeq)}
                      >
                        <span className={styles.yearCellRank}>{point.rankShortLabel}</span>
                        <span className={styles.yearCellRecord}>{point.recordCompactLabel}</span>
                        {hasYusho ? <span className={styles.yearCellYusho}>優勝</span> : null}
                        {primaryMilestone ? <span className={styles.yearCellEvent}>{primaryMilestone}</span> : null}
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          <div className={styles.milestoneRail}>
            <div className={styles.milestoneRailHead}>
              <span className={styles.summaryKicker}>節目レーン</span>
              <span>{readableMilestones.length > 0 ? "推移の読みどころ" : "大きな節目は少ない一代"}</span>
            </div>
            <div className={styles.milestoneList}>
              {(readableMilestones.length > 0 ? readableMilestones : [{ point: selectedPoint, label: "現在地" }])
                .filter((entry): entry is { point: CareerLedgerPoint; label: string } => Boolean(entry.point))
                .map(({ point, label }) => (
                  <button
                    key={`milestone-${point.bashoSeq}-${label}`}
                    type="button"
                    className={styles.milestoneItem}
                    data-active={point.bashoSeq === selectedPoint?.bashoSeq}
                    onClick={() => onSelectBasho(point.bashoSeq)}
                  >
                    <span>{label}</span>
                    <strong>{point.bashoLabel}</strong>
                    <em>{point.rankLabel} / {point.recordCompactLabel}</em>
                  </button>
                ))}
            </div>
          </div>
        </div>

      </div>

      <div className={styles.heatmapBlock}>
        <div className={styles.heatmapHeader}>
          <span className={styles.summaryKicker}>場所別成績</span>
          <span>勝ち越し・負け越しの密度から流れを補足する</span>
        </div>
        <BashoHeatmapStrip
          points={ledger.points}
          selectedBashoSeq={viewState.selectedBashoSeq}
          onSelectBasho={onSelectBasho}
        />
      </div>
    </section>
  );
};
