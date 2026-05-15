import React from "react";
import styles from "./DataSheet.module.css";

export interface DataSheetRow {
  label: string;
  value: string;
}

interface DataSheetProps {
  rows: DataSheetRow[];
  layout?: "stack" | "grid";
  mono?: boolean;
  className?: string;
}

export const DataSheet: React.FC<DataSheetProps> = ({ rows, layout = "stack", mono = false, className }) => {
  const composed = [styles.sheet, className].filter(Boolean).join(" ");
  return (
    <div className={composed} data-layout={layout} data-mono={mono ? "true" : undefined}>
      {rows.map((row) => (
        <div key={row.label} className={styles.row}>
          <span className={styles.label}>{row.label}</span>
          <strong className={styles.value}>{row.value}</strong>
        </div>
      ))}
    </div>
  );
};
