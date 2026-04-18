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

const TOOLTIP_STYLE = {
  background: "#081223",
  border: "1px solid rgba(76, 93, 121, 0.95)",
  borderRadius: 0,
  fontSize: 11,
  color: "#eef2f6",
};

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-2.5 py-2">
      <div className="text-[10px] text-text-dim">{label}</div>
      <div className="text-[11px] text-text font-medium">{payload[0].value.toFixed(1)} kg</div>
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
    <ChartCard title="体重推移" subtitle={peakWeight ? `ピーク ${peakWeight.toFixed(0)}kg` : undefined}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="bashoSeq"
            ticks={visibleTicks}
            tickFormatter={(seq) => data.find((d) => d.bashoSeq === seq)?.label ?? ""}
            tick={{ fontSize: 9, fill: "rgba(238,242,246,0.4)" }}
            axisLine={{ stroke: "var(--chart-axis)" }}
            tickLine={false}
          />
          <YAxis
            domain={[minW, maxW]}
            tickFormatter={(v) => `${v}`}
            tick={{ fontSize: 9, fill: "rgba(238,242,246,0.4)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          {entryWeight ? (
            <ReferenceLine
              y={entryWeight}
              stroke="var(--chart-axis)"
              strokeDasharray="3 3"
              label={{ value: "入門時", position: "insideTopRight", fontSize: 9, fill: "rgba(238,242,246,0.4)" }}
            />
          ) : null}
          {peakWeight && peakWeight !== entryWeight ? (
            <ReferenceLine
              y={peakWeight}
              stroke="var(--chart-makuuchi)"
              strokeOpacity={0.4}
              strokeDasharray="3 3"
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="weightKg"
            stroke="var(--chart-sandanme)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
