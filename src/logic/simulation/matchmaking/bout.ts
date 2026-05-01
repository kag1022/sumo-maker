import { BALANCE } from '../../balance';
import { EnemyStyleBias } from '../../catalog/enemyData';
import { RandomSource } from '../deps';
import {
  calculateMomentumBonus,
  resolveBoutWinProb,
  resolveUnifiedNpcStrength,
} from '../strength/model';

import { resolveStableById } from '../heya/stableCatalog';
import { STABLE_ARCHETYPE_BY_ID } from '../heya/stableArchetypeCatalog';
import { DivisionParticipant } from './types';
import { resolveCompetitiveFactor } from '../realism';

const randomNoise = (rng: RandomSource, amplitude: number): number =>
  (rng() * 2 - 1) * amplitude;

const resolveSignedStreak = (
  winStreak?: number,
  lossStreak?: number,
): number => {
  const wins = Math.max(0, winStreak ?? 0);
  const losses = Math.max(0, lossStreak ?? 0);
  return wins > 0 ? wins : losses > 0 ? -losses : 0;
};

const resolveStyleEdge = (
  mine: EnemyStyleBias | undefined,
  other: EnemyStyleBias | undefined,
): number => {
  if (!mine || !other || mine === 'BALANCE' || other === 'BALANCE' || mine === other) {
    return 0;
  }
  if (
    (mine === 'PUSH' && other === 'TECHNIQUE') ||
    (mine === 'TECHNIQUE' && other === 'GRAPPLE') ||
    (mine === 'GRAPPLE' && other === 'PUSH')
  ) {
    return 1.4;
  }
  return -1.4;
};

const resolveStablePerformanceFactor = (stableId: string): number => {
  const stable = resolveStableById(stableId);
  if (!stable) return 1;
  const training = STABLE_ARCHETYPE_BY_ID[stable.archetypeId]?.training;
  if (!training) return 1;
  const growth = training.growth8;
  const avg =
    (growth.tsuki + growth.oshi + growth.kumi + growth.nage + growth.koshi + growth.deashi + growth.waza + growth.power) / 8;
  return Math.max(0.9, Math.min(1.1, avg));
};

const resolveNpcWinProbability = (
  a: DivisionParticipant,
  b: DivisionParticipant,
  rng: RandomSource,
): number => {
  const aStreakMomentum = calculateMomentumBonus(
    resolveSignedStreak(a.currentWinStreak, a.currentLossStreak),
  );
  const bStreakMomentum = calculateMomentumBonus(
    resolveSignedStreak(b.currentWinStreak, b.currentLossStreak),
  );
  const aMomentum = (a.wins - a.losses) * 0.18 + aStreakMomentum;
  const bMomentum = (b.wins - b.losses) * 0.18 + bStreakMomentum;
  const boutNoiseAmplitude = BALANCE.strength.boutNoiseAmplitude;
  const aAbilityWithShock = (a.ability ?? a.power) + (a.bashoFormDelta ?? 0);
  const bAbilityWithShock = (b.ability ?? b.power) + (b.bashoFormDelta ?? 0);
  const styleDiff = resolveStyleEdge(a.styleBias, b.styleBias) - resolveStyleEdge(b.styleBias, a.styleBias);
  const aAbility = resolveUnifiedNpcStrength({
    ability: aAbilityWithShock,
    power: a.power,
    momentum: aMomentum,
    noise: randomNoise(rng, boutNoiseAmplitude),
  }) *
    resolveStablePerformanceFactor(a.stableId) *
    resolveCompetitiveFactor(a);
  const bAbility = resolveUnifiedNpcStrength({
    ability: bAbilityWithShock,
    power: b.power,
    momentum: bMomentum,
    noise: randomNoise(rng, boutNoiseAmplitude),
  }) *
    resolveStablePerformanceFactor(b.stableId) *
    resolveCompetitiveFactor(b);
  return resolveBoutWinProb({
    attackerAbility: aAbility,
    defenderAbility: bAbility,
    attackerStyle: a.styleBias,
    defenderStyle: b.styleBias,
    bonus: styleDiff,
    diffSoftCap: BALANCE.strength.npcDiffSoftCap,
  });
};

export const simulateNpcBout = (
  a: DivisionParticipant,
  b: DivisionParticipant,
  rng: RandomSource,
): void => {
  const applyFusenWin = (winner: DivisionParticipant, loser: DivisionParticipant): void => {
    const expectedWin = 0.96;
    winner.expectedWins = (winner.expectedWins ?? 0) + expectedWin;
    loser.expectedWins = (loser.expectedWins ?? 0) + (1 - expectedWin);
    winner.boutsSimulated = (winner.boutsSimulated ?? 0) + 1;
    loser.boutsSimulated = (loser.boutsSimulated ?? 0) + 1;
    winner.wins += 1;
    winner.currentWinStreak = (winner.currentWinStreak ?? 0) + 1;
    winner.currentLossStreak = 0;
    loser.currentLossStreak = 0;
    loser.currentWinStreak = 0;
  };
  if (a.bashoKyujo && b.bashoKyujo) {
    return;
  }
  if (a.bashoKyujo) {
    applyFusenWin(b, a);
    return;
  }
  if (b.bashoKyujo) {
    applyFusenWin(a, b);
    return;
  }
  if (!a.active && !b.active) {
    // 両者休場の場合は勝敗つかず
    return;
  }
  if (!a.active) {
    // aが休場 -> bの不戦勝
    b.wins += 1;
    a.losses += 1;
    b.currentWinStreak = (b.currentWinStreak ?? 0) + 1;
    b.currentLossStreak = 0;
    a.currentLossStreak = (a.currentLossStreak ?? 0) + 1;
    a.currentWinStreak = 0;
    return;
  }
  if (!b.active) {
    // bが休場 -> aの不戦勝
    a.wins += 1;
    b.losses += 1;
    a.currentWinStreak = (a.currentWinStreak ?? 0) + 1;
    a.currentLossStreak = 0;
    b.currentLossStreak = (b.currentLossStreak ?? 0) + 1;
    b.currentWinStreak = 0;
    return;
  }

  a.currentWinStreak = Math.max(0, a.currentWinStreak ?? 0);
  a.currentLossStreak = Math.max(0, a.currentLossStreak ?? 0);
  b.currentWinStreak = Math.max(0, b.currentWinStreak ?? 0);
  b.currentLossStreak = Math.max(0, b.currentLossStreak ?? 0);
  const aWinProbability = resolveNpcWinProbability(a, b, rng);
  const aAbility = resolveUnifiedNpcStrength({
    ability: (a.ability ?? a.power) + (a.bashoFormDelta ?? 0),
    power: a.power,
    momentum: (a.wins - a.losses) * 0.18 + calculateMomentumBonus(resolveSignedStreak(a.currentWinStreak, a.currentLossStreak)),
  }) * resolveCompetitiveFactor(a);
  const bAbility = resolveUnifiedNpcStrength({
    ability: (b.ability ?? b.power) + (b.bashoFormDelta ?? 0),
    power: b.power,
    momentum: (b.wins - b.losses) * 0.18 + calculateMomentumBonus(resolveSignedStreak(b.currentWinStreak, b.currentLossStreak)),
  }) * resolveCompetitiveFactor(b);
  a.expectedWins = (a.expectedWins ?? 0) + aWinProbability;
  b.expectedWins = (b.expectedWins ?? 0) + (1 - aWinProbability);
  a.opponentAbilityTotal = (a.opponentAbilityTotal ?? 0) + bAbility;
  b.opponentAbilityTotal = (b.opponentAbilityTotal ?? 0) + aAbility;
  a.boutsSimulated = (a.boutsSimulated ?? 0) + 1;
  b.boutsSimulated = (b.boutsSimulated ?? 0) + 1;

  const aWin = rng() < aWinProbability;
  if (aWin) {
    a.wins += 1;
    b.losses += 1;
    a.currentWinStreak = (a.currentWinStreak ?? 0) + 1;
    a.currentLossStreak = 0;
    b.currentLossStreak = (b.currentLossStreak ?? 0) + 1;
    b.currentWinStreak = 0;
  } else {
    b.wins += 1;
    a.losses += 1;
    b.currentWinStreak = (b.currentWinStreak ?? 0) + 1;
    b.currentLossStreak = 0;
    a.currentLossStreak = (a.currentLossStreak ?? 0) + 1;
    a.currentWinStreak = 0;
  }
};
