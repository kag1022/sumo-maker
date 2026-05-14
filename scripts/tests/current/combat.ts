import {
  buildGeneratedOpponentBashoCombatProfile,
  buildNpcBashoCombatProfile,
  buildPlayerBashoCombatProfile,
} from '../../../src/logic/simulation/combat/profile';
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
import {
  classifyPreBoutPhaseKimariteContradiction,
  resolveDiagnosticKimariteMetadata,
} from '../../diagnostics/kimarite_family_classifier';
import {
  type BoutExplanationSnapshot,
  isBoutExplanationSnapshotEnabled,
  isPreBoutPhaseSnapshotEnabled,
  recordBoutExplanationSnapshot,
  recordPreBoutPhaseSnapshot,
  type PreBoutPhaseSnapshot,
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
    name: 'combat explanation: collector is opt-in and does not change rng or result shape',
    run: async () => {
      assert.equal(isBoutExplanationSnapshotEnabled(), false);
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
      const snapshots: BoutExplanationSnapshot[] = [];
      const collectorRng = createCountingRng();
      const collectedResult = await withBoutExplanationSnapshotCollector(
        { runLabel: 'unit-explanation-player', seed: 4321 },
        (snapshot) => snapshots.push(snapshot),
        () => calculateBattleResult(
          createTestStatus(),
          createEnemy(),
          context,
          collectorRng.rng,
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
      assert.equal(snapshot.pressure?.isKachiMakeDecider, true);
      assert.ok(snapshot.preBoutPhaseWeights !== undefined);
      assert.ok((snapshot.preBoutPhaseReasonTags?.length ?? 0) > 0);
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
    },
  },
];
