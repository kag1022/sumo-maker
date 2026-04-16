import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { Rank } from '../../src/logic/models';
import { generateNextBanzuke } from '../../src/logic/banzuke/providers/topDivision';
import { buildSekitoriContextSnapshot } from '../../src/logic/banzuke/providers/sekitori/scoring';
import { BashoRecordSnapshot } from '../../src/logic/banzuke/providers/sekitori/types';

type ExtractedRank = {
  division: string;
  name: string;
  number?: number;
  side?: 'East' | 'West';
};

type ExtractedRecord = {
  id: string;
  shikona: string;
  rank: ExtractedRank;
  wins: number;
  losses: number;
  absent: number;
};

type ExtractedBasho = {
  bashoCode: string;
  nextBashoCode: string;
  sekitoriRecords: ExtractedRecord[];
  actualNextRanks: Record<string, ExtractedRank>;
};

type CaseCluster = 'M6_10_87' | 'UpperMaegashiraLightMakekoshi' | 'J1_3_12Plus';

type CaseRow = {
  bashoCode: string;
  cluster: CaseCluster;
  currentLabel: string;
  actualBand: string;
  predictedBand: string;
  actualOrdinal: number;
  predictedOrdinal: number;
  pressure: number;
};

type ClusterSummary = {
  cluster: CaseCluster;
  sampleSize: number;
  bandMatchRate: number;
  actualHighMean: number | null;
  actualLowMean: number | null;
  predictedHighMean: number | null;
  predictedLowMean: number | null;
  directionMatch: boolean | null;
};

type ExchangeSummary = {
  exactMatchRate: number;
  meanAbsoluteError: number;
  actualDistribution: Record<string, number>;
  predictedDistribution: Record<string, number>;
};

type ValidationSummary = {
  generatedAt: string;
  analyzedBashoCount: number;
  clusterSummaries: ClusterSummary[];
  exchangeSummary: ExchangeSummary;
};

const ROOT_DIR = process.cwd();
const DB_PATH = path.join(ROOT_DIR, 'sumo-db', 'data', 'sumodb.sqlite');
const REPORT_PATH = path.join(ROOT_DIR, 'docs', 'balance', 'banzuke-context-validation.md');
const JSON_PATH = path.join(ROOT_DIR, '.tmp', 'banzuke-context-validation.json');

const PYTHON_EXTRACT = `
import json
import sqlite3
import sys

db_path = sys.argv[1]
con = sqlite3.connect(db_path)
cur = con.cursor()
cur.execute("""
SELECT basho_code
FROM basho_metadata
WHERE parse_status = 'ok'
ORDER BY basho_year, basho_month
""")
codes = [row[0] for row in cur.fetchall()]

payload = []
for index in range(len(codes) - 1):
    basho_code = codes[index]
    next_basho_code = codes[index + 1]
    cur.execute("""
    SELECT
        rikishi_id,
        COALESCE(shikona, ''),
        division,
        rank_name,
        rank_number,
        side,
        wins,
        losses,
        absences
    FROM rikishi_basho_record
    WHERE basho_code = ?
      AND division IN ('幕内', '十両')
      AND parse_status = 'ok'
    ORDER BY
      CASE division WHEN '幕内' THEN 0 ELSE 1 END,
      rank_number,
      CASE side WHEN '東' THEN 0 ELSE 1 END
    """, (basho_code,))
    records = []
    ids = []
    for row in cur.fetchall():
        rikishi_id, shikona, division, rank_name, rank_number, side, wins, losses, absences = row
        rikishi_key = str(rikishi_id) if rikishi_id is not None else f"{shikona}:{division}:{rank_name}:{rank_number}:{side}"
        ids.append(rikishi_key)
        rank = {
            "division": division,
            "name": rank_name,
            "side": side,
        }
        if rank_number is not None and rank_number > 0:
            rank["number"] = rank_number
        records.append({
            "id": rikishi_key,
            "shikona": shikona or rikishi_key,
            "rank": rank,
            "wins": wins,
            "losses": losses,
            "absent": absences,
        })

    cur.execute("""
    SELECT
        rikishi_id,
        COALESCE(shikona, ''),
        division,
        rank_name,
        rank_number,
        side
    FROM rikishi_basho_record
    WHERE basho_code = ?
      AND parse_status = 'ok'
    """, (next_basho_code,))
    actual_next = {}
    for row in cur.fetchall():
        rikishi_id, shikona, division, rank_name, rank_number, side = row
        rikishi_key = str(rikishi_id) if rikishi_id is not None else f"{shikona}:{division}:{rank_name}:{rank_number}:{side}"
        if rikishi_key not in ids:
            continue
        rank = {
            "division": division,
            "name": rank_name,
            "side": side,
        }
        if rank_number is not None and rank_number > 0:
            rank["number"] = rank_number
        actual_next[rikishi_key] = rank

    if records:
        payload.append({
            "bashoCode": basho_code,
            "nextBashoCode": next_basho_code,
            "sekitoriRecords": records,
            "actualNextRanks": actual_next,
        })

print(json.dumps(payload, ensure_ascii=True))
`;

const writeFile = (filePath: string, text: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
};

const toInternalDivision = (division: string): Rank['division'] => {
  switch (division) {
    case '幕内':
      return 'Makuuchi';
    case '十両':
      return 'Juryo';
    case '幕下':
      return 'Makushita';
    case '三段目':
      return 'Sandanme';
    case '序二段':
      return 'Jonidan';
    case '序ノ口':
      return 'Jonokuchi';
    case '前相撲':
      return 'Maezumo';
    default:
      return division as Rank['division'];
  }
};

const toInternalSide = (side: string | undefined): 'East' | 'West' | undefined => {
  if (side === '東' || side === 'East') return 'East';
  if (side === '西' || side === 'West') return 'West';
  return undefined;
};

const toRank = (rank: ExtractedRank): Rank => ({
  division: toInternalDivision(rank.division),
  name: rank.name,
  side: toInternalSide(rank.side),
  number: rank.number,
});

const extractBashoPayloads = (): ExtractedBasho[] => {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`Missing sqlite source: ${DB_PATH}`);
  }
  const stdout = execFileSync(
    'python',
    ['-c', PYTHON_EXTRACT, DB_PATH],
    { encoding: 'utf8', cwd: ROOT_DIR, maxBuffer: 64 * 1024 * 1024 },
  );
  return JSON.parse(stdout) as ExtractedBasho[];
};

const rankToLabel = (rank: Rank): string => {
  const side = rank.side === 'West' ? 'W' : 'E';
  if (rank.division === 'Makuuchi' && ['横綱', '大関', '関脇', '小結'].includes(rank.name)) {
    return `${rank.name}${side}`;
  }
  return `${rank.name}${rank.number ?? ''}${side}`;
};

const toLandingBand = (rank: Rank): string => {
  if (rank.division === 'Makuuchi') {
    if (['横綱', '大関', '関脇', '小結'].includes(rank.name)) return 'SANYAKU';
    if ((rank.number ?? 99) <= 5) return 'M1-5';
    if ((rank.number ?? 99) <= 10) return 'M6-10';
    return 'M11+';
  }
  if (rank.division === 'Juryo') {
    if ((rank.number ?? 99) <= 3) return 'J1-3';
    if ((rank.number ?? 99) <= 7) return 'J4-7';
    return 'J8-14';
  }
  if (rank.division === 'Makushita') {
    if ((rank.number ?? 99) <= 5) return 'MS1-5';
    return 'MS6+';
  }
  return rank.division;
};

const toBandOrdinal = (band: string): number => {
  switch (band) {
    case 'SANYAKU':
      return 0;
    case 'M1-5':
      return 1;
    case 'M6-10':
      return 2;
    case 'M11+':
      return 3;
    case 'J1-3':
      return 4;
    case 'J4-7':
      return 5;
    case 'J8-14':
      return 6;
    case 'MS1-5':
      return 7;
    case 'MS6+':
      return 8;
    default:
      return 9;
  }
};

const mean = (values: number[]): number | null => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const round = (value: number | null): number | null =>
  value === null ? null : Number(value.toFixed(3));

const bucketCounts = (values: number[]): Record<string, number> =>
  values.reduce<Record<string, number>>((acc, value) => {
    const key = String(value);
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

const renderDirection = (summary: ClusterSummary): string => {
  if (summary.directionMatch === null) return 'N/A';
  return summary.directionMatch ? '一致' : '不一致';
};

const renderDistribution = (distribution: Record<string, number>): string => {
  const entries = Object.entries(distribution).sort((a, b) => Number(a[0]) - Number(b[0]));
  if (!entries.length) return 'なし';
  return entries.map(([count, sample]) => `${count}:${sample}`).join(' / ');
};

const buildCaseCluster = (record: BashoRecordSnapshot): CaseCluster | null => {
  if (
    record.rank.division === 'Makuuchi' &&
    record.rank.name === '前頭' &&
    typeof record.rank.number === 'number' &&
    record.rank.number >= 6 &&
    record.rank.number <= 10 &&
    record.wins === 8 &&
    record.losses === 7 &&
    record.absent === 0
  ) {
    return 'M6_10_87';
  }
  if (
    record.rank.division === 'Makuuchi' &&
    record.rank.name === '前頭' &&
    typeof record.rank.number === 'number' &&
    record.rank.number <= 5 &&
    record.absent === 0 &&
    (
      (record.wins === 7 && record.losses === 8) ||
      (record.wins === 6 && record.losses === 9)
    )
  ) {
    return 'UpperMaegashiraLightMakekoshi';
  }
  if (
    record.rank.division === 'Juryo' &&
    typeof record.rank.number === 'number' &&
    record.rank.number <= 3 &&
    record.wins >= 12
  ) {
    return 'J1_3_12Plus';
  }
  return null;
};

const resolvePressure = (
  cluster: CaseCluster,
  context: ReturnType<typeof buildSekitoriContextSnapshot>,
): number => {
  if (cluster === 'J1_3_12Plus') {
    return context.makuuchiDemotionOpenings * 2 + Math.max(0, context.upperCollapseCount - context.upperBlockerCount);
  }
  return (
    context.sanyakuVacancies +
    context.makuuchiDemotionOpenings +
    Math.max(0, context.upperCollapseCount - context.upperBlockerCount)
  );
};

const summarizeCluster = (
  cluster: CaseCluster,
  rows: CaseRow[],
): ClusterSummary => {
  const bandMatchRate = rows.length
    ? rows.filter((row) => row.actualBand === row.predictedBand).length / rows.length
    : 0;
  if (rows.length < 4) {
    return {
      cluster,
      sampleSize: rows.length,
      bandMatchRate: Number(bandMatchRate.toFixed(3)),
      actualHighMean: null,
      actualLowMean: null,
      predictedHighMean: null,
      predictedLowMean: null,
      directionMatch: null,
    };
  }

  const sortedPressure = rows.map((row) => row.pressure).sort((a, b) => a - b);
  const threshold = sortedPressure[Math.floor(sortedPressure.length / 2)];
  const high = rows.filter((row) => row.pressure >= threshold);
  const low = rows.filter((row) => row.pressure < threshold);

  const actualHighMean = mean(high.map((row) => row.actualOrdinal));
  const actualLowMean = mean(low.map((row) => row.actualOrdinal));
  const predictedHighMean = mean(high.map((row) => row.predictedOrdinal));
  const predictedLowMean = mean(low.map((row) => row.predictedOrdinal));

  const actualDirection =
    actualHighMean === null || actualLowMean === null ? 0 : Math.sign(actualLowMean - actualHighMean);
  const predictedDirection =
    predictedHighMean === null || predictedLowMean === null ? 0 : Math.sign(predictedLowMean - predictedHighMean);

  return {
    cluster,
    sampleSize: rows.length,
    bandMatchRate: Number(bandMatchRate.toFixed(3)),
    actualHighMean: round(actualHighMean),
    actualLowMean: round(actualLowMean),
    predictedHighMean: round(predictedHighMean),
    predictedLowMean: round(predictedLowMean),
    directionMatch: actualDirection === predictedDirection,
  };
};

const renderClusterLabel = (cluster: CaseCluster): string => {
  switch (cluster) {
    case 'M6_10_87':
      return '前頭6-10 の 8-7';
    case 'UpperMaegashiraLightMakekoshi':
      return '前頭上位の軽負け越し';
    case 'J1_3_12Plus':
      return '十両1-3 の 12勝以上';
    default:
      return cluster;
  }
};

const renderReport = (summary: ValidationSummary): string => {
  const lines = [
    '# 番付 Context Validation',
    '',
    `- 実行日: ${summary.generatedAt}`,
    `- 対象場所数: ${summary.analyzedBashoCount}`,
    '- 目的: 独自ロジックの出力を実データと照合し、着地帯と文脈変化方向の一致を見る。',
    '- 注記: 実データは仕様源ではなく、監査ベンチとしてのみ扱う。',
    '',
    '## 着地帯一致',
    '',
    ...summary.clusterSummaries.map((row) =>
      `- ${renderClusterLabel(row.cluster)}: 件数=${row.sampleSize}, 着地帯一致率=${(row.bandMatchRate * 100).toFixed(1)}%, 圧力方向=${renderDirection(row)}`),
    '',
    '## 高圧 / 低圧 比較',
    '',
    ...summary.clusterSummaries.map((row) =>
      `- ${renderClusterLabel(row.cluster)}: 実データ high=${row.actualHighMean ?? 'N/A'} / low=${row.actualLowMean ?? 'N/A'}, 独自ロジック high=${row.predictedHighMean ?? 'N/A'} / low=${row.predictedLowMean ?? 'N/A'}`),
    '',
    '## 幕内↔十両 交換枠',
    '',
    `- exact match rate: ${(summary.exchangeSummary.exactMatchRate * 100).toFixed(1)}%`,
    `- mean absolute error: ${summary.exchangeSummary.meanAbsoluteError.toFixed(3)}`,
    `- actual distribution: ${renderDistribution(summary.exchangeSummary.actualDistribution)}`,
    `- predicted distribution: ${renderDistribution(summary.exchangeSummary.predictedDistribution)}`,
    '',
  ];
  return lines.join('\n');
};

const run = (): void => {
  const payloads = extractBashoPayloads();
  const caseRows: CaseRow[] = [];
  const actualPromotionCounts: number[] = [];
  const predictedPromotionCounts: number[] = [];

  for (const payload of payloads) {
    const records: BashoRecordSnapshot[] = payload.sekitoriRecords.map((row) => ({
      id: row.id,
      shikona: row.shikona,
      rank: toRank(row.rank),
      wins: row.wins,
      losses: row.losses,
      absent: row.absent,
    }));
    if (!records.length) continue;

    const context = buildSekitoriContextSnapshot(records);
    const predicted = generateNextBanzuke(records);
    const predictedById = new Map(predicted.map((row) => [row.id, row.nextRank]));

    actualPromotionCounts.push(
      records.filter((row) => {
        const next = payload.actualNextRanks[row.id];
        return row.rank.division === 'Juryo' && next && toRank(next).division === 'Makuuchi';
      }).length,
    );
    predictedPromotionCounts.push(
      predicted.filter((row) => row.currentRank.division === 'Juryo' && row.nextRank.division === 'Makuuchi').length,
    );

    for (const record of records) {
      const cluster = buildCaseCluster(record);
      if (!cluster) continue;
      const actualNext = payload.actualNextRanks[record.id];
      const predictedNext = predictedById.get(record.id);
      if (!actualNext || !predictedNext) continue;

      const actualBand = toLandingBand(toRank(actualNext));
      const predictedBand = toLandingBand(predictedNext);
      caseRows.push({
        bashoCode: payload.bashoCode,
        cluster,
        currentLabel: rankToLabel(record.rank),
        actualBand,
        predictedBand,
        actualOrdinal: toBandOrdinal(actualBand),
        predictedOrdinal: toBandOrdinal(predictedBand),
        pressure: resolvePressure(cluster, context),
      });
    }
  }

  const clusterSummaries: ClusterSummary[] = ([
    'M6_10_87',
    'UpperMaegashiraLightMakekoshi',
    'J1_3_12Plus',
  ] as const).map((cluster) => summarizeCluster(
    cluster,
    caseRows.filter((row) => row.cluster === cluster),
  ));

  const exactMatches = actualPromotionCounts.filter((count, index) => count === predictedPromotionCounts[index]).length;
  const maeValues = actualPromotionCounts.map((count, index) => Math.abs(count - predictedPromotionCounts[index]));
  const summary: ValidationSummary = {
    generatedAt: new Date().toISOString(),
    analyzedBashoCount: payloads.length,
    clusterSummaries,
    exchangeSummary: {
      exactMatchRate: actualPromotionCounts.length ? exactMatches / actualPromotionCounts.length : 0,
      meanAbsoluteError: mean(maeValues) ?? 0,
      actualDistribution: bucketCounts(actualPromotionCounts),
      predictedDistribution: bucketCounts(predictedPromotionCounts),
    },
  };

  writeFile(JSON_PATH, JSON.stringify({ summary, caseRows }, null, 2));
  writeFile(REPORT_PATH, renderReport(summary));
  process.stdout.write(`${REPORT_PATH}\n${JSON_PATH}\n`);
};

run();
