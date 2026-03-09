import { IchimonId, StableArchetypeId } from '../../models';

export type StableScale =
  | 'SUPER_GIANT'
  | 'GIANT'
  | 'LARGE'
  | 'MID'
  | 'SMALL'
  | 'TINY';

export interface StableDefinition {
  id: string;
  code: string;
  displayName: string;
  flavor: string;
  ichimonId: IchimonId;
  archetypeId: StableArchetypeId;
  scale: StableScale;
  targetHeadcount: number;
  minPreferred: number;
  maxPreferred: number;
  hardCap?: number;
}

const SCALE_TARGET: Record<StableScale, number> = {
  SUPER_GIANT: 41,
  GIANT: 29,
  LARGE: 22,
  MID: 13,
  SMALL: 7,
  TINY: 4,
};

const SCALE_PREFERRED_RANGE: Record<StableScale, { min: number; max: number; hardCap?: number }> = {
  SUPER_GIANT: { min: 30, max: 60 },
  GIANT: { min: 25, max: 40 },
  LARGE: { min: 18, max: 26 },
  MID: { min: 10, max: 15 },
  SMALL: { min: 5, max: 9, hardCap: 9 },
  TINY: { min: 1, max: 4, hardCap: 4 },
};

const resolveScaleByOrdinal = (ordinal: number): StableScale => {
  if (ordinal === 1) return 'SUPER_GIANT';
  if (ordinal <= 5) return 'GIANT';
  if (ordinal <= 14) return 'LARGE';
  if (ordinal <= 29) return 'MID';
  if (ordinal <= 41) return 'SMALL';
  return 'TINY';
};

type StubMeta = {
  code: string;
  displayName: string;
  flavor: string;
  ichimonId: IchimonId;
  archetypeId: StableArchetypeId;
};

// NOTE: displayName/flavor are intentionally centralized here for easy rename.
const STUB_META: StubMeta[] = [
  { code: 'TAI-01', displayName: '大樹部屋', flavor: '巨体育成で土俵を制圧する本流の看板部屋。', ichimonId: 'TAIJU', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'TAI-02', displayName: '白峰部屋', flavor: '四つ相撲の基本を徹底する古式の道場。', ichimonId: 'TAIJU', archetypeId: 'GIANT_YOTSU' },
  { code: 'TAI-03', displayName: '松城部屋', flavor: '力士数の厚みで競争を生む伝統大部屋。', ichimonId: 'TAIJU', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'TAI-04', displayName: '隆栄部屋', flavor: '寄りと腰を鍛える本格派の稽古場。', ichimonId: 'TAIJU', archetypeId: 'GIANT_YOTSU' },
  { code: 'TAI-05', displayName: '玄武部屋', flavor: '基礎体力と番付維持力に定評がある。', ichimonId: 'TAIJU', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'TAI-06', displayName: '朝鷹部屋', flavor: '若手の押し込みを段階的に強化する。', ichimonId: 'TAIJU', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'TAI-07', displayName: '錦龍部屋', flavor: '重量と技の両立を掲げる総合育成型。', ichimonId: 'TAIJU', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'TAI-08', displayName: '北岳部屋', flavor: '大型力士の四つ相撲を磨き上げる。', ichimonId: 'TAIJU', archetypeId: 'GIANT_YOTSU' },
  { code: 'TAI-09', displayName: '晴雲部屋', flavor: '古参親方の経験則を重視する。', ichimonId: 'TAIJU', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'TAI-10', displayName: '宝松部屋', flavor: '師弟の礼法と土俵作法に厳格。', ichimonId: 'TAIJU', archetypeId: 'MASTER_DISCIPLE' },
  { code: 'TAI-11', displayName: '若潮部屋', flavor: '若年層の成長を長期視点で管理する。', ichimonId: 'TAIJU', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'TAI-12', displayName: '緑川部屋', flavor: '力任せではない腰運びを重視する。', ichimonId: 'TAIJU', archetypeId: 'GIANT_YOTSU' },
  { code: 'TAI-13', displayName: '旭城部屋', flavor: '本流の看板を背負う名門の末席。', ichimonId: 'TAIJU', archetypeId: 'TRADITIONAL_LARGE' },

  { code: 'KRG-01', displayName: '黒鋼部屋', flavor: 'データ計測で稽古強度を最適化する。', ichimonId: 'KUROGANE', archetypeId: 'MODERN_SCIENCE' },
  { code: 'KRG-02', displayName: '剛芯部屋', flavor: '筋力と瞬発の両立を科学的に管理。', ichimonId: 'KUROGANE', archetypeId: 'MODERN_SCIENCE' },
  { code: 'KRG-03', displayName: '烈光部屋', flavor: '短期強化プログラムで番付を押し上げる。', ichimonId: 'KUROGANE', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'KRG-04', displayName: '鋼鷲部屋', flavor: '重量トレーニングで圧力を鍛える。', ichimonId: 'KUROGANE', archetypeId: 'GIANT_YOTSU' },
  { code: 'KRG-05', displayName: '金剛部屋', flavor: 'ケガ予防プログラムを標準化。', ichimonId: 'KUROGANE', archetypeId: 'MODERN_SCIENCE' },
  { code: 'KRG-06', displayName: '真鉄部屋', flavor: '映像分析を取り入れた戦型矯正。', ichimonId: 'KUROGANE', archetypeId: 'MODERN_SCIENCE' },
  { code: 'KRG-07', displayName: '迅鋼部屋', flavor: '突き押し連打を高回転で反復する。', ichimonId: 'KUROGANE', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'KRG-08', displayName: '雷鋼部屋', flavor: '重量級の当たりを機械的に鍛える。', ichimonId: 'KUROGANE', archetypeId: 'GIANT_YOTSU' },
  { code: 'KRG-09', displayName: '堅磨部屋', flavor: '可動域改善と回復管理に長ける。', ichimonId: 'KUROGANE', archetypeId: 'MODERN_SCIENCE' },
  { code: 'KRG-10', displayName: '重煌部屋', flavor: '強圧の押し相撲を構造的に育てる。', ichimonId: 'KUROGANE', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'KRG-11', displayName: '辰鉄部屋', flavor: '新興勢力の中核を担う実験場。', ichimonId: 'KUROGANE', archetypeId: 'MODERN_SCIENCE' },

  { code: 'RMI-01', displayName: '雷牙部屋', flavor: '猛稽古で出足を鍛える武闘派。', ichimonId: 'RAIMEI', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'RMI-02', displayName: '轟山部屋', flavor: '突き押しの連続圧力を重視。', ichimonId: 'RAIMEI', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'RMI-03', displayName: '猛嵐部屋', flavor: '荒々しい立合いを徹底的に反復。', ichimonId: 'RAIMEI', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'RMI-04', displayName: '赤雷部屋', flavor: '闘志を前面に出す短期決戦型。', ichimonId: 'RAIMEI', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'RMI-05', displayName: '迅雷部屋', flavor: '速攻相撲の回転力で番付を掴む。', ichimonId: 'RAIMEI', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'RMI-06', displayName: '虎轟部屋', flavor: '重い当たりと押し切りを両立。', ichimonId: 'RAIMEI', archetypeId: 'GIANT_YOTSU' },
  { code: 'RMI-07', displayName: '大雷部屋', flavor: '稽古量で地力を積み上げる。', ichimonId: 'RAIMEI', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'RMI-08', displayName: '斬風部屋', flavor: '上位狩りを狙う攻撃特化集団。', ichimonId: 'RAIMEI', archetypeId: 'TSUKI_OSHI_GROUP' },
  { code: 'RMI-09', displayName: '烈峰部屋', flavor: '武闘派の中でも大型育成に強い。', ichimonId: 'RAIMEI', archetypeId: 'GIANT_YOTSU' },

  { code: 'HKT-01', displayName: '白鶴部屋', flavor: '技の型を継承する古豪の本家。', ichimonId: 'HAKUTSURU', archetypeId: 'TECHNICAL_SMALL' },
  { code: 'HKT-02', displayName: '雅鶴部屋', flavor: '小兵の間合い管理を徹底する。', ichimonId: 'HAKUTSURU', archetypeId: 'TECHNICAL_SMALL' },
  { code: 'HKT-03', displayName: '錦羽部屋', flavor: '捌きと投げを重視する伝承系。', ichimonId: 'HAKUTSURU', archetypeId: 'TECHNICAL_SMALL' },
  { code: 'HKT-04', displayName: '銀花部屋', flavor: '軽量級の技術研磨で名を上げる。', ichimonId: 'HAKUTSURU', archetypeId: 'TECHNICAL_SMALL' },
  { code: 'HKT-05', displayName: '瑞鳳部屋', flavor: '礼法と型を重視する古式の系譜。', ichimonId: 'HAKUTSURU', archetypeId: 'TRADITIONAL_LARGE' },
  { code: 'HKT-06', displayName: '清霞部屋', flavor: '少数精鋭の稽古で質を高める。', ichimonId: 'HAKUTSURU', archetypeId: 'MASTER_DISCIPLE' },
  { code: 'HKT-07', displayName: '丹頂部屋', flavor: '技巧派の意地を継ぐ末流。', ichimonId: 'HAKUTSURU', archetypeId: 'TECHNICAL_SMALL' },

  { code: 'HYT-01', displayName: '疾風部屋', flavor: '師弟密着型で個別育成を徹底。', ichimonId: 'HAYATE', archetypeId: 'MASTER_DISCIPLE' },
  { code: 'HYT-02', displayName: '蒼迅部屋', flavor: '少人数で回転の速い育成環境。', ichimonId: 'HAYATE', archetypeId: 'MASTER_DISCIPLE' },
  { code: 'HYT-03', displayName: '飛燕部屋', flavor: '実戦反復で対応力を伸ばす。', ichimonId: 'HAYATE', archetypeId: 'MASTER_DISCIPLE' },
  { code: 'HYT-04', displayName: '風牙部屋', flavor: '独立開拓者の強みを活かす柔軟型。', ichimonId: 'HAYATE', archetypeId: 'MODERN_SCIENCE' },
  { code: 'HYT-05', displayName: '青嵐部屋', flavor: '少数ながら粘り強い番付運用。', ichimonId: 'HAYATE', archetypeId: 'MASTER_DISCIPLE' },
];

if (STUB_META.length !== 45) {
  throw new Error(`Expected 45 stable definitions, got ${STUB_META.length}`);
}

const buildStableDefinition = (ordinal: number, meta: StubMeta): StableDefinition => {
  const scale = resolveScaleByOrdinal(ordinal);
  const range = SCALE_PREFERRED_RANGE[scale];
  return {
    id: `stable-${String(ordinal).padStart(3, '0')}`,
    code: meta.code,
    displayName: meta.displayName,
    flavor: meta.flavor,
    ichimonId: meta.ichimonId,
    archetypeId: meta.archetypeId,
    scale,
    targetHeadcount: SCALE_TARGET[scale],
    minPreferred: range.min,
    maxPreferred: range.max,
    hardCap: range.hardCap,
  };
};

export const STABLE_CATALOG: StableDefinition[] = STUB_META.map((meta, index) =>
  buildStableDefinition(index + 1, meta),
);

export const STABLE_BY_ID: Map<string, StableDefinition> = new Map(
  STABLE_CATALOG.map((stable) => [stable.id, stable]),
);

export const resolveStableById = (stableId: string): StableDefinition | undefined =>
  STABLE_BY_ID.get(stableId);

export const listStablesByIchimon = (ichimonId: IchimonId): StableDefinition[] =>
  STABLE_CATALOG.filter((stable) => stable.ichimonId === ichimonId);