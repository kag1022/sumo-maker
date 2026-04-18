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
    <section className="career-workspace-shell">
      <div className="career-workspace-head">
        <div>
          <div className="career-workspace-kicker">番付推移</div>
          <h2 className="career-workspace-title">番付履歴簿</h2>
        </div>
      </div>

      <div className="career-workspace-filters">
        <div className="career-workspace-modebar" role="tablist" aria-label="番付推移の表示モード">
          <button
            type="button"
            className="career-workspace-modechip"
            data-active={mode === "standard"}
            onClick={() => setMode("standard")}
          >
            標準
          </button>
          <button
            type="button"
            className="career-workspace-modechip"
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

      <div className="career-workspace-layout">
        <div className="career-workspace-mainpanel">
          <div className="career-workspace-scroll">
            <div className="career-workspace-yearstrip" style={{ width: `${canvasWidth + 94}px` }}>
              <div className="career-workspace-yearstrip-gutter" />
              <div className="career-workspace-yearstrip-track" style={{ width: `${canvasWidth}px` }}>
                {ledger.yearBands.map((band) => (
                  <div
                    key={`year-strip-${band.year}`}
                    className="career-workspace-yearlabel"
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
              className="career-workspace-ledger"
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
                    <div className="career-workspace-bandlabel">{band.label}</div>
                    <div className="career-workspace-bandtrack" style={{ width: `${canvasWidth}px` }}>
                      <div className="career-workspace-bandwash" />
                      {groups.map((group) => (
                        <div
                          key={`${band.key}-${group.groupId}`}
                          className="career-workspace-continuity"
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
                            className="career-workspace-chip"
                            data-selected={isSelected}
                            data-absence={point.isFullAbsence}
                            data-event={hasMilestone}
                            data-emphasis={mode === "milestones" && hasMilestone}
                            title={`${point.bashoLabel} / ${point.rankLabel} / ${point.recordLabel}`}
                            style={{ left: `${visibleIndex * SLOT_WIDTH + 10}px` }}
                            onClick={() => onSelectBasho(point.bashoSeq)}
                          >
                            {primaryMilestone ? (
                              <span className="career-workspace-chip-badge" data-emphasis={mode === "milestones" && hasMilestone}>
                                {primaryMilestone}
                              </span>
                            ) : null}
                            <span className="career-workspace-chip-rank">{point.rankShortLabel}</span>
                            {isSelected ? <span className="career-workspace-chip-record">{point.recordCompactLabel}</span> : null}
                          </motion.button>
                        );
                      })}
                    </div>
                  </React.Fragment>
                );
              })}

              <div className="career-workspace-bandlabel career-workspace-axislabel">時</div>
              <div className="career-workspace-axistrack" style={{ width: `${canvasWidth}px` }}>
                {visiblePoints.map((point, index) => (
                  <span
                    key={`axis-${point.bashoSeq}`}
                    className="career-workspace-tick"
                    style={{ left: `${index * SLOT_WIDTH + 8}px` }}
                  >
                    {point.axisLabel}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <aside className="career-workspace-detailpanel">
          <div className="career-workspace-detailhead">
            <div className="career-workspace-summary-kicker">選択中の場所</div>
            <h3 className="career-workspace-detailtitle">
              {selectionSummary?.bashoLabel ?? selectedPoint?.bashoLabel ?? "場所未選択"}
            </h3>
            <p className="career-workspace-detailcopy">
              {selectionSummary?.recordLabel ?? "場所を選ぶと、この場所の意味を右側で読めます。"}
            </p>
          </div>

          <div className="career-workspace-detailmetrics">
            <article className="career-workspace-detailmetric">
              <span>場所</span>
              <strong>{selectionSummary?.bashoLabel ?? "-"}</strong>
            </article>
            <article className="career-workspace-detailmetric">
              <span>番付</span>
              <strong>{selectionSummary?.rankLabel ?? "-"}</strong>
            </article>
            <article className="career-workspace-detailmetric">
              <span>成績</span>
              <strong>{selectionSummary?.recordLabel ?? "-"}</strong>
            </article>
            <article className="career-workspace-detailmetric">
              <span>昇降幅</span>
              <strong>{selectionSummary?.deltaLabel ?? "-"}</strong>
            </article>
          </div>

          <div className="career-workspace-detailtags">
            {(detailTags.length ? detailTags : headlineMilestone ? [headlineMilestone] : []).map((tag) => (
              <span key={tag} className="career-workspace-detailtag">
                {tag}
              </span>
            ))}
          </div>

          <div className="career-workspace-detailnote">
            <div className="career-workspace-detailnote-label">この場所の要点</div>
            <p>{detailLoading ? "読込中" : summaryNote}</p>
          </div>

          <div className="career-workspace-detailcompare">
            <div className="career-workspace-detailnote-label">前後比較</div>
            <div className="career-workspace-detailcompare-grid">
              <article className="career-workspace-detailcompare-item">
                <span>前の場所</span>
                <strong>{previousPoint ? `${previousPoint.bashoLabel} / ${previousPoint.rankLabel}` : "なし"}</strong>
                <em>{previousPoint?.recordLabel ?? "比較対象なし"}</em>
              </article>
              <article className="career-workspace-detailcompare-item">
                <span>次の場所</span>
                <strong>{nextPoint ? `${nextPoint.bashoLabel} / ${nextPoint.rankLabel}` : "なし"}</strong>
                <em>{nextPoint?.recordLabel ?? "比較対象なし"}</em>
              </article>
            </div>
          </div>

          <div className="career-workspace-detailactions">
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
