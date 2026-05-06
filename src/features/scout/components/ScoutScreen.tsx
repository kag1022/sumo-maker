import React from "react";
import { ExperimentPresetId, ObservationStanceId, Oyakata, RikishiStatus, SimulationRunOptions } from "../../../logic/models";
import {
  buildInitialRikishiFromDraft,
  buildScoutResolvedSeed,
  rollScoutDraft,
  ScoutDraft,
} from "../../../logic/scout/gacha";
import { resolveStableById, STABLE_CATALOG } from "../../../logic/simulation/heya/stableCatalog";
import type { SimulationPacing } from "../../simulation/store/simulationStore";
import type { GenerationTokenState } from "../../../logic/persistence/generationTokens";
import type { ObservationPointState } from "../../../logic/persistence/observationPoints";
import { isObserverUpgradeUnlocked } from "../../../logic/observer/upgrades";
import { useViewportMode } from "../../../shared/hooks/useViewportMode";
import { cn } from "../../../shared/lib/cn";
import { ScoutBasicProfileSection } from "./ScoutBasicProfileSection";
import { ScoutPremiseSection } from "./ScoutPremiseSection";
import {
  ScoutEntryLedger,
  ScoutInterpretationPreview,
} from "./ScoutInterpretationPreview";
import {
  ExperimentPresetPanel,
  ObservationStancePanel,
  ScoutCandidateShelf,
  ScoutDecisionPanel,
  ScoutHero,
} from "./ScoutStartPanel";
import { type ScoutStepId } from "./scoutScreenOptions";
import styles from "./ScoutScreen.module.css";

interface ScoutScreenProps {
  generationTokens: GenerationTokenState | null;
  observationPoints: ObservationPointState | null;
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    initialPacing?: SimulationPacing,
    runOptions?: SimulationRunOptions,
  ) => void | Promise<void>;
}

const cloneDraft = (draft: ScoutDraft): ScoutDraft => ({
  ...draft,
  profile: { ...draft.profile },
});

const createInitialScoutDraft = (): ScoutDraft => cloneDraft(rollScoutDraft());

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ generationTokens, observationPoints, onStart }) => {
  const { isMobileViewport } = useViewportMode();
  const [draft, setDraft] = React.useState<ScoutDraft>(createInitialScoutDraft);
  const [activeStep, setActiveStep] = React.useState<ScoutStepId>("identity");
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [experimentUnlocked, setExperimentUnlocked] = React.useState(false);
  const [experimentPresetId, setExperimentPresetId] = React.useState<ExperimentPresetId | null>(null);
  const [observationStanceId, setObservationStanceId] = React.useState<ObservationStanceId>("PROMOTION_EXPECTATION");

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      const unlocked = await isObserverUpgradeUnlocked("EXPERIMENT_LAB");
      if (!cancelled) setExperimentUnlocked(unlocked);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const previewStatus = React.useMemo(() => buildInitialRikishiFromDraft(draft), [draft]);
  const resolvedSeed = React.useMemo(() => buildScoutResolvedSeed(draft), [draft]);
  const activeStable = React.useMemo(
    () => resolveStableById(draft.selectedStableId ?? "") ?? STABLE_CATALOG[0],
    [draft.selectedStableId],
  );

  const updateDraft = React.useCallback(
    <K extends keyof ScoutDraft>(key: K, value: ScoutDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleCycleCandidate = React.useCallback(() => {
    setDraft(createInitialScoutDraft());
  }, []);

  const handleRegister = React.useCallback(async () => {
    setIsRegistering(true);
    try {
      await onStart(
        buildInitialRikishiFromDraft(draft),
        null,
        "skip_to_end",
        experimentPresetId
          ? { observationRuleMode: "EXPERIMENT", observationStanceId, experimentPresetId }
          : { observationRuleMode: "STANDARD", observationStanceId },
      );
    } finally {
      setIsRegistering(false);
    }
  }, [draft, experimentPresetId, observationStanceId, onStart]);

  const identitySummary = `${draft.shikona || "未命名"} / ${draft.birthplace || "出身未設定"}`;
  const seedSummary = `${draft.entryAge}歳 / ${resolvedSeed.entryPathLabel} / ${resolvedSeed.temperamentLabel}`;
  const bodySummary = `${draft.startingHeightCm}cm / ${draft.startingWeightKg}kg / ${activeStable.displayName}`;
  const entryLabel = `${draft.entryAge}歳 / ${resolvedSeed.entryPathLabel}`;
  const register = () => void handleRegister();

  const sections = (
    <>
      <ScoutBasicProfileSection
        draft={draft}
        activeStep={activeStep}
        summary={identitySummary}
        onActivate={setActiveStep}
        onNext={() => setActiveStep("seed")}
        onUpdateDraft={updateDraft}
      />
      <ScoutPremiseSection
        draft={draft}
        activeStep={activeStep}
        seedSummary={seedSummary}
        bodySummary={bodySummary}
        onActivate={setActiveStep}
        onUpdateDraft={updateDraft}
      />
    </>
  );

  const entryLedger = (
    <ScoutEntryLedger
      draft={draft}
      entryLabel={entryLabel}
      stableName={activeStable.displayName}
      previewBodyType={previewStatus.bodyType}
      previewBodyMetrics={previewStatus.bodyMetrics}
      mode={isMobileViewport ? "mobile" : "desktop"}
      resolvedSeed={resolvedSeed}
    />
  );

  if (isMobileViewport) {
    return (
      <div className={cn(styles.shell, styles.shellMobile)}>
        <ScoutHero
          activeStep={activeStep}
          onActivateStep={setActiveStep}
          generationTokens={generationTokens}
          observationPoints={observationPoints}
        />
        {entryLedger}
        <div className={styles.mobileMain}>
          {sections}
          <ScoutCandidateShelf onCycleCandidate={handleCycleCandidate} mode="mobile" />
          <ObservationStancePanel value={observationStanceId} onChange={setObservationStanceId} />
          <ScoutDecisionPanel
            generationTokens={generationTokens}
            observationPoints={observationPoints}
            isRegistering={isRegistering}
            onRegister={register}
            mode="mobile"
          />
          {experimentUnlocked ? (
            <ExperimentPresetPanel value={experimentPresetId} onChange={setExperimentPresetId} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.shell}>
      <ScoutHero
        activeStep={activeStep}
        onActivateStep={setActiveStep}
        generationTokens={generationTokens}
        observationPoints={observationPoints}
      />

      <div className={styles.layout}>
        <main className={styles.main}>
          {sections}
          <ObservationStancePanel value={observationStanceId} onChange={setObservationStanceId} />
          <ScoutDecisionPanel
            generationTokens={generationTokens}
            observationPoints={observationPoints}
            isRegistering={isRegistering}
            onRegister={register}
            mode="desktop"
          />
          {experimentUnlocked ? (
            <ExperimentPresetPanel value={experimentPresetId} onChange={setExperimentPresetId} />
          ) : null}
        </main>

        <aside className={styles.aside}>
          <ScoutCandidateShelf onCycleCandidate={handleCycleCandidate} mode="desktop" />
          {entryLedger}
          <ScoutInterpretationPreview status={previewStatus} />
        </aside>
      </div>
    </div>
  );
};
