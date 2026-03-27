import React from "react";
import type { BanzukeReviewTabModel } from "../utils/banzukeReview";

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
  if (isLoading) {
    return <div className="report-empty">番付審議を読み込み中です。</div>;
  }

  if (!model) {
    return <div className="report-empty">{emptyLabel}</div>;
  }

  return (
    <div className="banzuke-review-layout">
      <section className="banzuke-review-lane">
        <div className="banzuke-review-kicker">番付審議</div>
        <div className="banzuke-review-headline">{model.bashoLabel}</div>
        <div className="banzuke-review-lane-strip">
          <div className="banzuke-review-lane-node">
            <span className="banzuke-review-lane-label">旧番付</span>
            <strong>{model.lane.fromRankLabel}</strong>
          </div>
          <div className="banzuke-review-lane-band" data-basis={model.lane.proposalBasis}>
            <span className="banzuke-review-lane-label">実測帯</span>
            <strong>{model.lane.empiricalBandLabel}</strong>
          </div>
          <div className="banzuke-review-lane-node">
            <span className="banzuke-review-lane-label">新番付</span>
            <strong>{model.lane.toRankLabel}</strong>
          </div>
        </div>
      </section>

      <section className="banzuke-review-panel">
        <div className="flat-panel-title">審議要点</div>
        <div className="banzuke-review-summary">
          {model.summaryLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </section>

      <section className="banzuke-review-panel">
        <div className="flat-panel-title">近傍番付</div>
        <div className="detail-table-scroll">
          <table className="detail-table">
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
                <tr key={row.entityId} data-player={row.isPlayer}>
                  <td>
                    {!row.isPlayer && onSelectNpc ? (
                      <button type="button" className="table-link-button" onClick={() => onSelectNpc(row.entityId)}>
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

      <section className="banzuke-review-panel">
        <div className="flat-panel-title">重要判断ログ</div>
        <div className="banzuke-review-log-list">
          {model.decisionItems.map((item) => (
            <article key={item.id} className="banzuke-review-log-item" data-tone={item.tone}>
              <div className="banzuke-review-log-title">{item.title}</div>
              <p>{item.detail}</p>
            </article>
          ))}
          {model.supplementalTorikumi.map((item) => (
            <article key={item.id} className="banzuke-review-log-item" data-tone="info">
              <div className="banzuke-review-log-title">補助取組</div>
              <p>{item.label}</p>
              <p className="banzuke-review-log-sub">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
