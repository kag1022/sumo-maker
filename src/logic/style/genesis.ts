import {
  AptitudeTier,
  CareerBand,
  StableArchetypeId,
  StyleArchetype,
  TacticsType,
} from '../models';
import { styleToTactics } from '../styleProfile';

export type StyleGenesisEntryPath = 'LOCAL' | 'SCHOOL' | 'COLLEGE' | 'CHAMPION';
export type StyleGenesisTemperament = 'STEADY' | 'AMBITION' | 'STUBBORN' | 'EXPLOSIVE';
export type StyleGenesisBodySeed = 'BALANCED' | 'LONG' | 'HEAVY' | 'SPRING';

export interface StyleGenesisBiases {
  styleBias?: number;
  styleSettlingBias?: number;
  clutchBias?: number;
  reboundBias?: number;
  volatilityBias?: number;
  durabilityBias?: number;
}

export interface StyleGenesisInput {
  stableArchetypeId: StableArchetypeId;
  heightCm: number;
  weightKg: number;
  entryPath?: StyleGenesisEntryPath;
  temperament?: StyleGenesisTemperament;
  bodySeed?: StyleGenesisBodySeed;
  secretStyle?: StyleArchetype;
  biases?: StyleGenesisBiases;
  fallbackStyleBias?: TacticsType;
}

export interface PlayerStyleGenesisResult {
  primaryStyle: StyleArchetype;
  secondaryStyle: StyleArchetype;
  birthStyleBias: TacticsType;
  techniqueAffinity: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveBmi = (heightCm: number, weightKg: number): number =>
  weightKg / Math.max(1, (heightCm / 100) * (heightCm / 100));

export const deriveBodySeedFromMetrics = (
  heightCm: number,
  weightKg: number,
): StyleGenesisBodySeed => {
  const bmi = resolveBmi(heightCm, weightKg);
  if (weightKg >= 155 || bmi >= 35) return 'HEAVY';
  if (heightCm >= 188 && bmi <= 31.5) return 'LONG';
  if (weightKg <= 128 || bmi <= 27.8) return 'SPRING';
  return 'BALANCED';
};

export const deriveEntryPathForNpcRecruit = (
  entryAge: number,
  aptitudeTier?: AptitudeTier,
  careerBand?: CareerBand,
): StyleGenesisEntryPath => {
  if (entryAge >= 22) {
    return aptitudeTier === 'S' || aptitudeTier === 'A' || careerBand === 'ELITE'
      ? 'CHAMPION'
      : 'COLLEGE';
  }
  if (entryAge >= 18) return 'SCHOOL';
  return 'LOCAL';
};

export const deriveTemperamentForNpcRecruit = (
  volatility: number,
  growthBias: number,
  careerBand?: CareerBand,
): StyleGenesisTemperament => {
  if (volatility >= 2.5) return 'EXPLOSIVE';
  if (growthBias >= 0.05 || careerBand === 'ELITE' || careerBand === 'STRONG') return 'AMBITION';
  if (volatility <= 1.25) return 'STEADY';
  return 'STUBBORN';
};

const resolveTechniqueStyle = (input: StyleGenesisInput): StyleArchetype => {
  const bodySeed = input.bodySeed ?? deriveBodySeedFromMetrics(input.heightCm, input.weightKg);
  if (
    input.stableArchetypeId === 'TECHNICAL_SMALL' ||
    input.entryPath === 'CHAMPION' ||
    input.entryPath === 'COLLEGE' ||
    bodySeed === 'LONG'
  ) {
    return 'NAGE_TECH';
  }
  return 'DOHYOUGIWA';
};

const resolveBasePrimaryStyle = (input: StyleGenesisInput): StyleArchetype => {
  const bodySeed = input.bodySeed ?? deriveBodySeedFromMetrics(input.heightCm, input.weightKg);
  if (bodySeed === 'HEAVY') {
    return input.stableArchetypeId === 'TSUKI_OSHI_GROUP' ? 'POWER_PRESSURE' : 'YOTSU';
  }
  if (bodySeed === 'LONG') return 'TSUKI_OSHI';
  if (bodySeed === 'SPRING') return 'DOHYOUGIWA';
  if (input.stableArchetypeId === 'TECHNICAL_SMALL') return 'NAGE_TECH';
  if (input.stableArchetypeId === 'MODERN_SCIENCE') return 'TSUKI_OSHI';
  return 'YOTSU';
};

const resolveBaseSecondaryStyle = (
  input: StyleGenesisInput,
  primaryStyle: StyleArchetype,
): StyleArchetype => {
  if (input.entryPath === 'CHAMPION') return primaryStyle === 'YOTSU' ? 'MOROZASHI' : 'NAGE_TECH';
  if (input.entryPath === 'COLLEGE') return 'MOROZASHI';
  if (input.temperament === 'EXPLOSIVE') return 'POWER_PRESSURE';
  if (input.temperament === 'STEADY') return 'DOHYOUGIWA';
  if (input.temperament === 'AMBITION') return 'TSUKI_OSHI';
  return primaryStyle === 'YOTSU' ? 'DOHYOUGIWA' : 'YOTSU';
};

export const resolveTechniqueAffinity = (input: StyleGenesisInput): number => {
  const bodySeed = input.bodySeed ?? deriveBodySeedFromMetrics(input.heightCm, input.weightKg);
  const entryPath = input.entryPath ?? 'LOCAL';
  const temperament = input.temperament ?? 'STEADY';
  const bmi = resolveBmi(input.heightCm, input.weightKg);
  let score = 0.18;

  if (bodySeed === 'SPRING') score += 0.24;
  else if (bodySeed === 'LONG') score += 0.18;
  else if (bodySeed === 'BALANCED') score += 0.04;
  else score -= 0.2;

  if (entryPath === 'CHAMPION') score += 0.18;
  else if (entryPath === 'COLLEGE') score += 0.12;
  else if (entryPath === 'SCHOOL') score += 0.04;
  else score -= 0.08;

  if (input.stableArchetypeId === 'TECHNICAL_SMALL') score += 0.22;
  else if (input.stableArchetypeId === 'MODERN_SCIENCE') score += 0.14;
  else if (input.stableArchetypeId === 'MASTER_DISCIPLE') score += 0.08;
  else if (input.stableArchetypeId === 'TSUKI_OSHI_GROUP') score -= 0.14;
  else if (input.stableArchetypeId === 'GIANT_YOTSU') score -= 0.08;

  if (temperament === 'STEADY') score += 0.08;
  else if (temperament === 'AMBITION') score += 0.05;
  else if (temperament === 'EXPLOSIVE') score -= 0.1;

  if (input.secretStyle === 'DOHYOUGIWA' || input.secretStyle === 'NAGE_TECH') score += 0.08;
  if (input.secretStyle === 'TSUKI_OSHI' || input.secretStyle === 'POWER_PRESSURE') score -= 0.04;

  if (input.heightCm >= 188 && bmi <= 31.5) score += 0.07;
  if (input.weightKg <= 132) score += 0.09;
  if (bmi <= 28.5) score += 0.06;
  if (input.weightKg >= 160 || bmi >= 35) score -= 0.14;

  if (input.biases) {
    score += (input.biases.clutchBias ?? 0) * 0.015;
    score += (input.biases.reboundBias ?? 0) * 0.012;
    score += (input.biases.styleSettlingBias ?? 0) * 0.012;
    score -= (input.biases.volatilityBias ?? 0) * 0.01;
    score -= (input.biases.durabilityBias ?? 0) * 0.008;
    score -= Math.max(0, input.biases.styleBias ?? 0) * 0.012;
  }

  if (input.fallbackStyleBias === 'TECHNIQUE') score += 0.08;
  else if (input.fallbackStyleBias === 'PUSH') score -= 0.06;
  else if (input.fallbackStyleBias === 'GRAPPLE') score -= 0.02;

  return clamp(score, 0.02, 0.98);
};

const resolveBiasScores = (
  input: StyleGenesisInput,
): Record<TacticsType, number> => {
  const techniqueAffinity = resolveTechniqueAffinity(input);
  const bodySeed = input.bodySeed ?? deriveBodySeedFromMetrics(input.heightCm, input.weightKg);

  let push = 1.02;
  let grapple = 1;
  let technique = 0.86 + techniqueAffinity * 1.9;
  let balance = 0.74;

  if (bodySeed === 'HEAVY') {
    push += 0.44;
    grapple += 0.28;
    technique -= 0.18;
  } else if (bodySeed === 'LONG') {
    push += 0.08;
    technique += 0.34;
  } else if (bodySeed === 'SPRING') {
    technique += 0.42;
    balance += 0.08;
  }

  if (input.stableArchetypeId === 'TSUKI_OSHI_GROUP') push += 0.6;
  if (input.stableArchetypeId === 'GIANT_YOTSU') grapple += 0.56;
  if (input.stableArchetypeId === 'TECHNICAL_SMALL') technique += 0.82;
  if (input.stableArchetypeId === 'MODERN_SCIENCE') technique += 0.34;
  if (input.stableArchetypeId === 'MASTER_DISCIPLE') balance += 0.12;

  if (input.fallbackStyleBias) {
    if (input.fallbackStyleBias === 'PUSH') push += 0.28;
    if (input.fallbackStyleBias === 'GRAPPLE') grapple += 0.24;
    if (input.fallbackStyleBias === 'TECHNIQUE') technique += 0.34;
    if (input.fallbackStyleBias === 'BALANCE') balance += 0.16;
  }

  return {
    PUSH: Math.max(0.12, push),
    GRAPPLE: Math.max(0.12, grapple),
    TECHNIQUE: Math.max(0.12, technique),
    BALANCE: Math.max(0.12, balance),
  };
};

export const sampleBirthStyleBias = (
  input: StyleGenesisInput,
  rng: () => number,
): TacticsType => {
  const scores = resolveBiasScores(input);
  const ordered = ['PUSH', 'GRAPPLE', 'TECHNIQUE', 'BALANCE'] as const;
  const total = ordered.reduce((sum, key) => sum + scores[key], 0);
  let roll = rng() * total;
  for (const key of ordered) {
    roll -= scores[key];
    if (roll <= 0) return key;
  }
  return ordered[ordered.length - 1];
};

export const resolvePlayerScoutStyles = (
  input: StyleGenesisInput,
): PlayerStyleGenesisResult => {
  const techniqueAffinity = resolveTechniqueAffinity(input);
  const techniqueStyle = resolveTechniqueStyle(input);
  const basePrimary = resolveBasePrimaryStyle(input);
  let primaryStyle = basePrimary;
  let secondaryStyle = resolveBaseSecondaryStyle(input, primaryStyle);

  const forceNonTechnical =
    (input.bodySeed === 'HEAVY' || deriveBodySeedFromMetrics(input.heightCm, input.weightKg) === 'HEAVY') &&
    input.entryPath === 'LOCAL' &&
    input.stableArchetypeId === 'TSUKI_OSHI_GROUP';

  if (!forceNonTechnical && techniqueAffinity >= 0.74) {
    primaryStyle = techniqueStyle;
    secondaryStyle =
      techniqueStyle === 'NAGE_TECH'
        ? (basePrimary === 'YOTSU' ? 'MOROZASHI' : 'DOHYOUGIWA')
        : basePrimary === 'YOTSU'
          ? 'MOROZASHI'
          : 'NAGE_TECH';
  } else if (!forceNonTechnical && techniqueAffinity >= 0.54) {
    secondaryStyle = techniqueStyle;
  } else if (techniqueAffinity <= 0.2 && (secondaryStyle === 'DOHYOUGIWA' || secondaryStyle === 'NAGE_TECH')) {
    secondaryStyle = basePrimary === 'YOTSU' ? 'MOROZASHI' : 'YOTSU';
  }

  if (secondaryStyle === primaryStyle) {
    secondaryStyle =
      primaryStyle === 'NAGE_TECH'
        ? 'DOHYOUGIWA'
        : primaryStyle === 'DOHYOUGIWA'
          ? 'NAGE_TECH'
          : primaryStyle === 'YOTSU'
            ? 'MOROZASHI'
            : 'YOTSU';
  }

  return {
    primaryStyle,
    secondaryStyle,
    birthStyleBias: styleToTactics(primaryStyle),
    techniqueAffinity,
  };
};
