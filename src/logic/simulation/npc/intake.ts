import { RandomSource } from '../deps';
import { createMaezumoRecruit } from './factory';
import { resolveStableForRecruit } from './stableCatalog';
import { NpcUniverse, PersistentNpc } from './types';

const ACTIVE_SOFT_MIN = 630;
const ACTIVE_HARD_MAX = 900;

const randomInt = (rng: RandomSource, min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));

export const resolveMonthlyBaseIntake = (month: number, rng: RandomSource): number => {
  if (month === 3) return randomInt(rng, 50, 80);
  if (month === 5) return randomInt(rng, 10, 20);
  return randomInt(rng, 3, 8);
};

export const resolveIntakeCount = (
  month: number,
  activeCount: number,
  rng: RandomSource,
): number => {
  if (activeCount >= ACTIVE_HARD_MAX) return 0;
  const base = resolveMonthlyBaseIntake(month, rng);
  const recovery = activeCount < ACTIVE_SOFT_MIN ? Math.ceil((ACTIVE_SOFT_MIN - activeCount) / 2) : 0;
  const raw = base + recovery;
  return Math.max(0, Math.min(raw, ACTIVE_HARD_MAX - activeCount));
};

export const intakeNewNpcRecruits = (
  universe: Pick<NpcUniverse, 'registry' | 'maezumoPool' | 'nameContext' | 'nextNpcSerial'>,
  seq: number,
  month: number,
  activeCount: number,
  rng: RandomSource,
): { recruits: PersistentNpc[]; nextNpcSerial: number } => {
  const count = resolveIntakeCount(month, activeCount, rng);
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
