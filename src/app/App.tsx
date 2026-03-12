import { useEffect, useState } from 'react';
import { HomeScreen } from './HomeScreen';
import { AppShell } from './AppShell';
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
    <AppShell
      idleScreen={idleScreen}
      phase={phase}
      onReset={handleReset}
      onSelectIdleScreen={async (screen) => {
        if (screen === 'hall') {
          await loadHallOfFame();
        }
        setIdleScreen(screen);
      }}
    >
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
          <div className="grid gap-6 animate-in xl:grid-cols-[1.12fr_0.88fr]">
            <section className="arcade-hero hero-stage">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="museum-kicker">進行記録</div>
                  <h2 className="ui-text-heading mt-2 text-3xl text-text sm:text-4xl">人生の節目</h2>
                </div>
                <div className="museum-chip">
                  {isSkipping ? '一気に進行中' : '通常進行中'}
                </div>
              </div>

              {observationLog.length === 0 ? (
                <div className="scoreboard-panel p-5 text-sm text-text-dim">最初の節目が出るまで観測しています。</div>
              ) : (
                <div className="grid gap-3">
                  {observationLog.map((entry, index) => (
                    <article
                      key={`${entry.seq}-${entry.kind}-${index}`}
                      className="ticker-entry border-[rgba(91,122,165,0.18)]"
                    >
                      <div className={`h-3 w-3 ${
                        entry.kind === 'danger'
                          ? 'bg-[var(--accent-danger)]'
                          : entry.kind === 'closing'
                            ? 'bg-[var(--accent-gold)]'
                            : 'bg-[var(--accent-green)]'
                      }`} />
                      <div>
                        <div className="text-sm text-text">{entry.headline}</div>
                        <div className="text-xs text-text-dim">{entry.detail}</div>
                      </div>
                      <div className="text-xs text-[var(--accent-gold)]">{entry.year}年{entry.month}月</div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <aside className="space-y-4">
              <section className="scoreboard-panel p-5 sm:p-6">
                <div className="museum-kicker">現在地</div>
                {progress ? (
                  <div className="mt-4 space-y-4">
                    <div className="ui-text-heading text-3xl text-text">
                      {progress.year}年 {progress.month}月場所
                    </div>
                    <div className="text-sm text-text-dim">
                      {formatRankName(progress.currentRank)} / {progress.bashoCount}場所目
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="pixel-card-dark p-4">
                        <div className="text-xs tracking-[0.14em] text-text-dim">現在の地位</div>
                        <div className="mt-2 text-xl text-text">{formatRankName(progress.currentRank)}</div>
                      </div>
                      <div className="pixel-card-dark p-4">
                        <div className="text-xs tracking-[0.14em] text-text-dim">通算三賞</div>
                        <div className="mt-2 text-xl text-text">{progress.sanshoTotal}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-text-dim">計算を始めています。</p>
                )}
              </section>

              <section className="rpg-panel p-5 sm:p-6">
                <div className="museum-kicker">操作</div>
                <div className="mt-4 flex flex-col gap-3">
                  <Button variant="secondary" onClick={skipToEnd} disabled={isSkipping}>
                    {isSkipping ? '最後まで送っています' : '最後まで送る'}
                  </Button>
                  <Button variant="outline" onClick={() => void stopSimulation()}>
                    中止して入口へ戻る
                  </Button>
                </div>
                <div className="mt-3 text-sm text-text-dim">
                  {isSkipping ? '途中経過を省略しながら完走まで進めています。' : '節目ごとに経過を観測中です。'}
                </div>
              </section>
            </aside>
          </div>
        )}

        {phase === 'error' && (
          <div className="mx-auto max-w-2xl arcade-hero glow-red space-y-4 p-6 sm:p-8">
            <div className="museum-kicker">演算エラー</div>
            <h2 className="ui-text-heading text-3xl text-text">観測が中断されました</h2>
            <p className="text-sm leading-8 text-[#ffd9d5] sm:text-base">
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
    </AppShell>
  );
}

export default App;
