#!/usr/bin/env npx tsx
/**
 * 横綱・大関の補充過多が、昇進頻度・昇進基準・ability floor のどこから来るかを診断する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { evaluateSnapshotOzekiPromotion } from '../../src/logic/banzuke/rules/sanyakuPromotion';
import { evaluateYokozunaPromotion } from '../../src/logic/banzuke/rules/yokozunaPromotion';
import type { BashoRecordHistorySnapshot, BashoRecordSnapshot } from '../../src/logic/banzuke/providers/sekitori/types';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import type { Rank } from '../../src/logic/models';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';

const args = process.argv.slice(2);

const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};

const argStr = (flag: string, def: string): string => {
  const i = args.indexOf(flag);
  if (i < 0 || i + 1 >= args.length) return def;
  const values: string[] = [];
  for (let idx = i + 1; idx < args.length; idx += 1) {
    if (args[idx].startsWith('--')) break;
    values.push(args[idx]);
  }
  return values.length > 0 ? values.join(',') : def;
};

const BASHO = argInt('--basho', 60);
const SEEDS = argStr('--seeds', argStr('--seed', '20260420'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

type PromotionKind = 'YOKOZUNA' | 'OZEKI_NEW' | 'OZEKI_RETURN';

interface ActorBeforeBasho {
  id: string;
  rank: Rank;
  ability: number;
  basePower: number;
  form: number;
  age: number;
  initialCareerStage: string | null;
  careerBashoCount: number;
}

interface PromotionEvent {
  kind: PromotionKind;
  basho: number;
  seed: number;
  worldLabel: string;
  eraSnapshotId: string | null;
  eraTags: string[];
  id: string;
  shikona: string;
  fromRank: string;
  toRank: string;
  wins: number;
  losses: number;
  absent: number;
  yusho: boolean;
  junYusho: boolean;
  expectedWins: number | null;
  strengthOfSchedule: number | null;
  performanceOverExpected: number | null;
  recentWins: number[];
  recentRanks: string[];
  abilityBefore: number | null;
  basePowerBefore: number | null;
  formBefore: number | null;
  estimatedSeasonalAbilityBase: number | null;
  topRankFloor: number | null;
  abilityBelowFloor: boolean;
  estimatedFloorLift: number;
  age: number | null;
  initialCareerStage: string | null;
  formalGatePassed: boolean;
  decisionBand: string;
  qualityScore: number | null;
  totalWindowWins: number | null;
  currentYokozunaCount: number;
  currentOzekiCount: number;
  populationPressure: number;
  wouldPromoteWithoutPressure: boolean;
  pressureBlockedPromotion: boolean;
  pressureRelaxedPromotion: boolean;
  suspicious: boolean;
  suspicionReasons: string[];
}

interface WorldDiagnostic {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  promotions: PromotionEvent[];
  pressureEffects: {
    yokozunaBlocked: number;
    yokozunaRelaxed: number;
    ozekiBlocked: number;
    ozekiRelaxed: number;
  };
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;
const round1 = (value: number): number => Math.round(value * 10) / 10;

const rankLabel = (rank: Rank): string =>
  rank.division === 'Makuuchi'
    ? `${rank.name}${rank.number ?? ''}${rank.side === 'West' ? '西' : '東'}`
    : `${rank.name}${rank.number ?? ''}${rank.side === 'West' ? '西' : '東'}`;

const topRankFloorFor = (rankName: string, initialCareerStage?: string | null): number | null => {
  const declineDiscount = initialCareerStage === 'declining' ? 8 : initialCareerStage === 'veteran' ? 3 : 0;
  if (rankName === '横綱') return 122 - declineDiscount;
  if (rankName === '大関') return 112 - declineDiscount;
  if (rankName === '関脇' || rankName === '小結') return 104 - declineDiscount;
  return null;
};

const findEraSnapshot = (key: string, usedIds = new Set<string>()): EraSnapshot | undefined => {
  const snapshots = listEraSnapshots();
  const aliases: Record<string, string> = {
    era1965: 'era-1965',
    era1985: 'era-1985',
    era1993: 'era-1993',
    era2005: 'era-2005',
    era2025: 'era-2025',
  };
  const directPrefix = aliases[key] ?? (/^era\d{4}$/.test(key) ? `era-${key.slice(3)}` : undefined);
  if (directPrefix) return snapshots.find((snapshot) => snapshot.id.startsWith(directPrefix));
  if (key.startsWith('era-')) return snapshots.find((snapshot) => snapshot.id === key);
  return snapshots.find(
    (snapshot) => snapshot.eraTags.includes(key as EraTag) && !usedIds.has(snapshot.id),
  );
};

const buildWorldSpecs = (): Array<{ key: string; snapshot?: EraSnapshot }> => {
  const usedIds = new Set<string>();
  return WORLDS_ARG.split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((key) => {
      if (key === 'legacy') return { key };
      const snapshot = findEraSnapshot(key, usedIds);
      if (snapshot) usedIds.add(snapshot.id);
      return { key, snapshot };
    });
};

const snapshotActorBeforeBasho = (
  world: ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>,
): Map<string, ActorBeforeBasho> => {
  const out = new Map<string, ActorBeforeBasho>();
  for (const row of world.rosters.Makuuchi) {
    const actor = world.actorRegistry.get(row.id);
    const rank = (() => {
      const bounded = Math.max(1, Math.min(42, row.rankScore));
      let cursor = 1;
      if (bounded < cursor + world.makuuchiLayout.yokozuna) {
        return { division: 'Makuuchi', name: '横綱', side: bounded % 2 === 1 ? 'East' : 'West' } as Rank;
      }
      cursor += world.makuuchiLayout.yokozuna;
      if (bounded < cursor + world.makuuchiLayout.ozeki) {
        return { division: 'Makuuchi', name: '大関', side: (bounded - cursor) % 2 === 0 ? 'East' : 'West' } as Rank;
      }
      cursor += world.makuuchiLayout.ozeki;
      if (bounded < cursor + world.makuuchiLayout.sekiwake) {
        return { division: 'Makuuchi', name: '関脇', side: (bounded - cursor) % 2 === 0 ? 'East' : 'West' } as Rank;
      }
      cursor += world.makuuchiLayout.sekiwake;
      if (bounded < cursor + world.makuuchiLayout.komusubi) {
        return { division: 'Makuuchi', name: '小結', side: (bounded - cursor) % 2 === 0 ? 'East' : 'West' } as Rank;
      }
      const relative = bounded - cursor;
      return {
        division: 'Makuuchi',
        name: '前頭',
        number: Math.floor(relative / 2) + 1,
        side: relative % 2 === 0 ? 'East' : 'West',
      } as Rank;
    })();
    out.set(row.id, {
      id: row.id,
      rank,
      ability: actor?.ability ?? row.ability,
      basePower: actor?.basePower ?? row.basePower,
      form: actor?.form ?? row.form,
      age: actor?.age ?? 0,
      initialCareerStage: actor?.initialCareerStage ?? null,
      careerBashoCount: actor?.careerBashoCount ?? 0,
    });
  }
  return out;
};

const toBashoSnapshot = (
  result: {
    id: string;
    shikona: string;
    rank?: Rank;
    wins: number;
    losses: number;
    absent?: number;
    expectedWins?: number;
    strengthOfSchedule?: number;
    performanceOverExpected?: number;
    yusho?: boolean;
    junYusho?: boolean;
    specialPrizes?: string[];
  },
  pastRecords: BashoRecordHistorySnapshot[],
  isOzekiReturn = false,
  topRankPopulation?: { currentYokozunaCount: number; currentOzekiCount: number },
): BashoRecordSnapshot => ({
  id: result.id,
  shikona: result.shikona,
  rank: result.rank ?? { division: 'Makuuchi', name: '前頭', number: 1, side: 'East' },
  wins: result.wins,
  losses: result.losses,
  absent: result.absent ?? 0,
  expectedWins: result.expectedWins,
  strengthOfSchedule: result.strengthOfSchedule,
  performanceOverExpected: result.performanceOverExpected,
  yusho: result.yusho ?? false,
  junYusho: result.junYusho ?? false,
  specialPrizes: result.specialPrizes ?? [],
  pastRecords,
  isOzekiReturn,
  topRankPopulation,
});

const buildSuspicionReasons = (
  kind: PromotionKind,
  event: Omit<PromotionEvent, 'suspicious' | 'suspicionReasons'>,
): string[] => {
  const reasons: string[] = [];
  const effectiveLosses = event.losses + event.absent;
  if (!event.formalGatePassed) reasons.push('formal gate did not pass');
  if (kind === 'YOKOZUNA') {
    if (event.decisionBand === 'BORDERLINE_PROMOTE') reasons.push('borderline yokozuna deliberation');
    if (event.totalWindowWins != null && event.totalWindowWins < 29) reasons.push('two-basho total below 29');
    if (!event.recentRanks.slice(0, 2).every((rank) => rank.startsWith('大関'))) {
      reasons.push('not promoted from two consecutive ozeki basho');
    }
  } else if (kind === 'OZEKI_NEW') {
    if (event.totalWindowWins != null && event.totalWindowWins < 33) reasons.push('three-basho total below 33');
    if (event.wins < 10) reasons.push('current basho below 10 wins');
    if (!event.recentRanks.slice(0, 3).every((rank) => rank.startsWith('関脇') || rank.startsWith('小結'))) {
      reasons.push('not a three-basho sanyaku chain');
    }
  } else {
    if (!event.fromRank.startsWith('関脇')) reasons.push('ozeki return not from sekiwake');
    if (event.wins < 10) reasons.push('ozeki return below 10 wins');
  }
  if (event.wins <= effectiveLosses) reasons.push('non-kachikoshi promotion');
  if (event.abilityBelowFloor && event.estimatedFloorLift >= 4) reasons.push('material ability floor lift before promotion');
  if ((event.expectedWins ?? 99) < 9 && event.performanceOverExpected != null && event.performanceOverExpected >= 3) {
    reasons.push('large overperformance from low expectation');
  }
  return reasons;
};

const runWorld = async (
  seed: number,
  spec: { key: string; snapshot?: EraSnapshot },
): Promise<WorldDiagnostic | null> => {
  if (spec.key !== 'legacy' && !spec.snapshot) {
    console.warn(`Unknown world key: ${spec.key}`);
    return null;
  }

  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const label = spec.key === 'legacy'
    ? 'legacy (undefined)'
    : `era:${spec.snapshot?.publicEraLabel} (${spec.snapshot?.id})`;
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `top-rank-promotion-frequency-${spec.key}-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
      runOptions: spec.snapshot
        ? {
          eraSnapshotId: spec.snapshot.id,
          eraTags: spec.snapshot.eraTags,
          publicEraLabel: spec.snapshot.publicEraLabel,
        }
        : undefined,
    },
    {
      random: createSeededRandom(seed + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  const promotions: PromotionEvent[] = [];
  const pressureEffects = {
    yokozunaBlocked: 0,
    yokozunaRelaxed: 0,
    ozekiBlocked: 0,
    ozekiRelaxed: 0,
  };
  for (let b = 0; b < BASHO; b += 1) {
    const beforeWorld = runtime.__getWorldForDiagnostics();
    const beforeById = snapshotActorBeforeBasho(beforeWorld);
    const topRankPopulation = {
      currentYokozunaCount: beforeWorld.makuuchiLayout.yokozuna,
      currentOzekiCount: beforeWorld.makuuchiLayout.ozeki,
    };
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const resultById = new Map((world.lastBashoResults.Makuuchi ?? []).map((result) => [result.id, result]));
    for (const result of world.lastBashoResults.Makuuchi ?? []) {
      if (!result.rank) continue;
      const history = world.recentSekitoriHistory.get(result.id) ?? [];
      const snapshot = toBashoSnapshot(result, history.slice(1, 3), beforeWorld.ozekiReturnById.get(result.id) ?? false, topRankPopulation);
      const snapshotWithoutPressure: BashoRecordSnapshot = {
        ...snapshot,
        topRankPopulation: undefined,
      };
      if (snapshot.rank.name === '大関') {
        const actual = evaluateYokozunaPromotion(snapshot).promote;
        const baseline = evaluateYokozunaPromotion(snapshotWithoutPressure).promote;
        if (baseline && !actual) pressureEffects.yokozunaBlocked += 1;
        if (!baseline && actual) pressureEffects.yokozunaRelaxed += 1;
      }
      if (
        !snapshot.isOzekiReturn &&
        (snapshot.rank.name === '関脇' || snapshot.rank.name === '小結')
      ) {
        const actual = evaluateSnapshotOzekiPromotion(snapshot).recommended;
        const baseline = evaluateSnapshotOzekiPromotion(snapshotWithoutPressure).recommended;
        if (baseline && !actual) pressureEffects.ozekiBlocked += 1;
        if (!baseline && actual) pressureEffects.ozekiRelaxed += 1;
      }
    }
    const allocationPromotions = world.lastAllocations.filter((allocation) =>
      (allocation.currentRank.name === '大関' && allocation.nextRank.name === '横綱') ||
      (allocation.currentRank.name !== '大関' &&
        allocation.currentRank.name !== '横綱' &&
        allocation.nextRank.name === '大関'));

    for (const allocation of allocationPromotions) {
      const result = resultById.get(allocation.id);
      if (!result?.rank) continue;
      const history = world.recentSekitoriHistory.get(allocation.id) ?? [];
      const pastRecords = history.slice(1, 3);
      const wasOzekiReturn = beforeWorld.ozekiReturnById.get(allocation.id) ?? false;
      const snapshot = toBashoSnapshot(result, pastRecords, wasOzekiReturn, topRankPopulation);
      const snapshotWithoutPressure: BashoRecordSnapshot = {
        ...snapshot,
        topRankPopulation: undefined,
      };
      const kind: PromotionKind = allocation.nextRank.name === '横綱'
        ? 'YOKOZUNA'
        : wasOzekiReturn
          ? 'OZEKI_RETURN'
          : 'OZEKI_NEW';
      const before = beforeById.get(allocation.id);
      const floor = before ? topRankFloorFor(before.rank.name, before.initialCareerStage) : null;
      const abilityBefore = before?.ability ?? null;
      const estimatedSeasonalAbilityBase =
        before ? before.ability + before.form * 3.2 : null;
      const recentRanks = [snapshot.rank, ...pastRecords.map((record) => record.rank)].map(rankLabel);
      const recentWins = [snapshot.wins, ...pastRecords.map((record) => record.wins)];
      const yokozunaEval = evaluateYokozunaPromotion(snapshot);
      const ozekiEval = evaluateSnapshotOzekiPromotion(snapshot);
      const baselineYokozunaEval = evaluateYokozunaPromotion(snapshotWithoutPressure);
      const baselineOzekiEval = evaluateSnapshotOzekiPromotion(snapshotWithoutPressure);
      const actualPromoted =
        kind === 'YOKOZUNA'
          ? yokozunaEval.promote
          : kind === 'OZEKI_RETURN'
            ? snapshot.rank.name === '関脇' && snapshot.wins >= 10
            : ozekiEval.recommended;
      const baselinePromoted =
        kind === 'YOKOZUNA'
          ? baselineYokozunaEval.promote
          : kind === 'OZEKI_RETURN'
            ? actualPromoted
            : baselineOzekiEval.recommended;
      const populationPressure =
        kind === 'YOKOZUNA'
          ? yokozunaEval.evidence.populationPressure
          : kind === 'OZEKI_NEW'
            ? ozekiEval.populationPressure
            : 0;
      const baseEvent = {
        kind,
        basho: b + 1,
        seed,
        worldLabel: label,
        eraSnapshotId: spec.snapshot?.id ?? null,
        eraTags: spec.snapshot?.eraTags ?? [],
        id: allocation.id,
        shikona: allocation.shikona,
        fromRank: rankLabel(allocation.currentRank),
        toRank: rankLabel(allocation.nextRank),
        wins: snapshot.wins,
        losses: snapshot.losses,
        absent: snapshot.absent,
        yusho: snapshot.yusho ?? false,
        junYusho: snapshot.junYusho ?? false,
        expectedWins: snapshot.expectedWins ?? null,
        strengthOfSchedule: snapshot.strengthOfSchedule ?? null,
        performanceOverExpected: snapshot.performanceOverExpected ?? null,
        recentWins,
        recentRanks,
        abilityBefore,
        basePowerBefore: before?.basePower ?? null,
        formBefore: before?.form ?? null,
        estimatedSeasonalAbilityBase: estimatedSeasonalAbilityBase == null
          ? null
          : round1(estimatedSeasonalAbilityBase),
        topRankFloor: floor,
        abilityBelowFloor: floor != null && abilityBefore != null && abilityBefore < floor,
        estimatedFloorLift:
          floor != null && abilityBefore != null ? round1(Math.max(0, floor - abilityBefore)) : 0,
        age: before?.age ?? null,
        initialCareerStage: before?.initialCareerStage ?? null,
        formalGatePassed:
          kind === 'YOKOZUNA'
            ? yokozunaEval.promote
            : kind === 'OZEKI_RETURN'
              ? snapshot.rank.name === '関脇' && snapshot.wins >= 10
              : ozekiEval.recommended,
        decisionBand:
          kind === 'YOKOZUNA'
            ? yokozunaEval.decisionBand
            : kind === 'OZEKI_RETURN'
              ? snapshot.wins >= 10 ? 'OZEKI_RETURN_10W' : 'OZEKI_RETURN_REJECT'
              : ozekiEval.recommended
                ? 'RECOMMENDED'
                : ozekiEval.passedFormal
                  ? 'FORMAL_ONLY'
                  : 'REJECT',
        qualityScore:
          kind === 'YOKOZUNA' ? yokozunaEval.score : round3(ozekiEval.qualityScore),
        totalWindowWins:
          kind === 'YOKOZUNA' ? round3(yokozunaEval.evidence.combinedEquivalent) : ozekiEval.totalWins,
        currentYokozunaCount: topRankPopulation.currentYokozunaCount,
        currentOzekiCount: topRankPopulation.currentOzekiCount,
        populationPressure,
        wouldPromoteWithoutPressure: baselinePromoted,
        pressureBlockedPromotion: baselinePromoted && !actualPromoted,
        pressureRelaxedPromotion: !baselinePromoted && actualPromoted && populationPressure < 0,
      };
      const suspicionReasons = buildSuspicionReasons(kind, baseEvent);
      promotions.push({
        ...baseEvent,
        suspicious: suspicionReasons.length > 0,
        suspicionReasons,
      });
    }
  }

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    promotions,
    pressureEffects,
  };
};

const summarizeWorld = (world: WorldDiagnostic) => {
  const byKind = (kind: PromotionKind): PromotionEvent[] =>
    world.promotions.filter((event) => event.kind === kind);
  const summarizeKind = (kind: PromotionKind) => {
    const events = byKind(kind);
    const count = events.length;
    const avg = (selector: (event: PromotionEvent) => number | null): number | null => {
      const values = events
        .map(selector)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      return values.length === 0 ? null : round3(values.reduce((sum, value) => sum + value, 0) / values.length);
    };
    return {
      count,
      perYear: round3(count / Math.max(1, BASHO / 6)),
      suspicious: events.filter((event) => event.suspicious).length,
      formalMiss: events.filter((event) => !event.formalGatePassed).length,
      floorTouched: events.filter((event) => event.abilityBelowFloor).length,
      materialFloorLift: events.filter((event) => event.estimatedFloorLift >= 4).length,
      pressureBlocked: events.filter((event) => event.pressureBlockedPromotion).length,
      pressureRelaxed: events.filter((event) => event.pressureRelaxedPromotion).length,
      avgWins: avg((event) => event.wins),
      avgExpectedWins: avg((event) => event.expectedWins),
      avgPoe: avg((event) => event.performanceOverExpected),
      avgAbilityBefore: avg((event) => event.abilityBefore),
      avgFloorLift: avg((event) => event.estimatedFloorLift),
    };
  };
  return {
    label: world.label,
    seed: world.seed,
    eraSnapshotId: world.eraSnapshotId,
    publicEraLabel: world.publicEraLabel,
    eraTags: world.eraTags,
    yokozuna: summarizeKind('YOKOZUNA'),
    ozeki: summarizeKind('OZEKI_NEW'),
    ozekiReturn: summarizeKind('OZEKI_RETURN'),
    promotions: world.promotions,
    pressureEffects: world.pressureEffects,
  };
};

const writeMarkdown = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const lines: string[] = [
    '# Top-rank promotion frequency diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseTopRankPromotionFrequency.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | tags | Y promotions/year | Y pressure blocked/relaxed | Y avg count/pressure | Y suspicious | Y floor touched | Y avg wins/exp/POE | new O promotions/year | O pressure blocked/relaxed | O avg count/pressure | O suspicious | O floor touched | O avg wins/exp/POE | O returns/year |',
    '| --- | ---:| --- | ---:| --- | --- | ---:| ---:| --- | ---:| --- | --- | ---:| ---:| --- | --- |',
  ];
  for (const summary of summaries) {
    const avgEvent = (events: PromotionEvent[], selector: (event: PromotionEvent) => number): number | string => {
      if (events.length === 0) return '-';
      return round3(events.reduce((sum, event) => sum + selector(event), 0) / events.length);
    };
    const yEvents = summary.promotions.filter((event) => event.kind === 'YOKOZUNA');
    const oEvents = summary.promotions.filter((event) => event.kind === 'OZEKI_NEW');
    lines.push(
      `| ${summary.label} | ${summary.seed} | ${summary.eraTags.join(', ') || '-'} | ${summary.yokozuna.count}/${summary.yokozuna.perYear} | ${summary.pressureEffects.yokozunaBlocked}/${summary.pressureEffects.yokozunaRelaxed} | ${avgEvent(yEvents, (event) => event.currentYokozunaCount)}/${avgEvent(yEvents, (event) => event.populationPressure)} | ${summary.yokozuna.suspicious} | ${summary.yokozuna.floorTouched} | ${summary.yokozuna.avgWins ?? '-'}/${summary.yokozuna.avgExpectedWins ?? '-'}/${summary.yokozuna.avgPoe ?? '-'} | ${summary.ozeki.count}/${summary.ozeki.perYear} | ${summary.pressureEffects.ozekiBlocked}/${summary.pressureEffects.ozekiRelaxed} | ${avgEvent(oEvents, (event) => event.currentOzekiCount)}/${avgEvent(oEvents, (event) => event.populationPressure)} | ${summary.ozeki.suspicious} | ${summary.ozeki.floorTouched} | ${summary.ozeki.avgWins ?? '-'}/${summary.ozeki.avgExpectedWins ?? '-'}/${summary.ozeki.avgPoe ?? '-'} | ${summary.ozekiReturn.count}/${summary.ozekiReturn.perYear} |`,
    );
  }
  lines.push('');
  lines.push('## Suspicious Promotions');
  lines.push('');
  lines.push('| world | seed | basho | kind | from -> to | record | count Y/O | pressure | recent wins | recent ranks | ability/floor/lift | decision | reasons |');
  lines.push('| --- | ---:| ---:| --- | --- | --- | --- | ---:| --- | --- | --- | --- | --- |');
  for (const summary of summaries) {
    for (const event of summary.promotions.filter((row) => row.suspicious)) {
      lines.push(
        `| ${summary.label} | ${summary.seed} | ${event.basho} | ${event.kind} | ${event.fromRank} -> ${event.toRank} | ${event.wins}-${event.losses}-${event.absent} | ${event.currentYokozunaCount}/${event.currentOzekiCount} | ${event.populationPressure} | ${event.recentWins.join('/')} | ${event.recentRanks.join(' / ')} | ${event.abilityBefore ?? '-'} / ${event.topRankFloor ?? '-'} / ${event.estimatedFloorLift} | ${event.decisionBand} | ${event.suspicionReasons.join('; ')} |`,
      );
    }
  }
  lines.push('');
  lines.push('## Reading Notes');
  lines.push('');
  lines.push('- `promotions/year` は `count / (basho / 6)`。60場所なら10年換算。');
  lines.push('- `floor touched` は、場所開始時の persistent ability が現在地位の top-rank floor を下回っていた昇進。seasonal raw ability は現状ログ化されていないため、floor 影響の近似信号として読む。');
  lines.push('- 横綱昇進は `evaluateYokozunaPromotion`、新大関昇進は `evaluateSnapshotOzekiPromotion` の formal/recommended 判定と照合する。大関特例復帰は別枠で数える。');
  lines.push('- `pressure blocked/relaxed` は、現在人数による補正を外した評価との差分。大関特例復帰は population pressure の対象外。');
  lines.push('- 本診断はハード上限、強制引退、成績無関係の降格を導入しない。');
  fs.writeFileSync(path.join(outDir, 'top_rank_promotion_frequency_diagnostics.md'), lines.join('\n'));
};

const writeAudit = (
  outDir: string,
  summaries: ReturnType<typeof summarizeWorld>[],
): void => {
  const all = summaries.flatMap((summary) => summary.promotions);
  const suspicious = all.filter((event) => event.suspicious);
  const materialFloor = all.filter((event) => event.estimatedFloorLift >= 4);
  const lines = [
    '# Top-rank promotion frequency audit',
    '',
    '## Scope',
    '',
    '上位過密の原因を「横綱・大関への補充頻度」として診断する。人数上限や強制整理は扱わない。',
    '',
    '## Findings',
    '',
    `- Total promotions observed: ${all.length}`,
    `- Suspicious promotions: ${suspicious.length}`,
    `- Promotions with material estimated floor lift: ${materialFloor.length}`,
    '',
    '## Interpretation',
    '',
    suspicious.length > 0
      ? '昇進イベントの一部に、formal gate 不一致・能力 floor の強い関与・低期待値からの大幅上振れが混じる。次に修正するなら昇進判定と top-rank floor の相互作用を狭く見るべき。'
      : '今回の診断範囲では、低すぎる基準での昇進は目立たない。補充過多が続く場合は、昇進後の滞留ではなく高成績者の発生頻度や floor による期待勝数押し上げを別診断する。',
    '',
    '## Guardrails',
    '',
    '- 横綱・大関人数のハード上限は入れない。',
    '- 強制引退や成績無関係の降格はしない。',
    '- battle / torikumi 本体の大改造はしない。',
  ];
  fs.writeFileSync(path.join(outDir, 'top_rank_promotion_frequency_audit.md'), lines.join('\n'));
};

const main = async (): Promise<void> => {
  const specs = buildWorldSpecs();
  const diagnostics: WorldDiagnostic[] = [];
  for (const seed of SEEDS) {
    for (const spec of specs) {
      const diagnostic = await runWorld(seed, spec);
      if (diagnostic) diagnostics.push(diagnostic);
    }
  }
  const summaries = diagnostics.map(summarizeWorld);

  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'top_rank_promotion_frequency_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seeds: SEEDS, summaries, raw: diagnostics }, null, 2),
  );
  writeMarkdown(outDir, summaries);
  writeAudit(outDir, summaries);

  console.log(`Top-rank promotion frequency diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  for (const summary of summaries) {
    console.log('');
    console.log(`=== ${summary.label} seed=${summary.seed} ===`);
    if (summary.eraTags.length > 0) console.log(`  eraTags=${summary.eraTags.join(',')}`);
    console.log(
      `  yokozuna promotions=${summary.yokozuna.count} perYear=${summary.yokozuna.perYear} suspicious=${summary.yokozuna.suspicious} formalMiss=${summary.yokozuna.formalMiss} floorTouched=${summary.yokozuna.floorTouched} materialFloor=${summary.yokozuna.materialFloorLift} avgW=${summary.yokozuna.avgWins ?? '-'} exp=${summary.yokozuna.avgExpectedWins ?? '-'} poe=${summary.yokozuna.avgPoe ?? '-'}`,
    );
    console.log(
      `  yokozuna pressure blocked=${summary.pressureEffects.yokozunaBlocked} relaxed=${summary.pressureEffects.yokozunaRelaxed}`,
    );
    console.log(
      `  new ozeki promotions=${summary.ozeki.count} perYear=${summary.ozeki.perYear} suspicious=${summary.ozeki.suspicious} formalMiss=${summary.ozeki.formalMiss} floorTouched=${summary.ozeki.floorTouched} materialFloor=${summary.ozeki.materialFloorLift} avgW=${summary.ozeki.avgWins ?? '-'} exp=${summary.ozeki.avgExpectedWins ?? '-'} poe=${summary.ozeki.avgPoe ?? '-'}`,
    );
    console.log(
      `  new ozeki pressure blocked=${summary.pressureEffects.ozekiBlocked} relaxed=${summary.pressureEffects.ozekiRelaxed}`,
    );
    console.log(
      `  ozeki returns=${summary.ozekiReturn.count} perYear=${summary.ozekiReturn.perYear} suspicious=${summary.ozekiReturn.suspicious} avgW=${summary.ozekiReturn.avgWins ?? '-'}`,
    );
  }
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
