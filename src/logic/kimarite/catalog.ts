import type { BodyType, RikishiStatus, StyleArchetype, Trait } from '../models';

type StatKey = keyof RikishiStatus['stats'];

export type KimariteStyle = 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | 'BALANCE';
export type KimariteClass =
  | 'BASIC'
  | 'LEG_TRIP'
  | 'THROW'
  | 'TWIST_DOWN'
  | 'BACKWARD_BODY_DROP'
  | 'SPECIAL'
  | 'NON_TECHNIQUE';
export type KimariteFamily =
  | 'PUSH_THRUST'
  | 'FORCE_OUT'
  | 'THROW'
  | 'TWIST_DOWN'
  | 'TRIP_PICK'
  | 'BACKWARD_BODY_DROP'
  | 'REAR'
  | 'NON_TECHNIQUE';
export type KimariteRarityBucket = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EXTREME';
export type KimaritePatternRole = 'MAIN' | 'ALT' | 'CONTEXT' | 'RARE';
export type KimaritePattern =
  | 'PUSH_ADVANCE'
  | 'BELT_FORCE'
  | 'THROW_EXCHANGE'
  | 'PULL_DOWN'
  | 'REAR_CONTROL'
  | 'EDGE_REVERSAL'
  | 'LEG_TRIP_PICK'
  | 'BACKWARD_ARCH'
  | 'NON_TECHNIQUE';
export type KimariteTag =
  | 'belt'
  | 'edge'
  | 'rear'
  | 'lift'
  | 'leg'
  | 'pull'
  | 'trip'
  | 'twist'
  | 'rare'
  | 'extreme';
export type KimariteContextTag =
  | 'EDGE'
  | 'REAR'
  | 'UNDERDOG'
  | 'ARAWAZASHI_ONLY'
  | 'SOPPU_ONLY'
  | 'HEAVY_ONLY'
  | 'BELT_ONLY';

export interface OfficialKimariteEntry {
  officialOrder: number;
  name: string;
  class: KimariteClass;
  family: KimariteFamily;
  primaryStyle: KimariteStyle;
  secondaryStyle?: KimariteStyle;
  rarityBucket: KimariteRarityBucket;
  historicalWeight: number;
  floorRate: number;
  requiredPatterns: KimaritePattern[];
  statAffinity: Partial<Record<StatKey, number>>;
  bodyAffinity: {
    preferredBodyTypes?: BodyType[];
    minHeightDiff?: number;
    minWeightDiff?: number;
    maxWeightDiff?: number;
  };
  traitTags: Trait[];
  signatureEligible: boolean;
  collectionVisible: boolean;
  tags: KimariteTag[];
  patternRole: KimaritePatternRole;
  contextTags: KimariteContextTag[];
}

export interface NonTechniqueEntry {
  key: string;
  name: string;
  collectionLabel: string;
  class: 'NON_TECHNIQUE';
  family: 'NON_TECHNIQUE';
  rarityBucket: KimariteRarityBucket;
  collectionVisible: boolean;
}

export interface OfficialWinningKimariteCatalogEntry {
  officialOrder: number;
  name: string;
  class: KimariteClass;
  family: KimariteFamily;
  rarityBucket: KimariteRarityBucket;
  tags: KimariteTag[];
  patternRole: KimaritePatternRole;
  contextTags: KimariteContextTag[];
}

const MAIN_KIMARITE_NAMES = new Set([
  '押し出し',
  '押し倒し',
  '突き出し',
  '寄り切り',
  '寄り倒し',
  '上手投げ',
  '下手投げ',
  '掬い投げ',
  '小手投げ',
  '叩き込み',
  '引き落とし',
  '突き落とし',
  '送り出し',
]);

const CONTEXT_KIMARITE_NAMES = new Set([
  '送り投げ',
  '吊り落とし',
  'うっちゃり',
  '後ろもたれ',
  '呼び戻し',
  '送り倒し',
  '吊り出し',
  '極め出し',
  '極め倒し',
]);

const UNDERDOG_KIMARITE_NAMES = new Set([
  'うっちゃり',
  '後ろもたれ',
  '吊り落とし',
  '呼び戻し',
  '居反り',
  'たすき反り',
  '外たすき反り',
  '伝え反り',
  '撞木反り',
  '掛け反り',
]);

const HEAVY_KIMARITE_NAMES = new Set([
  '吊り出し',
  '送り吊り出し',
  '吊り落とし',
  '送り吊り落とし',
  'つかみ投げ',
  '鯖折り',
  '割り出し',
  '極め出し',
  '極め倒し',
]);

const resolvePatternRole = (entry: {
  name: string;
  class: KimariteClass;
  rarityBucket: KimariteRarityBucket;
  historicalWeight: number;
}): KimaritePatternRole => {
  if (MAIN_KIMARITE_NAMES.has(entry.name)) return 'MAIN';
  if (CONTEXT_KIMARITE_NAMES.has(entry.name)) return 'CONTEXT';
  if (
    entry.class === 'BACKWARD_BODY_DROP' ||
    entry.rarityBucket === 'EXTREME' ||
    (entry.rarityBucket === 'RARE' && entry.historicalWeight < 0.9)
  ) {
    return 'RARE';
  }
  return 'ALT';
};

const resolveContextTags = (entry: Omit<OfficialKimariteEntry, 'collectionVisible' | 'floorRate' | 'patternRole' | 'contextTags'>): KimariteContextTag[] => {
  const role = resolvePatternRole(entry);
  if (role === 'MAIN') return [];

  const tags = new Set<KimariteContextTag>();
  if (entry.tags.includes('edge') || entry.requiredPatterns.includes('EDGE_REVERSAL')) tags.add('EDGE');
  if (entry.tags.includes('rear') || entry.family === 'REAR') tags.add('REAR');
  if (UNDERDOG_KIMARITE_NAMES.has(entry.name)) tags.add('UNDERDOG');
  if (entry.traitTags.includes('ARAWAZASHI') && role !== 'ALT') tags.add('ARAWAZASHI_ONLY');
  if (entry.bodyAffinity.preferredBodyTypes?.includes('SOPPU')) tags.add('SOPPU_ONLY');
  if (
    HEAVY_KIMARITE_NAMES.has(entry.name) ||
    entry.tags.includes('lift') ||
    (typeof entry.bodyAffinity.minWeightDiff === 'number' && entry.bodyAffinity.minWeightDiff >= 0)
  ) {
    tags.add('HEAVY_ONLY');
  }
  if (entry.tags.includes('belt') && role !== 'ALT') tags.add('BELT_ONLY');
  return [...tags];
};

const createOfficial = (
  entry: Omit<OfficialKimariteEntry, 'floorRate' | 'collectionVisible' | 'patternRole' | 'contextTags'> & {
    floorRate?: number;
  },
): OfficialKimariteEntry => ({
  ...entry,
  floorRate:
    entry.floorRate ??
    (entry.rarityBucket === 'EXTREME'
      ? 0.0001
      : entry.rarityBucket === 'RARE'
        ? 0.0006
        : entry.rarityBucket === 'UNCOMMON'
          ? 0.0025
          : 0),
  collectionVisible: true,
  patternRole: resolvePatternRole(entry),
  contextTags: resolveContextTags(entry),
});

const BASIC_KIMARITE: OfficialKimariteEntry[] = [
  createOfficial({ officialOrder: 1, name: '押し出し', class: 'BASIC', family: 'PUSH_THRUST', primaryStyle: 'PUSH', secondaryStyle: 'BALANCE', rarityBucket: 'COMMON', historicalWeight: 56, requiredPatterns: ['PUSH_ADVANCE'], statAffinity: { tsuki: 0.45, oshi: 0.9, deashi: 0.55, power: 0.2 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR'], minWeightDiff: -20 }, traitTags: ['TSUPPARI_TOKKA', 'HEAVY_PRESSURE', 'THRUST_RUSH'], signatureEligible: true, tags: [] }),
  createOfficial({ officialOrder: 2, name: '押し倒し', class: 'BASIC', family: 'PUSH_THRUST', primaryStyle: 'PUSH', secondaryStyle: 'BALANCE', rarityBucket: 'COMMON', historicalWeight: 4.5, requiredPatterns: ['PUSH_ADVANCE'], statAffinity: { oshi: 0.8, tsuki: 0.45, power: 0.3 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR'], minWeightDiff: -18 }, traitTags: ['TSUPPARI_TOKKA', 'HEAVY_PRESSURE'], signatureEligible: true, tags: [] }),
  createOfficial({ officialOrder: 3, name: '突き出し', class: 'BASIC', family: 'PUSH_THRUST', primaryStyle: 'PUSH', secondaryStyle: 'BALANCE', rarityBucket: 'COMMON', historicalWeight: 1.7, requiredPatterns: ['PUSH_ADVANCE'], statAffinity: { tsuki: 0.95, deashi: 0.5, oshi: 0.2 }, bodyAffinity: { preferredBodyTypes: ['SOPPU', 'MUSCULAR'], minHeightDiff: -8 }, traitTags: ['TSUPPARI_TOKKA', 'LONG_REACH', 'THRUST_RUSH'], signatureEligible: true, tags: [] }),
  createOfficial({ officialOrder: 4, name: '突き倒し', class: 'BASIC', family: 'PUSH_THRUST', primaryStyle: 'PUSH', secondaryStyle: 'TECHNIQUE', rarityBucket: 'COMMON', historicalWeight: 1.2, requiredPatterns: ['PUSH_ADVANCE'], statAffinity: { tsuki: 0.8, oshi: 0.35, deashi: 0.25 }, bodyAffinity: { preferredBodyTypes: ['SOPPU', 'MUSCULAR'] }, traitTags: ['TSUPPARI_TOKKA', 'LONG_REACH'], signatureEligible: true, tags: [] }),
  createOfficial({ officialOrder: 5, name: '寄り切り', class: 'BASIC', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'COMMON', historicalWeight: 30, requiredPatterns: ['BELT_FORCE'], statAffinity: { kumi: 0.8, koshi: 0.8, power: 0.3, deashi: 0.25 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR', 'NORMAL'], minWeightDiff: -25 }, traitTags: ['YOTSU_NO_ONI', 'BELT_COUNTER', 'HEAVY_PRESSURE'], signatureEligible: true, tags: ['belt'] }),
  createOfficial({ officialOrder: 6, name: '寄り倒し', class: 'BASIC', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'COMMON', historicalWeight: 2.2, requiredPatterns: ['BELT_FORCE'], statAffinity: { kumi: 0.7, koshi: 0.7, power: 0.25 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR', 'NORMAL'] }, traitTags: ['YOTSU_NO_ONI', 'BELT_COUNTER'], signatureEligible: true, tags: ['belt'] }),
  createOfficial({ officialOrder: 7, name: '浴びせ倒し', class: 'BASIC', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'PUSH', rarityBucket: 'UNCOMMON', historicalWeight: 1.2, requiredPatterns: ['BELT_FORCE'], statAffinity: { kumi: 0.45, power: 0.45, oshi: 0.3 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR'], minWeightDiff: -12 }, traitTags: ['YOTSU_NO_ONI', 'HEAVY_PRESSURE'], signatureEligible: true, tags: ['belt'] }),
];

const LEG_TRIP_KIMARITE: OfficialKimariteEntry[] = [
  createOfficial({ officialOrder: 8, name: '足取り', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.9, requiredPatterns: ['LEG_TRIP_PICK'], statAffinity: { waza: 0.8, deashi: 0.25, kumi: 0.2 }, bodyAffinity: { maxWeightDiff: 30 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['leg', 'rare'] }),
  createOfficial({ officialOrder: 9, name: 'ちょん掛け', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.5, requiredPatterns: ['LEG_TRIP_PICK'], statAffinity: { waza: 0.75, deashi: 0.35 }, bodyAffinity: { maxWeightDiff: 24 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'trip', 'rare'] }),
  createOfficial({ officialOrder: 10, name: '河津掛け', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.04, requiredPatterns: ['EDGE_REVERSAL', 'LEG_TRIP_PICK'], statAffinity: { waza: 0.78, deashi: 0.3, kumi: 0.2 }, bodyAffinity: { maxWeightDiff: 12 }, traitTags: ['DOHYOUGIWA_MAJUTSU', 'CLUTCH_REVERSAL', 'ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'edge', 'extreme'] }),
  createOfficial({ officialOrder: 11, name: '蹴返し', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'PUSH', rarityBucket: 'RARE', historicalWeight: 0.35, requiredPatterns: ['LEG_TRIP_PICK'], statAffinity: { deashi: 0.55, waza: 0.65 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'OPENING_DASH'], signatureEligible: true, tags: ['leg', 'trip', 'rare'] }),
  createOfficial({ officialOrder: 12, name: '蹴手繰り', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'PUSH', rarityBucket: 'RARE', historicalWeight: 1.2, requiredPatterns: ['LEG_TRIP_PICK', 'PULL_DOWN'], statAffinity: { waza: 0.8, deashi: 0.45, tsuki: 0.2 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI', 'OPENING_DASH'], signatureEligible: true, tags: ['leg', 'pull', 'rare'] }),
  createOfficial({ officialOrder: 13, name: '切り返し', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.3, requiredPatterns: ['LEG_TRIP_PICK', 'BELT_FORCE'], statAffinity: { waza: 0.75, kumi: 0.2, deashi: 0.3 }, bodyAffinity: { maxWeightDiff: 14 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'trip', 'rare'] }),
  createOfficial({ officialOrder: 14, name: '小股掬い', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'RARE', historicalWeight: 0.55, requiredPatterns: ['THROW_EXCHANGE', 'LEG_TRIP_PICK'], statAffinity: { waza: 0.7, nage: 0.4, deashi: 0.2 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['leg', 'rare'] }),
  createOfficial({ officialOrder: 15, name: '小褄取り', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.06, requiredPatterns: ['LEG_TRIP_PICK'], statAffinity: { waza: 0.82, deashi: 0.32 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'extreme'] }),
  createOfficial({ officialOrder: 16, name: '三所攻め', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['LEG_TRIP_PICK', 'REAR_CONTROL'], statAffinity: { waza: 0.92, deashi: 0.35, kumi: 0.3 }, bodyAffinity: { maxWeightDiff: 12 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT', 'DOHYOUGIWA_MAJUTSU'], signatureEligible: true, tags: ['leg', 'rear', 'extreme'] }),
  createOfficial({ officialOrder: 17, name: '二枚蹴り', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.04, requiredPatterns: ['LEG_TRIP_PICK'], statAffinity: { waza: 0.8, deashi: 0.45 }, bodyAffinity: { maxWeightDiff: 14 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'extreme'] }),
  createOfficial({ officialOrder: 18, name: '大股', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'EXTREME', historicalWeight: 0.05, requiredPatterns: ['THROW_EXCHANGE', 'LEG_TRIP_PICK'], statAffinity: { waza: 0.72, nage: 0.45, deashi: 0.25 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'extreme'] }),
  createOfficial({ officialOrder: 19, name: '外掛け', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'RARE', historicalWeight: 0.7, requiredPatterns: ['LEG_TRIP_PICK', 'BELT_FORCE'], statAffinity: { kumi: 0.45, deashi: 0.35, waza: 0.45 }, bodyAffinity: { preferredBodyTypes: ['NORMAL', 'MUSCULAR'] }, traitTags: ['YOTSU_NO_ONI', 'ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'belt', 'rare'] }),
  createOfficial({ officialOrder: 20, name: '外小股', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.03, requiredPatterns: ['LEG_TRIP_PICK', 'THROW_EXCHANGE'], statAffinity: { waza: 0.82, deashi: 0.32 }, bodyAffinity: { maxWeightDiff: 14 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'extreme'] }),
  createOfficial({ officialOrder: 21, name: '裾払い', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.45, requiredPatterns: ['LEG_TRIP_PICK', 'THROW_EXCHANGE'], statAffinity: { deashi: 0.45, waza: 0.7 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['leg', 'rare'] }),
  createOfficial({ officialOrder: 22, name: '裾取り', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.05, requiredPatterns: ['LEG_TRIP_PICK'], statAffinity: { waza: 0.82, deashi: 0.28 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'extreme'] }),
  createOfficial({ officialOrder: 23, name: '褄取り', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.2, requiredPatterns: ['REAR_CONTROL', 'LEG_TRIP_PICK'], statAffinity: { deashi: 0.42, waza: 0.7 }, bodyAffinity: { maxWeightDiff: 20 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['leg', 'rear', 'rare'] }),
  createOfficial({ officialOrder: 24, name: '内掛け', class: 'LEG_TRIP', family: 'TRIP_PICK', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'RARE', historicalWeight: 0.7, requiredPatterns: ['LEG_TRIP_PICK', 'BELT_FORCE'], statAffinity: { kumi: 0.45, deashi: 0.3, waza: 0.45 }, bodyAffinity: { preferredBodyTypes: ['NORMAL', 'MUSCULAR'] }, traitTags: ['YOTSU_NO_ONI', 'ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'belt', 'rare'] }),
  createOfficial({ officialOrder: 25, name: '渡し込み', class: 'LEG_TRIP', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.8, requiredPatterns: ['LEG_TRIP_PICK', 'BELT_FORCE'], statAffinity: { waza: 0.72, kumi: 0.25, deashi: 0.2 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['leg', 'belt', 'rare'] }),
];

const THROW_KIMARITE: OfficialKimariteEntry[] = [
  createOfficial({ officialOrder: 26, name: '一本背負い', class: 'THROW', family: 'THROW', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.05, requiredPatterns: ['EDGE_REVERSAL', 'THROW_EXCHANGE'], statAffinity: { waza: 0.9, nage: 0.35 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 12 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['edge', 'extreme'] }),
  createOfficial({ officialOrder: 27, name: '掛け投げ', class: 'THROW', family: 'THROW', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'RARE', historicalWeight: 0.4, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { nage: 0.68, kumi: 0.35, deashi: 0.15 }, bodyAffinity: { preferredBodyTypes: ['NORMAL', 'MUSCULAR'] }, traitTags: ['YOTSU_NO_ONI', 'ARAWAZASHI'], signatureEligible: true, tags: ['belt', 'rare'] }),
  createOfficial({ officialOrder: 28, name: '腰投げ', class: 'THROW', family: 'THROW', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'RARE', historicalWeight: 0.18, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { nage: 0.65, power: 0.25, koshi: 0.4 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR'], maxWeightDiff: 8 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt', 'rare'] }),
  createOfficial({ officialOrder: 29, name: '小手投げ', class: 'THROW', family: 'THROW', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'UNCOMMON', historicalWeight: 1.0, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { nage: 0.7, waza: 0.4, tsuki: 0.2 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['rare'] }),
  createOfficial({ officialOrder: 30, name: '首投げ', class: 'THROW', family: 'THROW', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.7, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { nage: 0.58, waza: 0.5, power: 0.2 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['rare'] }),
  createOfficial({ officialOrder: 31, name: '二丁投げ', class: 'THROW', family: 'THROW', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.03, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { nage: 0.78, waza: 0.42 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 10 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['extreme'] }),
  createOfficial({ officialOrder: 32, name: '下手出し投げ', class: 'THROW', family: 'THROW', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'UNCOMMON', historicalWeight: 1.7, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { nage: 0.72, waza: 0.55, kumi: 0.15 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt', 'rare'] }),
  createOfficial({ officialOrder: 33, name: '下手投げ', class: 'THROW', family: 'THROW', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'UNCOMMON', historicalWeight: 1.3, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { nage: 0.82, kumi: 0.4, waza: 0.2 }, bodyAffinity: { preferredBodyTypes: ['NORMAL', 'MUSCULAR'], maxWeightDiff: 22 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt'] }),
  createOfficial({ officialOrder: 34, name: '掬い投げ', class: 'THROW', family: 'THROW', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'UNCOMMON', historicalWeight: 1.0, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { nage: 0.68, waza: 0.5, kumi: 0.2 }, bodyAffinity: { maxWeightDiff: 20 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: [] }),
  createOfficial({ officialOrder: 35, name: 'つかみ投げ', class: 'THROW', family: 'THROW', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { power: 0.55, kumi: 0.45, nage: 0.35 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR'], minWeightDiff: 5, maxWeightDiff: 18 }, traitTags: ['YOTSU_NO_ONI', 'HEAVY_PRESSURE'], signatureEligible: true, tags: ['belt', 'extreme'] }),
  createOfficial({ officialOrder: 36, name: '上手出し投げ', class: 'THROW', family: 'THROW', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'UNCOMMON', historicalWeight: 1.0, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { nage: 0.74, waza: 0.55, kumi: 0.1 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt', 'rare'] }),
  createOfficial({ officialOrder: 37, name: '上手投げ', class: 'THROW', family: 'THROW', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'UNCOMMON', historicalWeight: 2.8, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { nage: 0.88, kumi: 0.45, power: 0.2 }, bodyAffinity: { preferredBodyTypes: ['NORMAL', 'MUSCULAR'], maxWeightDiff: 22 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt'] }),
  createOfficial({ officialOrder: 38, name: '櫓投げ', class: 'THROW', family: 'THROW', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'RARE', historicalWeight: 0.15, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { kumi: 0.4, nage: 0.45, deashi: 0.2 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR'], maxWeightDiff: 14 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt', 'rare'] }),
];
const TWIST_DOWN_KIMARITE: OfficialKimariteEntry[] = [
  createOfficial({ officialOrder: 39, name: '網打ち', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.35, requiredPatterns: ['EDGE_REVERSAL', 'THROW_EXCHANGE'], statAffinity: { waza: 0.72, nage: 0.32 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['twist', 'edge', 'rare'] }),
  createOfficial({ officialOrder: 40, name: '合掌捻り', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.02, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { waza: 0.9, nage: 0.22 }, bodyAffinity: { maxWeightDiff: 12 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['twist', 'extreme'] }),
  createOfficial({ officialOrder: 41, name: '波離間投げ', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['EDGE_REVERSAL', 'THROW_EXCHANGE'], statAffinity: { waza: 0.92, nage: 0.3 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 12 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['twist', 'edge', 'extreme'] }),
  createOfficial({ officialOrder: 42, name: '腕捻り', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.5, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { waza: 0.68, nage: 0.42 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['twist', 'rare'] }),
  createOfficial({ officialOrder: 43, name: '肩透かし', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'PUSH', rarityBucket: 'UNCOMMON', historicalWeight: 4.8, requiredPatterns: ['PULL_DOWN', 'EDGE_REVERSAL'], statAffinity: { waza: 0.7, tsuki: 0.18, deashi: 0.24 }, bodyAffinity: { preferredBodyTypes: ['SOPPU', 'NORMAL'], maxWeightDiff: 20 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT', 'LONG_REACH'], signatureEligible: true, tags: ['pull', 'edge'] }),
  createOfficial({ officialOrder: 44, name: '小手捻り', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'UNCOMMON', historicalWeight: 1.6, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { waza: 0.62, nage: 0.44 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['twist'] }),
  createOfficial({ officialOrder: 45, name: '首捻り', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.4, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { waza: 0.68, nage: 0.35 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['twist', 'rare'] }),
  createOfficial({ officialOrder: 46, name: '巻き落とし', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'UNCOMMON', historicalWeight: 1.8, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { waza: 0.6, nage: 0.42, kumi: 0.15 }, bodyAffinity: { maxWeightDiff: 20 }, traitTags: ['ARAWAZASHI', 'YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt'] }),
  createOfficial({ officialOrder: 47, name: '大逆手', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'EXTREME', historicalWeight: 0.02, requiredPatterns: ['BELT_FORCE', 'THROW_EXCHANGE'], statAffinity: { kumi: 0.45, waza: 0.5, nage: 0.32 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR'], maxWeightDiff: 16 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt', 'extreme'] }),
  createOfficial({ officialOrder: 48, name: '鯖折り', class: 'TWIST_DOWN', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BELT_FORCE'], statAffinity: { power: 0.58, kumi: 0.45, koshi: 0.3 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR'], minWeightDiff: 8 }, traitTags: ['HEAVY_PRESSURE', 'YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt', 'extreme'] }),
  createOfficial({ officialOrder: 49, name: '逆とったり', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.03, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { waza: 0.84, nage: 0.38 }, bodyAffinity: { maxWeightDiff: 14 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['twist', 'extreme'] }),
  createOfficial({ officialOrder: 50, name: '下手捻り', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'UNCOMMON', historicalWeight: 1.9, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { kumi: 0.25, nage: 0.55, waza: 0.2 }, bodyAffinity: { maxWeightDiff: 20 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt'] }),
  createOfficial({ officialOrder: 51, name: '外無双', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.5, requiredPatterns: ['LEG_TRIP_PICK', 'BELT_FORCE'], statAffinity: { waza: 0.72, deashi: 0.26, kumi: 0.15 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'twist', 'rare'] }),
  createOfficial({ officialOrder: 52, name: '徳利投げ', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.02, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { waza: 0.85, nage: 0.3 }, bodyAffinity: { maxWeightDiff: 14 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['twist', 'extreme'] }),
  createOfficial({ officialOrder: 53, name: 'とったり', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'UNCOMMON', historicalWeight: 2.1, requiredPatterns: ['THROW_EXCHANGE'], statAffinity: { waza: 0.65, nage: 0.3, tsuki: 0.1 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['twist'] }),
  createOfficial({ officialOrder: 54, name: '突き落とし', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'PUSH', rarityBucket: 'COMMON', historicalWeight: 11, requiredPatterns: ['PULL_DOWN', 'EDGE_REVERSAL'], statAffinity: { tsuki: 0.25, waza: 0.55, deashi: 0.2 }, bodyAffinity: { preferredBodyTypes: ['SOPPU', 'NORMAL'], maxWeightDiff: 22 }, traitTags: ['READ_THE_BOUT', 'DOHYOUGIWA_MAJUTSU'], signatureEligible: true, tags: ['pull', 'edge'] }),
  createOfficial({ officialOrder: 55, name: '内無双', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.25, requiredPatterns: ['LEG_TRIP_PICK', 'BELT_FORCE'], statAffinity: { waza: 0.72, deashi: 0.28, kumi: 0.12 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'twist', 'rare'] }),
  createOfficial({ officialOrder: 56, name: '上手捻り', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'UNCOMMON', historicalWeight: 2.2, requiredPatterns: ['THROW_EXCHANGE', 'BELT_FORCE'], statAffinity: { kumi: 0.25, nage: 0.58, waza: 0.18 }, bodyAffinity: { maxWeightDiff: 20 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt'] }),
  createOfficial({ officialOrder: 57, name: 'ずぶねり', class: 'TWIST_DOWN', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BELT_FORCE', 'EDGE_REVERSAL'], statAffinity: { waza: 0.9, kumi: 0.2, deashi: 0.18 }, bodyAffinity: { maxWeightDiff: 14 }, traitTags: ['ARAWAZASHI', 'DOHYOUGIWA_MAJUTSU'], signatureEligible: true, tags: ['twist', 'edge', 'extreme'] }),
];
const BACKWARD_BODY_DROP_KIMARITE: OfficialKimariteEntry[] = [
  createOfficial({ officialOrder: 58, name: '居反り', class: 'BACKWARD_BODY_DROP', family: 'BACKWARD_BODY_DROP', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BACKWARD_ARCH', 'EDGE_REVERSAL'], statAffinity: { waza: 0.92, koshi: 0.22 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 8 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['edge', 'extreme'] }),
  createOfficial({ officialOrder: 59, name: '掛け反り', class: 'BACKWARD_BODY_DROP', family: 'BACKWARD_BODY_DROP', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BACKWARD_ARCH', 'LEG_TRIP_PICK'], statAffinity: { waza: 0.9, deashi: 0.2 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 8 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['leg', 'extreme'] }),
  createOfficial({ officialOrder: 60, name: '撞木反り', class: 'BACKWARD_BODY_DROP', family: 'BACKWARD_BODY_DROP', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BACKWARD_ARCH', 'REAR_CONTROL'], statAffinity: { waza: 0.95, kumi: 0.22 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 8 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['rear', 'extreme'] }),
  createOfficial({ officialOrder: 61, name: '外たすき反り', class: 'BACKWARD_BODY_DROP', family: 'BACKWARD_BODY_DROP', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BACKWARD_ARCH', 'EDGE_REVERSAL'], statAffinity: { waza: 0.94, kumi: 0.18 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 8 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['edge', 'extreme'] }),
  createOfficial({ officialOrder: 62, name: 'たすき反り', class: 'BACKWARD_BODY_DROP', family: 'BACKWARD_BODY_DROP', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BACKWARD_ARCH', 'EDGE_REVERSAL'], statAffinity: { waza: 0.94, kumi: 0.18 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 8 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['edge', 'extreme'] }),
  createOfficial({ officialOrder: 63, name: '伝え反り', class: 'BACKWARD_BODY_DROP', family: 'BACKWARD_BODY_DROP', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['BACKWARD_ARCH', 'REAR_CONTROL'], statAffinity: { waza: 0.95, kumi: 0.18 }, bodyAffinity: { preferredBodyTypes: ['SOPPU'], maxWeightDiff: 8 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['rear', 'extreme'] }),
];
const SPECIAL_KIMARITE: OfficialKimariteEntry[] = [
  createOfficial({ officialOrder: 64, name: '叩き込み', class: 'SPECIAL', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'PUSH', rarityBucket: 'COMMON', historicalWeight: 19.5, requiredPatterns: ['PULL_DOWN'], statAffinity: { waza: 0.38, tsuki: 0.12, deashi: 0.22 }, bodyAffinity: { preferredBodyTypes: ['SOPPU', 'NORMAL'], maxWeightDiff: 22 }, traitTags: ['READ_THE_BOUT', 'OPENING_DASH'], signatureEligible: true, tags: ['pull'] }),
  createOfficial({ officialOrder: 65, name: '引き落とし', class: 'SPECIAL', family: 'TWIST_DOWN', primaryStyle: 'PUSH', secondaryStyle: 'TECHNIQUE', rarityBucket: 'COMMON', historicalWeight: 5.4, requiredPatterns: ['PULL_DOWN'], statAffinity: { tsuki: 0.22, oshi: 0.25, waza: 0.2 }, bodyAffinity: { preferredBodyTypes: ['SOPPU', 'NORMAL'], maxWeightDiff: 20 }, traitTags: ['THRUST_RUSH', 'OPENING_DASH'], signatureEligible: true, tags: ['pull'] }),
  createOfficial({ officialOrder: 66, name: '引っ掛け', class: 'SPECIAL', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.45, requiredPatterns: ['PULL_DOWN', 'LEG_TRIP_PICK'], statAffinity: { waza: 0.72, deashi: 0.32 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['pull', 'rare'] }),
  createOfficial({ officialOrder: 67, name: '極め出し', class: 'SPECIAL', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.7, requiredPatterns: ['BELT_FORCE'], statAffinity: { kumi: 0.58, power: 0.35, koshi: 0.28 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR'], minWeightDiff: -12 }, traitTags: ['YOTSU_NO_ONI', 'BELT_COUNTER'], signatureEligible: true, tags: ['belt', 'rare'] }),
  createOfficial({ officialOrder: 68, name: '極め倒し', class: 'SPECIAL', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.4, requiredPatterns: ['BELT_FORCE'], statAffinity: { kumi: 0.58, power: 0.38, koshi: 0.3 }, bodyAffinity: { preferredBodyTypes: ['ANKO', 'MUSCULAR'], minWeightDiff: -12 }, traitTags: ['YOTSU_NO_ONI', 'BELT_COUNTER'], signatureEligible: true, tags: ['belt', 'rare'] }),
  createOfficial({ officialOrder: 69, name: '送り出し', class: 'SPECIAL', family: 'REAR', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'UNCOMMON', historicalWeight: 8.5, requiredPatterns: ['REAR_CONTROL'], statAffinity: { deashi: 0.35, waza: 0.32 }, bodyAffinity: { maxWeightDiff: 22 }, traitTags: ['READ_THE_BOUT'], signatureEligible: true, tags: ['rear'] }),
  createOfficial({ officialOrder: 70, name: '送り掛け', class: 'SPECIAL', family: 'REAR', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.08, requiredPatterns: ['REAR_CONTROL', 'LEG_TRIP_PICK'], statAffinity: { waza: 0.78, deashi: 0.3 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['rear', 'leg', 'rare'] }),
  createOfficial({ officialOrder: 71, name: '送り引き落とし', class: 'SPECIAL', family: 'REAR', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.05, requiredPatterns: ['REAR_CONTROL', 'PULL_DOWN'], statAffinity: { waza: 0.72, deashi: 0.25 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['rear', 'pull', 'rare'] }),
  createOfficial({ officialOrder: 72, name: '送り投げ', class: 'SPECIAL', family: 'REAR', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.18, requiredPatterns: ['REAR_CONTROL', 'THROW_EXCHANGE'], statAffinity: { waza: 0.72, nage: 0.3 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI'], signatureEligible: true, tags: ['rear', 'rare'] }),
  createOfficial({ officialOrder: 73, name: '送り倒し', class: 'SPECIAL', family: 'REAR', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 1.2, requiredPatterns: ['REAR_CONTROL'], statAffinity: { waza: 0.62, deashi: 0.32 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['READ_THE_BOUT'], signatureEligible: true, tags: ['rear', 'rare'] }),
  createOfficial({ officialOrder: 74, name: '送り吊り出し', class: 'SPECIAL', family: 'REAR', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['REAR_CONTROL', 'BELT_FORCE'], statAffinity: { kumi: 0.42, power: 0.42, koshi: 0.2 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR', 'ANKO'], minWeightDiff: 0 }, traitTags: ['YOTSU_NO_ONI', 'HEAVY_PRESSURE'], signatureEligible: true, tags: ['rear', 'lift', 'extreme'] }),
  createOfficial({ officialOrder: 75, name: '送り吊り落とし', class: 'SPECIAL', family: 'REAR', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['REAR_CONTROL', 'BELT_FORCE'], statAffinity: { kumi: 0.4, power: 0.4, koshi: 0.2 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR', 'ANKO'], minWeightDiff: 0 }, traitTags: ['YOTSU_NO_ONI', 'HEAVY_PRESSURE'], signatureEligible: true, tags: ['rear', 'lift', 'extreme'] }),
  createOfficial({ officialOrder: 76, name: '素首落とし', class: 'SPECIAL', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.65, requiredPatterns: ['PULL_DOWN', 'THROW_EXCHANGE'], statAffinity: { waza: 0.68, deashi: 0.22 }, bodyAffinity: { maxWeightDiff: 18 }, traitTags: ['ARAWAZASHI', 'READ_THE_BOUT'], signatureEligible: true, tags: ['pull', 'rare'] }),
  createOfficial({ officialOrder: 77, name: '吊り出し', class: 'SPECIAL', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.65, requiredPatterns: ['BELT_FORCE'], statAffinity: { power: 0.4, koshi: 0.45, kumi: 0.3 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR', 'ANKO'], minWeightDiff: 0 }, traitTags: ['YOTSU_NO_ONI', 'HEAVY_PRESSURE'], signatureEligible: true, tags: ['belt', 'lift', 'rare'] }),
  createOfficial({ officialOrder: 78, name: '吊り落とし', class: 'SPECIAL', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'TECHNIQUE', rarityBucket: 'RARE', historicalWeight: 0.22, requiredPatterns: ['BELT_FORCE', 'EDGE_REVERSAL'], statAffinity: { power: 0.34, koshi: 0.4, nage: 0.2 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR', 'ANKO'], minWeightDiff: 0 }, traitTags: ['YOTSU_NO_ONI', 'HEAVY_PRESSURE'], signatureEligible: true, tags: ['belt', 'lift', 'edge', 'rare'] }),
  createOfficial({ officialOrder: 79, name: '後ろもたれ', class: 'SPECIAL', family: 'REAR', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.01, requiredPatterns: ['REAR_CONTROL', 'EDGE_REVERSAL'], statAffinity: { waza: 0.78, deashi: 0.18 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['rear', 'edge', 'extreme'] }),
  createOfficial({ officialOrder: 80, name: 'うっちゃり', class: 'SPECIAL', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'GRAPPLE', rarityBucket: 'RARE', historicalWeight: 0.85, requiredPatterns: ['EDGE_REVERSAL'], statAffinity: { waza: 0.55, nage: 0.4, koshi: 0.15 }, bodyAffinity: { maxWeightDiff: 28 }, traitTags: ['DOHYOUGIWA_MAJUTSU', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['edge', 'rare'] }),
  createOfficial({ officialOrder: 81, name: '割り出し', class: 'SPECIAL', family: 'FORCE_OUT', primaryStyle: 'GRAPPLE', secondaryStyle: 'BALANCE', rarityBucket: 'EXTREME', historicalWeight: 0.02, requiredPatterns: ['BELT_FORCE'], statAffinity: { kumi: 0.52, power: 0.3, koshi: 0.22 }, bodyAffinity: { preferredBodyTypes: ['MUSCULAR'], minWeightDiff: -8 }, traitTags: ['YOTSU_NO_ONI'], signatureEligible: true, tags: ['belt', 'extreme'] }),
  createOfficial({ officialOrder: 82, name: '呼び戻し', class: 'SPECIAL', family: 'TWIST_DOWN', primaryStyle: 'TECHNIQUE', secondaryStyle: 'BALANCE', rarityBucket: 'RARE', historicalWeight: 0.08, requiredPatterns: ['EDGE_REVERSAL', 'PULL_DOWN'], statAffinity: { waza: 0.8, deashi: 0.22, nage: 0.12 }, bodyAffinity: { maxWeightDiff: 16 }, traitTags: ['ARAWAZASHI', 'CLUTCH_REVERSAL'], signatureEligible: true, tags: ['edge', 'rare'] }),
];

export const OFFICIAL_WIN_KIMARITE_82: OfficialKimariteEntry[] = [
  ...BASIC_KIMARITE,
  ...LEG_TRIP_KIMARITE,
  ...THROW_KIMARITE,
  ...TWIST_DOWN_KIMARITE,
  ...BACKWARD_BODY_DROP_KIMARITE,
  ...SPECIAL_KIMARITE,
];

export const NON_TECHNIQUE_CATALOG: NonTechniqueEntry[] = [
  { key: '踏み出し', name: '踏み出し', collectionLabel: '踏み出し', class: 'NON_TECHNIQUE', family: 'NON_TECHNIQUE', rarityBucket: 'RARE', collectionVisible: true },
  { key: '勇み足', name: '勇み足', collectionLabel: '勇み足', class: 'NON_TECHNIQUE', family: 'NON_TECHNIQUE', rarityBucket: 'UNCOMMON', collectionVisible: true },
  { key: '腰砕け', name: '腰砕け', collectionLabel: '腰砕け', class: 'NON_TECHNIQUE', family: 'NON_TECHNIQUE', rarityBucket: 'RARE', collectionVisible: true },
  { key: 'つきひざ', name: 'つきひざ', collectionLabel: 'つきひざ', class: 'NON_TECHNIQUE', family: 'NON_TECHNIQUE', rarityBucket: 'UNCOMMON', collectionVisible: true },
  { key: 'つき手', name: 'つき手', collectionLabel: 'つき手', class: 'NON_TECHNIQUE', family: 'NON_TECHNIQUE', rarityBucket: 'UNCOMMON', collectionVisible: true },
  { key: '不戦', name: '不戦', collectionLabel: '不戦', class: 'NON_TECHNIQUE', family: 'NON_TECHNIQUE', rarityBucket: 'RARE', collectionVisible: true },
  { key: '反則', name: '反則', collectionLabel: '反則', class: 'NON_TECHNIQUE', family: 'NON_TECHNIQUE', rarityBucket: 'EXTREME', collectionVisible: true },
];

export const KIMARITE_ALIAS_MAP: Record<string, string> = {
  'すくい投げ': '掬い投げ',
  '外たすきぞり': '外たすき反り',
  'たすきぞり': 'たすき反り',
  '後ろ凭れ': '後ろもたれ',
  '不戦勝': '不戦',
  '不戦敗': '不戦',
};

export const normalizeKimariteName = (name: string): string =>
  KIMARITE_ALIAS_MAP[name] || name;

export const KIMARITE_CATALOG = [
  ...OFFICIAL_WIN_KIMARITE_82,
  ...NON_TECHNIQUE_CATALOG,
];

export const OFFICIAL_KIMARITE_NAME_SET = new Set(
  OFFICIAL_WIN_KIMARITE_82.map((entry) => entry.name),
);
export const COLLECTION_KIMARITE_NAME_SET = new Set(
  KIMARITE_CATALOG.map((entry) => entry.name),
);
export const NON_TECHNIQUE_NAME_SET = new Set(
  NON_TECHNIQUE_CATALOG.map((entry) => entry.name),
);

export const listOfficialWinningKimariteCatalog = (): OfficialWinningKimariteCatalogEntry[] =>
  OFFICIAL_WIN_KIMARITE_82.map((entry) => ({
    officialOrder: entry.officialOrder,
    name: entry.name,
    class: entry.class,
    family: entry.family,
    rarityBucket: entry.rarityBucket,
    tags: [...entry.tags],
    patternRole: entry.patternRole,
    contextTags: [...entry.contextTags],
  }));

export const listNonTechniqueCatalog = (): NonTechniqueEntry[] =>
  NON_TECHNIQUE_CATALOG.map((entry) => ({ ...entry }));

export const findOfficialKimariteEntry = (
  name: string,
): OfficialKimariteEntry | undefined => {
  const normalized = normalizeKimariteName(name);
  return OFFICIAL_WIN_KIMARITE_82.find((entry) => entry.name === normalized);
};

export const findCollectionKimariteEntry = (
  name: string,
): OfficialKimariteEntry | NonTechniqueEntry | undefined => {
  const normalized = normalizeKimariteName(name);
  return KIMARITE_CATALOG.find((entry) => entry.name === normalized);
};

export const findNonTechniqueEntry = (
  name: string,
): NonTechniqueEntry | undefined => {
  const normalized = normalizeKimariteName(name);
  return NON_TECHNIQUE_CATALOG.find((entry) => entry.name === normalized);
};

export const isOfficialWinningKimarite = (name: string): boolean =>
  OFFICIAL_KIMARITE_NAME_SET.has(normalizeKimariteName(name));

export const isNonTechniqueKimarite = (name: string): boolean =>
  NON_TECHNIQUE_NAME_SET.has(normalizeKimariteName(name));

export const resolveKimariteFamilyLabel = (family: KimariteFamily): string => {
  if (family === 'PUSH_THRUST') return '押し・突き';
  if (family === 'FORCE_OUT') return '寄り・極め';
  if (family === 'THROW') return '投げ';
  if (family === 'TWIST_DOWN') return '捻り・落とし';
  if (family === 'TRIP_PICK') return '足取り・掛け';
  if (family === 'BACKWARD_BODY_DROP') return '反り';
  if (family === 'REAR') return '送り';
  return '非技';
};

export const resolveKimariteClassLabel = (classKey: KimariteClass): string => {
  if (classKey === 'BASIC') return '基本';
  if (classKey === 'LEG_TRIP') return '足取り';
  if (classKey === 'THROW') return '投げ';
  if (classKey === 'TWIST_DOWN') return '捻り・落とし';
  if (classKey === 'BACKWARD_BODY_DROP') return '反り';
  if (classKey === 'SPECIAL') return '特殊';
  return '非技';
};

export const resolveKimariteRarityLabel = (
  rarity: KimariteRarityBucket,
): string => {
  if (rarity === 'COMMON') return '常用';
  if (rarity === 'UNCOMMON') return '準レア';
  if (rarity === 'RARE') return '珍技';
  return '極珍';
};

export const resolveMoveBucket = (
  move: string,
): 'PUSH' | 'YORI' | 'NAGE' | 'BATTLE' => {
  const entry = findCollectionKimariteEntry(move);
  if (!entry) return 'BATTLE';
  if (entry.family === 'PUSH_THRUST') return 'PUSH';
  if (entry.family === 'FORCE_OUT') return 'YORI';
  if (entry.family === 'THROW') return 'NAGE';
  return 'BATTLE';
};

export const resolveStyleCountScoreForKimarite = (
  move: string,
): Partial<Record<StyleArchetype, number>> => {
  const entry = findCollectionKimariteEntry(move);
  if (!entry || entry.family === 'NON_TECHNIQUE') return {};
  if (entry.family === 'PUSH_THRUST') return { TSUKI_OSHI: 1.2, POWER_PRESSURE: 0.65 };
  if (entry.family === 'FORCE_OUT') return { YOTSU: 1.1, MOROZASHI: 0.95 };
  if (entry.family === 'THROW') return { NAGE_TECH: 1.2, DOHYOUGIWA: 0.35 };
  if (entry.family === 'TRIP_PICK') return { NAGE_TECH: 0.9, DOHYOUGIWA: 0.9 };
  if (entry.family === 'BACKWARD_BODY_DROP') return { DOHYOUGIWA: 1.25, NAGE_TECH: 0.55 };
  if (entry.family === 'REAR') return { DOHYOUGIWA: 0.9, TSUKI_OSHI: 0.25, MOROZASHI: 0.25 };
  return { DOHYOUGIWA: 0.75, TSUKI_OSHI: 0.25, NAGE_TECH: 0.45 };
};
