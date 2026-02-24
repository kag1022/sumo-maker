import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from '../providers/expected/types';

export interface OptimizerQuantileTarget {
  p10: number;
  p50: number;
  p90: number;
}

export interface OptimizerPressureSnapshot {
  global: number;
  byDivision: Map<string, number>;
}

export interface OptimizerRow {
  id: string;
  candidate: ExpectedPlacementCandidate;
  minSlot: number;
  maxSlot: number;
  priority: number;
  quantiles: OptimizerQuantileTarget;
  costAt: (slot: number) => number;
}

export interface OptimizerSolveResult {
  assignments: ExpectedPlacementAssignment[];
  objective: number;
}

