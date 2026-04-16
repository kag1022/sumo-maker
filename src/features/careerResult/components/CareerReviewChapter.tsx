import React from "react";
import type { BanzukeReviewTabModel } from "../../report/utils/banzukeReview";

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
      <section className="career-clerk-shell">
        <div className="career-clerk-empty">番付審議を読み込み中です。</div>
      </section>
    );
  }

  if (!model) {
    return (
      <section className="career-clerk-shell">
        <div className="career-clerk-empty">{emptyLabel}</div>
      </section>
    );
  }

  return (
    <section className="career-clerk-shell">
      <div className="career-clerk-head">
        <div className="career-clerk-kicker">審議録</div>
        <h2 className="career-clerk-title">{model.bashoLabel}</h2>
      </div>

      <div className="career-clerk-summary">
        <div className="career-clerk-summary-kicker">争点サマリー</div>
        <div className="career-clerk-summary-lines">
          {model.summaryLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>

      <div className="career-clerk-lane">
        <article className="career-clerk-lanecell">
          <span className="career-clerk-lanelabel">旧番付</span>
          <strong>{model.lane.fromRankLabel}</strong>
        </article>
        <article className="career-clerk-laneband" data-basis={model.lane.proposalBasis}>
          <span className="career-clerk-lanelabel">実測帯</span>
          <strong>{model.lane.empiricalBandLabel}</strong>
        </article>
        <article className="career-clerk-lanecell">
          <span className="career-clerk-lanelabel">新番付</span>
          <strong>{model.lane.toRankLabel}</strong>
        </article>
      </div>

      <div className="career-clerk-ledger">
        <div className="career-clerk-blocktitle">重要判断ログ</div>
        <div className="career-clerk-loglist">
          {model.decisionItems.map((item) => (
            <article key={item.id} className="career-clerk-logitem" data-tone={item.tone}>
              <div className="career-clerk-logtitle">{item.title}</div>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </div>

      <div className="career-clerk-appendix">
        <section className="career-clerk-appendixblock">
          <div className="career-clerk-blocktitle">近傍番付</div>
          <div className="career-clerk-tablewrap">
            <table className="detail-table career-clerk-table">
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
                    <td className="table-rikishi-name" data-player={row.isPlayer}>
                      {!row.isPlayer ? (
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

        <section className="career-clerk-appendixblock">
          <div className="career-clerk-blocktitle">補助取組</div>
          <div className="career-clerk-supplements">
            {model.supplementalTorikumi.length > 0 ? (
              model.supplementalTorikumi.map((item) => (
                <article key={item.id} className="career-clerk-supplement">
                  <div className="career-clerk-supplementtitle">{item.label}</div>
                  <p>{item.detail}</p>
                </article>
              ))
            ) : (
              <div className="career-clerk-supplement career-clerk-supplement-empty">
                補助取組は記録されていません。
              </div>
            )}
          </div>
        </section>
      </div>
    </section>
  );
};
