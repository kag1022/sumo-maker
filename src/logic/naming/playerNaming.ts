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

// 四股名ランダム生成
const SHIKONA_PREFIX = ['朝', '若', '貴', '北', '琴', '栃', '千代', '豊', '隆', '輝', '大', '正', '翔', '安', '日', '鶴', '玉'];
const SHIKONA_SUFFIX = ['山', '川', '海', '里', '富士', '桜', '龍', '鵬', '国', '錦', '麒麟', '王', '嵐', '疾風', '天', '光', '勝'];

export const generateShikona = (): string => {
   const p = SHIKONA_PREFIX[Math.floor(Math.random() * SHIKONA_PREFIX.length)];
   const s = SHIKONA_SUFFIX[Math.floor(Math.random() * SHIKONA_SUFFIX.length)];
   return p + s;
};
