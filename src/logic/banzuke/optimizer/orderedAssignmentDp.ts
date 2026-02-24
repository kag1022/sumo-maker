import { OptimizerRow, OptimizerSolveResult } from './types';

const INF = Number.POSITIVE_INFINITY;

const isFiniteCost = (value: number): boolean =>
  Number.isFinite(value) && value < INF;

export const solveOrderedAssignmentDp = (
  rows: OptimizerRow[],
  totalSlots: number,
): OptimizerSolveResult | null => {
  if (!rows.length) {
    return { assignments: [], objective: 0 };
  }
  if (totalSlots <= 0 || rows.length > totalSlots) {
    return null;
  }

  const n = rows.length;
  const parents: Int32Array[] = Array.from(
    { length: n },
    () => new Int32Array(totalSlots + 1).fill(-1),
  );
  let prev = new Float64Array(totalSlots + 1);
  prev.fill(INF);

  for (let slot = 1; slot <= totalSlots; slot += 1) {
    if (slot < rows[0].minSlot || slot > rows[0].maxSlot) continue;
    const base = rows[0].costAt(slot);
    if (isFiniteCost(base)) prev[slot] = base;
  }

  for (let i = 1; i < n; i += 1) {
    const next = new Float64Array(totalSlots + 1);
    next.fill(INF);

    let bestPrev = INF;
    let bestPrevSlot = -1;
    for (let slot = 1; slot <= totalSlots; slot += 1) {
      const prevSlot = slot - 1;
      if (prevSlot >= 1 && prev[prevSlot] < bestPrev) {
        bestPrev = prev[prevSlot];
        bestPrevSlot = prevSlot;
      }
      if (bestPrevSlot < 0 || !isFiniteCost(bestPrev)) continue;
      if (slot < rows[i].minSlot || slot > rows[i].maxSlot) continue;
      const slotCost = rows[i].costAt(slot);
      if (!isFiniteCost(slotCost)) continue;
      const total = bestPrev + slotCost;
      if (total < next[slot]) {
        next[slot] = total;
        parents[i][slot] = bestPrevSlot;
      }
    }

    prev = next;
  }

  let bestFinalCost = INF;
  let bestFinalSlot = -1;
  for (let slot = 1; slot <= totalSlots; slot += 1) {
    const total = prev[slot];
    if (!isFiniteCost(total)) continue;
    if (total < bestFinalCost) {
      bestFinalCost = total;
      bestFinalSlot = slot;
    }
  }
  if (bestFinalSlot < 0) return null;

  const assignedSlots = new Array<number>(n);
  assignedSlots[n - 1] = bestFinalSlot;
  for (let i = n - 1; i >= 1; i -= 1) {
    const parent = parents[i][assignedSlots[i]];
    if (parent < 0) return null;
    assignedSlots[i - 1] = parent;
  }

  return {
    assignments: rows.map((row, idx) => ({ id: row.id, slot: assignedSlots[idx] })),
    objective: bestFinalCost,
  };
};

