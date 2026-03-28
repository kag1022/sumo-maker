import React from "react";
import { type Division } from "../../../logic/models";
import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import { formatRankDisplayName } from "../../report/utils/reportShared";
import type {
  CareerLedgerPoint,
  CareerPlaceSummaryModel,
  CareerPlaceTabId,
} from "../utils/careerResultModel";
import { groupNearbyRanks } from "../utils/careerResultModel";

interface CareerPlaceChapterProps {
  point: CareerLedgerPoint | null;
  detail: CareerBashoDetail | null;
  summary: CareerPlaceSummaryModel | null;
  placeTab: CareerPlaceTabId;
  isLoading: boolean;
  hasPersistence: boolean;
  onSelectNpc: (entityId: string | null) => void;
  onPlaceTabChange: (tab: CareerPlaceTabId) => void;
}

export const CareerPlaceChapter: React.FC<CareerPlaceChapterProps> = ({
  point,
  detail,
  summary,
  placeTab,
  isLoading,
  hasPersistence,
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

  return (
    <section className="career-archive-shell">
      <div className="career-archive-head">
        <div className="career-archive-kicker">場所別</div>
        <h2 className="career-archive-title">{summary?.bashoLabel ?? point?.bashoLabel ?? "場所詳細"}</h2>
      </div>

      <div className="career-archive-summaryband">
        <div className="career-archive-summaryrow">
          <span>{summary?.bashoLabel ?? "-"}</span>
          <span>{summary?.rankLabel ?? "-"}</span>
          <span>{summary?.recordLabel ?? "-"}</span>
          <span>{summary?.deltaLabel ?? "-"}</span>
        </div>
        <div className="career-archive-tagrow">
          {(summary?.milestoneTags.length ? summary.milestoneTags : ["節目記録なし"]).map((tag) => (
            <span key={tag} className="career-archive-tag">
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
                            {bout.opponentShikona ?? "対戦相手なし"}
                          </button>
                        ) : (
                          bout.opponentShikona ?? "対戦相手なし"
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
