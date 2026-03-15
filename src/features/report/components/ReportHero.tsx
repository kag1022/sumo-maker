import React from "react";
import { Activity, AlertTriangle, ArrowLeft, Check, Save, ScrollText } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Rank } from "../../../logic/models";
import { Button } from "../../../shared/ui/Button";
import {
  ReportHeroMetric,
  ReportHeroSummary,
  ReportSpotlightPayload,
  formatRankDisplayName,
} from "../utils/reportCareer";

const RANK_CHART_BANDS: Array<{
  key: "Makuuchi" | "Juryo" | "Makushita" | "Sandanme" | "Jonidan" | "Jonokuchi";
  label: string;
  top: number;
  bottom: number;
  color: string;
}> = [
  { key: "Makuuchi", label: "幕内", top: 0, bottom: 57, color: "#c49a4d" },
  { key: "Juryo", label: "十両", top: 60, bottom: 74, color: "#4c7bff" },
  { key: "Makushita", label: "幕下", top: 80, bottom: 140, color: "#49b97b" },
  { key: "Sandanme", label: "三段目", top: 150, bottom: 250, color: "#76a4d4" },
  { key: "Jonidan", label: "序二段", top: 260, bottom: 360, color: "#8e9bb0" },
  { key: "Jonokuchi", label: "序ノ口", top: 370, bottom: 400, color: "#62708c" },
];

const TOOLTIP_STYLE = {
  borderRadius: 0,
  background: "#081223",
  border: "1px solid rgba(76, 93, 121, 0.95)",
  color: "#efe6cf",
  fontSize: 12,
};

const resolveMetricToneColor = (tone: ReportHeroMetric["tone"]): string => {
  if (tone === "state") return "#dbffea";
  if (tone === "warning") return "#ffe2d8";
  if (tone === "action") return "#dbe5ff";
  if (tone === "brand") return "#efd9a7";
  return "#efe6cf";
};

const formatAxisRank = (value: number): string => {
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
};

export interface ReportHeroProps {
  shikona: string;
  maxRank: Rank;
  summary: ReportHeroSummary;
  spotlight: ReportSpotlightPayload;
  winRate: string;
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  yushoCountMakuuchi: number;
  awardsSummary: {
    kinboshi: number;
    totalSansho: number;
  };
  chartMin: number;
  chartTicks: number[];
  activeTab: string;
  tabs: Array<{
    id: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }>;
  saveState: "idle" | "saving" | "saved" | "error";
  isSaved: boolean;
  saveErrorMessage: string | null;
  onReset: () => void;
  onSave: () => void;
  onShowTimeline: () => void;
  onTabChange: (tabId: string) => void;
}

export const ReportHero: React.FC<ReportHeroProps> = ({
  shikona,
  maxRank,
  summary,
  spotlight,
  winRate,
  totalWins,
  totalLosses,
  totalAbsent,
  yushoCountMakuuchi,
  awardsSummary,
  chartMin,
  chartTicks,
  activeTab,
  tabs,
  saveState,
  isSaved,
  saveErrorMessage,
  onReset,
  onSave,
  onShowTimeline,
  onTabChange,
}) => {
  return (
    <>
      <section className="report-hero-panel px-4 sm:px-6 py-5 sm:py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.85fr)] gap-5">
          <div className="space-y-4 min-w-0">
            <div className="inline-flex px-3 py-1 border border-brand-line/40 bg-brand-line/10 text-brand-line text-xs ui-text-label">
              {summary.titleBadge}
            </div>
            <div className="space-y-2">
              <h1 className="text-3xl sm:text-5xl ui-text-heading text-text break-words">{shikona}</h1>
              <p className="text-sm sm:text-base text-text leading-relaxed">{summary.careerHeadline}</p>
              <p className="text-xs sm:text-sm text-text-dim leading-relaxed">{summary.narrative}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {summary.profileFacts.map((fact) => (
                <span key={fact} className="report-pill" data-tone="neutral">
                  {fact}
                </span>
              ))}
              <span className="report-pill" data-tone="brand">
                {summary.journeyLabel}
              </span>
              {summary.pills.map((pill) => (
                <span key={pill.label} className="report-pill" data-tone={pill.tone}>
                  {pill.label}
                </span>
              ))}
            </div>
            {summary.caution && (
              <div className="flex items-start gap-2 border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning-bright">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{summary.caution}</span>
              </div>
            )}
          </div>

          <div className="report-detail-card p-4 sm:p-5 space-y-3">
            <div className="border-b border-brand-muted/60 pb-3">
              <div className="text-xs text-text-dim mb-1">最高位</div>
              <div className="text-xl ui-text-heading text-text break-words">{formatRankDisplayName(maxRank)}</div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-text-dim text-xs mb-1">通算成績</div>
                <div className="text-text ui-text-label">
                  {totalWins}勝 {totalLosses}敗{totalAbsent > 0 ? ` ${totalAbsent}休` : ""}
                </div>
              </div>
              <div>
                <div className="text-text-dim text-xs mb-1">勝率</div>
                <div className="text-text ui-text-label">{winRate}%</div>
              </div>
              <div>
                <div className="text-text-dim text-xs mb-1">幕内優勝</div>
                <div className="text-text ui-text-label">{yushoCountMakuuchi}回</div>
              </div>
              <div>
                <div className="text-text-dim text-xs mb-1">金星 / 三賞</div>
                <div className="text-text ui-text-label">
                  {awardsSummary.kinboshi} / {awardsSummary.totalSansho}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="report-chart-panel px-4 sm:px-6 py-4 sm:py-5">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3 mb-4">
          <div>
            <p className="text-xs ui-text-label tracking-[0.16em] text-text-dim mb-1">番付推移</p>
            <h2 className="section-header text-base sm:text-lg">
              <Activity className="w-4 h-4 text-action" /> 力士一代記の推移
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-text-dim max-w-2xl leading-relaxed">{spotlight.note}</p>
        </div>

        {spotlight.points.length > 1 ? (
          <>
            <div className="flex flex-wrap gap-2 text-xs text-text-dim mb-3">
              {RANK_CHART_BANDS.map((band) => (
                <span key={band.key} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block w-2.5 h-2.5 border border-brand-muted/50"
                    style={{ backgroundColor: band.color, opacity: 0.4 }}
                  />
                  {band.label}
                </span>
              ))}
              {spotlight.peakBand && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 border border-action/40 bg-action/30" />
                  {spotlight.peakBand.label}
                </span>
              )}
            </div>

            <div className="h-[280px] sm:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spotlight.points}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(157, 172, 191, 0.12)" />
                  <XAxis
                    dataKey="slot"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    ticks={chartTicks}
                    tickFormatter={(value) => spotlight.points.find((point) => point.slot === value)?.axisLabel || ""}
                    tick={{ fontSize: 10, fill: "#9dacbf" }}
                    allowDecimals={false}
                  />
                  <YAxis
                    domain={[chartMin, 10]}
                    tickFormatter={formatAxisRank}
                    ticks={[0, -10, -40, -60, -80, -150, -260, -470]}
                    width={54}
                    tick={{ fontSize: 10, fill: "#9dacbf" }}
                  />
                  <Tooltip
                    labelFormatter={(slot) => spotlight.points.find((point) => point.slot === slot)?.bashoLabel || ""}
                    formatter={(_value: number, _name: string, payload: { payload?: { rankLabel: string; age: number } }) => [
                      payload.payload ? `${payload.payload.rankLabel} / ${payload.payload.age}歳` : "",
                      "番付",
                    ]}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  {RANK_CHART_BANDS.map((band) => (
                    <ReferenceArea
                      key={band.key}
                      y1={-1 * band.top}
                      y2={-1 * band.bottom}
                      strokeOpacity={0}
                      fill={band.color}
                      fillOpacity={0.07}
                    />
                  ))}
                  {spotlight.peakBand && (
                    <ReferenceArea
                      x1={spotlight.peakBand.startSlot}
                      x2={spotlight.peakBand.endSlot}
                      strokeOpacity={0}
                      fill="#4c7bff"
                      fillOpacity={0.08}
                    />
                  )}
                  <Line
                    type="stepAfter"
                    dataKey="plotValue"
                    stroke="#e2ba6e"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 4, fill: "#4c7bff", stroke: "#dbe5ff" }}
                  />
                  {spotlight.events.map((event) => (
                    <ReferenceDot
                      key={event.key}
                      x={event.slot}
                      y={event.plotValue}
                      r={4}
                      fill={
                        event.tone === "state"
                          ? "#49b97b"
                          : event.tone === "warning"
                            ? "#d26b52"
                            : "#c49a4d"
                      }
                      stroke="#081223"
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {spotlight.events.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2 mt-4">
                {spotlight.events.map((event) => (
                  <div
                    key={event.key}
                    className="border p-3 text-xs"
                    style={{
                      borderColor:
                        event.tone === "state"
                          ? "rgba(73, 185, 123, 0.45)"
                          : event.tone === "warning"
                            ? "rgba(210, 107, 82, 0.45)"
                            : "rgba(196, 154, 77, 0.45)",
                      background:
                        event.tone === "state"
                          ? "rgba(73, 185, 123, 0.08)"
                          : event.tone === "warning"
                            ? "rgba(210, 107, 82, 0.08)"
                            : "rgba(196, 154, 77, 0.08)",
                    }}
                  >
                    <div className="text-text-dim mb-1">{event.bashoLabel}</div>
                    <div className="text-text ui-text-label break-words">{event.label}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="report-empty">
            番付推移を描くほどの記録がまだありません。短命ケースでも壊れないよう、ここでは空状態を明示します。
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_260px] gap-3 items-start">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {summary.metrics.map((metric) => (
            <div key={metric.label} className="report-summary-card" data-tone={metric.tone}>
              <div className="text-[11px] ui-text-label tracking-[0.12em] text-text-dim">{metric.label}</div>
              <div
                className="text-xl sm:text-2xl ui-text-heading leading-tight break-words"
                style={{ color: resolveMetricToneColor(metric.tone) }}
              >
                {metric.value}
              </div>
              <div className="text-xs text-text-dim leading-relaxed">{metric.meta}</div>
            </div>
          ))}
        </div>

        <div className="report-detail-card p-3 sm:p-4 flex flex-col gap-2">
          <Button size="sm" variant="outline" onClick={onReset}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" /> もう一度
          </Button>
          <Button
            size="sm"
            variant={saveState === "saved" || isSaved ? "success" : saveState === "error" ? "danger" : "primary"}
            onClick={onSave}
            disabled={saveState === "saving" || isSaved}
          >
            {saveState === "saved" || isSaved ? (
              <>
                <Check className="w-3.5 h-3.5 mr-1" /> 保存済み
              </>
            ) : saveState === "saving" ? (
              <>
                <Save className="w-3.5 h-3.5 mr-1" /> 保存中...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-1" /> 殿堂入り
              </>
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={onShowTimeline}>
            <ScrollText className="w-3.5 h-3.5 mr-1" /> 転機を見る
          </Button>
          {saveErrorMessage && (
            <div className="text-xs text-warning-bright border border-warning/35 bg-warning/10 px-3 py-2">
              {saveErrorMessage}
            </div>
          )}
        </div>
      </section>

      <section className="report-detail-card p-1.5 sm:p-2">
        <nav className="flex flex-wrap gap-1" aria-label="結果画面タブ">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="report-tab-button"
                data-active={activeTab === tab.id}
                aria-pressed={activeTab === tab.id}
              >
                <span className="inline-flex items-center gap-2">
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </section>
    </>
  );
};
