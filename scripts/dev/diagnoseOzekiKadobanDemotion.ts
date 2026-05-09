#!/usr/bin/env npx tsx
/**
 * 大関のカド番・陥落・関脇落ち後復帰の制度的な流れを診断する。
 */

import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { listEraSnapshots } from '../../src/logic/era/eraSnapshot';
import type { EraSnapshot, EraTag } from '../../src/logic/era/types';
import { createSeededRandom } from '../../src/logic/simulation/engine';
import { createSimulationRuntime } from '../../src/logic/simulation/runtime';

const args = process.argv.slice(2);

const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};

const BASHO = argInt('--basho', 24);
const SEED = argInt('--seed', 20260416);

type WorldKind = 'legacy' | EraTag;

interface OzekiRecord {
  basho: number;
  id: string;
  shikona: string;
  wins: number;
  losses: number;
  absent: number;
  onDohyoMakekoshi: boolean;
  banzukeMakekoshi: boolean;
  onDohyoSevere: boolean;
  banzukeSevere: boolean;
  wasKadoban: boolean;
  nextRankName: string | null;
  nextIsKadoban: boolean;
  nextIsOzekiReturn: boolean;
  demotedToSekiwake: boolean;
  stayedOzeki: boolean;
  retiredAfterBasho: boolean;
}

interface SekiwakeReturnRecord {
  basho: number;
  id: string;
  shikona: string;
  wins: number;
  losses: number;
  absent: number;
  wasOzekiReturn: boolean;
  returnCandidate10Wins: boolean;
  actualReturn: boolean;
}

interface WorldDiagnostic {
  label: string;
  eraSnapshotId: string | null;
  publicEraLabel: string | null;
  eraTags: string[];
  initialOzekiCount: number;
  ozekiCountsByBasho: number[];
  ozekiRecords: OzekiRecord[];
  sekiwakeReturnRecords: SekiwakeReturnRecord[];
  kadobanCarryMisses: number;
  ozekiReturnCarryMisses: number;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

const isOnDohyoMakekoshi = (wins: number, losses: number): boolean => wins < losses;

const isBanzukeMakekoshi = (wins: number, losses: number, absent: number): boolean =>
  wins < losses + absent + Math.max(0, 15 - (wins + losses + absent));

const isOnDohyoSevere = (wins: number, losses: number): boolean => {
  const total = wins + losses;
  return total > 0 && wins / total <= 0.35;
};

const isBanzukeSevere = (wins: number, losses: number, absent: number): boolean => {
  const effectiveLosses = losses + absent + Math.max(0, 15 - (wins + losses + absent));
  const total = wins + effectiveLosses;
  return total > 0 && wins / total <= 0.35;
};

const pickSnapshotByTag = (tag: EraTag, usedIds: Set<string>): EraSnapshot | undefined =>
  listEraSnapshots().find((snapshot) => snapshot.eraTags.includes(tag) && !usedIds.has(snapshot.id));

const buildWorldSpecs = (): Array<{ kind: WorldKind; snapshot?: EraSnapshot }> => {
  const usedIds = new Set<string>();
  const out: Array<{ kind: WorldKind; snapshot?: EraSnapshot }> = [{ kind: 'legacy' }];
  for (const tag of ['ozeki_crowded', 'yokozuna_stable', 'top_division_turbulent', 'balanced_era'] as EraTag[]) {
    const snapshot = pickSnapshotByTag(tag, usedIds);
    if (!snapshot) continue;
    usedIds.add(snapshot.id);
    out.push({ kind: tag, snapshot });
  }
  return out;
};

const runWorld = async (
  spec: { kind: WorldKind; snapshot?: EraSnapshot },
): Promise<WorldDiagnostic> => {
  const initial = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(SEED));
  const label = spec.kind === 'legacy'
    ? 'legacy (undefined)'
    : `era:${spec.snapshot?.publicEraLabel} (${spec.snapshot?.id})`;
  const runtime = createSimulationRuntime(
    {
      initialStats: initial,
      oyakata: null,
      careerId: `ozeki-kadoban-diag-${spec.kind}-${SEED}`,
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
      random: createSeededRandom(SEED + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  const initialWorld = runtime.__getWorldForDiagnostics();
  const initialOzekiCount = initialWorld.rosters.Makuuchi
    .filter((row) => row.rankScore > initialWorld.makuuchiLayout.yokozuna)
    .filter((row) => row.rankScore <= initialWorld.makuuchiLayout.yokozuna + initialWorld.makuuchiLayout.ozeki)
    .length;
  const ozekiRecords: OzekiRecord[] = [];
  const sekiwakeReturnRecords: SekiwakeReturnRecord[] = [];
  const ozekiCountsByBasho: number[] = [];
  let kadobanAtBashoStart = new Set<string>();
  let ozekiReturnAtBashoStart = new Set<string>();
  let kadobanCarryMisses = 0;
  let ozekiReturnCarryMisses = 0;

  for (let b = 0; b < BASHO; b += 1) {
    const step = await runtime.runNextSeasonStep();
    if (step.kind === 'COMPLETED') break;
    const world = runtime.__getWorldForDiagnostics();
    const allocationById = new Map(world.lastAllocations.map((allocation) => [allocation.id, allocation]));
    const makuuchiResults = world.lastBashoResults.Makuuchi ?? [];
    const materializedKadoban = new Set<string>();
    const materializedOzekiReturn = new Set<string>();
    ozekiCountsByBasho.push(
      makuuchiResults.filter((result) => result.rank.name === '大関').length,
    );

    for (const result of makuuchiResults) {
      const allocation = allocationById.get(result.id);
      const actor = world.actorRegistry.get(result.id);
      if (result.rank.name === '大関') {
        if (kadobanAtBashoStart.has(result.id)) materializedKadoban.add(result.id);
        ozekiRecords.push({
          basho: b + 1,
          id: result.id,
          shikona: result.shikona,
          wins: result.wins,
          losses: result.losses,
          absent: result.absent,
          onDohyoMakekoshi: isOnDohyoMakekoshi(result.wins, result.losses),
          banzukeMakekoshi: isBanzukeMakekoshi(result.wins, result.losses, result.absent),
          onDohyoSevere: isOnDohyoSevere(result.wins, result.losses),
          banzukeSevere: isBanzukeSevere(result.wins, result.losses, result.absent),
          wasKadoban: kadobanAtBashoStart.has(result.id),
          nextRankName: allocation?.nextRank.name ?? null,
          nextIsKadoban: allocation?.nextIsOzekiKadoban ?? false,
          nextIsOzekiReturn: allocation?.nextIsOzekiReturn ?? false,
          demotedToSekiwake: allocation?.nextRank.division === 'Makuuchi' && allocation.nextRank.name === '関脇',
          stayedOzeki: allocation?.nextRank.division === 'Makuuchi' && allocation.nextRank.name === '大関',
          retiredAfterBasho: actor?.active === false,
        });
      }

      if (result.rank.name === '関脇') {
        const wasOzekiReturn = ozekiReturnAtBashoStart.has(result.id);
        if (wasOzekiReturn) materializedOzekiReturn.add(result.id);
        const returnCandidate10Wins = wasOzekiReturn && result.wins >= 10;
        sekiwakeReturnRecords.push({
          basho: b + 1,
          id: result.id,
          shikona: result.shikona,
          wins: result.wins,
          losses: result.losses,
          absent: result.absent,
          wasOzekiReturn,
          returnCandidate10Wins,
          actualReturn:
            allocation?.nextRank.division === 'Makuuchi' &&
            allocation.nextRank.name === '大関',
        });
      }
    }
    kadobanCarryMisses += [...kadobanAtBashoStart]
      .filter((id) => !materializedKadoban.has(id)).length;
    ozekiReturnCarryMisses += [...ozekiReturnAtBashoStart]
      .filter((id) => !materializedOzekiReturn.has(id)).length;
    kadobanAtBashoStart = new Set(
      world.lastAllocations
        .filter((allocation) => allocation.nextIsOzekiKadoban)
        .map((allocation) => allocation.id),
    );
    ozekiReturnAtBashoStart = new Set(
      world.lastAllocations
        .filter((allocation) => allocation.nextIsOzekiReturn)
        .map((allocation) => allocation.id),
    );
  }

  return {
    label,
    eraSnapshotId: spec.snapshot?.id ?? null,
    publicEraLabel: spec.snapshot?.publicEraLabel ?? null,
    eraTags: spec.snapshot?.eraTags ?? [],
    initialOzekiCount,
    ozekiCountsByBasho,
    ozekiRecords,
    sekiwakeReturnRecords,
    kadobanCarryMisses,
    ozekiReturnCarryMisses,
  };
};

const summarizeWorld = (world: WorldDiagnostic) => {
  const n = world.ozekiRecords.length;
  const count = (predicate: (record: OzekiRecord) => boolean): number =>
    world.ozekiRecords.filter(predicate).length;
  const kadobanEntries = count((r) => r.nextIsKadoban);
  const kadobanBasho = world.ozekiRecords.filter((r) => r.wasKadoban);
  const kadobanSurvival = kadobanBasho.filter((r) => r.stayedOzeki && !r.nextIsOzekiReturn).length;
  const kadobanFailure = kadobanBasho.filter((r) => r.demotedToSekiwake || r.nextIsOzekiReturn).length;
  const returnWindow = world.sekiwakeReturnRecords.filter((r) => r.wasOzekiReturn);
  const returnCandidates = returnWindow.filter((r) => r.returnCandidate10Wins).length;
  const actualReturns = returnWindow.filter((r) => r.actualReturn).length;
  const avgOzekiCount = world.ozekiCountsByBasho.length === 0
    ? 0
    : round3(world.ozekiCountsByBasho.reduce((sum, value) => sum + value, 0) / world.ozekiCountsByBasho.length);

  return {
    label: world.label,
    eraSnapshotId: world.eraSnapshotId,
    publicEraLabel: world.publicEraLabel,
    eraTags: world.eraTags,
    initialOzekiCount: world.initialOzekiCount,
    avgOzekiCount,
    ozekiRankOccurrences: n,
    onDohyoMakekoshi: count((r) => r.onDohyoMakekoshi),
    banzukeMakekoshi: count((r) => r.banzukeMakekoshi),
    onDohyoSevere: count((r) => r.onDohyoSevere),
    banzukeSevere: count((r) => r.banzukeSevere),
    absentCount: count((r) => r.absent > 0),
    kadobanEntries,
    kadobanCarryMisses: world.kadobanCarryMisses,
    kadobanBashoCount: kadobanBasho.length,
    kadobanSurvival,
    kadobanFailure,
    ozekiDemotionCount: count((r) => r.demotedToSekiwake),
    demotedToSekiwakeCount: count((r) => r.nextIsOzekiReturn),
    sekiwakeOzekiReturnWindows: returnWindow.length,
    ozekiReturnCarryMisses: world.ozekiReturnCarryMisses,
    sekiwake10PlusAfterDemotion: returnCandidates,
    actualOzekiReturnCount: actualReturns,
    ozekiRetireCount: count((r) => r.retiredAfterBasho),
    rates: {
      onDohyoMakekoshi: n === 0 ? 0 : round3(count((r) => r.onDohyoMakekoshi) / n),
      banzukeMakekoshi: n === 0 ? 0 : round3(count((r) => r.banzukeMakekoshi) / n),
      onDohyoSevere: n === 0 ? 0 : round3(count((r) => r.onDohyoSevere) / n),
      banzukeSevere: n === 0 ? 0 : round3(count((r) => r.banzukeSevere) / n),
      kadobanSurvival:
        kadobanBasho.length === 0 ? 0 : round3(kadobanSurvival / kadobanBasho.length),
      kadobanFailure:
        kadobanBasho.length === 0 ? 0 : round3(kadobanFailure / kadobanBasho.length),
      actualReturn:
        returnWindow.length === 0 ? 0 : round3(actualReturns / returnWindow.length),
    },
  };
};

const main = async (): Promise<void> => {
  const diagnostics: WorldDiagnostic[] = [];
  for (const spec of buildWorldSpecs()) {
    diagnostics.push(await runWorld(spec));
  }
  const summaries = diagnostics.map(summarizeWorld);
  const outDir = path.resolve('docs/design');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'ozeki_kadoban_demotion_diagnostics.json'),
    JSON.stringify({ basho: BASHO, seed: SEED, summaries, raw: diagnostics }, null, 2),
  );

  console.log(`Ozeki kadoban/demotion diagnostics — basho=${BASHO} seed=${SEED}`);
  for (const summary of summaries) {
    console.log('');
    console.log(`=== ${summary.label} ===`);
    if (summary.eraTags.length > 0) console.log(`  eraTags=${summary.eraTags.join(',')}`);
    console.log(
      `  ozeki count initial=${summary.initialOzekiCount} avg=${summary.avgOzekiCount} occurrences=${summary.ozekiRankOccurrences}`,
    );
    console.log(
      `  makekoshi onDohyo=${summary.onDohyoMakekoshi}/${summary.ozekiRankOccurrences} (${summary.rates.onDohyoMakekoshi}) banzuke=${summary.banzukeMakekoshi}/${summary.ozekiRankOccurrences} (${summary.rates.banzukeMakekoshi}) absent=${summary.absentCount}`,
    );
    console.log(
      `  severe onDohyo=${summary.onDohyoSevere}/${summary.ozekiRankOccurrences} (${summary.rates.onDohyoSevere}) banzuke=${summary.banzukeSevere}/${summary.ozekiRankOccurrences} (${summary.rates.banzukeSevere})`,
    );
    console.log(
      `  kadoban entries=${summary.kadobanEntries} windows=${summary.kadobanBashoCount} carryMiss=${summary.kadobanCarryMisses} survival=${summary.kadobanSurvival} (${summary.rates.kadobanSurvival}) failure=${summary.kadobanFailure} (${summary.rates.kadobanFailure}) demotions=${summary.ozekiDemotionCount}`,
    );
    console.log(
      `  return windows=${summary.sekiwakeOzekiReturnWindows} carryMiss=${summary.ozekiReturnCarryMisses} 10+wins=${summary.sekiwake10PlusAfterDemotion} actualReturns=${summary.actualOzekiReturnCount} (${summary.rates.actualReturn}) retire=${summary.ozekiRetireCount}`,
    );
  }

  const lines: string[] = [
    '# Ozeki kadoban / demotion diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseOzekiKadobanDemotion.ts\` (basho=${BASHO}, seed=${SEED}).`,
    '',
    '## Summary',
    '',
    '| world | tags | initial O | avg O | O n | MK dohyo | MK banzuke | severe dohyo | severe banzuke | absent | kadoban entries | kadoban windows | kadoban carry miss | kadoban survival | kadoban failure | demotion | return windows | return carry miss | 10+ return candidates | actual returns |',
    '| --- | --- | ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:| ---:|',
  ];
  for (const summary of summaries) {
    lines.push(
      `| ${summary.label} | ${summary.eraTags.join(', ') || '-'} | ${summary.initialOzekiCount} | ${summary.avgOzekiCount} | ${summary.ozekiRankOccurrences} | ${summary.onDohyoMakekoshi} (${summary.rates.onDohyoMakekoshi}) | ${summary.banzukeMakekoshi} (${summary.rates.banzukeMakekoshi}) | ${summary.onDohyoSevere} (${summary.rates.onDohyoSevere}) | ${summary.banzukeSevere} (${summary.rates.banzukeSevere}) | ${summary.absentCount} | ${summary.kadobanEntries} | ${summary.kadobanBashoCount} | ${summary.kadobanCarryMisses} | ${summary.kadobanSurvival} (${summary.rates.kadobanSurvival}) | ${summary.kadobanFailure} (${summary.rates.kadobanFailure}) | ${summary.ozekiDemotionCount} | ${summary.sekiwakeOzekiReturnWindows} | ${summary.ozekiReturnCarryMisses} | ${summary.sekiwake10PlusAfterDemotion} | ${summary.actualOzekiReturnCount} (${summary.rates.actualReturn}) |`,
    );
  }
  lines.push('');
  lines.push('## Definitions');
  lines.push('');
  lines.push('- `MK dohyo`: `wins < losses`。休場を負けに混ぜない土俵上の負け越し。');
  lines.push('- `MK banzuke`: `wins < losses + absent + unfilled bouts`。番付処理上の有効負け越し。');
  lines.push('- `severe dohyo`: 土俵上の勝率 `wins / (wins + losses) <= 0.35`。');
  lines.push('- `severe banzuke`: 休場・未消化を有効敗扱いした勝率 `<= 0.35`。');
  lines.push('- `kadoban entries`: 当場所大関が次場所カド番になる件数。');
  lines.push('- `return windows`: 大関から関脇へ落ち、特例復帰チャンスを持つ関脇場所。');
  fs.writeFileSync(path.join(outDir, 'ozeki_kadoban_demotion_diagnostics.md'), lines.join('\n'));
  console.log('');
  console.log(`Wrote diagnostics JSON + MD under ${outDir}`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
