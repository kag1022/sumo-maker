import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, ScrollText } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import {
  CAREER_LEDGER_BANDS,
  type CareerLedgerModel,
  type CareerLedgerPoint,
  type CareerWindowState,
} from "../utils/careerResultModel";

interface CareerTrajectoryChapterProps {
  ledger: CareerLedgerModel;
  selectedPoint: CareerLedgerPoint | null;
  viewState: CareerWindowState & { selectedBashoSeq: number | null };
  onSelectBasho: (bashoSeq: number) => void;
  onWindowChange: (window: CareerWindowState) => void;
  onOpenChapter: (chapter: "place" | "review") => void;
}

const SLOT_WIDTH = 58;
const MIN_CANVAS_WIDTH = 820;

export const CareerTrajectoryChapter: React.FC<CareerTrajectoryChapterProps> = ({
  ledger,
  selectedPoint,
  viewState,
  onSelectBasho,
  onWindowChange,
  onOpenChapter,
}) => {
  const visiblePoints = React.useMemo(
    () =>
      ledger.points.filter(
        (point) =>
          point.bashoSeq >= viewState.visibleWindowStartSeq &&
          point.bashoSeq <= viewState.visibleWindowEndSeq,
      ),
    [ledger.points, viewState.visibleWindowEndSeq, viewState.visibleWindowStartSeq],
  );

  const visibleIndexBySeq = React.useMemo(
    () => new Map(visiblePoints.map((point, index) => [point.bashoSeq, index])),
    [visiblePoints],
  );
  const canvasWidth = Math.max(MIN_CANVAS_WIDTH, visiblePoints.length * SLOT_WIDTH);

  return (
    <section className="career-workspace-shell">
      <div className="career-workspace-head">
        <div>
          <div className="career-workspace-kicker">番付推移</div>
          <h2 className="career-workspace-title">番付履歴簿</h2>
        </div>
        <div className="career-workspace-head-actions">
          <Button variant="ghost" size="sm" onClick={() => selectedPoint && onOpenChapter("place")} disabled={!selectedPoint}>
            場所別
          </Button>
          <Button variant="ghost" size="sm" onClick={() => selectedPoint && onOpenChapter("review")} disabled={!selectedPoint}>
            審議録
          </Button>
        </div>
      </div>

      <div className="career-workspace-yearbands">
        {ledger.yearBands.map((band) => {
          const active =
            band.startSeq <= viewState.visibleWindowEndSeq && band.endSeq >= viewState.visibleWindowStartSeq;
          const selected =
            selectedPoint != null &&
            selectedPoint.bashoSeq >= band.startSeq &&
            selectedPoint.bashoSeq <= band.endSeq;
          return (
            <button
              key={band.year}
              type="button"
              className="career-workspace-yearchip"
              data-active={active}
              data-selected={selected}
              style={{ flexGrow: Math.max(1, band.size) }}
              onClick={() => {
                onWindowChange({
                  visibleWindowStartSeq: band.startSeq,
                  visibleWindowEndSeq: band.endSeq,
                });
                onSelectBasho(selectedPoint && selected ? selectedPoint.bashoSeq : band.endSeq);
              }}
            >
              <span>{band.label}</span>
              <span>{band.size}</span>
            </button>
          );
        })}
      </div>

      <div className="career-workspace-scroll">
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
                        left: `${group.start * SLOT_WIDTH + 14}px`,
                        width: `${Math.max(18, (group.end - group.start) * SLOT_WIDTH + 30)}px`,
                      }}
                    />
                  ))}
                  {rowPoints.map((point) => {
                    const visibleIndex = visibleIndexBySeq.get(point.bashoSeq) ?? 0;
                    return (
                      <motion.button
                        layout
                        key={`ledger-${point.bashoSeq}`}
                        type="button"
                        className="career-workspace-chip"
                        data-selected={point.bashoSeq === selectedPoint?.bashoSeq}
                        data-absence={point.isFullAbsence}
                        data-event={point.eventFlags.length > 0}
                        title={`${point.bashoLabel} / ${point.rankLabel} / ${point.recordLabel}`}
                        style={{ left: `${visibleIndex * SLOT_WIDTH + 8}px` }}
                        onClick={() => onSelectBasho(point.bashoSeq)}
                      >
                        <span className="career-workspace-chip-rank">{point.rankShortLabel}</span>
                        <span className="career-workspace-chip-record">{point.recordCompactLabel}</span>
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
                style={{ left: `${index * SLOT_WIDTH + 4}px` }}
              >
                {point.axisLabel}
              </span>
            ))}
          </div>
        </div>
      </div>

      <motion.div layout className="career-workspace-summary">
        <div className="career-workspace-summary-copy">
          <div className="career-workspace-summary-kicker">選択場所</div>
          <div className="career-workspace-summary-title">
            {selectedPoint ? `${selectedPoint.bashoLabel} / ${selectedPoint.rankLabel}` : "場所未選択"}
          </div>
          <div className="career-workspace-summary-text">
            {selectedPoint
              ? `${selectedPoint.recordLabel}${selectedPoint.milestoneTags.length > 0 ? ` / ${selectedPoint.milestoneTags.join(" / ")}` : ""}`
              : "履歴札を選ぶと、その場所を場所別と審議録へ引き継ぎます。"}
          </div>
        </div>
        <div className="career-workspace-summary-actions">
          <Button variant="secondary" onClick={() => selectedPoint && onOpenChapter("place")} disabled={!selectedPoint}>
            <ArrowRight className="mr-2 h-4 w-4" />
            場所別へ
          </Button>
          <Button variant="ghost" onClick={() => selectedPoint && onOpenChapter("review")} disabled={!selectedPoint}>
            <ScrollText className="mr-2 h-4 w-4" />
            審議録へ
          </Button>
        </div>
      </motion.div>
    </section>
  );
};
