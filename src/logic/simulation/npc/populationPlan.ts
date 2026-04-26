import { getHeiseiMonthlyIntakeStats, HEISEI_POPULATION_CALIBRATION } from '../../calibration/populationHeisei';
import { DistributionCalibrationStats } from '../../calibration/types';
import { RandomSource } from '../deps';
import { countActiveBanzukeHeadcountExcludingMaezumo } from '../world';
import type { SimulationWorld } from '../world';
import type { PopulationPlan } from './populationPlanTypes';

const OFFICIAL_BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;
const MONTHLY_P50_SERIES = OFFICIAL_BASHO_MONTHS
  .map((month) => getHeiseiMonthlyIntakeStats(month)?.p50 ?? 0)
  .sort((a, b) => a - b);
const MONTHLY_P50_CENTER = MONTHLY_P50_SERIES[Math.floor(MONTHLY_P50_SERIES.length / 2)] ?? 0;
const MONTHLY_P50_MIN = MONTHLY_P50_SERIES[0] ?? 0;
const MONTHLY_P50_MAX = MONTHLY_P50_SERIES[MONTHLY_P50_SERIES.length - 1] ?? 0;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const centeredRoll = (rng: RandomSource): number => rng() * 2 - 1;

export const sampleTriangularFromQuantiles = (
  stats: DistributionCalibrationStats,
  rng: RandomSource,
): number => {
  const left = stats.p10;
  const mode = stats.p50;
  const right = stats.p90;
  if (left === right) return clamp(mode, stats.min, stats.max);
  const normalizedMode =
    right === left
      ? 0.5
      : clamp((mode - left) / (right - left), Number.EPSILON, 1 - Number.EPSILON);
  const roll = rng();
  const sample = roll < normalizedMode
    ? left + Math.sqrt(roll * (right - left) * (mode - left))
    : right - Math.sqrt((1 - roll) * (right - left) * (right - mode));
  return clamp(sample, stats.min, stats.max);
};

const sampleRounded = (
  stats: DistributionCalibrationStats,
  rng: RandomSource,
): number => Math.round(sampleTriangularFromQuantiles(stats, rng));

const normalizeAroundMedian = (
  value: number,
  stats: DistributionCalibrationStats,
): number => {
  if (value >= stats.p50) {
    return clamp(
      (value - stats.p50) / Math.max(1, stats.p90 - stats.p50),
      0,
      1,
    );
  }
  return -clamp(
    (stats.p50 - value) / Math.max(1, stats.p50 - stats.p10),
    0,
    1,
  );
};

export const resolveRemainingBashoInYear = (month: number): number => {
  const remaining = OFFICIAL_BASHO_MONTHS.filter((candidate) => candidate >= month).length;
  return Math.max(1, remaining);
};

const resolveMonthProgress = (month: number): number => {
  const index = Math.max(0, OFFICIAL_BASHO_MONTHS.indexOf(month as typeof OFFICIAL_BASHO_MONTHS[number]));
  return OFFICIAL_BASHO_MONTHS.length <= 1
    ? 1
    : index / (OFFICIAL_BASHO_MONTHS.length - 1);
};

export const resolvePlannedHeadcountForMonth = (
  month: number,
  populationPlan: PopulationPlan | undefined,
): number | undefined => {
  if (!populationPlan || populationPlan.annualStartHeadcount === undefined) {
    return undefined;
  }
  const progress = resolveMonthProgress(month);
  const targetHeadcount =
    populationPlan.annualTargetHeadcount ??
    (populationPlan.annualStartHeadcount + (populationPlan.annualHeadcountDrift ?? 0));
  const drift =
    (targetHeadcount - populationPlan.annualStartHeadcount) * progress;
  const swingAmplitude = populationPlan.annualSwingAmplitude ?? 0;
  const swingPhase = populationPlan.annualSwingPhase ?? 0;
  const swing = Math.sin(progress * Math.PI * 2 + swingPhase) * swingAmplitude;
  return Math.round(populationPlan.annualStartHeadcount + drift + swing);
};

export const resolvePopulationPressure = (
  month: number,
  currentBanzukeHeadcount: number,
  populationPlan: PopulationPlan | undefined,
): number => {
  const planned = resolvePlannedHeadcountForMonth(month, populationPlan);
  if (planned === undefined || !populationPlan) return 0;
  return clamp(
    planned - currentBanzukeHeadcount,
    -Math.max(8, populationPlan.sampledTotalSwing),
    Math.max(8, populationPlan.sampledTotalSwing),
  );
};

export const ensurePopulationPlan = (
  world: SimulationWorld,
  year: number,
  rng: RandomSource,
): PopulationPlan => {
  if (world.populationPlan?.sampledAtYear === year) {
    return world.populationPlan;
  }

  const currentBanzukeHeadcount = countActiveBanzukeHeadcountExcludingMaezumo(world);
  const sampledAnnualDelta = sampleRounded(
    HEISEI_POPULATION_CALIBRATION.annualTotalDelta,
    rng,
  );
  const sampledAnnualHeadcount = sampleRounded(
    HEISEI_POPULATION_CALIBRATION.annualTotalHeadcount,
    rng,
  );
  const sampledTotalSwing = sampleRounded(
    HEISEI_POPULATION_CALIBRATION.annualTotalSwing,
    rng,
  );
  const sampledJonidanHeadcount = sampleRounded(
    HEISEI_POPULATION_CALIBRATION.annualJonidanHeadcount,
    rng,
  );
  const sampledJonokuchiHeadcount = sampleRounded(
    HEISEI_POPULATION_CALIBRATION.annualJonokuchiHeadcount,
    rng,
  );
  const sampledJonidanSwing = sampleRounded(
    HEISEI_POPULATION_CALIBRATION.annualJonidanSwing,
    rng,
  );
  const sampledJonokuchiSwing = sampleRounded(
    HEISEI_POPULATION_CALIBRATION.annualJonokuchiSwing,
    rng,
  );
  const annualDeltaShock = normalizeAroundMedian(
    sampledAnnualDelta,
    HEISEI_POPULATION_CALIBRATION.annualTotalDelta,
  );
  const annualHeadcountShock = normalizeAroundMedian(
    sampledAnnualHeadcount,
    HEISEI_POPULATION_CALIBRATION.annualTotalHeadcount,
  );
  const annualSwingShock = normalizeAroundMedian(
    sampledTotalSwing,
    HEISEI_POPULATION_CALIBRATION.annualTotalSwing,
  );
  const rareEventNetShock =
    rng() < 0.18
      ? (0.14 + rng() * 0.12) * (rng() < 0.5 ? -1 : 1)
      : 0;
  const annualIntakeShock = clamp(
    annualDeltaShock * 0.3 +
      annualHeadcountShock * 0.08 +
      centeredRoll(rng) * 0.18 +
      rareEventNetShock,
    -0.3,
    0.55,
  );
  const annualRetirementShock = clamp(
    -annualDeltaShock * 0.38 +
      centeredRoll(rng) * 0.12 -
      rareEventNetShock * 0.85,
    -0.22,
    0.28,
  );
  const annualIntakeHardCap = Math.max(
    currentBanzukeHeadcount,
    Math.round(sampledAnnualHeadcount + sampledTotalSwing * 0.55),
  );
  const annualTargetHeadcount = clamp(
    currentBanzukeHeadcount + Math.round(sampledAnnualDelta * 1.4) + 3,
    Math.round(sampledAnnualHeadcount - sampledTotalSwing * 0.6),
    Math.round(sampledAnnualHeadcount + sampledTotalSwing * 0.65),
  );
  const annualSwingAmplitude = clamp(
    sampledTotalSwing * (0.43 + Math.abs(annualSwingShock) * 0.18),
    13,
    Math.max(14, sampledTotalSwing * 0.78),
  );
  const annualSwingPhase = rng() * Math.PI * 2;
  const jonidanShock = clamp(
    normalizeAroundMedian(
      sampledJonidanHeadcount,
      HEISEI_POPULATION_CALIBRATION.annualJonidanHeadcount,
    ) + centeredRoll(rng) * 0.08,
    -1,
    1,
  );
  const jonokuchiShock = clamp(
    normalizeAroundMedian(
      sampledJonokuchiHeadcount,
      HEISEI_POPULATION_CALIBRATION.annualJonokuchiHeadcount,
    ) + centeredRoll(rng) * 0.1,
    -1,
    1,
  );
  const lowerDivisionElasticity = clamp(
    1 + annualSwingShock * 0.32 + centeredRoll(rng) * 0.08,
    0.8,
    1.35,
  );

  world.populationPlan = {
    sampledAtYear: year,
    annualIntakeShock,
    annualRetirementShock,
    annualIntakeHardCap,
    annualStartHeadcount: currentBanzukeHeadcount,
    annualTargetHeadcount,
    annualHeadcountDrift: annualTargetHeadcount - currentBanzukeHeadcount,
    annualSwingAmplitude,
    annualSwingPhase,
    jonidanShock,
    jonokuchiShock,
    lowerDivisionElasticity,
    sampledTotalSwing,
    sampledJonidanSwing,
    sampledJonokuchiSwing,
  };
  return world.populationPlan;
};

export const resolveMonthlyPopulationBaseIntake = (
  month: number,
  rng: RandomSource,
): number => {
  const stats = getHeiseiMonthlyIntakeStats(month);
  if (!stats) return 0;
  return Math.max(0, sampleRounded(stats, rng));
};

export const resolveMonthlyIntakePulse = (month: number): number => {
  const stats = getHeiseiMonthlyIntakeStats(month);
  const value = stats?.p50 ?? MONTHLY_P50_CENTER;
  if (value >= MONTHLY_P50_CENTER) {
    return clamp(
      (value - MONTHLY_P50_CENTER) / Math.max(1, MONTHLY_P50_MAX - MONTHLY_P50_CENTER),
      0,
      1,
    );
  }
  return -clamp(
    (MONTHLY_P50_CENTER - value) / Math.max(1, MONTHLY_P50_CENTER - MONTHLY_P50_MIN),
    0,
    1,
  );
};
