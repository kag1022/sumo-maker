import { useEffect, useState } from 'react';
import { Archive, FolderClock, Plus } from 'lucide-react';
import { HomeScreen } from './HomeScreen';
import { ScoutScreen } from '../features/scout/components/ScoutScreen';
import { ReportScreen } from '../features/report/components/ReportScreen';
import { HallOfFameGrid } from '../features/report/components/HallOfFameGrid';
import { Oyakata, Rank, RikishiStatus, SimulationRunOptions } from '../logic/models';
import { useSimulation } from '../features/simulation/hooks/useSimulation';
import { Button } from '../shared/ui/Button';

type IdleScreen = 'home' | 'build' | 'hall';

const formatRankName = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (rank.division === 'Maezumo') return '前相撲';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  return `${side}${rank.name}${rank.number || 1}枚目`;
};

const navButtonClass = (active: boolean) =>
  `museum-chip min-w-[98px] justify-center ${active ? 'bg-[linear-gradient(180deg,rgba(117,74,37,0.98),rgba(74,49,31,1))] text-[#fff4e2]' : ''}`;

function App() {
  const [idleScreen, setIdleScreen] = useState<IdleScreen>('home');

  const {
    phase,
    status,
    progress,
    currentCareerId,
    observationLog,
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

  useEffect(() => {
    void loadHallOfFame();
    void loadUnshelvedCareers();
  }, [loadHallOfFame, loadUnshelvedCareers]);

  const handleStart = async (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    runOptions?: SimulationRunOptions,
  ) => {
    await startSimulation(initialStats, oyakata, runOptions);
  };

  const handleReset = async () => {
    await resetView();
    setIdleScreen('home');
  };

  const isRunning = phase === 'running';
  const isCompleted = phase === 'completed';
  const isSkipping = simulationPacing === 'skip_to_end';

  return (
    <div className="min-h-screen text-text font-sans">
      <header className="sticky top-0 z-50 border-b-[3px] border-[rgba(255,224,176,0.12)] bg-[rgba(18,14,12,0.88)] backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <button className="flex items-start gap-3 text-left" onClick={() => void handleReset()}>
            <div className="pixel-icon-badge mt-1 hidden sm:inline-flex">土</div>
            <div>
              <div className="museum-kicker">Pixel Dohyo Arcade</div>
              <div className="ui-text-heading text-[1.9rem] leading-none text-[#fff1d8] sm:text-[2.2rem]">
                爆速！横綱メーカー
              </div>
              <div className="mt-1 text-xs text-[#c9b28f]">土俵を組み、人生を走らせ、記録を残す。</div>
            </div>
          </button>

          {phase === 'idle' && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={navButtonClass(idleScreen === 'home')} onClick={() => setIdleScreen('home')}>
                <FolderClock size={14} />
                入口
              </button>
              <button type="button" className={navButtonClass(idleScreen === 'build')} onClick={() => setIdleScreen('build')}>
                <Plus size={14} />
                設計
              </button>
              <button
                type="button"
                className={navButtonClass(idleScreen === 'hall')}
                onClick={async () => {
                  await loadHallOfFame();
                  setIdleScreen('hall');
                }}
              >
                <Archive size={14} />
                収蔵庫
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8">
        {!status && !isRunning && phase !== 'error' && idleScreen === 'home' && (
          <HomeScreen
            unshelvedCareers={unshelvedCareers}
            recentShelvedCareers={hallOfFame}
            onStartDesign={() => setIdleScreen('build')}
            onOpenCollection={async () => {
              await loadHallOfFame();
              setIdleScreen('hall');
            }}
            onResumeCareer={async (id) => {
              await openCareer(id);
            }}
          />
        )}

        {!status && !isRunning && phase !== 'error' && idleScreen === 'build' && (
          <ScoutScreen onStart={handleStart} />
        )}

        {!status && !isRunning && phase !== 'error' && idleScreen === 'hall' && (
          <HallOfFameGrid
            items={hallOfFame}
            onOpen={async (id) => {
              await openCareer(id);
            }}
            onDelete={async (id) => {
              await deleteCareerById(id);
            }}
            onClose={() => setIdleScreen('home')}
          />
        )}

        {isRunning && (
          <div className="grid gap-6 animate-in xl:grid-cols-[1.15fr_0.85fr]">
            <section className="arcade-hero p-5 sm:p-6">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="museum-kicker">実況卓</div>
                  <h2 className="ui-text-heading mt-2 text-3xl text-[#fff1d8] sm:text-4xl">節目ログ</h2>
                </div>
                <div className="museum-chip bg-[rgba(14,18,22,0.84)] text-[#eef4ff]">
                  {isSkipping ? 'SKIP MODE' : 'LIVE'}
                </div>
              </div>

              {observationLog.length === 0 ? (
                <div className="scoreboard-panel p-5 text-sm text-[#c6d8f2]">最初の節目が出るまで観測中です。</div>
              ) : (
                <div className="grid gap-3">
                  {observationLog.map((entry, index) => (
                    <article
                      key={`${entry.seq}-${entry.kind}-${index}`}
                      className="ticker-entry border-[rgba(122,148,171,0.18)]"
                    >
                      <div className={`h-3 w-3 ${
                        entry.kind === 'danger'
                          ? 'bg-crimson'
                          : entry.kind === 'closing'
                            ? 'bg-[rgba(255,221,160,0.7)]'
                            : 'bg-[rgba(127,166,101,0.78)]'
                      }`} />
                      <div>
                        <div className="text-sm text-[#f3f7ff]">{entry.headline}</div>
                        <div className="text-xs text-[#99afce]">{entry.detail}</div>
                      </div>
                      <div className="text-xs text-[#d9a441]">{entry.year}年{entry.month}月</div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <section className="scoreboard-panel p-5 sm:p-6">
                <div className="museum-kicker text-[#a7c2e8]">現在位置</div>
                {progress ? (
                  <div className="mt-4 space-y-4">
                    <div className="ui-text-heading text-3xl text-[#f3f7ff]">
                      {progress.year}年 {progress.month}月場所
                    </div>
                    <div className="text-sm text-[#b8cbe6]">
                      {formatRankName(progress.currentRank)} / {progress.bashoCount}場所目
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="pixel-card-dark p-4">
                        <div className="text-xs uppercase tracking-[0.14em] text-[#8ea9cb]">直近の地位</div>
                        <div className="mt-2 text-xl text-[#f3f7ff]">{formatRankName(progress.currentRank)}</div>
                      </div>
                      <div className="pixel-card-dark p-4">
                        <div className="text-xs uppercase tracking-[0.14em] text-[#8ea9cb]">通算三賞</div>
                        <div className="mt-2 text-xl text-[#f3f7ff]">{progress.sanshoTotal}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-[#c6d8f2]">計算を始めています。</p>
                )}
              </section>

              <section className="rpg-panel p-5 sm:p-6">
                <div className="museum-kicker">進行操作</div>
                <div className="mt-4 flex flex-col gap-3">
                  <Button variant="secondary" onClick={skipToEnd} disabled={isSkipping}>
                    {isSkipping ? '結果まで送っています' : '結果まで送る'}
                  </Button>
                  <Button variant="outline" onClick={() => void stopSimulation()}>
                    観測を中止
                  </Button>
                </div>
                <div className="mt-3 text-sm text-[#c9b28f]">
                  {isSkipping ? '中間報告を省略して完走まで進めています。' : '通常観測中です。'}
                </div>
              </section>
            </aside>
          </div>
        )}

        {phase === 'error' && (
          <div className="mx-auto max-w-2xl arcade-hero glow-red space-y-4 p-6 sm:p-8">
            <div className="museum-kicker text-[#ffb39f]">演算エラー</div>
            <h2 className="ui-text-heading text-3xl text-[#fff1d8]">観測が中断されました</h2>
            <p className="text-sm leading-8 text-[#f7d3c9] sm:text-base">
              {errorMessage || '原因不明のエラーが発生しました。'}
            </p>
            <Button variant="danger" size="lg" onClick={() => void handleReset()}>
              入口へ戻る
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
            onDiscard={async () => {
              if (!currentCareerId) return;
              await deleteCareerById(currentCareerId);
              await handleReset();
            }}
            isSaved={isCurrentCareerSaved}
          />
        )}
      </main>
    </div>
  );
}

export default App;
