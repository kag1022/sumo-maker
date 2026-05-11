#!/usr/bin/env npx tsx
/**
 * 十両上位↔幕内下位の往復力士が、珍事ではなく構造的に多発しているか診断する。
 *
 * Usage:
 *   npx tsx scripts/dev/diagnoseJuryoMakuuchiElevator.ts --basho 72 --seeds "20260423,20260424,20260425"
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { Rank } from '../../src/logic/models';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';
import type { SimulationWorld, TopDivision } from '../../src/logic/simulation/world';

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

const BASHO = argInt('--basho', 72);
const SEEDS = argStr('--seeds', argStr('--seed', '20260423,20260424,20260425'))
  .split(',')
  .map((value) => parseInt(value.trim(), 10))
  .filter((value) => Number.isFinite(value));

interface BashoRow {
  seed: number;
  basho: number;
  id: string;
  shikona: string;
  rank: Rank;
  wins: number;
  losses: number;
  absent: number;
  yusho: boolean;
  ability: number | null;
  seasonalAbility: number | null;
  expectedWins: number | null;
  strengthOfSchedule: number | null;
  performanceOverExpected: number | null;
  nextRank: Rank | null;
  decisionReason: string | null;
  boundaryBoutCount: number;
  boundaryWins: number;
  boundaryLosses: number;
  kyujo: boolean;
}

interface CycleTrace {
  seed: number;
  id: string;
  shikona: string;
  firstYushoBasho: number;
  makuuchiBasho: number;
  demotedJuryoBasho: number;
  repeatYushoBasho: number;
  rows: BashoRow[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const rankLabel = (rank: Rank | null): string => {
  if (!rank) return '-';
  const side = rank.side === 'West' ? '西' : '東';
  if (rank.name === '横綱' || rank.name === '大関' || rank.name === '関脇' || rank.name === '小結') {
    return `${side}${rank.name}`;
  }
  return `${side}${rank.name}${rank.number ?? ''}`;
};

const isMakuuchiTail = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' &&
  rank.name === '前頭' &&
  (rank.number ?? 99) >= 12;

const isJuryoUpper = (rank: Rank): boolean =>
  rank.division === 'Juryo' && (rank.number ?? 99) <= 5;

const isMakekoshi = (row: BashoRow): boolean =>
  row.wins < row.losses + row.absent;

const avg = (values: Array<number | null | undefined>): number | null => {
  const finite = values.filter((value): value is number => Number.isFinite(value));
  if (finite.length === 0) return null;
  return round2(finite.reduce((sum, value) => sum + value, 0) / finite.length);
};

const getRosterMetrics = (
  world: SimulationWorld,
  division: TopDivision,
  id: string,
): { ability: number | null; seasonalAbility: number | null } => {
  const roster = world.rosters[division].find((entry) => entry.id === id);
  const actor = world.actorRegistry.get(id);
  const ability = actor?.ability ?? roster?.ability ?? null;
  const form = actor?.form ?? roster?.form ?? 1;
  return {
    ability,
    seasonalAbility: ability == null ? null : ability + form * 3.2,
  };
};

const buildRowsForStep = (
  seed: number,
  basho: number,
  world: SimulationWorld,
): BashoRow[] => {
  const allocationById = new Map(world.lastAllocations.map((allocation) => [allocation.id, allocation]));
  const rows: BashoRow[] = [];
  for (const division of ['Makuuchi', 'Juryo'] as const) {
    for (const result of world.lastBashoResults[division] ?? []) {
      const allocation = allocationById.get(result.id);
      const metrics = getRosterMetrics(world, division, result.id);
      const absent = result.absent ?? Math.max(0, 15 - result.wins - result.losses);
      rows.push({
        seed,
        basho,
        id: result.id,
        shikona: result.shikona,
        rank: result.rank ?? { division, name: division === 'Makuuchi' ? '前頭' : '十両', number: 1, side: 'East' },
        wins: result.wins,
        losses: result.losses,
        absent,
        yusho: result.yusho ?? false,
        ability: metrics.ability,
        seasonalAbility: metrics.seasonalAbility,
        expectedWins: result.expectedWins ?? null,
        strengthOfSchedule: result.strengthOfSchedule ?? null,
        performanceOverExpected: result.performanceOverExpected ?? null,
        nextRank: allocation?.nextRank ?? null,
        decisionReason:
          allocation == null
            ? null
            : `${rankLabel(allocation.currentRank)} -> ${rankLabel(allocation.nextRank)} score=${round2(allocation.score)}`,
        boundaryBoutCount: 0,
        boundaryWins: 0,
        boundaryLosses: 0,
        kyujo: absent > 0,
      });
    }
  }
  return rows;
};

const runSeed = async (seed: number): Promise<{ rows: BashoRow[]; diagnostics: Array<Record<string, unknown>> }> => {
  const initial = createLogicLabInitialStatus('HIGH_TALENT_AS', createSeededRandom(seed));
  initial.rank = { division: 'Juryo', name: '十両', number: 1, side: 'East' };
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `juryo-makuuchi-elevator-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
      __dev_ironmanPlayer: true,
    },
    {
      random: createSeededRandom(seed + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  const rows: BashoRow[] = [];
  const diagnostics: Array<Record<string, unknown>> = [];
  for (let basho = 1; basho <= BASHO; basho += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    rows.push(...buildRowsForStep(seed, basho, world));
    diagnostics.push({
      seed,
      basho,
      playerRank: rankLabel(runtime.getStatus().rank),
      crossDivisionBoutCount: step.diagnostics?.crossDivisionBoutCount ?? null,
      lateCrossDivisionBoutCount: step.diagnostics?.lateCrossDivisionBoutCount ?? null,
      torikumiScheduleViolations: step.diagnostics?.torikumiScheduleViolations ?? null,
    });
  }
  return { rows, diagnostics };
};

const detectCycles = (rows: BashoRow[]): CycleTrace[] => {
  const rowsBySeedAndId = new Map<string, BashoRow[]>();
  for (const row of rows) {
    const key = `${row.seed}:${row.id}`;
    rowsBySeedAndId.set(key, [...(rowsBySeedAndId.get(key) ?? []), row]);
  }

  const cycles: CycleTrace[] = [];
  for (const timeline of rowsBySeedAndId.values()) {
    timeline.sort((a, b) => a.basho - b.basho);
    for (const row of timeline) {
      if (row.rank.division !== 'Juryo' || !row.yusho || row.nextRank?.division !== 'Makuuchi') continue;
      const makuuchi = timeline.find((entry) =>
        entry.basho === row.basho + 1 &&
        entry.rank.division === 'Makuuchi' &&
        isMakekoshi(entry));
      if (!makuuchi || makuuchi.nextRank?.division !== 'Juryo') continue;
      const repeat = timeline.find((entry) =>
        entry.basho >= makuuchi.basho + 1 &&
        entry.basho <= makuuchi.basho + 3 &&
        entry.rank.division === 'Juryo' &&
        entry.yusho);
      if (!repeat) continue;
      cycles.push({
        seed: row.seed,
        id: row.id,
        shikona: row.shikona,
        firstYushoBasho: row.basho,
        makuuchiBasho: makuuchi.basho,
        demotedJuryoBasho: makuuchi.basho + 1,
        repeatYushoBasho: repeat.basho,
        rows: timeline.filter((entry) =>
          entry.basho >= row.basho - 1 && entry.basho <= repeat.basho + 1),
      });
    }
  }
  return cycles;
};

const classifyCauses = (input: {
  cycles: CycleTrace[];
  rows: BashoRow[];
  promotedYushoRows: BashoRow[];
  promotedMakuuchiRows: BashoRow[];
}): string[] => {
  const causes: string[] = [];
  const cycleIds = new Set(input.cycles.map((cycle) => `${cycle.seed}:${cycle.id}`));
  const makuuchiTailRows = input.rows.filter((row) => isMakuuchiTail(row.rank));
  const juryoUpperRows = input.rows.filter((row) => isJuryoUpper(row.rank));
  const makuuchiAbility = avg(makuuchiTailRows.map((row) => row.ability));
  const juryoAbility = avg(juryoUpperRows.map((row) => row.ability));
  const promotedMakuuchiExpected = avg(input.promotedMakuuchiRows.map((row) => row.expectedWins));
  const promotedJuryoExpected = avg(input.promotedYushoRows.map((row) => row.expectedWins));
  const immediateMakekoshiRate =
    input.promotedMakuuchiRows.length === 0
      ? 0
      : input.promotedMakuuchiRows.filter(isMakekoshi).length / input.promotedMakuuchiRows.length;
  const injuryShare =
    input.promotedMakuuchiRows.length === 0
      ? 0
      : input.promotedMakuuchiRows.filter((row) => row.kyujo).length / input.promotedMakuuchiRows.length;

  if ((juryoAbility ?? 0) - (makuuchiAbility ?? 0) > 4) causes.push('A: 十両上位と幕内下位の能力分布が逆転気味');
  if ((promotedJuryoExpected ?? 0) - (promotedMakuuchiExpected ?? 0) >= 3) causes.push('B: 十両では強いが幕内下位で期待勝数が急落');
  causes.push('C: 幕内下位↔十両上位の境界取組は現行診断では場所集計のみ。専用 boundaryId が無く粒度不足');
  if (input.promotedYushoRows.length > 0 && input.promotedYushoRows.length / Math.max(1, input.rows.filter((row) => row.rank.division === 'Juryo' && row.yusho).length) > 0.85) {
    causes.push('D: 十両優勝者の幕内昇進率は高いが、それ自体は自然な信号');
  }
  if (immediateMakekoshiRate >= 0.65) causes.push('E: 昇進直後の幕内負け越し率が高い');
  if (injuryShare >= 0.25) causes.push('F: injury / kyujo が一部寄与');
  if (cycleIds.size === 0) causes.push('G: 今回 seed では構造的 elevator loop は確認できない');
  if (causes.length === 1 && causes[0].startsWith('C:')) causes.push('G: 反復は限定的で seed 依存の珍事寄り');
  return causes;
};

const writeMarkdown = (
  outDir: string,
  payload: {
    rows: BashoRow[];
    cycles: CycleTrace[];
    summaries: Record<string, unknown>;
    causes: string[];
  },
): void => {
  const lines: string[] = [
    '# Juryo-Makuuchi Elevator Diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseJuryoMakuuchiElevator.ts\` (basho=${BASHO}, seeds=${SEEDS.join(',')}).`,
    '',
    '## Summary',
    '',
    '| KPI | value |',
    '| --- | ---:|',
  ];
  for (const [key, value] of Object.entries(payload.summaries)) {
    lines.push(`| ${key} | ${typeof value === 'number' ? value : String(value)} |`);
  }
  lines.push('');
  lines.push('## Cause Classification');
  lines.push('');
  for (const cause of payload.causes) lines.push(`- ${cause}`);
  lines.push('');
  lines.push('## Elevator Loop Candidates');
  lines.push('');
  if (payload.cycles.length === 0) {
    lines.push('2 cycles 以上の elevator loop candidate は検出されなかった。');
  } else {
    lines.push('| seed | rikishi | cycles | trace |');
    lines.push('| ---:| --- | ---:| --- |');
    const grouped = new Map<string, CycleTrace[]>();
    for (const cycle of payload.cycles) {
      const key = `${cycle.seed}:${cycle.id}`;
      grouped.set(key, [...(grouped.get(key) ?? []), cycle]);
    }
    for (const [key, cycles] of grouped.entries()) {
      if (cycles.length < 2) continue;
      const first = cycles[0];
      const trace = first.rows
        .map((row) => `${row.basho}:${rankLabel(row.rank)} ${row.wins}-${row.losses}-${row.absent}${row.yusho ? ' 優勝' : ''} EW=${row.expectedWins ?? '-'}`)
        .join('<br>');
      lines.push(`| ${first.seed} | ${first.shikona} (${key.split(':')[1]}) | ${cycles.length} | ${trace} |`);
    }
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- 十両優勝者の昇進自体は異常扱いしない。診断対象は同一 ID の短期反復。');
  lines.push('- 現行 scheduler は幕内と十両を同一関取 pool に入れるが、`MakuuchiJuryo` の専用 boundary band は通常経路では渡されていない。');
  lines.push('- `boundaryBoutCount` は現時点で個別対戦 trace から復元できないため 0 の placeholder。必要なら scheduler diagnostics の粒度拡張が次タスク。');
  fs.writeFileSync(path.join(outDir, 'juryo_makuuchi_elevator_diagnostics.md'), lines.join('\n'));
};

const writeAudit = (outDir: string, causes: string[]): void => {
  const lines = [
    '# Juryo-Makuuchi Elevator Audit',
    '',
    '## Promotion / Demotion Path',
    '',
    '- 十両→幕内は `src/logic/banzuke/rules/singleRankChange.ts` の `calculateJuryoChange` と、`src/logic/banzuke/providers/sekitori/contextual.ts` の十両昇進 candidate scoring が入口。',
    '- 幕内→十両は同じ `calculateMakuuchiChange` の下位前頭危険水域と、sekitori provider の slot allocation で最終化される。',
    '- runtime では `advanceTopDivisionBanzuke` が `buildTopDivisionRecords` → `generateNextBanzuke` → `applyBanzukeToRosters` の順で NPC の次番付を適用する。',
    '',
    '## Boundary Torikumi',
    '',
    '- 幕内・十両の本場所は `runTopDivisionBasho` で同一 participants pool に入り、`scheduleTorikumiBasho` に渡される。',
    '- ただし通常呼び出しは `boundaryBands: []` で、`MakuuchiJuryo` 専用 boundary band は起動していない。',
    '- 幕下↔十両と違い、幕内下位↔十両上位の境界取組は現状の diagnostics から個別 ID 単位では読めない。',
    '',
    '## Diagnosis Definition',
    '',
    '- 1 cycle: `Juryo yusho -> next basho Makuuchi promotion -> Makuuchi makekoshi -> next rank Juryo -> within 1-3 basho Juryo yusho again`。',
    '- 2 cycles 以上の同一 ID を elevator loop candidate とする。',
    '',
    '## Current Judgment',
    '',
    causes.join(' / '),
    '',
    '## Fix Decision',
    '',
    '本タスクでは本体ロジックを変更しない。原因が能力断絶か、境界取組不足か、昇降格 allocation の強さかを切り分ける段階であり、十両優勝者の昇進制限や幕内下位・十両上位の一律能力補正は避ける。',
  ];
  fs.writeFileSync(path.join(outDir, 'juryo_makuuchi_elevator_audit.md'), lines.join('\n'));
};

const main = async (): Promise<void> => {
  const allRows: BashoRow[] = [];
  const allDiagnostics: Array<Record<string, unknown>> = [];
  for (const seed of SEEDS) {
    const result = await runSeed(seed);
    allRows.push(...result.rows);
    allDiagnostics.push(...result.diagnostics);
  }

  const cycles = detectCycles(allRows);
  const groupedCycles = new Map<string, CycleTrace[]>();
  for (const cycle of cycles) {
    const key = `${cycle.seed}:${cycle.id}`;
    groupedCycles.set(key, [...(groupedCycles.get(key) ?? []), cycle]);
  }
  const loopCandidates = [...groupedCycles.values()].filter((value) => value.length >= 2);
  const juryoYushoRows = allRows.filter((row) => row.rank.division === 'Juryo' && row.yusho);
  const promotedYushoRows = juryoYushoRows.filter((row) => row.nextRank?.division === 'Makuuchi');
  const rowBySeedIdBasho = new Map(allRows.map((row) => [`${row.seed}:${row.id}:${row.basho}`, row]));
  const promotedMakuuchiRows = promotedYushoRows
    .map((row) => rowBySeedIdBasho.get(`${row.seed}:${row.id}:${row.basho + 1}`))
    .filter((row): row is BashoRow => Boolean(row) && row.rank.division === 'Makuuchi');
  const immediateMakekoshiRows = promotedMakuuchiRows.filter(isMakekoshi);
  const immediateDemotionRows = promotedMakuuchiRows.filter((row) => row.nextRank?.division === 'Juryo');
  const causes = classifyCauses({ cycles, rows: allRows, promotedYushoRows, promotedMakuuchiRows });

  const summaries = {
    seeds: SEEDS.length,
    bashoPerSeed: BASHO,
    juryoYushoCount: juryoYushoRows.length,
    juryoYushoToMakuuchiPromotionRate: round2(promotedYushoRows.length / Math.max(1, juryoYushoRows.length)),
    promotedMakuuchiImmediateMakekoshi: immediateMakekoshiRows.length,
    promotedMakuuchiImmediateDemotion: immediateDemotionRows.length,
    elevatorCycleCount: cycles.length,
    elevatorWrestlerCount: loopCandidates.length,
    maxElevatorCyclesPerRikishi: Math.max(0, ...[...groupedCycles.values()].map((value) => value.length)),
    avgJuryoWinsForYushoPromotees: avg(promotedYushoRows.map((row) => row.wins)) ?? 0,
    avgMakuuchiWinsAfterPromotion: avg(promotedMakuuchiRows.map((row) => row.wins)) ?? 0,
    avgJuryoExpectedWinsForYushoPromotees: avg(promotedYushoRows.map((row) => row.expectedWins)) ?? 0,
    avgMakuuchiExpectedWinsAfterPromotion: avg(promotedMakuuchiRows.map((row) => row.expectedWins)) ?? 0,
    avgMakuuchiTailAbility: avg(allRows.filter((row) => isMakuuchiTail(row.rank)).map((row) => row.ability)) ?? 0,
    avgJuryoUpperAbility: avg(allRows.filter((row) => isJuryoUpper(row.rank)).map((row) => row.ability)) ?? 0,
    avgMakuuchiTailSeasonalAbility: avg(allRows.filter((row) => isMakuuchiTail(row.rank)).map((row) => row.seasonalAbility)) ?? 0,
    avgJuryoUpperSeasonalAbility: avg(allRows.filter((row) => isJuryoUpper(row.rank)).map((row) => row.seasonalAbility)) ?? 0,
    promotedMakuuchiKyujoShare: round2(promotedMakuuchiRows.filter((row) => row.kyujo).length / Math.max(1, promotedMakuuchiRows.length)),
  };

  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'juryo_makuuchi_elevator_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seeds: SEEDS, summaries, causes, cycles, rows: allRows, diagnostics: allDiagnostics }, null, 2),
  );
  writeMarkdown(outDir, { rows: allRows, cycles, summaries, causes });
  writeAudit(outDir, causes);

  console.log(`Juryo-Makuuchi elevator diagnostics — basho=${BASHO} seeds=${SEEDS.join(',')}`);
  for (const [key, value] of Object.entries(summaries)) {
    console.log(`  ${key}: ${value}`);
  }
  console.log(`  causes: ${causes.join(' / ')}`);
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
