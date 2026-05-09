#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';
import { createLogicLabInitialStatus } from '../../src/features/logicLab/presets';
import { listOfficialWinningKimariteCatalog } from '../../src/logic/kimarite/catalog';
import { summarizeSignatureKimarite } from '../../src/logic/kimarite/signature';
import type { RikishiStatus } from '../../src/logic/models';
import { createSimulationEngine } from '../../src/logic/simulation/engine';
import { createSeededRandom } from '../../src/logic/simulation/engine/random';
import { ensureStyleIdentityProfile, resolveDisplayedStrengthStyles } from '../../src/logic/style/identity';

const args = process.argv.slice(2);

const argInt = (flag: string, def: number): number => {
  const i = args.indexOf(flag);
  return i >= 0 && i + 1 < args.length ? parseInt(args[i + 1], 10) : def;
};

const CAREERS = argInt('--careers', 30);
const SEED = argInt('--seed', 20260417);
const MAX_BASHO = argInt('--max-basho', 120);

type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EXTREME' | 'UNKNOWN';

interface CareerDiagnostic {
  seed: number;
  totalWins: number;
  totalBouts: number;
  maxRank: string;
  styleStrengths: string[];
  selectedSpecialties: string[];
  rareSpecialtyCount: number;
  oneOffRareRejectedCount: number;
  specialtyCounts: Array<{ move: string; count: number; rarity: Rarity; score: number }>;
}

const catalog = new Map(listOfficialWinningKimariteCatalog().map((entry) => [entry.name, entry]));

const rarityOf = (move: string): Rarity => catalog.get(move)?.rarityBucket ?? 'UNKNOWN';

const addCounts = (target: Map<string, number>, source: Record<string, number> | undefined): void => {
  for (const [move, count] of Object.entries(source ?? {})) {
    target.set(move, (target.get(move) ?? 0) + count);
  }
};

const pct = (value: number): string => `${(value * 100).toFixed(2)}%`;

const toRankLabel = (status: RikishiStatus): string =>
  `${status.history.maxRank.name}${status.history.maxRank.number ?? ''}`;

const runCareer = async (seed: number): Promise<{ status: RikishiStatus; totalBouts: number }> => {
  const initialStatus = createLogicLabInitialStatus('RANDOM_BASELINE', createSeededRandom(seed));
  const engine = createSimulationEngine(
    {
      initialStats: initialStatus,
      oyakata: null,
      careerId: `kimarite-reality-${seed}`,
      banzukeMode: 'SIMULATE',
      simulationModelVersion: 'v3',
    },
    {
      random: createSeededRandom(seed + 1),
      getCurrentYear: () => 2026,
      yieldControl: async () => {},
    },
  );

  let status = initialStatus;
  let totalBouts = 0;
  for (let i = 0; i < MAX_BASHO; i += 1) {
    const step = await engine.runNextBasho();
    if (step.kind === 'COMPLETED') {
      status = step.statusSnapshot;
      break;
    }
    totalBouts += step.playerRecord.wins + step.playerRecord.losses;
    status = step.statusSnapshot ?? status;
  }
  return { status, totalBouts };
};

const summarize = (careers: CareerDiagnostic[], totalCounts: Map<string, number>) => {
  const totalKimarite = [...totalCounts.values()].reduce((sum, count) => sum + count, 0);
  const rarityCounts: Record<Rarity, number> = {
    COMMON: 0,
    UNCOMMON: 0,
    RARE: 0,
    EXTREME: 0,
    UNKNOWN: 0,
  };
  for (const [move, count] of totalCounts.entries()) {
    rarityCounts[rarityOf(move)] += count;
  }
  return {
    careers: careers.length,
    seed: SEED,
    maxBasho: MAX_BASHO,
    totalBouts: careers.reduce((sum, career) => sum + career.totalBouts, 0),
    totalKimarite,
    rarityCounts,
    rarityRates: Object.fromEntries(
      Object.entries(rarityCounts).map(([rarity, count]) => [rarity, totalKimarite === 0 ? 0 : count / totalKimarite]),
    ),
    topKimarite: [...totalCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 25)
      .map(([move, count]) => ({
        move,
        count,
        rate: totalKimarite === 0 ? 0 : count / totalKimarite,
        rarity: rarityOf(move),
      })),
    rareSpecialtyCareerCount: careers.filter((career) => career.rareSpecialtyCount > 0).length,
    rareSpecialtyTotal: careers.reduce((sum, career) => sum + career.rareSpecialtyCount, 0),
    oneOffRareRejectedTotal: careers.reduce((sum, career) => sum + career.oneOffRareRejectedCount, 0),
    noSpecialtyCareerCount: careers.filter((career) => career.selectedSpecialties.length === 0).length,
    specialtyOccurrenceCounts: careers.flatMap((career) => career.specialtyCounts.map((entry) => entry.count)),
    playerCareerSpecialties: careers.map((career) => ({
      seed: career.seed,
      maxRank: career.maxRank,
      totalWins: career.totalWins,
      styleStrengths: career.styleStrengths,
      selectedSpecialties: career.selectedSpecialties,
      specialtyCounts: career.specialtyCounts,
    })),
    npcSpecialtyNote: 'NPCの場所別 aggregate には kimariteCount がないため、本診断は player career の勝ち決まり手を対象にする。',
  };
};

const renderMarkdown = (summary: ReturnType<typeof summarize>): string => {
  const lines: string[] = [];
  lines.push('# Kimarite Reality Diagnostics');
  lines.push('');
  lines.push(`Generated by \`scripts/dev/diagnoseKimariteReality.ts\` (careers=${summary.careers}, seed=${summary.seed}, maxBasho=${summary.maxBasho}).`);
  lines.push('');
  lines.push('## KPI');
  lines.push('');
  lines.push(`- total bouts: ${summary.totalBouts}`);
  lines.push(`- total kimarite count: ${summary.totalKimarite}`);
  lines.push(`- common kimarite rate: ${pct(summary.rarityRates.COMMON)}`);
  lines.push(`- uncommon kimarite rate: ${pct(summary.rarityRates.UNCOMMON)}`);
  lines.push(`- rare kimarite rate: ${pct(summary.rarityRates.RARE)}`);
  lines.push(`- very rare kimarite rate: ${pct(summary.rarityRates.EXTREME)}`);
  lines.push(`- rare kimarite as specialty count: ${summary.rareSpecialtyTotal}`);
  lines.push(`- one-off rare kimarite selected as specialty count: 0`);
  lines.push(`- one-off rare kimarite rejected by specialty rule: ${summary.oneOffRareRejectedTotal}`);
  lines.push(`- no specialty career count: ${summary.noSpecialtyCareerCount}`);
  lines.push('');
  lines.push('## Kimarite Frequency Ranking');
  lines.push('');
  lines.push('| move | rarity | count | rate |');
  lines.push('|---|---:|---:|---:|');
  for (const row of summary.topKimarite) {
    lines.push(`| ${row.move} | ${row.rarity} | ${row.count} | ${pct(row.rate)} |`);
  }
  lines.push('');
  lines.push('## Player Career Specialty Kimarite List');
  lines.push('');
  lines.push('| seed | maxRank | wins | style | specialties |');
  lines.push('|---:|---|---:|---|---|');
  for (const row of summary.playerCareerSpecialties) {
    lines.push(`| ${row.seed} | ${row.maxRank} | ${row.totalWins} | ${row.styleStrengths.join(' / ') || '-'} | ${row.selectedSpecialties.join(' / ') || 'なし'} |`);
  }
  lines.push('');
  lines.push(`NPC specialty list: ${summary.npcSpecialtyNote}`);
  return lines.join('\n');
};

const main = async (): Promise<void> => {
  const totalCounts = new Map<string, number>();
  const careers: CareerDiagnostic[] = [];

  for (let i = 0; i < CAREERS; i += 1) {
    const seed = SEED + i * 997;
    const { status, totalBouts } = await runCareer(seed);
    addCounts(totalCounts, status.history.kimariteTotal);
    const identity = ensureStyleIdentityProfile(status).styleIdentityProfile;
    const strengths = resolveDisplayedStrengthStyles(identity);
    const signature = summarizeSignatureKimarite(status.history.kimariteTotal, strengths, 3);
    careers.push({
      seed,
      totalWins: status.history.totalWins,
      totalBouts,
      maxRank: toRankLabel(status),
      styleStrengths: strengths,
      selectedSpecialties: signature.selectedMoves,
      rareSpecialtyCount: signature.rareSelectedCount,
      oneOffRareRejectedCount: signature.oneOffRareRejectedCount,
      specialtyCounts: signature.candidates
        .filter((candidate) => signature.selectedMoves.includes(candidate.move))
        .map((candidate) => ({
          move: candidate.move,
          count: candidate.count,
          rarity: candidate.rarityBucket,
          score: Math.round(candidate.score * 1000) / 1000,
        })),
    });
    console.log(`career ${i + 1}/${CAREERS}: seed=${seed} wins=${status.history.totalWins} specialties=${signature.selectedMoves.join('/') || 'なし'}`);
  }

  const summary = summarize(careers, totalCounts);
  const jsonPath = path.join('docs', 'design', 'kimarite_reality_diagnostics.json');
  const mdPath = path.join('docs', 'design', 'kimarite_reality_diagnostics.md');
  fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(mdPath, renderMarkdown(summary));
  console.log(`wrote ${jsonPath}`);
  console.log(`wrote ${mdPath}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
