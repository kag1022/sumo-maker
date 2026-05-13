import { ExpectedPlacementAssignment, ExpectedPlacementCandidate } from '../providers/expected/types';
import {
  hasDuplicateAssignments,
  hasOrderedSlotViolation,
  orderExpectedPlacementCandidates,
} from '../providers/expected/order';
import { resolveEffectiveLosses, shouldEnforceRecordDirection } from '../providers/expected/direction';
import { buildOptimizerRows } from './objective';
import { solveOrderedAssignmentDp } from './orderedAssignmentDp';
import { resolveOptimizerPressure } from './pressure';
import {
  OptimizerCostBreakdown,
  OptimizerPressureSnapshot,
  OptimizerQuantileTarget,
} from './types';

export interface OptimizerCandidateTrace {
  id: string;
  sourceDivision: string;
  wins: number;
  losses: number;
  absent: number;
  currentSlot: number;
  expectedSlot: number;
  minSlot: number;
  maxSlot: number;
  assignedSlot?: number;
  assignmentDelta?: number;
  score: number;
  priority: number;
  rankBand?: string;
  recordBucket?: string;
  proposalBasis?: string;
  quantiles: OptimizerQuantileTarget;
  pressure: number;
  costAtExpected: number;
  costAtAssigned?: number;
  expectedCostBreakdown?: OptimizerCostBreakdown;
  assignedCostBreakdown?: OptimizerCostBreakdown;
}

export interface OptimizerPlacementTrace {
  assignmentSource: 'dp' | 'none';
  totalSlots: number;
  objective?: number;
  failureReason?: string;
  pressure: {
    global: number;
    byDivision: Record<string, number>;
  };
  assignments?: ExpectedPlacementAssignment[];
  candidates: OptimizerCandidateTrace[];
}

const violatesCandidateHardRules = (
  assignment: ExpectedPlacementAssignment,
  candidate: ExpectedPlacementCandidate,
): boolean => {
  if (assignment.slot < candidate.minSlot || assignment.slot > candidate.maxSlot) return true;
  const effectiveLosses = resolveEffectiveLosses(candidate);
  const enforceRecordDirection = shouldEnforceRecordDirection(candidate);
  if (enforceRecordDirection && candidate.wins > effectiveLosses && assignment.slot > candidate.currentSlot) return true;
  if (enforceRecordDirection && candidate.wins < effectiveLosses && assignment.slot < candidate.currentSlot) return true;
  if (candidate.mandatoryPromotion && assignment.slot >= candidate.currentSlot) return true;
  if (candidate.mandatoryDemotion && assignment.slot <= candidate.currentSlot) return true;
  return false;
};

export const optimizeExpectedPlacements = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
): ExpectedPlacementAssignment[] | undefined => {
  if (!candidates.length || totalSlots <= 0) return [];

  const orderedCandidates = orderExpectedPlacementCandidates(candidates);
  const pressure = resolveOptimizerPressure(orderedCandidates);
  const rows = buildOptimizerRows(orderedCandidates, pressure);
  const solved = solveOrderedAssignmentDp(rows, totalSlots);
  if (!solved) return undefined;

  const byId = new Map(orderedCandidates.map((candidate) => [candidate.id, candidate]));
  if (hasDuplicateAssignments(solved.assignments)) return undefined;
  for (const assignment of solved.assignments) {
    const candidate = byId.get(assignment.id);
    if (!candidate) return undefined;
    if (violatesCandidateHardRules(assignment, candidate)) return undefined;
  }
  if (hasOrderedSlotViolation(orderedCandidates, solved.assignments)) return undefined;

  return solved.assignments;
};

const serializePressure = (
  pressure: OptimizerPressureSnapshot,
): OptimizerPlacementTrace['pressure'] => ({
  global: pressure.global,
  byDivision: Object.fromEntries(pressure.byDivision.entries()),
});

const buildCandidateTrace = (
  rows: ReturnType<typeof buildOptimizerRows>,
  pressure: OptimizerPressureSnapshot,
  assignments?: ExpectedPlacementAssignment[],
): OptimizerCandidateTrace[] => {
  const assignedById = new Map((assignments ?? []).map((assignment) => [assignment.id, assignment.slot]));
  return rows.map((row) => {
    const assignedSlot = assignedById.get(row.id);
    const expectedCostBreakdown = row.costBreakdownAt?.(row.candidate.expectedSlot);
    const assignedCostBreakdown = assignedSlot === undefined
      ? undefined
      : row.costBreakdownAt?.(assignedSlot);
    return {
      id: row.id,
      sourceDivision: row.candidate.sourceDivision,
      wins: row.candidate.wins,
      losses: row.candidate.losses,
      absent: row.candidate.absent,
      currentSlot: row.candidate.currentSlot,
      expectedSlot: row.candidate.expectedSlot,
      minSlot: row.minSlot,
      maxSlot: row.maxSlot,
      assignedSlot,
      assignmentDelta: assignedSlot === undefined ? undefined : assignedSlot - row.candidate.expectedSlot,
      score: row.candidate.score,
      priority: row.priority,
      rankBand: row.candidate.rankBand,
      recordBucket: row.candidate.recordBucket,
      proposalBasis: row.candidate.proposalBasis,
      quantiles: row.quantiles,
      pressure: pressure.byDivision.get(row.candidate.sourceDivision) ?? pressure.global,
      costAtExpected: row.costAt(row.candidate.expectedSlot),
      costAtAssigned: assignedSlot === undefined ? undefined : row.costAt(assignedSlot),
      expectedCostBreakdown,
      assignedCostBreakdown,
    };
  });
};

export const optimizeExpectedPlacementsWithTrace = (
  candidates: ExpectedPlacementCandidate[],
  totalSlots: number,
): OptimizerPlacementTrace => {
  if (!candidates.length || totalSlots <= 0) {
    return {
      assignmentSource: 'dp',
      totalSlots,
      objective: 0,
      pressure: { global: 0, byDivision: {} },
      assignments: [],
      candidates: [],
    };
  }

  const orderedCandidates = orderExpectedPlacementCandidates(candidates);
  const pressure = resolveOptimizerPressure(orderedCandidates);
  const rows = buildOptimizerRows(orderedCandidates, pressure);
  const solved = solveOrderedAssignmentDp(rows, totalSlots);
  if (!solved) {
    return {
      assignmentSource: 'none',
      totalSlots,
      failureReason: 'DP_UNSOLVED',
      pressure: serializePressure(pressure),
      candidates: buildCandidateTrace(rows, pressure),
    };
  }

  const byId = new Map(orderedCandidates.map((candidate) => [candidate.id, candidate]));
  if (hasDuplicateAssignments(solved.assignments)) {
    return {
      assignmentSource: 'none',
      totalSlots,
      objective: solved.objective,
      failureReason: 'DUPLICATE_ASSIGNMENT',
      pressure: serializePressure(pressure),
      assignments: solved.assignments,
      candidates: buildCandidateTrace(rows, pressure, solved.assignments),
    };
  }
  for (const assignment of solved.assignments) {
    const candidate = byId.get(assignment.id);
    if (!candidate) {
      return {
        assignmentSource: 'none',
        totalSlots,
        objective: solved.objective,
        failureReason: 'UNKNOWN_CANDIDATE',
        pressure: serializePressure(pressure),
        assignments: solved.assignments,
        candidates: buildCandidateTrace(rows, pressure, solved.assignments),
      };
    }
    if (violatesCandidateHardRules(assignment, candidate)) {
      return {
        assignmentSource: 'none',
        totalSlots,
        objective: solved.objective,
        failureReason: `HARD_RULE:${assignment.id}`,
        pressure: serializePressure(pressure),
        assignments: solved.assignments,
        candidates: buildCandidateTrace(rows, pressure, solved.assignments),
      };
    }
  }
  if (hasOrderedSlotViolation(orderedCandidates, solved.assignments)) {
    return {
      assignmentSource: 'none',
      totalSlots,
      objective: solved.objective,
      failureReason: 'ORDERED_SLOT_VIOLATION',
      pressure: serializePressure(pressure),
      assignments: solved.assignments,
      candidates: buildCandidateTrace(rows, pressure, solved.assignments),
    };
  }

  return {
    assignmentSource: 'dp',
    totalSlots,
    objective: solved.objective,
    pressure: serializePressure(pressure),
    assignments: solved.assignments,
    candidates: buildCandidateTrace(rows, pressure, solved.assignments),
  };
};
