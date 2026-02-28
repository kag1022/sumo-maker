import { IchimonId } from '../../models';
import {
  STABLE_CATALOG,
  StableDefinition,
  resolveStableById,
} from '../heya/stableCatalog';
import { NpcRegistry } from './types';

export type { StableScale } from '../heya/stableCatalog';
export type { StableDefinition } from '../heya/stableCatalog';
export type { IchimonId } from '../../models';
export { STABLE_CATALOG as NPC_STABLE_CATALOG };

export const resolveIchimonByStableId = (stableId: string): IchimonId =>
  resolveStableById(stableId)?.ichimonId ?? 'TAIJU';

const getAssignedCount = (assigned: Map<string, number>, stableId: string): number =>
  assigned.get(stableId) ?? 0;

const compareStableId = (a: StableDefinition, b: StableDefinition): number =>
  a.id.localeCompare(b.id);

const selectStableForInitialAssignment = (
  assigned: Map<string, number>,
): StableDefinition => {
  let best = STABLE_CATALOG[0];

  for (const candidate of STABLE_CATALOG) {
    const candidateAssigned = getAssignedCount(assigned, candidate.id);
    const bestAssigned = getAssignedCount(assigned, best.id);
    const candidateRemaining = candidate.targetHeadcount - candidateAssigned;
    const bestRemaining = best.targetHeadcount - bestAssigned;

    if (candidateRemaining !== bestRemaining) {
      if (candidateRemaining > bestRemaining) {
        best = candidate;
      }
      continue;
    }

    const candidateRatio = candidateAssigned / candidate.targetHeadcount;
    const bestRatio = bestAssigned / best.targetHeadcount;
    if (candidateRatio !== bestRatio) {
      if (candidateRatio < bestRatio) {
        best = candidate;
      }
      continue;
    }

    if (compareStableId(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best;
};

export const buildInitialStableAssignmentSequence = (total: number): string[] => {
  if (total <= 0) return [];

  const assigned = new Map<string, number>(STABLE_CATALOG.map((stable) => [stable.id, 0]));
  const sequence: string[] = [];

  for (let i = 0; i < total; i += 1) {
    const stable = selectStableForInitialAssignment(assigned);
    const current = getAssignedCount(assigned, stable.id);
    assigned.set(stable.id, current + 1);
    sequence.push(stable.id);
  }

  return sequence;
};

export const countActiveByStable = (registry: NpcRegistry): Map<string, number> => {
  const counts = new Map<string, number>(STABLE_CATALOG.map((stable) => [stable.id, 0]));
  for (const npc of registry.values()) {
    if (!npc.active) continue;
    const current = counts.get(npc.stableId) ?? 0;
    counts.set(npc.stableId, current + 1);
  }
  return counts;
};

export const resolveStableForRecruit = (registry: NpcRegistry): string => {
  const counts = countActiveByStable(registry);
  const eligible = STABLE_CATALOG.filter((stable) => {
    if (typeof stable.hardCap !== 'number') return true;
    return (counts.get(stable.id) ?? 0) < stable.hardCap;
  });
  const pool = eligible.length > 0 ? eligible : STABLE_CATALOG;

  let best = pool[0];
  for (const candidate of pool) {
    const candidateCount = counts.get(candidate.id) ?? 0;
    const bestCount = counts.get(best.id) ?? 0;
    const candidateScore = candidateCount / candidate.targetHeadcount;
    const bestScore = bestCount / best.targetHeadcount;

    if (candidateScore !== bestScore) {
      if (candidateScore < bestScore) {
        best = candidate;
      }
      continue;
    }

    if (candidateCount !== bestCount) {
      if (candidateCount < bestCount) {
        best = candidate;
      }
      continue;
    }

    if (compareStableId(candidate, best) < 0) {
      best = candidate;
    }
  }

  return best.id;
};
