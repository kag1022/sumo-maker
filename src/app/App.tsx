import React from "react";
import { AlertTriangle, BookOpenText, FastForward, Square } from "lucide-react";
import { AppSection, AppShell } from "./AppShell";
import { ScoutScreen } from "../features/scout/components/ScoutScreen";
import { ReportScreen } from "../features/report/components/ReportScreen";
import { ArchiveScreen } from "../features/report/components/ArchiveScreen";
import { CollectionScreen } from "../features/collection/components/CollectionScreen";
import { LogicLabScreen } from "../features/logicLab/components/LogicLabScreen";
import { Oyakata, Rank, RikishiStatus } from "../logic/models";
import { useSimulation } from "../features/simulation/hooks/useSimulation";
import type { SimulationPacing, SimulationPhase } from "../features/simulation/store/simulationStore";
import { Button } from "../shared/ui/Button";

const formatRankName = (rank: Rank): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

export const App: React.FC = () => {
  const [activeSection, setActiveSection] = React.useState<AppSection>("scout");

  const {
    phase,
    status,
    progress,
    currentCareerId,
    latestPauseReason,
    latestEvents,
    hallOfFame,
    unshelvedCareers,
    errorMessage,
    isCurrentCareerSaved,
    simulationPacing,
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

  React.useEffect(() => {
    void loadHallOfFame();
    void loadUnshelvedCareers();
  }, [loadHallOfFame, loadUnshelvedCareers]);

  const handleStart = async (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    initialPacing: SimulationPacing = "skip_to_end",
  ) => {
    await startSimulation(initialStats, oyakata, undefined, undefined, initialPacing);
    setActiveSection("career");
  };

  const handleReset = async () => {
    await resetView();
    setActiveSection("scout");
  };

  const handleStop = async () => {
    await stopSimulation();
    setActiveSection("scout");
  };

  const isDev = import.meta.env.DEV;
  const isRunning = phase === "running";
  const isSimulating = phase === "simulating";
  const isRevealReady = phase === "reveal_ready";
  const isCompleted = phase === "completed";
  const isInstantMode = simulationPacing === "skip_to_end";

  const shellCopy = React.useMemo(() => {
    if (activeSection === "archive") {
      return {
        title: "保存済み記録",
        subtitle:
          "保存した力士人生を一覧し、右側のプレビューで誰のどんな記録かを素早く読み返します。",
        statusLine: `${hallOfFame.length}件の保存済み記録`,
      };
    }
    if (activeSection === "collection") {
      return {
        title: "図鑑",
        subtitle:
          "記録、偉業、決まり手の解放状況を一覧し、何が埋まったのかを具体的に読み返します。",
        statusLine: "記録 / 偉業 / 決まり手",
      };
    }
    if (activeSection === "logicLab" && isDev) {
      return {
        title: "ロジック検証",
        subtitle: "通常プレイとは切り離し、番付や本割の挙動を検証するための画面です。",
        statusLine: "開発者専用",
      };
    }
    if (isRunning) {
      return {
        title: "力士結果",
        subtitle:
          "開発用の観測モードです。通常プレイでは見せない途中経過を確認できます。",
        statusLine: progress
          ? `${progress.year}年${progress.month}月場所 / ${progress.bashoCount}場所目`
          : "演算開始準備中",
      };
    }
    if (isSimulating) {
      return {
        title: "力士結果",
        subtitle:
          "候補から生まれる力士人生を裏で一気に演算し、結果の準備ができたら開封します。",
        statusLine: "結果を準備中",
      };
    }
    if (isRevealReady) {
      return {
        title: "力士結果",
        subtitle:
          "演算は完了しています。結果を見るまで中身は伏せたままにし、開封の瞬間を保ちます。",
        statusLine: "演算完了",
      };
    }
    if (status && isCompleted) {
      return {
        title: "力士結果",
        subtitle:
          "四股名、成績、歩み、ライバルを読み返しながら、この力士が何者だったかを一画面で掴みます。",
        statusLine: `${status.shikona} / 最高位 ${formatRankName(status.history.maxRank)}`,
      };
    }
    return {
      title: "新弟子",
      subtitle:
        "候補を引いて、素質の輪郭だけを先に見極め、必要な項目だけを整えて入門させます。",
      statusLine: `${unshelvedCareers.length}件の未保存キャリア`,
    };
  }, [
    activeSection,
    hallOfFame.length,
    isCompleted,
    isDev,
    isRevealReady,
    isRunning,
    isSimulating,
    progress,
    status,
    unshelvedCareers.length,
  ]);

  return (
    <AppShell
      activeSection={activeSection}
      onSectionChange={(nextSection) => {
        if (nextSection === "archive") void loadHallOfFame();
        if (nextSection === "scout") void loadUnshelvedCareers();
        if (nextSection === "logicLab" && !isDev) return;
        setActiveSection(nextSection);
      }}
      title={shellCopy.title}
      subtitle={shellCopy.subtitle}
      statusLine={shellCopy.statusLine}
      showLogicLab={isDev}
      actions={
        activeSection === "career" && isRunning ? (
          <div className="flex flex-wrap gap-2">
            {!isInstantMode && (
              <Button variant="secondary" size="sm" onClick={skipToEnd}>
                <FastForward className="mr-1.5 h-4 w-4" />
                最後まで進める
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => void handleStop()}>
              <Square className="mr-1.5 h-4 w-4" />
              演算を中止
            </Button>
          </div>
        ) : activeSection === "career" && (isSimulating || isRevealReady) ? undefined : (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void handleReset()}>
              初期状態へ戻す
            </Button>
          </div>
        )
      }
    >
      {activeSection === "logicLab" && isDev ? (
        <LogicLabScreen />
      ) : activeSection === "archive" ? (
        <ArchiveScreen
          items={hallOfFame as any}
          onOpen={async (id) => {
            await openCareer(id);
            setActiveSection("career");
          }}
          onDelete={async (id) => {
            await deleteCareerById(id);
            await loadHallOfFame();
          }}
        />
      ) : activeSection === "collection" ? (
        <CollectionScreen onOpenArchive={() => setActiveSection("archive")} />
      ) : activeSection === "career" ? (
        <CareerSection
          phase={phase}
          status={status}
          progress={progress}
          latestEvents={latestEvents}
          latestPauseReason={latestPauseReason}
          errorMessage={errorMessage}
          isCurrentCareerSaved={isCurrentCareerSaved}
          currentCareerId={currentCareerId}
          isInstantMode={isInstantMode}
          onReset={handleReset}
          onReveal={revealCurrentResult}
          onStop={handleStop}
          onSave={async () => {
            await saveCurrentCareer();
            await loadHallOfFame();
          }}
          onOpenCollection={() => setActiveSection("collection")}
          onOpenArchive={() => setActiveSection("archive")}
        />
      ) : (
        <ScoutScreen onStart={handleStart} />
      )}
    </AppShell>
  );
}

const CareerSection: React.FC<{
  phase: SimulationPhase;
  status: RikishiStatus | null;
  progress: any;
  latestEvents: string[];
  latestPauseReason?: string;
  errorMessage?: string;
  isCurrentCareerSaved: boolean;
  currentCareerId: string | null;
  isInstantMode: boolean;
  onReset: () => void;
  onReveal: () => void;
  onStop: () => void;
  onSave: () => void | Promise<void>;
  onOpenCollection: () => void;
  onOpenArchive: () => void;
}> = ({
  phase,
  status,
  progress,
  latestEvents,
  latestPauseReason,
  errorMessage,
  isCurrentCareerSaved,
  currentCareerId,
  isInstantMode,
  onReset,
  onReveal,
  onStop,
  onSave,
  onOpenCollection,
  onOpenArchive,
}) => {
  if (phase === "error") {
    return (
      <div className="surface-panel max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" />
          演算を完了できませんでした
        </div>
        <div className="text-base text-text">{errorMessage || "不明なエラーが発生しました。"}</div>
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={onReset}>
            初期状態へ戻る
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "running") {
    return (
      <RunningDashboard
        progress={progress}
        latestEvents={latestEvents}
        latestPauseReason={latestPauseReason}
        isInstantMode={isInstantMode}
      />
    );
  }

  if (phase === "simulating" || phase === "reveal_ready") {
    return (
      <ResultPreparationPanel
        phase={phase}
        onReveal={onReveal}
        onStop={onStop}
      />
    );
  }

  if (status && phase === "completed") {
    return (
      <ReportScreen
        status={status}
        careerId={currentCareerId}
        onReset={onReset}
        onSave={onSave}
        isSaved={isCurrentCareerSaved}
        onOpenCollection={onOpenCollection}
      />
    );
  }

  return (
    <div className="empty-stage">
      <BookOpenText className="h-12 w-12 text-text-faint" />
      <div className="space-y-2 text-center">
        <div className="text-xl ui-text-heading text-text">まだ結果がありません</div>
        <p className="max-w-xl text-sm leading-relaxed text-text-dim">
          新弟子から始めるか、保存済み記録を開くと、この画面が力士結果の閲覧画面に切り替わります。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onReset}>新弟子へ戻る</Button>
        <Button variant="secondary" onClick={onOpenArchive}>
          保存済み記録を開く
        </Button>
      </div>
    </div>
  );
};

const ResultPreparationPanel: React.FC<{
  phase: "simulating" | "reveal_ready";
  onReveal: () => void;
  onStop: () => void;
}> = ({ phase, onReveal, onStop }) => {
  const isReady = phase === "reveal_ready";
  return (
    <div className="mx-auto max-w-3xl">
      <div className="surface-panel space-y-6">
        <div className="space-y-3 text-center">
          <div className="app-kicker">{isReady ? "開封の前" : "結果を準備中"}</div>
          <h2 className="text-3xl ui-text-heading text-text">
            {isReady ? "結果の準備ができました" : "力士人生を演算中"}
          </h2>
          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-text-dim">
            {isReady
              ? "人生の中身はまだ伏せています。準備が整ったら、結果を見るボタンから一代記を開封してください。"
              : "途中経過は見せず、力士人生を裏でまとめて演算しています。終わったら、そのまま結果を開けます。"}
          </p>
        </div>

        <div className="mx-auto flex max-w-xl items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden border-2 border-brand-muted bg-surface-panel">
            <div
              className={`h-full bg-action/70 ${isReady ? "w-full" : "w-1/3 animate-pulse"}`}
            />
          </div>
          <div className="text-xs ui-text-label text-text-dim">
            {isReady ? "完了" : "演算中"}
          </div>
        </div>

        <div className="rounded-none border-2 border-brand-muted bg-surface-panel px-4 py-3 text-sm text-text-dim">
          {isReady
            ? "準備が整いました。結果を見ると一代記を開封できます。"
            : "結果がまとまるまで、このまましばらくお待ちください。"}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {isReady ? (
            <Button size="lg" onClick={onReveal}>
              結果を見る
            </Button>
          ) : null}
          <Button variant={isReady ? "secondary" : "outline"} size="lg" onClick={onStop}>
            中止して戻る
          </Button>
        </div>
      </div>
    </div>
  );
};

const RunningDashboard: React.FC<{
  progress: any;
  latestEvents: string[];
  latestPauseReason?: string;
  isInstantMode: boolean;
}> = ({ progress, latestEvents, latestPauseReason, isInstantMode }) => {
  const observationItems = latestEvents.length > 0 ? latestEvents : ["まだ大きな出来事は記録されていません。"];
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.7fr)]">
      <section className="surface-panel space-y-5">
        <div className="flex items-end justify-between gap-4 border-b border-line pb-4">
          <div>
            <div className="panel-title">進行監督盤</div>
            <p className="panel-caption">
              {isInstantMode
                ? "開発用に最後まで早送りしています。現在地だけを静かに返します。"
                : "通常プレイでは見せない途中経過を、開発用に短く観測します。"}
            </p>
          </div>
          <div className="text-right text-sm text-text-dim">
            {progress
              ? `${progress.year}年${progress.month}月場所`
              : "演算を準備中"}
          </div>
        </div>

        <div className="metric-strip">
          <div className="metric-card">
            <div className="metric-label">現在の場所</div>
            <div className="metric-value">
              {progress ? `${progress.year}年${progress.month}月場所` : "初期化中"}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">現在番付</div>
            <div className="metric-value">
              {progress ? formatRankName(progress.currentRank) : "未確定"}
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-label">進行段階</div>
            <div className="metric-value">
              {progress ? `${progress.bashoCount}場所目` : "準備中"}
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="panel-title">最新の出来事</div>
          <div className="observation-log">
            {observationItems.map((eventText, index) => (
              <div key={`${eventText}-${index}`} className="observation-item">
                <div className="observation-index">{String(index + 1).padStart(2, "0")}</div>
                <div className="observation-text">{eventText}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="surface-panel space-y-4">
        <div>
          <div className="panel-title">状況の要点</div>
          <p className="panel-caption">
            全階級の一覧ではなく、判断に必要な兆しだけを右側に置きます。
          </p>
        </div>

        <div className="info-row">
          <span>幕内の稼働</span>
          <span>{progress ? `${progress.makuuchiActive}/${progress.makuuchiSlots}` : "不明"}</span>
        </div>
        <div className="info-row">
          <span>十両の稼働</span>
          <span>{progress ? `${progress.juryoActive}/${progress.juryoSlots}` : "不明"}</span>
        </div>
        <div className="info-row">
          <span>三賞</span>
          <span>
            {progress
              ? `${progress.sanshoTotal}回（殊${progress.shukunCount} / 敢${progress.kantoCount} / 技${progress.ginoCount}）`
              : "不明"}
          </span>
        </div>
        <div className="info-row">
          <span>警告件数</span>
          <span>{progress ? `${progress.lastCommitteeWarnings}件` : "0件"}</span>
        </div>

        {latestPauseReason && (
          <div className="status-callout" data-tone="attention">
            <div className="status-callout-title">直近の停止理由</div>
            <div className="status-callout-text">{latestPauseReason}</div>
          </div>
        )}
      </section>
    </div>
  );
};


