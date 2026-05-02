import {
  AptitudeTier,
  BasicProfile,
  BodyConstitution,
  CareerSeed,
  IchimonId,
  PersonalityType,
  RikishiStatus,
} from "../models";
import {
  STARTER_OYAKATA_BLUEPRINTS,
  buildCareerSeedSummary,
  createCareerSeed,
  estimateCareerBandLabel,
} from "../careerSeed";
import { getStyleCompatibility } from "../styleProfile";
import {
  buildInitialRikishiFromSpec,
  BuildPreviewSummaryVNext,
  buildPreviewSummaryVNext,
} from "../build/buildLab";
import { BuildSpecVNext, BodyType } from "../models";
import { generateShikona } from "../naming/playerNaming";
import {
  resolveStableById,
  STABLE_CATALOG,
  type StableDefinition,
} from "../simulation/heya/stableCatalog";
import { ensureStyleIdentityProfile } from "../style/identity";

type RandomSource = () => number;

export type ScoutEntryPath = "LOCAL" | "SCHOOL" | "COLLEGE" | "CHAMPION";
export type ScoutTemperament = "STEADY" | "AMBITION" | "STUBBORN" | "EXPLOSIVE";
export type ScoutBodySeed = "BALANCED" | "LONG" | "HEAVY" | "SPRING";

export const PERSONALITY_LABELS: Record<PersonalityType, string> = {
  CALM: "冷静",
  AGGRESSIVE: "闘争的",
  SERIOUS: "真面目",
  WILD: "奔放",
  CHEERFUL: "陽気",
  SHY: "人見知り",
};

export const SCOUT_ENTRY_PATH_LABELS: Record<ScoutEntryPath, string> = {
  LOCAL: "地元の叩き上げ",
  SCHOOL: "学校相撲で磨いた",
  COLLEGE: "学生相撲で名を上げた",
  CHAMPION: "学生横綱の肩書を持つ",
};

export const SCOUT_TEMPERAMENT_LABELS: Record<ScoutTemperament, string> = {
  STEADY: "粘り強い",
  AMBITION: "上昇志向",
  STUBBORN: "頑固で崩れにくい",
  EXPLOSIVE: "感情が表に出やすい",
};

export const SCOUT_BODY_SEED_LABELS: Record<ScoutBodySeed, string> = {
  BALANCED: "均整の取れた土台",
  LONG: "長躯で伸びしろがある",
  HEAVY: "骨太で重さが乗る",
  SPRING: "足腰に弾力がある",
};

export interface ScoutDraft {
  shikona: string;
  birthplace: string;
  personaLine?: string;
  profile: BasicProfile;
  entryAge: 15 | 18 | 22;
  startingHeightCm: number;
  startingWeightKg: number;
  entryPath: ScoutEntryPath;
  temperament: ScoutTemperament;
  bodySeed: ScoutBodySeed;
  selectedStableId: string | null;
  aptitudeTier: AptitudeTier;
}

export interface ScoutResolvedSeed {
  spec: BuildSpecVNext;
  preview: BuildPreviewSummaryVNext;
  careerSeed: CareerSeed;
  entryPathLabel: string;
  temperamentLabel: string;
  bodySeedLabel: string;
  stableLabel: string;
  introductionLine: string;
  growthLine: string;
}

const RANDOM_FAMILY_NAMES = [
  "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡辺", "山本", "中村", "小林", "加藤",
  "吉田", "山田", "佐々木", "山口", "松本", "井上", "木村", "林", "斎藤", "清水",
];

const RANDOM_GIVEN_NAMES = [
  "太郎", "翔", "大輔", "蓮", "健太", "海斗", "雄大", "拓海", "一輝", "駿",
  "優斗", "陽太", "亮", "和真", "大和", "隆", "誠", "将", "龍之介", "匠",
];

const RANDOM_BIRTHPLACES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県",
  "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県", "新潟県", "富山県",
  "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県",
  "岡山県", "広島県", "山口県", "徳島県", "香川県", "愛媛県", "高知県", "福岡県",
  "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];

const DEFAULT_SCOUT_STABLE_ID = "stable-001";

const PICK_LIST = <T,>(rng: RandomSource, values: readonly T[]): T =>
  values[Math.floor(rng() * values.length)];

const randomProfile = (rng: RandomSource): BasicProfile => ({
  realName: `${PICK_LIST(rng, RANDOM_FAMILY_NAMES)} ${PICK_LIST(rng, RANDOM_GIVEN_NAMES)}`,
  birthplace: PICK_LIST(rng, RANDOM_BIRTHPLACES),
  personality: PICK_LIST(rng, Object.keys(PERSONALITY_LABELS) as PersonalityType[]),
});

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveAssignedStable = (draft: Pick<ScoutDraft, "selectedStableId">): StableDefinition => {
  if (draft.selectedStableId) {
    const explicitStable = resolveStableById(draft.selectedStableId);
    if (explicitStable) return explicitStable;
  }
  return resolveStableById(DEFAULT_SCOUT_STABLE_ID) ?? STABLE_CATALOG[0];
};

const resolveOyakata = (stable: StableDefinition) =>
  STARTER_OYAKATA_BLUEPRINTS.find((entry) => entry.ichimonId === stable.ichimonId) ??
  STARTER_OYAKATA_BLUEPRINTS[0];

const resolveBodyConstitution = (bodySeed: ScoutBodySeed): BodyConstitution => {
  if (bodySeed === "HEAVY") return "HEAVY_BULK";
  if (bodySeed === "LONG") return "LONG_REACH";
  if (bodySeed === "SPRING") return "SPRING_LEGS";
  return "BALANCED_FRAME";
};

const resolvePotentialFromBodySeed = (
  bodySeed: ScoutBodySeed,
  entryAge: ScoutDraft["entryAge"],
  startingHeightCm: number,
  startingWeightKg: number,
): Pick<BuildSpecVNext, "heightPotentialCm" | "weightPotentialKg" | "reachDeltaCm"> => {
  const completedHeightPotential = entryAge >= 22 ? startingHeightCm : undefined;
  if (bodySeed === "HEAVY") {
    return {
      heightPotentialCm: completedHeightPotential ?? Math.max(startingHeightCm + 3, 186),
      weightPotentialKg: Math.max(startingWeightKg + 24, 178),
      reachDeltaCm: -1,
    };
  }
  if (bodySeed === "LONG") {
    return {
      heightPotentialCm: completedHeightPotential ?? Math.max(startingHeightCm + 5, 191),
      weightPotentialKg: Math.max(startingWeightKg + 18, 148),
      reachDeltaCm: 5,
    };
  }
  if (bodySeed === "SPRING") {
    return {
      heightPotentialCm: completedHeightPotential ?? Math.max(startingHeightCm + 3, 183),
      weightPotentialKg: Math.max(startingWeightKg + 20, 156),
      reachDeltaCm: 1,
    };
  }
  return {
    heightPotentialCm: completedHeightPotential ?? Math.max(startingHeightCm + 3, 184),
    weightPotentialKg: Math.max(startingWeightKg + 18, 150),
    reachDeltaCm: 0,
  };
};

const buildGrowthLine = (
  draft: ScoutDraft,
  preview: BuildPreviewSummaryVNext,
): string => {
  const gainsHeight = preview.potentialHeightCm > draft.startingHeightCm;
  if (!gainsHeight) {
    return `${SCOUT_BODY_SEED_LABELS[draft.bodySeed]}で骨格はほぼ完成しており、体重は${preview.potentialWeightKg}kgまで積み上がる余地がある。`;
  }
  return `${SCOUT_BODY_SEED_LABELS[draft.bodySeed]}が、${preview.potentialHeightCm}cm・${preview.potentialWeightKg}kgまで伸びる余地を作る。`;
};

const resolvePrimaryStyle = (draft: ScoutDraft, stable: StableDefinition) => {
  if (draft.bodySeed === "HEAVY") return stable.archetypeId === "TSUKI_OSHI_GROUP" ? "POWER_PRESSURE" : "YOTSU";
  if (draft.bodySeed === "LONG") return "TSUKI_OSHI";
  if (draft.bodySeed === "SPRING") return "DOHYOUGIWA";
  if (stable.archetypeId === "TECHNICAL_SMALL") return "NAGE_TECH";
  if (stable.archetypeId === "MODERN_SCIENCE") return "TSUKI_OSHI";
  return "YOTSU";
};

const resolveSecondaryStyle = (draft: ScoutDraft, primaryStyle: BuildSpecVNext["primaryStyle"]) => {
  if (draft.entryPath === "CHAMPION") return primaryStyle === "YOTSU" ? "MOROZASHI" : "NAGE_TECH";
  if (draft.entryPath === "COLLEGE") return "MOROZASHI";
  if (draft.temperament === "EXPLOSIVE") return "POWER_PRESSURE";
  if (draft.temperament === "STEADY") return "DOHYOUGIWA";
  if (draft.temperament === "AMBITION") return "TSUKI_OSHI";
  return primaryStyle === "YOTSU" ? "DOHYOUGIWA" : "YOTSU";
};

const resolveMentalTrait = (temperament: ScoutTemperament) => {
  if (temperament === "EXPLOSIVE") return "VOLATILE_FIRE" as const;
  if (temperament === "AMBITION") return "BIG_STAGE" as const;
  if (temperament === "STUBBORN") return "STONEWALL" as const;
  return "CALM_ENGINE" as const;
};

const resolveBackground = (draft: ScoutDraft) => {
  if (draft.entryAge === 15) return "MIDDLE_SCHOOL" as const;
  if (draft.entryAge === 18) return "HIGH_SCHOOL" as const;
  return draft.entryPath === "CHAMPION" ? ("COLLEGE_YOKOZUNA" as const) : ("STUDENT_ELITE" as const);
};

const resolveAptitudeTier = (draft: ScoutDraft): AptitudeTier => {
  if (draft.entryPath === "CHAMPION") return "A";
  if (draft.entryPath === "COLLEGE") return "B";
  if (draft.entryPath === "SCHOOL") return "B";
  return "C";
};

const pickWeighted = <T,>(
  rng: RandomSource,
  entries: Array<{ value: T; weight: number }>,
): T => {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

const rollScoutAptitudeTier = (
  entryPath: ScoutEntryPath,
  rng: RandomSource,
): AptitudeTier => {
  if (entryPath === "CHAMPION") {
    return pickWeighted(rng, [
      { value: "S" as const, weight: 8 },
      { value: "A" as const, weight: 72 },
      { value: "B" as const, weight: 20 },
    ]);
  }
  if (entryPath === "COLLEGE") {
    return pickWeighted(rng, [
      { value: "A" as const, weight: 16 },
      { value: "B" as const, weight: 84 },
    ]);
  }
  if (entryPath === "SCHOOL") {
    return pickWeighted(rng, [
      { value: "A" as const, weight: 7 },
      { value: "B" as const, weight: 81 },
      { value: "C" as const, weight: 12 },
    ]);
  }
  return pickWeighted(rng, [
    { value: "B" as const, weight: 43 },
    { value: "C" as const, weight: 45 },
    { value: "D" as const, weight: 12 },
  ]);
};

const resolveBodyType = (heightCm: number, weightKg: number): BodyType => {
  const bmi = weightKg / Math.max(1, (heightCm / 100) * (heightCm / 100));
  if (bmi >= 38) return "ANKO";
  if (heightCm >= 188 && bmi <= 31) return "SOPPU";
  if (bmi >= 33) return "MUSCULAR";
  return "NORMAL";
};

const resolvePersonality = (temperament: ScoutTemperament): PersonalityType => {
  if (temperament === "EXPLOSIVE") return "AGGRESSIVE";
  if (temperament === "AMBITION") return "SERIOUS";
  if (temperament === "STUBBORN") return "WILD";
  return "CALM";
};

const resolveStableFlavorLine = (stable: StableDefinition): string =>
  `${stable.displayName}で土台を作り、${stable.flavor.replace(/。$/, "")}。`;

export const buildScoutResolvedSeed = (draft: ScoutDraft): ScoutResolvedSeed => {
  const stable = resolveAssignedStable(draft);
  const oyakata = resolveOyakata(stable);
  const bodyConstitution = resolveBodyConstitution(draft.bodySeed);
  const primaryStyle = resolvePrimaryStyle(draft, stable);
  const secondaryStyle = resolveSecondaryStyle(draft, primaryStyle);
  const spec: BuildSpecVNext = {
    oyakataId: oyakata.id,
    aptitudeTier: draft.aptitudeTier,
    ...resolvePotentialFromBodySeed(draft.bodySeed, draft.entryAge, draft.startingHeightCm, draft.startingWeightKg),
    bodyConstitution,
    amateurBackground: resolveBackground(draft),
    primaryStyle,
    secondaryStyle,
    mentalTrait: resolveMentalTrait(draft.temperament),
    injuryResistance: draft.bodySeed === "HEAVY" ? "IRON_BODY" : "STANDARD",
    debtCards: [],
  };
  const preview = buildPreviewSummaryVNext(spec, oyakata);
  const careerSeed = createCareerSeed({
    birthplace: draft.birthplace,
    stableId: stable.id,
    stableName: stable.displayName,
    entryAge: draft.entryAge,
    entryPath: draft.entryPath,
    entryPathLabel: SCOUT_ENTRY_PATH_LABELS[draft.entryPath],
    temperament: draft.temperament,
    temperamentLabel: SCOUT_TEMPERAMENT_LABELS[draft.temperament],
    bodySeed: draft.bodySeed,
    bodySeedLabel: SCOUT_BODY_SEED_LABELS[draft.bodySeed],
    initialHeightCm: draft.startingHeightCm,
    initialWeightKg: draft.startingWeightKg,
    peakHeightCm: preview.potentialHeightCm,
    peakWeightKg: preview.potentialWeightKg,
    primaryStyle,
    secondaryStyle,
  });
  return {
    spec,
    preview,
    careerSeed,
    entryPathLabel: SCOUT_ENTRY_PATH_LABELS[draft.entryPath],
    temperamentLabel: SCOUT_TEMPERAMENT_LABELS[draft.temperament],
    bodySeedLabel: SCOUT_BODY_SEED_LABELS[draft.bodySeed],
    stableLabel: stable.displayName,
    introductionLine: `${draft.birthplace}から${stable.displayName}へ入り、${draft.entryAge}歳で土俵に立つ。`,
    growthLine: buildGrowthLine(draft, preview),
  };
};

export const rollScoutDraft = (rng: RandomSource = Math.random): ScoutDraft => {
  const profile = randomProfile(rng);
  const stable = resolveStableById(DEFAULT_SCOUT_STABLE_ID) ?? STABLE_CATALOG[0];
  const entryAge = PICK_LIST(rng, [15, 18, 22] as const);
  const entryPath: ScoutEntryPath =
    entryAge === 22
      ? (rng() < 0.25 ? "CHAMPION" : "COLLEGE")
      : entryAge === 18
        ? "SCHOOL"
        : "LOCAL";
  const bodySeed = PICK_LIST(rng, ["BALANCED", "LONG", "HEAVY", "SPRING"] as const);
  const temperament = PICK_LIST(rng, ["STEADY", "AMBITION", "STUBBORN", "EXPLOSIVE"] as const);
  const baseHeight = entryAge === 15 ? 178 : entryAge === 18 ? 183 : 186;
  const baseWeight = entryAge === 15 ? 110 : entryAge === 18 ? 128 : 142;

  return {
    shikona: generateShikona(),
    birthplace: profile.birthplace,
    personaLine: `${entryAge === 15 ? "早い入口" : entryAge === 22 ? "完成に近い入口" : "土台のある入口"}から角界へ入る。`,
    profile,
    entryAge,
    startingHeightCm: baseHeight + Math.floor(rng() * 7),
    startingWeightKg: baseWeight + Math.floor(rng() * 18),
    entryPath,
    temperament,
    bodySeed,
    selectedStableId: stable.id,
    aptitudeTier: rollScoutAptitudeTier(entryPath, rng),
  };
};

const applyBodyAdjustments = (status: RikishiStatus, draft: ScoutDraft) => {
  const heightDelta = draft.startingHeightCm - status.bodyMetrics.heightCm;
  const weightDelta = draft.startingWeightKg - status.bodyMetrics.weightKg;
  status.bodyMetrics.heightCm = draft.startingHeightCm;
  status.bodyMetrics.weightKg = draft.startingWeightKg;
  status.bodyType = resolveBodyType(draft.startingHeightCm, draft.startingWeightKg);
  status.stats.tsuki = clamp(status.stats.tsuki + heightDelta * 0.35, 20, 120);
  status.stats.oshi = clamp(status.stats.oshi + weightDelta * 0.22, 20, 120);
  status.stats.power = clamp(status.stats.power + weightDelta * 0.28, 20, 120);
  status.stats.deashi = clamp(
    status.stats.deashi + (draft.bodySeed === "SPRING" ? 6 : draft.bodySeed === "HEAVY" ? -3 : 1),
    20,
    120,
  );
  status.durability = clamp(
    status.durability + (draft.bodySeed === "HEAVY" ? 8 : draft.bodySeed === "SPRING" ? 4 : 2),
    20,
    120,
  );
};

const applyTemperamentAdjustments = (status: RikishiStatus, temperament: ScoutTemperament) => {
  if (temperament === "AMBITION") {
    status.spirit = clamp(status.spirit + 8, 0, 120);
    status.currentCondition = clamp(status.currentCondition + 4, 0, 100);
  } else if (temperament === "STUBBORN") {
    status.spirit = clamp(status.spirit + 5, 0, 120);
    status.currentCondition = clamp(status.currentCondition + 2, 0, 100);
  } else if (temperament === "EXPLOSIVE") {
    status.spirit = clamp(status.spirit + 6, 0, 120);
    status.currentCondition = clamp(status.currentCondition + 1, 0, 100);
  }
};

export const buildInitialRikishiFromDraft = (draft: ScoutDraft): RikishiStatus => {
  const stable = resolveAssignedStable(draft);
  const oyakata = resolveOyakata(stable);
  const seed = buildScoutResolvedSeed(draft);
  const status = buildInitialRikishiFromSpec(seed.spec, oyakata);
  const compatibility = getStyleCompatibility(seed.spec.primaryStyle, seed.spec.secondaryStyle);

  status.shikona = draft.shikona;
  status.profile = {
    ...draft.profile,
    birthplace: draft.birthplace,
    personality: resolvePersonality(draft.temperament),
  };
  status.stableId = stable.id;
  status.ichimonId = stable.ichimonId as IchimonId;
  status.stableArchetypeId = stable.archetypeId;
  status.entryAge = draft.entryAge;
  status.age = draft.entryAge;
  status.aptitudeTier = draft.aptitudeTier ?? resolveAptitudeTier(draft);

  applyBodyAdjustments(status, draft);
  applyTemperamentAdjustments(status, draft.temperament);
  status.careerSeed = seed.careerSeed;

  status.buildSummary = {
    ...buildCareerSeedSummary({
      oyakataName: oyakata.name,
      amateurBackground: seed.spec.amateurBackground,
      bodyConstitution: seed.spec.bodyConstitution,
      heightPotentialCm: seed.spec.heightPotentialCm,
      weightPotentialKg: seed.spec.weightPotentialKg,
      reachDeltaCm: seed.spec.reachDeltaCm,
      spentPoints: 0,
      remainingPoints: 0,
      debtCount: 0,
      debtCards: [],
      secretStyle: oyakata.secretStyle,
      compatibility,
    }),
    careerBandLabel: estimateCareerBandLabel({
      spentPoints: 42,
      debtCount: 0,
      compatibility,
    }),
    initialConditionSummary: {
      birthplace: draft.birthplace,
      stableName: stable.displayName,
      entryAge: draft.entryAge,
      entryPathLabel: seed.entryPathLabel,
      temperamentLabel: seed.temperamentLabel,
      bodySeedLabel: seed.bodySeedLabel,
      initialHeightCm: draft.startingHeightCm,
      initialWeightKg: draft.startingWeightKg,
    },
    growthSummary: {
      peakHeightCm: seed.preview.potentialHeightCm,
      peakWeightKg: seed.preview.potentialWeightKg,
      bodyTypeLabel: resolveBodyType(draft.startingHeightCm, draft.startingWeightKg),
    },
    lifeCards: [
      { slot: "経歴", label: seed.entryPathLabel, previewTag: `${draft.entryAge}歳`, reportLine: seed.introductionLine },
      { slot: "骨格", label: seed.bodySeedLabel, previewTag: `${draft.startingHeightCm}cm`, reportLine: seed.growthLine },
      { slot: "相撲観", label: "土俵で形になる", previewTag: stable.displayName, reportLine: resolveStableFlavorLine(stable) },
      { slot: "気質", label: seed.temperamentLabel, previewTag: PERSONALITY_LABELS[status.profile.personality], reportLine: `${seed.temperamentLabel}気質が、停滞や復活の受け止め方に表れる。` },
      { slot: "背負うもの", label: "まだ白紙", previewTag: "記録で判明", reportLine: "宿敵、怪我、停滞、再浮上は、入門後の一代で初めて輪郭を持つ。" },
    ],
    dominantLifeCard: "経歴",
    lifeCardNarrativeSeeds: {
      dominant: seed.introductionLine,
      burden: "この時点では、どこで人生が折れ、どこで踏みとどまるかはまだ分からない。",
      frameAndInjury: seed.growthLine,
      designedVsRealized: resolveStableFlavorLine(stable),
    },
  };
  status.bodyMetrics.reachDeltaCm = seed.spec.reachDeltaCm;
  status.history.maxRank = { ...status.rank };
  return ensureStyleIdentityProfile(status);
};

export const getScoutDraftHeadline = (draft: ScoutDraft): string =>
  `${SCOUT_ENTRY_PATH_LABELS[draft.entryPath]} / ${SCOUT_BODY_SEED_LABELS[draft.bodySeed]} / ${SCOUT_TEMPERAMENT_LABELS[draft.temperament]}`;
