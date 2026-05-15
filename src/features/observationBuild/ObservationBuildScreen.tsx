import React from 'react';
import { Sparkles, Eye, Coins, CheckCircle2, AlertTriangle, Landmark } from 'lucide-react';
import { Button } from '../../shared/ui/Button';
import surface from '../../shared/styles/surface.module.css';
import typography from '../../shared/styles/typography.module.css';
import { cn } from '../../shared/lib/cn';
import {
  rollScoutDraft,
  buildInitialRikishiFromDraft,
  SCOUT_GROWTH_TYPE_LABELS,
  SCOUT_TALENT_PROFILE_LABELS,
  type ScoutTalentProfile,
} from '../../logic/scout/gacha';
import {
  AptitudeTier,
  EntryArchetype,
  GrowthType,
  Oyakata,
  RikishiStatus,
  SimulationRunOptions,
  StyleArchetype,
} from '../../logic/models';
import { resolveAptitudeProfile } from '../../logic/constants';
import {
  ENTRY_ARCHETYPE_LABELS,
  resolveEntryDivisionFromRank,
} from '../../logic/career/entryArchetype';
import {
  createMakushitaBottomTsukedashiRank,
  createSandanmeBottomTsukedashiRank,
} from '../../logic/ranking';
import { resolveLegacyAptitudeFactor } from '../../logic/simulation/realism';
import { STYLE_LABELS } from '../../logic/styleProfile';
import type { SimulationPacing } from '../simulation/store/simulationStore';
import type { ObservationPointState } from '../../logic/persistence/observationPoints';
import type { GenerationTokenState } from '../../logic/persistence/generationTokens';
import {
  listObservationThemes,
} from '../../logic/archive/observationThemes';
import {
  listObservationModifiers,
  computeBuildCost,
  validateBuild,
  buildObservationConfig,
  OBSERVATION_MODIFIERS,
} from '../../logic/archive/observationBuild';
import { OBSERVATION_THEMES } from '../../logic/archive/observationThemes';
import { applyObservationBuildBias } from '../../logic/archive/applyObservationBuildBias';
import { selectRandomEraSnapshot, toEraRunMetadata } from '../../logic/era/eraSnapshot';
import {
  listStableEnvironmentChoices,
  resolveStableForEnvironmentChoice,
  type StableEnvironmentChoiceId,
} from '../../logic/simulation/heya/stableEnvironment';
import {
  spendObservationPoints,
  getObservationPointState,
} from '../../logic/persistence/observationPoints';
import type {
  ObservationModifierDefinition,
  ObservationModifierGroup,
  ObservationModifierId,
  ObservationThemeId,
} from '../../logic/archive/types';
import {
  computeObservationBuildModeCost,
  ENTRY_ARCHETYPE_BUILD_COST,
  GROWTH_TYPE_BUILD_COST,
  STABLE_ENVIRONMENT_BUILD_COST,
  STYLE_BUILD_COST,
  TALENT_PROFILE_BUILD_COST,
} from './buildModeCosts';

type ObservationGenerationMode = 'OBSERVE_RANDOM' | 'BUILD';

const MODE_OPTIONS: Array<{ id: ObservationGenerationMode; label: string; summary: string }> = [
  {
    id: 'OBSERVE_RANDOM',
    label: '観測モード',
    summary: '観測テーマだけを選び、部屋・体格・型・素質は候補札のランダム値に任せる。',
  },
  {
    id: 'BUILD',
    label: 'ビルドモード',
    summary: '直接能力値を触らず、成長型・得意な型・付出・天才型などの前提を選ぶ。',
  },
];

const GROWTH_TYPE_OPTIONS: Array<{ value: GrowthType; label: string; note: string; cost: number }> = [
  { value: 'EARLY', label: SCOUT_GROWTH_TYPE_LABELS.EARLY, note: '若いうちに伸び、後半は衰えも早めに出る。', cost: GROWTH_TYPE_BUILD_COST.EARLY },
  { value: 'NORMAL', label: SCOUT_GROWTH_TYPE_LABELS.NORMAL, note: '伸び方と衰え方を標準に置く。', cost: GROWTH_TYPE_BUILD_COST.NORMAL },
  { value: 'LATE', label: SCOUT_GROWTH_TYPE_LABELS.LATE, note: '序盤は重いが、後半の伸び返しを読む。', cost: GROWTH_TYPE_BUILD_COST.LATE },
  { value: 'GENIUS', label: SCOUT_GROWTH_TYPE_LABELS.GENIUS, note: '完成の速さと長いピークを期待する特殊な成長型。', cost: GROWTH_TYPE_BUILD_COST.GENIUS },
];

const STYLE_OPTIONS: Array<{ value: StyleArchetype; label: string; note: string; cost: number }> = [
  { value: 'YOTSU', label: STYLE_LABELS.YOTSU, note: '差して寄る正攻法を入口の型にする。', cost: STYLE_BUILD_COST.YOTSU },
  { value: 'TSUKI_OSHI', label: STYLE_LABELS.TSUKI_OSHI, note: '前に出る圧力を勝ち筋の中心に置く。', cost: STYLE_BUILD_COST.TSUKI_OSHI },
  { value: 'MOROZASHI', label: STYLE_LABELS.MOROZASHI, note: '懐へ入る技術と差し手を重視する。', cost: STYLE_BUILD_COST.MOROZASHI },
  { value: 'DOHYOUGIWA', label: STYLE_LABELS.DOHYOUGIWA, note: '残しと反応で山場を作る型に寄せる。', cost: STYLE_BUILD_COST.DOHYOUGIWA },
  { value: 'NAGE_TECH', label: STYLE_LABELS.NAGE_TECH, note: '投げと崩しの技巧を読み筋にする。', cost: STYLE_BUILD_COST.NAGE_TECH },
  { value: 'POWER_PRESSURE', label: STYLE_LABELS.POWER_PRESSURE, note: '馬力で押し込む圧力相撲を狙う。', cost: STYLE_BUILD_COST.POWER_PRESSURE },
];

const ENTRY_ARCHETYPE_OPTIONS: Array<{ value: EntryArchetype; label: string; note: string; cost: number }> = [
  { value: 'ORDINARY_RECRUIT', label: ENTRY_ARCHETYPE_LABELS.ORDINARY_RECRUIT, note: '付出なし。前相撲から下積みを読む。', cost: ENTRY_ARCHETYPE_BUILD_COST.ORDINARY_RECRUIT },
  { value: 'EARLY_PROSPECT', label: ENTRY_ARCHETYPE_LABELS.EARLY_PROSPECT, note: '肩書は強くないが、序盤の期待を少し持たせる。', cost: ENTRY_ARCHETYPE_BUILD_COST.EARLY_PROSPECT },
  { value: 'TSUKEDASHI', label: ENTRY_ARCHETYPE_LABELS.TSUKEDASHI, note: '三段目付出相当として、下位を短縮する。', cost: ENTRY_ARCHETYPE_BUILD_COST.TSUKEDASHI },
  { value: 'ELITE_TSUKEDASHI', label: ENTRY_ARCHETYPE_LABELS.ELITE_TSUKEDASHI, note: '幕下付出相当として、大きな看板を背負う。', cost: ENTRY_ARCHETYPE_BUILD_COST.ELITE_TSUKEDASHI },
  { value: 'MONSTER', label: ENTRY_ARCHETYPE_LABELS.MONSTER, note: 'まれな怪物候補として、期待と落差を大きくする。', cost: ENTRY_ARCHETYPE_BUILD_COST.MONSTER },
];

const TALENT_PROFILE_OPTIONS: Array<{ value: ScoutTalentProfile; label: string; note: string; cost: number }> = [
  { value: 'AUTO', label: SCOUT_TALENT_PROFILE_LABELS.AUTO, note: '候補札の素質をそのまま使う。', cost: TALENT_PROFILE_BUILD_COST.AUTO },
  { value: 'STANDARD', label: SCOUT_TALENT_PROFILE_LABELS.STANDARD, note: '極端な上振れを抑え、標準的な読み味に寄せる。', cost: TALENT_PROFILE_BUILD_COST.STANDARD },
  { value: 'PROMISING', label: SCOUT_TALENT_PROFILE_LABELS.PROMISING, note: '有望株として、関取到達の期待を少し厚くする。', cost: TALENT_PROFILE_BUILD_COST.PROMISING },
  { value: 'GENIUS', label: SCOUT_TALENT_PROFILE_LABELS.GENIUS, note: '天才型として、素質と成長の上振れを明示的に置く。', cost: TALENT_PROFILE_BUILD_COST.GENIUS },
];

const OptionalBuildChoiceGrid = <T extends string>({
  value,
  autoLabel,
  autoNote,
  options,
  onChange,
}: {
  value: T | undefined;
  autoLabel: string;
  autoNote: string;
  options: Array<{ value: T; label: string; note: string; cost: number }>;
  onChange: (value: T | undefined) => void;
}) => {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange(undefined)}
        className={cn(
          'min-h-[7.5rem] border px-4 py-3 text-left transition',
          value === undefined
            ? 'border-action bg-action/12 shadow-[0_0_0_1px_rgba(255,159,64,0.3)]'
            : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
        )}
      >
        <div className="text-sm text-text">{autoLabel}</div>
        <div className="mt-1.5 text-[11px] leading-relaxed text-text-dim">{autoNote}</div>
      </button>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            'min-h-[7.5rem] border px-4 py-3 text-left transition',
            value === option.value
              ? 'border-action bg-action/12 shadow-[0_0_0_1px_rgba(255,159,64,0.3)]'
              : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
          )}
        >
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-sm text-text">{option.label}</div>
            <div className="text-xs text-gold">+{option.cost} OP</div>
          </div>
          <div className="mt-1.5 text-[11px] leading-relaxed text-text-dim">{option.note}</div>
        </button>
      ))}
    </div>
  );
};

const resolveTalentProfileTier = (profile: ScoutTalentProfile): AptitudeTier | null => {
  if (profile === 'GENIUS') return 'S';
  if (profile === 'PROMISING') return 'A';
  if (profile === 'STANDARD') return 'B';
  return null;
};

const applyDirectEntryArchetypeLock = (
  status: RikishiStatus,
  directEntryArchetype: EntryArchetype,
): void => {
  status.entryArchetype = directEntryArchetype;
  if (directEntryArchetype === 'ELITE_TSUKEDASHI') {
    status.rank = createMakushitaBottomTsukedashiRank();
    status.entryAge = 22;
    status.age = 22;
  } else if (directEntryArchetype === 'TSUKEDASHI') {
    status.rank = createSandanmeBottomTsukedashiRank();
    status.entryAge = 22;
    status.age = 22;
  } else if (directEntryArchetype === 'ORDINARY_RECRUIT' || directEntryArchetype === 'EARLY_PROSPECT') {
    status.rank = { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
  }
  status.entryDivision = resolveEntryDivisionFromRank(status.rank);
  status.history.maxRank = { ...status.rank };
  if (status.careerSeed) {
    status.careerSeed.entryArchetype = directEntryArchetype;
    status.careerSeed.entryArchetypeLabel = ENTRY_ARCHETYPE_LABELS[directEntryArchetype];
  }
};

const applyDirectBuildLocks = (
  status: RikishiStatus,
  input: {
    growthType?: GrowthType;
    entryArchetype?: EntryArchetype;
    talentProfile: ScoutTalentProfile;
  },
): RikishiStatus => {
  if (input.entryArchetype) {
    applyDirectEntryArchetypeLock(status, input.entryArchetype);
  }
  const tier = resolveTalentProfileTier(input.talentProfile);
  if (tier) {
    const profile = resolveAptitudeProfile(tier);
    status.aptitudeTier = tier;
    status.aptitudeProfile = profile;
    status.aptitudeFactor = resolveLegacyAptitudeFactor(profile, tier);
    if (input.talentProfile === 'GENIUS') {
      status.archetype = 'GENIUS';
    }
  }
  if (input.growthType) {
    status.growthType = input.growthType;
  } else if (input.talentProfile === 'GENIUS') {
    status.growthType = 'GENIUS';
  }
  return status;
};

interface ObservationBuildScreenProps {
  generationTokens: GenerationTokenState | null;
  observationPoints: ObservationPointState | null;
  onStart: (
    initialStats: RikishiStatus,
    oyakata: Oyakata | null,
    initialPacing?: SimulationPacing,
    runOptions?: SimulationRunOptions,
  ) => void | Promise<void>;
  onRefreshMeta?: () => void | Promise<void>;
}

// Short, user-facing intent hint per theme. Avoids leaking numeric weights.
const THEME_INTENT_HINT: Record<ObservationThemeId, string> = {
  random: '寄せずに、そのままの揺らぎを観測する。',
  realistic: '実データ寄りに寄せる。下位止まり・短命キャリアも普通に出る。',
  featured: '素質と地力をやや上に寄せる。それでも保証はない。',
  makushita_wall: '幕下帯の停滞を観測しやすくする。十両届かないキャリア向け。',
  late_bloomer: '晩成寄りに寄せる。序盤は伸びにくく、開花前の引退もある。',
};

const THEME_DISPLAY_COPY: Record<ObservationThemeId, string> = {
  random: '特別な方向づけを置かず、力士人生の揺らぎをそのまま読む。',
  realistic: '現実寄りの厳しさを残し、下位止まりや短い一代も含めて読む。',
  featured: '注目を集めそうな入口条件に寄せる。大成は保証されない。',
  makushita_wall: '幕下前後で足踏みする一代を読みやすくする。',
  late_bloomer: '序盤の停滞から、後年の伸びが見えるかを読む。',
};

const MODIFIER_DISPLAY_COPY: Record<ObservationModifierId, { description: string; riskText?: string }> = {
  small_body: {
    description: '小兵らしい速さや技の見せ場が出やすい。大型相手には苦しい場面も残る。',
  },
  large_body: {
    description: '体の大きさを生かした圧力が読みやすい。動きの鈍さや故障は起こり得る。',
  },
  oshizumo_style: {
    description: '前に出る相撲や押し切る展開を読みやすくする。',
  },
  technical_style: {
    description: '組み合いや技で局面を変える一代を読みやすくする。',
  },
  late_growth_bias: {
    description: '序盤は伸び悩みやすいが、後半に味が出る一代を読みやすくする。',
  },
  stable_temperament: {
    description: '大きく荒れにくい一代を読みやすくする。劇的な跳ね方はやや控えめ。',
  },
  volatile_temperament: {
    description: '上振れと下振れがどちらも目立つ一代を読みやすくする。',
    riskText: '怪我・短期失速・連敗も発生しやすくなる。',
  },
  injury_risk_high: {
    description: '怪我や休場がキャリアの読みどころになりやすい。',
    riskText: '長期休場や早期引退の確率が上がる。',
  },
};

const GROUP_META: Record<ObservationModifierGroup, { label: string; hint: string }> = {
  body: { label: '体格', hint: '択一' },
  style: { label: '取り口', hint: '択一' },
  growth: { label: '成長', hint: '択一' },
  risk: { label: 'リスク傾向', hint: '複数可' },
};

const GROUP_ORDER: ObservationModifierGroup[] = ['body', 'style', 'growth', 'risk'];

export const ObservationBuildScreen: React.FC<ObservationBuildScreenProps> = ({
  generationTokens,
  observationPoints,
  onStart,
  onRefreshMeta,
}) => {
  const themes = React.useMemo(() => listObservationThemes(), []);
  const modifiers = React.useMemo(() => listObservationModifiers(), []);
  const stableEnvironmentChoices = React.useMemo(() => listStableEnvironmentChoices(), []);
  const [generationMode, setGenerationMode] = React.useState<ObservationGenerationMode>('OBSERVE_RANDOM');
  const [themeId, setThemeId] = React.useState<ObservationThemeId>('random');
  const [modifierIds, setModifierIds] = React.useState<ObservationModifierId[]>([]);
  const [stableEnvironmentChoiceId, setStableEnvironmentChoiceId] =
    React.useState<StableEnvironmentChoiceId>('AUTO');
  const [growthType, setGrowthType] = React.useState<GrowthType | undefined>(undefined);
  const [preferredStyle, setPreferredStyle] = React.useState<StyleArchetype | undefined>(undefined);
  const [entryArchetype, setEntryArchetype] = React.useState<EntryArchetype | undefined>(undefined);
  const [talentProfile, setTalentProfile] = React.useState<ScoutTalentProfile>('AUTO');
  const [isStarting, setIsStarting] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const effectiveModifierIds = generationMode === 'BUILD' ? modifierIds : [];
  const directBuildCost = generationMode === 'BUILD'
    ? computeObservationBuildModeCost({
      growthType,
      preferredStyle,
      entryArchetype,
      talentProfile,
      stableEnvironmentChoiceId,
    })
    : 0;
  const biasBuildCost = computeBuildCost(themeId, effectiveModifierIds);
  const totalCost = biasBuildCost + directBuildCost;
  const validation = validateBuild(themeId, effectiveModifierIds);
  const opBalance = observationPoints?.points ?? 0;
  const tokenBalance = generationTokens?.tokens ?? 0;
  const insufficientOp = totalCost > opBalance;
  const insufficientToken = tokenBalance <= 0;
  const canStart = validation.ok && !insufficientOp && !insufficientToken && !isStarting;
  const remainingOp = Math.max(0, opBalance - totalCost);

  const modifiersByGroup = React.useMemo(() => {
    const map: Record<ObservationModifierGroup, ObservationModifierDefinition[]> = {
      body: [],
      style: [],
      growth: [],
      risk: [],
    };
    for (const m of modifiers) {
      const g = m.exclusiveGroup ?? 'risk';
      map[g].push(m);
    }
    return map;
  }, [modifiers]);

  const changeGenerationMode = (mode: ObservationGenerationMode) => {
    setGenerationMode(mode);
    if (mode === 'OBSERVE_RANDOM') {
      setModifierIds([]);
      setStableEnvironmentChoiceId('AUTO');
      setGrowthType(undefined);
      setPreferredStyle(undefined);
      setEntryArchetype(undefined);
      setTalentProfile('AUTO');
    }
  };

  const toggleModifier = (id: ObservationModifierId) => {
    const def = OBSERVATION_MODIFIERS[id];
    setModifierIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // Exclusive groups (body/style/growth): replace any existing pick in same group.
      if (def?.exclusiveGroup && def.exclusiveGroup !== 'risk') {
        const filtered = prev.filter((other) => {
          const od = OBSERVATION_MODIFIERS[other];
          return od?.exclusiveGroup !== def.exclusiveGroup;
        });
        return [...filtered, id];
      }
      return [...prev, id];
    });
  };

  const changeEntryArchetype = (value: EntryArchetype | undefined) => {
    setEntryArchetype(value);
  };

  const handleStart = async () => {
    if (!canStart) return;
    setIsStarting(true);
    setErrorMessage(null);
    try {
      if (totalCost > 0) {
        const spend = await spendObservationPoints(totalCost, 'OBSERVE_THEME');
        if (!spend.ok) {
          setErrorMessage('観測ポイントが不足しています。');
          return;
        }
      }
      if (onRefreshMeta) await onRefreshMeta();

      const stable = resolveStableForEnvironmentChoice(
        generationMode === 'BUILD' ? stableEnvironmentChoiceId : 'AUTO',
      );
      const draft = {
        ...rollScoutDraft(),
        selectedStableId: stable.id,
        ...(generationMode === 'BUILD'
          ? {
            growthType,
            preferredStyle,
            entryArchetype,
            talentProfile,
          }
          : {}),
      };
      const baseStatus = buildInitialRikishiFromDraft(draft);
      const config = buildObservationConfig(themeId, effectiveModifierIds);
      const { status: biasedStatus } = applyObservationBuildBias(baseStatus, config);
      const finalStatus = generationMode === 'BUILD'
        ? applyDirectBuildLocks(biasedStatus, { growthType, entryArchetype, talentProfile })
        : biasedStatus;

      const eraSnapshot = selectRandomEraSnapshot();
      const runOptions: SimulationRunOptions = {
        observationRuleMode: 'STANDARD',
        observationStanceId: 'PROMOTION_EXPECTATION',
        observationThemeId: themeId,
        observationModifierIds: effectiveModifierIds,
        ...toEraRunMetadata(eraSnapshot),
      };

      await onStart(finalStatus, null, 'skip_to_end', runOptions);
      await getObservationPointState();
      if (onRefreshMeta) await onRefreshMeta();
    } finally {
      setIsStarting(false);
    }
  };

  const selectedTheme = OBSERVATION_THEMES[themeId];
  const selectedModifiers = effectiveModifierIds
    .map((id) => OBSERVATION_MODIFIERS[id])
    .filter(Boolean);
  const selectedStableEnvironment = stableEnvironmentChoices.find((choice) =>
    choice.id === (generationMode === 'BUILD' ? stableEnvironmentChoiceId : 'AUTO'));
  const selectedBuildLabels = generationMode === 'BUILD'
    ? [
      growthType ? SCOUT_GROWTH_TYPE_LABELS[growthType] : null,
      preferredStyle ? STYLE_LABELS[preferredStyle] : null,
      entryArchetype ? ENTRY_ARCHETYPE_LABELS[entryArchetype] : null,
      talentProfile !== 'AUTO' ? SCOUT_TALENT_PROFILE_LABELS[talentProfile] : null,
    ].filter((label): label is string => Boolean(label))
    : [];

  const insufficientReason: string | null = (() => {
    if (insufficientToken) return `生成札が足りません (現在 ${tokenBalance})。`;
    if (insufficientOp) return `観測ポイントが足りません (あと ${totalCost - opBalance} OP 必要)。`;
    if (validation.errors.length > 0) return '選べない組み合わせが含まれています。選択を見直してください。';
    return null;
  })();

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-32">
      {/* Header */}
      <section className={cn(surface.panel, 'space-y-4 p-6')}>
        <div className="flex items-center gap-3">
          <Eye className="h-6 w-6 text-action" />
          <div>
            <div className={typography.kicker}>観測設計</div>
            <h2 className={cn(typography.heading, 'text-3xl text-text')}>どんな相撲人生を観測しますか</h2>
          </div>
        </div>

        <div className="grid gap-2 border-l-2 border-amber-300/30 bg-amber-300/[0.04] px-4 py-3 text-xs text-amber-100/85">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 select-none text-amber-200/80">・</span>
            <span>テーマと読み口の調整は、キャリアの傾向を少し寄せるだけです。</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 select-none text-amber-200/80">・</span>
            <span>番付環境・怪我・成長の揺らぎで、思った通りには進みません。</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 select-none text-amber-200/80">・</span>
            <span>思い通りにならないキャリアも、資料館の一部になります。</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border border-gold/15 bg-bg/20 px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-gold" />
            <span className="text-xs text-text-dim">観測ポイント</span>
            <span className="text-text">{opBalance}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-action" />
            <span className="text-xs text-text-dim">生成札</span>
            <span className="text-text">{tokenBalance}</span>
          </div>
        </div>
      </section>

      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className={cn(typography.heading, 'text-xl text-text')}>生成モード</h3>
          <div className="text-[11px] text-text-dim">
            直接能力値は表示せず、観測の幅か入口条件だけを選びます。
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {MODE_OPTIONS.map((mode) => {
            const active = generationMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => changeGenerationMode(mode.id)}
                className={cn(
                  'min-h-[8rem] border px-4 py-4 text-left transition',
                  active
                    ? 'border-action bg-action/15 shadow-[0_0_0_1px_rgba(255,159,64,0.35)]'
                    : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-lg text-text">{mode.label}</span>
                  {active ? (
                    <span className="inline-flex items-center gap-1 border border-action/60 bg-action/20 px-1.5 py-0.5 text-[10px] tracking-wider text-action">
                      <CheckCircle2 className="h-3 w-3" />
                      選択中
                    </span>
                  ) : null}
                </div>
                <div className="mt-2 text-xs leading-relaxed text-text-dim">{mode.summary}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Themes */}
      <section className={cn(surface.panel, 'space-y-3 p-5')}>
        <div className="flex items-baseline justify-between">
          <h3 className={cn(typography.heading, 'text-xl text-text')}>観測テーマ</h3>
          <div className="text-[11px] text-text-dim">迷ったら 0 OP の「完全ランダム」から。</div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {themes.map((theme) => {
            const active = theme.id === themeId;
            const intent = THEME_INTENT_HINT[theme.id];
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => setThemeId(theme.id)}
                className={cn(
                  'group relative flex flex-col gap-2 border px-4 py-4 text-left transition',
                  active
                    ? 'border-action bg-action/15 shadow-[0_0_0_1px_rgba(255,159,64,0.35)]'
                    : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                )}
              >
                {active ? (
                  <span className="absolute right-3 top-3 inline-flex items-center gap-1 border border-action/60 bg-action/20 px-1.5 py-0.5 text-[10px] tracking-wider text-action">
                    <CheckCircle2 className="h-3 w-3" />
                    選択中
                  </span>
                ) : null}
                <div className="flex items-baseline gap-2 pr-16">
                  <span className={cn('text-lg', active ? 'text-text' : 'text-text/90')}>{theme.label}</span>
                  <span className={cn('ml-auto text-sm', active ? 'text-gold' : 'text-gold/80')}>
                    {theme.cost === 0 ? '無料' : `${theme.cost} OP`}
                  </span>
                </div>
                <div className="text-xs text-text-dim leading-relaxed">{THEME_DISPLAY_COPY[theme.id]}</div>
                {intent ? (
                  <div className="text-[11px] text-action/80 leading-relaxed">→ {intent}</div>
                ) : null}
                <div className="text-[11px] text-amber-300/70">{theme.riskText}</div>
              </button>
            );
          })}
        </div>
      </section>

      {generationMode === 'BUILD' ? (
        <section className={cn(surface.panel, 'space-y-5 p-5')}>
          <div className="flex items-baseline justify-between gap-4">
            <h3 className={cn(typography.heading, 'text-xl text-text')}>ビルド方針</h3>
            <div className="text-[11px] text-text-dim">
              ここでは能力値ではなく、キャリア前提だけを選びます。強い前提ほど OP が重くなります。
            </div>
          </div>

          <div className="space-y-2">
            <div className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
              成長型
            </div>
            <OptionalBuildChoiceGrid<GrowthType>
              value={growthType}
              autoLabel="候補札に任せる"
              autoNote="経歴と素質から自然な成長型を決めます。"
              options={GROWTH_TYPE_OPTIONS}
              onChange={setGrowthType}
            />
          </div>

          <div className="space-y-2">
            <div className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
              得意な型
            </div>
            <OptionalBuildChoiceGrid<StyleArchetype>
              value={preferredStyle}
              autoLabel="体格と部屋に任せる"
              autoNote="身体素地と所属環境から自然な型を決めます。"
              options={STYLE_OPTIONS}
              onChange={setPreferredStyle}
            />
          </div>

          <div className="space-y-2">
            <div className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
              付出・入門資格
            </div>
            <OptionalBuildChoiceGrid<EntryArchetype>
              value={entryArchetype}
              autoLabel="候補札に任せる"
              autoNote="入門経路に応じた自然な資格で始めます。"
              options={ENTRY_ARCHETYPE_OPTIONS}
              onChange={changeEntryArchetype}
            />
          </div>

          <div className="space-y-2">
            <div className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
              素質の輪郭
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {TALENT_PROFILE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTalentProfile(option.value)}
                  className={cn(
                    'min-h-[7.5rem] border px-4 py-3 text-left transition',
                    talentProfile === option.value
                      ? 'border-action bg-action/12 shadow-[0_0_0_1px_rgba(255,159,64,0.3)]'
                      : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                  )}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="text-sm text-text">{option.label}</div>
                    {option.cost > 0 ? (
                      <div className="text-xs text-gold">+{option.cost} OP</div>
                    ) : (
                      <div className="text-xs text-text-dim">無料</div>
                    )}
                  </div>
                  <div className="mt-1.5 text-[11px] leading-relaxed text-text-dim">{option.note}</div>
                </button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 所属環境 */}
      {generationMode === 'BUILD' ? (
        <section className={cn(surface.panel, 'space-y-3 p-5')}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Landmark className="h-5 w-5 text-gold" />
              <div>
                <h3 className={cn(typography.heading, 'text-xl text-text')}>所属環境</h3>
                <div className="mt-1 text-xs leading-relaxed text-text-dim">
                部屋そのものを運営せず、入門先の稽古の空気を一代の読み筋として置きます。
                  {stableEnvironmentChoiceId !== 'AUTO' ? ` 環境指定は +${STABLE_ENVIRONMENT_BUILD_COST} OP です。` : ''}
                </div>
              </div>
            </div>
            <div className="hidden text-[11px] text-text-dim sm:block">45部屋から直接選ばず、環境の系統だけを選びます。</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stableEnvironmentChoices.map((choice) => {
              const active = choice.id === stableEnvironmentChoiceId;
              return (
                <button
                  key={choice.id}
                  type="button"
                  onClick={() => setStableEnvironmentChoiceId(choice.id)}
                  className={cn(
                    'group relative flex min-h-[9.25rem] flex-col gap-2 border px-4 py-4 text-left transition',
                    active
                      ? 'border-gold bg-gold/12 shadow-[0_0_0_1px_rgba(224,181,91,0.28)]'
                      : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                  )}
                >
                  {active ? (
                    <span className="absolute right-3 top-3 inline-flex items-center gap-1 border border-gold/60 bg-gold/15 px-1.5 py-0.5 text-[10px] tracking-wider text-gold">
                      <CheckCircle2 className="h-3 w-3" />
                    選択中
                    </span>
                  ) : null}
                  <span className={cn('pr-16 text-base', active ? 'text-text' : 'text-text/90')}>
                    {choice.label}
                  </span>
                  <span className="text-xs leading-relaxed text-text-dim">{choice.summary}</span>
                  <span className="text-[11px] leading-relaxed text-gold/70">{choice.detail}</span>
                  <span className="mt-auto text-xs text-gold">
                    {choice.id === 'AUTO' ? '無料' : `+${STABLE_ENVIRONMENT_BUILD_COST} OP`}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Modifiers grouped */}
      {generationMode === 'BUILD' ? (
        <section className={cn(surface.panel, 'space-y-5 p-5')}>
          <div className="flex items-baseline justify-between">
            <h3 className={cn(typography.heading, 'text-xl text-text')}>読み口の調整</h3>
            <div className="text-[11px] text-text-dim">体格・取り口・成長は択一、リスクは複数可。</div>
          </div>

          {GROUP_ORDER.map((group) => {
            const list = modifiersByGroup[group];
            if (!list || list.length === 0) return null;
            const meta = GROUP_META[group];
            return (
              <div key={group} className="space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className={cn(typography.label, 'text-[10px] tracking-[0.3em] text-text-dim uppercase')}>
                    {meta.label}
                  </span>
                  <span className="text-[10px] text-text-dim/70">({meta.hint})</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {list.map((mod) => {
                    const active = modifierIds.includes(mod.id);
                    const isDiscount = mod.cost < 0;
                    const displayCopy = MODIFIER_DISPLAY_COPY[mod.id];
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => toggleModifier(mod.id)}
                        className={cn(
                          'flex flex-col gap-1.5 border px-4 py-3 text-left transition',
                          active
                            ? 'border-action bg-action/12 shadow-[0_0_0_1px_rgba(255,159,64,0.3)]'
                            : 'border-white/10 bg-white/[0.02] hover:border-gold/40',
                        )}
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-sm text-text">{mod.label}</span>
                          <div className="flex items-center gap-1.5">
                            {isDiscount ? (
                              <span className="border border-emerald-400/40 bg-emerald-400/10 px-1.5 py-0.5 text-[9px] tracking-wider text-emerald-300">
                              割引
                              </span>
                            ) : null}
                            {mod.riskText ? (
                              <span className="border border-amber-300/40 bg-amber-300/10 px-1.5 py-0.5 text-[9px] tracking-wider text-amber-200">
                              リスク
                              </span>
                            ) : null}
                            <span className={cn('text-xs', isDiscount ? 'text-emerald-400' : 'text-gold')}>
                              {mod.cost > 0 ? `+${mod.cost}` : mod.cost} OP
                            </span>
                          </div>
                        </div>
                        <div className="text-[11px] text-text-dim leading-relaxed">{displayCopy.description}</div>
                        {displayCopy.riskText ? (
                          <div className="text-[10px] text-amber-300/70">{displayCopy.riskText}</div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Validation errors (if any) */}
      {validation.errors.length > 0 ? (
        <section className={cn(surface.panel, 'p-4')}>
          <ul className="space-y-1 text-xs text-red-300">
            {validation.errors.map((err, i) => (
              <li key={`${err}-${i}`} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>選べない組み合わせが含まれています。選択を見直してください。</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {errorMessage ? (
        <section className={cn(surface.panel, 'p-4 text-xs text-red-300')}>{errorMessage}</section>
      ) : null}

      {/* Sticky bottom summary */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-bg/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex flex-1 flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-text-dim">あなたの観測:</span>
            <span className="border border-white/15 bg-white/[0.03] px-2 py-0.5 text-text-dim">
              {generationMode === 'BUILD' ? 'ビルドモード' : '観測モード'}
            </span>
            {selectedTheme ? (
              <span className="border border-action/40 bg-action/10 px-2 py-0.5 text-text">
                {selectedTheme.label}
              </span>
            ) : null}
            {selectedBuildLabels.map((label) => (
              <span
                key={label}
                className="border border-action/30 bg-action/10 px-2 py-0.5 text-action"
              >
                {label}
              </span>
            ))}
            {selectedModifiers.map((mod) => (
              <span
                key={mod.id}
                className="border border-white/15 bg-white/[0.03] px-2 py-0.5 text-text-dim"
              >
                {mod.label}
              </span>
            ))}
            {selectedStableEnvironment ? (
              <span className="border border-gold/30 bg-gold/10 px-2 py-0.5 text-gold">
                {selectedStableEnvironment.label}
              </span>
            ) : null}
            {generationMode === 'BUILD' && selectedModifiers.length === 0 && selectedBuildLabels.length === 0 ? (
              <span className="text-text-dim/60">追加調整なし</span>
            ) : null}
            {generationMode === 'OBSERVE_RANDOM' ? (
              <span className="text-text-dim/60">テーマ以外は完全ランダム</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {generationMode === 'BUILD' ? (
              <div>
                <span className="text-text-dim">ビルド</span>{' '}
                <span className="text-gold">{directBuildCost} OP</span>
              </div>
            ) : null}
            <div>
              <span className="text-text-dim">消費</span>{' '}
              <span className={cn(insufficientOp ? 'text-red-400' : 'text-gold')}>{totalCost} OP</span>
            </div>
            <div>
              <span className="text-text-dim">観測後</span>{' '}
              <span className="text-text">{remainingOp} OP</span>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button size="lg" disabled={!canStart} onClick={() => void handleStart()}>
              <Eye className="mr-2 h-4 w-4" />
              {isStarting ? '観測開始中…' : `観測を開始 (${totalCost} OP)`}
            </Button>
            {!canStart && insufficientReason ? (
              <div className="text-[11px] text-red-300">{insufficientReason}</div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
