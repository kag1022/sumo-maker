import React from "react";
import type { NpcCareerDetail } from "../utils/npcCareerDetail";
import styles from "./NpcCareerPanel.module.css";

export const NpcCareerPanel: React.FC<{
  detail: NpcCareerDetail;
  onClear: () => void;
}> = ({ detail, onClear }) => (
  <section className={styles.section}>
    <div className={styles.toolbar}>
      <div className={styles.toolbarPrimary}>
        <span className={styles.subtitle}>NPC力士</span>
        <span className={styles.caption}>{detail.shikona}</span>
        <span className={styles.caption}>{detail.bashoLabel}</span>
      </div>
      <button type="button" className={styles.clearButton} onClick={onClear}>
        閉じる
      </button>
    </div>
    <div className={styles.summaryGrid}>
      <Metric label="番付" value={detail.rankLabel} />
      <Metric label="成績" value={detail.recordLabel} />
      {detail.styleLabel ? <Metric label="取り口" value={detail.styleLabel} /> : null}
      {detail.bodyLabel ? <Metric label="体格" value={detail.bodyLabel} /> : null}
      {detail.affiliationLabel ? <Metric label="所属関係" value={detail.affiliationLabel} /> : null}
      {detail.stableLabel ? <Metric label="部屋" value={detail.stableLabel} /> : null}
      {detail.careerBashoCountLabel ? <Metric label="在位" value={detail.careerBashoCountLabel} /> : null}
    </div>
  </section>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.metric}>
    <div className={styles.metricLabel}>{label}</div>
    <div className={styles.metricValue}>{value}</div>
  </div>
);
