import { useState } from "react";
import { ScoutScreen } from "../features/scout/components/ScoutScreen";
import { ReportScreen } from "../features/report/components/ReportScreen";
import { HallOfFameGrid } from "../features/report/components/HallOfFameGrid";
import { LogicLabScreen } from "../features/logicLab/components/LogicLabScreen";
import { Oyakata, Rank, RikishiStatus } from "../logic/models";
import { useSimulation } from "../features/simulation/hooks/useSimulation";
import { Button } from "../shared/ui/Button";
import {
  Trophy,
  Play,
  Square,
  AlertTriangle,
  FastForward,
  Scroll,
  FlaskConical,
  Menu,
  X,
} from "lucide-react";

const formatRankName = (rank: Rank): string => {
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  const number = rank.number || 1;
  return `${side}${rank.name}${number}枚目`;
};

function App() {
  const [showSavedData, setShowSavedData] = useState(false);
  const [viewMode, setViewMode] = useState<"normal" | "logicLab">("normal");
  const [menuOpen, setMenuOpen] = useState(false);

  const {
    phase,
    status,
    progress,
    currentCareerId,
    pauseReason,
    latestEvents,
    hallOfFame,
    errorMessage,
    isCurrentCareerSaved,
    isSkipToEnd,
    simulationSpeed,
    startSimulation,
    resumeSimulation,
    skipToEnd,
    stopSimulation,
    saveCurrentCareer,
    loadHallOfFame,
    openCareer,
    deleteCareerById,
    resetView,
  } = useSimulation();

  const handleStart = async (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
  ) => {
    await startSimulation(initialStats, oyakata);
  };

  const handleReset = async () => {
    await resetView();
  };

  const isRunning = phase === "running" || phase === "paused";
  const isCompleted = phase === "completed";
  const isDev = import.meta.env.DEV;
  const isLogicLabMode = viewMode === "logicLab";
  const canToggleLogicLab = phase !== "running" && phase !== "paused";
  const isInstantMode = simulationSpeed === "instant";

  return (
    <div className="min-h-screen bg-bg text-text font-sans pb-20 selection:bg-gold/30 selection:text-gold-bright">
      {/* === ヘッダー === */}
      <header className="sticky top-0 z-50 border-b-2 border-gold-muted bg-bg">
        <div className="max-w-4xl mx-auto flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
          <h1
            className="text-lg sm:text-xl ui-text-label flex items-center gap-2 cursor-pointer text-gold hover:text-gold-bright transition-colors"
            onClick={() => void handleReset()}
          >
            <span className="text-xl sm:text-2xl" aria-hidden="true">
              &#x76F8;
            </span>
            <span className="hidden sm:inline">爆速！横綱メーカー</span>
            <span className="sm:hidden">横綱メーカー</span>
          </h1>

          {/* デスクトップナビ */}
          <div className="hidden sm:flex items-center gap-2">
            {isDev && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!canToggleLogicLab) return;
                  setShowSavedData(false);
                  setViewMode((current) =>
                    current === "normal" ? "logicLab" : "normal",
                  );
                }}
                disabled={!canToggleLogicLab}
              >
                <FlaskConical className="w-3.5 h-3.5 mr-1" />
                {isLogicLabMode ? "通常画面" : "ロジック検証"}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await loadHallOfFame();
                setShowSavedData(true);
              }}
            >
              <Scroll className="w-3.5 h-3.5 mr-1" />
              殿堂録
            </Button>
          </div>

          {/* モバイルメニューボタン */}
          <button
            className="sm:hidden p-2 text-gold hover:text-gold-bright transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="メニュー"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* モバイルメニュードロワー */}
        {menuOpen && (
          <div className="sm:hidden border-t-2 border-gold-muted bg-bg-panel px-3 py-3 space-y-2 animate-slide-up">
            {isDev && (
              <button
                className="w-full text-left ui-text-label text-sm px-3 py-3 border-2 border-gold-muted text-text-dim hover:border-gold hover:text-gold transition-colors disabled:opacity-40"
                onClick={() => {
                  if (!canToggleLogicLab) return;
                  setShowSavedData(false);
                  setViewMode((current) =>
                    current === "normal" ? "logicLab" : "normal",
                  );
                  setMenuOpen(false);
                }}
                disabled={!canToggleLogicLab}
              >
                <FlaskConical className="w-4 h-4 inline mr-2" />
                {isLogicLabMode ? "通常画面" : "ロジック検証"}
              </button>
            )}
            <button
              className="w-full text-left ui-text-label text-sm px-3 py-3 border-2 border-gold-muted text-text-dim hover:border-gold hover:text-gold transition-colors"
              onClick={async () => {
                await loadHallOfFame();
                setShowSavedData(true);
                setMenuOpen(false);
              }}
            >
              <Scroll className="w-4 h-4 inline mr-2" />
              殿堂録
            </button>
          </div>
        )}
      </header>

      <main className="px-3 py-4 sm:p-4 sm:pt-6 mx-auto max-w-4xl">
        {isLogicLabMode ? (
          <LogicLabScreen />
        ) : (
          <>
            {showSavedData && (
              <HallOfFameGrid
                items={hallOfFame as any}
                onOpen={async (id) => {
                  await openCareer(id);
                  setShowSavedData(false);
                }}
                onDelete={async (id) => {
                  await deleteCareerById(id);
                }}
                onClose={() => setShowSavedData(false)}
              />
            )}

            {!status && !isRunning && phase !== "error" && (
              <ScoutScreen onStart={handleStart} />
            )}

            {/* === 演算中画面 === */}
            {isRunning && (
              <div className="max-w-2xl mx-auto rpg-panel p-4 sm:p-6 space-y-4 animate-in">
                {/* 一括演算モード: シンプルローディング */}
                {isInstantMode ? (
                  <div className="text-center py-8 sm:py-12">
                    <p className="ui-text-label text-gold-bright text-lg sm:text-xl mb-4 animate-pulse-soft">
                      演算中...
                    </p>
                    <div className="w-48 sm:w-64 mx-auto gauge-bar">
                      <div
                        className="gauge-fill bg-gold shimmer"
                        style={{ width: "100%" }}
                      />
                    </div>
                    <p className="text-xs text-text-dim mt-4 ui-text-label">
                      力士人生を高速演算しています
                    </p>
                  </div>
                ) : (
                  <>
                    {/* 実況モード: 詳細進捗 */}
                    <div className="flex items-center justify-between pb-3 border-b-2 border-gold-muted">
                      <div>
                        <p className="ui-text-label text-lg sm:text-xl text-gold leading-tight">
                          力士人生を
                          <br />
                          演算中...
                        </p>
                        <p className="text-text-dim mt-2 text-xs sm:text-sm">
                          {progress
                            ? `${progress.year}年${progress.month}月場所 / ${progress.bashoCount}場所目`
                            : "初期化中..."}
                        </p>
                      </div>
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-bg border-2 border-gold flex items-center justify-center animate-pulse-soft">
                        <Trophy className="w-6 h-6 sm:w-7 sm:h-7 text-gold" />
                      </div>
                    </div>

                    {/* 進捗ステータス */}
                    {progress && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-3 border-2 border-gold-muted bg-bg">
                          <span className="text-xs ui-text-label text-text-dim">現在番付</span>
                          <span className="ui-text-label text-base sm:text-lg text-gold">
                            {formatRankName(progress.currentRank)}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
                          {[
                            { label: "幕内", active: progress.makuuchiActive, total: progress.makuuchiSlots },
                            { label: "十両", active: progress.juryoActive, total: progress.juryoSlots },
                            { label: "幕下", active: progress.makushitaActive, total: progress.makushitaSlots },
                            { label: "三段目", active: progress.sandanmeActive, total: progress.sandanmeSlots },
                            { label: "序二段", active: progress.jonidanActive, total: progress.jonidanSlots },
                            { label: "序ノ口", active: progress.jonokuchiActive, total: progress.jonokuchiSlots },
                          ].map(({ label, active, total }) => (
                            <div key={label} className="flex justify-between p-2 border border-gold-muted bg-bg">
                              <span className="text-text-dim">{label}</span>
                              <span className="text-text">{active}/{total}</span>
                            </div>
                          ))}
                        </div>

                        <div className="flex items-center justify-between text-xs p-2 border border-gold-muted bg-bg">
                          <span className="text-text-dim">
                            三賞 {progress.sanshoTotal}回 (殊{progress.shukunCount} 敢{progress.kantoCount} 技{progress.ginoCount})
                          </span>
                          <span className="text-text-dim">
                            警告 {progress.lastCommitteeWarnings}件
                          </span>
                        </div>
                      </div>
                    )}

                    {/* 最新イベント */}
                    {latestEvents.length > 0 && (
                      <div className="border-2 border-gold-muted p-3 bg-bg">
                        <p className="text-xs ui-text-label text-gold mb-2">
                          最新の出来事
                        </p>
                        <ul className="text-xs sm:text-sm text-text-dim space-y-1 list-disc list-inside">
                          {latestEvents.map((eventText, idx) => (
                            <li key={`${eventText}-${idx}`} className="leading-snug">
                              {eventText}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 一時停止通知 */}
                    {phase === "paused" && (
                      <div className="border-2 border-crimson bg-crimson-dim/10 p-4 glow-red">
                        <p className="ui-text-label text-crimson mb-3">
                          【中断】 {pauseReason}
                        </p>
                        <Button variant="danger" onClick={resumeSimulation}>
                          <Play className="w-4 h-4 fill-current mr-2" />
                          再開する
                        </Button>
                      </div>
                    )}
                  </>
                )}

                {/* 操作ボタン */}
                <div className="flex flex-col gap-2 pt-2">
                  {!isInstantMode && (
                    <Button
                      variant="secondary"
                      onClick={skipToEnd}
                      disabled={isSkipToEnd}
                      className="w-full py-3"
                    >
                      <FastForward className="w-5 h-5 fill-current mr-2" />
                      {isSkipToEnd ? "スキップ中..." : "最後までスキップ"}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => void stopSimulation()}
                    className="w-full py-3 text-crimson border-crimson/40 hover:bg-crimson-dim/10"
                  >
                    <Square className="w-5 h-5 fill-current mr-2" />
                    演算中止
                  </Button>
                </div>
              </div>
            )}

            {/* === エラー画面 === */}
            {phase === "error" && (
              <div className="max-w-2xl mx-auto rpg-panel border-crimson p-4 sm:p-6 glow-red animate-in">
                <p className="ui-text-label text-lg sm:text-xl flex items-center gap-2 border-b-2 border-crimson/30 pb-3 mb-3 text-crimson">
                  <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6" />
                  重大な演算エラー
                </p>
                <p className="text-xs sm:text-sm mb-6 text-text-dim">
                  {errorMessage || "原因不明の致命的なエラーが発生しました。"}
                </p>
                <Button variant="danger" size="lg" onClick={() => void handleReset()}>
                  初期画面へ戻る
                </Button>
              </div>
            )}

            {status && isCompleted && (
              <ReportScreen
                status={status}
                careerId={currentCareerId}
                onReset={() => void handleReset()}
                onSave={async () => {
                  await saveCurrentCareer();
                }}
                isSaved={isCurrentCareerSaved}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
