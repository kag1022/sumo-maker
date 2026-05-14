/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { BALANCE } from '../../src/logic/balance';
import { runBashoDetailed } from '../../src/logic/simulation/basho';
import {
  advanceLeaguePopulation,
  applyLeaguePromotionFlow,
  createLeagueFlowRuntime,
  prepareLeagueForBasho,
} from '../../src/logic/simulation/engine';
import {
  advanceTopDivisionBanzuke,
} from '../../src/logic/simulation/world';
import {
  BoutWinProbSnapshot,
  withBoutWinProbSnapshotCollector,
} from '../../src/logic/simulation/diagnostics';
import type { Rank, RikishiStatus } from '../../src/logic/models';

const OFFICIAL_BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;

interface Scenario {
  label: string;
  seed: number;
  bashoCount: number;
  initialRank: Rank;
}

interface NumericSummary {
  min: number | null;
  max: number | null;
  mean: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
}

const scenarios: Scenario[] = [
  {
    label: 'seed-9604-juryo',
    seed: 9604,
    bashoCount: 4,
    initialRank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
  },
  {
    label: 'seed-9704-makushita',
    seed: 9704,
    bashoCount: 4,
    initialRank: { division: 'Makushita', name: '幕下', side: 'East', number: 18 },
  },
];

const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const createStatus = (rank: Rank): RikishiStatus => {
  const status: RikishiStatus = {
    stableId: 'stable-001',
    ichimonId: 'TAIJU',
    stableArchetypeId: 'MASTER_DISCIPLE',
    shikona: '診断山',
    entryAge: 18,
    age: 18,
    rank,
    stats: {
      tsuki: 50,
      oshi: 50,
      kumi: 50,
      nage: 50,
      koshi: 50,
      deashi: 50,
      waza: 50,
      power: 50,
    },
    potential: 60,
    growthType: 'NORMAL',
    tactics: 'BALANCE',
    archetype: 'HARD_WORKER',
    aptitudeTier: 'B',
    aptitudeFactor: 1,
    signatureMoves: ['寄り切り'],
    bodyType: 'NORMAL',
    profile: {
      realName: '診断 太郎',
      birthplace: '東京都',
      personality: 'CALM',
    },
    bodyMetrics: {
      heightCm: 182,
      weightKg: 140,
    },
    traits: [],
    durability: 80,
    currentCondition: 50,
    ratingState: {
      ability: 60,
      form: 0,
      uncertainty: 2.2,
    },
    injuryLevel: 0,
    injuries: [],
    isOzekiKadoban: false,
    isOzekiReturn: false,
    spirit: 70,
    history: {
      records: [],
      events: [],
      maxRank: { division: 'Maezumo', name: '前相撲', side: 'East', number: 1 },
      totalWins: 0,
      totalLosses: 0,
      totalAbsent: 0,
      yushoCount: { makuuchi: 0, juryo: 0, makushita: 0, others: 0 },
      kimariteTotal: {},
      bodyTimeline: [],
      highlightEvents: [],
    },
    statHistory: [],
  };
  const avg = Object.values(status.stats).reduce((sum, value) => sum + value, 0) / 8;
  status.ratingState = {
    ability: avg * 1.08,
    form: 0,
    uncertainty: 2.2,
  };
  return status;
};

const percentile = (values: number[], p: number): number | null => {
  const sorted = values.filter(Number.isFinite).slice().sort((left, right) => left - right);
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

const summarizeNumeric = (values: Array<number | undefined>): NumericSummary => {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (!finite.length) {
    return { min: null, max: null, mean: null, p10: null, p50: null, p90: null };
  }
  return {
    min: Math.min(...finite),
    max: Math.max(...finite),
    mean: finite.reduce((sum, value) => sum + value, 0) / finite.length,
    p10: percentile(finite, 0.1),
    p50: percentile(finite, 0.5),
    p90: percentile(finite, 0.9),
  };
};

const countBy = <T extends string | undefined>(
  values: T[],
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = value ?? 'UNAVAILABLE';
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
};

const roundSummary = (summary: NumericSummary): NumericSummary =>
  Object.fromEntries(
    Object.entries(summary).map(([key, value]) => [
      key,
      value === null ? null : Number(value.toFixed(4)),
    ]),
  ) as unknown as NumericSummary;

const summarizeSnapshots = (snapshots: BoutWinProbSnapshot[]) => {
  const player = snapshots.filter((snapshot) => snapshot.source === 'PLAYER_BOUT');
  const npc = snapshots.filter((snapshot) => snapshot.source === 'NPC_BOUT');
  const summarizeGroup = (rows: BoutWinProbSnapshot[]) => ({
    count: rows.length,
    calls: countBy(rows.map((row) => row.call)),
    divisions: countBy(rows.map((row) => row.division)),
    styles: {
      attacker: countBy(rows.map((row) => row.attackerStyle)),
      defender: countBy(rows.map((row) => row.defenderStyle)),
    },
    attackerAbility: roundSummary(summarizeNumeric(rows.map((row) => row.attackerAbility))),
    defenderAbility: roundSummary(summarizeNumeric(rows.map((row) => row.defenderAbility))),
    bonus: roundSummary(summarizeNumeric(rows.map((row) => row.bonus))),
    diffSoftCap: roundSummary(summarizeNumeric(rows.map((row) => row.diffSoftCap))),
    probability: roundSummary(summarizeNumeric(rows.map((row) => row.probability))),
    injuryPenalty: roundSummary(summarizeNumeric(rows.map((row) => row.injuryPenalty))),
  });
  return {
    generatedAt: new Date().toISOString(),
    scenarios,
    totalSnapshots: snapshots.length,
    player: {
      ...summarizeGroup(player),
      pressureCounts: {
        withPressure: player.filter((row) => row.pressure).length,
        isKachiMakeDecider: player.filter((row) => row.pressure?.isKachiMakeDecider).length,
        isFinalBout: player.filter((row) => row.pressure?.isFinalBout).length,
        isYushoRelevant: player.filter((row) => row.pressure?.isYushoRelevant).length,
        isPromotionRelevant: player.filter((row) => row.pressure?.isPromotionRelevant).length,
        isDemotionRelevant: player.filter((row) => row.pressure?.isDemotionRelevant).length,
      },
      compressedWinProbability: roundSummary(summarizeNumeric(player.map((row) => row.compressedWinProbability))),
      projectedExpectedWins: roundSummary(summarizeNumeric(player.map((row) => row.projectedExpectedWins))),
      opponentFormAudit: {
        generatedOrStaticOpponentCalls: player.filter((row) => row.playerOpponentForm?.enemyBashoFormDelta === undefined).length,
        formDeltaPassedCalls: player.filter((row) => row.playerOpponentForm?.enemyBashoFormDelta !== undefined).length,
        nonZeroFormDeltaCalls: player.filter((row) => (row.playerOpponentForm?.enemyBashoFormDelta ?? 0) !== 0).length,
        detectedDoubleCountCalls: player.filter((row) =>
          Math.abs(row.playerOpponentForm?.estimatedExtraEnemyAbility ?? 0) > 0.000001).length,
        enemyBashoFormDelta: roundSummary(summarizeNumeric(player.map((row) => row.playerOpponentForm?.enemyBashoFormDelta))),
        estimatedExtraEnemyAbility: roundSummary(summarizeNumeric(player.map((row) => row.playerOpponentForm?.estimatedExtraEnemyAbility))),
        estimatedDuplicateEnemyAbilityIfReintroduced: roundSummary(summarizeNumeric(player.map((row) => row.playerOpponentForm?.estimatedDuplicateEnemyAbility))),
        baseWinProbabilityDeltaIfSingleForm: roundSummary(summarizeNumeric(
          player.map((row) =>
            row.playerOpponentForm
              ? row.playerOpponentForm.baseWinProbabilityIfSingleForm - (row.baseWinProbability ?? row.probability)
              : undefined),
        )),
        baselineWinProbabilityDeltaIfSingleForm: roundSummary(summarizeNumeric(
          player.map((row) =>
            row.playerOpponentForm
              ? row.playerOpponentForm.baselineWinProbabilityIfSingleForm - (row.baselineWinProbability ?? row.probability)
              : undefined),
        )),
        baseWinProbabilityDeltaIfDuplicateFormReintroduced: roundSummary(summarizeNumeric(
          player.map((row) =>
            row.playerOpponentForm
              ? row.playerOpponentForm.baseWinProbabilityIfDuplicateForm - (row.baseWinProbability ?? row.probability)
              : undefined),
        )),
        baselineWinProbabilityDeltaIfDuplicateFormReintroduced: roundSummary(summarizeNumeric(
          player.map((row) =>
            row.playerOpponentForm
              ? row.playerOpponentForm.baselineWinProbabilityIfDuplicateForm - (row.baselineWinProbability ?? row.probability)
              : undefined),
        )),
      },
    },
    npc: {
      ...summarizeGroup(npc),
      aNoise: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.aNoise))),
      bNoise: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.bNoise))),
      aScoreMomentum: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.aScoreMomentum))),
      bScoreMomentum: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.bScoreMomentum))),
      aStreakMomentum: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.aStreakMomentum))),
      bStreakMomentum: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.bStreakMomentum))),
      aStableFactor: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.aStableFactor))),
      bStableFactor: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.bStableFactor))),
      aCompetitiveFactor: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.aCompetitiveFactor))),
      bCompetitiveFactor: roundSummary(summarizeNumeric(npc.map((row) => row.npc?.bCompetitiveFactor))),
    },
    samples: {
      player: player.slice(0, 8),
      npc: npc.slice(0, 8),
    },
  };
};

const assertSnapshotGuardrails = (
  snapshots: BoutWinProbSnapshot[],
  summary: ReturnType<typeof summarizeSnapshots>,
): void => {
  const playerBase = snapshots.filter((row) => row.source === 'PLAYER_BOUT' && row.call === 'PLAYER_BASE');
  const playerBaseline = snapshots.filter((row) => row.source === 'PLAYER_BOUT' && row.call === 'PLAYER_BASELINE');
  const npcMain = snapshots.filter((row) => row.source === 'NPC_BOUT' && row.call === 'NPC_MAIN');
  if (!playerBase.length) {
    throw new Error('PLAYER_BASE snapshots were not captured');
  }
  if (!playerBaseline.length) {
    throw new Error('PLAYER_BASELINE snapshots were not captured');
  }
  if (playerBase.length !== playerBaseline.length) {
    throw new Error(`PLAYER_BASE (${playerBase.length}) and PLAYER_BASELINE (${playerBaseline.length}) snapshot counts diverged`);
  }
  if (!npcMain.length) {
    throw new Error('NPC_MAIN snapshots were not captured');
  }
  const invalidPlayer = [...playerBase, ...playerBaseline].find((row) =>
    !Number.isFinite(row.attackerAbility) ||
    !Number.isFinite(row.defenderAbility) ||
    !Number.isFinite(row.probability));
  if (invalidPlayer) {
    throw new Error(`player kernel snapshot has invalid numeric fields: ${JSON.stringify(invalidPlayer)}`);
  }
  const invalidNpcSoftCap = npcMain.find((row) => row.diffSoftCap !== BALANCE.strength.npcDiffSoftCap);
  if (invalidNpcSoftCap) {
    throw new Error(`NPC_MAIN diffSoftCap drifted: ${invalidNpcSoftCap.diffSoftCap}`);
  }
  if (summary.player.opponentFormAudit.detectedDoubleCountCalls !== 0) {
    throw new Error(`player opponent bashoFormDelta double-count detected: ${summary.player.opponentFormAudit.detectedDoubleCountCalls}`);
  }
};

const runScenario = async (
  scenario: Scenario,
  snapshots: BoutWinProbSnapshot[],
): Promise<void> => {
  await withBoutWinProbSnapshotCollector(
    { runLabel: scenario.label, seed: scenario.seed },
    (snapshot) => snapshots.push(snapshot),
    async () => {
      const rng = lcg(scenario.seed);
      const leagueFlow = createLeagueFlowRuntime(rng);
      const { world, lowerWorld } = leagueFlow;
      const status = createStatus(scenario.initialRank);
      let seq = 0;
      let year = 2026;
      for (let bashoIndex = 0; bashoIndex < scenario.bashoCount; bashoIndex += 1) {
        const month = OFFICIAL_BASHO_MONTHS[bashoIndex % OFFICIAL_BASHO_MONTHS.length];
        prepareLeagueForBasho(leagueFlow, rng, year, seq, month);
        runBashoDetailed(status, year, month, rng, world, lowerWorld);
        advanceTopDivisionBanzuke(world);
        applyLeaguePromotionFlow(leagueFlow, rng);
        seq += 1;
        advanceLeaguePopulation(leagueFlow, rng, seq, month);
        if (month === 11) year += 1;
      }
    },
  );
};

const main = async (): Promise<void> => {
  const snapshots: BoutWinProbSnapshot[] = [];
  for (const scenario of scenarios) {
    await runScenario(scenario, snapshots);
  }
  const summary = summarizeSnapshots(snapshots);
  assertSnapshotGuardrails(snapshots, summary);
  const outDir = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'combat-kernel-input-snapshot.json');
  fs.writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`combat kernel input snapshot written: ${jsonPath}`);
  console.log(JSON.stringify({
    totalSnapshots: summary.totalSnapshots,
    player: {
      count: summary.player.count,
      attackerAbility: summary.player.attackerAbility,
      defenderAbility: summary.player.defenderAbility,
      bonus: summary.player.bonus,
      probability: summary.player.probability,
      pressureCounts: summary.player.pressureCounts,
      opponentFormAudit: summary.player.opponentFormAudit,
    },
    npc: {
      count: summary.npc.count,
      attackerAbility: summary.npc.attackerAbility,
      defenderAbility: summary.npc.defenderAbility,
      bonus: summary.npc.bonus,
      probability: summary.npc.probability,
      aNoise: summary.npc.aNoise,
      aScoreMomentum: summary.npc.aScoreMomentum,
    },
  }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
