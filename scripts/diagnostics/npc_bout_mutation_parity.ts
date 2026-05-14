/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import {
  applyNpcFusenBout,
  simulateNpcBout,
} from '../../src/logic/simulation/matchmaking';
import {
  BoutWinProbSnapshot,
  withBoutWinProbSnapshotCollector,
} from '../../src/logic/simulation/diagnostics';
import type { DivisionParticipant } from '../../src/logic/simulation/matchmaking/types';

interface CountingRng {
  rng: () => number;
  calls: () => number;
  values: () => number[];
}

interface ParticipantState {
  wins: number;
  losses: number;
  currentWinStreak?: number;
  currentLossStreak?: number;
  expectedWins?: number;
  opponentAbilityTotal?: number;
  boutsSimulated?: number;
  active: boolean;
  bashoKyujo?: boolean;
}

const makeCountingRng = (sequence: number[]): CountingRng => {
  let index = 0;
  const consumed: number[] = [];
  return {
    rng: () => {
      const value = sequence[Math.min(index, sequence.length - 1)];
      index += 1;
      consumed.push(value);
      return value;
    },
    calls: () => consumed.length,
    values: () => consumed.slice(),
  };
};

const createParticipant = (
  id: string,
  overrides: Partial<DivisionParticipant> = {},
): DivisionParticipant => ({
  id,
  shikona: id,
  isPlayer: false,
  stableId: 'stable-001',
  rankScore: id === 'a' ? 8 : 10,
  power: id === 'a' ? 86 : 82,
  ability: id === 'a' ? 91 : 88,
  bashoFormDelta: id === 'a' ? 2.5 : -1.5,
  styleBias: id === 'a' ? 'PUSH' : 'TECHNIQUE',
  heightCm: id === 'a' ? 184 : 181,
  weightKg: id === 'a' ? 146 : 139,
  aptitudeTier: 'B',
  aptitudeFactor: 1,
  wins: id === 'a' ? 3 : 2,
  losses: id === 'a' ? 1 : 2,
  currentWinStreak: id === 'a' ? 2 : 0,
  currentLossStreak: id === 'a' ? 0 : 1,
  expectedWins: id === 'a' ? 3.1 : 2.2,
  opponentAbilityTotal: id === 'a' ? 240 : 230,
  boutsSimulated: id === 'a' ? 4 : 4,
  active: true,
  ...overrides,
});

const capture = (participant: DivisionParticipant): ParticipantState => ({
  wins: participant.wins,
  losses: participant.losses,
  currentWinStreak: participant.currentWinStreak,
  currentLossStreak: participant.currentLossStreak,
  expectedWins: participant.expectedWins,
  opponentAbilityTotal: participant.opponentAbilityTotal,
  boutsSimulated: participant.boutsSimulated,
  active: participant.active,
  bashoKyujo: participant.bashoKyujo,
});

const diffState = (
  before: ParticipantState,
  after: ParticipantState,
): Record<string, { before: unknown; after: unknown }> => {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  (Object.keys(before) as Array<keyof ParticipantState>).forEach((key) => {
    if (before[key] !== after[key]) {
      diff[key] = { before: before[key], after: after[key] };
    }
  });
  return diff;
};

const runCase = async (
  label: string,
  configure: (a: DivisionParticipant, b: DivisionParticipant) => void,
  rngValues: number[] = [0.65, 0.25, 0.3],
) => {
  const a = createParticipant('a');
  const b = createParticipant('b');
  configure(a, b);
  const rng = makeCountingRng(rngValues);
  const snapshots: BoutWinProbSnapshot[] = [];
  const before = { a: capture(a), b: capture(b) };
  const result = await withBoutWinProbSnapshotCollector(
    { runLabel: label, seed: 4242 },
    (snapshot) => snapshots.push(snapshot),
    () => simulateNpcBout(a, b, rng.rng),
  );
  const after = { a: capture(a), b: capture(b) };
  return {
    rngCalls: rng.calls(),
    rngValues: rng.values(),
    result,
    probabilityInput: snapshots[0]
      ? {
        attackerAbility: snapshots[0].attackerAbility,
        defenderAbility: snapshots[0].defenderAbility,
        attackerStyle: snapshots[0].attackerStyle,
        defenderStyle: snapshots[0].defenderStyle,
        bonus: snapshots[0].bonus,
        diffSoftCap: snapshots[0].diffSoftCap,
        probability: snapshots[0].probability,
      }
      : null,
    before,
    after,
    mutationSummary: {
      a: diffState(before.a, after.a),
      b: diffState(before.b, after.b),
    },
  };
};

const runApplyNpcFusenBoutCase = () => {
  const winner = createParticipant('fusen-winner');
  const loser = createParticipant('fusen-loser');
  const before = { winner: capture(winner), loser: capture(loser) };
  applyNpcFusenBout(winner, loser);
  const after = { winner: capture(winner), loser: capture(loser) };
  return {
    before,
    after,
    mutationSummary: {
      winner: diffState(before.winner, after.winner),
      loser: diffState(before.loser, after.loser),
    },
  };
};

const assertExpectedCounts = (report: {
  normalBout: { rngCalls: number };
  fusenBranches: Record<string, { rngCalls: number }>;
}): void => {
  if (report.normalBout.rngCalls !== 3) {
    throw new Error(`normal NPC bout consumed ${report.normalBout.rngCalls} RNG calls; expected 3`);
  }
  Object.entries(report.fusenBranches).forEach(([label, branch]) => {
    if (branch.rngCalls !== 0) {
      throw new Error(`${label} consumed ${branch.rngCalls} RNG calls; expected 0`);
    }
  });
};

const main = async (): Promise<void> => {
  const normalBout = await runCase('normal-bout', () => undefined);
  const fusenBranches = {
    aBashoKyujo: await runCase('a-basho-kyujo', (a) => {
      a.bashoKyujo = true;
    }),
    bBashoKyujo: await runCase('b-basho-kyujo', (_a, b) => {
      b.bashoKyujo = true;
    }),
    doubleBashoKyujo: await runCase('double-basho-kyujo', (a, b) => {
      a.bashoKyujo = true;
      b.bashoKyujo = true;
    }),
    aInactive: await runCase('a-inactive', (a) => {
      a.active = false;
    }),
    bInactive: await runCase('b-inactive', (_a, b) => {
      b.active = false;
    }),
    doubleInactive: await runCase('double-inactive', (a, b) => {
      a.active = false;
      b.active = false;
    }),
  };
  const report = {
    generatedAt: new Date().toISOString(),
    normalBout,
    fusenBranches,
    helperFusen: runApplyNpcFusenBoutCase(),
    findings: [
      'normal simulateNpcBout consumes two noise RNG calls followed by the result-roll RNG call',
      'normal simulateNpcBout mutates expectedWins, opponentAbilityTotal, and boutsSimulated before the result roll in code order',
      'normal simulateNpcBout mutates wins/losses and streaks after the result roll in code order',
      'bashoKyujo simulateNpcBout branches mutate expectedWins and boutsSimulated but do not increment loser.losses',
      'inactive simulateNpcBout branches mutate wins/losses and streaks but do not mutate expectedWins or boutsSimulated',
      'applyNpcFusenBout increments loser.losses, unlike simulateNpcBout bashoKyujo branches',
    ],
    futureWrapperInvariants: [
      'normal path must consume exactly three RNG values in order: aNoise, bNoise, result roll',
      'fusen, inactive, and double-kyujo paths must consume zero RNG values',
      'probability input must preserve attackerAbility, defenderAbility, attackerStyle, defenderStyle, bonus, diffSoftCap, and probability',
      'expectedWins and opponentAbilityTotal mutation must remain before result roll if the function is split',
      'record and streak mutation must preserve branch-specific differences until explicitly normalized in a separate task',
    ],
  };
  assertExpectedCounts(report);
  const outPath = path.resolve('.tmp/npc-bout-mutation-parity.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`npc bout mutation parity written: ${outPath}`);
  console.log(JSON.stringify({
    normalRngCalls: report.normalBout.rngCalls,
    normalProbability: report.normalBout.probabilityInput?.probability,
    fusenRngCalls: Object.fromEntries(
      Object.entries(report.fusenBranches).map(([key, value]) => [key, value.rngCalls]),
    ),
    bashoKyujoLoserLossMutation: {
      aBashoKyujo: report.fusenBranches.aBashoKyujo.mutationSummary.a.losses ?? null,
      bBashoKyujo: report.fusenBranches.bBashoKyujo.mutationSummary.b.losses ?? null,
      helperFusen: report.helperFusen.mutationSummary.loser.losses ?? null,
    },
  }, null, 2));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
