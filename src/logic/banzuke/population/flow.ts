import { Division } from '../../models';
import { BanzukeDivisionPolicy } from '../types';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export interface VariableDivisionFlow {
  previous: number;
  promotedIn: number;
  demotedIn: number;
  promotedOut: number;
  demotedOut: number;
  retired: number;
}

export const DEFAULT_DIVISION_POLICIES: BanzukeDivisionPolicy[] = [
  { division: 'Makuuchi', capacityMode: 'FIXED', fixedSlots: 42 },
  { division: 'Juryo', capacityMode: 'FIXED', fixedSlots: 28 },
  { division: 'Makushita', capacityMode: 'FIXED', fixedSlots: 120 },
  { division: 'Sandanme', capacityMode: 'FIXED', fixedSlots: 180 },
  { division: 'Jonidan', capacityMode: 'VARIABLE', minSlots: 120, softMaxSlots: 320 },
  { division: 'Jonokuchi', capacityMode: 'VARIABLE', minSlots: 20, softMaxSlots: 140 },
  { division: 'Maezumo', capacityMode: 'VARIABLE', minSlots: 0, softMaxSlots: Number.MAX_SAFE_INTEGER },
];

export const resolveVariableHeadcountByFlow = (
  flow: VariableDivisionFlow,
  minSlots: number,
  softMaxSlots: number,
): number => {
  const nextRaw =
    flow.previous +
    flow.promotedIn +
    flow.demotedIn -
    flow.promotedOut -
    flow.demotedOut -
    flow.retired;
  return clamp(nextRaw, Math.max(0, minSlots), Math.max(minSlots, softMaxSlots));
};

export const resolveDivisionPolicyMap = (
  policies: BanzukeDivisionPolicy[] = DEFAULT_DIVISION_POLICIES,
): Map<Division, BanzukeDivisionPolicy> => {
  const map = new Map<Division, BanzukeDivisionPolicy>();
  for (const policy of policies) {
    map.set(policy.division, policy);
  }
  return map;
};

export const resolveTargetHeadcount = (
  division: Division,
  current: number,
  policyMap: Map<Division, BanzukeDivisionPolicy>,
): { min: number; max: number; target: number; fixed: boolean } => {
  const policy = policyMap.get(division);
  if (!policy) {
    return { min: 0, max: Number.MAX_SAFE_INTEGER, target: Math.max(0, current), fixed: false };
  }
  if (policy.capacityMode === 'FIXED') {
    const target = Math.max(0, policy.fixedSlots ?? current);
    return { min: target, max: target, target, fixed: true };
  }
  const min = Math.max(0, policy.minSlots ?? 0);
  const max = Math.max(min, policy.softMaxSlots ?? Number.MAX_SAFE_INTEGER);
  return { min, max, target: clamp(current, min, max), fixed: false };
};

