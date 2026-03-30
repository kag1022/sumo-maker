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
  const theaterTone =
    view?.chapterKind === "RETIREMENT" || view?.chapterKind === "EPILOGUE"
      ? "ending"
      : view?.chapterKind === "SANYAKU" || view?.chapterKind === "SEKITORI" || view?.chapterKind === "DEBUT" || view?.chapterKind === "TITLE_RACE"
        ? "rise"
        : "still";

  if (!view) {
    return (
      <section className="basho-theater-shell">
        <div className="basho-theater-card" data-tone="still">
          <div className="basho-theater-kicker">節目を見る</div>
          <h2 className="basho-theater-title">次の節目を待っています</h2>
          <p className="basho-theater-summary">
            まだ止めるべき場面は来ていません。相撲人生の流れを裏で進めています。
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="basho-theater-shell">
      <article className="basho-theater-card" data-tone={theaterTone}>
        <div className="basho-theater-meta">
          <div className="basho-theater-kicker">節目を見る</div>
          <div className="basho-theater-metaband">
            <span>{view.year}年{view.month}月場所</span>
            <span>{view.currentRank}</span>
            <span>{view.currentAge ? `${view.currentAge}歳` : "年齢不詳"}</span>
            <span>{view.currentRecord}</span>
          </div>
        </div>

        <div className="basho-theater-body">
          <header className="basho-theater-headline">
            <h2 className="basho-theater-title">{view.chapterTitle}</h2>
            <p className="basho-theater-summary">{view.chapterReason}</p>
          </header>

          <section className="basho-theater-feature">
            <div className="basho-theater-sectionlabel">
              {view.featuredBout?.kindLabel ?? "代表的な一番または転機"}
            </div>
            <div className="basho-theater-highlight">
              {view.featuredBout?.matchup ?? `${view.currentRank} / ${view.currentRecord}`}
            </div>
            <p className="basho-theater-featurecopy">{view.featuredBout?.summary ?? view.heroMoment}</p>
          </section>

          <div className="basho-theater-nextbeat">
            <span className="basho-theater-sectionlabel">次にすること</span>
            <strong>{view.nextBeatLabel}</strong>
          </div>

          <details className="basho-theater-disclosure">
            <summary>補足を見る</summary>
            <div className="basho-theater-disclosure-grid">
              {view.raceSummary.slice(0, 3).map((item) => (
                <div key={item.id} className="basho-theater-disclosure-item">
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          </details>
        </div>

        {(primaryActionLabel || secondaryActionLabel) ? (
          <div className="basho-theater-cta">
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
      </article>
    </section>
  );
};
