import React from 'react';
import { Sparkles, Eye, Coins, CheckCircle2, AlertTriangle, Landmark, ScrollText, ClipboardList } from 'lucide-react';
import { Button } from '../../shared/ui/Button';
import typography from '../../shared/styles/typography.module.css';
import { cn } from '../../shared/lib/cn';
import { useLocale } from '../../shared/hooks/useLocale';
import type { LocaleCode } from '../../shared/lib/locale';
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

const MODE_EN_COPY: Record<ObservationGenerationMode, { label: string; summary: string }> = {
  OBSERVE_RANDOM: {
    label: 'Observation Mode',
    summary: 'Pick only an observation theme and let the candidate card decide stable, body, style, and talent.',
  },
  BUILD: {
    label: 'Build Mode',
    summary: 'Choose starting assumptions such as body type, style, growth curve, tsukedashi status, and talent.',
  },
};

const MODE_OPTIONS: Array<{ id: ObservationGenerationMode; label: string; summary: string }> = [
  {
    id: 'OBSERVE_RANDOM',
    label: '観測モード',
    summary: '観測テーマだけを選び、部屋・体格・型・素質は候補札のランダム値に任せる。',
  },
  {
    id: 'BUILD',
    label: 'ビルドモード',
    summary: '体格・取り口・成長型・付出・天才型など、候補札の前提を選ぶ。',
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

const GROWTH_TYPE_EN_LABELS: Record<GrowthType, string> = {
  EARLY: 'Early Peak',
  NORMAL: 'Standard',
  LATE: 'Late Bloomer',
  GENIUS: 'Genius',
};

const GROWTH_TYPE_EN_NOTES: Record<GrowthType, string> = {
  EARLY: 'Develops young, with decline arriving sooner in the back half.',
  NORMAL: 'Keeps growth and decline near the standard curve.',
  LATE: 'Starts heavier, then may rebound later in the career.',
  GENIUS: 'A special curve with fast completion and a long peak.',
};

const STYLE_EN_LABELS: Record<StyleArchetype, string> = {
  YOTSU: 'Yotsu',
  TSUKI_OSHI: 'Tsuki-oshi',
  MOROZASHI: 'Morozashi',
  DOHYOUGIWA: 'Dohyogiwa',
  NAGE_TECH: 'Throwing',
  POWER_PRESSURE: 'Power Pressure',
};

const STYLE_EN_NOTES: Record<StyleArchetype, string> = {
  YOTSU: 'Sets belt sumo and forward pressure as the starting shape.',
  TSUKI_OSHI: 'Centers the win path on forward pressure and pushing attacks.',
  MOROZASHI: 'Emphasizes inside position and hand placement.',
  DOHYOUGIWA: 'Leans toward survival, counters, and edge drama.',
  NAGE_TECH: 'Makes throws and off-balancing techniques the reading line.',
  POWER_PRESSURE: 'Aims for heavy, driving sumo built on raw force.',
};

const ENTRY_ARCHETYPE_EN_LABELS: Record<EntryArchetype, string> = {
  ORDINARY_RECRUIT: 'Regular Recruit',
  EARLY_PROSPECT: 'Early Prospect',
  TSUKEDASHI: 'Tsukedashi',
  ELITE_TSUKEDASHI: 'Elite Tsukedashi',
  MONSTER: 'Monster Prospect',
};

const ENTRY_ARCHETYPE_EN_NOTES: Record<EntryArchetype, string> = {
  ORDINARY_RECRUIT: 'No tsukedashi status. Starts from maezumo and earns the climb.',
  EARLY_PROSPECT: 'No major title, but the early expectations are a little higher.',
  TSUKEDASHI: 'Starts like a Sandanme tsukedashi and skips part of the lower climb.',
  ELITE_TSUKEDASHI: 'Starts like a Makushita tsukedashi with a major reputation.',
  MONSTER: 'A rare monster candidate with higher expectation and bigger downside.',
};

const TALENT_PROFILE_EN_LABELS: Record<ScoutTalentProfile, string> = {
  AUTO: 'Candidate Card',
  STANDARD: 'Standard',
  PROMISING: 'Promising',
  GENIUS: 'Genius',
};

const TALENT_PROFILE_EN_NOTES: Record<ScoutTalentProfile, string> = {
  AUTO: 'Use the talent rolled on the candidate card.',
  STANDARD: 'Cuts off extreme upside and keeps the career easier to read.',
  PROMISING: 'Thickens the odds of a sekitori-level career without guaranteeing it.',
  GENIUS: 'Explicitly sets a high-upside talent profile.',
};

const MODIFIER_EN_LABELS: Record<ObservationModifierId, string> = {
  standard_body: 'Standard Body',
  small_body: 'Small Rikishi',
  large_body: 'Large Rikishi',
  oshizumo_style: 'Oshi-zumo',
  technical_style: 'Technical',
  late_growth_bias: 'Late Growth',
  stable_temperament: 'Stable Temperament',
  volatile_temperament: 'Volatile Temperament',
  injury_risk_high: 'Higher Injury Risk',
};

const THEME_EN_LABELS: Record<ObservationThemeId, string> = {
  random: 'Full Random',
  realistic: 'Realistic',
  featured: 'Featured Prospect',
  makushita_wall: 'Makushita Wall',
  late_bloomer: 'Late Bloomer',
};

const STABLE_CHOICE_EN_LABELS: Record<StableEnvironmentChoiceId, string> = {
  AUTO: 'Auto',
  TRADITIONAL_LARGE: 'Traditional Large Stable',
  TSUKI_OSHI_GROUP: 'Tsuki-oshi Stable',
  GIANT_YOTSU: 'Giant Yotsu Stable',
  TECHNICAL_SMALL: 'Technical Small Stable',
  MODERN_SCIENCE: 'Modern Science Stable',
  MASTER_DISCIPLE: 'Master-disciple Stable',
};

const STABLE_CHOICE_EN_SUMMARIES: Record<StableEnvironmentChoiceId, string> = {
  AUTO: 'Let the stable connection be part of the career.',
  TRADITIONAL_LARGE: 'Weights fundamentals and yotsu sumo heavily.',
  TSUKI_OSHI_GROUP: 'Weights forward pressure and repeated pushing drills.',
  GIANT_YOTSU: 'Weights big-body belt sumo.',
  TECHNICAL_SMALL: 'Weights spacing and technique for smaller rikishi.',
  MODERN_SCIENCE: 'Weights measurement, recovery, and efficient development.',
  MASTER_DISCIPLE: 'Weights individual development in a smaller room.',
};

const STABLE_CHOICE_EN_DETAILS: Record<StableEnvironmentChoiceId, string> = {
  AUTO: 'A stable is selected from the full roster, so affiliation remains part of the record.',
  TRADITIONAL_LARGE: 'Back strength, belt control, and long-term rank durability become easier to read.',
  TSUKI_OSHI_GROUP: 'The tachiai and pushing lane are clearer, while wear and tear remain part of the story.',
  GIANT_YOTSU: 'Power and yotsu strength tend to matter, with speed and fine technique as the tradeoff.',
  TECHNICAL_SMALL: 'Throws, ring-edge survival, and footwork become easier to see.',
  MODERN_SCIENCE: 'Broad ability gains and injury recovery become part of the reading line.',
  MASTER_DISCIPLE: 'No one trait is guaranteed; the rikishi profile remains the main driver.',
};

const formatCostLabel = (cost: number, locale: LocaleCode = 'ja'): string => {
  if (cost === 0) return locale === 'en' ? 'Free' : '無料';
  return cost > 0 ? `+${cost} OP` : `${cost} OP`;
};

const formatTimerValue = (seconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};

const formatGenerationTokenRegen = (
  seconds: number,
  tokens: number,
  cap: number,
  locale: LocaleCode,
): string => {
  if (tokens >= cap) return locale === 'en' ? 'Full' : '満札';
  return formatTimerValue(seconds);
};

const resolveCostTone = (cost: number): 'free' | 'cost' | 'discount' => {
  if (cost === 0) return 'free';
  return cost > 0 ? 'cost' : 'discount';
};

const CostPill: React.FC<{ cost: number; tone?: 'free' | 'cost' | 'discount' | 'risk' }> = ({
  cost,
  tone,
}) => {
  const { locale } = useLocale();
  return (
    <span className={styles.costPill} data-tone={tone ?? resolveCostTone(cost)}>
      {formatCostLabel(cost, locale)}
    </span>
  );
};

const ActiveBadge: React.FC = () => {
  const { locale } = useLocale();
  return (
    <span className={styles.activeBadge}>
      <CheckCircle2 className="h-3 w-3" />
      {locale === 'en' ? 'Selected' : '選択中'}
    </span>
  );
};

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

const ScoutSlipRow: React.FC<{ label: string; value: string; muted?: boolean }> = ({
  label,
  value,
  muted = false,
}) => (
  <div className={styles.scoutSlipRow} data-muted={muted}>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

const SelectionLog: React.FC<{ items: string[] }> = ({ items }) => (
  <div className={styles.selectionLog}>
    <div className={styles.logHeader}>
      <ClipboardList className="h-4 w-4" />
      <SelectionLogTitle />
    </div>
    <div className={styles.logList}>
      {items.map((item) => (
        <div key={item} className={styles.logItem}>{item}</div>
      ))}
    </div>
  </div>
);

const SelectionLogTitle: React.FC = () => {
  const { locale } = useLocale();
  return <>{locale === 'en' ? 'Selection Log' : '選定ログ'}</>;
};

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

const THEME_INTENT_HINT_EN: Record<ObservationThemeId, string> = {
  random: 'Observe the career without steering the outcome.',
  realistic: 'Stays close to real data, including short and lower-division careers.',
  featured: 'Nudges talent and base strength upward, but still guarantees nothing.',
  makushita_wall: 'Makes Makushita stagnation easier to observe.',
  late_bloomer: 'Favors late development, with a real risk of retiring before the payoff.',
};

const THEME_DISPLAY_COPY: Record<ObservationThemeId, string> = {
  random: '特別な方向づけを置かず、力士人生の揺らぎをそのまま読む。',
  realistic: '現実寄りの厳しさを残し、下位止まりや短い一代も含めて読む。',
  featured: '注目を集めそうな入口条件に寄せる。大成は保証されない。',
  makushita_wall: '幕下前後で足踏みする一代を読みやすくする。',
  late_bloomer: '序盤の停滞から、後年の伸びが見えるかを読む。',
};

const THEME_DISPLAY_COPY_EN: Record<ObservationThemeId, string> = {
  random: 'Read the career with no special steering.',
  realistic: 'Keeps the harshness of real careers, including short runs and lower-division endings.',
  featured: 'Tilts toward a notable starting profile. Greatness is not guaranteed.',
  makushita_wall: 'Makes it easier to read a career that stalls around Makushita.',
  late_bloomer: 'Looks for a career where later growth may emerge after a slow start.',
};

const THEME_RISK_TEXT_EN: Record<ObservationThemeId, string> = {
  random: 'The result is pure luck. Observation value is not guaranteed.',
  realistic: 'Sekitori status is not promised. Lower-division careers are common.',
  featured: 'Sekitori status is still not guaranteed. Injuries and peer context can erase the upside.',
  makushita_wall: 'Juryo promotion is not guaranteed. Long Makushita stagnation is the point.',
  late_bloomer: 'Early stagnation and retirement before the breakout can happen.',
};

const MODIFIER_DISPLAY_COPY: Record<ObservationModifierId, { description: string; riskText?: string }> = {
  standard_body: {
    description: '極端な小兵・大型を避け、平均的な体格の一代として読みやすくする。',
  },
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

const MODIFIER_DISPLAY_COPY_EN: Record<ObservationModifierId, { description: string; riskText?: string }> = {
  standard_body: {
    description: 'Avoids extreme small or large bodies and keeps the physique easier to read.',
  },
  small_body: {
    description: 'Makes speed and technique easier to see, while large opponents remain dangerous.',
  },
  large_body: {
    description: 'Makes size and pressure easier to read. Slower movement and injuries can still appear.',
  },
  oshizumo_style: {
    description: 'Makes forward pressure and pushing attacks easier to read.',
  },
  technical_style: {
    description: 'Makes belt exchanges and technique-driven turns easier to read.',
  },
  late_growth_bias: {
    description: 'The early career may be slow, but the back half can become more interesting.',
  },
  stable_temperament: {
    description: 'Keeps the career less volatile. Big spikes become a little less common.',
  },
  volatile_temperament: {
    description: 'Makes both upside and downside swings more visible.',
    riskText: 'Injuries, short slumps, and losing streaks become more likely.',
  },
  injury_risk_high: {
    description: 'Makes injuries and absences more likely to become part of the career record.',
    riskText: 'Long absences and early retirement become more likely.',
  },
};

const getModeLabel = (mode: ObservationGenerationMode, locale: LocaleCode): string =>
  locale === 'en' ? MODE_EN_COPY[mode].label : MODE_OPTIONS.find((option) => option.id === mode)?.label ?? mode;

const getModeSummary = (mode: ObservationGenerationMode, locale: LocaleCode): string =>
  locale === 'en' ? MODE_EN_COPY[mode].summary : MODE_OPTIONS.find((option) => option.id === mode)?.summary ?? mode;

const getThemeLabel = (id: ObservationThemeId, fallback: string, locale: LocaleCode): string =>
  locale === 'en' ? THEME_EN_LABELS[id] : fallback;

const getModifierLabel = (id: ObservationModifierId, fallback: string, locale: LocaleCode): string =>
  locale === 'en' ? MODIFIER_EN_LABELS[id] : fallback;

const getModifierCopy = (
  id: ObservationModifierId,
  locale: LocaleCode,
): { description: string; riskText?: string } =>
  locale === 'en' ? MODIFIER_DISPLAY_COPY_EN[id] : MODIFIER_DISPLAY_COPY[id];

const getStableChoiceLabel = (
  id: StableEnvironmentChoiceId,
  fallback: string,
  locale: LocaleCode,
): string => locale === 'en' ? STABLE_CHOICE_EN_LABELS[id] : fallback;

const getStableChoiceSummary = (
  id: StableEnvironmentChoiceId,
  fallback: string,
  locale: LocaleCode,
): string => locale === 'en' ? STABLE_CHOICE_EN_SUMMARIES[id] : fallback;

const getStableChoiceDetail = (
  id: StableEnvironmentChoiceId,
  fallback: string,
  locale: LocaleCode,
): string => locale === 'en' ? STABLE_CHOICE_EN_DETAILS[id] : fallback;

const BODY_MODIFIER_IDS: ObservationModifierId[] = ['standard_body', 'small_body', 'large_body'];
const RISK_MODIFIER_IDS: ObservationModifierId[] = [
  'stable_temperament',
  'volatile_temperament',
  'injury_risk_high',
];

const BODY_MODIFIER_OPTIONS = BODY_MODIFIER_IDS.map((id) => ({
  value: id,
  label: OBSERVATION_MODIFIERS[id].label,
  note: MODIFIER_DISPLAY_COPY[id].description,
  cost: OBSERVATION_MODIFIERS[id].cost,
}));

export const ObservationBuildScreen: React.FC<ObservationBuildScreenProps> = ({
  generationTokens,
  observationPoints,
  onStart,
  onRefreshMeta,
}) => {
  const { locale } = useLocale();
  const themes = React.useMemo(() => listObservationThemes(), []);
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
  const [tokenRegenSeconds, setTokenRegenSeconds] = React.useState(
    generationTokens?.nextRegenInSec ?? 0,
  );
  const tokenRefreshRequestedRef = React.useRef(false);

  React.useEffect(() => {
    setTokenRegenSeconds(generationTokens?.nextRegenInSec ?? 0);
  }, [generationTokens?.lastRegenAt, generationTokens?.nextRegenInSec, generationTokens?.tokens]);

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
  const tokenCap = generationTokens?.cap ?? 5;
  const tokenRegenText = formatGenerationTokenRegen(
    tokenRegenSeconds,
    tokenBalance,
    tokenCap,
    locale,
  );
  const tokenRegenHudText = tokenBalance >= tokenCap ? tokenRegenText : locale === 'en' ? `Next ${tokenRegenText}` : `次回 ${tokenRegenText}`;
  const tokenAfterGeneration = Math.max(0, tokenBalance - 1);
  const insufficientOp = totalCost > opBalance;
  const insufficientToken = tokenBalance <= 0;
  const canStart = validation.ok && !insufficientOp && !insufficientToken && !isStarting;
  const remainingOp = Math.max(0, opBalance - totalCost);
  const bodyModifierId = BODY_MODIFIER_IDS.find((id) => modifierIds.includes(id));
  const localizedBodyModifierOptions = React.useMemo(
    () => BODY_MODIFIER_OPTIONS.map((option) => ({
      ...option,
      label: getModifierLabel(option.value, option.label, locale),
      note: getModifierCopy(option.value, locale).description,
    })),
    [locale],
  );
  const localizedGrowthTypeOptions = React.useMemo(
    () => GROWTH_TYPE_OPTIONS.map((option) => ({
      ...option,
      label: locale === 'en' ? GROWTH_TYPE_EN_LABELS[option.value] : option.label,
      note: locale === 'en' ? GROWTH_TYPE_EN_NOTES[option.value] : option.note,
    })),
    [locale],
  );
  const localizedStyleOptions = React.useMemo(
    () => STYLE_OPTIONS.map((option) => ({
      ...option,
      label: locale === 'en' ? STYLE_EN_LABELS[option.value] : option.label,
      note: locale === 'en' ? STYLE_EN_NOTES[option.value] : option.note,
    })),
    [locale],
  );
  const localizedEntryArchetypeOptions = React.useMemo(
    () => ENTRY_ARCHETYPE_OPTIONS.map((option) => ({
      ...option,
      label: locale === 'en' ? ENTRY_ARCHETYPE_EN_LABELS[option.value] : option.label,
      note: locale === 'en' ? ENTRY_ARCHETYPE_EN_NOTES[option.value] : option.note,
    })),
    [locale],
  );
  const localizedTalentProfileOptions = React.useMemo(
    () => TALENT_PROFILE_OPTIONS.map((option) => ({
      ...option,
      label: locale === 'en' ? TALENT_PROFILE_EN_LABELS[option.value] : option.label,
      note: locale === 'en' ? TALENT_PROFILE_EN_NOTES[option.value] : option.note,
    })),
    [locale],
  );

  React.useEffect(() => {
    if (tokenBalance >= tokenCap || tokenRegenSeconds <= 0) return undefined;
    const timer = window.setInterval(() => {
      setTokenRegenSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [tokenBalance, tokenCap, tokenRegenSeconds]);

  React.useEffect(() => {
    if (tokenBalance >= tokenCap || tokenRegenSeconds > 0) {
      tokenRefreshRequestedRef.current = false;
      return;
    }
    if (!generationTokens || !onRefreshMeta || tokenRefreshRequestedRef.current) return;
    tokenRefreshRequestedRef.current = true;
    void onRefreshMeta();
  }, [generationTokens, onRefreshMeta, tokenBalance, tokenCap, tokenRegenSeconds]);

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

  const setExclusiveModifier = (id: ObservationModifierId | undefined, groupIds: ObservationModifierId[]) => {
    setModifierIds((prev) => {
      const filtered = prev.filter((other) => !groupIds.includes(other));
      return id ? [...filtered, id] : filtered;
    });
  };

  const toggleRiskModifier = (id: ObservationModifierId) => {
    const def = OBSERVATION_MODIFIERS[id];
    if (def?.exclusiveGroup && def.exclusiveGroup !== 'risk') return;
    setModifierIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
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
          setErrorMessage(locale === 'en' ? 'Not enough observation points.' : '観測ポイントが不足しています。');
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
    ? stableEnvironmentChoices.find((choice) => choice.id === stableEnvironmentChoiceId && choice.id !== 'AUTO')
    : undefined;
  const selectedBuildLabels = generationMode === 'BUILD'
    ? [
      bodyModifierId ? getModifierLabel(bodyModifierId, OBSERVATION_MODIFIERS[bodyModifierId].label, locale) : null,
      growthType ? locale === 'en' ? GROWTH_TYPE_EN_LABELS[growthType] : SCOUT_GROWTH_TYPE_LABELS[growthType] : null,
      preferredStyle ? locale === 'en' ? STYLE_EN_LABELS[preferredStyle] : STYLE_LABELS[preferredStyle] : null,
      entryArchetype ? locale === 'en' ? ENTRY_ARCHETYPE_EN_LABELS[entryArchetype] : ENTRY_ARCHETYPE_LABELS[entryArchetype] : null,
      talentProfile !== 'AUTO' ? locale === 'en' ? TALENT_PROFILE_EN_LABELS[talentProfile] : SCOUT_TALENT_PROFILE_LABELS[talentProfile] : null,
    ].filter((label): label is string => Boolean(label))
    : [];
  const selectedRiskModifiers = selectedModifiers.filter((mod) => RISK_MODIFIER_IDS.includes(mod.id));
  const bodyLabel = bodyModifierId
    ? getModifierLabel(bodyModifierId, OBSERVATION_MODIFIERS[bodyModifierId].label, locale)
    : locale === 'en' ? 'Use candidate card' : '候補札に任せる';
  const styleLabel = preferredStyle
    ? locale === 'en' ? STYLE_EN_LABELS[preferredStyle] : STYLE_LABELS[preferredStyle]
    : locale === 'en' ? 'Use body and stable' : '体格と部屋に任せる';
  const growthLabel = growthType
    ? locale === 'en' ? GROWTH_TYPE_EN_LABELS[growthType] : SCOUT_GROWTH_TYPE_LABELS[growthType]
    : locale === 'en' ? 'Use candidate card' : '候補札に任せる';
  const entryLabel = entryArchetype
    ? locale === 'en' ? ENTRY_ARCHETYPE_EN_LABELS[entryArchetype] : ENTRY_ARCHETYPE_LABELS[entryArchetype]
    : locale === 'en' ? 'Use candidate card' : '候補札に任せる';
  const talentLabel = talentProfile !== 'AUTO'
    ? locale === 'en' ? TALENT_PROFILE_EN_LABELS[talentProfile] : SCOUT_TALENT_PROFILE_LABELS[talentProfile]
    : locale === 'en' ? 'Use candidate card' : '候補札に任せる';
  const stableLabel = selectedStableEnvironment
    ? getStableChoiceLabel(selectedStableEnvironment.id, selectedStableEnvironment.label, locale)
    : locale === 'en' ? 'Auto' : 'おまかせ';
  const riskLabel = selectedRiskModifiers.length > 0
    ? selectedRiskModifiers.map((mod) => getModifierLabel(mod.id, mod.label, locale)).join(' / ')
    : locale === 'en' ? 'Normal variance' : '通常の揺らぎ';
  const draftTone = generationMode === 'OBSERVE_RANDOM'
    ? locale === 'en' ? 'Pick only the observation theme and accept the candidate card roll.' : '観測テーマだけを決め、候補札の乱数をそのまま受ける。'
    : selectedBuildLabels.length > 0 || selectedStableEnvironment
      ? locale === 'en' ? 'Narrow the entry conditions toward the career you want to read.' : '入口条件を絞り、読みたい一代へ少し寄せる。'
      : locale === 'en' ? 'Build mode is open, but no extra locks are set.' : 'ビルド枠は開いているが、追加指定は置かない。';
  const selectionLogItems = [
    locale === 'en' ? `Generation cards: use 1 / left ${tokenAfterGeneration} / ${tokenCap}` : `生成札: 1枚使用 / 残 ${tokenAfterGeneration} / ${tokenCap}`,
    locale === 'en' ? `Regen timer: ${tokenRegenText}` : `回復タイマー: ${tokenRegenText}`,
    locale === 'en'
      ? `Theme: ${selectedTheme ? getThemeLabel(selectedTheme.id, selectedTheme.label, locale) : 'None'} (${formatCostLabel(selectedTheme?.cost ?? 0, locale)})`
      : `観測テーマ: ${selectedTheme?.label ?? '未選択'} (${formatCostLabel(selectedTheme?.cost ?? 0, locale)})`,
    generationMode === 'OBSERVE_RANDOM'
      ? locale === 'en' ? 'Mode: all candidate details stay random' : '観測モード: テーマ以外は完全ランダム'
      : locale === 'en'
        ? `Build locks: ${selectedBuildLabels.length + (selectedStableEnvironment ? 1 : 0) + selectedRiskModifiers.length} selected`
        : `ビルド設定: ${selectedBuildLabels.length + (selectedStableEnvironment ? 1 : 0) + selectedRiskModifiers.length}件指定`,
    totalCost > 0
      ? locale === 'en' ? `Observation points: spend ${totalCost} OP` : `観測ポイント: ${totalCost} OP 消費`
      : locale === 'en' ? 'Observation points: no cost' : '観測ポイント: 消費なし',
    insufficientOp
      ? locale === 'en' ? `Short by ${totalCost - opBalance} OP` : `不足: あと ${totalCost - opBalance} OP`
      : locale === 'en' ? `After observation: ${remainingOp} OP` : `観測後: ${remainingOp} OP`,
  ];

  const insufficientReason: string | null = (() => {
    if (insufficientToken) return locale === 'en' ? `Not enough generation cards (${tokenBalance} now).` : `生成札が足りません (現在 ${tokenBalance})。`;
    if (insufficientOp) return locale === 'en' ? `Not enough observation points (${totalCost - opBalance} OP short).` : `観測ポイントが足りません (あと ${totalCost - opBalance} OP 必要)。`;
    if (validation.errors.length > 0) return locale === 'en' ? 'This combination cannot be selected. Review your choices.' : '選べない組み合わせが含まれています。選択を見直してください。';
    return null;
  })();

  return (
    <div className={styles.screen}>
      <section className={styles.draftHeader}>
        <div className={styles.headerTitleRow}>
          <ScrollText className="h-6 w-6 text-action" />
          <div>
            <div className={typography.kicker}>{locale === 'en' ? 'Recruit Selection' : '新弟子選定所'}</div>
            <h2 className={cn(typography.heading, 'text-3xl text-text')}>{locale === 'en' ? 'Play an Observation Card' : '観測札を切る'}</h2>
          </div>
        </div>

        <div className={styles.notice}>
          <div className="flex items-start gap-2">
            <span>{locale === 'en' ? 'Themes and build settings only nudge the career tendency.' : 'テーマとビルド設定は、キャリアの傾向を少し寄せるだけです。'}</span>
          </div>
          <div className="flex items-start gap-2">
            <span>{locale === 'en' ? 'Rank environment, injuries, and growth variance can overturn the plan.' : '番付環境・怪我・成長の揺らぎで、思った通りには進みません。'}</span>
          </div>
          <div className="flex items-start gap-2">
            <span>{locale === 'en' ? 'Careers that miss the plan still become part of the archive.' : '思い通りにならないキャリアも、資料館の一部になります。'}</span>
          </div>
        </div>

        <div className={styles.draftHud}>
          <div className={styles.hudChip}>
            <Coins className="h-4 w-4 text-gold" />
            <span>{locale === 'en' ? 'Observation Points' : '観測ポイント'}</span>
            <strong>{opBalance}</strong>
          </div>
          <div className={styles.hudChip}>
            <Sparkles className="h-4 w-4 text-action" />
            <span className={styles.hudText}>
              <span>{locale === 'en' ? 'Cards' : '生成札'}</span>
              <small>{tokenRegenHudText}</small>
            </span>
            <strong>{tokenBalance}/{tokenCap}</strong>
          </div>
          <div className={styles.hudChip} data-alert={insufficientOp ? 'true' : 'false'}>
            <span>{locale === 'en' ? 'Cost' : '消費'}</span>
            <strong>{totalCost} OP</strong>
          </div>
          <div className={styles.hudChip}>
            <span>{locale === 'en' ? 'After' : '観測後'}</span>
            <strong>{remainingOp} OP</strong>
          </div>
        </div>
      </section>

      <div className={styles.boardShell}>
        <main className={styles.boardMain}>
          <section className={styles.sectionPanel}>
            <SectionHeader
              title={locale === 'en' ? 'Generation Mode' : '生成モード'}
              meta={locale === 'en' ? 'Choose only the observation width and entry assumptions.' : '観測の幅と入口条件だけを札として選びます。'}
            />
            <div className={styles.choiceGrid}>
              {MODE_OPTIONS.map((mode) => {
                const active = generationMode === mode.id;
                return (
                  <ChoiceCard
                    key={mode.id}
                    title={getModeLabel(mode.id, locale)}
                    note={getModeSummary(mode.id, locale)}
                    active={active}
                    onClick={() => changeGenerationMode(mode.id)}
                    tall
                  />
                );
              })}
            </div>
          </section>

          <section className={styles.sectionPanel}>
            <SectionHeader
              title={locale === 'en' ? 'Observation Theme' : '観測テーマ'}
              meta={locale === 'en' ? 'If unsure, start with the free Full Random option.' : '迷ったら 0 OP の「完全ランダム」から。'}
            />
            <div className={styles.choiceGrid}>
              {themes.map((theme) => {
                const active = theme.id === themeId;
                const intent = THEME_INTENT_HINT[theme.id];
                return (
                  <ChoiceCard
                    key={theme.id}
                    title={getThemeLabel(theme.id, theme.label, locale)}
                    note={locale === 'en' ? THEME_DISPLAY_COPY_EN[theme.id] : THEME_DISPLAY_COPY[theme.id]}
                    active={active}
                    onClick={() => setThemeId(theme.id)}
                    cost={theme.cost}
                    detail={(
                      <>
                        {intent ? <span>{locale === 'en' ? THEME_INTENT_HINT_EN[theme.id] : intent}</span> : null}
                        <span>{locale === 'en' ? THEME_RISK_TEXT_EN[theme.id] : theme.riskText}</span>
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
                title={locale === 'en' ? 'Build Settings' : 'ビルド設定'}
                meta={locale === 'en'
                  ? 'Choose body, style, growth, entry status, talent, stable environment, and risk here. Stronger assumptions cost more OP.'
                  : '体格・型・成長・入門資格・素質・所属環境・リスクをここでまとめて選びます。強い前提ほど OP が重くなります。'}
              />

              <div className={styles.optionalGroup}>
                <div className={cn(typography.label, styles.groupLabel)}>{locale === 'en' ? 'Body' : '体格'}</div>
                <OptionalBuildChoiceGrid<ObservationModifierId>
                  value={bodyModifierId}
                  autoLabel={locale === 'en' ? 'Use candidate card' : '候補札に任せる'}
                  autoNote={locale === 'en' ? 'Let the candidate card decide whether the body trends small, large, or standard.' : '小兵、大型、標準寄りのいずれも候補札の揺らぎに任せます。'}
                  options={localizedBodyModifierOptions}
                  onChange={(id) => setExclusiveModifier(id, BODY_MODIFIER_IDS)}
                />
              </div>

              <div className={styles.optionalGroup}>
                <div className={cn(typography.label, styles.groupLabel)}>{locale === 'en' ? 'Style' : '取り口'}</div>
                <OptionalBuildChoiceGrid<StyleArchetype>
                  value={preferredStyle}
                  autoLabel={locale === 'en' ? 'Use body and stable' : '体格と部屋に任せる'}
                  autoNote={locale === 'en' ? 'Let physique and stable environment settle into a natural style.' : '身体素地と所属環境から自然な型を決めます。'}
                  options={localizedStyleOptions}
                  onChange={setPreferredStyle}
                />
              </div>

              <div className={styles.optionalGroup}>
                <div className={cn(typography.label, styles.groupLabel)}>{locale === 'en' ? 'Growth Type' : '成長型'}</div>
                <OptionalBuildChoiceGrid<GrowthType>
                  value={growthType}
                  autoLabel={locale === 'en' ? 'Use candidate card' : '候補札に任せる'}
                  autoNote={locale === 'en' ? 'Let background and talent decide the natural growth curve.' : '経歴と素質から自然な成長型を決めます。'}
                  options={localizedGrowthTypeOptions}
                  onChange={setGrowthType}
                />
              </div>

              <div className={styles.optionalGroup}>
                <div className={cn(typography.label, styles.groupLabel)}>{locale === 'en' ? 'Entry Status' : '付出・入門資格'}</div>
                <OptionalBuildChoiceGrid<EntryArchetype>
                  value={entryArchetype}
                  autoLabel={locale === 'en' ? 'Use candidate card' : '候補札に任せる'}
                  autoNote={locale === 'en' ? 'Start with the entry status implied by the rolled background.' : '入門経路に応じた自然な資格で始めます。'}
                  options={localizedEntryArchetypeOptions}
                  onChange={changeEntryArchetype}
                />
              </div>

              <div className={styles.optionalGroup}>
                <div className={cn(typography.label, styles.groupLabel)}>{locale === 'en' ? 'Talent Shape' : '素質の輪郭'}</div>
                <div className={styles.choiceGrid}>
                  {localizedTalentProfileOptions.map((option) => (
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

              <div className={styles.optionalGroup}>
                <div className="flex items-center gap-2">
                  <Landmark className="h-4 w-4 text-gold" />
                  <div className={cn(typography.label, styles.groupLabel)}>{locale === 'en' ? 'Stable Environment' : '所属環境'}</div>
                </div>
                <div className={styles.sectionMeta}>
                  {locale === 'en'
                    ? 'Rather than choosing one of 45 stables directly, set only the training atmosphere as a reading line.'
                    : '45部屋から直接選ばず、入門先の稽古の空気だけを一代の読み筋として置きます。'}
                </div>
                <div className={styles.choiceGridThree}>
                  {stableEnvironmentChoices.map((choice) => {
                    const active = choice.id === stableEnvironmentChoiceId;
                    return (
                      <ChoiceCard
                        key={choice.id}
                        title={getStableChoiceLabel(choice.id, choice.label, locale)}
                        note={getStableChoiceSummary(choice.id, choice.summary, locale)}
                        active={active}
                        onClick={() => setStableEnvironmentChoiceId(choice.id)}
                        cost={choice.id === 'AUTO' ? 0 : STABLE_ENVIRONMENT_BUILD_COST}
                        detail={<span>{getStableChoiceDetail(choice.id, choice.detail, locale)}</span>}
                        tall
                      />
                    );
                  })}
                </div>
              </div>

              <div className={styles.optionalGroup}>
                <div className="flex items-baseline gap-2">
                  <span className={cn(typography.label, styles.groupLabel)}>{locale === 'en' ? 'Risk Tendency' : 'リスク傾向'}</span>
                  <span className={styles.sectionMeta}>{locale === 'en' ? '(multiple allowed)' : '(複数可)'}</span>
                </div>
                <div className={styles.choiceGrid}>
                  {RISK_MODIFIER_IDS.map((id) => {
                    const mod = OBSERVATION_MODIFIERS[id];
                    const active = modifierIds.includes(id);
                    const isDiscount = mod.cost < 0;
                    const displayCopy = getModifierCopy(id, locale);
                    return (
                      <ChoiceCard
                        key={mod.id}
                        title={getModifierLabel(mod.id, mod.label, locale)}
                        note={displayCopy.description}
                        active={active}
                        onClick={() => toggleRiskModifier(id)}
                        cost={mod.cost}
                        detail={displayCopy.riskText ? <span>{displayCopy.riskText}</span> : undefined}
                      >
                        <div className={styles.pillRow}>
                          {isDiscount ? <MetaPill tone="discount">{locale === 'en' ? 'Discount' : '割引'}</MetaPill> : null}
                          {displayCopy.riskText ? <MetaPill tone="risk">{locale === 'en' ? 'Risk' : 'リスク'}</MetaPill> : null}
                        </div>
                      </ChoiceCard>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}

          {/* Validation errors (if any) */}
          {validation.errors.length > 0 ? (
            <section className={styles.validationPanel}>
              <ul className="space-y-1">
                {validation.errors.map((err, i) => (
                  <li key={`${err}-${i}`} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{locale === 'en' ? 'This combination cannot be selected. Review your choices.' : '選べない組み合わせが含まれています。選択を見直してください。'}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {errorMessage ? (
            <section className={styles.validationPanel}>{errorMessage}</section>
          ) : null}
        </main>

        <aside className={styles.boardRail} aria-label={locale === 'en' ? 'Recruit card preview' : '新弟子札プレビュー'}>
          <div className={styles.scoutSlip}>
            <div className={styles.scoutSlipHeader}>
              <div>
                <div className={styles.scoutSlipKicker}>{locale === 'en' ? 'Candidate Card' : '候補札'}</div>
                <h3 className={cn(typography.heading, styles.scoutSlipTitle)}>{locale === 'en' ? 'Recruit Card' : '新弟子札'}</h3>
              </div>
              <span className={styles.scoutStamp}>{generationMode === 'BUILD' ? locale === 'en' ? 'Selecting' : '選定中' : locale === 'en' ? 'Observe' : '観測'}</span>
            </div>
            <div className={styles.scoutSlipLead}>{draftTone}</div>
            <div className={styles.scoutSlipRows}>
              <ScoutSlipRow label={locale === 'en' ? 'Mode' : 'モード'} value={getModeLabel(generationMode, locale)} />
              <ScoutSlipRow
                label={locale === 'en' ? 'Theme' : '観測テーマ'}
                value={selectedTheme ? getThemeLabel(selectedTheme.id, selectedTheme.label, locale) : locale === 'en' ? 'None' : '未選択'}
              />
              {generationMode === 'BUILD' ? (
                <>
                  <ScoutSlipRow label={locale === 'en' ? 'Body' : '体格'} value={bodyLabel} muted={!bodyModifierId} />
                  <ScoutSlipRow label={locale === 'en' ? 'Style' : '取り口'} value={styleLabel} muted={!preferredStyle} />
                  <ScoutSlipRow label={locale === 'en' ? 'Growth' : '成長'} value={growthLabel} muted={!growthType} />
                  <ScoutSlipRow label={locale === 'en' ? 'Entry' : '入門資格'} value={entryLabel} muted={!entryArchetype} />
                  <ScoutSlipRow label={locale === 'en' ? 'Talent' : '素質'} value={talentLabel} muted={talentProfile === 'AUTO'} />
                  <ScoutSlipRow label={locale === 'en' ? 'Stable' : '所属環境'} value={stableLabel} muted={!selectedStableEnvironment} />
                  <ScoutSlipRow label={locale === 'en' ? 'Risk' : 'リスク'} value={riskLabel} muted={selectedRiskModifiers.length === 0} />
                </>
              ) : (
                <ScoutSlipRow
                  label={locale === 'en' ? 'Candidate' : '候補札'}
                  value={locale === 'en' ? 'Everything except the theme is fully random' : 'テーマ以外は完全ランダム'}
                />
              )}
            </div>
            <div className={styles.scoutSlipCost}>
              <span>{locale === 'en' ? 'Total Cost' : '合計消費'}</span>
              <strong>{totalCost} OP</strong>
            </div>
          </div>

          <SelectionLog items={selectionLogItems} />
        </aside>
      </div>

      {/* Sticky bottom summary */}
      <div className={styles.stickySummary}>
        <div className={styles.summaryInner}>
          <div className={styles.summaryChips}>
            <span className="text-text-dim">{locale === 'en' ? 'Your observation:' : 'あなたの観測:'}</span>
            <span className={styles.summaryChip}>
              {getModeLabel(generationMode, locale)}
            </span>
            {selectedTheme ? (
              <span className={styles.summaryChip}>
                {getThemeLabel(selectedTheme.id, selectedTheme.label, locale)}
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
                {getModifierLabel(mod.id, mod.label, locale)}
              </span>
            ))}
            {selectedStableEnvironment ? (
              <span className={styles.summaryChip}>
                {getStableChoiceLabel(selectedStableEnvironment.id, selectedStableEnvironment.label, locale)}
              </span>
            ) : null}
            {generationMode === 'BUILD' && selectedModifiers.length === 0 && selectedBuildLabels.length === 0 ? (
              <span className="text-text-dim/60">{locale === 'en' ? 'No extra adjustments' : '追加調整なし'}</span>
            ) : null}
            {generationMode === 'OBSERVE_RANDOM' ? (
              <span className="text-text-dim/60">{locale === 'en' ? 'Everything except the theme is fully random' : 'テーマ以外は完全ランダム'}</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {generationMode === 'BUILD' ? (
              <div>
                <span className="text-text-dim">{locale === 'en' ? 'Build' : 'ビルド'}</span>{' '}
                <span className={styles.summaryCost}>{directBuildCost} OP</span>
              </div>
            ) : null}
            <div>
              <span className="text-text-dim">{locale === 'en' ? 'Cost' : '消費'}</span>{' '}
              <span className={cn(insufficientOp ? 'text-red-400' : styles.summaryCost)}>{totalCost} OP</span>
            </div>
            <div>
              <span className="text-text-dim">{locale === 'en' ? 'After' : '観測後'}</span>{' '}
              <span className="text-text">{remainingOp} OP</span>
            </div>
          </div>
          <div className="flex flex-col items-stretch gap-1 sm:items-end">
            <Button size="lg" disabled={!canStart} onClick={() => void handleStart()}>
              <Eye className="mr-2 h-4 w-4" />
              {isStarting
                ? locale === 'en' ? 'Starting observation...' : '観測開始中…'
                : locale === 'en' ? `Start Observation (${totalCost} OP)` : `観測を開始 (${totalCost} OP)`}
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
