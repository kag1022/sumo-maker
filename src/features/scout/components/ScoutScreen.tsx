import React from 'react';
import { ChevronLeft, ChevronRight, Shield, Sparkles, Swords, UserRound } from 'lucide-react';
import {
  BuildAxisDurability,
  BuildAxisPeakDesign,
  BuildAxisWinStyle,
  BuildSpecV4,
  Oyakata,
  OyakataProfile,
  RikishiStatus,
  SimulationRunOptions,
  Trait,
} from '../../../logic/models';
import { Button } from '../../../shared/ui/Button';
import { RikishiPortrait } from '../../../shared/ui/RikishiPortrait';
import {
  BUILD_COST,
  buildPreviewSummary,
  buildRikishiFromBuildSpec,
  calculateBuildCost,
  createDefaultBuildSpec,
} from '../../../logic/build/buildLab';
import {
  BODY_TYPE_CHOICES,
  HISTORY_CHOICES,
  PEAK_CHOICES,
  WIN_STYLE_CHOICES,
  traitFlavorLabel,
} from '../../../logic/build/narrativeChoices';
import { getWalletState, spendWalletPoints, WalletState } from '../../../logic/persistence/wallet';
import { listAvailableOyakataProfiles, listCommittedCareers } from '../../../logic/persistence/repository';
import { ICHIMON_CATALOG } from '../../../logic/simulation/heya/ichimonCatalog';
import { listStablesByIchimon } from '../../../logic/simulation/heya/stableCatalog';
import { CONSTANTS } from '../../../logic/constants';
import { toOyakata } from '../../../logic/oyakata/profile';

interface ScoutScreenProps {
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    runOptions?: SimulationRunOptions,
  ) => void | Promise<void>;
}

type StepId = 'identity' | 'origin' | 'body' | 'style' | 'affiliation';
type RequiredField =
  | 'shikona'
  | 'history'
  | 'bodyType'
  | 'winStyle'
  | 'peakDesign'
  | 'durability'
  | 'stable';

const STEPS: Array<{ id: StepId; label: string; short: string }> = [
  { id: 'identity', label: '名跡', short: 'Name' },
  { id: 'origin', label: '出自', short: 'Origin' },
  { id: 'body', label: '体格', short: 'Body' },
  { id: 'style', label: '相撲像', short: 'Style' },
  { id: 'affiliation', label: '所属', short: 'Stable' },
];

const FIELD_LABELS: Record<RequiredField, string> = {
  shikona: '四股名',
  history: '入門経路',
  bodyType: '体格',
  winStyle: '相撲タイプ',
  peakDesign: '成長傾向',
  durability: '怪我耐性',
  stable: '所属部屋',
};

const traitCandidates = (Object.keys(CONSTANTS.TRAIT_DATA) as Trait[])
  .filter((trait) => !CONSTANTS.TRAIT_DATA[trait].isNegative)
  .sort((a, b) => traitFlavorLabel(a).localeCompare(traitFlavorLabel(b), 'ja'))
  .slice(0, 8);

const chooseByValue = <T extends string>(
  choices: Array<{ value: T; label: string; blurb: string }>,
  value: T,
) => choices.find((choice) => choice.value === value);

const ChoiceCard = ({
  label,
  blurb,
  selected,
  onClick,
  eyebrow,
  art,
}: {
  label: string;
  blurb: string;
  selected: boolean;
  onClick: () => void;
  eyebrow?: string;
  art?: React.ReactNode;
}) => (
  <button type="button" onClick={onClick} data-selected={selected} className="museum-choice">
    <div className="space-y-3">
      {art}
      <div className="space-y-1">
        {eyebrow && <div className="text-[0.68rem] uppercase tracking-[0.14em] text-[#d9a441]">{eyebrow}</div>}
        <span className="museum-choice-title">{label}</span>
        <span className="museum-choice-copy">{blurb}</span>
      </div>
    </div>
  </button>
);

const SummaryRow = ({ label, value }: { label: string; value: string }) => (
  <div className="data-row">
    <span className="data-key">{label}</span>
    <span className="data-val text-left sm:text-right">{value}</span>
  </div>
);

const isOyakataOnCooldown = (profile: OyakataProfile, nextCareerIndex: number): boolean =>
  typeof profile.cooldownUntilCareerIndex === 'number' &&
  nextCareerIndex <= profile.cooldownUntilCareerIndex;

export const ScoutScreen: React.FC<ScoutScreenProps> = ({ onStart }) => {
  const [wallet, setWallet] = React.useState<WalletState | null>(null);
  const [spec, setSpec] = React.useState<BuildSpecV4>(() => {
    const defaultSpec = createDefaultBuildSpec();
    return {
      ...defaultSpec,
      shikona: '',
      profile: { ...defaultSpec.profile, realName: '', birthplace: '' },
      traitSlots: 2,
    };
  });
  const [stepIndex, setStepIndex] = React.useState(0);
  const [oyakataProfiles, setOyakataProfiles] = React.useState<OyakataProfile[]>([]);
  const [latestCareerIndex, setLatestCareerIndex] = React.useState(0);
  const [isRegistering, setIsRegistering] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    void (async () => {
      const [walletState, oyakata, careers] = await Promise.all([
        getWalletState(),
        listAvailableOyakataProfiles(),
        listCommittedCareers(),
      ]);
      if (!alive) return;
      setWallet(walletState);
      setOyakataProfiles(oyakata);
      setLatestCareerIndex(careers[0]?.careerIndex ?? 0);
    })();
    return () => {
      alive = false;
    };
  }, []);

  React.useEffect(() => {
    if (!wallet || wallet.points >= wallet.cap) return;
    const interval = setInterval(() => {
      setWallet((prev) => {
        if (!prev || prev.points >= prev.cap) return prev;
        if (prev.nextRegenInSec <= 1) {
          getWalletState().then((newState) => setWallet(newState)).catch(() => {});
          return prev;
        }
        return { ...prev, nextRegenInSec: prev.nextRegenInSec - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [wallet]);

  const stableOptions = React.useMemo(
    () => (spec.selectedIchimonId ? listStablesByIchimon(spec.selectedIchimonId) : []),
    [spec.selectedIchimonId],
  );
  const selectedStable = stableOptions.find((stable) => stable.id === spec.selectedStableId) ?? null;
  const nextCareerIndex = latestCareerIndex + 1;
  const selectedOyakata = oyakataProfiles.find((item) => item.id === spec.selectedOyakataId) ?? null;
  const buildCost = calculateBuildCost(spec, { oyakataLegacyStars: selectedOyakata?.legacyStars });
  const preview = buildPreviewSummary(spec);
  const remainingPoints = (wallet?.points ?? 0) - buildCost.total;

  const pendingFields: RequiredField[] = [];
  if (!spec.shikona.trim()) pendingFields.push('shikona');
  if (!spec.history) pendingFields.push('history');
  if (!spec.bodyType) pendingFields.push('bodyType');
  if (!spec.abstractAxes.winStyle) pendingFields.push('winStyle');
  if (!spec.abstractAxes.peakDesign) pendingFields.push('peakDesign');
  if (!spec.abstractAxes.durability) pendingFields.push('durability');
  if (!spec.selectedStableId) pendingFields.push('stable');

  const canRegister =
    pendingFields.length === 0 &&
    (wallet?.points ?? 0) >= buildCost.total &&
    !isRegistering &&
    (!selectedOyakata || !isOyakataOnCooldown(selectedOyakata, nextCareerIndex));

  const handleBodyTypeChange = (bodyType: BuildSpecV4['bodyType']) => {
    const baseline = BUILD_COST.BODY_METRIC_BASELINE[bodyType];
    setSpec((prev) => ({ ...prev, bodyType, bodyMetrics: { ...baseline } }));
  };

  const toggleTrait = (trait: Trait) => {
    setSpec((prev) => {
      if (prev.selectedTraits.includes(trait)) {
        return { ...prev, selectedTraits: prev.selectedTraits.filter((item) => item !== trait) };
      }
      if (prev.selectedTraits.length >= 2) return prev;
      return { ...prev, selectedTraits: [...prev.selectedTraits, trait] };
    });
  };

  const handleRegister = async () => {
    if (!canRegister) return;
    setIsRegistering(true);
    setErrorMessage('');
    try {
      const spent = await spendWalletPoints(buildCost.total, 'BUILD_REGISTRATION');
      setWallet(spent.state);
      if (!spent.ok) {
        setErrorMessage(`ポイントが足りません（必要 ${buildCost.total}pt）`);
        return;
      }
      const status = buildRikishiFromBuildSpec({
        ...spec,
        profile: {
          ...spec.profile,
          realName: spec.profile.realName || spec.shikona,
          birthplace: spec.profile.birthplace || '未設定',
        },
      });
      await onStart(status, selectedOyakata ? toOyakata(selectedOyakata) : null, {
        selectedOyakataId: spec.selectedOyakataId,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '送り出しに失敗しました。');
    } finally {
      setIsRegistering(false);
    }
  };

  const currentStep = STEPS[stepIndex];
  const selectedHistory = chooseByValue(HISTORY_CHOICES, spec.history);
  const selectedBody = chooseByValue(BODY_TYPE_CHOICES, spec.bodyType);
  const isStepDone = (stepId: StepId) => {
    if (stepId === 'identity') return spec.shikona.trim().length > 0;
    if (stepId === 'origin') return !pendingFields.includes('history');
    if (stepId === 'body') return !pendingFields.includes('bodyType');
    if (stepId === 'style') {
      return !pendingFields.includes('winStyle')
        && !pendingFields.includes('peakDesign')
        && !pendingFields.includes('durability');
    }
    return !pendingFields.includes('stable');
  };

  const renderStepPanel = () => {
    if (currentStep.id === 'identity') {
      return (
        <article className="rpg-panel space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="pixel-icon-badge"><UserRound size={16} /></span>
            <div>
              <div className="museum-kicker">Name Plate</div>
              <h3 className="ui-text-heading text-2xl text-[#fff1d8]">呼び名を決める</h3>
            </div>
          </div>
          <label className="block space-y-2 text-sm text-[#d7c0a0]">
            <span>四股名</span>
            <input
              className="w-full px-4 py-3"
              value={spec.shikona}
              placeholder="例: 北海岳"
              onChange={(e) => setSpec((prev) => ({ ...prev, shikona: e.target.value }))}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-2 text-sm text-[#d7c0a0]">
              <span>本名（任意）</span>
              <input
                className="w-full px-4 py-3"
                value={spec.profile.realName}
                placeholder="未入力なら四股名を使用"
                onChange={(e) =>
                  setSpec((prev) => ({ ...prev, profile: { ...prev.profile, realName: e.target.value } }))
                }
              />
            </label>
            <label className="block space-y-2 text-sm text-[#d7c0a0]">
              <span>出身地（任意）</span>
              <input
                className="w-full px-4 py-3"
                value={spec.profile.birthplace}
                placeholder="未設定"
                onChange={(e) =>
                  setSpec((prev) => ({ ...prev, profile: { ...prev.profile, birthplace: e.target.value } }))
                }
              />
            </label>
          </div>
        </article>
      );
    }

    if (currentStep.id === 'origin') {
      return (
        <article className="rpg-panel space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="pixel-icon-badge"><Sparkles size={16} /></span>
            <div>
              <div className="museum-kicker">Origin Route</div>
              <h3 className="ui-text-heading text-2xl text-[#fff1d8]">どこから入ってくるか</h3>
            </div>
          </div>
          <div className="grid gap-3">
            {HISTORY_CHOICES.map((choice, index) => (
              <ChoiceCard
                key={choice.value}
                label={choice.label}
                blurb={choice.blurb}
                eyebrow={`ROUTE 0${index + 1}`}
                selected={spec.history === choice.value}
                onClick={() =>
                  setSpec((prev) => ({
                    ...prev,
                    history: choice.value,
                    entryDivision: choice.value === 'UNI_YOKOZUNA' ? prev.entryDivision : 'Maezumo',
                  }))
                }
              />
            ))}
          </div>
        </article>
      );
    }

    if (currentStep.id === 'body') {
      return (
        <article className="rpg-panel space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="pixel-icon-badge"><Shield size={16} /></span>
            <div>
              <div className="museum-kicker">Body Draft</div>
              <h3 className="ui-text-heading text-2xl text-[#fff1d8]">土俵に置く体を選ぶ</h3>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {BODY_TYPE_CHOICES.map((choice) => (
              <ChoiceCard
                key={choice.value}
                label={choice.label}
                blurb={choice.blurb}
                eyebrow={`${BUILD_COST.BODY_METRIC_BASELINE[choice.value].heightCm}cm / ${BUILD_COST.BODY_METRIC_BASELINE[choice.value].weightKg}kg`}
                selected={spec.bodyType === choice.value}
                onClick={() => handleBodyTypeChange(choice.value)}
                art={<RikishiPortrait bodyType={choice.value} showLabel className="h-[156px]" />}
              />
            ))}
          </div>
        </article>
      );
    }

    if (currentStep.id === 'style') {
      return (
        <article className="rpg-panel space-y-6 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="pixel-icon-badge"><Swords size={16} /></span>
            <div>
              <div className="museum-kicker">Fight Pattern</div>
              <h3 className="ui-text-heading text-2xl text-[#fff1d8]">伸び方と取り口を決める</h3>
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-sm text-[#d7c0a0]">相撲タイプ</div>
            <div className="grid gap-3 md:grid-cols-2">
              {WIN_STYLE_CHOICES.map((choice, index) => (
                <ChoiceCard
                  key={choice.value}
                  label={choice.label}
                  blurb={choice.blurb}
                  eyebrow={`STYLE 0${index + 1}`}
                  selected={spec.abstractAxes.winStyle === choice.value}
                  onClick={() =>
                    setSpec((prev) => ({
                      ...prev,
                      abstractAxes: { ...prev.abstractAxes, winStyle: choice.value as BuildAxisWinStyle },
                    }))
                  }
                />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-sm text-[#d7c0a0]">成長傾向</div>
            <div className="grid gap-3 md:grid-cols-2">
              {PEAK_CHOICES.map((choice, index) => (
                <ChoiceCard
                  key={choice.value}
                  label={choice.label}
                  blurb={choice.blurb}
                  eyebrow={`GROWTH 0${index + 1}`}
                  selected={spec.abstractAxes.peakDesign === choice.value}
                  onClick={() =>
                    setSpec((prev) => ({
                      ...prev,
                      abstractAxes: { ...prev.abstractAxes, peakDesign: choice.value as BuildAxisPeakDesign },
                    }))
                  }
                />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="text-sm text-[#d7c0a0]">怪我耐性</div>
            <div className="grid gap-3 md:grid-cols-2">
              {[
                { value: 'IRON', label: '怪我に強い', blurb: '休場しにくく、長く相撲を取りやすい。' },
                { value: 'BALANCED', label: '標準的', blurb: '怪我も成長も平均的に推移する。' },
                { value: 'GAMBLE', label: '怪我の波が大きい', blurb: '爆発力はあるが、離脱のリスクも抱える。' },
              ].map((choice, index) => (
                <ChoiceCard
                  key={choice.value}
                  label={choice.label}
                  blurb={choice.blurb}
                  eyebrow={`RISK 0${index + 1}`}
                  selected={spec.abstractAxes.durability === choice.value}
                  onClick={() =>
                    setSpec((prev) => ({
                      ...prev,
                      abstractAxes: { ...prev.abstractAxes, durability: choice.value as BuildAxisDurability },
                    }))
                  }
                />
              ))}
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm text-[#d7c0a0]">特徴（最大2つ）</div>
              <div className="museum-chip bg-[rgba(15,18,22,0.84)] text-[#eef4ff]">{spec.selectedTraits.length}/2</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {traitCandidates.map((trait) => (
                <button
                  key={trait}
                  type="button"
                  className="museum-chip"
                  data-active={spec.selectedTraits.includes(trait)}
                  onClick={() => toggleTrait(trait)}
                >
                  {traitFlavorLabel(trait)}
                </button>
              ))}
            </div>
          </div>
        </article>
      );
    }

    return (
      <article className="rpg-panel space-y-5 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="pixel-icon-badge"><UserRound size={16} /></span>
          <div>
            <div className="museum-kicker">Stable Route</div>
            <h3 className="ui-text-heading text-2xl text-[#fff1d8]">どの部屋に入るか</h3>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-[#d7c0a0]">
            <span>一門</span>
            <select
              className="w-full px-4 py-3"
              value={spec.selectedIchimonId ?? ''}
              onChange={(e) =>
                setSpec((prev) => ({
                  ...prev,
                  selectedIchimonId: (e.target.value || null) as BuildSpecV4['selectedIchimonId'],
                  selectedStableId: null,
                }))
              }
            >
              <option value="">選んでください</option>
              {ICHIMON_CATALOG.map((row) => (
                <option key={row.id} value={row.id}>{row.displayName}</option>
              ))}
            </select>
          </label>
          <label className="space-y-2 text-sm text-[#d7c0a0]">
            <span>所属部屋</span>
            <select
              className="w-full px-4 py-3"
              value={spec.selectedStableId ?? ''}
              disabled={!spec.selectedIchimonId}
              onChange={(e) => setSpec((prev) => ({ ...prev, selectedStableId: e.target.value || null }))}
            >
              <option value="">選んでください</option>
              {stableOptions.map((row) => (
                <option key={row.id} value={row.id}>{row.displayName}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="space-y-2 text-sm text-[#d7c0a0]">
          <span>継承親方（任意）</span>
          <select
            className="w-full px-4 py-3"
            value={spec.selectedOyakataId ?? ''}
            onChange={(e) => setSpec((prev) => ({ ...prev, selectedOyakataId: e.target.value || null }))}
          >
            <option value="">選ばない</option>
            {oyakataProfiles.map((profile) => {
              const locked = isOyakataOnCooldown(profile, nextCareerIndex);
              return (
                <option key={profile.id} value={profile.id} disabled={locked}>
                  {profile.displayName}（★{profile.legacyStars}{locked ? ' / 連続使用不可' : ''}）
                </option>
              );
            })}
          </select>
        </label>
      </article>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 animate-in pb-32">
      <section className="arcade-hero overflow-hidden px-6 py-7 sm:px-8 sm:py-8">
        <div className="relative z-10 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-4">
            <div className="museum-kicker">Draft Board</div>
            <h2 className="ui-text-heading text-4xl text-[#fff1d8] sm:text-5xl">5段階で輪郭を決める</h2>
            <p className="max-w-2xl text-sm leading-7 text-[#d7c0a0] sm:text-base">
              左で選び、右で力士カードを固める。モバイルでも同じ順路でドラフトできる。
            </p>
          </div>
          <div className="scoreboard-panel p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="pixel-card-dark p-3">
                <div className="text-[0.68rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Wallet</div>
                <div className="mt-2 text-2xl text-[#f3f7ff]">{wallet?.points ?? '--'}pt</div>
              </div>
              <div className="pixel-card-dark p-3">
                <div className="text-[0.68rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Cost</div>
                <div className="mt-2 text-2xl text-[#f3f7ff]">{buildCost.total}pt</div>
              </div>
              <div className="pixel-card-dark p-3">
                <div className="text-[0.68rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Ready</div>
                <div className="mt-2 text-2xl text-[#f3f7ff]">{STEPS.filter((step) => isStepDone(step.id)).length}/5</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="command-bar">
        <div className="step-rail pixel-scrollbar w-full">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className="step-node"
              data-active={currentStep.id === step.id}
              data-complete={isStepDone(step.id)}
              onClick={() => setStepIndex(index)}
            >
              <div className="step-index">0{index + 1} / {step.short}</div>
              <div className="step-title">{step.label}</div>
              <div className="text-[0.7rem] text-current/70">
                {isStepDone(step.id) ? 'LOCKED IN' : currentStep.id === step.id ? 'NOW EDITING' : 'PENDING'}
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <section className="space-y-5">
          {renderStepPanel()}
          <div className="command-bar">
            <div className="text-sm text-[#b8cbe6]">STEP {stepIndex + 1} / {STEPS.length}: {currentStep.label}</div>
            <div className="flex items-center gap-3">
              <Button variant="outline" onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))} disabled={stepIndex === 0}>
                <ChevronLeft size={16} className="mr-2" />
                戻る
              </Button>
              <Button variant="secondary" onClick={() => setStepIndex((prev) => Math.min(STEPS.length - 1, prev + 1))} disabled={stepIndex === STEPS.length - 1}>
                次へ
                <ChevronRight size={16} className="ml-2" />
              </Button>
            </div>
          </div>
        </section>
        <aside className="space-y-4 xl:sticky xl:top-28 xl:self-start">
          <section className="scoreboard-panel p-5 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <RikishiPortrait bodyType={spec.bodyType} showLabel className="h-[220px] w-full sm:w-[220px]" />
              <div className="flex-1 space-y-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-[#8ea9cb]">Live Preview</div>
                  <div className="mt-2 ui-text-heading text-3xl text-[#f3f7ff]">{spec.shikona || '未命名'}</div>
                  <div className="mt-2 text-sm text-[#b8cbe6]">
                    {(spec.profile.realName || '本名未設定')} / {(spec.profile.birthplace || '出身地未設定')}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">{preview.startRankLabel}</span>
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">{selectedBody?.label ?? '体格未設定'}</span>
                  <span className="museum-chip bg-[rgba(15,18,22,0.88)] text-[#eef4ff]">
                    {Math.round(spec.bodyMetrics.heightCm)}cm / {Math.round(spec.bodyMetrics.weightKg)}kg
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="pixel-card-dark p-3">
                    <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Growth</div>
                    <div className="mt-2 text-sm text-[#f3f7ff]">{preview.growthLabel}</div>
                  </div>
                  <div className="pixel-card-dark p-3">
                    <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Style</div>
                    <div className="mt-2 text-sm text-[#f3f7ff]">{preview.styleLabel}</div>
                  </div>
                  <div className="pixel-card-dark p-3">
                    <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#8ea9cb]">Durability</div>
                    <div className="mt-2 text-sm text-[#f3f7ff]">{preview.durabilityLabel}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          <section className="rpg-panel p-5 sm:p-6">
            <div className="museum-kicker">Draft Summary</div>
            <h3 className="ui-text-heading mt-2 text-2xl text-[#fff1d8]">送り出し条件</h3>
            <div className="mt-4 space-y-1">
              <SummaryRow label="入門年齢" value={`${preview.entryAge}歳`} />
              <SummaryRow label="出自" value={selectedHistory?.label ?? '未設定'} />
              <SummaryRow label="所属" value={selectedStable?.displayName ?? '未設定'} />
              <SummaryRow label="継承親方" value={selectedOyakata?.displayName ?? 'なし'} />
            </div>
            <div className="mt-5">
              <div className="text-xs uppercase tracking-[0.14em] text-[#d9a441]">Selected Traits</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {spec.selectedTraits.length === 0 ? (
                  <span className="museum-chip">特性なし</span>
                ) : (
                  spec.selectedTraits.map((trait) => (
                    <span key={trait} className="museum-chip" data-active="true">{traitFlavorLabel(trait)}</span>
                  ))
                )}
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="pixel-card p-3">
                <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#6e513d]">Need</div>
                <div className="mt-2 text-2xl text-[#24160f]">{buildCost.total}pt</div>
              </div>
              <div className="pixel-card p-3">
                <div className="text-[0.65rem] uppercase tracking-[0.14em] text-[#6e513d]">Remain</div>
                <div className={`mt-2 text-2xl ${remainingPoints < 0 ? 'text-[#9a4335]' : 'text-[#24160f]'}`}>{remainingPoints}</div>
              </div>
            </div>
            <div className="mt-5">
              <div className="text-xs uppercase tracking-[0.14em] text-[#d9a441]">Pending</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {pendingFields.length === 0 ? (
                  <span className="museum-chip" data-active="true">準備完了</span>
                ) : (
                  pendingFields.map((field) => <span key={field} className="museum-chip">{FIELD_LABELS[field]}</span>)
                )}
              </div>
            </div>
            {errorMessage && <div className="mt-4 text-sm text-[#ffb39f]">{errorMessage}</div>}
          </section>
        </aside>
      </div>
      <div className="fixed bottom-3 left-1/2 z-40 w-[min(calc(100%-1rem),1040px)] -translate-x-1/2">
        <div className="command-bar px-4 py-4 sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="text-sm text-[#eef4ff]">
                {pendingFields.length === 0
                  ? 'この内容で土俵へ送れます。'
                  : `未決定: ${pendingFields.map((field) => FIELD_LABELS[field]).join(' / ')}`}
              </div>
              <div className="text-xs text-[#8ea9cb]">必要 {buildCost.total}pt / 所持 {wallet?.points ?? '--'}pt</div>
            </div>
            <Button variant="danger" size="lg" onClick={handleRegister} disabled={!canRegister} className="w-full px-8 lg:w-auto">
              {isRegistering ? '送り出しています...' : 'この力士を土俵へ送る'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
