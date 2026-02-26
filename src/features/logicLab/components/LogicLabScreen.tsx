import React, { useMemo, useState } from 'react';
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
  const comparison = useLogicLabStore((state) => state.comparison);
  const comparisonBusy = useLogicLabStore((state) => state.comparisonBusy);
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
  const runComparison = useLogicLabStore((state) => state.runComparison);
  const selectLogIndex = useLogicLabStore((state) => state.selectLogIndex);
  const resetRun = useLogicLabStore((state) => state.resetRun);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<LogFilter>('ALL');
  const [desc, setDesc] = useState(true);

  const selectedRow = useMemo(() => {
    if (typeof selectedLogIndex === 'number' && logs[selectedLogIndex]) return logs[selectedLogIndex];
    return logs.length ? logs[logs.length - 1] : null;
  }, [logs, selectedLogIndex]);
  const comparisonPresetLabel = comparison ? resolveLogicLabPresetLabel(comparison.config.presetId) : '-';

  const filtered = useMemo(() => {
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

  const stats = useMemo(() => {
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
      <section className="border-4 border-sumi bg-[linear-gradient(120deg,#203744,#2b2b2b,#5c6e46)] text-washi p-4 shadow-[6px_6px_0px_0px_#2b2b2b]">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <Heading as="p" className="text-xl">ロジック検証モード</Heading>
            <CaptionText as="p" className="text-washi/90">番付変化・会議理由・NPC文脈を集約表示</CaptionText>
          </div>
          <div className="text-[11px] font-black border border-washi/60 px-2 py-1 bg-kassairo/40">
            状態: {formatPhase(phase)}
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-4 border-2 border-sumi bg-washi p-4 space-y-2">
          <LabelText as="p" className="text-sm">設定</LabelText>
          <label className="text-xs font-bold block">
            プリセット
            <select
              value={presetId}
              onChange={(event) => setPresetId(event.target.value as typeof presetId)}
              className="w-full border-2 border-sumi bg-washi px-2 py-1 text-sm mt-1"
              disabled={autoPlay}
            >
              {LOGIC_LAB_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-bold block">
              Seed
              <input value={seedInput} onChange={(event) => setSeedInput(event.target.value)} className="w-full border-2 border-sumi bg-washi px-2 py-1 text-sm mt-1" disabled={autoPlay || comparisonBusy} />
            </label>
            <label className="text-xs font-bold block">
              最大場所数
              <input value={maxBashoInput} onChange={(event) => setMaxBashoInput(event.target.value)} className="w-full border-2 border-sumi bg-washi px-2 py-1 text-sm mt-1" disabled={autoPlay || comparisonBusy} />
            </label>
          </div>
          <CaptionText as="p" className="text-[11px] text-sumi">反映中: {runConfig ? `${resolveLogicLabPresetLabel(runConfig.presetId)} / seed=${runConfig.seed} / max=${runConfig.maxBasho}` : '-'}</CaptionText>
        </div>

        <div className="xl:col-span-8 border-2 border-sumi bg-washi p-4 space-y-3">
          <LabelText as="p" className="text-sm">操作</LabelText>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <button onClick={() => void startRun()} disabled={comparisonBusy} className={`border-2 font-black px-2 py-2 text-xs ${comparisonBusy ? 'border-sumi-light bg-washi-dark text-sumi-light' : 'border-sumi bg-kassairo text-washi'}`}>開始</button>
            <button onClick={() => void stepOne()} disabled={autoPlay || comparisonBusy} className={`border-2 font-black px-2 py-2 text-xs ${autoPlay || comparisonBusy ? 'border-sumi-light bg-washi-dark text-sumi-light' : 'border-sumi bg-washi text-sumi'}`}>1場所進む</button>
            {!autoPlay ? <button onClick={() => void startAutoPlay()} disabled={comparisonBusy} className={`border-2 font-black px-2 py-2 text-xs ${comparisonBusy ? 'border-sumi-light bg-washi-dark text-sumi-light' : 'border-sumi bg-sumi text-washi'}`}>自動再生</button> : <button onClick={pauseAutoPlay} className="border-2 border-shuiro bg-washi text-shuiro font-black px-2 py-2 text-xs">停止</button>}
            <button onClick={() => void runToEnd()} disabled={autoPlay || comparisonBusy} className={`border-2 font-black px-2 py-2 text-xs ${autoPlay || comparisonBusy ? 'border-sumi-light bg-washi-dark text-sumi-light' : 'border-sumi bg-washi text-sumi'}`}>最後まで</button>
            <button onClick={() => void runComparison()} disabled={autoPlay || comparisonBusy} className={`border-2 font-black px-2 py-2 text-xs ${autoPlay || comparisonBusy ? 'border-sumi-light bg-washi-dark text-sumi-light' : 'border-sumi bg-shuiro text-washi'}`}>{comparisonBusy ? '比較中...' : '2モデル比較（現行/新）'}</button>
            <button onClick={resetRun} disabled={comparisonBusy} className="border-2 border-sumi bg-washi text-sumi font-black px-2 py-2 text-xs">リセット</button>
          </div>
          {errorMessage && <BodyText as="p" className="text-xs text-shuiro border border-shuiro px-2 py-1">{errorMessage}</BodyText>}
        </div>
      </section>

      <section className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-black">
        <div className="border-2 border-sumi bg-washi p-2"><LabelText>昇進: </LabelText><MetricText as="span" className="text-matcha">{stats.promotion}</MetricText></div>
        <div className="border-2 border-sumi bg-washi p-2"><LabelText>降下: </LabelText><MetricText as="span" className="text-shuiro">{stats.demotion}</MetricText></div>
        <div className="border-2 border-sumi bg-washi p-2"><LabelText>警告: </LabelText><MetricText as="span">{stats.warning}</MetricText></div>
        <div className="border-2 border-sumi bg-washi p-2"><LabelText>怪我: </LabelText><MetricText as="span">{stats.injury}</MetricText></div>
        <div className="border-2 border-sumi bg-washi p-2"><LabelText>優勝: </LabelText><MetricText as="span">{stats.yusho}</MetricText></div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-7 border-2 border-sumi bg-washi p-4 space-y-2">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <p className="text-sm font-black">場所ログ</p>
            <div className="flex flex-wrap gap-2">
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="検索" className="border-2 border-sumi px-2 py-1 text-xs bg-washi" />
              <button onClick={() => setDesc((v) => !v)} className="border-2 border-sumi px-2 py-1 text-xs font-black">{desc ? '新しい順' : '古い順'}</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {LOG_FILTERS.map((item) => (
              <button key={item.id} onClick={() => setFilter(item.id)} className={`text-xs font-black px-2 py-1 border ${filter === item.id ? 'border-sumi bg-sumi text-washi' : 'border-sumi bg-washi text-sumi'}`}>{item.label}</button>
            ))}
            <span className="text-xs font-black text-sumi-light px-2 py-1">表示 {filtered.length}/{logs.length}</span>
          </div>
          <div className="overflow-x-auto max-h-[420px] border border-sumi">
            <table className="min-w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-washi border-b-2 border-sumi">
                <tr><th className="text-left py-1 px-2">Seq</th><th className="text-left py-1 px-2">場所</th><th className="text-left py-1 px-2">番付</th><th className="text-left py-1 px-2">成績</th><th className="text-left py-1 px-2">変動</th><th className="text-left py-1 px-2">警告</th></tr>
              </thead>
              <tbody>
                {filtered.map(({ row, index }) => (
                  <tr key={`${row.seq}-${row.year}-${row.month}`} onClick={() => selectLogIndex(index)} className={`border-b border-sumi-light/30 cursor-pointer ${selectedRow === row ? 'bg-washi-dark' : 'bg-washi'}`}>
                    <td className="py-1 px-2 font-black">{row.seq}</td><td className="py-1 px-2">{row.year}/{row.month}</td>
                    <td className="py-1 px-2">{formatRankName(row.rankBefore)} → {formatRankName(row.rankAfter)}</td>
                    <td className="py-1 px-2">{formatRecord(row.record.wins, row.record.losses, row.record.absent)}{row.record.yusho ? ' (優勝)' : ''}</td>
                    <td className={`py-1 px-2 font-black ${isPromotion(row) ? 'text-matcha' : isDemotion(row) ? 'text-shuiro' : 'text-sumi-light'}`}>{rankDeltaText(row)}</td>
                    <td className="py-1 px-2">{row.committeeWarnings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="xl:col-span-5 border-2 border-sumi bg-washi p-4 space-y-2">
          <p className="text-sm font-black">詳細</p>
          {!selectedRow ? <p className="text-xs font-bold text-sumi">ログ行を選択してください。</p> : (
            <div className="space-y-2 text-xs font-bold">
              <p>{selectedRow.year}年{selectedRow.month}月</p>
              <p>{formatRankName(selectedRow.rankBefore)} → {formatRankName(selectedRow.rankAfter)} / {rankDeltaText(selectedRow)}</p>
              <p>成績: {formatRecord(selectedRow.record.wins, selectedRow.record.losses, selectedRow.record.absent)}{selectedRow.record.yusho ? ' / 優勝' : ''}</p>
              <p>停止理由: {formatStopReason(selectedRow.pauseReason)}</p>
              <p>番付理由: {selectedRow.banzukeReasons.length ? selectedRow.banzukeReasons.join(' / ') : '-'}</p>
              <p>イベント: {selectedRow.events.length ? selectedRow.events[0] : '-'}</p>
              <p>怪我: Lv{selectedRow.injurySummary.injuryLevel} / 有効 {selectedRow.injurySummary.activeCount}件</p>
              <p>同階級NPC: {selectedRow.npcContext ? `${selectedRow.npcContext.rows.length}件` : 'なし'}</p>
            </div>
          )}
          {comparison && (
            <div className="border-t border-sumi pt-2 text-xs font-bold">
              <p className="mb-1">比較: {comparisonPresetLabel}</p>
              <p>現行最高位: {formatRankName(comparison.current.maxRank)}</p>
              <p>新モデル最高位: {formatRankName(comparison.newModel.maxRank)}</p>
              <p>勝利差: {comparison.newModel.totalWins - comparison.current.totalWins >= 0 ? '+' : ''}{comparison.newModel.totalWins - comparison.current.totalWins}</p>
              <p className="mt-2">主要決まり手差分</p>
              {comparison.topKimariteDiffs.length === 0 ? (
                <p>-</p>
              ) : (
                comparison.topKimariteDiffs.map((item) => (
                  <p key={item.name}>
                    {item.name}: {item.current} → {item.newModel} ({item.delta >= 0 ? '+' : ''}{item.delta})
                  </p>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      {summary && (
        <section className="border-2 border-sumi bg-washi p-4 text-xs font-bold grid grid-cols-1 md:grid-cols-3 gap-2">
          <p>現在番付: {formatRankName(summary.currentRank)}</p>
          <p>最高位: {formatRankName(summary.maxRank)}</p>
          <p>場所数: {summary.bashoCount}</p>
          <p>年齢: {summary.age}</p>
          <p>通算: {summary.totalWins}勝 {summary.totalLosses}敗 {summary.totalAbsent}休</p>
          <p>停止理由: {formatStopReason(summary.stopReason)}</p>
        </section>
      )}
    </div>
  );
};
