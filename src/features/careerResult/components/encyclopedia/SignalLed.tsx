import React from "react";
import styles from "./SignalLed.module.css";

export type SignalLedState = "active" | "locked" | "warn" | "info" | "off";

interface SignalLedProps {
  state?: SignalLedState;
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  className?: string;
  label?: string;
}

export const SignalLed: React.FC<SignalLedProps> = ({
  state = "off",
  size = "md",
  pulse = false,
  className,
  label,
}) => {
  const composed = [styles.led, className].filter(Boolean).join(" ");
  return (
    <span
      className={composed}
      data-state={state}
      data-size={size === "md" ? undefined : size}
      data-pulse={pulse ? "true" : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    />
  );
};
