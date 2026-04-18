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
  <div className={clsx("chart-card", className)}>
    {(title || legend) ? (
      <div className="chart-card-head">
        <div className="chart-card-titleblock">
          {title ? (
            <div className="chart-card-titlerow">
              <span className="chart-card-title-mark" aria-hidden="true" />
              <span className="chart-card-title">{title}</span>
            </div>
          ) : null}
          {subtitle ? <div className="chart-card-subtitle">{subtitle}</div> : null}
        </div>
        {legend ? <div className="chart-card-legend">{legend}</div> : null}
      </div>
    ) : null}
    <div className="chart-card-body">{children}</div>
  </div>
);

interface ChartLegendItemProps {
  color: string;
  label: string;
}

export const ChartLegendItem: React.FC<ChartLegendItemProps> = ({ color, label }) => (
  <span className="chart-card-legend-item">
    <span className="chart-card-legend-swatch" style={{ backgroundColor: color }} />
    {label}
  </span>
);
