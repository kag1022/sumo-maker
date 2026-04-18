import React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartCard, ChartLegendItem } from "../../../shared/ui/ChartCard";
import type { CareerLedgerPoint } from "../utils/careerResultModel";

interface WinRatePoint {
  bashoSeq: number;
  label: string;
  cumulative: number;
  rolling: number | null;
}

const ROLLING_WINDOW = 5;

export const buildWinRateSeries = (points: CareerLedgerPoint[]): WinRatePoint[] => {
  let cumWins = 0;
  let cumDecisions = 0;
  return points.map((p, i) => {
    const decisions = p.wins + p.losses;
    cumWins += p.wins;
    cumDecisions += decisions;
    const cumulative = cumDecisions > 0 ? Math.round((cumWins / cumDecisions) * 1000) / 10 : 0;

    let rolling: number | null = null;
    if (i >= ROLLING_WINDOW - 1) {
      let rWins = 0;
      let rDecisions = 0;
      for (let j = i - ROLLING_WINDOW + 1; j <= i; j++) {
        rWins += points[j].wins;
        rDecisions += points[j].wins + points[j].losses;
      }
      rolling = rDecisions > 0 ? Math.round((rWins / rDecisions) * 1000) / 10 : null;
    }

    return {
      bashoSeq: p.bashoSeq,
      label: p.axisLabel || p.bashoLabel,
      cumulative,
      rolling,
    };
  });
};

const TOOLTIP_STYLE = {
  background: "#081223",
  border: "1px solid rgba(76, 93, 121, 0.95)",
  borderRadius: 0,
  fontSize: 11,
  color: "#eef2f6",
};

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE} className="px-2.5 py-2 space-y-0.5">
      <div className="text-[10px] text-text-dim">{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-1.5 text-[11px]">
          <span className="inline-block h-1.5 w-1.5" style={{ backgroundColor: entry.color }} />
          <span style={{ color: entry.color }}>{entry.name}</span>
          <span className="text-text font-medium">{entry.value?.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
};

interface WinRateTrendChartProps {
  points: CareerLedgerPoint[];
  height?: number;
}

export const WinRateTrendChart: React.FC<WinRateTrendChartProps> = ({ points, height = 160 }) => {
  const data = React.useMemo(() => buildWinRateSeries(points), [points]);
  if (data.length === 0) return null;

  const visibleTicks = data.filter((_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0).map((d) => d.bashoSeq);

  return (
    <ChartCard
      title="勝率推移"
      legend={
        <>
          <ChartLegendItem color="var(--chart-win)" label="累積勝率" />
          <ChartLegendItem color="var(--ui-action)" label={`直近${ROLLING_WINDOW}場所`} />
        </>
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="winRateFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-win)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--chart-win)" stopOpacity={0.03} />
            </linearGradient>
            <linearGradient id="rollingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--ui-action)" stopOpacity={0.15} />
              <stop offset="95%" stopColor="var(--ui-action)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
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
            domain={[0, 100]}
            ticks={[0, 30, 50, 60, 80, 100]}
            tickFormatter={(v) => `${v}%`}
            tick={{ fontSize: 9, fill: "rgba(238,242,246,0.4)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={50} stroke="rgba(238,242,246,0.12)" strokeDasharray="3 3" />
          <ReferenceLine y={60} stroke="var(--chart-win)" strokeOpacity={0.2} strokeDasharray="3 3" />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="累積勝率"
            stroke="var(--chart-win)"
            strokeWidth={1.5}
            fill="url(#winRateFill)"
            dot={false}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="rolling"
            name={`直近${ROLLING_WINDOW}場所`}
            stroke="var(--ui-action)"
            strokeWidth={1.5}
            strokeDasharray="4 2"
            fill="url(#rollingFill)"
            dot={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
