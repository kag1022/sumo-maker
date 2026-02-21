import { useState } from "react";
import { ScoutScreen } from "../features/scout/components/ScoutScreen";
import { ReportScreen } from "../features/report/components/ReportScreen";
import { HallOfFameGrid } from "../features/report/components/HallOfFameGrid";
import { Oyakata, Rank, RikishiStatus } from "../logic/models";
import { useSimulation } from "../features/simulation/hooks/useSimulation";
import { Trophy, Play, Square, AlertTriangle, FastForward } from "lucide-react";

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

  const {
    phase,
    status,
    progress,
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

  return (
    <div className="min-h-screen bg-washi text-sumi font-sans pb-20 selection:bg-shuiro selection:text-washi">
      <header className="bg-kassairo text-washi p-4 border-b-4 border-sumi sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1
            className="text-xl font-bold flex items-center gap-2 cursor-pointer"
            onClick={() => void handleReset()}
          >
            <span className="text-2xl" aria-hidden="true">
              🏋️
            </span>
            爆速！横綱メーカー
          </h1>
          <button
            onClick={async () => {
              await loadHallOfFame();
              setShowSavedData(true);
            }}
            className="text-sm border-2 border-washi bg-transparent px-3 py-1 hover:bg-washi hover:text-kassairo transition-colors font-bold"
          >
            殿堂録
          </button>
        </div>
      </header>

      <main className="p-4 pt-8 container mx-auto">
        {showSavedData && (
          <HallOfFameGrid
            items={hallOfFame as any} // Cast to any to bypass strict type checking for now, matching the properties used.
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

        {isRunning && (
          <div className="max-w-2xl mx-auto bg-washi border-4 border-sumi shadow-[8px_8px_0px_0px_#2b2b2b] p-6 space-y-6">
            <div className="flex items-center justify-between border-b-2 border-sumi pb-4">
              <div>
                <p className="text-2xl font-black tracking-widest leading-tight">
                  力士人生を
                  <br />
                  演算中...
                </p>
                <p className="text-sumi mt-2 font-bold">
                  {progress
                    ? `${progress.year}年${progress.month}月場所 / ${progress.bashoCount}場所目`
                    : "初期化中..."}
                </p>
              </div>
              <div className="w-16 h-16 bg-shuiro flex items-center justify-center border-2 border-sumi shadow-[4px_4px_0px_0px_#2b2b2b] animate-pulse">
                <Trophy className="w-8 h-8 text-washi" />
              </div>
            </div>

            {progress && (
              <div className="bg-washi border-2 border-sumi p-4 text-sm text-sumi-dark shadow-[4px_4px_0px_0px_#2b2b2b]">
                <p className="flex justify-between items-center border-b border-sumi-light/30 pb-2 mb-2">
                  <span className="text-xs font-bold text-sumi">現在番付</span>
                  <span className="font-black text-lg">
                    {formatRankName(progress.currentRank)}
                  </span>
                </p>
                <p className="text-xs font-bold text-sumi flex justify-between">
                  <span>幕内: {progress.makuuchiActive}/{progress.makuuchiSlots}名</span>
                  <span>十両: {progress.juryoActive}/{progress.juryoSlots}名</span>
                </p>
                <p className="text-xs font-bold text-sumi flex justify-between mt-1">
                  <span>幕下: {progress.makushitaActive}/{progress.makushitaSlots}名</span>
                  <span>三段目: {progress.sandanmeActive}/{progress.sandanmeSlots}名</span>
                </p>
                <p className="text-xs font-bold text-sumi flex justify-between mt-1">
                  <span>序二段: {progress.jonidanActive}/{progress.jonidanSlots}名</span>
                  <span>序ノ口: {progress.jonokuchiActive}/{progress.jonokuchiSlots}名</span>
                </p>
                <p className="text-xs font-bold text-sumi mt-2 border-t border-sumi-light/30 pt-2">
                  三賞: {progress.sanshoTotal}回（殊勲 {progress.shukunCount} / 敢闘 {progress.kantoCount} / 技能 {progress.ginoCount}）
                </p>
                <p className="text-[11px] font-bold text-sumi mt-1">
                  編成会議警告: {progress.lastCommitteeWarnings}件
                </p>
              </div>
            )}

            {latestEvents.length > 0 && (
              <div className="border-2 border-sumi p-4 bg-washi shadow-[4px_4px_0px_0px_#2b2b2b]">
                <p className="text-xs font-black text-sumi mb-2 uppercase tracking-wide">
                  最新の出来事
                </p>
                <ul className="text-sm font-bold text-sumi space-y-1.5 list-disc list-inside">
                  {latestEvents.map((eventText, idx) => (
                    <li key={`${eventText}-${idx}`} className="leading-snug">
                      {eventText}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {phase === "paused" && (
              <div className="border-4 border-shuiro bg-washi p-4 shadow-[4px_4px_0px_0px_#b84c39]">
                <p className="font-black text-shuiro mb-3">
                  【中断】 {pauseReason}
                </p>
                <button
                  onClick={resumeSimulation}
                  className="inline-flex items-center gap-2 bg-shuiro text-washi border-2 border-sumi font-bold px-6 py-2 hover:bg-washi hover:text-shuiro shadow-[2px_2px_0px_0px_#2b2b2b] active:translate-y-0.5 active:shadow-none transition-none"
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
                className={`flex-1 flex justify-center items-center gap-2 px-4 py-3 font-black border-2 transition-none ${
                  isSkipToEnd
                    ? "border-sumi-light bg-washi text-sumi-light cursor-default"
                    : "border-sumi bg-sumi text-washi hover:bg-washi hover:text-sumi shadow-[4px_4px_0px_0px_#2b2b2b] active:translate-y-1 active:shadow-none"
                }`}
              >
                <FastForward className="w-5 h-5 fill-current" />
                {isSkipToEnd ? "演算をスキップ中..." : "最後まで演算をスキップ"}
              </button>
              <button
                onClick={() => void stopSimulation()}
                className="flex justify-center items-center gap-2 border-2 border-sumi bg-washi text-sumi font-black px-4 py-3 hover:bg-kassairo hover:text-washi hover:border-kassairo shadow-[4px_4px_0px_0px_#2b2b2b] active:translate-y-1 active:shadow-none transition-none"
              >
                <Square className="w-5 h-5 fill-current" />
                演算中止
              </button>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div className="max-w-2xl mx-auto border-4 border-shuiro bg-washi p-6 text-shuiro shadow-[8px_8px_0px_0px_#b84c39]">
            <p className="font-black text-xl flex items-center gap-2 border-b-2 border-shuiro pb-3 mb-3">
              <AlertTriangle className="w-6 h-6" />
              重大な演算エラー
            </p>
            <p className="text-sm font-bold mb-6">
              {errorMessage || "原因不明の致命的なエラーが発生しました。"}
            </p>
            <button
              onClick={() => void handleReset()}
              className="w-full sm:w-auto inline-flex justify-center items-center gap-2 bg-shuiro text-washi border-2 border-sumi font-black px-6 py-3 hover:bg-washi hover:text-shuiro shadow-[4px_4px_0px_0px_#2b2b2b] active:translate-y-1 active:shadow-none transition-none"
            >
              初期画面へ戻る
            </button>
          </div>
        )}

        {status && isCompleted && (
          <ReportScreen
            status={status}
            onReset={() => void handleReset()}
            onSave={async () => {
              await saveCurrentCareer();
            }}
            isSaved={isCurrentCareerSaved}
          />
        )}
      </main>
    </div>
  );
}

export default App;
