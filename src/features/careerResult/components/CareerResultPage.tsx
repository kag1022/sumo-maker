import React from "react";
import { motion } from "framer-motion";
import { type CareerSaveTag, type ObservationStanceId, type RikishiStatus } from "../../../logic/models";
import type {
  CareerBashoDetail,
  CareerBashoRecordsBySeq,
} from "../../../logic/persistence/careerHistory";
import { formatHighestRankDisplayName } from "../../../logic/ranking";
import { NpcCareerPanel } from "../../shared/components/NpcCareerPanel";
import { buildNpcCareerDetail } from "../../shared/utils/npcCareerDetail";
import { CareerEncyclopediaChapter } from "./CareerEncyclopediaChapter";
import { CareerWorldSection } from "./CareerWorldSection";
import { CareerPlaceChapter } from "./CareerPlaceChapter";
import { CareerTrajectoryChapter } from "./CareerTrajectoryChapter";
import { ObservationConsoleHeader } from "./page/ObservationConsoleHeader";
import {
  buildCareerLedgerModel,
  buildCareerDesignReadingModel,
  buildCareerOverviewModel,
  buildCareerPlaceSummary,
  type CareerChapterId,
  type CareerPlaceTabId,
  type CareerWindowState,
} from "../utils/careerResultModel";
import type { DetailBuildProgress } from "../../../logic/simulation/workerProtocol";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { Button } from "../../../shared/ui/Button";
import styles from "./CareerResultPage.module.css";

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
  observationPointsAwarded?: number;
  observationStanceId?: ObservationStanceId;
  viewState: CareerResultViewState;
  onSelectBasho: (bashoSeq: number) => void;
  onViewStateChange: (patch: Partial<CareerResultViewState>) => void;
  onSave: (metadata?: { saveTags?: CareerSaveTag[]; observerMemo?: string }) => void | Promise<void>;
  onReturnToScout: () => void;
  onOpenArchive: () => void;
}

const chapterTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: "easeOut" as const },
};

export const CareerResultPage: React.FC<CareerResultPageProps> = (props) => {
  const { locale } = useLocale();
  if (locale === "en") {
    return <CareerResultEnglishPage {...props} />;
  }
  return <CareerResultJapanesePage {...props} />;
};

const CareerResultJapanesePage: React.FC<CareerResultPageProps> = ({
  status,
  careerId,
  isSaved,
  yokozunaOrdinal,
  detail,
  detailLoading,
  bashoRows,
  detailState,
  detailBuildProgress,
  observationPointsAwarded,
  observationStanceId,
  viewState,
  onSelectBasho,
  onViewStateChange,
  onSave,
  onReturnToScout,
  onOpenArchive,
}) => {
  const chapterRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedNpcId, setSelectedNpcId] = React.useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const ledger = React.useMemo(() => buildCareerLedgerModel(status, bashoRows), [bashoRows, status]);
  const overview = React.useMemo(() => buildCareerOverviewModel(status, bashoRows), [bashoRows, status]);
  const designReading = React.useMemo(
    () => buildCareerDesignReadingModel(status, { careerId }),
    [careerId, status],
  );
  const selectedPoint =
    ledger.points.find((point) => point.bashoSeq === viewState.selectedBashoSeq) ??
    ledger.points[ledger.points.length - 1] ??
    null;
  const selectedNpc = React.useMemo(
    () => (selectedNpcId ? buildNpcCareerDetail(detail, selectedNpcId, status.stableId) : null),
    [detail, selectedNpcId, status.stableId],
  );
  const placeSummary = React.useMemo(
    () => buildCareerPlaceSummary(detail, selectedPoint),
    [detail, selectedPoint],
  );

  const highestRankLabel =
    status.history.maxRank.name === "横綱" && yokozunaOrdinal
      ? `第${yokozunaOrdinal}代横綱`
      : formatHighestRankDisplayName(status.history.maxRank);
  const selectedMeta = selectedPoint ? `${selectedPoint.bashoLabel} / ${selectedPoint.rankLabel}` : highestRankLabel;
  const canReadDetails = detailState === "ready";
  const detailLoadingLabel =
    detailState === "building"
      ? `詳細記録を整理中 ${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? bashoRows.length}`
      : detailState === "error"
        ? "詳細記録の整理に失敗しました。"
        : "詳細記録はまだ準備されていません。";

  const scrollToChapterBody = React.useCallback(() => {
    chapterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setChapter = React.useCallback(
    (chapter: CareerChapterId) => {
      if (!canReadDetails && chapter !== "encyclopedia") {
        return;
      }
      onViewStateChange({ activeChapter: chapter });
      setMobileNavOpen(false);
      window.requestAnimationFrame(() => {
        scrollToChapterBody();
      });
    },
    [canReadDetails, onViewStateChange, scrollToChapterBody],
  );

  const openChapterWithPoint = React.useCallback(
    (chapter: "encyclopedia" | "place", bashoSeq?: number | null) => {
      if (typeof bashoSeq === "number") {
        onSelectBasho(bashoSeq);
      }
      setChapter(chapter);
    },
    [onSelectBasho, setChapter],
  );

  return (
    <div className={styles.page}>
      <ObservationConsoleHeader
        subjectId={status.shikona}
        subjectName={status.shikona}
        highestRankLabel={highestRankLabel}
        selectedMeta={selectedMeta}
        activeChapter={viewState.activeChapter}
        detailState={detailState}
        canReadDetails={canReadDetails}
        onSelectChapter={setChapter}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((current) => !current)}
      />

      <div ref={chapterRef} className={styles.body}>
        {viewState.activeChapter === "encyclopedia" ? (
          <motion.div key="encyclopedia" className="space-y-4" {...chapterTransition}>
            <CareerEncyclopediaChapter
              status={status}
              overview={overview}
              designReading={designReading}
              highestRankLabel={highestRankLabel}
              ledgerPoints={ledger.points}
              bashoRows={bashoRows}
              isSaved={isSaved}
              detailState={detailState}
              detailBuildProgress={detailBuildProgress}
              observationPointsAwarded={observationPointsAwarded}
              observationStanceId={observationStanceId}
              onSave={onSave}
              onReturnToScout={onReturnToScout}
              onOpenArchive={onOpenArchive}
              onOpenChapter={(chapter) => setChapter(chapter)}
            />
            <section className={styles.readingNote}>
              <div className={styles.readingKicker}>閲覧案内</div>
              <div className={styles.readingTitle}>
                {canReadDetails ? "力士名鑑から番付推移と場所別記録へ読み進めます。" : "力士名鑑は先に開けますが、他のページは整理完了後に開きます。"}
              </div>
              <p className={styles.readingCopy}>
                {canReadDetails
                  ? "まず一代の輪郭を力士名鑑で掴み、番付推移と場所別記録で根拠を読み込みます。"
                  : detailLoadingLabel}
              </p>
            </section>
            <CareerWorldSection status={status} careerId={careerId} bashoRows={bashoRows} />
          </motion.div>
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
          <motion.div key="place" className={styles.split} {...chapterTransition}>
            <div className={styles.mainPane}>
              <CareerPlaceChapter
                ledger={ledger}
                point={selectedPoint}
                detail={detail}
                summary={placeSummary}
                playerStableId={status.stableId}
                placeTab={viewState.placeTab}
                isLoading={detailLoading}
                hasPersistence={Boolean(careerId)}
                onSelectBasho={onSelectBasho}
                onSelectNpc={setSelectedNpcId}
                onPlaceTabChange={(placeTab) => onViewStateChange({ placeTab })}
              />
            </div>
            <aside className={styles.sidePane}>
              {selectedNpc ? (
                <NpcCareerPanel detail={selectedNpc} onClear={() => setSelectedNpcId(null)} />
              ) : (
                <div className={styles.sideEmpty}>
                  <div className={styles.sideEmptyKicker}>補助欄</div>
                  <div className={styles.sideEmptyTitle}>周辺力士を見る</div>
                  <p className={styles.sideEmptyCopy}>場所別記録の番付や取組から力士名を選ぶと、この場所で残った番付行をこの補助欄に表示します。</p>
                </div>
              )}
            </aside>
          </motion.div>
        ) : null}

        {viewState.activeChapter !== "encyclopedia" && !canReadDetails ? (
          <motion.section key="detail-lock" className={styles.readingNote} {...chapterTransition}>
            <div className={styles.readingKicker}>整理中</div>
            <div className={styles.readingTitle}>詳細ページはまだ開けません。</div>
            <p className={styles.readingCopy}>{detailLoadingLabel}</p>
          </motion.section>
        ) : null}
      </div>
    </div>
  );
};

const formatEnglishRecord = (wins: number, losses: number, absent: number): string =>
  `${wins}-${losses}${absent > 0 ? `, ${absent} absences` : ""}`;

const CareerResultEnglishPage: React.FC<CareerResultPageProps> = ({
  status,
  careerId,
  isSaved,
  yokozunaOrdinal,
  detail,
  detailLoading,
  detailState,
  detailBuildProgress,
  observationPointsAwarded,
  bashoRows,
  viewState,
  onSelectBasho,
  onViewStateChange,
  onSave,
  onReturnToScout,
  onOpenArchive,
}) => {
  const chapterRef = React.useRef<HTMLDivElement | null>(null);
  const [selectedNpcId, setSelectedNpcId] = React.useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const ledger = React.useMemo(() => buildCareerLedgerModel(status, bashoRows, "en"), [bashoRows, status]);
  const overview = React.useMemo(() => buildCareerOverviewModel(status, bashoRows, "en"), [bashoRows, status]);
  const selectedPoint =
    ledger.points.find((point) => point.bashoSeq === viewState.selectedBashoSeq) ??
    ledger.points[ledger.points.length - 1] ??
    null;
  const selectedNpc = React.useMemo(
    () => (selectedNpcId ? buildNpcCareerDetail(detail, selectedNpcId, status.stableId) : null),
    [detail, selectedNpcId, status.stableId],
  );
  const placeSummary = React.useMemo(
    () => buildCareerPlaceSummary(detail, selectedPoint),
    [detail, selectedPoint],
  );
  const nonMaezumoRecords = status.history.records.filter((record) => record.rank.division !== "Maezumo");
  const highestRankLabel =
    status.history.maxRank.name === "横綱" && yokozunaOrdinal
      ? `No. ${yokozunaOrdinal} Yokozuna`
      : formatHighestRankDisplayName(status.history.maxRank, "en");
  const totalRecordLabel = formatEnglishRecord(
    status.history.totalWins,
    status.history.totalLosses,
    status.history.totalAbsent,
  );
  const makuuchiYusho = status.history.yushoCount.makuuchi ?? 0;
  const lowerYusho =
    (status.history.yushoCount.juryo ?? 0) +
    (status.history.yushoCount.makushita ?? 0) +
    (status.history.yushoCount.others ?? 0);
  const detailLabel =
    detailState === "ready"
      ? "Detailed record ready"
      : detailState === "building"
        ? `Building details ${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? bashoRows.length}`
        : detailState === "error"
          ? "Detail build failed"
          : "Detailed record pending";
  const finalRecord = nonMaezumoRecords[nonMaezumoRecords.length - 1];
  const finalRank = finalRecord ? formatHighestRankDisplayName(finalRecord.rank, "en") : "-";
  const selectedMeta = selectedPoint ? `${selectedPoint.bashoLabel} / ${selectedPoint.rankLabel}` : highestRankLabel;
  const canReadDetails = detailState === "ready";

  const scrollToChapterBody = React.useCallback(() => {
    chapterRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const setChapter = React.useCallback(
    (chapter: CareerChapterId) => {
      if (!canReadDetails && chapter !== "encyclopedia") {
        return;
      }
      onViewStateChange({ activeChapter: chapter });
      setMobileNavOpen(false);
      window.requestAnimationFrame(() => {
        scrollToChapterBody();
      });
    },
    [canReadDetails, onViewStateChange, scrollToChapterBody],
  );

  const openChapterWithPoint = React.useCallback(
    (chapter: "encyclopedia" | "place", bashoSeq?: number | null) => {
      if (typeof bashoSeq === "number") {
        onSelectBasho(bashoSeq);
      }
      setChapter(chapter);
    },
    [onSelectBasho, setChapter],
  );

  return (
    <div className={styles.page}>
      <ObservationConsoleHeader
        subjectId={status.shikona}
        subjectName={status.shikona}
        highestRankLabel={highestRankLabel}
        selectedMeta={selectedMeta}
        activeChapter={viewState.activeChapter}
        detailState={detailState}
        canReadDetails={canReadDetails}
        onSelectChapter={setChapter}
        mobileNavOpen={mobileNavOpen}
        onToggleMobileNav={() => setMobileNavOpen((current) => !current)}
      />

      <div ref={chapterRef} className={styles.body}>
        {viewState.activeChapter === "encyclopedia" ? (
          <motion.div key="english-encyclopedia" className="space-y-4" {...chapterTransition}>
            <section className={cn(surface.panel, "space-y-6")}>
              <div className="space-y-3">
                <div className={typography.kicker}>Career Record</div>
                <h2 className={cn(typography.heading, "text-3xl text-text")}>{status.shikona}</h2>
                <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
                  {overview.lifeSummary}
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-4">
                <div className="border border-gold/15 bg-bg/20 px-4 py-4">
                  <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>Highest Rank</div>
                  <div className={cn(typography.heading, "mt-2 text-xl text-text")}>{highestRankLabel}</div>
                </div>
                <div className="border border-gold/15 bg-bg/20 px-4 py-4">
                  <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>Career Record</div>
                  <div className={cn(typography.heading, "mt-2 text-xl text-text")}>{totalRecordLabel}</div>
                </div>
                <div className="border border-gold/15 bg-bg/20 px-4 py-4">
                  <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>Length</div>
                  <div className={cn(typography.heading, "mt-2 text-xl text-text")}>{nonMaezumoRecords.length} basho</div>
                </div>
                <div className="border border-gold/15 bg-bg/20 px-4 py-4">
                  <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>Final Rank</div>
                  <div className={cn(typography.heading, "mt-2 text-xl text-text")}>{finalRank}</div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="border border-white/10 bg-white/[0.02] px-4 py-4">
                  <div className={cn(typography.label, "text-[10px] tracking-[0.3em] text-text-dim uppercase")}>Makuuchi Yusho</div>
                  <div className="mt-2 text-lg text-text">{makuuchiYusho}</div>
                </div>
                <div className="border border-white/10 bg-white/[0.02] px-4 py-4">
                  <div className={cn(typography.label, "text-[10px] tracking-[0.3em] text-text-dim uppercase")}>Lower Division Yusho</div>
                  <div className="mt-2 text-lg text-text">{lowerYusho}</div>
                </div>
                <div className="border border-white/10 bg-white/[0.02] px-4 py-4">
                  <div className={cn(typography.label, "text-[10px] tracking-[0.3em] text-text-dim uppercase")}>Observation Reward</div>
                  <div className="mt-2 text-lg text-text">{observationPointsAwarded ?? 0} OP</div>
                </div>
              </div>

              <div className="flex flex-col gap-3 border border-white/10 bg-white/[0.02] px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className={cn(typography.label, "text-[10px] tracking-[0.3em] text-text-dim uppercase")}>Record State</div>
                  <div className="mt-1 text-sm text-text-dim">{detailLabel}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={isSaved} onClick={() => void onSave()}>
                    {isSaved ? "Saved" : "Save Career"}
                  </Button>
                  <Button variant="secondary" onClick={onReturnToScout}>
                    New Observation
                  </Button>
                  <Button variant="ghost" onClick={onOpenArchive}>
                    Open Archive
                  </Button>
                </div>
              </div>
            </section>

            <section className={styles.readingNote}>
              <div className={styles.readingKicker}>Reading Guide</div>
              <div className={styles.readingTitle}>
                {canReadDetails ? "Read the rank trajectory and basho records from this career record." : "The cover is available now. Detailed chapters unlock after record building finishes."}
              </div>
              <p className={styles.readingCopy}>
                {canReadDetails
                  ? "Start with the career outline, then inspect the banzuke movement and each basho for supporting evidence."
                  : detailLabel}
              </p>
            </section>
          </motion.div>
        ) : null}

        {viewState.activeChapter === "trajectory" && canReadDetails ? (
          <motion.div key="english-trajectory" {...chapterTransition}>
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
          <motion.div key="english-place" className={styles.split} {...chapterTransition}>
            <div className={styles.mainPane}>
              <CareerPlaceChapter
                ledger={ledger}
                point={selectedPoint}
                detail={detail}
                summary={placeSummary}
                playerStableId={status.stableId}
                placeTab={viewState.placeTab}
                isLoading={detailLoading}
                hasPersistence={Boolean(careerId)}
                onSelectBasho={onSelectBasho}
                onSelectNpc={setSelectedNpcId}
                onPlaceTabChange={(placeTab) => onViewStateChange({ placeTab })}
              />
            </div>
            <aside className={styles.sidePane}>
              {selectedNpc ? (
                <NpcCareerPanel detail={selectedNpc} onClear={() => setSelectedNpcId(null)} />
              ) : (
                <div className={styles.sideEmpty}>
                  <div className={styles.sideEmptyKicker}>Side Note</div>
                  <div className={styles.sideEmptyTitle}>Inspect nearby rikishi</div>
                  <p className={styles.sideEmptyCopy}>Select a rikishi from the basho record to show their banzuke row here.</p>
                </div>
              )}
            </aside>
          </motion.div>
        ) : null}

        {viewState.activeChapter !== "encyclopedia" && !canReadDetails ? (
          <motion.section key="english-detail-lock" className={styles.readingNote} {...chapterTransition}>
            <div className={styles.readingKicker}>Building</div>
            <div className={styles.readingTitle}>Detailed chapters are not ready yet.</div>
            <p className={styles.readingCopy}>{detailLabel}</p>
          </motion.section>
        ) : null}
      </div>
    </div>
  );
};
