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

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sumStats = (stats: Partial<Record<StatKey, number>>, keys: StatKey[]): number =>
  keys.reduce((sum, key) => sum + (stats[key] ?? 0), 0);

const weightedPick = <T>(
  entries: Array<{ weight: number; value: T }>,
  rng: RandomSource,
): T => {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return entries[0].value;
  let roll = rng() * total;
  for (const entry of entries) {
    roll -= Math.max(0, entry.weight);
    if (roll <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

const normalizeStat = (stats: Partial<Record<StatKey, number>>, key: StatKey): number =>
  clamp((stats[key] ?? 50) / 100, 0.15, 1.8);

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
  if (preferred?.includes(winner.bodyType)) score += 0.28;
  if (weightDiff >= 18 && (entry.tags.includes('lift') || entry.family === 'FORCE_OUT')) score += 0.18;
  if (winner.bodyType === 'SOPPU' && entry.rarityBucket !== 'COMMON') score += 0.12;
  return score;
};

const resolveStyleFit = (
  entry: OfficialKimariteEntry,
  winnerStyle: KimariteStyle,
): number => {
  if (entry.primaryStyle === winnerStyle) return 1.45;
  if (entry.secondaryStyle === winnerStyle) return 1.18;
  if (winnerStyle === 'BALANCE') return 1;
  return 0.72;
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
  return 0.7 + weighted / Math.max(1, affinity.length);
};

const resolveTraitFit = (
  entry: OfficialKimariteEntry,
  traits: Trait[],
): number => {
  const matches = entry.traitTags.filter((trait) => traits.includes(trait)).length;
  return 1 + matches * 0.16;
};

const resolveVarietyProfile = (
  winner: KimariteCompetitorProfile,
): KimariteVarietyProfile => {
  const pushScore = sumStats(winner.stats, ['tsuki', 'oshi', 'deashi']);
  const grappleScore = sumStats(winner.stats, ['kumi', 'koshi', 'power']);
  const techScore = sumStats(winner.stats, ['waza', 'nage', 'deashi']);
  const versatility = clamp((techScore + sumStats(winner.stats, ['deashi'])) / 280, 0.25, 1.25);
  const trickBias = clamp(
    (winner.traits.includes('ARAWAZASHI') ? 0.32 : 0) +
      (winner.traits.includes('READ_THE_BOUT') ? 0.22 : 0) +
      (winner.style === 'TECHNIQUE' ? 0.18 : 0) +
      (winner.bodyType === 'SOPPU' ? 0.08 : 0),
    0,
    0.95,
  );
  const edgeCraft = clamp(
    (winner.traits.includes('DOHYOUGIWA_MAJUTSU') ? 0.36 : 0) +
      (winner.traits.includes('CLUTCH_REVERSAL') ? 0.26 : 0) +
      normalizeStat(winner.stats, 'waza') * 0.12,
    0,
    1,
  );
  const repeatBias = clamp(
    winner.style === 'PUSH' ? 0.82 : winner.style === 'GRAPPLE' ? 0.72 : 0.58,
    0.45,
    0.88,
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
    return 1.7;
  }
  if (currentCount === 0) {
    return 1.15;
  }
  return clamp(1 / Math.pow(1 + currentCount * 0.22, 0.85), 0.18, 1);
};

const resolveFamilyFit = (
  entry: OfficialKimariteEntry,
  profile: KimariteVarietyProfile,
): number => {
  if (profile.coreFamilies.includes(entry.family)) return 1.28;
  if (profile.secondaryFamilies.includes(entry.family)) return 1.08;
  if (entry.rarityBucket === 'COMMON') return 0.7;
  return 0.86;
};

const resolvePreferredMoveFit = (
  entry: OfficialKimariteEntry,
  preferredMove?: string,
): number => {
  if (!preferredMove || !entry.signatureEligible) return 1;
  const preferred = findOfficialKimariteEntry(preferredMove);
  if (!preferred) return 1;
  return preferred.name === entry.name ? 2.8 : 1;
};

const resolveNonTechniqueChance = (
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
): number => {
  const weightDiff = winner.weightKg - loser.weightKg;
  let chance = 0.0012;
  if (weightDiff < -18) chance += 0.0005;
  if (winner.traits.includes('ARAWAZASHI')) chance += 0.0003;
  return clamp(chance, 0, 0.003);
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
      weight *= 1 + profile.trickBias * 0.65;
    } else if (entry.rarityBucket === 'EXTREME') {
      weight *= 0.2 + profile.trickBias * 0.6 + profile.edgeCraft * 0.35;
      weight = Math.max(weight, entry.floorRate * 10000);
    }

    if (input.winner.historyCounts?.[entry.name]) {
      weight *= clamp(1 - (input.winner.historyCounts[entry.name] ?? 0) * profile.repeatBias * 0.04, 0.1, 1);
    }

    if (weight <= 0) return [];
    return [{ entry, weight }];
  });

  const safeCandidates = candidates.length
    ? candidates
    : OFFICIAL_WIN_KIMARITE_82
      .filter((entry) => entry.requiredPatterns.includes(pattern))
      .map((entry) => ({ entry, weight: Math.max(entry.floorRate * 10000, 1) }));

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
