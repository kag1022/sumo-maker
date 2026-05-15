import React from "react";
import { ModuleHeader } from "./ModuleHeader";
import { BracketFrame } from "./BracketFrame";
import styles from "./TelemetryModule.module.css";

export type TelemetryTone = "story" | "style" | "stable" | "record";

interface TelemetryModuleProps {
  signalCode?: string;
  signalName?: string;
  title: string;
  copy?: string;
  tone?: TelemetryTone;
  children: React.ReactNode;
}

export const TelemetryModule: React.FC<TelemetryModuleProps> = ({
  title,
  copy,
  tone = "story",
  children,
}) => {
  return (
    <div className={styles.module} data-tone={tone}>
      <ModuleHeader
        title={title}
        copy={copy}
        size="sm"
        density="compact"
      />
      {children}
    </div>
  );
};

interface TelemetryGridProps {
  children: React.ReactNode;
}

export const TelemetryGrid: React.FC<TelemetryGridProps> = ({ children }) => {
  return (
    <BracketFrame variant="module" padding="zero">
      <div className={styles.grid}>{children}</div>
    </BracketFrame>
  );
};

interface TelemetryGridCellProps {
  tone: TelemetryTone;
  children: React.ReactNode;
}

export const TelemetryGridCell: React.FC<TelemetryGridCellProps> = ({ tone, children }) => {
  return (
    <article className={styles.gridCell} data-tone={tone}>
      {children}
    </article>
  );
};

interface CopyStackProps {
  lines: string[];
}

export const CopyStack: React.FC<CopyStackProps> = ({ lines }) => (
  <div className={styles.copyStack}>
    {lines.map((line) => (
      <p key={line}>{line}</p>
    ))}
  </div>
);

interface ChipListProps {
  items: Array<{ key: string; label: string }>;
}

export const ChipList: React.FC<ChipListProps> = ({ items }) => (
  <div className={styles.rareList}>
    {items.map((item) => (
      <span key={item.key}>{item.label}</span>
    ))}
  </div>
);

export const Lead: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className={styles.lead}>{children}</p>
);
