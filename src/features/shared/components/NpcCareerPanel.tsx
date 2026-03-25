import React from "react";
import type { NpcCareerDetail } from "../utils/npcCareerDetail";

export const NpcCareerPanel: React.FC<{
  detail: NpcCareerDetail;
  onClear: () => void;
}> = ({ detail, onClear }) => (
  <section className="analysis-section npc-focus-panel">
    <div className="analysis-toolbar">
      <div className="analysis-toolbar-primary">
        <span className="analysis-subtitle">NPC力士</span>
        <span className="analysis-caption">{detail.shikona}</span>
      </div>
      <button type="button" className="npc-clear-button" onClick={onClear}>
        閉じる
      </button>
    </div>
    <div className="analysis-summary npc-summary-grid">
      <Metric label="在位場所" value={`${detail.appearances}`} />
      <Metric label="最高位" value={detail.maxRankLabel} />
      <Metric label="通算" value={detail.totalRecordLabel} />
      <Metric label="優勝" value={`${detail.yushoCount}`} />
    </div>
    <div className="npc-summary-meta">
      <span>{detail.firstBashoLabel}</span>
      <span>{detail.lastBashoLabel}</span>
      {detail.selectedRankLabel ? <span>{detail.selectedRankLabel}</span> : null}
      {detail.selectedRecordLabel ? <span>{detail.selectedRecordLabel}</span> : null}
    </div>
    <div className="npc-recent-strip">
      {detail.recentSlices.map((slice) => (
        <div key={`${detail.entityId}-${slice.bashoSeq}`} className="npc-recent-item" data-selected={slice.selected}>
          <div>{slice.bashoLabel}</div>
          <div>{slice.rankLabel}</div>
          <div>{slice.recordLabel}</div>
        </div>
      ))}
    </div>
  </section>
);

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="analysis-metric">
    <div className="analysis-metric-label">{label}</div>
    <div className="analysis-metric-value">{value}</div>
  </div>
);
