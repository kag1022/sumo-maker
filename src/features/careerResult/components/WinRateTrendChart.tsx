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
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ fontSize: 10, color: "rgba(228, 218, 192, 0.6)", letterSpacing: "0.08em" }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.name} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
          <span style={{ display: "inline-block", width: 8, height: 2, backgroundColor: entry.color }} />
          <span style={{ color: entry.color, fontSize: 10 }}>{entry.name}</span>
          <span style={{ color: "#f5ecd8", fontFamily: "'DotGothic16', monospace", fontSize: 11 }}>
            {entry.value?.toFixed(1)}%
          </span>
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
      subtitle="累積と直近の流れ"
      legend={
        <>
          <ChartLegendItem color="#c49a4d" label="累積" />
          <ChartLegendItem color="#4c7bff" label={`直近${ROLLING_WINDOW}場所`} />
        </>
      }
    >
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 4 }}>
          <defs>
            <linearGradient id="winRateFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#c49a4d" stopOpacity={0.32} />
              <stop offset="95%" stopColor="#c49a4d" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="rollingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#4c7bff" stopOpacity={0.14} />
              <stop offset="95%" stopColor="#4c7bff" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="1 5"
            stroke="rgba(196, 154, 77, 0.14)"
            vertical={false}
          />
          <XAxis
            dataKey="bashoSeq"
            ticks={visibleTicks}
            tickFormatter={(seq) => data.find((d) => d.bashoSeq === seq)?.label ?? ""}
            tick={{ fontSize: 9, fill: "rgba(228, 218, 192, 0.45)", fontFamily: "'Shippori Mincho', serif", letterSpacing: "0.08em" }}
            axisLine={{ stroke: "rgba(196, 154, 77, 0.28)", strokeWidth: 1 }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 50, 80, 100]}
            tickFormatter={(v) => `${v}`}
            tick={{ fontSize: 9, fill: "rgba(228, 218, 192, 0.45)", fontFamily: "'DotGothic16', monospace" }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(196, 154, 77, 0.35)", strokeWidth: 1 }} />
          <ReferenceLine
            y={50}
            stroke="rgba(203, 122, 92, 0.35)"
            strokeDasharray="4 4"
            label={{ value: "勝越ライン", position: "insideTopRight", fontSize: 8, fill: "rgba(203, 122, 92, 0.55)", offset: 4 }}
          />
          <ReferenceLine y={80} stroke="rgba(196, 154, 77, 0.2)" strokeDasharray="2 6" />
          <Area
            type="monotone"
            dataKey="cumulative"
            name="累積勝率"
            stroke="#c49a4d"
            strokeWidth={1.8}
            fill="url(#winRateFill)"
            dot={false}
            connectNulls={false}
          />
          <Area
            type="monotone"
            dataKey="rolling"
            name={`直近${ROLLING_WINDOW}場所`}
            stroke="#4c7bff"
            strokeWidth={1.2}
            strokeDasharray="3 3"
            fill="url(#rollingFill)"
            dot={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};
