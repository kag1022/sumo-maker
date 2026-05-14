/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import type { Division } from '../../src/logic/models';
import { resolveBashoFormatPolicy } from '../../src/logic/simulation/basho/formatPolicy';
import type { CombatStyle } from '../../src/logic/simulation/combat/types';
import {
  PRE_BOUT_PHASES,
  type PreBoutPhase,
  type PreBoutPhaseInput,
  type PreBoutPhaseWeights,
  resolvePreBoutPhaseDiagnostic,
} from '../../src/logic/simulation/combat/preBoutPhase';

type BodyBucket = 'EVEN' | 'ATTACKER_SIZE_EDGE' | 'DEFENDER_SIZE_EDGE';
type PressureBucket = 'NONE' | 'FINAL' | 'KACHI_MAKE' | 'YUSHO';

interface DiagnosticSample {
  division: Division;
  formatKind?: string;
  attackerStyle: CombatStyle;
  defenderStyle: CombatStyle;
  bodyBucket: BodyBucket;
  pressureBucket: PressureBucket;
  phase: PreBoutPhase;
  weights: PreBoutPhaseWeights;
  reasonTags: readonly string[];
}

const divisions: Division[] = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const styles: CombatStyle[] = ['PUSH', 'GRAPPLE', 'TECHNIQUE', 'BALANCED'];
const bodyBuckets: BodyBucket[] = ['EVEN', 'ATTACKER_SIZE_EDGE', 'DEFENDER_SIZE_EDGE'];
const pressureBuckets: PressureBucket[] = ['NONE', 'FINAL', 'KACHI_MAKE', 'YUSHO'];

const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const strengthsForStyle = (style: CombatStyle): {
  push: number;
  belt: number;
  technique: number;
  edge: number;
} => {
  if (style === 'PUSH') return { push: 74, belt: 46, technique: 50, edge: 48 };
  if (style === 'GRAPPLE') return { push: 50, belt: 74, technique: 54, edge: 52 };
  if (style === 'TECHNIQUE') return { push: 48, belt: 54, technique: 76, edge: 68 };
  return { push: 58, belt: 58, technique: 58, edge: 56 };
};

const bodyForBucket = (bucket: BodyBucket): {
  attackerHeightCm: number;
  defenderHeightCm: number;
  attackerWeightKg: number;
  defenderWeightKg: number;
  attackerBodyScore: number;
  defenderBodyScore: number;
} => {
  if (bucket === 'ATTACKER_SIZE_EDGE') {
    return {
      attackerHeightCm: 190,
      defenderHeightCm: 178,
      attackerWeightKg: 168,
      defenderWeightKg: 118,
      attackerBodyScore: 5.1,
      defenderBodyScore: -3.6,
    };
  }
  if (bucket === 'DEFENDER_SIZE_EDGE') {
    return {
      attackerHeightCm: 178,
      defenderHeightCm: 190,
      attackerWeightKg: 118,
      defenderWeightKg: 168,
      attackerBodyScore: -3.6,
      defenderBodyScore: 5.1,
    };
  }
  return {
    attackerHeightCm: 184,
    defenderHeightCm: 182,
    attackerWeightKg: 140,
    defenderWeightKg: 138,
    attackerBodyScore: 0.8,
    defenderBodyScore: 0.3,
  };
};

const pressureForBucket = (bucket: PressureBucket): PreBoutPhaseInput['pressure'] => {
  if (bucket === 'FINAL') return { isFinalBout: true };
  if (bucket === 'KACHI_MAKE') return { isFinalBout: true, isKachiMakeDecider: true };
  if (bucket === 'YUSHO') return { isYushoRelevant: true };
  return undefined;
};

const createInput = (
  division: Division,
  attackerStyle: CombatStyle,
  defenderStyle: CombatStyle,
  bodyBucket: BodyBucket,
  pressureBucket: PressureBucket,
): PreBoutPhaseInput => {
  const attackerStrength = strengthsForStyle(attackerStyle);
  const defenderStrength = strengthsForStyle(defenderStyle);
  return {
    source: 'SYNTHETIC_DIAGNOSTIC',
    division,
    formatKind: resolveBashoFormatPolicy(division)?.kind,
    attackerStyle,
    defenderStyle,
    attackerPushStrength: attackerStrength.push,
    defenderPushStrength: defenderStrength.push,
    attackerBeltStrength: attackerStrength.belt,
    defenderBeltStrength: defenderStrength.belt,
    attackerTechniqueStrength: attackerStrength.technique,
    defenderTechniqueStrength: defenderStrength.technique,
    attackerEdgeStrength: attackerStrength.edge,
    defenderEdgeStrength: defenderStrength.edge,
    ...bodyForBucket(bodyBucket),
    pressure: pressureForBucket(pressureBucket),
  };
};

const increment = (
  counts: Record<string, number>,
  key: string | undefined,
): void => {
  const resolved = key ?? 'UNAVAILABLE';
  counts[resolved] = (counts[resolved] ?? 0) + 1;
};

const summarizePhaseCounts = (samples: DiagnosticSample[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  samples.forEach((sample) => increment(counts, sample.phase));
  return counts;
};

const summarizeBy = (
  samples: DiagnosticSample[],
  keyOf: (sample: DiagnosticSample) => string | undefined,
): Record<string, Record<string, number>> => {
  const groups: Record<string, DiagnosticSample[]> = {};
  samples.forEach((sample) => {
    const key = keyOf(sample) ?? 'UNAVAILABLE';
    groups[key] = [...(groups[key] ?? []), sample];
  });
  return Object.fromEntries(
    Object.entries(groups).map(([key, rows]) => [key, summarizePhaseCounts(rows)]),
  );
};

const summarizeWeightAverages = (samples: DiagnosticSample[]): Record<PreBoutPhase, number> =>
  Object.fromEntries(
    PRE_BOUT_PHASES.map((phase) => [
      phase,
      Number((samples.reduce((sum, sample) => sum + sample.weights[phase], 0) / Math.max(1, samples.length)).toFixed(4)),
    ]),
  ) as Record<PreBoutPhase, number>;

const main = (): void => {
  const rng = lcg(20260514);
  const samples: DiagnosticSample[] = [];
  for (const division of divisions) {
    for (const attackerStyle of styles) {
      for (const defenderStyle of styles) {
        for (const bodyBucket of bodyBuckets) {
          for (const pressureBucket of pressureBuckets) {
            const input = createInput(division, attackerStyle, defenderStyle, bodyBucket, pressureBucket);
            const resolution = resolvePreBoutPhaseDiagnostic(input, rng);
            samples.push({
              division,
              formatKind: input.formatKind,
              attackerStyle,
              defenderStyle,
              bodyBucket,
              pressureBucket,
              phase: resolution.phase ?? 'MIXED',
              weights: resolution.weights,
              reasonTags: resolution.reasonTags,
            });
          }
        }
      }
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    seed: 20260514,
    sampleKind: 'synthetic fixed grid; production battle path is not called',
    totalSamples: samples.length,
    phaseWeightAverages: summarizeWeightAverages(samples),
    sampledPhaseDistribution: summarizePhaseCounts(samples),
    byAttackerStyle: summarizeBy(samples, (sample) => sample.attackerStyle),
    byDefenderStyle: summarizeBy(samples, (sample) => sample.defenderStyle),
    byDivision: summarizeBy(samples, (sample) => sample.division),
    byFormatKind: summarizeBy(samples, (sample) => sample.formatKind),
    byPressureBucket: summarizeBy(samples, (sample) => sample.pressureBucket),
    byBodyBucket: summarizeBy(samples, (sample) => sample.bodyBucket),
    assumptions: [
      'PreBoutPhase is diagnostic-only and not called by battle.ts or npcCompat.ts.',
      'Samples use a fixed synthetic grid across styles, divisions, body buckets, and pressure buckets.',
      'Sampling uses an isolated LCG and does not consume production RNG.',
      'BashoCombatProfile is not used as live battle input.',
    ],
    unavailableFields: [
      'real production matchup body timeline',
      'live player trait/genome modifiers',
      'post-outcome kimarite engagement',
    ],
    samples: samples.slice(0, 12),
  };

  const outPath = path.resolve('.tmp/prebout-phase-diagnostics.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`prebout phase diagnostics written: ${outPath}`);
  console.log(JSON.stringify({
    totalSamples: report.totalSamples,
    phaseWeightAverages: report.phaseWeightAverages,
    sampledPhaseDistribution: report.sampledPhaseDistribution,
    byAttackerStyle: report.byAttackerStyle,
    byPressureBucket: report.byPressureBucket,
    byBodyBucket: report.byBodyBucket,
    unavailableFields: report.unavailableFields,
  }, null, 2));
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
