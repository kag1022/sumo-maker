import React from "react";
import styles from "./BracketFrame.module.css";

export type BracketFrameVariant = "subject" | "module" | "log" | "console" | "data" | "phantom";

export type BracketFramePadding = "default" | "tight" | "loose" | "zero";

interface BracketFrameProps extends React.HTMLAttributes<HTMLElement> {
  variant?: BracketFrameVariant;
  padding?: BracketFramePadding;
  tag?: "section" | "article" | "div" | "aside";
  bodyClassName?: string;
  children: React.ReactNode;
}

export const BracketFrame: React.FC<BracketFrameProps> = ({
  variant = "module",
  padding = "default",
  tag = "section",
  className,
  bodyClassName,
  children,
  ...rest
}) => {
  const Tag = tag as React.ElementType;
  const padToken = padding === "default" ? undefined : padding;
  const composedClassName = [styles.frame, className].filter(Boolean).join(" ");
  const composedBodyClassName = [styles.bodyPad, bodyClassName].filter(Boolean).join(" ");

  return (
    <Tag className={composedClassName} data-variant={variant} {...rest}>
      <span className={styles.cornerNE} aria-hidden="true" />
      <span className={styles.cornerSW} aria-hidden="true" />
      <div className={composedBodyClassName} data-pad={padToken}>
        {children}
      </div>
    </Tag>
  );
};
