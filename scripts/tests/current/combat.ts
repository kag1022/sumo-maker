import { readFileSync } from 'node:fs';
import {
  buildGeneratedOpponentBashoCombatProfile,
  buildNpcBashoCombatProfile,
  buildPlayerBashoCombatProfile,
} from '../../../src/logic/simulation/combat/profile';
import type { Trait, WinRoute } from '../../../src/logic/models';
import {
  normalizePlayerBoutCompatInput,
  resolvePlayerBoutCompat,
} from '../../../src/logic/simulation/combat/playerCompat';
import { resolveCombatKernelProbability } from '../../../src/logic/simulation/combat/kernel';
import {
  PRE_BOUT_PHASES,
  type PreBoutPhaseWeights,
  resolvePreBoutPhaseDiagnostic,
  resolvePreBoutPhaseWeights,
  samplePreBoutPhase,
} from '../../../src/logic/simulation/combat/preBoutPhase';
import {
  resolvePreBoutPhaseConfidence,
  resolvePreBoutPhaseRouteBias,
} from '../../../src/logic/simulation/combat/preBoutPhaseRouteBias';
import type { BoutEngagement } from '../../../src/logic/kimarite/engagement';
import {
  type FinishRouteContext,
  resolveFinishRoute,
  resolveFinishRouteCandidates,
} from '../../../src/logic/kimarite/finishRoute';
import { resolveControlPhaseCandidate } from '../../../src/logic/simulation/combat/controlPhaseAdapter';
import {
  createBoutFlowDiagnosticSnapshot,
  type BoutFlowDiagnosticSnapshot,
} from '../../../src/logic/simulation/combat/boutFlowDiagnosticSnapshot';
import {
  buildBoutFlowDiagnosticContextTags,
  createBoutFlowDiagnosticSnapshotFromExplanationSnapshot,
} from '../../../src/logic/simulation/combat/boutFlowDiagnosticBuilder';
import { createBoutFlowCommentaryDiagnostic } from '../../../src/logic/simulation/combat/boutFlowCommentary';
import {
  classifyPreBoutPhaseKimariteContradiction,
  resolveDiagnosticKimariteMetadata,
} from '../../diagnostics/kimarite_family_classifier';
import {
  type BoutExplanationSnapshot,
  isBoutFlowDiagnosticSnapshotEnabled,
  isBoutExplanationSnapshotEnabled,
  isPreBoutPhaseSnapshotEnabled,
  recordBoutExplanationSnapshot,
  recordPreBoutPhaseSnapshot,
  type PreBoutPhaseSnapshot,
  withBoutFlowDiagnosticSnapshotCollector,
  withBoutExplanationSnapshotCollector,
  withPreBoutPhaseSnapshotCollector,
} from '../../../src/logic/simulation/diagnostics';
import { calculateBattleResult } from '../../../src/logic/battle';
import { resolveBashoFormatPolicy } from '../../../src/logic/simulation/basho/formatPolicy';
import { resolveBoutWinProb } from '../../../src/logic/simulation/strength/model';
import type { TestCase } from '../types';
import {
  assert,
  createMockActor,
  createStatus,
  createTorikumiParticipant,
} from '../shared/currentHelpers';

const assertNoPerBoutFields = (profile: Record<string, unknown>): void => {
  [
    'currentWins',
    'currentLosses',
    'currentWinStreak',
    'currentLossStreak',
    'calendarDay',
    'boutOrdinal',
    'pressure',
    'expectedWinsSoFar',
    'randomBoutNoise',
    'kimarite',
    'winRoute',
  ].forEach((field) => {
    assert.equal(field in profile, false);
  });
};

const assertAlmostEqual = (actual: number | undefined, expected: number, label: string): void => {
  assert.ok(actual !== undefined, `${label} should be defined`);
  if (actual === undefined) return;
  assert.ok(Math.abs(actual - expected) < 0.0000001, `${label}: expected ${expected}, got ${actual}`);
};

const finishRouteContext: FinishRouteContext = {
  isHighPressure: true,
  isLastDay: false,
  isUnderdog: true,
  isEdgeCandidate: true,
  weightDiff: 8,
  heightDiff: 7,
};

const finishRouteEngagement: BoutEngagement = {
  phase: 'MIXED',
  defenderCollapsed: false,
  edgeCrisis: true,
  gripEstablished: false,
  weightDomination: false,
};

export const tests: TestCase[] = [
  {
    name: 'combat profile: player builder exposes readonly basho-level fields only',
    run: () => {
      const status = createStatus({
        shikona: '型山',
        rank: { division: 'Juryo', name: '十両', number: 8, side: 'East' },
        tactics: 'PUSH',
        currentCondition: 60,
        bodyMetrics: { heightCm: 188, weightKg: 153 },
        stats: {
          tsuki: 70,
          oshi: 68,
          kumi: 44,
          nage: 48,
          koshi: 54,
          deashi: 66,
          waza: 52,
          power: 64,
        },
      });
      const profile = buildPlayerBashoCombatProfile({
        status,
        formatKind: resolveBashoFormatPolicy('Juryo')?.kind,
        bashoFormDelta: 3.5,
      });
      assert.equal(profile.source, 'PLAYER');
      assert.equal(profile.name, '型山');
      assert.equal(profile.division, 'Juryo');
      assert.equal(profile.formatKind, 'SEKITORI_15');
      assert.equal(profile.style, 'PUSH');
      assert.equal(profile.bashoFormDelta, 3.5);
      assert.ok(profile.basePower > 0);
      assert.ok((profile.baseAbility ?? 0) > 0);
      assert.ok((profile.rankBaselineAbility ?? 0) > 0);
      assert.ok((profile.pushStrength ?? 0) > (profile.beltStrength ?? 0));
      assertNoPerBoutFields(profile as unknown as Record<string, unknown>);
    },
  },
  {
    name: 'combat profile: npc participant keeps raw ability and separate basho form',
    run: () => {
      const participant = {
        ...createTorikumiParticipant('npc-a', 'Makushita', '幕下', 12, 'stable-001'),
        power: 82,
        ability: 91,
        bashoFormDelta: -4.25,
        styleBias: 'GRAPPLE' as const,
        heightCm: 181,
        weightKg: 142,
      };
      const profile = buildNpcBashoCombatProfile({
        npc: participant,
        formatKind: resolveBashoFormatPolicy('Makushita')?.kind,
      });
      assert.equal(profile.source, 'NPC');
      assert.equal(profile.id, 'npc-a');
      assert.equal(profile.basePower, 82);
      assert.equal(profile.baseAbility, 91);
      assert.equal(profile.bashoFormDelta, -4.25);
      assert.equal(profile.style, 'GRAPPLE');
      assert.equal(profile.styleBias, 'GRAPPLE');
      assert.equal(profile.formatKind, 'LOWER_7');
      assertNoPerBoutFields(profile as unknown as Record<string, unknown>);
    },
  },
  {
    name: 'combat profile: persistent npc builder is pure',
    run: () => {
      const actor = {
        ...createMockActor('actor-a', '不変山', 'Juryo'),
        ability: 103,
        basePower: 97,
        styleBias: 'TECHNIQUE' as const,
        heightCm: 176,
        weightKg: 128,
      };
      const before = JSON.stringify(actor);
      const profile = buildNpcBashoCombatProfile({ npc: actor });
      assert.equal(JSON.stringify(actor), before);
      assert.equal(profile.id, 'actor-a');
      assert.equal(profile.name, '不変山');
      assert.equal(profile.basePower, 97);
      assert.equal(profile.baseAbility, 103);
      assert.equal(profile.style, 'TECHNIQUE');
    },
  },
  {
    name: 'combat profile: generated opponent does not invent basho form',
    run: () => {
      const profile = buildGeneratedOpponentBashoCombatProfile({
        division: 'Makuuchi',
        formatKind: 'SEKITORI_15',
        enemy: {
          shikona: '生成山',
          rankValue: 6,
          power: 112,
          ability: 118,
          heightCm: 190,
          weightKg: 166,
          styleBias: 'BALANCE',
        },
      });
      assert.equal(profile.source, 'GENERATED_OPPONENT');
      assert.equal(profile.basePower, 112);
      assert.equal(profile.baseAbility, 118);
      assert.equal(profile.bashoFormDelta, 0);
      assert.equal(profile.style, 'BALANCED');
      assert.equal(profile.rankValue, 6);
    },
  },
  {
    name: 'combat profile: maezumo is not forced into format policy',
    run: () => {
      const status = createStatus({
        rank: { division: 'Maezumo', name: '前相撲', number: 1, side: 'East' },
      });
      const profile = buildPlayerBashoCombatProfile({ status });
      assert.equal(resolveBashoFormatPolicy('Maezumo'), null);
      assert.equal(profile.division, 'Maezumo');
      assert.equal(profile.formatKind, undefined);
    },
  },
  {
    name: 'combat profile: player compat wrapper preserves input references and result shape',
    run: () => {
      const status = createStatus();
      const enemy = {
        shikona: '互換山',
        rankValue: 6,
        power: 84,
        ability: 88,
        heightCm: 182,
        weightKg: 144,
        styleBias: 'BALANCE' as const,
      };
      const context = {
        day: 1,
        currentWins: 0,
        currentLosses: 0,
        consecutiveWins: 0,
        isLastDay: false,
        isYushoContention: false,
      };
      const rng = () => 0.42;
      const normalized = normalizePlayerBoutCompatInput({ rikishi: status, enemy, context, rng });
      assert.equal(normalized.rikishi, status);
      assert.equal(normalized.enemy, enemy);
      assert.equal(normalized.context, context);
      assert.equal(normalized.rng, rng);
      const result = resolvePlayerBoutCompat(
        { rikishi: status, enemy, context, rng },
        (input) => {
          assert.equal(input.rikishi, status);
          assert.equal(input.enemy, enemy);
          assert.equal(input.context, context);
          assert.equal(input.rng, rng);
          return {
            isWin: true,
            kimarite: '押し出し',
            winRoute: 'PUSH_OUT',
            winProbability: 0.51,
            opponentAbility: 88,
          };
        },
      );
      assert.equal(result.isWin, true);
      assert.equal(result.kimarite, '押し出し');
      assert.equal(result.winRoute, 'PUSH_OUT');
      assert.equal(result.winProbability, 0.51);
      assert.equal(result.opponentAbility, 88);
    },
  },
  {
    name: 'combat kernel: source and metadata do not affect probability',
    run: () => {
      const probabilityInput = {
        attackerAbility: 102,
        defenderAbility: 97,
        attackerStyle: 'PUSH' as const,
        defenderStyle: 'TECHNIQUE' as const,
        injuryPenalty: 1,
        bonus: 0.35,
      };
      assert.equal(resolveCombatKernelProbability.length, 1);
      const directProbability = resolveBoutWinProb(probabilityInput);
      const kernelInput = {
        source: 'PLAYER_BASE',
        ...probabilityInput,
        metadata: {
          division: 'Juryo',
          formatKind: 'SEKITORI_15',
          calendarDay: 8,
          boutOrdinal: 8,
          pressureFlags: { isKachiMakeDecider: true },
        },
      } as const;
      const kernelOutput = resolveCombatKernelProbability(kernelInput);
      assert.equal(kernelOutput.probability, directProbability);
      assert.equal(kernelOutput.input.source, 'PLAYER_BASE');
      assert.equal(kernelOutput.input.metadata?.calendarDay, 8);
      assert.deepEqual(kernelOutput.input, kernelInput);

      const baselineOutput = resolveCombatKernelProbability({
        source: 'PLAYER_BASELINE',
        ...probabilityInput,
        metadata: {
          division: 'Makushita',
          formatKind: 'LOWER_7',
          calendarDay: 13,
          boutOrdinal: 7,
        },
      });
      assert.equal(baselineOutput.probability, directProbability);

      const npcInput = {
        ...probabilityInput,
        diffSoftCap: 18,
      };
      const npcDirectProbability = resolveBoutWinProb(npcInput);
      const npcOutput = resolveCombatKernelProbability({
        source: 'NPC_MAIN',
        ...npcInput,
        metadata: { division: 'Makushita' },
      });
      assert.equal(npcOutput.probability, npcDirectProbability);
    },
  },
  {
    name: 'combat phase: prebout resolver is deterministic and diagnostic-only',
    run: () => {
      const input = {
        source: 'PLAYER_DIAGNOSTIC' as const,
        attackerStyle: 'PUSH' as const,
        defenderStyle: 'GRAPPLE' as const,
        attackerPushStrength: 72,
        defenderBeltStrength: 68,
        attackerHeightCm: 188,
        defenderHeightCm: 176,
        attackerWeightKg: 152,
        defenderWeightKg: 128,
        formatKind: 'SEKITORI_15' as const,
        pressure: {
          isFinalBout: true,
          isKachiMakeDecider: true,
        },
      };
      const first = resolvePreBoutPhaseWeights(input);
      const second = resolvePreBoutPhaseWeights(input);
      assert.deepEqual(first, second);
      PRE_BOUT_PHASES.forEach((phase) => {
        assert.ok(Number.isFinite(first.weights[phase]), `${phase} weight should be finite`);
        assert.ok(first.weights[phase] >= 0, `${phase} weight should be non-negative`);
      });
      assert.ok(first.weights.THRUST_BATTLE > 0);
      assert.ok(first.weights.BELT_BATTLE > 0);
      const sampledA = samplePreBoutPhase(first.weights, () => 0.2);
      const sampledB = samplePreBoutPhase(first.weights, () => 0.2);
      assert.equal(sampledA, sampledB);
      const diagnostic = resolvePreBoutPhaseDiagnostic(input, () => 0.99);
      assert.ok(PRE_BOUT_PHASES.includes(diagnostic.phase ?? 'MIXED'));
    },
  },
  {
    name: 'combat phase route bias: helper is pure and neutral when disabled',
    run: () => {
      const weights: PreBoutPhaseWeights = {
        THRUST_BATTLE: 3,
        BELT_BATTLE: 0.4,
        TECHNIQUE_SCRAMBLE: 0.3,
        EDGE_BATTLE: 0.2,
        QUICK_COLLAPSE: 0.2,
        MIXED: 0.1,
      };
      const routeCandidates = ['PUSH_OUT', 'BELT_FORCE', 'THROW_BREAK'] as const;
      const pressure = { isFinalBout: true };
      const before = JSON.stringify({ weights, routeCandidates, pressure });
      const first = resolvePreBoutPhaseRouteBias({
        mode: 'OFF',
        phaseWeights: weights,
        routeCandidates,
        pressure,
      });
      const second = resolvePreBoutPhaseRouteBias({
        mode: 'OFF',
        phaseWeights: weights,
        routeCandidates,
        pressure,
      });
      assert.equal(first.applied, false);
      assert.deepEqual(first.multipliers, {});
      assert.deepEqual(first, second);
      assert.equal(JSON.stringify({ weights, routeCandidates, pressure }), before);

      const missingWeights = resolvePreBoutPhaseRouteBias({
        mode: 'DIAGNOSTIC',
        routeCandidates,
      });
      assert.equal(missingWeights.applied, false);
      assert.deepEqual(missingWeights.multipliers, {});
    },
  },
  {
    name: 'combat phase route bias: confidence and neutral cases follow thresholds',
    run: () => {
      const low: PreBoutPhaseWeights = {
        THRUST_BATTLE: 1,
        BELT_BATTLE: 1,
        TECHNIQUE_SCRAMBLE: 1,
        EDGE_BATTLE: 1,
        QUICK_COLLAPSE: 1,
        MIXED: 1,
      };
      const lowConfidence = resolvePreBoutPhaseConfidence(low);
      assert.equal(lowConfidence.bucket, 'LOW');
      const lowBias = resolvePreBoutPhaseRouteBias({
        mode: 'DIAGNOSTIC',
        phaseWeights: low,
        routeCandidates: ['PUSH_OUT', 'BELT_FORCE'],
      });
      assert.equal(lowBias.applied, false);
      assert.deepEqual(lowBias.multipliers, {});

      const mixed: PreBoutPhaseWeights = {
        THRUST_BATTLE: 0.8,
        BELT_BATTLE: 0.8,
        TECHNIQUE_SCRAMBLE: 0.8,
        EDGE_BATTLE: 0.4,
        QUICK_COLLAPSE: 0.4,
        MIXED: 3,
      };
      const mixedConfidence = resolvePreBoutPhaseConfidence(mixed);
      assert.equal(mixedConfidence.dominantPhase, 'MIXED');
      const mixedBias = resolvePreBoutPhaseRouteBias({
        mode: 'ENABLED',
        phaseWeights: mixed,
        routeCandidates: ['PUSH_OUT', 'BELT_FORCE', 'THROW_BREAK'],
      });
      assert.equal(mixedBias.applied, false);
      assert.deepEqual(mixedBias.multipliers, {});
    },
  },
  {
    name: 'combat phase route bias: high thrust applies filtered bounded multipliers',
    run: () => {
      const weights: PreBoutPhaseWeights = {
        THRUST_BATTLE: 3,
        BELT_BATTLE: 0.4,
        TECHNIQUE_SCRAMBLE: 0.3,
        EDGE_BATTLE: 0.2,
        QUICK_COLLAPSE: 0.2,
        MIXED: 0.1,
      };
      const confidence = resolvePreBoutPhaseConfidence(weights);
      assert.equal(confidence.dominantPhase, 'THRUST_BATTLE');
      assert.equal(confidence.bucket, 'HIGH');

      const bias = resolvePreBoutPhaseRouteBias({
        mode: 'ENABLED',
        phaseWeights: weights,
        routeCandidates: ['PUSH_OUT', 'BELT_FORCE', 'THROW_BREAK'],
      });
      assert.equal(bias.applied, true);
      assert.deepEqual(bias.multipliers, {
        PUSH_OUT: 1.15,
        BELT_FORCE: 0.7,
        THROW_BREAK: 0.7,
      });
      assert.ok(bias.reasonTags.includes('phase-route-bias:THRUST_BATTLE:HIGH'));
      assert.ok(bias.reasonTags.includes('route:PUSH_OUT:1.15'));
      assert.equal('PULL_DOWN' in bias.multipliers, false);
      Object.values(bias.multipliers).forEach((multiplier) => {
        assert.ok((multiplier ?? 1) >= 0.7);
        assert.ok((multiplier ?? 1) <= 1.15);
      });

      const again = resolvePreBoutPhaseRouteBias({
        mode: 'ENABLED',
        phaseWeights: weights,
        routeCandidates: ['PUSH_OUT', 'BELT_FORCE', 'THROW_BREAK'],
      });
      assert.deepEqual(again, bias);
    },
  },
  {
    name: 'combat control phase: diagnostic adapter keeps predecessor separate from candidate',
    run: () => {
      const unavailable = resolveControlPhaseCandidate({});
      assert.equal(unavailable.controlPhasePredecessor, undefined);
      assert.equal(unavailable.controlPhaseCandidate, undefined);
      assert.equal(unavailable.confidence, 'UNAVAILABLE');

      const thrust = resolveControlPhaseCandidate({
        engagement: {
          ...finishRouteEngagement,
          phase: 'THRUST_BATTLE',
        },
        finishRoute: 'PUSH_OUT',
      });
      assert.equal(thrust.controlPhasePredecessor, 'THRUST_BATTLE');
      assert.equal(thrust.controlPhaseCandidate, 'THRUST_BATTLE');
      assert.equal(thrust.confidence, 'DIRECT');

      const edge = resolveControlPhaseCandidate({
        engagement: {
          ...finishRouteEngagement,
          phase: 'EDGE_SCRAMBLE',
          edgeCrisis: true,
        },
        finishRoute: 'EDGE_REVERSAL',
      });
      assert.equal(edge.controlPhasePredecessor, 'EDGE_SCRAMBLE');
      assert.equal(edge.controlPhaseCandidate, 'EDGE_BATTLE');
      assert.equal(edge.confidence, 'RENAMED');

      const mixedTechnique = resolveControlPhaseCandidate({
        engagement: {
          ...finishRouteEngagement,
          phase: 'MIXED',
          edgeCrisis: false,
        },
        finishRoute: 'THROW_BREAK',
      });
      assert.equal(mixedTechnique.controlPhasePredecessor, 'MIXED');
      assert.equal(mixedTechnique.controlPhaseCandidate, 'TECHNIQUE_SCRAMBLE');
      assert.equal(mixedTechnique.confidence, 'INFERRED');

      const mixedAmbiguous = resolveControlPhaseCandidate({
        engagement: {
          ...finishRouteEngagement,
          phase: 'MIXED',
          edgeCrisis: false,
          gripEstablished: false,
        },
        finishRoute: 'PUSH_OUT',
      });
      assert.equal(mixedAmbiguous.controlPhasePredecessor, 'MIXED');
      assert.equal(mixedAmbiguous.controlPhaseCandidate, 'MIXED');
      assert.equal(mixedAmbiguous.confidence, 'AMBIGUOUS');
    },
  },
  {
    name: 'combat control phase: bout flow diagnostic snapshot classifies transitions',
    run: () => {
      const aligned = createBoutFlowDiagnosticSnapshot({
        openingPhase: 'THRUST_BATTLE',
        openingConfidence: 'HIGH',
        controlPhasePredecessor: 'THRUST_BATTLE',
        controlPhaseCandidate: 'THRUST_BATTLE',
        controlConfidence: 'DIRECT',
        finishRoute: 'PUSH_OUT',
        kimarite: {
          name: '押し出し',
          family: 'PUSH_THRUST',
          diagnosticFamily: 'PUSH_THRUST',
          rarity: 'COMMON',
        },
      });
      assert.equal(aligned.transitionClassification, 'ALIGNED_FLOW');
      assert.equal(aligned.explanationCompleteness, 'FLOW_ONLY');
      assert.ok(aligned.missingExplanationAxes.includes('VICTORY_FACTOR'));
      assert.ok(aligned.missingExplanationAxes.includes('HOSHITORI_CONTEXT'));
      assert.ok(aligned.missingExplanationAxes.includes('BANZUKE_CONTEXT'));
      assert.ok(aligned.explanationCoverage.some((entry) =>
        entry.axis === 'OPENING' && entry.status === 'AVAILABLE',
      ));

      const edge = createBoutFlowDiagnosticSnapshot({
        ...aligned,
        openingPhase: 'BELT_BATTLE',
        controlPhasePredecessor: 'EDGE_SCRAMBLE',
        controlPhaseCandidate: 'EDGE_BATTLE',
        controlConfidence: 'RENAMED',
        finishRoute: 'EDGE_REVERSAL',
      });
      assert.equal(edge.transitionClassification, 'EDGE_TURNAROUND');

      const technique = createBoutFlowDiagnosticSnapshot({
        ...aligned,
        openingPhase: 'MIXED',
        controlPhasePredecessor: 'MIXED',
        controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
        controlConfidence: 'INFERRED',
        finishRoute: 'THROW_BREAK',
      });
      assert.equal(technique.transitionClassification, 'TECHNIQUE_CONVERSION');

      const ambiguous = createBoutFlowDiagnosticSnapshot({
        ...aligned,
        controlPhasePredecessor: 'MIXED',
        controlPhaseCandidate: 'MIXED',
        controlConfidence: 'AMBIGUOUS',
      });
      assert.equal(ambiguous.transitionClassification, 'AMBIGUOUS_CONTROL');

      const complete = createBoutFlowDiagnosticSnapshot({
        ...aligned,
        victoryFactorTags: ['victory-factor:ability'],
        hoshitoriContextTags: ['KACHIKOSHI_DECIDER'],
        banzukeContextTags: ['PROMOTION_RELEVANT'],
      });
      assert.equal(complete.explanationCompleteness, 'COMPLETE_CONTEXT');
      assert.deepEqual(complete.missingExplanationAxes, []);
    },
  },
  {
    name: 'combat control phase: pure builder fills victory hoshitori and banzuke context',
    run: () => {
      const factors = [
        {
          kind: 'ABILITY' as const,
          direction: 'FOR_ATTACKER' as const,
          strength: 'MEDIUM' as const,
          label: '基礎能力差',
        },
        {
          kind: 'PRESSURE' as const,
          direction: 'NEUTRAL' as const,
          strength: 'SMALL' as const,
          label: '勝負所の文脈',
        },
      ];
      const contextTags = buildBoutFlowDiagnosticContextTags({
        factors,
        boutOrdinal: 15,
        calendarDay: 15,
        currentWins: 7,
        currentLosses: 7,
        currentWinStreak: 2,
        currentLossStreak: 0,
        pressure: {
          isFinalBout: true,
          isKachiMakeDecider: true,
          isKachikoshiDecider: true,
          isPromotionRelevant: true,
        },
        titleImplication: 'NONE',
        boundaryImplication: 'PROMOTION',
        division: 'Juryo',
        rank: { division: 'Juryo', name: '十両', number: 8, side: 'East' },
        isKinboshiContext: false,
      });
      assert.ok(contextTags.victoryFactorTags.includes('victory-factor:ability'));
      assert.ok(contextTags.hoshitoriContextTags.includes('FINAL_BOUT'));
      assert.ok(contextTags.hoshitoriContextTags.includes('KACHI_MAKE_DECIDER'));
      assert.ok(contextTags.hoshitoriContextTags.includes('KACHIKOSHI_DECIDER'));
      assert.ok(contextTags.hoshitoriContextTags.includes('WIN_STREAK'));
      assert.ok(contextTags.banzukeContextTags.includes('PROMOTION_RELEVANT'));
      assert.ok(contextTags.banzukeContextTags.includes('SEKITORI_BOUNDARY'));

      const flowSnapshot = createBoutFlowDiagnosticSnapshotFromExplanationSnapshot({
        source: 'PLAYER_BOUT',
        division: 'Juryo',
        rank: { division: 'Juryo', name: '十両', number: 8, side: 'East' },
        formatKind: 'SEKITORI_15',
        totalBouts: 15,
        calendarDay: 15,
        boutOrdinal: 15,
        currentWins: 7,
        currentLosses: 7,
        currentWinStreak: 2,
        currentLossStreak: 0,
        pressure: {
          isFinalBout: true,
          isKachiMakeDecider: true,
          isKachikoshiDecider: true,
          isPromotionRelevant: true,
        },
        boundaryImplication: 'PROMOTION',
        preBoutPhaseWeights: {
          THRUST_BATTLE: 3,
          BELT_BATTLE: 0.4,
          TECHNIQUE_SCRAMBLE: 0.2,
          EDGE_BATTLE: 0.2,
          QUICK_COLLAPSE: 0.1,
          MIXED: 0.1,
        },
        kimarite: '押し出し',
        winRoute: 'PUSH_OUT',
        boutEngagement: {
          phase: 'THRUST_BATTLE',
          defenderCollapsed: false,
          edgeCrisis: false,
          gripEstablished: false,
          weightDomination: true,
        },
        kimaritePattern: 'PUSH_ADVANCE',
        factors,
      });
      assert.ok(flowSnapshot);
      if (!flowSnapshot) return;
      assert.equal(flowSnapshot.explanationCompleteness, 'COMPLETE_CONTEXT');
      assert.deepEqual(flowSnapshot.missingExplanationAxes, []);
      assert.ok(flowSnapshot.explanationCoverage.every((entry) => entry.status === 'AVAILABLE'));
      assert.ok(flowSnapshot.victoryFactorTags.includes('victory-factor:ability'));
      assert.ok(flowSnapshot.hoshitoriContextTags.includes('FINAL_BOUT'));
      assert.ok(flowSnapshot.banzukeContextTags.includes('PROMOTION_RELEVANT'));
    },
  },
  {
    name: 'combat commentary: same kimarite varies by flow and context without rng',
    run: () => {
      const base = {
        finishRoute: 'PUSH_OUT' as const,
        kimarite: {
          name: '押し出し',
          family: 'PUSH_THRUST',
          diagnosticFamily: 'PUSH_THRUST',
          rarity: 'COMMON',
          catalogStatus: 'OFFICIAL',
        },
        victoryFactorTags: ['victory-factor:ability', 'victory-factor:style'],
      };
      const aligned = createBoutFlowDiagnosticSnapshot({
        ...base,
        openingPhase: 'THRUST_BATTLE',
        openingConfidence: 'HIGH',
        controlPhasePredecessor: 'THRUST_BATTLE',
        controlPhaseCandidate: 'THRUST_BATTLE',
        controlConfidence: 'DIRECT',
        hoshitoriContextTags: ['EARLY_BASHO', 'WIN_STREAK'],
        banzukeContextTags: ['RANK_EXPECTED_WIN'],
      });
      const boundary = createBoutFlowDiagnosticSnapshot({
        ...base,
        openingPhase: 'BELT_BATTLE',
        openingConfidence: 'MEDIUM',
        controlPhasePredecessor: 'THRUST_BATTLE',
        controlPhaseCandidate: 'THRUST_BATTLE',
        controlConfidence: 'DIRECT',
        hoshitoriContextTags: ['KACHI_MAKE_DECIDER', 'FINAL_BOUT'],
        banzukeContextTags: ['PROMOTION_RELEVANT', 'SEKITORI_BOUNDARY'],
        victoryFactorTags: ['victory-factor:pressure', 'victory-factor:body'],
      });
      const edge = createBoutFlowDiagnosticSnapshot({
        ...base,
        openingPhase: 'EDGE_BATTLE',
        openingConfidence: 'HIGH',
        controlPhasePredecessor: 'EDGE_SCRAMBLE',
        controlPhaseCandidate: 'EDGE_BATTLE',
        controlConfidence: 'RENAMED',
        hoshitoriContextTags: ['YUSHO_CHASE', 'RECOVERY_BOUT'],
        banzukeContextTags: ['KINBOSHI_CHANCE'],
        victoryFactorTags: ['victory-factor:momentum', 'victory-factor:kimarite-fit'],
      });
      const commentaries = [aligned, boundary, edge].map((snapshot) => {
        const diagnostic = createBoutFlowCommentaryDiagnostic(snapshot);
        assert.equal(diagnostic.generated, true);
        assert.ok(diagnostic.commentary);
        return diagnostic.commentary as NonNullable<typeof diagnostic.commentary>;
      });
      const generated = commentaries;
      assert.equal(new Set(generated.map((commentary) => commentary.kimarite)).size, 1);
      assert.ok(new Set(generated.map((commentary) => commentary.shortCommentary)).size > 1);
      assert.ok(new Set(generated.map((commentary) => commentary.materialKeys.join('|'))).size > 1);
      assert.deepEqual(generated[0].victoryFactorLabels, ['地力', '相撲の形']);
      assert.ok(generated[0].materialKeys.includes('victory:victory-factor:ability+victory-factor:style'));
      assert.ok(generated[1].shortCommentary.includes('昇進'));
      assert.ok(generated[1].materialKeys.some((key) => key.startsWith('hoshitori:KACHI_MAKE_DECIDER')));
      assert.ok(generated[1].materialKeys.some((key) => key.startsWith('banzuke:PROMOTION_RELEVANT')));
      assert.ok(generated[2].materialKeys.some((key) => key.startsWith('transition:EDGE_TURNAROUND')));
      assert.ok(generated[2].materialKeys.some((key) => key.startsWith('banzuke:KINBOSHI_CHANCE')));

      const blocked = createBoutFlowCommentaryDiagnostic({
        ...aligned,
        explanationCompleteness: 'FLOW_ONLY',
        missingExplanationAxes: ['VICTORY_FACTOR'],
      });
      assert.equal(blocked.generated, false);
      assert.ok(blocked.reasonTags.includes('missing:VICTORY_FACTOR'));
    },
  },
  {
    name: 'combat finish route: production-equivalent candidates keep order and weights',
    run: () => {
      const winner = {
        style: 'TECHNIQUE' as const,
        bodyType: 'SOPPU' as const,
        stats: {
          tsuki: 66,
          oshi: 72,
          kumi: 54,
          koshi: 56,
          nage: 88,
          waza: 84,
        },
        traits: ['DOHYOUGIWA_MAJUTSU', 'READ_THE_BOUT'] as Trait[],
        repertoire: {
          version: 1 as const,
          provisional: false,
          primaryRoutes: ['PUSH_OUT' as const],
          secondaryRoutes: ['PULL_DOWN' as const, 'LEG_ATTACK' as const],
          entries: [],
        },
      };
      const candidates = resolveFinishRouteCandidates({
        winner,
        context: finishRouteContext,
      });
      assert.deepEqual(
        candidates.map((candidate) => candidate.value),
        [
          'PUSH_OUT',
          'BELT_FORCE',
          'THROW_BREAK',
          'PULL_DOWN',
          'EDGE_REVERSAL',
          'REAR_FINISH',
          'LEG_ATTACK',
        ],
      );
      const weights = Object.fromEntries(candidates.map((candidate) => [candidate.value, candidate.weight]));
      assertAlmostEqual(weights.PUSH_OUT, 0.2 + 2.2 + (72 + 66) / 90 + 0.35, 'PUSH_OUT');
      assertAlmostEqual(weights.BELT_FORCE, 0.25 + (54 + 56) / 92 + 0.45, 'BELT_FORCE');
      assertAlmostEqual(weights.THROW_BREAK, 2.4 + (88 + 84) / 94, 'THROW_BREAK');
      assertAlmostEqual(weights.PULL_DOWN, 1.7 + 1.65 + 0.45 + 0.18, 'PULL_DOWN');
      assertAlmostEqual(weights.EDGE_REVERSAL, 0.14 + 1.2 + 0.45, 'EDGE_REVERSAL');
      assertAlmostEqual(weights.REAR_FINISH, 0.04 + 0.65 + 0.3, 'REAR_FINISH');
      assertAlmostEqual(weights.LEG_ATTACK, 0.015 + 0.1 + 0.08 + 0.08, 'LEG_ATTACK');
    },
  },
  {
    name: 'combat finish route: threshold and rng consumption are fixed',
    run: () => {
      const winner = {
        style: 'PUSH' as const,
        bodyType: 'NORMAL' as const,
        stats: {
          tsuki: 50,
          oshi: 50,
          kumi: 50,
          koshi: 50,
          nage: 50,
          waza: 50,
        },
        traits: [] as Trait[],
      };
      const thresholdCandidates = resolveFinishRouteCandidates({
        winner,
        context: {
          ...finishRouteContext,
          isHighPressure: true,
          isUnderdog: false,
          isEdgeCandidate: false,
          weightDiff: 0,
          heightDiff: 0,
        },
      });
      assert.equal(thresholdCandidates.some((candidate) => candidate.value === 'REAR_FINISH'), false);
      let calls = 0;
      const selected = resolveFinishRoute({
        winner: {
          ...winner,
          style: 'TECHNIQUE',
          bodyType: 'SOPPU',
          traits: ['ARAWAZASHI'] as Trait[],
        },
        context: finishRouteContext,
        rng: () => {
          calls += 1;
          return 0.99;
        },
      });
      assert.equal(calls, 1);
      assert.equal(selected, 'LEG_ATTACK');
    },
  },
  {
    name: 'combat finish route: route multipliers are explicit diagnostics-only input',
    run: () => {
      const routes: readonly WinRoute[] = [
        'PUSH_OUT',
        'BELT_FORCE',
        'THROW_BREAK',
        'PULL_DOWN',
        'EDGE_REVERSAL',
        'REAR_FINISH',
        'LEG_ATTACK',
      ];
      const winner = {
        style: 'PUSH' as const,
        bodyType: 'NORMAL' as const,
        stats: {
          tsuki: 70,
          oshi: 76,
          kumi: 48,
          koshi: 52,
          nage: 48,
          waza: 50,
        },
        traits: [] as Trait[],
      };
      const phaseWeights: PreBoutPhaseWeights = {
        THRUST_BATTLE: 3,
        BELT_BATTLE: 0.4,
        TECHNIQUE_SCRAMBLE: 0.3,
        EDGE_BATTLE: 0.2,
        QUICK_COLLAPSE: 0.2,
        MIXED: 0.1,
      };
      const offBias = resolvePreBoutPhaseRouteBias({
        mode: 'OFF',
        phaseWeights,
        routeCandidates: routes,
      });
      const diagnosticBias = resolvePreBoutPhaseRouteBias({
        mode: 'DIAGNOSTIC',
        phaseWeights,
        routeCandidates: routes,
      });
      const enabledBias = resolvePreBoutPhaseRouteBias({
        mode: 'ENABLED',
        phaseWeights,
        routeCandidates: routes,
      });
      const baseCandidates = resolveFinishRouteCandidates({
        winner,
        context: finishRouteContext,
        engagement: finishRouteEngagement,
      });
      assert.equal(offBias.applied, false);
      assert.deepEqual(offBias.multipliers, {});
      assert.equal(diagnosticBias.applied, true);
      assert.equal(enabledBias.applied, true);
      assert.deepEqual(
        resolveFinishRouteCandidates({
          winner,
          context: finishRouteContext,
          engagement: finishRouteEngagement,
          routeMultipliers: offBias.multipliers,
        }),
        baseCandidates,
      );
      assert.deepEqual(
        resolveFinishRouteCandidates({
          winner,
          context: finishRouteContext,
          engagement: finishRouteEngagement,
        }),
        baseCandidates,
      );
      const enabledCandidates = resolveFinishRouteCandidates({
        winner,
        context: finishRouteContext,
        engagement: finishRouteEngagement,
        routeMultipliers: enabledBias.multipliers,
      });
      const basePush = baseCandidates.find((candidate) => candidate.value === 'PUSH_OUT')?.weight;
      const enabledPush = enabledCandidates.find((candidate) => candidate.value === 'PUSH_OUT')?.weight;
      assert.ok((enabledPush ?? 0) > (basePush ?? 0), 'ENABLED multiplier should only affect explicit diagnostic input');

      const battleSource = readFileSync('src/logic/battle.ts', 'utf8');
      const productionCallMatches = battleSource.match(/resolveFinishRoute\(\{/g) ?? [];
      assert.equal(productionCallMatches.length, 1);
      const callStart = battleSource.indexOf('resolveFinishRoute({');
      const callEnd = battleSource.indexOf('});', callStart);
      assert.ok(callStart >= 0 && callEnd > callStart, 'battle.ts should call resolveFinishRoute');
      const productionCall = battleSource.slice(callStart, callEnd);
      assert.equal(productionCall.includes('routeMultipliers'), false);

      const harnessSource = readFileSync('scripts/diagnostics/prebout_phase_route_bias_harness.ts', 'utf8');
      assert.ok(
        harnessSource.includes("const routeMultipliers = mode === 'ENABLED' ? bias.multipliers : undefined;"),
        'route bias harness should apply multipliers only in ENABLED mode',
      );
    },
  },
  {
    name: 'combat diagnostic kimarite classifier: hard labels require clear mismatch',
    run: () => {
      const mixed = classifyPreBoutPhaseKimariteContradiction({
        phase: 'MIXED',
        confidenceBucket: 'HIGH',
        route: 'BELT_FORCE',
        metadata: resolveDiagnosticKimariteMetadata('寄り切り'),
      });
      assert.equal(mixed.severity, 'NONE');
      assert.equal(mixed.contradiction, false);

      const thrustBelt = classifyPreBoutPhaseKimariteContradiction({
        phase: 'THRUST_BATTLE',
        confidenceBucket: 'HIGH',
        route: 'BELT_FORCE',
        metadata: resolveDiagnosticKimariteMetadata('寄り切り'),
      });
      assert.equal(thrustBelt.severity, 'HARD');
      assert.equal(thrustBelt.contradiction, true);

      const thrustThrow = classifyPreBoutPhaseKimariteContradiction({
        phase: 'THRUST_BATTLE',
        confidenceBucket: 'MEDIUM',
        route: 'THROW_BREAK',
        metadata: resolveDiagnosticKimariteMetadata('掬い投げ'),
      });
      assert.equal(thrustThrow.severity, 'UNKNOWN');
      assert.equal(thrustThrow.contradiction, false);
    },
  },
  {
    name: 'combat phase: prebout collector is opt-in and records no sampled phase',
    run: async () => {
      const weights = resolvePreBoutPhaseWeights({
        source: 'PLAYER_DIAGNOSTIC',
        attackerStyle: 'PUSH',
        defenderStyle: 'BALANCED',
      }).weights;
      assert.equal(isPreBoutPhaseSnapshotEnabled(), false);
      recordPreBoutPhaseSnapshot({
        source: 'PLAYER_BOUT',
        weights,
        reasonTags: [],
      });
      assert.equal(isPreBoutPhaseSnapshotEnabled(), false);

      const status = createStatus({
        rank: { division: 'Juryo', name: '十両', number: 8, side: 'East' },
        tactics: 'PUSH',
        bodyMetrics: { heightCm: 188, weightKg: 152 },
        stats: {
          tsuki: 72,
          oshi: 70,
          kumi: 44,
          nage: 48,
          koshi: 52,
          deashi: 64,
          waza: 50,
          power: 66,
        },
      });
      const enemy = {
        shikona: '診断相手',
        rankValue: 6,
        power: 84,
        ability: 87,
        heightCm: 181,
        weightKg: 139,
        styleBias: 'GRAPPLE' as const,
      };
      const context = {
        day: 15,
        currentWins: 7,
        currentLosses: 7,
        consecutiveWins: 0,
        isLastDay: true,
        isYushoContention: false,
        formatKind: 'SEKITORI_15' as const,
        ordinal: {
          calendarDay: 15,
          boutOrdinal: 15,
          totalBouts: 15 as const,
          isFinalBout: true,
          remainingBouts: 0,
        },
        pressure: {
          isKachiMakeDecider: true,
          isKachikoshiDecider: true,
          isMakekoshiDecider: true,
          isYushoRelevant: false,
          isPromotionRelevant: false,
          isDemotionRelevant: false,
          isFinalBout: true,
        },
      };
      const snapshots: PreBoutPhaseSnapshot[] = [];
      await withPreBoutPhaseSnapshotCollector(
        { runLabel: 'unit-prebout-player', seed: 1234 },
        (snapshot) => snapshots.push(snapshot),
        () => {
          calculateBattleResult(status, enemy, context, () => 0.42);
        },
      );

      assert.equal(snapshots.length, 1);
      const [snapshot] = snapshots;
      assert.equal(snapshot.source, 'PLAYER_BOUT');
      assert.equal(snapshot.runLabel, 'unit-prebout-player');
      assert.equal(snapshot.seed, 1234);
      assert.equal(snapshot.division, 'Juryo');
      assert.equal(snapshot.formatKind, 'SEKITORI_15');
      assert.equal(snapshot.calendarDay, 15);
      assert.equal(snapshot.boutOrdinal, 15);
      assert.equal(snapshot.attackerStyle, 'PUSH');
      assert.equal(snapshot.defenderStyle, 'GRAPPLE');
      assert.equal(snapshot.pressure?.isKachiMakeDecider, true);
      assert.ok(Number.isFinite(snapshot.attackerBodyScore));
      assert.ok(Number.isFinite(snapshot.defenderBodyScore));
      assert.ok(snapshot.reasonTags.length > 0);
      PRE_BOUT_PHASES.forEach((phase) => {
        assert.ok(Number.isFinite(snapshot.weights[phase]), `${phase} weight should be finite`);
        assert.ok(snapshot.weights[phase] >= 0, `${phase} weight should be non-negative`);
      });
      assert.equal('phase' in (snapshot as unknown as Record<string, unknown>), false);
      assert.equal(isPreBoutPhaseSnapshotEnabled(), false);
    },
  },
  {
    name: 'combat explanation: collector is opt-in and production commentary does not change rng',
    run: async () => {
      assert.equal(isBoutExplanationSnapshotEnabled(), false);
      assert.equal(isBoutFlowDiagnosticSnapshotEnabled(), false);
      recordBoutExplanationSnapshot({
        source: 'PLAYER_BOUT',
        factors: [],
      });
      assert.equal(isBoutExplanationSnapshotEnabled(), false);

      const createTestStatus = () => createStatus({
        rank: { division: 'Juryo', name: '十両', number: 8, side: 'East' },
        tactics: 'PUSH',
        bodyMetrics: { heightCm: 188, weightKg: 152 },
        currentCondition: 56,
        injuryLevel: 2,
        stats: {
          tsuki: 72,
          oshi: 70,
          kumi: 44,
          nage: 48,
          koshi: 52,
          deashi: 64,
          waza: 50,
          power: 66,
        },
      });
      const createEnemy = () => ({
        shikona: '説明相手',
        rankValue: 6,
        power: 84,
        ability: 87,
        heightCm: 181,
        weightKg: 139,
        styleBias: 'GRAPPLE' as const,
        bashoFormDelta: -2,
      });
      const context = {
        day: 15,
        currentWins: 7,
        currentLosses: 7,
        consecutiveWins: 0,
        isLastDay: true,
        isYushoContention: false,
        formatKind: 'SEKITORI_15' as const,
        ordinal: {
          calendarDay: 15,
          boutOrdinal: 15,
          totalBouts: 15 as const,
          isFinalBout: true,
          remainingBouts: 0,
        },
        pressure: {
          isKachiMakeDecider: true,
          isKachikoshiDecider: true,
          isMakekoshiDecider: true,
          isYushoRelevant: false,
          isPromotionRelevant: false,
          isDemotionRelevant: false,
          isFinalBout: true,
        },
        bashoFormDelta: 3,
      };
      const createCountingRng = () => {
        let calls = 0;
        const rng = () => {
          calls += 1;
          return 0.42;
        };
        return { rng, getCalls: () => calls };
      };

      const baselineRng = createCountingRng();
      const baselineResult = calculateBattleResult(
        createTestStatus(),
        createEnemy(),
        context,
        baselineRng.rng,
      );
      const baselineCommentary = baselineResult.boutFlowCommentary;
      if (!baselineCommentary) {
        throw new Error('expected production player bout commentary for COMPLETE_CONTEXT');
      }
      assert.equal(baselineCommentary.outcome, baselineResult.isWin ? 'WIN' : 'LOSS');
      assert.equal(baselineCommentary.kimarite, baselineResult.kimarite);
      assert.ok(baselineCommentary.shortCommentary.includes(baselineResult.kimarite));
      const snapshots: BoutExplanationSnapshot[] = [];
      const boutFlowSnapshots: Array<BoutFlowDiagnosticSnapshot & { runLabel?: string; seed?: number }> = [];
      const collectorRng = createCountingRng();
      const collectedResult = await withBoutFlowDiagnosticSnapshotCollector(
        { runLabel: 'unit-bout-flow-player', seed: 4321 },
        (snapshot) => boutFlowSnapshots.push(snapshot),
        async () => withBoutExplanationSnapshotCollector(
          { runLabel: 'unit-explanation-player', seed: 4321 },
          (snapshot) => snapshots.push(snapshot),
          () => calculateBattleResult(
            createTestStatus(),
            createEnemy(),
            context,
            collectorRng.rng,
          ),
        ),
      );

      assert.deepEqual(collectedResult, baselineResult);
      assert.equal(collectorRng.getCalls(), baselineRng.getCalls());
      assert.equal(snapshots.length, 1);
      const [snapshot] = snapshots;
      assert.equal(snapshot.source, 'PLAYER_BOUT');
      assert.equal(snapshot.runLabel, 'unit-explanation-player');
      assert.equal(snapshot.seed, 4321);
      assert.equal(snapshot.division, 'Juryo');
      assert.equal(snapshot.formatKind, 'SEKITORI_15');
      assert.equal(snapshot.calendarDay, 15);
      assert.equal(snapshot.boutOrdinal, 15);
      assert.equal(snapshot.totalBouts, 15);
      assert.equal(snapshot.currentWins, 7);
      assert.equal(snapshot.currentLosses, 7);
      assert.deepEqual(snapshot.rank, { division: 'Juryo', name: '十両', number: 8, side: 'East' });
      assert.equal(snapshot.pressure?.isKachiMakeDecider, true);
      assert.ok(snapshot.preBoutPhaseWeights !== undefined);
      assert.ok((snapshot.preBoutPhaseReasonTags?.length ?? 0) > 0);
      assert.ok(snapshot.boutEngagement !== undefined);
      assert.ok(snapshot.kimaritePattern !== undefined);
      assert.equal(snapshot.kimarite, collectedResult.kimarite);
      assert.equal(snapshot.winRoute, collectedResult.winRoute);
      assert.ok(snapshot.factors.length > 0);
      snapshot.factors.forEach((factor) => {
        assert.ok([
          'ABILITY',
          'STYLE',
          'BODY',
          'FORM',
          'PRESSURE',
          'MOMENTUM',
          'INJURY',
          'KIMARITE',
          'PHASE',
          'REALISM',
          'UNKNOWN',
        ].includes(factor.kind), `unexpected factor kind ${factor.kind}`);
        assert.ok(['FOR_ATTACKER', 'FOR_DEFENDER', 'NEUTRAL'].includes(factor.direction));
        assert.ok(['SMALL', 'MEDIUM', 'LARGE'].includes(factor.strength));
        assert.ok(!/[0-9]/.test(factor.label), `factor label exposes a raw number: ${factor.label}`);
      });
      assert.equal('preBoutPhase' in (snapshot as unknown as Record<string, unknown>), false);
      assert.equal(isBoutExplanationSnapshotEnabled(), false);
      assert.equal(isBoutFlowDiagnosticSnapshotEnabled(), false);
      assert.equal(boutFlowSnapshots.length, 1);
      const [boutFlowSnapshot] = boutFlowSnapshots;
      assert.equal(boutFlowSnapshot.runLabel, 'unit-bout-flow-player');
      assert.equal(boutFlowSnapshot.seed, 4321);
      assert.equal(boutFlowSnapshot.explanationCompleteness, 'COMPLETE_CONTEXT');
      assert.deepEqual(boutFlowSnapshot.missingExplanationAxes, []);
      assert.ok(boutFlowSnapshot.victoryFactorTags.length > 0);
      assert.ok(boutFlowSnapshot.hoshitoriContextTags.includes('FINAL_BOUT'));
      assert.ok(boutFlowSnapshot.hoshitoriContextTags.includes('KACHI_MAKE_DECIDER'));
      assert.ok(boutFlowSnapshot.banzukeContextTags.includes('SEKITORI_BOUNDARY'));
      assert.ok(boutFlowSnapshot.explanationCoverage.every((entry) => entry.status === 'AVAILABLE'));
    },
  },
];
