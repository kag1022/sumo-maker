import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, ScrollText } from "lucide-react";
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

const SLOT_WIDTH = 64;
const MIN_CANVAS_WIDTH = 880;
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

  const visibleIndexBySeq = React.useMemo(
    () => new Map(visiblePoints.map((point, index) => [point.bashoSeq, index])),
    [visiblePoints],
  );
  const canvasWidth = Math.max(MIN_CANVAS_WIDTH, visiblePoints.length * SLOT_WIDTH);
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

  return (
    <section className={styles.shell}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>番付推移</div>
          <h2 className={styles.title}>番付履歴簿</h2>
        </div>
      </div>

      <div className={styles.filters}>
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
      </div>

      <BashoHeatmapStrip
        points={ledger.points}
        selectedBashoSeq={viewState.selectedBashoSeq}
        onSelectBasho={onSelectBasho}
      />

      <div className={styles.layout}>
        <div className={styles.mainPanel}>
          <div className={styles.scroll}>
            <div className={styles.yearStrip} style={{ width: `${canvasWidth + 94}px` }}>
              <div className={styles.yearStripGutter} />
              <div className={styles.yearStripTrack} style={{ width: `${canvasWidth}px` }}>
                {ledger.yearBands.map((band) => (
                  <div
                    key={`year-strip-${band.year}`}
                    className={styles.yearLabel}
                    style={{
                      left: `${(band.startSeq - 1) * SLOT_WIDTH}px`,
                      width: `${Math.max(72, band.size * SLOT_WIDTH)}px`,
                    }}
                  >
                    {band.label}
                  </div>
                ))}
              </div>
            </div>

            <div
              className={styles.ledger}
              style={{
                gridTemplateRows: `${CAREER_LEDGER_BANDS.map((band) => `${band.weight}fr`).join(" ")} auto`,
              }}
            >
              {CAREER_LEDGER_BANDS.map((band) => {
                const rowPoints = visiblePoints.filter((point) => point.bandKey === band.key);
                const groups = [...new Set(rowPoints.map((point) => point.continuityGroupId))]
                  .map((groupId) => {
                    const members = rowPoints.filter((point) => point.continuityGroupId === groupId);
                    return {
                      groupId,
                      start: visibleIndexBySeq.get(members[0].bashoSeq) ?? 0,
                      end: visibleIndexBySeq.get(members[members.length - 1].bashoSeq) ?? 0,
                    };
                  });

                return (
                  <React.Fragment key={band.key}>
                    <div className={styles.bandLabel} data-band={band.key}>{band.label}</div>
                    <div className={styles.bandTrack} data-band={band.key} style={{ width: `${canvasWidth}px` }}>
                      <div className={styles.bandWash} data-band={band.key} />
                      {groups.map((group) => (
                        <div
                          key={`${band.key}-${group.groupId}`}
                          className={styles.continuity}
                          style={{
                            left: `${group.start * SLOT_WIDTH + 16}px`,
                            width: `${Math.max(20, (group.end - group.start) * SLOT_WIDTH + 32)}px`,
                          }}
                        />
                      ))}
                      {rowPoints.map((point) => {
                        const visibleIndex = visibleIndexBySeq.get(point.bashoSeq) ?? 0;
                        const isSelected = point.bashoSeq === selectedPoint?.bashoSeq;
                        const hasMilestone = point.milestoneTags.length > 0;
                        const primaryMilestone = resolvePrimaryMilestone(point.milestoneTags);
                        return (
                          <motion.button
                            layout
                            key={`ledger-${point.bashoSeq}`}
                            type="button"
                            className={styles.chip}
                            data-selected={isSelected}
                            data-absence={point.isFullAbsence}
                            data-event={hasMilestone}
                            data-emphasis={mode === "milestones" && hasMilestone}
                            title={`${point.bashoLabel} / ${point.rankLabel} / ${point.recordLabel}`}
                            style={{ left: `${visibleIndex * SLOT_WIDTH + 10}px` }}
                            onClick={() => onSelectBasho(point.bashoSeq)}
                          >
                            {primaryMilestone ? (
                              <span className={styles.chipBadge} data-emphasis={mode === "milestones" && hasMilestone}>
                                {primaryMilestone}
                              </span>
                            ) : null}
                            <span className={styles.chipRank}>{point.rankShortLabel}</span>
                            {isSelected ? <span className={styles.chipRecord}>{point.recordCompactLabel}</span> : null}
                          </motion.button>
                        );
                      })}
                    </div>
                  </React.Fragment>
                );
              })}

              <div className={styles.bandLabel} data-band="axis">
                <span className={styles.axisLabel}>時</span>
              </div>
              <div className={styles.axisTrack} style={{ width: `${canvasWidth}px` }}>
                {visiblePoints.map((point, index) => (
                  <span
                    key={`axis-${point.bashoSeq}`}
                    className={styles.tick}
                    style={{ left: `${index * SLOT_WIDTH + 8}px` }}
                  >
                    {point.axisLabel}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className={styles.detailPanel}>
          <div>
            <div className={styles.summaryKicker}>選択中の場所</div>
            <h3 className={styles.detailTitle}>
              {selectionSummary?.bashoLabel ?? selectedPoint?.bashoLabel ?? "場所未選択"}
            </h3>
            <p className={styles.detailCopy}>
              {selectionSummary?.recordLabel ?? "場所を選ぶと、この場所の意味を右側で読めます。"}
            </p>
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
    </section>
  );
};
