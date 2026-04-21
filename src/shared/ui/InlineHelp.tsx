import React from "react";
import { Info } from "lucide-react";
import styles from "./InlineHelp.module.css";

type HelpPlacement = "top" | "bottom";
type HelpTriggerMode = "hover-focus-press";

interface InlineHelpProps {
  label: string;
  description: string;
  placement?: HelpPlacement;
  triggerMode?: HelpTriggerMode;
}

export const InlineHelp: React.FC<InlineHelpProps> = ({
  label,
  description,
  placement = "top",
  triggerMode = "hover-focus-press",
}) => {
  void triggerMode;
  const [open, setOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLSpanElement | null>(null);
  const helpId = React.useId();

  return (
    <span
      ref={wrapperRef}
      className={styles.root}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(event) => {
        if (!wrapperRef.current?.contains(event.relatedTarget as Node | null)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className={styles.button}
        aria-label={label}
        aria-expanded={open}
        aria-controls={helpId}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        id={helpId}
        role="tooltip"
        className={styles.popover}
        data-open={open}
        data-placement={placement}
      >
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
    </span>
  );
};
