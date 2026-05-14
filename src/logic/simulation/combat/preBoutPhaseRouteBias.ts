import type { WinRoute } from '../../models';
import type { BoutPressureContext } from '../basho/formatPolicy';
import {
  PRE_BOUT_PHASES,
  type PreBoutPhase,
  type PreBoutPhaseWeights,
} from './preBoutPhase';

export type PreBoutPhaseRouteBiasExperimentMode =
  | 'OFF'
  | 'DIAGNOSTIC'
  | 'ENABLED';

export type PreBoutPhaseConfidenceBucket =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH';

export interface PreBoutPhaseConfidence {
  readonly dominantPhase: PreBoutPhase;
  readonly confidence: number;
  readonly margin: number;
  readonly bucket: PreBoutPhaseConfidenceBucket;
}

export interface PreBoutPhaseRouteBiasInput {
  readonly mode: PreBoutPhaseRouteBiasExperimentMode;
  readonly phaseWeights?: PreBoutPhaseWeights;
  readonly routeCandidates: readonly WinRoute[];
  readonly pressure?: Partial<BoutPressureContext>;
}

export interface PreBoutPhaseRouteBiasOutput {
  readonly applied: boolean;
  readonly phaseConfidence?: PreBoutPhaseConfidence;
  readonly multipliers: Partial<Record<WinRoute, number>>;
  readonly reasonTags: readonly string[];
}

const ALL_ROUTES: readonly WinRoute[] = [
  'PUSH_OUT',
  'BELT_FORCE',
  'THROW_BREAK',
  'PULL_DOWN',
  'EDGE_REVERSAL',
  'REAR_FINISH',
  'LEG_ATTACK',
] as const;

const MIN_MULTIPLIER = 0.7;
const MAX_MULTIPLIER = 1.15;

type RouteMultiplierTable = Partial<Record<
  PreBoutPhase,
  Partial<Record<PreBoutPhaseConfidenceBucket, Record<WinRoute, number>>>
>>;

const NEUTRAL_ROUTE_MULTIPLIERS: Record<WinRoute, number> = {
  PUSH_OUT: 1,
  BELT_FORCE: 1,
  THROW_BREAK: 1,
  PULL_DOWN: 1,
  EDGE_REVERSAL: 1,
  REAR_FINISH: 1,
  LEG_ATTACK: 1,
};

const ROUTE_MULTIPLIER_TABLE: RouteMultiplierTable = {
  THRUST_BATTLE: {
    MEDIUM: {
      PUSH_OUT: 1.04,
      BELT_FORCE: 0.94,
      THROW_BREAK: 0.94,
      PULL_DOWN: 1.04,
      EDGE_REVERSAL: 1,
      REAR_FINISH: 0.95,
      LEG_ATTACK: 0.94,
    },
    HIGH: {
      PUSH_OUT: 1.15,
      BELT_FORCE: 0.7,
      THROW_BREAK: 0.7,
      PULL_DOWN: 1.12,
      EDGE_REVERSAL: 1,
      REAR_FINISH: 0.8,
      LEG_ATTACK: 0.7,
    },
  },
  BELT_BATTLE: {
    MEDIUM: {
      PUSH_OUT: 0.94,
      BELT_FORCE: 1.04,
      THROW_BREAK: 1.04,
      PULL_DOWN: 0.94,
      EDGE_REVERSAL: 1,
      REAR_FINISH: 0.95,
      LEG_ATTACK: 1,
    },
    HIGH: {
      PUSH_OUT: 0.7,
      BELT_FORCE: 1.15,
      THROW_BREAK: 1.12,
      PULL_DOWN: 0.7,
      EDGE_REVERSAL: 0.9,
      REAR_FINISH: 0.85,
      LEG_ATTACK: 1.02,
    },
  },
  TECHNIQUE_SCRAMBLE: {
    MEDIUM: {
      PUSH_OUT: 0.96,
      BELT_FORCE: 1,
      THROW_BREAK: 1.04,
      PULL_DOWN: 1.04,
      EDGE_REVERSAL: 1.02,
      REAR_FINISH: 1,
      LEG_ATTACK: 1.04,
    },
    HIGH: {
      PUSH_OUT: 0.75,
      BELT_FORCE: 1.02,
      THROW_BREAK: 1.15,
      PULL_DOWN: 1.12,
      EDGE_REVERSAL: 1.03,
      REAR_FINISH: 1,
      LEG_ATTACK: 1.1,
    },
  },
  EDGE_BATTLE: {
    MEDIUM: {
      PUSH_OUT: 1,
      BELT_FORCE: 0.98,
      THROW_BREAK: 1.03,
      PULL_DOWN: 1.03,
      EDGE_REVERSAL: 1.03,
      REAR_FINISH: 0.95,
      LEG_ATTACK: 0.95,
    },
    HIGH: {
      PUSH_OUT: 1,
      BELT_FORCE: 0.94,
      THROW_BREAK: 1.08,
      PULL_DOWN: 1.08,
      EDGE_REVERSAL: 1.12,
      REAR_FINISH: 0.9,
      LEG_ATTACK: 0.88,
    },
  },
  QUICK_COLLAPSE: {
    MEDIUM: {
      PUSH_OUT: 1.03,
      BELT_FORCE: 0.95,
      THROW_BREAK: 0.92,
      PULL_DOWN: 1.03,
      EDGE_REVERSAL: 1,
      REAR_FINISH: 1,
      LEG_ATTACK: 0.9,
    },
    HIGH: {
      PUSH_OUT: 1.15,
      BELT_FORCE: 0.78,
      THROW_BREAK: 0.75,
      PULL_DOWN: 1.15,
      EDGE_REVERSAL: 1.03,
      REAR_FINISH: 1.02,
      LEG_ATTACK: 0.72,
    },
  },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const roundMultiplier = (value: number): number =>
  Number(clamp(value, MIN_MULTIPLIER, MAX_MULTIPLIER).toFixed(2));

export const resolvePreBoutPhaseConfidence = (
  weights: PreBoutPhaseWeights,
): PreBoutPhaseConfidence => {
  const entries = PRE_BOUT_PHASES
    .map((phase) => ({
      phase,
      weight: Math.max(0, Number.isFinite(weights[phase]) ? weights[phase] : 0),
    }))
    .sort((left, right) => right.weight - left.weight);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) {
    return {
      dominantPhase: 'MIXED',
      confidence: 0,
      margin: 0,
      bucket: 'LOW',
    };
  }
  const top = entries[0] ?? { phase: 'MIXED' as const, weight: 0 };
  const second = entries[1] ?? { phase: 'MIXED' as const, weight: 0 };
  const confidence = top.weight / totalWeight;
  const margin = top.weight - second.weight;
  const bucket: PreBoutPhaseConfidenceBucket =
    confidence >= 0.27 || margin >= 0.7
      ? 'HIGH'
      : confidence >= 0.22 || margin >= 0.35
        ? 'MEDIUM'
        : 'LOW';
  return {
    dominantPhase: top.phase,
    confidence,
    margin,
    bucket,
  };
};

const resolveTableForConfidence = (
  phaseConfidence: PreBoutPhaseConfidence,
): Record<WinRoute, number> => {
  if (
    phaseConfidence.bucket === 'LOW' ||
    phaseConfidence.dominantPhase === 'MIXED'
  ) {
    return NEUTRAL_ROUTE_MULTIPLIERS;
  }
  return ROUTE_MULTIPLIER_TABLE[phaseConfidence.dominantPhase]?.[phaseConfidence.bucket] ??
    NEUTRAL_ROUTE_MULTIPLIERS;
};

export const resolvePreBoutPhaseRouteBias = (
  input: PreBoutPhaseRouteBiasInput,
): PreBoutPhaseRouteBiasOutput => {
  if (input.mode === 'OFF' || !input.phaseWeights) {
    return {
      applied: false,
      multipliers: {},
      reasonTags: input.mode === 'OFF'
        ? ['phase-route-bias:off']
        : ['phase-route-bias:neutral:missing-weights'],
    };
  }

  const phaseConfidence = resolvePreBoutPhaseConfidence(input.phaseWeights);
  if (phaseConfidence.dominantPhase === 'MIXED') {
    return {
      applied: false,
      phaseConfidence,
      multipliers: {},
      reasonTags: ['phase-route-bias:neutral:mixed'],
    };
  }
  if (phaseConfidence.bucket === 'LOW') {
    return {
      applied: false,
      phaseConfidence,
      multipliers: {},
      reasonTags: ['phase-route-bias:neutral:low-confidence'],
    };
  }

  const routeCandidateSet = new Set(input.routeCandidates);
  const table = resolveTableForConfidence(phaseConfidence);
  const multipliers: Partial<Record<WinRoute, number>> = {};
  const reasonTags = [`phase-route-bias:${phaseConfidence.dominantPhase}:${phaseConfidence.bucket}`];

  for (const route of ALL_ROUTES) {
    if (!routeCandidateSet.has(route)) continue;
    const multiplier = roundMultiplier(table[route] ?? 1);
    if (multiplier === 1) continue;
    multipliers[route] = multiplier;
    reasonTags.push(`route:${route}:${multiplier.toFixed(2)}`);
  }

  return {
    applied: Object.keys(multipliers).length > 0,
    phaseConfidence,
    multipliers,
    reasonTags,
  };
};
