import React from "react";
import { ArrowLeft, ArrowRight, RefreshCw, ScrollText } from "lucide-react";
import { Oyakata, RikishiStatus } from "../../../logic/models";
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
import { Button } from "../../../shared/ui/Button";
import { InlineHelp } from "../../../shared/ui/InlineHelp";
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";

interface ScoutScreenProps {
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    initialPacing?: SimulationPacing,
  ) => void | Promise<void>;
}

type ScoutStepId = "identity" | "seed" | "body";

const SECTION_TITLE = "text-[10px] ui-text-label tracking-[0.35em] text-gold/55 uppercase";
const STEP_ORDER: ScoutStepId[] = ["identity", "seed", "body"];

const ENTRY_AGE_OPTIONS = [15, 18, 22] as const;
const HEIGHT_OPTIONS = [175, 178, 181, 184, 187, 190, 193];
const WEIGHT_OPTIONS = [105, 115, 125, 135, 145, 155, 165];

const FIELD_OPTIONS = {
  entryPath: [
    { value: "LOCAL", label: SCOUT_ENTRY_PATH_LABELS.LOCAL, note: "肩書より土台を優先する。", },
    { value: "SCHOOL", label: SCOUT_ENTRY_PATH_LABELS.SCHOOL, note: "学校相撲の反復が入口になる。", },
    { value: "COLLEGE", label: SCOUT_ENTRY_PATH_LABELS.COLLEGE, note: "学生相撲の経験が入口に効く。", },
    { value: "CHAMPION", label: SCOUT_ENTRY_PATH_LABELS.CHAMPION, note: "看板を背負って土俵へ入る。", },
  ] as Array<{ value: ScoutEntryPath; label: string; note: string }>,
  temperament: [
    { value: "STEADY", label: SCOUT_TEMPERAMENT_LABELS.STEADY, note: "停滞にも崩れにくい。", },
    { value: "AMBITION", label: SCOUT_TEMPERAMENT_LABELS.AMBITION, note: "上を狙う気配が強い。", },
    { value: "STUBBORN", label: SCOUT_TEMPERAMENT_LABELS.STUBBORN, note: "折れずに踏みとどまりやすい。", },
    { value: "EXPLOSIVE", label: SCOUT_TEMPERAMENT_LABELS.EXPLOSIVE, note: "流れが極端に振れやすい。", },
  ] as Array<{ value: ScoutTemperament; label: string; note: string }>,
  bodySeed: [
    { value: "BALANCED", label: SCOUT_BODY_SEED_LABELS.BALANCED, note: "癖の少ない土台から育つ。", },
    { value: "LONG", label: SCOUT_BODY_SEED_LABELS.LONG, note: "長さと間合いが後から効く。", },
    { value: "HEAVY", label: SCOUT_BODY_SEED_LABELS.HEAVY, note: "重さと圧力が人生の軸になる。", },
    { value: "SPRING", label: SCOUT_BODY_SEED_LABELS.SPRING, note: "足腰の弾みが残り方を変える。", },
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

const createDraftAlternatives = (): ScoutDraft[] => {
  const first = rollScoutDraft();
  const second = rollScoutDraft();
  const third = rollScoutDraft();
  second.personaLine = "型を固め切らず、どこで化けるかを見たい。";
  third.personaLine = "初手から気配が強く、波の大きい人生を予感させる。";
  return [first, second, third].map(cloneDraft);
};

const createInitialScoutBundle = () => {
  const alternatives = createDraftAlternatives();
  return {
    draft: cloneDraft(alternatives[0]),
    alternatives,
  };
};

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
  <span className="scout-field-legend">
    <span className={SECTION_TITLE}>{label}</span>
    <InlineHelp label={label} description={description} placement="top" />
  </span>
);

const ChoiceGrid = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string; note: string }>;
  onChange: (value: T) => void;
}) => (
  <div className="grid gap-3 md:grid-cols-2">
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className="scout-choice-card"
          data-active={active}
        >
          <div className="text-base ui-text-heading text-text">{option.label}</div>
          <div className="mt-2 text-sm text-text-dim">{option.note}</div>
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
    <section className="scout-section-card" data-active={active}>
      <div className="scout-section-head">
        <div>
          <div className="scout-section-step">STEP {STEP_ORDER.indexOf(step) + 1}</div>
          <h2 className="scout-section-title">{STEP_COPY[step].title}</h2>
          <p className="scout-section-copy">{active ? STEP_COPY[step].body : summary}</p>
        </div>
        <Button variant={active ? "secondary" : "outline"} size="sm" onClick={() => onActivate(step)}>
          {active ? "入力中" : "ここを入力"}
        </Button>
      </div>

      {active ? (
        <div className="scout-section-body">
          {children}
          <div className="scout-section-footer">
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

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const [initialBundle] = React.useState(createInitialScoutBundle);
  const [draft, setDraft] = React.useState<ScoutDraft>(initialBundle.draft);
  const [draftAlternatives, setDraftAlternatives] = React.useState<ScoutDraft[]>(initialBundle.alternatives);
  const [activeAlternativeIndex, setActiveAlternativeIndex] = React.useState(0);
  const [activeStep, setActiveStep] = React.useState<ScoutStepId>("identity");
  const [isRegistering, setIsRegistering] = React.useState(false);

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

  const handleCycleAlternative = React.useCallback(() => {
    const nextIndex = (activeAlternativeIndex + 1) % draftAlternatives.length;
    setActiveAlternativeIndex(nextIndex);
    setDraft(cloneDraft(draftAlternatives[nextIndex]));
  }, [activeAlternativeIndex, draftAlternatives]);

  const handleRefreshAlternatives = React.useCallback(() => {
    const nextAlternatives = createDraftAlternatives();
    setDraftAlternatives(nextAlternatives);
    setActiveAlternativeIndex(0);
    setDraft(cloneDraft(nextAlternatives[0]));
  }, []);

  const handleRegister = React.useCallback(async () => {
    setIsRegistering(true);
    try {
      await onStart(buildInitialRikishiFromDraft(draft), null, "chaptered");
    } finally {
      setIsRegistering(false);
    }
  }, [draft, onStart]);

  const identitySummary = `${draft.shikona || "未命名"} / ${draft.birthplace || "出身未設定"}`;
  const seedSummary = `${draft.entryAge}歳 / ${resolvedSeed.entryPathLabel} / ${resolvedSeed.temperamentLabel}`;
  const bodySummary = `${draft.startingHeightCm}cm / ${draft.startingWeightKg}kg / ${activeStable.displayName}`;

  return (
    <div className="space-y-6">
      <section className="analysis-header-strip">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="text-xl ui-text-heading text-text">新弟子設計</div>
          <div className="text-sm text-text-dim">
            3つの区画を順番に埋めるだけで始められます。最後に押すのは、いちばん下の大きなボタンです。
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-4">
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
                  className="w-full border border-gold/20 bg-bg/30 px-4 py-3 text-xl ui-text-heading text-text outline-none"
                />
              </label>
              <label className="space-y-2">
                <FieldLegend label="出身地" description="記録帳の表紙に残る基本情報です。" />
                <input
                  value={draft.birthplace}
                  onChange={(event) => updateDraft("birthplace", event.target.value)}
                  className="w-full border border-gold/20 bg-bg/30 px-4 py-3 text-base text-text outline-none"
                />
              </label>
            </div>
            <label className="block space-y-2">
              <FieldLegend label="入口要約" description="この新弟子をどういう人物として見始めるかを短く決めます。" />
              <textarea
                value={draft.personaLine ?? ""}
                rows={3}
                onChange={(event) => updateDraft("personaLine", event.target.value)}
                className="w-full border border-gold/20 bg-bg/30 px-4 py-3 text-sm text-text outline-none"
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
                      className="scout-choice-card"
                      data-active={draft.entryAge === age}
                    >
                      <div className="text-base ui-text-heading text-text">{age}歳入門</div>
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
                        className="scout-size-chip"
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
                        className="scout-size-chip"
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
                      className="scout-choice-card"
                      data-active={draft.selectedStableId === stable.value}
                    >
                      <div className="text-base ui-text-heading text-text">{stable.label}</div>
                      <div className="mt-2 text-xs text-text-dim">{stable.note}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <section className="scout-side-tools">
            <div className="scout-side-tools-copy">
              <div className="career-decision-kicker">サブ操作</div>
              <div className="text-sm text-text-dim">
                迷ったら別案を巡回できます。ここは主ルートではないので、始める前の補助として扱います。
              </div>
            </div>
            <div className="scout-side-tools-actions">
              <Button variant="outline" onClick={handleCycleAlternative}>
                <RefreshCw className="mr-2 h-4 w-4" />
                別案 {activeAlternativeIndex + 1}/3
              </Button>
              <Button variant="ghost" onClick={handleRefreshAlternatives}>
                三案を作り直す
              </Button>
            </div>
          </section>

          <section className="scout-main-cta-bar">
            <div>
              <p className={SECTION_TITLE}>最後に押す場所</p>
              <h2 className="mt-2 text-2xl ui-text-heading text-text">この新弟子で始める</h2>
              <p className="mt-2 text-sm text-text-dim">
                標準モードでは全場所を追わず、節目だけが表示されます。
              </p>
            </div>
            <Button size="lg" onClick={() => void handleRegister()} disabled={isRegistering}>
              <ScrollText className="mr-3 h-5 w-5" />
              {isRegistering ? "節目を整えています..." : "この新弟子で始める"}
            </Button>
          </section>
        </main>

        <aside className="space-y-5 self-start xl:sticky xl:top-24">
          <section className="scout-preview-panel">
            <div className="mb-4">
              <p className={SECTION_TITLE}>観測対象</p>
              <h2 className="mt-2 text-4xl ui-text-heading text-text">{draft.shikona}</h2>
              <p className="mt-2 text-sm text-text/65">
                {draft.birthplace} / {activeStable.displayName}
              </p>
            </div>
            <div className="mx-auto h-[320px] w-full max-w-[260px] border-y border-gold/10 bg-gradient-to-b from-transparent via-gold/5 to-transparent">
              <RikishiPortrait
                bodyType={previewStatus.bodyType}
                className="h-full w-full"
                innerClassName="bg-transparent border-none p-0 shadow-none"
              />
            </div>
            <div className="mt-4 rounded-none border border-gold/10 bg-black/10 px-4 py-3 text-sm text-text-dim">
              {draft.personaLine ?? "どこで人生の輪郭が立つかは、まだ白紙です。"}
            </div>
            <div className="mt-4 space-y-2 text-left">
              {[
                ["四股名", draft.shikona],
                ["出身", draft.birthplace],
                ["所属部屋", activeStable.displayName],
                ["入口", `${draft.entryAge}歳 / ${resolvedSeed.entryPathLabel}`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-gold/10 py-2 text-sm">
                  <span className="ui-text-label text-gold/60">{label}</span>
                  <span className="max-w-[180px] text-right text-text">{value ?? "-"}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
