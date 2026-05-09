import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runLogicLabToEnd } from '../../src/features/logicLab/runner';
import type { LogicLabPresetId } from '../../src/features/logicLab/types';
import {
  type KimariteRarityBucket,
  findOfficialKimariteEntry,
  findCollectionKimariteEntry,
  normalizeKimariteName,
  OFFICIAL_WIN_KIMARITE_82,
} from '../../src/logic/kimarite/catalog';
import { summarizeRareKimariteEncounters } from '../../src/logic/kimarite/rareEncounters';
import { findKimariteRealdataFrequency, KIMARITE_REALDATA_FREQUENCY } from '../../src/logic/kimarite/realdata';
import { summarizeSignatureKimarite } from '../../src/logic/kimarite/signature';

interface CliOptions {
  careers: number;
  seed: number;
}

interface MoveCount {
  move: string;
  count: number;
  rate: number;
  rarity: KimariteRarityBucket | 'UNKNOWN';
  observedCount?: number;
  observedRate?: number;
  ratioToReal?: number;
}

const parseIntArg = (name: string, fallback: number): number => {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const OPTIONS: CliOptions = {
  careers: parseIntArg('--careers', 30),
  seed: parseIntArg('--seed', 20260417),
};

const PRESETS: LogicLabPresetId[] = [
  'RANDOM_BASELINE',
  'STANDARD_B_GRINDER',
  'HIGH_TALENT_AS',
  'LOW_TALENT_CD',
];

const increment = (target: Record<string, number>, key: string, count: number): void => {
  target[key] = (target[key] ?? 0) + count;
};

const rarityOrder: Record<KimariteRarityBucket | 'UNKNOWN', number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EXTREME: 3,
  UNKNOWN: 4,
};

const bucketTotals = (): Record<KimariteRarityBucket | 'UNKNOWN', number> => ({
  COMMON: 0,
  UNCOMMON: 0,
  RARE: 0,
  EXTREME: 0,
  UNKNOWN: 0,
});

const formatPct = (value: number): string => `${(value * 100).toFixed(2)}%`;

const toMoveRanking = (counts: Record<string, number>, total: number): MoveCount[] =>
  Object.entries(counts)
    .map(([move, count]) => {
      const entry = findOfficialKimariteEntry(move);
      const collectionEntry = findCollectionKimariteEntry(move);
      const realdata = findKimariteRealdataFrequency(move);
      return {
        move,
        count,
        rate: count / Math.max(1, total),
        rarity: collectionEntry?.rarityBucket ?? entry?.rarityBucket ?? 'UNKNOWN',
        observedCount: realdata?.observedCount,
        observedRate: realdata?.observedRate,
        ratioToReal: realdata && realdata.observedRate > 0
          ? (count / Math.max(1, total)) / realdata.observedRate
          : undefined,
      };
    })
    .sort((left, right) => right.count - left.count);

const renderMoveTable = (rows: MoveCount[], limit: number): string[] => [
  '| 決まり手 | 回数 | rate | 実rate | ratio | rarity |',
  '|---|---:|---:|---:|---:|---|',
  ...rows.slice(0, limit).map((row) =>
    `| ${row.move} | ${row.count} | ${formatPct(row.rate)} | ${row.observedRate === undefined ? '-' : formatPct(row.observedRate)} | ${row.ratioToReal === undefined ? '-' : row.ratioToReal.toFixed(2)} | ${row.rarity} |`,
  ),
];

const main = async (): Promise<void> => {
  const totalCounts: Record<string, number> = {};
  const styleCounts: Record<string, Record<string, number>> = {};
  const specialtyCounts: Record<string, number> = {};
  let totalBouts = 0;
  let totalKimarite = 0;
  let unknownRarityCount = 0;
  let aliasNormalizedCount = 0;
  let observedZeroGeneratedCount = 0;
  let extremeGeneratedCount = 0;
  let rareEncounterCount = 0;
  let displayRareEncounterCount = 0;
  let displayExcludedRareEncounterCount = 0;
  let careersWithRareEncounter = 0;
  let careersWithExtremeEncounter = 0;
  let observedZeroEncounterCount = 0;
  let extremeAsSpecialtyCount = 0;
  let rareAsSpecialtyCount = 0;
  let oneOffRareSelectedAsSpecialtyCount = 0;
  const rareEncounterTotals: Record<string, number> = {};
  const extremeEncounterTotals: Record<string, number> = {};

  for (let index = 0; index < OPTIONS.careers; index += 1) {
    const presetId = PRESETS[index % PRESETS.length];
    const seed = OPTIONS.seed + index * 9973;
    const { logs } = await runLogicLabToEnd({
      presetId,
      seed,
      maxBasho: 90,
    });
    const careerCounts: Record<string, number> = {};
    for (const log of logs) {
      for (const [rawMove, count] of Object.entries(log.kimariteCount ?? {})) {
        const move = normalizeKimariteName(rawMove);
        if (move !== rawMove) aliasNormalizedCount += count;
        increment(totalCounts, move, count);
        increment(careerCounts, move, count);
        if (!styleCounts[presetId]) styleCounts[presetId] = {};
        increment(styleCounts[presetId], move, count);
        totalBouts += count;
        totalKimarite += count;
        const entry = findCollectionKimariteEntry(move);
        if (!entry) {
          unknownRarityCount += count;
          continue;
        }
        if (entry.rarityBucket === 'EXTREME') extremeGeneratedCount += count;
        if (findKimariteRealdataFrequency(move)?.observedCount === 0) {
          observedZeroGeneratedCount += count;
        }
      }
    }

    const signature = summarizeSignatureKimarite(careerCounts, [], 3);
    for (const move of signature.selectedMoves) {
      increment(specialtyCounts, move, 1);
      const entry = findOfficialKimariteEntry(move);
      if (entry?.rarityBucket === 'RARE') rareAsSpecialtyCount += 1;
      if (entry?.rarityBucket === 'EXTREME') extremeAsSpecialtyCount += 1;
      const count = careerCounts[move] ?? 0;
      if ((entry?.rarityBucket === 'RARE' || entry?.rarityBucket === 'EXTREME') && count <= 2) {
        oneOffRareSelectedAsSpecialtyCount += 1;
      }
    }
    const rareEncounters = summarizeRareKimariteEncounters(careerCounts, { includeNonTechnique: true });
    const displayRareEncounters = summarizeRareKimariteEncounters(careerCounts);
    if (rareEncounters.some((encounter) => encounter.rarity === 'RARE')) careersWithRareEncounter += 1;
    if (rareEncounters.some((encounter) => encounter.rarity === 'EXTREME')) careersWithExtremeEncounter += 1;
    rareEncounterCount += rareEncounters.reduce((sum, encounter) => sum + encounter.count, 0);
    displayRareEncounterCount += displayRareEncounters.reduce((sum, encounter) => sum + encounter.count, 0);
    displayExcludedRareEncounterCount +=
      rareEncounters.reduce((sum, encounter) => sum + encounter.count, 0) -
      displayRareEncounters.reduce((sum, encounter) => sum + encounter.count, 0);
    for (const encounter of rareEncounters) {
      if (encounter.observedCount === 0) observedZeroEncounterCount += encounter.count;
      if (encounter.rarity === 'RARE') increment(rareEncounterTotals, encounter.name, encounter.count);
      if (encounter.rarity === 'EXTREME') increment(extremeEncounterTotals, encounter.name, encounter.count);
    }
  }

  const rarityCounts = bucketTotals();
  for (const [move, count] of Object.entries(totalCounts)) {
    const entry = findCollectionKimariteEntry(move);
    rarityCounts[entry?.rarityBucket ?? 'UNKNOWN'] += count;
  }

  const ranking = toMoveRanking(totalCounts, totalKimarite);
  const overrepresented = ranking
    .filter((row) => row.ratioToReal !== undefined)
    .sort((left, right) => (right.ratioToReal ?? 0) - (left.ratioToReal ?? 0))
    .slice(0, 15);
  const underrepresented = ranking
    .filter((row) => row.ratioToReal !== undefined && row.count >= 1)
    .sort((left, right) => (left.ratioToReal ?? 0) - (right.ratioToReal ?? 0))
    .slice(0, 15);
  const topRareEncounters = toMoveRanking(rareEncounterTotals, Math.max(1, rareEncounterCount))
    .filter((row) => row.rarity === 'RARE')
    .slice(0, 10);
  const topExtremeEncounters = toMoveRanking(extremeEncounterTotals, Math.max(1, rareEncounterCount))
    .filter((row) => row.rarity === 'EXTREME')
    .slice(0, 10);
  const catalogRows = OFFICIAL_WIN_KIMARITE_82.map((entry) => {
    const realdata = findKimariteRealdataFrequency(entry.name);
    return {
      name: entry.name,
      rarityBucket: entry.rarityBucket,
      historicalWeight: entry.historicalWeight,
      signatureEligible: entry.signatureEligible,
      observedCount: realdata?.observedCount,
      observedRate: realdata?.observedRate,
    };
  }).sort((left, right) =>
    rarityOrder[left.rarityBucket] - rarityOrder[right.rarityBucket] ||
    (right.observedRate ?? 0) - (left.observedRate ?? 0),
  );

  const styleSummary = Object.fromEntries(
    Object.entries(styleCounts).map(([style, counts]) => {
      const styleTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
      const styleBucket = bucketTotals();
      for (const [move, count] of Object.entries(counts)) {
        const entry = findCollectionKimariteEntry(move);
        styleBucket[entry?.rarityBucket ?? 'UNKNOWN'] += count;
      }
      return [style, {
        totalWins: styleTotal,
        rareRate: styleBucket.RARE / Math.max(1, styleTotal),
        extremeRate: styleBucket.EXTREME / Math.max(1, styleTotal),
        bucketCounts: styleBucket,
      }];
    }),
  );

  const payload = {
    meta: {
      careers: OPTIONS.careers,
      seed: OPTIONS.seed,
      source: KIMARITE_REALDATA_FREQUENCY.source,
      sourceUrl: KIMARITE_REALDATA_FREQUENCY.sourceUrl,
      sourcePeriod: KIMARITE_REALDATA_FREQUENCY.sourcePeriod,
      sourceTotalBouts: KIMARITE_REALDATA_FREQUENCY.sourceTotalBouts,
    },
    totals: {
      totalBouts,
      totalKimarite,
      rarityCounts,
      rarityRates: Object.fromEntries(
        Object.entries(rarityCounts).map(([key, count]) => [key, count / Math.max(1, totalKimarite)]),
      ),
      unknownRarityCount,
      aliasNormalizedCount,
      observedZeroGeneratedCount,
      extremeGeneratedCount,
      rareEncounterCount,
      displayRareEncounterCount,
      displayExcludedRareEncounterCount,
      careersWithRareEncounter,
      careersWithExtremeEncounter,
      observedZeroEncounterCount,
      rareAsSpecialtyCount,
      extremeAsSpecialtyCount,
      oneOffRareSelectedAsSpecialtyCount,
    },
    ranking,
    overrepresented,
    underrepresented,
    topRareEncounters,
    topExtremeEncounters,
    specialtyCounts,
    styleSummary,
    catalogRows,
  };

  mkdirSync('docs/design', { recursive: true });
  writeFileSync(
    'docs/design/kimarite_reality_diagnostics.json',
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
  writeFileSync(
    'docs/design/kimarite_realdata_rarity_diagnostics.json',
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );

  const md = [
    '# Kimarite Realdata Rarity Diagnostics',
    '',
    `Generated by \`scripts/dev/diagnoseKimariteReality.ts\` with careers=${OPTIONS.careers}, seed=${OPTIONS.seed}.`,
    '',
    `Source: ${KIMARITE_REALDATA_FREQUENCY.source} (${KIMARITE_REALDATA_FREQUENCY.sourcePeriod}, ${KIMARITE_REALDATA_FREQUENCY.sourceTotalBouts.toLocaleString()} bouts).`,
    '',
    '## KPI',
    '',
    `- total bouts: ${totalBouts}`,
    `- total kimarite count: ${totalKimarite}`,
    `- common rate: ${formatPct(rarityCounts.COMMON / Math.max(1, totalKimarite))}`,
    `- uncommon rate: ${formatPct(rarityCounts.UNCOMMON / Math.max(1, totalKimarite))}`,
    `- rare rate: ${formatPct(rarityCounts.RARE / Math.max(1, totalKimarite))}`,
    `- extreme rate: ${formatPct(rarityCounts.EXTREME / Math.max(1, totalKimarite))}`,
    `- UNKNOWN rarity count: ${unknownRarityCount}`,
    `- alias normalized count: ${aliasNormalizedCount}`,
    `- observedCount=0 generated count: ${observedZeroGeneratedCount}`,
    `- rare encounter count: ${rareEncounterCount}`,
    `- display rare encounter count: ${displayRareEncounterCount}`,
    `- display excluded rare encounter count: ${displayExcludedRareEncounterCount}`,
    `- careers with rare encounter: ${careersWithRareEncounter}`,
    `- careers with extreme encounter: ${careersWithExtremeEncounter}`,
    `- observedCount=0 encounter count: ${observedZeroEncounterCount}`,
    `- rare kimarite as specialty count: ${rareAsSpecialtyCount}`,
    `- EXTREME as specialty count: ${extremeAsSpecialtyCount}`,
    `- one-off rare selected as specialty count: ${oneOffRareSelectedAsSpecialtyCount}`,
    '',
    '## Kimarite Frequency Ranking',
    '',
    ...renderMoveTable(ranking, 20),
    '',
    '## Top Overrepresented',
    '',
    ...renderMoveTable(overrepresented, 15),
    '',
    '## Top Underrepresented',
    '',
    ...renderMoveTable(underrepresented, 15),
    '',
    '## Top Rare Encounters',
    '',
    ...renderMoveTable(topRareEncounters, 10),
    '',
    '## Top Extreme Encounters',
    '',
    ...renderMoveTable(topExtremeEncounters, 10),
    '',
    '## Style Summary',
    '',
    '| style | wins | rare rate | extreme rate |',
    '|---|---:|---:|---:|',
    ...Object.entries(styleSummary).map(([style, summary]) =>
      `| ${style} | ${summary.totalWins} | ${formatPct(summary.rareRate)} | ${formatPct(summary.extremeRate)} |`,
    ),
    '',
  ];

  writeFileSync(
    'docs/design/kimarite_reality_diagnostics.md',
    `${md.join('\n')}\n`,
    'utf8',
  );
  writeFileSync(
    'docs/design/kimarite_realdata_rarity_diagnostics.md',
    `${md.join('\n')}\n`,
    'utf8',
  );

  console.log(`Kimarite diagnostics: careers=${OPTIONS.careers} total=${totalKimarite}`);
  console.log(`rare=${formatPct(rarityCounts.RARE / Math.max(1, totalKimarite))} extreme=${formatPct(rarityCounts.EXTREME / Math.max(1, totalKimarite))}`);
  console.log(`unknown=${unknownRarityCount} observedZero=${observedZeroGeneratedCount} rareSpecialty=${rareAsSpecialtyCount} extremeSpecialty=${extremeAsSpecialtyCount}`);
};

mkdirSync(dirname('docs/design/kimarite_realdata_rarity_diagnostics.json'), { recursive: true });
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
