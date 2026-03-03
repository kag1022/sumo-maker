import { RikishiStatus, Oyakata, Injury } from './models';
import { CONSTANTS } from './constants';
import { RandomSource } from './simulation/deps';
import { STABLE_ARCHETYPE_BY_ID } from './simulation/heya/stableArchetypeCatalog';
import {
  computeConsecutiveAbsenceStreak,
  computeConsecutiveMakekoshiStreak,
  resolveRetirementChance,
  resolveRetirementReason,
} from './simulation/retirement/shared';

/**
 * 能力成長・衰退ロジック
 * @param currentStatus 現在の状態
 * @param oyakata 親方パラメータ
 * @param _injuryOccurred (未使用: status.injuriesを参照)
 */
export const applyGrowth = (
  currentStatus: RikishiStatus,
  oyakata: Oyakata | null,
  _injuryOccurred: boolean,
  rng: RandomSource = Math.random,
): RikishiStatus => {
  // ステータスのコピー
  const stats = { ...currentStatus.stats };
  const { age, growthType, tactics, potential, bodyType, traits } = currentStatus;
  const stableTraining = STABLE_ARCHETYPE_BY_ID[currentStatus.stableArchetypeId]?.training;
  const injuries = currentStatus.injuries ? currentStatus.injuries.map(i => ({...i})) : []; // Deep copy injuries

  // --- 1. 怪我の回復・進行処理 ---
  let maxSeverity = 0;
  const activeInjuries: Injury[] = [];

  for (const injury of injuries) {
      if (injury.status === 'HEALED') continue;

      // 回復量計算 (若いほど早い)
      let recovery = 1;
      if (age < 23) recovery++;
      if (traits.includes('RECOVERY_MONSTER')) recovery++;
      // DNA: 回復力係数
      if (currentStatus.genome) {
        recovery = Math.max(1, Math.round(recovery * currentStatus.genome.durability.recoveryRate));
      }
      if (stableTraining) {
        recovery = Math.max(1, Math.round(recovery * stableTraining.recoveryRateMultiplier));
      }
      
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
              // 慢性化判定
              let chronicChance = CONSTANTS.PROBABILITY.CHRONIC_CONVERSION;
              // 【爆弾持ち】: 慢性化確率100%
              if (traits.includes('BAKUDAN_MOCHI')) {
                  chronicChance = 1.0;
              }
              // DNA: 慢性化耐性（0-100で減算）
              if (currentStatus.genome) {
                  chronicChance *= 1 - (currentStatus.genome.durability.chronicResistance / 200);
              }
              if (stableTraining) {
                  chronicChance *= 1 - (stableTraining.chronicResistanceBonus / 200);
              }
              if (rng() < chronicChance) {
                  injury.status = 'CHRONIC';
                  if (!injury.name.startsWith('古傷・')) {
                      injury.name = '古傷・' + injury.name;
                  }
                  injury.severity = Math.max(2, Math.ceil(injury.severity / 2)); 
              }
          }
      } else {
          // 慢性障害: 基本的には治らない
      }

      if (injury.status !== 'HEALED') {
          // 休場が必要なのは慢性以外（＝治療中）のみとする
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
  const params = { ...CONSTANTS.GROWTH_PARAMS[growthType] };

  // DNA: genome の成長カーブが存在する場合は DNA 主導で上書き
  const genome = currentStatus.genome;
  if (genome) {
    params.peakStart = Math.round(genome.growth.maturationAge - genome.growth.peakLength * 0.3);
    params.peakEnd = Math.round(genome.growth.maturationAge + genome.growth.peakLength * 0.7);
    params.decayStart = params.peakEnd + 1;
  }

  // 【鉄人】: 衰退開始を+3年遅らせる
  if (traits.includes('TETSUJIN')) {
      params.decayStart += 3;
      params.peakEnd += 3;
  }

  // 【早熟】: 成長カーブ変更
  if (traits.includes('SOUJUKU')) {
      if (age <= 24) {
          params.growthRate *= 1.8;
      }
  }

  // 【大器晩成】: 成長カーブ変更
  if (traits.includes('TAIKI_BANSEI')) {
      if (age <= 29) {
          params.growthRate *= 0.5;
      } else {
          params.growthRate *= 1.8;
          params.decayStart = Math.max(params.decayStart, 36);
          params.peakEnd = Math.max(params.peakEnd, 35);
      }
  }

  if (age <= params.peakEnd) {
      // 成長期
      growthRate = params.growthRate;
      if (age < params.peakStart) growthRate *= 0.8; // 若すぎると体作り段階
  } else if (age >= params.decayStart) {
      // 衰退期
      const decayYears = age - params.decayStart;
      let decayBase = -0.5 - (decayYears * 0.2); // 年々衰えが加速
      // DNA: 衰退速度係数
      if (genome) {
        decayBase *= genome.growth.lateCareerDecay;
      }
      growthRate = decayBase;
      // 【早熟】: 衰退加速
      if (traits.includes('SOUJUKU') && age >= 27) {
          growthRate *= 1.5; // より早く衰える（負の値がより大きくなる）
      }
  }

  // --- 3. 能力ごとの変動適用 ---
  // 怪我の影響を受けている能力を特定（稽古の虫用）
  const injuredStats = new Set<string>();
  for (const injury of activeInjuries) {
      if (injury.status === 'HEALED') continue;
      const data = CONSTANTS.INJURY_DATA[injury.type];
      if (data) {
          data.affectedStats.forEach(s => injuredStats.add(s));
      }
  }

  (Object.keys(stats) as (keyof typeof stats)[]).forEach(statName => {
      let delta: number;

      // 基本変動
      if (growthRate > 0) {
          // 成長
          delta = (rng() * 2.0 + 1.0) * growthRate;
          
          // 限界接近による鈍化
          // DNA: genome がある場合は ceiling から stat ごとの limit を計算
          let limit: number;
          if (genome) {
            const cMap: Record<string, number> = {
              tsuki: (genome.base.powerCeiling * 0.4 + genome.base.speedCeiling * 0.3 + genome.base.styleFit * 0.3),
              oshi: (genome.base.powerCeiling * 0.5 + genome.base.speedCeiling * 0.3 + genome.base.styleFit * 0.2),
              kumi: (genome.base.powerCeiling * 0.3 + genome.base.techCeiling * 0.4 + genome.base.ringSense * 0.3),
              nage: (genome.base.techCeiling * 0.5 + genome.base.powerCeiling * 0.3 + genome.base.ringSense * 0.2),
              koshi: (genome.base.ringSense * 0.4 + genome.base.powerCeiling * 0.3 + genome.base.speedCeiling * 0.3),
              deashi: (genome.base.speedCeiling * 0.5 + genome.base.ringSense * 0.2 + genome.base.styleFit * 0.3),
              waza: (genome.base.techCeiling * 0.4 + genome.base.ringSense * 0.4 + genome.base.styleFit * 0.2),
              power: (genome.base.powerCeiling * 0.6 + genome.base.speedCeiling * 0.2 + genome.base.styleFit * 0.2),
            };
            limit = (cMap[statName] ?? 50) * 1.6;
          } else {
            limit = potential * 1.5;
          }
          const current = stats[statName];
          
          if (current > limit * 0.8) {
              delta *= 0.5;
          }
          if (current > limit) {
              delta *= 0.1;
          }
      } else {
          // 衰退
          delta = (rng() * 1.0) * growthRate;
      }

      // 戦術補正
      const tacticMod = CONSTANTS.TACTICAL_GROWTH_MODIFIERS[tactics][statName] || 1.0;
      if (growthRate > 0) delta *= tacticMod;
      if (growthRate > 0 && stableTraining) {
          delta *= stableTraining.growth8[statName] ?? 1.0;
      }

      // --- 体格補正 ---
      if (growthRate > 0) {
          const bodyData = CONSTANTS.BODY_TYPE_DATA[bodyType];
          const bodyMod = bodyData.growthMod[statName] || 1.0;
          delta *= bodyMod;
      }

      // 親方補正
      if (oyakata && growthRate > 0) {
          let oyakataMod = oyakata.growthMod[statName] || 1.0;
          // 【普通体格】: 親方バフ効果1.2倍
          if (bodyType === 'NORMAL') {
              const bodyData = CONSTANTS.BODY_TYPE_DATA[bodyType];
              oyakataMod = 1.0 + (oyakataMod - 1.0) * bodyData.oyakataBuffMod;
          }
          delta *= oyakataMod;
      }

      // ランダム揺らぎ
      delta += (rng() * 2.0 - 1.0);
      
      // --- スキル補正 ---
      // 【稽古の虫】: 怪我のない能力の成長率1.12倍
      if (traits.includes('KEIKO_NO_MUSHI') && growthRate > 0 && !injuredStats.has(statName)) {
          delta *= 1.12;
      }

      // 【サボり癖】: 成長率0.8倍
      if (traits.includes('SABORI_GUSE') && growthRate > 0) {
          delta *= 0.8;
      }

      // 成長期の上振れ（覚醒）
      let awakeningChance = CONSTANTS.PROBABILITY.AWAKENING_GROWTH;
      // 【サボり癖】: 覚醒確率UP
      if (traits.includes('SABORI_GUSE')) {
          awakeningChance = 0.20;
      }
      if (growthRate > 0 && rng() < awakeningChance) {
          delta += 2.0; // たまにグッと伸びる
      }

      // 得意技ボーナス
      if (currentStatus.signatureMoves) {
          for (const move of currentStatus.signatureMoves) {
              const moveData = CONSTANTS.SIGNATURE_MOVE_DATA[move];
              if (moveData && moveData.relatedStats.includes(statName)) {
                  delta += 0.15;
              }
          }
      }

      // --- 怪我によるペナルティ ---
      for (const injury of activeInjuries) {
          if (injury.status === 'HEALED') continue;
          const data = CONSTANTS.INJURY_DATA[injury.type];
          if (data && data.affectedStats.includes(statName)) {
              const penalty = injury.severity * 0.2;
              delta -= penalty;
          } else {
              delta -= 0.05;
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
export const checkRetirement = (
  status: RikishiStatus,
  rng: RandomSource = Math.random,
): { shouldRetire: boolean, reason?: string } => {
  if (status.age >= CONSTANTS.PHYSICAL_LIMIT_RETIREMENT_AGE) {
    return { shouldRetire: true, reason: '気力・体力の限界により引退' };
  }

  const records = status.history.records;
  const last10 = records.slice(-10);
  if (last10.length === 10 && last10.every((record) => record.absent > 0)) {
    return { shouldRetire: true, reason: '怪我の回復が見込めず引退（長期・連続休場）' };
  }

  const totalMatches = status.history.totalWins + status.history.totalLosses;
  const careerWinRate = totalMatches > 0 ? status.history.totalWins / totalMatches : 0.5;
  const consecutiveAbsence = computeConsecutiveAbsenceStreak(records, 10);
  const consecutiveMakekoshi = computeConsecutiveMakekoshiStreak(records, 10);
  const isFormerSekitori =
    status.history.maxRank.division === 'Makuuchi' || status.history.maxRank.division === 'Juryo';

  const chance = resolveRetirementChance({
    age: status.age,
    injuryLevel: status.injuryLevel,
    currentDivision: status.rank.division,
    isFormerSekitori,
    consecutiveAbsence,
    consecutiveMakekoshi,
    profile: status.retirementProfile ?? 'STANDARD',
    retirementBias: 1,
    careerBashoCount: records.length,
    careerWinRate,
  });

  if (chance > 0 && rng() < chance) {
    return {
      shouldRetire: true,
      reason: resolveRetirementReason({
        age: status.age,
        consecutiveAbsence,
        consecutiveMakekoshi,
        injuryLevel: status.injuryLevel,
        isFormerSekitori,
        currentDivision: status.rank.division,
      }),
    };
  }

  return { shouldRetire: false };
};
