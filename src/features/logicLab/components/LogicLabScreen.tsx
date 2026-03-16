import React from 'react';
import { getRankValueForChart } from '../../../logic/ranking';
import { Rank } from '../../../logic/models';
import { LOGIC_LAB_PRESETS, resolveLogicLabPresetLabel } from '../presets';
import { useLogicLabStore } from '../store/logicLabStore';
import { LogicLabBashoLogRow, LogicLabStopReason } from '../types';
import { BodyText, CaptionText, Heading, LabelText, MetricText } from '../../../shared/ui/Typography';

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
    <div className="max-w-7xl mx-auto space-y-4">
      <section className="rpg-panel p-4 relative overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <Heading as="h2" className="text-xl ui-text-label text-gold">ロジック検証モード</Heading>
            <CaptionText as="p" className="text-text-dim mt-1">番付変化・会議理由・NPC文脈を集約表示</CaptionText>
          </div>
          <div className="text-[11px] font-bold border-2 border-gold-muted px-2 py-1 bg-bg text-text shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]">
            状態: {formatPhase(phase)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 rpg-panel p-4 space-y-2">
          <LabelText as="p" className="section-header">設定</LabelText>
          <label className="text-xs text-text-dim block">
            プリセット
            <select
              value={presetId}
              onChange={(event) => setPresetId(event.target.value as typeof presetId)}
              className="w-full border-2 border-gold-muted bg-bg text-text px-2 py-1 text-sm mt-1 focus:border-gold focus:outline-none shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]"
              disabled={autoPlay}
            >
              {LOGIC_LAB_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-text-dim block">
              Seed
              <input value={seedInput} onChange={(event) => setSeedInput(event.target.value)} className="w-full border-2 border-gold-muted bg-bg text-text px-2 py-1 text-sm mt-1 focus:border-gold focus:outline-none shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]" disabled={autoPlay} />
            </label>
            <label className="text-xs text-text-dim block">
              最大場所数
              <input value={maxBashoInput} onChange={(event) => setMaxBashoInput(event.target.value)} className="w-full border-2 border-gold-muted bg-bg text-text px-2 py-1 text-sm mt-1 focus:border-gold focus:outline-none shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]" disabled={autoPlay} />
            </label>
          </div>
          <CaptionText as="p" className="text-[11px] text-text-dim">反映中: {runConfig ? `${resolveLogicLabPresetLabel(runConfig.presetId)} / seed=${runConfig.seed}` : '-'}</CaptionText>
        </div>

        <div className="xl:col-span-8 rpg-panel p-4 space-y-3">
          <LabelText as="p" className="section-header">操作</LabelText>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <button onClick={() => void startRun()} className="border-2 font-bold px-2 py-2 text-xs shadow-[4px_4px_0_rgba(0,0,0,0.5)] hover:-translate-y-[2px] active:translate-y-0 active:shadow-none transition-none border-gold bg-gold/10 text-gold">開始</button>
            <button onClick={() => void stepOne()} disabled={autoPlay} className={`border-2 font-bold px-2 py-2 text-xs shadow-[4px_4px_0_rgba(0,0,0,0.5)] hover:-translate-y-[2px] active:translate-y-0 active:shadow-none transition-none ${autoPlay ? 'border-gold-muted/50 bg-bg text-text-dim shadow-none' : 'border-gold-muted bg-bg text-text'}`}>1場所進む</button>
            {!autoPlay ? <button onClick={() => void startAutoPlay()} className="border-2 font-bold px-2 py-2 text-xs shadow-[4px_4px_0_rgba(0,0,0,0.5)] hover:-translate-y-[2px] active:translate-y-0 active:shadow-none transition-none border-gold-muted bg-text text-bg">自動再生</button> : <button onClick={pauseAutoPlay} className="border-2 border-crimson bg-crimson/10 text-crimson font-bold px-2 py-2 text-xs shadow-[4px_4px_0_rgba(0,0,0,0.5)] hover:-translate-y-[2px] active:translate-y-0 active:shadow-none transition-none">停止</button>}
            <button onClick={() => void runToEnd()} disabled={autoPlay} className={`border-2 font-bold px-2 py-2 text-xs shadow-[4px_4px_0_rgba(0,0,0,0.5)] hover:-translate-y-[2px] active:translate-y-0 active:shadow-none transition-none ${autoPlay ? 'border-gold-muted/50 bg-bg text-text-dim shadow-none' : 'border-gold-muted bg-bg text-text'}`}>最後まで</button>
            <button onClick={resetRun} className="border-2 border-gold-muted bg-bg text-text font-bold px-2 py-2 text-xs shadow-[4px_4px_0_rgba(0,0,0,0.5)] hover:-translate-y-[2px] active:translate-y-0 active:shadow-none transition-none">リセット</button>
          </div>
          {errorMessage && <BodyText as="p" className="text-xs text-crimson border-2 border-crimson/40 bg-crimson/10 px-2 py-1">{errorMessage}</BodyText>}
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-bold">
        <div className="border-2 border-gold-muted bg-bg p-2 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]"><LabelText>昇進: </LabelText><MetricText as="span" className="text-hp">{stats.promotion}</MetricText></div>
        <div className="border-2 border-gold-muted bg-bg p-2 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]"><LabelText>降下: </LabelText><MetricText as="span" className="text-crimson">{stats.demotion}</MetricText></div>
        <div className="border-2 border-gold-muted bg-bg p-2 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]"><LabelText>警告: </LabelText><MetricText as="span" className="text-text">{stats.warning}</MetricText></div>
        <div className="border-2 border-gold-muted bg-bg p-2 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]"><LabelText>怪我: </LabelText><MetricText as="span" className="text-text">{stats.injury}</MetricText></div>
        <div className="border-2 border-gold-muted bg-bg p-2 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]"><LabelText>優勝: </LabelText><MetricText as="span" className="text-text">{stats.yusho}</MetricText></div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 rpg-panel p-4 space-y-2">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <p className="section-header">場所ログ</p>
            <div className="flex flex-wrap gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="検索" className="border-2 border-gold-muted px-2 py-1 text-xs bg-bg shadow-[inset_0_0_4px_rgba(0,0,0,0.5)] focus:outline-none focus:border-gold transition-none" />
              <button onClick={() => setDesc((v) => !v)} className="border-2 border-gold-muted px-2 py-1 text-xs font-bold hover:border-gold hover:bg-gold/10 transition-none">{desc ? '新しい順' : '古い順'}</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {LOG_FILTERS.map((item) => (
              <button key={item.id} onClick={() => setFilter(item.id)} className={`text-xs font-bold px-2 py-1 border-2 transition-none ${filter === item.id ? 'border-gold bg-gold/20 text-gold shadow-none' : 'border-gold-muted bg-bg text-text-dim shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]'}`}>{item.label}</button>
            ))}
            <span className="text-xs font-bold text-text-dim px-2 py-1">表示 {filtered.length}/{logs.length}</span>
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

        <div className="xl:col-span-5 rpg-panel p-4 space-y-2">
          <p className="section-header">詳細</p>
          {!selectedRow ? <p className="text-xs text-text-dim">ログ行を選択してください。</p> : (
            <div className="space-y-1 text-xs border-2 border-gold-muted bg-bg p-3 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]">
              <div className="data-row"><span className="data-key" style={{ boxShadow: "none" }}>場所</span><span className="data-val">{selectedRow.year}年{selectedRow.month}月</span></div>
              <div className="data-row"><span className="data-key" style={{ boxShadow: "none" }}>変動</span><span className="data-val">{formatRankName(selectedRow.rankBefore)} → {formatRankName(selectedRow.rankAfter)} / {rankDeltaText(selectedRow)}</span></div>
              <div className="data-row"><span className="data-key" style={{ boxShadow: "none" }}>成績</span><span className="data-val">{formatRecord(selectedRow.record.wins, selectedRow.record.losses, selectedRow.record.absent)}{selectedRow.record.yusho ? ' / 優勝' : ''}</span></div>
              <div className="data-row"><span className="data-key" style={{ boxShadow: "none" }}>停止理由</span><span className="data-val">{formatStopReason(selectedRow.pauseReason)}</span></div>
              <div className="data-row"><span className="data-key" style={{ boxShadow: "none" }}>番付理由</span><span className="data-val">{selectedRow.banzukeReasons.length ? selectedRow.banzukeReasons.join(' / ') : '-'}</span></div>
              <div className="data-row"><span className="data-key" style={{ boxShadow: "none" }}>イベント</span><span className="data-val">{selectedRow.events.length ? selectedRow.events[0] : '-'}</span></div>
              <div className="data-row"><span className="data-key" style={{ boxShadow: "none" }}>怪我</span><span className="data-val">Lv{selectedRow.injurySummary.injuryLevel} / 有効 {selectedRow.injurySummary.activeCount}件</span></div>
              <div className="data-row cursor-help" title={selectedRow.npcContext ? `同階級NPC ${selectedRow.npcContext.rows.length}件` : ''}><span className="data-key" style={{ boxShadow: "none" }}>同階級NPC</span><span className="data-val">{selectedRow.npcContext ? `${selectedRow.npcContext.rows.length}件` : 'なし'}</span></div>
            </div>
          )}

        </div>
      </section>

      {summary && (
        <section className="rpg-panel p-4 text-xs font-bold grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="data-row"><span className="data-key text-text-dim" style={{ boxShadow: "none" }}>現在番付</span><span className="data-val text-gold">{formatRankName(summary.currentRank)}</span></div>
          <div className="data-row"><span className="data-key text-text-dim" style={{ boxShadow: "none" }}>最高位</span><span className="data-val text-gold">{formatRankName(summary.maxRank)}</span></div>
          <div className="data-row"><span className="data-key text-text-dim" style={{ boxShadow: "none" }}>場所数</span><span className="data-val">{summary.bashoCount}</span></div>
          <div className="data-row"><span className="data-key text-text-dim" style={{ boxShadow: "none" }}>年齢</span><span className="data-val">{summary.age}</span></div>
          <div className="data-row"><span className="data-key text-text-dim" style={{ boxShadow: "none" }}>通算</span><span className="data-val">{summary.totalWins}勝 {summary.totalLosses}敗 {summary.totalAbsent}休</span></div>
          <div className="data-row"><span className="data-key text-text-dim" style={{ boxShadow: "none" }}>停止理由</span><span className="data-val">{formatStopReason(summary.stopReason)}</span></div>
        </section>
      )}
    </div>
  );
};

