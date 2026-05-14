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
  type PreBoutPhaseSnapshot,
  withBoutExplanationSnapshotCollector,
  withPreBoutPhaseSnapshotCollector,
} from '../../src/logic/simulation/diagnostics';
import {
  PRE_BOUT_PHASES,
  type PreBoutPhase,
  type PreBoutPhaseWeights,
} from '../../src/logic/simulation/combat/preBoutPhase';
import type { CombatStyle } from '../../src/logic/simulation/combat/types';
import type { Rank, RikishiStatus, WinRoute } from '../../src/logic/models';
import {
  DIAGNOSTIC_KIMARITE_CLASSIFIER_RULES,
  classifyPreBoutPhaseKimariteContradiction,
  resolveDiagnosticKimariteMetadata,
  type DiagnosticContradictionSeverity,
  type DiagnosticKimariteMetadata,
} from './kimarite_family_classifier';

const OFFICIAL_BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;

type ContradictionSeverity = DiagnosticContradictionSeverity;
type ConfidenceBucket = 'LOW' | 'MEDIUM' | 'HIGH';
type StylePreset = 'BALANCE' | 'PUSH' | 'GRAPPLE' | 'TECHNIQUE';
type PressureBucket = 'NONE' | 'FINAL' | 'KACHI_MAKE' | 'YUSHO_OR_BOUNDARY';

interface Scenario {
  label: string;
  seed: number;
  bashoCount: number;
  initialRank: Rank;
  stylePreset: StylePreset;
}

interface PhaseSummary {
  dominantPhase: PreBoutPhase;
  confidence: number;
  margin: number;
  confidenceBucket: ConfidenceBucket;
  topWeight: number;
  secondWeight: number;
  totalWeight: number;
}

interface ClassifiedBout {
  index: number;
  runLabel?: string;
  seed?: number;
  division?: string;
  formatKind?: string;
  calendarDay?: number;
  boutOrdinal?: number;
  pressureBucket: PressureBucket;
  attackerStyle?: CombatStyle;
  defenderStyle?: CombatStyle;
  phaseWeights?: PreBoutPhaseWeights;
  phase: PhaseSummary;
  winRoute?: WinRoute;
  kimarite?: string;
  kimariteMetadata: DiagnosticKimariteMetadata;
  severity: ContradictionSeverity;
  contradiction: boolean;
  reason: string;
  boutFlow: {
    openingPhase: PreBoutPhase;
    openingPhaseWeights?: PreBoutPhaseWeights;
    openingPhaseConfidence: ConfidenceBucket;
    finishRoute?: WinRoute;
    kimarite: {
      name?: string;
      family?: string;
      diagnosticFamily: string;
      rarity?: string;
      catalogStatus: DiagnosticKimariteMetadata['catalogStatus'];
    };
  };
}

interface CountRate {
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

const scenarios: Scenario[] = [
  {
    label: 'seed-9604-juryo-balance',
    seed: 9604,
    bashoCount: 4,
    initialRank: { division: 'Juryo', name: '十両', side: 'East', number: 8 },
    stylePreset: 'BALANCE',
  },
  {
    label: 'seed-9704-makushita-balance',
    seed: 9704,
    bashoCount: 4,
    initialRank: { division: 'Makushita', name: '幕下', side: 'East', number: 18 },
    stylePreset: 'BALANCE',
  },
  {
    label: 'seed-9804-juryo-push',
    seed: 9804,
    bashoCount: 3,
    initialRank: { division: 'Juryo', name: '十両', side: 'West', number: 11 },
    stylePreset: 'PUSH',
  },
  {
    label: 'seed-9904-makushita-grapple',
    seed: 9904,
    bashoCount: 3,
    initialRank: { division: 'Makushita', name: '幕下', side: 'West', number: 24 },
    stylePreset: 'GRAPPLE',
  },
  {
    label: 'seed-10004-juryo-technique',
    seed: 10004,
    bashoCount: 3,
    initialRank: { division: 'Juryo', name: '十両', side: 'East', number: 13 },
    stylePreset: 'TECHNIQUE',
  },
];

const lcg = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const round = (value: number): number => Number(value.toFixed(4));

const styleStats = (
  preset: StylePreset,
): RikishiStatus['stats'] => {
  if (preset === 'PUSH') {
    return {
      tsuki: 74,
      oshi: 76,
      kumi: 42,
      nage: 46,
      koshi: 52,
      deashi: 68,
      waza: 50,
      power: 66,
    };
  }
  if (preset === 'GRAPPLE') {
    return {
      tsuki: 44,
      oshi: 48,
      kumi: 76,
      nage: 64,
      koshi: 74,
      deashi: 56,
      waza: 58,
      power: 70,
    };
  }
  if (preset === 'TECHNIQUE') {
    return {
      tsuki: 52,
      oshi: 48,
      kumi: 58,
      nage: 76,
      koshi: 56,
      deashi: 70,
      waza: 78,
      power: 52,
    };
  }
  return {
    tsuki: 50,
    oshi: 50,
    kumi: 50,
    nage: 50,
    koshi: 50,
    deashi: 50,
    waza: 50,
    power: 50,
  };
};

const tacticsForPreset = (preset: StylePreset): RikishiStatus['tactics'] => {
  if (preset === 'PUSH') return 'PUSH';
  if (preset === 'GRAPPLE') return 'GRAPPLE';
  if (preset === 'TECHNIQUE') return 'TECHNIQUE';
  return 'BALANCE';
};

const signatureForPreset = (preset: StylePreset): string[] => {
  if (preset === 'PUSH') return ['押し出し'];
  if (preset === 'GRAPPLE') return ['寄り切り'];
  if (preset === 'TECHNIQUE') return ['下手投げ'];
  return ['寄り切り'];
};

const bodyMetricsForPreset = (
  preset: StylePreset,
): NonNullable<RikishiStatus['bodyMetrics']> => {
  if (preset === 'PUSH') return { heightCm: 187, weightKg: 153 };
  if (preset === 'GRAPPLE') return { heightCm: 182, weightKg: 151 };
  if (preset === 'TECHNIQUE') return { heightCm: 184, weightKg: 132 };
  return { heightCm: 182, weightKg: 140 };
};

const bodyTypeForPreset = (preset: StylePreset): RikishiStatus['bodyType'] => {
  if (preset === 'TECHNIQUE') return 'SOPPU';
  if (preset === 'GRAPPLE') return 'MUSCULAR';
  return 'NORMAL';
};

const createStatus = (scenario: Scenario): RikishiStatus => {
  const status: RikishiStatus = {
    stableId: 'stable-001',
    ichimonId: 'TAIJU',
    stableArchetypeId: 'MASTER_DISCIPLE',
    shikona: `診断山-${scenario.stylePreset}`,
    entryAge: 18,
    age: 18,
    rank: scenario.initialRank,
    stats: styleStats(scenario.stylePreset),
    potential: 60,
    growthType: 'NORMAL',
    tactics: tacticsForPreset(scenario.stylePreset),
    archetype: 'HARD_WORKER',
    aptitudeTier: 'B',
    aptitudeFactor: 1,
    signatureMoves: signatureForPreset(scenario.stylePreset),
    bodyType: bodyTypeForPreset(scenario.stylePreset),
    profile: {
      realName: '診断 太郎',
      birthplace: '東京都',
      personality: 'CALM',
    },
    bodyMetrics: bodyMetricsForPreset(scenario.stylePreset),
    traits: scenario.stylePreset === 'TECHNIQUE' ? ['ARAWAZASHI'] : [],
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

const pressureBucketOf = (
  snapshot: BoutExplanationSnapshot,
): PressureBucket => {
  if (snapshot.pressure?.isKachiMakeDecider) return 'KACHI_MAKE';
  if (snapshot.pressure?.isYushoRelevant || snapshot.pressure?.isPromotionRelevant || snapshot.pressure?.isDemotionRelevant) {
    return 'YUSHO_OR_BOUNDARY';
  }
  if (snapshot.pressure?.isFinalBout) return 'FINAL';
  return 'NONE';
};

const summarizePhase = (weights: PreBoutPhaseWeights): PhaseSummary => {
  const entries = PRE_BOUT_PHASES
    .map((phase) => ({ phase, weight: Math.max(0, weights[phase] ?? 0) }))
    .sort((left, right) => right.weight - left.weight);
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const top = entries[0] ?? { phase: 'MIXED' as const, weight: 0 };
  const second = entries[1] ?? { phase: 'MIXED' as const, weight: 0 };
  const confidence = totalWeight > 0 ? top.weight / totalWeight : 0;
  const margin = top.weight - second.weight;
  const confidenceBucket: ConfidenceBucket =
    confidence >= 0.27 || margin >= 0.7
      ? 'HIGH'
      : confidence >= 0.22 || margin >= 0.35
        ? 'MEDIUM'
        : 'LOW';
  return {
    dominantPhase: top.phase,
    confidence: round(confidence),
    margin: round(margin),
    confidenceBucket,
    topWeight: round(top.weight),
    secondWeight: round(second.weight),
    totalWeight: round(totalWeight),
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

const summarizeRate = (rows: ClassifiedBout[]): CountRate => {
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

const summarizeRateBy = (
  rows: ClassifiedBout[],
  keyOf: (row: ClassifiedBout) => string | undefined,
): Record<string, CountRate> => {
  const groups: Record<string, ClassifiedBout[]> = {};
  for (const row of rows) {
    const key = keyOf(row) ?? 'UNAVAILABLE';
    groups[key] = [...(groups[key] ?? []), row];
  }
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, groupRows]) => [key, summarizeRate(groupRows)]),
  );
};

const summarizeNestedCounts = (
  rows: ClassifiedBout[],
  groupOf: (row: ClassifiedBout) => string | undefined,
  valueOf: (row: ClassifiedBout) => string | undefined,
): Record<string, Record<string, number>> => {
  const groups: Record<string, string[]> = {};
  for (const row of rows) {
    const group = groupOf(row) ?? 'UNAVAILABLE';
    groups[group] = [...(groups[group] ?? []), valueOf(row) ?? 'UNAVAILABLE'];
  }
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, values]) => [key, countBy(values)]),
  );
};

const summarizeTopKimariteShareByPhase = (
  rows: ClassifiedBout[],
): Record<string, { topKimarite?: string; count: number; share: number }> => {
  const groups: Record<string, ClassifiedBout[]> = {};
  for (const row of rows) {
    const key = row.phase.dominantPhase;
    groups[key] = [...(groups[key] ?? []), row];
  }
  return Object.fromEntries(
    Object.entries(groups)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([phase, phaseRows]) => {
        const counts = countBy(phaseRows.map((row) => row.kimarite));
        const [topKimarite, count] = Object.entries(counts).sort((left, right) => right[1] - left[1])[0] ?? [];
        return [
          phase,
          {
            topKimarite,
            count: count ?? 0,
            share: phaseRows.length && count ? round(count / phaseRows.length) : 0,
          },
        ];
      }),
  );
};

const classifyRows = (
  explanations: BoutExplanationSnapshot[],
  phases: PreBoutPhaseSnapshot[],
): ClassifiedBout[] =>
  explanations.map((snapshot, index) => {
    const phaseSnapshot = phases[index];
    const weights = snapshot.preBoutPhaseWeights ?? phaseSnapshot?.weights;
    const phase = weights
      ? summarizePhase(weights)
      : {
        dominantPhase: 'MIXED' as const,
        confidence: 0,
        margin: 0,
        confidenceBucket: 'LOW' as const,
        topWeight: 0,
        secondWeight: 0,
        totalWeight: 0,
      };
    const metadata = resolveDiagnosticKimariteMetadata(snapshot.kimarite);
    const classified = weights
      ? classifyPreBoutPhaseKimariteContradiction({
        phase: phase.dominantPhase,
        confidenceBucket: phase.confidenceBucket,
        route: snapshot.winRoute,
        metadata,
      })
      : { severity: 'UNKNOWN' as const, contradiction: false, reason: 'pre-bout phase weights unavailable' };
    const boutFlow = {
      openingPhase: phase.dominantPhase,
      openingPhaseWeights: weights,
      openingPhaseConfidence: phase.confidenceBucket,
      finishRoute: snapshot.winRoute,
      kimarite: {
        name: metadata.kimarite ?? snapshot.kimarite,
        family: metadata.family,
        diagnosticFamily: metadata.diagnosticFamily,
        rarity: metadata.rarityBucket,
        catalogStatus: metadata.catalogStatus,
      },
    };
    return {
      index,
      runLabel: snapshot.runLabel,
      seed: snapshot.seed,
      division: snapshot.division,
      formatKind: snapshot.formatKind,
      calendarDay: snapshot.calendarDay,
      boutOrdinal: snapshot.boutOrdinal,
      pressureBucket: pressureBucketOf(snapshot),
      attackerStyle: phaseSnapshot?.attackerStyle,
      defenderStyle: phaseSnapshot?.defenderStyle,
      phaseWeights: weights,
      phase,
      winRoute: snapshot.winRoute,
      kimarite: snapshot.kimarite,
      kimariteMetadata: metadata,
      severity: classified.severity,
      contradiction: classified.contradiction,
      reason: classified.reason,
      boutFlow,
    };
  });

const assertJoinedDiagnostics = (
  explanations: BoutExplanationSnapshot[],
  phases: PreBoutPhaseSnapshot[],
  rows: ClassifiedBout[],
): void => {
  if (!explanations.length) {
    throw new Error('BoutExplanation collector did not capture player bouts');
  }
  if (!phases.length) {
    throw new Error('PreBoutPhase collector did not capture player bouts');
  }
  if (explanations.length !== phases.length) {
    throw new Error(`collector counts diverged: explanations=${explanations.length}, phases=${phases.length}`);
  }
  const missingResult = rows.find((row) => !row.winRoute || !row.kimarite);
  if (missingResult) {
    throw new Error(`joined row is missing route or kimarite: ${JSON.stringify(missingResult)}`);
  }
  const missingWeights = rows.find((row) => row.phase.totalWeight <= 0);
  if (missingWeights) {
    throw new Error(`joined row is missing PreBoutPhase weights: ${JSON.stringify(missingWeights)}`);
  }
};

const runScenario = async (
  scenario: Scenario,
  explanations: BoutExplanationSnapshot[],
  phases: PreBoutPhaseSnapshot[],
): Promise<void> => {
  await withPreBoutPhaseSnapshotCollector(
    { runLabel: scenario.label, seed: scenario.seed },
    (snapshot) => phases.push(snapshot),
    async () => {
      await withBoutExplanationSnapshotCollector(
        { runLabel: scenario.label, seed: scenario.seed },
        (snapshot) => explanations.push(snapshot),
        async () => {
          const rng = lcg(scenario.seed);
          const leagueFlow = createLeagueFlowRuntime(rng);
          const { world, lowerWorld } = leagueFlow;
          const status = createStatus(scenario);
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
    },
  );
};

const main = async (): Promise<void> => {
  const explanations: BoutExplanationSnapshot[] = [];
  const phases: PreBoutPhaseSnapshot[] = [];
  for (const scenario of scenarios) {
    await runScenario(scenario, explanations, phases);
  }
  const rows = classifyRows(explanations, phases);
  assertJoinedDiagnostics(explanations, phases, rows);

  const summary = summarizeRate(rows);
  const highConfidenceContradictions = rows
    .filter((row) => row.contradiction && row.phase.confidenceBucket === 'HIGH')
    .slice(0, 20);
  const report = {
    generatedAt: new Date().toISOString(),
    scenarios,
    sampleKind: 'fixed-seed player bouts with opt-in PreBoutPhase and BoutExplanation collectors',
    thresholds: {
      confidence: {
        high: 'topWeight / totalWeight >= 0.27 OR topWeight - secondWeight >= 0.70',
        medium: 'topWeight / totalWeight >= 0.22 OR topWeight - secondWeight >= 0.35',
        low: 'otherwise',
      },
      contradictionRate: '(SOFT + HARD) / total sampled player bouts',
      unknownRate: 'UNKNOWN / total sampled player bouts',
    },
    classifierRules: DIAGNOSTIC_KIMARITE_CLASSIFIER_RULES,
    totalSampledPlayerBouts: rows.length,
    summary,
    boutFlow: {
      openingPhaseDistribution: countBy(rows.map((row) => row.boutFlow.openingPhase)),
      finishRouteDistribution: countBy(rows.map((row) => row.boutFlow.finishRoute)),
      kimariteFamilyDistribution: countBy(rows.map((row) => row.boutFlow.kimarite.family)),
      kimariteDiagnosticFamilyDistribution: countBy(rows.map((row) => row.boutFlow.kimarite.diagnosticFamily)),
      kimariteRarityDistribution: countBy(rows.map((row) => row.boutFlow.kimarite.rarity)),
    },
    severityCounts: countBy(rows.map((row) => row.severity)),
    phaseDistribution: countBy(rows.map((row) => row.phase.dominantPhase)),
    winRouteDistribution: countBy(rows.map((row) => row.winRoute)),
    kimariteFamilyDistribution: countBy(rows.map((row) => row.kimariteMetadata.family)),
    diagnosticFamilyDistribution: countBy(rows.map((row) => row.kimariteMetadata.diagnosticFamily)),
    winRouteDistributionByDominantPhase: summarizeNestedCounts(
      rows,
      (row) => row.phase.dominantPhase,
      (row) => row.winRoute,
    ),
    kimariteFamilyDistributionByDominantPhase: summarizeNestedCounts(
      rows,
      (row) => row.phase.dominantPhase,
      (row) => row.kimariteMetadata.family,
    ),
    diagnosticFamilyDistributionByDominantPhase: summarizeNestedCounts(
      rows,
      (row) => row.phase.dominantPhase,
      (row) => row.kimariteMetadata.diagnosticFamily,
    ),
    contradictionRateByDominantPhase: summarizeRateBy(rows, (row) => row.phase.dominantPhase),
    contradictionRateByWinRoute: summarizeRateBy(rows, (row) => row.winRoute),
    contradictionRateByKimariteFamily: summarizeRateBy(rows, (row) => row.kimariteMetadata.family),
    contradictionRateByDiagnosticFamily: summarizeRateBy(rows, (row) => row.kimariteMetadata.diagnosticFamily),
    contradictionRateByPhaseConfidence: summarizeRateBy(rows, (row) => row.phase.confidenceBucket),
    contradictionRateByDivision: summarizeRateBy(rows, (row) => row.division),
    contradictionRateByFormatKind: summarizeRateBy(rows, (row) => row.formatKind),
    contradictionRateByPressureBucket: summarizeRateBy(rows, (row) => row.pressureBucket),
    contradictionRateByAttackerStyle: summarizeRateBy(rows, (row) => row.attackerStyle),
    contradictionRateByDefenderStyle: summarizeRateBy(rows, (row) => row.defenderStyle),
    topKimariteShareByPhase: summarizeTopKimariteShareByPhase(rows),
    mostCommonContradictionTypes: countBy(
      rows
        .filter((row) => row.contradiction)
        .map((row) => `${row.phase.dominantPhase} -> ${row.reason}`),
    ),
    topHardRules: countBy(
      rows
        .filter((row) => row.severity === 'HARD')
        .map((row) => `${row.phase.dominantPhase} -> ${row.reason}`),
    ),
    topUnknownReasons: countBy(
      rows
        .filter((row) => row.severity === 'UNKNOWN')
        .map((row) => `${row.phase.dominantPhase} -> ${row.reason}`),
    ),
    unknownCasesAndReasons: countBy(
      rows
        .filter((row) => row.severity === 'UNKNOWN')
        .map((row) => row.reason),
    ),
    highConfidenceContradictionExamples: highConfidenceContradictions,
    examplesByDominantPhase: Object.fromEntries(
      PRE_BOUT_PHASES.map((phase) => [
        phase,
        rows
          .filter((row) => row.phase.dominantPhase === phase)
          .slice(0, 6),
      ]),
    ),
    contradictionExamplesBySeverity: {
      hard: rows.filter((row) => row.severity === 'HARD').slice(0, 12),
      soft: rows.filter((row) => row.severity === 'SOFT').slice(0, 12),
      unknown: rows.filter((row) => row.severity === 'UNKNOWN').slice(0, 12),
    },
    samples: rows.slice(0, 12),
    guardrails: [
      'collector-only diagnostics; calculateBattleResult return shape is not changed',
      'no production RNG is added; PreBoutPhase is not sampled in production',
      'win probability, result roll, winRoute selection, and kimarite selection are not modified',
      'report is written only to .tmp and is not persisted or exposed in UI',
    ],
  };

  const outPath = path.resolve('.tmp/prebout-kimarite-contradiction.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`prebout kimarite contradiction diagnostics written: ${outPath}`);
  console.log(JSON.stringify({
    totalSampledPlayerBouts: report.totalSampledPlayerBouts,
    summary: report.summary,
    phaseDistribution: report.phaseDistribution,
    contradictionRateByDominantPhase: report.contradictionRateByDominantPhase,
    contradictionRateByWinRoute: report.contradictionRateByWinRoute,
    contradictionRateByDiagnosticFamily: report.contradictionRateByDiagnosticFamily,
    mostCommonContradictionTypes: report.mostCommonContradictionTypes,
    topHardRules: report.topHardRules,
    topUnknownReasons: report.topUnknownReasons,
  }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
