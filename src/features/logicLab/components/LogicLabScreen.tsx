import React from 'react';
import { getRankValueForChart } from '../../../logic/ranking';
import { Rank } from '../../../logic/models';
import { LOGIC_LAB_PRESETS, resolveLogicLabPresetLabel } from '../presets';
import { useLogicLabStore } from '../store/logicLabStore';
import { LogicLabBashoLogRow, LogicLabStopReason } from '../types';
import { CaptionText, Heading, MetricText } from '../../../shared/ui/Typography';
import { Activity, ScrollText, Sparkles, RefreshCw, Trash2, Trophy, AlertTriangle, ChevronDown } from "lucide-react";

type LogFilter = 'ALL' | 'PROMOTION' | 'DEMOTION' | 'WARNING' | 'INJURY' | 'YUSHO';
const LOG_FILTERS: Array<{ id: LogFilter; label: string }> = [
  { id: 'ALL', label: '全件' },
  { id: 'PROMOTION', label: '昇進' },
  { id: 'DEMOTION', label: '降下' },
  { id: 'WARNING', label: '警告' },
  { id: 'INJURY', label: '怪我' },
  { id: 'YUSHO', label: '優勝' },
];

const formatRankName = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結', '前相撲'].includes(rank.name)) return `${side}${rank.name}`;
  return `${side}${rank.name}${rank.number || 1}`;
};
const formatRecord = (wins: number, losses: number, absent: number): string =>
  `${wins}-${losses}${absent > 0 ? `-${absent}` : ''}`;
const formatPhase = (phase: string): string =>
  phase === 'idle' ? '待機' :
    phase === 'ready' ? '開始前' :
      phase === 'running' ? '実行中' :
        phase === 'paused' ? '一時停止' :
          phase === 'completed' ? '完了' :
            phase === 'error' ? 'エラー' : phase;
const formatStopReason = (reason?: LogicLabStopReason): string =>
  !reason ? '-' :
    reason === 'PROMOTION' ? '昇進イベント' :
      reason === 'INJURY' ? '負傷イベント' :
        reason === 'RETIREMENT' ? '引退' :
          reason === 'MAX_BASHO_REACHED' ? '最大場所数到達' : reason;
const rankDelta = (row: LogicLabBashoLogRow): number =>
  getRankValueForChart(row.rankBefore) - getRankValueForChart(row.rankAfter);
const rankDeltaText = (row: LogicLabBashoLogRow): string => {
  const delta = rankDelta(row);
  if (Math.abs(delta) < 0.001) return '変化なし';
  return delta > 0 ? `昇進 +${delta.toFixed(1)}` : `降下 ${delta.toFixed(1)}`;
};
const isPromotion = (row: LogicLabBashoLogRow): boolean => rankDelta(row) > 0.001;
const isDemotion = (row: LogicLabBashoLogRow): boolean => rankDelta(row) < -0.001;
const isWarning = (row: LogicLabBashoLogRow): boolean => row.committeeWarnings > 0;
const isInjury = (row: LogicLabBashoLogRow): boolean => row.injurySummary.activeCount > 0 || row.record.absent > 0;
const isYusho = (row: LogicLabBashoLogRow): boolean => row.record.yusho;

const matchesFilter = (row: LogicLabBashoLogRow, filter: LogFilter): boolean =>
  filter === 'ALL' ? true :
    filter === 'PROMOTION' ? isPromotion(row) :
      filter === 'DEMOTION' ? isDemotion(row) :
        filter === 'WARNING' ? isWarning(row) :
          filter === 'INJURY' ? isInjury(row) :
            isYusho(row);

export const LogicLabScreen: React.FC = () => {
  const phase = useLogicLabStore((state) => state.phase);
  const presetId = useLogicLabStore((state) => state.presetId);
  const seedInput = useLogicLabStore((state) => state.seedInput);
  const maxBashoInput = useLogicLabStore((state) => state.maxBashoInput);
  const runConfig = useLogicLabStore((state) => state.runConfig);
  const summary = useLogicLabStore((state) => state.summary);
  const logs = useLogicLabStore((state) => state.logs);
  const selectedLogIndex = useLogicLabStore((state) => state.selectedLogIndex);
  const autoPlay = useLogicLabStore((state) => state.autoPlay);
  const errorMessage = useLogicLabStore((state) => state.errorMessage);
  const setPresetId = useLogicLabStore((state) => state.setPresetId);
  const setSeedInput = useLogicLabStore((state) => state.setSeedInput);
  const setMaxBashoInput = useLogicLabStore((state) => state.setMaxBashoInput);
  const startRun = useLogicLabStore((state) => state.startRun);
  const stepOne = useLogicLabStore((state) => state.stepOne);
  const startAutoPlay = useLogicLabStore((state) => state.startAutoPlay);
  const pauseAutoPlay = useLogicLabStore((state) => state.pauseAutoPlay);
  const runToEnd = useLogicLabStore((state) => state.runToEnd);
  const selectLogIndex = useLogicLabStore((state) => state.selectLogIndex);
  const resetRun = useLogicLabStore((state) => state.resetRun);

  const [query, setQuery] = React.useState('');
  const [filter, setFilter] = React.useState<LogFilter>('ALL');
  const [desc, setDesc] = React.useState(true);

  const selectedRow = React.useMemo(() => {
    if (typeof selectedLogIndex === 'number' && logs[selectedLogIndex]) return logs[selectedLogIndex];
    return logs.length ? logs[logs.length - 1] : null;
  }, [logs, selectedLogIndex]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = logs.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (!matchesFilter(row, filter)) return false;
      if (!q) return true;
      const text = [
        `${row.year}/${row.month}`,
        formatRankName(row.rankBefore),
        formatRankName(row.rankAfter),
        row.events.join(' '),
        row.banzukeReasons.join(' '),
      ].join(' ').toLowerCase();
      return text.includes(q);
    });
    return desc ? rows.slice().reverse() : rows;
  }, [logs, query, filter, desc]);

  const stats = React.useMemo(() => {
    let promotion = 0;
    let demotion = 0;
    let warning = 0;
    let injury = 0;
    let yusho = 0;
    for (const row of logs) {
      if (isPromotion(row)) promotion += 1;
      if (isDemotion(row)) demotion += 1;
      if (isWarning(row)) warning += 1;
      if (isInjury(row)) injury += 1;
      if (isYusho(row)) yusho += 1;
    }
    return { promotion, demotion, warning, injury, yusho };
  }, [logs]);

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
      <section className="surface-panel overflow-hidden relative p-6 border-t-4 border-gold shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-r from-gold/5 via-transparent to-transparent pointer-events-none" />
        <div className="flex flex-wrap items-end justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="ui-text-label text-[10px] text-gold/60 uppercase tracking-widest">
              内部論理検証環境 - LOGIC PROVING GROUND
            </div>
            <Heading as="h2" className="text-2xl sm:text-3xl ui-text-heading text-text tracking-tighter">
              八百萬ロジックラボ
            </Heading>
            <CaptionText as="p" className="text-text-dim text-xs italic">
              番付ロジック、イベント発生率、NPC文脈の整合性をシミュレートします。
            </CaptionText>
          </div>
          <div className="flex items-center gap-3">
            <div className={`px-3 py-1.5 border ui-text-label text-[11px] font-bold shadow-inner ${phase === 'running' ? 'border-hp/40 bg-hp/10 text-hp animate-pulse' : 'border-gold-muted/30 bg-bg-panel/50 text-text-dim'}`}>
              <Activity className={`w-3.5 h-3.5 inline mr-2 ${phase === 'running' ? 'animate-spin' : ''}`} />
              LAB STATE: {formatPhase(phase)}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <div className="surface-panel p-5 space-y-4 border-gold/10 bg-bg-panel/40">
            <div className="flex items-center gap-2 text-gold/60 mb-2 border-b border-gold/10 pb-2 uppercase tracking-widest text-[10px] ui-text-label">
              <ScrollText className="w-3.5 h-3.5" />
              環境構成 - Configuration
            </div>
            
            <div className="space-y-4">
              <label className="block space-y-2">
                <span className="text-[10px] ui-text-label text-text-dim uppercase tracking-tighter">シナリオ・プリセット</span>
                <select
                  value={presetId}
                  onChange={(event) => setPresetId(event.target.value as typeof presetId)}
                  className="w-full border border-gold/20 bg-bg/60 text-text px-3 py-2 text-sm focus:border-gold focus:outline-none transition-all shadow-inner"
                  disabled={autoPlay}
                >
                  {LOGIC_LAB_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                </select>
              </label>
              
              <div className="grid grid-cols-2 gap-4">
                <label className="block space-y-2">
                  <span className="text-[10px] ui-text-label text-text-dim uppercase tracking-tighter">初期種子 (Seed)</span>
                  <input value={seedInput} onChange={(event) => setSeedInput(event.target.value)} className="w-full border border-gold/20 bg-bg/60 text-text px-3 py-2 text-sm focus:border-gold focus:outline-none transition-all shadow-inner font-mono" disabled={autoPlay} />
                </label>
                <label className="block space-y-2">
                  <span className="text-[10px] ui-text-label text-text-dim uppercase tracking-tighter">最大刻み (Basho)</span>
                  <input value={maxBashoInput} onChange={(event) => setMaxBashoInput(event.target.value)} className="w-full border border-gold/20 bg-bg/60 text-text px-3 py-2 text-sm focus:border-gold focus:outline-none transition-all shadow-inner font-mono" disabled={autoPlay} />
                </label>
              </div>
              
              <div className="p-3 bg-bg/40 border border-gold-muted/10 text-[10px] text-text-faint leading-tight italic">
                反映中: {runConfig ? `${resolveLogicLabPresetLabel(runConfig.presetId)} [seed:${runConfig.seed}]` : '未構成'}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <div className="surface-panel p-5 space-y-4 border-gold/10 bg-bg-panel/40 flex flex-col justify-between h-full">
            <div className="flex items-center gap-2 text-gold/60 border-b border-gold/10 pb-2 uppercase tracking-widest text-[10px] ui-text-label">
              <Sparkles className="w-3.5 h-3.5" />
              計器操作 - Cockpit
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <button onClick={() => void startRun()} className="surface-card flex flex-col items-center justify-center p-4 border-gold/30 hover:border-gold bg-gold/5 text-gold group transition-all">
                <Activity className="w-6 h-6 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-[10px] ui-text-label uppercase tracking-widest font-bold">開始</span>
              </button>
              <button 
                onClick={() => void stepOne()} 
                disabled={autoPlay} 
                className={`surface-card flex flex-col items-center justify-center p-4 transition-all ${autoPlay ? 'opacity-30 grayscale cursor-not-allowed' : 'border-gold-muted/20 hover:border-gold/40 text-text-dim hover:text-text'}`}
              >
                <ChevronDown className="w-6 h-6 mb-2" />
                <span className="text-[10px] ui-text-label uppercase tracking-widest font-bold">1場所進む</span>
              </button>
              {!autoPlay ? (
                <button onClick={() => void startAutoPlay()} className="surface-card flex flex-col items-center justify-center p-4 border-action/30 hover:border-action bg-action/5 text-action group transition-all">
                  <RefreshCw className="w-6 h-6 mb-2 group-hover:rotate-180 transition-transform duration-700" />
                  <span className="text-[10px] ui-text-label uppercase tracking-widest font-bold">自動再生</span>
                </button>
              ) : (
                <button onClick={pauseAutoPlay} className="surface-card flex flex-col items-center justify-center p-4 border-crimson/30 hover:border-crimson bg-crimson/10 text-crimson animate-pulse group">
                  <AlertTriangle className="w-6 h-6 mb-2 group-hover:scale-90 transition-transform" />
                  <span className="text-[10px] ui-text-label uppercase tracking-widest font-bold">停止</span>
                </button>
              )}
              <button 
                onClick={() => void runToEnd()} 
                disabled={autoPlay} 
                className={`surface-card flex flex-col items-center justify-center p-4 transition-all ${autoPlay ? 'opacity-30 grayscale cursor-not-allowed' : 'border-gold-muted/20 hover:border-gold/40 text-text-dim hover:text-text'}`}
              >
                <Trophy className="w-6 h-6 mb-2" />
                <span className="text-[10px] ui-text-label uppercase tracking-widest font-bold">最後まで</span>
              </button>
              <button onClick={resetRun} className="surface-card flex flex-col items-center justify-center p-4 border-gold-muted/10 hover:border-crimson/40 text-text-faint hover:text-crimson transition-all">
                <Trash2 className="w-6 h-6 mb-2" />
                <span className="text-[10px] ui-text-label uppercase tracking-widest font-bold">リセット</span>
              </button>
            </div>
            
            {errorMessage && (
              <div className="flex items-center gap-3 border border-crimson/30 bg-crimson/5 px-4 py-2 text-[10px] text-crimson italic animate-in slide-in-from-bottom-2">
                <AlertTriangle className="w-4 h-4" />
                <span>ERR_LOGIC_BREAK: {errorMessage}</span>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "昇進累積", val: stats.promotion, color: "text-hp", icon: <Trophy className="w-3.5 h-3.5" /> },
          { label: "降下累積", val: stats.demotion, color: "text-crimson", icon: <AlertTriangle className="w-3.5 h-3.5" /> },
          { label: "審判部警告", val: stats.warning, color: "text-text", icon: <ScrollText className="w-3.5 h-3.5" /> },
          { label: "負傷・欠場", val: stats.injury, color: "text-text", icon: <Activity className="w-3.5 h-3.5" /> },
          { label: "本場所優勝", val: stats.yusho, color: "text-gold", icon: <Sparkles className="w-3.5 h-3.5" /> },
        ].map(s => (
          <div key={s.label} className="surface-card p-4 border-gold-muted/10 bg-bg-panel/20 flex items-center justify-between group hover:border-gold/20 transition-all">
            <div className="space-y-1">
              <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter group-hover:text-text-dim transition-colors">{s.label}</div>
              <MetricText as="div" className={`text-xl ${s.color}`}>{s.val}</MetricText>
            </div>
            <div className="opacity-20 group-hover:opacity-60 transition-opacity">{s.icon}</div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-7 rpg-panel p-4 space-y-2">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <p className="section-header">場所ログ</p>
            <div className="flex flex-wrap gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="検索" className="border-2 border-gold-muted px-2 py-1 text-xs bg-bg shadow-[inset_0_0_4px_rgba(0,0,0,0.5)] focus:outline-none focus:border-gold transition-none" />
              <button onClick={() => setDesc((v) => !v)} className="border-2 border-gold-muted px-2 py-1 text-xs font-bold hover:border-gold hover:bg-gold/10 transition-none">{desc ? '新しい順' : '古い順'}</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {LOG_FILTERS.map((item) => (
              <button key={item.id} onClick={() => setFilter(item.id)} className={`text-xs font-bold px-3 py-1.5 border-2 transition-none shadow-sm ${filter === item.id ? 'border-gold bg-gold/20 text-gold shadow-none' : 'border-gold-muted bg-bg text-text-dim shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]'}`}>{item.label}</button>
            ))}
            <span className="text-xs font-bold text-text-dim px-2 py-1 flex items-center">表示 {filtered.length}/{logs.length}</span>
          </div>
          <div className="overflow-x-auto max-h-[420px] border-2 border-gold-muted shadow-[inset_0_0_8px_rgba(0,0,0,0.8)]">
            <table className="min-w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-bg border-b-2 border-gold-muted z-10">
                <tr><th className="text-left py-1 px-2 text-text-dim">Seq</th><th className="text-left py-1 px-2 text-text-dim">場所</th><th className="text-left py-1 px-2 text-text-dim">番付</th><th className="text-left py-1 px-2 text-text-dim">成績</th><th className="text-left py-1 px-2 text-text-dim">変動</th><th className="text-left py-1 px-2 text-text-dim">警告</th></tr>
              </thead>
              <tbody>
                {filtered.map(({ row, index }) => (
                  <tr key={`${row.seq}-${row.year}-${row.month}`} onClick={() => selectLogIndex(index)} className={`border-b border-gold-muted/30 cursor-pointer transition-none ${selectedRow === row ? 'bg-gold/10 text-text' : 'bg-bg text-text/80 hover:bg-bg-light hover:text-text'}`}>
                    <td className="py-1 px-2 font-bold text-text-dim">{row.seq}</td><td className="py-1 px-2">{row.year}/{row.month}</td>
                    <td className="py-1 px-2 text-gold">{formatRankName(row.rankBefore)}<span className="text-text-dim mx-1">→</span>{formatRankName(row.rankAfter)}</td>
                    <td className="py-1 px-2">{formatRecord(row.record.wins, row.record.losses, row.record.absent)}{row.record.yusho ? <span className="text-gold ml-1 text-xs">★</span> : ''}</td>
                    <td className={`py-1 px-2 font-bold ${isPromotion(row) ? 'text-hp' : isDemotion(row) ? 'text-crimson' : 'text-text-dim'}`}>{rankDeltaText(row)}</td>
                    <td className="py-1 px-2 text-text-dim">{row.committeeWarnings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-4">
          <div className="surface-panel p-5 border-gold/10 bg-bg-panel/40 h-full flex flex-col">
            <div className="flex items-center gap-2 text-gold/60 mb-4 border-b border-gold/10 pb-2 uppercase tracking-widest text-[10px] ui-text-label">
              <ScrollText className="w-3.5 h-3.5" />
              明細解析 - Detailed Analysis
            </div>
            
            {!selectedRow ? (
              <div className="flex-1 flex flex-col items-center justify-center text-text-faint italic opacity-30 text-[10px] min-h-[200px]">
                SELECT A LOG ENTRY TO ANALYZE
              </div>
            ) : (
              <div className="flex-1 space-y-6 animate-in fade-in slide-in-from-right-2">
                <div className="surface-card p-4 border-gold/20 bg-bg/40 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Trophy className="w-12 h-12" />
                  </div>
                  <div className="ui-text-label text-[9px] text-gold/60 uppercase tracking-tighter mb-1 select-none">場所・時刻</div>
                  <div className="text-lg ui-text-heading text-text">{selectedRow.year}年 {selectedRow.month}月場所</div>
                  <div className="mt-4 grid grid-cols-2 gap-4 border-t border-gold/10 pt-4">
                    <InfoField label="始点番付" value={formatRankName(selectedRow.rankBefore)} />
                    <InfoField label="終点番付" value={formatRankName(selectedRow.rankAfter)} tone="gold" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <section className="space-y-2">
                      <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter border-b border-gold-muted/10 pb-1">取組成績</div>
                      <div className="text-sm font-bold text-text">
                        {formatRecord(selectedRow.record.wins, selectedRow.record.losses, selectedRow.record.absent)}
                        {selectedRow.record.yusho && <span className="text-gold ml-2">★ 優勝成就</span>}
                      </div>
                    </section>
                    <section className="space-y-2">
                      <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter border-b border-gold-muted/10 pb-1">番付編成理由</div>
                      <div className="text-[10px] text-text-dim leading-relaxed italic">
                        {selectedRow.banzukeReasons.length ? selectedRow.banzukeReasons.join(' / ') : '特記事項なし'}
                      </div>
                    </section>
                  </div>
                  <div className="space-y-4">
                    <section className="space-y-2">
                      <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter border-b border-gold-muted/10 pb-1">健康・コンディション</div>
                      <div className="text-[10px] text-text-dim">
                        怪我度: Lv{selectedRow.injurySummary.injuryLevel}
                        <div className="mt-1 flex items-center gap-1">
                          <Activity className={`w-3 h-3 ${selectedRow.injurySummary.activeCount > 0 ? 'text-crimson' : 'text-text-faint'}`} />
                          <span>有効負傷 {selectedRow.injurySummary.activeCount}件</span>
                        </div>
                      </div>
                    </section>
                    <section className="space-y-2">
                      <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter border-b border-gold-muted/10 pb-1">NPC環境文脈</div>
                      <div className="text-[10px] text-text-dim">
                        同階級NPC: {selectedRow.npcContext ? `${selectedRow.npcContext.rows.length}件` : '記録なし'}
                      </div>
                    </section>
                  </div>
                </div>
                
                {selectedRow.events.length > 0 && (
                  <div className="p-3 bg-gold/5 border border-gold/10 text-[10px] text-gold/80 italic leading-relaxed">
                    <Sparkles className="w-3.5 h-3.5 inline mr-2 text-gold/60" />
                    発生事象: {selectedRow.events[0]}
                  </div>
                )}
                
                {selectedRow.pauseReason && (
                  <div className="p-3 bg-hp/5 border border-hp/20 text-[10px] text-hp italic">
                    <AlertTriangle className="w-3.5 h-3.5 inline mr-2" />
                    停止検知: {formatStopReason(selectedRow.pauseReason)}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {summary && (
        <section className="surface-panel p-6 border-gold/10 bg-gradient-to-r from-bg-panel/40 to-transparent flex flex-wrap items-center justify-between gap-6 animate-in slide-in-from-bottom-4">
          <div className="flex items-center gap-4 border-r border-gold/10 pr-6">
            <div className="ui-text-label text-[10px] text-gold/60 uppercase vertical-rl tracking-widest hidden sm:block">CURRENT STATE</div>
            <div className="space-y-1">
              <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter">現在 / 最高</div>
              <div className="text-xl ui-text-metric text-gold uppercase tracking-tighter">
                {formatRankName(summary.currentRank)} <span className="text-text-faint mx-2 opacity-30">/</span> {formatRankName(summary.maxRank)}
              </div>
            </div>
          </div>
          
          <div className="flex flex-1 gap-8 overflow-x-auto no-scrollbar">
            <MetricSmall label="年齢" value={`${summary.age}歳`} />
            <MetricSmall label="場所数" value={`${summary.bashoCount}`} />
            <MetricSmall label="通算成績" value={formatRecord(summary.totalWins, summary.totalLosses, summary.totalAbsent)} />
            <MetricSmall label="終了因" value={formatStopReason(summary.stopReason)} tone="dim" />
          </div>
          
          <div className="p-2 border border-gold-muted/20 bg-bg-panel/20 text-[9px] ui-text-label text-text-faint tracking-widest">
            LOGIC LAB VERIFICATION PASSED
          </div>
        </section>
      )}
    </div>
  );
};

const InfoField: React.FC<{ label: string; value: string; tone?: 'gold' | 'dim' }> = ({ label, value, tone }) => (
  <div className="space-y-1">
    <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter">{label}</div>
    <div className={`text-sm font-bold ${tone === 'gold' ? 'text-gold' : 'text-text-dim'}`}>{value}</div>
  </div>
);

const MetricSmall: React.FC<{ label: string; value: string; tone?: 'dim' }> = ({ label, value, tone }) => (
  <div className="space-y-0.5 min-w-fit">
    <div className="text-[9px] ui-text-label text-text-faint uppercase tracking-tighter opacity-60">{label}</div>
    <div className={`text-sm ui-text-metric whitespace-nowrap ${tone === 'dim' ? 'text-text-faint' : 'text-text'}`}>{value}</div>
  </div>
);
