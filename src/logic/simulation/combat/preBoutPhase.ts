import type { Division } from '../../models';
import type { BashoFormatKind, BoutPressureContext } from '../basho/formatPolicy';
import type { CombatStyle } from './types';

export const PRE_BOUT_PHASES = [
  'THRUST_BATTLE',
  'BELT_BATTLE',
  'TECHNIQUE_SCRAMBLE',
  'EDGE_BATTLE',
  'QUICK_COLLAPSE',
  'MIXED',
] as const;

export type PreBoutPhase = typeof PRE_BOUT_PHASES[number];

export type PreBoutPhaseWeights = Record<PreBoutPhase, number>;

export interface PreBoutPhaseInput {
  readonly source?: 'PLAYER_DIAGNOSTIC' | 'NPC_DIAGNOSTIC' | 'SYNTHETIC_DIAGNOSTIC';
  readonly attackerStyle?: CombatStyle;
  readonly defenderStyle?: CombatStyle;
  readonly attackerPushStrength?: number;
  readonly defenderPushStrength?: number;
  readonly attackerBeltStrength?: number;
  readonly defenderBeltStrength?: number;
  readonly attackerTechniqueStrength?: number;
  readonly defenderTechniqueStrength?: number;
  readonly attackerEdgeStrength?: number;
  readonly defenderEdgeStrength?: number;
  readonly attackerHeightCm?: number;
  readonly defenderHeightCm?: number;
  readonly attackerWeightKg?: number;
  readonly defenderWeightKg?: number;
  readonly attackerBodyScore?: number;
  readonly defenderBodyScore?: number;
  readonly division?: Division;
  readonly formatKind?: BashoFormatKind;
  readonly pressure?: Partial<BoutPressureContext>;
}

export interface PreBoutPhaseResolution {
  readonly phase?: PreBoutPhase;
  readonly weights: PreBoutPhaseWeights;
  readonly reasonTags: readonly string[];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const finiteOrUndefined = (value: number | undefined): number | undefined =>
  Number.isFinite(value) ? value : undefined;

const averageDefined = (values: Array<number | undefined>): number | undefined => {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (!finite.length) return undefined;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const add = (
  weights: PreBoutPhaseWeights,
  phase: PreBoutPhase,
  value: number,
): void => {
  weights[phase] = Math.max(0, weights[phase] + value);
};

const addStyleSignal = (
  weights: PreBoutPhaseWeights,
  style: CombatStyle | undefined,
  reasonTags: string[],
): void => {
  if (!style) return;
  if (style === 'PUSH') {
    add(weights, 'THRUST_BATTLE', 1.35);
    add(weights, 'MIXED', 0.12);
    reasonTags.push('style:PUSH');
  } else if (style === 'GRAPPLE') {
    add(weights, 'BELT_BATTLE', 1.25);
    add(weights, 'MIXED', 0.14);
    reasonTags.push('style:GRAPPLE');
  } else if (style === 'TECHNIQUE') {
    add(weights, 'TECHNIQUE_SCRAMBLE', 1.15);
    add(weights, 'EDGE_BATTLE', 0.18);
    add(weights, 'MIXED', 0.22);
    reasonTags.push('style:TECHNIQUE');
  } else {
    add(weights, 'THRUST_BATTLE', 0.22);
    add(weights, 'BELT_BATTLE', 0.22);
    add(weights, 'TECHNIQUE_SCRAMBLE', 0.22);
    add(weights, 'MIXED', 0.38);
    reasonTags.push('style:BALANCED');
  }
};

const addStrengthSignal = (
  weights: PreBoutPhaseWeights,
  phase: PreBoutPhase,
  value: number | undefined,
  reasonTag: string,
  reasonTags: string[],
): void => {
  const finite = finiteOrUndefined(value);
  if (finite === undefined) return;
  const normalized = clamp((finite - 50) / 50, -0.4, 1);
  if (normalized > 0) {
    add(weights, phase, normalized * 0.72);
    reasonTags.push(reasonTag);
  }
};

export const resolvePreBoutPhaseWeights = (
  input: PreBoutPhaseInput,
): PreBoutPhaseResolution => {
  const weights: PreBoutPhaseWeights = {
    THRUST_BATTLE: 0.85,
    BELT_BATTLE: 0.85,
    TECHNIQUE_SCRAMBLE: 0.78,
    EDGE_BATTLE: 0.42,
    QUICK_COLLAPSE: 0.38,
    MIXED: 1.15,
  };
  const reasonTags: string[] = [];

  addStyleSignal(weights, input.attackerStyle, reasonTags);
  addStyleSignal(weights, input.defenderStyle, reasonTags);

  addStrengthSignal(
    weights,
    'THRUST_BATTLE',
    averageDefined([input.attackerPushStrength, input.defenderPushStrength]),
    'strength:push',
    reasonTags,
  );
  addStrengthSignal(
    weights,
    'BELT_BATTLE',
    averageDefined([input.attackerBeltStrength, input.defenderBeltStrength]),
    'strength:belt',
    reasonTags,
  );
  addStrengthSignal(
    weights,
    'TECHNIQUE_SCRAMBLE',
    averageDefined([input.attackerTechniqueStrength, input.defenderTechniqueStrength]),
    'strength:technique',
    reasonTags,
  );
  addStrengthSignal(
    weights,
    'EDGE_BATTLE',
    averageDefined([input.attackerEdgeStrength, input.defenderEdgeStrength]),
    'strength:edge',
    reasonTags,
  );

  const weightDiff = Math.abs((input.attackerWeightKg ?? Number.NaN) - (input.defenderWeightKg ?? Number.NaN));
  if (Number.isFinite(weightDiff)) {
    if (weightDiff >= 18) {
      add(weights, 'QUICK_COLLAPSE', clamp((weightDiff - 12) / 36, 0, 1) * 0.65);
      reasonTags.push('body:weight-mismatch');
    } else {
      add(weights, 'MIXED', 0.08);
    }
  }

  const heightDiff = Math.abs((input.attackerHeightCm ?? Number.NaN) - (input.defenderHeightCm ?? Number.NaN));
  if (Number.isFinite(heightDiff) && heightDiff >= 8) {
    add(weights, 'TECHNIQUE_SCRAMBLE', 0.12);
    add(weights, 'QUICK_COLLAPSE', 0.08);
    reasonTags.push('body:height-mismatch');
  }

  const bodyScoreDiff = Math.abs((input.attackerBodyScore ?? Number.NaN) - (input.defenderBodyScore ?? Number.NaN));
  if (Number.isFinite(bodyScoreDiff) && bodyScoreDiff >= 4) {
    add(weights, 'QUICK_COLLAPSE', 0.12);
    reasonTags.push('body:score-mismatch');
  }

  if (input.pressure?.isFinalBout) {
    add(weights, 'EDGE_BATTLE', 0.18);
    reasonTags.push('pressure:final');
  }
  if (input.pressure?.isKachiMakeDecider) {
    add(weights, 'EDGE_BATTLE', 0.28);
    add(weights, 'MIXED', 0.08);
    reasonTags.push('pressure:kachi-make');
  }
  if (input.pressure?.isYushoRelevant) {
    add(weights, 'EDGE_BATTLE', 0.24);
    reasonTags.push('pressure:yusho');
  }
  if (input.pressure?.isPromotionRelevant || input.pressure?.isDemotionRelevant) {
    add(weights, 'EDGE_BATTLE', 0.16);
    reasonTags.push('pressure:boundary');
  }

  if (input.formatKind === 'LOWER_7') {
    add(weights, 'MIXED', 0.06);
    reasonTags.push('format:LOWER_7');
  } else if (input.formatKind === 'SEKITORI_15') {
    add(weights, 'EDGE_BATTLE', 0.04);
    reasonTags.push('format:SEKITORI_15');
  }

  PRE_BOUT_PHASES.forEach((phase) => {
    weights[phase] = Number.isFinite(weights[phase]) ? Math.max(0, weights[phase]) : 0;
  });

  return {
    weights,
    reasonTags,
  };
};

export const samplePreBoutPhase = (
  weights: PreBoutPhaseWeights,
  diagnosticRng: () => number,
): PreBoutPhase => {
  const entries = PRE_BOUT_PHASES.map((phase) => ({
    phase,
    weight: Math.max(0, weights[phase] ?? 0),
  })).filter((entry) => entry.weight > 0);
  if (!entries.length) return 'MIXED';
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = diagnosticRng() * total;
  for (const entry of entries) {
    roll -= entry.weight;
    if (roll <= 0) return entry.phase;
  }
  return entries[entries.length - 1].phase;
};

export const resolvePreBoutPhaseDiagnostic = (
  input: PreBoutPhaseInput,
  diagnosticRng?: () => number,
): PreBoutPhaseResolution => {
  const resolution = resolvePreBoutPhaseWeights(input);
  return {
    ...resolution,
    phase: diagnosticRng ? samplePreBoutPhase(resolution.weights, diagnosticRng) : undefined,
  };
};
