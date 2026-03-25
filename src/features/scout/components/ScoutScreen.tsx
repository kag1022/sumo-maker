import React from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { Oyakata, RikishiStatus } from "../../../logic/models";
import {
  buildInitialRikishiFromDraft,
  buildScoutResolvedSeed,
  getScoutDraftHeadline,
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
import { RikishiPortrait } from "../../../shared/ui/RikishiPortrait";

interface ScoutScreenProps {
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    initialPacing?: SimulationPacing,
  ) => void | Promise<void>;
}

const SECTION_TITLE = "text-[10px] ui-text-label tracking-[0.35em] text-gold/55 uppercase";
const PANEL = "premium-panel border border-gold/10 bg-bg-panel/80 p-5 sm:p-6";

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

const stableOptions = STABLE_CATALOG.map((stable) => ({
  value: stable.id,
  label: stable.displayName,
  note: stable.flavor,
}));

const FieldCard: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className={PANEL}>
    <div className="mb-4">
      <p className={SECTION_TITLE}>{title}</p>
    </div>
    {children}
  </section>
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
          className={`border p-4 text-left transition-all ${
            active
              ? "border-gold bg-gold/10 shadow-[0_0_0_1px_rgba(212,175,55,0.35)]"
              : "border-gold/10 bg-bg/35 hover:border-gold/35"
          }`}
        >
          <div className="text-base ui-text-heading text-text">{option.label}</div>
        </button>
      );
    })}
  </div>
);

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const [draft, setDraft] = React.useState<ScoutDraft>(() => rollScoutDraft());
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

  const handleRandomize = React.useCallback(() => {
    setDraft(rollScoutDraft());
  }, []);

  const handleRegister = React.useCallback(async () => {
    setIsRegistering(true);
    try {
      await onStart(buildInitialRikishiFromDraft(draft), null, "skip_to_end");
    } finally {
      setIsRegistering(false);
    }
  }, [draft, onStart]);

  const summaryRows = [
    ["出身", draft.birthplace],
    ["所属部屋", activeStable.displayName],
    ["入門時", `${draft.entryAge}歳 / ${resolvedSeed.entryPathLabel}`],
    ["気質", resolvedSeed.temperamentLabel],
    ["身体の素地", resolvedSeed.bodySeedLabel],
    ["初期体格", `${draft.startingHeightCm}cm / ${draft.startingWeightKg}kg`],
  ] as const;

  return (
    <div className="space-y-6">
      <section className="analysis-header-strip">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          <div className="text-xl ui-text-heading text-text">新弟子設計</div>
          <div className="inline-flex items-center rounded-none border border-gold/16 bg-white/[0.02] px-3 py-2 text-xs text-text/58">
            {getScoutDraftHeadline(draft)}
          </div>
        </div>
        <div className="analysis-actions">
          <Button variant="outline" onClick={handleRandomize}>
            <RefreshCw className="mr-2 h-4 w-4" />
            別案
          </Button>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-5">
          <FieldCard title="人物の核">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className={SECTION_TITLE}>四股名</span>
                <input
                  value={draft.shikona}
                  onChange={(event) => updateDraft("shikona", event.target.value)}
                  className="w-full border border-gold/20 bg-bg/30 px-4 py-3 text-xl ui-text-heading text-text outline-none"
                />
              </label>
              <label className="space-y-2">
                <span className={SECTION_TITLE}>出身地</span>
                <input
                  value={draft.birthplace}
                  onChange={(event) => updateDraft("birthplace", event.target.value)}
                  className="w-full border border-gold/20 bg-bg/30 px-4 py-3 text-base text-text outline-none"
                />
              </label>
            </div>
          </FieldCard>

          <FieldCard title="入門の入口">
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {ENTRY_AGE_OPTIONS.map((age) => (
                  <button
                    key={age}
                    type="button"
                    onClick={() => updateDraft("entryAge", age)}
                    className={`border px-4 py-4 text-left ${draft.entryAge === age ? "border-gold bg-gold/10" : "border-gold/10 bg-bg/35 hover:border-gold/35"}`}
                  >
                    <div className="text-base ui-text-heading text-text">{age}歳入門</div>
                  </button>
                ))}
              </div>
              <ChoiceGrid
                value={draft.entryPath}
                options={FIELD_OPTIONS.entryPath}
                onChange={(value) => updateDraft("entryPath", value)}
              />
            </div>
          </FieldCard>

          <FieldCard title="身体の出発点">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="space-y-3">
                <span className={SECTION_TITLE}>身長</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {HEIGHT_OPTIONS.map((height) => (
                    <button
                      key={height}
                      type="button"
                      onClick={() => updateDraft("startingHeightCm", height)}
                      className={`border px-3 py-3 text-sm ${draft.startingHeightCm === height ? "border-gold bg-gold/10 text-text" : "border-gold/10 bg-bg/35 text-text/70 hover:border-gold/35"}`}
                    >
                      {height}cm
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-3">
                <span className={SECTION_TITLE}>体重</span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {WEIGHT_OPTIONS.map((weight) => (
                    <button
                      key={weight}
                      type="button"
                      onClick={() => updateDraft("startingWeightKg", weight)}
                      className={`border px-3 py-3 text-sm ${draft.startingWeightKg === weight ? "border-gold bg-gold/10 text-text" : "border-gold/10 bg-bg/35 text-text/70 hover:border-gold/35"}`}
                    >
                      {weight}kg
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-5">
              <ChoiceGrid
                value={draft.bodySeed}
                options={FIELD_OPTIONS.bodySeed}
                onChange={(value) => updateDraft("bodySeed", value)}
              />
            </div>
          </FieldCard>

          <FieldCard title="環境と気質">
            <div className="space-y-5">
              <ChoiceGrid
                value={draft.temperament}
                options={FIELD_OPTIONS.temperament}
                onChange={(value) => updateDraft("temperament", value)}
              />
              <div className="space-y-3">
                <span className={SECTION_TITLE}>所属部屋</span>
                <div className="grid gap-3 md:grid-cols-2">
                  {stableOptions.slice(0, 12).map((stable) => {
                    const active = stable.value === draft.selectedStableId;
                    return (
                      <button
                        key={stable.value}
                        type="button"
                        onClick={() => updateDraft("selectedStableId", stable.value)}
                        className={`border p-4 text-left ${active ? "border-gold bg-gold/10" : "border-gold/10 bg-bg/35 hover:border-gold/35"}`}
                      >
                        <div className="text-base ui-text-heading text-text">{stable.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </FieldCard>

          <section className={`${PANEL} flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between`}>
            <div>
              <p className={SECTION_TITLE}>演算へ進む</p>
              <h2 className="mt-2 text-2xl ui-text-heading text-text">この新弟子の一代を記録する</h2>
            </div>
            <Button size="lg" onClick={() => void handleRegister()} disabled={isRegistering}>
              <ScrollText className="mr-3 h-5 w-5" />
              {isRegistering ? "記録を整えています..." : "力士記録を読む"}
            </Button>
          </section>
        </main>

        <aside className="space-y-5 xl:sticky xl:top-24 self-start">
          <section className={`${PANEL} text-center`}>
            <div className="mb-4">
              <p className={SECTION_TITLE}>観測対象</p>
              <h2 className="mt-2 text-4xl ui-text-heading text-text">{draft.shikona}</h2>
              <p className="mt-2 text-sm text-text/65">{draft.birthplace} / {activeStable.displayName}</p>
            </div>
            <div className="mx-auto h-[320px] w-full max-w-[260px] border-y border-gold/10 bg-gradient-to-b from-transparent via-gold/5 to-transparent">
              <RikishiPortrait
                bodyType={previewStatus.bodyType}
                className="h-full w-full"
                innerClassName="bg-transparent border-none p-0 shadow-none"
              />
            </div>
            <div className="mt-4 space-y-2 text-left">
              {summaryRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 border-b border-gold/10 py-2 text-sm">
                  <span className="ui-text-label text-gold/60">{label}</span>
                  <span className="text-right text-text">{value}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
};
