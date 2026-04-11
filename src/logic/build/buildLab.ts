import {
  CONSTANTS,
  rollAptitudeTier,
  resolveAptitudeFactor,
} from '../constants';
import { createInitialRikishi } from '../initialization';
import {
  AmateurBackground,
  AptitudeTier,
  BodyConstitution,
  BuildAxisClutch,
  BuildAxisDurability,
  BuildAxisPeakDesign,
  BuildAxisVolatility,
  BuildAxisWinStyle,
  BuildSpecV4,
  BuildSpecVNext,
  DebtCardId,
  EntryDivision,
  InjuryResistanceType,
  MentalTraitType,
  OyakataBlueprint,
  RikishiGenome,
  RikishiStatus,
  StyleArchetype,
  Trait,
} from '../models';
import { generateShikona } from '../naming/playerNaming';
import { listStablesByIchimon, resolveStableById } from '../simulation/heya/stableCatalog';
import { buildLockedTraitJourney } from '../traits';
import {
  AMATEUR_BACKGROUND_CONFIG,
  buildCareerSeedSummary,
  CAREER_DESIGN_STARTING_POINTS,
  DEBT_CARD_POINT_BONUS,
  estimateCareerBandLabel,
  STARTER_OYAKATA_BLUEPRINTS,
} from '../careerSeed';
import { getStyleCompatibility } from '../styleProfile';

export interface BuildCostBreakdown {
  physical: number;
  career: number;
  abstractAxes: number;
  traitSlots: number;
  traits: number;
  oyakata: number;
  aptitudeReveal: number;
  aptitudeTune: number;
  total: number;
}

export interface BuildPreviewSummary {
  entryAge: number;
  startRankLabel: string;
  growthLabel: string;
  durabilityLabel: string;
  styleLabel: string;
}

export const BUILD_COST = {
  BODY_TYPE: {
    NORMAL: 3,
    SOPPU: 4,
    ANKO: 5,
    MUSCULAR: 6,
  } as const,
  HISTORY: {
    JHS_GRAD: 0,
    HS_GRAD: 2,
    HS_YOKOZUNA: 4,
    UNI_YOKOZUNA: 6,
  } as const,
  ENTRY_DIVISION: {
    Maezumo: 0,
    Sandanme90: 3,
    Makushita60: 6,
  } as const,
  AXIS: {
    winStyle: {
      STABILITY: 2,
      BURST: 4,
      COMEBACK: 3,
    } as Record<BuildAxisWinStyle, number>,
    peakDesign: {
      EARLY: 2,
      BALANCED: 2,
      LATE: 3,
    } as Record<BuildAxisPeakDesign, number>,
    volatility: {
      LOW: 3,
      MID: 2,
      HIGH: 1,
    } as Record<BuildAxisVolatility, number>,
    durability: {
      IRON: 4,
      BALANCED: 2,
      GAMBLE: 1,
    } as Record<BuildAxisDurability, number>,
    clutch: {
      BIG_MATCH: 3,
      BALANCED: 2,
      DEVELOPMENT: 1,
    } as Record<BuildAxisClutch, number>,
  },
  TRAIT_SLOTS: {
    0: 0,
    1: 1,
    2: 2,
    3: 3,
    4: 5,
    5: 6,
  } as const,
  TRAIT_RARITY: {
    N: 1,
    R: 2,
    SR: 3,
    UR: 4,
  } as const,
  OYAKATA_BASE: 2,
  OYAKATA_STAR_MULTIPLIER: 1.2,
  APTITUDE_REVEAL: 6,
  APTITUDE_TUNE_STEP: 3,
  BODY_METRIC_BASELINE: {
    NORMAL: { heightCm: 182, weightKg: 138 },
    SOPPU: { heightCm: 186, weightKg: 124 },
    ANKO: { heightCm: 180, weightKg: 162 },
    MUSCULAR: { heightCm: 184, weightKg: 152 },
  } as const,
} as const;

export const HISTORY_OPTIONS = {
  JHS_GRAD: { label: '中学卒業', age: 15, bonus: 0, canTsukedashi: false },
  HS_GRAD: { label: '高校卒業', age: 18, bonus: 3, canTsukedashi: false },
  HS_YOKOZUNA: { label: '高校横綱', age: 18, bonus: 8, canTsukedashi: false },
  UNI_YOKOZUNA: { label: '学生横綱', age: 22, bonus: 12, canTsukedashi: true },
} as const;

type BuildHistory = keyof typeof HISTORY_OPTIONS;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const createBaseGenome = (): RikishiGenome => {
  const dist = CONSTANTS.GENOME.ARCHETYPE_DNA.HARD_WORKER;
  const mean = (pair: [number, number]): number => pair[0];
  return {
    base: {
      powerCeiling: mean(dist.base.powerCeiling),
      techCeiling: mean(dist.base.techCeiling),
      speedCeiling: mean(dist.base.speedCeiling),
      ringSense: mean(dist.base.ringSense),
      styleFit: mean(dist.base.styleFit),
    },
    growth: {
      maturationAge: mean(dist.growth.maturationAge),
      peakLength: mean(dist.growth.peakLength),
      lateCareerDecay: mean(dist.growth.lateCareerDecay),
      adaptability: mean(dist.growth.adaptability),
    },
    durability: {
      baseInjuryRisk: mean(dist.durability.baseInjuryRisk),
      partVulnerability: {},
      recoveryRate: mean(dist.durability.recoveryRate),
      chronicResistance: mean(dist.durability.chronicResistance),
    },
    variance: {
      formVolatility: mean(dist.variance.formVolatility),
      clutchBias: mean(dist.variance.clutchBias),
      slumpRecovery: mean(dist.variance.slumpRecovery),
      streakSensitivity: mean(dist.variance.streakSensitivity),
    },
  };
};

const resolveAbstractCost = (spec: BuildSpecV4): number =>
  BUILD_COST.AXIS.winStyle[spec.abstractAxes.winStyle] +
  BUILD_COST.AXIS.peakDesign[spec.abstractAxes.peakDesign] +
  BUILD_COST.AXIS.volatility[spec.abstractAxes.volatility] +
  BUILD_COST.AXIS.durability[spec.abstractAxes.durability] +
  BUILD_COST.AXIS.clutch[spec.abstractAxes.clutch];

const resolveTraitCost = (traits: Trait[]): number => {
  return traits.reduce((sum, trait) => {
    const rarity = CONSTANTS.TRAIT_DATA[trait]?.rarity ?? 'N';
    return sum + BUILD_COST.TRAIT_RARITY[rarity];
  }, 0);
};

const resolvePhysicalCost = (spec: BuildSpecV4): number => {
  const bodyCost = BUILD_COST.BODY_TYPE[spec.bodyType];
  const baseline = BUILD_COST.BODY_METRIC_BASELINE[spec.bodyType];
  const metricCost = clamp(
    Math.floor(Math.abs(spec.bodyMetrics.heightCm - baseline.heightCm) / 12) +
      Math.floor(Math.abs(spec.bodyMetrics.weightKg - baseline.weightKg) / 20),
    0,
    2,
  );
  return bodyCost + metricCost;
};

const resolveCareerCost = (spec: BuildSpecV4): number =>
  BUILD_COST.HISTORY[spec.history] + BUILD_COST.ENTRY_DIVISION[spec.entryDivision];

const resolveOyakataCost = (
  selectedOyakataId: string | null,
  oyakataLegacyStars?: number,
): number => {
  if (!selectedOyakataId) return 0;
  const stars = clamp(Math.floor(oyakataLegacyStars ?? 2), 1, 5);
  return Math.round(BUILD_COST.OYAKATA_BASE + stars * BUILD_COST.OYAKATA_STAR_MULTIPLIER);
};

const resolveHistory = (
  history: BuildHistory,
  entryDivision: EntryDivision,
): { age: number; bonus: number; rank: RikishiStatus['rank']; entryDivision?: EntryDivision } => {
  const option = HISTORY_OPTIONS[history];
  if (!option.canTsukedashi || entryDivision === 'Maezumo') {
    return {
      age: option.age,
      bonus: option.bonus,
      rank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
      entryDivision: undefined,
    };
  }
  if (entryDivision === 'Makushita60') {
    return {
      age: option.age,
      bonus: option.bonus,
      rank: { division: 'Makushita', name: '幕下', side: 'East', number: 60 },
      entryDivision,
    };
  }
  return {
    age: option.age,
    bonus: option.bonus,
    rank: { division: 'Sandanme', name: '三段目', side: 'East', number: 90 },
    entryDivision: 'Sandanme90',
  };
};

const formatRankLabel = (rank: RikishiStatus['rank']): string => {
  if (rank.division === 'Maezumo') return '前相撲';
  if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return `${rank.name}`;
  return `${rank.name}${rank.number ?? 1}枚目`;
};

const applyAxesToGenome = (spec: BuildSpecV4): RikishiGenome => {
  const genome = JSON.parse(JSON.stringify(spec.genome)) as RikishiGenome;
  if (spec.abstractAxes.winStyle === 'STABILITY') {
    genome.variance.formVolatility = clamp(genome.variance.formVolatility - 14, 0, 100);
    genome.variance.slumpRecovery = clamp(genome.variance.slumpRecovery + 10, 0, 100);
  } else if (spec.abstractAxes.winStyle === 'BURST') {
    genome.variance.clutchBias = clamp(genome.variance.clutchBias + 14, -50, 50);
    genome.base.powerCeiling = clamp(genome.base.powerCeiling + 7, 0, 100);
  } else {
    genome.variance.clutchBias = clamp(genome.variance.clutchBias + 8, -50, 50);
    genome.variance.streakSensitivity = clamp(genome.variance.streakSensitivity + 8, 0, 100);
  }

  if (spec.abstractAxes.peakDesign === 'EARLY') {
    genome.growth.maturationAge = clamp(genome.growth.maturationAge - 2, 18, 35);
    genome.growth.lateCareerDecay = clamp(genome.growth.lateCareerDecay + 0.2, 0.1, 2.0);
  } else if (spec.abstractAxes.peakDesign === 'LATE') {
    genome.growth.maturationAge = clamp(genome.growth.maturationAge + 3, 18, 35);
    genome.growth.peakLength = clamp(genome.growth.peakLength + 2, 1, 12);
    genome.growth.lateCareerDecay = clamp(genome.growth.lateCareerDecay - 0.2, 0.1, 2.0);
  }

  if (spec.abstractAxes.volatility === 'LOW') {
    genome.variance.formVolatility = clamp(genome.variance.formVolatility - 10, 0, 100);
  } else if (spec.abstractAxes.volatility === 'HIGH') {
    genome.variance.formVolatility = clamp(genome.variance.formVolatility + 12, 0, 100);
  }

  if (spec.abstractAxes.durability === 'IRON') {
    genome.durability.baseInjuryRisk = clamp(genome.durability.baseInjuryRisk - 0.15, 0.3, 2.0);
    genome.durability.recoveryRate = clamp(genome.durability.recoveryRate + 0.15, 0.5, 2.0);
    genome.durability.chronicResistance = clamp(genome.durability.chronicResistance + 8, 0, 100);
  } else if (spec.abstractAxes.durability === 'GAMBLE') {
    genome.durability.baseInjuryRisk = clamp(genome.durability.baseInjuryRisk + 0.2, 0.3, 2.0);
    genome.base.powerCeiling = clamp(genome.base.powerCeiling + 6, 0, 100);
  }

  if (spec.abstractAxes.clutch === 'BIG_MATCH') {
    genome.variance.clutchBias = clamp(genome.variance.clutchBias + 10, -50, 50);
  } else if (spec.abstractAxes.clutch === 'DEVELOPMENT') {
    genome.growth.adaptability = clamp(genome.growth.adaptability + 10, 0, 100);
  }

  return genome;
};

const resolveAptitudeFactorFromPlan = (spec: BuildSpecV4): number => {
  const baseFactor = resolveAptitudeFactor(spec.aptitudeBaseTier);
  const tune = spec.aptitudePlan.reveal ? spec.aptitudePlan.tuneStep * 0.03 : 0;
  return clamp(baseFactor + tune, 0.25, 1.25);
};

export const resolveDisplayedAptitudeTier = (spec: BuildSpecV4): AptitudeTier | undefined =>
  spec.aptitudePlan.reveal ? spec.aptitudeBaseTier : undefined;

export const createDefaultBuildSpec = (): BuildSpecV4 => ({
  shikona: generateShikona(),
  profile: {
    realName: '山田 太郎',
    birthplace: '東京都',
    personality: 'CALM',
  },
  history: 'HS_GRAD',
  entryDivision: 'Maezumo',
  bodyType: 'NORMAL',
  bodyMetrics: {
    heightCm: 182,
    weightKg: 138,
  },
  traitSlots: 2,
  selectedTraits: [],
  genome: createBaseGenome(),
  aptitudeBaseTier: rollAptitudeTier(Math.random),
  aptitudePlan: {
    reveal: false,
    tuneStep: 0,
  },
  selectedStableId: null,
  selectedOyakataId: null,
  abstractAxes: {
    winStyle: 'STABILITY',
    peakDesign: 'BALANCED',
    volatility: 'MID',
    durability: 'BALANCED',
    clutch: 'BALANCED',
  },
});

export const calculateBuildCost = (
  spec: BuildSpecV4,
  options?: { oyakataLegacyStars?: number },
): { total: number; breakdown: BuildCostBreakdown } => {
  const traitSlots = Math.max(0, Math.min(5, Math.floor(spec.traitSlots)));
  const traitSlotCost = BUILD_COST.TRAIT_SLOTS[traitSlots as keyof typeof BUILD_COST.TRAIT_SLOTS];
  const traitSelectCost = resolveTraitCost(spec.selectedTraits.slice(0, traitSlots));

  const breakdown: BuildCostBreakdown = {
    physical: resolvePhysicalCost(spec),
    career: resolveCareerCost(spec),
    abstractAxes: resolveAbstractCost(spec),
    traitSlots: traitSlotCost,
    traits: traitSelectCost,
    oyakata: resolveOyakataCost(spec.selectedOyakataId, options?.oyakataLegacyStars),
    aptitudeReveal: spec.aptitudePlan.reveal ? BUILD_COST.APTITUDE_REVEAL : 0,
    aptitudeTune: spec.aptitudePlan.reveal
      ? Math.abs(spec.aptitudePlan.tuneStep) * BUILD_COST.APTITUDE_TUNE_STEP
      : 0,
    total: 0,
  };

  const total =
    breakdown.physical +
    breakdown.career +
    breakdown.abstractAxes +
    breakdown.traitSlots +
    breakdown.traits +
    breakdown.oyakata +
    breakdown.aptitudeReveal +
    breakdown.aptitudeTune;

  breakdown.total = total;
  return {
    total,
    breakdown,
  };
};

export const buildRikishiFromBuildSpec = (spec: BuildSpecV4): RikishiStatus => {
  if (!spec.selectedStableId) {
    throw new Error('所属部屋が未選択です');
  }
  const stable = resolveStableById(spec.selectedStableId);
  if (!stable) {
    throw new Error(`不明な所属部屋です: ${spec.selectedStableId}`);
  }

  const history = resolveHistory(spec.history, spec.entryDivision);
  const status = createInitialRikishi({
    shikona: spec.shikona,
    age: history.age,
    startingRank: history.rank,
    archetype: 'HARD_WORKER',
    aptitudeTier: spec.aptitudeBaseTier,
    aptitudeFactor: resolveAptitudeFactorFromPlan(spec),
    tactics: 'BALANCE',
    signatureMove: '',
    bodyType: spec.bodyType,
    traits: spec.selectedTraits.slice(0, spec.traitSlots),
    historyBonus: history.bonus,
    entryDivision: history.entryDivision,
    profile: spec.profile,
    bodyMetrics: spec.bodyMetrics,
    genome: applyAxesToGenome(spec),
    stableId: stable.id,
    ichimonId: stable.ichimonId,
    stableArchetypeId: stable.archetypeId,
  });

  return {
    ...status,
    tactics: 'BALANCE',
    signatureMoves: [],
  };
};

export const buildPreviewSummary = (spec: BuildSpecV4): BuildPreviewSummary => {
  const history = resolveHistory(spec.history, spec.entryDivision);
  const growthLabel =
    spec.abstractAxes.peakDesign === 'EARLY'
      ? '伸びが早い'
      : spec.abstractAxes.peakDesign === 'LATE'
        ? '遅れて伸びる'
        : '安定して伸びる';
  const durabilityLabel =
    spec.abstractAxes.durability === 'IRON'
      ? '怪我に強い'
      : spec.abstractAxes.durability === 'GAMBLE'
        ? '怪我の波が大きい'
        : '怪我は標準的';
  const styleLabel =
    spec.abstractAxes.winStyle === 'BURST'
      ? '押し切る相撲'
      : spec.abstractAxes.winStyle === 'COMEBACK'
        ? '粘る相撲'
        : '崩れにくい相撲';

  return {
    entryAge: history.age,
    startRankLabel: formatRankLabel(history.rank),
    growthLabel,
    durabilityLabel,
    styleLabel,
  };
};

export interface BuildCostBreakdownVNext {
  height: number;
  weight: number;
  reach: number;
  constitution: number;
  background: number;
  primaryStyle: number;
  secondaryStyle: number;
  mental: number;
  injuryResistance: number;
  oyakata: number;
  debtDiscount: number;
  total: number;
}

export interface BuildPreviewSummaryVNext {
  entryAge: number;
  startRankLabel: string;
  initialHeightCm: number;
  initialWeightKg: number;
  potentialHeightCm: number;
  potentialWeightKg: number;
  compatibilityLabel: string;
  careerBandLabel: string;
}

export const PHASE_A_BUILD_OPTIONS = {
  constitutionCost: {
    BALANCED_FRAME: 2,
    HEAVY_BULK: 6,
    LONG_REACH: 5,
    SPRING_LEGS: 4,
  } as Record<BodyConstitution, number>,
  backgroundCost: {
    MIDDLE_SCHOOL: 0,
    HIGH_SCHOOL: 4,
    STUDENT_ELITE: 9,
    COLLEGE_YOKOZUNA: 13,
  } as Record<AmateurBackground, number>,
  mentalCost: {
    CALM_ENGINE: 4,
    BIG_STAGE: 6,
    VOLATILE_FIRE: 2,
    STONEWALL: 5,
  } as Record<MentalTraitType, number>,
  injuryResistanceCost: {
    FRAGILE: 0,
    STANDARD: 4,
    IRON_BODY: 8,
  } as Record<InjuryResistanceType, number>,
  styleCost: {
    YOTSU: 7,
    TSUKI_OSHI: 7,
    MOROZASHI: 8,
    DOHYOUGIWA: 8,
    NAGE_TECH: 12,
    POWER_PRESSURE: 12,
  } as Record<StyleArchetype, number>,
  oyakataBaseCost: 6,
} as const;

const clampPhaseA = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundCost = (value: number): number => Math.round(value);

export const calculateHeightPotentialCost = (heightPotentialCm: number): number =>
  roundCost((Math.max(0, Math.abs(heightPotentialCm - 184) - 2) ** 2) / 16);

export const calculateWeightPotentialCost = (weightPotentialKg: number): number =>
  roundCost((Math.max(0, Math.abs(weightPotentialKg - 150) - 8) ** 2) / 36);

export const calculateReachDeltaCost = (reachDeltaCm: number): number =>
  roundCost((Math.max(0, Math.abs(reachDeltaCm) - 1) ** 2) / 9);

const resolveBodyTypeFromConstitution = (bodyConstitution: BodyConstitution): BuildSpecV4['bodyType'] => {
  if (bodyConstitution === 'HEAVY_BULK') return 'ANKO';
  if (bodyConstitution === 'LONG_REACH') return 'SOPPU';
  if (bodyConstitution === 'SPRING_LEGS') return 'MUSCULAR';
  return 'NORMAL';
};

const resolveBackgroundBonus = (background: AmateurBackground): number => {
  if (background === 'COLLEGE_YOKOZUNA') return 10;
  if (background === 'STUDENT_ELITE') return 7;
  if (background === 'HIGH_SCHOOL') return 3;
  return 0;
};

const resolveMentalTraits = (mentalTrait: MentalTraitType): Trait[] => {
  if (mentalTrait === 'BIG_STAGE') return ['OOBUTAI_NO_ONI', 'KYOUSHINZOU'];
  if (mentalTrait === 'VOLATILE_FIRE') return ['TRAILING_FIRE', 'KIBUNYA'];
  if (mentalTrait === 'STONEWALL') return ['KYOUSHINZOU', 'TETSUJIN'];
  return ['READ_THE_BOUT'];
};

const resolveInjuryTraits = (injuryResistance: InjuryResistanceType): Trait[] => {
  if (injuryResistance === 'IRON_BODY') return ['BUJI_KORE_MEIBA', 'RECOVERY_MONSTER'];
  if (injuryResistance === 'FRAGILE') return ['GLASS_KNEE'];
  return [];
};

const applyStyleGenomeAdjustments = (
  genome: RikishiGenome,
  style: StyleArchetype,
  secondary = false,
): void => {
  const scale = secondary ? 0.6 : 1;
  if (style === 'YOTSU') {
    genome.base.powerCeiling = clamp(genome.base.powerCeiling + 10 * scale, 0, 100);
    genome.base.ringSense = clamp(genome.base.ringSense + 8 * scale, 0, 100);
  } else if (style === 'TSUKI_OSHI') {
    genome.base.speedCeiling = clamp(genome.base.speedCeiling + 10 * scale, 0, 100);
    genome.base.styleFit = clamp(genome.base.styleFit + 8 * scale, 0, 100);
  } else if (style === 'MOROZASHI') {
    genome.base.techCeiling = clamp(genome.base.techCeiling + 9 * scale, 0, 100);
    genome.base.ringSense = clamp(genome.base.ringSense + 6 * scale, 0, 100);
  } else if (style === 'DOHYOUGIWA') {
    genome.variance.clutchBias = clamp(genome.variance.clutchBias + 12 * scale, -50, 50);
    genome.base.ringSense = clamp(genome.base.ringSense + 7 * scale, 0, 100);
  } else if (style === 'NAGE_TECH') {
    genome.base.techCeiling = clamp(genome.base.techCeiling + 11 * scale, 0, 100);
    genome.growth.adaptability = clamp(genome.growth.adaptability + 10 * scale, 0, 100);
  } else if (style === 'POWER_PRESSURE') {
    genome.base.powerCeiling = clamp(genome.base.powerCeiling + 12 * scale, 0, 100);
    genome.variance.streakSensitivity = clamp(genome.variance.streakSensitivity + 8 * scale, 0, 100);
  }
};

const applyConstitutionGenomeAdjustments = (
  genome: RikishiGenome,
  bodyConstitution: BodyConstitution,
): void => {
  if (bodyConstitution === 'HEAVY_BULK') {
    genome.base.powerCeiling = clamp(genome.base.powerCeiling + 12, 0, 100);
    genome.base.speedCeiling = clamp(genome.base.speedCeiling - 6, 0, 100);
  } else if (bodyConstitution === 'LONG_REACH') {
    genome.base.styleFit = clamp(genome.base.styleFit + 8, 0, 100);
    genome.base.techCeiling = clamp(genome.base.techCeiling + 6, 0, 100);
  } else if (bodyConstitution === 'SPRING_LEGS') {
    genome.base.speedCeiling = clamp(genome.base.speedCeiling + 10, 0, 100);
    genome.base.ringSense = clamp(genome.base.ringSense + 4, 0, 100);
  }
};

const applyInjuryResistanceGenomeAdjustments = (
  genome: RikishiGenome,
  injuryResistance: InjuryResistanceType,
): void => {
  if (injuryResistance === 'IRON_BODY') {
    genome.durability.baseInjuryRisk = clamp(genome.durability.baseInjuryRisk - 0.18, 0.3, 2.0);
    genome.durability.recoveryRate = clamp(genome.durability.recoveryRate + 0.2, 0.5, 2.0);
    genome.durability.chronicResistance = clamp(genome.durability.chronicResistance + 10, 0, 100);
  } else if (injuryResistance === 'FRAGILE') {
    genome.durability.baseInjuryRisk = clamp(genome.durability.baseInjuryRisk + 0.22, 0.3, 2.0);
    genome.durability.chronicResistance = clamp(genome.durability.chronicResistance - 8, 0, 100);
  }
};

const applyDebtGenomeAdjustments = (
  genome: RikishiGenome,
  debtCards: DebtCardId[],
): void => {
  if (debtCards.includes('OLD_KNEE')) {
    genome.durability.baseInjuryRisk = clamp(genome.durability.baseInjuryRisk * 1.35, 0.3, 2.0);
    genome.durability.partVulnerability.KNEE = (genome.durability.partVulnerability.KNEE ?? 1) * 1.5;
  }
  if (debtCards.includes('LATE_START')) {
    genome.growth.maturationAge = clamp(genome.growth.maturationAge + 1, 18, 35);
  }
};

const resolveInitialBodyFromPotential = (
  spec: BuildSpecVNext,
): { heightCm: number; weightKg: number; reachDeltaCm: number } => {
  const background = AMATEUR_BACKGROUND_CONFIG[spec.amateurBackground];
  const lateStart = spec.debtCards.includes('LATE_START');
  const heightCm = clampPhaseA(
    spec.heightPotentialCm - background.initialHeightDelta - (lateStart ? 1 : 0),
    168,
    spec.heightPotentialCm,
  );
  const weightKg = clampPhaseA(
    spec.weightPotentialKg - background.initialWeightDelta - (lateStart ? 8 : 0) - Math.max(0, spec.heightPotentialCm - 184) * 0.7,
    70,
    spec.weightPotentialKg,
  );
  return {
    heightCm,
    weightKg,
    reachDeltaCm: spec.reachDeltaCm,
  };
};

export const calculateBodyMassIndex = (heightCm: number, weightKg: number): number => {
  const heightM = Math.max(1, heightCm / 100);
  return weightKg / (heightM * heightM);
};

export const createDefaultBuildSpecVNext = (
  oyakataId: string = STARTER_OYAKATA_BLUEPRINTS[0].id,
): BuildSpecVNext => ({
  oyakataId,
  heightPotentialCm: 184,
  weightPotentialKg: 150,
  reachDeltaCm: 0,
  bodyConstitution: 'BALANCED_FRAME',
  amateurBackground: 'HIGH_SCHOOL',
  primaryStyle: 'YOTSU',
  secondaryStyle: 'DOHYOUGIWA',
  mentalTrait: 'CALM_ENGINE',
  injuryResistance: 'STANDARD',
  debtCards: [],
});

export const calculateBuildCostVNext = (
  spec: BuildSpecVNext,
  oyakata?: OyakataBlueprint | null,
): { total: number; breakdown: BuildCostBreakdownVNext } => {
  const breakdown: BuildCostBreakdownVNext = {
    height: calculateHeightPotentialCost(spec.heightPotentialCm),
    weight: calculateWeightPotentialCost(spec.weightPotentialKg),
    reach: calculateReachDeltaCost(spec.reachDeltaCm),
    constitution: PHASE_A_BUILD_OPTIONS.constitutionCost[spec.bodyConstitution],
    background: PHASE_A_BUILD_OPTIONS.backgroundCost[spec.amateurBackground],
    primaryStyle: PHASE_A_BUILD_OPTIONS.styleCost[spec.primaryStyle],
    secondaryStyle: PHASE_A_BUILD_OPTIONS.styleCost[spec.secondaryStyle] - 1,
    mental: PHASE_A_BUILD_OPTIONS.mentalCost[spec.mentalTrait],
    injuryResistance: PHASE_A_BUILD_OPTIONS.injuryResistanceCost[spec.injuryResistance],
    oyakata: (oyakata ? PHASE_A_BUILD_OPTIONS.oyakataBaseCost : 0) + (spec.primaryStyle === oyakata?.secretStyle ? 1 : 0),
    debtDiscount: spec.debtCards.reduce((sum, debt) => sum + DEBT_CARD_POINT_BONUS[debt], 0),
    total: 0,
  };
  breakdown.total =
    breakdown.height +
    breakdown.weight +
    breakdown.reach +
    breakdown.constitution +
    breakdown.background +
    breakdown.primaryStyle +
    breakdown.secondaryStyle +
    breakdown.mental +
    breakdown.injuryResistance +
    breakdown.oyakata -
    breakdown.debtDiscount;
  return { total: Math.max(0, breakdown.total), breakdown };
};

export const buildPreviewSummaryVNext = (
  spec: BuildSpecVNext,
  oyakata: OyakataBlueprint,
): BuildPreviewSummaryVNext => {
  const background = AMATEUR_BACKGROUND_CONFIG[spec.amateurBackground];
  const initialBody = resolveInitialBodyFromPotential(spec);
  const compatibility = getStyleCompatibility(spec.primaryStyle, spec.secondaryStyle);
  const spentPoints = calculateBuildCostVNext(spec, oyakata).total;
  return {
    entryAge: background.entryAge + (spec.debtCards.includes('LATE_START') ? 2 : 0),
    startRankLabel: formatRankLabel(background.startRank),
    initialHeightCm: initialBody.heightCm,
    initialWeightKg: initialBody.weightKg,
    potentialHeightCm: spec.heightPotentialCm,
    potentialWeightKg: spec.weightPotentialKg,
    compatibilityLabel:
      compatibility === 'EXCELLENT' ? '相性抜群' :
      compatibility === 'GOOD' ? '相性良好' :
      compatibility === 'POOR' ? '食い合わせ難' :
      '相性標準',
    careerBandLabel: estimateCareerBandLabel({
      spentPoints,
      debtCount: spec.debtCards.length,
      compatibility,
    }),
  };
};

export const isBuildSpecVNextBmiValid = (spec: BuildSpecVNext): boolean => {
  const initialBody = resolveInitialBodyFromPotential(spec);
  return calculateBodyMassIndex(initialBody.heightCm, initialBody.weightKg) >= 20;
};

export const resolveBuildSpecVNextOyakata = (
  oyakataId: string,
  available: OyakataBlueprint[] = STARTER_OYAKATA_BLUEPRINTS,
): OyakataBlueprint => {
  const found = available.find((blueprint) => blueprint.id === oyakataId);
  if (!found) {
    throw new Error(`親方が見つかりません: ${oyakataId}`);
  }
  return found;
};

const resolveStableForBlueprint = (blueprint: OyakataBlueprint) => {
  const stable = listStablesByIchimon(blueprint.ichimonId)[0];
  if (!stable) {
    throw new Error(`一門 ${blueprint.ichimonId} に対応する部屋がありません`);
  }
  return stable;
};

export const buildInitialRikishiFromSpec = (
  spec: BuildSpecVNext,
  oyakata: OyakataBlueprint,
): RikishiStatus => {
  const stable = resolveStableForBlueprint(oyakata);
  const background = AMATEUR_BACKGROUND_CONFIG[spec.amateurBackground];
  const initialBody = resolveInitialBodyFromPotential(spec);
  const compatibility = getStyleCompatibility(spec.primaryStyle, spec.secondaryStyle);
  const cost = calculateBuildCostVNext(spec, oyakata);
  const genome = createBaseGenome();
  applyConstitutionGenomeAdjustments(genome, spec.bodyConstitution);
  applyStyleGenomeAdjustments(genome, spec.primaryStyle, false);
  applyStyleGenomeAdjustments(genome, spec.secondaryStyle, true);
  applyStyleGenomeAdjustments(genome, oyakata.secretStyle, true);
  applyInjuryResistanceGenomeAdjustments(genome, spec.injuryResistance);
  applyDebtGenomeAdjustments(genome, spec.debtCards);

  const growthType =
    spec.debtCards.includes('LATE_START') ? 'LATE' :
    spec.amateurBackground === 'MIDDLE_SCHOOL' ? 'EARLY' :
    spec.amateurBackground === 'COLLEGE_YOKOZUNA' ? 'NORMAL' :
    'NORMAL';
  const traitJourney = buildLockedTraitJourney([
    { source: 'MENTAL_TRAIT', traits: resolveMentalTraits(spec.mentalTrait) },
    { source: 'INJURY_RESISTANCE', traits: resolveInjuryTraits(spec.injuryResistance) },
    {
      source: 'BODY_CONSTITUTION',
      traits: [
        ...(spec.bodyConstitution === 'LONG_REACH' ? ['LONG_REACH' as const] : []),
        ...(spec.bodyConstitution === 'HEAVY_BULK' ? ['HEAVY_PRESSURE' as const] : []),
      ],
    },
    {
      source: 'DEBT_CARD',
      traits: spec.debtCards.includes('OLD_KNEE') ? ['GLASS_KNEE' as const] : [],
    },
  ]);
  const buildSummary = buildCareerSeedSummary({
    oyakataName: oyakata.name,
    amateurBackground: spec.amateurBackground,
    bodyConstitution: spec.bodyConstitution,
    heightPotentialCm: spec.heightPotentialCm,
    weightPotentialKg: spec.weightPotentialKg,
    reachDeltaCm: spec.reachDeltaCm,
    spentPoints: cost.total,
    remainingPoints: CAREER_DESIGN_STARTING_POINTS - cost.total,
    debtCount: spec.debtCards.length,
    debtCards: spec.debtCards,
    secretStyle: oyakata.secretStyle,
    compatibility,
  });
  const entryAge = background.entryAge + (spec.debtCards.includes('LATE_START') ? 2 : 0);
  const isTsukedashi =
    background.startRank.division === 'Makushita' ||
    background.startRank.division === 'Sandanme';
  const status = createInitialRikishi({
    shikona: generateShikona(),
    age: entryAge,
    startingRank: background.startRank,
    archetype: 'HARD_WORKER',
    aptitudeTier: rollAptitudeTier(Math.random),
    aptitudeFactor: 1,
    tactics:
      isTsukedashi
        ? spec.primaryStyle === 'TSUKI_OSHI' || spec.primaryStyle === 'POWER_PRESSURE'
          ? 'PUSH'
          : spec.primaryStyle === 'YOTSU' || spec.primaryStyle === 'MOROZASHI'
            ? 'GRAPPLE'
            : 'TECHNIQUE'
        : 'BALANCE',
    signatureMove: '',
    bodyType: resolveBodyTypeFromConstitution(spec.bodyConstitution),
    traits: [],
    traitJourney,
    historyBonus: resolveBackgroundBonus(spec.amateurBackground) - (spec.debtCards.includes('LATE_START') ? 4 : 0),
    entryDivision: background.startRank.division === 'Makushita'
      ? 'Makushita60'
      : background.startRank.division === 'Sandanme'
        ? 'Sandanme90'
        : undefined,
    profile: {
      realName: '',
      birthplace: '未設定',
      personality:
        spec.mentalTrait === 'VOLATILE_FIRE' ? 'WILD' :
        spec.mentalTrait === 'BIG_STAGE' ? 'AGGRESSIVE' :
        spec.mentalTrait === 'STONEWALL' ? 'SERIOUS' :
        'CALM',
    },
    bodyMetrics: {
      heightCm: initialBody.heightCm,
      weightKg: initialBody.weightKg,
      reachDeltaCm: spec.reachDeltaCm,
    },
    genome,
    growthType,
    stableId: stable.id,
    ichimonId: stable.ichimonId,
    stableArchetypeId: stable.archetypeId,
    buildSummary,
    mentorId: oyakata.id,
    spirit:
      70 +
      (spec.mentalTrait === 'STONEWALL' ? 6 : 0) +
      (spec.mentalTrait === 'BIG_STAGE' ? 4 : 0) -
      (spec.debtCards.includes('PRESSURE_LINEAGE') ? 8 : 0),
  });

  if (spec.debtCards.includes('LATE_START')) {
    (Object.keys(status.stats) as Array<keyof RikishiStatus['stats']>).forEach((key) => {
      status.stats[key] = Math.max(1, status.stats[key] - 4);
    });
  }
  status.signatureMoves = [];
  status.bodyMetrics.heightCm = initialBody.heightCm;
  status.bodyMetrics.weightKg = initialBody.weightKg;
  status.buildSummary = buildSummary;
  status.mentorId = oyakata.id;
  return status;
};

export const getStarterOyakataBlueprints = (): OyakataBlueprint[] => STARTER_OYAKATA_BLUEPRINTS;
