import React from "react";
import { clsx } from "clsx";

interface WinLossBarProps {
  wins: number;
  losses: number;
  absent?: number;
  showLabels?: boolean;
  height?: "sm" | "md";
  className?: string;
}

export const WinLossBar: React.FC<WinLossBarProps> = ({
  wins,
  losses,
  absent = 0,
  showLabels = true,
  height = "md",
  className,
}) => {
  const total = wins + losses + absent;
  if (total === 0) return null;

  const winPct = (wins / total) * 100;
  const lossPct = (losses / total) * 100;
  const absentPct = (absent / total) * 100;
  const h = height === "sm" ? "h-1.5" : "h-2.5";

  return (
    <div className={clsx("space-y-1", className)}>
      <div className={clsx("flex overflow-hidden rounded-none", h)}>
        {wins > 0 ? (
          <div
            className="transition-all duration-300"
            style={{ width: `${winPct}%`, backgroundColor: "var(--chart-win)" }}
          />
        ) : null}
        {losses > 0 ? (
          <div
            className="transition-all duration-300"
            style={{ width: `${lossPct}%`, backgroundColor: "var(--chart-loss)" }}
          />
        ) : null}
        {absent > 0 ? (
          <div
            className="transition-all duration-300"
            style={{ width: `${absentPct}%`, backgroundColor: "var(--chart-absent)" }}
          />
        ) : null}
      </div>
      {showLabels ? (
        <div className="flex gap-3 text-[10px] text-text-dim">
          <span style={{ color: "var(--chart-win)" }}>{wins}勝</span>
          <span style={{ color: "var(--chart-loss)" }}>{losses}敗</span>
          {absent > 0 ? <span style={{ color: "var(--chart-absent)" }}>{absent}休</span> : null}
        </div>
      ) : null}
    </div>
  );
};
