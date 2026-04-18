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
  default: "border-white/12 bg-white/[0.035]",
  gold: "border-[var(--chart-makuuchi)]/35 bg-[var(--chart-makuuchi)]/8",
  win: "border-[var(--chart-win)]/35 bg-[var(--chart-win)]/8",
  loss: "border-[var(--chart-loss)]/35 bg-[var(--chart-loss)]/8",
  action: "border-[var(--ui-action)]/35 bg-[var(--ui-action)]/8",
  warning: "border-[var(--ui-warning)]/35 bg-[var(--ui-warning)]/8",
};

const TONE_ACCENT: Record<Tone, string> = {
  default: "bg-white/20",
  gold: "bg-[var(--chart-makuuchi)]",
  win: "bg-[var(--chart-win)]",
  loss: "bg-[var(--chart-loss)]",
  action: "bg-[var(--ui-action)]",
  warning: "bg-[var(--ui-warning)]",
};

const TONE_LABEL_CLASSES: Record<Tone, string> = {
  default: "text-[var(--ui-brand-line)]/60",
  gold: "text-[var(--chart-makuuchi)]/80",
  win: "text-[var(--chart-win)]/80",
  loss: "text-[var(--chart-loss)]/80",
  action: "text-[var(--ui-action)]/80",
  warning: "text-[var(--ui-warning)]/80",
};

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  tone = "default",
  className,
  children,
}) => (
  <div className={clsx("relative border px-5 py-5 overflow-hidden", TONE_CLASSES[tone], className)}>
    <div className={clsx("absolute top-0 left-0 w-0.5 h-full", TONE_ACCENT[tone])} />
    <div className={clsx("text-[10px] ui-text-label tracking-[0.35em] uppercase mb-3", TONE_LABEL_CLASSES[tone])}>
      {label}
    </div>
    <div className="text-2xl sm:text-3xl ui-text-heading text-text leading-none">{value}</div>
    {subtext ? <div className="mt-2 text-xs text-text-dim">{subtext}</div> : null}
    {children}
  </div>
);
