import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type Division } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { formatRankDisplayName } from "../../report/utils/reportShared";
import type {
  CareerLedgerModel,
  CareerLedgerPoint,
  CareerPlaceSummaryModel,
  CareerPlaceTabId,
} from "../utils/careerResultModel";
import { groupNearbyRanks } from "../utils/careerResultModel";

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
  const groupedRows = React.useMemo(() => {
    if (!detail?.rows?.length || !detail.playerRecord) return [];
    return groupNearbyRanks(detail.rows, detail.playerRecord, 3);
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

  return (
    <section className="career-archive-shell">
      <div className="career-archive-head">
        <div className="career-archive-kicker">場所別</div>
        <h2 className="career-archive-title">{summary?.bashoLabel ?? point?.bashoLabel ?? "場所詳細"}</h2>
      </div>

      <div className="career-place-selector">
        <div className="career-place-selector-head">
          <div>
            <div className="career-place-selector-kicker">場所選択</div>
            <div className="career-place-selector-copy">この章の中で前後の場所を切り替えられます。</div>
          </div>
          <div className="career-place-selector-actions">
            <button
              type="button"
              className="career-place-stepper"
              onClick={() => previousPoint && onSelectBasho(previousPoint.bashoSeq)}
              disabled={!previousPoint}
            >
              <ChevronLeft className="h-4 w-4" />
              前の場所
            </button>
            <button
              type="button"
              className="career-place-stepper"
              onClick={() => nextPoint && onSelectBasho(nextPoint.bashoSeq)}
              disabled={!nextPoint}
            >
              次の場所
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="career-place-selector-track" role="list" aria-label="場所一覧">
          {nearbyPoints.map((entry) => (
            <button
              key={entry.bashoSeq}
              type="button"
              role="listitem"
              className="career-place-selector-chip"
              data-selected={entry.bashoSeq === point?.bashoSeq}
              data-event={entry.milestoneTags.length > 0 || entry.eventFlags.length > 0}
              onClick={() => onSelectBasho(entry.bashoSeq)}
            >
              <span className="career-place-selector-chiplabel">{entry.bashoLabel}</span>
              <strong className="career-place-selector-chiprank">{entry.rankShortLabel}</strong>
              <span className="career-place-selector-chiprecord">{entry.recordCompactLabel}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="career-place-overview">
        <div className="career-place-summaryboard" role="list" aria-label="場所の要約">
          <article className="career-place-metric" role="listitem">
            <span className="career-place-metric-label">場所</span>
            <strong className="career-place-metric-value">{summary?.bashoLabel ?? "-"}</strong>
          </article>
          <article className="career-place-metric" role="listitem">
            <span className="career-place-metric-label">番付</span>
            <strong className="career-place-metric-value">{summary?.rankLabel ?? "-"}</strong>
          </article>
          <article className="career-place-metric" role="listitem">
            <span className="career-place-metric-label">成績</span>
            <strong className="career-place-metric-value">{summary?.recordLabel ?? "-"}</strong>
          </article>
          <article className="career-place-metric" role="listitem">
            <span className="career-place-metric-label">昇降幅</span>
            <strong className="career-place-metric-value">{summary?.deltaLabel ?? "-"}</strong>
          </article>
        </div>
        <div className="career-place-notechips">
          {(summary?.milestoneTags.length ? summary.milestoneTags : ["節目記録なし"]).map((tag) => (
            <span key={tag} className="career-place-notechip">
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="career-archive-switch" role="tablist" aria-label="場所別切替">
        <button
          type="button"
          className="career-archive-switchbutton"
          data-active={placeTab === "banzuke"}
          onClick={() => onPlaceTabChange("banzuke")}
        >
          <span className="career-archive-switchlabel">上下番付</span>
          <span className="career-archive-switchmeta">近傍の顔ぶれを見る</span>
        </button>
        <button
          type="button"
          className="career-archive-switchbutton"
          data-active={placeTab === "bouts"}
          onClick={() => onPlaceTabChange("bouts")}
        >
          <span className="career-archive-switchlabel">全取組</span>
          <span className="career-archive-switchmeta">十五日間の対戦を辿る</span>
        </button>
      </div>

      {placeTab === "banzuke" ? (
        <div className="career-archive-sheet">
          {isLoading ? (
            <div className="career-archive-empty">読込中</div>
          ) : groupedRows.length > 0 ? (
            <div className="career-archive-scroll">
              <table className="detail-table career-archive-table">
                <thead>
                  <tr>
                    <th>四股名</th>
                    <th>番付</th>
                    <th>成績</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedRows.map((row) => (
                    <tr key={`${row.entityType}-${row.entityId}`} data-player={row.entityType === "PLAYER"}>
                      <td className="table-rikishi-name" data-player={row.entityType === "PLAYER"}>
                        {row.entityType === "NPC" ? (
                          <button type="button" className="table-link-button" onClick={() => onSelectNpc(row.entityId)}>
                            {row.shikona}
                          </button>
                        ) : (
                          row.shikona
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
                      <td>
                        {row.wins}勝{row.losses}敗{row.absent > 0 ? `${row.absent}休` : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="career-archive-empty">{hasPersistence ? "該当データなし" : "保存後に利用可能"}</div>
          )}
        </div>
      ) : (
        <div className="career-archive-sheet">
          {isLoading ? (
            <div className="career-archive-empty">読込中</div>
          ) : detail?.bouts?.length ? (
            <div className="career-archive-bouts">
              {detail.bouts.map((bout) => {
                const importantNote = importantDayMap.get(bout.day);
                return (
                  <div
                    key={`${bout.day}-${bout.opponentId ?? bout.opponentShikona ?? bout.result}`}
                    className="career-archive-bout"
                    data-important={Boolean(importantNote)}
                    data-absence={bout.result === "ABSENT"}
                  >
                    <div className="career-archive-boutday">{bout.day}日目</div>
                    <div className="career-archive-boutbody">
                      <div className="career-archive-boutopponent">
                        {bout.opponentId ? (
                          <button type="button" className="table-link-button" onClick={() => onSelectNpc(bout.opponentId ?? null)}>
                            {bout.opponentShikona ?? (bout.result === "ABSENT" ? "休場で取組なし" : "記録未詳")}
                          </button>
                        ) : (
                          bout.opponentShikona ?? (bout.result === "ABSENT" ? "休場で取組なし" : "記録未詳")
                        )}
                        {bout.opponentRankName && point
                          ? ` / ${formatRankDisplayName({
                            division: point.rank.division,
                            name: bout.opponentRankName,
                            number: bout.opponentRankNumber ?? undefined,
                            side: bout.opponentRankSide ?? undefined,
                          })}`
                          : ""}
                      </div>
                      <div className="career-archive-boutresult">
                        {bout.result}
                        {bout.kimarite ? ` / ${bout.kimarite}` : ""}
                      </div>
                      {importantNote ? <div className="career-archive-boutnote">{importantNote.summary}</div> : null}
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
