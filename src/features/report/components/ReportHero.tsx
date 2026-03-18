import React from "react";
import { Activity, ArrowLeft, Check, Save, ScrollText } from "lucide-react";
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
} from "../utils/reportHero";
import {
  formatRankDisplayName,
} from "../utils/reportFormatters";

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
  onReset,
  onSave,
  onShowTimeline,
  onTabChange,
}) => {
  return (
    <>
      <section className="relative overflow-hidden mb-8 lg:mb-12 animate-in fade-in duration-1000">
        <div className="absolute inset-0 bg-asanoha opacity-5 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-b from-washi/40 to-transparent pointer-events-none" />

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr_320px] gap-8 relative z-10 p-6 sm:p-10">
          {/* 左: 力士肖像 (New) */}
          <div className="flex flex-col items-center space-y-4">
             <div className="rpg-panel p-2 shadow-2xl relative group bg-bg-panel/40">
                <div className="absolute inset-0 bg-gold/5 pointer-events-none" />
                <div className="h-64 sm:h-80 w-48 sm:w-56 overflow-hidden flex items-end justify-center bg-bg/20">
                   {/* bodyType情報がない場合はNormalと仮定するか、propsに追加する必要がある。現状は画像パス構築の都合上適当な対応が必要 */}
                   <img 
                      src="/images/rikishi/normal_front.png" 
                      alt="Rikishi Portrait" 
                      className="h-full object-contain pixelated drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
                   />
                </div>
             </div>
             <div className="washi-surface px-4 py-2 border-gold/20 text-center bg-bg-panel/60">
                <p className="text-[10px] ui-text-label text-gold uppercase tracking-widest">{summary.titleBadge}</p>
             </div>
          </div>

          {/* 中央: 力士の物語 */}
          <div className="space-y-6 flex flex-col justify-center">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="h-px w-8 bg-sumi/20" />
                <p className="text-sm ui-text-label text-gold italic">{summary.journeyLabel}</p>
              </div>
              <h1 className="text-5xl sm:text-7xl ui-text-heading text-text leading-tight drop-shadow-sm font-bold">
                {shikona}
              </h1>
              <p className="text-xl sm:text-2xl text-text/80 ui-text-label border-b border-gold/20 pb-4 inline-block">
                {summary.careerHeadline}
              </p>
              <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-gold/30" />
                <p className="text-sm sm:text-base text-text/70 leading-relaxed max-w-2xl italic pl-4">
                  “{summary.narrative}”
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {summary.profileFacts.map((fact) => (
                <span key={fact} className="px-3 py-1 bg-bg-light/40 border border-gold/10 text-[10px] ui-text-label text-text/60">
                  {fact}
                </span>
              ))}
              {summary.pills.map((pill) => (
                <span key={pill.label} className="px-3 py-1 bg-gold/20 border border-gold/30 text-[10px] ui-text-label text-gold">
                  {pill.label}
                </span>
              ))}
            </div>
          </div>

          {/* 右: 主要戦績スタッツ */}
          <div className="washi-surface p-8 border-gold/20 shadow-2xl space-y-6 flex flex-col justify-center bg-bg-panel/60">
            <div className="text-center border-b border-gold/10 pb-4">
              <div className="text-[10px] ui-text-label text-gold/60 mb-2 uppercase tracking-widest">最高位</div>
              <div className="text-4xl ui-text-metric text-text">
                {formatRankDisplayName(maxRank)}
              </div>
            </div>
            
            <div className="space-y-4">
              {[
                { label: "通算成績", val: `${totalWins}勝 ${totalLosses}敗${totalAbsent > 0 ? ` ${totalAbsent}休` : ""}` },
                { label: "勝率", val: `${winRate}%` },
                { label: "優勝回数", val: `${yushoCountMakuuchi}回` },
                { label: "金星 / 三賞", val: `${awardsSummary.kinboshi} / ${awardsSummary.totalSansho}` },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-end border-b border-gold/5 pb-2">
                  <div className="text-[10px] ui-text-label text-text/40">{item.label}</div>
                  <div className="text-sm font-bold text-text">{item.val}</div>
                </div>
              ))}
            </div>

            <div className="pt-2 text-center">
              <p className="text-[9px] text-sumi/30 font-serif italic">
                この歩みは西之海部屋の歴史に永劫刻まれる。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 sm:px-10 py-10 washi-surface border-gold/20 bg-bg-panel/40 relative overflow-hidden group">
        <div className="absolute inset-0 bg-bg/20 pointer-events-none" />
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 mb-8 relative z-10">
          <div className="space-y-2">
            <p className="text-[10px] ui-text-label tracking-[0.4em] text-text/40 uppercase">番付の推移</p>
            <h2 className="text-3xl ui-text-heading text-text flex items-center gap-3">
              <ScrollText className="w-8 h-8 text-gold" />
              <span>これまでの番付の動き</span>
            </h2>
          </div>
          <div className="text-sm text-sumi/60 max-w-xl leading-relaxed italic border-l-4 border-gold/40 pl-6">
            {spotlight.note}
          </div>
        </div>

        {spotlight.points.length > 1 ? (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] ui-text-label text-text-dim mb-6 bg-bg/30 p-2 border border-gold-muted/10">
              {RANK_CHART_BANDS.map((band) => (
                <span key={band.key} className="inline-flex items-center gap-2">
                  <span
                    className="inline-block w-2.5 h-2.5 border border-white/10"
                    style={{ backgroundColor: band.color, opacity: 0.6 }}
                  />
                  {band.label}
                </span>
              ))}
              {spotlight.peakBand && (
                <span className="inline-flex items-center gap-2 border-l border-gold-muted/20 pl-4 ml-2">
                  <span className="inline-block w-2.5 h-2.5 border border-action/40 bg-action/30" />
                  黄金期: {spotlight.peakBand.label}
                </span>
              )}
            </div>

            <div className="h-[300px] sm:h-[400px] bg-bg/20 p-2 rounded-sm border border-gold-muted/5 relative">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spotlight.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(196, 154, 77, 0.08)" />
                  <XAxis
                    dataKey="slot"
                    type="category"
                    ticks={chartTicks}
                    tickFormatter={(value) => spotlight.points.find((point) => point.slot === value)?.axisLabel || ""}
                    tick={{ fontSize: 9, fill: "#6f7b90", fontFamily: "DotGothic16" }}
                    axisLine={{ stroke: "rgba(196, 154, 77, 0.2)" }}
                  />
                  <YAxis
                    domain={[chartMin, 10]}
                    tickFormatter={formatAxisRank}
                    ticks={[0, -10, -40, -60, -80, -150, -260, -470]}
                    width={54}
                    tick={{ fontSize: 9, fill: "#6f7b90", fontFamily: "DotGothic16" }}
                    axisLine={{ stroke: "rgba(196, 154, 77, 0.2)" }}
                  />
                  <Tooltip
                    labelFormatter={(slot) => spotlight.points.find((point) => point.slot === slot)?.bashoLabel || ""}
                    formatter={(_value: number, _name: string, payload: { payload?: { rankLabel: string; age: number } }) => [
                      payload.payload ? `${payload.payload.rankLabel} / ${payload.payload.age}歳` : "",
                      "番付",
                    ]}
                    contentStyle={{ ...TOOLTIP_STYLE, backgroundColor: "rgba(8, 18, 35, 0.95)", backdropFilter: "blur(4px)" }}
                  />
                  {RANK_CHART_BANDS.map((band) => (
                    <ReferenceArea
                      key={band.key}
                      y1={-1 * band.top}
                      y2={-1 * band.bottom}
                      strokeOpacity={0}
                      fill={band.color}
                      fillOpacity={0.04}
                    />
                  ))}
                  {spotlight.peakBand && (
                    <ReferenceArea
                      x1={spotlight.peakBand.startSlot}
                      x2={spotlight.peakBand.endSlot}
                      strokeOpacity={0}
                      fill="#4c7bff"
                      fillOpacity={0.06}
                    />
                  )}
                  <Line
                    type="linear"
                    dataKey="plotValue"
                    stroke="#c49a4d"
                    strokeWidth={3}
                    dot={false}
                    activeDot={{ r: 5, fill: "#4c7bff", stroke: "#fff", strokeWidth: 2 }}
                    animationDuration={1000}
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
                      stroke="#0b1018"
                      strokeWidth={2}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {spotlight.events.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-6">
                {spotlight.events.map((event) => (
                  <div
                    key={event.key}
                    className="surface-card p-3 border-l-4 transition-all hover:translate-x-1"
                    style={{
                      borderLeftColor:
                        event.tone === "state"
                          ? "#49b97b"
                          : event.tone === "warning"
                            ? "#d26b52"
                            : "#c49a4d",
                      background: "rgba(12, 18, 27, 0.5)"
                    }}
                  >
                    <div className="text-[10px] ui-text-label text-text-dim mb-1">{event.bashoLabel}</div>
                    <div className="text-xs text-text leading-relaxed">{event.label}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="report-empty border-dashed border-gold-muted/20 text-center py-20 flex flex-col items-center gap-3">
            <Activity className="w-8 h-8 text-gold/20" />
            <p className="text-sm italic">番付推移を描くほどの記録がまだありません。</p>
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,0.4fr)] gap-4 items-stretch">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {summary.metrics.map((metric) => (
            <div key={metric.label} className="surface-card p-4 flex flex-col justify-between min-h-[100px] border-gold-muted/10 group hover:border-gold/30 transition-all" data-tone={metric.tone}>
              <div className="text-[10px] ui-text-label tracking-widest text-text-dim group-hover:text-gold/70 transition-colors uppercase">{metric.label}</div>
              <div
                className="text-xl ui-text-metric leading-tight break-words"
                style={{ color: resolveMetricToneColor(metric.tone) }}
              >
                {metric.value}
              </div>
              <div className="text-[10px] text-text-faint leading-tight italic">{metric.meta}</div>
            </div>
          ))}
        </div>

        <div className="surface-panel p-4 flex flex-col gap-2.5 border-gold/20 bg-bg-panel/40">
          <Button size="sm" variant="outline" onClick={onReset} className="w-full justify-start text-[10px] ui-text-label opacity-60 hover:opacity-100 italic transition-all">
            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> 新弟子を待つ
          </Button>
          <Button
            size="sm"
            variant={saveState === "saved" || isSaved ? "success" : saveState === "error" ? "danger" : "primary"}
            onClick={onSave}
            disabled={saveState === "saving" || isSaved}
            className="w-full justify-start text-[10px] ui-text-label font-bold"
          >
            {saveState === "saved" || isSaved ? (
              <>
                <Check className="w-3.5 h-3.5 mr-2" /> 永久保存済み
              </>
            ) : saveState === "saving" ? (
              <>
                <Activity className="w-3.5 h-3.5 mr-2 animate-spin" /> 保存中...
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5 mr-2" /> この人生を保存
              </>
            )}
          </Button>
          <Button size="sm" variant="ghost" onClick={onShowTimeline} className="w-full justify-start text-[10px] ui-text-label opacity-80 hover:opacity-100 hover:bg-gold/5">
            <ScrollText className="w-3.5 h-3.5 mr-2" /> 転機を振り返る
          </Button>
        </div>
      </section>

      <section className="surface-panel p-1 border-gold/10 bg-bg-panel/40 backdrop-blur-sm sticky bottom-2 z-30 shadow-2xl">
        <nav className="flex flex-wrap gap-1" aria-label="詳細分析タブ">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="report-tab-button flex-1 min-w-[80px]"
                data-active={activeTab === tab.id}
                aria-pressed={activeTab === tab.id}
              >
                <span className="inline-flex items-center justify-center gap-2 py-1">
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{tab.label}</span>
                </span>
              </button>
            );
          })}
        </nav>
      </section>
    </>
  );
};
