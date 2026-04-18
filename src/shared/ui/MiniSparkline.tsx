import React from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";

interface SparkPoint {
  value: number;
  label?: string;
}

interface MiniSparklineProps {
  data: SparkPoint[];
  color?: string;
  height?: number;
  width?: number | string;
  showTooltip?: boolean;
}

const CustomTooltip: React.FC<{
  active?: boolean;
  payload?: Array<{ value: number; payload: SparkPoint }>;
}> = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="border border-white/15 bg-[#081223] px-2 py-1 text-[10px] text-text-dim">
      {item.payload.label ? <div className="text-text-dim">{item.payload.label}</div> : null}
      <div className="font-medium text-text">{item.value}</div>
    </div>
  );
};

export const MiniSparkline: React.FC<MiniSparklineProps> = ({
  data,
  color = "var(--ui-brand-line)",
  height = 32,
  width = "100%",
  showTooltip = false,
}) => {
  if (data.length < 2) return null;
  return (
    <ResponsiveContainer width={width} height={height}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        {showTooltip ? <Tooltip content={<CustomTooltip />} /> : null}
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
