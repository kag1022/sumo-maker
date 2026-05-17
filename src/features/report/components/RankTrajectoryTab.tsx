import React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ScrollText } from "lucide-react";
import type { RikishiStatus } from "../../../logic/models";
import { useLocale } from "../../../shared/hooks/useLocale";
import { cn } from "../../../shared/lib/cn";
import surface from "../../../shared/styles/surface.module.css";
import typography from "../../../shared/styles/typography.module.css";
import { buildReportRankArcDigest } from "../utils/reportRankArcDigest";
import { formatReportAxisRankLabel } from "../utils/reportLocale";
import { BashoDetailBody, type BashoDetailModalState } from "./BashoDetailModal";
import { useCareerBashoDetail } from "./useCareerBashoDetail";

const TOOLTIP_STYLE = {
  borderRadius: 0,
  background: "#081223",
  border: "1px solid rgba(76, 93, 121, 0.95)",
  color: "#efe6cf",
  fontSize: 12,
};

interface RankTrajectoryTabProps {
  status: RikishiStatus;
  careerId?: string | null;
}

export const RankTrajectoryTab: React.FC<RankTrajectoryTabProps> = ({ status, careerId = null }) => {
  const { locale } = useLocale();
  const digest = React.useMemo(() => buildReportRankArcDigest(status, locale), [locale, status]);
  const [selectedState, setSelectedState] = React.useState<BashoDetailModalState | null>(null);
  const { detail, isLoading, errorMessage } = useCareerBashoDetail(careerId, selectedState, status);
  const chartTicks = React.useMemo(
    () => digest.chartPoints.filter((point) => point.axisLabel).map((point) => point.slot),
    [digest.chartPoints],
  );
  const rankChartMin = React.useMemo(
    () => Math.min(-470, ...digest.chartPoints.map((point) => point.plotValue)),
    [digest.chartPoints],
  );

  return (
    <div className="space-y-4">
      <section className={cn(surface.detailCard, "relative overflow-hidden p-4 sm:p-5")}>
        <div className="absolute inset-y-0 left-0 w-1 bg-warning/35" />
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h3 className={typography.sectionHeader}>
              <ScrollText className="w-4 h-4 text-warning" /> {locale === "en" ? "Rank Peaks And Valleys" : "番付の山谷"}
            </h3>
            <p className="mt-1 text-xs text-text-dim">
              {locale === "en" ? "Read how the career rose, fell, and held position over time." : "昇進の数ではなく、上がり方、落ち方、停滞の重さを読みます。"}
            </p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {digest.summaryCards.map((item) => (
            <div key={item.label} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-3 transition-colors hover:border-gold/20 hover:bg-bg/25">
              <div className={cn(typography.label, "text-[10px] tracking-[0.2em] text-text-dim uppercase")}>{item.label}</div>
              <div className={cn(typography.heading, "mt-2 text-sm text-text")}>{item.value}</div>
              <div className="mt-2 text-xs leading-relaxed text-text-dim">{item.detail}</div>
            </div>
          ))}
        </div>

        {digest.chartPoints.length > 1 && (
          <div className="mb-6 h-[260px] bg-surface-base/65 p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={digest.chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(157, 172, 191, 0.12)" />
                <XAxis
                  dataKey="slot"
                  type="category"
                  ticks={chartTicks}
                  tickFormatter={(value) => digest.chartPoints.find((point) => point.slot === value)?.axisLabel || ""}
                  tick={{ fontSize: 9, fill: "#9dacbf" }}
                  axisLine={{ stroke: "rgba(157, 172, 191, 0.2)" }}
                />
                <YAxis
                  domain={[rankChartMin, 10]}
                  tickFormatter={(value: number) => formatReportAxisRankLabel(value, locale)}
                  ticks={[0, -10, -40, -60, -80, -150, -260, -470]}
                  width={54}
                  tick={{ fontSize: 9, fill: "#9dacbf" }}
                  axisLine={{ stroke: "rgba(157, 172, 191, 0.2)" }}
                />
                <Tooltip
                  labelFormatter={(slot) => digest.chartPoints.find((point) => point.slot === slot)?.bashoLabel || ""}
                  formatter={(_value: number, _name: string, payload: { payload?: { rankLabel: string } }) => [
                    payload.payload ? payload.payload.rankLabel : "",
                    locale === "en" ? "Rank" : "番付",
                  ]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Line type="linear" dataKey="plotValue" stroke="#c49a4d" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="space-y-3">
          {digest.storyItems.map((item) => (
            <div key={item.key} className="space-y-2">
              <div className="border border-brand-muted/50 bg-surface-base/75 px-4 py-4 transition-colors hover:border-gold/20 hover:bg-bg/25">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className={cn(typography.label, "text-[10px] tracking-[0.2em] text-text-dim uppercase")}>{item.bashoLabel}</div>
                    <div className={cn(typography.heading, "mt-1 text-sm text-text")}>{item.title}</div>
                  </div>
                  {careerId && (
                    <button
                      type="button"
                      className="text-[11px] text-brand-line hover:text-action-bright"
                      onClick={() =>
                        setSelectedState(
                          selectedState?.bashoSeq === item.bashoSeq
                            ? null
                            : {
                              kind: "rank",
                              bashoSeq: item.bashoSeq,
                              sourceLabel: locale === "en" ? "Rank Arc" : "番付推移",
                              title: locale === "en" ? `${item.bashoLabel} detail` : `${item.bashoLabel}の場所詳細`,
                              subtitle: item.summary,
                              highlightReason: item.summary,
                            },
                        )
                      }
                    >
                      {selectedState?.bashoSeq === item.bashoSeq ? (locale === "en" ? "Close" : "閉じる") : (locale === "en" ? "Open Reason" : "この山場の理由を見る")}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-dim">{item.summary}</p>
              </div>
              {selectedState?.bashoSeq === item.bashoSeq && (
                <div className="border border-warning/35 bg-bg/18 px-4 py-4">
                  <div className="mb-4 border-b border-brand-muted/40 pb-3">
                    <div>
                      <div className={cn(typography.label, "text-[10px] tracking-[0.25em] text-warning/80 uppercase")}>{locale === "en" ? "Rank Arc Detail" : "番付推移詳細"}</div>
                      <div className={cn(typography.heading, "mt-1 text-sm text-text")}>{locale === "en" ? `${item.bashoLabel} turning point` : `${item.bashoLabel}の山場`}</div>
                      <div className="mt-1 text-xs text-text-dim">{item.summary}</div>
                    </div>
                  </div>
                  <BashoDetailBody
                    state={selectedState}
                    detail={detail}
                    status={status}
                    isLoading={isLoading}
                    errorMessage={errorMessage}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <section className={cn(surface.detailCard, "relative overflow-hidden p-4 sm:p-5")}>
        <div className="absolute inset-y-0 left-0 w-1 bg-brand-line/35" />
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className={typography.sectionHeader}>
            <ScrollText className="w-4 h-4 text-brand-line" /> {locale === "en" ? "Rank Movement Table" : "番付変動の比較表"}
          </h3>
          <p className="text-xs text-text-dim">
            {locale === "en" ? "Compare each basho record with the next rank movement." : "各場所の成績と次場所への移動だけを並べます。"}
          </p>
        </div>
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {digest.movementRows.map((row, index) => (
            <div
              key={`${row.bashoLabel}-${index}`}
              className="grid grid-cols-[84px_minmax(0,1fr)_70px] sm:grid-cols-[84px_minmax(0,1fr)_88px_72px] gap-2 text-xs border border-brand-muted/50 bg-surface-base/70 px-3 py-2 transition-colors hover:border-gold/20 hover:bg-bg/25"
            >
              <div className="text-text-dim">{row.bashoLabel}</div>
              <div className="min-w-0">
                <div className="truncate text-text">{row.rankLabel}</div>
                <div className="text-text-dim">{row.recordText}</div>
              </div>
              <div className="hidden sm:block text-text-dim truncate">{row.nextRankLabel}</div>
              <div
                className={
                  row.deltaKind === "up"
                    ? "text-state-bright"
                    : row.deltaKind === "down"
                      ? "text-warning-bright"
                      : row.deltaKind === "entry"
                        ? "text-brand-line"
                        : "text-text-dim"
                }
              >
                {row.deltaKind === "up" ? "↑" : row.deltaKind === "down" ? "↓" : row.deltaKind === "entry" ? (locale === "en" ? "New" : "新") : "→"} {row.deltaText}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
