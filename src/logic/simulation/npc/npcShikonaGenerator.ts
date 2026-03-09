import { Division } from '../../models';
import { RandomSource } from '../deps';
import { IchimonId, resolveIchimonByStableId } from './stableCatalog';
import { REAL_SHIKONA_DENYLIST } from './shikonaDenylist';
import { ActorRegistry, NpcNameContext, NpcNamingSchoolId } from './types';

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

const CORE_FAMILY_NAMES = [
  '佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤',
  '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水',
  '山崎', '森', '池田', '橋本', '阿部', '石川', '山下', '中島', '前田', '藤田',
  '小川', '後藤', '岡田', '長谷川', '村上', '近藤', '石井', '坂本', '遠藤', '青木',
  '藤井', '西村', '福田', '太田', '三浦', '藤原', '岡本', '松田', '中川', '中野',
  '原田', '小野', '田村', '竹内', '金子', '和田', '中山', '石田', '上田', '森田',
  '原', '柴田', '酒井', '工藤', '横山', '宮崎', '宮本', '内田', '高木', '安藤',
  '谷口', '大野', '丸山', '今井', '河野', '藤本', '村田', '武田', '上野', '杉山',
  '増田', '小島', '小山', '千葉', '久保', '松井', '岩崎', '野口', '田口', '横田',
  '松岡', '黒田', '岩田', '吉川', '川口', '辻', '本田', '坂井', '平野', '久保田',
  '大西', '岩本', '星野', '矢野', '浜田', '北村', '浅野', '秋山', '沢田', '川上',
  '荒木', '関', '石原', '宮下', '堀', '堀江', '桑原', '桑田', '川崎', '寺田',
  '大塚', '高田', '尾崎', '坂田', '小松', '浜崎', '土屋', '吉村', '野村', '熊谷',
];

const SURNAME_LEFT_PARTS = [
  '朝', '東', '北', '南', '西', '中', '上', '下', '大', '小',
  '高', '低', '長', '短', '若', '古', '青', '赤', '白', '黒',
  '金', '銀', '玉', '岩', '石', '木', '林', '森', '山', '川',
  '谷', '浜', '海', '嶋', '島', '原', '井', '岡', '沢', '田',
  '村', '野', '藤', '松', '竹', '梅', '桜', '菊', '鶴', '龍',
];

const SURNAME_RIGHT_PARTS = [
  '田', '山', '川', '本', '村', '野', '原', '崎', '沢', '島',
  '橋', '口', '井', '岡', '上', '下', '谷', '浜', '松', '木',
  '林', '森', '藤', '池', '瀬', '戸', '寺', '宮', '沢', '垣',
  '塚', '尾', '野', '関', '沢', '谷', '野', '浜', '川', '橋',
];

const BRAVE_KANJI = [
  '龍', '鵬', '覇', '剛', '煌', '魁', '轟', '麒', '鳳', '闘',
  '嶽', '峰', '鷲', '鋼', '迅', '雷', '烈', '剣', '皇', '翔',
  '隼', '颯', '雅', '華', '錦', '豪', '武', '輝', '鶴',
];

const SCHOOL_BRAVE_KANJI: Record<NpcNamingSchoolId, string[]> = {
  HAYATE: ['迅', '翔', '颯', '隼', '雷', '烈'],
  TRADITION: ['龍', '鵬', '峰', '嶽', '魁', '皇'],
  KAREI: ['雅', '鳳', '華', '錦', '輝', '鶴'],
  GORIKI: ['剛', '鋼', '豪', '武', '闘', '覇'],
};

const SCHOOL_CORE_KANJI: Record<NpcNamingSchoolId, string[]> = {
  HAYATE: ['翔', '颯', '隼', '疾', '雲', '嵐', '風', '陽', '光', '陸'],
  TRADITION: ['山', '川', '海', '岳', '里', '浜', '嶺', '富', '旭', '道'],
  KAREI: ['桜', '錦', '雅', '華', '輝', '光', '鶴', '乃', '真', '成'],
  GORIKI: ['剣', '鋼', '武', '轟', '勝', '雷', '嶽', '皇', '猛', '剛'],
};

type ShikonaPattern = 'AB' | 'ABC' | 'ABCD' | 'ABCDE' | 'AノB' | 'AのBC';

type WeightedEntry<T> = { value: T; weight: number };

type IchimonNamingProfile = {
  crownPrefixes: string[];
  schoolMix: WeightedEntry<NpcNamingSchoolId>[];
};

const ICHIMON_NAMING_PROFILES: Record<IchimonId, IchimonNamingProfile> = {
  TAIJU: {
    crownPrefixes: ['朝', '東', '若', '北', '隆', '翔'],
    schoolMix: [
      { value: 'TRADITION', weight: 50 },
      { value: 'GORIKI', weight: 30 },
      { value: 'KAREI', weight: 20 },
    ],
  },
  KUROGANE: {
    crownPrefixes: ['武', '豪', '剛', '皇', '鋼', '魁'],
    schoolMix: [
      { value: 'GORIKI', weight: 55 },
      { value: 'TRADITION', weight: 20 },
      { value: 'HAYATE', weight: 25 },
    ],
  },
  RAIMEI: {
    crownPrefixes: ['雷', '轟', '烈', '猛', '嵐', '迅'],
    schoolMix: [
      { value: 'GORIKI', weight: 50 },
      { value: 'HAYATE', weight: 35 },
      { value: 'TRADITION', weight: 15 },
    ],
  },
  HAKUTSURU: {
    crownPrefixes: ['錦', '雅', '桜', '鶴', '旭', '光'],
    schoolMix: [
      { value: 'KAREI', weight: 55 },
      { value: 'TRADITION', weight: 30 },
      { value: 'HAYATE', weight: 15 },
    ],
  },
  HAYATE: {
    crownPrefixes: ['疾', '風', '飛', '蒼', '翔', '雲'],
    schoolMix: [
      { value: 'HAYATE', weight: 50 },
      { value: 'GORIKI', weight: 25 },
      { value: 'TRADITION', weight: 25 },
    ],
  },
};

const SCHOOL_PATTERN_WEIGHTS: Record<NpcNamingSchoolId, WeightedEntry<ShikonaPattern>[]> = {
  HAYATE: [
    { value: 'AB', weight: 22 },
    { value: 'ABC', weight: 34 },
    { value: 'ABCD', weight: 20 },
    { value: 'ABCDE', weight: 8 },
    { value: 'AノB', weight: 10 },
    { value: 'AのBC', weight: 6 },
  ],
  TRADITION: [
    { value: 'AB', weight: 18 },
    { value: 'ABC', weight: 28 },
    { value: 'ABCD', weight: 24 },
    { value: 'ABCDE', weight: 10 },
    { value: 'AノB', weight: 8 },
    { value: 'AのBC', weight: 12 },
  ],
  KAREI: [
    { value: 'AB', weight: 12 },
    { value: 'ABC', weight: 24 },
    { value: 'ABCD', weight: 30 },
    { value: 'ABCDE', weight: 14 },
    { value: 'AノB', weight: 8 },
    { value: 'AのBC', weight: 12 },
  ],
  GORIKI: [
    { value: 'AB', weight: 30 },
    { value: 'ABC', weight: 30 },
    { value: 'ABCD', weight: 20 },
    { value: 'ABCDE', weight: 10 },
    { value: 'AノB', weight: 6 },
    { value: 'AのBC', weight: 4 },
  ],
};

const weightedPick = <T>(rng: RandomSource, entries: WeightedEntry<T>[]): T => {
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

const buildSurnameCandidates = (): string[] => {
  const candidates = new Set<string>();

  for (const surname of CORE_FAMILY_NAMES) {
    const length = [...surname].length;
    if (length >= 2 && length <= 4) {
      candidates.add(surname);
    }
  }

  for (const left of SURNAME_LEFT_PARTS) {
    for (const right of SURNAME_RIGHT_PARTS) {
      const candidate = `${left}${right}`;
      const length = [...candidate].length;
      if (length < 2 || length > 4) continue;
      if (hasForbiddenWord(candidate)) continue;
      candidates.add(candidate);
    }
  }

  return [...candidates];
};

const SURNAME_CANDIDATES = buildSurnameCandidates();
const SURNAME_NORMALIZED_SET = new Set(SURNAME_CANDIDATES.map((name) => normalizeShikona(name)));

const resolveSurnameRate = (division: Division): number =>
  division === 'Makuuchi' || division === 'Juryo' ? 0.07 : 0.30;

const isValidSurnameShikona = (shikona: string): boolean => {
  if (hasForbiddenWord(shikona)) return false;
  const bodyChars = countBodyChars(shikona);
  return bodyChars >= 2 && bodyChars <= 4;
};

const isValidStyledShikona = (shikona: string): boolean => {
  if (hasForbiddenWord(shikona)) return false;
  const bodyChars = countBodyChars(shikona);
  if (bodyChars < 2 || bodyChars > 5) return false;
  return hasBraveKanji(shikona);
};

const buildActiveNormalizedShikonaSet = (
  registry: ActorRegistry,
  ignoreActorId?: string,
): Set<string> => {
  const activeNames = new Set<string>();
  for (const actor of registry.values()) {
    if (!actor.active) continue;
    if (ignoreActorId && actor.id === ignoreActorId) continue;
    activeNames.add(normalizeShikona(actor.shikona));
  }
  return activeNames;
};

export const isSurnameShikona = (shikona: string): boolean =>
  SURNAME_NORMALIZED_SET.has(normalizeShikona(shikona));

export const createNpcNameContext = (): NpcNameContext => ({
  blockedNormalizedShikona: new Set(REAL_SHIKONA_DENYLIST.map((name) => normalizeShikona(name))),
  stableCrownById: new Map<string, string>(),
  stableSchoolById: new Map<string, NpcNamingSchoolId>(),
  fallbackSerial: 1,
});

const resolveStableNamingProfile = (stableId: string): IchimonNamingProfile => {
  const ichimonId = resolveIchimonByStableId(stableId);
  return ICHIMON_NAMING_PROFILES[ichimonId];
};

const resolveStableCrown = (
  stableId: string,
  rng: RandomSource,
  context: NpcNameContext,
): string => {
  const existing = context.stableCrownById.get(stableId);
  if (existing) return existing;
  const profile = resolveStableNamingProfile(stableId);
  const crown = pick(rng, profile.crownPrefixes);
  context.stableCrownById.set(stableId, crown);
  return crown;
};

const resolveStableSchool = (
  stableId: string,
  rng: RandomSource,
  context: NpcNameContext,
): NpcNamingSchoolId => {
  const existing = context.stableSchoolById.get(stableId);
  if (existing) return existing;
  const profile = resolveStableNamingProfile(stableId);
  const school = weightedPick(rng, profile.schoolMix);
  context.stableSchoolById.set(stableId, school);
  return school;
};

const buildStyledCandidate = (
  crownPrefix: string,
  school: NpcNamingSchoolId,
  rng: RandomSource,
): string => {
  const pattern = weightedPick(rng, SCHOOL_PATTERN_WEIGHTS[school]);
  const brave = pick(rng, SCHOOL_BRAVE_KANJI[school]);
  const core = (): string => pick(rng, SCHOOL_CORE_KANJI[school]);

  if (pattern === 'AB') return `${crownPrefix}${brave}`;
  if (pattern === 'ABC') return `${crownPrefix}${brave}${core()}`;
  if (pattern === 'ABCD') return `${crownPrefix}${brave}${core()}${core()}`;
  if (pattern === 'ABCDE') return `${crownPrefix}${brave}${core()}${core()}${core()}`;
  if (pattern === 'AノB') return `${crownPrefix}ノ${brave}${core()}`;
  return `${crownPrefix}の${brave}${core()}${core()}`;
};

const createFallbackName = (crownPrefix: string, context: NpcNameContext): string => {
  const serial = context.fallbackSerial;
  context.fallbackSerial += 1;
  const first = FALLBACK_KANJI[(serial - 1) % FALLBACK_KANJI.length];
  const second = FALLBACK_KANJI[Math.floor((serial - 1) / FALLBACK_KANJI.length) % FALLBACK_KANJI.length];
  return `${crownPrefix}${first}${second}`;
};

export const generateUniqueNpcShikona = (
  stableId: string,
  division: Division,
  rng: RandomSource,
  context: NpcNameContext,
  registry: ActorRegistry,
  ignoreActorId?: string,
): string => {
  const crownPrefix = resolveStableCrown(stableId, rng, context);
  const school = resolveStableSchool(stableId, rng, context);
  const activeNormalized = buildActiveNormalizedShikonaSet(registry, ignoreActorId);
  const blocked = context.blockedNormalizedShikona;

  const isTaken = (shikona: string): boolean => {
    const normalized = normalizeShikona(shikona);
    return blocked.has(normalized) || activeNormalized.has(normalized);
  };

  const reserve = (shikona: string): string => {
    activeNormalized.add(normalizeShikona(shikona));
    return shikona;
  };

  if (rng() < resolveSurnameRate(division)) {
    for (let tries = 0; tries < 160; tries += 1) {
      const candidate = pick(rng, SURNAME_CANDIDATES);
      if (!isValidSurnameShikona(candidate)) continue;
      if (isTaken(candidate)) continue;
      return reserve(candidate);
    }
  }

  for (let tries = 0; tries < 256; tries += 1) {
    const candidate = buildStyledCandidate(crownPrefix, school, rng);
    if (!isValidStyledShikona(candidate)) continue;
    if (isTaken(candidate)) continue;
    return reserve(candidate);
  }

  for (let tries = 0; tries < 256; tries += 1) {
    const fallback = createFallbackName(crownPrefix, context);
    if (hasForbiddenWord(fallback)) continue;
    if (isTaken(fallback)) continue;
    return reserve(fallback);
  }

  for (let tries = 0; tries < 256; tries += 1) {
    const forced = `${crownPrefix}${context.fallbackSerial}`;
    context.fallbackSerial += 1;
    if (hasForbiddenWord(forced)) continue;
    if (isTaken(forced)) continue;
    return reserve(forced);
  }

  const emergency = `${crownPrefix}${Date.now()}`;
  return reserve(emergency);
};
