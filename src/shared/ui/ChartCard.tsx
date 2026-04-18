import React from "react";
import { clsx } from "clsx";

interface ChartCardProps {
  title?: string;
  subtitle?: string;
  legend?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  legend,
  className,
  children,
}) => (
  <div className={clsx("border border-white/10 bg-white/[0.02] px-4 py-4", className)}>
    {(title || legend) ? (
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          {title ? (
            <div className="text-[10px] ui-text-label tracking-[0.35em] text-[var(--ui-brand-line)]/55 uppercase">
              {title}
            </div>
          ) : null}
          {subtitle ? (
            <div className="mt-0.5 text-xs text-text-dim">{subtitle}</div>
          ) : null}
        </div>
        {legend ? <div className="flex flex-wrap gap-3 text-[10px] text-text-dim">{legend}</div> : null}
      </div>
    ) : null}
    {children}
  </div>
);

interface ChartLegendItemProps {
  color: string;
  label: string;
}

export const ChartLegendItem: React.FC<ChartLegendItemProps> = ({ color, label }) => (
  <span className="flex items-center gap-1">
    <span className="inline-block h-2 w-2 rounded-none" style={{ backgroundColor: color }} />
    {label}
  </span>
);
