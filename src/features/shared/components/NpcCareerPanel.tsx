import React from "react";
import { useLocale } from "../../../shared/hooks/useLocale";
import type { NpcCareerDetail } from "../utils/npcCareerDetail";
import styles from "./NpcCareerPanel.module.css";

export const NpcCareerPanel: React.FC<{
  detail: NpcCareerDetail;
  onClear: () => void;
}> = ({ detail, onClear }) => {
  const { locale } = useLocale();

  return (
    <section className={styles.section}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarPrimary}>
          <span className={styles.subtitle}>{locale === "en" ? "NPC Rikishi" : "NPC力士"}</span>
          <span className={styles.caption}>{detail.shikona}</span>
          <span className={styles.caption}>{detail.bashoLabel}</span>
        </div>
        <button type="button" className={styles.clearButton} onClick={onClear}>
          {locale === "en" ? "Close" : "閉じる"}
        </button>
      </div>
      <div className={styles.summaryGrid}>
        <Metric label={locale === "en" ? "Rank" : "番付"} value={detail.rankLabel} />
        <Metric label={locale === "en" ? "Record" : "成績"} value={detail.recordLabel} />
        {detail.styleLabel ? <Metric label={locale === "en" ? "Style" : "取り口"} value={detail.styleLabel} /> : null}
        {detail.bodyLabel ? <Metric label={locale === "en" ? "Body" : "体格"} value={detail.bodyLabel} /> : null}
        {detail.affiliationLabel ? <Metric label={locale === "en" ? "Affiliation" : "所属関係"} value={detail.affiliationLabel} /> : null}
        {detail.stableLabel ? <Metric label={locale === "en" ? "Stable" : "部屋"} value={detail.stableLabel} /> : null}
        {detail.careerBashoCountLabel ? <Metric label={locale === "en" ? "Career" : "在位"} value={detail.careerBashoCountLabel} /> : null}
      </div>
    </section>
  );
};

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className={styles.metric}>
    <div className={styles.metricLabel}>{label}</div>
    <div className={styles.metricValue}>{value}</div>
  </div>
);
