import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Crown, MapPinned, ScrollText, Sparkles, TrendingUp } from "lucide-react";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { Button } from "../../../shared/ui/Button";
import { BashoHeatmapStrip } from "./BashoHeatmapStrip";
import {
  CAREER_LEDGER_BANDS,
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
  "横綱昇進",
  "新大関",
  "再大関",
  "新三役",
  "再三役",
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
  const peakPoint = React.useMemo(
    () =>
      ledger.points.reduce<CareerLedgerPoint | null>((best, point) => {
        if (!best) return point;
        return point.ordinalBucket < best.ordinalBucket ? point : best;
      }, null),
    [ledger.points],
  );
  const milestoneCount = React.useMemo(
    () => ledger.points.filter((point) => point.milestoneTags.some((tag) => !HIDDEN_VISUAL_TAGS.has(tag))).length,
    [ledger.points],
  );
  const sekitoriCount = React.useMemo(
    () => ledger.points.filter((point) => point.bandKey === "YOKOZUNA" || point.bandKey === "OZEKI" || point.bandKey === "SEKIWAKE" || point.bandKey === "KOMUSUBI" || point.bandKey === "MAEGASHIRA" || point.bandKey === "JURYO").length,
    [ledger.points],
  );
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
          <strong>{peakPoint?.rankLabel ?? "-"}</strong>
        </article>
        <article className={styles.summaryTile}>
          <MapPinned className="h-4 w-4" />
          <span>在位場所</span>
          <strong>{ledger.points.length}場所</strong>
        </article>
        <article className={styles.summaryTile}>
          <Sparkles className="h-4 w-4" />
          <span>節目</span>
          <strong>{milestoneCount}件</strong>
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

      <div className={styles.layout}>
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
                <span>最高 {selectedYearSummary.best?.rankLabel ?? "-"}</span>
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
