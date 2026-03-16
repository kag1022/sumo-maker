import {
  AptitudeProfile,
  CareerBand,
  RealismKpiSnapshot,
  RikishiStatus,
  StagnationState,
} from '../models';
import {
  CONSTANTS,
  DEFAULT_APTITUDE_FACTOR,
  DEFAULT_CAREER_BAND,
  resolveAptitudeFactor,
  resolveAptitudeProfile,
} from '../constants';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const createDefaultStagnationState = (): StagnationState => ({
  pressure: 0,
  makekoshiStreak: 0,
  lowWinRateStreak: 0,
  stuckBasho: 0,
  reboundBoost: 0,
});

export const resolveCareerBand = (band?: CareerBand): CareerBand =>
  band ?? DEFAULT_CAREER_BAND;

export const resolveCareerBandBias = (
  band?: CareerBand,
): (typeof CONSTANTS.CAREER_BAND_DATA)[CareerBand] =>
  CONSTANTS.CAREER_BAND_DATA[resolveCareerBand(band)];

export const resolveStatusAptitudeProfile = (
  status: Partial<Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor'>>,
): AptitudeProfile => {
  if (status.aptitudeProfile) return { ...status.aptitudeProfile };
  const fallback = resolveAptitudeProfile(status.aptitudeTier);
  const legacy = Number.isFinite(status.aptitudeFactor)
    ? Math.max(0.3, status.aptitudeFactor as number)
    : DEFAULT_APTITUDE_FACTOR;
  return {
    initialFactor: fallback.initialFactor,
    growthFactor: fallback.growthFactor,
    boutFactor: legacy,
    longevityFactor: fallback.longevityFactor,
  };
};

export const resolveBoutFactor = (
  status: Partial<Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor'>>,
): number => resolveStatusAptitudeProfile(status).boutFactor;

export const resolveGrowthFactor = (
  status: Partial<Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor'>>,
): number => resolveStatusAptitudeProfile(status).growthFactor;

export const resolveLongevityFactor = (
  status: Partial<Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor'>>,
): number => resolveStatusAptitudeProfile(status).longevityFactor;

export const resolveInitialFactor = (
  status: Partial<Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor'>>,
): number => resolveStatusAptitudeProfile(status).initialFactor;

export const resolveLegacyAptitudeFactor = (
  profile?: AptitudeProfile,
  tier?: RikishiStatus['aptitudeTier'],
): number => profile?.boutFactor ?? resolveAptitudeFactor(tier);

export const resolveCompetitiveFactor = (
  status: Partial<Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor' | 'careerBand' | 'stagnation'>>,
): number => {
  const aptitudeFactor = clamp(Math.pow(clamp(resolveBoutFactor(status), 0.35, 1.2), 1.7), 0.22, 1.36);
  const careerBandFactor = clamp(
    1 + resolveCareerBandBias(status.careerBand).abilityBias / 100,
    0.72,
    1.14,
  );
  const stagnationFactor = clamp(
    1 - resolveStagnationPenalty(status.stagnation).formPenalty * 0.16,
    0.68,
    1,
  );
  return aptitudeFactor * careerBandFactor * stagnationFactor;
};

export const resolveStagnationPenalty = (
  stagnation?: StagnationState,
): { growthPenalty: number; formPenalty: number; reboundBoost: number } => {
  const pressure = stagnation?.pressure ?? 0;
  return {
    growthPenalty: clamp(1 - pressure * 0.16, 0.35, 1),
    formPenalty: clamp(pressure * 0.24, 0, 1.45),
    reboundBoost: clamp(stagnation?.reboundBoost ?? 0, 0, 0.18),
  };
};

export const updateStagnationState = (
  current: StagnationState | undefined,
  input: {
    wins: number;
    losses: number;
    absent: number;
    division: RikishiStatus['rank']['division'];
    promotedToSekitori: boolean;
    careerBand?: CareerBand;
  },
): StagnationState => {
  const next = current ? { ...current } : createDefaultStagnationState();
  const totalLosses = input.losses + input.absent;
  const totalBouts = Math.max(1, input.wins + totalLosses);
  const winRate = input.wins / totalBouts;
  const bandBias = resolveCareerBandBias(input.careerBand).stagnationBias;
  const lowerDivision =
    input.division === 'Makushita' ||
    input.division === 'Sandanme' ||
    input.division === 'Jonidan' ||
    input.division === 'Jonokuchi';

  next.makekoshiStreak = input.wins < totalLosses ? next.makekoshiStreak + 1 : 0;
  next.lowWinRateStreak = winRate <= 0.43 ? next.lowWinRateStreak + 1 : 0;
  next.stuckBasho = lowerDivision && !input.promotedToSekitori ? next.stuckBasho + 1 : 0;
  if (input.promotedToSekitori || input.wins >= totalLosses + 2) {
    next.reboundBoost = clamp((next.reboundBoost ?? 0) + 0.04, 0, 0.18);
  } else {
    next.reboundBoost = clamp((next.reboundBoost ?? 0) - 0.02, 0, 0.18);
  }

  let pressure = next.pressure * 0.78;
  if (next.makekoshiStreak >= 2) pressure += 0.52 * bandBias;
  if (next.lowWinRateStreak >= 2) pressure += 0.42 * bandBias;
  if (lowerDivision && next.stuckBasho >= 4) pressure += 0.3 * bandBias;
  if (lowerDivision && input.wins <= 2) pressure += 0.18 * bandBias;
  if (input.wins >= totalLosses + 2) pressure -= 0.26;
  if (input.promotedToSekitori) pressure -= 0.75;
  next.pressure = clamp(pressure, 0, 4.2);
  if (next.pressure < 0.15) next.pressure = 0;

  if (input.wins >= totalLosses + 2) {
    next.makekoshiStreak = 0;
    next.lowWinRateStreak = 0;
  }

  return next;
};

export const buildCareerRealismSnapshot = (
  status: Pick<RikishiStatus, 'history' | 'age' | 'stagnation'>,
): RealismKpiSnapshot => {
  const totalWins = status.history.totalWins;
  const totalLosses = status.history.totalLosses;
  const totalMatches = Math.max(1, totalWins + totalLosses);
  return {
    careerWinRate: totalWins / totalMatches,
    stagnationPressure: status.stagnation?.pressure ?? 0,
  };
};
