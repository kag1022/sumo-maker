import React from "react";
import type { EntryArchetype, GrowthType, StyleArchetype } from "../../../logic/models";
import type { ScoutDraft, ScoutTalentProfile } from "../../../logic/scout/gacha";
import { cn } from "../../../shared/lib/cn";
import typography from "../../../shared/styles/typography.module.css";
import { FieldLegend, SectionCard } from "./ScoutFormPrimitives";
import {
  ENTRY_ARCHETYPE_OPTIONS,
  GROWTH_TYPE_OPTIONS,
  PREFERRED_STYLE_OPTIONS,
  TALENT_PROFILE_OPTIONS,
  type ScoutStepId,
} from "./scoutScreenOptions";
import styles from "./ScoutScreen.module.css";

const OptionalChoiceGrid = <T extends string>({
  value,
  autoLabel,
  autoNote,
  options,
  onChange,
}: {
  value: T | undefined;
  autoLabel: string;
  autoNote: string;
  options: Array<{ value: T; label: string; note: string }>;
  onChange: (value: T | undefined) => void;
}) => {
  return (
    <div className={styles.choiceGrid}>
      <button
        type="button"
        className={styles.choiceCard}
        data-active={value === undefined}
        onClick={() => onChange(undefined)}
      >
        <div className={cn(styles.choiceTitle, typography.heading)}>{autoLabel}</div>
        <div className={styles.choiceNote}>{autoNote}</div>
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.choiceCard}
          data-active={value === option.value}
          onClick={() => onChange(option.value)}
        >
          <div className={cn(styles.choiceTitle, typography.heading)}>{option.label}</div>
          <div className={styles.choiceNote}>{option.note}</div>
        </button>
      ))}
    </div>
  );
};

export const ScoutBuildModeSection: React.FC<{
  draft: ScoutDraft;
  activeStep: ScoutStepId;
  summary: string;
  onActivate: (step: ScoutStepId) => void;
  onUpdateDraft: <K extends keyof ScoutDraft>(key: K, value: ScoutDraft[K]) => void;
}> = ({ draft, activeStep, summary, onActivate, onUpdateDraft }) => {
  const handleEntryArchetypeChange = React.useCallback(
    (value: EntryArchetype | undefined) => {
      onUpdateDraft("entryArchetype", value);
      if (value === "TSUKEDASHI") {
        onUpdateDraft("entryAge", 22);
        onUpdateDraft("entryPath", "COLLEGE");
      } else if (value === "ELITE_TSUKEDASHI") {
        onUpdateDraft("entryAge", 22);
        onUpdateDraft("entryPath", "CHAMPION");
      }
    },
    [onUpdateDraft],
  );

  return (
    <SectionCard
      step="build"
      activeStep={activeStep}
      summary={summary}
      onActivate={onActivate}
      onBack={() => onActivate("body")}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <FieldLegend label="成長型" description="能力値そのものではなく、伸びる時期と衰え方の前提です。" />
          <OptionalChoiceGrid<GrowthType>
            value={draft.growthType}
            autoLabel="候補札に任せる"
            autoNote="経歴と素質から自然な成長型を決めます。"
            options={GROWTH_TYPE_OPTIONS}
            onChange={(value) => onUpdateDraft("growthType", value)}
          />
        </div>

        <div className="space-y-3">
          <FieldLegend label="得意な型" description="初期能力値ではなく、相撲観と勝ち筋の入口を決めます。" />
          <OptionalChoiceGrid<StyleArchetype>
            value={draft.preferredStyle}
            autoLabel="体格と部屋に任せる"
            autoNote="身体素地と所属部屋から自然な型を決めます。"
            options={PREFERRED_STYLE_OPTIONS}
            onChange={(value) => onUpdateDraft("preferredStyle", value)}
          />
        </div>

        <div className="space-y-3">
          <FieldLegend label="付出・入門資格" description="前相撲から始めるか、付出や怪物候補として番付の入口を変えます。" />
          <OptionalChoiceGrid<EntryArchetype>
            value={draft.entryArchetype}
            autoLabel="候補札に任せる"
            autoNote="入門経路に応じた自然な資格で始めます。"
            options={ENTRY_ARCHETYPE_OPTIONS}
            onChange={handleEntryArchetypeChange}
          />
        </div>

        <div className="space-y-3">
          <FieldLegend label="素質の輪郭" description="数値ではなく、標準・有望・天才型という読み筋だけを選びます。" />
          <div className={styles.choiceGrid}>
            {TALENT_PROFILE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={styles.choiceCard}
                data-active={(draft.talentProfile ?? "AUTO") === option.value}
                onClick={() => onUpdateDraft("talentProfile", option.value as ScoutTalentProfile)}
              >
                <div className={cn(styles.choiceTitle, typography.heading)}>{option.label}</div>
                <div className={styles.choiceNote}>{option.note}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
};
