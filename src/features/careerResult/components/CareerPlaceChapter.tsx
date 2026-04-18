import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { type Division } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { formatRankDisplayName } from "../../report/utils/reportShared";
import { WinLossBar } from "../../../shared/ui/WinLossBar";
import type {
  CareerLedgerModel,
  CareerLedgerPoint,
  CareerPlaceSummaryModel,
  CareerPlaceTabId,
} from "../utils/careerResultModel";
import { groupNearbyRanks, listDivisionRows } from "../utils/careerResultModel";

interface CareerPlaceChapterProps {
  ledger: CareerLedgerModel;
  point: CareerLedgerPoint | null;
  detail: CareerBashoDetail | null;
  summary: CareerPlaceSummaryModel | null;
  placeTab: CareerPlaceTabId;
  isLoading: boolean;
  hasPersistence: boolean;
  onSelectBasho: (bashoSeq: number) => void;
  onSelectNpc: (entityId: string | null) => void;
  onPlaceTabChange: (tab: CareerPlaceTabId) => void;
}

type BoutResult = "WIN" | "LOSS" | "ABSENT";

const RESULT_MARK: Record<BoutResult, { symbol: string; style: React.CSSProperties }> = {
  WIN: { symbol: "○", style: { color: "var(--chart-win)" } },
  LOSS: { symbol: "●", style: { color: "var(--chart-loss)" } },
  ABSENT: { symbol: "休", style: { color: "var(--chart-absent)" } },
};

export const CareerPlaceChapter: React.FC<CareerPlaceChapterProps> = ({
  ledger,
  point,
  detail,
  summary,
  placeTab,
  isLoading,
  hasPersistence,
  onSelectBasho,
  onSelectNpc,
  onPlaceTabChange,
}) => {
  const nearbyRows = React.useMemo(() => {
    if (!detail?.rows?.length || !detail.playerRecord) return [];
    return groupNearbyRanks(detail.rows, detail.playerRecord, 3);
  }, [detail]);
  const fullRows = React.useMemo(() => {
    if (!detail?.rows?.length || !detail.playerRecord) return [];
    return listDivisionRows(detail.rows, detail.playerRecord);
  }, [detail]);
  const importantDayMap = React.useMemo(
    () => new Map((detail?.importantTorikumi ?? []).map((note) => [note.day, note])),
    [detail?.importantTorikumi],
  );
  const selectedIndex = React.useMemo(
    () => ledger.points.findIndex((entry) => entry.bashoSeq === point?.bashoSeq),
    [ledger.points, point?.bashoSeq],
  );
  const nearbyPoints = React.useMemo(() => {
    if (selectedIndex < 0) {
      return ledger.points.slice(Math.max(0, ledger.points.length - 8));
    }
    const start = Math.max(0, selectedIndex - 3);
    const end = Math.min(ledger.points.length, selectedIndex + 4);
    return ledger.points.slice(start, end);
  }, [ledger.points, selectedIndex]);
  const previousPoint = selectedIndex > 0 ? ledger.points[selectedIndex - 1] : null;
  const nextPoint = selectedIndex >= 0 && selectedIndex < ledger.points.length - 1 ? ledger.points[selectedIndex + 1] : null;

  const wins = point?.wins ?? 0;
  const losses = point?.losses ?? 0;
  const absent = point?.absent ?? 0;

  return (
    <section className="career-archive-shell">
      {/* Section header */}
      <div className="career-archive-head">
        <div>
          <div className="career-archive-kicker">場所別</div>
          <h2 className="career-archive-title">{summary?.bashoLabel ?? point?.bashoLabel ?? "場所詳細"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="place-stepper"
            onClick={() => previousPoint && onSelectBasho(previousPoint.bashoSeq)}
            disabled={!previousPoint}
          >
            <ChevronLeft className="h-3.5 w-3.5" />前
          </button>
          <button
            type="button"
            className="place-stepper"
            onClick={() => nextPoint && onSelectBasho(nextPoint.bashoSeq)}
            disabled={!nextPoint}
          >
            次<ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Place selector strip — ledger tab style */}
      <div className="place-scroll-strip" role="list" aria-label="場所一覧">
        {nearbyPoints.map((entry) => {
          const isSelected = entry.bashoSeq === point?.bashoSeq;
          const r = RESULT_MARK[entry.wins >= entry.losses + entry.absent ? "WIN" : entry.losses > entry.wins ? "LOSS" : "ABSENT"];
          return (
            <button
              key={entry.bashoSeq}
              type="button"
              role="listitem"
              className={clsx("place-basho-chip", isSelected && "selected", entry.milestoneTags.length > 0 && "event")}
              onClick={() => onSelectBasho(entry.bashoSeq)}
            >
              <span className="place-basho-chip-label">{entry.bashoLabel}</span>
              <strong className="place-basho-chip-rank">{entry.rankShortLabel}</strong>
              <span className="place-basho-chip-record" style={r.style}>{entry.recordCompactLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Summary — 帳面スタイル */}
      <div className="place-ledger-summary">
        <div className="place-ledger-summary-inner">
          <div className="place-ledger-row">
            <span className="place-ledger-key">番付</span>
            <strong className="place-ledger-val">{summary?.rankLabel ?? "—"}</strong>
          </div>
          <div className="place-ledger-row">
            <span className="place-ledger-key">成績</span>
            <strong className="place-ledger-val">{summary?.recordLabel ?? "—"}</strong>
          </div>
          <div className="place-ledger-row">
            <span className="place-ledger-key">昇降</span>
            <strong className="place-ledger-val">{summary?.deltaLabel ?? "—"}</strong>
          </div>
        </div>
        {(wins + losses + absent) > 0 && (
          <div className="mt-3">
            <WinLossBar wins={wins} losses={losses} absent={absent} height="md" />
          </div>
        )}
        {(summary?.milestoneTags ?? []).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {(summary?.milestoneTags ?? []).map((tag) => (
              <span key={tag} className="place-milestone-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>

      {/* Tab strip */}
      <div className="place-tabstrip" role="tablist" aria-label="場所別切替">
        {(["nearby", "full", "bouts"] as CareerPlaceTabId[]).map((tab) => {
          const LABELS: Record<CareerPlaceTabId, { main: string; sub: string }> = {
            nearby: { main: "近傍番付", sub: "周辺の顔ぶれ" },
            full: { main: "全番付", sub: "同階級の全員" },
            bouts: { main: "全取組", sub: "十五日間" },
          };
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={placeTab === tab}
              className={clsx("place-tab", placeTab === tab && "active")}
              onClick={() => onPlaceTabChange(tab)}
            >
              <span className="place-tab-main">{LABELS[tab].main}</span>
              <span className="place-tab-sub">{LABELS[tab].sub}</span>
            </button>
          );
        })}
      </div>

      {/* Content panel */}
      {placeTab === "nearby" || placeTab === "full" ? (
        <div className="place-content-panel">
          {isLoading ? (
            <div className="career-archive-empty">読込中</div>
          ) : (placeTab === "nearby" ? nearbyRows : fullRows).length > 0 ? (
            <div className="career-archive-scroll">
              <table className="place-banzuke-table">
                <thead>
                  <tr>
                    <th>四股名</th>
                    <th>番付</th>
                    <th>成績</th>
                  </tr>
                </thead>
                <tbody>
                  {(placeTab === "nearby" ? nearbyRows : fullRows).map((row) => {
                    const isPlayer = row.entityType === "PLAYER";
                    const resultMark = row.wins > row.losses
                      ? RESULT_MARK.WIN
                      : row.losses > row.wins
                        ? RESULT_MARK.LOSS
                        : RESULT_MARK.ABSENT;
                    return (
                      <tr key={`${row.entityType}-${row.entityId}`} className={isPlayer ? "place-banzuke-player" : ""}>
                        <td>
                          <span className="place-banzuke-result-dot" style={resultMark.style}>{resultMark.symbol}</span>
                          {row.entityType === "NPC" ? (
                            <button type="button" className="table-link-button" onClick={() => onSelectNpc(row.entityId)}>
                              {row.shikona}
                            </button>
                          ) : (
                            <span className="font-medium">{row.shikona}</span>
                          )}
                        </td>
                        <td>
                          {formatRankDisplayName({
                            division: row.division as Division,
                            name: row.rankName,
                            number: row.rankNumber ?? undefined,
                            side: row.rankSide ?? undefined,
                          })}
                        </td>
                        <td className="text-right tabular-nums">
                          <span style={{ color: "var(--chart-win)" }}>{row.wins}勝</span>
                          <span style={{ color: "var(--chart-loss)" }}>{row.losses}敗</span>
                          {row.absent > 0 && <span style={{ color: "var(--chart-absent)" }}>{row.absent}休</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="career-archive-empty">{hasPersistence ? "該当データなし" : "保存後に利用可能"}</div>
          )}
        </div>
      ) : (
        /* 取組一覧 — 取組帳スタイル */
        <div className="place-content-panel">
          {isLoading ? (
            <div className="career-archive-empty">読込中</div>
          ) : detail?.bouts?.length ? (
            <div className="place-bout-list">
              {detail.bouts.map((bout) => {
                const result = bout.result as BoutResult;
                const mark = RESULT_MARK[result] ?? RESULT_MARK.ABSENT;
                const importantNote = importantDayMap.get(bout.day);
                return (
                  <div
                    key={`${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? bout.result}`}
                    className={clsx(
                      "place-bout-row",
                      importantNote && "important",
                      result === "ABSENT" && "absent",
                    )}
                  >
                    <span className="place-bout-day">{bout.day}<span className="place-bout-day-unit">日</span></span>
                    <span className="place-bout-mark" style={mark.style}>{mark.symbol}</span>
                    <div className="place-bout-body">
                      <div className="place-bout-opponent">
                        {bout.opponentId ? (
                          <button type="button" className="table-link-button" onClick={() => onSelectNpc(bout.opponentId ?? null)}>
                            {bout.opponentShikona ?? (result === "ABSENT" ? "休場" : "記録未詳")}
                          </button>
                        ) : (
                          <span>{bout.opponentShikona ?? (result === "ABSENT" ? "休場で取組なし" : "記録未詳")}</span>
                        )}
                        {bout.opponentRankName && point && (
                          <span className="place-bout-rank">
                            {formatRankDisplayName({
                              division: point.rank.division,
                              name: bout.opponentRankName,
                              number: bout.opponentRankNumber ?? undefined,
                              side: bout.opponentRankSide ?? undefined,
                            })}
                          </span>
                        )}
                      </div>
                      {bout.kimarite && (
                        <span className="place-bout-kimarite">{bout.kimarite}</span>
                      )}
                      {importantNote && (
                        <p className="place-bout-note">{importantNote.summary}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="career-archive-empty">{hasPersistence ? "取組データなし" : "保存後に利用可能"}</div>
          )}
        </div>
      )}
    </section>
  );
};
