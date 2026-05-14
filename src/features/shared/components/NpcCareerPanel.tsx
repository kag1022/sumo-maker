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
      </div>
      <button type="button" className={styles.clearButton} onClick={onClear}>
        閉じる
      </button>
    </div>
    <div className={styles.summaryGrid}>
      <Metric label="番付" value={detail.rankLabel} />
      <Metric label="成績" value={detail.recordLabel} />
      <Metric label="能力" value={detail.abilityLabel} />
      <Metric label="体格" value={detail.bodyLabel} />
    </div>
    <div className={styles.summaryMeta}>
      <span>{detail.bashoLabel}</span>
      <span>{detail.sourceLabel}</span>
      <span>{detail.styleLabel}</span>
      <span>{detail.stableLabel}</span>
      <span>{detail.careerBashoCountLabel}</span>
    </div>
    <div className={styles.snapshotBox}>
      <div>{detail.bashoLabel}</div>
      <div>{detail.rankLabel}</div>
      <div>{detail.recordLabel}</div>
    </div>
  </section>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.metric}>
    <div className={styles.metricLabel}>{label}</div>
    <div className={styles.metricValue}>{value}</div>
  </div>
);
