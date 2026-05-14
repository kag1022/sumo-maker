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
      <Metric label="在位場所" value={`${detail.appearances}`} />
      <Metric label="最高位" value={detail.maxRankLabel} />
      <Metric label="通算" value={detail.totalRecordLabel} />
      <Metric label="優勝" value={`${detail.yushoCount}`} />
    </div>
    <div className={styles.summaryMeta}>
      <span>{detail.firstBashoLabel}</span>
      <span>{detail.lastBashoLabel}</span>
      {detail.selectedRankLabel ? <span>{detail.selectedRankLabel}</span> : null}
      {detail.selectedRecordLabel ? <span>{detail.selectedRecordLabel}</span> : null}
    </div>
    <div className={styles.recentStrip}>
      {detail.recentSlices.map((slice) => (
        <div key={`${detail.entityId}-${slice.bashoSeq}`} className={styles.recentItem} data-selected={slice.selected}>
          <div>{slice.bashoLabel}</div>
          <div>{slice.rankLabel}</div>
          <div>{slice.recordLabel}</div>
        </div>
      ))}
    </div>
  </section>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.metric}>
    <div className={styles.metricLabel}>{label}</div>
    <div className={styles.metricValue}>{value}</div>
  </div>
);
