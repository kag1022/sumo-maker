import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  CircleDot,
  Eye,
  RefreshCw,
  ScrollText,
  Sparkles,
  Ticket,
} from "lucide-react";
import { ExperimentPresetId, Oyakata, RikishiStatus, SimulationRunOptions } from "../../../logic/models";
import { ScoutStatPreview } from "./ScoutStatPreview";
import {
  buildInitialRikishiFromDraft,
  buildScoutResolvedSeed,
  rollScoutDraft,
  SCOUT_BODY_SEED_LABELS,
  SCOUT_ENTRY_PATH_LABELS,
  SCOUT_TEMPERAMENT_LABELS,
  ScoutBodySeed,
  ScoutDraft,
  ScoutEntryPath,
  ScoutTemperament,
} from "../../../logic/scout/gacha";
import { resolveStableById, STABLE_CATALOG } from "../../../logic/simulation/heya/stableCatalog";
import type { SimulationPacing } from "../../simulation/store/simulationStore";
import type { GenerationTokenState } from "../../../logic/persistence/generationTokens";
import type { ObservationPointState } from "../../../logic/persistence/observationPoints";
import { isObserverUpgradeUnlocked } from "../../../logic/observer/upgrades";
import { Button } from "../../../shared/ui/Button";
import { InlineHelp } from "../../../shared/ui/InlineHelp";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";
import { useViewportMode } from "../../../shared/hooks/useViewportMode";
import { cn } from "../../../shared/lib/cn";
import typography from "../../../shared/styles/typography.module.css";
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

type ScoutStepId = "identity" | "seed" | "body";

const STEP_ORDER: ScoutStepId[] = ["identity", "seed", "body"];

const ENTRY_AGE_OPTIONS = [15, 18, 22] as const;
const HEIGHT_OPTIONS = [175, 178, 181, 184, 187, 190, 193];
const WEIGHT_OPTIONS = [105, 115, 125, 135, 145, 155, 165];
const EXPERIMENT_PRESETS: Array<{ id: ExperimentPresetId; label: string; note: string }> = [
  { id: "INJURY_LOW", label: "怪我少なめ", note: "故障の揺らぎを抑えた実験記録。" },
  { id: "INJURY_HIGH", label: "怪我多め", note: "波乱が起きやすい実験記録。" },
  { id: "PROMOTION_SOFT", label: "昇進甘め", note: "番付上昇の余地を見る実験記録。" },
  { id: "PROMOTION_STRICT", label: "昇進厳しめ", note: "壁の厚さを見る実験記録。" },
  { id: "LATE_BLOOM", label: "晩成寄り", note: "遅咲きの出方を見る実験記録。" },
  { id: "RETIREMENT_SOFT", label: "引退圧弱め", note: "長く残る人生を見る実験記録。" },
];

const FIELD_OPTIONS = {
  entryPath: [
    { value: "LOCAL", label: SCOUT_ENTRY_PATH_LABELS.LOCAL, note: "肩書より土台を優先する。" },
    { value: "SCHOOL", label: SCOUT_ENTRY_PATH_LABELS.SCHOOL, note: "学校相撲の反復が入口になる。" },
    { value: "COLLEGE", label: SCOUT_ENTRY_PATH_LABELS.COLLEGE, note: "学生相撲の経験が入口に効く。" },
    { value: "CHAMPION", label: SCOUT_ENTRY_PATH_LABELS.CHAMPION, note: "看板を背負って土俵へ入る。" },
  ] as Array<{ value: ScoutEntryPath; label: string; note: string }>,
  temperament: [
    { value: "STEADY", label: SCOUT_TEMPERAMENT_LABELS.STEADY, note: "停滞にも崩れにくい。" },
    { value: "AMBITION", label: SCOUT_TEMPERAMENT_LABELS.AMBITION, note: "上を狙う気配が強い。" },
    { value: "STUBBORN", label: SCOUT_TEMPERAMENT_LABELS.STUBBORN, note: "折れずに踏みとどまりやすい。" },
    { value: "EXPLOSIVE", label: SCOUT_TEMPERAMENT_LABELS.EXPLOSIVE, note: "流れが極端に振れやすい。" },
  ] as Array<{ value: ScoutTemperament; label: string; note: string }>,
  bodySeed: [
    { value: "BALANCED", label: SCOUT_BODY_SEED_LABELS.BALANCED, note: "癖の少ない土台から育つ。" },
    { value: "LONG", label: SCOUT_BODY_SEED_LABELS.LONG, note: "長さと間合いが後から効く。" },
    { value: "HEAVY", label: SCOUT_BODY_SEED_LABELS.HEAVY, note: "重さと圧力が人生の軸になる。" },
    { value: "SPRING", label: SCOUT_BODY_SEED_LABELS.SPRING, note: "足腰の弾みが残り方を変える。" },
  ] as Array<{ value: ScoutBodySeed; label: string; note: string }>,
} as const;

const stableOptions = STABLE_CATALOG.slice(0, 9).map((stable) => ({
  value: stable.id,
  label: stable.displayName,
  note: stable.flavor,
}));

const cloneDraft = (draft: ScoutDraft): ScoutDraft => ({
  ...draft,
  profile: { ...draft.profile },
});

const createInitialScoutDraft = (): ScoutDraft => cloneDraft(rollScoutDraft());

const STEP_COPY: Record<ScoutStepId, { title: string; body: string; action: string }> = {
  identity: {
    title: "人物像",
    body: "四股名と出身、それから最初の印象を決めます。",
    action: "まず人物像を整える",
  },
  seed: {
    title: "相撲人生の種",
    body: "入口の経歴と気質を決めます。",
    action: "次に入口の条件を選ぶ",
  },
  body: {
    title: "身体と部屋",
    body: "体格と所属部屋で輪郭を固めます。",
    action: "最後に体格と部屋を決める",
  },
};

const FieldLegend: React.FC<{
  label: string;
  description: string;
}> = ({ label, description }) => (
  <span className={styles.fieldLegend}>
    <span className={styles.sectionTitle}>{label}</span>
    <InlineHelp label={label} description={description} placement="top" />
  </span>
);

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

const ChoiceGrid = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; note: string }>;
  onChange: (value: T) => void;
}) => (
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

const SectionCard: React.FC<{
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

const ScoutHero: React.FC<{
  activeStep: ScoutStepId;
  onActivateStep: (step: ScoutStepId) => void;
  generationTokens: GenerationTokenState | null;
  observationPoints: ObservationPointState | null;
}> = ({ activeStep, onActivateStep, generationTokens, observationPoints }) => (
  <section className={styles.hero}>
    <div className={styles.heroCopy}>
      <div className={styles.kicker}>新弟子生成卓</div>
      <h1 className={styles.heroTitle}>候補札を鑑定して、相撲人生を観測に出す</h1>
      <p className={styles.heroDescription}>
        入口の条件は札として選び、生成札を消費して一代記を走らせます。介入ではなく、観測前の設計です。
      </p>
    </div>
    <div className={styles.heroPanel}>
      <ScoutResourceBoard generationTokens={generationTokens} observationPoints={observationPoints} />
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
    </div>
  </section>
);

const ScoutDecisionPanel: React.FC<{
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

const ScoutCandidateShelf: React.FC<{
  onCycleCandidate: () => void;
  mode: "desktop" | "mobile";
}> = ({
  onCycleCandidate,
  mode,
}) => (
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

const ScoutEntryLedger: React.FC<{
  draft: ScoutDraft;
  entryLabel: string;
  stableName: string;
  previewBodyType: ReturnType<typeof buildInitialRikishiFromDraft>["bodyType"];
  mode: "desktop" | "mobile";
  resolvedSeed: ReturnType<typeof buildScoutResolvedSeed>;
}> = ({ draft, entryLabel, stableName, previewBodyType, mode, resolvedSeed }) => (
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

const ExperimentPresetPanel: React.FC<{
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

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ generationTokens, observationPoints, onStart }) => {
  const { isMobileViewport } = useViewportMode();
  const [draft, setDraft] = React.useState<ScoutDraft>(createInitialScoutDraft);
  const [activeStep, setActiveStep] = React.useState<ScoutStepId>("identity");
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [experimentUnlocked, setExperimentUnlocked] = React.useState(false);
  const [experimentPresetId, setExperimentPresetId] = React.useState<ExperimentPresetId | null>(null);

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
    const nextDraft = createInitialScoutDraft();
    setDraft(nextDraft);
  }, []);

  const handleRegister = React.useCallback(async () => {
    setIsRegistering(true);
    try {
      await onStart(
        buildInitialRikishiFromDraft(draft),
        null,
        "skip_to_end",
        experimentPresetId
          ? { observationRuleMode: "EXPERIMENT", experimentPresetId }
          : { observationRuleMode: "STANDARD" },
      );
    } finally {
      setIsRegistering(false);
    }
  }, [draft, experimentPresetId, onStart]);

  const identitySummary = `${draft.shikona || "未命名"} / ${draft.birthplace || "出身未設定"}`;
  const seedSummary = `${draft.entryAge}歳 / ${resolvedSeed.entryPathLabel} / ${resolvedSeed.temperamentLabel}`;
  const bodySummary = `${draft.startingHeightCm}cm / ${draft.startingWeightKg}kg / ${activeStable.displayName}`;
  const entryLabel = `${draft.entryAge}歳 / ${resolvedSeed.entryPathLabel}`;
  const register = () => void handleRegister();

  const sections = (
    <>
      <SectionCard
        step="identity"
        activeStep={activeStep}
        summary={identitySummary}
        onActivate={setActiveStep}
        onNext={() => setActiveStep("seed")}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2">
            <FieldLegend label="四股名" description="プレイ中ずっと表示される名前です。未確定でも後から調整できます。" />
            <input
              value={draft.shikona}
              onChange={(event) => updateDraft("shikona", event.target.value)}
              className={cn(styles.textInput, styles.nameInput)}
            />
          </label>
          <label className="space-y-2">
            <FieldLegend label="出身地" description="記録帳の表紙に残る基本情報です。" />
            <input
              value={draft.birthplace}
              onChange={(event) => updateDraft("birthplace", event.target.value)}
              className={styles.textInput}
            />
          </label>
        </div>
        <label className="block space-y-2">
          <FieldLegend label="入口要約" description="この新弟子をどういう人物として見始めるかを短く決めます。" />
          <textarea
            value={draft.personaLine ?? ""}
            rows={3}
            onChange={(event) => updateDraft("personaLine", event.target.value)}
            className={styles.textArea}
          />
        </label>
      </SectionCard>

      <SectionCard
        step="seed"
        activeStep={activeStep}
        summary={seedSummary}
        onActivate={setActiveStep}
        onBack={() => setActiveStep("identity")}
        onNext={() => setActiveStep("body")}
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <FieldLegend label="入門年齢" description="入口の年齢で初期の見られ方と経歴の重みが変わります。" />
            <div className="grid gap-3 sm:grid-cols-3">
              {ENTRY_AGE_OPTIONS.map((age) => (
                <button
                  key={age}
                  type="button"
                  onClick={() => updateDraft("entryAge", age)}
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
              onChange={(value) => updateDraft("entryPath", value)}
            />
          </div>
          <div className="space-y-3">
            <FieldLegend label="気質" description="停滞や反発、再浮上の受け止め方に残る性格の芯です。" />
            <ChoiceGrid
              value={draft.temperament}
              options={FIELD_OPTIONS.temperament}
              onChange={(value) => updateDraft("temperament", value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        step="body"
        activeStep={activeStep}
        summary={bodySummary}
        onActivate={setActiveStep}
        onBack={() => setActiveStep("seed")}
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
                    onClick={() => updateDraft("startingHeightCm", height)}
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
                    onClick={() => updateDraft("startingWeightKg", weight)}
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
              onChange={(value) => updateDraft("bodySeed", value)}
            />
          </div>
          <div className="space-y-3">
            <FieldLegend label="所属部屋" description="入口の環境です。資料帳に残る所属と稽古の空気感を決めます。" />
            <div className="grid gap-3 md:grid-cols-3">
              {stableOptions.map((stable) => (
                <button
                  key={stable.value}
                  type="button"
                  onClick={() => updateDraft("selectedStableId", stable.value)}
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

  if (isMobileViewport) {
    return (
      <div className={cn(styles.shell, styles.shellMobile)}>
        <ScoutHero
          activeStep={activeStep}
          onActivateStep={setActiveStep}
          generationTokens={generationTokens}
          observationPoints={observationPoints}
        />
        <ScoutEntryLedger
          draft={draft}
          entryLabel={entryLabel}
          stableName={activeStable.displayName}
          previewBodyType={previewStatus.bodyType}
          mode="mobile"
          resolvedSeed={resolvedSeed}
        />
        <div className={styles.mobileMain}>
          {sections}
          <ScoutCandidateShelf
            onCycleCandidate={handleCycleCandidate}
            mode="mobile"
          />
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
          <ScoutCandidateShelf
            onCycleCandidate={handleCycleCandidate}
            mode="desktop"
          />
          <ScoutEntryLedger
            draft={draft}
            entryLabel={entryLabel}
            stableName={activeStable.displayName}
            previewBodyType={previewStatus.bodyType}
            mode="desktop"
            resolvedSeed={resolvedSeed}
          />
          <section className={styles.previewPanel}>
            <ScoutStatPreview status={previewStatus} />
          </section>
        </aside>
      </div>
    </div>
  );
};
