import { Division } from '../../models';
import { RandomSource } from '../deps';
import { IchimonId, resolveIchimonByStableId } from './stableCatalog';
import { REAL_SHIKONA_DENYLIST } from './shikonaDenylist';
import { ActorRegistry, NpcNameContext, NpcNamingSchoolId, NpcStableNamingProfileId } from './types';

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
  '高', '長', '若', '古', '青', '赤', '白', '黒',
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

const SHIKONA_SIGNALS = [
  '龍', '鵬', '剛', '魁', '峰', '嶽', '雷', '翔', '錦', '豪', '武', '輝',
  '鶴', '山', '海', '富士', '風', '光', '若', '里', '浜', '岳', '桜',
  '勝', '嵐', '川',
];

const SCHOOL_STEMS: Record<NpcNamingSchoolId, string[]> = {
  HAYATE: ['翔', '颯', '隼', '疾', '風', '雲', '光', '青', '晴', '早'],
  TRADITION: ['山', '海', '岳', '里', '浜', '峰', '富', '旭', '道', '國'],
  KAREI: ['錦', '桜', '雅', '華', '輝', '光', '鶴', '真', '清', '彩'],
  GORIKI: ['剛', '武', '勝', '雷', '嶽', '猛', '龍', '力', '岩', '荒'],
};

const SCHOOL_SUFFIXES: Record<NpcNamingSchoolId, string[]> = {
  HAYATE: ['風', '翔', '光', '嵐', '若', '海'],
  TRADITION: ['山', '海', '里', '富士', 'ノ海', '乃山'],
  KAREI: ['錦', '光', '桜', '翔', '若', '乃花'],
  GORIKI: ['龍', '嵐', '山', '剛', '海', 'ノ山'],
};

const PARTICLE_SAFE_SUFFIXES: Record<NpcNamingSchoolId, string[]> = {
  HAYATE: ['風', '翔', '光', '嵐', '若', '海'],
  TRADITION: ['山', '海', '里', '富士'],
  KAREI: ['錦', '光', '桜', '翔', '若'],
  GORIKI: ['龍', '嵐', '山', '剛', '海'],
};

const LONG_SUFFIX_BONUS = ['富士', 'ノ海', '乃山', '乃花'];

const PLACE_STEMS = [
  '伊予', '讃岐', '出羽', '越前', '越後', '紀州', '肥後', '筑紫',
  '日向', '常陸', '安芸', '土佐', '信濃', '上総', '房総', '津軽',
];

const SIMPLE_STEMS = [
  '青', '白', '若', '朝', '琴', '錦', '武', '豪', '剛', '翔',
  '旭', '隆', '豊', '栄', '清', '大', '玉', '岩', '浜', '北',
];

type ShikonaPattern =
  | 'CROWN_STEM'
  | 'CROWN_SUFFIX'
  | 'CROWN_STEM_SUFFIX'
  | 'STEM_SUFFIX'
  | 'PLACE_SUFFIX'
  | 'PLACE_PARTICLE'
  | 'SIMPLE_TWO'
  | 'NO_PARTICLE'
  | 'LONG_TRADITION';

type WeightedEntry<T> = { value: T; weight: number };

type IchimonNamingProfile = {
  crownPrefixes: string[];
  schoolMix: WeightedEntry<NpcNamingSchoolId>[];
};

type StableNamingProfile = {
  prefixBias: string[];
  suffixBias: string[];
  patternBias: WeightedEntry<ShikonaPattern>[];
  schoolBias?: WeightedEntry<NpcNamingSchoolId>[];
  surnameRateMultiplier: number;
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
    crownPrefixes: ['武', '豪', '剛', '荒', '岩', '魁'],
    schoolMix: [
      { value: 'GORIKI', weight: 55 },
      { value: 'TRADITION', weight: 20 },
      { value: 'HAYATE', weight: 25 },
    ],
  },
  RAIMEI: {
    crownPrefixes: ['雷', '荒', '武', '猛', '嵐', '迅'],
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
    { value: 'CROWN_STEM', weight: 16 },
    { value: 'CROWN_SUFFIX', weight: 12 },
    { value: 'CROWN_STEM_SUFFIX', weight: 20 },
    { value: 'STEM_SUFFIX', weight: 24 },
    { value: 'PLACE_SUFFIX', weight: 9 },
    { value: 'PLACE_PARTICLE', weight: 4 },
    { value: 'SIMPLE_TWO', weight: 9 },
    { value: 'NO_PARTICLE', weight: 5 },
    { value: 'LONG_TRADITION', weight: 1 },
  ],
  TRADITION: [
    { value: 'CROWN_STEM', weight: 12 },
    { value: 'CROWN_SUFFIX', weight: 12 },
    { value: 'CROWN_STEM_SUFFIX', weight: 18 },
    { value: 'STEM_SUFFIX', weight: 20 },
    { value: 'PLACE_SUFFIX', weight: 18 },
    { value: 'PLACE_PARTICLE', weight: 8 },
    { value: 'SIMPLE_TWO', weight: 8 },
    { value: 'NO_PARTICLE', weight: 6 },
    { value: 'LONG_TRADITION', weight: 2 },
  ],
  KAREI: [
    { value: 'CROWN_STEM', weight: 14 },
    { value: 'CROWN_SUFFIX', weight: 12 },
    { value: 'CROWN_STEM_SUFFIX', weight: 18 },
    { value: 'STEM_SUFFIX', weight: 28 },
    { value: 'PLACE_SUFFIX', weight: 9 },
    { value: 'PLACE_PARTICLE', weight: 4 },
    { value: 'SIMPLE_TWO', weight: 13 },
    { value: 'NO_PARTICLE', weight: 5 },
    { value: 'LONG_TRADITION', weight: 1 },
  ],
  GORIKI: [
    { value: 'CROWN_STEM', weight: 18 },
    { value: 'CROWN_SUFFIX', weight: 14 },
    { value: 'CROWN_STEM_SUFFIX', weight: 18 },
    { value: 'STEM_SUFFIX', weight: 22 },
    { value: 'PLACE_SUFFIX', weight: 7 },
    { value: 'PLACE_PARTICLE', weight: 3 },
    { value: 'SIMPLE_TWO', weight: 12 },
    { value: 'NO_PARTICLE', weight: 5 },
    { value: 'LONG_TRADITION', weight: 1 },
  ],
};

const STABLE_NAMING_PROFILES: Record<NpcStableNamingProfileId, StableNamingProfile> = {
  CLASSIC_WAKA: {
    prefixBias: ['若', '旭', '朝'],
    suffixBias: ['山', '海', '里', '富士'],
    patternBias: [
      { value: 'CROWN_STEM_SUFFIX', weight: 24 },
      { value: 'STEM_SUFFIX', weight: 20 },
      { value: 'PLACE_SUFFIX', weight: 12 },
      { value: 'SIMPLE_TWO', weight: 8 },
    ],
    schoolBias: [{ value: 'TRADITION', weight: 18 }],
    surnameRateMultiplier: 0.9,
  },
  REFINED_KOTO: {
    prefixBias: ['琴', '清', '錦'],
    suffixBias: ['錦', '光', '翔', '若'],
    patternBias: [
      { value: 'CROWN_STEM_SUFFIX', weight: 20 },
      { value: 'STEM_SUFFIX', weight: 24 },
      { value: 'CROWN_SUFFIX', weight: 10 },
      { value: 'SIMPLE_TWO', weight: 9 },
    ],
    schoolBias: [{ value: 'KAREI', weight: 20 }],
    surnameRateMultiplier: 0.8,
  },
  GORIKI_DRAGON: {
    prefixBias: ['武', '剛', '龍', '豪'],
    suffixBias: ['龍', '嵐', '山', '海'],
    patternBias: [
      { value: 'CROWN_STEM_SUFFIX', weight: 20 },
      { value: 'CROWN_STEM', weight: 12 },
      { value: 'STEM_SUFFIX', weight: 18 },
      { value: 'SIMPLE_TWO', weight: 10 },
    ],
    schoolBias: [{ value: 'GORIKI', weight: 24 }],
    surnameRateMultiplier: 0.7,
  },
  NATURE: {
    prefixBias: ['山', '海', '浜', '峰'],
    suffixBias: ['山', '海', '富士', 'ノ海', '乃山'],
    patternBias: [
      { value: 'PLACE_SUFFIX', weight: 18 },
      { value: 'PLACE_PARTICLE', weight: 10 },
      { value: 'STEM_SUFFIX', weight: 18 },
      { value: 'CROWN_STEM_SUFFIX', weight: 14 },
    ],
    schoolBias: [{ value: 'TRADITION', weight: 18 }],
    surnameRateMultiplier: 0.9,
  },
  LOCAL: {
    prefixBias: ['東', '北', '南', '旭'],
    suffixBias: ['山', '海', '里', '富士'],
    patternBias: [
      { value: 'PLACE_SUFFIX', weight: 24 },
      { value: 'PLACE_PARTICLE', weight: 12 },
      { value: 'STEM_SUFFIX', weight: 16 },
      { value: 'SIMPLE_TWO', weight: 8 },
    ],
    surnameRateMultiplier: 1,
  },
  PLAIN: {
    prefixBias: ['隆', '栄', '玉', '豊'],
    suffixBias: ['山', '海', '里', '光'],
    patternBias: [
      { value: 'SIMPLE_TWO', weight: 24 },
      { value: 'CROWN_STEM', weight: 18 },
      { value: 'STEM_SUFFIX', weight: 12 },
      { value: 'CROWN_STEM_SUFFIX', weight: 8 },
    ],
    surnameRateMultiplier: 1.1,
  },
  SURNAME: {
    prefixBias: ['東', '北', '西', '高'],
    suffixBias: ['山', '川', '海', '里'],
    patternBias: [
      { value: 'SIMPLE_TWO', weight: 16 },
      { value: 'STEM_SUFFIX', weight: 12 },
      { value: 'PLACE_SUFFIX', weight: 8 },
    ],
    surnameRateMultiplier: 2.8,
  },
};

const PROFILE_MIX: WeightedEntry<NpcStableNamingProfileId>[] = [
  { value: 'CLASSIC_WAKA', weight: 18 },
  { value: 'REFINED_KOTO', weight: 15 },
  { value: 'GORIKI_DRAGON', weight: 17 },
  { value: 'NATURE', weight: 16 },
  { value: 'LOCAL', weight: 14 },
  { value: 'PLAIN', weight: 12 },
  { value: 'SURNAME', weight: 8 },
];

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

const mergeWeights = <T>(base: WeightedEntry<T>[], bias: WeightedEntry<T>[]): WeightedEntry<T>[] => {
  const merged = base.map((entry) => ({ ...entry }));
  for (const biased of bias) {
    const existing = merged.find((entry) => entry.value === biased.value);
    if (existing) existing.weight += biased.weight;
    else merged.push({ ...biased });
  }
  return merged;
};

const withBiasValues = <T>(base: T[], bias: T[]): T[] => [...bias, ...bias, ...base];

export const countShikonaBodyChars = (shikona: string): number =>
  [...shikona].filter((char) => char !== 'の' && char !== 'ノ').length;

const hasShikonaSignal = (shikona: string): boolean =>
  SHIKONA_SIGNALS.some((signal) => shikona.includes(signal));

const hasForbiddenWord = (shikona: string): boolean => FORBIDDEN_RANK_WORDS.some((word) => shikona.includes(word));

const hasAwkwardSequence = (shikona: string): boolean => {
  const normalized = normalizeShikona(shikona);
  if (/[の]{2,}/.test(normalized)) return true;
  if (/(.)\1/.test(normalized)) return true;
  if (/^(.+)の\1$/.test(normalized)) return true;
  if (/[の][乃ノ]/.test(shikona)) return true;
  if (/[龍雷嵐剛武豪魁鵬翔錦猛岩隼]{3,}/.test(normalized)) return true;
  if (/(富士.*富士|海.*海.*海|山.*山.*山)/.test(normalized)) return true;
  if (/(の龍|の雷|の豪|の剛|の武)$/.test(normalized)) return true;
  return false;
};

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
  division === 'Makuuchi' || division === 'Juryo' ? 0.03 : 0.08;

const isValidSurnameShikona = (shikona: string): boolean => {
  if (hasForbiddenWord(shikona)) return false;
  if (hasAwkwardSequence(shikona)) return false;
  const bodyChars = countShikonaBodyChars(shikona);
  return bodyChars >= 2 && bodyChars <= 4;
};

const isValidStyledShikona = (shikona: string): boolean => {
  if (hasForbiddenWord(shikona)) return false;
  if (hasAwkwardSequence(shikona)) return false;
  const bodyChars = countShikonaBodyChars(shikona);
  if (bodyChars < 2 || bodyChars > 5) return false;
  if (bodyChars >= 5 && !shikona.includes('の') && !shikona.includes('ノ')) return false;
  return hasShikonaSignal(shikona);
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
  stableProfileById: new Map<string, NpcStableNamingProfileId>(),
  fallbackSerial: 1,
  denylistRejectedCount: 0,
});

const resolveStableNamingProfile = (stableId: string): IchimonNamingProfile => {
  const ichimonId = resolveIchimonByStableId(stableId);
  return ICHIMON_NAMING_PROFILES[ichimonId];
};

const resolveStableCrown = (
  stableId: string,
  rng: RandomSource,
  context: NpcNameContext,
  stableProfile: StableNamingProfile,
): string => {
  const existing = context.stableCrownById.get(stableId);
  if (existing) return existing;
  const profile = resolveStableNamingProfile(stableId);
  const crown = pick(rng, withBiasValues(profile.crownPrefixes, stableProfile.prefixBias));
  context.stableCrownById.set(stableId, crown);
  return crown;
};

const resolveStableProfile = (
  stableId: string,
  rng: RandomSource,
  context: NpcNameContext,
): StableNamingProfile => {
  const existing = context.stableProfileById.get(stableId);
  if (existing) return STABLE_NAMING_PROFILES[existing];
  const profileId = weightedPick(rng, PROFILE_MIX);
  context.stableProfileById.set(stableId, profileId);
  return STABLE_NAMING_PROFILES[profileId];
};

const resolveStableSchool = (
  stableId: string,
  rng: RandomSource,
  context: NpcNameContext,
  stableProfile: StableNamingProfile,
): NpcNamingSchoolId => {
  const existing = context.stableSchoolById.get(stableId);
  if (existing) return existing;
  const profile = resolveStableNamingProfile(stableId);
  const school = weightedPick(rng, mergeWeights(profile.schoolMix, stableProfile.schoolBias ?? []));
  context.stableSchoolById.set(stableId, school);
  return school;
};

const buildStyledCandidate = (
  crownPrefix: string,
  school: NpcNamingSchoolId,
  stableProfile: StableNamingProfile,
  rng: RandomSource,
): string => {
  const pattern = weightedPick(rng, mergeWeights(SCHOOL_PATTERN_WEIGHTS[school], stableProfile.patternBias));
  const stem = (): string => pick(rng, SCHOOL_STEMS[school]);
  const suffix = (): string => pick(rng, withBiasValues(SCHOOL_SUFFIXES[school], [...stableProfile.suffixBias, ...LONG_SUFFIX_BONUS]));
  const particleSuffix = (): string => pick(rng, withBiasValues(PARTICLE_SAFE_SUFFIXES[school], stableProfile.suffixBias));
  const simple = (): string => pick(rng, SIMPLE_STEMS);

  if (pattern === 'CROWN_STEM') return `${crownPrefix}${stem()}`;
  if (pattern === 'CROWN_SUFFIX') return `${crownPrefix}${suffix()}`;
  if (pattern === 'CROWN_STEM_SUFFIX') return `${crownPrefix}${stem()}${suffix()}`;
  if (pattern === 'STEM_SUFFIX') return `${stem()}${suffix()}`;
  if (pattern === 'PLACE_SUFFIX') return `${pick(rng, PLACE_STEMS)}${suffix()}`;
  if (pattern === 'PLACE_PARTICLE') return `${pick(rng, PLACE_STEMS)}の${particleSuffix()}`;
  if (pattern === 'SIMPLE_TWO') return `${simple()}${suffix()}`;
  if (pattern === 'NO_PARTICLE') return `${stem()}ノ${particleSuffix()}`;
  return `${pick(rng, PLACE_STEMS)}の${particleSuffix()}`;
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
  const stableProfile = resolveStableProfile(stableId, rng, context);
  const crownPrefix = resolveStableCrown(stableId, rng, context, stableProfile);
  const school = resolveStableSchool(stableId, rng, context, stableProfile);
  const activeNormalized = buildActiveNormalizedShikonaSet(registry, ignoreActorId);
  const blocked = context.blockedNormalizedShikona;

  const isTaken = (shikona: string): boolean => {
    const normalized = normalizeShikona(shikona);
    if (blocked.has(normalized)) {
      context.denylistRejectedCount += 1;
      return true;
    }
    return activeNormalized.has(normalized);
  };

  const reserve = (shikona: string): string => {
    activeNormalized.add(normalizeShikona(shikona));
    return shikona;
  };

  if (rng() < resolveSurnameRate(division) * stableProfile.surnameRateMultiplier) {
    for (let tries = 0; tries < 160; tries += 1) {
      const candidate = pick(rng, SURNAME_CANDIDATES);
      if (!isValidSurnameShikona(candidate)) continue;
      if (isTaken(candidate)) continue;
      return reserve(candidate);
    }
  }

  for (let tries = 0; tries < 256; tries += 1) {
    const candidate = buildStyledCandidate(crownPrefix, school, stableProfile, rng);
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
