// Applies observation-build biases to a freshly-rolled RikishiStatus.
// Phase 3 (deep bias): in addition to the surface stat/body/growth nudges, this
// now also overrides aptitudeTier, careerBand, retirementProfile, growthType,
// and genome numerics — all via *soft* probability-weight shifts. Result-
// guarantee is impossible by design: every bucket weight is clamped to a
// non-zero floor and a finite ceiling (see clampWeights) so tail outcomes can
// always still happen.
//
// Implementation notes:
//   * The base RikishiStatus has already been built by buildInitialRikishiFromSpec
//     (initial stats, genome, etc. have been rolled). We re-roll a few decision
//     points using a deterministic seed derived from the rikishi (so tests are
//     repeatable when the upstream rng is fixed) and patch the status fields.
//   * We do NOT touch banzuke / battle / matchmaking — only the status object.
//   * We do NOT add new themes or modifiers. We consume the existing
//     ObservationBiasDefinition shape (aptitudeTierBias, careerBandBias,
//     growthTypeBias, retirementProfileBias, genomeBias, varianceBias,
//     injuryRiskBias).

import {
  CONSTANTS,
  resolveAptitudeProfile,
} from '../constants';
import { resolveLegacyAptitudeFactor } from '../simulation/realism';
import type {
  AptitudeTier,
  CareerBand,
  GrowthType,
  RetirementProfile,
  RikishiGenome,
  RikishiStatus,
} from '../models';
// (CareerBand/GrowthType/RetirementProfile are used as generic type args below.)

import { composeBias } from './observationBuild';
import type {
  ObservationBuildConfig,
  ObservationBiasDefinition,
} from './types';

const STAT_KEYS = ['tsuki', 'oshi', 'kumi', 'nage', 'koshi', 'deashi', 'waza', 'power'] as const;

const APTITUDE_TIERS: AptitudeTier[] = ['S', 'A', 'B', 'C', 'D'];

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

// ---------- Guardrails ----------

/**
 * Soft-clamp a probability-weight distribution so no single bucket gets a
 * monopoly or vanishes to 0. This is what prevents result-guarantees: even the
 * "featured" theme can roll D-tier (just much less often), and "realistic"
 * can roll S (rarely).
 *
 * Returns weights summing to 1, with each bucket in [floor, ceiling].
 */
const clampWeights = (
  rawWeights: Record<string, number>,
  opts: { floor?: number; ceiling?: number } = {},
): Record<string, number> => {
  const floor = opts.floor ?? 0.03;
  const ceiling = opts.ceiling ?? 0.7;
  // First, drop negatives to 0, normalize.
  const positive: Record<string, number> = {};
  let sum = 0;
  for (const [k, v] of Object.entries(rawWeights)) {
    const w = Math.max(0, v);
    positive[k] = w;
    sum += w;
  }
  if (sum <= 0) {
    // fallback: uniform
    const keys = Object.keys(rawWeights);
    const u = 1 / keys.length;
    return Object.fromEntries(keys.map((k) => [k, u]));
  }
  const normalized: Record<string, number> = {};
  for (const [k, v] of Object.entries(positive)) {
    normalized[k] = clamp(v / sum, floor, ceiling);
  }
  // Re-normalize after clamping.
  let total = 0;
  for (const v of Object.values(normalized)) total += v;
  for (const k of Object.keys(normalized)) normalized[k] = normalized[k] / total;
  return normalized;
};

const weightedPick = <K extends string>(
  weights: Record<K, number>,
  rng: () => number,
): K => {
  let roll = rng();
  for (const [k, v] of Object.entries(weights) as Array<[K, number]>) {
    roll -= v;
    if (roll <= 0) return k;
  }
  return Object.keys(weights)[Object.keys(weights).length - 1] as K;
};

const seededRng = (seedText: string): (() => number) => {
  // mulberry32 from a string hash
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) {
    h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let t = h >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- Theme-base prior weights ----------

// Roughly mirror the existing rollAptitudeTier weights so "no bias" stays a
// no-op. Pulled from CONSTANTS.APTITUDE_TIER_DATA.weight if present, else uniform.
const buildAptitudeTierPrior = (): Record<AptitudeTier, number> => {
  const out: Record<string, number> = {};
  let total = 0;
  for (const t of APTITUDE_TIERS) {
    const w = CONSTANTS.APTITUDE_TIER_DATA?.[t]?.weight ?? 1;
    out[t] = w;
    total += w;
  }
  for (const t of APTITUDE_TIERS) out[t] = (out[t] as number) / total;
  return out as Record<AptitudeTier, number>;
};

// Aptitude-tier conditional prior on careerBand mirrors rollCareerBandForAptitude.
const buildCareerBandPriorForTier = (tier: AptitudeTier): Record<CareerBand, number> => {
  switch (tier) {
    case 'S': return { ELITE: 0.85, STRONG: 0.15, STANDARD: 0, GRINDER: 0, WASHOUT: 0 };
    case 'A': return { ELITE: 0.18, STRONG: 0.6, STANDARD: 0.22, GRINDER: 0, WASHOUT: 0 };
    case 'B': return { ELITE: 0, STRONG: 0.17, STANDARD: 0.51, GRINDER: 0.25, WASHOUT: 0.07 };
    case 'C': return { ELITE: 0, STRONG: 0, STANDARD: 0.14, GRINDER: 0.56, WASHOUT: 0.30 };
    case 'D': return { ELITE: 0, STRONG: 0, STANDARD: 0, GRINDER: 0.25, WASHOUT: 0.75 };
  }
};

const GROWTH_PRIOR: Record<GrowthType, number> = {
  EARLY: 0.18, NORMAL: 0.7, LATE: 0.1, GENIUS: 0.02,
};

const RETIREMENT_PRIOR: Record<RetirementProfile, number> = {
  EARLY_EXIT: 0.08, STANDARD: 0.86, IRONMAN: 0.06,
};

// Apply additive bias to a prior, then clamp+normalize.
const applyBiasToPrior = <K extends string>(
  prior: Record<K, number>,
  bias: Record<string, number> | undefined,
  opts?: { floor?: number; ceiling?: number },
): Record<K, number> => {
  const merged: Record<string, number> = { ...prior };
  if (bias) {
    for (const [k, v] of Object.entries(bias)) {
      if (k in merged) {
        merged[k] = (merged[k] ?? 0) + v;
      }
    }
  }
  return clampWeights(merged, opts) as Record<K, number>;
};

// ---------- Status mutators ----------

const applyStatBias = (
  status: RikishiStatus,
  initialStatBias: Record<string, number> | undefined,
): void => {
  if (!initialStatBias) return;
  for (const k of STAT_KEYS) {
    const delta = initialStatBias[k];
    if (!delta) continue;
    status.stats[k] = clamp(Math.round(status.stats[k] + delta), 0, 120);
  }
};

const applyBodyBias = (
  status: RikishiStatus,
  bodyBias: ObservationBiasDefinition['bodyMetricsBias'],
): void => {
  if (!bodyBias) return;
  const metrics = status.bodyMetrics;
  if (!metrics) return;
  if (bodyBias.heightCm && typeof metrics.heightCm === 'number') {
    metrics.heightCm = clamp(metrics.heightCm + bodyBias.heightCm, 150, 210);
  }
  if (bodyBias.weightKg && typeof metrics.weightKg === 'number') {
    metrics.weightKg = clamp(metrics.weightKg + bodyBias.weightKg, 70, 230);
  }
};

const applyAptitudeBias = (
  status: RikishiStatus,
  aptitudeBias: Record<string, number> | undefined,
  rng: () => number,
): void => {
  if (!aptitudeBias) return;
  // Only re-roll if the bias signal is non-trivial (any |delta| >= 0.04).
  const sigStrength = Object.values(aptitudeBias).reduce((s, v) => s + Math.abs(v), 0);
  if (sigStrength < 0.04) return;
  const prior = buildAptitudeTierPrior();
  const dist = applyBiasToPrior(prior, aptitudeBias, { floor: 0.04, ceiling: 0.55 });
  const pickedTier = weightedPick(dist, rng);
  if (pickedTier === status.aptitudeTier) return;
  status.aptitudeTier = pickedTier;
  // Re-derive profile + factor (these feed bout strength/growth pacing).
  const profile = resolveAptitudeProfile(pickedTier);
  status.aptitudeProfile = profile;
  status.aptitudeFactor = resolveLegacyAptitudeFactor(profile, pickedTier);
};

const applyCareerBandBias = (
  status: RikishiStatus,
  careerBandBias: Record<string, number> | undefined,
  rng: () => number,
): void => {
  // careerBand depends on aptitudeTier — we re-roll using the post-aptitude tier.
  const prior = buildCareerBandPriorForTier(status.aptitudeTier);
  const sigStrength = careerBandBias
    ? Object.values(careerBandBias).reduce((s, v) => s + Math.abs(v), 0)
    : 0;
  if (sigStrength < 0.04 && status.careerBand) return;
  const dist = applyBiasToPrior(prior, careerBandBias, { floor: 0.03, ceiling: 0.65 });
  status.careerBand = weightedPick(dist, rng);
};

const applyGrowthBias = (
  status: RikishiStatus,
  growthTypeBias: Record<string, number> | undefined,
  rng: () => number,
): void => {
  if (!growthTypeBias) return;
  const sig = Object.values(growthTypeBias).reduce((s, v) => s + Math.abs(v), 0);
  if (sig < 0.05) return;
  const dist = applyBiasToPrior(GROWTH_PRIOR, growthTypeBias, { floor: 0.04, ceiling: 0.6 });
  status.growthType = weightedPick(dist, rng);
};

const applyRetirementBias = (
  status: RikishiStatus,
  retirementProfileBias: Record<string, number> | undefined,
  injuryRiskBias: number | undefined,
  rng: () => number,
): void => {
  // Build effective bias: explicit retirementProfileBias plus injuryRiskBias hint.
  const effective: Record<string, number> = { ...(retirementProfileBias ?? {}) };
  if (injuryRiskBias && injuryRiskBias !== 0) {
    effective.EARLY_EXIT = (effective.EARLY_EXIT ?? 0) + injuryRiskBias * 0.5;
    effective.IRONMAN = (effective.IRONMAN ?? 0) - injuryRiskBias * 0.4;
  }
  const sig = Object.values(effective).reduce((s, v) => s + Math.abs(v), 0);
  if (sig < 0.04) return;
  const dist = applyBiasToPrior(RETIREMENT_PRIOR, effective, { floor: 0.03, ceiling: 0.5 });
  status.retirementProfile = weightedPick(dist, rng);
};

const GENOME_KEYS = [
  'powerCeiling', 'techCeiling', 'speedCeiling', 'ringSense', 'styleFit',
] as const;

const applyGenomeBias = (
  status: RikishiStatus,
  genomeBias: Record<string, number> | undefined,
  injuryRiskBias: number | undefined,
  varianceBias: number | undefined,
): void => {
  if (!status.genome) return;
  const g: RikishiGenome = status.genome;
  // Apply additive nudges (0..100 scale) to base ability ceilings. Caps prevent
  // a single modifier from saturating; small magnitude keeps tails alive.
  if (genomeBias) {
    for (const key of GENOME_KEYS) {
      const delta = genomeBias[key];
      if (!delta) continue;
      g.base[key] = clamp(g.base[key] + delta, 1, 100);
    }
    // Also support a few aliases that the modifier defs use:
    // 'oshiAffinity' -> push styleFit/powerCeiling, 'technicalAffinity' -> tech
    if (genomeBias.oshiAffinity) {
      g.base.powerCeiling = clamp(g.base.powerCeiling + genomeBias.oshiAffinity * 0.7, 1, 100);
      g.base.styleFit = clamp(g.base.styleFit + genomeBias.oshiAffinity * 0.5, 1, 100);
    }
    if (genomeBias.technicalAffinity) {
      g.base.techCeiling = clamp(g.base.techCeiling + genomeBias.technicalAffinity * 0.8, 1, 100);
      g.base.ringSense = clamp(g.base.ringSense + genomeBias.technicalAffinity * 0.4, 1, 100);
    }
    if (genomeBias.lateBloom) {
      // Push maturationAge later, extend peakLength a bit.
      g.growth.maturationAge = clamp(g.growth.maturationAge + genomeBias.lateBloom * 4, 18, 35);
      g.growth.peakLength = clamp(g.growth.peakLength + genomeBias.lateBloom * 2, 1, 12);
    }
  }
  if (injuryRiskBias && injuryRiskBias !== 0) {
    g.durability.baseInjuryRisk = clamp(
      g.durability.baseInjuryRisk * (1 + injuryRiskBias),
      0.3,
      2.0,
    );
  }
  if (varianceBias && varianceBias !== 0) {
    g.variance.formVolatility = clamp(g.variance.formVolatility * (1 + varianceBias), 0, 100);
    g.variance.streakSensitivity = clamp(g.variance.streakSensitivity * (1 + varianceBias * 0.6), 0, 100);
    if (varianceBias < 0) {
      // stable: also slightly tighten slumpRecovery
      g.variance.slumpRecovery = clamp(g.variance.slumpRecovery * (1 - varianceBias * 0.3), 0, 100);
    }
  }
};

// ---------- Public API ----------

export interface AppliedBiasResult {
  status: RikishiStatus;
  appliedBias: ObservationBiasDefinition;
}

export const applyObservationBuildBias = (
  baseStatus: RikishiStatus,
  config: ObservationBuildConfig,
  rngOverride?: () => number,
): AppliedBiasResult => {
  const bias = composeBias(config.themeId, config.modifierIds);

  // Deep-clone the parts we mutate. (Caller's status is left untouched.)
  const status: RikishiStatus = {
    ...baseStatus,
    stats: { ...baseStatus.stats },
    bodyMetrics: baseStatus.bodyMetrics ? { ...baseStatus.bodyMetrics } : baseStatus.bodyMetrics,
    aptitudeProfile: baseStatus.aptitudeProfile ? { ...baseStatus.aptitudeProfile } : baseStatus.aptitudeProfile,
    genome: baseStatus.genome
      ? {
        base: { ...baseStatus.genome.base },
        growth: { ...baseStatus.genome.growth },
        durability: {
          ...baseStatus.genome.durability,
          partVulnerability: { ...(baseStatus.genome.durability.partVulnerability ?? {}) },
        },
        variance: { ...baseStatus.genome.variance },
      }
      : baseStatus.genome,
  };

  const seedText = `${baseStatus.shikona}|${baseStatus.stableId}|${config.themeId}|${config.modifierIds.join(',')}`;
  const rng = rngOverride ?? seededRng(seedText);

  // Order matters: aptitudeTier before careerBand (band prior depends on tier).
  applyAptitudeBias(status, bias.aptitudeTierBias, rng);
  applyCareerBandBias(status, bias.careerBandBias, rng);
  applyGrowthBias(status, bias.growthTypeBias, rng);
  applyRetirementBias(status, bias.retirementProfileBias, bias.injuryRiskBias, rng);
  applyGenomeBias(status, bias.genomeBias, bias.injuryRiskBias, bias.varianceBias);
  applyStatBias(status, bias.initialStatBias);
  applyBodyBias(status, bias.bodyMetricsBias);

  return { status, appliedBias: bias };
};

// Test helpers (named so unit tests / sweeps can re-use without re-importing).
export const __test = {
  clampWeights,
  applyBiasToPrior,
  buildAptitudeTierPrior,
  buildCareerBandPriorForTier,
  GROWTH_PRIOR,
  RETIREMENT_PRIOR,
  seededRng,
  weightedPick,
};
