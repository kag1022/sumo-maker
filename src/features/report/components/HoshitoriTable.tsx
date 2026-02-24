import React from "react";
import { Rank } from "../../../logic/models";
import { PlayerBoutDetail } from "../../../logic/simulation/basho";
import { Card } from "../../../shared/ui/Card";
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

const DAY_HEADERS = Array.from({ length: 15 }, (_, index) => index + 1);

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
  if (bout.result === "WIN") return "〇";
  if (bout.result === "LOSS") return "●";
  return "や";
};

const resolveSymbolColor = (bout: PlayerBoutDetail | null): string => {
  if (!bout) return "text-sumi-light";
  if (bout.result === "WIN") return "text-shuiro";
  if (bout.result === "LOSS") return "text-sumi";
  return "text-sumi-light";
};

export const HoshitoriTable: React.FC<HoshitoriTableProps> = ({
  careerRecords,
  isLoading = false,
  errorMessage,
}) => {
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("desc");
  const [activeTooltipId, setActiveTooltipId] = React.useState<string | null>(
    null,
  );

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
    <Card className="overflow-hidden border-sumi">
      <div className="px-5 pt-4 pb-3 border-b border-kiniro-muted/15">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-kiniro">生涯星取表</h3>
          <div className="flex items-center gap-1 border border-kiniro-muted/20 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setSortOrder("desc")}
              className={`px-2 py-1 font-bold transition-all ${
                sortOrder === "desc"
                  ? "bg-kiniro/15 text-kiniro"
                  : "text-sumi-light hover:text-kiniro"
              }`}
            >
              新しい順
            </button>
            <button
              type="button"
              onClick={() => setSortOrder("asc")}
              className={`px-2 py-1 font-bold transition-all ${
                sortOrder === "asc"
                  ? "bg-kiniro/15 text-kiniro"
                  : "text-sumi-light hover:text-kiniro"
              }`}
            >
              古い順
            </button>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="px-5 py-4 text-sm text-sumi-light">
          星取表データを読み込み中です...
        </div>
      )}

      {errorMessage && (
        <div className="px-5 py-3 text-xs font-bold text-shuiro bg-washi border-b border-sumi/20">
          {errorMessage}
        </div>
      )}

      {!isLoading && !hasRows && (
        <div className="px-5 py-5 text-sm text-sumi-light">
          表示できる場所データがありません。
        </div>
      )}

      {hasRows && (
        <div className="overflow-x-auto bg-washi">
          <table className="w-full border-collapse text-xs min-w-[1120px]">
            <thead>
              <tr className="border-b border-kiniro-muted/20">
                <th className="border border-kiniro-muted/15 px-2 py-2 text-left font-bold min-w-[96px] text-kiniro-muted">
                  年/月
                </th>
                <th className="border border-kiniro-muted/15 px-2 py-2 text-left font-bold min-w-[128px] text-kiniro-muted">
                  番付
                </th>
                {DAY_HEADERS.map((day) => (
                  <th
                    key={`day-${day}`}
                    className="border border-kiniro-muted/15 px-1 py-2 text-center font-bold min-w-[54px] text-kiniro-muted"
                  >
                    {day}
                  </th>
                ))}
                <th className="border border-kiniro-muted/15 px-2 py-2 text-center font-bold min-w-[92px] text-kiniro-muted">
                  成績
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((record, recordIndex) => {
                const grid = buildHoshitoriGrid(record.bouts, record.rank.division);
                const rowKey = `${record.year}-${record.month}-${recordIndex}`;

                return (
                  <tr key={rowKey} className="align-top">
                    <td className="border border-sumi px-2 py-2 text-sumi-dark font-bold whitespace-nowrap">
                      {formatBashoLabel(record.year, record.month)}
                    </td>
                    <td className="border border-sumi px-2 py-2 text-sumi-dark font-bold whitespace-nowrap">
                      {formatRankName(record.rank)}
                    </td>
                    {grid.map((bout, dayIndex) => {
                      const tooltipId = `${rowKey}-${dayIndex + 1}`;
                      const showTooltip = activeTooltipId === tooltipId && Boolean(bout);
                      const symbol = resolveSymbol(bout);
                      const opponent = bout?.opponentShikona ?? "";
                      const kimarite = bout?.kimarite ?? "-";

                      return (
                        <td
                          key={`${rowKey}-day-${dayIndex + 1}`}
                          className="border border-kiniro-muted/10 p-0 min-w-[54px]"
                        >
                          <div className="relative">
                            <button
                              type="button"
                              className="w-full px-1 py-1.5 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-shuiro"
                              onMouseEnter={() => {
                                if (bout) setActiveTooltipId(tooltipId);
                              }}
                              onMouseLeave={() => {
                                if (activeTooltipId === tooltipId) {
                                  setActiveTooltipId(null);
                                }
                              }}
                              onFocus={() => {
                                if (bout) setActiveTooltipId(tooltipId);
                              }}
                              onBlur={() => {
                                if (activeTooltipId === tooltipId) {
                                  setActiveTooltipId(null);
                                }
                              }}
                              onClick={() => {
                                if (!bout) return;
                                setActiveTooltipId((prev) =>
                                  prev === tooltipId ? null : tooltipId,
                                );
                              }}
                            >
                              <div
                                className={`text-base font-black leading-none ${resolveSymbolColor(bout)}`}
                              >
                                {symbol}
                              </div>
                              <div className="mt-1 text-[10px] leading-tight text-sumi-light truncate">
                                {opponent}
                              </div>
                            </button>
                            {showTooltip && (
                              <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 w-44 -translate-x-1/2 border border-kiniro/30 bg-washi-light p-2 text-left shadow-game">
                                <p className="text-[10px] font-bold text-sumi">
                                  相手: {bout?.opponentShikona || "-"}
                                </p>
                                <p className="mt-1 text-[10px] text-sumi-light">
                                  決まり手: {kimarite}
                                </p>
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border border-sumi px-2 py-2 text-center font-bold text-sumi-dark whitespace-nowrap">
                      {formatRecord(record.wins, record.losses, record.absent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
