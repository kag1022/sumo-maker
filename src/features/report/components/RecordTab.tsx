import React from "react";
import { ScrollText } from "lucide-react";
import type { RikishiStatus } from "../../../logic/models";
import { Button } from "../../../shared/ui/Button";
import { buildReportRecordDigest } from "../utils/reportRecordDigest";
import { BashoDetailBody, type BashoDetailModalState } from "./BashoDetailModal";
import { useCareerBashoDetail } from "./useCareerBashoDetail";

interface RecordTabProps {
  status: RikishiStatus;
  careerId?: string | null;
}

const toneClass: Record<"state" | "warning" | "neutral", string> = {
  state: "text-state-bright",
  warning: "text-warning-bright",
  neutral: "text-text-dim",
};

export const RecordTab: React.FC<RecordTabProps> = ({ status, careerId = null }) => {
  const digest = React.useMemo(() => buildReportRecordDigest(status), [status]);
  const [expandedState, setExpandedState] = React.useState<BashoDetailModalState | null>(null);
  const { detail, isLoading, errorMessage } = useCareerBashoDetail(careerId, expandedState, status);

  return (
    <div className="space-y-4">
      <section className="report-detail-card relative overflow-hidden p-4 sm:p-5">
        <div className="absolute inset-y-0 left-0 w-1 bg-brand-line/35" />
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="section-header">
              <ScrollText className="w-4 h-4 text-brand-line" /> 場所別戦績
            </h3>
            <p className="mt-1 text-xs text-text-dim">公式記録として、各場所の番付と成績を順に読みます。</p>
          </div>
          <div className="text-xs text-text-dim">{digest.summaryLine}</div>
        </div>
        <div className="space-y-2">
          {digest.rows.map((row) => {
            const isExpanded = expandedState?.bashoSeq === row.bashoSeq;
            return (
              <div key={`${row.bashoSeq}-${row.bashoLabel}`} className="space-y-2">
                <div className="grid grid-cols-[88px_minmax(0,1fr)_100px] sm:grid-cols-[92px_minmax(0,1fr)_112px_156px] gap-2 items-center border border-brand-muted/50 bg-surface-base/75 px-3 py-3 text-xs transition-colors hover:border-gold/20 hover:bg-bg/25">
                  <div className="text-text-dim">{row.bashoLabel}</div>
                  <div className="min-w-0">
                    <div className="truncate text-sm text-text">{row.rankLabel}</div>
                    <div className="text-text-dim">{row.recordText}</div>
                  </div>
                  <div className={`truncate ui-text-label ${toneClass[row.emphasis]}`}>{row.achievementText}</div>
                  <Button
                    variant={isExpanded ? "secondary" : "outline"}
                    size="sm"
                    className="hidden sm:inline-flex justify-center"
                    onClick={() =>
                      setExpandedState(
                        isExpanded
                          ? null
                          : {
                              kind: "record",
                              bashoSeq: row.bashoSeq,
                              sourceLabel: "戦績",
                              title: `${row.bashoLabel}の場所詳細`,
                              subtitle: `${row.rankLabel} / ${row.recordText}`,
                              highlightReason: "この場所の公式記録を確認します。",
                            },
                      )
                    }
                  >
                    {isExpanded ? "閉じる" : "この場所の記録を見る"}
                  </Button>
                </div>
                {isExpanded && (
                  <div className="border border-brand-line/35 bg-bg/18 px-4 py-4">
                    <div className="mb-4 border-b border-brand-muted/40 pb-3">
                      <div>
                        <div className="ui-text-label text-[10px] tracking-[0.25em] text-brand-line/70 uppercase">戦績詳細</div>
                        <div className="mt-1 text-sm ui-text-heading text-text">{row.bashoLabel}の公式記録</div>
                        <div className="mt-1 text-xs text-text-dim">{row.rankLabel} / {row.recordText}</div>
                      </div>
                    </div>
                    <BashoDetailBody
                      state={expandedState}
                      detail={detail}
                      status={status}
                      isLoading={isLoading}
                      errorMessage={errorMessage}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {!careerId && (
          <div className="mt-3 text-xs text-warning-bright">保存済み記録を開くと、各場所の本割と番付表まで確認できます。</div>
        )}
      </section>
    </div>
  );
};
