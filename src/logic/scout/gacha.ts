import { CONSTANTS } from '../constants';
import { createInitialRikishi } from '../initialization';
import {
  BasicProfile,
  BodyMetrics,
  BodyType,
  EntryDivision,
  PersonalityType,
  Rank,
  RikishiStatus,
  TacticsType,
  TalentArchetype,
  Trait,
} from '../models';
import { generateShikona } from '../naming/playerNaming';

type RandomSource = () => number;

export type ScoutHistory = 'JHS_GRAD' | 'HS_GRAD' | 'HS_YOKOZUNA' | 'UNI_YOKOZUNA';

export interface ScoutHistoryOption {
  label: string;
  desc: string;
  age: number;
  bonus: number;
  canTsukedashi?: boolean;
}

export const SCOUT_HISTORY_OPTIONS: Record<ScoutHistory, ScoutHistoryOption> = {
  JHS_GRAD: {
    label: '中学卒業',
    desc: '15歳で角界入り。時間はたっぷりある。',
    age: 15,
    bonus: 0,
  },
  HS_GRAD: {
    label: '高校卒業',
    desc: '高校で鍛えた体で前相撲から。',
    age: 18,
    bonus: 3,
  },
  HS_YOKOZUNA: {
    label: '高校横綱',
    desc: '高校相撲界の頂点。即戦力候補。',
    age: 18,
    bonus: 8,
  },
  UNI_YOKOZUNA: {
    label: '学生横綱',
    desc: '大学相撲の覇者。幕下付出の権利あり。',
    age: 22,
    bonus: 12,
    canTsukedashi: true,
  },
};

export const PERSONALITY_LABELS: Record<PersonalityType, string> = {
  CALM: '冷静',
  AGGRESSIVE: '闘争的',
  SERIOUS: '真面目',
  WILD: '奔放',
  CHEERFUL: '陽気',
  SHY: '人見知り',
};

export interface ScoutDraft {
  shikona: string;
  profile: BasicProfile;
  history: ScoutHistory;
  entryDivision: EntryDivision;
  archetype: TalentArchetype;
  tactics: TacticsType;
  signatureMove: string;
  bodyType: BodyType;
  bodyMetrics: BodyMetrics;
  traitSlots: number;
  traits: Trait[];
  traitSlotDrafts: ScoutTraitSlotDraft[];
}

export interface ScoutTraitSlotDraft {
  slotIndex: number;
  options: Trait[];
  selected: Trait | null;
}

export interface ScoutOverrideCostBreakdown {
  shikona: number;
  realName: number;
  birthplace: number;
  personality: number;
  bodyType: number;
  traitSlots: number;
  history: number;
  tsukedashi: number;
}

export interface ScoutOverrideCost {
  total: number;
  breakdown: ScoutOverrideCostBreakdown;
}

export const SCOUT_COST = {
  DRAW: 100,
  SHIKONA: 10,
  REAL_NAME: 10,
  BIRTHPLACE: 10,
  PERSONALITY: 10,
  BODY_TYPE: 40,
  TRAIT_SLOTS_BY_COUNT: {
    0: 0,
    1: 10,
    2: 25,
    3: 45,
    4: 70,
    5: 100,
  },
  HISTORY: 50,
  TSUKEDASHI_MAKUSHITA60: 30,
  TSUKEDASHI_SANDANME90: 60,
} as const;

const HISTORY_DRAW_WEIGHTS: Array<{ value: ScoutHistory; weight: number }> = [
  { value: 'JHS_GRAD', weight: 35 },
  { value: 'HS_GRAD', weight: 35 },
  { value: 'HS_YOKOZUNA', weight: 20 },
  { value: 'UNI_YOKOZUNA', weight: 10 },
];

const PICK_LIST = <T>(rng: RandomSource, values: T[]): T =>
  values[Math.floor(rng() * values.length)];

const WEIGHTED_PICK = <T>(rng: RandomSource, entries: Array<{ value: T; weight: number }>): T => {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let point = rng() * total;
  for (const entry of entries) {
    point -= entry.weight;
    if (point <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

const RANDOM_FAMILY_NAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
];

const RANDOM_GIVEN_NAMES = [
  '太郎', '翔', '大輔', '蓮', '健太', '海斗', '雄大', '拓海', '一輝', '駿',
  '優斗', '陽太', '亮', '和真', '大和', '隆', '誠', '将', '龍之介', '匠',
];

const RANDOM_BIRTHPLACES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県',
  '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県',
  '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県',
  '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県',
  '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県',
  '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県',
];

const BODY_METRIC_RANGE: Record<BodyType, { minH: number; maxH: number; minW: number; maxW: number }> = {
  NORMAL: { minH: 176, maxH: 190, minW: 120, maxW: 155 },
  SOPPU: { minH: 182, maxH: 198, minW: 105, maxW: 140 },
  ANKO: { minH: 170, maxH: 188, minW: 145, maxW: 210 },
  MUSCULAR: { minH: 176, maxH: 194, minW: 135, maxW: 190 },
};

const TSUKEDASHI_WEIGHTS: Array<{ value: EntryDivision; weight: number }> = [
  { value: 'Maezumo', weight: 45 },
  { value: 'Makushita60', weight: 35 },
  { value: 'Sandanme90', weight: 20 },
];

const randomInt = (rng: RandomSource, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

const TRAIT_SLOT_MAX = 5;
const TRAIT_OPTIONS_PER_SLOT = 5;

const clampTraitSlots = (slots: number): number => Math.max(0, Math.min(TRAIT_SLOT_MAX, Math.floor(slots)));

export const rollBodyMetricsForBodyType = (bodyType: BodyType, rng: RandomSource = Math.random): BodyMetrics => {
  const range = BODY_METRIC_RANGE[bodyType];
  return {
    heightCm: randomInt(rng, range.minH, range.maxH),
    weightKg: randomInt(rng, range.minW, range.maxW),
  };
};

const rollTraitCount = (rng: RandomSource): number =>
  WEIGHTED_PICK(
    rng,
    CONSTANTS.TRAIT_GACHA.COUNT_WEIGHTS.map((entry) => ({
      value: entry.count,
      weight: entry.weight,
    })),
  );

const resolveTraitByRarity = (
  rarity: 'N' | 'R' | 'SR' | 'UR',
  includeNegative: boolean,
  used: Set<Trait>,
): Trait[] =>
  (Object.entries(CONSTANTS.TRAIT_DATA) as Array<[Trait, (typeof CONSTANTS.TRAIT_DATA)[Trait]]>)
    .filter(([id, data]) => !used.has(id) && data.rarity === rarity && data.isNegative === includeNegative)
    .map(([id]) => id);

const rollTrait = (rng: RandomSource, used: Set<Trait>): Trait | undefined => {
  const wantsNegative = rng() < CONSTANTS.TRAIT_GACHA.NEGATIVE_CHANCE;
  const rarity = WEIGHTED_PICK(
    rng,
    (Object.entries(CONSTANTS.TRAIT_GACHA.RARITY_WEIGHTS) as Array<['N' | 'R' | 'SR' | 'UR', number]>).map(
      ([value, weight]) => ({ value, weight }),
    ),
  );

  const strictPool = resolveTraitByRarity(rarity, wantsNegative, used);
  if (strictPool.length) return PICK_LIST(rng, strictPool);

  const sameSignPool = (Object.entries(CONSTANTS.TRAIT_DATA) as Array<[Trait, (typeof CONSTANTS.TRAIT_DATA)[Trait]]>)
    .filter(([id, data]) => !used.has(id) && data.isNegative === wantsNegative)
    .map(([id]) => id);
  if (sameSignPool.length) return PICK_LIST(rng, sameSignPool);

  const fallbackPool = (Object.keys(CONSTANTS.TRAIT_DATA) as Trait[]).filter((id) => !used.has(id));
  if (!fallbackPool.length) return undefined;
  return PICK_LIST(rng, fallbackPool);
};

export const rollTraits = (rng: RandomSource, slots: number): Trait[] => {
  const clampedSlots = clampTraitSlots(slots);
  const used = new Set<Trait>();
  const traits: Trait[] = [];

  for (let i = 0; i < clampedSlots; i += 1) {
    const trait = rollTrait(rng, used);
    if (!trait) break;
    used.add(trait);
    traits.push(trait);
  }

  return traits;
};

const rollTraitOptionsForSlot = (
  rng: RandomSource,
  banned: Set<Trait>,
): Trait[] => {
  const used = new Set<Trait>(banned);
  const options: Trait[] = [];
  for (let i = 0; i < TRAIT_OPTIONS_PER_SLOT; i += 1) {
    const trait = rollTrait(rng, used);
    if (!trait) break;
    used.add(trait);
    options.push(trait);
  }
  return options;
};

const normalizeSlotDraft = (
  slot: ScoutTraitSlotDraft,
  taken: Set<Trait>,
  active: boolean,
): ScoutTraitSlotDraft => {
  const uniqueOptions: Trait[] = [];
  for (const option of slot.options) {
    if (!uniqueOptions.includes(option)) uniqueOptions.push(option);
    if (uniqueOptions.length >= TRAIT_OPTIONS_PER_SLOT) break;
  }

  let selected: Trait | null = slot.selected;
  const selectedValid = Boolean(selected && uniqueOptions.includes(selected));
  if (!selectedValid || (active && selected && taken.has(selected))) {
    selected = uniqueOptions.find((option) => !taken.has(option)) ?? null;
  }
  if (active && selected) taken.add(selected);

  return {
    slotIndex: slot.slotIndex,
    options: uniqueOptions,
    selected,
  };
};

const sortSlotDrafts = (slotDrafts: ScoutTraitSlotDraft[]): ScoutTraitSlotDraft[] =>
  [...slotDrafts].sort((a, b) => a.slotIndex - b.slotIndex);

export const syncTraitsFromSlotDrafts = (draft: ScoutDraft): ScoutDraft => {
  const clampedSlots = clampTraitSlots(draft.traitSlots);
  const taken = new Set<Trait>();
  const normalized = sortSlotDrafts(draft.traitSlotDrafts).map((slot) =>
    normalizeSlotDraft(slot, taken, slot.slotIndex < clampedSlots),
  );
  const traits = normalized
    .filter((slot) => slot.slotIndex < clampedSlots && Boolean(slot.selected))
    .map((slot) => slot.selected as Trait);

  return {
    ...draft,
    traitSlots: clampedSlots,
    traitSlotDrafts: normalized,
    traits,
  };
};

const createTraitSlotDraft = (
  slotIndex: number,
  selectedInActiveSlots: Set<Trait>,
  rng: RandomSource,
): ScoutTraitSlotDraft => {
  const options = rollTraitOptionsForSlot(rng, new Set<Trait>());
  const selected = options.find((option) => !selectedInActiveSlots.has(option)) ?? null;
  if (selected) selectedInActiveSlots.add(selected);
  return {
    slotIndex,
    options,
    selected,
  };
};

const rollHistory = (rng: RandomSource): ScoutHistory => WEIGHTED_PICK(rng, HISTORY_DRAW_WEIGHTS);

const rollEntryDivision = (history: ScoutHistory, rng: RandomSource): EntryDivision => {
  if (!SCOUT_HISTORY_OPTIONS[history].canTsukedashi) return 'Maezumo';
  return WEIGHTED_PICK(rng, TSUKEDASHI_WEIGHTS);
};

const rollBodyType = (rng: RandomSource): BodyType =>
  WEIGHTED_PICK(
    rng,
    (Object.entries(CONSTANTS.BODY_TYPE_DATA) as Array<[BodyType, (typeof CONSTANTS.BODY_TYPE_DATA)[BodyType]]>).map(
      ([value, data]) => ({ value, weight: data.weight }),
    ),
  );

const rollProfile = (rng: RandomSource): BasicProfile => ({
  realName: `${PICK_LIST(rng, RANDOM_FAMILY_NAMES)} ${PICK_LIST(rng, RANDOM_GIVEN_NAMES)}`,
  birthplace: PICK_LIST(rng, RANDOM_BIRTHPLACES),
  personality: PICK_LIST(rng, Object.keys(PERSONALITY_LABELS) as PersonalityType[]),
});

export const rollScoutDraft = (rng: RandomSource = Math.random): ScoutDraft => {
  const history = rollHistory(rng);
  const entryDivision = rollEntryDivision(history, rng);
  const bodyType = rollBodyType(rng);
  const traitSlots = rollTraitCount(rng);
  const baseDraft: ScoutDraft = {
    shikona: generateShikona(),
    profile: rollProfile(rng),
    history,
    entryDivision,
    archetype: PICK_LIST(rng, Object.keys(CONSTANTS.TALENT_ARCHETYPES) as TalentArchetype[]),
    tactics: PICK_LIST(rng, Object.keys(CONSTANTS.TACTICAL_GROWTH_MODIFIERS) as TacticsType[]),
    signatureMove: PICK_LIST(rng, Object.keys(CONSTANTS.SIGNATURE_MOVE_DATA)),
    bodyType,
    bodyMetrics: rollBodyMetricsForBodyType(bodyType, rng),
    traitSlots,
    traits: [],
    traitSlotDrafts: [],
  };

  return resizeTraitSlots(baseDraft, traitSlots, rng);
};

export const resizeTraitSlots = (
  draft: ScoutDraft,
  slots: number,
  rng: RandomSource = Math.random,
): ScoutDraft => {
  const clamped = clampTraitSlots(slots);
  const existing = sortSlotDrafts(draft.traitSlotDrafts);
  const slotByIndex = new Map<number, ScoutTraitSlotDraft>(existing.map((slot) => [slot.slotIndex, slot]));
  const nextSlots = [...existing];
  const selectedInActiveSlots = new Set<Trait>();

  for (const slot of existing) {
    if (slot.slotIndex >= clamped || !slot.selected) continue;
    if (!slot.options.includes(slot.selected)) continue;
    if (selectedInActiveSlots.has(slot.selected)) continue;
    selectedInActiveSlots.add(slot.selected);
  }

  for (let i = 0; i < clamped; i += 1) {
    if (slotByIndex.has(i)) continue;
    nextSlots.push(createTraitSlotDraft(i, selectedInActiveSlots, rng));
  }

  return syncTraitsFromSlotDrafts({
    ...draft,
    traitSlots: clamped,
    traitSlotDrafts: nextSlots,
  });
};

export const selectTraitForSlot = (
  draft: ScoutDraft,
  slotIndex: number,
  trait: Trait,
): ScoutDraft => {
  const clamped = clampTraitSlots(draft.traitSlots);
  if (slotIndex < 0 || slotIndex >= clamped) return draft;

  const target = draft.traitSlotDrafts.find((slot) => slot.slotIndex === slotIndex);
  if (!target || !target.options.includes(trait)) return draft;

  const selectedElsewhere = draft.traitSlotDrafts.some(
    (slot) =>
      slot.slotIndex < clamped &&
      slot.slotIndex !== slotIndex &&
      slot.selected === trait,
  );
  if (selectedElsewhere) return draft;

  const nextSlots = draft.traitSlotDrafts.map((slot) =>
    slot.slotIndex === slotIndex ? { ...slot, selected: trait } : slot,
  );

  return syncTraitsFromSlotDrafts({
    ...draft,
    traitSlotDrafts: nextSlots,
  });
};

export const resolveTraitSlotCost = (slots: number): number => {
  const clamped = clampTraitSlots(slots);
  return SCOUT_COST.TRAIT_SLOTS_BY_COUNT[clamped as keyof typeof SCOUT_COST.TRAIT_SLOTS_BY_COUNT];
};

const resolveRankFromHistory = (history: ScoutHistory, entryDivision: EntryDivision): Rank => {
  const option = SCOUT_HISTORY_OPTIONS[history];
  if (!option.canTsukedashi || entryDivision === 'Maezumo') {
    return { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 };
  }
  if (entryDivision === 'Makushita60') {
    return { division: 'Makushita', name: '幕下', side: 'East', number: 60 };
  }
  return { division: 'Sandanme', name: '三段目', side: 'East', number: 90 };
};

export const buildInitialRikishiFromDraft = (draft: ScoutDraft): RikishiStatus => {
  const history = SCOUT_HISTORY_OPTIONS[draft.history];
  return createInitialRikishi({
    shikona: draft.shikona,
    age: history.age,
    startingRank: resolveRankFromHistory(draft.history, draft.entryDivision),
    archetype: draft.archetype,
    tactics: draft.tactics,
    signatureMove: draft.signatureMove,
    bodyType: draft.bodyType,
    traits: draft.traits,
    historyBonus: history.bonus,
    entryDivision: history.canTsukedashi ? draft.entryDivision : undefined,
    profile: draft.profile,
    bodyMetrics: draft.bodyMetrics,
  });
};

export const resolveScoutOverrideCost = (
  base: ScoutDraft,
  edited: ScoutDraft,
): ScoutOverrideCost => {
  const breakdown: ScoutOverrideCostBreakdown = {
    shikona: base.shikona !== edited.shikona ? SCOUT_COST.SHIKONA : 0,
    realName: base.profile.realName !== edited.profile.realName ? SCOUT_COST.REAL_NAME : 0,
    birthplace: base.profile.birthplace !== edited.profile.birthplace ? SCOUT_COST.BIRTHPLACE : 0,
    personality:
      base.profile.personality !== edited.profile.personality ? SCOUT_COST.PERSONALITY : 0,
    bodyType: base.bodyType !== edited.bodyType ? SCOUT_COST.BODY_TYPE : 0,
    traitSlots: base.traitSlots !== edited.traitSlots ? resolveTraitSlotCost(edited.traitSlots) : 0,
    history: base.history !== edited.history ? SCOUT_COST.HISTORY : 0,
    tsukedashi: 0,
  };

  if (base.entryDivision !== edited.entryDivision) {
    if (edited.entryDivision === 'Makushita60') {
      breakdown.tsukedashi = SCOUT_COST.TSUKEDASHI_MAKUSHITA60;
    } else if (edited.entryDivision === 'Sandanme90') {
      breakdown.tsukedashi = SCOUT_COST.TSUKEDASHI_SANDANME90;
    }
  }

  return {
    breakdown,
    total: Object.values(breakdown).reduce((sum, value) => sum + value, 0),
  };
};
