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

  const confirmDiscardUnsavedCareer = React.useCallback(() => {
    if (!currentCareerId || isCurrentCareerSaved) return true;
    return window.confirm("この力士情報は保存されませんが、よろしいですか？");
  }, [currentCareerId, isCurrentCareerSaved]);

  const handleReset = async () => {
    if (!confirmDiscardUnsavedCareer()) return;
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
          "読み終えた力士人生を保管し、あとから静かに読み返すための記録庫です。",
        statusLine: `${hallOfFame.length}件の保存済み人生`,
      };
    }
    if (activeSection === "collection") {
      return {
        title: "資料館",
        subtitle:
          "記録、偉業、決まり手を蓄積し、相撲世界の資料として読み直すための棚です。",
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
        title: "力士記録",
        subtitle:
          "開発用の観測モードです。通常プレイでは見せない途中経過を確認できます。",
        statusLine: progress
          ? `${progress.year}年${progress.month}月場所 / ${progress.bashoCount}場所目`
          : "演算開始準備中",
      };
    }
    if (isSimulating) {
      return {
        title: "力士記録",
        subtitle:
          "新弟子の一生を裏で一気に演算し、読み始められる形まで静かに整えています。",
        statusLine: "記録を整えています",
      };
    }
    if (isRevealReady) {
      return {
        title: "力士記録",
        subtitle:
          "演算は完了しています。ここから先は、その力士がどんな一生を送ったかを記録として読みます。",
        statusLine: "記録の準備完了",
      };
    }
    if (status && isCompleted) {
      return {
        title: "力士記録",
        subtitle:
          "四股名、番付、通算成績、対戦相手を読み返しながら、この力士が何者だったかを掴みます。",
        statusLine: `${status.shikona} / 最高位 ${formatRankName(status.history.maxRank)}`,
      };
    }
    return {
      title: "新弟子設計",
      subtitle:
        "出身、体格、経歴、気質、所属部屋を定め、その一生を読み始めるための出発点を置きます。",
      statusLine: `${unshelvedCareers.length}件の未保存人生`,
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
        if (nextSection === activeSection) return;
        if (nextSection === "scout" && activeSection === "career" && !confirmDiscardUnsavedCareer()) {
          return;
        }
        if (nextSection === "scout") {
          void (async () => {
            await resetView();
            await loadUnshelvedCareers();
            setActiveSection("scout");
          })();
          return;
        }
        if (nextSection === "archive") void loadHallOfFame();
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
        progress={progress}
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
        <div className="text-xl ui-text-heading text-text">まだ記録がありません</div>
        <p className="max-w-xl text-sm leading-relaxed text-text-dim">
          新弟子を設計するか、保存済み記録を開くと、この画面が力士記録の閲覧画面に切り替わります。
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button onClick={onReset}>新弟子設計へ戻る</Button>
        <Button variant="secondary" onClick={onOpenArchive}>
          保存済み記録を開く
        </Button>
      </div>
    </div>
  );
};

const ResultPreparationPanel: React.FC<{
  phase: "simulating" | "reveal_ready";
  progress: any;
  onReveal: () => void;
  onStop: () => void;
}> = ({ phase, progress, onReveal, onStop }) => {
  const isReady = phase === "reveal_ready";
  const bashoCount = progress?.bashoCount || 0;
  // 推定される進行度 (平均90場所として計算。95%で止めて完了時に100%にする)
  const percent = isReady ? 100 : Math.min(95, Math.ceil((bashoCount / 90) * 100));

  return (
    <div className="mx-auto max-w-2xl py-12">
      <div className="premium-panel p-8 sm:p-12 space-y-8 text-center relative overflow-hidden group">
        <div className="corner-gold corner-top-left" />
        <div className="corner-gold corner-top-right" />
        <div className="corner-gold corner-bottom-left" />
        <div className="corner-gold corner-bottom-right" />
        
        <div className="space-y-4 relative z-10">
          <div className="flex items-center justify-center gap-3">
             <div className="h-px w-8 bg-gold/30" />
             <div className="text-[10px] ui-text-label text-gold tracking-widest uppercase">
                {isReady ? "演算完了" : "記録を整えています"}
             </div>
             <div className="h-px w-8 bg-gold/30" />
          </div>
          <h2 className="text-4xl ui-text-heading text-text tracking-widest">
            {isReady ? "力士記録の準備が整いました" : "力士人生を演算中"}
          </h2>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-text-dim/80 font-serif italic">
            {isReady
              ? "ここから先は、番付、成績、対戦相手、転機を静かに読み返す時間です。"
              : "裏側で力士の一生を高速にシミュレートしています。読み始められる形になるまで少しだけ待ちます。"}
          </p>
        </div>

        <div className="space-y-4 relative z-10">
          <div className="flex justify-between items-end mb-1">
             <div className="text-[10px] ui-text-label text-gold/60">
                {isReady ? "READY" : `${progress?.year || "????"}年 ${progress?.month || "??"}月場所 ${progress?.bashoCount || 0}場所目`}
             </div>
             <div className="text-xl ui-text-metric text-text">
                {percent}<span className="text-xs ml-0.5">%</span>
             </div>
          </div>
          <div className="h-1.5 w-full bg-gold/10 overflow-hidden relative border border-gold/10">
            <div
              className={`h-full bg-gradient-to-r from-gold/5 from-gold/40 via-gold to-gold/40 transition-all duration-700 ease-out ${!isReady ? "animate-pulse" : ""}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-6 pt-4 relative z-10">
          {isReady ? (
            <Button size="lg" onClick={onReveal} className="min-w-[180px] h-14 text-lg">
              <BookOpenText className="w-5 h-5 mr-3" />
              力士記録を読む
            </Button>
          ) : (
            <Button variant="outline" size="lg" onClick={onStop} className="min-w-[180px] h-14 text-lg border-gold/30 text-gold/80 hover:bg-gold/10 hover:text-gold">
              中断して戻る
            </Button>
          )}
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


