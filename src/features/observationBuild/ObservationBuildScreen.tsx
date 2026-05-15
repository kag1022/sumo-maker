import React from 'react';
import { Sparkles, Eye, Coins, CheckCircle2, AlertTriangle, Landmark } from 'lucide-react';
import { Button } from '../../shared/ui/Button';
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
import styles from './ObservationBuildScreen.module.css';

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

const formatCostLabel = (cost: number): string => {
  if (cost === 0) return '無料';
  return cost > 0 ? `+${cost} OP` : `${cost} OP`;
};

const resolveCostTone = (cost: number): 'free' | 'cost' | 'discount' => {
  if (cost === 0) return 'free';
  return cost > 0 ? 'cost' : 'discount';
};

const CostPill: React.FC<{ cost: number; tone?: 'free' | 'cost' | 'discount' | 'risk' }> = ({
  cost,
  tone,
}) => (
  <span className={styles.costPill} data-tone={tone ?? resolveCostTone(cost)}>
    {formatCostLabel(cost)}
  </span>
);

const ActiveBadge: React.FC = () => (
  <span className={styles.activeBadge}>
    <CheckCircle2 className="h-3 w-3" />
    選択中
  </span>
);

const MetaPill: React.FC<{ children: React.ReactNode; tone?: 'risk' | 'discount' }> = ({
  children,
  tone,
}) => (
  <span className={styles.metaPill} data-tone={tone}>
    {children}
  </span>
);

const ChoiceCard: React.FC<{
  title: string;
  note: string;
  active: boolean;
  onClick: () => void;
  cost?: number;
  detail?: React.ReactNode;
  tall?: boolean;
  children?: React.ReactNode;
}> = ({ title, note, active, onClick, cost, detail, tall = false, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(styles.choiceCard, tall ? styles.choiceCardTall : undefined)}
    data-active={active}
  >
    <div className={styles.choiceHead}>
      <span className={styles.choiceTitle}>{title}</span>
      <div className={styles.pillRow}>
        {cost !== undefined ? <CostPill cost={cost} /> : null}
        {active ? <ActiveBadge /> : null}
      </div>
    </div>
    <div className={styles.choiceNote}>{note}</div>
    {detail ? <div className={styles.choiceDetail}>{detail}</div> : null}
    {children}
  </button>
);

const SectionHeader: React.FC<{
  title: string;
  meta?: string;
  icon?: React.ReactNode;
}> = ({ title, meta, icon }) => (
  <div className={styles.sectionHeader}>
    <div className="flex items-start gap-3">
      {icon}
      <div className={styles.headingBlock}>
        <h3 className={cn(typography.heading, 'text-xl text-text')}>{title}</h3>
        {meta ? <div className={styles.sectionMeta}>{meta}</div> : null}
      </div>
    </div>
  </div>
);

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
    <div className={styles.choiceGrid}>
      <ChoiceCard
        title={autoLabel}
        note={autoNote}
        active={value === undefined}
        onClick={() => onChange(undefined)}
        cost={0}
      />
      {options.map((option) => (
        <ChoiceCard
          key={option.value}
          title={option.label}
          note={option.note}
          active={value === option.value}
          onClick={() => onChange(option.value)}
          cost={option.cost}
        />
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
  const selectedStableEnvironment = generationMode === 'BUILD'
    ? stableEnvironmentChoices.find((choice) => choice.id === stableEnvironmentChoiceId)
    : undefined;
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
    <div className={styles.screen}>
      <section className={styles.heroPanel}>
        <div className="flex items-center gap-3">
          <Eye className="h-6 w-6 text-action" />
          <div>
            <div className={typography.kicker}>観測設計</div>
            <h2 className={cn(typography.heading, 'text-3xl text-text')}>どんな相撲人生を観測しますか</h2>
          </div>
        </div>

        <div className={styles.notice}>
          <div className="flex items-start gap-2">
            <span>テーマと読み口の調整は、キャリアの傾向を少し寄せるだけです。</span>
          </div>
          <div className="flex items-start gap-2">
            <span>番付環境・怪我・成長の揺らぎで、思った通りには進みません。</span>
          </div>
          <div className="flex items-start gap-2">
            <span>思い通りにならないキャリアも、資料館の一部になります。</span>
          </div>
        </div>

        <div className={styles.resourceStrip}>
          <div className="flex items-center gap-2">
            <Coins className="h-4 w-4 text-gold" />
            <span className="text-xs text-text-dim">観測ポイント</span>
            <span className={styles.summaryCost}>{opBalance}</span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-action" />
            <span className="text-xs text-text-dim">生成札</span>
            <span className={styles.summaryCost}>{tokenBalance}</span>
          </div>
        </div>
      </section>

      <section className={styles.sectionPanel}>
        <SectionHeader
          title="生成モード"
          meta="直接能力値は表示せず、観測の幅か入口条件だけを選びます。"
        />
        <div className={styles.choiceGrid}>
          {MODE_OPTIONS.map((mode) => {
            const active = generationMode === mode.id;
            return (
              <ChoiceCard
                key={mode.id}
                title={mode.label}
                note={mode.summary}
                active={active}
                onClick={() => changeGenerationMode(mode.id)}
                tall
              />
            );
          })}
        </div>
      </section>

      <section className={styles.sectionPanel}>
        <SectionHeader title="観測テーマ" meta="迷ったら 0 OP の「完全ランダム」から。" />
        <div className={styles.choiceGrid}>
          {themes.map((theme) => {
            const active = theme.id === themeId;
            const intent = THEME_INTENT_HINT[theme.id];
            return (
              <ChoiceCard
                key={theme.id}
                title={theme.label}
                note={THEME_DISPLAY_COPY[theme.id]}
                active={active}
                onClick={() => setThemeId(theme.id)}
                cost={theme.cost}
                detail={(
                  <>
                    {intent ? <span>{intent}</span> : null}
                    <span>{theme.riskText}</span>
                  </>
                )}
              />
            );
          })}
        </div>
      </section>

      {generationMode === 'BUILD' ? (
        <section className={styles.sectionPanel}>
          <SectionHeader
            title="ビルド方針"
            meta="ここでは能力値ではなく、キャリア前提だけを選びます。強い前提ほど OP が重くなります。"
          />

          <div className={styles.optionalGroup}>
            <div className={cn(typography.label, styles.groupLabel)}>成長型</div>
            <OptionalBuildChoiceGrid<GrowthType>
              value={growthType}
              autoLabel="候補札に任せる"
              autoNote="経歴と素質から自然な成長型を決めます。"
              options={GROWTH_TYPE_OPTIONS}
              onChange={setGrowthType}
            />
          </div>

          <div className={styles.optionalGroup}>
            <div className={cn(typography.label, styles.groupLabel)}>得意な型</div>
            <OptionalBuildChoiceGrid<StyleArchetype>
              value={preferredStyle}
              autoLabel="体格と部屋に任せる"
              autoNote="身体素地と所属環境から自然な型を決めます。"
              options={STYLE_OPTIONS}
              onChange={setPreferredStyle}
            />
          </div>

          <div className={styles.optionalGroup}>
            <div className={cn(typography.label, styles.groupLabel)}>付出・入門資格</div>
            <OptionalBuildChoiceGrid<EntryArchetype>
              value={entryArchetype}
              autoLabel="候補札に任せる"
              autoNote="入門経路に応じた自然な資格で始めます。"
              options={ENTRY_ARCHETYPE_OPTIONS}
              onChange={changeEntryArchetype}
            />
          </div>

          <div className={styles.optionalGroup}>
            <div className={cn(typography.label, styles.groupLabel)}>素質の輪郭</div>
            <div className={styles.choiceGrid}>
              {TALENT_PROFILE_OPTIONS.map((option) => (
                <ChoiceCard
                  key={option.value}
                  title={option.label}
                  note={option.note}
                  active={talentProfile === option.value}
                  onClick={() => setTalentProfile(option.value)}
                  cost={option.cost}
                />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* 所属環境 */}
      {generationMode === 'BUILD' ? (
        <section className={styles.sectionPanel}>
          <SectionHeader
            title="所属環境"
            meta={`部屋そのものを運営せず、入門先の稽古の空気を一代の読み筋として置きます。45部屋から直接選ばず、環境の系統だけを選びます。${stableEnvironmentChoiceId !== 'AUTO' ? ` 環境指定は +${STABLE_ENVIRONMENT_BUILD_COST} OP です。` : ''}`}
            icon={<Landmark className="h-5 w-5 text-gold" />}
          />
          <div className={styles.choiceGridThree}>
            {stableEnvironmentChoices.map((choice) => {
              const active = choice.id === stableEnvironmentChoiceId;
              return (
                <ChoiceCard
                  key={choice.id}
                  title={choice.label}
                  note={choice.summary}
                  active={active}
                  onClick={() => setStableEnvironmentChoiceId(choice.id)}
                  cost={choice.id === 'AUTO' ? 0 : STABLE_ENVIRONMENT_BUILD_COST}
                  detail={<span>{choice.detail}</span>}
                  tall
                />
              );
            })}
          </div>
        </section>
      ) : null}

      {/* Modifiers grouped */}
      {generationMode === 'BUILD' ? (
        <section className={styles.sectionPanel}>
          <SectionHeader title="読み口の調整" meta="体格・取り口・成長は択一、リスクは複数可。" />

          {GROUP_ORDER.map((group) => {
            const list = modifiersByGroup[group];
            if (!list || list.length === 0) return null;
            const meta = GROUP_META[group];
            return (
              <div key={group} className={styles.optionalGroup}>
                <div className="flex items-baseline gap-2">
                  <span className={cn(typography.label, styles.groupLabel)}>{meta.label}</span>
                  <span className={styles.sectionMeta}>({meta.hint})</span>
                </div>
                <div className={styles.choiceGrid}>
                  {list.map((mod) => {
                    const active = modifierIds.includes(mod.id);
                    const isDiscount = mod.cost < 0;
                    const displayCopy = MODIFIER_DISPLAY_COPY[mod.id];
                    return (
                      <ChoiceCard
                        key={mod.id}
                        title={mod.label}
                        note={displayCopy.description}
                        active={active}
                        onClick={() => toggleModifier(mod.id)}
                        cost={mod.cost}
                        detail={displayCopy.riskText ? <span>{displayCopy.riskText}</span> : undefined}
                      >
                        <div className={styles.pillRow}>
                          {isDiscount ? <MetaPill tone="discount">割引</MetaPill> : null}
                          {mod.riskText ? <MetaPill tone="risk">リスク</MetaPill> : null}
                        </div>
                      </ChoiceCard>
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
        <section className={styles.validationPanel}>
          <ul className="space-y-1">
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
        <section className={styles.validationPanel}>{errorMessage}</section>
      ) : null}

      {/* Sticky bottom summary */}
      <div className={styles.stickySummary}>
        <div className={styles.summaryInner}>
          <div className={styles.summaryChips}>
            <span className="text-text-dim">あなたの観測:</span>
            <span className={styles.summaryChip}>
              {generationMode === 'BUILD' ? 'ビルドモード' : '観測モード'}
            </span>
            {selectedTheme ? (
              <span className={styles.summaryChip}>
                {selectedTheme.label}
              </span>
            ) : null}
            {selectedBuildLabels.map((label) => (
              <span
                key={label}
                className={styles.summaryChip}
              >
                {label}
              </span>
            ))}
            {selectedModifiers.map((mod) => (
              <span
                key={mod.id}
                className={styles.summaryChip}
              >
                {mod.label}
              </span>
            ))}
            {selectedStableEnvironment ? (
              <span className={styles.summaryChip}>
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
                <span className={styles.summaryCost}>{directBuildCost} OP</span>
              </div>
            ) : null}
            <div>
              <span className="text-text-dim">消費</span>{' '}
              <span className={cn(insufficientOp ? 'text-red-400' : styles.summaryCost)}>{totalCost} OP</span>
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
