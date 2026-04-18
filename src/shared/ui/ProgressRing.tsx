import React from "react";

interface ProgressRingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: React.ReactNode;
  className?: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  max = 100,
  size = 64,
  strokeWidth = 5,
  color = "var(--ui-brand-line)",
  trackColor = "rgba(255,255,255,0.06)",
  label,
  className,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, Math.max(0, value / max));
  const offset = circumference * (1 - pct);

  return (
    <div className={`relative inline-flex items-center justify-center ${className ?? ""}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="square"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      {label ? (
        <div className="absolute inset-0 flex items-center justify-center text-center">
          {label}
        </div>
      ) : null}
    </div>
  );
};
