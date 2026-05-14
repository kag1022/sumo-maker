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
  resolvePreBoutPhaseDiagnostic,
  resolvePreBoutPhaseWeights,
  samplePreBoutPhase,
} from '../../../src/logic/simulation/combat/preBoutPhase';
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
];
