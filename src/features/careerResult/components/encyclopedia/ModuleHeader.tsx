import React from "react";
import { SignalLed, type SignalLedState } from "./SignalLed";
import styles from "./ModuleHeader.module.css";

interface ModuleHeaderProps {
  kicker?: string;
  title: string;
  copy?: string;
  size?: "sm" | "md" | "lg";
  density?: "compact" | "default" | "loose";
  led?: SignalLedState;
  statusTag?: string;
  action?: React.ReactNode;
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({
  kicker,
  title,
  copy,
  size = "md",
  density = "default",
  led,
  statusTag,
  action,
}) => {
  return (
    <div
      className={styles.head}
      data-size={size === "md" ? undefined : size}
      data-density={density === "default" ? undefined : density}
    >
      <div className={styles.identity}>
        {kicker || led ? (
          <div className={styles.kicker}>
            {led ? <SignalLed state={led} size="sm" /> : null}
            {kicker ? <em>{kicker}</em> : null}
          </div>
        ) : null}
        <h3 className={styles.title}>{title}</h3>
        {copy ? <p className={styles.copy}>{copy}</p> : null}
      </div>
      {(statusTag || action) ? (
        <div className={styles.action}>
          {statusTag ? <span className={styles.statusTag}>{statusTag}</span> : null}
          {action}
        </div>
      ) : null}
    </div>
  );
};
