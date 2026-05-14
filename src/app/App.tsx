import React from "react";
import { FastForward, Play, Square } from "lucide-react";
import { AppShell, type AppSection } from "./AppShell";
import { BashoTheaterScreen } from "../features/bashoHub/components/BashoTheaterScreen";
import { CareerResultPage } from "../features/careerResult/components/CareerResultPage";
import { CollectionScreen } from "../features/collection/components/CollectionScreen";
import { HomeScreen } from "../features/home/components/HomeScreen";
import { LogicLabScreen } from "../features/logicLab/components/LogicLabScreen";
import { ArchiveScreen } from "../features/report/components/ArchiveScreen";
import { ScoutScreen } from "../features/scout/components/ScoutScreen";
import { ObservationBuildScreen } from "../features/observationBuild/ObservationBuildScreen";
import { SettingsScreen } from "../features/settings/components/SettingsScreen";
import { useSimulation } from "../features/simulation/hooks/useSimulation";
import {
  getCareerBashoDetail,
  listCareerBashoRecordsBySeq,
  type CareerBashoDetail,
  type CareerBashoRecordsBySeq,
} from "../logic/persistence/careerHistory";
import { getCareerYokozunaOrdinal } from "../logic/persistence/careers";
import {
  getLifetimeCareerCount,
  incrementLifetimeCareerCount,
} from "../logic/persistence/lifetimeStats";
import { formatRankDisplayName } from "../features/report/utils/reportShared";
import { cn } from "../shared/lib/cn";
import { Button } from "../shared/ui/Button";
import typography from "../shared/styles/typography.module.css";
import surface from "../shared/styles/surface.module.css";
import type { CareerResultViewState } from "../features/careerResult/components/CareerResultPage";

const isMaezumoBashoRow = (row: CareerBashoRecordsBySeq) =>
  row.rows.find((entry) => entry.entityType === "PLAYER")?.division === "Maezumo";

const normalizeCareerBashoRows = (rows: CareerBashoRecordsBySeq[]): CareerBashoRecordsBySeq[] =>
  rows
    .filter((row) => !isMaezumoBashoRow(row))
    .map((row, index) => ({
      ...row,
      bashoSeq: index + 1,
      sourceBashoSeq: row.sourceBashoSeq ?? row.bashoSeq,
    }));

const DEFAULT_CAREER_VIEW_STATE: CareerResultViewState = {
  selectedBashoSeq: null,
  visibleWindowStartSeq: 1,
  visibleWindowEndSeq: 1,
  activeChapter: "encyclopedia",
  placeTab: "nearby",
};

export const App: React.FC = () => {
  const {
    phase,
    status,
    progress,
    currentCareerId,
    isCurrentCareerSaved,
    simulationPacing,
    detailState,
    detailBuildProgress,
    latestBashoView,
    latestObservation,
    latestPauseReason,
    hallOfFame,
    unshelvedCareers,
    generationTokens,
    observationPoints,
    errorMessage,
    continueChapter,
    startSimulation,
    skipToEnd,
    revealCurrentResult,
    stopSimulation,
    saveCurrentCareer,
    loadHallOfFame,
    loadUnshelvedCareers,
    loadMetaProgress,
    openCareer,
    deleteCareerById,
    clearAllData,
    resetView,
  } = useSimulation();

  const [activeSection, setActiveSection] = React.useState<AppSection>("home");
  const [careerViewState, setCareerViewState] = React.useState<CareerResultViewState>(DEFAULT_CAREER_VIEW_STATE);
  const [detail, setDetail] = React.useState<CareerBashoDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [bashoRows, setBashoRows] = React.useState<CareerBashoRecordsBySeq[]>([]);
  const [bashoRowsLoading, setBashoRowsLoading] = React.useState(false);
  const [currentYokozunaOrdinal, setCurrentYokozunaOrdinal] = React.useState<number | null>(null);
  const previousCareerIdRef = React.useRef<string | null>(null);
  const previousPhaseRef = React.useRef(phase);

  React.useEffect(() => {
    void loadHallOfFame();
    void loadUnshelvedCareers();
    void loadMetaProgress();
  }, [loadHallOfFame, loadMetaProgress, loadUnshelvedCareers]);

  const [lifetimeCareerCount, setLifetimeCareerCount] = React.useState<number>(() =>
    getLifetimeCareerCount(),
  );

  React.useEffect(() => {
    const showBashoSection =
      (simulationPacing === "observe" || simulationPacing === "chaptered") &&
      (phase === "running" || phase === "chapter_ready");
    if (showBashoSection) {
      setActiveSection((current) => (current === "logicLab" ? current : "basho"));
      return;
    }
    if (phase === "completed" || phase === "simulating" || phase === "reveal_ready") {
      setActiveSection((current) => (current === "logicLab" ? current : "career"));
    }
  }, [phase, simulationPacing]);

  React.useEffect(() => {
    const previousCareerId = previousCareerIdRef.current;
    const previousPhase = previousPhaseRef.current;
    previousCareerIdRef.current = currentCareerId;
    previousPhaseRef.current = phase;

    if (!status) {
      setCareerViewState(DEFAULT_CAREER_VIEW_STATE);
      return;
    }

    const records = status.history.records.filter((record) => record.rank.division !== "Maezumo");
    const lastSeq = records.length;
    const shouldSnapToLatest =
      currentCareerId !== previousCareerId ||
      (phase === "completed" && previousPhase !== "completed");

    setCareerViewState((current) => {
      const selectedSeq =
        shouldSnapToLatest || !current.selectedBashoSeq || current.selectedBashoSeq > lastSeq
          ? lastSeq || null
          : current.selectedBashoSeq;
      const windowSize = Math.min(lastSeq || 1, 18);
      const windowEnd = selectedSeq ?? lastSeq;
      const windowStart = Math.max(1, windowEnd - windowSize + 1);
      return {
        selectedBashoSeq: selectedSeq,
        visibleWindowStartSeq: windowStart,
        visibleWindowEndSeq: Math.max(windowStart, windowEnd),
        activeChapter: shouldSnapToLatest ? "encyclopedia" : current.activeChapter,
        placeTab: shouldSnapToLatest ? "nearby" : current.placeTab,
      };
    });
  }, [currentCareerId, phase, status]);

  React.useEffect(() => {
    let cancelled = false;
    if (!currentCareerId) {
      setCurrentYokozunaOrdinal(null);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      const nextOrdinal = await getCareerYokozunaOrdinal(currentCareerId);
      if (!cancelled) {
        setCurrentYokozunaOrdinal(nextOrdinal);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentCareerId, isCurrentCareerSaved, phase]);

  React.useEffect(() => {
    let cancelled = false;
    const shouldLoadBashoRows =
      Boolean(currentCareerId) &&
      detailState === "ready" &&
      (phase === "reveal_ready" || phase === "completed" || phase === "chapter_ready");
    if (!shouldLoadBashoRows) {
      setBashoRows([]);
      setBashoRowsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    setBashoRowsLoading(true);
    const activeCareerId = currentCareerId;
    if (!activeCareerId) {
      setBashoRowsLoading(false);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        const nextRows = await listCareerBashoRecordsBySeq(activeCareerId);
        if (!cancelled) {
          setBashoRows(normalizeCareerBashoRows(nextRows));
        }
      } finally {
        if (!cancelled) {
          setBashoRowsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentCareerId, detailState, phase]);

  React.useEffect(() => {
    let cancelled = false;
    const targetBashoSeq = careerViewState.selectedBashoSeq;
    const selectedBashoRow = bashoRows.find((row) => row.bashoSeq === targetBashoSeq);
    const sourceBashoSeq = selectedBashoRow?.sourceBashoSeq ?? targetBashoSeq;
    if (detailState !== "ready" || !currentCareerId || !targetBashoSeq || !sourceBashoSeq) {
      setDetail(null);
      setDetailLoading(Boolean(detailState === "ready" && currentCareerId && targetBashoSeq && bashoRowsLoading));
      return () => {
        cancelled = true;
      };
    }

    setDetailLoading(true);
    void (async () => {
      try {
        const nextDetail = await getCareerBashoDetail(currentCareerId, sourceBashoSeq);
        if (!cancelled) {
          setDetail(
            nextDetail
              ? {
                ...nextDetail,
                bashoSeq: targetBashoSeq,
                sourceBashoSeq,
              }
              : null,
          );
        }
      } finally {
        if (!cancelled) {
          setDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bashoRows, bashoRowsLoading, careerViewState.selectedBashoSeq, currentCareerId, detailState]);

  const handleSectionChange = React.useCallback(
    async (section: AppSection) => {
      if (section === "scout") {
        const hasUnsavedCurrent = Boolean(currentCareerId) && !isCurrentCareerSaved;
        if (hasUnsavedCurrent) {
          const accepted = window.confirm("未保存のキャリアを破棄して観測設計に戻りますか。");
          if (!accepted) return;
        }
        await resetView();
        setActiveSection("scout");
        return;
      }
      setActiveSection(section);
    },
    [currentCareerId, isCurrentCareerSaved, resetView],
  );

  const handleStart = React.useCallback(
    async (...args: Parameters<typeof startSimulation>) => {
      const started = await startSimulation(...args);
      if (!started) return;
      setLifetimeCareerCount(incrementLifetimeCareerCount());
      setActiveSection(args[4] === "observe" || args[4] === "chaptered" ? "basho" : "career");
    },
    [startSimulation],
  );

  const handleOpenCareer = React.useCallback(
    async (careerId: string) => {
      await openCareer(careerId);
      setActiveSection("career");
    },
    [openCareer],
  );

  const handleClearAllData = React.useCallback(async () => {
    await clearAllData();
    setLifetimeCareerCount(0);
    setCareerViewState(DEFAULT_CAREER_VIEW_STATE);
    setDetail(null);
    setDetailLoading(false);
    setBashoRows([]);
    setBashoRowsLoading(false);
    setCurrentYokozunaOrdinal(null);
    setActiveSection("home");
  }, [clearAllData]);

  const disableSections = React.useMemo<AppSection[]>(() => {
    const disabled: AppSection[] = [];
    const showBashoSection =
      (simulationPacing === "observe" || simulationPacing === "chaptered") &&
      (phase === "running" || phase === "chapter_ready");
    if (!status) {
      disabled.push("career", "basho");
    }
    if (!showBashoSection && !disabled.includes("basho")) {
      disabled.push("basho");
    }
    return disabled;
  }, [phase, simulationPacing, status]);

  const homeResume = React.useMemo(() => {
    if (status && currentCareerId) {
      if (phase === "chapter_ready" || phase === "running") {
        return {
          label: "節目劇場へ戻る",
          onClick: () => setActiveSection("basho"),
        };
      }
      if (phase === "completed" || phase === "reveal_ready" || phase === "simulating") {
        return {
          label: "力士記録へ戻る",
          onClick: () => setActiveSection("career"),
        };
      }
    }

    const latestUnshelved = unshelvedCareers[0];
    if (latestUnshelved) {
      return {
        label: "未保存の一代を開く",
        onClick: () => void handleOpenCareer(latestUnshelved.id),
      };
    }

    return null;
  }, [currentCareerId, handleOpenCareer, phase, status, unshelvedCareers]);

  const shellTitle = getShellTitle(activeSection, status?.shikona);
  const shellStatusLine = getStatusLine({
    phase,
    progress,
    latestPauseReason,
    latestObservation,
    errorMessage,
    bashoRowsLoading,
  });
  const shellActions = getShellActions({
    phase,
    onSkipToEnd: skipToEnd,
    onReveal: revealCurrentResult,
    onStop: stopSimulation,
  });

  return (
    <AppShell
      activeSection={activeSection}
      onSectionChange={(section) => void handleSectionChange(section)}
      title={shellTitle}
      statusLine={shellStatusLine}
      actions={shellActions}
      showLogicLab={import.meta.env.DEV}
      showBasho={
        (simulationPacing === "observe" || simulationPacing === "chaptered") &&
        (phase === "running" || phase === "chapter_ready")
      }
      disableSections={disableSections}
    >
      {renderSection({
        activeSection,
        phase,
        simulationPacing,
        status,
        progress,
        detailState,
        detailBuildProgress,
        latestBashoView,
        hallOfFame,
        generationTokens,
        observationPoints,
        lifetimeCareerCount,
        currentCareerId,
        isCurrentCareerSaved,
        detail,
        detailLoading,
        careerViewState,
        bashoRows,
        currentYokozunaOrdinal,
        homeResume,
        onStart: handleStart,
        onContinueChapter: continueChapter,
        onSkipToEnd: skipToEnd,
        onCareerViewStateChange: setCareerViewState,
        onSelectBasho: (bashoSeq) => {
          setCareerViewState((current) => {
            const size = current.visibleWindowEndSeq - current.visibleWindowStartSeq + 1;
            let start = current.visibleWindowStartSeq;
            let end = current.visibleWindowEndSeq;
            if (bashoSeq < start) {
              start = bashoSeq;
              end = bashoSeq + size - 1;
            } else if (bashoSeq > end) {
              end = bashoSeq;
              start = Math.max(1, end - size + 1);
            }
            return {
              ...current,
              selectedBashoSeq: bashoSeq,
              visibleWindowStartSeq: start,
              visibleWindowEndSeq: end,
            };
          });
        },
        onSaveCurrentCareer: saveCurrentCareer,
        currentCareerListItem: [...unshelvedCareers, ...hallOfFame].find((item) => item.id === currentCareerId) ?? null,
        onRevealCurrentResult: revealCurrentResult,
        onReturnToScout: () => void handleSectionChange("scout"),
        onOpenArchiveCareer: handleOpenCareer,
        onDeleteCareer: deleteCareerById,
        onOpenArchive: () => setActiveSection("archive"),
        onOpenCollection: () => setActiveSection("collection"),
        onOpenSettings: () => setActiveSection("settings"),
        onOpenScout: () => void handleSectionChange("scout"),
        onClearAllData: handleClearAllData,
      })}
    </AppShell>
  );
};

const renderSection = ({
  activeSection,
  phase,
  simulationPacing,
  status,
  progress,
  detailState,
  detailBuildProgress,
  latestBashoView,
  hallOfFame,
  generationTokens,
  observationPoints,
  lifetimeCareerCount,
  currentCareerId,
  isCurrentCareerSaved,
  detail,
  detailLoading,
  careerViewState,
  bashoRows,
  currentYokozunaOrdinal,
  homeResume,
  onStart,
  onContinueChapter,
  onSkipToEnd,
  onCareerViewStateChange,
  onSelectBasho,
  onSaveCurrentCareer,
  currentCareerListItem,
  onRevealCurrentResult,
  onReturnToScout,
  onOpenArchiveCareer,
  onDeleteCareer,
  onOpenArchive,
  onOpenCollection,
  onOpenSettings,
  onOpenScout,
  onClearAllData,
}: {
  activeSection: AppSection;
  phase: ReturnType<typeof useSimulation>["phase"];
  simulationPacing: ReturnType<typeof useSimulation>["simulationPacing"];
  status: ReturnType<typeof useSimulation>["status"];
  progress: ReturnType<typeof useSimulation>["progress"];
  detailState: ReturnType<typeof useSimulation>["detailState"];
  detailBuildProgress: ReturnType<typeof useSimulation>["detailBuildProgress"];
  latestBashoView: ReturnType<typeof useSimulation>["latestBashoView"];
  hallOfFame: ReturnType<typeof useSimulation>["hallOfFame"];
  generationTokens: ReturnType<typeof useSimulation>["generationTokens"];
  observationPoints: ReturnType<typeof useSimulation>["observationPoints"];
  lifetimeCareerCount: number;
  currentCareerId: string | null;
  isCurrentCareerSaved: boolean;
  detail: CareerBashoDetail | null;
  detailLoading: boolean;
  careerViewState: CareerResultViewState;
  bashoRows: CareerBashoRecordsBySeq[];
  currentYokozunaOrdinal: number | null;
  homeResume: { label: string; onClick: () => void } | null;
  onStart: (...args: Parameters<ReturnType<typeof useSimulation>["startSimulation"]>) => Promise<void>;
  onContinueChapter: () => void;
  onSkipToEnd: () => void;
  onCareerViewStateChange: React.Dispatch<React.SetStateAction<CareerResultViewState>>;
  onSelectBasho: (bashoSeq: number) => void;
  onSaveCurrentCareer: ReturnType<typeof useSimulation>["saveCurrentCareer"];
  currentCareerListItem: ReturnType<typeof useSimulation>["hallOfFame"][number] | null;
  onRevealCurrentResult: () => void;
  onReturnToScout: () => void;
  onOpenArchiveCareer: (careerId: string) => Promise<void>;
  onDeleteCareer: (careerId: string) => Promise<void>;
  onOpenArchive: () => void;
  onOpenCollection: () => void;
  onOpenSettings: () => void;
  onOpenScout: () => void;
  onClearAllData: () => Promise<void>;
}) => {
  if (activeSection === "home") {
    return (
      <HomeScreen
        savedCount={hallOfFame.length}
        lifetimeCount={lifetimeCareerCount}
        currentShikona={status?.shikona}
        resumeLabel={homeResume?.label}
        onResume={homeResume?.onClick}
        onOpenScout={onOpenScout}
        onOpenArchive={onOpenArchive}
        onOpenCollection={onOpenCollection}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  if (activeSection === "settings") {
    return <SettingsScreen onClearAllData={onClearAllData} />;
  }

  if (activeSection === "scout") {
    return (
      <ObservationBuildScreen
        generationTokens={generationTokens}
        observationPoints={observationPoints}
        onStart={(initialStats, oyakata, initialPacing, runOptions) =>
          onStart(initialStats, oyakata, runOptions, undefined, initialPacing)}
      />
    );
  }

  if (activeSection === "logicLab") {
    return (
      <div className="space-y-6">
        <LogicLabScreen />
        {import.meta.env.DEV ? (
          <div className="border border-amber-300/30 bg-amber-300/5 p-4 text-xs text-amber-200/80">
            旧「新弟子設計（スカウト）」UI は ObservationBuild に置換されました。下にレガシーUIを残しています。
          </div>
        ) : null}
        {import.meta.env.DEV ? (
          <ScoutScreen
            generationTokens={generationTokens}
            observationPoints={observationPoints}
            onStart={(initialStats, oyakata, initialPacing, runOptions) =>
              onStart(initialStats, oyakata, runOptions, undefined, initialPacing)}
          />
        ) : null}
      </div>
    );
  }

  if (activeSection === "archive") {
    return (
      <ArchiveScreen
        items={hallOfFame.map((item) => ({
          ...item,
          title: item.title ?? null,
        }))}
        onOpen={(careerId) => void onOpenArchiveCareer(careerId)}
        onDelete={(careerId) => void onDeleteCareer(careerId)}
      />
    );
  }

  if (activeSection === "collection") {
    return <CollectionScreen onOpenArchive={onOpenArchive} observationPoints={observationPoints} />;
  }

  if (!status) {
    return <EmptyCareerState />;
  }

  if (
    activeSection === "basho" &&
    (simulationPacing === "observe" || simulationPacing === "chaptered") &&
    (phase === "running" || phase === "chapter_ready")
  ) {
    return (
      <BashoTheaterScreen
        view={latestBashoView}
        primaryActionLabel={
          phase === "chapter_ready"
            ? latestBashoView?.chapterKind === "RETIREMENT" || latestBashoView?.chapterKind === "EPILOGUE"
              ? "記録を見る"
              : "続きを読む"
            : null
        }
        secondaryActionLabel={phase === "chapter_ready" ? "最後まで進める" : null}
        onPrimaryAction={phase === "chapter_ready" ? onContinueChapter : undefined}
        onSecondaryAction={phase === "chapter_ready" ? onSkipToEnd : undefined}
      />
    );
  }

  if (phase === "simulating" || phase === "running") {
    return <SimulationProgressView progress={progress} status={status} />;
  }

  if (phase === "reveal_ready") {
    return (
      <RevealReadyView
        status={status}
        progress={progress}
        detailState={detailState}
        detailBuildProgress={detailBuildProgress}
        onReveal={onRevealCurrentResult}
      />
    );
  }

  return (
    <CareerResultPage
      status={status}
      careerId={currentCareerId}
      isSaved={isCurrentCareerSaved}
      yokozunaOrdinal={currentYokozunaOrdinal}
      detail={detail}
      detailLoading={detailLoading}
      bashoRows={bashoRows}
      detailState={detailState}
      detailBuildProgress={detailBuildProgress}
      observationPointsAwarded={currentCareerListItem?.observationPointsAwarded}
      observationStanceId={currentCareerListItem?.observationStanceId}
      viewState={careerViewState}
      onSelectBasho={onSelectBasho}
      onViewStateChange={(patch) => onCareerViewStateChange((current) => ({ ...current, ...patch }))}
      onSave={onSaveCurrentCareer}
      onReturnToScout={onReturnToScout}
      onOpenArchive={onOpenArchive}
    />
  );
};

const SimulationProgressView: React.FC<{
  progress: ReturnType<typeof useSimulation>["progress"];
  status: ReturnType<typeof useSimulation>["status"];
}> = ({ progress, status }) => (
  <div className="mx-auto max-w-5xl">
    <div className={cn(surface.panel, "grid gap-8 lg:grid-cols-[1.2fr_0.8fr]")}>
      <div className="space-y-5">
        <div className="space-y-3">
          <div className={typography.kicker}>結果を準備中</div>
          <h2 className={cn(typography.heading, "text-3xl text-text")}>力士人生を整理しています</h2>
          <p className="max-w-2xl text-sm text-text-dim">
            番付や勝敗は伏せたまま、あとで読める記録帳を裏で整えています。
          </p>
        </div>

        <div className="space-y-3">
          <div className={cn(typography.label, "flex items-center justify-between text-xs text-text-dim")}>
            <span>整理済み</span>
            <span>{progress ? `${progress.bashoCount}場所` : "演算中"}</span>
          </div>
          <div className="h-2 overflow-hidden border border-white/10 bg-white/[0.03]">
            <div className="h-full w-1/3 animate-pulse bg-action/70" />
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        <div className="border border-gold/15 bg-bg/20 px-4 py-4">
          <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>四股名</div>
          <div className={cn(typography.heading, "mt-2 text-2xl text-text")}>{status?.shikona ?? "記録編集中"}</div>
        </div>
        <div className="border border-gold/15 bg-bg/20 px-4 py-4">
          <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>進み具合</div>
          <div className="mt-2 text-xl text-text">{progress ? `${progress.bashoCount}場所を整理済み` : "-"}</div>
        </div>
      </div>
    </div>
  </div>
);

const RevealReadyView: React.FC<{
  status: ReturnType<typeof useSimulation>["status"];
  progress: ReturnType<typeof useSimulation>["progress"];
  detailState: ReturnType<typeof useSimulation>["detailState"];
  detailBuildProgress: ReturnType<typeof useSimulation>["detailBuildProgress"];
  onReveal: () => void;
}> = ({ status, progress, detailState, detailBuildProgress, onReveal }) => {
  const totalRecordLabel = status
    ? `${status.history.totalWins}勝${status.history.totalLosses}敗${status.history.totalAbsent > 0 ? `${status.history.totalAbsent}休` : ""}`
    : "-";
  const detailMessage =
    detailState === "building"
      ? `詳細記録を整理中 ${detailBuildProgress?.flushedBashoCount ?? 0}/${detailBuildProgress?.totalBashoCount ?? progress?.bashoCount ?? 0}`
      : "詳細章もすぐ読めます。";

  return (
    <div className="mx-auto max-w-5xl">
      <div className={cn(surface.panel, "space-y-8")}>
        <div className="space-y-3 text-center">
          <div className={typography.kicker}>開封の前</div>
          <h2 className={cn(typography.heading, "text-3xl text-text")}>結果の準備ができました</h2>
          <p className="mx-auto max-w-2xl text-sm text-text-dim">
            表紙はすぐ開けます。細部の帳面は裏で整理を続けています。
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="border border-gold/15 bg-bg/20 px-5 py-5">
            <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>最高位</div>
            <div className={cn(typography.heading, "mt-2 text-2xl text-text")}>
              {status ? formatRankDisplayName(status.history.maxRank) : "-"}
            </div>
          </div>
          <div className="border border-gold/15 bg-bg/20 px-5 py-5">
            <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>通算</div>
            <div className={cn(typography.heading, "mt-2 text-2xl text-text")}>{totalRecordLabel}</div>
          </div>
          <div className="border border-gold/15 bg-bg/20 px-5 py-5">
            <div className={cn(typography.label, "text-[10px] tracking-[0.35em] text-gold/55 uppercase")}>在位</div>
            <div className={cn(typography.heading, "mt-2 text-2xl text-text")}>{progress ? `${progress.bashoCount}場所` : "-"}</div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 border border-white/10 bg-white/[0.02] px-5 py-6 text-center">
          <Button size="lg" onClick={onReveal}>
            <Play className="mr-2 h-4 w-4" />
            結果を見る
          </Button>
          <div className="text-sm text-text-dim">{detailMessage}</div>
        </div>
      </div>
    </div>
  );
};

const EmptyCareerState: React.FC = () => (
  <section className={cn(surface.premium, "p-5 sm:p-6")}>
    <div className="border border-gold/10 bg-bg/20 px-4 py-10 text-center text-sm text-text-dim">
      読み込める記録がありません。ホームから観測設計または保存済み記録を開いてください。
    </div>
  </section>
);

const getShellTitle = (section: AppSection, shikona?: string | null): string => {
  if (section === "home") return "ホーム";
  if (section === "basho") return shikona ? `${shikona} 節目劇場` : "節目劇場";
  if (section === "career") return shikona ? `${shikona} 力士記録` : "力士記録";
  if (section === "archive") return "保存済み記録";
  if (section === "collection") return "記録 / 偉業";
  if (section === "settings") return "設定";
  if (section === "logicLab") return "ロジック検証";
  return "観測設計";
};

const getStatusLine = ({
  phase,
  progress,
  latestPauseReason,
  latestObservation,
  errorMessage,
  bashoRowsLoading,
}: {
  phase: ReturnType<typeof useSimulation>["phase"];
  progress: ReturnType<typeof useSimulation>["progress"];
  latestPauseReason: ReturnType<typeof useSimulation>["latestPauseReason"];
  latestObservation: ReturnType<typeof useSimulation>["latestObservation"];
  errorMessage: string | undefined;
  bashoRowsLoading: boolean;
}) => {
  if (errorMessage) return errorMessage;
  if (phase === "simulating" || phase === "running") {
    return `${progress?.bashoCount ?? 0}場所を整理中`;
  }
  if (phase === "chapter_ready") {
    return latestObservation?.headline ?? "節目待機";
  }
  if (phase === "reveal_ready") {
    return latestPauseReason ? `停止: ${latestPauseReason}` : "結果待機";
  }
  if (bashoRowsLoading) return "記録読込中";
  return undefined;
};

const getShellActions = ({
  phase,
  onSkipToEnd,
  onReveal,
  onStop,
}: {
  phase: ReturnType<typeof useSimulation>["phase"];
  onSkipToEnd: () => void;
  onReveal: () => void;
  onStop: () => Promise<void>;
}) => {
  if (phase === "chapter_ready") {
    return null;
  }

  if (phase === "simulating" || phase === "running") {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={onSkipToEnd}>
          <FastForward className="mr-2 h-4 w-4" />
          最後まで進める
        </Button>
        <Button variant="ghost" size="sm" onClick={() => void onStop()}>
          <Square className="mr-2 h-4 w-4" />
          中断
        </Button>
      </>
    );
  }

  if (phase === "reveal_ready") {
    return (
      <Button size="sm" onClick={onReveal}>
        <Play className="mr-2 h-4 w-4" />
        結果を開く
      </Button>
    );
  }

  return null;
};
