#!/usr/bin/env npx tsx
/**
 * 横綱の bad record を、皆勤負け越し・途中休場・全休/ほぼ全休に分解して
 * 引退圧と継続 streak を診断する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';
import type { DivisionBashoSnapshot } from '../../src/logic/simulation/world/types';

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

const BASHO = argInt('--basho', 120);
const SEEDS = argStr('--seeds', argStr('--seed', '20260420'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));
const WORLDS_ARG = argStr(
  '--worlds',
  'legacy,ozeki_crowded,yokozuna_stable,top_division_turbulent,balanced_era,era1993,era2025',
);

interface YokozunaBadRecordMetrics {
  yokozunaAppearances: number;
  fullAttendanceMakekoshiCount: number;
  partialKyujoMakekoshiCount: number;
  fullKyujoCount: number;
  nearFullKyujoCount: number;
  poorButKachikoshiCount: number;
  severeDohyoBadCount: number;
  severeBanzukeBadCount: number;
  badRecordButActiveNextBashoCount: number;
  fullAttendanceMakekoshiButActiveNextBashoCount: number;
  partialKyujoMakekoshiButActiveNextBashoCount: number;
  fullKyujoButActiveNextBashoCount: number;
  retirementAfterBadRecordCount: number;
  retirementAfterFullAttendanceMakekoshiCount: number;
  retirementAfterPartialKyujoCount: number;
  retirementAfterFullKyujoCount: number;
  maxConsecutiveBadRecordStreak: number;
  maxConsecutiveKyujoStreak: number;
  yokozuna6BashoCount: number;
  maxYokozuna6Streak: number;
}

interface RelationSummary {
  count: number;
  ageSum: number;
  abilitySum: number;
  basePowerSum: number;
  decliningCount: number;
  veteranCount: number;
  primeCount: number;
  averageAge: number;
  averageAbility: number;
  averageBasePower: number;
}

interface YokozunaTrace {
  world: string;
  seed: number;
  basho: number;
  id: string;
  shikona: string;
  result: string;
  categories: string[];
  activeNextBasho: boolean;
  retired: boolean;
  badStreak: number;
  kyujoStreak: number;
  age: number | null;
  careerStage: string | null;
  ability: number | null;
  basePower: number | null;
}

interface WorldSummary {
  label: string;
  seed: number;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  metrics: YokozunaBadRecordMetrics;
  relations: Record<string, RelationSummary>;
  traces: YokozunaTrace[];
}

type RuntimeWorld = NonNullable<ReturnType<ReturnType<typeof createSimulationRuntime>['__getWorldForDiagnostics']>>;

const zeroMetrics = (): YokozunaBadRecordMetrics => ({
  yokozunaAppearances: 0,
  fullAttendanceMakekoshiCount: 0,
  partialKyujoMakekoshiCount: 0,
  fullKyujoCount: 0,
  nearFullKyujoCount: 0,
  poorButKachikoshiCount: 0,
  severeDohyoBadCount: 0,
  severeBanzukeBadCount: 0,
  badRecordButActiveNextBashoCount: 0,
  fullAttendanceMakekoshiButActiveNextBashoCount: 0,
  partialKyujoMakekoshiButActiveNextBashoCount: 0,
  fullKyujoButActiveNextBashoCount: 0,
  retirementAfterBadRecordCount: 0,
  retirementAfterFullAttendanceMakekoshiCount: 0,
  retirementAfterPartialKyujoCount: 0,
  retirementAfterFullKyujoCount: 0,
  maxConsecutiveBadRecordStreak: 0,
  maxConsecutiveKyujoStreak: 0,
  yokozuna6BashoCount: 0,
  maxYokozuna6Streak: 0,
});

const createRelationSummary = (): RelationSummary => ({
  count: 0,
  ageSum: 0,
  abilitySum: 0,
  basePowerSum: 0,
  decliningCount: 0,
  veteranCount: 0,
  primeCount: 0,
  averageAge: 0,
  averageAbility: 0,
  averageBasePower: 0,
});

const addRelation = (
  relation: RelationSummary,
  npc: RuntimeWorld['actorRegistry'] extends Map<string, infer T> ? T | undefined : never,
): void => {
  relation.count += 1;
  relation.ageSum += npc?.age ?? 0;
  relation.abilitySum += npc?.ability ?? 0;
  relation.basePowerSum += npc?.basePower ?? 0;
  if (npc?.initialCareerStage === 'declining') relation.decliningCount += 1;
  if (npc?.initialCareerStage === 'veteran') relation.veteranCount += 1;
  if (npc?.initialCareerStage === 'prime') relation.primeCount += 1;
};

const finalizeRelation = (relation: RelationSummary): RelationSummary => ({
  ...relation,
  averageAge: relation.count > 0 ? Math.round((relation.ageSum / relation.count) * 100) / 100 : 0,
  averageAbility: relation.count > 0 ? Math.round((relation.abilitySum / relation.count) * 100) / 100 : 0,
  averageBasePower: relation.count > 0 ? Math.round((relation.basePowerSum / relation.count) * 100) / 100 : 0,
});

const rate = (count: number, total: number): string =>
  total > 0 ? `${count} (${((count / total) * 100).toFixed(2)}%)` : '0 (0.00%)';

const maxStreak = (values: boolean[]): number => {
  let current = 0;
  let best = 0;
  for (const value of values) {
    current = value ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
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

const isYokozunaResult = (result: DivisionBashoSnapshot): boolean =>
  result.rank?.division === 'Makuuchi' && result.rank.name === '横綱';

const activeAsYokozunaNextBasho = (world: RuntimeWorld, id: string): boolean =>
  world.lastAllocations.some(
    (allocation) =>
      allocation.id === id &&
      allocation.nextRank.division === 'Makuuchi' &&
      allocation.nextRank.name === '横綱',
  );

const classifyResult = (
  result: DivisionBashoSnapshot,
): {
  categories: string[];
  badRecord: boolean;
  kyujo: boolean;
  fullAttendanceMakekoshi: boolean;
  partialKyujoMakekoshi: boolean;
  fullKyujo: boolean;
  nearFullKyujo: boolean;
} => {
  const absent = result.absent ?? Math.max(0, 15 - (result.wins + result.losses));
  const dohyoTotal = result.wins + result.losses;
  const fullAttendanceMakekoshi = dohyoTotal === 15 && absent === 0 && result.wins < result.losses;
  const partialKyujoMakekoshi = absent > 0 && dohyoTotal > 0 && result.wins < result.losses + absent;
  const fullKyujo = absent >= 15;
  const nearFullKyujo = absent >= 10 && absent < 15;
  const poorButKachikoshi = result.wins >= result.losses && result.wins <= 9;
  const severeDohyoBad = dohyoTotal > 0 && result.wins / dohyoTotal <= 0.35;
  const severeBanzukeBad = result.wins / 15 <= 0.35;
  const categories = [
    fullAttendanceMakekoshi ? 'fullAttendanceMakekoshi' : '',
    partialKyujoMakekoshi ? 'partialKyujoMakekoshi' : '',
    fullKyujo ? 'fullKyujo' : '',
    nearFullKyujo ? 'nearFullKyujo' : '',
    poorButKachikoshi ? 'poorButKachikoshi' : '',
    severeDohyoBad ? 'severeDohyoBad' : '',
    severeBanzukeBad ? 'severeBanzukeBad' : '',
  ].filter(Boolean);
  return {
    categories,
    badRecord: fullAttendanceMakekoshi || partialKyujoMakekoshi || fullKyujo || severeBanzukeBad,
    kyujo: absent > 0,
    fullAttendanceMakekoshi,
    partialKyujoMakekoshi,
    fullKyujo,
    nearFullKyujo,
  };
};

const runWorld = async (
  seed: number,
  spec: { key: string; snapshot?: EraSnapshot },
): Promise<WorldSummary | null> => {
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
      careerId: `yokozuna-bad-record-retirement-${spec.key}-${seed}`,
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

  const metrics = zeroMetrics();
  const traces: YokozunaTrace[] = [];
  const badStreakById = new Map<string, number>();
  const kyujoStreakById = new Map<string, number>();
  const y6Flags: boolean[] = [];
  const relations = {
    fullAttendanceMakekoshi: createRelationSummary(),
    partialKyujoMakekoshi: createRelationSummary(),
    fullKyujo: createRelationSummary(),
    badRecordButActiveNextBasho: createRelationSummary(),
    retirementAfterBadRecord: createRelationSummary(),
  };

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const yokozunaResults = (world.lastBashoResults.Makuuchi ?? []).filter(isYokozunaResult);
    y6Flags.push(yokozunaResults.length >= 6);
    metrics.yokozunaAppearances += yokozunaResults.length;

    for (const result of yokozunaResults) {
      const npc = world.actorRegistry.get(result.id);
      const classification = classifyResult(result);
      const allocationKeepsYokozuna = activeAsYokozunaNextBasho(world, result.id);
      const activeNext = allocationKeepsYokozuna && npc?.active !== false;
      const retired = npc?.active === false || !allocationKeepsYokozuna;
      const badStreak = classification.badRecord ? (badStreakById.get(result.id) ?? 0) + 1 : 0;
      const kyujoStreak = classification.kyujo ? (kyujoStreakById.get(result.id) ?? 0) + 1 : 0;
      badStreakById.set(result.id, badStreak);
      kyujoStreakById.set(result.id, kyujoStreak);
      metrics.maxConsecutiveBadRecordStreak = Math.max(metrics.maxConsecutiveBadRecordStreak, badStreak);
      metrics.maxConsecutiveKyujoStreak = Math.max(metrics.maxConsecutiveKyujoStreak, kyujoStreak);

      if (classification.fullAttendanceMakekoshi) {
        metrics.fullAttendanceMakekoshiCount += 1;
        addRelation(relations.fullAttendanceMakekoshi, npc);
      }
      if (classification.partialKyujoMakekoshi) {
        metrics.partialKyujoMakekoshiCount += 1;
        addRelation(relations.partialKyujoMakekoshi, npc);
      }
      if (classification.fullKyujo) {
        metrics.fullKyujoCount += 1;
        addRelation(relations.fullKyujo, npc);
      }
      if (classification.nearFullKyujo) metrics.nearFullKyujoCount += 1;
      if (classification.categories.includes('poorButKachikoshi')) metrics.poorButKachikoshiCount += 1;
      if (classification.categories.includes('severeDohyoBad')) metrics.severeDohyoBadCount += 1;
      if (classification.categories.includes('severeBanzukeBad')) metrics.severeBanzukeBadCount += 1;

      if (classification.badRecord && activeNext) {
        metrics.badRecordButActiveNextBashoCount += 1;
        addRelation(relations.badRecordButActiveNextBasho, npc);
      }
      if (classification.fullAttendanceMakekoshi && activeNext) {
        metrics.fullAttendanceMakekoshiButActiveNextBashoCount += 1;
      }
      if (classification.partialKyujoMakekoshi && activeNext) {
        metrics.partialKyujoMakekoshiButActiveNextBashoCount += 1;
      }
      if (classification.fullKyujo && activeNext) {
        metrics.fullKyujoButActiveNextBashoCount += 1;
      }
      if (classification.badRecord && retired) {
        metrics.retirementAfterBadRecordCount += 1;
        addRelation(relations.retirementAfterBadRecord, npc);
      }
      if (classification.fullAttendanceMakekoshi && retired) {
        metrics.retirementAfterFullAttendanceMakekoshiCount += 1;
      }
      if (classification.partialKyujoMakekoshi && retired) {
        metrics.retirementAfterPartialKyujoCount += 1;
      }
      if (classification.fullKyujo && retired) {
        metrics.retirementAfterFullKyujoCount += 1;
      }

      if (classification.categories.length > 0 && traces.length < 200) {
        traces.push({
          world: label,
          seed,
          basho: b + 1,
          id: result.id,
          shikona: result.shikona,
          result: `${result.wins}-${result.losses}-${result.absent ?? 0}`,
          categories: classification.categories,
          activeNextBasho: activeNext,
          retired,
          badStreak,
          kyujoStreak,
          age: npc?.age ?? null,
          careerStage: npc?.initialCareerStage ?? null,
          ability: npc?.ability ?? null,
          basePower: npc?.basePower ?? null,
        });
      }
    }
  }

  metrics.yokozuna6BashoCount = y6Flags.filter(Boolean).length;
  metrics.maxYokozuna6Streak = maxStreak(y6Flags);

  return {
    label,
    seed,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    metrics,
    relations: Object.fromEntries(
      Object.entries(relations).map(([key, value]) => [key, finalizeRelation(value)]),
    ),
    traces,
  };
};

const classifyCause = (total: YokozunaBadRecordMetrics): string[] => {
  const causes: string[] = [];
  const appearances = total.yokozunaAppearances;
  const fullMakekoshiRate = appearances > 0 ? total.fullAttendanceMakekoshiCount / appearances : 0;
  const partialRate = appearances > 0 ? total.partialKyujoMakekoshiCount / appearances : 0;
  const fullKyujoRate = appearances > 0 ? total.fullKyujoCount / appearances : 0;
  const badActiveRate = appearances > 0 ? total.badRecordButActiveNextBashoCount / appearances : 0;
  if (fullMakekoshiRate > 0.01) causes.push('A: 15日皆勤負け越しが多すぎる');
  if (partialRate > 0.08) causes.push('B: 途中休場込みの負け越しが多い');
  if (fullKyujoRate > 0.08 || total.fullKyujoButActiveNextBashoCount > total.retirementAfterFullKyujoCount * 3) {
    causes.push('C: 全休横綱が長く残りすぎる');
  }
  if (badActiveRate > 0.12) causes.push('D: bad record 後の引退圧が弱い');
  if (total.maxConsecutiveBadRecordStreak >= 3 || total.maxConsecutiveKyujoStreak >= 4) {
    causes.push('E: 連続不調でも現役継続しすぎる');
  }
  if (causes.length === 0) causes.push('F: 診断上は問題なし');
  if (total.maxYokozuna6Streak < 6) causes.push('G: 横綱過密の主因ではない');
  return causes;
};

const mergeMetrics = (summaries: WorldSummary[]): YokozunaBadRecordMetrics => {
  const total = zeroMetrics();
  for (const summary of summaries) {
    for (const [key, value] of Object.entries(summary.metrics) as Array<[keyof YokozunaBadRecordMetrics, number]>) {
      if (key.startsWith('max')) {
        total[key] = Math.max(total[key], value);
      } else {
        total[key] += value;
      }
    }
  }
  return total;
};

const writeOutputs = (summaries: WorldSummary[]): void => {
  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  const total = mergeMetrics(summaries);
  const causes = classifyCause(total);
  fs.writeFileSync(
    path.join(outDir, 'yokozuna_bad_record_retirement_diagnostics.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      basho: BASHO,
      seeds: SEEDS,
      total,
      causeClassification: causes,
      summaries,
    }, null, 2),
  );

  const md: string[] = [
    '# Yokozuna bad record retirement diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseYokozunaBadRecordRetirement.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| world | seed | Y app | full att MK | partial kyujo MK | full kyujo | near full kyujo | poor KK | severe dohyo | severe banzuke | bad active | full att MK active | max bad/kyujo streak | Y>=6 streak |',
    '| --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|',
  ];
  for (const summary of summaries) {
    const m = summary.metrics;
    md.push(`| ${summary.label} | ${summary.seed} | ${m.yokozunaAppearances} | ${m.fullAttendanceMakekoshiCount} | ${m.partialKyujoMakekoshiCount} | ${m.fullKyujoCount} | ${m.nearFullKyujoCount} | ${m.poorButKachikoshiCount} | ${m.severeDohyoBadCount} | ${m.severeBanzukeBadCount} | ${m.badRecordButActiveNextBashoCount} | ${m.fullAttendanceMakekoshiButActiveNextBashoCount} | ${m.maxConsecutiveBadRecordStreak}/${m.maxConsecutiveKyujoStreak} | ${m.maxYokozuna6Streak} |`);
  }
  md.push('');
  md.push('## Total KPI');
  md.push('');
  md.push(`- yokozuna appearances: ${total.yokozunaAppearances}`);
  md.push(`- full attendance makekoshi count / rate: ${rate(total.fullAttendanceMakekoshiCount, total.yokozunaAppearances)}`);
  md.push(`- partial kyujo makekoshi count / rate: ${rate(total.partialKyujoMakekoshiCount, total.yokozunaAppearances)}`);
  md.push(`- full kyujo count / rate: ${rate(total.fullKyujoCount, total.yokozunaAppearances)}`);
  md.push(`- near full kyujo count / rate: ${rate(total.nearFullKyujoCount, total.yokozunaAppearances)}`);
  md.push(`- poor but kachikoshi count: ${total.poorButKachikoshiCount}`);
  md.push(`- severe dohyo bad record count: ${total.severeDohyoBadCount}`);
  md.push(`- severe banzuke bad record count: ${total.severeBanzukeBadCount}`);
  md.push(`- bad record but active next basho count: ${total.badRecordButActiveNextBashoCount}`);
  md.push(`- full attendance makekoshi but active next basho count: ${total.fullAttendanceMakekoshiButActiveNextBashoCount}`);
  md.push(`- consecutive bad record streak max: ${total.maxConsecutiveBadRecordStreak}`);
  md.push(`- consecutive kyujo streak max: ${total.maxConsecutiveKyujoStreak}`);
  md.push(`- retirement after bad record count: ${total.retirementAfterBadRecordCount}`);
  md.push(`- retirement after full attendance makekoshi count: ${total.retirementAfterFullAttendanceMakekoshiCount}`);
  md.push(`- retirement after partial kyujo count: ${total.retirementAfterPartialKyujoCount}`);
  md.push(`- retirement after full kyujo count: ${total.retirementAfterFullKyujoCount}`);
  md.push(`- Y>=6 streak max: ${total.maxYokozuna6Streak}`);
  md.push('');
  md.push('## Age / Stage / Ability Relation');
  md.push('');
  md.push('| bucket | count | avg age | avg ability | avg basePower | prime/veteran/declining |');
  md.push('| --- | ---:| ---:| ---:| ---:| --- |');
  const relationTotals = new Map<string, RelationSummary>();
  for (const summary of summaries) {
    for (const [key, relation] of Object.entries(summary.relations)) {
      const current = relationTotals.get(key) ?? createRelationSummary();
      current.count += relation.count;
      current.ageSum += relation.ageSum;
      current.abilitySum += relation.abilitySum;
      current.basePowerSum += relation.basePowerSum;
      current.primeCount += relation.primeCount;
      current.veteranCount += relation.veteranCount;
      current.decliningCount += relation.decliningCount;
      relationTotals.set(key, current);
    }
  }
  for (const [key, relation] of relationTotals) {
    const r = finalizeRelation(relation);
    md.push(`| ${key} | ${r.count} | ${r.averageAge} | ${r.averageAbility} | ${r.averageBasePower} | ${r.primeCount}/${r.veteranCount}/${r.decliningCount} |`);
  }
  md.push('');
  md.push('## Cause Classification');
  md.push('');
  for (const cause of causes) md.push(`- ${cause}`);
  md.push('');
  md.push('## Reading');
  md.push('');
  md.push('- `fullAttendanceMakekoshi` は 15 日皆勤した上で負け越した横綱だけを数える。途中休場・全休はここに混ぜない。');
  md.push('- `partialKyujoMakekoshi` は土俵に上がった日があり、休場を含む番付上の負け越しになった横綱を数える。');
  md.push('- `fullKyujo` / `nearFullKyujo` は負け越しではなく療養・不調 signal として読む。');
  md.push('- `active next basho` は allocation 上、次場所も横綱として残るかで判定する。横綱降格は許可しない。');
  md.push('');
  md.push('## Interesting Traces');
  md.push('');
  const traces = summaries.flatMap((summary) => summary.traces).slice(0, 80);
  if (traces.length === 0) {
    md.push('分類対象 trace はなし。');
  } else {
    md.push('| world | seed | basho | id | shikona | result | categories | active next | retired | bad/kyujo streak | age | stage | ability |');
    md.push('| --- | ---:| ---:| --- | --- | --- | --- | --- | --- | --- | ---:| --- | ---:|');
    for (const trace of traces) {
      md.push(`| ${trace.world} | ${trace.seed} | ${trace.basho} | ${trace.id} | ${trace.shikona} | ${trace.result} | ${trace.categories.join(', ')} | ${trace.activeNextBasho ? 'yes' : 'no'} | ${trace.retired ? 'yes' : 'no'} | ${trace.badStreak}/${trace.kyujoStreak} | ${trace.age ?? '-'} | ${trace.careerStage ?? '-'} | ${trace.ability == null ? '-' : trace.ability.toFixed(1)} |`);
    }
  }
  fs.writeFileSync(path.join(outDir, 'yokozuna_bad_record_retirement_diagnostics.md'), `${md.join('\n')}\n`);

  const audit = [
    '# Yokozuna bad record retirement audit',
    '',
    '## Scope',
    '',
    'NPC 横綱の悪成績を、15日皆勤負け越し・途中休場込み負け越し・全休/ほぼ全休・低勝数勝ち越しへ分解する。横綱は降格させず、引退圧・休場・現役続行の自然な処理として診断する。',
    '',
    '## Method',
    '',
    '- `world.lastBashoResults.Makuuchi` の rank label が `横綱` の結果だけを見る。',
    '- `wins + losses = 15, absent = 0, wins < losses` を皆勤負け越しとして独立分類する。',
    '- `absent > 0` の bad record は途中休場または全休 signal として扱い、皆勤負け越しへ混ぜない。',
    '- 次場所現役判定は `lastAllocations.nextRank` が横綱かどうかで見る。',
    '',
    '## Guardrails',
    '',
    '- 横綱降格は入れない。',
    '- 横綱人数ハード上限は入れない。',
    '- 成績だけの即強制引退は入れない。',
    '- battle / torikumi / 優勝ラベル / 昇進条件 / EraSnapshot はこの診断の修正対象外。',
  ];
  fs.writeFileSync(path.join(outDir, 'yokozuna_bad_record_retirement_audit.md'), `${audit.join('\n')}\n`);
};

const main = async (): Promise<void> => {
  const specs = buildWorldSpecs();
  const summaries: WorldSummary[] = [];
  for (const seed of SEEDS) {
    for (const spec of specs) {
      const summary = await runWorld(seed, spec);
      if (summary) summaries.push(summary);
    }
  }
  writeOutputs(summaries);
  const total = mergeMetrics(summaries);
  console.log(`Yokozuna bad record retirement diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  console.log(JSON.stringify(total, null, 2));
  console.log('Wrote docs/design/yokozuna_bad_record_retirement_{audit,diagnostics}.{md,json}');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
