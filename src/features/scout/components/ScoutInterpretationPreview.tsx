import React from "react";
import { CircleDot } from "lucide-react";
import type { RikishiStatus } from "../../../logic/models";
import {
  buildScoutResolvedSeed,
  type ScoutDraft,
} from "../../../logic/scout/gacha";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
import { cn } from "../../../shared/lib/cn";
import { ScoutStatPreview } from "./ScoutStatPreview";
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
}> = ({ status }) => (
  <section className={styles.previewPanel}>
    <ScoutStatPreview status={status} />
  </section>
);
