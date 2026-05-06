import React from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { InlineHelp } from "../../../shared/ui/InlineHelp";
import { Button } from "../../../shared/ui/Button";
import { cn } from "../../../shared/lib/cn";
import typography from "../../../shared/styles/typography.module.css";
import { STEP_COPY, STEP_ORDER, type ScoutStepId } from "./scoutScreenOptions";
import styles from "./ScoutScreen.module.css";

export const FieldLegend: React.FC<{
  label: string;
  description: string;
}> = ({ label, description }) => (
  <span className={styles.fieldLegend}>
    <span className={styles.sectionTitle}>{label}</span>
    <InlineHelp label={label} description={description} placement="top" />
  </span>
);

export const ChoiceGrid = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; note: string }>;
  onChange: (value: T) => void;
}) => {
  return (
    <div className={styles.choiceGrid}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={styles.choiceCard}
            data-active={active}
          >
            <div className={cn(styles.choiceTitle, typography.heading)}>{option.label}</div>
            <div className={styles.choiceNote}>{option.note}</div>
          </button>
        );
      })}
    </div>
  );
};

export const SectionCard: React.FC<{
  step: ScoutStepId;
  activeStep: ScoutStepId;
  summary: string;
  children: React.ReactNode;
  onActivate: (step: ScoutStepId) => void;
  onNext?: () => void;
  onBack?: () => void;
}> = ({ step, activeStep, summary, children, onActivate, onNext, onBack }) => {
  const active = step === activeStep;
  return (
    <section className={styles.section} data-active={active}>
      <div className={styles.sectionHead}>
        <div>
          <div className={styles.sectionStep}>SLOT {STEP_ORDER.indexOf(step) + 1}</div>
          <h2 className={styles.sectionTitleText}>{STEP_COPY[step].title}</h2>
          <p className={styles.sectionCopy}>{active ? STEP_COPY[step].body : summary}</p>
        </div>
        <Button variant={active ? "secondary" : "outline"} size="sm" onClick={() => onActivate(step)}>
          {active ? "入力中" : "開く"}
        </Button>
      </div>

      {active ? (
        <div className={styles.sectionBody}>
          {children}
          <div className={styles.sectionFooter}>
            {onBack ? (
              <Button variant="ghost" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                前の区画へ
              </Button>
            ) : <span />}
            {onNext ? (
              <Button variant="secondary" onClick={onNext}>
                {STEP_COPY[step].action}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};
