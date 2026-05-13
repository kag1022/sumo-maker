import fs from 'fs';
import path from 'path';

type Division = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
type RankBand = 'upper' | 'middle' | 'lower' | 'bottom';
type RecordBucket = '0-7' | '1-6' | '2-5' | '3-4' | '4-3' | '5-2' | '6-1' | '7-0';

interface BashoRecordRow {
  sourceBashoKey?: string;
  bashoId?: string;
  division: string;
  rikishiId: number;
  rankName?: string;
  rankNumber?: number;
  wins: number;
  losses: number;
  absences?: number;
}

interface MovementRow {
  rikishiId: number;
  fromBasho: string;
  toBasho: string;
  fromDivision?: string;
  toDivision?: string;
  fromBanzukeLabel?: string;
  toBanzukeLabel?: string;
  fromGlobalRankIndex?: number;
  toGlobalRankIndex?: number;
  movementSteps?: number;
}

interface Observation {
  division: Division;
  rankBand: RankBand;
  record: RecordBucket;
  demotionWidth: number;
  sameDivision: boolean;
  demotedToLowerDivision: boolean;
  floorClampLikely: boolean;
  extremeDemotion: boolean;
}

interface SummaryRow {
  division: Division;
  rankBand: RankBand;
  record: RecordBucket;
  count: number;
  p25: number;
  p50: number;
  p75: number;
  average: number;
  sameDivisionStayRate: number;
  demotionToLowerDivisionRate: number;
  floorClampLikelyRate: number;
  extremeDemotionOutlierCount: number;
}

const LOWER_DIVISIONS: Division[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const RECORDS: RecordBucket[] = ['0-7', '1-6', '2-5', '3-4', '4-3', '5-2', '6-1', '7-0'];
const RANK_BANDS: RankBand[] = ['upper', 'middle', 'lower', 'bottom'];
const DIVISION_ORDER: Record<Division, number> = {
  Makushita: 0,
  Sandanme: 1,
  Jonidan: 2,
  Jonokuchi: 3,
};
const DEFAULT_MAX: Record<Division, number> = {
  Makushita: 60,
  Sandanme: 100,
  Jonidan: 125,
  Jonokuchi: 39,
};

const ROOT = process.cwd();
const RECORDS_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'era_basho_records_196007_202603.json');
const MOVEMENTS_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'era_rank_movements_196007_202603.json');
const OUT_JSON = path.join(ROOT, 'docs', 'design', 'lower_division_realdata_demotion_width.json');
const OUT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_realdata_demotion_width.md');

const isDivision = (value: string | undefined): value is Division =>
  LOWER_DIVISIONS.includes(value as Division);

async function* streamJsonArrayObjects<T>(filePath: string): AsyncGenerator<T> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 256 });
  let depth = 0;
  let inString = false;
  let escaped = false;
  let collecting = false;
  let buffer = '';

  for await (const chunk of stream) {
    for (const char of chunk) {
      if (!collecting) {
        if (char === '{') {
          collecting = true;
          depth = 1;
          buffer = '{';
        }
        continue;
      }

      buffer += char;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (char === '{') depth += 1;
      if (char === '}') depth -= 1;
      if (depth === 0) {
        yield JSON.parse(buffer) as T;
        collecting = false;
        buffer = '';
      }
    }
  }
}

const recordKey = (basho: string, rikishiId: number): string => `${basho}:${rikishiId}`;

const resolveRankBand = (rankNumber: number, division: Division): RankBand => {
  const max = DEFAULT_MAX[division];
  const progress = (rankNumber - 1) / Math.max(1, max - 1);
  if (progress < 0.25) return 'upper';
  if (progress < 0.65) return 'middle';
  if (progress < 0.9) return 'lower';
  return 'bottom';
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Number(sorted[index].toFixed(2));
};

const average = (values: number[]): number =>
  values.length === 0 ? 0 : Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));

const rate = (count: number, total: number): number =>
  total === 0 ? 0 : Number((count / total).toFixed(4));

const summarize = (observations: Observation[]): SummaryRow[] => {
  const rows: SummaryRow[] = [];
  for (const division of LOWER_DIVISIONS) {
    for (const rankBand of RANK_BANDS) {
      for (const record of RECORDS) {
        const group = observations.filter((row) =>
          row.division === division && row.rankBand === rankBand && row.record === record);
        if (group.length === 0) continue;
        const widths = group.map((row) => row.demotionWidth);
        rows.push({
          division,
          rankBand,
          record,
          count: group.length,
          p25: percentile(widths, 0.25),
          p50: percentile(widths, 0.5),
          p75: percentile(widths, 0.75),
          average: average(widths),
          sameDivisionStayRate: rate(group.filter((row) => row.sameDivision).length, group.length),
          demotionToLowerDivisionRate: rate(group.filter((row) => row.demotedToLowerDivision).length, group.length),
          floorClampLikelyRate: rate(group.filter((row) => row.floorClampLikely).length, group.length),
          extremeDemotionOutlierCount: group.filter((row) => row.extremeDemotion).length,
        });
      }
    }
  }
  return rows;
};

const writeMarkdown = (rows: SummaryRow[], meta: Record<string, unknown>): void => {
  const lines = [
    '# Lower Division Realdata Demotion Width',
    '',
    `- generatedAt: ${meta.generatedAt}`,
    `- recordsPath: ${meta.recordsPath}`,
    `- movementsPath: ${meta.movementsPath}`,
    `- scannedRecords: ${meta.scannedRecords}`,
    `- indexedLowerRecords: ${meta.indexedLowerRecords}`,
    `- scannedMovements: ${meta.scannedMovements}`,
    `- observations: ${meta.observations}`,
    '',
    'movement は降下幅を正の slot 数として扱う。東西の半枚差も 1 slot として数える。',
    'rank band は各 division の標準最大枚数に対する from rank number の相対位置で、upper <25%, middle <65%, lower <90%, bottom >=90%。',
    '',
    '| division | band | record | n | p25 | p50 | p75 | avg | same div | lower div | floor likely | extreme |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of rows) {
    lines.push(`| ${row.division} | ${row.rankBand} | ${row.record} | ${row.count} | ${row.p25} | ${row.p50} | ${row.p75} | ${row.average} | ${(row.sameDivisionStayRate * 100).toFixed(1)}% | ${(row.demotionToLowerDivisionRate * 100).toFixed(1)}% | ${(row.floorClampLikelyRate * 100).toFixed(1)}% | ${row.extremeDemotionOutlierCount} |`);
  }
  fs.writeFileSync(OUT_MD, `${lines.join('\n')}\n`);
};

const main = async (): Promise<void> => {
  const recordMap = new Map<string, BashoRecordRow>();
  let scannedRecords = 0;
  for await (const record of streamJsonArrayObjects<BashoRecordRow>(RECORDS_PATH)) {
    scannedRecords += 1;
    if (!isDivision(record.division)) continue;
    if (record.absences && record.absences > 0) continue;
    const bucket = `${record.wins}-${record.losses}`;
    if (!RECORDS.includes(bucket as RecordBucket)) continue;
    const basho = record.sourceBashoKey ?? record.bashoId;
    if (!basho) continue;
    recordMap.set(recordKey(basho, record.rikishiId), record);
  }

  const observations: Observation[] = [];
  let scannedMovements = 0;
  for await (const movement of streamJsonArrayObjects<MovementRow>(MOVEMENTS_PATH)) {
    scannedMovements += 1;
    if (!isDivision(movement.fromDivision)) continue;
    const record = recordMap.get(recordKey(movement.fromBasho, movement.rikishiId));
    if (!record) continue;
    const movementSteps = movement.movementSteps ?? (
      typeof movement.fromGlobalRankIndex === 'number' && typeof movement.toGlobalRankIndex === 'number'
        ? movement.fromGlobalRankIndex - movement.toGlobalRankIndex
        : undefined
    );
    if (typeof movementSteps !== 'number') continue;
    const demotionWidth = Math.max(0, -movementSteps);
    const recordBucket = `${record.wins}-${record.losses}` as RecordBucket;
    const fromDivision = movement.fromDivision;
    const toDivision = movement.toDivision;
    const rankNumber = record.rankNumber ?? DEFAULT_MAX[fromDivision];
    observations.push({
      division: fromDivision,
      rankBand: resolveRankBand(rankNumber, fromDivision),
      record: recordBucket,
      demotionWidth,
      sameDivision: toDivision === fromDivision,
      demotedToLowerDivision: isDivision(toDivision) && DIVISION_ORDER[toDivision] > DIVISION_ORDER[fromDivision],
      floorClampLikely: fromDivision === 'Jonokuchi' && rankNumber >= Math.floor(DEFAULT_MAX.Jonokuchi * 0.9) && demotionWidth <= 2,
      extremeDemotion: demotionWidth >= 100,
    });
  }

  const rows = summarize(observations);
  const meta = {
    generatedAt: new Date().toISOString(),
    recordsPath: path.relative(ROOT, RECORDS_PATH),
    movementsPath: path.relative(ROOT, MOVEMENTS_PATH),
    scannedRecords,
    indexedLowerRecords: recordMap.size,
    scannedMovements,
    observations: observations.length,
  };
  fs.writeFileSync(OUT_JSON, `${JSON.stringify({ meta, rows }, null, 2)}\n`);
  writeMarkdown(rows, meta);
  console.log(`realdata observations=${observations.length}`);
  console.log(path.relative(ROOT, OUT_MD));
  console.log(path.relative(ROOT, OUT_JSON));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
