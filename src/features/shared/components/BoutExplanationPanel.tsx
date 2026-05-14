import React from "react";
import type { Rank } from "../../../logic/models";
import type { PlayerBoutDetail } from "../../../logic/simulation/basho";
import type { BoutFlowCommentary } from "../../../logic/simulation/combat/boutFlowCommentary";
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

const materialTextBySegment = (
  commentary: BoutFlowCommentary,
  segmentKind: "HOSHITORI" | "BANZUKE",
): string | null =>
  commentary.materials.find((material) => material.segmentKind === segmentKind)?.text ?? null;

const factorText = (commentary: BoutFlowCommentary): string | null =>
  commentary.flowExplanation[2] ?? null;

export const BoutExplanationPanel: React.FC<BoutExplanationPanelProps> = ({
  preview,
}) => {
  const hoshitoriText = materialTextBySegment(preview.commentary, "HOSHITORI");
  const banzukeText = materialTextBySegment(preview.commentary, "BANZUKE");
  const outcomeLabel = preview.commentary.outcome === "WIN" ? "勝因" : "敗因";
  const mainFlow = preview.commentary.flowExplanation.slice(0, 2);
  const resultFactorText = factorText(preview.commentary);

  return (
    <section className={styles.panel} aria-label={`${preview.day}日目の取組解説`}>
      <div className={styles.head}>
        <div className={styles.kicker}>取組解説</div>
        <div className={styles.day}>{preview.day}日目</div>
      </div>

      <section className={styles.summaryBlock} aria-label="短評">
        <div className={styles.sectionTitle}>短評</div>
        <p className={styles.shortCommentary}>{preview.commentary.shortCommentary}</p>
      </section>

      <div className={styles.detailGrid}>
        <section className={styles.readingBlock}>
          <div className={styles.sectionTitle}>勝負の流れ</div>
          {mainFlow.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </section>

        <section className={styles.readingBlock}>
          <div className={styles.sectionTitle}>{outcomeLabel}</div>
          {resultFactorText ? <p>{resultFactorText}</p> : null}
          {preview.commentary.victoryFactorLabels.length > 0 ? (
            <div className={styles.factorList} aria-label={outcomeLabel}>
              {preview.commentary.victoryFactorLabels.slice(0, 4).map((label) => (
                <span key={label} className={styles.factor}>{label}</span>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.readingBlock}>
          <div className={styles.sectionTitle}>場所内の意味</div>
          <div className={styles.contextGrid}>
            {hoshitoriText ? (
              <p>
                <strong>星取</strong>
                {hoshitoriText}
              </p>
            ) : null}
            {banzukeText ? (
              <p>
                <strong>番付</strong>
                {banzukeText}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
};

export const BoutExplanationPreviewPanel = BoutExplanationPanel;
