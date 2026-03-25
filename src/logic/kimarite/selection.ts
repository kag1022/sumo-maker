import type { BodyType, RikishiStatus, Trait } from '../models';
import type { RandomSource } from '../simulation/deps';
import {
  type KimariteFamily,
  type KimaritePattern,
  type KimariteRarityBucket,
  type KimariteStyle,
  type OfficialKimariteEntry,
  type OfficialWinningKimariteCatalogEntry,
  findOfficialKimariteEntry,
  findNonTechniqueEntry,
  isOfficialWinningKimarite,
  NON_TECHNIQUE_CATALOG,
  OFFICIAL_WIN_KIMARITE_82,
} from './catalog';

type StatKey = keyof RikishiStatus['stats'];

export interface KimariteCompetitorProfile {
  style: KimariteStyle;
  bodyType: BodyType;
  heightCm: number;
  weightKg: number;
  stats: Partial<Record<StatKey, number>>;
  traits: Trait[];
  preferredMove?: string;
  historyCounts?: Record<string, number>;
}

export interface KimariteVarietyProfile {
  coreFamilies: KimariteFamily[];
  secondaryFamilies: KimariteFamily[];
  versatility: number;
  trickBias: number;
  edgeCraft: number;
  repeatBias: number;
}

export interface KimariteOutcomeResolution {
  kimarite: string;
  pattern: KimaritePattern;
  rarityBucket: KimariteRarityBucket;
  isNonTechnique: boolean;
}

export interface KimariteUsageSummary {
  officialUniqueCount: number;
  nonTechniqueUniqueCount: number;
  top1MoveShare: number;
  top3MoveShare: number;
  rareMoveRate: number;
  extremeMoveRate: number;
  rareOrExtremeUniqueCount: number;
  dominantFamily?: KimariteFamily;
}

interface KimariteCandidate {
  entry: OfficialKimariteEntry;
  weight: number;
}


export type KimariteTuningPresetId = 'DEFAULT' | 'VARIETY_PLUS';

interface KimariteTuningProfile {
  statNormalize: { min: number; max: number; defaultStat: number; divider: number };
  bodyPreferredBonus: number;
  bodyLiftBonus: number;
  bodySoppuRareBonus: number;
  style: { primaryMatch: number; secondaryMatch: number; balanceBase: number; mismatchBase: number };
  statFit: { base: number };
  traitMatchBonus: number;
  variety: {
    versatilityMin: number;
    versatilityMax: number;
    versatilityDivider: number;
    trickBiasMax: number;
    edgeCraftMax: number;
    repeatBias: { push: number; grapple: number; technique: number; min: number; max: number };
  };
  novelty: {
    earlyUniqueBoost: number;
    unseenBoost: number;
    repeatScale: number;
    repeatPow: number;
    repeatMin: number;
  };
  family: { core: number; secondary: number; commonOther: number; rareOther: number };
  preferredMoveMatch: number;
  nonTechnique: { baseChance: number; underweightBonus: number; arawazashiBonus: number; maxChance: number };
  rarity: { rareTrickScale: number; extremeBase: number; extremeTrickScale: number; extremeEdgeScale: number };
  repeatPenalty: { perCount: number; min: number };
}

const KIMARITE_TUNING_PRESETS: Record<KimariteTuningPresetId, KimariteTuningProfile> = {
  DEFAULT: {
    statNormalize: { min: 0.15, max: 1.8, defaultStat: 50, divider: 100 },
    bodyPreferredBonus: 0.28,
    bodyLiftBonus: 0.18,
    bodySoppuRareBonus: 0.12,
    style: { primaryMatch: 1.45, secondaryMatch: 1.18, balanceBase: 1, mismatchBase: 0.72 },
    statFit: { base: 0.7 },
    traitMatchBonus: 0.16,
    variety: {
      versatilityMin: 0.25,
      versatilityMax: 1.25,
      versatilityDivider: 280,
      trickBiasMax: 0.95,
      edgeCraftMax: 1,
      repeatBias: { push: 0.82, grapple: 0.72, technique: 0.58, min: 0.45, max: 0.88 },
    },
    novelty: { earlyUniqueBoost: 1.7, unseenBoost: 1.15, repeatScale: 0.22, repeatPow: 0.85, repeatMin: 0.18 },
    family: { core: 1.28, secondary: 1.08, commonOther: 0.7, rareOther: 0.86 },
    preferredMoveMatch: 2.8,
    nonTechnique: { baseChance: 0.0012, underweightBonus: 0.0005, arawazashiBonus: 0.0003, maxChance: 0.003 },
    rarity: { rareTrickScale: 0.65, extremeBase: 0.2, extremeTrickScale: 0.6, extremeEdgeScale: 0.35 },
    repeatPenalty: { perCount: 0.04, min: 0.1 },
  },
  VARIETY_PLUS: {
    statNormalize: { min: 0.18, max: 1.9, defaultStat: 50, divider: 100 },
    bodyPreferredBonus: 0.24,
    bodyLiftBonus: 0.12,
    bodySoppuRareBonus: 0.18,
    style: { primaryMatch: 1.32, secondaryMatch: 1.14, balanceBase: 1.02, mismatchBase: 0.8 },
    statFit: { base: 0.76 },
    traitMatchBonus: 0.2,
    variety: {
      versatilityMin: 0.3,
      versatilityMax: 1.35,
      versatilityDivider: 260,
      trickBiasMax: 1,
      edgeCraftMax: 1,
      repeatBias: { push: 0.74, grapple: 0.66, technique: 0.56, min: 0.42, max: 0.82 },
    },
    novelty: { earlyUniqueBoost: 1.95, unseenBoost: 1.2, repeatScale: 0.18, repeatPow: 0.82, repeatMin: 0.22 },
    family: { core: 1.2, secondary: 1.06, commonOther: 0.76, rareOther: 0.9 },
    preferredMoveMatch: 2.35,
    nonTechnique: { baseChance: 0.0013, underweightBonus: 0.0005, arawazashiBonus: 0.00035, maxChance: 0.0032 },
    rarity: { rareTrickScale: 0.75, extremeBase: 0.28, extremeTrickScale: 0.68, extremeEdgeScale: 0.4 },
    repeatPenalty: { perCount: 0.03, min: 0.16 },
  },
};

const DEFAULT_KIMARITE_TUNING_PRESET: KimariteTuningPresetId = 'DEFAULT';
let activeKimariteTuningPreset: KimariteTuningPresetId = DEFAULT_KIMARITE_TUNING_PRESET;
const selectionWarnings: string[] = [];

const tuning = (): KimariteTuningProfile => KIMARITE_TUNING_PRESETS[activeKimariteTuningPreset];

const pushSelectionWarning = (message: string): void => {
  selectionWarnings.push(message);
  if (selectionWarnings.length > 100) selectionWarnings.shift();
};

export const setActiveKimariteTuningPreset = (presetId: KimariteTuningPresetId): void => {
  activeKimariteTuningPreset = presetId;
};

export const getActiveKimariteTuningPreset = (): KimariteTuningPresetId => activeKimariteTuningPreset;

export const consumeKimariteSelectionWarnings = (): string[] => {
  const copied = selectionWarnings.slice();
  selectionWarnings.length = 0;
  return copied;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sumStats = (stats: Partial<Record<StatKey, number>>, keys: StatKey[]): number =>
  keys.reduce((sum, key) => sum + (stats[key] ?? 0), 0);

const weightedPick = <T>(
  entries: Array<{ weight: number; value: T }>,
  rng: RandomSource,
): T => {
  if (!entries.length) {
    pushSelectionWarning('weightedPick: empty entries');
    throw new Error('weightedPick: entries must not be empty');
  }
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) {
    pushSelectionWarning(`weightedPick: non-positive total weight (n=${entries.length})`);
    throw new Error('weightedPick: total weight must be positive');
  }
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

const normalizeStat = (stats: Partial<Record<StatKey, number>>, key: StatKey): number =>
  clamp((stats[key] ?? tuning().statNormalize.defaultStat) / tuning().statNormalize.divider, tuning().statNormalize.min, tuning().statNormalize.max);

const resolveBodyFit = (
  entry: OfficialKimariteEntry,
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
): number => {
  const heightDiff = winner.heightCm - loser.heightCm;
  const weightDiff = winner.weightKg - loser.weightKg;
  const preferred = entry.bodyAffinity.preferredBodyTypes;
  if (preferred?.length && !preferred.includes(winner.bodyType)) return 0;
  if (
    typeof entry.bodyAffinity.minHeightDiff === 'number' &&
    heightDiff < entry.bodyAffinity.minHeightDiff
  ) {
    return 0;
  }
  if (
    typeof entry.bodyAffinity.minWeightDiff === 'number' &&
    weightDiff < entry.bodyAffinity.minWeightDiff
  ) {
    return 0;
  }
  if (
    typeof entry.bodyAffinity.maxWeightDiff === 'number' &&
    weightDiff > entry.bodyAffinity.maxWeightDiff
  ) {
    return 0;
  }
  let score = 1;
  if (preferred?.includes(winner.bodyType)) score += tuning().bodyPreferredBonus;
  if (weightDiff >= 18 && (entry.tags.includes('lift') || entry.family === 'FORCE_OUT')) score += tuning().bodyLiftBonus;
  if (winner.bodyType === 'SOPPU' && entry.rarityBucket !== 'COMMON') score += tuning().bodySoppuRareBonus;
  return score;
};

const resolveStyleFit = (
  entry: OfficialKimariteEntry,
  winnerStyle: KimariteStyle,
): number => {
  if (entry.primaryStyle === winnerStyle) return tuning().style.primaryMatch;
  if (entry.secondaryStyle === winnerStyle) return tuning().style.secondaryMatch;
  if (winnerStyle === 'BALANCE') return tuning().style.balanceBase;
  return tuning().style.mismatchBase;
};

const resolveStatFit = (
  entry: OfficialKimariteEntry,
  stats: Partial<Record<StatKey, number>>,
): number => {
  const affinity = Object.entries(entry.statAffinity);
  if (!affinity.length) return 1;
  const weighted = affinity.reduce(
    (sum, [key, value]) => sum + normalizeStat(stats, key as StatKey) * (value ?? 0),
    0,
  );
  return tuning().statFit.base + weighted / Math.max(1, affinity.length);
};

const resolveTraitFit = (
  entry: OfficialKimariteEntry,
  traits: Trait[],
): number => {
  const matches = entry.traitTags.filter((trait) => traits.includes(trait)).length;
  return 1 + matches * tuning().traitMatchBonus;
};

const resolveVarietyProfile = (
  winner: KimariteCompetitorProfile,
): KimariteVarietyProfile => {
  const pushScore = sumStats(winner.stats, ['tsuki', 'oshi', 'deashi']);
  const grappleScore = sumStats(winner.stats, ['kumi', 'koshi', 'power']);
  const techScore = sumStats(winner.stats, ['waza', 'nage', 'deashi']);
  const versatility = clamp((techScore + sumStats(winner.stats, ['deashi'])) / tuning().variety.versatilityDivider, tuning().variety.versatilityMin, tuning().variety.versatilityMax);
  const trickBias = clamp(
    (winner.traits.includes('ARAWAZASHI') ? 0.32 : 0) +
      (winner.traits.includes('READ_THE_BOUT') ? 0.22 : 0) +
      (winner.style === 'TECHNIQUE' ? 0.18 : 0) +
      (winner.bodyType === 'SOPPU' ? 0.08 : 0),
    0,
    tuning().variety.trickBiasMax,
  );
  const edgeCraft = clamp(
    (winner.traits.includes('DOHYOUGIWA_MAJUTSU') ? 0.36 : 0) +
      (winner.traits.includes('CLUTCH_REVERSAL') ? 0.26 : 0) +
      normalizeStat(winner.stats, 'waza') * 0.12,
    0,
    tuning().variety.edgeCraftMax,
  );
  const repeatBias = clamp(
    winner.style === 'PUSH' ? tuning().variety.repeatBias.push : winner.style === 'GRAPPLE' ? tuning().variety.repeatBias.grapple : tuning().variety.repeatBias.technique,
    tuning().variety.repeatBias.min,
    tuning().variety.repeatBias.max,
  );

  if (winner.style === 'PUSH' || pushScore >= grappleScore + techScore * 0.2) {
    return {
      coreFamilies: ['PUSH_THRUST', 'TWIST_DOWN'],
      secondaryFamilies: ['FORCE_OUT', 'THROW'],
      versatility,
      trickBias,
      edgeCraft,
      repeatBias,
    };
  }
  if (winner.style === 'GRAPPLE' || grappleScore >= pushScore + techScore * 0.12) {
    return {
      coreFamilies: ['FORCE_OUT', 'THROW'],
      secondaryFamilies: ['TWIST_DOWN', 'TRIP_PICK'],
      versatility,
      trickBias,
      edgeCraft,
      repeatBias,
    };
  }
  return {
    coreFamilies: ['THROW', 'TWIST_DOWN', 'TRIP_PICK'],
    secondaryFamilies: ['BACKWARD_BODY_DROP', 'REAR'],
    versatility,
    trickBias,
    edgeCraft,
    repeatBias,
  };
};

const resolveTargetUniqueCount = (
  winner: KimariteCompetitorProfile,
  profile: KimariteVarietyProfile,
): number => {
  const totalWins = Object.values(winner.historyCounts ?? {}).reduce((sum, count) => sum + count, 0);
  const base =
    winner.style === 'PUSH' ? 10 :
      winner.style === 'GRAPPLE' ? 14 :
        18;
  const growth = Math.min(14, totalWins / 18);
  return Math.round(base + growth * (0.55 + profile.versatility * 0.45) + profile.trickBias * 8);
};

const resolvePatternWeights = (
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
  profile: KimariteVarietyProfile,
  forcePattern?: KimaritePattern,
): Array<{ pattern: KimaritePattern; weight: number }> => {
  if (forcePattern) {
    return [{ pattern: forcePattern, weight: 1 }];
  }

  const heightDiff = winner.heightCm - loser.heightCm;
  const weightDiff = winner.weightKg - loser.weightKg;
  const patterns: Array<{ pattern: KimaritePattern; weight: number }> = [
    {
      pattern: 'PUSH_ADVANCE',
      weight:
        (winner.style === 'PUSH' ? 2.8 : 0.8) +
        normalizeStat(winner.stats, 'oshi') +
        normalizeStat(winner.stats, 'tsuki'),
    },
    {
      pattern: 'BELT_FORCE',
      weight:
        (winner.style === 'GRAPPLE' ? 2.8 : 0.75) +
        normalizeStat(winner.stats, 'kumi') +
        normalizeStat(winner.stats, 'koshi') +
        (weightDiff >= 0 ? 0.4 : 0),
    },
    {
      pattern: 'THROW_EXCHANGE',
      weight:
        (winner.style === 'TECHNIQUE' ? 2.4 : 1.1) +
        normalizeStat(winner.stats, 'nage') +
        normalizeStat(winner.stats, 'waza'),
    },
    {
      pattern: 'PULL_DOWN',
      weight:
        0.5 +
        (winner.bodyType === 'SOPPU' ? 0.4 : 0) +
        (winner.style === 'PUSH' ? 0.55 : 0.22) +
        normalizeStat(winner.stats, 'waza') * 0.35,
    },
    {
      pattern: 'REAR_CONTROL',
      weight: 0.12 + profile.versatility * 0.32 + (heightDiff >= 4 ? 0.12 : 0),
    },
    {
      pattern: 'EDGE_REVERSAL',
      weight: 0.18 + profile.edgeCraft * 1.6 + (weightDiff < -10 ? 0.28 : 0),
    },
    {
      pattern: 'LEG_TRIP_PICK',
      weight:
        0.12 +
        profile.trickBias * 1.45 +
        (winner.style === 'TECHNIQUE' ? 0.35 : 0) +
        (winner.bodyType === 'SOPPU' ? 0.1 : 0),
    },
    {
      pattern: 'BACKWARD_ARCH',
      weight:
        0.01 +
        profile.trickBias * 0.14 +
        profile.edgeCraft * 0.14 +
        (winner.bodyType === 'SOPPU' ? 0.08 : 0),
    },
  ];
  return patterns.filter((entry) => entry.weight > 0.01);
};

const resolveNoveltyMultiplier = (
  entry: OfficialKimariteEntry,
  winner: KimariteCompetitorProfile,
  targetUniqueCount: number,
): number => {
  const historyCounts = winner.historyCounts ?? {};
  const officialUniqueCount = Object.entries(historyCounts).filter(
    ([move, count]) => count > 0 && isOfficialWinningKimarite(move),
  ).length;
  const currentCount = historyCounts[entry.name] ?? 0;
  if (currentCount === 0 && officialUniqueCount < targetUniqueCount) {
    return tuning().novelty.earlyUniqueBoost;
  }
  if (currentCount === 0) {
    return tuning().novelty.unseenBoost;
  }
  return clamp(1 / Math.pow(1 + currentCount * tuning().novelty.repeatScale, tuning().novelty.repeatPow), tuning().novelty.repeatMin, 1);
};

const resolveFamilyFit = (
  entry: OfficialKimariteEntry,
  profile: KimariteVarietyProfile,
): number => {
  if (profile.coreFamilies.includes(entry.family)) return tuning().family.core;
  if (profile.secondaryFamilies.includes(entry.family)) return tuning().family.secondary;
  if (entry.rarityBucket === 'COMMON') return tuning().family.commonOther;
  return tuning().family.rareOther;
};

const resolvePreferredMoveFit = (
  entry: OfficialKimariteEntry,
  preferredMove?: string,
): number => {
  if (!preferredMove || !entry.signatureEligible) return 1;
  const preferred = findOfficialKimariteEntry(preferredMove);
  if (!preferred) return 1;
  return preferred.name === entry.name ? tuning().preferredMoveMatch : 1;
};

const resolveNonTechniqueChance = (
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
): number => {
  const weightDiff = winner.weightKg - loser.weightKg;
  let chance = tuning().nonTechnique.baseChance;
  if (weightDiff < -18) chance += tuning().nonTechnique.underweightBonus;
  if (winner.traits.includes('ARAWAZASHI')) chance += tuning().nonTechnique.arawazashiBonus;
  return clamp(chance, 0, tuning().nonTechnique.maxChance);
};

const selectNonTechnique = (rng: RandomSource): KimariteOutcomeResolution => {
  const entries = NON_TECHNIQUE_CATALOG.filter((entry) => entry.name !== '不戦');
  const picked = weightedPick(
    entries.map((entry) => ({
      value: entry,
      weight:
        entry.name === '反則'
          ? 0.04
          : entry.name === '踏み出し'
            ? 0.18
            : 1,
    })),
    rng,
  );
  return {
    kimarite: picked.name,
    pattern: 'NON_TECHNIQUE',
    rarityBucket: picked.rarityBucket,
    isNonTechnique: true,
  };
};

export const inferBodyTypeFromMetrics = (
  heightCm: number,
  weightKg: number,
): BodyType => {
  if (weightKg >= 158) return 'ANKO';
  if (heightCm >= 188 && weightKg <= 130) return 'SOPPU';
  if (weightKg >= 148) return 'MUSCULAR';
  return 'NORMAL';
};

export const summarizeKimariteUsage = (
  kimariteTotal: Record<string, number> | undefined,
): KimariteUsageSummary => {
  const entries = Object.entries(kimariteTotal ?? {}).filter(([, count]) => count > 0);
  if (!entries.length) {
    return {
      officialUniqueCount: 0,
      nonTechniqueUniqueCount: 0,
      top1MoveShare: 0,
      top3MoveShare: 0,
      rareMoveRate: 0,
      extremeMoveRate: 0,
      rareOrExtremeUniqueCount: 0,
    };
  }

  const sorted = entries.slice().sort((left, right) => right[1] - left[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  let officialUniqueCount = 0;
  let nonTechniqueUniqueCount = 0;
  let rareCount = 0;
  let extremeCount = 0;
  let rareOrExtremeUniqueCount = 0;
  const familyWeights = new Map<KimariteFamily, number>();

  for (const [move, count] of entries) {
    const official = findOfficialKimariteEntry(move);
    if (official) {
      officialUniqueCount += 1;
      familyWeights.set(official.family, (familyWeights.get(official.family) ?? 0) + count);
      if (official.rarityBucket === 'RARE') {
        rareCount += count;
        rareOrExtremeUniqueCount += 1;
      } else if (official.rarityBucket === 'EXTREME') {
        extremeCount += count;
        rareOrExtremeUniqueCount += 1;
      }
      continue;
    }
    if (findNonTechniqueEntry(move)) {
      nonTechniqueUniqueCount += 1;
    }
  }

  const dominantFamily = [...familyWeights.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return {
    officialUniqueCount,
    nonTechniqueUniqueCount,
    top1MoveShare: sorted[0][1] / total,
    top3MoveShare: sorted.slice(0, 3).reduce((sum, [, count]) => sum + count, 0) / total,
    rareMoveRate: rareCount / total,
    extremeMoveRate: extremeCount / total,
    rareOrExtremeUniqueCount,
    dominantFamily,
  };
};

export const resolveKimariteOutcome = (input: {
  winner: KimariteCompetitorProfile;
  loser: KimariteCompetitorProfile;
  rng?: RandomSource;
  forcePattern?: KimaritePattern;
  allowNonTechnique?: boolean;
}): KimariteOutcomeResolution => {
  const rng = input.rng ?? Math.random;
  if (input.allowNonTechnique && rng() < resolveNonTechniqueChance(input.winner, input.loser)) {
    return selectNonTechnique(rng);
  }

  const profile = resolveVarietyProfile(input.winner);
  const targetUniqueCount = resolveTargetUniqueCount(input.winner, profile);
  const patternWeights = resolvePatternWeights(
    input.winner,
    input.loser,
    profile,
    input.forcePattern,
  );
  const pattern = weightedPick(
    patternWeights.map((entry) => ({ value: entry.pattern, weight: entry.weight })),
    rng,
  );

  const candidates: KimariteCandidate[] = OFFICIAL_WIN_KIMARITE_82.flatMap((entry) => {
    if (!entry.requiredPatterns.includes(pattern)) return [];
    const bodyFit = resolveBodyFit(entry, input.winner, input.loser);
    if (bodyFit <= 0) return [];
    let weight =
      entry.historicalWeight *
      resolveStyleFit(entry, input.winner.style) *
      resolveStatFit(entry, input.winner.stats) *
      resolveTraitFit(entry, input.winner.traits) *
      resolveFamilyFit(entry, profile) *
      resolvePreferredMoveFit(entry, input.winner.preferredMove) *
      bodyFit *
      resolveNoveltyMultiplier(entry, input.winner, targetUniqueCount);

    if (entry.rarityBucket === 'RARE') {
      weight *= 1 + profile.trickBias * tuning().rarity.rareTrickScale;
    } else if (entry.rarityBucket === 'EXTREME') {
      weight *= tuning().rarity.extremeBase + profile.trickBias * tuning().rarity.extremeTrickScale + profile.edgeCraft * tuning().rarity.extremeEdgeScale;
      weight = Math.max(weight, entry.floorRate * 10000);
    }

    if (input.winner.historyCounts?.[entry.name]) {
      weight *= clamp(1 - (input.winner.historyCounts[entry.name] ?? 0) * profile.repeatBias * tuning().repeatPenalty.perCount, tuning().repeatPenalty.min, 1);
    }

    if (weight <= 0) return [];
    return [{ entry, weight }];
  });

  const safeCandidates = candidates.length
    ? candidates
    : OFFICIAL_WIN_KIMARITE_82
      .filter((entry) => entry.requiredPatterns.includes(pattern))
      .map((entry) => ({ entry, weight: Math.max(entry.floorRate * 10000, 1) }));

  if (!safeCandidates.length) {
    pushSelectionWarning(`resolveKimariteOutcome: no candidates for pattern=${pattern}`);
    return {
      kimarite: '押し出し',
      pattern,
      rarityBucket: 'COMMON',
      isNonTechnique: false,
    };
  }

  const picked = weightedPick(
    safeCandidates.map((entry) => ({ value: entry.entry, weight: entry.weight })),
    rng,
  );

  return {
    kimarite: picked.name,
    pattern,
    rarityBucket: picked.rarityBucket,
    isNonTechnique: false,
  };
};

export const listOfficialKimariteMetricsCatalog = (): OfficialWinningKimariteCatalogEntry[] =>
  OFFICIAL_WIN_KIMARITE_82.map((entry) => ({
    officialOrder: entry.officialOrder,
    name: entry.name,
    class: entry.class,
    family: entry.family,
    rarityBucket: entry.rarityBucket,
    tags: [...entry.tags],
  }));
