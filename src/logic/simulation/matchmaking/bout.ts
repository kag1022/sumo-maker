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
import { recordBoutWinProbSnapshot } from '../diagnostics';
import type { Division } from '../../models';

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
  const aScoreMomentum = (a.wins - a.losses) * 0.18;
  const bScoreMomentum = (b.wins - b.losses) * 0.18;
  const aMomentum = aScoreMomentum + aStreakMomentum;
  const bMomentum = bScoreMomentum + bStreakMomentum;
  const boutNoiseAmplitude = BALANCE.strength.boutNoiseAmplitude;
  const aAbilityWithShock = (a.ability ?? a.power) + (a.bashoFormDelta ?? 0);
  const bAbilityWithShock = (b.ability ?? b.power) + (b.bashoFormDelta ?? 0);
  const styleDiff = resolveStyleEdge(a.styleBias, b.styleBias) - resolveStyleEdge(b.styleBias, a.styleBias);
  const aNoise = randomNoise(rng, boutNoiseAmplitude);
  const bNoise = randomNoise(rng, boutNoiseAmplitude);
  const aStableFactor = resolveStablePerformanceFactor(a.stableId);
  const bStableFactor = resolveStablePerformanceFactor(b.stableId);
  const aCompetitiveFactor = resolveCompetitiveFactor(a);
  const bCompetitiveFactor = resolveCompetitiveFactor(b);
  const aAbility = resolveUnifiedNpcStrength({
    ability: aAbilityWithShock,
    power: a.power,
    momentum: aMomentum,
    noise: aNoise,
  }) *
    aStableFactor *
    aCompetitiveFactor;
  const bAbility = resolveUnifiedNpcStrength({
    ability: bAbilityWithShock,
    power: b.power,
    momentum: bMomentum,
    noise: bNoise,
  }) *
    bStableFactor *
    bCompetitiveFactor;
  const winProbInput = {
    attackerAbility: aAbility,
    defenderAbility: bAbility,
    attackerStyle: a.styleBias,
    defenderStyle: b.styleBias,
    bonus: styleDiff,
    diffSoftCap: BALANCE.strength.npcDiffSoftCap,
  };
  const probability = resolveBoutWinProb(winProbInput);
  const division = 'division' in a ? (a as DivisionParticipant & { division?: Division }).division : undefined;
  recordBoutWinProbSnapshot({
    source: 'NPC_BOUT',
    call: 'NPC_MAIN',
    division,
    ...winProbInput,
    probability,
    npc: {
      aAbilityBeforeProbability: aAbility,
      bAbilityBeforeProbability: bAbility,
      aBashoFormDelta: a.bashoFormDelta ?? 0,
      bBashoFormDelta: b.bashoFormDelta ?? 0,
      aStableFactor,
      bStableFactor,
      aCompetitiveFactor,
      bCompetitiveFactor,
      aNoise,
      bNoise,
      aScoreMomentum,
      bScoreMomentum,
      aStreakMomentum,
      bStreakMomentum,
      aExpectedWinsBefore: a.expectedWins ?? 0,
      bExpectedWinsBefore: b.expectedWins ?? 0,
      aKyujo: Boolean(a.bashoKyujo || !a.active),
      bKyujo: Boolean(b.bashoKyujo || !b.active),
      fusen: false,
    },
  });
  return probability;
};

export const applyNpcFusenBout = (
  winner: DivisionParticipant,
  loser: DivisionParticipant,
): void => {
  // 不戦は星取だけを動かし、期待勝数・相手強度・試行数は実際に取った一番だけに限定する。
  winner.wins += 1;
  loser.losses += 1;
  winner.currentWinStreak = (winner.currentWinStreak ?? 0) + 1;
  winner.currentLossStreak = 0;
  loser.currentLossStreak = (loser.currentLossStreak ?? 0) + 1;
  loser.currentWinStreak = 0;
};

export const simulateNpcBout = (
  a: DivisionParticipant,
  b: DivisionParticipant,
  rng: RandomSource,
): {
  aWon?: boolean;
  aWinProbability?: number;
  aAbility?: number;
  bAbility?: number;
  fusen?: boolean;
} | null => {
  if (a.bashoKyujo && b.bashoKyujo) {
    return null;
  }
  if (a.bashoKyujo) {
    applyNpcFusenBout(b, a);
    return { aWon: false, aWinProbability: 0.04, fusen: true };
  }
  if (b.bashoKyujo) {
    applyNpcFusenBout(a, b);
    return { aWon: true, aWinProbability: 0.96, fusen: true };
  }
  if (!a.active && !b.active) {
    // 両者休場の場合は勝敗つかず
    return null;
  }
  if (!a.active) {
    // aが休場 -> bの不戦勝
    applyNpcFusenBout(b, a);
    return { aWon: false, aWinProbability: 0.04, fusen: true };
  }
  if (!b.active) {
    // bが休場 -> aの不戦勝
    applyNpcFusenBout(a, b);
    return { aWon: true, aWinProbability: 0.96, fusen: true };
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
  return {
    aWon: aWin,
    aWinProbability,
    aAbility,
    bAbility,
    fusen: false,
  };
};

export const applyNpcDoubleKyujo = (
  _a: DivisionParticipant,
  _b: DivisionParticipant,
): void => undefined;
