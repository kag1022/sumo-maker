import { RandomSource } from '../deps';
import { PersistentNpc } from './types';
import {
  computeConsecutiveMakekoshiStreak,
  resolveRetirementChance,
} from '../retirement/shared';
import { updateStagnationState } from '../realism';
import { PopulationPlan } from './populationPlanTypes';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const pushNpcBashoResult = (
  npc: PersistentNpc,
  wins: number,
  losses: number,
  options?: {
    absent?: number;
    rankName?: string;
    division?: PersistentNpc['currentDivision'];
  },
): void => {
  const absent = Math.max(0, Math.floor(options?.absent ?? 0));
  npc.recentBashoResults.push({
    division: options?.division ?? npc.currentDivision,
    rankName: options?.rankName,
    wins,
    losses,
    absent,
  });
  if (npc.recentBashoResults.length > 12) {
    npc.recentBashoResults = npc.recentBashoResults.slice(-12);
  }
  npc.stagnation = updateStagnationState(npc.stagnation, {
    wins,
    losses,
    absent,
    division: options?.division ?? npc.currentDivision,
    promotedToSekitori:
      (options?.division ?? npc.currentDivision) === 'Juryo' ||
      (options?.division ?? npc.currentDivision) === 'Makuuchi',
    careerBand: npc.careerBand,
  });
};

export const runNpcRetirementStep = (
  npcs: Iterable<PersistentNpc>,
  seq: number,
  rng: RandomSource,
  populationPlan?: PopulationPlan,
): string[] => {
  const retiredIds: string[] = [];
  const populationMultiplier = clamp(
    1 + (populationPlan?.annualRetirementShock ?? 0),
    0.35,
    1.6,
  );
  for (const npc of npcs) {
    if (npc.actorType === 'PLAYER') continue;
    if (!npc.active) continue;

    npc.careerBashoCount += 1;
    npc.age = npc.entryAge + Math.floor(npc.careerBashoCount / 6);

    const recentWins = npc.recentBashoResults.reduce((sum, row) => sum + row.wins, 0);
    const recentLosses = npc.recentBashoResults.reduce((sum, row) => sum + row.losses, 0);
    const recentAbsenceTotal = npc.recentBashoResults.reduce((sum, row) => sum + (row.absent ?? 0), 0);
    const careerWinRate = recentWins + recentLosses > 0
      ? recentWins / (recentWins + recentLosses)
      : 0.5;
    const consecutiveAbsence = npc.recentBashoResults.reduce((streak, row) => {
      if ((row.absent ?? 0) <= 0) return 0;
      return streak + 1;
    }, 0);
    const consecutiveMakekoshi = computeConsecutiveMakekoshiStreak(npc.recentBashoResults, 10);
    const recentUpperBashoCount = npc.recentBashoResults.reduce((count, row) => (
      row.division === 'Makuuchi' &&
      ['横綱', '大関', '関脇', '小結'].includes(row.rankName ?? '')
        ? count + 1
        : count
    ), 0);
    const recentOzekiYokozunaBashoCount = npc.recentBashoResults.reduce((count, row) => (
      row.division === 'Makuuchi' && ['横綱', '大関'].includes(row.rankName ?? '')
        ? count + 1
        : count
    ), 0);
    const baseChance = resolveRetirementChance({
      age: npc.age,
      injuryLevel: Math.max(0, Math.round((72 - npc.basePower * npc.form) / 8)),
      currentDivision: npc.currentDivision,
      isFormerSekitori: npc.division === 'Makuuchi' || npc.division === 'Juryo',
      consecutiveAbsence,
      consecutiveMakekoshi,
      profile: npc.retirementProfile ?? 'STANDARD',
      retirementBias: npc.retirementBias,
      careerBashoCount: npc.careerBashoCount,
      careerWinRate,
      stagnationPressure: npc.stagnation?.pressure ?? 0,
      careerBand: npc.careerBand,
      recentAbsenceTotal,
      recentUpperBashoCount,
      recentOzekiYokozunaBashoCount,
    });
    const chance = clamp(baseChance * populationMultiplier, 0, 1);
    if (chance >= 1 || rng() < chance) {
      npc.active = false;
      npc.retiredAtSeq = seq;
      retiredIds.push(npc.id);
    }
  }
  return retiredIds;
};
