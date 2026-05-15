import React from "react";
import { CircleDot, ScrollText } from "lucide-react";
import type { RikishiStatus } from "../../../logic/models";
import {
  buildScoutResolvedSeed,
  type ScoutDraft,
} from "../../../logic/scout/gacha";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
import { cn } from "../../../shared/lib/cn";
import styles from "./ScoutScreen.module.css";

type ResolvedSeed = ReturnType<typeof buildScoutResolvedSeed>;

export const ScoutEntryLedger: React.FC<{
  draft: ScoutDraft;
  entryLabel: string;
  stableName: string;
  previewBodyType: RikishiStatus["bodyType"];
  previewBodyMetrics: RikishiStatus["bodyMetrics"];
  mode: "desktop" | "mobile";
  resolvedSeed: ResolvedSeed;
}> = ({ draft, entryLabel, stableName, previewBodyType, previewBodyMetrics, mode, resolvedSeed }) => (
  <section className={mode === "desktop" ? cn(styles.previewPanel, styles.entryLedger) : styles.mobileLedger}>
    <div className={styles.entryLedgerHead}>
      <p className={styles.sectionTitle}>{mode === "desktop" ? "生成札プレビュー" : "現在の入口"}</p>
      <h2 className={cn(styles.entryLedgerName, mode === "mobile" && styles.entryLedgerNameMobile)}>
        {draft.shikona}
      </h2>
      <p className={styles.entryLedgerSub}>
        {draft.birthplace} / {stableName}
      </p>
    </div>

    {mode === "desktop" ? (
      <>
        <div className={styles.entryLedgerPortrait}>
          <RikishiPortrait
            bodyType={previewBodyType}
            bodyMetrics={previewBodyMetrics}
            stage="entry"
            className="h-full w-full"
            innerClassName="bg-transparent border-none p-0 shadow-none"
          />
        </div>
        <div className={styles.entryLedgerNote}>
          {draft.personaLine ?? "どこで人生の輪郭が立つかは、まだ白紙です。"}
        </div>
        <div className={styles.observationTags}>
          {[resolvedSeed.entryPathLabel, resolvedSeed.temperamentLabel, resolvedSeed.bodySeedLabel].map((label) => (
            <span key={label}>
              <CircleDot className="h-3 w-3" />
              {label}
            </span>
          ))}
        </div>
        <div className={styles.entryLedgerRows}>
          {[
            ["四股名", draft.shikona],
            ["出身", draft.birthplace],
            ["所属部屋", stableName],
            ["入口", entryLabel],
          ].map(([label, value]) => (
            <div key={label} className={styles.entryLedgerRow}>
              <span className={styles.metaLabel}>{label}</span>
              <span className={styles.entryLedgerValue}>{value ?? "-"}</span>
            </div>
          ))}
        </div>
      </>
    ) : (
      <div className={styles.mobileLedgerBody}>
        <div className={styles.mobileLedgerPortrait}>
          <RikishiPortrait
            bodyType={previewBodyType}
            bodyMetrics={previewBodyMetrics}
            stage="entry"
            className="h-full w-full"
            innerClassName="bg-transparent border-none p-0 shadow-none"
          />
        </div>
        <div className={styles.mobileLedgerCopy}>
          <div className={styles.entryLedgerNote}>
            {draft.personaLine ?? "どこで人生の輪郭が立つかは、まだ白紙です。"}
          </div>
          <div className={styles.observationTags}>
            {[resolvedSeed.entryPathLabel, resolvedSeed.temperamentLabel].map((label) => (
              <span key={label}>
                <CircleDot className="h-3 w-3" />
                {label}
              </span>
            ))}
          </div>
          <div className={styles.mobileLedgerGrid}>
            {[
              ["所属部屋", stableName],
              ["入口", entryLabel],
            ].map(([label, value]) => (
              <div key={label} className={styles.mobileLedgerCell}>
                <span className={styles.metaLabel}>{label}</span>
                <span className={styles.entryLedgerValue}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )}
  </section>
);

export const ScoutInterpretationPreview: React.FC<{
  status: RikishiStatus;
}> = ({ status }) => {
  const summary = status.buildSummary;
  const initial = summary?.initialConditionSummary;
  const growth = summary?.growthSummary;
  const lifeCards = summary?.lifeCards ?? [];
  const rows = [
    ["入口", initial?.entryPathLabel],
    ["資格", initial?.entryArchetypeLabel],
    ["素地", initial?.bodySeedLabel],
    ["気質", initial?.temperamentLabel],
    ["完成像", growth ? `${growth.peakHeightCm}cm / ${growth.peakWeightKg}kg` : undefined],
  ].filter(([, value]) => Boolean(value));

  return (
    <section className={styles.previewPanel}>
      <div className={styles.readingPreviewHead}>
        <p className={styles.sectionTitle}>設計読み</p>
        <h2 className={styles.decisionTitle}>数値ではなく、入口条件として読む</h2>
        <p className={styles.decisionCopy}>
          能力値の直接確認ではなく、どの前提が記録に残るかだけを確認します。
        </p>
      </div>
      <div className={styles.entryLedgerRows}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.entryLedgerRow}>
            <span className={styles.metaLabel}>{label}</span>
            <span className={styles.entryLedgerValue}>{value}</span>
          </div>
        ))}
      </div>
      {lifeCards.length > 0 ? (
        <div className={styles.readingSeeds}>
          {lifeCards.slice(0, 3).map((card) => (
            <div key={card.slot} className={styles.readingSeed}>
              <ScrollText className="h-4 w-4" />
              <div>
                <span>{card.slot}</span>
                <strong>{card.label}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
};
