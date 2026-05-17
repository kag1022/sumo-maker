import React from "react";
import { useLocale } from "../../../../shared/hooks/useLocale";
import type { CareerMilestoneView } from "../../utils/careerMilestones";
import { BracketFrame } from "./BracketFrame";
import { ModuleHeader } from "./ModuleHeader";
import styles from "./EventLog.module.css";

interface EventLogProps {
  milestones: CareerMilestoneView[];
}

const JAPANESE_TEXT_PATTERN = /[ぁ-んァ-ン一-龥]/;

const textForEnglish = (value: string, fallback: string): string =>
  JAPANESE_TEXT_PATTERN.test(value) ? fallback : value;

export const EventLog: React.FC<EventLogProps> = ({ milestones }) => {
  const { locale } = useLocale();
  if (milestones.length === 0) return null;

  return (
    <BracketFrame variant="log" padding="default">
      <div className={styles.log}>
        <ModuleHeader
          title={locale === "en" ? "Career Milestones" : "一代の節目"}
          copy={locale === "en" ? "Major events are pulled out from debut through retirement." : "初土俵から終幕まで、主な出来事だけを抜き出します。"}
          kicker={locale === "en" ? "Timeline" : "年表"}
        />
        <div className={styles.rail} role="list" aria-label={locale === "en" ? "Career milestones" : "一代の節目"}>
          {milestones.map((milestone) => (
            <article key={milestone.key} className={styles.item} data-tone={milestone.tone} role="listitem">
              <div className={styles.timestamp}>
                <span>{milestone.bashoLabel}</span>
                <em>{milestone.recordLabel}</em>
              </div>
              <div className={styles.age}>
                <span>{locale === "en" ? "Age" : "年齢"}</span>
                <strong>{locale === "en" ? milestone.ageLabel.replace("歳", " yrs") : milestone.ageLabel}</strong>
              </div>
              <div className={styles.event}>
                <strong>{locale === "en" ? textForEnglish(milestone.label, "Milestone") : milestone.label}</strong>
                <em>{milestone.rankLabel}</em>
              </div>
              <p className={styles.desc}>{locale === "en" ? textForEnglish(milestone.description, "A notable career event was recorded here.") : milestone.description}</p>
            </article>
          ))}
        </div>
      </div>
    </BracketFrame>
  );
};
