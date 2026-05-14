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
  type BoutExplanationSnapshot,
  withBoutExplanationSnapshotCollector,
} from '../../src/logic/simulation/diagnostics';
import type { Rank, RikishiStatus } from '../../src/logic/models';

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

const summarizeMetadataCoverage = (snapshots: BoutExplanationSnapshot[]): Record<string, number> => ({
  calendarDay: snapshots.filter((snapshot) => snapshot.calendarDay !== undefined).length,
  boutOrdinal: snapshots.filter((snapshot) => snapshot.boutOrdinal !== undefined).length,
  formatKind: snapshots.filter((snapshot) => snapshot.formatKind !== undefined).length,
  pressure: snapshots.filter((snapshot) => snapshot.pressure !== undefined).length,
  phaseWeights: snapshots.filter((snapshot) => snapshot.preBoutPhaseWeights !== undefined).length,
  phaseReasonTags: snapshots.filter((snapshot) => (snapshot.preBoutPhaseReasonTags?.length ?? 0) > 0).length,
  kimarite: snapshots.filter((snapshot) => snapshot.kimarite !== undefined).length,
  winRoute: snapshots.filter((snapshot) => snapshot.winRoute !== undefined).length,
  shortCommentaryDraft: snapshots.filter((snapshot) => snapshot.shortCommentaryDraft !== undefined).length,
});

const assertGuardrails = (snapshots: BoutExplanationSnapshot[]): void => {
  if (!snapshots.length) {
    throw new Error('BoutExplanation player collector did not capture snapshots');
  }
  const nonPlayer = snapshots.find((snapshot) => snapshot.source !== 'PLAYER_BOUT');
  if (nonPlayer) {
    throw new Error(`BoutExplanation collector captured non-player snapshot: ${nonPlayer.source}`);
  }
  const invalidFactor = snapshots.find((snapshot) =>
    snapshot.factors.some((factor) =>
      !factor.label ||
      !['SMALL', 'MEDIUM', 'LARGE'].includes(factor.strength) ||
      /[0-9]/.test(factor.label)),
  );
  if (invalidFactor) {
    throw new Error(`BoutExplanation snapshot has invalid factor labels: ${JSON.stringify(invalidFactor)}`);
  }
};

const runScenario = async (
  scenario: Scenario,
  snapshots: BoutExplanationSnapshot[],
): Promise<void> => {
  await withBoutExplanationSnapshotCollector(
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
  const snapshots: BoutExplanationSnapshot[] = [];
  for (const scenario of scenarios) {
    await runScenario(scenario, snapshots);
  }
  assertGuardrails(snapshots);
  const factorRows = snapshots.flatMap((snapshot) => snapshot.factors);
  const report = {
    generatedAt: new Date().toISOString(),
    scenarios,
    totalSnapshots: snapshots.length,
    factorKindCounts: countBy(factorRows.map((factor) => factor.kind)),
    factorDirectionCounts: countBy(factorRows.map((factor) => factor.direction)),
    factorStrengthCounts: countBy(factorRows.map((factor) => factor.strength)),
    metadataCoverage: summarizeMetadataCoverage(snapshots),
    pressureCoverage: {
      withPressure: snapshots.filter((snapshot) => snapshot.pressure).length,
      isKachiMakeDecider: snapshots.filter((snapshot) => snapshot.pressure?.isKachiMakeDecider).length,
      isFinalBout: snapshots.filter((snapshot) => snapshot.pressure?.isFinalBout).length,
      isYushoRelevant: snapshots.filter((snapshot) => snapshot.pressure?.isYushoRelevant).length,
    },
    byDivision: countBy(snapshots.map((snapshot) => snapshot.division)),
    unavailableFields: [
      'sampled PreBoutPhase is intentionally unavailable',
      'post-outcome engagement weights are intentionally unavailable',
      'UI prose is intentionally unavailable',
      'persistence identifiers are intentionally unavailable',
    ],
    samples: snapshots.slice(0, 8),
  };
  const outPath = path.resolve('.tmp/bout-explanation-player-collector.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`bout explanation player collector written: ${outPath}`);
  console.log(JSON.stringify({
    totalSnapshots: report.totalSnapshots,
    factorKindCounts: report.factorKindCounts,
    factorDirectionCounts: report.factorDirectionCounts,
    factorStrengthCounts: report.factorStrengthCounts,
    metadataCoverage: report.metadataCoverage,
    pressureCoverage: report.pressureCoverage,
    byDivision: report.byDivision,
    unavailableFields: report.unavailableFields,
  }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
