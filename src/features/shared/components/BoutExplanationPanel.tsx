import React from "react";
import type { Rank } from "../../../logic/models";
import type { PlayerBoutDetail } from "../../../logic/simulation/basho";
import type { BoutFlowCommentary } from "../../../logic/simulation/combat/boutFlowCommentary";
import { useLocale } from "../../../shared/hooks/useLocale";
import styles from "./BoutExplanationPanel.module.css";

export interface PlayerBoutExplanationPreview {
  readonly bashoSeq: number;
  readonly day: number;
  readonly commentary: BoutFlowCommentary;
}

interface BoutExplanationPanelProps {
  readonly preview: PlayerBoutExplanationPreview;
  readonly bout: PlayerBoutDetail;
  readonly playerShikona: string;
  readonly playerRank: Rank;
}

const factorText = (commentary: BoutFlowCommentary): string | null =>
  commentary.flowExplanation[2] ?? null;

const displayFactorLabels = (commentary: BoutFlowCommentary): string[] => {
  const labels = commentary.victoryFactorLabels.map((label) =>
    label === "番付上の地力" ? "地力差" : label,
  );
  return [...new Set(labels)].slice(0, 3);
};

const hasJapaneseText = (value: string | null | undefined): boolean =>
  Boolean(value && /[ぁ-んァ-ン一-龥]/.test(value));

const textForLocale = (
  locale: "ja" | "en",
  value: string | null | undefined,
  englishFallback: string,
): string => {
  if (locale !== "en") return value ?? englishFallback;
  if (!value || hasJapaneseText(value)) return englishFallback;
  return value;
};

export const BoutExplanationPanel: React.FC<BoutExplanationPanelProps> = ({
  preview,
}) => {
  const { locale } = useLocale();
  const outcomeLabel = preview.commentary.outcome === "WIN"
    ? locale === "en" ? "Winning Factor" : "勝因"
    : locale === "en" ? "Losing Factor" : "敗因";
  const mainFlow = preview.commentary.flowExplanation.slice(0, 2).filter(Boolean);
  const resultFactorText = factorText(preview.commentary);
  const factorLabels = locale === "en" ? [] : displayFactorLabels(preview.commentary);

  return (
    <section className={styles.panel} aria-label={locale === "en" ? `Day ${preview.day} bout commentary` : `${preview.day}日目の取組解説`}>
      <div className={styles.head}>
        <div className={styles.kicker}>{locale === "en" ? "Bout Commentary" : "取組解説"}</div>
        <div className={styles.day}>{locale === "en" ? `Day ${preview.day}` : `${preview.day}日目`}</div>
      </div>

      <section className={styles.summaryBlock} aria-label={locale === "en" ? "Short note" : "短評"}>
        <div className={styles.sectionTitle}>{locale === "en" ? "Short Note" : "短評"}</div>
        <p className={styles.shortCommentary}>
          {textForLocale(locale, preview.commentary.shortCommentary, "A saved bout commentary is attached to this match.")}
        </p>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.readingBlock}>
          <div className={styles.sectionTitle}>{locale === "en" ? "Bout Flow" : "勝負の流れ"}</div>
          <div className={styles.flowList}>
            {(locale === "en" ? ["The saved record marks this bout as one worth reading in detail."] : mainFlow).map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>

        <section className={styles.readingBlock}>
          <div className={styles.sectionTitle}>{outcomeLabel}</div>
          {resultFactorText ? <p>{textForLocale(locale, resultFactorText, "The result was shaped by the bout context saved for this day.")}</p> : null}
          {factorLabels.length > 0 ? (
            <div className={styles.factorList} aria-label={outcomeLabel}>
              {factorLabels.map((label) => (
                <span key={label} className={styles.factor}>{label}</span>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
};

export const BoutExplanationPreviewPanel = BoutExplanationPanel;
