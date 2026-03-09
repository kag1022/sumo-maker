import React from 'react';
import { Rank } from '../../../logic/models';
import { PlayerBoutDetail } from '../../../logic/simulation/basho';
import { buildHoshitoriGrid } from '../utils/hoshitori';
import { ReportCareerRecord } from '../utils/reportCareer';

export interface HoshitoriCareerRecord extends ReportCareerRecord {
  bouts: PlayerBoutDetail[];
}

interface HoshitoriTableProps {
  careerRecords: HoshitoriCareerRecord[];
  isLoading?: boolean;
  errorMessage?: string;
}

type SortOrder = 'desc' | 'asc';

const formatRankName = (rank: Rank): string => {
  if (rank.name === '前相撲') return rank.name;
  const side = rank.side === 'West' ? '西' : rank.side === 'East' ? '東' : '';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  const number = rank.number || 1;
  if (number === 1) return `${side}${rank.name}筆頭`;
  return `${side}${rank.name}${number}枚目`;
};

const formatBashoLabel = (year: number, month: number): string =>
  `${year}年${month}月`;

const formatRecord = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ''}`;

const isFusenWin = (bout: PlayerBoutDetail): boolean =>
  bout.result === 'WIN' && bout.kimarite === '不戦勝';

const isFusenLoss = (bout: PlayerBoutDetail): boolean =>
  bout.result === 'LOSS' && bout.kimarite === '不戦敗';

const resolveSymbol = (bout: PlayerBoutDetail | null): string => {
  if (!bout) return 'や';
  if (isFusenWin(bout)) return '■';
  if (isFusenLoss(bout)) return '□';
  if (bout.result === 'WIN') return '●';
  if (bout.result === 'LOSS') return '◯';
  return 'や';
};

const resolveSymbolColor = (bout: PlayerBoutDetail | null): string => {
  if (!bout) return 'text-text-dim';
  if (bout.result === 'WIN') return 'text-white drop-shadow-sm';
  if (bout.result === 'LOSS') return 'text-kuroboshi';
  return 'text-text-dim';
};

export const HoshitoriTable: React.FC<HoshitoriTableProps & { shikona?: string }> = ({
  careerRecords,
  shikona,
  isLoading = false,
  errorMessage,
}) => {
  const [sortOrder, setSortOrder] = React.useState<SortOrder>('desc');
  const [activeTooltipId, setActiveTooltipId] = React.useState<string | null>(null);

  const sortedRecords = React.useMemo(() => {
    const records = careerRecords.slice();
    records.sort((a, b) => {
      const monthDiff = a.year * 100 + a.month - (b.year * 100 + b.month);
      return sortOrder === 'desc' ? -monthDiff : monthDiff;
    });
    return records;
  }, [careerRecords, sortOrder]);

  const hasRows = sortedRecords.length > 0;

  return (
    <div className="rpg-panel overflow-hidden">
      <div className="px-3 sm:px-5 pt-4 pb-3 border-b-2 border-gold-muted flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-header">生涯星取表</h3>
        <div className="flex items-center gap-0.5 border-2 border-gold-muted bg-bg p-0.5 text-xs shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]">
          <button
            type="button"
            onClick={() => setSortOrder("desc")}
            className={`px-2 py-1 font-bold transition-none ui-text-label ${sortOrder === "desc" ? "bg-gold/20 text-gold border-2 border-gold shadow-[inset_0_0_4px_rgba(212,160,23,0.5)]" : "text-text-dim border-2 border-transparent hover:text-gold hover:bg-gold/5"
              }`}
          >
            新しい順
          </button>
          <button
            type="button"
            onClick={() => setSortOrder("asc")}
            className={`px-2 py-1 font-bold transition-none ui-text-label ${sortOrder === "asc" ? "bg-gold/20 text-gold border-2 border-gold shadow-[inset_0_0_4px_rgba(212,160,23,0.5)]" : "text-text-dim border-2 border-transparent hover:text-gold hover:bg-gold/5"
              }`}
          >
            古い順
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="px-5 py-4 text-sm ui-text-label text-text-dim text-center">星取表データを読み込み中です...</div>
      )}

      {errorMessage && (
        <div className="px-5 py-3 text-xs ui-text-label text-crimson bg-crimson/10 border-b-2 border-gold-muted/30 shadow-[inset_0_0_4px_rgba(0,0,0,0.5)]">
          {errorMessage}
        </div>
      )}

      {!isLoading && !hasRows && (
        <div className="px-5 py-5 text-sm ui-text-label text-text-dim text-center">表示できる場所データがありません。</div>
      )}

      {hasRows && (
        <div className="divide-y-2 divide-gold-muted/30 text-xs sm:text-sm">
          {sortedRecords.map((record, recordIndex) => {
            const grid = buildHoshitoriGrid(record.bouts, record.rank.division);
            const rowKey = `${record.year}-${record.month}-${recordIndex}`;
            const { yusho, specialPrizes } = record;

            const isMakuuchi = record.rank.division === 'Makuuchi';

            // 優勝したら背景色を全体に強く付ける (段位問わず)
            const rowWrapperStyle = yusho
              ? (isMakuuchi
                ? "flex flex-col sm:flex-row relative bg-gold/30 border-2 border-gold font-bold shadow-[inset_0_0_8px_rgba(212,160,23,0.5)] my-1 z-10"
                : "flex flex-col sm:flex-row relative bg-gold/20 border-2 border-gold/70 shadow-[inset_0_0_4px_rgba(212,160,23,0.3)] my-0.5 z-0")
              : "flex flex-col sm:flex-row relative border-b-2 border-gold-muted/30 last:border-b-0";

            // 三賞等のフルテキストマッピング
            const prizeLabelMap: Record<string, string> = {
              '殊': '殊勲賞',
              '敢': '敢闘賞',
              '技': '技能賞',
            };

            return (
              <div key={rowKey} className={rowWrapperStyle}>
                {/* 左側: ヘッダー領域 */}
                <div className="w-full sm:w-40 sm:min-w-[160px] p-2 sm:p-3 sm:border-r-2 border-gold-muted/30 flex flex-row sm:flex-col justify-between sm:justify-start items-center sm:items-start bg-transparent shrink-0 gap-2 sm:gap-1">
                  <div className="flex flex-col sm:gap-0.5 shrink-0 min-w-0">
                    <div className="ui-text-label text-text whitespace-nowrap text-[11px] sm:text-xs">
                      {formatBashoLabel(record.year, record.month)}
                    </div>
                    <div className="ui-text-label text-gold text-[11px] sm:text-xs truncate max-w-[140px]">
                      {formatRankName(record.rank)}
                    </div>
                    {shikona && (
                      <div className="text-text-dim text-[10px] sm:text-[11px] truncate max-w-[140px] hidden sm:block">
                        {shikona}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end sm:items-start shrink-0">
                    <div className={`ui-text-label whitespace-nowrap text-xs sm:text-sm ${record.wins >= 8 ? 'text-hp' : 'text-text'
                      }`}>
                      {formatRecord(record.wins, record.losses, record.absent)}
                    </div>
                    {(yusho || (specialPrizes && specialPrizes.length > 0)) && (
                      <div className="flex flex-wrap gap-1 mt-0.5 max-w-[140px]">
                        {yusho && (
                          <span className="text-[10px] bg-gold text-white border-2 border-gold/80 px-1 ui-text-label whitespace-nowrap drop-shadow-sm font-bold">
                            優勝
                          </span>
                        )}
                        {specialPrizes?.map((prize: string, pIdx: number) => {
                          const fullText = prizeLabelMap[prize[0]] || prize;
                          return (
                            <span key={pIdx} className="text-[10px] bg-sky-200 text-sky-800 border-2 border-sky-400 px-1 ui-text-label whitespace-nowrap drop-shadow-sm font-bold">
                              {fullText}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右側: 15日間のタイムライン領域 */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-bg/50 scrollbar-pixel">
                  <div className="flex h-full min-w-[420px]">
                    {grid.map((bout, dayIndex) => {
                      const tooltipId = `${rowKey}-${dayIndex + 1}`;
                      const showTooltip = activeTooltipId === tooltipId && Boolean(bout);
                      const symbol = resolveSymbol(bout);
                      const opponent = bout?.opponentShikona ?? '';
                      const kimarite = bout?.kimarite ?? '-';

                      return (
                        <div
                          key={`${rowKey}-day-${dayIndex + 1}`}
                          className="flex-1 min-w-[28px] shrink-0 flex flex-col border-r-2 border-gold-muted/10 last:border-r-0 relative"
                        >
                          <button
                            type="button"
                            className="w-full relative h-full flex flex-col items-center hover:bg-gold/10 transition-none focus:outline-none focus:bg-gold/20"
                            onMouseEnter={() => { if (bout) setActiveTooltipId(tooltipId); }}
                            onMouseLeave={() => { if (activeTooltipId === tooltipId) setActiveTooltipId(null); }}
                            onFocus={() => { if (bout) setActiveTooltipId(tooltipId); }}
                            onBlur={() => { if (activeTooltipId === tooltipId) setActiveTooltipId(null); }}
                            onClick={() => {
                              if (!bout) return;
                              setActiveTooltipId((prev) => prev === tooltipId ? null : tooltipId);
                            }}
                          >
                            <div className="h-6 sm:h-7 flex items-center justify-center w-full border-b-2 border-gold-muted/10">
                              <span className={`text-sm sm:text-base font-bold leading-none ${resolveSymbolColor(bout)}`}>
                                {symbol}
                              </span>
                            </div>
                            {/* 縦書き四股名 */}
                            <div className="flex-1 w-full py-1.5 flex justify-center">
                              <span
                                className="text-[10px] sm:text-[11px] leading-[1.1] text-text-dim whitespace-pre-wrap select-none"
                                style={{
                                  writingMode: 'vertical-rl',
                                  textOrientation: 'upright',
                                  maxHeight: '120px'
                                }}
                              >
                                {opponent}
                              </span>
                            </div>
                          </button>

                          {/* ツールチップ */}
                          {showTooltip && (
                            <div className={`absolute top-1/2 ${dayIndex >= 7
                              ? "right-full mr-1 before:left-full before:border-l-gold-muted/50"
                              : "left-full ml-1 before:right-full before:border-r-gold-muted/50"
                              } z-20 -translate-y-1/2 w-40 border-2 border-gold-muted bg-bg p-2 shadow-[4px_4px_0_rgba(0,0,0,0.8)] text-left pointer-events-none before:content-[''] before:absolute before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent`}>
                              <div className="flex justify-between items-baseline mb-1 border-b-2 border-gold-muted/50 pb-1">
                                <span className="text-[10px] text-gold ui-text-label">{dayIndex + 1}日目</span>
                                <span className={`text-[11px] ui-text-label ${resolveSymbolColor(bout)}`}>{symbol}</span>
                              </div>
                              <p className="text-xs ui-text-label text-text mb-0.5">
                              {opponent || '対戦なし'}
                            </p>
                              {kimarite !== '-' && (
                                <p className="text-[10px] text-text-dim">
                                  {kimarite}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
