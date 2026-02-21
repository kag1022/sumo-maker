import { RandomSource } from '../deps';
import { REAL_SHIKONA_DENYLIST } from './shikonaDenylist';
import { NpcNameContext } from './types';

const STABLE_GLYPHS = [
  '朝', '若', '琴', '栃', '千', '豊', '隆', '北', '翔', '龍',
  '豪', '雅', '鷹', '武', '神', '皇', '海', '山', '嶺', '錦',
];

const BRAVE_KANJI = [
  '龍', '鵬', '覇', '剛', '煌', '魁', '轟', '麒', '鳳', '闘',
  '嶽', '峰', '鷲', '覇', '鋼', '迅', '雷', '烈', '剣', '皇',
];

const CORE_KANJI = [
  '山', '川', '海', '里', '富', '岳', '桜', '雲', '嶺', '錦',
  '丸', '華', '嵐', '陸', '翔', '勝', '陽', '森', '浜', '尾',
  '旭', '光', '輝', '道', '真', '勇', '昇', '剣', '雅', '成',
  '乃', '虎', '鶴', '錦', '翔', '颯', '武', '凱', '隼', '柊',
];

const FORBIDDEN_RANK_WORDS = [
  '横綱',
  '大関',
  '関脇',
  '小結',
  '前頭',
  '十両',
  '幕下',
  '三段目',
  '序二段',
  '序ノ口',
  '前相撲',
];

const FALLBACK_KANJI = ['壱', '弐', '参', '肆', '伍', '陸', '漆', '捌', '玖', '拾'];

const weightedPick = <T>(rng: RandomSource, entries: Array<{ value: T; weight: number }>): T => {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  let point = rng() * total;
  for (const entry of entries) {
    point -= entry.weight;
    if (point <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
};

const pick = <T>(rng: RandomSource, values: T[]): T => values[Math.floor(rng() * values.length)];

const countBodyChars = (shikona: string): number =>
  [...shikona].filter((char) => char !== 'の' && char !== 'ノ').length;

const hasBraveKanji = (shikona: string): boolean => [...shikona].some((char) => BRAVE_KANJI.includes(char));

const hasForbiddenWord = (shikona: string): boolean => FORBIDDEN_RANK_WORDS.some((word) => shikona.includes(word));

export const normalizeShikona = (shikona: string): string =>
  shikona
    .normalize('NFKC')
    .replace(/[・･\s]/g, '')
    .replace(/ノ/g, 'の');

export const createNpcNameContext = (): NpcNameContext => ({
  usedNormalizedShikona: new Set(REAL_SHIKONA_DENYLIST.map((name) => normalizeShikona(name))),
  stableGlyphById: new Map<string, string>(),
  fallbackSerial: 1,
});

const resolveStableGlyph = (stableId: string, rng: RandomSource, context: NpcNameContext): string => {
  const existing = context.stableGlyphById.get(stableId);
  if (existing) return existing;
  const glyph = pick(rng, STABLE_GLYPHS);
  context.stableGlyphById.set(stableId, glyph);
  return glyph;
};

const buildCandidate = (stableGlyph: string, rng: RandomSource): string => {
  const pattern = weightedPick(rng, [
    { value: 'AB', weight: 30 },
    { value: 'ABC', weight: 28 },
    { value: 'ABCD', weight: 18 },
    { value: 'ABCDE', weight: 8 },
    { value: 'AノB', weight: 9 },
    { value: 'AのBC', weight: 7 },
  ] as const);

  const brave = pick(rng, BRAVE_KANJI);
  const core = () => pick(rng, CORE_KANJI);

  if (pattern === 'AB') return `${stableGlyph}${brave}`;
  if (pattern === 'ABC') return `${stableGlyph}${brave}${core()}`;
  if (pattern === 'ABCD') return `${stableGlyph}${brave}${core()}${core()}`;
  if (pattern === 'ABCDE') return `${stableGlyph}${brave}${core()}${core()}${core()}`;
  if (pattern === 'AノB') return `${stableGlyph}ノ${brave}${core()}`;
  return `${stableGlyph}の${brave}${core()}${core()}`;
};

const isValidGeneratedShikona = (
  shikona: string,
  context: NpcNameContext,
): boolean => {
  const normalized = normalizeShikona(shikona);
  if (context.usedNormalizedShikona.has(normalized)) return false;
  if (hasForbiddenWord(shikona)) return false;
  const bodyChars = countBodyChars(shikona);
  if (bodyChars < 2 || bodyChars > 5) return false;
  if (!hasBraveKanji(shikona)) return false;
  return true;
};

const createFallbackName = (stableGlyph: string, context: NpcNameContext): string => {
  const serial = context.fallbackSerial;
  context.fallbackSerial += 1;
  const first = FALLBACK_KANJI[(serial - 1) % FALLBACK_KANJI.length];
  const second = FALLBACK_KANJI[Math.floor((serial - 1) / FALLBACK_KANJI.length) % FALLBACK_KANJI.length];
  return `${stableGlyph}${first}${second}`;
};

export const generateUniqueNpcShikona = (
  stableId: string,
  rng: RandomSource,
  context: NpcNameContext,
): string => {
  const stableGlyph = resolveStableGlyph(stableId, rng, context);
  for (let tries = 0; tries < 128; tries += 1) {
    const candidate = buildCandidate(stableGlyph, rng);
    if (!isValidGeneratedShikona(candidate, context)) continue;
    context.usedNormalizedShikona.add(normalizeShikona(candidate));
    return candidate;
  }

  for (let tries = 0; tries < 128; tries += 1) {
    const fallback = createFallbackName(stableGlyph, context);
    const normalized = normalizeShikona(fallback);
    if (context.usedNormalizedShikona.has(normalized)) continue;
    context.usedNormalizedShikona.add(normalized);
    return fallback;
  }

  const forced = `${stableGlyph}${context.fallbackSerial}${context.fallbackSerial + 1}`;
  context.fallbackSerial += 2;
  context.usedNormalizedShikona.add(normalizeShikona(forced));
  return forced;
};
