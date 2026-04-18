import React from "react";
import { clsx } from "clsx";

interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  activeId: T;
  onChange: (id: T) => void;
  variant?: "underline" | "pill";
  size?: "sm" | "md";
  className?: string;
}

export function Tabs<T extends string>({
  items,
  activeId,
  onChange,
  variant = "underline",
  size = "sm",
  className,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={clsx(
        "flex",
        variant === "underline" ? "border-b border-white/10 gap-0" : "gap-1 flex-wrap",
        className,
      )}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={clsx(
              "inline-flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed",
              size === "sm" ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm",
              variant === "underline"
                ? clsx(
                    "border-b-2 -mb-px ui-text-label",
                    isActive
                      ? "border-[var(--ui-brand-line)] text-text"
                      : "border-transparent text-text-dim hover:text-text hover:border-white/20",
                  )
                : clsx(
                    "border ui-text-label",
                    isActive
                      ? "border-[var(--ui-brand-line)]/45 bg-[var(--ui-brand-line)]/12 text-text"
                      : "border-white/10 bg-transparent text-text-dim hover:border-white/20 hover:text-text",
                  ),
            )}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
