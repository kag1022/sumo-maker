import React from "react";
import type { ScoutDraft } from "../../../logic/scout/gacha";
import { cn } from "../../../shared/lib/cn";
import { FieldLegend, SectionCard } from "./ScoutFormPrimitives";
import type { ScoutStepId } from "./scoutScreenOptions";
import styles from "./ScoutScreen.module.css";

export const ScoutBasicProfileSection: React.FC<{
  draft: ScoutDraft;
  activeStep: ScoutStepId;
  summary: string;
  onActivate: (step: ScoutStepId) => void;
  onNext: () => void;
  onUpdateDraft: <K extends keyof ScoutDraft>(key: K, value: ScoutDraft[K]) => void;
}> = ({ draft, activeStep, summary, onActivate, onNext, onUpdateDraft }) => (
  <SectionCard
    step="identity"
    activeStep={activeStep}
    summary={summary}
    onActivate={onActivate}
    onNext={onNext}
  >
    <div className="grid gap-4 md:grid-cols-2">
      <label className="space-y-2">
        <FieldLegend label="四股名" description="プレイ中ずっと表示される名前です。未確定でも後から調整できます。" />
        <input
          value={draft.shikona}
          onChange={(event) => onUpdateDraft("shikona", event.target.value)}
          className={cn(styles.textInput, styles.nameInput)}
        />
      </label>
      <label className="space-y-2">
        <FieldLegend label="出身地" description="記録帳の表紙に残る基本情報です。" />
        <input
          value={draft.birthplace}
          onChange={(event) => onUpdateDraft("birthplace", event.target.value)}
          className={styles.textInput}
        />
      </label>
    </div>
    <label className="block space-y-2">
      <FieldLegend label="入口要約" description="この新弟子をどういう人物として見始めるかを短く決めます。" />
      <textarea
        value={draft.personaLine ?? ""}
        rows={3}
        onChange={(event) => onUpdateDraft("personaLine", event.target.value)}
        className={styles.textArea}
      />
    </label>
  </SectionCard>
);
