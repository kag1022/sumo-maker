import React from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import type { RikishiStatus } from "../../../logic/models";

const STAT_LABELS: Record<keyof RikishiStatus["stats"], string> = {
  tsuki: "突き",
  oshi: "押し",
  kumi: "組力",
  nage: "投げ",
  koshi: "腰",
  deashi: "出足",
  waza: "技術",
  power: "筋力",
};

const RADAR_STATS: Array<keyof RikishiStatus["stats"]> = [
  "tsuki",
  "oshi",
  "kumi",
  "nage",
  "koshi",
  "deashi",
  "waza",
  "power",
];

interface ScoutStatPreviewProps {
  status: RikishiStatus;
}

export const ScoutStatPreview: React.FC<ScoutStatPreviewProps> = ({ status }) => {
  const data = RADAR_STATS.map((key) => ({
    subject: STAT_LABELS[key],
    value: Math.round(status.stats[key]),
    fullMark: 100,
  }));

  const bmi = status.bodyMetrics.weightKg / (status.bodyMetrics.heightCm / 100) ** 2;
  const avgMakuuchiBmi = 40;
  const bmiLabel = bmi >= avgMakuuchiBmi + 4 ? "重量級" : bmi >= avgMakuuchiBmi - 2 ? "標準" : "軽量";

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[10px] ui-text-label tracking-[0.35em] text-[var(--ui-brand-line)]/55 uppercase mb-2">
          初期能力プレビュー
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <RadarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
            <PolarGrid stroke="rgba(255,255,255,0.08)" />
            <PolarAngleAxis
              dataKey="subject"
              tick={{ fontSize: 10, fill: "rgba(238,242,246,0.55)" }}
            />
            <Radar
              name="初期値"
              dataKey="value"
              stroke="var(--ui-brand-line)"
              fill="var(--ui-brand-line)"
              fillOpacity={0.2}
              strokeWidth={1.5}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {RADAR_STATS.map((key) => (
          <div key={key} className="flex items-center justify-between border border-white/8 bg-white/[0.02] px-2 py-1.5">
            <span className="text-[10px] text-text-dim">{STAT_LABELS[key]}</span>
            <div className="flex items-center gap-1.5">
              <div className="h-1 w-16 bg-white/8 overflow-hidden">
                <div
                  className="h-full bg-[var(--ui-brand-line)]/60 transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round(status.stats[key]))}%` }}
                />
              </div>
              <span className="text-[10px] text-text w-6 text-right font-medium">{Math.round(status.stats[key])}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 text-[10px] text-text-dim">
        <span>
          体格: {Math.round(status.bodyMetrics.heightCm)}cm / {Math.round(status.bodyMetrics.weightKg)}kg
        </span>
        <span className="text-[var(--ui-brand-line)]/60">{bmiLabel}</span>
      </div>
    </div>
  );
};
