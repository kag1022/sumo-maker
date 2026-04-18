import React from "react";
import { clsx } from "clsx";
import type { Division } from "../../logic/models";

type BadgeDivision = Division | "Maezumo";

const DIVISION_STYLES: Record<BadgeDivision, { bg: string; text: string; label: string }> = {
  Makuuchi: { bg: "bg-[var(--chart-makuuchi)]/15 border border-[var(--chart-makuuchi)]/40", text: "text-[var(--chart-makuuchi)]", label: "幕内" },
  Juryo: { bg: "bg-[var(--chart-juryo)]/15 border border-[var(--chart-juryo)]/40", text: "text-[var(--chart-juryo)]", label: "十両" },
  Makushita: { bg: "bg-[var(--chart-makushita)]/15 border border-[var(--chart-makushita)]/40", text: "text-[var(--chart-makushita)]", label: "幕下" },
  Sandanme: { bg: "bg-[var(--chart-sandanme)]/15 border border-[var(--chart-sandanme)]/40", text: "text-[var(--chart-sandanme)]", label: "三段目" },
  Jonidan: { bg: "bg-[var(--chart-jonidan)]/15 border border-[var(--chart-jonidan)]/40", text: "text-[var(--chart-jonidan)]", label: "序二段" },
  Jonokuchi: { bg: "bg-[var(--chart-jonokuchi)]/15 border border-[var(--chart-jonokuchi)]/40", text: "text-[var(--chart-jonokuchi)]", label: "序ノ口" },
  Maezumo: { bg: "bg-white/5 border border-white/15", text: "text-text-dim", label: "前相撲" },
};

interface RankBadgeProps {
  division: BadgeDivision;
  name?: string;
  size?: "xs" | "sm";
  className?: string;
}

export const RankBadge: React.FC<RankBadgeProps> = ({ division, name, size = "xs", className }) => {
  const style = DIVISION_STYLES[division] ?? DIVISION_STYLES.Jonokuchi;
  const label = name ?? style.label;
  return (
    <span
      className={clsx(
        "inline-flex items-center px-1.5 py-0.5 ui-text-label font-medium",
        size === "xs" ? "text-[10px]" : "text-xs",
        style.bg,
        style.text,
        className,
      )}
    >
      {label}
    </span>
  );
};
