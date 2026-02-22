import React, { useMemo } from 'react';
import { getRankValueForChart } from '../../../logic/ranking';
import { Rank } from '../../../logic/models';
import { SimulationModelVersion } from '../../../logic/simulation/modelVersion';
import { LOGIC_LAB_PRESETS } from '../presets';
import { useLogicLabStore } from '../store/logicLabStore';
import { LogicLabBashoLogRow, LogicLabStopReason } from '../types';

const formatRankName = (rank: Rank): string => {
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結', '前相撲'].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  const number = rank.number || 1;
  return `${side}${rank.name}${number}`;
};

const formatRecord = (wins: number, losses: number, absent: number): string =>
  `${wins}-${losses}${absent > 0 ? `-${absent}` : ''}`;

const formatStopReason = (reason?: LogicLabStopReason): string => {
  if (!reason) return '-';
  if (reason === 'PROMOTION') return '昇進イベント';
  if (reason === 'INJURY') return '負傷イベント';
  if (reason === 'RETIREMENT') return '引退';
  if (reason === 'MAX_BASHO_REACHED') return '最大場所数到達';
  return reason;
};

const formatPhase = (phase: string): string => {
  if (phase === 'idle') return '待機';
  if (phase === 'ready') return '開始前';
  if (phase === 'running') return '実行中';
  if (phase === 'paused') return '一時停止';
  if (phase === 'completed') return '完了';
  if (phase === 'error') return 'エラー';
  return phase;
};

const formatInjuryStatus = (status: string): string => {
  if (status === 'ACUTE') return '急性';
  if (status === 'SUBACUTE') return '亜急性';
  if (status === 'CHRONIC') return '慢性';
  if (status === 'HEALED') return '治癒';
  return status;
};

const resolveRankDeltaText = (row: LogicLabBashoLogRow): string => {
  const before = getRankValueForChart(row.rankBefore);
  const after = getRankValueForChart(row.rankAfter);
  const delta = before - after;
  if (Math.abs(delta) < 0.001) return '変化なし';
  return delta > 0 ? `昇進 +${delta.toFixed(1)}` : `降下 ${delta.toFixed(1)}`;
};

const MODEL_OPTIONS: Array<{ value: SimulationModelVersion; label: string }> = [
  { value: 'legacy-v6', label: 'legacy-v6' },
  { value: 'realism-v1', label: 'realism-v1' },
];

const isSekitoriRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' || rank.division === 'Juryo';

const isMakuuchiRank = (rank: Rank): boolean => rank.division === 'Makuuchi';

const isSanyakuRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' && ['横綱', '大関', '関脇', '小結'].includes(rank.name);

const isYokozunaRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' && rank.name === '横綱';

export const LogicLabScreen: React.FC = () => {
  const phase = useLogicLabStore((state) => state.phase);
  const presetId = useLogicLabStore((state) => state.presetId);
  const simulationModelVersion = useLogicLabStore((state) => state.simulationModelVersion);
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
  const setSimulationModelVersion = useLogicLabStore((state) => state.setSimulationModelVersion);
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

  const selectedRow = useMemo(() => {
    if (typeof selectedLogIndex === 'number' && logs[selectedLogIndex]) {
      return logs[selectedLogIndex];
    }
    if (logs.length === 0) return null;
    return logs[logs.length - 1];
  }, [logs, selectedLogIndex]);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="border-4 border-sumi bg-washi p-4 shadow-[6px_6px_0px_0px_#2b2b2b]">
        <p className="text-xl font-black">ロジック検証モード（dev専用）</p>
        <p className="text-xs font-bold text-sumi mt-1">
          GUI上でフルキャリア進行を追跡します。保存は行われません。
        </p>
      </div>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border-2 border-sumi bg-washi p-4 space-y-3">
          <p className="text-sm font-black">設定</p>
          <label className="text-xs font-bold block space-y-1">
            <span>プリセット</span>
            <select
              value={presetId}
              onChange={(event) => setPresetId(event.target.value as typeof presetId)}
              className="w-full border-2 border-sumi bg-washi px-2 py-1 text-sm"
              disabled={autoPlay}
            >
              {LOGIC_LAB_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold block space-y-1">
            <span>モデル</span>
            <select
              value={simulationModelVersion}
              onChange={(event) =>
                setSimulationModelVersion(event.target.value as SimulationModelVersion)
              }
              className="w-full border-2 border-sumi bg-washi px-2 py-1 text-sm"
              disabled={autoPlay || comparisonBusy}
            >
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-bold block space-y-1">
            <span>Seed</span>
            <input
              value={seedInput}
              onChange={(event) => setSeedInput(event.target.value)}
              className="w-full border-2 border-sumi bg-washi px-2 py-1 text-sm"
              disabled={autoPlay || comparisonBusy}
            />
          </label>
          <label className="text-xs font-bold block space-y-1">
            <span>最大場所数</span>
            <input
              value={maxBashoInput}
              onChange={(event) => setMaxBashoInput(event.target.value)}
              className="w-full border-2 border-sumi bg-washi px-2 py-1 text-sm"
              disabled={autoPlay || comparisonBusy}
            />
          </label>
          <p className="text-[11px] font-bold text-sumi">
            反映中: preset={runConfig?.presetId ?? '-'} / model={runConfig?.simulationModelVersion ?? '-'} / seed={runConfig?.seed ?? '-'} / max={runConfig?.maxBasho ?? '-'}
          </p>
        </div>

        <div className="border-2 border-sumi bg-washi p-4 space-y-3 lg:col-span-2">
          <p className="text-sm font-black">操作</p>
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <button
              onClick={() => void startRun()}
              disabled={comparisonBusy}
              className={`border-2 font-black px-2 py-2 text-xs ${
                comparisonBusy
                  ? 'border-sumi-light bg-washi-dark text-sumi-light'
                  : 'border-sumi bg-kassairo text-washi'
              }`}
            >
              開始
            </button>
            <button
              onClick={() => void stepOne()}
              disabled={autoPlay || comparisonBusy}
              className={`border-2 font-black px-2 py-2 text-xs ${
                autoPlay || comparisonBusy
                  ? 'border-sumi-light bg-washi-dark text-sumi-light'
                  : 'border-sumi bg-washi text-sumi'
              }`}
            >
              1場所進む
            </button>
            {!autoPlay ? (
              <button
                onClick={() => void startAutoPlay()}
                disabled={comparisonBusy}
                className={`border-2 font-black px-2 py-2 text-xs ${
                  comparisonBusy
                    ? 'border-sumi-light bg-washi-dark text-sumi-light'
                    : 'border-sumi bg-sumi text-washi'
                }`}
              >
                自動再生
              </button>
            ) : (
              <button
                onClick={pauseAutoPlay}
                className="border-2 border-shuiro bg-washi text-shuiro font-black px-2 py-2 text-xs"
              >
                停止
              </button>
            )}
            <button
              onClick={() => void runToEnd()}
              disabled={autoPlay || comparisonBusy}
              className={`border-2 font-black px-2 py-2 text-xs ${
                autoPlay || comparisonBusy
                  ? 'border-sumi-light bg-washi-dark text-sumi-light'
                  : 'border-sumi bg-washi text-sumi'
              }`}
            >
              最後まで
            </button>
            <button
              onClick={() => void runComparison()}
              disabled={autoPlay || comparisonBusy}
              className={`border-2 font-black px-2 py-2 text-xs ${
                autoPlay || comparisonBusy
                  ? 'border-sumi-light bg-washi-dark text-sumi-light'
                  : 'border-sumi bg-shuiro text-washi'
              }`}
            >
              {comparisonBusy ? '比較中...' : '2モデル比較'}
            </button>
            <button
              onClick={resetRun}
              disabled={comparisonBusy}
              className="border-2 border-sumi bg-washi text-sumi font-black px-2 py-2 text-xs"
            >
              リセット
            </button>
          </div>

          <p className="text-xs font-bold text-sumi">状態: {formatPhase(phase)}</p>
          {errorMessage && (
            <p className="text-xs font-bold text-shuiro border border-shuiro px-2 py-1">{errorMessage}</p>
          )}
        </div>
      </section>

      <section className="border-2 border-sumi bg-washi p-4">
        <p className="text-sm font-black mb-2">サマリー</p>
        {!summary ? (
          <p className="text-xs font-bold text-sumi">まだ実行されていません。</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs font-bold">
            <p>モデル: {summary.simulationModelVersion}</p>
            <p>現在番付: {formatRankName(summary.currentRank)}</p>
            <p>最高位: {formatRankName(summary.maxRank)}</p>
            <p>年齢: {summary.age}</p>
            <p>場所数: {summary.bashoCount}</p>
            <p>通算: {summary.totalWins}勝 {summary.totalLosses}敗 {summary.totalAbsent}休</p>
            <p>三賞: {summary.sanshoTotal}（殊勲 {summary.shukunCount} / 敢闘 {summary.kantoCount} / 技能 {summary.ginoCount}）</p>
            <p>怪我: Lv{summary.injurySummary.injuryLevel} / 有効 {summary.injurySummary.activeCount}件</p>
            <p>会議警告: {summary.committeeWarnings}件</p>
            <p className="md:col-span-2">停止理由: {formatStopReason(summary.stopReason)}</p>
          </div>
        )}
      </section>

      <section className="border-2 border-sumi bg-washi p-4">
        <p className="text-sm font-black mb-2">モデル比較（同条件）</p>
        {!comparison && !comparisonBusy && (
          <p className="text-xs font-bold text-sumi">「2モデル比較」で legacy-v6 / realism-v1 を同条件で比較します。</p>
        )}
        {comparisonBusy && (
          <p className="text-xs font-bold text-sumi">比較シミュレーションを実行中です...</p>
        )}
        {comparison && (
          <div className="space-y-2 text-xs font-bold">
            <p>
              条件: preset={comparison.config.presetId} / seed={comparison.config.seed} / max={comparison.config.maxBasho}
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-sumi">
                    <th className="text-left py-1 pr-2">指標</th>
                    <th className="text-left py-1 pr-2">legacy-v6</th>
                    <th className="text-left py-1 pr-2">realism-v1</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-sumi-light/30">
                    <td className="py-1 pr-2">最高位</td>
                    <td className="py-1 pr-2">{formatRankName(comparison.legacy.maxRank)}</td>
                    <td className="py-1 pr-2">{formatRankName(comparison.realism.maxRank)}</td>
                  </tr>
                  <tr className="border-b border-sumi-light/30">
                    <td className="py-1 pr-2">通算</td>
                    <td className="py-1 pr-2">{comparison.legacy.totalWins}勝 {comparison.legacy.totalLosses}敗 {comparison.legacy.totalAbsent}休</td>
                    <td className="py-1 pr-2">{comparison.realism.totalWins}勝 {comparison.realism.totalLosses}敗 {comparison.realism.totalAbsent}休</td>
                  </tr>
                  <tr className="border-b border-sumi-light/30">
                    <td className="py-1 pr-2">場所数</td>
                    <td className="py-1 pr-2">{comparison.legacy.bashoCount}</td>
                    <td className="py-1 pr-2">{comparison.realism.bashoCount}</td>
                  </tr>
                  <tr className="border-b border-sumi-light/30">
                    <td className="py-1 pr-2">関取到達</td>
                    <td className="py-1 pr-2">{isSekitoriRank(comparison.legacy.maxRank) ? '到達' : '-'}</td>
                    <td className="py-1 pr-2">{isSekitoriRank(comparison.realism.maxRank) ? '到達' : '-'}</td>
                  </tr>
                  <tr className="border-b border-sumi-light/30">
                    <td className="py-1 pr-2">幕内到達</td>
                    <td className="py-1 pr-2">{isMakuuchiRank(comparison.legacy.maxRank) ? '到達' : '-'}</td>
                    <td className="py-1 pr-2">{isMakuuchiRank(comparison.realism.maxRank) ? '到達' : '-'}</td>
                  </tr>
                  <tr className="border-b border-sumi-light/30">
                    <td className="py-1 pr-2">三役到達</td>
                    <td className="py-1 pr-2">{isSanyakuRank(comparison.legacy.maxRank) ? '到達' : '-'}</td>
                    <td className="py-1 pr-2">{isSanyakuRank(comparison.realism.maxRank) ? '到達' : '-'}</td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2">横綱到達</td>
                    <td className="py-1 pr-2">{isYokozunaRank(comparison.legacy.maxRank) ? '到達' : '-'}</td>
                    <td className="py-1 pr-2">{isYokozunaRank(comparison.realism.maxRank) ? '到達' : '-'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section className="border-2 border-sumi bg-washi p-4">
        <p className="text-sm font-black mb-2">場所ログ</p>
        {logs.length === 0 ? (
          <p className="text-xs font-bold text-sumi">ログはまだありません。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-sumi">
                  <th className="text-left py-1 pr-2">Seq</th>
                  <th className="text-left py-1 pr-2">場所</th>
                  <th className="text-left py-1 pr-2">番付</th>
                  <th className="text-left py-1 pr-2">成績</th>
                  <th className="text-left py-1 pr-2">イベント</th>
                  <th className="text-left py-1 pr-2">怪我</th>
                  <th className="text-left py-1 pr-2">警告</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((row, index) => (
                  <tr
                    key={`${row.seq}-${row.year}-${row.month}`}
                    onClick={() => selectLogIndex(index)}
                    className={`border-b border-sumi-light/30 cursor-pointer ${
                      selectedRow === row ? 'bg-washi-dark' : 'bg-washi'
                    }`}
                  >
                    <td className="py-1 pr-2 font-bold">{row.seq}</td>
                    <td className="py-1 pr-2">{row.year}/{row.month}</td>
                    <td className="py-1 pr-2">
                      {formatRankName(row.rankBefore)} → {formatRankName(row.rankAfter)}
                    </td>
                    <td className="py-1 pr-2">
                      {formatRecord(row.record.wins, row.record.losses, row.record.absent)}
                      {row.record.yusho ? ' (優勝)' : ''}
                    </td>
                    <td className="py-1 pr-2">{row.events[0] ?? '-'}</td>
                    <td className="py-1 pr-2">{row.injurySummary.activeCount}件</td>
                    <td className="py-1 pr-2">{row.committeeWarnings}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="border-2 border-sumi bg-washi p-4">
        <p className="text-sm font-black mb-2">詳細</p>
        {!selectedRow ? (
          <p className="text-xs font-bold text-sumi">ログ行を選択してください。</p>
        ) : (
          <div className="space-y-3 text-xs font-bold">
            <p>
              {selectedRow.year}年{selectedRow.month}月 / {formatRankName(selectedRow.rankBefore)} → {formatRankName(selectedRow.rankAfter)} / {resolveRankDeltaText(selectedRow)}
            </p>
            <p>
              成績: {formatRecord(selectedRow.record.wins, selectedRow.record.losses, selectedRow.record.absent)}
              {selectedRow.record.yusho ? ' / 優勝' : ''}
            </p>
            <p>停止理由: {formatStopReason(selectedRow.pauseReason)}</p>
            <p>会議警告: {selectedRow.committeeWarnings}件</p>

            <div>
              <p className="mb-1">イベント</p>
              {selectedRow.events.length === 0 ? (
                <p className="text-sumi">なし</p>
              ) : (
                <ul className="list-disc list-inside space-y-1">
                  {selectedRow.events.map((event, index) => (
                    <li key={`${event}-${index}`}>{event}</li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-1">怪我内訳</p>
              {selectedRow.injurySummary.activeInjuries.length === 0 ? (
                <p className="text-sumi">有効な怪我なし</p>
              ) : (
                <ul className="list-disc list-inside space-y-1">
                  {selectedRow.injurySummary.activeInjuries.map((injury, index) => (
                    <li key={`${injury.name}-${index}`}>
                      {injury.name} / 重症度 {injury.severity} / {formatInjuryStatus(injury.status)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
