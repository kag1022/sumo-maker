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
  findNonTechniqueEntry,
  findOfficialKimariteEntry,
  type KimariteFamily,
  type KimaritePattern,
  type KimariteRarityBucket,
  type KimariteTag,
} from '../../src/logic/kimarite/catalog';

const OFFICIAL_BASHO_MONTHS = [1, 3, 5, 7, 9, 11] as const;

type ContradictionSeverity = 'NONE' | 'SOFT' | 'HARD' | 'UNKNOWN';
type ConfidenceBucket = 'low' | 'medium' | 'high';
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

interface KimariteMetadata {
  kimarite?: string;
  family?: KimariteFamily;
  rarityBucket?: KimariteRarityBucket;
  class?: string;
  tags: KimariteTag[];
  requiredPatterns: KimaritePattern[];
  patternRole?: string;
  contextTags: string[];
  catalogStatus: 'OFFICIAL' | 'NON_TECHNIQUE' | 'UNKNOWN';
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
  phase: PhaseSummary;
  winRoute?: WinRoute;
  kimarite?: string;
  kimariteMetadata: KimariteMetadata;
  severity: ContradictionSeverity;
  contradiction: boolean;
  reason: string;
}

interface CountRate {
  count: number;
  contradictions: number;
  unknown: number;
  contradictionRate: number;
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
      ? 'high'
      : confidence >= 0.22 || margin >= 0.35
        ? 'medium'
        : 'low';
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

const resolveKimariteMetadata = (
  kimarite: string | undefined,
): KimariteMetadata => {
  if (!kimarite) {
    return {
      tags: [],
      requiredPatterns: [],
      contextTags: [],
      catalogStatus: 'UNKNOWN',
    };
  }
  const official = findOfficialKimariteEntry(kimarite);
  if (official) {
    return {
      kimarite: official.name,
      family: official.family,
      rarityBucket: official.rarityBucket,
      class: official.class,
      tags: [...official.tags],
      requiredPatterns: [...official.requiredPatterns],
      patternRole: official.patternRole,
      contextTags: [...official.contextTags],
      catalogStatus: 'OFFICIAL',
    };
  }
  const nonTechnique = findNonTechniqueEntry(kimarite);
  if (nonTechnique) {
    return {
      kimarite: nonTechnique.name,
      family: nonTechnique.family,
      rarityBucket: nonTechnique.rarityBucket,
      class: nonTechnique.class,
      tags: [],
      requiredPatterns: ['NON_TECHNIQUE'],
      contextTags: [],
      catalogStatus: 'NON_TECHNIQUE',
    };
  }
  return {
    kimarite,
    tags: [],
    requiredPatterns: [],
    contextTags: [],
    catalogStatus: 'UNKNOWN',
  };
};

const hasTag = (metadata: KimariteMetadata, tag: KimariteTag): boolean =>
  metadata.tags.includes(tag);

const hasPattern = (metadata: KimariteMetadata, pattern: KimaritePattern): boolean =>
  metadata.requiredPatterns.includes(pattern);

const hasContext = (metadata: KimariteMetadata, contextTag: string): boolean =>
  metadata.contextTags.includes(contextTag);

const isBeltHeavy = (route: WinRoute | undefined, metadata: KimariteMetadata): boolean =>
  route === 'BELT_FORCE' ||
  hasTag(metadata, 'belt') ||
  hasPattern(metadata, 'BELT_FORCE');

const isThrowHeavy = (route: WinRoute | undefined, metadata: KimariteMetadata): boolean =>
  route === 'THROW_BREAK' ||
  metadata.family === 'THROW' ||
  hasPattern(metadata, 'THROW_EXCHANGE');

const isLegAttackHeavy = (route: WinRoute | undefined, metadata: KimariteMetadata): boolean =>
  route === 'LEG_ATTACK' ||
  metadata.family === 'TRIP_PICK' ||
  hasTag(metadata, 'leg') ||
  hasTag(metadata, 'trip') ||
  hasPattern(metadata, 'LEG_TRIP_PICK');

const isPullOrTwist = (route: WinRoute | undefined, metadata: KimariteMetadata): boolean =>
  route === 'PULL_DOWN' ||
  metadata.family === 'TWIST_DOWN' ||
  hasTag(metadata, 'pull') ||
  hasTag(metadata, 'twist') ||
  hasPattern(metadata, 'PULL_DOWN');

const isDirectPush = (route: WinRoute | undefined, metadata: KimariteMetadata): boolean =>
  route === 'PUSH_OUT' ||
  metadata.family === 'PUSH_THRUST' ||
  hasPattern(metadata, 'PUSH_ADVANCE');

const isTechniqueCompatible = (
  route: WinRoute | undefined,
  metadata: KimariteMetadata,
): boolean =>
  route === 'THROW_BREAK' ||
  route === 'PULL_DOWN' ||
  route === 'LEG_ATTACK' ||
  metadata.family === 'THROW' ||
  metadata.family === 'TWIST_DOWN' ||
  metadata.family === 'TRIP_PICK' ||
  metadata.family === 'BACKWARD_BODY_DROP' ||
  hasTag(metadata, 'pull') ||
  hasTag(metadata, 'twist') ||
  hasTag(metadata, 'trip') ||
  hasTag(metadata, 'leg');

const isEdgeCompatible = (
  route: WinRoute | undefined,
  metadata: KimariteMetadata,
): boolean =>
  route === 'EDGE_REVERSAL' ||
  route === 'PULL_DOWN' ||
  route === 'THROW_BREAK' ||
  hasTag(metadata, 'edge') ||
  hasContext(metadata, 'EDGE') ||
  hasPattern(metadata, 'EDGE_REVERSAL') ||
  metadata.kimarite === '押し倒し' ||
  metadata.kimarite === '突き倒し' ||
  metadata.kimarite === '突き落とし';

const isCollapseCompatible = (
  route: WinRoute | undefined,
  metadata: KimariteMetadata,
): boolean =>
  route === 'PUSH_OUT' ||
  route === 'PULL_DOWN' ||
  metadata.family === 'PUSH_THRUST' ||
  metadata.family === 'TWIST_DOWN' ||
  metadata.family === 'NON_TECHNIQUE' ||
  hasTag(metadata, 'pull') ||
  hasTag(metadata, 'twist');

const isLongBelt = (
  route: WinRoute | undefined,
  metadata: KimariteMetadata,
): boolean =>
  route === 'BELT_FORCE' && isBeltHeavy(route, metadata) && !isCollapseCompatible(route, metadata);

const isRareComplexThrow = (
  route: WinRoute | undefined,
  metadata: KimariteMetadata,
): boolean =>
  (metadata.rarityBucket === 'RARE' || metadata.rarityBucket === 'EXTREME') &&
  (route === 'THROW_BREAK' || metadata.family === 'THROW' || metadata.family === 'BACKWARD_BODY_DROP');

const severityForConfidence = (
  phase: PhaseSummary,
  highSeverity: ContradictionSeverity = 'HARD',
): ContradictionSeverity => {
  if (phase.confidenceBucket === 'high') return highSeverity;
  if (phase.confidenceBucket === 'medium') return 'SOFT';
  return 'UNKNOWN';
};

const classifyContradiction = (
  phase: PhaseSummary,
  route: WinRoute | undefined,
  metadata: KimariteMetadata,
): { severity: ContradictionSeverity; reason: string } => {
  if (phase.dominantPhase === 'MIXED') {
    return { severity: 'NONE', reason: 'mixed phase has no default contradiction rule' };
  }
  if (!route || metadata.catalogStatus === 'UNKNOWN') {
    return { severity: 'UNKNOWN', reason: 'route or kimarite catalog metadata unavailable' };
  }

  if (phase.dominantPhase === 'THRUST_BATTLE') {
    const contradiction = (isBeltHeavy(route, metadata) || isThrowHeavy(route, metadata) || isLegAttackHeavy(route, metadata)) && !isPullOrTwist(route, metadata);
    if (contradiction) {
      return {
        severity: severityForConfidence(phase),
        reason: 'thrust phase paired with belt/throw/leg-heavy outcome',
      };
    }
    return { severity: 'NONE', reason: 'thrust phase compatible with push, pull, collapse, or mixed force outcome' };
  }

  if (phase.dominantPhase === 'BELT_BATTLE') {
    const pureThrust = isDirectPush(route, metadata) && !isBeltHeavy(route, metadata) && !isThrowHeavy(route, metadata);
    if (isPullOrTwist(route, metadata) || pureThrust) {
      return {
        severity: severityForConfidence(phase),
        reason: pureThrust
          ? 'belt phase paired with pure thrust/push outcome'
          : 'belt phase paired with pull-down or twist-down outcome',
      };
    }
    return { severity: 'NONE', reason: 'belt phase compatible with belt force, throws, or close-body technique' };
  }

  if (phase.dominantPhase === 'TECHNIQUE_SCRAMBLE') {
    const directCommonForce =
      (route === 'PUSH_OUT' || route === 'BELT_FORCE') &&
      (metadata.family === 'PUSH_THRUST' || metadata.family === 'FORCE_OUT') &&
      metadata.rarityBucket === 'COMMON' &&
      !isTechniqueCompatible(route, metadata);
    if (directCommonForce) {
      return {
        severity: phase.confidenceBucket === 'low' ? 'UNKNOWN' : 'SOFT',
        reason: 'technique phase paired with common direct force outcome',
      };
    }
    return { severity: 'NONE', reason: 'technique phase compatible with adaptive or non-basic outcome' };
  }

  if (phase.dominantPhase === 'EDGE_BATTLE') {
    if (!isEdgeCompatible(route, metadata)) {
      return {
        severity: severityForConfidence(phase),
        reason: 'edge phase paired with no edge-compatible route, tag, or pattern',
      };
    }
    return { severity: 'NONE', reason: 'edge phase compatible with edge, throw, pull, or collapse outcome' };
  }

  if (phase.dominantPhase === 'QUICK_COLLAPSE') {
    if (!isCollapseCompatible(route, metadata) && (isLongBelt(route, metadata) || isRareComplexThrow(route, metadata))) {
      return {
        severity: severityForConfidence(phase),
        reason: 'quick collapse phase paired with long belt battle or rare complex throw',
      };
    }
    return { severity: 'NONE', reason: 'quick collapse phase compatible with immediate force, pull, twist, or non-technique outcome' };
  }

  return { severity: 'UNKNOWN', reason: 'unhandled phase' };
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
  const unknown = rows.filter((row) => row.severity === 'UNKNOWN').length;
  return {
    count: rows.length,
    contradictions,
    unknown,
    contradictionRate: rows.length ? round(contradictions / rows.length) : 0,
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
        confidenceBucket: 'low' as const,
        topWeight: 0,
        secondWeight: 0,
        totalWeight: 0,
      };
    const metadata = resolveKimariteMetadata(snapshot.kimarite);
    const classified = weights
      ? classifyContradiction(phase, snapshot.winRoute, metadata)
      : { severity: 'UNKNOWN' as const, reason: 'pre-bout phase weights unavailable' };
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
      phase,
      winRoute: snapshot.winRoute,
      kimarite: snapshot.kimarite,
      kimariteMetadata: metadata,
      severity: classified.severity,
      contradiction: classified.severity === 'SOFT' || classified.severity === 'HARD',
      reason: classified.reason,
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
    .filter((row) => row.contradiction && row.phase.confidenceBucket === 'high')
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
    totalSampledPlayerBouts: rows.length,
    summary,
    severityCounts: countBy(rows.map((row) => row.severity)),
    phaseDistribution: countBy(rows.map((row) => row.phase.dominantPhase)),
    winRouteDistribution: countBy(rows.map((row) => row.winRoute)),
    kimariteFamilyDistribution: countBy(rows.map((row) => row.kimariteMetadata.family)),
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
    contradictionRateByDominantPhase: summarizeRateBy(rows, (row) => row.phase.dominantPhase),
    contradictionRateByWinRoute: summarizeRateBy(rows, (row) => row.winRoute),
    contradictionRateByKimariteFamily: summarizeRateBy(rows, (row) => row.kimariteMetadata.family),
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
    unknownCasesAndReasons: countBy(
      rows
        .filter((row) => row.severity === 'UNKNOWN')
        .map((row) => row.reason),
    ),
    highConfidenceContradictionExamples: highConfidenceContradictions,
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
    mostCommonContradictionTypes: report.mostCommonContradictionTypes,
    unknownCasesAndReasons: report.unknownCasesAndReasons,
  }, null, 2));
};

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
