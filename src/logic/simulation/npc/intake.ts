import { RandomSource } from '../deps';
import { createMaezumoRecruit } from './factory';
import {
  resolveMonthlyIntakePulse,
  resolveMonthlyPopulationBaseIntake,
  resolvePopulationPressure,
} from './populationPlan';
import { PopulationPlan } from './populationPlanTypes';
import { resolveStableForRecruit } from './stableCatalog';
import { NpcUniverse, PersistentNpc } from './types';
const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const resolveMonthlyBaseIntake = (month: number, rng: RandomSource): number => {
  return resolveMonthlyPopulationBaseIntake(month, rng);
};

export const resolveIntakeCount = (
  month: number,
  currentBanzukeHeadcount: number,
  populationPlan: PopulationPlan | undefined,
  rng: RandomSource,
): number => {
  if (!populationPlan) return resolveMonthlyBaseIntake(month, rng);
  const base = resolveMonthlyBaseIntake(month, rng);
  const seasonalPulse = resolveMonthlyIntakePulse(month);
  const headcountPressure = resolvePopulationPressure(
    month,
    currentBanzukeHeadcount,
    populationPlan,
  );
  const pressureRatio = clamp(
    headcountPressure / Math.max(12, populationPlan.sampledTotalSwing || 12),
    -1,
    1,
  );
  const multiplier = clamp(
    1 +
      populationPlan.annualIntakeShock +
      seasonalPulse * 0.18 * populationPlan.lowerDivisionElasticity +
      pressureRatio * 0.26,
    0.25,
    2.2,
  );
  const noise = Math.round(populationPlan.sampledTotalSwing * 0.05 * (rng() * 2 - 1));
  const residualCap = Math.max(0, populationPlan.annualIntakeHardCap - currentBanzukeHeadcount);
  return clamp(Math.round(base * multiplier + noise), 0, residualCap);
};

export const intakeNewNpcRecruits = (
  universe: Pick<NpcUniverse, 'registry' | 'maezumoPool' | 'nameContext' | 'nextNpcSerial'>,
  seq: number,
  month: number,
  currentBanzukeHeadcount: number,
  populationPlan: PopulationPlan | undefined,
  rng: RandomSource,
): { recruits: PersistentNpc[]; nextNpcSerial: number } => {
  const count = resolveIntakeCount(month, currentBanzukeHeadcount, populationPlan, rng);
  if (count <= 0) {
    return { recruits: [], nextNpcSerial: universe.nextNpcSerial };
  }

  const serialCursor = { value: universe.nextNpcSerial };
  const recruits: PersistentNpc[] = [];
  for (let i = 0; i < count; i += 1) {
    const stableId = resolveStableForRecruit(universe.registry);
    const npc = createMaezumoRecruit(
      rng,
      seq,
      serialCursor,
      universe.registry,
      universe.nameContext,
      stableId,
    );
    universe.maezumoPool.push(npc);
    recruits.push(npc);
  }

  return { recruits, nextNpcSerial: serialCursor.value };
};
