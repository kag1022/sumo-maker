import React from "react";
import { clsx } from "clsx";
import styles from "./Tabs.module.css";

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
        styles.root,
        className,
      )}
      data-variant={variant}
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
              styles.tab,
            )}
            data-active={isActive}
            data-size={size}
            data-variant={variant}
          >
            {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
