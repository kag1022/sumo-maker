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
import type { DetailBuildProgress } from "../../../logic/simulation/workerProtocol";

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
  detailState: "idle" | "building" | "ready" | "error";
  detailBuildProgress: DetailBuildProgress | null;
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
  detailState,
  detailBuildProgress,
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
  const activeChapterLabel = CHAPTERS.find((chapter) => chapter.id === viewState.activeChapter)?.label ?? "総見";
  const selectedMeta = selectedPoint ? `${selectedPoint.bashoLabel} / ${selectedPoint.rankLabel}` : highestRankLabel;
  const canReadDetails = detailState === "ready";
  const detailLoadingLabel =
    detailState === "building"
      ? `詳細記録を整理中 ${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? bashoRows.length}`
      : detailState === "error"
        ? "詳細記録の整理に失敗しました。"
        : "詳細記録はまだ準備されていません。";

  const scrollToHero = React.useCallback(() => {
    heroRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const scrollToChapterBody = React.useCallback(() => {
    chapterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setChapter = React.useCallback(
    (chapter: CareerChapterId) => {
      if (!canReadDetails && chapter !== "overview") {
        return;
      }
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
    [canReadDetails, onViewStateChange, scrollToChapterBody, scrollToHero],
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

  return (
    <div className="career-ledger-page">
      <div ref={heroRef} className="career-ledger-cover">
        <CareerOverviewChapter
          status={status}
          overview={overview}
          ledger={ledger}
          highestRankLabel={highestRankLabel}
          selectedPoint={selectedPoint}
          isSaved={isSaved}
          detailState={detailState}
          detailBuildProgress={detailBuildProgress}
          onSave={onSave}
          onOpenEra={onOpenEra}
          onReturnToScout={onReturnToScout}
          onSelectBasho={onSelectBasho}
          onOpenChapter={openChapterWithPoint}
        />
      </div>

      <div className="career-ledger-ribbon-shell">
        <div className="career-ledger-ribbon">
          <div className="career-ledger-ribbon-current">
            <div className="career-ledger-ribbon-label">{activeChapterLabel}</div>
            <div className="career-ledger-ribbon-meta">
              {selectedMeta}
            </div>
          </div>

          <div className="career-ledger-ribbon-track" role="tablist" aria-label="キャリア結果ナビゲーション">
            {CHAPTERS.map((chapter) => {
              const Icon = chapter.icon;
              return (
                <button
                  key={chapter.id}
                  type="button"
                  className="career-ledger-ribbon-tab disabled:cursor-not-allowed disabled:opacity-40"
                  data-active={viewState.activeChapter === chapter.id}
                  disabled={!canReadDetails && chapter.id !== "overview"}
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
            className="career-ledger-ribbon-mobile-toggle"
            onClick={() => setMobileNavOpen((current) => !current)}
          >
            {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        <AnimatePresence initial={false}>
          {mobileNavOpen ? (
            <motion.div
              className="career-ledger-ribbon-drawer"
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              <div className="career-ledger-ribbon-drawer-current">
                <div>{selectedPoint?.bashoLabel ?? "-"}</div>
                <div>{selectedPoint?.rankLabel ?? highestRankLabel}</div>
              </div>
              <div className="career-ledger-ribbon-drawer-list">
                {CHAPTERS.map((chapter) => {
                  const Icon = chapter.icon;
                  return (
                    <button
                      key={`mobile-${chapter.id}`}
                      type="button"
                      className="career-ledger-ribbon-drawer-tab disabled:cursor-not-allowed disabled:opacity-40"
                      data-active={viewState.activeChapter === chapter.id}
                      disabled={!canReadDetails && chapter.id !== "overview"}
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

      <div ref={chapterRef} className="career-ledger-body">
        <AnimatePresence mode="wait" initial={false}>
          {viewState.activeChapter === "overview" ? (
            <motion.section key="overview" className="career-ledger-reading-note" {...chapterTransition}>
              <div className="career-ledger-reading-kicker">本文の入口</div>
              <div className="career-ledger-reading-title">
                {canReadDetails ? "表紙を読み終えたら、下の章から掘り下げます。" : "表紙は開けますが、詳細章は記録整理後に開きます。"}
              </div>
              <p className="career-ledger-reading-copy">
                {canReadDetails
                  ? "番付推移で時系列を掴み、場所別でその場所を読み、審議録で昇降の判断を確かめる構成です。"
                  : detailLoadingLabel}
              </p>
            </motion.section>
          ) : null}

          {viewState.activeChapter === "trajectory" && canReadDetails ? (
            <motion.div key="trajectory" {...chapterTransition}>
              <CareerTrajectoryChapter
                ledger={ledger}
                selectedPoint={selectedPoint}
                selectionSummary={placeSummary}
                detail={detail}
                detailLoading={detailLoading}
                hasPersistence={Boolean(careerId)}
                viewState={viewState}
                onSelectBasho={onSelectBasho}
                onWindowChange={(window) => onViewStateChange(window)}
                onOpenChapter={(chapter) => openChapterWithPoint(chapter, selectedPoint?.bashoSeq)}
              />
            </motion.div>
          ) : null}

          {viewState.activeChapter === "place" && canReadDetails ? (
            <motion.div key="place" className="career-ledger-split" {...chapterTransition}>
              <div className="career-ledger-mainpane">
                <CareerPlaceChapter
                  ledger={ledger}
                  point={selectedPoint}
                  detail={detail}
                  summary={placeSummary}
                  placeTab={viewState.placeTab}
                  isLoading={detailLoading}
                  hasPersistence={Boolean(careerId)}
                  onSelectBasho={onSelectBasho}
                  onSelectNpc={setSelectedNpcId}
                  onPlaceTabChange={(placeTab) => onViewStateChange({ placeTab })}
                />
              </div>
              <aside className="career-ledger-sidepane">
                {selectedNpc ? (
                  <NpcCareerPanel detail={selectedNpc} onClear={() => setSelectedNpcId(null)} />
                ) : (
                  <div className="career-ledger-sideempty">
                    <div className="career-ledger-sideempty-kicker">補助欄</div>
                    <div className="career-ledger-sideempty-title">近傍力士を開く</div>
                    <p>番付や取組に表示される力士名を選ぶと、この場所で接していた相手の略歴を右側に表示します。</p>
                  </div>
                )}
              </aside>
            </motion.div>
          ) : null}

          {viewState.activeChapter === "review" && canReadDetails ? (
            <motion.div key="review" className="career-ledger-split" {...chapterTransition}>
              <div className="career-ledger-mainpane">
                <CareerReviewChapter
                  model={reviewModel}
                  isLoading={detailLoading}
                  emptyLabel={careerId ? "この場所の番付審議はまだ保存されていません。" : "保存後に番付審議を開けます。"}
                  onSelectNpc={setSelectedNpcId}
                />
              </div>
              <aside className="career-ledger-sidepane">
                {selectedNpc ? (
                  <NpcCareerPanel detail={selectedNpc} onClear={() => setSelectedNpcId(null)} />
                ) : (
                  <div className="career-ledger-sideempty">
                    <div className="career-ledger-sideempty-kicker">補助欄</div>
                    <div className="career-ledger-sideempty-title">周辺事情</div>
                    <p>近傍番付から他力士を選ぶと、審議の前後でどんな顔ぶれが並んでいたかを補助欄で確認できます。</p>
                  </div>
                )}
              </aside>
            </motion.div>
          ) : null}

          {viewState.activeChapter !== "overview" && !canReadDetails ? (
            <motion.section key="detail-lock" className="career-ledger-reading-note" {...chapterTransition}>
              <div className="career-ledger-reading-kicker">記録整理中</div>
              <div className="career-ledger-reading-title">詳細章はまだ開けません。</div>
              <p className="career-ledger-reading-copy">{detailLoadingLabel}</p>
            </motion.section>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
};
