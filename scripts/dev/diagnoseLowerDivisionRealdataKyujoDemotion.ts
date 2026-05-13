import fs from 'fs';
import path from 'path';

type Division = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
type RankBand = 'upper' | 'middle' | 'lower' | 'bottom';
type RecordType = '0-7' | '0-0-7';

interface BashoRecordRow {
  sourceBashoKey?: string;
  bashoId?: string;
  division: string;
  rikishiId: number;
  rankNumber?: number;
  wins: number;
  losses: number;
  absences?: number;
}

interface MovementRow {
  rikishiId: number;
  fromBasho: string;
  fromDivision?: string;
  toDivision?: string;
  fromBanzukeLabel?: string;
  toBanzukeLabel?: string;
  movementSteps?: number;
}

interface Observation {
  recordType: RecordType;
  fromDivision: Division;
  fromRankBand: RankBand;
  fromRankNumber: number;
  toDivision: Division | 'Other';
  toRankNumber: number | null;
  fromBanzukeLabel?: string;
  toBanzukeLabel?: string;
  sameDivision: boolean;
  demotedToLowerDivision: boolean;
  sandanme40To60: boolean;
}

interface SummaryRow {
  recordType: RecordType;
  fromDivision: Division;
  fromRankBand: RankBand;
  count: number;
  toDivisionDistribution: Record<string, number>;
  toRankP25: number;
  toRankP50: number;
  toRankP75: number;
  sameDivisionStayRate: number;
  demotionToLowerDivisionRate: number;
  deepLandingRate: number;
}

const ROOT = process.cwd();
const RECORDS_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'era_basho_records_196007_202603.json');
const MOVEMENTS_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'era_rank_movements_196007_202603.json');
const OUT_JSON = path.join(ROOT, 'docs', 'design', 'lower_division_realdata_kyujo_demotion.json');
const OUT_MD = path.join(ROOT, 'docs', 'design', 'lower_division_realdata_kyujo_demotion.md');

const LOWER_DIVISIONS: Division[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
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

const isDivision = (value: string | undefined): value is Division =>
  LOWER_DIVISIONS.includes(value as Division);

const recordKey = (basho: string, rikishiId: number): string => `${basho}:${rikishiId}`;

const resolveRecordType = (record: BashoRecordRow): RecordType | null => {
  const absent = record.absences ?? 0;
  if (record.wins === 0 && record.losses === 7 && absent === 0) return '0-7';
  if (record.wins === 0 && record.losses === 0 && absent >= 7) return '0-0-7';
  return null;
};

const resolveRankBand = (rankNumber: number, division: Division): RankBand => {
  const progress = (rankNumber - 1) / Math.max(1, DEFAULT_MAX[division] - 1);
  if (progress < 0.25) return 'upper';
  if (progress < 0.65) return 'middle';
  if (progress < 0.9) return 'lower';
  return 'bottom';
};

const parseRankNumber = (label: string | undefined): number | null => {
  if (!label) return null;
  const match = label.match(/(\d+)枚目/);
  return match ? Number.parseInt(match[1], 10) : null;
};

const percentile = (values: number[], p: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * p)));
  return Number(sorted[index].toFixed(2));
};

const rate = (count: number, total: number): number =>
  total === 0 ? 0 : Number((count / total).toFixed(4));

const summarize = (observations: Observation[]): SummaryRow[] => {
  const rows: SummaryRow[] = [];
  for (const recordType of ['0-7', '0-0-7'] as const) {
    for (const fromDivision of LOWER_DIVISIONS) {
      for (const fromRankBand of ['upper', 'middle', 'lower', 'bottom'] as const) {
        const group = observations.filter((row) =>
          row.recordType === recordType &&
          row.fromDivision === fromDivision &&
          row.fromRankBand === fromRankBand);
        if (!group.length) continue;
        const toRanks = group.map((row) => row.toRankNumber).filter((value): value is number => value !== null);
        const toDivisionDistribution: Record<string, number> = {};
        for (const row of group) {
          toDivisionDistribution[row.toDivision] = (toDivisionDistribution[row.toDivision] ?? 0) + 1;
        }
        rows.push({
          recordType,
          fromDivision,
          fromRankBand,
          count: group.length,
          toDivisionDistribution,
          toRankP25: percentile(toRanks, 0.25),
          toRankP50: percentile(toRanks, 0.5),
          toRankP75: percentile(toRanks, 0.75),
          sameDivisionStayRate: rate(group.filter((row) => row.sameDivision).length, group.length),
          demotionToLowerDivisionRate: rate(group.filter((row) => row.demotedToLowerDivision).length, group.length),
          deepLandingRate: rate(group.filter((row) => row.toDivision === 'Jonidan' && (row.toRankNumber ?? 0) >= 91).length, group.length),
        });
      }
    }
  }
  return rows;
};

const summarizeSandanme40To60 = (observations: Observation[]): Record<RecordType, Record<string, number>> => {
  const result: Record<RecordType, Record<string, number>> = {
    '0-7': {},
    '0-0-7': {},
  };
  for (const recordType of ['0-7', '0-0-7'] as const) {
    const group = observations.filter((row) => row.recordType === recordType && row.sandanme40To60);
    result[recordType] = {
      count: group.length,
      jonidan1To30: group.filter((row) => row.toDivision === 'Jonidan' && (row.toRankNumber ?? 0) >= 1 && (row.toRankNumber ?? 0) <= 30).length,
      jonidan31To60: group.filter((row) => row.toDivision === 'Jonidan' && (row.toRankNumber ?? 0) >= 31 && (row.toRankNumber ?? 0) <= 60).length,
      jonidan61To90: group.filter((row) => row.toDivision === 'Jonidan' && (row.toRankNumber ?? 0) >= 61 && (row.toRankNumber ?? 0) <= 90).length,
      jonidan91Plus: group.filter((row) => row.toDivision === 'Jonidan' && (row.toRankNumber ?? 0) >= 91).length,
      toRankP25: percentile(group.map((row) => row.toRankNumber).filter((value): value is number => value !== null), 0.25),
      toRankP50: percentile(group.map((row) => row.toRankNumber).filter((value): value is number => value !== null), 0.5),
      toRankP75: percentile(group.map((row) => row.toRankNumber).filter((value): value is number => value !== null), 0.75),
    };
  }
  return result;
};

const renderMarkdown = (
  meta: Record<string, unknown>,
  summary: SummaryRow[],
  sandanme40To60: Record<RecordType, Record<string, number>>,
  samples: Observation[],
): string => [
  '# Lower Division Realdata Kyujo Demotion',
  '',
  `- generatedAt: ${meta.generatedAt}`,
  `- scannedRecords: ${meta.scannedRecords}`,
  `- indexedTargetRecords: ${meta.indexedTargetRecords}`,
  `- scannedMovements: ${meta.scannedMovements}`,
  `- observations: ${meta.observations}`,
  '',
  '全休条件は `wins=0, losses=0, absences>=7`。0-7 は `wins=0, losses=7, absences=0` として分離。',
  '',
  '## Summary',
  '',
  '| record | from | band | n | to divisions | to rank p25/p50/p75 | same div | lower div | Jonidan 91+ |',
  '| --- | --- | --- | ---: | --- | --- | ---: | ---: | ---: |',
  ...summary.map((row) => `| ${row.recordType} | ${row.fromDivision} | ${row.fromRankBand} | ${row.count} | ${Object.entries(row.toDivisionDistribution).map(([key, value]) => `${key}:${value}`).join(', ')} | ${row.toRankP25}/${row.toRankP50}/${row.toRankP75} | ${(row.sameDivisionStayRate * 100).toFixed(1)}% | ${(row.demotionToLowerDivisionRate * 100).toFixed(1)}% | ${(row.deepLandingRate * 100).toFixed(1)}% |`),
  '',
  '## Sandanme 40-60',
  '',
  '| record | n | Jonidan 1-30 | 31-60 | 61-90 | 91+ | to rank p25/p50/p75 |',
  '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...(['0-7', '0-0-7'] as const).map((recordType) => {
    const row = sandanme40To60[recordType];
    return `| ${recordType} | ${row.count ?? 0} | ${row.jonidan1To30 ?? 0} | ${row.jonidan31To60 ?? 0} | ${row.jonidan61To90 ?? 0} | ${row.jonidan91Plus ?? 0} | ${row.toRankP25 ?? 0}/${row.toRankP50 ?? 0}/${row.toRankP75 ?? 0} |`;
  }),
  '',
  '## Sandanme 40-60 Samples',
  '',
  ...samples
    .filter((row) => row.sandanme40To60)
    .slice(0, 30)
    .map((row) => `- ${row.recordType}: ${row.fromBanzukeLabel ?? `${row.fromDivision}${row.fromRankNumber}`} -> ${row.toBanzukeLabel ?? `${row.toDivision}${row.toRankNumber ?? '-'}`}`),
  '',
].join('\n');

const main = async (): Promise<void> => {
  const recordMap = new Map<string, BashoRecordRow & { recordType: RecordType }>();
  let scannedRecords = 0;
  for await (const record of streamJsonArrayObjects<BashoRecordRow>(RECORDS_PATH)) {
    scannedRecords += 1;
    if (!isDivision(record.division)) continue;
    const recordType = resolveRecordType(record);
    if (!recordType) continue;
    const basho = record.sourceBashoKey ?? record.bashoId;
    if (!basho || !record.rankNumber) continue;
    recordMap.set(recordKey(basho, record.rikishiId), { ...record, recordType });
  }

  const observations: Observation[] = [];
  let scannedMovements = 0;
  for await (const movement of streamJsonArrayObjects<MovementRow>(MOVEMENTS_PATH)) {
    scannedMovements += 1;
    const record = recordMap.get(recordKey(movement.fromBasho, movement.rikishiId));
    if (!record || !isDivision(record.division)) continue;
    const toDivision = isDivision(movement.toDivision) ? movement.toDivision : 'Other';
    const toRankNumber = parseRankNumber(movement.toBanzukeLabel);
    observations.push({
      recordType: record.recordType,
      fromDivision: record.division,
      fromRankBand: resolveRankBand(record.rankNumber ?? 1, record.division),
      fromRankNumber: record.rankNumber ?? 1,
      toDivision,
      toRankNumber,
      fromBanzukeLabel: movement.fromBanzukeLabel,
      toBanzukeLabel: movement.toBanzukeLabel,
      sameDivision: toDivision === record.division,
      demotedToLowerDivision: toDivision !== 'Other' && DIVISION_ORDER[toDivision] > DIVISION_ORDER[record.division],
      sandanme40To60: record.division === 'Sandanme' && (record.rankNumber ?? 0) >= 40 && (record.rankNumber ?? 0) <= 60,
    });
  }

  const summary = summarize(observations);
  const sandanme40To60 = summarizeSandanme40To60(observations);
  const samples = observations.filter((row) => row.sandanme40To60).slice(0, 50);
  const meta = {
    generatedAt: new Date().toISOString(),
    recordsPath: RECORDS_PATH,
    movementsPath: MOVEMENTS_PATH,
    scannedRecords,
    indexedTargetRecords: recordMap.size,
    scannedMovements,
    observations: observations.length,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, `${JSON.stringify({ meta, summary, sandanme40To60, samples }, null, 2)}\n`);
  fs.writeFileSync(OUT_MD, `${renderMarkdown(meta, summary, sandanme40To60, samples)}\n`);
  console.log(path.relative(ROOT, OUT_MD));
  console.log(path.relative(ROOT, OUT_JSON));
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
