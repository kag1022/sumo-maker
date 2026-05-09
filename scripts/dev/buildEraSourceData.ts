#!/usr/bin/env npx tsx
import * as fs from 'fs';
import * as path from 'path';

type DivisionKey =
  | 'Makuuchi'
  | 'Juryo'
  | 'Makushita'
  | 'Sandanme'
  | 'Jonidan'
  | 'Jonokuchi';

type SideKey = 'East' | 'West';

interface IntermediateEntry {
  rikishiId: number;
  shikonaEn?: string;
  rank: string;
  banzukeLabel: string;
  wins: number;
  losses: number;
  absences: number;
}

interface RawBanzukeEntry {
  rikishiID?: number;
  rank?: string;
  record?: Array<{
    opponentID?: number;
    result?: string;
  }>;
}

interface ParsedRank {
  rankName: string;
  rankNameEn: string;
  rankNumber: number;
  side: SideKey;
}

interface EraBanzukeEntry {
  sourceBashoKey: string;
  division: DivisionKey;
  rikishiId: number;
  shikonaEn: string;
  rank: string;
  banzukeLabel: string;
  rankName: string;
  rankNameEn: string;
  rankNumber: number;
  side: SideKey;
  wins: number;
  losses: number;
  absences: number;
  globalRankIndex: number;
  divisionRankIndex: number;
  observedCareerBashoCount: number;
  estimatedCareerBashoCount: number;
  estimatedAge: number;
  careerStage: CareerStage;
  strengthSeed: number;
}

interface EraBashoRecord {
  sourceBashoKey: string;
  division: DivisionKey;
  rikishiId: number;
  shikonaEn: string;
  rankName: string;
  rankNumber: number;
  wins: number;
  losses: number;
  absences: number;
}

interface EraRankMovement {
  rikishiId: number;
  shikonaEn: string;
  fromBasho: string;
  toBasho: string;
  fromDivision: DivisionKey;
  toDivision: DivisionKey;
  fromBanzukeLabel: string;
  toBanzukeLabel: string;
  fromGlobalRankIndex: number;
  toGlobalRankIndex: number;
  movementSteps: number;
}

type CareerStage = 'rookie' | 'rising' | 'prime' | 'veteran' | 'declining';

interface BashoSourceSummary {
  sourceBashoKey: string;
  sourceLabelInternal: string;
  divisionHeadcounts: Partial<Record<DivisionKey, number>>;
  missingDivisions: DivisionKey[];
  totalEntries: number;
  topRankStructure: {
    yokozunaCount: number;
    ozekiCount: number;
    sekiwakeCount: number;
    komusubiCount: number;
    maegashiraCount: number;
    juryoCount: number;
    makushitaUpperCount: number;
  };
  boundaryRaw: {
    makushitaUpperCount: number;
    makushitaWinningUpperCount: number;
    juryoLowerCount: number;
    juryoLosingLowerCount: number;
    juryoMakushitaCrossBoutCount: number;
  };
}

const ROOT = process.cwd();
const ENTRY_DIR = path.join(ROOT, 'sumo-api-db', 'data', 'intermediate', 'banzuke_entries');
const RAW_BANZUKE_DIR = path.join(ROOT, 'sumo-api-db', 'data', 'raw_json', 'banzuke');
const ANALYSIS_DIR = path.join(ROOT, 'sumo-api-db', 'data', 'analysis');
const DESIGN_DIR = path.join(ROOT, 'docs', 'design');
const START = '196007';
const END = '202603';

const OFFICIAL_MONTHS = [1, 3, 5, 7, 9, 11] as const;
const DIVISIONS: DivisionKey[] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
];

const RANK_NAME: Record<string, string> = {
  Yokozuna: '横綱',
  Ozeki: '大関',
  Sekiwake: '関脇',
  Komusubi: '小結',
  Maegashira: '前頭',
  Juryo: '十両',
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
};

const DIVISION_ORDER: Record<DivisionKey, number> = {
  Makuuchi: 0,
  Juryo: 1,
  Makushita: 2,
  Sandanme: 3,
  Jonidan: 4,
  Jonokuchi: 5,
};

const MIN_CAREER_BASHO_BY_DIVISION: Record<DivisionKey, number> = {
  Makuuchi: 54,
  Juryo: 42,
  Makushita: 24,
  Sandanme: 12,
  Jonidan: 6,
  Jonokuchi: 2,
};

const STRENGTH_RANGE: Record<DivisionKey, { min: number; max: number }> = {
  Makuuchi: { min: 98, max: 162 },
  Juryo: { min: 80, max: 126 },
  Makushita: { min: 66, max: 108 },
  Sandanme: { min: 54, max: 92 },
  Jonidan: { min: 42, max: 80 },
  Jonokuchi: { min: 32, max: 68 },
};

const ensureDir = (dir: string): void => {
  fs.mkdirSync(dir, { recursive: true });
};

const readJson = <T>(filePath: string): T | null => {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
};

const writeJson = (filePath: string, value: unknown): void => {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
};

const generateBashoIds = (): string[] => {
  const ids: string[] = [];
  const startYear = Number(START.slice(0, 4));
  const startMonth = Number(START.slice(4));
  const endYear = Number(END.slice(0, 4));
  const endMonth = Number(END.slice(4));
  for (let year = startYear; year <= endYear; year += 1) {
    for (const month of OFFICIAL_MONTHS) {
      if (year === startYear && month < startMonth) continue;
      if (year === endYear && month > endMonth) continue;
      ids.push(`${year}${String(month).padStart(2, '0')}`);
    }
  }
  return ids;
};

const parseRank = (rank: string): ParsedRank | null => {
  const parts = rank.trim().split(/\s+/);
  if (parts.length < 3) return null;
  const rankNameEn = parts[0];
  const rankName = RANK_NAME[rankNameEn];
  const rankNumber = Number(parts[1]);
  const side = parts[2] as SideKey;
  if (!rankName || !Number.isFinite(rankNumber) || (side !== 'East' && side !== 'West')) {
    return null;
  }
  return {
    rankName,
    rankNameEn,
    rankNumber,
    side,
  };
};

const rankSortKey = (entry: Pick<EraBanzukeEntry, 'division' | 'rankNumber' | 'side'>): number =>
  DIVISION_ORDER[entry.division] * 10000 + entry.rankNumber * 2 + (entry.side === 'West' ? 1 : 0);

const resolveCareerStage = (careerBashoCount: number): CareerStage => {
  if (careerBashoCount < 12) return 'rookie';
  if (careerBashoCount < 36) return 'rising';
  if (careerBashoCount < 72) return 'prime';
  if (careerBashoCount < 108) return 'veteran';
  return 'declining';
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const round = (value: number, digits = 2): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const buildStrengthSeed = (
  entry: Pick<EraBanzukeEntry, 'division' | 'divisionRankIndex' | 'wins' | 'losses' | 'absences'>,
  divisionSize: number,
): number => {
  const range = STRENGTH_RANGE[entry.division];
  const rankPercentile =
    divisionSize <= 1 ? 1 : 1 - entry.divisionRankIndex / Math.max(1, divisionSize - 1);
  const resultAdjustment = clamp((entry.wins - entry.losses) * 1.1 - entry.absences * 0.25, -10, 10);
  return round(clamp(range.min + (range.max - range.min) * rankPercentile + resultAdjustment, range.min, range.max + 8));
};

const estimateAge = (division: DivisionKey, observedCareerBashoCount: number): {
  estimatedCareerBashoCount: number;
  estimatedAge: number;
} => {
  const estimatedCareerBashoCount = Math.max(
    MIN_CAREER_BASHO_BY_DIVISION[division],
    observedCareerBashoCount,
  );
  return {
    estimatedCareerBashoCount,
    estimatedAge: round(clamp(15.5 + estimatedCareerBashoCount / 6, 15, 45), 1),
  };
};

const loadEntries = (bashoIds: string[]): {
  entries: EraBanzukeEntry[];
  records: EraBashoRecord[];
  summaries: BashoSourceSummary[];
  missingInputFiles: string[];
} => {
  const temp: Omit<EraBanzukeEntry, 'observedCareerBashoCount' | 'estimatedCareerBashoCount' | 'estimatedAge' | 'careerStage' | 'strengthSeed'>[] = [];
  const missingInputFiles: string[] = [];
  const summaries: BashoSourceSummary[] = [];

  for (const sourceBashoKey of bashoIds) {
    const perBasho: Omit<EraBanzukeEntry, 'observedCareerBashoCount' | 'estimatedCareerBashoCount' | 'estimatedAge' | 'careerStage' | 'strengthSeed'>[] = [];
    const missingDivisions: DivisionKey[] = [];
    const divisionHeadcounts: Partial<Record<DivisionKey, number>> = {};
    for (const division of DIVISIONS) {
      const filePath = path.join(ENTRY_DIR, `${sourceBashoKey}_${division}.json`);
      const rows = readJson<IntermediateEntry[]>(filePath);
      if (!rows) {
        missingInputFiles.push(`${sourceBashoKey}_${division}.json`);
        missingDivisions.push(division);
        continue;
      }
      const parsedRows = rows
        .map((row, divisionRankIndex) => {
          const parsed = parseRank(row.rank);
          if (!parsed) return null;
          return {
            sourceBashoKey,
            division,
            rikishiId: row.rikishiId,
            shikonaEn: row.shikonaEn ?? '',
            rank: row.rank,
            banzukeLabel: row.banzukeLabel,
            rankName: parsed.rankName,
            rankNameEn: parsed.rankNameEn,
            rankNumber: parsed.rankNumber,
            side: parsed.side,
            wins: row.wins ?? 0,
            losses: row.losses ?? 0,
            absences: row.absences ?? 0,
            globalRankIndex: -1,
            divisionRankIndex,
          };
        })
        .filter((row): row is typeof perBasho[number] => Boolean(row));
      divisionHeadcounts[division] = parsedRows.length;
      perBasho.push(...parsedRows);
    }

    perBasho
      .sort((left, right) => rankSortKey(left) - rankSortKey(right))
      .forEach((entry, globalRankIndex) => {
        entry.globalRankIndex = globalRankIndex;
      });
    temp.push(...perBasho);

    const topRankStructure = {
      yokozunaCount: perBasho.filter((entry) => entry.rankName === '横綱').length,
      ozekiCount: perBasho.filter((entry) => entry.rankName === '大関').length,
      sekiwakeCount: perBasho.filter((entry) => entry.rankName === '関脇').length,
      komusubiCount: perBasho.filter((entry) => entry.rankName === '小結').length,
      maegashiraCount: perBasho.filter((entry) => entry.rankName === '前頭').length,
      juryoCount: perBasho.filter((entry) => entry.division === 'Juryo').length,
      makushitaUpperCount: perBasho.filter((entry) => entry.division === 'Makushita' && entry.rankNumber <= 15).length,
    };
    const boundaryRaw = buildBoundaryRaw(sourceBashoKey, perBasho);
    summaries.push({
      sourceBashoKey,
      sourceLabelInternal: `${sourceBashoKey.slice(0, 4)}-${sourceBashoKey.slice(4)}`,
      divisionHeadcounts,
      missingDivisions,
      totalEntries: perBasho.length,
      topRankStructure,
      boundaryRaw,
    });
  }

  const byRikishi = new Map<number, typeof temp>();
  for (const entry of temp) {
    const rows = byRikishi.get(entry.rikishiId) ?? [];
    rows.push(entry);
    byRikishi.set(entry.rikishiId, rows);
  }
  const observedCareerByKey = new Map<string, number>();
  for (const rows of byRikishi.values()) {
    rows
      .sort((left, right) => left.sourceBashoKey.localeCompare(right.sourceBashoKey))
      .forEach((entry, index) => {
        observedCareerByKey.set(`${entry.rikishiId}:${entry.sourceBashoKey}`, index + 1);
      });
  }

  const divisionSizesByBasho = new Map<string, number>();
  for (const entry of temp) {
    const key = `${entry.sourceBashoKey}:${entry.division}`;
    divisionSizesByBasho.set(key, (divisionSizesByBasho.get(key) ?? 0) + 1);
  }

  const entries = temp.map((entry) => {
    const observedCareerBashoCount = observedCareerByKey.get(`${entry.rikishiId}:${entry.sourceBashoKey}`) ?? 1;
    const ageEstimate = estimateAge(entry.division, observedCareerBashoCount);
    const divisionSize = divisionSizesByBasho.get(`${entry.sourceBashoKey}:${entry.division}`) ?? 1;
    return {
      ...entry,
      observedCareerBashoCount,
      estimatedCareerBashoCount: ageEstimate.estimatedCareerBashoCount,
      estimatedAge: ageEstimate.estimatedAge,
      careerStage: resolveCareerStage(ageEstimate.estimatedCareerBashoCount),
      strengthSeed: buildStrengthSeed(
        {
          ...entry,
          wins: entry.wins,
          losses: entry.losses,
          absences: entry.absences,
          divisionRankIndex: entry.divisionRankIndex,
        },
        divisionSize,
      ),
    };
  });

  const records = entries.map((entry) => ({
    sourceBashoKey: entry.sourceBashoKey,
    division: entry.division,
    rikishiId: entry.rikishiId,
    shikonaEn: entry.shikonaEn,
    rankName: entry.rankName,
    rankNumber: entry.rankNumber,
    wins: entry.wins,
    losses: entry.losses,
    absences: entry.absences,
  }));

  return { entries, records, summaries, missingInputFiles };
};

const buildBoundaryRaw = (
  sourceBashoKey: string,
  entries: Array<Pick<EraBanzukeEntry, 'division' | 'rankNumber' | 'rikishiId' | 'wins' | 'losses'>>,
): BashoSourceSummary['boundaryRaw'] => {
  const divisionByRikishi = new Map(entries.map((entry) => [entry.rikishiId, entry.division]));
  let juryoMakushitaCrossBoutCount = 0;
  const rawEntries: Array<RawBanzukeEntry & { division: DivisionKey }> = [];
  for (const division of ['Juryo', 'Makushita'] as DivisionKey[]) {
    const raw = readJson<{ east?: RawBanzukeEntry[]; west?: RawBanzukeEntry[] }>(
      path.join(RAW_BANZUKE_DIR, `${sourceBashoKey}_${division}.json`),
    );
    for (const row of raw?.east ?? []) rawEntries.push({ ...row, division });
    for (const row of raw?.west ?? []) rawEntries.push({ ...row, division });
  }
  const countedPairs = new Set<string>();
  for (const row of rawEntries) {
    const ownId = row.rikishiID;
    if (!ownId) continue;
    for (const bout of row.record ?? []) {
      const opponentId = bout.opponentID;
      if (!opponentId || !bout.result || bout.result === 'absent') continue;
      const opponentDivision = divisionByRikishi.get(opponentId);
      if (!opponentDivision) continue;
      const isJuryoMakushita =
        (row.division === 'Juryo' && opponentDivision === 'Makushita') ||
        (row.division === 'Makushita' && opponentDivision === 'Juryo');
      if (!isJuryoMakushita) continue;
      const key = [ownId, opponentId].sort((a, b) => a - b).join(':');
      if (countedPairs.has(key)) continue;
      countedPairs.add(key);
      juryoMakushitaCrossBoutCount += 1;
    }
  }

  const makushitaUpper = entries.filter((entry) => entry.division === 'Makushita' && entry.rankNumber <= 15);
  const juryoLower = entries.filter((entry) => entry.division === 'Juryo' && entry.rankNumber >= 11);
  return {
    makushitaUpperCount: makushitaUpper.length,
    makushitaWinningUpperCount: makushitaUpper.filter((entry) => entry.wins > entry.losses).length,
    juryoLowerCount: juryoLower.length,
    juryoLosingLowerCount: juryoLower.filter((entry) => entry.losses > entry.wins).length,
    juryoMakushitaCrossBoutCount,
  };
};

const buildMovements = (entries: EraBanzukeEntry[]): EraRankMovement[] => {
  const byRikishi = new Map<number, EraBanzukeEntry[]>();
  for (const entry of entries) {
    const rows = byRikishi.get(entry.rikishiId) ?? [];
    rows.push(entry);
    byRikishi.set(entry.rikishiId, rows);
  }
  const bashoIndex = new Map(generateBashoIds().map((id, index) => [id, index]));
  const movements: EraRankMovement[] = [];
  for (const rows of byRikishi.values()) {
    rows.sort((left, right) => left.sourceBashoKey.localeCompare(right.sourceBashoKey));
    for (let index = 1; index < rows.length; index += 1) {
      const prev = rows[index - 1];
      const curr = rows[index];
      const prevIndex = bashoIndex.get(prev.sourceBashoKey);
      const currIndex = bashoIndex.get(curr.sourceBashoKey);
      if (prevIndex === undefined || currIndex === undefined || currIndex !== prevIndex + 1) {
        continue;
      }
      movements.push({
        rikishiId: curr.rikishiId,
        shikonaEn: curr.shikonaEn,
        fromBasho: prev.sourceBashoKey,
        toBasho: curr.sourceBashoKey,
        fromDivision: prev.division,
        toDivision: curr.division,
        fromBanzukeLabel: prev.banzukeLabel,
        toBanzukeLabel: curr.banzukeLabel,
        fromGlobalRankIndex: prev.globalRankIndex,
        toGlobalRankIndex: curr.globalRankIndex,
        movementSteps: prev.globalRankIndex - curr.globalRankIndex,
      });
    }
  }
  return movements;
};

const renderReport = (args: {
  expectedBashoCount: number;
  expectedFileCount: number;
  actualEntryCount: number;
  actualRecordCount: number;
  movementCount: number;
  missingInputFiles: string[];
  summaries: BashoSourceSummary[];
}): string => {
  const missingBasho = args.summaries.filter((summary) => summary.missingDivisions.length > 0);
  const fullCoverage = args.summaries.filter((summary) => summary.totalEntries > 0).length;
  return [
    '# EraSnapshot Source Generation Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Command',
    '',
    '`npx tsx scripts/dev/buildEraSourceData.ts`',
    '',
    '## Input',
    '',
    '- `sumo-api-db/data/intermediate/banzuke_entries/*.json`',
    '- `sumo-api-db/data/raw_json/banzuke/*.json` for Juryo/Makushita cross-bout counting',
    '',
    '## Output',
    '',
    '- `sumo-api-db/data/analysis/era_banzuke_entries_196007_202603.json`',
    '- `sumo-api-db/data/analysis/era_basho_records_196007_202603.json`',
    '- `sumo-api-db/data/analysis/era_rank_movements_196007_202603.json`',
    '- `sumo-api-db/data/analysis/era_source_summary_196007_202603.json`',
    '',
    '## Counts',
    '',
    `- expected basho: ${args.expectedBashoCount}`,
    `- expected division files: ${args.expectedFileCount}`,
    `- banzuke entries: ${args.actualEntryCount}`,
    `- basho records: ${args.actualRecordCount}`,
    `- consecutive rank movements: ${args.movementCount}`,
    `- basho with at least one source division: ${fullCoverage}`,
    `- missing input files: ${args.missingInputFiles.length}`,
    '',
    '## Missing / Partial Data',
    '',
    missingBasho.length === 0
      ? 'No missing division files.'
      : missingBasho
        .map((summary) => `- ${summary.sourceBashoKey}: missing ${summary.missingDivisions.join(', ')}`)
        .join('\n'),
    '',
    '## Columns Used For Anonymous EraSnapshot',
    '',
    '- division headcounts',
    '- rank names and rank numbers',
    '- wins, losses, absences',
    '- observed career basho count within the source range',
    '- estimated career basho count / estimated age bucket',
    '- Juryo lower / Makushita upper boundary pressure aggregates',
    '',
    '## Columns Not Used In Game-Bundled EraSnapshot',
    '',
    '- `rikishiId`',
    '- `shikonaEn`',
    '- opponent IDs and opponent shikona',
    '',
    'Age and body metrics are not directly present in the Sumo API banzuke cache. Age is estimated from observed career tenure plus division minimums; body medians are handled as fallback in snapshot generation.',
    '',
  ].join('\n');
};

const main = (): void => {
  ensureDir(ANALYSIS_DIR);
  ensureDir(DESIGN_DIR);
  const bashoIds = generateBashoIds();
  const { entries, records, summaries, missingInputFiles } = loadEntries(bashoIds);
  const movements = buildMovements(entries);
  const sourceSummary = {
    generatedAt: new Date().toISOString(),
    range: { start: START, end: END },
    expectedBashoCount: bashoIds.length,
    expectedDivisionFileCount: bashoIds.length * DIVISIONS.length,
    actualDivisionFileCount: bashoIds.length * DIVISIONS.length - missingInputFiles.length,
    totalEntries: entries.length,
    totalRecords: records.length,
    totalMovements: movements.length,
    missingInputFiles,
    bashoSummaries: summaries,
  };

  writeJson(path.join(ANALYSIS_DIR, 'era_banzuke_entries_196007_202603.json'), entries);
  writeJson(path.join(ANALYSIS_DIR, 'era_basho_records_196007_202603.json'), records);
  writeJson(path.join(ANALYSIS_DIR, 'era_rank_movements_196007_202603.json'), movements);
  writeJson(path.join(ANALYSIS_DIR, 'era_source_summary_196007_202603.json'), sourceSummary);
  fs.writeFileSync(
    path.join(DESIGN_DIR, 'era_snapshot_source_generation_report.md'),
    renderReport({
      expectedBashoCount: bashoIds.length,
      expectedFileCount: bashoIds.length * DIVISIONS.length,
      actualEntryCount: entries.length,
      actualRecordCount: records.length,
      movementCount: movements.length,
      missingInputFiles,
      summaries,
    }),
    'utf-8',
  );

  console.log(`entries=${entries.length}`);
  console.log(`records=${records.length}`);
  console.log(`movements=${movements.length}`);
  console.log(`missingInputFiles=${missingInputFiles.length}`);
};

main();
