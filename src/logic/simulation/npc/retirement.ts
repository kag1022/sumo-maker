import { RandomSource } from '../deps';
import { PersistentNpc } from './types';
import {
  computeConsecutiveMakekoshiStreak,
} from '../retirement/shared';
import { resolveEmpiricalNpcRetirementHazard } from '../../calibration/npcRealismHeisei';
import { updateStagnationState } from '../realism';
// resolvePlannedCareerHazard: Fix-3 hazard wiring rolled back, kept for future re-enable
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { resolvePlannedCareerHazard as _resolvePlannedCareerHazard } from './plannedCareer';
import { PopulationPlan } from './populationPlanTypes';
import {
  getActiveNpcWorldCalibrationProfile,
  getNpcWorldCalibrationParameters,
} from './calibration/profile';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

// 平成期実データ (career_bashos: p10=4 / p50=32 / p90=89) に合わせた
// career-length hazard 曲線。序盤を守りすぎると 2-12 場所引退が消え、
// 25-72 場所に過剰滞留するため、短期退場は許容しつつ中堅期の刈り取りを緩める。
const resolveCareerLengthHazardMultiplier = (careerBashoCount: number): number => {
  if (careerBashoCount <= 1) return 0.20;
  if (careerBashoCount <= 3) return 1.70;
  if (careerBashoCount <= 6) return 1.85;
  if (careerBashoCount <= 12) return 0.75;
  if (careerBashoCount <= 24) return 0.42;
  if (careerBashoCount <= 48) return 0.20;
  if (careerBashoCount <= 72) return 0.17;
  if (careerBashoCount <= 96) return 0.30;
  return 0.45;
};

const resolveEarlyWashoutBonus = (npc: PersistentNpc): number => {
  if (npc.currentDivision === 'Makuuchi' || npc.currentDivision === 'Juryo') return 0;
  if (npc.careerBashoCount > 12) return 0;
  const divisionBase =
    npc.currentDivision === 'Jonokuchi' || npc.currentDivision === 'Maezumo'
      ? 1
      : npc.currentDivision === 'Jonidan'
        ? 0.72
        : npc.currentDivision === 'Sandanme'
          ? 0.38
          : 0.18;
  const phaseBase =
    npc.careerBashoCount <= 1
      ? 0
      : npc.careerBashoCount <= 3
        ? 0.300
        : npc.careerBashoCount <= 6
          ? 0.240
          : 0.022;
  const careerBandMultiplier =
    npc.careerBand === 'WASHOUT'
      ? 1.45
      : npc.careerBand === 'GRINDER'
        ? 1.15
        : npc.careerBand === 'STRONG' || npc.careerBand === 'ELITE'
          ? 0.45
          : 1;
  return phaseBase * divisionBase * careerBandMultiplier;
};

export const pushNpcBashoResult = (
  npc: PersistentNpc,
  wins: number,
  losses: number,
  options?: {
    absent?: number;
    rankName?: string;
    rankNumber?: number;
    division?: PersistentNpc['currentDivision'];
  },
): void => {
  const absent = Math.max(0, Math.floor(options?.absent ?? 0));
  npc.recentBashoResults.push({
    division: options?.division ?? npc.currentDivision,
    rankName: options?.rankName,
    rankNumber: options?.rankNumber,
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
    const baseChance = resolveEmpiricalNpcRetirementHazard({
      age: npc.age,
      currentDivision: npc.currentDivision,
      currentRankScore: npc.rankScore,
      recentBashoResults: npc.recentBashoResults,
      formerSekitori:
        npc.currentDivision === 'Makuuchi' ||
        npc.currentDivision === 'Juryo' ||
        npc.recentBashoResults.some(
          (row) => row.division === 'Makuuchi' || row.division === 'Juryo',
        ),
      annualRetirementShock: populationPlan?.annualRetirementShock ?? 0,
    });
    const adjustment =
      1 +
      Math.max(0, consecutiveAbsence - 4) * 0.03 +
      Math.max(0, consecutiveMakekoshi - 5) * 0.015 +
      Math.max(0, recentAbsenceTotal - 6) * 0.004 +
      Math.max(0, recentUpperBashoCount - 6) * 0.004 +
      Math.max(0, recentOzekiYokozunaBashoCount - 3) * 0.005 +
      Math.max(0, 0.48 - careerWinRate) * 0.18;
    const profile = getActiveNpcWorldCalibrationProfile();
    const profileParams = getNpcWorldCalibrationParameters(profile);
    const careerLengthScale = profileParams.careerLengthHazardScale ?? 1;
    const earlyWashoutScale = profileParams.earlyWashoutBonusScale ?? 1;
    const careerLengthMultiplier =
      resolveCareerLengthHazardMultiplier(npc.careerBashoCount) * careerLengthScale;
    // Fix-3 (rollback): plannedCareerBasho は個体差付与のために生成・保持するが、
    // 退場 hazard には寄与させない。MC report で関取率・三役率が大幅な過剰になる
    // 副作用が観測されたため、hazard 寄与は将来別タスクで設計し直す。
    // resolvePlannedCareerHazard / plannedCareer.ts は維持して将来の wiring に備える。
    const earlyWashoutBonus = resolveEarlyWashoutBonus(npc) * earlyWashoutScale;
    const populationShockBonus = (populationPlan?.annualRetirementShock ?? 0) * 0.02;
    const chance = clamp(
      baseChance * adjustment * careerLengthMultiplier + earlyWashoutBonus + populationShockBonus,
      0,
      1,
    );
    if (chance >= 1 || rng() < chance) {
      npc.active = false;
      npc.retiredAtSeq = seq;
      retiredIds.push(npc.id);
    }
  }
  return retiredIds;
};
