import React from "react";
import { FastForward, Play, Save, Square } from "lucide-react";
import { AppShell, type AppSection } from "./AppShell";
import { BashoTheaterScreen } from "../features/bashoHub/components/BashoTheaterScreen";
import { CareerResultPage } from "../features/careerResult/components/CareerResultPage";
import { CollectionScreen } from "../features/collection/components/CollectionScreen";
import { EraStatsPage } from "../features/eraStats/components/EraStatsPage";
import { LogicLabScreen } from "../features/logicLab/components/LogicLabScreen";
import { ArchiveScreen } from "../features/report/components/ArchiveScreen";
import { ScoutScreen } from "../features/scout/components/ScoutScreen";
import { useSimulation } from "../features/simulation/hooks/useSimulation";
import {
  getCareerBashoDetail,
  listCareerBashoRecordsBySeq,
  type CareerBashoDetail,
  type CareerBashoRecordsBySeq,
} from "../logic/persistence/careerHistory";
import { formatBashoLabel, formatRankDisplayName } from "../features/report/utils/reportShared";
import { Button } from "../shared/ui/Button";
import { getDefaultDivision, type EraStatsViewState } from "../features/eraStats/utils/eraStatsModel";
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

export const App: React.FC = () => {
  const {
    phase,
    status,
    progress,
    currentCareerId,
    isCurrentCareerSaved,
    simulationPacing,
    latestBashoView,
    latestPauseReason,
    hallOfFame,
    errorMessage,
    startSimulation,
    skipToEnd,
    revealCurrentResult,
    stopSimulation,
    saveCurrentCareer,
    loadHallOfFame,
    loadUnshelvedCareers,
    openCareer,
    deleteCareerById,
    resetView,
  } = useSimulation();

  const [activeSection, setActiveSection] = React.useState<AppSection>("scout");
  const [careerViewState, setCareerViewState] = React.useState<CareerResultViewState>({
    selectedBashoSeq: null,
    visibleWindowStartSeq: 1,
    visibleWindowEndSeq: 1,
  });
  const [eraViewState, setEraViewState] = React.useState<EraStatsViewState>({
    selectedBashoSeq: 1,
    selectedDivision: "Makushita",
    rankingBasis: "rank",
  });
  const [detail, setDetail] = React.useState<CareerBashoDetail | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [bashoRows, setBashoRows] = React.useState<CareerBashoRecordsBySeq[]>([]);
  const [bashoRowsLoading, setBashoRowsLoading] = React.useState(false);
  const previousCareerIdRef = React.useRef<string | null>(null);
  const previousPhaseRef = React.useRef(phase);

  React.useEffect(() => {
    void loadHallOfFame();
    void loadUnshelvedCareers();
  }, [loadHallOfFame, loadUnshelvedCareers]);

  React.useEffect(() => {
    const showBashoSection =
      simulationPacing === "observe" &&
      (phase === "simulating" || phase === "running" || phase === "reveal_ready");
    if (showBashoSection) {
      setActiveSection((current) => (current === "logicLab" ? current : "basho"));
      return;
    }
    if (phase === "completed" || phase === "running" || phase === "simulating" || phase === "reveal_ready") {
      setActiveSection((current) => (current === "logicLab" ? current : "career"));
    }
  }, [phase, simulationPacing]);

  React.useEffect(() => {
    const previousCareerId = previousCareerIdRef.current;
    const previousPhase = previousPhaseRef.current;
    previousCareerIdRef.current = currentCareerId;
    previousPhaseRef.current = phase;

    if (!status) {
      setCareerViewState({
        selectedBashoSeq: null,
        visibleWindowStartSeq: 1,
        visibleWindowEndSeq: 1,
      });
      return;
    }

    const records = status.history.records.filter((record) => record.rank.division !== "Maezumo");
    const lastSeq = records.length;
    const shouldSnapToLatest =
      currentCareerId !== previousCareerId ||
      (phase === "completed" && previousPhase !== "completed");
    const selectedSeq = shouldSnapToLatest || !careerViewState.selectedBashoSeq || careerViewState.selectedBashoSeq > lastSeq
      ? lastSeq || null
      : careerViewState.selectedBashoSeq;
    const windowSize = Math.min(lastSeq || 1, 18);
    const windowEnd = selectedSeq ?? lastSeq;
    const windowStart = Math.max(1, windowEnd - windowSize + 1);
    setCareerViewState({
      selectedBashoSeq: selectedSeq,
      visibleWindowStartSeq: windowStart,
      visibleWindowEndSeq: Math.max(windowStart, windowEnd),
    });
    setEraViewState((current) => ({
      selectedBashoSeq: selectedSeq ?? 1,
      selectedDivision: getDefaultDivision(records[records.length - 1]?.rank.division),
      rankingBasis: current.rankingBasis,
    }));
  }, [careerViewState.selectedBashoSeq, currentCareerId, phase, status]);

  React.useEffect(() => {
    let cancelled = false;
    const shouldLoadBashoRows =
      Boolean(currentCareerId) && (phase === "reveal_ready" || phase === "completed");
    if (!shouldLoadBashoRows) {
      if (!currentCareerId) {
        setBashoRows([]);
      }
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
  }, [currentCareerId, phase]);

  React.useEffect(() => {
    let cancelled = false;
    const targetBashoSeq = careerViewState.selectedBashoSeq;
    const selectedBashoRow = bashoRows.find((row) => row.bashoSeq === targetBashoSeq);
    const sourceBashoSeq = selectedBashoRow?.sourceBashoSeq ?? targetBashoSeq;
    if (!currentCareerId || !targetBashoSeq || !sourceBashoSeq) {
      setDetail(null);
      setDetailLoading(Boolean(currentCareerId && targetBashoSeq && bashoRowsLoading));
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
                sourceBashoSeq: sourceBashoSeq,
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
  }, [bashoRows, bashoRowsLoading, careerViewState.selectedBashoSeq, currentCareerId]);

  const handleSectionChange = React.useCallback(
    async (section: AppSection) => {
      if (section === "scout") {
        const hasUnsavedCurrent = Boolean(currentCareerId) && !isCurrentCareerSaved;
        if (hasUnsavedCurrent) {
          const accepted = window.confirm("未保存のキャリアを破棄して新弟子設計に戻りますか。");
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
      await startSimulation(...args);
      setActiveSection(args[4] === "observe" ? "basho" : "career");
    },
    [startSimulation],
  );

  const handleOpenArchivedCareer = React.useCallback(
    async (careerId: string) => {
      await openCareer(careerId);
      setActiveSection("career");
    },
    [openCareer],
  );

  const disableSections = React.useMemo<AppSection[]>(() => {
    const disabled: AppSection[] = [];
    const showBashoSection =
      simulationPacing === "observe" &&
      (phase === "simulating" || phase === "running" || phase === "reveal_ready");
    if (!status) {
      disabled.push("career", "era", "basho");
    }
    if (!currentCareerId || bashoRowsLoading || bashoRows.length === 0) {
      if (!disabled.includes("era")) disabled.push("era");
    }
    if (!showBashoSection && !disabled.includes("basho")) {
      disabled.push("basho");
    }
    return disabled;
  }, [bashoRows.length, bashoRowsLoading, currentCareerId, phase, simulationPacing, status]);

  const shellTitle = getShellTitle(activeSection, status?.shikona);
  const shellStatusLine = getStatusLine({
    phase,
    progress,
    latestPauseReason,
    errorMessage,
    bashoRowsLoading,
  });
  const shellActions = getShellActions({
    phase,
    isCurrentCareerSaved,
    onSkipToEnd: skipToEnd,
    onReveal: revealCurrentResult,
    onStop: stopSimulation,
    onSave: saveCurrentCareer,
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
        simulationPacing === "observe" &&
        (phase === "simulating" || phase === "running" || phase === "reveal_ready")
      }
      disableSections={disableSections}
    >
      {renderSection({
        activeSection,
        phase,
        simulationPacing,
        status,
        progress,
        latestBashoView,
        hallOfFame,
        currentCareerId,
        isCurrentCareerSaved,
        detail,
        detailLoading,
        careerViewState,
        eraViewState,
        bashoRows,
        onStart: handleStart,
        onCareerViewStateChange: setCareerViewState,
        onEraViewStateChange: setEraViewState,
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
              selectedBashoSeq: bashoSeq,
              visibleWindowStartSeq: start,
              visibleWindowEndSeq: end,
            };
          });
          setEraViewState((current) => ({ ...current, selectedBashoSeq: bashoSeq }));
        },
        onOpenEra: () => setActiveSection("era"),
        onOpenCareer: () => setActiveSection("career"),
        onSaveCurrentCareer: saveCurrentCareer,
        onOpenArchiveCareer: handleOpenArchivedCareer,
        onDeleteCareer: deleteCareerById,
        onOpenArchive: () => setActiveSection("archive"),
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
  latestBashoView,
  hallOfFame,
  currentCareerId,
  isCurrentCareerSaved,
  detail,
  detailLoading,
  careerViewState,
  eraViewState,
  bashoRows,
  onStart,
  onCareerViewStateChange,
  onEraViewStateChange,
  onSelectBasho,
  onOpenEra,
  onOpenCareer,
  onSaveCurrentCareer,
  onOpenArchiveCareer,
  onDeleteCareer,
  onOpenArchive,
}: {
  activeSection: AppSection;
  phase: ReturnType<typeof useSimulation>["phase"];
  simulationPacing: ReturnType<typeof useSimulation>["simulationPacing"];
  status: ReturnType<typeof useSimulation>["status"];
  progress: ReturnType<typeof useSimulation>["progress"];
  latestBashoView: ReturnType<typeof useSimulation>["latestBashoView"];
  hallOfFame: ReturnType<typeof useSimulation>["hallOfFame"];
  currentCareerId: string | null;
  isCurrentCareerSaved: boolean;
  detail: CareerBashoDetail | null;
  detailLoading: boolean;
  careerViewState: CareerResultViewState;
  eraViewState: EraStatsViewState;
  bashoRows: CareerBashoRecordsBySeq[];
  onStart: (...args: Parameters<ReturnType<typeof useSimulation>["startSimulation"]>) => Promise<void>;
  onCareerViewStateChange: React.Dispatch<React.SetStateAction<CareerResultViewState>>;
  onEraViewStateChange: React.Dispatch<React.SetStateAction<EraStatsViewState>>;
  onSelectBasho: (bashoSeq: number) => void;
  onOpenEra: () => void;
  onOpenCareer: () => void;
  onSaveCurrentCareer: () => Promise<void>;
  onOpenArchiveCareer: (careerId: string) => Promise<void>;
  onDeleteCareer: (careerId: string) => Promise<void>;
  onOpenArchive: () => void;
}) => {
  if (activeSection === "scout") {
    return (
      <ScoutScreen
        onStart={(initialStats, oyakata, initialPacing) =>
          onStart(initialStats, oyakata, undefined, undefined, initialPacing)}
      />
    );
  }

  if (activeSection === "logicLab") {
    return <LogicLabScreen />;
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
    return <CollectionScreen onOpenArchive={onOpenArchive} />;
  }

  if (!status) {
    return <EmptyCareerState />;
  }

  if (
    activeSection === "basho" &&
    simulationPacing === "observe" &&
    (phase === "simulating" || phase === "running" || phase === "reveal_ready")
  ) {
    return <BashoTheaterScreen view={latestBashoView} />;
  }

  if (phase === "simulating" || phase === "running") {
    return <SimulationProgressView progress={progress} />;
  }

  if (phase === "reveal_ready") {
    return <RevealReadyView progress={progress} />;
  }

  if (activeSection === "era") {
    return (
      <EraStatsPage
        status={status}
        careerId={currentCareerId}
        bashoRows={bashoRows}
        hallOfFame={hallOfFame}
        viewState={eraViewState}
        onViewStateChange={(next) => {
          onEraViewStateChange(next);
          onCareerViewStateChange((current) => ({
            ...current,
            selectedBashoSeq: next.selectedBashoSeq,
          }));
        }}
        onOpenCareer={onOpenCareer}
      />
    );
  }

  return (
    <CareerResultPage
      status={status}
      careerId={currentCareerId}
      isSaved={isCurrentCareerSaved}
      detail={detail}
      detailLoading={detailLoading}
      bashoRows={bashoRows}
      viewState={careerViewState}
      onSelectBasho={onSelectBasho}
      onWindowChange={(window) => onCareerViewStateChange((current) => ({ ...current, ...window }))}
      onSave={onSaveCurrentCareer}
      onOpenEra={onOpenEra}
    />
  );
};

const SimulationProgressView: React.FC<{
  progress: ReturnType<typeof useSimulation>["progress"];
}> = ({ progress }) => (
  <div className="mx-auto max-w-3xl">
    <div className="surface-panel space-y-6">
      <div className="space-y-3 text-center">
        <div className="app-kicker">結果を準備中</div>
        <h2 className="text-3xl ui-text-heading text-text">力士人生を演算中</h2>
      </div>

      <div className="mx-auto flex max-w-xl items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden border border-white/10 bg-white/[0.03]">
          <div className="h-full w-1/3 animate-pulse bg-action/70" />
        </div>
        <div className="text-xs ui-text-label text-text-dim">
          {progress ? `${progress.bashoCount}場所` : "演算中"}
        </div>
      </div>
    </div>
  </div>
);

const RevealReadyView: React.FC<{
  progress: ReturnType<typeof useSimulation>["progress"];
}> = ({ progress }) => (
  <div className="mx-auto max-w-3xl">
    <div className="surface-panel space-y-6">
      <div className="space-y-3 text-center">
        <div className="app-kicker">開封の前</div>
        <h2 className="text-3xl ui-text-heading text-text">結果の準備ができました</h2>
      </div>

      <div className="mx-auto flex max-w-xl items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden border border-white/10 bg-white/[0.03]">
          <div className="h-full w-full bg-action/70" />
        </div>
        <div className="text-xs ui-text-label text-text-dim">
          {progress ? `${progress.bashoCount}場所` : "完了"}
        </div>
      </div>
    </div>
  </div>
);

const EmptyCareerState: React.FC = () => (
  <section className="premium-panel p-5 sm:p-6">
    <div className="border border-gold/10 bg-bg/20 px-4 py-10 text-center text-sm text-text-dim">
      キャリア未選択
    </div>
  </section>
);

const getShellTitle = (section: AppSection, shikona?: string | null): string => {
  if (section === "basho") return shikona ? `${shikona} 場所中枢` : "場所中枢";
  if (section === "career") return shikona ? `${shikona} キャリア結果` : "キャリア結果";
  if (section === "era") return shikona ? `${shikona} 時代統計` : "時代統計";
  if (section === "archive") return "アーカイブ";
  if (section === "collection") return "コレクション";
  if (section === "logicLab") return "ロジック検証";
  return "新弟子設計";
};

const getStatusLine = ({
  phase,
  progress,
  latestPauseReason,
  errorMessage,
  bashoRowsLoading,
}: {
  phase: ReturnType<typeof useSimulation>["phase"];
  progress: ReturnType<typeof useSimulation>["progress"];
  latestPauseReason: ReturnType<typeof useSimulation>["latestPauseReason"];
  errorMessage: string | undefined;
  bashoRowsLoading: boolean;
}) => {
  if (errorMessage) return errorMessage;
  if (phase === "simulating" || phase === "running") {
    return `${progress ? formatBashoLabel(progress.year, progress.month) : "-"} / ${progress ? formatRankDisplayName(progress.currentRank) : "-"} / ${progress?.bashoCount ?? 0}場所`;
  }
  if (phase === "reveal_ready") {
    return latestPauseReason ? `停止: ${latestPauseReason}` : "結果待機";
  }
  if (bashoRowsLoading) return "時代統計読込中";
  return undefined;
};

const getShellActions = ({
  phase,
  isCurrentCareerSaved,
  onSkipToEnd,
  onReveal,
  onStop,
  onSave,
}: {
  phase: ReturnType<typeof useSimulation>["phase"];
  isCurrentCareerSaved: boolean;
  onSkipToEnd: () => void;
  onReveal: () => void;
  onStop: () => Promise<void>;
  onSave: () => Promise<void>;
}) => {
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

  if (phase === "completed" && !isCurrentCareerSaved) {
    return (
      <Button variant="secondary" size="sm" onClick={() => void onSave()}>
        <Save className="mr-2 h-4 w-4" />
        保存
      </Button>
    );
  }

  return null;
};
