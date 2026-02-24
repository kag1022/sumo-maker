import {
  BasicProfile,
  BodyMetrics,
  BodyType,
  EntryDivision,
  GrowthType,
  Rank,
  RikishiGenome,
  RikishiStatus,
  TacticsType,
  TalentArchetype,
  Trait,
} from './models';
import { CONSTANTS } from './constants';
import { resolveAbilityFromStats, resolveRankBaselineAbility } from './simulation/strength/model';

export interface CreateInitialRikishiParams {
  shikona: string;
  age: number;
  startingRank: Rank;
  archetype: TalentArchetype;
  tactics: TacticsType;
  signatureMove: string;
  bodyType: BodyType;
  traits: Trait[];
  historyBonus: number;
  entryDivision?: EntryDivision;
  growthType?: GrowthType;
  profile?: BasicProfile;
  bodyMetrics?: BodyMetrics;
  genome?: RikishiGenome;
}

const DEFAULT_PROFILE: BasicProfile = {
  realName: '',
  birthplace: '',
  personality: 'CALM',
};

const DEFAULT_BODY_METRICS: Record<BodyType, BodyMetrics> = {
  NORMAL: { heightCm: 182, weightKg: 138 },
  SOPPU: { heightCm: 186, weightKg: 124 },
  ANKO: { heightCm: 180, weightKg: 162 },
  MUSCULAR: { heightCm: 184, weightKg: 152 },
};

/**
 * DNA の BaseAbilityDNA ceiling 値から stat ごとのボーナスを算出する。
 * ceiling が高いほどその系統の初期値が高くなる。
 * 各 stat は複数の ceiling から重み付けで影響を受ける。
 */
const resolveGenomeStatBonus = (genome: RikishiGenome): Record<string, number> => {
  const b = genome.base;
  return {
    tsuki: (b.powerCeiling * 0.4 + b.speedCeiling * 0.3 + b.styleFit * 0.3) / 100 * 15,
    oshi: (b.powerCeiling * 0.5 + b.speedCeiling * 0.3 + b.styleFit * 0.2) / 100 * 15,
    kumi: (b.powerCeiling * 0.3 + b.techCeiling * 0.4 + b.ringSense * 0.3) / 100 * 15,
    nage: (b.techCeiling * 0.5 + b.powerCeiling * 0.3 + b.ringSense * 0.2) / 100 * 15,
    koshi: (b.ringSense * 0.4 + b.powerCeiling * 0.3 + b.speedCeiling * 0.3) / 100 * 15,
    deashi: (b.speedCeiling * 0.5 + b.ringSense * 0.2 + b.styleFit * 0.3) / 100 * 15,
    waza: (b.techCeiling * 0.4 + b.ringSense * 0.4 + b.styleFit * 0.2) / 100 * 15,
    power: (b.powerCeiling * 0.6 + b.speedCeiling * 0.2 + b.styleFit * 0.2) / 100 * 15,
  };
};

export const createInitialRikishi = (
  params: CreateInitialRikishiParams,
  random: () => number = Math.random,
): RikishiStatus => {
  const archData = CONSTANTS.TALENT_ARCHETYPES[params.archetype];
  const [minPot, maxPot] = archData.potentialRange;
  const potential = minPot + Math.floor(random() * (maxPot - minPot + 1));

  const stats: RikishiStatus['stats'] = {
    tsuki: 20,
    oshi: 20,
    kumi: 20,
    nage: 20,
    koshi: 20,
    deashi: 20,
    waza: 20,
    power: 20,
  };

  const baseBonus = archData.initialStatBonus + params.historyBonus;
  (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
    stats[k] += baseBonus;
  });

  const tacticMods = CONSTANTS.TACTICAL_GROWTH_MODIFIERS[params.tactics];
  (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
    if (tacticMods[k] > 1.0) {
      stats[k] += 10;
    } else if (tacticMods[k] < 1.0) {
      stats[k] -= 5;
    }
  });

  // DNA genome がある場合、ceiling 由来のボーナスを適用
  if (params.genome) {
    const genomeBonus = resolveGenomeStatBonus(params.genome);
    (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
      stats[k] += genomeBonus[k] ?? 0;
    });
  }

  (Object.keys(stats) as (keyof typeof stats)[]).forEach((k) => {
    stats[k] += Math.floor(random() * 11) - 5;
    stats[k] = Math.max(1, stats[k]);
  });

  const entryDivision =
    params.entryDivision && params.entryDivision !== 'Maezumo'
      ? params.entryDivision
      : undefined;

  const resolvedBodyMetrics = params.bodyMetrics
    ? { ...params.bodyMetrics }
    : { ...DEFAULT_BODY_METRICS[params.bodyType] };

  const initialAbility = resolveAbilityFromStats(
    stats,
    50,
    resolvedBodyMetrics,
    resolveRankBaselineAbility(params.startingRank),
  );

  // DNA durability から耐久力を算出（genome がない場合は従来値 80）
  const durability = params.genome
    ? Math.round(80 * (1 / Math.max(0.3, params.genome.durability.baseInjuryRisk)))
    : 80;

  return {
    heyaId: 'my-heya',
    shikona: params.shikona,
    entryAge: params.age,
    age: params.age,
    rank: { ...params.startingRank },
    stats,
    potential,
    growthType: params.growthType ?? 'NORMAL',
    archetype: params.archetype,
    entryDivision,
    tactics: params.tactics,
    signatureMoves: [params.signatureMove],
    bodyType: params.bodyType,
    profile: params.profile ? { ...params.profile } : { ...DEFAULT_PROFILE },
    bodyMetrics: resolvedBodyMetrics,
    traits: [...params.traits],
    durability: Math.max(40, Math.min(160, durability)),
    currentCondition: 50,
    ratingState: {
      ability: initialAbility,
      form: 0,
      uncertainty: 2.2,
    },
    injuryLevel: 0,
    injuries: [],
    isOzekiKadoban: false,
    isOzekiReturn: false,
    genome: params.genome,
    history: {
      records: [],
      events: [],
      maxRank: { ...params.startingRank },
      totalWins: 0,
      totalLosses: 0,
      totalAbsent: 0,
      yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
      kimariteTotal: {},
    },
    statHistory: [],
  };
};

