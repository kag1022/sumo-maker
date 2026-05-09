#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';
import type { Division } from '../../src/logic/models';
import type {
  EraBoundaryProfile,
  EraCareerStageProfile,
  EraSnapshot,
  EraTag,
} from '../../src/logic/era/types';

type DivisionKey = Exclude<Division, 'Maezumo'>;
type CareerStage = keyof EraCareerStageProfile;

interface SourceEntry {
  sourceBashoKey: string;
  division: DivisionKey;
  rankName: string;
  rankNumber: number;
  wins: number;
  losses: number;
  absences: number;
  globalRankIndex: number;
  divisionRankIndex: number;
  estimatedAge: number;
  estimatedCareerBashoCount: number;
  careerStage: CareerStage;
  strengthSeed: number;
}

interface SourceSummary {
  generatedAt: string;
  range: { start: string; end: string };
  expectedBashoCount: number;
  expectedDivisionFileCount: number;
  actualDivisionFileCount: number;
  totalEntries: number;
  totalRecords: number;
  totalMovements: number;
  missingInputFiles: string[];
  bashoSummaries: BashoSourceSummary[];
}

interface BashoSourceSummary {
  sourceBashoKey: string;
  sourceLabelInternal: string;
  divisionHeadcounts: Partial<Record<DivisionKey, number>>;
  missingDivisions: DivisionKey[];
  totalEntries: number;
  topRankStructure: EraSnapshot['topRankStructure'];
  boundaryRaw: {
    makushitaUpperCount: number;
    makushitaWinningUpperCount: number;
    juryoLowerCount: number;
    juryoLosingLowerCount: number;
    juryoMakushitaCrossBoutCount: number;
  };
}

const ROOT = process.cwd();
const ANALYSIS_DIR = path.join(ROOT, 'sumo-api-db', 'data', 'analysis');
const ERA_DATA_DIR = path.join(ROOT, 'src', 'logic', 'era', 'data');
const DESIGN_DIR = path.join(ROOT, 'docs', 'design');
const SOURCE_ENTRY_PATH = path.join(ANALYSIS_DIR, 'era_banzuke_entries_196007_202603.json');
const SOURCE_SUMMARY_PATH = path.join(ANALYSIS_DIR, 'era_source_summary_196007_202603.json');
const SNAPSHOT_PATH = path.join(ERA_DATA_DIR, 'era_snapshots_196007_202603.json');

const DIVISIONS: DivisionKey[] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
];

const CAREER_STAGES: CareerStage[] = ['rookie', 'rising', 'prime', 'veteran', 'declining'];

const BODY_BASELINE: Record<DivisionKey, { heightP50: number; weightP50: number }> = {
  Makuuchi: { heightP50: 184, weightP50: 155 },
  Juryo: { heightP50: 183, weightP50: 148 },
  Makushita: { heightP50: 181, weightP50: 136 },
  Sandanme: { heightP50: 179, weightP50: 124 },
  Jonidan: { heightP50: 177, weightP50: 112 },
  Jonokuchi: { heightP50: 176, weightP50: 104 },
};

const readJson = <T>(filePath: string): T => JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;

const writeJson = (filePath: string, value: unknown): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const quantile = (values: number[], q: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

const profileFromValues = (values: number[]): { p25: number; p50: number; p75: number } => ({
  p25: round(quantile(values, 0.25), 1),
  p50: round(quantile(values, 0.5), 1),
  p75: round(quantile(values, 0.75), 1),
});

const strengthProfileFromValues = (
  values: number[],
): { p25: number; p50: number; p75: number; p90: number } => ({
  ...profileFromValues(values),
  p90: round(quantile(values, 0.9), 1),
});

const normalizeShare = (value: number, denominator: number): number =>
  round(denominator > 0 ? value / denominator : 0, 3);

const buildCareerStageProfile = (entries: SourceEntry[]): EraCareerStageProfile => {
  const denominator = Math.max(1, entries.length);
  const counts: EraCareerStageProfile = {
    rookie: 0,
    rising: 0,
    prime: 0,
    veteran: 0,
    declining: 0,
  };
  for (const entry of entries) {
    counts[entry.careerStage] += 1;
  }
  return {
    rookie: normalizeShare(counts.rookie, denominator),
    rising: normalizeShare(counts.rising, denominator),
    prime: normalizeShare(counts.prime, denominator),
    veteran: normalizeShare(counts.veteran, denominator),
    declining: normalizeShare(counts.declining, denominator),
  };
};

const buildBoundaryProfile = (summary: BashoSourceSummary): EraBoundaryProfile => {
  const raw = summary.boundaryRaw;
  const makushitaPromotionShare = raw.makushitaUpperCount
    ? raw.makushitaWinningUpperCount / raw.makushitaUpperCount
    : 0;
  const juryoDemotionShare = raw.juryoLowerCount
    ? raw.juryoLosingLowerCount / raw.juryoLowerCount
    : 0;
  const crossIntensity = clamp(raw.juryoMakushitaCrossBoutCount / 6, 0, 1);
  const congestion = clamp((raw.makushitaUpperCount - 20) / 18, 0, 1);
  return {
    sekitoriBoundaryPressure: round(clamp(makushitaPromotionShare * 0.48 + juryoDemotionShare * 0.42 + crossIntensity * 0.1, 0, 1), 3),
    makushitaUpperCongestion: round(congestion, 3),
    juryoDemotionPressure: round(clamp(juryoDemotionShare, 0, 1), 3),
    crossDivisionBoutIntensity: round(crossIntensity, 3),
  };
};

const deriveEraTags = (
  snapshot: Pick<EraSnapshot, 'topRankStructure' | 'divisionAgeProfile' | 'careerStageProfile' | 'boundaryProfile'>,
): EraTag[] => {
  const tags: EraTag[] = [];
  const top = snapshot.topRankStructure;
  if (top.yokozunaCount >= 1 && top.ozekiCount >= 2) tags.push('yokozuna_stable');
  if (top.yokozunaCount === 0) tags.push('yokozuna_absent');
  if (top.ozekiCount >= 3) tags.push('ozeki_crowded');
  if (top.yokozunaCount === 0 || top.sekiwakeCount + top.komusubiCount >= 5) {
    tags.push('top_division_turbulent');
  }
  if (snapshot.boundaryProfile.sekitoriBoundaryPressure >= 0.62) {
    tags.push('sekitori_boundary_hot');
  }
  if (snapshot.boundaryProfile.makushitaUpperCongestion >= 0.6) {
    tags.push('makushita_congested');
  }
  const sekitoriAges = [
    snapshot.divisionAgeProfile.Makuuchi?.p50,
    snapshot.divisionAgeProfile.Juryo?.p50,
  ].filter((value): value is number => typeof value === 'number');
  const sekitoriAgeP50 = sekitoriAges.length
    ? sekitoriAges.reduce((sum, value) => sum + value, 0) / sekitoriAges.length
    : 0;
  if (sekitoriAgeP50 > 0 && sekitoriAgeP50 <= 26.5) tags.push('young_wave');
  if (sekitoriAgeP50 >= 30) tags.push('veteran_heavy');
  const makuuchiStage = snapshot.careerStageProfile.Makuuchi;
  if (makuuchiStage && makuuchiStage.rising + makuuchiStage.rookie >= 0.32 && makuuchiStage.declining < 0.16) {
    tags.push('generation_shift');
  }
  if (tags.length === 0) tags.push('balanced_era');
  return [...new Set(tags)].slice(0, 4);
};

const buildPublicEraLabel = (tags: EraTag[]): string => {
  if (tags.includes('yokozuna_absent')) return '綱不在の相撲景色';
  if (tags.includes('yokozuna_stable') && tags.includes('ozeki_crowded')) return '上位厚めの相撲景色';
  if (tags.includes('yokozuna_stable')) return '綱が座る相撲景色';
  if (tags.includes('sekitori_boundary_hot')) return '境界が熱い相撲景色';
  if (tags.includes('young_wave')) return '若手が押す相撲景色';
  if (tags.includes('veteran_heavy')) return '熟練層厚めの相撲景色';
  return '均衡した相撲景色';
};

const fillMissingDivisionProfiles = <T>(
  target: Partial<Record<DivisionKey, T>>,
  fallback?: Partial<Record<DivisionKey, T>>,
): Partial<Record<DivisionKey, T>> => {
  const next: Partial<Record<DivisionKey, T>> = { ...target };
  for (const division of DIVISIONS) {
    if (!next[division] && fallback?.[division]) {
      next[division] = fallback[division];
    }
  }
  return next;
};

const buildBodyProfile = (sourceBashoKey: string): Partial<Record<DivisionKey, { heightP50: number; weightP50: number }>> => {
  const year = Number(sourceBashoKey.slice(0, 4));
  const eraProgress = clamp((year - 1960) / (2026 - 1960), 0, 1);
  return Object.fromEntries(
    DIVISIONS.map((division) => {
      const base = BODY_BASELINE[division];
      return [
        division,
        {
          heightP50: round(base.heightP50 - 2.2 + eraProgress * 3.2, 1),
          weightP50: round(base.weightP50 - 18 + eraProgress * 24, 1),
        },
      ];
    }),
  ) as Partial<Record<DivisionKey, { heightP50: number; weightP50: number }>>;
};

const main = (): void => {
  const entries = readJson<SourceEntry[]>(SOURCE_ENTRY_PATH);
  const source = readJson<SourceSummary>(SOURCE_SUMMARY_PATH);
  const entriesByBasho = new Map<string, SourceEntry[]>();
  for (const entry of entries) {
    const rows = entriesByBasho.get(entry.sourceBashoKey) ?? [];
    rows.push(entry);
    entriesByBasho.set(entry.sourceBashoKey, rows);
  }

  let lastUsableSnapshot: EraSnapshot | undefined;
  const snapshots: EraSnapshot[] = [];

  for (const summary of source.bashoSummaries) {
    const rows = entriesByBasho.get(summary.sourceBashoKey) ?? [];
    const hasAnySource = rows.length > 0;
    const sourceRows = hasAnySource
      ? rows
      : (lastUsableSnapshot ? [] : rows);

    const ageProfile: Partial<Record<DivisionKey, { p25: number; p50: number; p75: number }>> = {};
    const strengthProfile: EraSnapshot['divisionStrengthProfile'] = {};
    const careerStageProfile: EraSnapshot['careerStageProfile'] = {};
    for (const division of DIVISIONS) {
      const divisionRows = sourceRows.filter((entry) => entry.division === division);
      if (divisionRows.length === 0) continue;
      ageProfile[division] = profileFromValues(divisionRows.map((entry) => entry.estimatedAge));
      strengthProfile[division] = strengthProfileFromValues(divisionRows.map((entry) => entry.strengthSeed));
      careerStageProfile[division] = buildCareerStageProfile(divisionRows);
    }

    const fallback = lastUsableSnapshot;
    const divisionHeadcounts = hasAnySource
      ? fillMissingDivisionProfiles(summary.divisionHeadcounts, fallback?.divisionHeadcounts)
      : { ...fallback?.divisionHeadcounts };
    const topRankStructure = hasAnySource
      ? {
        ...summary.topRankStructure,
        juryoCount: summary.topRankStructure.juryoCount || fallback?.topRankStructure.juryoCount || 0,
        makushitaUpperCount: summary.topRankStructure.makushitaUpperCount || fallback?.topRankStructure.makushitaUpperCount || 0,
      }
      : fallback?.topRankStructure ?? summary.topRankStructure;
    const boundaryProfile = hasAnySource
      ? buildBoundaryProfile(summary)
      : fallback?.boundaryProfile ?? buildBoundaryProfile(summary);

    const partialSnapshot = {
      topRankStructure,
      divisionAgeProfile: fillMissingDivisionProfiles(ageProfile, fallback?.divisionAgeProfile),
      divisionStrengthProfile: fillMissingDivisionProfiles(strengthProfile, fallback?.divisionStrengthProfile),
      careerStageProfile: fillMissingDivisionProfiles(careerStageProfile, fallback?.careerStageProfile),
      boundaryProfile,
    };
    const eraTags = deriveEraTags(partialSnapshot);
    const sourceCompleteness = {
      status: hasAnySource
        ? (summary.missingDivisions.length > 0 ? 'partial' as const : 'complete' as const)
        : 'fallback' as const,
      actualDivisionCount: DIVISIONS.length - summary.missingDivisions.length,
      missingDivisions: summary.missingDivisions as Division[],
      ...(hasAnySource ? {} : { fallbackSourceBashoKey: fallback?.sourceBashoKey }),
    };
    const snapshot: EraSnapshot = {
      id: `era-${summary.sourceBashoKey}`,
      sourceBashoKey: summary.sourceBashoKey,
      sourceLabelInternal: summary.sourceLabelInternal,
      publicEraLabel: buildPublicEraLabel(eraTags),
      eraTags,
      divisionHeadcounts,
      topRankStructure,
      divisionAgeProfile: partialSnapshot.divisionAgeProfile,
      divisionBodyProfile: buildBodyProfile(summary.sourceBashoKey),
      divisionStrengthProfile: partialSnapshot.divisionStrengthProfile,
      careerStageProfile: partialSnapshot.careerStageProfile,
      boundaryProfile,
      sourceCompleteness,
      anonymity: {
        usesRealNames: false,
        usesRealShikona: false,
        oneToOnePersonMapping: false,
      },
    };
    snapshots.push(snapshot);
    if (hasAnySource) {
      lastUsableSnapshot = snapshot;
    }
  }

  writeJson(SNAPSHOT_PATH, snapshots);

  const tagCounts = new Map<EraTag, number>();
  for (const snapshot of snapshots) {
    for (const tag of snapshot.eraTags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const sizeBytes = fs.statSync(SNAPSHOT_PATH).size;
  const completeCount = snapshots.filter((snapshot) => snapshot.sourceCompleteness?.status === 'complete').length;
  const partialCount = snapshots.filter((snapshot) => snapshot.sourceCompleteness?.status === 'partial').length;
  const fallbackCount = snapshots.filter((snapshot) => snapshot.sourceCompleteness?.status === 'fallback').length;
  const report = [
    '# EraSnapshot Generation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Command',
    '',
    '`npx tsx scripts/dev/buildEraSnapshotsFromSourceData.ts`',
    '',
    '## Input Files',
    '',
    '- `sumo-api-db/data/analysis/era_banzuke_entries_196007_202603.json`',
    '- `sumo-api-db/data/analysis/era_source_summary_196007_202603.json`',
    '',
    '## Output',
    '',
    '- `src/logic/era/data/era_snapshots_196007_202603.json`',
    '',
    '## Counts',
    '',
    `- snapshots: ${snapshots.length}`,
    `- JSON size: ${sizeBytes} bytes`,
    `- complete source snapshots: ${completeCount}`,
    `- partial source snapshots: ${partialCount}`,
    `- fallback snapshots: ${fallbackCount}`,
    '',
    '## Era Tag Distribution',
    '',
    '| tag | count |',
    '|---|---:|',
    ...[...tagCounts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([tag, count]) => `| ${tag} | ${count} |`),
    '',
    '## Anonymity Check',
    '',
    'Generated snapshots contain aggregate fields only. `rikishiId`, `shikonaEn`, raw opponent IDs, and one-to-one career rows are not emitted.',
    '',
    '## Missing Handling',
    '',
    '- 2011-03 has partial source coverage; missing lower divisions use the latest available division profiles where needed.',
    '- 2020-05 has no source banzuke files in the local cache; the snapshot is marked `fallback` and carries the nearest previous anonymous structure.',
    '',
    '## Bundle/Public Decision',
    '',
    'The JSON is small enough for direct bundling under `src/logic/era/data/`. No public lazy-load path is needed for this MVP.',
    '',
  ].join('\n');
  fs.mkdirSync(DESIGN_DIR, { recursive: true });
  fs.writeFileSync(path.join(DESIGN_DIR, 'era_snapshot_generation_report.md'), report, 'utf-8');

  console.log(`snapshots=${snapshots.length}`);
  console.log(`sizeBytes=${sizeBytes}`);
  console.log(`complete=${completeCount} partial=${partialCount} fallback=${fallbackCount}`);
};

main();
