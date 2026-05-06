import React from "react";
import type { ScoutDraft } from "../../../logic/scout/gacha";
import { cn } from "../../../shared/lib/cn";
import typography from "../../../shared/styles/typography.module.css";
import { ChoiceGrid, FieldLegend, SectionCard } from "./ScoutFormPrimitives";
import {
  ENTRY_AGE_OPTIONS,
  FIELD_OPTIONS,
  HEIGHT_OPTIONS,
  stableOptions,
  type ScoutStepId,
  WEIGHT_OPTIONS,
} from "./scoutScreenOptions";
import styles from "./ScoutScreen.module.css";

export const ScoutPremiseSection: React.FC<{
  draft: ScoutDraft;
  activeStep: ScoutStepId;
  seedSummary: string;
  bodySummary: string;
  onActivate: (step: ScoutStepId) => void;
  onUpdateDraft: <K extends keyof ScoutDraft>(key: K, value: ScoutDraft[K]) => void;
}> = ({ draft, activeStep, seedSummary, bodySummary, onActivate, onUpdateDraft }) => (
  <>
    <SectionCard
      step="seed"
      activeStep={activeStep}
      summary={seedSummary}
      onActivate={onActivate}
      onBack={() => onActivate("identity")}
      onNext={() => onActivate("body")}
    >
      <div className="space-y-5">
        <div className="space-y-3">
          <FieldLegend label="入門年齢" description="入口の年齢で初期の見られ方と経歴の重みが変わります。" />
          <div className="grid gap-3 sm:grid-cols-3">
            {ENTRY_AGE_OPTIONS.map((age) => (
              <button
                key={age}
                type="button"
                onClick={() => onUpdateDraft("entryAge", age)}
                className={styles.choiceCard}
                data-active={draft.entryAge === age}
              >
                <div className={cn(styles.choiceTitle, typography.heading)}>{age}歳入門</div>
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <FieldLegend label="入門経路" description="入口の肩書や下地を決めます。序盤の期待値と読み味に影響します。" />
          <ChoiceGrid
            value={draft.entryPath}
            options={FIELD_OPTIONS.entryPath}
            onChange={(value) => onUpdateDraft("entryPath", value)}
          />
        </div>
        <div className="space-y-3">
          <FieldLegend label="気質" description="停滞や反発、再浮上の受け止め方に残る性格の芯です。" />
          <ChoiceGrid
            value={draft.temperament}
            options={FIELD_OPTIONS.temperament}
            onChange={(value) => onUpdateDraft("temperament", value)}
          />
        </div>
      </div>
    </SectionCard>

    <SectionCard
      step="body"
      activeStep={activeStep}
      summary={bodySummary}
      onActivate={onActivate}
      onBack={() => onActivate("seed")}
    >
      <div className="space-y-5">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <FieldLegend label="身長" description="体格の輪郭を決めます。届く間合いや最終形に影響します。" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {HEIGHT_OPTIONS.map((height) => (
                <button
                  key={height}
                  type="button"
                  onClick={() => onUpdateDraft("startingHeightCm", height)}
                  className={styles.sizeChip}
                  data-active={draft.startingHeightCm === height}
                >
                  {height}cm
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <FieldLegend label="体重" description="押し圧力や最終的な身体像に影響します。" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {WEIGHT_OPTIONS.map((weight) => (
                <button
                  key={weight}
                  type="button"
                  onClick={() => onUpdateDraft("startingWeightKg", weight)}
                  className={styles.sizeChip}
                  data-active={draft.startingWeightKg === weight}
                >
                  {weight}kg
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <FieldLegend label="身体の素地" description="長さ、重さ、弾みなど、成長の方向性を決める土台です。" />
          <ChoiceGrid
            value={draft.bodySeed}
            options={FIELD_OPTIONS.bodySeed}
            onChange={(value) => onUpdateDraft("bodySeed", value)}
          />
        </div>
        <div className="space-y-3">
          <FieldLegend label="所属部屋" description="入口の環境です。資料帳に残る所属と稽古の空気感を決めます。" />
          <div className="grid gap-3 md:grid-cols-3">
            {stableOptions.map((stable) => (
              <button
                key={stable.value}
                type="button"
                onClick={() => onUpdateDraft("selectedStableId", stable.value)}
                className={styles.choiceCard}
                data-active={draft.selectedStableId === stable.value}
              >
                <div className={cn(styles.choiceTitle, typography.heading)}>{stable.label}</div>
                <div className={styles.choiceNote}>{stable.note}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  </>
);
