import {
  CONSTANTS,
  rollAptitudeTier,
  resolveAptitudeFactor,
} from '../constants';
import { createInitialRikishi } from '../initialization';
import {
  AptitudeTier,
  BuildAxisClutch,
  BuildAxisDurability,
  BuildAxisPeakDesign,
  BuildAxisVolatility,
  BuildAxisWinStyle,
  BuildSpecV4,
  EntryDivision,
  RikishiGenome,
  RikishiStatus,
  Trait,
} from '../models';
import { generateShikona } from '../naming/playerNaming';
import { resolveStableById } from '../simulation/heya/stableCatalog';

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
  selectedIchimonId: null,
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
