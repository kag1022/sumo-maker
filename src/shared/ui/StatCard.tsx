import React from "react";
import { clsx } from "clsx";

type Tone = "default" | "gold" | "win" | "loss" | "action" | "warning";

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  subtext?: string;
  tone?: Tone;
  className?: string;
  children?: React.ReactNode;
}

const TONE_CLASSES: Record<Tone, string> = {
  default: "border-white/10 bg-white/[0.03]",
  gold: "border-[var(--chart-makuuchi)]/25 bg-[var(--chart-makuuchi)]/5",
  win: "border-[var(--chart-win)]/25 bg-[var(--chart-win)]/5",
  loss: "border-[var(--chart-loss)]/25 bg-[var(--chart-loss)]/5",
  action: "border-[var(--ui-action)]/25 bg-[var(--ui-action)]/5",
  warning: "border-[var(--ui-warning)]/25 bg-[var(--ui-warning)]/5",
};

const TONE_LABEL_CLASSES: Record<Tone, string> = {
  default: "text-[var(--ui-brand-line)]/55",
  gold: "text-[var(--chart-makuuchi)]/70",
  win: "text-[var(--chart-win)]/70",
  loss: "text-[var(--chart-loss)]/70",
  action: "text-[var(--ui-action)]/70",
  warning: "text-[var(--ui-warning)]/70",
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  tone = "default",
  className,
  children,
}) => (
  <div className={clsx("border px-4 py-4", TONE_CLASSES[tone], className)}>
    <div className={clsx("text-[10px] ui-text-label tracking-[0.35em] uppercase", TONE_LABEL_CLASSES[tone])}>
      {label}
    </div>
    <div className="mt-2 text-2xl ui-text-heading text-text leading-none">{value}</div>
    {subtext ? <div className="mt-1 text-xs text-text-dim">{subtext}</div> : null}
    {children}
  </div>
);
