import { RikishiStatus, Oyakata, Injury } from './models';
import { CONSTANTS } from './constants';

/**
 * 能力成長・衰退ロジック
 * @param currentStatus 現在の状態
 * @param oyakata 親方パラメータ
 * @param _injuryOccurred (未使用: status.injuriesを参照)
 */
export const applyGrowth = (currentStatus: RikishiStatus, oyakata: Oyakata | null, _injuryOccurred: boolean): RikishiStatus => {
  // ステータスのコピー
  const stats = { ...currentStatus.stats };
  const { age, growthType, tactics, potential } = currentStatus;
  const injuries = currentStatus.injuries ? currentStatus.injuries.map(i => ({...i})) : []; // Deep copy injuries

  // --- 1. 怪我の回復・進行処理 ---
  let maxSeverity = 0;
  const activeInjuries: Injury[] = [];

  for (const injury of injuries) {
      if (injury.status === 'HEALED') continue;

      // 回復量計算 (若いほど早い)
      let recovery = 1;
      if (age < 23) recovery++;
      
      // 慢性以外は回復
      if (injury.status !== 'CHRONIC') {
          injury.severity -= recovery;
          
          if (injury.severity <= 0) {
              injury.status = 'HEALED';
              injury.severity = 0;
          } else {
              // 状態遷移 (Acute -> Subacute)
              if (injury.status === 'ACUTE' && injury.severity <= 4) {
                  injury.status = 'SUBACUTE';
              }
              // 慢性化判定 (一定確率で古傷として残る)
              if (Math.random() < CONSTANTS.PROBABILITY.CHRONIC_CONVERSION) {
                  injury.status = 'CHRONIC';
                  injury.name = '古傷・' + injury.name;
                  injury.severity = Math.max(2, Math.ceil(injury.severity / 2)); 
              }
          }
      } else {
          // 慢性障害: 基本的には治らないが、severityは低めで推移
          // たまに悪化するロジックを入れてもいいが、今回は固定
      }

      if (injury.status !== 'HEALED') {
          // 休場が必要なのは慢性以外（＝治療中）のみとする
          // 慢性化した怪我は出場しながら付き合っていくものとする
          if (injury.status !== 'CHRONIC') {
              maxSeverity = Math.max(maxSeverity, injury.severity);
          }
      }
      activeInjuries.push(injury);
  }

  // レガシー互換
  const injuryLevel = maxSeverity;

  // --- 2. 基本成長計算 ---
  let growthRate = 0;
  const params = CONSTANTS.GROWTH_PARAMS[growthType];

  if (age <= params.peakEnd) {
      // 成長期
      growthRate = params.growthRate;
      if (age < params.peakStart) growthRate *= 0.8; // 若すぎると体作り段階
  } else if (age >= params.decayStart) {
      // 衰退期
      const decayYears = age - params.decayStart;
      growthRate = -0.5 - (decayYears * 0.2); // 年々衰えが加速
  }

  // --- 3. 能力ごとの変動適用 ---
  (Object.keys(stats) as (keyof typeof stats)[]).forEach(statName => {
      let delta: number;

      // 基本変動
      if (growthRate > 0) {
          // 成長
          delta = (Math.random() * 2.0 + 1.0) * growthRate;
          
          // 限界接近による鈍化 (Current / Potential)
          // 敵の最大強さが150なので、Potential(100)を基準としつつそれ以上伸びるように緩和
          const limit = potential * 1.5;
          const current = stats[statName];
          
          if (current > limit * 0.8) {
              delta *= 0.5;
          }
          if (current > limit) {
              delta *= 0.1; // 限界突破は厳しい
          }
      } else {
          // 衰退
          delta = (Math.random() * 1.0) * growthRate; // growthRate is negative
      }

      // 戦術補正
      const tacticMod = CONSTANTS.TACTICAL_GROWTH_MODIFIERS[tactics][statName] || 1.0;
      if (growthRate > 0) delta *= tacticMod;

      // 親方補正
      if (oyakata && growthRate > 0) {
          const oyakataMod = oyakata.growthMod[statName] || 1.0;
          delta *= oyakataMod;
      }

      // ランダム揺らぎ
      delta += (Math.random() * 2.0 - 1.0);
      
      // 成長期の上振れ（覚醒）
      if (growthRate > 0 && Math.random() < CONSTANTS.PROBABILITY.AWAKENING_GROWTH) {
          delta += 2.0; // たまにグッと伸びる
      }

      // 得意技ボーナス (NEW)
      if (currentStatus.signatureMoves) {
          for (const move of currentStatus.signatureMoves) {
              const moveData = CONSTANTS.SIGNATURE_MOVE_DATA[move];
              if (moveData && moveData.relatedStats.includes(statName)) {
                  delta += 0.3; // 成長ボーナス
              }
          }
      }

      // --- 怪我によるペナルティ ---
      // アクティブな怪我の影響を受ける
      for (const injury of activeInjuries) {
          if (injury.status === 'HEALED') continue;
          const data = CONSTANTS.INJURY_DATA[injury.type];
          if (data && data.affectedStats.includes(statName)) {
              // 該当箇所の怪我なら成長阻害 / 減衰加速
              const penalty = injury.severity * 0.2; // 軽減: 0.5 -> 0.2
              delta -= penalty;
          } else {
              // 該当箇所でなくても全体的なトレーニング不足で微減
              delta -= 0.05; // 軽減: 0.2 -> 0.05
          }
      }

      // 適用 (上限160)
      stats[statName] = Math.max(1, Math.min(160, stats[statName] + delta)); 
  });

  // 耐久力変動
  let durability = currentStatus.durability;
  if (age > 30) durability -= 1;

  return {
    ...currentStatus,
    stats,
    injuryLevel,
    durability,
    injuries: activeInjuries,
    currentCondition: 50
  };
};

/**
 * 引退判定
 * @returns boolean 引退すべきか
 */
export const checkRetirement = (status: RikishiStatus): { shouldRetire: boolean, reason?: string } => {
    // 1. 強制引退年齢
    if (status.age >= CONSTANTS.MANDATORY_RETIREMENT_AGE) {
        return { shouldRetire: true, reason: '定年により引退' };
    }

    // 1.2. 長期休場による引退（30歳以上で5場所連続休場）
    if (status.age >= 30) {
        const last5 = status.history.records.slice(-5);
        if (last5.length === 5 && last5.every(r => r.absent > 0)) {
             return { shouldRetire: true, reason: '度重なる怪我と長期休場により引退' };
        }
    }
    // 1.3. 超長期休場による引退（年齢問わず10場所連続）
    const last10 = status.history.records.slice(-10);
    if (last10.length === 10 && last10.every(r => r.absent > 0)) {
         return { shouldRetire: true, reason: '怪我の回復が見込めず引退（長期・連続休場）' };
    }

    // 1.5. 元関取の引き際（幕内・十両経験者）
    // 最高位が十両以上の場合
    const isFormerSekitori = ['Makuuchi', 'Juryo'].includes(status.history.maxRank.division);
    
    if (isFormerSekitori) {
        // A. 幕下陥落（復帰を諦める）
        if (!['Makuuchi', 'Juryo'].includes(status.rank.division)) {
            // 35歳以上で陥落したら引退（再起不能と判断されやすい）
            if (status.age >= 35) {
                 return { shouldRetire: true, reason: '度重なる怪我により気力・体力の限界' };
            }
        }

        // B. 大怪我（関取としてのプライド、または公傷制度なき今）
        // 怪我レベルが高い＝長期休場不可避
        if (status.injuryLevel >= 9 && status.age >= 22) {
             return { shouldRetire: true, reason: '怪我の回復が見込めず引退（関取）' };
        }
        
        // C. 上位での限界（連続負け越し）
        // 関取在位中でも、成績不振が続けば引退を選ぶ（35歳以上で4場所連続負け越し）
        if (status.age >= 35 && ['Makuuchi', 'Juryo'].includes(status.rank.division)) {
             const recs = status.history.records.slice(-4);
             if (recs.length === 4 && recs.every(r => r.wins < 8)) {
                 return { shouldRetire: true, reason: '体力の限界により引退（連続負け越し）' };
             }
        }
    }

    // 2. 能力低下による引退（弱すぎて勝てない）
    const totalStats = Object.values(status.stats).reduce((a, b) => a + b, 0);

    // 横綱の引退勧告（厳格化と休場考慮）
    if (status.rank.name === '横綱') {
        // 3場所連続負け越し（全休は除く）
        // 横綱は怪我による休場（全休）はカウントせず、実際に出場して負け越した場所が続くと引退
        // 横綱在位中の記録のみ抽出し、かつ全休（15休）を除外
        const effectiveRecords = status.history.records
            .filter(r => r.rank.name === '横綱')
            .filter(r => r.absent < 15);
        
        if (effectiveRecords.length >= 2) {
            const last2 = effectiveRecords.slice(-2);
            
            // 2連続で「出場して負け越し」
            if (last2.every(r => r.wins < 8)) {
                return { shouldRetire: true, reason: '横綱として出場場所2連続負け越し' };
            }
        }
        // 能力の大幅な衰え（プライドによる引退）
        if (totalStats < 250 && status.age > 30) {
             return { shouldRetire: true, reason: '体力の限界（横綱）' };
        }
    } else {
        // 大関以下の引退判定
        // 幕下以下で35歳以上かつ能力値がピークの半分以下...などの判定
        // 簡易的に「十両以上の経験値がありながら幕下に低迷」かつ「年齢30超え」
        if (status.age > 30 && status.rank.division !== 'Makuuchi' && status.rank.division !== 'Juryo') {
            // 元関取かどうかの判定が必要だが、ここでは「現在幕下以下」で一括
             if (totalStats < 200) {
                return { shouldRetire: true, reason: '体力の限界' };
             }
        }
    }

    // 3. 怪我による引退
    // リハビリが長引いて引退などはここで
    if (status.injuryLevel > 10) { // 緩和: 5->10 (横綱は休みがちなので少し許容、あるいはロジック変更)
         // 長期休場明けで復帰不能
         return { shouldRetire: true, reason: '怪我の回復が見込めず引退' };
    }

    return { shouldRetire: false };
};
