import React from "react";
import { Rank } from "../../../logic/models";
import { PlayerBoutDetail } from "../../../logic/simulation/basho";
import { buildHoshitoriGrid } from "../utils/hoshitori";

export interface HoshitoriCareerRecord {
  year: number;
  month: number;
  rank: Rank;
  wins: number;
  losses: number;
  absent: number;
  bouts: PlayerBoutDetail[];
}

interface HoshitoriTableProps {
  careerRecords: HoshitoriCareerRecord[];
  isLoading?: boolean;
  errorMessage?: string;
}

type SortOrder = "desc" | "asc";

const formatRankName = (rank: Rank): string => {
  if (rank.name === "前相撲") return rank.name;
  const side = rank.side === "West" ? "西" : rank.side === "East" ? "東" : "";
  if (["横綱", "大関", "関脇", "小結"].includes(rank.name)) {
    return `${side}${rank.name}`;
  }
  const number = rank.number || 1;
  if (number === 1) return `${side}${rank.name}筆頭`;
  return `${side}${rank.name}${number}枚目`;
};

const formatBashoLabel = (year: number, month: number): string =>
  `${year}年${month}月`;

const formatRecord = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const isFusenWin = (bout: PlayerBoutDetail): boolean =>
  bout.result === "WIN" && bout.kimarite === "不戦勝";

const isFusenLoss = (bout: PlayerBoutDetail): boolean =>
  bout.result === "LOSS" && bout.kimarite === "不戦敗";

const resolveSymbol = (bout: PlayerBoutDetail | null): string => {
  if (!bout) return "や";
  if (isFusenWin(bout)) return "□";
  if (isFusenLoss(bout)) return "■";
  if (bout.result === "WIN") return "●";
  if (bout.result === "LOSS") return "◯";
  return "や";
};

const resolveSymbolColor = (bout: PlayerBoutDetail | null): string => {
  if (!bout) return "text-sumi-light";
  if (bout.result === "WIN") return "text-white";
  if (bout.result === "LOSS") return "text-sumi";
  return "text-sumi-light";
};

export const HoshitoriTable: React.FC<HoshitoriTableProps & { shikona?: string }> = ({
  careerRecords,
  shikona,
  isLoading = false,
  errorMessage,
}) => {
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("desc");
  const [activeTooltipId, setActiveTooltipId] = React.useState<string | null>(null);

  const sortedRecords = React.useMemo(() => {
    const records = careerRecords.slice();
    records.sort((a, b) => {
      const monthDiff = a.year * 100 + a.month - (b.year * 100 + b.month);
      return sortOrder === "desc" ? -monthDiff : monthDiff;
    });
    return records;
  }, [careerRecords, sortOrder]);

  const hasRows = sortedRecords.length > 0;

  return (
    <div className="game-panel overflow-hidden">
      <div className="px-3 sm:px-5 pt-4 pb-3 border-b border-kiniro-muted/15 flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-header">生涯星取表</h3>
        <div className="flex items-center gap-0.5 border border-kiniro-muted/20 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setSortOrder("desc")}
            className={`px-2 py-1 font-bold transition-all ${sortOrder === "desc" ? "bg-kiniro/15 text-kiniro" : "text-sumi-light hover:text-kiniro"
              }`}
          >
            新しい順
          </button>
          <button
            type="button"
            onClick={() => setSortOrder("asc")}
            className={`px-2 py-1 font-bold transition-all ${sortOrder === "asc" ? "bg-kiniro/15 text-kiniro" : "text-sumi-light hover:text-kiniro"
              }`}
          >
            古い順
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="px-5 py-4 text-sm text-sumi-light">星取表データを読み込み中です...</div>
      )}

      {errorMessage && (
        <div className="px-5 py-3 text-xs font-bold text-shuiro bg-shuiro/5 border-b border-kiniro-muted/15">
          {errorMessage}
        </div>
      )}

      {!isLoading && !hasRows && (
        <div className="px-5 py-5 text-sm text-sumi-light">表示できる場所データがありません。</div>
      )}

      {hasRows && (
        <div className="divide-y divide-kiniro-muted/20 text-xs sm:text-sm">
          {sortedRecords.map((record, recordIndex) => {
            const grid = buildHoshitoriGrid(record.bouts, record.rank.division);
            const rowKey = `${record.year}-${record.month}-${recordIndex}`;
            const { yusho, specialPrizes } = record as any; // any cast for now as type will be updated

            const isMakuuchi = record.rank.division === "Makuuchi";
            const rowWrapperStyle = yusho
              ? (isMakuuchi
                ? "flex flex-col sm:flex-row relative bg-kiniro/10 border-2 border-kiniro/80 shadow-[inset_0_0_15px_rgba(212,160,23,0.3)] my-1 z-10"
                : "flex flex-col sm:flex-row relative bg-kiniro/5 border border-kiniro/40 shadow-[inset_0_0_8px_rgba(212,160,23,0.1)] my-0.5 z-0")
              : "flex flex-col sm:flex-row relative border-b border-kiniro-muted/20 last:border-b-0";

            return (
              <div key={rowKey} className={rowWrapperStyle}>
                {/* 左側: ヘッダー領域 */}
                <div className="w-full sm:w-40 sm:min-w-[160px] p-2 sm:p-3 sm:border-r border-kiniro-muted/20 flex flex-row sm:flex-col justify-between sm:justify-start items-center sm:items-start bg-bg-light/30 shrink-0 gap-2 sm:gap-1">
                  <div className="flex flex-col sm:gap-0.5 shrink-0 min-w-0">
                    <div className="font-bold text-sumi whitespace-nowrap text-[11px] sm:text-xs">
                      {formatBashoLabel(record.year, record.month)}
                    </div>
                    <div className="font-bold text-kiniro text-[11px] sm:text-xs truncate max-w-[140px]">
                      {formatRankName(record.rank)}
                    </div>
                    {shikona && (
                      <div className="text-sumi-light text-[10px] sm:text-[11px] truncate max-w-[140px] hidden sm:block">
                        {shikona}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end sm:items-start shrink-0">
                    <div className={`font-bold whitespace-nowrap text-xs sm:text-sm ${record.wins >= 8 ? 'text-shuiro' : 'text-sumi'
                      }`}>
                      {formatRecord(record.wins, record.losses, record.absent)}
                    </div>
                    {(yusho || (specialPrizes && specialPrizes.length > 0)) && (
                      <div className="flex gap-1 mt-0.5">
                        {yusho && (
                          <span className="text-[10px] bg-kiniro/20 text-kiniro border border-kiniro px-1 rounded-sm tracking-tighter whitespace-nowrap">
                            優勝
                          </span>
                        )}
                        {specialPrizes?.map((prize: string, pIdx: number) => (
                          <span key={pIdx} className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/30 px-1 rounded-sm tracking-tighter whitespace-nowrap">
                            {prize[0]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右側: 15日間のタイムライン領域 */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden custom-scrollbar bg-white/5">
                  <div className="flex h-full min-w-[420px]">
                    {grid.map((bout, dayIndex) => {
                      const tooltipId = `${rowKey}-${dayIndex + 1}`;
                      const showTooltip = activeTooltipId === tooltipId && Boolean(bout);
                      const symbol = resolveSymbol(bout);
                      const opponent = bout?.opponentShikona ?? "";
                      const kimarite = bout?.kimarite ?? "-";

                      return (
                        <div
                          key={`${rowKey}-day-${dayIndex + 1}`}
                          className="flex-1 min-w-[28px] shrink-0 flex flex-col border-r border-kiniro-muted/10 last:border-r-0 relative"
                        >
                          <button
                            type="button"
                            className="w-full relative h-full flex flex-col items-center hover:bg-kiniro/5 transition-colors focus:outline-none focus-visible:bg-kiniro/10"
                            onMouseEnter={() => { if (bout) setActiveTooltipId(tooltipId); }}
                            onMouseLeave={() => { if (activeTooltipId === tooltipId) setActiveTooltipId(null); }}
                            onFocus={() => { if (bout) setActiveTooltipId(tooltipId); }}
                            onBlur={() => { if (activeTooltipId === tooltipId) setActiveTooltipId(null); }}
                            onClick={() => {
                              if (!bout) return;
                              setActiveTooltipId((prev) => prev === tooltipId ? null : tooltipId);
                            }}
                          >
                            <div className="h-6 sm:h-7 flex items-center justify-center w-full border-b border-kiniro-muted/10">
                              <span className={`text-sm sm:text-base font-black leading-none ${resolveSymbolColor(bout)}`}>
                                {symbol}
                              </span>
                            </div>
                            {/* 縦書き四股名 */}
                            <div className="flex-1 w-full py-1.5 flex justify-center">
                              <span
                                className="text-[10px] sm:text-[11px] leading-[1.1] text-sumi-light whitespace-pre-wrap select-none tracking-tighter"
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
                            <div className="absolute top-1/2 left-full z-20 ml-1 -translate-y-1/2 w-40 border border-kiniro/30 bg-washi p-2 shadow-game shadow-black/40 text-left pointer-events-none before:content-[''] before:absolute before:right-full before:top-1/2 before:-translate-y-1/2 before:border-[6px] before:border-transparent before:border-r-kiniro/30">
                              <div className="flex justify-between items-baseline mb-1 border-b border-kiniro-muted/30 pb-1">
                                <span className="text-[10px] text-kiniro font-bold">{dayIndex + 1}日目</span>
                                <span className={`text-[11px] font-bold ${resolveSymbolColor(bout)}`}>{symbol}</span>
                              </div>
                              <p className="text-xs font-bold text-sumi mb-0.5">
                                {opponent || "対戦なし"}
                              </p>
                              {kimarite !== "-" && (
                                <p className="text-[10px] text-sumi-light">
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
