// 二つ名（称号）生成ロジック

const PREFIXES = [
  '不沈艦', '怪童', '大器', '悲運の', '未完の', '土俵の', 'スピード', '平成の', '令和の', '下町の',
  '弾丸', '精密機械', '荒法師', 'テクニシャン', '眠れる', '暴走', '鉄人', 'ガラスの', '奇跡の', '不屈の'
];

const SUFFIXES = [
  'エース', '大砲', '横綱', '帝王', 'プリンス', 'ファンタジスタ', '仕事人', '闘将', '怪物', '巨神',
  '若武者', '賢者', 'マイスター', '守護神', '魂', '力持ち', '昇り龍', 'コマンダー', 'ハンター', 'マジシャン'
];

export const generateTitle = (careerSummary: any): string => {
  // 実績に応じたロジックを入れるのがベストだが、まずはランダム + 実績条件
  
  if (careerSummary.totalWins > 800) return '土俵の伝説';
  
  const p = PREFIXES[Math.floor(Math.random() * PREFIXES.length)];
  const s = SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)];
  
  return p + s;
};

// 四股名ランダム生成。実名ではなく、一般的な構造だけを抽象化する。
type PlayerShikonaPattern = 'prefixStem' | 'prefixStemSuffix' | 'stemSuffix' | 'placeSuffix' | 'simpleTwo' | 'particle';

const SHIKONA_PREFIX = ['朝', '若', '琴', '北', '隆', '翔', '錦', '武', '豪', '剛', '旭', '豊'];
const SHIKONA_STEMS = ['山', '海', '里', '浜', '岳', '峰', '風', '光', '龍', '翔', '桜', '清', '岩', '勝'];
const SHIKONA_SUFFIX = ['山', '海', '里', '富士', '龍', '嵐', '風', '光', '翔', '若', '錦', 'ノ海', '乃山'];
const SHIKONA_PLACES = ['伊予', '讃岐', '出羽', '越前', '紀州', '肥後', '筑紫', '日向', '安芸', '土佐'];
const PLAYER_DENYLIST = new Set([
  '琴富士', '旭富士', '北勝富士', '錦富士', '朝乃山', '琴ノ若', '若乃花', '貴乃花',
  '朝青龍', '朝潮', '琴風', '豪風', '豊山', '栃錦', '若三杉', '栃ノ海',
]);
const PATTERNS: Array<{ value: PlayerShikonaPattern; weight: number }> = [
  { value: 'prefixStem', weight: 24 },
  { value: 'prefixStemSuffix', weight: 18 },
  { value: 'stemSuffix', weight: 24 },
  { value: 'simpleTwo', weight: 12 },
  { value: 'placeSuffix', weight: 16 },
  { value: 'particle', weight: 6 },
];

const pick = <T>(values: T[]): T => values[Math.floor(Math.random() * values.length)];

const weightedPick = (): PlayerShikonaPattern => {
  const total = PATTERNS.reduce((sum, pattern) => sum + pattern.weight, 0);
  let point = Math.random() * total;
  for (const pattern of PATTERNS) {
    point -= pattern.weight;
    if (point <= 0) return pattern.value;
  }
  return PATTERNS[PATTERNS.length - 1].value;
};

const buildShikonaCandidate = (): string => {
  const pattern = weightedPick();
  if (pattern === 'prefixStem') return `${pick(SHIKONA_PREFIX)}${pick(SHIKONA_STEMS)}`;
  if (pattern === 'prefixStemSuffix') return `${pick(SHIKONA_PREFIX)}${pick(SHIKONA_STEMS)}${pick(SHIKONA_SUFFIX)}`;
  if (pattern === 'stemSuffix') return `${pick(SHIKONA_STEMS)}${pick(SHIKONA_SUFFIX)}`;
  if (pattern === 'placeSuffix') return `${pick(SHIKONA_PLACES)}${pick(SHIKONA_SUFFIX)}`;
  if (pattern === 'particle') return `${pick(SHIKONA_STEMS)}ノ${pick(SHIKONA_SUFFIX)}`;
  return `${pick(SHIKONA_PREFIX)}${pick(SHIKONA_SUFFIX)}`;
};

export const generateShikona = (): string => {
  for (let tries = 0; tries < 48; tries += 1) {
    const candidate = buildShikonaCandidate();
    if (!PLAYER_DENYLIST.has(candidate)) return candidate;
  }
  return '若ノ海';
};
