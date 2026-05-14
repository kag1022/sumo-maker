#!/usr/bin/env npx tsx
/**
 * プレイヤー / NPC の休場率を小さい母数で素早く見る軽量診断。
 *
 * 重い world 横断診断の代替ではなく、調整前後の smoke check 用。
 * 既定では通常プレイヤー条件で 8 キャリア × 最大 60 場所だけ走らせる。
 *
 * Usage:
 *   npx tsx scripts/dev/diagnosePlayerNpcKyujoLight.ts
 *   npx tsx scripts/dev/diagnosePlayerNpcKyujoLight.ts --careers 12 --max-basho 72 --seed 20260514
 *   npx tsx scripts/dev/diagnosePlayerNpcKyujoLight.ts --ironman-player
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import type { Division } from '../../src/logic/models';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';

const args = process.argv.slice(2);

const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};

const argFlag = (flag: string): boolean => args.includes(flag);

const positionalInt = (index: number, def: number): number => {
  const positional = args.filter((value) => !value.startsWith('--'));
  const parsed = parseInt(positional[index] ?? '', 10);
  return Number.isFinite(parsed) ? parsed : def;
};

const CAREERS = argInt('--careers', positionalInt(0, 8));
const MAX_BASHO = argInt('--max-basho', positionalInt(1, 60));
const SEED = argInt('--seed', positionalInt(2, 20260514));
const IRONMAN_PLAYER = argFlag('--ironman-player');
const REPORT_PATH = path.join('docs', 'design', 'player_npc_kyujo_light_diagnostics.md');
const JSON_PATH = path.join('docs', 'design', 'player_npc_kyujo_light_diagnostics.json');
const REAL_REFERENCE_PATH = path.join('sumo-db', 'data', 'analysis', 'realism_reference_heisei.json');

interface KyujoMetrics {
  appearances: number;
  fullAttendance: number;
  partialKyujo: number;
  fullKyujo: number;
  absent1To3: number;
  absent4To7: number;
  absent8To14: number;
  absent15Plus: number;
}

interface KyujoRates extends KyujoMetrics {
  fullAttendanceRate: number;
  partialKyujoRate: number;
  fullKyujoRate: number;
  anyKyujoRate: number;
}

interface RealHistogramCell {
  w: number;
  l: number;
  a: number;
  n: number;
  p: number;
}

interface RealReference {
  recordHistogramByDivision: Partial<Record<Division, {
    total: number;
    cells: RealHistogramCell[];
  }>>;
}

type GroupKey =
  | 'playerOverall'
  | 'playerSekitori'
  | 'playerLower'
  | 'npcOverall'
  | 'npcSekitori'
  | 'npcLower';

const zeroMetrics = (): KyujoMetrics => ({
  appearances: 0,
  fullAttendance: 0,
  partialKyujo: 0,
  fullKyujo: 0,
  absent1To3: 0,
  absent4To7: 0,
  absent8To14: 0,
  absent15Plus: 0,
});

const scheduledBouts = (division: Division): number =>
  division === 'Makuuchi' || division === 'Juryo' ? 15 :
    division === 'Maezumo' ? 3 : 7;

const isSekitori = (division: Division): boolean =>
  division === 'Makuuchi' || division === 'Juryo';

const addAbsentBucket = (metrics: KyujoMetrics, absent: number): void => {
  if (absent >= 15) metrics.absent15Plus += 1;
  else if (absent >= 8) metrics.absent8To14 += 1;
  else if (absent >= 4) metrics.absent4To7 += 1;
  else if (absent >= 1) metrics.absent1To3 += 1;
};

const addAppearance = (
  metrics: KyujoMetrics,
  division: Division,
  absent: number,
): void => {
  const bouts = scheduledBouts(division);
  metrics.appearances += 1;
  addAbsentBucket(metrics, absent);

  if (absent <= 0) {
    metrics.fullAttendance += 1;
  } else if (absent >= bouts) {
    metrics.fullKyujo += 1;
  } else {
    metrics.partialKyujo += 1;
  }
};

const rates = (metrics: KyujoMetrics): KyujoRates => {
  const denominator = Math.max(1, metrics.appearances);
  return {
    ...metrics,
    fullAttendanceRate: metrics.fullAttendance / denominator,
    partialKyujoRate: metrics.partialKyujo / denominator,
    fullKyujoRate: metrics.fullKyujo / denominator,
    anyKyujoRate: (metrics.partialKyujo + metrics.fullKyujo) / denominator,
  };
};

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

const deltaPt = (actual: number, baseline: number): string => {
  const delta = (actual - baseline) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pt`;
};

const summarizeReal = (
  reference: RealReference,
  divisionFilter: (division: Division) => boolean,
): KyujoRates => {
  const metrics = zeroMetrics();
  for (const [division, histogram] of Object.entries(reference.recordHistogramByDivision)) {
    const typedDivision = division as Division;
    if (!histogram || !divisionFilter(typedDivision)) continue;
    for (const cell of histogram.cells) {
      for (let i = 0; i < cell.n; i += 1) {
        addAppearance(metrics, typedDivision, cell.a);
      }
    }
  }
  return rates(metrics);
};

const loadRealReference = (): {
  overall: KyujoRates;
  sekitori: KyujoRates;
  lower: KyujoRates;
} => {
  const reference = JSON.parse(fs.readFileSync(REAL_REFERENCE_PATH, 'utf8')) as RealReference;
  return {
    overall: summarizeReal(reference, () => true),
    sekitori: summarizeReal(reference, isSekitori),
    lower: summarizeReal(reference, (division) => !isSekitori(division)),
  };
};

const runCareer = async (
  seed: number,
  metricsByGroup: Record<GroupKey, KyujoMetrics>,
): Promise<number> => {
  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `player-npc-kyujo-light-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
      progressSnapshotMode: 'lite',
      bashoSnapshotMode: 'none',
      __dev_ironmanPlayer: IRONMAN_PLAYER || undefined,
    },
    {
      random: createSeededRandom(seed + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  let bashoCount = 0;
  for (let b = 0; b < MAX_BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    bashoCount += 1;

    const playerDivision = step.playerRecord.rank.division;
    addAppearance(metricsByGroup.playerOverall, playerDivision, step.playerRecord.absent);
    addAppearance(
      isSekitori(playerDivision) ? metricsByGroup.playerSekitori : metricsByGroup.playerLower,
      playerDivision,
      step.playerRecord.absent,
    );

    for (const record of step.npcBashoRecords) {
      addAppearance(metricsByGroup.npcOverall, record.division, record.absent);
      addAppearance(
        isSekitori(record.division) ? metricsByGroup.npcSekitori : metricsByGroup.npcLower,
        record.division,
        record.absent,
      );
    }
  }
  return bashoCount;
};

const row = (
  label: string,
  actual: KyujoRates,
  baseline: KyujoRates,
): string =>
  `| ${label} | ${actual.appearances} | ${pct(actual.partialKyujoRate)} | ${pct(actual.fullKyujoRate)} | ${pct(actual.anyKyujoRate)} | ${pct(baseline.anyKyujoRate)} | ${deltaPt(actual.anyKyujoRate, baseline.anyKyujoRate)} |`;

const bucketRow = (
  label: string,
  actual: KyujoRates,
): string => {
  const denominator = Math.max(1, actual.appearances);
  return `| ${label} | ${actual.appearances} | ${actual.absent1To3} (${pct(actual.absent1To3 / denominator)}) | ${actual.absent4To7} (${pct(actual.absent4To7 / denominator)}) | ${actual.absent8To14} (${pct(actual.absent8To14 / denominator)}) | ${actual.absent15Plus} (${pct(actual.absent15Plus / denominator)}) |`;
};

const renderReport = (
  payload: {
    generatedAt: string;
    careers: number;
    maxBasho: number;
    seed: number;
    ironmanPlayer: boolean;
    completedBasho: number;
    real: ReturnType<typeof loadRealReference>;
    groups: Record<GroupKey, KyujoRates>;
  },
): string => [
  '# Player / NPC kyujo light diagnostics',
  '',
  `Generated by \`scripts/dev/diagnosePlayerNpcKyujoLight.ts\` on ${payload.generatedAt}.`,
  '',
  '## Settings',
  '',
  `- careers: ${payload.careers}`,
  `- maxBashoPerCareer: ${payload.maxBasho}`,
  `- completedBasho: ${payload.completedBasho}`,
  `- seed: ${payload.seed}`,
  `- ironmanPlayer: ${payload.ironmanPlayer}`,
  '',
  '## Summary',
  '',
  '| group | appearances | partial | full | any kyujo | real baseline any | delta |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  row('Player overall', payload.groups.playerOverall, payload.real.overall),
  row('Player sekitori', payload.groups.playerSekitori, payload.real.sekitori),
  row('Player lower', payload.groups.playerLower, payload.real.lower),
  row('NPC overall', payload.groups.npcOverall, payload.real.overall),
  row('NPC sekitori', payload.groups.npcSekitori, payload.real.sekitori),
  row('NPC lower', payload.groups.npcLower, payload.real.lower),
  '',
  '## Absent Day Buckets',
  '',
  '| group | appearances | 1-3休 | 4-7休 | 8-14休 | 15休以上 |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  bucketRow('Real overall', payload.real.overall),
  bucketRow('Real sekitori', payload.real.sekitori),
  bucketRow('Real lower', payload.real.lower),
  bucketRow('Player overall', payload.groups.playerOverall),
  bucketRow('Player sekitori', payload.groups.playerSekitori),
  bucketRow('Player lower', payload.groups.playerLower),
  bucketRow('NPC overall', payload.groups.npcOverall),
  bucketRow('NPC sekitori', payload.groups.npcSekitori),
  bucketRow('NPC lower', payload.groups.npcLower),
  '',
  '## Reading',
  '',
  '- これは smoke check 用で、acceptance 判定ではない。',
  '- `Player sekitori` は軽量実行では母数が小さくなりやすい。',
  '- `ironmanPlayer: false` が通常プレイヤー条件。長期の NPC 世界観測をしたい場合だけ `--ironman-player` を使う。',
  '- NPC overall は下位力士の母数で関取差分を隠すため、必ず `NPC sekitori` と `NPC lower` を分けて読む。',
  '',
].join('\n');

const main = async (): Promise<void> => {
  const real = loadRealReference();
  const metricsByGroup: Record<GroupKey, KyujoMetrics> = {
    playerOverall: zeroMetrics(),
    playerSekitori: zeroMetrics(),
    playerLower: zeroMetrics(),
    npcOverall: zeroMetrics(),
    npcSekitori: zeroMetrics(),
    npcLower: zeroMetrics(),
  };

  let completedBasho = 0;
  for (let i = 0; i < CAREERS; i += 1) {
    const careerSeed = SEED + i * 1009;
    completedBasho += await runCareer(careerSeed, metricsByGroup);
    console.log(`kyujo light: completed career ${i + 1}/${CAREERS}`);
  }

  const groups = Object.fromEntries(
    Object.entries(metricsByGroup).map(([key, metrics]) => [key, rates(metrics)]),
  ) as Record<GroupKey, KyujoRates>;
  const payload = {
    generatedAt: new Date().toISOString(),
    careers: CAREERS,
    maxBasho: MAX_BASHO,
    seed: SEED,
    ironmanPlayer: IRONMAN_PLAYER,
    completedBasho,
    real,
    groups,
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(payload, null, 2), 'utf8');
  fs.writeFileSync(REPORT_PATH, renderReport(payload), 'utf8');
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Wrote ${JSON_PATH}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
