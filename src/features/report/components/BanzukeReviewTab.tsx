import React from "react";
import reportCommon from "./reportCommon.module.css";
import table from "../../../shared/styles/table.module.css";
import styles from "./BanzukeReviewTab.module.css";
import type { BanzukeReviewTabModel } from "../../shared/models/banzukeReview";
import { useLocale } from "../../../shared/hooks/useLocale";

interface BanzukeReviewTabProps {
  model: BanzukeReviewTabModel | null;
  isLoading?: boolean;
  emptyLabel?: string;
  onSelectNpc?: (entityId: string | null) => void;
}

export const BanzukeReviewTab: React.FC<BanzukeReviewTabProps> = ({
  model,
  isLoading = false,
  emptyLabel = "この場所の審議記録はまだありません。",
  onSelectNpc,
}) => {
  const { locale } = useLocale();

  if (isLoading) {
    return <div className={reportCommon.empty}>{locale === "en" ? "Loading banzuke review." : "番付審議を読み込み中です。"}</div>;
  }

  if (!model) {
    return <div className={reportCommon.empty}>{emptyLabel}</div>;
  }

  return (
    <div className={styles.layout}>
      <section className={styles.lane}>
        <div className={styles.kicker}>{locale === "en" ? "Banzuke Review" : "番付審議"}</div>
        <div className={styles.headline}>{model.bashoLabel}</div>
        <div className={styles.laneStrip}>
          <div className={styles.laneNode}>
            <span className={styles.laneLabel}>{locale === "en" ? "Previous Rank" : "旧番付"}</span>
            <strong>{model.lane.fromRankLabel}</strong>
          </div>
          <div className={styles.laneBand} data-basis={model.lane.proposalBasis}>
            <span className={styles.laneLabel}>{locale === "en" ? "Empirical Band" : "実測帯"}</span>
            <strong>{model.lane.empiricalBandLabel}</strong>
          </div>
          <div className={styles.laneNode}>
            <span className={styles.laneLabel}>{locale === "en" ? "Next Rank" : "新番付"}</span>
            <strong>{model.lane.toRankLabel}</strong>
          </div>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={table.flatTitle}>{locale === "en" ? "Review Notes" : "審議要点"}</div>
        <div className={styles.summary}>
          {model.summaryLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>

      <section className={styles.panel}>
        <div className={table.flatTitle}>{locale === "en" ? "Nearby Banzuke" : "近傍番付"}</div>
        <div className={table.scroll}>
          <table className={table.detailTable}>
            <thead>
              <tr>
                <th>{locale === "en" ? "Shikona" : "四股名"}</th>
                <th>{locale === "en" ? "Rank" : "現番付"}</th>
                <th>{locale === "en" ? "Record" : "成績"}</th>
                <th>{locale === "en" ? "Movement" : "昇降幅"}</th>
              </tr>
            </thead>
            <tbody>
              {model.nearbyRows.map((row) => (
                <tr key={row.entityId} className={row.isPlayer ? table.playerRow : undefined} data-player={row.isPlayer}>
                  <td>
                    {!row.isPlayer && onSelectNpc ? (
                      <button type="button" className={table.linkButton} onClick={() => onSelectNpc(row.entityId)}>
                        {row.shikona}
                      </button>
                    ) : (
                      row.shikona
                    )}
                  </td>
                  <td>{row.rankLabel}</td>
                  <td>{row.recordText}</td>
                  <td>{row.movementText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel}>
        <div className={table.flatTitle}>{locale === "en" ? "Important Decision Log" : "重要判断ログ"}</div>
        <div className={styles.logList}>
          {model.decisionItems.map((item) => (
            <article key={item.id} className={styles.logItem} data-tone={item.tone}>
              <div className={styles.logTitle}>{item.title}</div>
              <p>{item.detail}</p>
            </article>
          ))}
          {model.supplementalTorikumi.map((item) => (
            <article key={item.id} className={styles.logItem} data-tone="info">
              <div className={styles.logTitle}>{locale === "en" ? "Supplemental Bout" : "補助取組"}</div>
              <p>{item.label}</p>
              <p className={styles.logSub}>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
