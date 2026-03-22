import React from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ScrollText } from "lucide-react";
import type { RikishiStatus } from "../../../logic/models";
import { buildReportRankArcDigest } from "../utils/reportRankArcDigest";
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
  const digest = React.useMemo(() => buildReportRankArcDigest(status), [status]);
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
      <section className="report-detail-card relative overflow-hidden p-4 sm:p-5">
        <div className="absolute inset-y-0 left-0 w-1 bg-warning/35" />
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="section-header">
              <ScrollText className="w-4 h-4 text-warning" /> 番付の山谷
            </h3>
            <p className="mt-1 text-xs text-text-dim">昇進の数ではなく、上がり方、落ち方、停滞の重さを読みます。</p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {digest.summaryCards.map((item) => (
            <div key={item.label} className="border border-brand-muted/50 bg-surface-base/75 px-3 py-3 transition-colors hover:border-gold/20 hover:bg-bg/25">
              <div className="text-[10px] ui-text-label tracking-[0.2em] text-text-dim uppercase">{item.label}</div>
              <div className="mt-2 text-sm ui-text-heading text-text">{item.value}</div>
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
                  tickFormatter={(value: number) => {
                    const abs = Math.abs(value);
                    if (abs === 0) return "横綱";
                    if (abs === 10) return "大関";
                    if (abs === 40) return "幕内";
                    if (abs === 60) return "十両";
                    if (abs === 80) return "幕下";
                    if (abs === 150) return "三段目";
                    if (abs === 260) return "序二段";
                    if (abs === 470) return "序ノ口";
                    return "";
                  }}
                  ticks={[0, -10, -40, -60, -80, -150, -260, -470]}
                  width={54}
                  tick={{ fontSize: 9, fill: "#9dacbf" }}
                  axisLine={{ stroke: "rgba(157, 172, 191, 0.2)" }}
                />
                <Tooltip
                  labelFormatter={(slot) => digest.chartPoints.find((point) => point.slot === slot)?.bashoLabel || ""}
                  formatter={(_value: number, _name: string, payload: { payload?: { rankLabel: string } }) => [
                    payload.payload ? payload.payload.rankLabel : "",
                    "番付",
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
                    <div className="text-[10px] ui-text-label tracking-[0.2em] text-text-dim uppercase">{item.bashoLabel}</div>
                    <div className="mt-1 text-sm ui-text-heading text-text">{item.title}</div>
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
                                sourceLabel: "番付推移",
                                title: `${item.bashoLabel}の場所詳細`,
                                subtitle: item.summary,
                                highlightReason: item.summary,
                              },
                        )
                      }
                    >
                      {selectedState?.bashoSeq === item.bashoSeq ? "閉じる" : "この山場の理由を見る"}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-text-dim">{item.summary}</p>
              </div>
              {selectedState?.bashoSeq === item.bashoSeq && (
                <div className="border border-warning/35 bg-bg/18 px-4 py-4">
                  <div className="mb-4 border-b border-brand-muted/40 pb-3">
                    <div>
                      <div className="ui-text-label text-[10px] tracking-[0.25em] text-warning/80 uppercase">番付推移詳細</div>
                      <div className="mt-1 text-sm ui-text-heading text-text">{item.bashoLabel}の山場</div>
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
      <section className="report-detail-card relative overflow-hidden p-4 sm:p-5">
        <div className="absolute inset-y-0 left-0 w-1 bg-brand-line/35" />
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="section-header">
            <ScrollText className="w-4 h-4 text-brand-line" /> 番付変動の比較表
          </h3>
          <p className="text-xs text-text-dim">各場所の成績と次場所への移動だけを並べます。</p>
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
                {row.deltaKind === "up" ? "↑" : row.deltaKind === "down" ? "↓" : row.deltaKind === "entry" ? "新" : "→"} {row.deltaText}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
