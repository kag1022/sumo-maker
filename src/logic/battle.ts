import { RikishiStatus, Division } from './models';
import {
  ENEMY_SEED_POOL,
  EnemyStats,
  EnemyStyleBias,
  resolveEnemySeedBodyMetrics,
} from './catalog/enemyData';
import { CONSTANTS } from './constants';
import { RandomSource } from './simulation/deps';

export { type EnemyStats };

/**
 * 取組コンテキスト（スキル判定に使用）
 */
export interface BoutContext {
  day: number;          // 何日目か (1~15)
  currentWins: number;  // その場所の現在の勝ち数
  currentLosses: number; // その場所の現在の負け数
  consecutiveWins: number; // 連勝数
  isLastDay: boolean;   // 千秋楽かどうか
  isYushoContention: boolean; // 優勝がかかっているか
  previousResult?: 'WIN' | 'LOSS' | 'ABSENT';
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const DEFAULT_BODY_METRICS: Record<RikishiStatus['bodyType'], { heightCm: number; weightKg: number }> = {
  NORMAL: { heightCm: 182, weightKg: 138 },
  SOPPU: { heightCm: 186, weightKg: 124 },
  ANKO: { heightCm: 180, weightKg: 162 },
  MUSCULAR: { heightCm: 184, weightKg: 152 },
};

const resolveBodyMetricModifiers = (
  bodyType: RikishiStatus['bodyType'],
): { height: number; weight: number } => {
  if (bodyType === 'ANKO') return { height: 1.0, weight: 1.15 };
  if (bodyType === 'SOPPU') return { height: 1.15, weight: 0.9 };
  if (bodyType === 'MUSCULAR') return { height: 1.08, weight: 1.08 };
  return { height: 1.0, weight: 1.0 };
};

const resolveSizeScore = (heightCm: number, weightKg: number): number =>
  (heightCm - 180) * 0.20 + (weightKg - 140) * 0.12;

const resolveEnemyStyleMatchupModifier = (
  myTactics: RikishiStatus['tactics'],
  enemyStyle?: EnemyStyleBias,
): number => {
  if (!enemyStyle || enemyStyle === 'BALANCE' || myTactics === 'BALANCE') return 1;
  if (
    (myTactics === 'PUSH' && enemyStyle === 'TECHNIQUE') ||
    (myTactics === 'TECHNIQUE' && enemyStyle === 'GRAPPLE') ||
    (myTactics === 'GRAPPLE' && enemyStyle === 'PUSH')
  ) {
    return 1.04;
  }
  if (
    (myTactics === 'PUSH' && enemyStyle === 'GRAPPLE') ||
    (myTactics === 'TECHNIQUE' && enemyStyle === 'PUSH') ||
    (myTactics === 'GRAPPLE' && enemyStyle === 'TECHNIQUE')
  ) {
    return 0.96;
  }
  return 1;
};

/**
 * 勝敗判定ロジック
 * @param rikishi 自分の力士
 * @param enemy 相手力士の情報
 * @param context 取組コンテキスト（スキル判定用）
 * @returns boolean 勝利ならtrue
 */
export const calculateBattleResult = (
  rikishi: RikishiStatus, 
  enemy: EnemyStats, 
  context?: BoutContext,
  rng: RandomSource = Math.random
): { isWin: boolean, kimarite: string } => {
  const traits = rikishi.traits || [];
  const numBouts = CONSTANTS.BOUTS_MAP[rikishi.rank.division];

  // 1. 基礎能力の総合値を計算
  const myTotal = Object.values(rikishi.stats).reduce((a, b) => a + b, 0);
  const myAverage = myTotal / 8;
  
  // 2. 調子補正
  const conditionMod = 1.0 + ((rikishi.currentCondition - 50) / 200); 
  
  // 3. 戦闘力基本値
  let myPower = myAverage * conditionMod;

  const baseMetrics = rikishi.bodyMetrics ?? DEFAULT_BODY_METRICS[rikishi.bodyType];
  const metricMod = resolveBodyMetricModifiers(rikishi.bodyType);
  const myHeight = baseMetrics.heightCm * metricMod.height;
  const myWeight = baseMetrics.weightKg * metricMod.weight;
  const enemyHeight = enemy.heightCm;
  const enemyWeight = enemy.weightKg;
  const sizeDiff = clamp(resolveSizeScore(myHeight, myWeight) - resolveSizeScore(enemyHeight, enemyWeight), -12, 12);
  myPower += sizeDiff * 0.9;
  myPower *= resolveEnemyStyleMatchupModifier(rikishi.tactics, enemy.styleBias);

  // 得意技ボーナス
  let usedSignatureMove: string | null = null;
  
  if (rikishi.signatureMoves && rikishi.signatureMoves.length > 0) {
      const moveName = rikishi.signatureMoves[0];
      const moveData = CONSTANTS.SIGNATURE_MOVE_DATA[moveName];
      if (moveData) {
          const relatedTotal = moveData.relatedStats.reduce((sum, stat) => sum + (rikishi.stats[stat as keyof typeof rikishi.stats] || 0), 0);
          const relatedAvg = relatedTotal / moveData.relatedStats.length;
          
          if (relatedAvg >= myAverage * 0.9) {
             const signatureBonus = moveData.winRateBonus * 8;
             myPower += signatureBonus;
             usedSignatureMove = moveName;
          }
      }
  }

  // --- スキル効果（勝敗補正） ---

  // 【強心臓】: 幕内での取組、または勝ち越しがかかった一番で+10%
  if (traits.includes('KYOUSHINZOU')) {
      const isMakuuchi = rikishi.rank.division === 'Makuuchi';
      const isKachiKoshiMatch = context && context.currentWins === 7 && context.currentLosses <= 7;
      const isNijuuShouMatch = context && context.currentWins === 9 && context.currentLosses <= 5;
      if (isMakuuchi || isKachiKoshiMatch || isNijuuShouMatch) {
          myPower *= 1.1;
      }
  }

  // 【金星ハンター】: 横綱・大関相手で1.25倍
  if (traits.includes('KINBOSHI_HUNTER') && enemy.rankValue <= 2) {
      myPower *= 1.25;
  }

  // 【ノミの心臓】: 横綱・大関相手、または大事な一番で0.8倍
  if (traits.includes('NOMI_NO_SHINZOU')) {
      const isImportantMatch = context && (
          context.currentWins === 7 || // 勝ち越しがかかった
          (context.isLastDay && context.isYushoContention)
      );
      if (enemy.rankValue <= 2 || isImportantMatch) {
          myPower *= 0.8;
      }
  }

  // 【大舞台の鬼】: 優勝がかかった千秋楽/優勝決定戦で+20%
  if (traits.includes('OOBUTAI_NO_ONI') && context) {
      if (context.isLastDay && context.isYushoContention) {
          myPower *= 1.2;
      }
  }

  // 【連勝街道】: 3連勝以上で連勝数*1.2（最大+8）のボーナス
  if (traits.includes('RENSHOU_KAIDOU') && context && context.consecutiveWins >= 3) {
      const streakBonus = Math.min(8, context.consecutiveWins * 1.2);
      myPower += streakBonus;
  }

  // 【スロースターター】: 前半-6%, 後半+6%
  if (traits.includes('SLOW_STARTER') && context) {
      if (context.day <= Math.ceil(numBouts / 2)) {
          myPower *= 0.94;
      } else {
          myPower *= 1.06;
      }
  }

  // 【巨人殺し】: 格上の相手に+20%
  if (traits.includes('KYOJIN_GOROSHI') && enemy.power > myAverage * 1.2) {
      myPower *= 1.2;
  }

  // 【小兵キラー】: 格下の相手に+15%
  if (traits.includes('KOHEI_KILLER') && enemy.power < myAverage * 0.9) {
      myPower *= 1.15;
  }

  // 【四つの鬼】: GRAPPLE戦術時に+10%
  if (traits.includes('YOTSU_NO_ONI') && rikishi.tactics === 'GRAPPLE') {
      myPower *= 1.1;
  }

  // 【突っ張り特化】: PUSH戦術時に+10%
  if (traits.includes('TSUPPARI_TOKKA') && rikishi.tactics === 'PUSH') {
      myPower *= 1.1;
  }

  if (traits.includes('LONG_REACH') && myHeight >= 190) {
      myPower += 6;
  }

  if (traits.includes('HEAVY_PRESSURE') && myWeight - enemyWeight >= 15) {
      myPower *= 1.12;
  }

  if (traits.includes('WEAK_LOWER_BACK') && context && context.currentLosses > context.currentWins) {
      myPower *= 0.92;
  }

  if (traits.includes('OPENING_DASH') && context && context.day <= 3) {
      myPower *= 1.12;
  }

  if (traits.includes('SENSHURAKU_KISHITSU') && context?.isLastDay) {
      myPower *= 1.15;
  }

  if (traits.includes('TRAILING_FIRE') && context && context.currentLosses > context.currentWins) {
      myPower *= 1.18;
  }

  if (traits.includes('PROTECT_LEAD') && context && context.currentWins - context.currentLosses >= 3) {
      myPower *= 1.10;
  }

  if (traits.includes('BELT_COUNTER') && rikishi.tactics === 'GRAPPLE' && enemyWeight - myWeight >= 10) {
      myPower *= 1.15;
  }

  if (traits.includes('THRUST_RUSH') && rikishi.tactics === 'PUSH' && context && context.day <= 5) {
      myPower *= 1.12;
  }

  if (traits.includes('READ_THE_BOUT') && context?.previousResult === 'LOSS') {
      myPower += 4;
  }

  // 体格ボーナス
  if (rikishi.bodyType === 'ANKO') {
      // アンコ型: 押し相撲ボーナス
      myPower += 3;
  } else if (rikishi.bodyType === 'SOPPU') {
      // ソップ型: 引き技ボーナス（後で決まり手に反映）
  }
  
  // 4. 勝率計算
  const powerDiff = myPower - enemy.power;
  const winProbability = 1 / (1 + Math.exp(-0.05 * powerDiff));
  
  // 5. 乱数判定
  const roll = rng();
  const isWin = roll < winProbability;

  // 【土俵際の魔術師 / 土壇場返し】: 負け判定時に低確率で逆転
  if (!isWin) {
      const hasDohyogiwa = traits.includes('DOHYOUGIWA_MAJUTSU') && rng() < 0.06;
      const hasClutchReversal = traits.includes('CLUTCH_REVERSAL') && rng() < 0.04;
      if (hasDohyogiwa || hasClutchReversal) {
        const reversalMoves = ['うっちゃり', '網打ち', '突き落とし', '肩透かし', 'とったり'];
        const kimarite = reversalMoves[Math.floor(rng() * reversalMoves.length)];
        return { isWin: true, kimarite };
      }
  }

  // 6. 決まり手の決定
  let kimarite: string;
  if (isWin) {
    // 【荒技師】: レア技になりやすい
    if (traits.includes('ARAWAZASHI') && rng() < 0.4) {
        const rareMoves = ['一本背負い', '河津掛け', '蹴手繰り', 'とったり', '網打ち', '吊り出し', '小手投げ', '首投げ'];
        kimarite = rareMoves[Math.floor(rng() * rareMoves.length)];
    } else if (usedSignatureMove && rng() < 0.5) {
        kimarite = usedSignatureMove;
    } else {
        const stats = rikishi.stats;
        const totalPush = stats.tsuki + stats.oshi + stats.deashi;
        const totalGrapple = stats.kumi + stats.koshi + stats.power;

        const roll = rng();

        // ソップ型: 引き技率UP
        const soppuBonus = rikishi.bodyType === 'SOPPU' ? 0.15 : 0;

        if (totalPush > totalGrapple && roll < 0.6) {
            const pushMoves = ['押し出し', '押し倒し', '突き出し', '突き倒し', '電車道'];
            kimarite = pushMoves[Math.floor(rng() * pushMoves.length)];
        } else if (totalGrapple > totalPush && roll < 0.6) {
            const grappleMoves = ['寄り切り', '寄り倒し', '吊り出し', '送り出し', 'もろ差し'];
            kimarite = grappleMoves[Math.floor(rng() * grappleMoves.length)];
        } else {
            if (stats.nage > stats.waza) {
                const throwMoves = ['上手投げ', '下手投げ', '小手投げ', '掬い投げ', '上手出し投げ', '首投げ'];
                kimarite = throwMoves[Math.floor(rng() * throwMoves.length)];
            } else if (stats.waza > stats.power || soppuBonus > 0) {
                // ソップ型は技術・引き技寄りになる
                const techMoves = ['叩き込み', '引き落とし', '突き落とし', '肩透かし', '蹴手繰り', 'とったり'];
                kimarite = techMoves[Math.floor(rng() * techMoves.length)];
            } else {
                const reversalMoves = ['うっちゃり', '網打ち', '一本背負い', '河津掛け', '勇み足'];
                if (rng() < 0.3) {
                    kimarite = reversalMoves[Math.floor(rng() * reversalMoves.length)];
                } else {
                    kimarite = '寄り切り';
                }
            }
        }
    }
  } else {
    // 負け決まり手
    const losingMoves = [
        '押し出し', '寄り切り', '押し倒し', '寄り倒し', 
        '突き出し', '突き倒し', '上手投げ', '下手投げ', 
        '突き落とし', '引き落とし', '叩き込み', '吊り出し', 
        '送り出し', '小手投げ', 'すくい投げ', '勇み足'
    ];
    kimarite = losingMoves[Math.floor(rng() * losingMoves.length)];
  }

  return { isWin, kimarite };
};

/**
 * 階級に応じた敵を生成する（静的プールから取得）
 * @param division 現在の階級
 */
export const generateEnemy = (
    division: Division,
    eraYear: number,
    rng: RandomSource = Math.random,
): EnemyStats => {
    const pool = ENEMY_SEED_POOL[division];
    // ランダムに選択
    const index = Math.floor(rng() * pool.length);
    const enemy = pool[index];

    const poolDisplaySize: Record<Division, number> = {
      Makuuchi: 42,
      Juryo: 28,
      Makushita: 120,
      Sandanme: 200,
      Jonidan: 200,
      Jonokuchi: 60,
      Maezumo: 2,
    };
    const slot = division === 'Maezumo' ? 1 : (index % poolDisplaySize[division]) + 1;
    const rankNumber = division === 'Maezumo' ? 1 : Math.floor((slot - 1) / 2) + 1;
    const rankSide = slot % 2 === 1 ? 'East' : 'West';

    let rankName: string;
    let rankValue: number;
    if (division === 'Makuuchi') {
      if (slot <= 2) {
        rankName = '横綱';
        rankValue = 1;
      } else if (slot <= 4) {
        rankName = '大関';
        rankValue = 2;
      } else if (slot <= 8) {
        rankName = slot <= 6 ? '関脇' : '小結';
        rankValue = 3;
      } else {
        rankName = '前頭';
        rankValue = rankNumber <= 2 ? 4 : 5;
      }
    } else if (division === 'Juryo') {
      rankName = '十両';
      rankValue = 6;
    } else if (division === 'Makushita') {
      rankName = '幕下';
      rankValue = 7;
    } else if (division === 'Sandanme') {
      rankName = '三段目';
      rankValue = 8;
    } else if (division === 'Jonidan') {
      rankName = '序二段';
      rankValue = 9;
    } else if (division === 'Jonokuchi') {
      rankName = '序ノ口';
      rankValue = 10;
    } else {
      rankName = '前相撲';
      rankValue = 11;
    }

    const powerFluctuation =
      (rng() * Math.max(2.5, enemy.powerVariance)) - (Math.max(2.5, enemy.powerVariance) / 2);
    const eraShift = clamp((eraYear - 2026) * 0.12, -2, 6);
    const rankProgress = division === 'Maezumo'
      ? 0
      : 1 - (slot - 1) / Math.max(1, poolDisplaySize[division] - 1);
    const rankPowerShift = (rankProgress - 0.5) * 6;
    const basePower = enemy.basePower + enemy.growthBias * 8 + eraShift + rankPowerShift;
    const body = resolveEnemySeedBodyMetrics(division, `${enemy.seedId}-${slot}`);

    return {
        id: `seed-${enemy.seedId}-${index}`,
        shikona: `力士${index + 1}`,
        rankValue,
        rankName,
        rankNumber,
        rankSide,
        styleBias: enemy.styleBias,
        power: Math.round(basePower + powerFluctuation),
        heightCm: body.heightCm,
        weightKg: body.weightKg,
    };
};
