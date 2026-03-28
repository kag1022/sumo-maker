import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Scale, ScrollText, Table2, Trophy, X } from "lucide-react";
import { type RikishiStatus } from "../../../logic/models";
import type {
  CareerBashoDetail,
  CareerBashoRecordsBySeq,
} from "../../../logic/persistence/careerHistory";
import { formatRankDisplayName } from "../../report/utils/reportShared";
import { buildBanzukeReviewTabModel } from "../../report/utils/banzukeReview";
import { NpcCareerPanel } from "../../shared/components/NpcCareerPanel";
import { buildNpcCareerDetail } from "../../shared/utils/npcCareerDetail";
import { Button } from "../../../shared/ui/Button";
import { CareerOverviewChapter } from "./CareerOverviewChapter";
import { CareerPlaceChapter } from "./CareerPlaceChapter";
import { CareerReviewChapter } from "./CareerReviewChapter";
import { CareerTrajectoryChapter } from "./CareerTrajectoryChapter";
import {
  buildCareerLedgerModel,
  buildCareerOverviewModel,
  buildCareerPlaceSummary,
  type CareerChapterId,
  type CareerPlaceTabId,
  type CareerWindowState,
} from "../utils/careerResultModel";

export interface CareerResultViewState extends CareerWindowState {
  selectedBashoSeq: number | null;
  activeChapter: CareerChapterId;
  placeTab: CareerPlaceTabId;
}

interface CareerResultPageProps {
  status: RikishiStatus;
  careerId: string | null;
  isSaved: boolean;
  yokozunaOrdinal?: number | null;
  detail: CareerBashoDetail | null;
  detailLoading: boolean;
  bashoRows: CareerBashoRecordsBySeq[];
  viewState: CareerResultViewState;
  onSelectBasho: (bashoSeq: number) => void;
  onViewStateChange: (patch: Partial<CareerResultViewState>) => void;
  onSave: () => void | Promise<void>;
  onOpenEra: () => void;
  onReturnToScout: () => void;
}

const CHAPTERS: Array<{
  id: CareerChapterId;
  label: string;
  icon: typeof Trophy;
}> = [
  { id: "overview", label: "総見", icon: Trophy },
  { id: "trajectory", label: "番付推移", icon: ScrollText },
  { id: "place", label: "場所別", icon: Table2 },
  { id: "review", label: "審議録", icon: Scale },
];

const chapterTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

export const CareerResultPage: React.FC<CareerResultPageProps> = ({
  status,
  careerId,
  isSaved,
  yokozunaOrdinal,
  detail,
  detailLoading,
  bashoRows,
  viewState,
  onSelectBasho,
  onViewStateChange,
  onSave,
  onOpenEra,
  onReturnToScout,
}) => {
  const heroRef = React.useRef<HTMLDivElement | null>(null);
  const chapterRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedNpcId, setSelectedNpcId] = React.useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const ledger = React.useMemo(() => buildCareerLedgerModel(status, bashoRows), [bashoRows, status]);
  const overview = React.useMemo(() => buildCareerOverviewModel(status, bashoRows), [bashoRows, status]);
  const selectedPoint =
    ledger.points.find((point) => point.bashoSeq === viewState.selectedBashoSeq) ??
    ledger.points[ledger.points.length - 1] ??
    null;
  const selectedNpc = React.useMemo(
    () => (selectedNpcId ? buildNpcCareerDetail(bashoRows, selectedNpcId, viewState.selectedBashoSeq) : null),
    [bashoRows, selectedNpcId, viewState.selectedBashoSeq],
  );
  const reviewModel = React.useMemo(
    () => buildBanzukeReviewTabModel({ detail, bashoRows }),
    [bashoRows, detail],
  );
  const placeSummary = React.useMemo(
    () => buildCareerPlaceSummary(detail, selectedPoint),
    [detail, selectedPoint],
  );

  const highestRankLabel =
    status.history.maxRank.name === "横綱" && yokozunaOrdinal
      ? `第${yokozunaOrdinal}代横綱`
      : formatRankDisplayName(status.history.maxRank);

  const scrollToHero = React.useCallback(() => {
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToChapterBody = React.useCallback(() => {
    chapterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setChapter = React.useCallback(
    (chapter: CareerChapterId) => {
      onViewStateChange({ activeChapter: chapter });
      setMobileNavOpen(false);
      window.requestAnimationFrame(() => {
        if (chapter === "overview") {
          scrollToHero();
          return;
        }
        scrollToChapterBody();
      });
    },
    [onViewStateChange, scrollToChapterBody, scrollToHero],
  );

  const openChapterWithPoint = React.useCallback(
    (chapter: Exclude<CareerChapterId, "overview">, bashoSeq?: number | null) => {
      if (typeof bashoSeq === "number") {
        onSelectBasho(bashoSeq);
      }
      setChapter(chapter);
    },
    [onSelectBasho, setChapter],
  );

  const activeChapterLabel = CHAPTERS.find((chapter) => chapter.id === viewState.activeChapter)?.label ?? "総見";

  return (
    <div className="career-result-page career-poster-page">
      <div ref={heroRef}>
        <CareerOverviewChapter
          status={status}
          overview={overview}
          ledger={ledger}
          highestRankLabel={highestRankLabel}
          selectedPoint={selectedPoint}
          isSaved={isSaved}
          onSave={onSave}
          onOpenEra={onOpenEra}
          onReturnToScout={onReturnToScout}
          onSelectBasho={onSelectBasho}
          onOpenChapter={openChapterWithPoint}
        />
      </div>

      <div className="career-ribbon-shell">
        <div className="career-ribbon">
          <div className="career-ribbon-current">
            <div className="career-ribbon-current-label">{activeChapterLabel}</div>
            <div className="career-ribbon-current-meta">
              {selectedPoint ? `${selectedPoint.bashoLabel} / ${selectedPoint.rankLabel}` : highestRankLabel}
            </div>
          </div>

          <div className="career-ribbon-track" role="tablist" aria-label="キャリア結果ナビゲーション">
            {CHAPTERS.map((chapter) => {
              const Icon = chapter.icon;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  className="career-ribbon-tab"
                  data-active={viewState.activeChapter === chapter.id}
                  onClick={() => setChapter(chapter.id)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{chapter.label}</span>
                </button>
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="career-ribbon-mobile-toggle"
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {mobileNavOpen ? (
            <motion.div
              className="career-ribbon-drawer"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <div className="career-ribbon-drawer-current">
                <div>{selectedPoint?.bashoLabel ?? "-"}</div>
                <div>{selectedPoint?.rankLabel ?? highestRankLabel}</div>
              </div>
              <div className="career-ribbon-drawer-list">
                {CHAPTERS.map((chapter) => {
                  const Icon = chapter.icon;
                  return (
                    <button
                      key={`mobile-${chapter.id}`}
                      type="button"
                      className="career-ribbon-drawer-tab"
                      data-active={viewState.activeChapter === chapter.id}
                      onClick={() => setChapter(chapter.id)}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{chapter.label}</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      <div ref={chapterRef} className="career-stage">
        <AnimatePresence mode="wait" initial={false}>
          {viewState.activeChapter === "trajectory" ? (
            <motion.div key="trajectory" {...chapterTransition}>
              <CareerTrajectoryChapter
                ledger={ledger}
                selectedPoint={selectedPoint}
                viewState={viewState}
                onSelectBasho={onSelectBasho}
                onWindowChange={(window) => onViewStateChange(window)}
                onOpenChapter={(chapter) => openChapterWithPoint(chapter, selectedPoint?.bashoSeq)}
              />
            </motion.div>
          ) : null}

          {viewState.activeChapter === "place" ? (
            <motion.div key="place" {...chapterTransition}>
              <CareerPlaceChapter
                point={selectedPoint}
                detail={detail}
                summary={placeSummary}
                placeTab={viewState.placeTab}
                isLoading={detailLoading}
                hasPersistence={Boolean(careerId)}
                onSelectNpc={setSelectedNpcId}
                onPlaceTabChange={(placeTab) => onViewStateChange({ placeTab })}
              />
            </motion.div>
          ) : null}

          {viewState.activeChapter === "review" ? (
            <motion.div key="review" {...chapterTransition}>
              <CareerReviewChapter
                model={reviewModel}
                isLoading={detailLoading}
                emptyLabel={careerId ? "この場所の番付審議はまだ保存されていません。" : "保存後に番付審議を開けます。"}
                onSelectNpc={setSelectedNpcId}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>

      {selectedNpc ? <NpcCareerPanel detail={selectedNpc} onClear={() => setSelectedNpcId(null)} /> : null}
    </div>
  );
};
