import { createInitialNpcUniverse } from '../../src/logic/simulation/npc/factory';
import {
  countShikonaBodyChars,
  createNpcNameContext,
  generateUniqueNpcShikona,
  normalizeShikona,
} from '../../src/logic/simulation/npc/npcShikonaGenerator';
import { REAL_SHIKONA_DENYLIST } from '../../src/logic/simulation/npc/shikonaDenylist';
import type { ActorRegistry, NpcNameContext } from '../../src/logic/simulation/npc/types';
import type { Division } from '../../src/logic/models';

type Rng = () => number;

interface NameRecord {
  shikona: string;
  stableId: string;
}

interface MetricSummary {
  label: string;
  total: number;
  duplicateCount: number;
  averageLength: number;
  lengthBuckets: Record<string, number>;
  lengthRates: Record<string, string>;
  forbiddenPatternCount: number;
  prefixHeavyCount: number;
  suffixHeavyCount: number;
  awkwardJoinCount: number;
  denylistHitCount: number;
  rejectedByDenylistCount: number;
  longNames: string[];
  samples: string[];
  stableSummaries: StableMetricSummary[];
}

interface StableMetricSummary {
  stableId: string;
  total: number;
  lengthBuckets: Record<string, number>;
  lengthRates: Record<string, string>;
  topPrefixes: string[];
  topSuffixes: string[];
  samples: string[];
}

const createSeededRng = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pick = <T>(rng: Rng, values: T[]): T => values[Math.floor(rng() * values.length)];

const lengthBucketKey = (length: number): string => (length >= 5 ? '5+' : `${length}`);

const OVERPOWERED_RUN = /[龍雷嵐剛武豪魁鵬翔錦皇覇闘鋼轟烈隼颯猛岩]{3,}/;
const PARTICLE_REPEAT = /[のノ]{2,}/;
const PLACE_REPEAT = /(富士.*富士|海.*海.*海|山.*山.*山)/;
const PREFIXES = ['朝', '若', '琴', '北', '隆', '翔', '錦', '武', '豪', '剛', '旭', '豊', '雷', '荒', '疾', '風'];
const SUFFIXES = ['山', '海', '里', '富士', '龍', '嵐', '風', '光', '翔', '若', '錦', 'ノ海', '乃山', 'ノ山', '乃花'];
const DENYLIST_NORMALIZED = new Set(REAL_SHIKONA_DENYLIST.map((name) => normalizeShikona(name)));

const hasForbiddenPattern = (name: string): boolean =>
  PARTICLE_REPEAT.test(name) || PLACE_REPEAT.test(name) || /[0-9０-９]/.test(name);

const hasAwkwardJoin = (name: string): boolean =>
  OVERPOWERED_RUN.test(name) || /(の龍|の雷|の豪|の剛|の武)$/.test(normalizeShikona(name));

const createEmptyLengthBuckets = (): Record<string, number> => ({ '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 });

const calculateRates = (buckets: Record<string, number>, total: number): Record<string, string> => ({
  '1': `${(((buckets['1'] ?? 0) / Math.max(1, total)) * 100).toFixed(1)}%`,
  '2': `${(((buckets['2'] ?? 0) / Math.max(1, total)) * 100).toFixed(1)}%`,
  '3': `${(((buckets['3'] ?? 0) / Math.max(1, total)) * 100).toFixed(1)}%`,
  '4': `${(((buckets['4'] ?? 0) / Math.max(1, total)) * 100).toFixed(1)}%`,
  '5+': `${(((buckets['5+'] ?? 0) / Math.max(1, total)) * 100).toFixed(1)}%`,
});

const topEntries = (counts: Map<string, number>): string[] =>
  [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 4)
    .map(([label, count]) => `${label}:${count}`);

const summarizeStable = (stableId: string, records: NameRecord[]): StableMetricSummary => {
  const lengthBuckets = createEmptyLengthBuckets();
  const prefixCounts = new Map<string, number>();
  const suffixCounts = new Map<string, number>();

  for (const record of records) {
    const length = countShikonaBodyChars(record.shikona);
    lengthBuckets[lengthBucketKey(length)] += 1;
    const prefix = PREFIXES.find((value) => record.shikona.startsWith(value));
    const suffix = SUFFIXES.find((value) => record.shikona.endsWith(value));
    if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    if (suffix) suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1);
  }

  return {
    stableId,
    total: records.length,
    lengthBuckets,
    lengthRates: calculateRates(lengthBuckets, records.length),
    topPrefixes: topEntries(prefixCounts),
    topSuffixes: topEntries(suffixCounts),
    samples: records.slice(0, 12).map((record) => record.shikona),
  };
};

const summarize = (
  label: string,
  records: NameRecord[],
  rejectedByDenylistCount: number,
): MetricSummary => {
  const seen = new Set<string>();
  let duplicateCount = 0;
  let totalLength = 0;
  const lengthBuckets = createEmptyLengthBuckets();
  const prefixCounts = new Map<string, number>();
  const suffixCounts = new Map<string, number>();
  const recordsByStable = new Map<string, NameRecord[]>();

  for (const { shikona: name } of records) {
    const normalized = normalizeShikona(name);
    if (seen.has(normalized)) duplicateCount += 1;
    seen.add(normalized);
    const length = countShikonaBodyChars(name);
    totalLength += length;
    lengthBuckets[lengthBucketKey(length)] += 1;
    const prefix = PREFIXES.find((value) => name.startsWith(value));
    const suffix = SUFFIXES.find((value) => name.endsWith(value));
    if (prefix) prefixCounts.set(prefix, (prefixCounts.get(prefix) ?? 0) + 1);
    if (suffix) suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1);
  }
  for (const record of records) {
    const stableRecords = recordsByStable.get(record.stableId) ?? [];
    stableRecords.push(record);
    recordsByStable.set(record.stableId, stableRecords);
  }

  const dominantPrefixCount = Math.max(0, ...prefixCounts.values());
  const dominantSuffixCount = Math.max(0, ...suffixCounts.values());

  return {
    label,
    total: records.length,
    duplicateCount,
    averageLength: Number((totalLength / Math.max(1, records.length)).toFixed(2)),
    lengthBuckets,
    lengthRates: calculateRates(lengthBuckets, records.length),
    forbiddenPatternCount: records.filter((record) => hasForbiddenPattern(record.shikona)).length,
    prefixHeavyCount: dominantPrefixCount,
    suffixHeavyCount: dominantSuffixCount,
    awkwardJoinCount: records.filter((record) => hasAwkwardJoin(record.shikona)).length,
    denylistHitCount: records.filter((record) => DENYLIST_NORMALIZED.has(normalizeShikona(record.shikona))).length,
    rejectedByDenylistCount,
    longNames: records.map((record) => record.shikona).filter((name) => countShikonaBodyChars(name) >= 5).slice(0, 40),
    samples: records.map((record) => record.shikona).slice(0, 100),
    stableSummaries: [...recordsByStable.entries()]
      .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0]))
      .slice(0, 8)
      .map(([stableId, stableRecords]) => summarizeStable(stableId, stableRecords)),
  };
};

const printSummary = (summary: MetricSummary): void => {
  console.log(`\n## ${summary.label}`);
  console.log(`生成数: ${summary.total}`);
  console.log(`重複数: ${summary.duplicateCount}`);
  console.log(`平均文字数: ${summary.averageLength}`);
  console.log(`文字数分布: ${JSON.stringify(summary.lengthBuckets)}`);
  console.log(`文字数率: ${JSON.stringify(summary.lengthRates)}`);
  console.log(`禁止パターン件数: ${summary.forbiddenPatternCount}`);
  console.log(`接頭語過多(最多接頭語の件数): ${summary.prefixHeavyCount}`);
  console.log(`接尾語過多(最多接尾語の件数): ${summary.suffixHeavyCount}`);
  console.log(`読みにくい連結の疑い: ${summary.awkwardJoinCount}`);
  console.log(`denylist hit count: ${summary.denylistHitCount}`);
  console.log(`rejected by denylist count: ${summary.rejectedByDenylistCount}`);
  console.log(`長すぎる名前一覧: ${summary.longNames.length > 0 ? summary.longNames.join('、') : 'なし'}`);
  console.log(`サンプル100件: ${summary.samples.join('、')}`);
  console.log('stable別 sample / 分布:');
  for (const stable of summary.stableSummaries) {
    console.log(
      `- ${stable.stableId} n=${stable.total} length=${JSON.stringify(stable.lengthRates)} prefix=${stable.topPrefixes.join(',') || '-'} suffix=${stable.topSuffixes.join(',') || '-'} sample=${stable.samples.join('、')}`,
    );
  }
};

const collectCurrentWorldRecords = (seed: number): { records: NameRecord[]; rejectedByDenylistCount: number } => {
  const universe = createInitialNpcUniverse(createSeededRng(seed));
  return {
    records: [...universe.registry.values()].map((actor) => ({
      shikona: actor.shikona,
      stableId: actor.stableId,
    })),
    rejectedByDenylistCount: universe.nameContext.denylistRejectedCount,
  };
};

const collectCurrentGeneratedRecords = (seed: number, total: number): { records: NameRecord[]; rejectedByDenylistCount: number } => {
  const rng = createSeededRng(seed);
  const context: NpcNameContext = createNpcNameContext();
  const registry: ActorRegistry = new Map();
  const divisions: Division[] = ['Makuuchi', 'Juryo', 'Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi', 'Maezumo'];
  const records: NameRecord[] = [];

  for (let index = 0; index < total; index += 1) {
    const id = `diagnostic-${index + 1}`;
    const division = divisions[index % divisions.length];
    const stableId = `stable-${String((index % 48) + 1).padStart(3, '0')}`;
    const shikona = generateUniqueNpcShikona(stableId, division, rng, context, registry);
    registry.set(id, {
      actorId: id,
      actorType: 'NPC',
      id,
      seedId: 'diagnostic',
      shikona,
      stableId,
      division,
      currentDivision: division,
      rankScore: index + 1,
      basePower: 0,
      ability: 0,
      uncertainty: 0,
      form: 1,
      volatility: 1,
      styleBias: 'BALANCE',
      heightCm: 180,
      weightKg: 140,
      growthBias: 0,
      retirementBias: 0,
      entryAge: 15,
      age: 15,
      careerBashoCount: 0,
      active: true,
      entrySeq: 0,
      recentBashoResults: [],
    });
    records.push({ shikona, stableId });
  }

  return { records, rejectedByDenylistCount: context.denylistRejectedCount };
};

const collectLegacyApproximation = (seed: number, total: number): { records: NameRecord[]; rejectedByDenylistCount: number } => {
  const rng = createSeededRng(seed);
  const crowns = ['朝', '東', '若', '北', '隆', '翔', '武', '豪', '剛', '皇', '鋼', '魁', '雷', '轟', '烈', '猛', '嵐', '迅', '錦', '雅', '桜', '鶴', '旭', '光', '疾', '風', '飛', '蒼', '翔', '雲'];
  const brave = ['龍', '鵬', '覇', '剛', '煌', '魁', '轟', '麒', '鳳', '闘', '嶽', '峰', '鷲', '鋼', '迅', '雷', '烈', '剣', '皇', '翔', '隼', '颯', '雅', '華', '錦', '豪', '武', '輝', '鶴'];
  const core = ['翔', '颯', '隼', '疾', '雲', '嵐', '風', '陽', '光', '陸', '山', '川', '海', '岳', '里', '浜', '嶺', '富', '旭', '道', '桜', '錦', '雅', '華', '輝', '光', '鶴', '乃', '真', '成', '剣', '鋼', '武', '轟', '勝', '雷', '嶽', '皇', '猛', '剛'];
  const patterns = ['AB', 'ABC', 'ABCD', 'ABCDE', 'AノB', 'AのBC'];
  const records: NameRecord[] = [];

  for (let index = 0; index < total; index += 1) {
    const crown = pick(rng, crowns);
    const strong = pick(rng, brave);
    const pattern = pick(rng, patterns);
    const stableId = `legacy-${String((index % 8) + 1).padStart(3, '0')}`;
    if (pattern === 'AB') records.push({ shikona: `${crown}${strong}`, stableId });
    if (pattern === 'ABC') records.push({ shikona: `${crown}${strong}${pick(rng, core)}`, stableId });
    if (pattern === 'ABCD') records.push({ shikona: `${crown}${strong}${pick(rng, core)}${pick(rng, core)}`, stableId });
    if (pattern === 'ABCDE') records.push({ shikona: `${crown}${strong}${pick(rng, core)}${pick(rng, core)}${pick(rng, core)}`, stableId });
    if (pattern === 'AノB') records.push({ shikona: `${crown}ノ${strong}${pick(rng, core)}`, stableId });
    if (pattern === 'AのBC') records.push({ shikona: `${crown}の${strong}${pick(rng, core)}${pick(rng, core)}`, stableId });
  }

  return { records, rejectedByDenylistCount: 0 };
};

const main = (): void => {
  const seed = 20260509;
  const generatedCount = 1200;
  const currentWorld = collectCurrentWorldRecords(seed);
  const currentGenerated = collectCurrentGeneratedRecords(seed + 1, generatedCount);
  const legacyApproximation = collectLegacyApproximation(seed + 2, generatedCount);

  printSummary(summarize('現行 world 初期生成', currentWorld.records, currentWorld.rejectedByDenylistCount));
  printSummary(summarize('現行 generator 単体', currentGenerated.records, currentGenerated.rejectedByDenylistCount));
  printSummary(summarize('旧ロジック近似比較', legacyApproximation.records, legacyApproximation.rejectedByDenylistCount));
};

main();
