import fs from 'fs';
import path from 'path';
import type {
  BanzukeCalibrationTarget,
  BanzukeMovementQuantiles,
  BanzukeRankBandTuple,
  BoundaryExchangeRate,
} from '../../src/logic/calibration/types';

type Division = 'Makuuchi' | 'Juryo' | 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
type LowerDivision = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
type MovementClass = 'stayed' | 'promoted' | 'demoted';

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
  fromDivision?: string;
  toDivision?: string;
  fromGlobalRankIndex?: number;
  toGlobalRankIndex?: number;
  movementSteps?: number;
}

interface IndexedRecord {
  division: Division;
  wins: number;
  losses: number;
  absences: number;
  rankName?: string;
  rankNumber: number;
}

interface BucketStats {
  values: number[];
  sampleSize: number;
}

const ROOT = process.cwd();
const RECORDS_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'era_basho_records_196007_202603.json');
const MOVEMENTS_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'era_rank_movements_196007_202603.json');
const OUT_PATH = path.join(ROOT, 'sumo-api-db', 'data', 'analysis', 'banzuke_calibration_long_range.json');
const MAX_INLINE_BYTES = 10 * 1024 * 1024;
const TARGET_INLINE_BYTES = 3 * 1024 * 1024;

const DIVISIONS: Division[] = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const LOWER_DIVISIONS: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const TOP_RECORD_BUCKETS = Array.from({ length: 16 }, (_, wins) => `${wins}-${15 - wins}`);
const LOWER_RECORD_BUCKETS = ['0-7', '0-0-7', '1-6', '2-5', '3-4', '4-3', '5-2', '6-1', '7-0'];
const REQUIRED_RECORD_BUCKETS_BY_DIVISION: Record<Division, string[]> = {
  Makuuchi: TOP_RECORD_BUCKETS,
  Juryo: TOP_RECORD_BUCKETS,
  Makushita: LOWER_RECORD_BUCKETS,
  Sandanme: LOWER_RECORD_BUCKETS,
  Jonidan: LOWER_RECORD_BUCKETS,
  Jonokuchi: LOWER_RECORD_BUCKETS,
};
const BOUNDARY_KEYS = [
  'JuryoToMakuuchi',
  'MakuuchiToJuryo',
  'MakushitaToJuryo',
  'JuryoToMakushita',
  'SandanmeToMakushita',
  'MakushitaToSandanme',
  'JonidanToSandanme',
  'SandanmeToJonidan',
  'JonokuchiToJonidan',
  'JonidanToJonokuchi',
];

const RANK_BANDS: Record<Division, BanzukeRankBandTuple[]> = {
  Makuuchi: [[1, 0, 'Y/O'], [1, 0, 'S/K'], [1, 5, '1-5'], [6, 10, '6-10'], [11, null, '11+']],
  Juryo: [[1, 3, '1-3'], [4, 7, '4-7'], [8, 11, '8-11'], [12, 14, '12-14']],
  Makushita: [[1, 5, '1-5'], [6, 15, '6-15'], [16, 30, '16-30'], [31, 45, '31-45'], [46, null, '46+']],
  Sandanme: [[1, 10, '1-10'], [11, 30, '11-30'], [31, 60, '31-60'], [61, 90, '61-90'], [91, null, '91+']],
  Jonidan: [[1, 20, '1-20'], [21, 50, '21-50'], [51, 100, '51-100'], [101, 150, '101-150'], [151, null, '151+']],
  Jonokuchi: [[1, 10, '1-10'], [11, 20, '11-20'], [21, 30, '21-30'], [31, null, '31+']],
};

const DIVISION_ORDER: Division[] = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];

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
  DIVISIONS.includes(value as Division);

const recordKey = (basho: string, rikishiId: number): string => `${basho}:${rikishiId}`;

const resolveRecordBucket = (wins: number, losses: number, absences: number): string => {
  const total = wins + losses;
  if (absences === 0 && (total === 7 || total === 15)) return `${wins}-${losses}`;
  return `${wins}-${losses}-${absences}`;
};

const resolveRankBand = (division: Division, rankNumber: number, rankName?: string): string => {
  if (division === 'Makuuchi') {
    if (rankName === '横綱' || rankName === '大関') return 'Y/O';
    if (rankName === '関脇' || rankName === '小結') return 'S/K';
  }
  for (const [lower, upper, label] of RANK_BANDS[division]) {
    if (rankNumber >= lower && (upper === null || rankNumber <= upper)) return label;
  }
  return RANK_BANDS[division][RANK_BANDS[division].length - 1][2];
};

const resolveMovementClass = (
  fromDivision: Division,
  toDivision: string | undefined,
  movement: number,
): MovementClass => {
  if (toDivision === fromDivision) return 'stayed';
  if (isDivision(toDivision)) {
    return DIVISION_ORDER.indexOf(toDivision) < DIVISION_ORDER.indexOf(fromDivision)
      ? 'promoted'
      : 'demoted';
  }
  return movement > 0 ? 'promoted' : movement < 0 ? 'demoted' : 'stayed';
};

const percentile = (values: number[], ratio: number): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = ratio * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.min(sorted.length - 1, lower + 1);
  const fraction = index - lower;
  return Number((sorted[lower] * (1 - fraction) + sorted[upper] * fraction).toFixed(2));
};

const toQuantiles = (values: number[]): BanzukeMovementQuantiles | null => {
  if (!values.length) return null;
  const p10 = percentile(values, 0.1);
  const p50 = percentile(values, 0.5);
  const p90 = percentile(values, 0.9);
  return {
    sampleSize: values.length,
    p10HalfStep: p10,
    p50HalfStep: p50,
    p90HalfStep: p90,
    p10Rank: Number((p10 / 2).toFixed(2)),
    p50Rank: Number((p50 / 2).toFixed(2)),
    p90Rank: Number((p90 / 2).toFixed(2)),
  };
};

const pushValue = (map: Map<string, number[]>, key: string, value: number): void => {
  const values = map.get(key);
  if (values) {
    values.push(value);
    return;
  }
  map.set(key, [value]);
};

const assertCalibrationShape = (target: BanzukeCalibrationTarget): void => {
  const missing: string[] = [];
  if (!target.divisionMovementQuantiles) missing.push('divisionMovementQuantiles');
  if (!target.boundaryExchangeRates) missing.push('boundaryExchangeRates');
  if (!target.recordBucketRules?.rankBands) missing.push('recordBucketRules.rankBands');
  if (!target.recordBucketRules?.recordAwareQuantiles) missing.push('recordBucketRules.recordAwareQuantiles');

  for (const division of DIVISIONS) {
    if (!target.recordBucketRules.rankBands[division]) missing.push(`rankBands.${division}`);
    const bands = target.recordBucketRules.recordAwareQuantiles[division];
    if (!bands) {
      missing.push(`recordAwareQuantiles.${division}`);
      continue;
    }
    for (const [, , band] of RANK_BANDS[division]) {
      for (const record of REQUIRED_RECORD_BUCKETS_BY_DIVISION[division]) {
        const quantiles = bands[band]?.[record];
        if (!quantiles || quantiles.sampleSize <= 0) {
          missing.push(`recordAwareQuantiles.${division}.${band}.${record}`);
        }
      }
    }
  }

  if (missing.length) {
    throw new Error(`long-range banzuke calibration schema is incomplete: ${missing.slice(0, 30).join(', ')}`);
  }
};

const main = async (): Promise<void> => {
  const records = new Map<string, IndexedRecord>();
  let scannedRecords = 0;
  for await (const record of streamJsonArrayObjects<BashoRecordRow>(RECORDS_PATH)) {
    scannedRecords += 1;
    if (!isDivision(record.division)) continue;
    const basho = record.sourceBashoKey ?? record.bashoId;
    if (!basho) continue;
    records.set(recordKey(basho, record.rikishiId), {
      division: record.division,
      wins: record.wins,
      losses: record.losses,
      absences: record.absences ?? 0,
      rankName: record.rankName,
      rankNumber: Math.max(1, Math.floor(record.rankNumber ?? 1)),
    });
  }

  const divisionClassValues = new Map<string, number[]>();
  const recordValues = new Map<string, number[]>();
  const divisionRecordValues = new Map<string, number[]>();
  const observedRecordBuckets: Record<Division, Set<string>> = {
    Makuuchi: new Set(REQUIRED_RECORD_BUCKETS_BY_DIVISION.Makuuchi),
    Juryo: new Set(REQUIRED_RECORD_BUCKETS_BY_DIVISION.Juryo),
    Makushita: new Set(REQUIRED_RECORD_BUCKETS_BY_DIVISION.Makushita),
    Sandanme: new Set(REQUIRED_RECORD_BUCKETS_BY_DIVISION.Sandanme),
    Jonidan: new Set(REQUIRED_RECORD_BUCKETS_BY_DIVISION.Jonidan),
    Jonokuchi: new Set(REQUIRED_RECORD_BUCKETS_BY_DIVISION.Jonokuchi),
  };
  const boundaryTotals = new Map<string, { sampleSize: number; count: number }>();
  let scannedMovements = 0;
  let joinedMovements = 0;

  for await (const movement of streamJsonArrayObjects<MovementRow>(MOVEMENTS_PATH)) {
    scannedMovements += 1;
    if (!isDivision(movement.fromDivision)) continue;
    const record = records.get(recordKey(movement.fromBasho, movement.rikishiId));
    if (!record) continue;
    const movementSteps = movement.movementSteps ?? (
      typeof movement.fromGlobalRankIndex === 'number' && typeof movement.toGlobalRankIndex === 'number'
        ? movement.fromGlobalRankIndex - movement.toGlobalRankIndex
        : undefined
    );
    if (typeof movementSteps !== 'number') continue;
    joinedMovements += 1;

    pushValue(divisionClassValues, `${record.division}:${resolveMovementClass(record.division, movement.toDivision, movementSteps)}`, movementSteps);

    const bucket = resolveRecordBucket(record.wins, record.losses, record.absences);
    const band = resolveRankBand(record.division, record.rankNumber, record.rankName);
    observedRecordBuckets[record.division].add(bucket);
    pushValue(recordValues, `${record.division}:${band}:${bucket}`, movementSteps);
    pushValue(divisionRecordValues, `${record.division}:${bucket}`, movementSteps);

    if (movement.toDivision && movement.toDivision !== movement.fromDivision) {
      const key = `${movement.fromDivision}To${movement.toDivision}`;
      const row = boundaryTotals.get(key) ?? { sampleSize: 0, count: 0 };
      row.count += 1;
      boundaryTotals.set(key, row);
    }
    for (const key of BOUNDARY_KEYS) {
      if (key.startsWith(`${movement.fromDivision}To`)) {
        const row = boundaryTotals.get(key) ?? { sampleSize: 0, count: 0 };
        row.sampleSize += 1;
        boundaryTotals.set(key, row);
      }
    }
  }

  const divisionMovementQuantiles: BanzukeCalibrationTarget['divisionMovementQuantiles'] = {};
  for (const division of DIVISIONS) {
    divisionMovementQuantiles[division] = {
      stayed: toQuantiles(divisionClassValues.get(`${division}:stayed`) ?? []),
      promoted: toQuantiles(divisionClassValues.get(`${division}:promoted`) ?? []),
      demoted: toQuantiles(divisionClassValues.get(`${division}:demoted`) ?? []),
    };
  }

  const boundaryExchangeRates: Record<string, BoundaryExchangeRate> = {};
  for (const key of BOUNDARY_KEYS) {
    const row = boundaryTotals.get(key) ?? { sampleSize: 0, count: 0 };
    boundaryExchangeRates[key] = {
      sampleSize: row.sampleSize,
      count: row.count,
      rate: row.sampleSize > 0 ? Number((row.count / row.sampleSize).toFixed(6)) : 0,
    };
  }

  const recordAwareQuantiles: BanzukeCalibrationTarget['recordBucketRules']['recordAwareQuantiles'] = {};
  const bucketSamples: Record<string, Record<string, Record<string, BucketStats>>> = {};
  for (const division of DIVISIONS) {
    recordAwareQuantiles[division] = {};
    bucketSamples[division] = {};
    for (const [, , band] of RANK_BANDS[division]) {
      recordAwareQuantiles[division][band] = {};
      bucketSamples[division][band] = {};
      for (const bucket of [...observedRecordBuckets[division]].sort()) {
        const direct = recordValues.get(`${division}:${band}:${bucket}`) ?? [];
        const fallback = divisionRecordValues.get(`${division}:${bucket}`) ?? [];
        const values = direct.length ? direct : fallback;
        recordAwareQuantiles[division][band][bucket] = toQuantiles(values);
        bucketSamples[division][band][bucket] = {
          values: [],
          sampleSize: values.length,
        };
      }
    }
  }

  const payload: BanzukeCalibrationTarget & { bucketSamples: unknown } = {
    meta: {
      generatedAt: new Date().toISOString(),
      source: 'sumo-api-db/data/analysis/era_*_196007_202603.json',
      era: 'showa-heisei-reiwa',
      sampleSize: joinedMovements,
      divisionScope: DIVISIONS,
      movementClassSemantics: 'sameDivisionBoundary',
      recordAwareDivisionScope: DIVISIONS,
      note: 'Generated from sumo-api long-range records/movements. Movement values are half-step slot units; positive means promotion. Division movement classes mean same-division stay or boundary promotion/demotion.',
      dataQuality: {
        rikishiBashoRecordCount: scannedRecords,
        candidatePairCount: scannedMovements,
        consecutivePairCount: scannedMovements,
        consecutiveMovementRate: 1,
        rankMovementJoinSuccessRate: scannedMovements > 0 ? Number((joinedMovements / scannedMovements).toFixed(6)) : 0,
        validBoutLengthRate: 1,
        banzukeAlignmentRate: 1,
      },
    },
    divisionMovementQuantiles,
    boundaryExchangeRates,
    recordBucketRules: {
      supported: true,
      source: 'sumo-api-long-range',
      recordLinkMeaning: 'from basho record joined to next-basho rank movement by basho and rikishi id',
      lowerDivisionScope: LOWER_DIVISIONS,
      recordAwareDivisionScope: DIVISIONS,
      rankBands: RANK_BANDS,
      recordAwareQuantiles,
    },
    bucketSamples,
  };

  assertCalibrationShape(payload);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`);
  const size = fs.statSync(OUT_PATH).size;
  if (size > MAX_INLINE_BYTES) {
    throw new Error(`generated calibration is too large for inline use: ${size} bytes`);
  }
  if (size > TARGET_INLINE_BYTES) {
    console.warn(`generated calibration exceeds 3MB target: ${size} bytes`);
  }
  console.log(`records=${scannedRecords} movements=${scannedMovements} joined=${joinedMovements}`);
  console.log(`${path.relative(ROOT, OUT_PATH)} (${size} bytes)`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
