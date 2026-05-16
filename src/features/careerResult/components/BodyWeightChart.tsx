import React from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard } from "../../../shared/ui/ChartCard";

interface WeightPoint {
  bashoSeq: number;
  label: string;
  weightKg: number;
}

const TOOLTIP_STYLE: React.CSSProperties = {
  background: "rgba(14, 12, 8, 0.96)",
  border: "1px solid rgba(196, 154, 77, 0.42)",
  borderRadius: 0,
  fontFamily: "\"Shippori Mincho\", serif",
  fontSize: 11,
  color: "#f5ecd8",
  padding: "0.45rem 0.6rem",
};

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontSize: 10, color: "rgba(228, 218, 192, 0.6)", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 12, color: "#f5ecd8", fontFamily: "'DotGothic16', monospace", marginTop: 2 }}>
        {payload[0].value.toFixed(1)} <span style={{ fontSize: 9, opacity: 0.6 }}>kg</span>
      </div>
    </div>
  );
};

interface BodyWeightChartProps {
  bodyTimeline: Array<{ bashoSeq: number; year: number; month: number; weightKg: number }>;
  entryWeight?: number;
  peakWeight?: number;
  height?: number;
}

export const BodyWeightChart: React.FC<BodyWeightChartProps> = ({
  bodyTimeline,
  entryWeight,
  peakWeight,
  height = 120,
}) => {
  const data = React.useMemo<WeightPoint[]>(() => {
    return bodyTimeline.map((b) => ({
      bashoSeq: b.bashoSeq,
      label: `${b.year}.${String(b.month).padStart(2, "0")}`,
      weightKg: Math.round(b.weightKg * 10) / 10,
    }));
  }, [bodyTimeline]);

  if (data.length < 2) return null;

  const weights = data.map((d) => d.weightKg);
  const minW = Math.min(...weights) - 5;
  const maxW = Math.max(...weights) + 5;

  const visibleTicks = data
    .filter((_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 4) === 0)
    .map((d) => d.bashoSeq);

  return (
    <ChartCard
      title="体重推移"
      subtitle={peakWeight ? `ピーク ${peakWeight.toFixed(0)}kg` : "体重の変化"}
    >
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
          <defs>
            <linearGradient id="weightStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#c49a4d" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#c49a4d" stopOpacity={1} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="1 5"
            stroke="rgba(196, 154, 77, 0.12)"
            vertical={false}
          />
          <XAxis
            dataKey="bashoSeq"
            ticks={visibleTicks}
            tickFormatter={(seq) => data.find((d) => d.bashoSeq === seq)?.label ?? ""}
            tick={{ fontSize: 9, fill: "rgba(228, 218, 192, 0.45)", fontFamily: "'Shippori Mincho', serif" }}
            axisLine={{ stroke: "rgba(196, 154, 77, 0.28)", strokeWidth: 1 }}
            tickLine={false}
          />
          <YAxis
            domain={[minW, maxW]}
            tickFormatter={(v) => `${v}`}
            tick={{ fontSize: 9, fill: "rgba(228, 218, 192, 0.45)", fontFamily: "'DotGothic16', monospace" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(196, 154, 77, 0.35)", strokeWidth: 1 }} />
          {entryWeight ? (
            <ReferenceLine
              y={entryWeight}
              stroke="rgba(142, 155, 176, 0.32)"
              strokeDasharray="4 4"
              label={{ value: "入門", position: "insideTopLeft", fontSize: 9, fill: "rgba(228, 218, 192, 0.5)", offset: 4 }}
            />
          ) : null}
          {peakWeight && peakWeight !== entryWeight ? (
            <ReferenceLine
              y={peakWeight}
              stroke="rgba(196, 154, 77, 0.45)"
              strokeDasharray="2 3"
              label={{ value: "絶頂", position: "insideTopRight", fontSize: 9, fill: "rgba(196, 154, 77, 0.7)", offset: 4 }}
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="url(#weightStroke)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
