/**
 * NPC world calibration profile.
 *
 * The "legacy" profile is the production default and preserves the existing
 * sampleEmpiricalNpcSeed-based generation byte-for-byte. The realdata_v1
 * variants override careerBand / aptitudeTier / retirementProfile mixes,
 * planned-career percentile triple, and retirement curve multipliers in an
 * attempt to match the Heisei real-data target KPIs. They are exercised
 * exclusively by sweep harnesses; production code keeps "legacy".
 */

import { AptitudeTier, CareerBand, RetirementProfile } from '../../../models';

export type NpcWorldCalibrationProfile =
  | 'legacy'
  | 'realdata_v1'
  | 'realdata_v1_more_washout'
  | 'realdata_v1_more_sekitori_candidates'
  | 'realdata_v1_shorter_careers'
  | 'realdata_v1_balanced'
  | 'realdata_v2_reach_suppressed'
  | 'realdata_v2_longer_careers'
  | 'realdata_v2_lower_heavy'
  | 'realdata_v2_balanced'
  | 'realdata_v3_top_suppressed'
  | 'realdata_v3_short_tail'
  | 'realdata_v3_final_balanced';

export interface NpcWorldCalibrationParameters {
  /** Override mix for careerBand sampling. Empty -> use legacy empirical. */
  careerBandMix?: Record<CareerBand, number>;
  /** Override mix for aptitudeTier sampling. Empty -> use legacy empirical. */
  aptitudeTierMix?: Record<AptitudeTier, number>;
  /** Override mix for retirementProfile sampling. Empty -> use legacy empirical. */
  retirementProfileMix?: Record<RetirementProfile, number>;
  /** Planned career basho percentile triple (p10/p50/p90). */
  plannedCareerBashoPercentiles?: { p10: number; p50: number; p90: number };
  /** Multiplier applied on top of the legacy career-length hazard curve. */
  careerLengthHazardScale?: number;
  /** Multiplier applied on top of the legacy early-washout bonus. */
  earlyWashoutBonusScale?: number;
}

const REALDATA_V1_BASE: NpcWorldCalibrationParameters = {
  // Slight tilt vs legacy: more WASHOUT/GRINDER, fewer ELITE/STRONG so the
  // sekitori reach rate trends toward the real ~9% instead of the current ~3%.
  // Note: lowering ELITE/STRONG isn't sufficient on its own; the planned p50
  // is also pulled in (32 -> 21) and hazard scaling is bumped.
  careerBandMix: {
    ELITE: 0.012,
    STRONG: 0.10,
    STANDARD: 0.34,
    GRINDER: 0.31,
    WASHOUT: 0.238,
  },
  aptitudeTierMix: {
    S: 0.005,
    A: 0.06,
    B: 0.34,
    C: 0.42,
    D: 0.175,
  },
  retirementProfileMix: {
    EARLY_EXIT: 0.36,
    STANDARD: 0.60,
    IRONMAN: 0.04,
  },
  plannedCareerBashoPercentiles: { p10: 4, p50: 21, p90: 89 },
  careerLengthHazardScale: 1.15,
  earlyWashoutBonusScale: 1.10,
};

const PROFILE_TABLE: Record<NpcWorldCalibrationProfile, NpcWorldCalibrationParameters> = {
  legacy: {},
  realdata_v1: { ...REALDATA_V1_BASE },
  realdata_v1_more_washout: {
    ...REALDATA_V1_BASE,
    careerBandMix: {
      ELITE: 0.010,
      STRONG: 0.08,
      STANDARD: 0.30,
      GRINDER: 0.30,
      WASHOUT: 0.31,
    },
    earlyWashoutBonusScale: 1.30,
  },
  realdata_v1_more_sekitori_candidates: {
    ...REALDATA_V1_BASE,
    careerBandMix: {
      ELITE: 0.025,
      STRONG: 0.16,
      STANDARD: 0.36,
      GRINDER: 0.27,
      WASHOUT: 0.185,
    },
    aptitudeTierMix: {
      S: 0.012,
      A: 0.10,
      B: 0.40,
      C: 0.36,
      D: 0.128,
    },
  },
  realdata_v1_shorter_careers: {
    ...REALDATA_V1_BASE,
    plannedCareerBashoPercentiles: { p10: 2, p50: 18, p90: 75 },
    careerLengthHazardScale: 1.30,
    retirementProfileMix: {
      EARLY_EXIT: 0.45,
      STANDARD: 0.52,
      IRONMAN: 0.03,
    },
  },
  realdata_v1_balanced: {
    ...REALDATA_V1_BASE,
    careerBandMix: {
      ELITE: 0.014,
      STRONG: 0.12,
      STANDARD: 0.36,
      GRINDER: 0.30,
      WASHOUT: 0.206,
    },
    plannedCareerBashoPercentiles: { p10: 3, p50: 21, p90: 82 },
    careerLengthHazardScale: 1.20,
    earlyWashoutBonusScale: 1.15,
  },
  // v2 family — designed against full-observation harness output. Legacy run
  // shows juryoReach 0.114 vs target 0.091 (over) and lower-bucket shares
  // (jonokuchi 0.053 vs 0.138, jonidan 0.237 vs 0.327) too low. Strategy:
  // suppress sekitori-class bands, push aptitude toward C/D, add washout mass.
  realdata_v2_reach_suppressed: {
    careerBandMix: {
      ELITE: 0.008,
      STRONG: 0.07,
      STANDARD: 0.30,
      GRINDER: 0.32,
      WASHOUT: 0.302,
    },
    aptitudeTierMix: {
      S: 0.003,
      A: 0.04,
      B: 0.27,
      C: 0.46,
      D: 0.227,
    },
    retirementProfileMix: {
      EARLY_EXIT: 0.38,
      STANDARD: 0.58,
      IRONMAN: 0.04,
    },
    plannedCareerBashoPercentiles: { p10: 3, p50: 21, p90: 78 },
    careerLengthHazardScale: 1.20,
    earlyWashoutBonusScale: 1.15,
  },
  realdata_v2_longer_careers: {
    careerBandMix: {
      ELITE: 0.012,
      STRONG: 0.10,
      STANDARD: 0.34,
      GRINDER: 0.31,
      WASHOUT: 0.238,
    },
    aptitudeTierMix: {
      S: 0.005,
      A: 0.06,
      B: 0.34,
      C: 0.42,
      D: 0.175,
    },
    retirementProfileMix: {
      EARLY_EXIT: 0.32,
      STANDARD: 0.62,
      IRONMAN: 0.06,
    },
    plannedCareerBashoPercentiles: { p10: 2, p50: 21, p90: 80 },
    careerLengthHazardScale: 1.00,
    earlyWashoutBonusScale: 1.00,
  },
  realdata_v2_lower_heavy: {
    careerBandMix: {
      ELITE: 0.008,
      STRONG: 0.06,
      STANDARD: 0.27,
      GRINDER: 0.31,
      WASHOUT: 0.352,
    },
    aptitudeTierMix: {
      S: 0.003,
      A: 0.03,
      B: 0.24,
      C: 0.46,
      D: 0.267,
    },
    retirementProfileMix: {
      EARLY_EXIT: 0.42,
      STANDARD: 0.55,
      IRONMAN: 0.03,
    },
    plannedCareerBashoPercentiles: { p10: 2, p50: 18, p90: 72 },
    careerLengthHazardScale: 1.25,
    earlyWashoutBonusScale: 1.30,
  },
  realdata_v2_balanced: {
    careerBandMix: {
      ELITE: 0.009,
      STRONG: 0.08,
      STANDARD: 0.30,
      GRINDER: 0.31,
      WASHOUT: 0.301,
    },
    aptitudeTierMix: {
      S: 0.003,
      A: 0.04,
      B: 0.28,
      C: 0.45,
      D: 0.227,
    },
    retirementProfileMix: {
      EARLY_EXIT: 0.38,
      STANDARD: 0.58,
      IRONMAN: 0.04,
    },
    plannedCareerBashoPercentiles: { p10: 2, p50: 21, p90: 78 },
    careerLengthHazardScale: 1.10,
    earlyWashoutBonusScale: 1.15,
  },
  // v3 family — ironman-observation reveals v2_reach_suppressed still produces
  // ~4x yokozuna share, ~2.7x careerP50, and ~0.25x under12 vs target. v3
  // suppresses upper-band candidates further and shortens career tails.
  realdata_v3_top_suppressed: {
    careerBandMix: {
      ELITE: 0.004,
      STRONG: 0.045,
      STANDARD: 0.27,
      GRINDER: 0.34,
      WASHOUT: 0.341,
    },
    aptitudeTierMix: {
      S: 0.0015,
      A: 0.025,
      B: 0.24,
      C: 0.48,
      D: 0.2535,
    },
    retirementProfileMix: {
      EARLY_EXIT: 0.40,
      STANDARD: 0.575,
      IRONMAN: 0.025,
    },
    plannedCareerBashoPercentiles: { p10: 3, p50: 21, p90: 76 },
    careerLengthHazardScale: 1.25,
    earlyWashoutBonusScale: 1.20,
  },
  realdata_v3_short_tail: {
    careerBandMix: {
      ELITE: 0.007,
      STRONG: 0.06,
      STANDARD: 0.28,
      GRINDER: 0.33,
      WASHOUT: 0.323,
    },
    aptitudeTierMix: {
      S: 0.002,
      A: 0.035,
      B: 0.26,
      C: 0.46,
      D: 0.243,
    },
    retirementProfileMix: {
      EARLY_EXIT: 0.50,
      STANDARD: 0.48,
      IRONMAN: 0.02,
    },
    plannedCareerBashoPercentiles: { p10: 1, p50: 14, p90: 60 },
    careerLengthHazardScale: 1.55,
    earlyWashoutBonusScale: 1.55,
  },
  realdata_v3_final_balanced: {
    careerBandMix: {
      ELITE: 0.005,
      STRONG: 0.05,
      STANDARD: 0.27,
      GRINDER: 0.335,
      WASHOUT: 0.34,
    },
    aptitudeTierMix: {
      S: 0.002,
      A: 0.03,
      B: 0.25,
      C: 0.47,
      D: 0.248,
    },
    retirementProfileMix: {
      EARLY_EXIT: 0.45,
      STANDARD: 0.525,
      IRONMAN: 0.025,
    },
    plannedCareerBashoPercentiles: { p10: 2, p50: 17, p90: 68 },
    careerLengthHazardScale: 1.40,
    earlyWashoutBonusScale: 1.35,
  },
};

let activeProfile: NpcWorldCalibrationProfile = 'legacy';

export const getActiveNpcWorldCalibrationProfile = (): NpcWorldCalibrationProfile =>
  activeProfile;

export const setActiveNpcWorldCalibrationProfile = (
  profile: NpcWorldCalibrationProfile,
): void => {
  activeProfile = profile;
};

export const getNpcWorldCalibrationParameters = (
  profile: NpcWorldCalibrationProfile = activeProfile,
): NpcWorldCalibrationParameters => PROFILE_TABLE[profile] ?? {};

const sampleFromMix = <T extends string>(
  mix: Record<T, number>,
  rng: () => number,
): T => {
  const entries = Object.entries(mix) as [T, number][];
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [key, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return key;
  }
  return entries[entries.length - 1][0];
};

export const sampleProfileCareerBand = (
  rng: () => number,
  profile: NpcWorldCalibrationProfile = activeProfile,
): CareerBand | undefined => {
  const params = getNpcWorldCalibrationParameters(profile);
  if (!params.careerBandMix) return undefined;
  return sampleFromMix(params.careerBandMix, rng);
};

export const sampleProfileAptitudeTier = (
  rng: () => number,
  profile: NpcWorldCalibrationProfile = activeProfile,
): AptitudeTier | undefined => {
  const params = getNpcWorldCalibrationParameters(profile);
  if (!params.aptitudeTierMix) return undefined;
  return sampleFromMix(params.aptitudeTierMix, rng);
};

export const sampleProfileRetirementProfile = (
  rng: () => number,
  profile: NpcWorldCalibrationProfile = activeProfile,
): RetirementProfile | undefined => {
  const params = getNpcWorldCalibrationParameters(profile);
  if (!params.retirementProfileMix) return undefined;
  return sampleFromMix(params.retirementProfileMix, rng);
};
