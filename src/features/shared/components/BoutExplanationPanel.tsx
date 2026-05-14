import React from "react";
import type { Rank } from "../../../logic/models";
import { formatRankDisplayName } from "../../../logic/ranking";
import type { PlayerBoutDetail } from "../../../logic/simulation/basho";
import type { BoutFlowCommentary } from "../../../logic/simulation/combat/boutFlowCommentary";
import styles from "./BoutExplanationPanel.module.css";

export interface PlayerBoutExplanationPreview {
  readonly bashoSeq: number;
  readonly day: number;
  readonly commentary: BoutFlowCommentary;
}

interface ParticipantView {
  readonly shikona: string;
  readonly rankLabel: string;
  readonly mark: string;
}

interface BoutExplanationPanelProps {
  readonly preview: PlayerBoutExplanationPreview;
  readonly bout: PlayerBoutDetail;
  readonly playerShikona: string;
  readonly playerRank: Rank;
}

const resultMark = (
  result: PlayerBoutDetail["result"],
  role: "player" | "opponent",
): string => {
  if (result === "ABSENT") return role === "player" ? "休" : "－";
  if (result === "WIN") return role === "player" ? "○" : "●";
  return role === "player" ? "●" : "○";
};

const opponentRankLabel = (
  bout: PlayerBoutDetail,
  playerRank: Rank,
): string =>
  bout.opponentRankName
    ? formatRankDisplayName({
      division: playerRank.division,
      name: bout.opponentRankName,
      number: bout.opponentRankNumber,
      side: bout.opponentRankSide,
    })
    : "番付未詳";

const resolveParticipants = (
  bout: PlayerBoutDetail,
  playerShikona: string,
  playerRank: Rank,
): { east: ParticipantView; west: ParticipantView } => {
  const player: ParticipantView = {
    shikona: playerShikona,
    rankLabel: formatRankDisplayName(playerRank),
    mark: resultMark(bout.result, "player"),
  };
  const opponent: ParticipantView = {
    shikona: bout.opponentShikona ?? "記録未詳",
    rankLabel: opponentRankLabel(bout, playerRank),
    mark: resultMark(bout.result, "opponent"),
  };

  return playerRank.side === "West" && bout.opponentRankSide === "East"
    ? { east: opponent, west: player }
    : { east: player, west: opponent };
};

const materialTextBySegment = (
  commentary: BoutFlowCommentary,
  segmentKind: "HOSHITORI" | "BANZUKE",
): string | null =>
  commentary.materials.find((material) => material.segmentKind === segmentKind)?.text ?? null;

const RikishiCell: React.FC<{
  readonly participant: ParticipantView;
  readonly align: "east" | "west";
}> = ({ participant, align }) => (
  <div className={styles.rikishiCell} data-align={align}>
    <strong>{participant.shikona}</strong>
    <span>{participant.rankLabel}</span>
    <span className={styles.mark}>{participant.mark}</span>
  </div>
);

export const BoutExplanationPanel: React.FC<BoutExplanationPanelProps> = ({
  preview,
  bout,
  playerShikona,
  playerRank,
}) => {
  const participants = resolveParticipants(bout, playerShikona, playerRank);
  const hoshitoriText = materialTextBySegment(preview.commentary, "HOSHITORI");
  const banzukeText = materialTextBySegment(preview.commentary, "BANZUKE");

  return (
    <section className={styles.panel} aria-label={`${preview.day}日目の取組解説`}>
      <div className={styles.head}>
        <div className={styles.kicker}>取組解説</div>
        <div className={styles.day}>{preview.day}日目</div>
      </div>

      <div className={styles.resultBand}>
        <RikishiCell participant={participants.east} align="east" />
        <div className={styles.kimariteCell}>{preview.commentary.kimarite}</div>
        <RikishiCell participant={participants.west} align="west" />
      </div>

      <p className={styles.shortCommentary}>{preview.commentary.shortCommentary}</p>

      {preview.commentary.victoryFactorLabels.length > 0 ? (
        <div className={styles.factorList} aria-label="勝敗要因">
          {preview.commentary.victoryFactorLabels.map((label) => (
            <span key={label} className={styles.factor}>{label}</span>
          ))}
        </div>
      ) : null}

      <div className={styles.section}>
        <div className={styles.sectionTitle}>展開</div>
        <ul className={styles.flowList}>
          {preview.commentary.flowExplanation.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {(hoshitoriText || banzukeText) && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>文脈</div>
          <div className={styles.contextGrid}>
            {hoshitoriText ? (
              <div className={styles.contextRow}>
                <strong>星取</strong>
                {hoshitoriText}
              </div>
            ) : null}
            {banzukeText ? (
              <div className={styles.contextRow}>
                <strong>番付</strong>
                {banzukeText}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
};

export const BoutExplanationPreviewPanel = BoutExplanationPanel;
