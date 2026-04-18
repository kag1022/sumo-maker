import type { BodyType, RikishiStatus, Trait, WinRoute } from '../models';
import type { RandomSource } from '../simulation/deps';
import {
  type KimariteFamily,
  type KimariteContextTag,
  type KimaritePattern,
  type KimariteRarityBucket,
  type KimariteStyle,
  type OfficialKimariteEntry,
  type OfficialWinningKimariteCatalogEntry,
  findOfficialKimariteEntry,
  findNonTechniqueEntry,
  NON_TECHNIQUE_CATALOG,
  OFFICIAL_WIN_KIMARITE_82,
} from './catalog';
import {
  type BoutEngagement,
  resolveBoutEngagement,
  resolveEngagementPatternFit,
} from './engagement';
import { inferWinRouteFromMove, routeToPattern } from './repertoire';
import type { KimariteBoutContext, KimariteCompetitorProfile } from './selection.types';
import {
  resolveLoserFieldPenalty,
  resolveStyleSignatureFit,
} from './styleSignatureMoves';

export type { KimariteBoutContext, KimariteCompetitorProfile } from './selection.types';

type StatKey = keyof RikishiStatus['stats'];

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
  route?: WinRoute;
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
  signatureMoveBoost: number;
  loserWeakMatchBonus: number;
  loserStrongMatchPenalty: number;
  dominance: {
    dominantMainBoost: number;
    dominantRareDamp: number;
    closeBoutEdgeBoost: number;
    closeBoutTechniqueBoost: number;
    upsetRareBoost: number;
    upsetTrickBoost: number;
  };
  drama: {
    titleDeciderRareMult: number;
    titleDeciderExtremeMult: number;
    kinboshiRareMult: number;
    kinboshiTrickMult: number;
  };
  nonTechnique: {
    baseChance: number;
    underweightBonus: number;
    arawazashiBonus: number;
    conditionGapBonus: number;
    loserExhaustedBonus: number;
    upsetPressBonus: number;
    maxChance: number;
  };
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
      versatilityMax: 0.9,
      versatilityDivider: 360,
      trickBiasMax: 0.66,
      edgeCraftMax: 1,
      repeatBias: { push: 0.98, grapple: 0.9, technique: 0.78, min: 0.62, max: 1.02 },
    },
    novelty: { earlyUniqueBoost: 1.1, unseenBoost: 0.58, repeatScale: 0.34, repeatPow: 1.08, repeatMin: 0.08 },
    family: { core: 1.34, secondary: 1.1, commonOther: 0.64, rareOther: 0.74 },
    preferredMoveMatch: 2.8,
    signatureMoveBoost: 1.6,
    loserWeakMatchBonus: 1.25,
    loserStrongMatchPenalty: 0.8,
    dominance: {
      dominantMainBoost: 1.3,
      dominantRareDamp: 0.4,
      closeBoutEdgeBoost: 1.5,
      closeBoutTechniqueBoost: 1.25,
      upsetRareBoost: 1.8,
      upsetTrickBoost: 1.35,
    },
    drama: {
      titleDeciderRareMult: 2.0,
      titleDeciderExtremeMult: 2.2,
      kinboshiRareMult: 1.8,
      kinboshiTrickMult: 1.35,
    },
    nonTechnique: {
      baseChance: 0.0012,
      underweightBonus: 0.0005,
      arawazashiBonus: 0.0003,
      conditionGapBonus: 0.004,
      loserExhaustedBonus: 0.003,
      upsetPressBonus: 0.0025,
      maxChance: 0.012,
    },
    rarity: { rareTrickScale: 0.28, extremeBase: 0.06, extremeTrickScale: 0.26, extremeEdgeScale: 0.14 },
    repeatPenalty: { perCount: 0.08, min: 0.05 },
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
      versatilityMax: 1,
      versatilityDivider: 340,
      trickBiasMax: 0.74,
      edgeCraftMax: 1,
      repeatBias: { push: 0.9, grapple: 0.82, technique: 0.72, min: 0.58, max: 0.98 },
    },
    novelty: { earlyUniqueBoost: 1.16, unseenBoost: 0.66, repeatScale: 0.3, repeatPow: 1.02, repeatMin: 0.1 },
    family: { core: 1.26, secondary: 1.08, commonOther: 0.7, rareOther: 0.8 },
    preferredMoveMatch: 2.35,
    signatureMoveBoost: 1.5,
    loserWeakMatchBonus: 1.2,
    loserStrongMatchPenalty: 0.84,
    dominance: {
      dominantMainBoost: 1.22,
      dominantRareDamp: 0.55,
      closeBoutEdgeBoost: 1.6,
      closeBoutTechniqueBoost: 1.3,
      upsetRareBoost: 1.9,
      upsetTrickBoost: 1.4,
    },
    drama: {
      titleDeciderRareMult: 2.1,
      titleDeciderExtremeMult: 2.4,
      kinboshiRareMult: 1.9,
      kinboshiTrickMult: 1.4,
    },
    nonTechnique: {
      baseChance: 0.0013,
      underweightBonus: 0.0005,
      arawazashiBonus: 0.00035,
      conditionGapBonus: 0.0045,
      loserExhaustedBonus: 0.0032,
      upsetPressBonus: 0.0027,
      maxChance: 0.014,
    },
    rarity: { rareTrickScale: 0.34, extremeBase: 0.08, extremeTrickScale: 0.32, extremeEdgeScale: 0.18 },
    repeatPenalty: { perCount: 0.065, min: 0.08 },
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

const BODY_STRICT_MIN_WEIGHT_DIFF = 15;
const BODY_STRICT_MIN_POWER = 65;
const BODY_STRICT_PENALTY = 0.1;

const resolveBodyFit = (
  entry: OfficialKimariteEntry,
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
  dominance: number,
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

  const isLiftMove = entry.tags.includes('lift') || entry.name === 'つり出し' || entry.name === 'つり落とし';
  if (isLiftMove) {
    const power = winner.stats.power ?? 50;
    if (weightDiff < BODY_STRICT_MIN_WEIGHT_DIFF || power < BODY_STRICT_MIN_POWER) {
      score *= BODY_STRICT_PENALTY;
    }
  }

  if (entry.name === 'うっちゃり' || entry.name === '居反り') {
    if (weightDiff > 0 && dominance >= 0.3) {
      score *= 0.35;
    } else if (weightDiff <= 0) {
      score *= 1.35;
    }
  }

  if (entry.name === '肩透かし' || entry.name === '引き落とし') {
    if (heightDiff >= 5) score *= 1.25;
  }

  if (entry.name === '押し出し') {
    if (dominance >= 0) score *= 1.14;
    if (weightDiff >= 0) score *= 1.12;
  }

  if (entry.name === '寄り倒し') {
    if (dominance < 0.25) score *= 0.42;
    else if (dominance >= 0.6) score *= 1.1;
  }

  if (entry.name === '押し倒し' || entry.name === '突き倒し') {
    if (dominance < 0.18) score *= 0.58;
    else if (dominance >= 0.55) score *= 1.08;
  }

  if (entry.name === '突き出し') {
    if (heightDiff < 4 && winner.traits.includes('LONG_REACH') === false) score *= 0.28;
    else if (heightDiff >= 6 || winner.traits.includes('LONG_REACH')) score *= 1.15;
  }

  if (entry.name === '小手投げ' || entry.name === 'とったり') {
    const kumi = winner.stats.kumi ?? 50;
    const waza = winner.stats.waza ?? 50;
    if (kumi < 65 && waza < 65) score *= 0.45;
  }

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
    winner.style === 'PUSH' ? 6 :
      winner.style === 'GRAPPLE' ? 9 :
        12;
  const growth = Math.min(8, totalWins / 28);
  return Math.round(base + growth * (0.35 + profile.versatility * 0.25) + profile.trickBias * 3);
};

interface KimariteHistorySummary {
  officialUniqueCount: number;
  familyUniqueCounts: Partial<Record<KimariteFamily, number>>;
  patternUniqueCounts: Partial<Record<KimaritePattern, number>>;
}

const PRIMARY_STYLE_PATTERNS: Record<KimariteStyle, KimaritePattern[]> = {
  PUSH: ['PUSH_ADVANCE', 'PULL_DOWN'],
  GRAPPLE: ['BELT_FORCE', 'THROW_EXCHANGE'],
  TECHNIQUE: ['THROW_EXCHANGE', 'PULL_DOWN', 'LEG_TRIP_PICK'],
  BALANCE: ['PUSH_ADVANCE', 'BELT_FORCE', 'THROW_EXCHANGE', 'PULL_DOWN'],
};

const buildHistorySummary = (
  winner: KimariteCompetitorProfile,
): KimariteHistorySummary => {
  const familyUniqueCounts: Partial<Record<KimariteFamily, number>> = {};
  const patternUniqueCounts: Partial<Record<KimaritePattern, number>> = {};
  let officialUniqueCount = 0;

  for (const [move, count] of Object.entries(winner.historyCounts ?? {})) {
    if (count <= 0) continue;
    const entry = findOfficialKimariteEntry(move);
    if (!entry) continue;
    officialUniqueCount += 1;
    familyUniqueCounts[entry.family] = (familyUniqueCounts[entry.family] ?? 0) + 1;
    entry.requiredPatterns.forEach((pattern) => {
      patternUniqueCounts[pattern] = (patternUniqueCounts[pattern] ?? 0) + 1;
    });
  }

  return {
    officialUniqueCount,
    familyUniqueCounts,
    patternUniqueCounts,
  };
};

const resolveIdentityPatternFit = (
  pattern: KimaritePattern,
  winner: KimariteCompetitorProfile,
): number => {
  let fit = 1;
  const applyStyleFit = (style: KimariteStyle | undefined, bonus: number): void => {
    if (!style) return;
    if (PRIMARY_STYLE_PATTERNS[style].includes(pattern)) fit *= bonus;
  };

  applyStyleFit(winner.designedPrimaryStyle, 1.18);
  applyStyleFit(winner.designedSecondaryStyle, 1.08);
  applyStyleFit(winner.designedSecretStyle, 1.05);

  if (winner.kataSettled && winner.preferredMove) {
    const preferred = findOfficialKimariteEntry(winner.preferredMove);
    if (preferred?.requiredPatterns.includes(pattern)) fit *= 1.52;
    else fit *= 0.78;
  }

  return fit;
};

const resolveContextTagAccess = (
  tags: KimariteContextTag[],
  winner: KimariteCompetitorProfile,
  context?: KimariteBoutContext,
): boolean => {
  if (!tags.length) return true;
  const weightDiff = context?.weightDiff ?? 0;
  return tags.every((tag) => {
    if (tag === 'EDGE') return Boolean(context?.isEdgeCandidate);
    if (tag === 'REAR') return Boolean(context?.isHighPressure || context?.isLastDay);
    if (tag === 'UNDERDOG') return Boolean(context?.isUnderdog);
    if (tag === 'ARAWAZASHI_ONLY') {
      return winner.traits.includes('ARAWAZASHI') || winner.style === 'TECHNIQUE';
    }
    if (tag === 'SOPPU_ONLY') return winner.bodyType === 'SOPPU';
    if (tag === 'HEAVY_ONLY') return weightDiff >= 0;
    if (tag === 'BELT_ONLY') {
      return winner.style === 'GRAPPLE' || normalizeStat(winner.stats, 'kumi') >= 0.72 || normalizeStat(winner.stats, 'koshi') >= 0.72;
    }
    return true;
  });
};

/**
 * engagement 経由で requiredPatterns 外のエントリが候補入りするケース専用の
 * 「家族別アクセスゲート」。catalog.contextTags は MAIN 役には空配列として
 * 入っているため、engagement 越境で送り出し・肩透かしなどを無制限に通さない
 * よう、家族属性から逆引きで最低限の文脈要件を課す。
 */
const resolveCrossPatternFamilyGate = (
  entry: OfficialKimariteEntry,
  winner: KimariteCompetitorProfile,
  context: KimariteBoutContext | undefined,
): boolean => {
  const nage = winner.stats.nage ?? 50;
  const waza = winner.stats.waza ?? 50;
  const kumi = winner.stats.kumi ?? 50;
  // REAR 系（送り出し etc）は「相手の後ろに回る」必要がある → 実戦的には
  // 高圧/千秋楽/READ_THE_BOUT 持ちに限定。
  if (entry.family === 'REAR') {
    return Boolean(
      context?.isHighPressure ||
      context?.isLastDay ||
      winner.traits.includes('READ_THE_BOUT') ||
      winner.style === 'TECHNIQUE',
    );
  }
  // 土俵際系は EDGE_SCRAMBLE か edge candidate のときだけ許容。
  if (entry.family === 'BACKWARD_BODY_DROP') {
    return Boolean(context?.isEdgeCandidate);
  }
  // 足取り系は TECHNIQUE/ARAWAZASHI/SOPPU の実装者に限定。
  if (entry.family === 'TRIP_PICK') {
    return (
      winner.style === 'TECHNIQUE' ||
      winner.traits.includes('ARAWAZASHI') ||
      winner.bodyType === 'SOPPU'
    );
  }
  // 投げ系は nage/waza が十分（>= 62）な GRAPPLE/TECHNIQUE 主体。
  // PUSH 専門（低 nage）が engagement=MIXED/BELT で throw を拾わないようにする。
  if (entry.family === 'THROW') {
    if (winner.style === 'GRAPPLE' || winner.style === 'TECHNIQUE') return true;
    return nage >= 62 || waza >= 68;
  }
  // 寄り・極め系は kumi/koshi が一定以上。PUSH が突進で BELT 決まり手を拾うのを抑制。
  if (entry.family === 'FORCE_OUT') {
    if (winner.style === 'GRAPPLE' || winner.style === 'BALANCE' || winner.style === 'TECHNIQUE') return true;
    return kumi >= 60;
  }
  // 押し・突き系（押し出し、突き出し、押し倒し、突き倒し）は tsuki/oshi が一定以上。
  // GRAPPLE 専門（低 tsuki/oshi）が engagement=BELT で PUSH 決まり手を拾わないようにする。
  if (entry.family === 'PUSH_THRUST') {
    if (winner.style === 'PUSH' || winner.style === 'BALANCE') return true;
    const tsuki = winner.stats.tsuki ?? 50;
    const oshi = winner.stats.oshi ?? 50;
    return tsuki >= 65 || oshi >= 65;
  }
  // 引き落とし・肩透かし・はたき込み系は TECHNIQUE または push/waza 持ち。
  // GRAPPLE 専門が pull-down 系を engagement 越境で拾わないようにする。
  if (entry.family === 'TWIST_DOWN') {
    if (winner.style === 'PUSH' || winner.style === 'TECHNIQUE' || winner.style === 'BALANCE') return true;
    const tsuki = winner.stats.tsuki ?? 50;
    const oshi = winner.stats.oshi ?? 50;
    return tsuki >= 60 || oshi >= 60 || waza >= 65;
  }
  return true;
};

const resolvePatternRoleFit = (
  entry: OfficialKimariteEntry,
  winner: KimariteCompetitorProfile,
  context: KimariteBoutContext | undefined,
  forcePattern: KimaritePattern | undefined,
  pattern: KimaritePattern,
): number => {
  if (forcePattern) return 1;
  // エントリの requiredPatterns に pattern が含まれているとき、そのパターンにおける
  // エントリの役割（MAIN / ALT / CONTEXT / RARE）に応じた重みを返す。
  // 含まれていない（＝ engagement 経由で混入してきた場合）は、役割に関係なく
  // 家族別の crossPatternGate と contextTags の両方を課して過剰漏洩を抑える。
  const patternInRole = entry.requiredPatterns.includes(pattern);
  if (!patternInRole) {
    if (!resolveCrossPatternFamilyGate(entry, winner, context)) return 0;
    if (!resolveContextTagAccess(entry.contextTags, winner, context)) return 0;
    if (entry.patternRole === 'MAIN') return 0.6;
    if (entry.patternRole === 'ALT') return 0.36;
    if (entry.patternRole === 'CONTEXT') {
      return winner.style === 'TECHNIQUE' || winner.traits.includes('ARAWAZASHI') ? 0.28 : 0.16;
    }
    return winner.style === 'TECHNIQUE' && winner.traits.includes('ARAWAZASHI') ? 0.03 : 0.01;
  }
  if (entry.patternRole === 'MAIN') return 2.4;
  if (entry.patternRole === 'ALT') return 0.72;
  if (!resolveContextTagAccess(entry.contextTags, winner, context)) return 0;
  return entry.patternRole === 'CONTEXT'
    ? winner.style === 'TECHNIQUE' || winner.traits.includes('ARAWAZASHI')
      ? 0.38
      : 0.24
    : winner.style === 'TECHNIQUE' && winner.traits.includes('ARAWAZASHI')
      ? 0.04
      : 0.015;
};

const resolvePatternWeights = (
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
  profile: KimariteVarietyProfile,
  context?: KimariteBoutContext,
  forcePattern?: KimaritePattern,
): Array<{ pattern: KimaritePattern; weight: number }> => {
  if (forcePattern) {
    return [{ pattern: forcePattern, weight: 1 }];
  }

  const heightDiff = context?.heightDiff ?? (winner.heightCm - loser.heightCm);
  const weightDiff = context?.weightDiff ?? (winner.weightKg - loser.weightKg);
  const hasArawazashi = winner.traits.includes('ARAWAZASHI');
  const hasRearCraft = winner.traits.includes('READ_THE_BOUT');
  const edgeUnlocked = Boolean(context?.isEdgeCandidate && (profile.edgeCraft >= 0.16 || winner.traits.includes('DOHYOUGIWA_MAJUTSU') || winner.traits.includes('CLUTCH_REVERSAL')));
  const rearUnlocked = Boolean(
    (
      context?.isHighPressure ||
      context?.isLastDay ||
      context?.engagement?.phase === 'MIXED' ||
      context?.engagement?.phase === 'EDGE_SCRAMBLE' ||
      context?.engagement?.phase === 'QUICK_COLLAPSE' ||
      normalizeStat(winner.stats, 'deashi') >= 0.7
    ) && (
      hasRearCraft ||
      winner.style === 'TECHNIQUE' ||
      normalizeStat(winner.stats, 'waza') >= 0.72 ||
      normalizeStat(winner.stats, 'deashi') >= 0.82
    ),
  );
  const tripUnlocked = Boolean(
    winner.style === 'TECHNIQUE'
      ? hasArawazashi || profile.trickBias >= 0.2
      : hasArawazashi && Boolean(context?.isHighPressure || context?.isEdgeCandidate),
  );
  const archUnlocked = Boolean((context?.isEdgeCandidate || context?.isHighPressure) && winner.bodyType === 'SOPPU' && hasArawazashi);

  const availability: Record<KimaritePattern, number> = {
    PUSH_ADVANCE:
      winner.style === 'PUSH'
        ? 1
        : winner.style === 'BALANCE'
          ? 0.76
          : winner.style === 'GRAPPLE'
            ? 0.4
            : 0.28,
    BELT_FORCE:
      winner.style === 'GRAPPLE'
        ? 1
        : winner.style === 'PUSH'
          ? 0.24
          : winner.style === 'TECHNIQUE'
            ? 0.28
            : 0.6,
    THROW_EXCHANGE:
      winner.style === 'TECHNIQUE'
        ? 0.7
        : winner.style === 'GRAPPLE'
          ? 0.38
          : winner.style === 'PUSH'
            ? 0.05
            : 0.42,
    PULL_DOWN:
      winner.style === 'PUSH'
        ? 0.96
        : winner.style === 'TECHNIQUE'
          ? 1
          : winner.style === 'GRAPPLE'
            ? 0.22
            : 0.55,
    REAR_CONTROL:
      rearUnlocked
        ? winner.style === 'TECHNIQUE'
          ? 1.05
          : winner.style === 'BALANCE'
            ? 0.58
            : winner.style === 'PUSH'
              ? 0.32
              : 0.2
        : 0,
    EDGE_REVERSAL: edgeUnlocked ? (winner.style === 'TECHNIQUE' ? 0.52 : 0.22) : 0,
    LEG_TRIP_PICK: tripUnlocked ? (winner.style === 'TECHNIQUE' ? 0.48 : 0.12) : 0,
    BACKWARD_ARCH: archUnlocked ? 0.2 : 0,
    NON_TECHNIQUE: 0,
  };

  const dominance = clamp(context?.dominance ?? 0, -1, 1);
  const isDominantWin = dominance >= 0.5;
  const isCloseBout = Math.abs(dominance) < 0.2;
  const isUpset = dominance < -0.2;
  const dom = tuning().dominance;

  const mainPatternMult = isDominantWin ? dom.dominantMainBoost : 1;
  const rareDampMult = isDominantWin ? dom.dominantRareDamp : 1;
  const edgeCloseMult = isCloseBout ? dom.closeBoutEdgeBoost : 1;
  const techCloseMult = isCloseBout ? dom.closeBoutTechniqueBoost : 1;
  const upsetRareMult = isUpset ? dom.upsetRareBoost : 1;
  const upsetTrickMult = isUpset ? dom.upsetTrickBoost : 1;

  const patternDominanceMult: Record<KimaritePattern, number> = {
    PUSH_ADVANCE: mainPatternMult,
    BELT_FORCE: mainPatternMult,
    THROW_EXCHANGE: techCloseMult,
    PULL_DOWN: mainPatternMult * (isCloseBout ? 0.9 : 1),
    REAR_CONTROL: rareDampMult * (isCloseBout ? 1.1 : 1),
    EDGE_REVERSAL: Math.max(edgeCloseMult, upsetRareMult) * rareDampMult,
    LEG_TRIP_PICK: upsetTrickMult * (isCloseBout ? 1.2 : 1) * rareDampMult,
    BACKWARD_ARCH: upsetRareMult * rareDampMult,
    NON_TECHNIQUE: 1,
  };

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
        (winner.style === 'TECHNIQUE' ? 1.55 : winner.style === 'GRAPPLE' ? 0.42 : 0.55) +
        normalizeStat(winner.stats, 'nage') +
        normalizeStat(winner.stats, 'waza'),
    },
    {
      pattern: 'PULL_DOWN',
      weight:
        0.78 +
        (winner.bodyType === 'SOPPU' ? 0.4 : 0) +
        (winner.style === 'PUSH' ? 0.72 : winner.style === 'TECHNIQUE' ? 0.55 : 0.26) +
        normalizeStat(winner.stats, 'waza') * 0.42,
    },
    {
      pattern: 'REAR_CONTROL',
      weight:
        0.5 +
        profile.versatility * 0.55 +
        normalizeStat(winner.stats, 'deashi') * 0.35 +
        (context?.engagement?.phase === 'MIXED' || context?.engagement?.phase === 'EDGE_SCRAMBLE' ? 0.25 : 0) +
        (heightDiff >= 4 ? 0.18 : 0),
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
  return patterns
    .map((entry) => ({
      ...entry,
      weight:
        entry.weight *
        availability[entry.pattern] *
        resolveIdentityPatternFit(entry.pattern, winner) *
        patternDominanceMult[entry.pattern],
    }))
    .filter((entry) => entry.weight > 0.04);
};

const resolveNoveltyMultiplier = (
  entry: OfficialKimariteEntry,
  history: KimariteHistorySummary,
  winner: KimariteCompetitorProfile,
  pattern: KimaritePattern,
  targetUniqueCount: number,
): number => {
  const historyCounts = winner.historyCounts ?? {};
  const currentCount = historyCounts[entry.name] ?? 0;
  const familyUniqueCount = history.familyUniqueCounts[entry.family] ?? 0;
  const patternUniqueCount = history.patternUniqueCounts[pattern] ?? 0;

  if (currentCount === 0 && history.officialUniqueCount < targetUniqueCount) {
    const remainingBudget = Math.max(0, targetUniqueCount - history.officialUniqueCount);
    const roleBase =
      entry.patternRole === 'MAIN'
        ? 1.04
        : entry.patternRole === 'ALT'
          ? 0.58
          : entry.patternRole === 'CONTEXT'
            ? 0.18
            : 0.05;
    const budgetFactor =
      entry.patternRole === 'MAIN'
        ? 1 + (remainingBudget / Math.max(1, targetUniqueCount)) * 0.06
        : 1;
    const saturation =
      entry.patternRole === 'MAIN'
        ? clamp(1 - Math.max(0, familyUniqueCount - 3) * 0.06 - Math.max(0, patternUniqueCount - 2) * 0.05, 0.55, 1)
        : entry.patternRole === 'ALT'
          ? clamp(1 - familyUniqueCount * 0.14 - patternUniqueCount * 0.12, 0.12, 1)
          : entry.patternRole === 'CONTEXT'
            ? clamp(1 - familyUniqueCount * 0.18 - patternUniqueCount * 0.18, 0.08, 1)
            : clamp(1 - familyUniqueCount * 0.24 - patternUniqueCount * 0.22, 0.03, 1);
    return roleBase * budgetFactor * saturation;
  }
  if (currentCount === 0) {
    const overflow = Math.max(0, history.officialUniqueCount - targetUniqueCount);
    const overflowPenalty = clamp(tuning().novelty.unseenBoost - overflow * 0.045, 0.08, tuning().novelty.unseenBoost);
    const rolePenalty =
      entry.patternRole === 'MAIN'
        ? 0.84
        : entry.patternRole === 'ALT'
          ? 0.14
          : entry.patternRole === 'CONTEXT'
            ? 0.035
            : 0.01;
    const saturationPenalty =
      entry.patternRole === 'MAIN'
        ? clamp(1 - Math.max(0, familyUniqueCount - 4) * 0.04, 0.62, 1)
        : clamp(1 - familyUniqueCount * 0.18 - patternUniqueCount * 0.18, 0.04, 1);
    const rarityPenalty =
      entry.rarityBucket === 'COMMON'
        ? 1
        : entry.rarityBucket === 'UNCOMMON'
          ? 0.82
          : entry.rarityBucket === 'RARE'
            ? 0.52
            : 0.18;
    return overflowPenalty * rolePenalty * saturationPenalty * rarityPenalty;
  }
  const repeatFloor = entry.patternRole === 'MAIN' ? 0.2 : tuning().novelty.repeatMin;
  return clamp(1 / Math.pow(1 + currentCount * tuning().novelty.repeatScale, tuning().novelty.repeatPow), repeatFloor, 1);
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
  return preferred.name === entry.name ? tuning().preferredMoveMatch * tuning().signatureMoveBoost : 1;
};

const resolveLoserAffinityFit = (
  entry: OfficialKimariteEntry,
  loser: KimariteCompetitorProfile,
): number => {
  let fit = 1;
  if (loser.weakStyles && loser.weakStyles.length > 0) {
    const weakMatch = resolveStyleSignatureFit(entry.name, loser.weakStyles);
    if (weakMatch > 1) {
      fit *= tuning().loserWeakMatchBonus;
    }
  }
  fit *= resolveLoserFieldPenalty(entry.name, loser.strongStyles);
  return fit;
};

const resolveDramaMultiplier = (
  entry: OfficialKimariteEntry,
  context?: KimariteBoutContext,
): number => {
  if (!context) return 1;
  let mult = 1;
  if (context.isTitleDecider) {
    if (entry.rarityBucket === 'RARE') mult *= tuning().drama.titleDeciderRareMult;
    else if (entry.rarityBucket === 'EXTREME') mult *= tuning().drama.titleDeciderExtremeMult;
  }
  if (context.isKinboshiChance) {
    if (entry.rarityBucket === 'RARE') mult *= tuning().drama.kinboshiRareMult;
    else if (entry.rarityBucket === 'EXTREME') mult *= tuning().drama.kinboshiTrickMult;
    if (entry.family === 'THROW' || entry.family === 'TWIST_DOWN') {
      mult *= 1.1;
    }
  }
  return mult;
};

const resolveNonTechniqueChance = (
  winner: KimariteCompetitorProfile,
  loser: KimariteCompetitorProfile,
  context?: KimariteBoutContext,
): number => {
  const weightDiff = winner.weightKg - loser.weightKg;
  const cfg = tuning().nonTechnique;
  let chance = cfg.baseChance;
  if (weightDiff < -18) chance += cfg.underweightBonus;
  if (winner.traits.includes('ARAWAZASHI')) chance += cfg.arawazashiBonus;
  if (context?.loserExhausted) chance += cfg.loserExhaustedBonus;
  const dominance = context?.dominance ?? 0;
  if (dominance <= -0.35) chance += cfg.upsetPressBonus;
  if (Math.abs(dominance) < 0.12) chance += cfg.conditionGapBonus * 0.5;
  return clamp(chance, 0, cfg.maxChance);
};

const selectNonTechnique = (
  rng: RandomSource,
  context?: KimariteBoutContext,
): KimariteOutcomeResolution => {
  const entries = NON_TECHNIQUE_CATALOG.filter((entry) => entry.name !== '不戦');
  const dominance = context?.dominance ?? 0;
  const isUpset = dominance <= -0.35;
  const loserExhausted = Boolean(context?.loserExhausted);
  const picked = weightedPick(
    entries.map((entry) => {
      let weight = 1;
      if (entry.name === '反則') weight = 0.04;
      else if (entry.name === '踏み出し') weight = 0.18 + (isUpset ? 0.4 : 0);
      else if (entry.name === '勇み足') weight = 1 + (isUpset ? 1.6 : 0);
      else if (entry.name === '腰砕け') weight = 1 + (loserExhausted ? 2.0 : 0);
      else if (entry.name === 'つきひざ') weight = 1 + (loserExhausted ? 1.4 : 0);
      else if (entry.name === 'つき手') weight = 1 + (loserExhausted ? 1.4 : 0);
      return { value: entry, weight };
    }),
    rng,
  );
  return {
    kimarite: picked.name,
    pattern: 'NON_TECHNIQUE',
    route: undefined,
    rarityBucket: picked.rarityBucket,
    isNonTechnique: true,
  };
};

const resolveRouteAccess = (
  route: WinRoute,
  winner: KimariteCompetitorProfile,
  context?: KimariteBoutContext,
): boolean => {
  if (route === 'EDGE_REVERSAL') return Boolean(context?.isEdgeCandidate);
  if (route === 'REAR_FINISH') {
    return Boolean(context?.isHighPressure || context?.isLastDay || winner.traits.includes('READ_THE_BOUT'));
  }
  if (route === 'LEG_ATTACK') {
    return Boolean(
      winner.style === 'TECHNIQUE' ||
      winner.traits.includes('ARAWAZASHI') ||
      context?.isUnderdog ||
      winner.bodyType === 'SOPPU',
    );
  }
  return true;
};

const resolveRepertoireFit = (
  entry: OfficialKimariteEntry,
  winner: KimariteCompetitorProfile,
  route: WinRoute | undefined,
  context?: KimariteBoutContext,
): number => {
  if (!winner.repertoire || !route) return 1;
  const routeEntries = winner.repertoire.entries.filter((row) => row.route === route);
  const repEntry = winner.repertoire.entries.find((row) => row.kimarite === entry.name);
  if (repEntry) {
    if (repEntry.route !== route && entry.patternRole !== 'MAIN') return 0;
    if (repEntry.tier === 'PRIMARY') return 4.4 + Math.min(1.4, repEntry.affinity * 0.05);
    if (repEntry.tier === 'SECONDARY') return 2.7 + Math.min(1.1, repEntry.affinity * 0.03);
    if (repEntry.tier === 'CONTEXT') {
      return resolveRouteAccess(route, winner, context) ? 0.56 + Math.min(0.28, repEntry.affinity * 0.015) : 0;
    }
    return resolveRouteAccess(route, winner, context) ? 0.08 + Math.min(0.06, repEntry.affinity * 0.008) : 0;
  }
  if (!resolveRouteAccess(route, winner, context)) return 0;
  if (winner.repertoire.provisional) {
    if (winner.repertoire.primaryRoutes.includes(route)) {
      if (entry.patternRole === 'MAIN') return 0.26;
      if (entry.patternRole === 'ALT') return 0.08;
    }
    if (winner.repertoire.secondaryRoutes.includes(route)) {
      if (entry.patternRole === 'MAIN') return 0.32;
      if (entry.patternRole === 'ALT') return 0.12;
    }
  }
  if (routeEntries.length === 0 && entry.patternRole === 'MAIN') {
    return winner.repertoire.primaryRoutes.includes(route) ? 0.2 : 0;
  }
  if (entry.patternRole === 'MAIN' || entry.patternRole === 'ALT') return 0;
  if (route !== 'EDGE_REVERSAL' && route !== 'REAR_FINISH' && route !== 'LEG_ATTACK') return 0;
  if (entry.patternRole === 'CONTEXT') return resolveContextTagAccess(entry.contextTags, winner, context) ? 0.08 : 0;
  if (entry.patternRole === 'RARE') return resolveContextTagAccess(entry.contextTags, winner, context) ? 0.012 : 0;
  return 0;
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
  allowedRoute?: WinRoute;
  allowNonTechnique?: boolean;
  boutContext?: KimariteBoutContext;
}): KimariteOutcomeResolution => {
  const rng = input.rng ?? Math.random;
  if (input.allowNonTechnique && rng() < resolveNonTechniqueChance(input.winner, input.loser, input.boutContext)) {
    return selectNonTechnique(rng, input.boutContext);
  }

  const profile = resolveVarietyProfile(input.winner);
  const historySummary = buildHistorySummary(input.winner);
  const targetUniqueCount = resolveTargetUniqueCount(input.winner, profile);
  const route = input.allowedRoute;
  const pattern = route
    ? routeToPattern(route)
    : weightedPick(
      resolvePatternWeights(
        input.winner,
        input.loser,
        profile,
        input.boutContext,
        input.forcePattern,
      ).map((entry) => ({ value: entry.pattern, weight: entry.weight })),
      rng,
    );

  const dominance = clamp(input.boutContext?.dominance ?? 0, -1, 1);

  // 取組の「型」を両力士相互作用から確定。候補プールを winner.style だけで絞らず、
  // engagement に整合する technique 全体から選ばせることで 押し出し一極化を解消。
  // forcePattern が来ている場合は呼び出し側が厳密に限定したい意図なので、engagement を上書きしない。
  // battle.ts 側で事前に sample 済み（route 決定と同じ rng 流）の engagement があればそれを流用する。
  const engagement: BoutEngagement = input.forcePattern
    ? { phase: 'MIXED', defenderCollapsed: false, edgeCrisis: false, gripEstablished: false, weightDomination: false }
    : input.boutContext?.engagement
      ?? resolveBoutEngagement(input.winner, input.loser, input.boutContext, rng);

  // historicalWeight を対数圧縮。生の値は 0.01〜24 の 2400 倍差で common 技が常に支配的だった。
  // sqrt 圧縮で 0.1 倍〜5 倍程度の差に収め、style/pattern/novelty 係数が効くようにする。
  const compressHistoricalWeight = (value: number): number => {
    const safe = Math.max(0, value);
    if (safe <= 0) return 0;
    return Math.sqrt(safe);
  };

  const candidates: KimariteCandidate[] = OFFICIAL_WIN_KIMARITE_82.flatMap((entry) => {
    // 旧 hard gate: if (!entry.requiredPatterns.includes(pattern)) return [];
    // 新 soft gate: engagement との適合度をまず計算し、0 なら除外。
    const engagementFit = input.forcePattern
      ? (entry.requiredPatterns.includes(pattern) ? 1 : 0)
      : resolveEngagementPatternFit(entry, engagement);
    if (engagementFit <= 0) return [];

    const bodyFit = resolveBodyFit(entry, input.winner, input.loser, dominance);
    if (bodyFit <= 0) return [];

    // pattern（= winner 由来の「主戦パターン」）との整合は soft boost。
    // 整合するとき 1.0、しない場合 0.55 にディスカウントするだけで、プールからは除外しない。
    const patternFit = entry.requiredPatterns.includes(pattern) ? 1 : 0.55;

    let weight =
      compressHistoricalWeight(entry.historicalWeight) *
      engagementFit *
      patternFit *
      resolveStyleFit(entry, input.winner.style) *
      resolveStatFit(entry, input.winner.stats) *
      resolveTraitFit(entry, input.winner.traits) *
      resolvePatternRoleFit(entry, input.winner, input.boutContext, input.forcePattern, pattern) *
      resolveFamilyFit(entry, profile) *
      resolvePreferredMoveFit(entry, input.winner.preferredMove) *
      resolveRepertoireFit(entry, input.winner, route, input.boutContext) *
      resolveStyleSignatureFit(entry.name, input.winner.strongStyles) *
      resolveLoserAffinityFit(entry, input.loser) *
      resolveDramaMultiplier(entry, input.boutContext) *
      bodyFit *
      resolveNoveltyMultiplier(entry, historySummary, input.winner, pattern, targetUniqueCount);

    if (entry.rarityBucket === 'RARE') {
      weight *= 1 + profile.trickBias * tuning().rarity.rareTrickScale;
    } else if (entry.rarityBucket === 'EXTREME') {
      weight *= tuning().rarity.extremeBase + profile.trickBias * tuning().rarity.extremeTrickScale + profile.edgeCraft * tuning().rarity.extremeEdgeScale;
      if (input.forcePattern) {
        weight = Math.max(weight, entry.floorRate * 10000);
      }
    }

    if (input.winner.historyCounts?.[entry.name]) {
      weight *= clamp(1 - (input.winner.historyCounts[entry.name] ?? 0) * profile.repeatBias * tuning().repeatPenalty.perCount, tuning().repeatPenalty.min, 1);
    }

    if (weight <= 0) return [];
    return [{ entry, weight }];
  });

  if (!candidates.length) {
    // 一次候補プールが空になるのは、forcePattern が NON_TECHNIQUE のように
    // 公式 82 手のどれにも該当しないときや、engagement/body フィルタが全拒否したとき。
    // 以降は engagement 互換プールで救済するが、診断のため警告を残す。
    pushSelectionWarning(
      `resolveKimariteOutcome: no candidates for pattern=${pattern} engagement=${engagement.phase}`,
    );
  }
  const safeCandidates = candidates.length
    ? candidates
    : OFFICIAL_WIN_KIMARITE_82
      .filter((entry) => resolveEngagementPatternFit(entry, engagement) > 0)
      .filter((entry) => resolveBodyFit(entry, input.winner, input.loser, dominance) > 0)
      .map((entry) => ({
        entry,
        weight: Math.max(entry.floorRate * 10000, compressHistoricalWeight(entry.historicalWeight) * resolveEngagementPatternFit(entry, engagement)),
      }));

  if (!safeCandidates.length) {
    // Engagement 互換の候補が全く無いのは異常系。押し出し固定ではなく、
    // engagement に最も近い pattern の中で historicalWeight 比例で拾う。
    pushSelectionWarning(
      `resolveKimariteOutcome: no candidates after fallback (pattern=${pattern} engagement=${engagement.phase})`,
    );
    const fallbackPool = OFFICIAL_WIN_KIMARITE_82
      .map((entry) => ({
        entry,
        weight: compressHistoricalWeight(entry.historicalWeight) * resolveEngagementPatternFit(entry, engagement),
      }))
      .filter((item) => item.weight > 0);
    if (!fallbackPool.length) {
      // 完全フォールバック（engagement 全否定時のみ）: historicalWeight 比で抽選。
      const universalFallback = OFFICIAL_WIN_KIMARITE_82.map((entry) => ({
        entry,
        weight: compressHistoricalWeight(entry.historicalWeight),
      }));
      const picked = weightedPick(
        universalFallback.map((item) => ({ value: item.entry, weight: item.weight })),
        rng,
      );
      return {
        kimarite: picked.name,
        pattern,
        route,
        rarityBucket: picked.rarityBucket,
        isNonTechnique: false,
      };
    }
    const picked = weightedPick(
      fallbackPool.map((item) => ({ value: item.entry, weight: item.weight })),
      rng,
    );
    return {
      kimarite: picked.name,
      pattern,
      route,
      rarityBucket: picked.rarityBucket,
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
    route: route ?? inferWinRouteFromMove(picked.name),
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
    patternRole: entry.patternRole,
    contextTags: [...entry.contextTags],
  }));
