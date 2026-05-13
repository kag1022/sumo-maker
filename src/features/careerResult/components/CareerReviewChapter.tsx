import React from "react";
import type { BanzukeReviewTabModel } from "../../shared/models/banzukeReview";
import table from "../../../shared/styles/table.module.css";
import styles from "./CareerReviewChapter.module.css";

interface CareerReviewChapterProps {
  model: BanzukeReviewTabModel | null;
  isLoading: boolean;
  emptyLabel: string;
  onSelectNpc: (entityId: string | null) => void;
}

export const CareerReviewChapter: React.FC<CareerReviewChapterProps> = ({
  model,
  isLoading,
  emptyLabel,
  onSelectNpc,
}) => {
  if (isLoading) {
    return (
      <section className={styles.shell}>
        <div className={styles.empty}>番付審議を読み込み中です。</div>
      </section>
    );
  }

  if (!model) {
    return (
      <section className={styles.shell}>
        <div className={styles.empty}>{emptyLabel}</div>
      </section>
    );
  }

  return (
    <section className={styles.shell}>
      <div className={styles.head}>
        <div className={styles.kicker}>審議録</div>
        <h2 className={styles.title}>{model.bashoLabel}</h2>
      </div>

      <div className={styles.summary}>
        <div className={styles.summaryKicker}>争点サマリー</div>
        <div className={styles.summaryLines}>
          {model.summaryLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>

      <div className={styles.lane}>
        <article className={styles.laneCell}>
          <span className={styles.laneLabel}>旧番付</span>
          <strong>{model.lane.fromRankLabel}</strong>
        </article>
        <article className={styles.laneBand} data-basis={model.lane.proposalBasis}>
          <span className={styles.laneLabel}>実測帯</span>
          <strong>{model.lane.empiricalBandLabel}</strong>
        </article>
        <article className={styles.laneCell}>
          <span className={styles.laneLabel}>新番付</span>
          <strong>{model.lane.toRankLabel}</strong>
        </article>
      </div>

      <div className={styles.ledger}>
        <div className={styles.blockTitle}>重要判断ログ</div>
        <div className={styles.logList}>
          {model.decisionItems.map((item) => (
            <article key={item.id} className={styles.logItem} data-tone={item.tone}>
              <div className={styles.logTitle}>{item.title}</div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </div>

      <div className={styles.appendix}>
        <section className={styles.appendixBlock}>
          <div className={styles.blockTitle}>近傍番付</div>
          <div className={styles.tableWrap}>
            <table className={table.detailTable}>
              <thead>
                <tr>
                  <th>四股名</th>
                  <th>現番付</th>
                  <th>成績</th>
                  <th>昇降幅</th>
                </tr>
              </thead>
              <tbody>
                {model.nearbyRows.map((row) => (
                  <tr key={row.entityId} className={row.isPlayer ? table.playerRow : undefined} data-player={row.isPlayer}>
                    <td className={table.playerNameCell} data-player={row.isPlayer}>
                      {!row.isPlayer ? (
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

        <section className={styles.appendixBlock}>
          <div className={styles.blockTitle}>補助取組</div>
          <div className={styles.supplements}>
            {model.supplementalTorikumi.length > 0 ? (
              model.supplementalTorikumi.map((item) => (
                <article key={item.id} className={styles.supplement}>
                  <div className={styles.supplementTitle}>{item.label}</div>
                  <p>{item.detail}</p>
                </article>
              ))
            ) : (
              <div className={`${styles.supplement} ${styles.supplementEmpty}`}>
                補助取組は記録されていません。
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
};
