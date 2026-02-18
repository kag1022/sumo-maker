import { RikishiStatus, Division } from './models';
import { ENEMY_POOL, EnemyStats } from './enemy_data';
import { CONSTANTS } from './constants';

export { type EnemyStats };

/**
 * 勝敗判定ロジック
 * @param rikishi 自分の力士
 * @param enemy 相手力士の情報
 * @returns boolean 勝利ならtrue
 */
export const calculateBattleResult = (rikishi: RikishiStatus, enemy: EnemyStats): { isWin: boolean, kimarite: string } => {
  // 1. 基礎能力の総合値を計算
  const myTotal = Object.values(rikishi.stats).reduce((a, b) => a + b, 0);
  const myAverage = myTotal / 8;
  
  // 2. 調子補正
  const conditionMod = 1.0 + ((rikishi.currentCondition - 50) / 200); 
  
  // 3. 戦闘力基本値
  let myPower = myAverage * conditionMod;

  // NEW: 得意技ボーナス
  let usedSignatureMove: string | null = null;
  
  if (rikishi.signatureMoves && rikishi.signatureMoves.length > 0) {
      // 最初の得意技を使用試行
      const moveName = rikishi.signatureMoves[0];
      const moveData = CONSTANTS.SIGNATURE_MOVE_DATA[moveName];
      if (moveData) {
          // 関連ステータス平均
          const relatedTotal = moveData.relatedStats.reduce((sum, stat) => sum + (rikishi.stats[stat as keyof typeof rikishi.stats] || 0), 0);
          const relatedAvg = relatedTotal / moveData.relatedStats.length;
          
          // 関連ステータスが平均以上ならボーナス適用
          if (relatedAvg >= myAverage * 0.9) {
             // ボーナス: winRateBonus * 20 (例: 0.5 * 20 = +10 Power)
             const signatureBonus = moveData.winRateBonus * 20;
             myPower += signatureBonus;
             usedSignatureMove = moveName;
          }
      }
  }
  
  // 4. 勝率計算
  const powerDiff = myPower - enemy.power;
  const winProbability = 1 / (1 + Math.exp(-0.05 * powerDiff));
  
  // 5. 乱数判定
  const roll = Math.random();
  const isWin = roll < winProbability;

  // 6. 決まり手の決定
  let kimarite: string;
  if (isWin) {
    // 得意技で勝った場合、高確率でその決まり手になる
    if (usedSignatureMove && Math.random() < 0.7) {
        kimarite = usedSignatureMove;
    } else {
        const stats = rikishi.stats;
        if (stats.tsuki + stats.oshi > stats.kumi + stats.nage) {
            kimarite = Math.random() > 0.5 ? '押し出し' : '突き出し';
        } else if (stats.nage > stats.kumi) {
            kimarite = Math.random() > 0.5 ? '上手投げ' : '掬い投げ';
        } else {
            kimarite = Math.random() > 0.5 ? '寄り切り' : '寄り倒し';
        }
    }
  } else {
    // 負け決まり手
    kimarite = ['押し出し', '寄り切り', '叩き込み', '上手投げ', '突き落とし'][Math.floor(Math.random() * 5)];
  }

  return { isWin, kimarite };
};

/**
 * 階級に応じた敵を生成する（静的プールから取得）
 * @param division 現在の階級
 */
export const generateEnemy = (division: Division, _eraYear: number): EnemyStats => {
    const pool = ENEMY_POOL[division];
    // ランダムに選択
    const enemy = pool[Math.floor(Math.random() * pool.length)];
    
    // 少し揺らぎを持たせる (+- 2)
    const powerFluctuation = (Math.random() * 4) - 2;

    return {
        ...enemy,
        power: Math.round(enemy.power + powerFluctuation)
    };
};
