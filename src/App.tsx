import { useState } from 'react';
import { ScoutScreen } from './components/input/ScoutScreen';
import { ReportScreen } from './components/result/ReportScreen';
import { RikishiStatus, Oyakata } from './logic/models';
import { runSimulation } from './logic/runner';
import { loadAllRikishi, deleteRikishi, SavedRikishi } from './logic/storage';
import { Trophy, Trash2, X } from 'lucide-react';

function App() {
  const [status, setStatus] = useState<RikishiStatus | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [showSavedData, setShowSavedData] = useState(false);
  const [savedRecords, setSavedRecords] = useState<SavedRikishi[]>([]);

  const handleStart = async (initialStats: RikishiStatus, oyakata: Oyakata | null) => {
    setIsSimulating(true);
    // UI反映のために微小な待機を入れる
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const result = await runSimulation({ initialStats, oyakata });
      setStatus(result);
    } catch (error) {
      console.error('Simulation failed', error);
    } finally {
      setIsSimulating(false);
    }
  };

  const handleReset = () => {
    setStatus(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-slate-900 text-white p-4 shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2 cursor-pointer" onClick={handleReset}>
            <span className="text-2xl">🏋️</span>
            爆速！横綱メーカー
          </h1>
          <button 
            onClick={() => {
                setSavedRecords(loadAllRikishi());
                setShowSavedData(true);
            }}
            className="text-sm bg-slate-800 px-3 py-1 rounded hover:bg-slate-700 transition"
          >
            殿堂入りを見る
          </button>
        </div>
      </header>

      <main className="p-4 pt-8 container mx-auto">
        {showSavedData && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[80vh]">
                    <div className="p-4 border-b flex justify-between items-center bg-slate-50">
                        <h2 className="font-bold text-lg flex items-center text-slate-800">
                            <Trophy className="w-5 h-5 mr-2 text-yellow-500"/>
                            殿堂入り力士一覧
                        </h2>
                        <button onClick={() => setShowSavedData(false)} className="text-slate-400 hover:text-slate-600 transition">
                            <X className="w-6 h-6"/>
                        </button>
                    </div>
                    <div className="overflow-y-auto p-4 space-y-3 flex-1 bg-slate-100">
                        {savedRecords.length === 0 ? (
                            <div className="text-center py-12 text-slate-500">
                                <p>保存されたデータはありません</p>
                            </div>
                        ) : (
                            savedRecords.slice().reverse().map(rec => (
                                <div key={rec.id} className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex justify-between items-center hover:shadow-md transition">
                                    <div className="flex-1">
                                        <div className="flex items-baseline gap-2 mb-1">
                                            <span className="font-bold text-lg text-slate-900">{rec.status.shikona}</span>
                                            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 border border-slate-200">
                                                {rec.status.history.title || '無冠'}
                                            </span>
                                        </div>
                                        <div className="text-sm text-slate-500 grid grid-cols-2 gap-x-4 gap-y-1">
                                            <span>最高位: <span className="font-medium text-slate-700">{rec.status.history.maxRank.name}</span></span>
                                            <span>通算: {rec.status.history.totalWins}勝{rec.status.history.totalLosses}敗</span>
                                            <span>幕内優勝: {rec.status.history.yushoCount.makuuchi}回</span>
                                            <span className="text-xs text-slate-400 self-center">保存日: {new Date(rec.savedAt).toLocaleDateString()}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 pl-4 border-l ml-4">
                                        <button 
                                            onClick={() => {
                                                setStatus(rec.status);
                                                setShowSavedData(false);
                                            }}
                                            className="text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded hover:bg-blue-100 transition whitespace-nowrap font-medium"
                                        >
                                            詳細
                                        </button>
                                        <button 
                                            onClick={() => {
                                                if(confirm('本当に削除しますか？')) {
                                                    deleteRikishi(rec.id);
                                                    setSavedRecords(loadAllRikishi());
                                                }
                                            }}
                                            className="text-slate-400 hover:text-red-500 transition p-2"
                                            title="削除"
                                        >
                                            <Trash2 className="w-5 h-5" />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {!status ? (
            !isSimulating ? (
                <ScoutScreen onStart={handleStart} />
            ) : (
                <div className="flex flex-col items-center justify-center py-40 space-y-4 animate-pulse">
                    <Trophy className="w-16 h-16 text-yellow-500 animate-bounce" />
                    <p className="text-2xl font-bold">力士人生を演算中...</p>
                    <p className="text-slate-500">15歳から引退までを一気にシミュレーションしています</p>
                </div>
            )
        ) : (
            <ReportScreen status={status} onReset={handleReset} />
        )}
      </main>
    </div>
  );
}

export default App;
