import type { RandomSource } from '../deps';

export type BoundaryCandidate = {
  score: number;
  mandatory: boolean;
};

export type BoundaryResultSnapshot = {
  id: string;
  rankScore: number;
  wins: number;
  losses: number;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const randomNoise = (rng: RandomSource, amplitude: number): number =>
  (rng() * 2 - 1) * amplitude;

export const compareBoundaryCandidate = (
  a: BoundaryCandidate,
  b: BoundaryCandidate,
): number => {
  if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
  return b.score - a.score;
};

export const computeNeighborHalfStepNudge = (
  results: BoundaryResultSnapshot[],
): number => {
  const player = results.find((result) => result.id === 'PLAYER');
  if (!player) return 0;
  const byScore = new Map(results.map((result) => [result.rankScore, result]));
  const upper = byScore.get(player.rankScore - 1);
  const lower = byScore.get(player.rankScore + 1);
  const playerDiff = player.wins - player.losses;
  const upperDiff = upper ? upper.wins - upper.losses : null;
  const lowerDiff = lower ? lower.wins - lower.losses : null;

  if (playerDiff > 0 && upperDiff !== null && playerDiff >= upperDiff + 2) return -1;
  if (playerDiff < 0 && lowerDiff !== null && lowerDiff >= playerDiff + 2) return 1;
  if (playerDiff === 0) {
    if (upperDiff !== null && upperDiff <= -2) return -1;
    if (lowerDiff !== null && lowerDiff >= 2) return 1;
  }
  if (playerDiff > 0 && upperDiff !== null && upperDiff < 0) return -1;
  if (playerDiff < 0 && lowerDiff !== null && lowerDiff > 0) return 1;
  return 0;
};
