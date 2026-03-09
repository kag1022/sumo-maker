import { RandomSource } from '../deps';
import { PersistentNpc } from './types';
import {
  computeConsecutiveMakekoshiStreak,
  resolveRetirementChance,
} from '../retirement/shared';

export const pushNpcBashoResult = (
  npc: PersistentNpc,
  wins: number,
  losses: number,
): void => {
  npc.recentBashoResults.push({
    division: npc.currentDivision,
    wins,
    losses,
  });
  if (npc.recentBashoResults.length > 12) {
    npc.recentBashoResults = npc.recentBashoResults.slice(-12);
  }
};

export const runNpcRetirementStep = (
  npcs: Iterable<PersistentNpc>,
  seq: number,
  rng: RandomSource,
): string[] => {
  const retiredIds: string[] = [];
  for (const npc of npcs) {
    if (npc.actorType === 'PLAYER') continue;
    if (!npc.active) continue;

    npc.careerBashoCount += 1;
    npc.age = npc.entryAge + Math.floor(npc.careerBashoCount / 6);

    const recentWins = npc.recentBashoResults.reduce((sum, row) => sum + row.wins, 0);
    const recentLosses = npc.recentBashoResults.reduce((sum, row) => sum + row.losses, 0);
    const careerWinRate = recentWins + recentLosses > 0
      ? recentWins / (recentWins + recentLosses)
      : 0.5;
    const consecutiveMakekoshi = computeConsecutiveMakekoshiStreak(npc.recentBashoResults, 10);
    const chance = resolveRetirementChance({
      age: npc.age,
      injuryLevel: Math.max(0, Math.round((72 - npc.basePower * npc.form) / 8)),
      currentDivision: npc.currentDivision,
      isFormerSekitori: npc.division === 'Makuuchi' || npc.division === 'Juryo',
      consecutiveAbsence: 0,
      consecutiveMakekoshi,
      profile: npc.retirementProfile ?? 'STANDARD',
      retirementBias: npc.retirementBias,
      careerBashoCount: npc.careerBashoCount,
      careerWinRate,
    });
    if (chance >= 1 || rng() < chance) {
      npc.active = false;
      npc.retiredAtSeq = seq;
      retiredIds.push(npc.id);
    }
  }
  return retiredIds;
};
