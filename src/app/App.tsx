import { useState } from "react";
import { ScoutScreen } from "../features/scout/components/ScoutScreen";
import { ReportScreen } from "../features/report/components/ReportScreen";
import { HallOfFameGrid } from "../features/report/components/HallOfFameGrid";
import { LogicLabScreen } from "../features/logicLab/components/LogicLabScreen";
import { Oyakata, Rank, RikishiStatus } from "../logic/models";
import { useSimulation } from "../features/simulation/hooks/useSimulation";
import { Trophy, Play, Square, AlertTriangle, FastForward, Scroll } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-washi text-sumi font-sans pb-20 selection:bg-kiniro/30 selection:text-kiniro-light">
      {/* === ゲームHUDヘッダー === */}
      <header className="sticky top-0 z-50 border-b border-kiniro-muted/30"
        style={{
          background: 'linear-gradient(180deg, #0d1b2a 0%, #0f1923 100%)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.5), inset 0 -1px 0 rgba(197,164,78,0.15)',
        }}
      >
        <div className="max-w-6xl mx-auto flex items-center justify-between px-4 py-3">
          <h1
            className="text-xl font-bold flex items-center gap-2 cursor-pointer font-serif tracking-wider text-kiniro hover:text-kiniro-light transition-colors"
            onClick={() => void handleReset()}
          >
            <span className="text-2xl" aria-hidden="true">
              &#x76F8;
            </span>
            爆速！横綱メーカー
          </h1>
          <div className="flex items-center gap-2">
            {isDev && (
              <button
                onClick={() => {
                  if (!canToggleLogicLab) return;
                  setShowSavedData(false);
                  setViewMode((current) => (current === "normal" ? "logicLab" : "normal"));
                }}
                disabled={!canToggleLogicLab}
                className={`text-xs border px-3 py-1.5 transition-all font-bold ${
                  canToggleLogicLab
                    ? "border-kiniro-muted/40 text-sumi-light hover:text-kiniro hover:border-kiniro/50"
                    : "border-washi-light text-sumi-light/40 cursor-default"
                }`}
              >
                {isLogicLabMode ? "通常画面" : "ロジック検証"}
              </button>
            )}
            <button
              onClick={async () => {
                await loadHallOfFame();
                setShowSavedData(true);
              }}
              className="text-xs border border-kiniro-muted/40 px-3 py-1.5 font-bold text-kiniro hover:bg-kiniro/10 hover:border-kiniro/50 transition-all flex items-center gap-1.5"
            >
              <Scroll className="w-3.5 h-3.5" />
              殿堂録
            </button>
          </div>
        </div>
      </header>

      <main className="p-4 pt-6 container mx-auto max-w-6xl">
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
              <div className="max-w-2xl mx-auto game-panel p-6 space-y-5">
                <div className="flex items-center justify-between pb-4 border-b border-kiniro-muted/20">
                  <div>
                    <p className="text-xl font-black tracking-widest leading-tight text-kiniro font-serif">
                      力士人生を
                      <br />
                      演算中...
                    </p>
                    <p className="text-sumi-light mt-2 font-bold text-sm">
                      {progress
                        ? `${progress.year}年${progress.month}月場所 / ${progress.bashoCount}場所目`
                        : "初期化中..."}
                    </p>
                  </div>
                  <div className="w-14 h-14 bg-gradient-to-br from-kiniro to-kiniro-dark flex items-center justify-center border border-kiniro/60 animate-pulse-slow">
                    <Trophy className="w-7 h-7 text-washi" />
                  </div>
                </div>

                {progress && (
                  <div className="bg-washi/60 border border-kiniro-muted/15 p-4 text-sm space-y-2">
                    <p className="flex justify-between items-center pb-2 mb-2 border-b border-kiniro-muted/10">
                      <span className="text-xs font-bold text-sumi-light">現在番付</span>
                      <span className="font-black text-lg text-kiniro font-serif">
                        {formatRankName(progress.currentRank)}
                      </span>
                    </p>
                    <div className="grid grid-cols-2 gap-1 text-xs font-bold text-sumi-light">
                      <span>幕内: {progress.makuuchiActive}/{progress.makuuchiSlots}名</span>
                      <span>十両: {progress.juryoActive}/{progress.juryoSlots}名</span>
                      <span>幕下: {progress.makushitaActive}/{progress.makushitaSlots}名</span>
                      <span>三段目: {progress.sandanmeActive}/{progress.sandanmeSlots}名</span>
                      <span>序二段: {progress.jonidanActive}/{progress.jonidanSlots}名</span>
                      <span>序ノ口: {progress.jonokuchiActive}/{progress.jonokuchiSlots}名</span>
                    </div>
                    <p className="text-xs font-bold text-sumi-light mt-2 pt-2 border-t border-kiniro-muted/10">
                      三賞: {progress.sanshoTotal}回（殊勲 {progress.shukunCount} / 敢闘 {progress.kantoCount} / 技能 {progress.ginoCount}）
                    </p>
                    <p className="text-[11px] font-bold text-sumi-light/60">
                      編成会議警告: {progress.lastCommitteeWarnings}件
                    </p>
                  </div>
                )}

                {latestEvents.length > 0 && (
                  <div className="border border-kiniro-muted/15 p-4 bg-washi/40">
                    <p className="text-xs font-black text-kiniro-muted mb-2 uppercase tracking-wide">
                      最新の出来事
                    </p>
                    <ul className="text-sm font-bold text-sumi-light space-y-1.5 list-disc list-inside">
                      {latestEvents.map((eventText, idx) => (
                        <li key={`${eventText}-${idx}`} className="leading-snug">
                          {eventText}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {phase === "paused" && (
                  <div className="border border-shuiro/50 bg-shuiro/10 p-4 glow-red">
                    <p className="font-black text-shuiro mb-3">
                      【中断】 {pauseReason}
                    </p>
                    <button
                      onClick={resumeSimulation}
                      className="inline-flex items-center gap-2 bg-gradient-to-b from-shuiro to-shuiro-dark text-white border border-shuiro/60 font-bold px-6 py-2 hover:from-shuiro-light hover:to-shuiro transition-all"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      再開する
                    </button>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2">
                  <button
                    onClick={skipToEnd}
                    disabled={isSkipToEnd}
                    className={`flex-1 flex justify-center items-center gap-2 px-4 py-3 font-black border transition-all ${
                      isSkipToEnd
                        ? "border-washi-light text-sumi-light/40 cursor-default"
                        : "border-kiniro/40 bg-washi-light text-kiniro hover:bg-kiniro/10 hover:border-kiniro/60"
                    }`}
                  >
                    <FastForward className="w-5 h-5 fill-current" />
                    {isSkipToEnd ? "演算をスキップ中..." : "最後まで演算をスキップ"}
                  </button>
                  <button
                    onClick={() => void stopSimulation()}
                    className="flex justify-center items-center gap-2 border border-shuiro/40 text-shuiro font-black px-4 py-3 hover:bg-shuiro/10 hover:border-shuiro/60 transition-all"
                  >
                    <Square className="w-5 h-5 fill-current" />
                    演算中止
                  </button>
                </div>
              </div>
            )}

            {/* === エラー画面 === */}
            {phase === "error" && (
              <div className="max-w-2xl mx-auto border border-shuiro/50 bg-shuiro/10 p-6 glow-red">
                <p className="font-black text-xl flex items-center gap-2 border-b border-shuiro/30 pb-3 mb-3 text-shuiro">
                  <AlertTriangle className="w-6 h-6" />
                  重大な演算エラー
                </p>
                <p className="text-sm font-bold mb-6 text-sumi-light">
                  {errorMessage || "原因不明の致命的なエラーが発生しました。"}
                </p>
                <button
                  onClick={() => void handleReset()}
                  className="w-full sm:w-auto inline-flex justify-center items-center gap-2 bg-gradient-to-b from-shuiro to-shuiro-dark text-white border border-shuiro/60 font-black px-6 py-3 hover:from-shuiro-light hover:to-shuiro transition-all"
                >
                  初期画面へ戻る
                </button>
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
