import { RandomSource } from '../deps';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const randomBetween = (rng: RandomSource, min: number, max: number): number =>
  min + (max - min) * rng();

const randomNormal = (rng: RandomSource, sigma: number): number => {
  // Box-Muller transform with epsilon guard.
  const u1 = Math.max(1e-12, rng());
  const u2 = Math.max(1e-12, rng());
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return z * sigma;
};

export type BashoShockEvent =
  | 'NONE'
  | 'MAJOR_SLUMP'
  | 'MAJOR_SURGE'
  | 'MILD_SLUMP'
  | 'MILD_SURGE';

export type BashoVarianceRoll = {
  bashoFormDelta: number;
  sigma: number;
  tailShock: number;
  event: BashoShockEvent;
};

export const resolveBashoFormDelta = (
  input: {
    uncertainty?: number;
    volatility?: number;
    rng: RandomSource;
  },
): BashoVarianceRoll => {
  const uncertainty = Number.isFinite(input.uncertainty) ? (input.uncertainty as number) : 1.8;
  const volatility = Number.isFinite(input.volatility) ? (input.volatility as number) : 1.2;
  const sigma = clamp(1.4 + uncertainty * 0.22 + volatility * 0.18, 1.2, 3.0);

  const normalNoise = randomNormal(input.rng, sigma);
  const tailRoll = input.rng();
  let event: BashoShockEvent = 'NONE';
  let tailShock = 0;

  if (tailRoll < 0.05) {
    event = 'MAJOR_SLUMP';
    tailShock = -randomBetween(input.rng, 8, 14);
  } else if (tailRoll < 0.09) {
    event = 'MAJOR_SURGE';
    tailShock = randomBetween(input.rng, 6, 10);
  } else if (tailRoll < 0.19) {
    event = 'MILD_SLUMP';
    tailShock = -randomBetween(input.rng, 4, 7);
  } else if (tailRoll < 0.28) {
    event = 'MILD_SURGE';
    tailShock = randomBetween(input.rng, 3, 6);
  }

  return {
    bashoFormDelta: clamp(normalNoise + tailShock, -16, 14),
    sigma,
    tailShock,
    event,
  };
};

export const updateConditionForV3 = (
  input: {
    previousCondition: number;
    actualWins: number;
    expectedWins: number;
    bashoFormDelta: number;
    rng: RandomSource;
  },
): number => {
  const smallNoise = randomBetween(input.rng, -1.6, 1.6);
  const shockCond = input.bashoFormDelta * 0.9 + smallNoise;
  return clamp(
    50 +
    0.58 * (input.previousCondition - 50) +
    2.0 * (input.actualWins - input.expectedWins) +
    shockCond,
    28,
    72,
  );
};
