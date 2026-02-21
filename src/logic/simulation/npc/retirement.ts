import { RandomSource } from '../deps';
import { PersistentNpc } from './types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const computeRecentMakekoshiStreak = (npc: PersistentNpc): number => {
  const recent = npc.recentBashoResults.slice(-6);
  let streak = 0;
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    const record = recent[i];
    if (record.wins >= record.losses) break;
    streak += 1;
  }
  return streak;
};

const resolveRetirementChance = (npc: PersistentNpc): number => {
  if (npc.age >= 50) return 1;

  let chance = 0;
  if (npc.age >= 42) {
    chance += (npc.age - 41) * 0.015;
  }

  const effectivePower = npc.basePower * npc.form;
  if (effectivePower < 65) {
    chance += (65 - effectivePower) * 0.004;
  }

  const streak = computeRecentMakekoshiStreak(npc);
  if (streak >= 3) {
    chance += 0.08 + (streak - 3) * 0.03;
  }

  if (
    (npc.currentDivision === 'Jonokuchi' && npc.rankScore >= 46) ||
    (npc.currentDivision === 'Jonidan' && npc.rankScore >= 160) ||
    (npc.currentDivision === 'Sandanme' && npc.rankScore >= 160) ||
    (npc.currentDivision === 'Makushita' && npc.rankScore >= 96)
  ) {
    chance += 0.04;
  }

  return clamp(chance * npc.retirementBias, 0, 0.92);
};

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
    if (!npc.active) continue;

    npc.careerBashoCount += 1;
    npc.age = npc.entryAge + Math.floor(npc.careerBashoCount / 6);

    const chance = resolveRetirementChance(npc);
    if (chance >= 1 || rng() < chance) {
      npc.active = false;
      npc.retiredAtSeq = seq;
      retiredIds.push(npc.id);
    }
  }
  return retiredIds;
};
