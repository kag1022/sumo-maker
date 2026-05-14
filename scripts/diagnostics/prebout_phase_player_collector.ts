/* global console, process */
import fs from 'node:fs';
import path from 'node:path';
import { runBashoDetailed } from '../../src/logic/simulation/basho';
import {
  advanceLeaguePopulation,
  applyLeaguePromotionFlow,
  createLeagueFlowRuntime,
  prepareLeagueForBasho,
} from '../../src/logic/simulation/engine';
import { advanceTopDivisionBanzuke } from '../../src/logic/simulation/world';
import {
  type PreBoutPhaseSnapshot,
  withPreBoutPhaseSnapshotCollector,
} from '../../src/logic/simulation/diagnostics';
import type { Rank, RikishiStatus } from '../../src/logic/models';
import {
  PRE_BOUT_PHASES,
  type PreBoutPhase,
} from '../../src/logic/simulation/combat/preBoutPhase';

const OFFICIAL_BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;

interface Scenario {
  label: string;
  seed: number;
  bashoCount: number;
  initialRank: Rank;
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

const summarizeWeightAverages = (
  snapshots: PreBoutPhaseSnapshot[],
): Record<PreBoutPhase, number> =>
  Object.fromEntries(
    PRE_BOUT_PHASES.map((phase) => [
      phase,
      Number((snapshots.reduce((sum, snapshot) => sum + snapshot.weights[phase], 0) / Math.max(1, snapshots.length)).toFixed(4)),
    ]),
  ) as Record<PreBoutPhase, number>;

const resolveDominantOpeningPhase = (snapshot: PreBoutPhaseSnapshot): PreBoutPhase =>
  PRE_BOUT_PHASES
    .map((phase) => ({ phase, weight: Math.max(0, snapshot.weights[phase] ?? 0) }))
    .sort((left, right) => right.weight - left.weight)[0]?.phase ?? 'MIXED';

const withBoutFlow = (snapshot: PreBoutPhaseSnapshot): PreBoutPhaseSnapshot & {
  boutFlow: {
    openingPhase: PreBoutPhase;
    openingPhaseWeights: PreBoutPhaseSnapshot['weights'];
    openingPhaseReasonTags: PreBoutPhaseSnapshot['reasonTags'];
  };
} => ({
  ...snapshot,
  boutFlow: {
    openingPhase: resolveDominantOpeningPhase(snapshot),
    openingPhaseWeights: snapshot.weights,
    openingPhaseReasonTags: snapshot.reasonTags,
  },
});

const summarizePressure = (snapshots: PreBoutPhaseSnapshot[]): Record<string, number> => ({
  withPressure: snapshots.filter((snapshot) => snapshot.pressure).length,
  isKachiMakeDecider: snapshots.filter((snapshot) => snapshot.pressure?.isKachiMakeDecider).length,
  isFinalBout: snapshots.filter((snapshot) => snapshot.pressure?.isFinalBout).length,
  isYushoRelevant: snapshots.filter((snapshot) => snapshot.pressure?.isYushoRelevant).length,
  isPromotionRelevant: snapshots.filter((snapshot) => snapshot.pressure?.isPromotionRelevant).length,
  isDemotionRelevant: snapshots.filter((snapshot) => snapshot.pressure?.isDemotionRelevant).length,
});

const summarizeMetadataCoverage = (snapshots: PreBoutPhaseSnapshot[]): Record<string, number> => ({
  calendarDay: snapshots.filter((snapshot) => snapshot.calendarDay !== undefined).length,
  boutOrdinal: snapshots.filter((snapshot) => snapshot.boutOrdinal !== undefined).length,
  formatKind: snapshots.filter((snapshot) => snapshot.formatKind !== undefined).length,
  pressure: snapshots.filter((snapshot) => snapshot.pressure !== undefined).length,
  attackerStyle: snapshots.filter((snapshot) => snapshot.attackerStyle !== undefined).length,
  defenderStyle: snapshots.filter((snapshot) => snapshot.defenderStyle !== undefined).length,
  attackerBodyScore: snapshots.filter((snapshot) => Number.isFinite(snapshot.attackerBodyScore)).length,
  defenderBodyScore: snapshots.filter((snapshot) => Number.isFinite(snapshot.defenderBodyScore)).length,
  reasonTags: snapshots.filter((snapshot) => snapshot.reasonTags.length > 0).length,
});

const assertGuardrails = (snapshots: PreBoutPhaseSnapshot[]): void => {
  if (!snapshots.length) {
    throw new Error('PreBoutPhase player collector did not capture snapshots');
  }
  const nonPlayer = snapshots.find((snapshot) => snapshot.source !== 'PLAYER_BOUT');
  if (nonPlayer) {
    throw new Error(`PreBoutPhase collector captured non-player snapshot: ${nonPlayer.source}`);
  }
  const invalid = snapshots.find((snapshot) =>
    PRE_BOUT_PHASES.some((phase) =>
      !Number.isFinite(snapshot.weights[phase]) || snapshot.weights[phase] < 0),
  );
  if (invalid) {
    throw new Error(`PreBoutPhase snapshot has invalid weights: ${JSON.stringify(invalid)}`);
  }
};

const runScenario = async (
  scenario: Scenario,
  snapshots: PreBoutPhaseSnapshot[],
): Promise<void> => {
  await withPreBoutPhaseSnapshotCollector(
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
  const snapshots: PreBoutPhaseSnapshot[] = [];
  for (const scenario of scenarios) {
    await runScenario(scenario, snapshots);
  }
  assertGuardrails(snapshots);
  const report = {
    generatedAt: new Date().toISOString(),
    scenarios,
    totalSnapshots: snapshots.length,
    phaseWeightAverages: summarizeWeightAverages(snapshots),
    boutFlowOpeningPhaseDistribution: countBy(snapshots.map((snapshot) => resolveDominantOpeningPhase(snapshot))),
    metadataCoverage: summarizeMetadataCoverage(snapshots),
    pressureCounts: summarizePressure(snapshots),
    byDivision: countBy(snapshots.map((snapshot) => snapshot.division)),
    byFormatKind: countBy(snapshots.map((snapshot) => snapshot.formatKind)),
    byAttackerStyle: countBy(snapshots.map((snapshot) => snapshot.attackerStyle)),
    byDefenderStyle: countBy(snapshots.map((snapshot) => snapshot.defenderStyle)),
    unavailableFields: [
      'sampled phase is intentionally unavailable; production collector records weights only',
      'post-outcome engagement is intentionally unavailable',
      'BoutExplanation fields are intentionally unavailable',
    ],
    samples: snapshots.slice(0, 12).map(withBoutFlow),
  };
  const outPath = path.resolve('.tmp/prebout-phase-player-collector.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`prebout phase player collector written: ${outPath}`);
  console.log(JSON.stringify({
    totalSnapshots: report.totalSnapshots,
    phaseWeightAverages: report.phaseWeightAverages,
    metadataCoverage: report.metadataCoverage,
    pressureCounts: report.pressureCounts,
    byDivision: report.byDivision,
    byAttackerStyle: report.byAttackerStyle,
    byDefenderStyle: report.byDefenderStyle,
    unavailableFields: report.unavailableFields,
  }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
