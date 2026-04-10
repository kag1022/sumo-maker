import {
  AptitudeTier,
  BasicProfile,
  BodyMetrics,
  BodyType,
  EntryDivision,
  GrowthType,
  Rank,
  RetirementProfile,
  BuildSummary,
  RikishiGenome,
  RikishiStatus,
  StyleProfile,
  TacticsType,
  TalentArchetype,
  Trait,
  TraitJourneyEntry,
  IchimonId,
  StableArchetypeId,
} from './models';
import {
  CONSTANTS,
  DEFAULT_APTITUDE_TIER,
  DEFAULT_CAREER_BAND,
  rollCareerBandForAptitude,
  resolveAptitudeProfile,
} from './constants';
import { resolveAbilityFromStats, resolveRankBaselineAbility } from './simulation/strength/model';
import { resolveRetirementProfileFromText } from './simulation/retirement/shared';
import { resolveLegacyAptitudeFactor } from './simulation/realism';
import { createKimariteRepertoireFromSeed } from './kimarite/repertoire';
import { styleToTactics } from './styleProfile';

export interface CreateInitialRikishiParams {
  shikona: string;
  age: number;
  startingRank: Rank;
  archetype: TalentArchetype;
  aptitudeTier?: AptitudeTier;
  aptitudeFactor?: number;
  aptitudeProfile?: RikishiStatus['aptitudeProfile'];
  careerBand?: RikishiStatus['careerBand'];
  tactics: TacticsType;
  signatureMove: string;
  bodyType: BodyType;
  traits: Trait[];
  traitJourney?: TraitJourneyEntry[];
  historyBonus: number;
  entryDivision?: EntryDivision;
  growthType?: GrowthType;
  profile?: BasicProfile;
  bodyMetrics?: BodyMetrics;
  genome?: RikishiGenome;
  retirementProfile?: RetirementProfile;
  designedStyleProfile?: StyleProfile;
  buildSummary?: BuildSummary;
  mentorId?: string;
  spirit?: number;
  stableId: string;
  ichimonId: IchimonId;
  stableArchetypeId: StableArchetypeId;
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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/**
 * DNA の BaseAbilityDNA ceiling 値から stat ごとのボーナスを算出する。
 * ceiling が高いほどその系統の初期値が高くなる。
 * 各 stat は複数の ceiling から重み付けで影響を受ける。
 */
const resolveGenomeStatBonus = (genome: RikishiGenome): Record<string, number> => {
  const b = genome.base;
  return {
    tsuki: (b.powerCeiling * 0.4 + b.speedCeiling * 0.3 + b.styleFit * 0.3) / 100 * 11,
    oshi: (b.powerCeiling * 0.5 + b.speedCeiling * 0.3 + b.styleFit * 0.2) / 100 * 11,
    kumi: (b.powerCeiling * 0.3 + b.techCeiling * 0.4 + b.ringSense * 0.3) / 100 * 11,
    nage: (b.techCeiling * 0.5 + b.powerCeiling * 0.3 + b.ringSense * 0.2) / 100 * 11,
    koshi: (b.ringSense * 0.4 + b.powerCeiling * 0.3 + b.speedCeiling * 0.3) / 100 * 11,
    deashi: (b.speedCeiling * 0.5 + b.ringSense * 0.2 + b.styleFit * 0.3) / 100 * 11,
    waza: (b.techCeiling * 0.4 + b.ringSense * 0.4 + b.styleFit * 0.2) / 100 * 11,
    power: (b.powerCeiling * 0.6 + b.speedCeiling * 0.2 + b.styleFit * 0.2) / 100 * 11,
  };
};

export const createInitialRikishi = (
  params: CreateInitialRikishiParams,
  random: () => number = Math.random,
): RikishiStatus => {
  const archData = CONSTANTS.TALENT_ARCHETYPES[params.archetype];
  const [minPot, maxPot] = archData.potentialRange;
  const potentialBase = minPot + Math.floor(random() * (maxPot - minPot + 1));
  const aptitudeTier = params.aptitudeTier ?? DEFAULT_APTITUDE_TIER;
  const aptitudeProfile = params.aptitudeProfile
    ? { ...params.aptitudeProfile }
    : resolveAptitudeProfile(aptitudeTier);
  const aptitudeFactor = Number.isFinite(params.aptitudeFactor)
    ? Math.max(0.3, params.aptitudeFactor as number)
    : resolveLegacyAptitudeFactor(aptitudeProfile, aptitudeTier);
  const potential = clamp(
    Math.round(50 + (potentialBase - 50) * aptitudeProfile.initialFactor),
    1,
    100,
  );

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
      stats[k] += 12;
    } else if (tacticMods[k] < 1.0) {
      stats[k] -= 4;
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
    stats[k] += Math.floor(random() * 19) - 9;
    stats[k] = Math.max(1, stats[k]);
    const scaledBase = Math.max(20, stats[k]);
    stats[k] = Math.max(1, Math.round(20 + (scaledBase - 20) * aptitudeProfile.initialFactor));
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

  const retirementProfile =
    params.retirementProfile ??
    resolveRetirementProfileFromText(`${params.shikona}|${params.stableId}|${params.age}`);
  const designedPrimaryStyle = params.designedStyleProfile
    ? (params.designedStyleProfile.primary ? (styleToTactics(params.designedStyleProfile.primary) === 'PUSH' ? 'PUSH' : styleToTactics(params.designedStyleProfile.primary) === 'GRAPPLE' ? 'GRAPPLE' : styleToTactics(params.designedStyleProfile.primary) === 'TECHNIQUE' ? 'TECHNIQUE' : 'BALANCE') : undefined)
    : undefined;
  const designedSecondaryStyle = params.designedStyleProfile
    ? (params.designedStyleProfile.secondary ? (styleToTactics(params.designedStyleProfile.secondary) === 'PUSH' ? 'PUSH' : styleToTactics(params.designedStyleProfile.secondary) === 'GRAPPLE' ? 'GRAPPLE' : styleToTactics(params.designedStyleProfile.secondary) === 'TECHNIQUE' ? 'TECHNIQUE' : 'BALANCE') : undefined)
    : undefined;
  const designedSecretStyle = params.designedStyleProfile?.secret
    ? (styleToTactics(params.designedStyleProfile.secret) === 'PUSH' ? 'PUSH' : styleToTactics(params.designedStyleProfile.secret) === 'GRAPPLE' ? 'GRAPPLE' : styleToTactics(params.designedStyleProfile.secret) === 'TECHNIQUE' ? 'TECHNIQUE' : 'BALANCE')
    : undefined;
  const kimariteRepertoire = createKimariteRepertoireFromSeed({
    style:
      params.tactics === 'PUSH'
        ? 'PUSH'
        : params.tactics === 'GRAPPLE'
          ? 'GRAPPLE'
          : params.tactics === 'TECHNIQUE'
            ? 'TECHNIQUE'
            : 'BALANCE',
    bodyType: params.bodyType,
    traits: params.traits,
    preferredMove: params.signatureMove,
    designedPrimaryStyle,
    designedSecondaryStyle,
    designedSecretStyle,
    kataSettled: false,
  });

  return {
    stableId: params.stableId,
    ichimonId: params.ichimonId,
    stableArchetypeId: params.stableArchetypeId,
    shikona: params.shikona,
    entryAge: params.age,
    age: params.age,
    rank: { ...params.startingRank },
    stats,
    potential,
    growthType: params.growthType ?? 'NORMAL',
    archetype: params.archetype,
    aptitudeTier,
    aptitudeFactor,
    aptitudeProfile,
    careerBand: params.careerBand ?? rollCareerBandForAptitude(aptitudeTier, random) ?? DEFAULT_CAREER_BAND,
    entryDivision,
    tactics: params.tactics,
    signatureMoves: params.signatureMove ? [params.signatureMove] : [],
    kimariteRepertoire,
    bodyType: params.bodyType,
    profile: params.profile ? { ...params.profile } : { ...DEFAULT_PROFILE },
    bodyMetrics: resolvedBodyMetrics,
    traits: [...params.traits],
    traitJourney: params.traitJourney ? params.traitJourney.map((entry) => ({ ...entry })) : [],
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
    retirementProfile,
    genome: params.genome,
    kataProfile: {
      settled: false,
      confidence: 0,
    },
    designedStyleProfile: params.designedStyleProfile,
    realizedStyleProfile: null,
    buildSummary: params.buildSummary,
    mentorId: params.mentorId,
    spirit: Number.isFinite(params.spirit) ? Math.round(params.spirit as number) : 70,
    stagnation: {
      pressure: 0,
      makekoshiStreak: 0,
      lowWinRateStreak: 0,
      stuckBasho: 0,
      reboundBoost: 0,
    },
    history: {
      records: [],
      events: [],
      maxRank: { ...params.startingRank },
      totalWins: 0,
      totalLosses: 0,
      totalAbsent: 0,
      yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
      kimariteTotal: {},
      winRouteTotal: {},
      bodyTimeline: [],
      highlightEvents: [],
      traitAwakenings: [],
      careerTurningPoints: [],
      realismKpi: {
        careerWinRate: 0.5,
        stagnationPressure: 0,
      },
    },
    statHistory: [],
  };
};

