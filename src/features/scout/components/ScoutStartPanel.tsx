import React from "react";
import { Eye, RefreshCw, ScrollText, Sparkles, Ticket } from "lucide-react";
import type { ExperimentPresetId, ObservationStanceId } from "../../../logic/models";
import { OBSERVATION_STANCES } from "../../../logic/career/analysis";
import type { GenerationTokenState } from "../../../logic/persistence/generationTokens";
import type { ObservationPointState } from "../../../logic/persistence/observationPoints";
import { Button } from "../../../shared/ui/Button";
import { cn } from "../../../shared/lib/cn";
import typography from "../../../shared/styles/typography.module.css";
import {
  EXPERIMENT_PRESETS,
  GENERATION_MODE_OPTIONS,
  STEP_COPY,
  STEP_ORDER,
  type ScoutGenerationMode,
  type ScoutStepId,
} from "./scoutScreenOptions";
import styles from "./ScoutScreen.module.css";

const formatRegenTime = (seconds: number): string => {
  if (seconds <= 0) return "回復待機なし";
  const minutes = Math.ceil(seconds / 60);
  return `次回札まで約${minutes}分`;
};

const ScoutResourceBoard: React.FC<{
  generationTokens: GenerationTokenState | null;
  observationPoints: ObservationPointState | null;
}> = ({ generationTokens, observationPoints }) => {
  const tokenCount = generationTokens?.tokens ?? 0;
  const tokenCap = generationTokens?.cap ?? 5;
  const tokenRatio = tokenCap > 0 ? Math.min(1, tokenCount / tokenCap) : 0;
  const pointCount = observationPoints?.points ?? 0;
  const nextRegen = generationTokens?.nextRegenInSec ?? 0;

  return (
    <div className={styles.resourceBoard}>
      <div className={styles.resourceHeader}>
        <span className={styles.sectionTitle}>観測資源</span>
        <span className={styles.resourceTimer}>{formatRegenTime(nextRegen)}</span>
      </div>
      <div className={styles.resourceGrid}>
        <div className={styles.resourceTile}>
          <div className={styles.resourceIcon}>
            <Ticket className="h-4 w-4" />
          </div>
          <div>
            <span className={styles.metaLabel}>生成札</span>
            <strong className={styles.resourceValue}>{tokenCount}/{tokenCap}</strong>
          </div>
        </div>
        <div className={styles.resourceTile}>
          <div className={styles.resourceIcon}>
            <Eye className="h-4 w-4" />
          </div>
          <div>
            <span className={styles.metaLabel}>観測点</span>
            <strong className={styles.resourceValue}>{pointCount}</strong>
          </div>
        </div>
      </div>
      <div className={styles.tokenRail} aria-label="生成札の残数">
        <span style={{ width: `${tokenRatio * 100}%` }} />
      </div>
    </div>
  );
};

export const ScoutHero: React.FC<{
  activeStep: ScoutStepId;
  onActivateStep: (step: ScoutStepId) => void;
  generationTokens: GenerationTokenState | null;
  observationPoints: ObservationPointState | null;
  generationMode: ScoutGenerationMode;
}> = ({ activeStep, onActivateStep, generationTokens, observationPoints, generationMode }) => (
  <section className={styles.hero}>
    <div className={styles.heroCopy}>
      <div className={styles.kicker}>新弟子生成卓</div>
      <h1 className={styles.heroTitle}>候補札を鑑定して、相撲人生を観測に出す</h1>
      <p className={styles.heroDescription}>
        観測モードでは視点だけを選び、ビルドモードでは能力値ではなく人生の前提を設計します。
      </p>
    </div>
    <div className={styles.heroPanel}>
      <ScoutResourceBoard generationTokens={generationTokens} observationPoints={observationPoints} />
      {generationMode === "BUILD" ? (
        <div className={styles.progress} aria-label="設計の進行状況">
          {STEP_ORDER.map((step) => {
            const stepIndex = STEP_ORDER.indexOf(step);
            const activeIndex = STEP_ORDER.indexOf(activeStep);
            return (
              <button
                key={step}
                type="button"
                className={styles.progressStep}
                data-active={step === activeStep}
                data-complete={stepIndex < activeIndex}
                onClick={() => onActivateStep(step)}
              >
                <span className={styles.progressNumber}>0{stepIndex + 1}</span>
                <span className={styles.progressLabel}>{STEP_COPY[step].title}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={styles.modeSignal}>
          <span>観測モード</span>
          <strong>観測視点以外は候補札のランダム値で確定します。</strong>
        </div>
      )}
    </div>
  </section>
);

export const ScoutModePanel: React.FC<{
  value: ScoutGenerationMode;
  onChange: (value: ScoutGenerationMode) => void;
}> = ({ value, onChange }) => (
  <section className={styles.section} data-active="true">
    <div className={styles.sectionHead}>
      <div>
        <div className={styles.sectionStep}>MODE</div>
        <h2 className={styles.sectionTitleText}>生成モード</h2>
        <p className={styles.sectionCopy}>観測だけに任せるか、能力値ではない前提だけを設計するかを選びます。</p>
      </div>
    </div>
    <div className={styles.sectionBody}>
      <div className={styles.modeGrid}>
        {GENERATION_MODE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={styles.modeCard}
            data-active={value === option.value}
            onClick={() => onChange(option.value)}
          >
            <div className={cn(styles.choiceTitle, typography.heading)}>{option.label}</div>
            <div className={styles.choiceNote}>{option.note}</div>
          </button>
        ))}
      </div>
    </div>
  </section>
);

export const ScoutDecisionPanel: React.FC<{
  generationTokens: GenerationTokenState | null;
  observationPoints: ObservationPointState | null;
  isRegistering: boolean;
  onRegister: () => void;
  mode: "desktop" | "mobile";
}> = ({ generationTokens, observationPoints, isRegistering, onRegister, mode }) => {
  const tokenCount = generationTokens?.tokens ?? 0;
  const tokenCap = generationTokens?.cap ?? 5;
  const nextRegen = generationTokens?.nextRegenInSec ?? 0;
  const disabled = isRegistering || tokenCount <= 0;
  return (
    <section className={mode === "desktop" ? styles.decision : styles.decisionMobile}>
      <div>
        <p className={styles.sectionTitle}>{mode === "desktop" ? "決裁" : "開始"}</p>
        <h2 className={styles.decisionTitle}>この新弟子で始める</h2>
        <p className={styles.decisionCopy}>
          生成札 {tokenCount}/{tokenCap} / 観測点 {observationPoints?.points ?? 0}
          {tokenCount <= 0 && nextRegen > 0 ? ` / ${formatRegenTime(nextRegen)}` : ""}
        </p>
      </div>
      <Button size="lg" onClick={onRegister} disabled={disabled} className={styles.decisionButton}>
        <ScrollText className="mr-3 h-5 w-5" />
        {isRegistering ? "節目を整えています..." : tokenCount <= 0 ? "生成札の回復待ち" : "生成札を使って始める"}
      </Button>
    </section>
  );
};

export const ScoutCandidateShelf: React.FC<{
  onCycleCandidate: () => void;
  mode: "desktop" | "mobile";
}> = ({ onCycleCandidate, mode }) => (
  <section className={cn(styles.candidateShelf, mode === "mobile" && styles.candidateShelfMobile)}>
    <div className={styles.candidateShelfHead}>
      <div>
        <p className={styles.sectionTitle}>候補札</p>
        <h2 className={styles.decisionTitle}>未鑑定の候補をめくる</h2>
        {mode === "mobile" ? (
          <p className={styles.decisionCopy}>候補札だけを差し替えます。生成札は消費しません。</p>
        ) : null}
      </div>
    </div>
    {mode === "desktop" ? (
      <div className={styles.deckFace}>
        <div className={styles.deckMark}>候</div>
        <Sparkles className={styles.deckSpark} />
        <span>生成前候補</span>
      </div>
    ) : null}
    <div className={styles.candidateActions}>
      <Button variant="outline" size="sm" onClick={onCycleCandidate} className={styles.candidateButton}>
        <RefreshCw className="mr-2 h-4 w-4" />
        次の候補
      </Button>
    </div>
  </section>
);

export const ExperimentPresetPanel: React.FC<{
  value: ExperimentPresetId | null;
  onChange: (value: ExperimentPresetId | null) => void;
}> = ({ value, onChange }) => (
  <section className={styles.section} data-active="true">
    <div className={styles.sectionHead}>
      <div>
        <div className={styles.sectionStep}>実験</div>
        <h2 className={styles.sectionTitleText}>実験観測</h2>
        <p className={styles.sectionCopy}>標準観測とは別枠の記録として保存され、観測点報酬は少額に抑えられます。</p>
      </div>
      <Button variant={value ? "secondary" : "outline"} size="sm" onClick={() => onChange(null)}>
        標準に戻す
      </Button>
    </div>
    <div className={styles.sectionBody}>
      <div className={styles.choiceGrid}>
        {EXPERIMENT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className={styles.choiceCard}
            data-active={value === preset.id}
            onClick={() => onChange(value === preset.id ? null : preset.id)}
          >
            <div className={cn(styles.choiceTitle, typography.heading)}>{preset.label}</div>
            <div className={styles.choiceNote}>{preset.note}</div>
          </button>
        ))}
      </div>
    </div>
  </section>
);

export const ObservationStancePanel: React.FC<{
  value: ObservationStanceId;
  onChange: (value: ObservationStanceId) => void;
}> = ({ value, onChange }) => (
  <section className={styles.section} data-active="true">
    <div className={styles.sectionHead}>
      <div>
        <div className={styles.sectionStep}>観測</div>
        <h2 className={styles.sectionTitleText}>今回の観測視点</h2>
        <p className={styles.sectionCopy}>文章を書く代わりに、今回どの読み筋で一代を観測するかを選びます。</p>
      </div>
    </div>
    <div className={styles.sectionBody}>
      <div className={styles.stanceGrid}>
        {OBSERVATION_STANCES.map((stance) => (
          <button
            key={stance.id}
            type="button"
            className={styles.stanceCard}
            data-active={value === stance.id}
            onClick={() => onChange(stance.id)}
          >
            <div className={cn(styles.choiceTitle, typography.heading)}>{stance.label}</div>
            <div className={styles.choiceNote}>{stance.description}</div>
            <div className={styles.stanceMetrics}>
              {stance.focusMetrics.slice(0, 4).map((metric) => (
                <span key={metric}>{metric}</span>
              ))}
            </div>
          </button>
        ))}
      </div>
    </div>
  </section>
);
