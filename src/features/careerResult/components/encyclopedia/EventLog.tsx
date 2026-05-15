import React from "react";
import type { CareerMilestoneView } from "../../utils/careerMilestones";
import { BracketFrame } from "./BracketFrame";
import { ModuleHeader } from "./ModuleHeader";
import styles from "./EventLog.module.css";

interface EventLogProps {
  milestones: CareerMilestoneView[];
}

export const EventLog: React.FC<EventLogProps> = ({ milestones }) => {
  if (milestones.length === 0) return null;

  return (
    <BracketFrame variant="log" padding="default">
      <div className={styles.log}>
        <ModuleHeader
          title="一代の節目"
          copy="初土俵から終幕まで、主な出来事だけを抜き出します。"
          kicker="年表"
        />
        <div className={styles.rail} role="list" aria-label="一代の節目">
          {milestones.map((milestone) => (
            <article key={milestone.key} className={styles.item} data-tone={milestone.tone} role="listitem">
              <div className={styles.timestamp}>
                <span>{milestone.bashoLabel}</span>
                <em>{milestone.recordLabel}</em>
              </div>
              <div className={styles.age}>
                <span>年齢</span>
                <strong>{milestone.ageLabel}</strong>
              </div>
              <div className={styles.event}>
                <strong>{milestone.label}</strong>
                <em>{milestone.rankLabel}</em>
              </div>
              <p className={styles.desc}>{milestone.description}</p>
            </article>
          ))}
        </div>
      </div>
    </BracketFrame>
  );
};
