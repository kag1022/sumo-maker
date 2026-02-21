import { NpcRegistry } from './types';

export type StableScale =
  | 'SUPER_GIANT'
  | 'GIANT'
  | 'LARGE'
  | 'MID'
  | 'SMALL'
  | 'TINY';

export interface StableDefinition {
  id: string;
  displayName: string;
  scale: StableScale;
  targetHeadcount: number;
  minPreferred: number;
  maxPreferred: number;
  hardCap?: number;
}

const SCALE_TARGET: Record<StableScale, number> = {
  SUPER_GIANT: 41,
  GIANT: 29,
  LARGE: 22,
  MID: 13,
  SMALL: 7,
  TINY: 4,
};

const SCALE_PREFERRED_RANGE: Record<StableScale, { min: number; max: number; hardCap?: number }> = {
  SUPER_GIANT: { min: 30, max: 60 },
  GIANT: { min: 25, max: 40 },
  LARGE: { min: 18, max: 26 },
  MID: { min: 10, max: 15 },
  SMALL: { min: 5, max: 9, hardCap: 9 },
  TINY: { min: 1, max: 4, hardCap: 4 },
};

const resolveScaleByOrdinal = (ordinal: number): StableScale => {
  if (ordinal === 1) return 'SUPER_GIANT';
  if (ordinal <= 5) return 'GIANT';
  if (ordinal <= 14) return 'LARGE';
  if (ordinal <= 29) return 'MID';
  if (ordinal <= 41) return 'SMALL';
  return 'TINY';
};

const buildStableDefinition = (ordinal: number): StableDefinition => {
  const scale = resolveScaleByOrdinal(ordinal);
  const range = SCALE_PREFERRED_RANGE[scale];
  return {
    id: `stable-${String(ordinal).padStart(3, '0')}`,
    displayName: `仮部屋${String(ordinal).padStart(2, '0')}`,
    scale,
    targetHeadcount: SCALE_TARGET[scale],
    minPreferred: range.min,
    maxPreferred: range.max,
    hardCap: range.hardCap,
  };
};

export const NPC_STABLE_CATALOG: StableDefinition[] = Array.from(
  { length: 45 },
  (_, index) => buildStableDefinition(index + 1),
);

const getAssignedCount = (assigned: Map<string, number>, stableId: string): number =>
  assigned.get(stableId) ?? 0;

const compareStableId = (a: StableDefinition, b: StableDefinition): number =>
  a.id.localeCompare(b.id);

const selectStableForInitialAssignment = (
  assigned: Map<string, number>,
): StableDefinition => {
  let best = NPC_STABLE_CATALOG[0];

  for (const candidate of NPC_STABLE_CATALOG) {
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

  const assigned = new Map<string, number>(NPC_STABLE_CATALOG.map((stable) => [stable.id, 0]));
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
  const counts = new Map<string, number>(NPC_STABLE_CATALOG.map((stable) => [stable.id, 0]));
  for (const npc of registry.values()) {
    if (!npc.active) continue;
    const current = counts.get(npc.stableId) ?? 0;
    counts.set(npc.stableId, current + 1);
  }
  return counts;
};

export const resolveStableForRecruit = (registry: NpcRegistry): string => {
  const counts = countActiveByStable(registry);
  const eligible = NPC_STABLE_CATALOG.filter((stable) => {
    if (typeof stable.hardCap !== 'number') return true;
    return (counts.get(stable.id) ?? 0) < stable.hardCap;
  });
  const pool = eligible.length > 0 ? eligible : NPC_STABLE_CATALOG;

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
