import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

interface KimariteRealdataFrequencyRow {
  kimariteId: string;
  canonicalName: string;
  observedCount: number;
  observedRate: number;
  source: string;
  sourcePeriod: string;
  sourceTotalBouts: number;
  observedInSource: boolean;
}

const SOURCE_URL = 'https://www.sumo.or.jp/Kimarite/show';
const SOURCE_LABEL = '日本相撲協会公式サイト 決まり手ランキング';
const SOURCE_PERIOD = '平成二十五年一月場所〜令和八年三月場所千秋楽';
const SOURCE_TOTAL_BOUTS = 185_957;

const OUTPUT_PATHS = [
  'src/logic/kimarite/data/kimarite_realdata_frequency.json',
  'docs/design/kimarite_realdata_frequency.json',
];

const normalizeText = (value: string): string =>
  value
    .normalize('NFC')
    .replace(/投げ/g, '投げ')
    .replace(/呼び/g, '呼び')
    .replace(/浴び/g, '浴び')
    .replace(/つきひざ/g, 'つきひざ')
    .replace(/打っ棄り/g, 'うっちゃり')
    .replace(/\s+/g, '')
    .trim();

const toKimariteId = (name: string): string =>
  encodeURIComponent(name).replace(/%/g, '').toLowerCase();

const decodeEntities = (value: string): string =>
  value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"');

const stripTags = (value: string): string =>
  decodeEntities(value.replace(/<[^>]+>/g, ' '));

const extractRankingTable = (html: string): KimariteRealdataFrequencyRow[] => {
  const rankAnchor = html.indexOf('id="rank"');
  const rankingHtml = rankAnchor >= 0 ? html.slice(rankAnchor) : html;
  const rowMatches = rankingHtml.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  const rows: KimariteRealdataFrequencyRow[] = [];

  for (const rowHtml of rowMatches) {
    const cells = rowHtml.match(/<td[\s\S]*?<\/td>/g) ?? [];
    if (cells.length < 4) continue;
    const rankText = stripTags(cells[0]);
    if (!/\d+位/.test(rankText)) continue;

    const nameMatch = cells[1].match(/<span class="fnt18">([\s\S]*?)<\/span>/);
    if (!nameMatch) continue;
    const canonicalName = normalizeText(stripTags(nameMatch[1]));
    const observedCount = Number(stripTags(cells[2]).replace(/,/g, '').trim());
    if (!Number.isFinite(observedCount)) continue;
    const observedRate = observedCount / SOURCE_TOTAL_BOUTS;

    rows.push({
      kimariteId: toKimariteId(canonicalName),
      canonicalName,
      observedCount,
      observedRate,
      source: SOURCE_LABEL,
      sourcePeriod: SOURCE_PERIOD,
      sourceTotalBouts: SOURCE_TOTAL_BOUTS,
      observedInSource: observedCount > 0,
    });
  }

  return rows;
};

const main = async (): Promise<void> => {
  const response = await fetch(SOURCE_URL, {
    headers: {
      'user-agent': 'Mozilla/5.0 (sumo-maker kimarite calibration)',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
  }

  const html = await response.text();
  const rows = extractRankingTable(html);
  if (rows.length < 82) {
    throw new Error(`Expected at least 82 kimarite rows, got ${rows.length}`);
  }

  const payload = {
    sourceUrl: SOURCE_URL,
    source: SOURCE_LABEL,
    sourcePeriod: SOURCE_PERIOD,
    sourceTotalBouts: SOURCE_TOTAL_BOUTS,
    generatedAt: new Date().toISOString(),
    rows,
  };

  for (const outputPath of OUTPUT_PATHS) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATHS.join(', ')}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
