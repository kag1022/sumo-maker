import React from "react";
import { ScrollText } from "lucide-react";
import { HoshitoriCareerRecord, HoshitoriTable } from "./HoshitoriTable";
import { ReportTimelineDigestItem } from "../utils/reportCareer";

interface ReportTimelineTabProps {
  items: ReportTimelineDigestItem[];
  filter: "IMPORTANT" | "ALL";
  onFilterChange: (filter: "IMPORTANT" | "ALL") => void;
  hoshitoriCareerRecords: HoshitoriCareerRecord[];
  shikona: string;
  isHoshitoriLoading: boolean;
  hoshitoriErrorMessage?: string;
}

export const ReportTimelineTab: React.FC<ReportTimelineTabProps> = ({
  items,
  filter,
  onFilterChange,
  hoshitoriCareerRecords,
  shikona,
  isHoshitoriLoading,
  hoshitoriErrorMessage,
}) => (
  <div className="space-y-4 animate-in">
    <div className="report-detail-card p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="section-header">
            <ScrollText className="w-4 h-4 text-brand-line" /> 転機の履歴
          </h3>
          <p className="text-xs text-text-dim mt-1">
            昇進、優勝、長期休場、引退理由を優先し、同じ月の出来事はまとめて読みます。
          </p>
        </div>
        <div className="flex border border-brand-muted/70 bg-surface-base/80 p-1">
          {(["IMPORTANT", "ALL"] as const).map((nextFilter) => (
            <button
              key={nextFilter}
              onClick={() => onFilterChange(nextFilter)}
              className="report-tab-button"
              data-active={filter === nextFilter}
            >
              {nextFilter === "IMPORTANT" ? "主な転機" : "全件"}
            </button>
          ))}
        </div>
      </div>

      {items.length > 0 ? (
        <div className="space-y-3">
          {items.map((item) => (
            <TimelineDigestCard key={item.key} item={item} />
          ))}
        </div>
      ) : (
        <div className="report-empty">
          表示する転機がありません。まだ静かなキャリアか、出来事ログが不足しています。
        </div>
      )}
    </div>

    <HoshitoriTable
      careerRecords={hoshitoriCareerRecords}
      shikona={shikona}
      isLoading={isHoshitoriLoading}
      errorMessage={hoshitoriErrorMessage}
    />
  </div>
);

const TimelineDigestCard: React.FC<{ item: ReportTimelineDigestItem }> = ({ item }) => {
  const toneClasses =
    item.tone === "state"
      ? "border-state/45 bg-state/10"
      : item.tone === "warning"
        ? "border-warning/45 bg-warning/10"
        : item.tone === "brand"
          ? "border-brand-line/40 bg-brand-line/10"
          : "border-brand-muted/60 bg-surface-base/75";

  return (
    <div className={`report-timeline-group p-3 sm:p-4 ${toneClasses}`}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-text ui-text-label">{item.dateLabel}</span>
          <span className="text-[11px] text-text-dim border border-brand-muted/50 px-2 py-0.5">
            {item.age}歳
          </span>
          <span className="text-[11px] ui-text-label text-text px-2 py-0.5 border border-current/30">
            {item.label}
          </span>
          {item.isMajor && <span className="text-[11px] ui-text-label text-brand-line">重要</span>}
        </div>
      </div>
      <ul className="space-y-1 text-sm text-text-dim">
        {item.items.map((description, index) => (
          <li key={`${item.key}-${index}`} className="leading-relaxed">
            {description}
          </li>
        ))}
      </ul>
    </div>
  );
};
