import {
  AmateurBackground,
  BuildSummary,
  CareerSeed,
  CareerSeedBiases,
  DebtCardId,
  IchimonId,
  MentalTraitType,
  Oyakata,
  OyakataBlueprint,
  OyakataProfile,
  Rank,
  StyleArchetype,
  StyleCompatibility,
} from './models';
import { getCompatibilityWeight } from './styleProfile';

export const CAREER_DESIGN_STARTING_POINTS = 50;
export const CAREER_DESIGN_WALLET_CAP = 100;
export const CAREER_RECORD_REWARD_CAP = 40;

export const BODY_CONSTITUTION_LABELS = {
  BALANCED_FRAME: '均整体',
  HEAVY_BULK: '重量体',
  LONG_REACH: '長身長腕',
  SPRING_LEGS: '足腰体質',
} as const;

export const AMATEUR_BACKGROUND_CONFIG = {
  MIDDLE_SCHOOL: {
    label: '中卒たたき上げ',
    entryAge: 15,
    startRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 } as Rank,
    initialHeightDelta: 6,
    initialWeightDelta: 22,
  },
  HIGH_SCHOOL: {
    label: '高卒入門',
    entryAge: 18,
    startRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 } as Rank,
    initialHeightDelta: 4,
    initialWeightDelta: 16,
  },
  STUDENT_ELITE: {
    label: '学生エリート',
    entryAge: 22,
    startRank: { division: 'Sandanme', name: '三段目', side: 'East', number: 90 } as Rank,
    initialHeightDelta: 0,
    initialWeightDelta: 10,
  },
  COLLEGE_YOKOZUNA: {
    label: '学生横綱',
    entryAge: 22,
    startRank: { division: 'Makushita', name: '幕下', side: 'East', number: 60 } as Rank,
    initialHeightDelta: 0,
    initialWeightDelta: 8,
  },
} as const;

export const MENTAL_TRAIT_LABELS: Record<MentalTraitType, string> = {
  CALM_ENGINE: '平常心',
  BIG_STAGE: '大舞台型',
  VOLATILE_FIRE: '激情型',
  STONEWALL: '不動心',
};

export const DEBT_CARD_LABELS: Record<DebtCardId, string> = {
  OLD_KNEE: '古傷の膝',
  PRESSURE_LINEAGE: '重圧の血統',
  LATE_START: '遅咲き前提',
};

export const DEBT_CARD_POINT_BONUS: Record<DebtCardId, number> = {
  OLD_KNEE: 8,
  PRESSURE_LINEAGE: 7,
  LATE_START: 10,
};

export const STARTER_OYAKATA_BLUEPRINTS: OyakataBlueprint[] = [
  {
    id: 'starter-taiju',
    name: '大樹親方',
    ichimonId: 'TAIJU',
    advantage: '四つ育成',
    drawback: '出足弱化',
    secretStyle: 'YOTSU',
    growthMods: { kumi: 1.1, koshi: 1.1, deashi: 0.94 },
    spiritMods: { injuryPenalty: 0.95, slumpPenalty: 1, promotionBonus: 1.02 },
    injuryMod: 0.98,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-kurogane',
    name: '黒鉄親方',
    ichimonId: 'KUROGANE',
    advantage: '近代強化',
    drawback: '技術鈍化',
    secretStyle: 'TSUKI_OSHI',
    growthMods: { power: 1.08, oshi: 1.07, waza: 0.94 },
    spiritMods: { injuryPenalty: 0.92, slumpPenalty: 0.98, promotionBonus: 1.03 },
    injuryMod: 0.94,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-raimei',
    name: '雷鳴親方',
    ichimonId: 'RAIMEI',
    advantage: '立合い圧力',
    drawback: '怪我増',
    secretStyle: 'TSUKI_OSHI',
    growthMods: { tsuki: 1.09, oshi: 1.09, power: 1.04 },
    spiritMods: { injuryPenalty: 1.08, slumpPenalty: 0.97, promotionBonus: 1.01 },
    injuryMod: 1.08,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-hakutsuru',
    name: '白鶴親方',
    ichimonId: 'HAKUTSURU',
    advantage: '技巧育成',
    drawback: '馬力不足',
    secretStyle: 'MOROZASHI',
    growthMods: { waza: 1.1, nage: 1.06, power: 0.95 },
    spiritMods: { injuryPenalty: 0.97, slumpPenalty: 0.95, promotionBonus: 1.01 },
    injuryMod: 0.97,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
  {
    id: 'starter-hayate',
    name: '疾風親方',
    ichimonId: 'HAYATE',
    advantage: '対応力',
    drawback: '天井低め',
    secretStyle: 'DOHYOUGIWA',
    growthMods: { deashi: 1.05, waza: 1.03, power: 0.97 },
    spiritMods: { injuryPenalty: 0.96, slumpPenalty: 0.92, promotionBonus: 1.02 },
    injuryMod: 0.98,
    unlockRule: { type: 'STARTER', summary: '初期解放' },
  },
];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveBlueprintIchimon = (profile: OyakataProfile): IchimonId => {
  const tag = profile.id.toLowerCase();
  if (tag.includes('kurogane') || tag.includes('black') || tag.includes('steel')) return 'KUROGANE';
  if (tag.includes('raimei') || tag.includes('thunder')) return 'RAIMEI';
  if (tag.includes('hakutsuru') || tag.includes('crane')) return 'HAKUTSURU';
  if (tag.includes('hayate') || tag.includes('wind')) return 'HAYATE';
  return 'TAIJU';
};

export const resolveCareerRecordRewardPoints = (awardedPoints: number): number =>
  Math.max(0, Math.min(CAREER_RECORD_REWARD_CAP, Math.floor(Math.max(0, awardedPoints) * 0.25)));

export const estimateCareerBandLabel = (summary: {
  spentPoints: number;
  debtCount: number;
  compatibility: StyleCompatibility;
}): string => {
  const score = summary.spentPoints + summary.debtCount * 4 + getCompatibilityWeight(summary.compatibility);
  if (score >= 64) return '三役挑戦圏';
  if (score >= 54) return '幕内上位圏';
  if (score >= 44) return '関取圏';
  if (score >= 34) return '幕下上位圏';
  return '下位育成圏';
};

export const buildCareerSeedSummary = (input: {
  oyakataName: string;
  amateurBackground: AmateurBackground;
  bodyConstitution: BuildSummary['bodyConstitution'];
  heightPotentialCm: number;
  weightPotentialKg: number;
  reachDeltaCm: number;
  spentPoints: number;
  remainingPoints: number;
  debtCount: number;
  debtCards?: DebtCardId[];
  secretStyle?: StyleArchetype;
  compatibility: StyleCompatibility;
}): BuildSummary => ({
  oyakataName: input.oyakataName,
  amateurBackground: input.amateurBackground,
  bodyConstitution: input.bodyConstitution,
  heightPotentialCm: input.heightPotentialCm,
  weightPotentialKg: input.weightPotentialKg,
  reachDeltaCm: input.reachDeltaCm,
  spentPoints: input.spentPoints,
  remainingPoints: input.remainingPoints,
  debtCount: input.debtCount,
  debtCards: input.debtCards,
  secretStyle: input.secretStyle,
  careerBandLabel: estimateCareerBandLabel(input),
});

export const createUnlockedOyakataBlueprint = (profile: OyakataProfile): OyakataBlueprint => ({
  id: profile.id,
  name: profile.displayName,
  ichimonId: resolveBlueprintIchimon(profile),
  advantage: profile.trait,
  drawback: profile.legacyStars >= 4 ? '名跡の重圧' : '継承中',
  secretStyle: profile.secretStyle ?? 'YOTSU',
  growthMods: profile.growthMod,
  spiritMods: {
    injuryPenalty: 1,
    slumpPenalty: 1,
    promotionBonus: 1 + profile.legacyStars * 0.01,
  },
  injuryMod: profile.injuryMod,
  unlockRule: { type: 'CAREER', summary: '条件達成で継承' },
  sourceCareerId: profile.sourceCareerId,
  maxRank: profile.maxRank,
});

export const blueprintToOyakata = (blueprint: OyakataBlueprint): Oyakata => ({
  id: blueprint.id,
  name: blueprint.name,
  trait: blueprint.advantage,
  secretStyle: blueprint.secretStyle,
  growthMod: blueprint.growthMods,
  injuryMod: blueprint.injuryMod,
  spiritMods: blueprint.spiritMods,
});

export interface RecruitDesignSeedInput {
  birthplace: string;
  stableId: string;
  stableName: string;
  entryAge: number;
  entryPath: string;
  entryPathLabel: string;
  temperament: string;
  temperamentLabel: string;
  bodySeed: string;
  bodySeedLabel: string;
  initialHeightCm: number;
  initialWeightKg: number;
  peakHeightCm: number;
  peakWeightKg: number;
  primaryStyle: StyleArchetype;
  secondaryStyle: StyleArchetype;
}

const buildBiases = (input: RecruitDesignSeedInput): CareerSeedBiases => {
  const entryAgeBias = input.entryAge <= 15 ? 1 : input.entryAge >= 22 ? -1 : 0;
  const pathBias =
    input.entryPath === 'CHAMPION'
      ? 2
      : input.entryPath === 'COLLEGE'
        ? 1
        : input.entryPath === 'SCHOOL'
          ? 0.5
          : -0.5;
  const temperamentBias =
    input.temperament === 'EXPLOSIVE'
      ? { volatility: 1.1, clutch: 0.8, rebound: 0.4, slump: -0.8 }
      : input.temperament === 'AMBITION'
        ? { volatility: 0.4, clutch: 1, rebound: 0.8, slump: 0.2 }
        : input.temperament === 'STUBBORN'
          ? { volatility: -0.3, clutch: 0.2, rebound: -0.2, slump: 1.1 }
          : { volatility: -0.5, clutch: 0.1, rebound: 0.5, slump: 0.7 };
  const bodyBias =
    input.bodySeed === 'HEAVY'
      ? { durability: 1.2, injury: -0.2, style: 0.9, peak: -0.4, rivalry: 0.4 }
      : input.bodySeed === 'LONG'
        ? { durability: 0.1, injury: -0.1, style: 0.7, peak: 0.4, rivalry: 0.2 }
        : input.bodySeed === 'SPRING'
          ? { durability: 0.6, injury: 0, style: 0.6, peak: 0.1, rivalry: 0.5 }
          : { durability: 0.4, injury: 0.1, style: 0.3, peak: 0, rivalry: 0.2 };

  return {
    startRankBias: clamp(pathBias + Math.max(0, -entryAgeBias * 0.4), -1, 3),
    earlyGrowthBias: clamp(pathBias * 0.4 + entryAgeBias * 0.7, -1, 2),
    peakAgeShift: clamp(entryAgeBias * -1.2 + bodyBias.peak, -3, 2),
    peakDurationBias: clamp((input.bodySeed === 'HEAVY' ? 0.5 : 0) + (input.temperament === 'STUBBORN' ? 0.6 : 0), -1, 2),
    styleBias: bodyBias.style,
    styleSettlingBias: clamp((input.entryPath === 'CHAMPION' ? 0.8 : 0.2) + (input.temperament === 'STUBBORN' ? 0.8 : 0), -1, 2),
    durabilityBias: bodyBias.durability,
    injuryRiskBias: clamp(bodyBias.injury + (input.entryPath === 'LOCAL' ? 0.2 : -0.1), -1, 1),
    slumpResistanceBias: clamp(temperamentBias.slump + (input.entryPath === 'CHAMPION' ? -0.4 : 0.2), -1, 2),
    reboundBias: clamp(temperamentBias.rebound + (entryAgeBias > 0 ? 0.2 : -0.1), -1, 2),
    volatilityBias: clamp(temperamentBias.volatility, -1, 2),
    clutchBias: clamp(temperamentBias.clutch + (input.entryPath === 'CHAMPION' ? 0.6 : 0), -1, 2),
    socialPressureBias: clamp((input.entryPath === 'CHAMPION' ? 1.2 : 0.2) + (input.entryAge >= 22 ? 0.3 : 0), 0, 2),
    rivalryBias: clamp(bodyBias.rivalry + (input.entryPath === 'CHAMPION' ? 0.4 : 0), 0, 2),
  };
};

export const createCareerSeed = (input: RecruitDesignSeedInput): CareerSeed => ({
  ...input,
  biases: buildBiases(input),
});
