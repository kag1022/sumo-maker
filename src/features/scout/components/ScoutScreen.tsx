import React from 'react';
import { AlertTriangle, Shield, Swords, UserRound, Wallet } from 'lucide-react';
import { Oyakata, OyakataBlueprint, RikishiStatus, SimulationRunOptions, StyleArchetype } from '../../../logic/models';
import { Button } from '../../../shared/ui/Button';
import { RikishiPortrait } from '../../../shared/ui/RikishiPortrait';
import {
  buildInitialRikishiFromSpec,
  buildPreviewSummaryVNext,
  calculateBodyMassIndex,
  calculateBuildCostVNext,
  createDefaultBuildSpecVNext,
  getStarterOyakataBlueprints,
  isBuildSpecVNextBmiValid,
  PHASE_A_BUILD_OPTIONS,
} from '../../../logic/build/buildLab';
import {
  blueprintToOyakata,
  DEBT_CARD_LABELS,
  DEBT_CARD_POINT_BONUS,
  getStyleLabel,
  STARTER_OYAKATA_BLUEPRINTS,
} from '../../../logic/phaseA';
import { getWalletState, spendWalletPoints, WalletState } from '../../../logic/persistence/wallet';
import { listAvailableOyakataBlueprints } from '../../../logic/persistence/repository';
import {
  BODY_CONSTITUTION_COPY,
  DEBT_CARD_COPY,
  getBackgroundLabel,
  getBodyConstitutionLabel,
  getMentalTraitLabel,
  getStyleLabelJa,
  INJURY_RESISTANCE_COPY,
  INJURY_RESISTANCE_LABELS,
  MENTAL_TRAIT_COPY,
  OYAKATA_COPY,
  SCOUT_SECTION_LABELS,
  ScoutSectionId,
  STYLE_COPY,
} from '../../../shared/ui/displayLabels';

interface ScoutScreenProps {
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    runOptions?: SimulationRunOptions,
  ) => void | Promise<void>;
}

const SECTION_ORDER: ScoutSectionId[] = ['oyakata', 'body', 'style', 'risk'];

const ChoiceCard = ({
  label,
  blurb,
  selected,
  onClick,
  aside,
  tone = 'default',
}: {
  label: string;
  blurb: string;
  selected: boolean;
  onClick: () => void;
  aside?: React.ReactNode;
  tone?: 'default' | 'danger';
}) => (
  <button type="button" onClick={onClick} data-selected={selected} className="museum-choice">
    <div className="flex items-start justify-between gap-3">
      <div className="space-y-2">
        <div className={`museum-choice-title ${tone === 'danger' ? 'text-[#ffd2cd]' : ''}`}>{label}</div>
        <div className="museum-choice-copy">{blurb}</div>
      </div>
      {aside}
    </div>
  </button>
);

const SliderField = ({
  label,
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  suffix: string;
}) => (
  <label className="block space-y-3">
    <div className="flex items-center justify-between text-sm text-text-dim">
      <span>{label}</span>
      <span className="museum-chip">{value}{suffix}</span>
    </div>
    <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" />
  </label>
);

const getCompatibilityTone = (label: string): string =>
  label.includes('抜群') ? 'text-[var(--accent-green)]' : label.includes('難') ? 'text-[var(--accent-danger)]' : 'text-text';

const styleOptions: StyleArchetype[] = ['YOTSU', 'TSUKI_OSHI', 'MOROZASHI', 'DOHYOUGIWA'];

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const [wallet, setWallet] = React.useState<WalletState | null>(null);
  const [availableOyakata, setAvailableOyakata] = React.useState<OyakataBlueprint[]>(STARTER_OYAKATA_BLUEPRINTS);
  const [spec, setSpec] = React.useState(() => createDefaultBuildSpecVNext(getStarterOyakataBlueprints()[0].id));
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const [walletState, oyakata] = await Promise.all([
        getWalletState(),
        listAvailableOyakataBlueprints(),
      ]);
      if (!alive) return;
      setWallet(walletState);
      setAvailableOyakata(oyakata);
      if (!oyakata.some((row) => row.id === spec.oyakataId)) {
        setSpec(createDefaultBuildSpecVNext(oyakata[0]?.id ?? getStarterOyakataBlueprints()[0].id));
      }
    })();
    return () => {
      alive = false;
    };
  }, [spec.oyakataId]);

  const selectedOyakata =
    availableOyakata.find((oyakata) => oyakata.id === spec.oyakataId) ??
    availableOyakata[0] ??
    STARTER_OYAKATA_BLUEPRINTS[0];
  const cost = calculateBuildCostVNext(spec, selectedOyakata);
  const preview = buildPreviewSummaryVNext(spec, selectedOyakata);
  const remainingPoints = (wallet?.points ?? 0) - cost.total;
  const initialBmi = calculateBodyMassIndex(preview.initialHeightCm, preview.initialWeightKg);
  const isBmiValid = isBuildSpecVNextBmiValid(spec);
  const canStart = !isRegistering && isBmiValid && remainingPoints >= 0 && spec.debtCards.length <= 3;

  const warnings = [
    !isBmiValid ? '初期BMIが低すぎます。身長か体重を見直してください。' : null,
    remainingPoints < 0 ? `必要ptが ${Math.abs(remainingPoints)} 足りません。` : null,
    spec.debtCards.length > 2 ? '負債が重い設計です。序盤の事故率が上がります。' : null,
  ].filter((value): value is string => Boolean(value));

  const handleStart = async () => {
    if (!canStart) return;
    setErrorMessage('');
    setIsRegistering(true);
    try {
      const spent = await spendWalletPoints(cost.total, 'BUILD_REGISTRATION');
      setWallet(spent.state);
      if (!spent.ok) {
        setErrorMessage(`ポイントが足りません（必要 ${cost.total}pt）`);
        return;
      }
      const status = buildInitialRikishiFromSpec(spec, selectedOyakata);
      await onStart(status, blueprintToOyakata(selectedOyakata), {
        selectedOyakataId: selectedOyakata.id,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '送り出しに失敗しました。');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in pb-28">
      <section className="command-bar sticky-top-strip">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="flow-chip">
            <Wallet size={14} />
            所持 {wallet?.points ?? '--'}pt
          </span>
          <span className="flow-chip">必要 {cost.total}pt</span>
          <span className={`flow-chip ${remainingPoints < 0 ? 'is-danger' : 'is-good'}`}>
            残 {remainingPoints}pt
          </span>
        </div>
        <div className="step-rail">
          {SECTION_ORDER.map((sectionId, index) => (
            <div key={sectionId} className="step-node" data-active={true} data-complete={index < 3}>
              <div className="step-index">手順 {index + 1}</div>
              <div className="step-title">{SCOUT_SECTION_LABELS[sectionId]}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
        <section className="space-y-5">
          <article className="rpg-panel space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="pixel-icon-badge"><UserRound size={16} /></span>
              <div>
                <div className="museum-kicker">親方</div>
                <h2 className="ui-text-heading text-2xl text-text">誰の門下に入るか決める</h2>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {availableOyakata.map((oyakata) => (
                <ChoiceCard
                  key={oyakata.id}
                  label={oyakata.name}
                  blurb={`${OYAKATA_COPY(oyakata)} / 秘伝: ${getStyleLabelJa(oyakata.secretStyle)}`}
                  selected={spec.oyakataId === oyakata.id}
                  onClick={() => setSpec((prev) => ({ ...prev, oyakataId: oyakata.id }))}
                  aside={<span className="museum-chip">{getStyleLabel(oyakata.secretStyle)}</span>}
                />
              ))}
            </div>
          </article>

          <article className="rpg-panel space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="pixel-icon-badge"><Shield size={16} /></span>
              <div>
                <div className="museum-kicker">体格</div>
                <h2 className="ui-text-heading text-2xl text-text">どんな身体を目指すか決める</h2>
              </div>
            </div>

            <div className="grid gap-5">
              <SliderField
                label="身長ポテンシャル"
                value={spec.heightPotentialCm}
                min={172}
                max={204}
                suffix="cm"
                onChange={(value) => setSpec((prev) => ({ ...prev, heightPotentialCm: value }))}
              />
              <SliderField
                label="体重ポテンシャル"
                value={spec.weightPotentialKg}
                min={110}
                max={240}
                suffix="kg"
                onChange={(value) => setSpec((prev) => ({ ...prev, weightPotentialKg: value }))}
              />
              <SliderField
                label="リーチ補正"
                value={spec.reachDeltaCm}
                min={-8}
                max={8}
                suffix="cm"
                onChange={(value) => setSpec((prev) => ({ ...prev, reachDeltaCm: value }))}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(PHASE_A_BUILD_OPTIONS.constitutionCost) as Array<keyof typeof PHASE_A_BUILD_OPTIONS.constitutionCost>).map((value) => (
                <ChoiceCard
                  key={value}
                  label={`${getBodyConstitutionLabel(value)} (${PHASE_A_BUILD_OPTIONS.constitutionCost[value]}pt)`}
                  blurb={BODY_CONSTITUTION_COPY[value]}
                  selected={spec.bodyConstitution === value}
                  onClick={() => setSpec((prev) => ({ ...prev, bodyConstitution: value }))}
                />
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(PHASE_A_BUILD_OPTIONS.backgroundCost) as Array<keyof typeof PHASE_A_BUILD_OPTIONS.backgroundCost>).map((value) => (
                <ChoiceCard
                  key={value}
                  label={`${getBackgroundLabel(value)} (${PHASE_A_BUILD_OPTIONS.backgroundCost[value]}pt)`}
                  blurb={
                    value === 'MIDDLE_SCHOOL'
                      ? '若く入り、長い時間を成長に使う。'
                      : value === 'HIGH_SCHOOL'
                        ? '標準的な入口で扱いやすい。'
                        : value === 'STUDENT_ELITE'
                          ? '序盤を短縮して関取圏へ寄せる。'
                          : '即戦力だが設計コストは最も重い。'
                  }
                  selected={spec.amateurBackground === value}
                  onClick={() => setSpec((prev) => ({ ...prev, amateurBackground: value }))}
                />
              ))}
            </div>
          </article>

          <article className="rpg-panel space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="pixel-icon-badge"><Swords size={16} /></span>
              <div>
                <div className="museum-kicker">型</div>
                <h2 className="ui-text-heading text-2xl text-text">主戦型と副戦型を組む</h2>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {styleOptions.map((style) => (
                <div key={style} className="ledger-card">
                  <div className="space-y-2">
                    <div className="museum-choice-title">{getStyleLabelJa(style)}</div>
                    <div className="museum-choice-copy">{STYLE_COPY[style]}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="museum-chip"
                      data-active={spec.primaryStyle === style}
                      onClick={() => setSpec((prev) => ({ ...prev, primaryStyle: style }))}
                    >
                      主戦にする
                    </button>
                    <button
                      type="button"
                      className="museum-chip"
                      data-active={spec.secondaryStyle === style}
                      onClick={() => setSpec((prev) => ({ ...prev, secondaryStyle: style }))}
                    >
                      副戦にする
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rpg-panel space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="pixel-icon-badge"><AlertTriangle size={16} /></span>
              <div>
                <div className="museum-kicker">リスク</div>
                <h2 className="ui-text-heading text-2xl text-text">メンタルと怪我の揺れを決める</h2>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(Object.keys(PHASE_A_BUILD_OPTIONS.mentalCost) as Array<keyof typeof PHASE_A_BUILD_OPTIONS.mentalCost>).map((value) => (
                <ChoiceCard
                  key={value}
                  label={`${getMentalTraitLabel(value)} (${PHASE_A_BUILD_OPTIONS.mentalCost[value]}pt)`}
                  blurb={MENTAL_TRAIT_COPY[value]}
                  selected={spec.mentalTrait === value}
                  onClick={() => setSpec((prev) => ({ ...prev, mentalTrait: value }))}
                />
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              {(Object.keys(PHASE_A_BUILD_OPTIONS.injuryResistanceCost) as Array<keyof typeof PHASE_A_BUILD_OPTIONS.injuryResistanceCost>).map((value) => (
                <ChoiceCard
                  key={value}
                  label={`${INJURY_RESISTANCE_LABELS[value]} (${PHASE_A_BUILD_OPTIONS.injuryResistanceCost[value]}pt)`}
                  blurb={INJURY_RESISTANCE_COPY[value]}
                  selected={spec.injuryResistance === value}
                  onClick={() => setSpec((prev) => ({ ...prev, injuryResistance: value }))}
                />
              ))}
            </div>

            <div className="space-y-3">
              <div className="text-sm text-text-dim">負債カード（最大3枚）</div>
              <div className="grid gap-3 md:grid-cols-3">
                {(['OLD_KNEE', 'PRESSURE_LINEAGE', 'LATE_START'] as const).map((debt) => {
                  const selected = spec.debtCards.includes(debt);
                  const canAdd = selected || spec.debtCards.length < 3;
                  return (
                    <ChoiceCard
                      key={debt}
                      tone="danger"
                      label={`${DEBT_CARD_LABELS[debt]} (+${DEBT_CARD_POINT_BONUS[debt]}pt)`}
                      blurb={DEBT_CARD_COPY[debt]}
                      selected={selected}
                      onClick={() => {
                        if (!selected && !canAdd) return;
                        setSpec((prev) => ({
                          ...prev,
                          debtCards: selected
                            ? prev.debtCards.filter((card) => card !== debt)
                            : [...prev.debtCards, debt],
                        }));
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </article>
        </section>

        <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
          <section className="scoreboard-panel p-5 sm:p-6">
            <div className="preview-stage">
              <div className="flex flex-col gap-4 sm:flex-row">
                <RikishiPortrait
                  bodyType={
                    spec.bodyConstitution === 'HEAVY_BULK'
                      ? 'ANKO'
                      : spec.bodyConstitution === 'LONG_REACH'
                        ? 'SOPPU'
                        : spec.bodyConstitution === 'SPRING_LEGS'
                          ? 'MUSCULAR'
                          : 'NORMAL'
                  }
                  showLabel
                  className="h-[220px] w-full sm:w-[220px]"
                />
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="museum-kicker">力士プレビュー</div>
                    <div className="mt-2 ui-text-heading text-3xl text-text">{selectedOyakata.name}門下</div>
                    <div className="mt-2 text-sm text-text-dim">{OYAKATA_COPY(selectedOyakata)}</div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="pixel-card-dark p-3">
                      <div className="text-[0.65rem] tracking-[0.14em] text-text-dim">入口</div>
                      <div className="mt-2 text-sm text-text">{preview.entryAge}歳 / {preview.startRankLabel}</div>
                    </div>
                    <div className="pixel-card-dark p-3">
                      <div className="text-[0.65rem] tracking-[0.14em] text-text-dim">想定帯</div>
                      <div className="mt-2 text-sm text-text">{preview.careerBandLabel}</div>
                    </div>
                    <div className="pixel-card-dark p-3">
                      <div className="text-[0.65rem] tracking-[0.14em] text-text-dim">初期体格</div>
                      <div className="mt-2 text-sm text-text">{preview.initialHeightCm.toFixed(1)}cm / {preview.initialWeightKg.toFixed(1)}kg</div>
                    </div>
                    <div className="pixel-card-dark p-3">
                      <div className="text-[0.65rem] tracking-[0.14em] text-text-dim">到達予測</div>
                      <div className="mt-2 text-sm text-text">{preview.potentialHeightCm}cm / {preview.potentialWeightKg}kg</div>
                    </div>
                  </div>
                  <div className={`text-sm ${getCompatibilityTone(preview.compatibilityLabel)}`}>
                    主副相性: {preview.compatibilityLabel} / 秘伝 {getStyleLabelJa(selectedOyakata.secretStyle)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rpg-panel p-5 sm:p-6">
            <div className="museum-kicker">確認盤</div>
            <h3 className="ui-text-heading mt-2 text-2xl text-text">主要決定</h3>
            <div className="mt-4 space-y-1">
              <div className="data-row"><span className="data-key">親方</span><span className="data-val">{selectedOyakata.name}</span></div>
              <div className="data-row"><span className="data-key">体格</span><span className="data-val">{getBodyConstitutionLabel(spec.bodyConstitution)}</span></div>
              <div className="data-row"><span className="data-key">経歴</span><span className="data-val">{getBackgroundLabel(spec.amateurBackground)}</span></div>
              <div className="data-row"><span className="data-key">主戦型</span><span className="data-val">{getStyleLabelJa(spec.primaryStyle)}</span></div>
              <div className="data-row"><span className="data-key">副戦型</span><span className="data-val">{getStyleLabelJa(spec.secondaryStyle)}</span></div>
              <div className="data-row"><span className="data-key">メンタル</span><span className="data-val">{getMentalTraitLabel(spec.mentalTrait)}</span></div>
              <div className="data-row"><span className="data-key">怪我耐性</span><span className="data-val">{INJURY_RESISTANCE_LABELS[spec.injuryResistance]}</span></div>
              <div className="data-row"><span className="data-key">残pt</span><span className="data-val">{remainingPoints}</span></div>
              <div className="data-row"><span className="data-key">初期BMI</span><span className="data-val">{initialBmi.toFixed(1)}</span></div>
            </div>

            <div className="mt-5">
              <div className="text-xs tracking-[0.14em] text-[var(--accent-gold)]">負債カード</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {spec.debtCards.length === 0 ? (
                  <span className="museum-chip">なし</span>
                ) : (
                  spec.debtCards.map((debt) => (
                    <span key={debt} className="museum-chip" data-active="true">{DEBT_CARD_LABELS[debt]}</span>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="scoreboard-panel p-5 sm:p-6">
            <div className="museum-kicker">注意点</div>
            <div className="mt-4 ticker-log">
              {warnings.length === 0 && !errorMessage ? (
                <div className="ticker-entry">
                  <span className="text-[var(--accent-gold)]">安定</span>
                  <span>予算と初期体格の条件は満たしています。</span>
                </div>
              ) : (
                <>
                  {warnings.map((warning) => (
                    <div key={warning} className="ticker-entry">
                      <span className="text-[var(--accent-danger)]">注意</span>
                      <span>{warning}</span>
                    </div>
                  ))}
                  {errorMessage && (
                    <div className="ticker-entry">
                      <span className="text-[var(--accent-danger)]">失敗</span>
                      <span>{errorMessage}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </aside>
      </div>

      <div className="sticky-action-bar">
        <div className="command-bar px-4 py-4 sm:px-5">
          <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="text-sm text-text">
                {canStart ? 'この内容で土俵人生を始めます。' : '予算、体格、または負債の重さを見直してください。'}
              </div>
              <div className="text-xs text-text-dim">
                必要 {cost.total}pt / 所持 {wallet?.points ?? '--'}pt / 秘伝 {getStyleLabelJa(selectedOyakata.secretStyle)}
              </div>
            </div>
            <Button variant="danger" size="lg" onClick={handleStart} disabled={!canStart} className="w-full px-8 lg:w-auto">
              {isRegistering ? '送り出しています...' : 'この力士を土俵へ送る'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
