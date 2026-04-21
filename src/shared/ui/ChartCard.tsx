import React from "react";
import { cn } from "../lib/cn";
import styles from "./ChartCard.module.css";

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
  <div className={cn(styles.root, className)}>
    {(title || legend) ? (
      <div className={styles.head}>
        <div>
          {title ? (
            <div className={styles.titleRow}>
              <span className={styles.titleMark} aria-hidden="true" />
              <span className={styles.title}>{title}</span>
            </div>
          ) : null}
          {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
        </div>
        {legend ? <div className={styles.legend}>{legend}</div> : null}
      </div>
    ) : null}
    <div className={styles.body}>{children}</div>
  </div>
);

interface ChartLegendItemProps {
  color: string;
  label: string;
}

export const ChartLegendItem: React.FC<ChartLegendItemProps> = ({ color, label }) => (
  <span className={styles.legendItem}>
    <span className={styles.legendSwatch} style={{ backgroundColor: color }} />
    {label}
  </span>
);
