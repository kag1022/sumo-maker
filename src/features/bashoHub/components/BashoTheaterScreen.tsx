import React from "react";
import type { LiveBashoViewModel } from "../../../logic/simulation/workerProtocol";
import { Button } from "../../../shared/ui/Button";

interface BashoTheaterScreenProps {
  view: LiveBashoViewModel | null;
  primaryActionLabel?: string | null;
  secondaryActionLabel?: string | null;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
}

export const BashoTheaterScreen: React.FC<BashoTheaterScreenProps> = ({
  view,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
}) => {
  if (!view) {
    return (
      <section className="chapter-stage-shell">
        <div className="chapter-stage-card chapter-stage-card-compact">
          <div className="chapter-stage-kicker">節目を見る</div>
          <h2 className="chapter-stage-title">次の節目を待っています</h2>
          <p className="chapter-stage-reason">
            まだ止めるべき場面は来ていません。相撲人生の流れを裏で進めています。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="chapter-stage-shell">
      <div className="chapter-stage-card chapter-stage-card-linear">
        <div className="chapter-stage-head">
          <div>
            <div className="chapter-stage-kicker">節目を見る</div>
            <h2 className="chapter-stage-title">{view.chapterTitle}</h2>
          </div>
          <div className="chapter-stage-meta">
            <span>{view.year}年{view.month}月場所</span>
            <span>{view.currentRank}</span>
            <span>{view.currentAge ? `${view.currentAge}歳` : "年齢不詳"}</span>
            <span>{view.currentRecord}</span>
          </div>
        </div>

        <div className="chapter-stage-flow">
          <section className="chapter-stage-panel">
            <div className="chapter-stage-label">今読む場面</div>
            <p className="chapter-stage-reason">{view.chapterReason}</p>
          </section>

          <section className="chapter-stage-panel">
            <div className="chapter-stage-label">主役場面</div>
            <h3>{view.featuredBout?.kindLabel ?? "代表的な一番または転機"}</h3>
            <div className="chapter-stage-highlight">
              {view.featuredBout?.matchup ?? `${view.currentRank} / ${view.currentRecord}`}
            </div>
            <p className="chapter-stage-panel-copy">{view.featuredBout?.summary ?? view.heroMoment}</p>
          </section>

          <section className="chapter-stage-panel">
            <div className="chapter-stage-label">次にすること</div>
            <strong className="chapter-stage-next-copy">{view.nextBeatLabel}</strong>
          </section>

          <details className="chapter-stage-disclosure">
            <summary>補足を見る</summary>
            <div className="chapter-stage-summary">
              {view.raceSummary.slice(0, 3).map((item) => (
                <div key={item.id} className="chapter-stage-summary-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </details>
        </div>

        {(primaryActionLabel || secondaryActionLabel) ? (
          <div className="chapter-stage-cta">
            {primaryActionLabel && onPrimaryAction ? (
              <Button size="lg" onClick={onPrimaryAction}>
                {primaryActionLabel}
              </Button>
            ) : null}
            {secondaryActionLabel && onSecondaryAction ? (
              <Button variant="ghost" size="sm" onClick={onSecondaryAction}>
                {secondaryActionLabel}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
};
