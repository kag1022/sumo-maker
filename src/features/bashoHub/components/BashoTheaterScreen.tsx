import React from "react";
import type { LiveBashoViewModel } from "../../../logic/simulation/workerProtocol";

interface BashoTheaterScreenProps {
  view: LiveBashoViewModel | null;
}

export const BashoTheaterScreen: React.FC<BashoTheaterScreenProps> = ({ view }) => {
  if (!view) {
    return (
      <div className="report-empty">
        まだ場所中枢に出せる観測結果がありません。`observe` で進行するとここに主役の一番が出ます。
      </div>
    );
  }

  return (
    <div className="basho-theater">
      <section className="basho-theater-stage">
        <aside className="basho-theater-rail">
          <div className="basho-theater-kicker">場所文脈レール</div>
          <div className="basho-theater-basho">{view.year}年{view.month}月場所</div>
          <div className="basho-theater-rank">{view.currentRank}</div>
          <div className="basho-theater-record">{view.currentRecord}</div>
          <div className="basho-theater-summary-list">
            {view.raceSummary.map((item) => (
              <div key={item.id} className="basho-theater-summary-item" data-tone={item.tone}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
        </aside>

        <div className="basho-theater-feature" data-tone={view.featuredBout?.tone ?? "normal"}>
          <div className="basho-theater-kicker">今日の一番</div>
          <div className="basho-theater-feature-label">{view.featuredBout?.kindLabel ?? "本日の割"}</div>
          <h2>{view.featuredBout?.matchup ?? "割出前"}</h2>
          <p>{view.featuredBout?.summary ?? "この場所の主役取組を待っています。"}</p>
          <div className="basho-theater-feature-meta">
            <span>{view.featuredBout?.day ? `${view.featuredBout.day}日目` : "場所総括"}</span>
            <span>{view.featuredBout?.phaseLabel ?? "本割"}</span>
          </div>
        </div>

        <aside className="basho-theater-slate">
          <div className="basho-theater-kicker">本日の割</div>
          <div className="basho-theater-slate-list">
            {view.torikumiSlate.length > 0 ? (
              view.torikumiSlate.map((item) => (
                <article key={item.id} className="basho-theater-slate-item" data-tone={item.tone}>
                  <div className="basho-theater-slate-head">
                    <span>{item.day}日目</span>
                    <span>{item.kindLabel}</span>
                  </div>
                  <strong>{item.matchup}</strong>
                  <p>{item.summary}</p>
                </article>
              ))
            ) : (
              <div className="report-empty">重要取組が立っていない場所です。</div>
            )}
          </div>
        </aside>
      </section>

      <section className="basho-theater-footer">
        <div className="basho-theater-footer-block">
          <div className="basho-theater-kicker">星取と進行帯</div>
          <div className="basho-theater-footer-value">{view.currentRecord}</div>
          <div className="basho-theater-footer-note">
            {view.day ? `${view.day}日目時点の主役取組` : "場所を通した主役取組"}
          </div>
        </div>
        <div className="basho-theater-footer-block">
          <div className="basho-theater-kicker">編成監査</div>
          <div className="basho-theater-footer-value">
            修復 {view.latestDiagnosticsSummary.repairCount} / 違反 {view.latestDiagnosticsSummary.scheduleViolations}
          </div>
          <div className="basho-theater-footer-note">
            越境 {view.latestDiagnosticsSummary.crossDivisionBoutCount} / 直接戦 {view.latestDiagnosticsSummary.lateDirectTitleBoutCount}
          </div>
        </div>
        <div className="basho-theater-footer-block">
          <div className="basho-theater-kicker">次の主役日</div>
          <div className="basho-theater-footer-value">
            {view.plannedNextPlayerDay ? `${view.plannedNextPlayerDay}日目予定` : "次場所待ち"}
          </div>
          <div className="basho-theater-footer-note">{view.phaseId}</div>
        </div>
      </section>
    </div>
  );
};
