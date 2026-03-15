import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookOpenText, FastForward, Square } from "lucide-react";
import { AppSection, AppShell } from "./AppShell";
import { ScoutScreen } from "../features/scout/components/ScoutScreen";
import { ReportScreen } from "../features/report/components/ReportScreen";
import { ArchiveScreen } from "../features/report/components/ArchiveScreen";
import { LogicLabScreen } from "../features/logicLab/components/LogicLabScreen";
import { Oyakata, Rank, RikishiStatus } from "../logic/models";
import { useSimulation } from "../features/simulation/hooks/useSimulation";
import { Button } from "../shared/ui/Button";

const formatRankName = (rank: Rank): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) return `${side}${rank.name}`;
  const number = rank.number || 1;
  return number === 1 ? `${side}${rank.name}筆頭` : `${side}${rank.name}${number}枚目`;
};

function App() {
  const [activeSection, setActiveSection] = useState<AppSection>("scout");

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
    stopSimulation,
    saveCurrentCareer,
    loadHallOfFame,
    loadUnshelvedCareers,
    openCareer,
    deleteCareerById,
    resetView,
  } = useSimulation();
  const previousPhaseRef = useRef(phase);

  useEffect(() => {
    void loadHallOfFame();
    void loadUnshelvedCareers();
  }, [loadHallOfFame, loadUnshelvedCareers]);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    if (
      phase === "running" ||
      (status && phase === "completed" && previousPhase !== "completed")
    ) {
      setActiveSection("career");
    } else if (phase === "idle" && !status && activeSection === "career") {
      setActiveSection("scout");
    }
    previousPhaseRef.current = phase;
  }, [activeSection, phase, status]);

  const handleStart = async (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
  ) => {
    await startSimulation(initialStats, oyakata);
    setActiveSection("career");
  };

  const isDev = import.meta.env.DEV;
  const isRunning = phase === "running";
  const isCompleted = phase === "completed";
  const isInstantMode = simulationPacing === "skip_to_end";

  const shellCopy = useMemo(() => {
    if (activeSection === "archive") {
      return {
        title: "保存済み記録",
        subtitle:
          "保存した力士人生を一覧し、右側のプレビューで誰のどんな記録かを素早く読み返します。",
        statusLine: `${hallOfFame.length}件の保存済み記録`,
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
        title: "現役力士記録",
        subtitle:
          "いま進んでいる場所、番付、出来事だけに絞って、力士人生の進行を監督盤として見せます。",
        statusLine: progress
          ? `${progress.year}年${progress.month}月場所 / ${progress.bashoCount}場所目`
          : "演算開始準備中",
      };
    }
    if (status && isCompleted) {
      return {
        title: "現役力士記録",
        subtitle:
          "四股名、成績、転機、宿敵を読み返しながら、この力士が何者だったかを一画面で掴みます。",
        statusLine: `${status.shikona} / 最高位 ${formatRankName(status.history.maxRank)}`,
      };
    }
    return {
      title: "新弟子",
      subtitle:
        "候補を引いて、素質の輪郭だけを先に見極め、必要な項目だけを整えて入門させます。",
      statusLine: `${unshelvedCareers.length}件の未保存キャリア`,
    };
  }, [activeSection, hallOfFame.length, isCompleted, isDev, isRunning, progress, status, unshelvedCareers.length]);

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
            <Button variant="outline" size="sm" onClick={() => void stopSimulation()}>
              <Square className="mr-1.5 h-4 w-4" />
              演算を中止
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void resetView()}>
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
          onReset={() => void resetView()}
          onSave={async () => {
            await saveCurrentCareer();
            await loadHallOfFame();
          }}
          onOpenArchive={() => setActiveSection("archive")}
        />
      ) : (
        <ScoutScreen onStart={handleStart} />
      )}
    </AppShell>
  );
}

const CareerSection: React.FC<{
  phase: string;
  status: RikishiStatus | null;
  progress: any;
  latestEvents: string[];
  latestPauseReason?: string;
  errorMessage?: string;
  isCurrentCareerSaved: boolean;
  currentCareerId: string | null;
  isInstantMode: boolean;
  onReset: () => void;
  onSave: () => void | Promise<void>;
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
  onSave,
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

  if (status && phase === "completed") {
    return (
      <ReportScreen
        status={status}
        careerId={currentCareerId}
        onReset={onReset}
        onSave={onSave}
        isSaved={isCurrentCareerSaved}
      />
    );
  }

  return (
    <div className="empty-stage">
      <BookOpenText className="h-12 w-12 text-text-faint" />
      <div className="space-y-2 text-center">
        <div className="text-xl ui-text-heading text-text">まだ読むべき記録がありません</div>
        <p className="max-w-xl text-sm leading-relaxed text-text-dim">
          新弟子から力士人生を始めるか、保存済み記録を開くと、この画面が一代記の閲覧画面に切り替わります。
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
                ? "一気に最後まで進めています。現在地だけを静かに返します。"
                : "いま起きていることだけを短く残し、実況ではなく監督盤として見せます。"}
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

export default App;
