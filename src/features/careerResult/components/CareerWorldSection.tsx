import React from "react";
import type { RikishiStatus } from "../../../logic/models";
import { listCareerPlayerBoutsByBasho } from "../../../logic/persistence/careerHistory";
import type {
  CareerBashoRecordsBySeq,
  CareerPlayerBoutsByBasho,
} from "../../../logic/persistence/shared";
import {
  buildCareerWorldSummary,
  buildCareerWorldNarrative,
  formatCareerPosition,
  selectKeyNpcCards,
  buildRivalViewModels,
  buildPeerSections,
  buildEraStarViewModels,
  type CareerWorldSummary,
} from "../utils/careerResultModel";
import styles from "./CareerWorldSection.module.css";

interface CareerWorldSectionProps {
  status: RikishiStatus;
  careerId: string | null;
  bashoRows: CareerBashoRecordsBySeq[];
  isRetired?: boolean;
}

const emptyRivalsCopy = (isRetired: boolean): string =>
  isRetired
    ? "記録上、明確な宿敵と呼べる相手は確認できなかった。"
    : "このキャリアでは、明確な宿敵と呼べる相手はまだ現れていない。";

const emptyPeersCopy = (isRetired: boolean): string =>
  isRetired
    ? "記録上、強く印象に残る同期は確認できなかった。"
    : "同世代力士の記録は少ないが、今後のキャリアで関係性が生まれる可能性がある。";

const emptyEraStarsCopy = (): string =>
  "このキャリア期間中、上位番付を支配した強豪の記録は限定的だった。";

export const CareerWorldSection: React.FC<CareerWorldSectionProps> = ({
  status,
  careerId,
  bashoRows,
  isRetired = false,
}) => {
  const [bouts, setBouts] = React.useState<CareerPlayerBoutsByBasho[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    if (!careerId) {
      setBouts([]);
      return () => undefined;
    }
    listCareerPlayerBoutsByBasho(careerId)
      .then((rows) => {
        if (!cancelled) setBouts(rows);
      })
      .catch(() => {
        if (!cancelled) setBouts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [careerId]);

  const summary: CareerWorldSummary | null = React.useMemo(() => {
    if (bouts == null) return null;
    return buildCareerWorldSummary({ status, bashoRows, playerBouts: bouts });
  }, [bouts, bashoRows, status]);

  if (!summary) {
    return (
      <section className={styles.section}>
        <header className={styles.sectionHead}>
        <span className={styles.sectionMark} aria-hidden="true" />
        <span className={styles.sectionTitle}>このキャリアの世界</span>
        <span className={styles.sectionRule} aria-hidden="true" />
      </header>
        <div className={styles.emptyState}>読み込み中…</div>
      </section>
    );
  }

  const narrative = buildCareerWorldNarrative(summary, summary.rarity);
  const position = formatCareerPosition(summary.rarity);
  const keyCards = selectKeyNpcCards(summary);
  const rivalVMs = buildRivalViewModels(summary);
  const peerSections = buildPeerSections(summary);
  const eraStarVMs = buildEraStarViewModels(summary);

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <span className={styles.sectionMark} aria-hidden="true" />
        <span className={styles.sectionTitle}>このキャリアの世界</span>
        <span className={styles.sectionRule} aria-hidden="true" />
      </header>

      <div className={styles.narrativeCard}>{narrative}</div>

      <div className={styles.positionCard}>
        <span className={styles.positionLabel}>最高位</span>
        <span className={styles.positionValue}>{position.highestRankLabel}</span>
        <span className={styles.positionLabel}>キャリアタイプ</span>
        <span className={styles.positionValue}>{position.careerTypeLabel}</span>
        <span className={styles.positionLabel}>位置づけ</span>
        <span className={styles.positionValue}>{position.positionText}</span>
        <span className={styles.positionLabel}>称号</span>
        <span className={styles.positionValue}>{position.title}</span>
      </div>

      {keyCards.length > 0 ? (
        <div className={styles.keyCardGrid}>
          {keyCards.map((card) => (
            <div key={`${card.kind}-${card.sourceId}`} className={styles.keyCard}>
              <div className={styles.keyCardKicker}>{card.heading}</div>
              <div className={styles.keyCardName}>{card.shikona}</div>
              <div className={styles.keyCardMeta}>{card.metaLabel}</div>
              <div className={styles.keyCardDesc}>{card.description}</div>
            </div>
          ))}
        </div>
      ) : null}

      <details className={styles.subSection}>
        <summary className={styles.subSummary}>
          <span>宿敵・ライバル ({rivalVMs.length})</span>
        </summary>
        <div className={styles.subBody}>
          {rivalVMs.length === 0 ? (
            <div className={styles.emptyState}>{emptyRivalsCopy(isRetired)}</div>
          ) : (
            rivalVMs.slice(0, 8).map((r) => (
              <div key={r.id} className={styles.row}>
                <span className={styles.rowName}>{r.shikona}</span>
                <span className={styles.rowMeta}>
                  {r.peakRankLabel ? `最高位 ${r.peakRankLabel} / ` : ""}
                  {r.recordLabel}
                </span>
                <span className={styles.rowDesc}>{r.description}</span>
              </div>
            ))
          )}
        </div>
      </details>

      <details className={styles.subSection}>
        <summary className={styles.subSummary}>
          <span>同世代力士</span>
        </summary>
        <div className={styles.subBody}>
          {peerSections.length === 0 ? (
            <div className={styles.emptyState}>{emptyPeersCopy(isRetired)}</div>
          ) : (
            peerSections.map((sec) => (
              <div key={sec.heading}>
                <div className={styles.peerHeading}>{sec.heading}</div>
                {sec.members.map((m) => (
                  <div key={m.id} className={styles.row}>
                    <span className={styles.rowName}>{m.shikona}</span>
                    <span className={styles.rowMeta}>{m.metaLabel}</span>
                    <span className={styles.rowDesc}>{m.description}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </details>

      <details className={styles.subSection}>
        <summary className={styles.subSummary}>
          <span>この時代の強者 ({eraStarVMs.length})</span>
        </summary>
        <div className={styles.subBody}>
          {eraStarVMs.length === 0 ? (
            <div className={styles.emptyState}>{emptyEraStarsCopy()}</div>
          ) : (
            eraStarVMs.slice(0, 8).map((s) => (
              <div key={s.id} className={styles.row}>
                <span className={styles.rowName}>{s.shikona}</span>
                <span className={styles.rowMeta}>
                  {s.peakRankLabel}
                  {s.yushoNote ? ` / ${s.yushoNote}` : ""}
                </span>
                <span className={styles.rowDesc}>{s.description}</span>
              </div>
            ))
          )}
        </div>
      </details>
    </section>
  );
};
