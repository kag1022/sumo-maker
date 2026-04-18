import React from "react";
import { motion } from "framer-motion";
import type { LiveBashoViewModel } from "../../../logic/simulation/workerProtocol";
import { Button } from "../../../shared/ui/Button";
import { LiveHoshitoriGrid } from "./LiveHoshitoriGrid";

interface BashoTheaterScreenProps {
  view: LiveBashoViewModel | null;
  primaryActionLabel?: string | null;
  secondaryActionLabel?: string | null;
  onPrimaryAction?: () => void;
  onSecondaryAction?: () => void;
}

const parseRecord = (record: string): { wins: number; losses: number; absent: number } => {
  const winMatch = /(\d+)勝/.exec(record);
  const lossMatch = /(\d+)敗/.exec(record);
  const absentMatch = /(\d+)休/.exec(record);
  return {
    wins: winMatch ? parseInt(winMatch[1], 10) : 0,
    losses: lossMatch ? parseInt(lossMatch[1], 10) : 0,
    absent: absentMatch ? parseInt(absentMatch[1], 10) : 0,
  };
};

const getTone = (view: LiveBashoViewModel): "ending" | "rise" | "yusho" | "still" => {
  if (view.chapterKind === "RETIREMENT" || view.chapterKind === "EPILOGUE") return "ending";
  if (view.chapterKind === "TITLE_RACE" && view.titleImplication !== "NONE") return "yusho";
  if (
    view.chapterKind === "SANYAKU" ||
    view.chapterKind === "SEKITORI" ||
    view.chapterKind === "DEBUT"
  ) return "rise";
  return "still";
};

const TONE_ACCENT: Record<string, string> = {
  ending: "border-[var(--chart-sandanme)]/30",
  rise: "border-[var(--ui-action)]/25",
  yusho: "border-[var(--chart-makuuchi)]/35",
  still: "border-white/10",
};

const TONE_GLOW: Record<string, string> = {
  ending: "rgba(118,164,212,0.06)",
  rise: "rgba(132,167,255,0.07)",
  yusho: "rgba(196,154,77,0.1)",
  still: "transparent",
};

export const BashoTheaterScreen: React.FC<BashoTheaterScreenProps> = ({
  view,
  primaryActionLabel,
  secondaryActionLabel,
  onPrimaryAction,
  onSecondaryAction,
}) => {
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

  const tone = getTone(view);
  const parsedRecord = parseRecord(view.currentRecord);

  return (
    <section className="basho-theater-shell">
      <motion.article
        className={`basho-theater-card border ${TONE_ACCENT[tone]}`}
        style={{ backgroundColor: TONE_GLOW[tone] !== "transparent" ? undefined : undefined }}
        data-tone={tone}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        key={`${view.seq}-${view.day}`}
      >
        {tone === "yusho" ? (
          <div className="absolute inset-0 pointer-events-none rounded-none">
            <div
              className="absolute inset-0"
              style={{
                background: `radial-gradient(ellipse at 50% 0%, rgba(196,154,77,0.12) 0%, transparent 70%)`,
              }}
            />
          </div>
        ) : null}

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

          <div className="mt-4 border border-white/8 bg-white/[0.02] p-3">
            <LiveHoshitoriGrid
              day={view.day}
              wins={parsedRecord.wins}
              losses={parsedRecord.losses}
              absent={parsedRecord.absent}
            />
          </div>

          <div className="basho-theater-nextbeat">
            <span className="basho-theater-sectionlabel">次にすること</span>
            <strong>{view.nextBeatLabel}</strong>
          </div>

          {view.raceSummary.length > 0 ? (
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
          ) : null}
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
      </motion.article>
    </section>
  );
};
