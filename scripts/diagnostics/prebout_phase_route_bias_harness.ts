/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import type { EnemyStyleBias } from '../../src/logic/catalog/enemyData';
import type { BodyType, WinRoute } from '../../src/logic/models';
import { resolveCombatKernelProbability } from '../../src/logic/simulation/combat/kernel';
import {
  resolvePreBoutPhaseWeights,
  type PreBoutPhase,
  type PreBoutPhaseWeights,
} from '../../src/logic/simulation/combat/preBoutPhase';
import {
  resolvePreBoutPhaseRouteBias,
  type PreBoutPhaseRouteBiasExperimentMode,
} from '../../src/logic/simulation/combat/preBoutPhaseRouteBias';
import {
  type ControlPhaseCandidate,
  type ControlPhaseCandidateConfidence,
  resolveControlPhaseCandidate,
} from '../../src/logic/simulation/combat/controlPhaseAdapter';
import {
  createBoutFlowDiagnosticSnapshot,
  type BoutFlowDiagnosticSnapshot,
} from '../../src/logic/simulation/combat/boutFlowDiagnosticSnapshot';
import type { BoutPressureContext } from '../../src/logic/simulation/basho/formatPolicy';
import type { RandomSource } from '../../src/logic/simulation/deps';
import {
  type BoutEngagement,
  resolveBoutEngagement,
} from '../../src/logic/kimarite/engagement';
import { resolveFinishRoute } from '../../src/logic/kimarite/finishRoute';
import {
  consumeKimariteSelectionWarnings,
  resolveKimariteOutcome,
  type KimariteCompetitorProfile,
} from '../../src/logic/kimarite/selection';
import {
  classifyPreBoutPhaseKimariteContradiction,
  resolveDiagnosticKimariteMetadata,
  type DiagnosticKimariteMetadata,
} from './kimarite_family_classifier';

type HarnessMode = PreBoutPhaseRouteBiasExperimentMode;
type HarnessStyle = 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | 'BALANCE';
type ContradictionSeverity = 'NONE' | 'SOFT' | 'HARD' | 'UNKNOWN';
type ConfidenceBucket = 'LOW' | 'MEDIUM' | 'HIGH';

interface HarnessCase {
  id: string;
  seed: number;
  playerStyle: HarnessStyle;
  enemyStyle: HarnessStyle;
  pressure?: Partial<BoutPressureContext>;
  playerAbility: number;
  enemyAbility: number;
  playerHeightCm: number;
  playerWeightKg: number;
  enemyHeightCm: number;
  enemyWeightKg: number;
}

interface RouteSelectionContext {
  isHighPressure: boolean;
  isLastDay: boolean;
  isUnderdog: boolean;
  isEdgeCandidate: boolean;
  weightDiff: number;
  heightDiff: number;
  dominance: number;
  isTitleDecider: boolean;
  isKinboshiChance: boolean;
}

interface HarnessRow {
  caseId: string;
  mode: HarnessMode;
  resultRoll: number;
  isWin: boolean;
  winProbability: number;
  kernelInputSignature: string;
  phaseWeights: PreBoutPhaseWeights;
  dominantPhase: PreBoutPhase;
  confidenceBucket: ConfidenceBucket;
  routeBiasApplied: boolean;
  routeBiasReasonTags: readonly string[];
  controlPhasePredecessor: BoutEngagement['phase'];
  controlPhaseCandidate?: ControlPhaseCandidate;
  controlPhaseCandidateConfidence: ControlPhaseCandidateConfidence;
  controlPhaseCandidateReasonTags: readonly string[];
  winRoute: WinRoute;
  kimarite: string;
  kimariteMetadata: DiagnosticKimariteMetadata;
  severity: ContradictionSeverity;
  contradiction: boolean;
  warningCount: number;
  boutFlowSnapshot: BoutFlowDiagnosticSnapshot;
  boutFlow: {
    openingPhase: PreBoutPhase;
    openingPhaseWeights: PreBoutPhaseWeights;
    controlPhasePredecessor: BoutEngagement['phase'];
    controlPhaseCandidate?: ControlPhaseCandidate;
    controlPhaseCandidateConfidence: ControlPhaseCandidateConfidence;
    controlPhaseCandidateReasonTags: readonly string[];
    finishRoute: WinRoute;
    kimarite: {
      name: string;
      family?: string;
      diagnosticFamily: string;
      rarity?: string;
      catalogStatus: DiagnosticKimariteMetadata['catalogStatus'];
    };
  };
}

interface RateSummary {
  count: number;
  contradictions: number;
  hard: number;
  soft: number;
  unknown: number;
  contradictionRate: number;
  hardRate: number;
  softRate: number;
  unknownRate: number;
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

const styles: HarnessStyle[] = ['PUSH', 'GRAPPLE', 'TECHNIQUE', 'BALANCE'];

const pressureCases: Array<{ id: string; pressure?: Partial<BoutPressureContext> }> = [
  { id: 'quiet' },
  { id: 'final', pressure: { isFinalBout: true } },
  { id: 'kachi-make', pressure: { isFinalBout: true, isKachiMakeDecider: true } },
  { id: 'yusho', pressure: { isYushoRelevant: true } },
];

const lcg = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const round = (value: number): number => Number(value.toFixed(4));

const toEnemyStyle = (style: HarnessStyle): EnemyStyleBias =>
  style === 'BALANCE' ? 'BALANCE' : style;

const toBodyType = (style: HarnessStyle): BodyType => {
  if (style === 'TECHNIQUE') return 'SOPPU';
  if (style === 'GRAPPLE') return 'MUSCULAR';
  return 'NORMAL';
};

const statsForStyle = (
  style: HarnessStyle,
): KimariteCompetitorProfile['stats'] => {
  if (style === 'PUSH') {
    return { tsuki: 76, oshi: 78, kumi: 42, nage: 46, koshi: 52, deashi: 68, waza: 50, power: 66 };
  }
  if (style === 'GRAPPLE') {
    return { tsuki: 44, oshi: 48, kumi: 78, nage: 64, koshi: 76, deashi: 56, waza: 58, power: 70 };
  }
  if (style === 'TECHNIQUE') {
    return { tsuki: 52, oshi: 48, kumi: 58, nage: 78, koshi: 56, deashi: 70, waza: 80, power: 52 };
  }
  return { tsuki: 58, oshi: 58, kumi: 58, nage: 58, koshi: 58, deashi: 58, waza: 58, power: 58 };
};

const toProfile = (
  style: HarnessStyle,
  heightCm: number,
  weightKg: number,
): KimariteCompetitorProfile => ({
  style,
  bodyType: toBodyType(style),
  heightCm,
  weightKg,
  stats: statsForStyle(style),
  traits: style === 'TECHNIQUE' ? ['ARAWAZASHI', 'READ_THE_BOUT'] : [],
  historyCounts: {},
});

const average = (values: Array<number | undefined>): number | undefined => {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (!finite.length) return undefined;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
};

const resolveHarnessCases = (): HarnessCase[] => {
  const cases: HarnessCase[] = [];
  let index = 0;
  for (const playerStyle of styles) {
    for (const enemyStyle of styles) {
      for (const pressureCase of pressureCases) {
        for (const abilityDelta of [-8, 0, 8]) {
          index += 1;
          const playerWeight = playerStyle === 'PUSH' ? 154 : playerStyle === 'GRAPPLE' ? 150 : playerStyle === 'TECHNIQUE' ? 132 : 142;
          const enemyWeight = enemyStyle === 'PUSH' ? 154 : enemyStyle === 'GRAPPLE' ? 150 : enemyStyle === 'TECHNIQUE' ? 132 : 142;
          cases.push({
            id: `${playerStyle}-${enemyStyle}-${pressureCase.id}-${abilityDelta}`,
            seed: 20260514 + index * 97,
            playerStyle,
            enemyStyle,
            pressure: pressureCase.pressure,
            playerAbility: 84 + abilityDelta,
            enemyAbility: 84 - abilityDelta,
            playerHeightCm: playerStyle === 'TECHNIQUE' ? 185 : 182,
            playerWeightKg: playerWeight,
            enemyHeightCm: enemyStyle === 'TECHNIQUE' ? 185 : 182,
            enemyWeightKg: enemyWeight,
          });
        }
      }
    }
  }
  return cases;
};

const simulateCase = (
  testCase: HarnessCase,
  mode: HarnessMode,
): HarnessRow => {
  const rng = lcg(testCase.seed);
  const player = toProfile(testCase.playerStyle, testCase.playerHeightCm, testCase.playerWeightKg);
  const enemy = toProfile(testCase.enemyStyle, testCase.enemyHeightCm, testCase.enemyWeightKg);
  const phaseResolution = resolvePreBoutPhaseWeights({
    source: 'PLAYER_DIAGNOSTIC',
    attackerStyle: testCase.playerStyle === 'BALANCE' ? 'BALANCED' : testCase.playerStyle,
    defenderStyle: testCase.enemyStyle === 'BALANCE' ? 'BALANCED' : testCase.enemyStyle,
    attackerPushStrength: average([player.stats.tsuki, player.stats.oshi, player.stats.deashi]),
    defenderPushStrength: average([enemy.stats.tsuki, enemy.stats.oshi, enemy.stats.deashi]),
    attackerBeltStrength: average([player.stats.kumi, player.stats.koshi, player.stats.power]),
    defenderBeltStrength: average([enemy.stats.kumi, enemy.stats.koshi, enemy.stats.power]),
    attackerTechniqueStrength: average([player.stats.waza, player.stats.nage, player.stats.deashi]),
    defenderTechniqueStrength: average([enemy.stats.waza, enemy.stats.nage, enemy.stats.deashi]),
    attackerEdgeStrength: average([player.stats.waza, player.stats.koshi, player.stats.deashi]),
    defenderEdgeStrength: average([enemy.stats.waza, enemy.stats.koshi, enemy.stats.deashi]),
    attackerHeightCm: testCase.playerHeightCm,
    defenderHeightCm: testCase.enemyHeightCm,
    attackerWeightKg: testCase.playerWeightKg,
    defenderWeightKg: testCase.enemyWeightKg,
    pressure: testCase.pressure,
  });
  const kernelInput = {
    source: 'PLAYER_BASE' as const,
    attackerAbility: testCase.playerAbility,
    defenderAbility: testCase.enemyAbility,
    attackerStyle: toEnemyStyle(testCase.playerStyle),
    defenderStyle: toEnemyStyle(testCase.enemyStyle),
    injuryPenalty: 0,
    bonus: 0,
  };
  const winProbability = resolveCombatKernelProbability(kernelInput).probability;
  const resultRoll = rng();
  const isWin = resultRoll < winProbability;
  const winner = isWin ? player : enemy;
  const loser = isWin ? enemy : player;
  const dominance = isWin ? winProbability * 2 - 1 : (1 - winProbability) * 2 - 1;
  const context: RouteSelectionContext = {
    isHighPressure: Boolean(testCase.pressure && Object.values(testCase.pressure).some(Boolean)),
    isLastDay: Boolean(testCase.pressure?.isFinalBout),
    isUnderdog: (isWin ? winProbability : 1 - winProbability) < 0.45,
    isEdgeCandidate: winProbability >= 0.28 && Boolean(testCase.pressure && Object.values(testCase.pressure).some(Boolean)),
    weightDiff: winner.weightKg - loser.weightKg,
    heightDiff: winner.heightCm - loser.heightCm,
    dominance,
    isTitleDecider: Boolean(testCase.pressure?.isYushoRelevant),
    isKinboshiChance: false,
  };
  const engagement = resolveBoutEngagement(winner, loser, context, rng);
  const bias = resolvePreBoutPhaseRouteBias({
    mode,
    phaseWeights: phaseResolution.weights,
    routeCandidates: ALL_ROUTES,
    pressure: testCase.pressure,
  });
  const routeMultipliers = mode === 'ENABLED' ? bias.multipliers : undefined;
  const winRoute = resolveFinishRoute({
    winner,
    context,
    engagement,
    rng,
    routeMultipliers,
  });
  consumeKimariteSelectionWarnings();
  const selected = resolveKimariteOutcome({
    winner,
    loser,
    rng,
    allowedRoute: winRoute,
    allowNonTechnique: true,
    boutContext: { ...context, engagement },
  });
  const warnings = consumeKimariteSelectionWarnings();
  const kimariteMetadata = resolveDiagnosticKimariteMetadata(selected.kimarite);
  const controlPhase = resolveControlPhaseCandidate({
    engagement,
    finishRoute: winRoute,
    kimaritePattern: selected.pattern,
  });
  const confidence = bias.phaseConfidence ?? resolvePreBoutPhaseRouteBias({
    mode: 'DIAGNOSTIC',
    phaseWeights: phaseResolution.weights,
    routeCandidates: ALL_ROUTES,
  }).phaseConfidence;
  const dominantPhase = confidence?.dominantPhase ?? 'MIXED';
  const confidenceBucket = confidence?.bucket ?? 'LOW';
  const classified = classifyPreBoutPhaseKimariteContradiction({
    phase: dominantPhase,
    confidenceBucket,
    route: winRoute,
    metadata: kimariteMetadata,
  });
  const boutFlowSnapshot = createBoutFlowDiagnosticSnapshot({
    openingPhase: dominantPhase,
    openingConfidence: confidenceBucket,
    controlPhasePredecessor: engagement.phase,
    controlPhaseCandidate: controlPhase.controlPhaseCandidate,
    controlConfidence: controlPhase.confidence,
    finishRoute: winRoute,
    kimaritePattern: selected.pattern,
    kimarite: {
      name: kimariteMetadata.kimarite ?? selected.kimarite,
      family: kimariteMetadata.family,
      diagnosticFamily: kimariteMetadata.diagnosticFamily,
      rarity: kimariteMetadata.rarityBucket,
      catalogStatus: kimariteMetadata.catalogStatus,
    },
  });
  return {
    caseId: testCase.id,
    mode,
    resultRoll,
    isWin,
    winProbability,
    kernelInputSignature: JSON.stringify(kernelInput),
    phaseWeights: phaseResolution.weights,
    dominantPhase,
    confidenceBucket,
    routeBiasApplied: bias.applied,
    routeBiasReasonTags: bias.reasonTags,
    controlPhasePredecessor: engagement.phase,
    controlPhaseCandidate: controlPhase.controlPhaseCandidate,
    controlPhaseCandidateConfidence: controlPhase.confidence,
    controlPhaseCandidateReasonTags: controlPhase.reasonTags,
    winRoute,
    kimarite: selected.kimarite,
    kimariteMetadata,
    severity: classified.severity,
    contradiction: classified.contradiction,
    warningCount: warnings.length,
    boutFlowSnapshot,
    boutFlow: {
      openingPhase: dominantPhase,
      openingPhaseWeights: phaseResolution.weights,
      controlPhasePredecessor: engagement.phase,
      controlPhaseCandidate: controlPhase.controlPhaseCandidate,
      controlPhaseCandidateConfidence: controlPhase.confidence,
      controlPhaseCandidateReasonTags: controlPhase.reasonTags,
      finishRoute: winRoute,
      kimarite: {
        name: kimariteMetadata.kimarite ?? selected.kimarite,
        family: kimariteMetadata.family,
        diagnosticFamily: kimariteMetadata.diagnosticFamily,
        rarity: kimariteMetadata.rarityBucket,
        catalogStatus: kimariteMetadata.catalogStatus,
      },
    },
  };
};

const countBy = <T extends string | undefined>(values: T[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  values.forEach((value) => {
    const key = value ?? 'UNAVAILABLE';
    counts[key] = (counts[key] ?? 0) + 1;
  });
  return counts;
};

const rateSummary = (rows: HarnessRow[]): RateSummary => {
  const contradictions = rows.filter((row) => row.contradiction).length;
  const hard = rows.filter((row) => row.severity === 'HARD').length;
  const soft = rows.filter((row) => row.severity === 'SOFT').length;
  const unknown = rows.filter((row) => row.severity === 'UNKNOWN').length;
  return {
    count: rows.length,
    contradictions,
    hard,
    soft,
    unknown,
    contradictionRate: rows.length ? round(contradictions / rows.length) : 0,
    hardRate: rows.length ? round(hard / rows.length) : 0,
    softRate: rows.length ? round(soft / rows.length) : 0,
    unknownRate: rows.length ? round(unknown / rows.length) : 0,
  };
};

const highConfidenceHardRate = (rows: HarnessRow[]): number => {
  const high = rows.filter((row) => row.confidenceBucket === 'HIGH');
  if (!high.length) return 0;
  return round(high.filter((row) => row.severity === 'HARD').length / high.length);
};

const distributionDrift = (
  offCounts: Record<string, number>,
  enabledCounts: Record<string, number>,
  total: number,
): Record<string, number> => {
  const keys = new Set([...Object.keys(offCounts), ...Object.keys(enabledCounts)]);
  return Object.fromEntries(
    [...keys].sort().map((key) => [
      key,
      round((((enabledCounts[key] ?? 0) - (offCounts[key] ?? 0)) / Math.max(1, total)) * 100),
    ]),
  );
};

const parityStatus = (
  offRows: HarnessRow[],
  diagnosticRows: HarnessRow[],
  enabledRows: HarnessRow[],
) => {
  const diagnosticBehaviorMatchesOff = offRows.every((row, index) =>
    row.winRoute === diagnosticRows[index]?.winRoute &&
    row.kimarite === diagnosticRows[index]?.kimarite &&
    row.resultRoll === diagnosticRows[index]?.resultRoll &&
    row.isWin === diagnosticRows[index]?.isWin);
  const kernelInputParity = offRows.every((row, index) =>
    row.kernelInputSignature === diagnosticRows[index]?.kernelInputSignature &&
    row.kernelInputSignature === enabledRows[index]?.kernelInputSignature &&
    row.winProbability === diagnosticRows[index]?.winProbability &&
    row.winProbability === enabledRows[index]?.winProbability);
  const resultRollParity = offRows.every((row, index) =>
    row.resultRoll === diagnosticRows[index]?.resultRoll &&
    row.resultRoll === enabledRows[index]?.resultRoll &&
    row.isWin === diagnosticRows[index]?.isWin &&
    row.isWin === enabledRows[index]?.isWin);
  return {
    diagnosticBehaviorMatchesOff,
    kernelInputParity,
    resultRollParity,
  };
};

const main = (): void => {
  const cases = resolveHarnessCases();
  const offRows = cases.map((testCase) => simulateCase(testCase, 'OFF'));
  const diagnosticRows = cases.map((testCase) => simulateCase(testCase, 'DIAGNOSTIC'));
  const enabledRows = cases.map((testCase) => simulateCase(testCase, 'ENABLED'));
  const offRouteCounts = countBy(offRows.map((row) => row.winRoute));
  const enabledRouteCounts = countBy(enabledRows.map((row) => row.winRoute));
  const offFamilyCounts = countBy(offRows.map((row) => row.kimariteMetadata.family));
  const enabledFamilyCounts = countBy(enabledRows.map((row) => row.kimariteMetadata.family));
  const offDiagnosticFamilyCounts = countBy(offRows.map((row) => row.kimariteMetadata.diagnosticFamily));
  const enabledDiagnosticFamilyCounts = countBy(enabledRows.map((row) => row.kimariteMetadata.diagnosticFamily));
  const offRarityCounts = countBy(offRows.map((row) => row.kimariteMetadata.rarityBucket));
  const enabledRarityCounts = countBy(enabledRows.map((row) => row.kimariteMetadata.rarityBucket));
  const offHighHardRate = highConfidenceHardRate(offRows);
  const enabledHighHardRate = highConfidenceHardRate(enabledRows);
  const hardReductionRelative = offHighHardRate > 0
    ? round((offHighHardRate - enabledHighHardRate) / offHighHardRate)
    : 0;
  const routeDrift = distributionDrift(offRouteCounts, enabledRouteCounts, cases.length);
  const familyDrift = distributionDrift(offFamilyCounts, enabledFamilyCounts, cases.length);
  const rarityDrift = distributionDrift(offRarityCounts, enabledRarityCounts, cases.length);
  const maxRouteDriftPp = Math.max(...Object.values(routeDrift).map((value) => Math.abs(value)));
  const enabledSummary = rateSummary(enabledRows);
  const routeDriftWithinTwoPointFivePp = maxRouteDriftPp <= 2.5;
  const unknownRateWithinTwoPercent = enabledSummary.unknownRate <= 0.02;
  const highConfidenceHardReductionTargetMet = hardReductionRelative >= 0.2;
  const report = {
    generatedAt: new Date().toISOString(),
    sampleKind: 'fixed-seed synthetic player-route harness; production battle path is not modified',
    totalSampledPlayerBouts: cases.length,
    modes: {
      OFF: 'local diagnostic equivalent without route multipliers',
      DIAGNOSTIC: 'compute would-be multipliers but do not apply them',
      ENABLED: 'apply route multipliers inside this harness only',
    },
    parity: parityStatus(offRows, diagnosticRows, enabledRows),
    summaries: {
      OFF: rateSummary(offRows),
      DIAGNOSTIC: rateSummary(diagnosticRows),
      ENABLED: enabledSummary,
    },
    highConfidenceHardContradictionRate: {
      OFF: offHighHardRate,
      ENABLED: enabledHighHardRate,
      relativeReduction: hardReductionRelative,
    },
    boutFlowDistribution: {
      openingPhase: {
        OFF: countBy(offRows.map((row) => row.boutFlow.openingPhase)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlow.openingPhase)),
      },
      controlPhasePredecessor: {
        OFF: countBy(offRows.map((row) => row.boutFlow.controlPhasePredecessor)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlow.controlPhasePredecessor)),
      },
      controlPhaseCandidate: {
        OFF: countBy(offRows.map((row) => row.boutFlow.controlPhaseCandidate)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlow.controlPhaseCandidate)),
      },
      controlPhaseCandidateConfidence: {
        OFF: countBy(offRows.map((row) => row.boutFlow.controlPhaseCandidateConfidence)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlow.controlPhaseCandidateConfidence)),
      },
      finishRoute: {
        OFF: countBy(offRows.map((row) => row.boutFlow.finishRoute)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlow.finishRoute)),
      },
      kimariteDiagnosticFamily: {
        OFF: countBy(offRows.map((row) => row.boutFlow.kimarite.diagnosticFamily)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlow.kimarite.diagnosticFamily)),
      },
      transitionClassification: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.transitionClassification)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.transitionClassification)),
      },
    },
    boutFlowSnapshotDistribution: {
      openingPhase: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.openingPhase)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.openingPhase)),
      },
      openingConfidence: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.openingConfidence)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.openingConfidence)),
      },
      controlPhaseCandidate: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.controlPhaseCandidate)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.controlPhaseCandidate)),
      },
      controlConfidence: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.controlConfidence)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.controlConfidence)),
      },
      finishRoute: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.finishRoute)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.finishRoute)),
      },
      kimariteFamily: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.kimarite.family)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.kimarite.family)),
      },
      kimariteRarity: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.kimarite.rarity)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.kimarite.rarity)),
      },
      transitionClassification: {
        OFF: countBy(offRows.map((row) => row.boutFlowSnapshot.transitionClassification)),
        ENABLED: countBy(enabledRows.map((row) => row.boutFlowSnapshot.transitionClassification)),
      },
    },
    routeDistribution: {
      OFF: offRouteCounts,
      ENABLED: enabledRouteCounts,
      driftPercentagePoints: routeDrift,
      maxAbsDriftPercentagePoints: round(maxRouteDriftPp),
    },
    kimariteFamilyDistribution: {
      OFF: offFamilyCounts,
      ENABLED: enabledFamilyCounts,
      driftPercentagePoints: familyDrift,
    },
    diagnosticFamilyDistribution: {
      OFF: offDiagnosticFamilyCounts,
      ENABLED: enabledDiagnosticFamilyCounts,
      driftPercentagePoints: distributionDrift(offDiagnosticFamilyCounts, enabledDiagnosticFamilyCounts, cases.length),
    },
    rarityDistribution: {
      OFF: offRarityCounts,
      ENABLED: enabledRarityCounts,
      driftPercentagePoints: rarityDrift,
    },
    warningCounts: {
      OFF: offRows.reduce((sum, row) => sum + row.warningCount, 0),
      ENABLED: enabledRows.reduce((sum, row) => sum + row.warningCount, 0),
    },
    acceptanceRead: {
      highConfidenceHardReductionTargetMet,
      routeDriftWithinTwoPointFivePp,
      unknownRateWithinTwoPercent,
      recommendation:
        highConfidenceHardReductionTargetMet && routeDriftWithinTwoPointFivePp && unknownRateWithinTwoPercent
          ? 'proceed to prebout-phase-route-bias-experiment'
          : !routeDriftWithinTwoPointFivePp
            ? 'adjust multiplier table and rerun harness'
            : 'keep diagnostic-only',
    },
    limitations: [
      'The harness uses the shared finishRoute selector, with route multipliers applied only in ENABLED mode.',
      'ENABLED does not enable production behavior.',
      'Full downstream career RNG parity is not claimed.',
    ],
    boutFlowSnapshots: offRows.slice(0, 16).map((row) => ({
      caseId: row.caseId,
      mode: row.mode,
      snapshot: row.boutFlowSnapshot,
    })),
    examples: {
      changedRoutes: enabledRows
        .filter((row, index) => row.winRoute !== offRows[index]?.winRoute)
        .slice(0, 12)
        .map((row, index) => ({
          caseId: row.caseId,
          offRoute: offRows.find((off) => off.caseId === row.caseId)?.winRoute,
          enabledRoute: row.winRoute,
          phase: row.dominantPhase,
          boutFlowSnapshot: row.boutFlowSnapshot,
          boutFlow: row.boutFlow,
          confidence: row.confidenceBucket,
          offSeverity: offRows.find((off) => off.caseId === row.caseId)?.severity,
          enabledSeverity: row.severity,
          routeBiasReasonTags: row.routeBiasReasonTags,
          exampleIndex: index,
        })),
    },
  };
  const outPath = path.resolve('.tmp/prebout-phase-route-bias-harness.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`prebout phase route bias harness written: ${outPath}`);
  console.log(JSON.stringify({
    totalSampledPlayerBouts: report.totalSampledPlayerBouts,
    parity: report.parity,
    summaries: report.summaries,
    highConfidenceHardContradictionRate: report.highConfidenceHardContradictionRate,
    routeDistribution: report.routeDistribution,
    kimariteFamilyDistribution: report.kimariteFamilyDistribution,
    diagnosticFamilyDistribution: report.diagnosticFamilyDistribution,
    rarityDistribution: report.rarityDistribution,
    boutFlowSnapshotDistribution: report.boutFlowSnapshotDistribution,
    warningCounts: report.warningCounts,
    acceptanceRead: report.acceptanceRead,
  }, null, 2));
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
