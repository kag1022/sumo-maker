import { RikishiStatus, Division } from './models';
import {
  ENEMY_SEED_POOL,
  EnemyStats,
  EnemyStyleBias,
  resolveEnemySeedBodyMetrics,
} from './catalog/enemyData';
import { CONSTANTS } from './constants';
import { RandomSource } from './simulation/deps';
import {
  calculateMomentumBonus,
  resolveBoutWinProb,
  resolvePlayerAbility,
  resolveUnifiedNpcStrength,
} from './simulation/strength/model';
import {
  resolveCompetitiveFactor,
} from './simulation/realism';
import {
  KimariteStyle,
  normalizeKimariteName,
} from './kimarite/catalog';
import {
  inferBodyTypeFromMetrics,
  resolveKimariteOutcome,
  type KimariteCompetitorProfile,
} from './kimarite/selection';
import { resolveStableById } from './simulation/heya/stableCatalog';
import { STABLE_ARCHETYPE_BY_ID } from './simulation/heya/stableArchetypeCatalog';
import { getCompatibilityWeight, styleToTactics } from './styleProfile';

export { type EnemyStats };

export interface BattleOpponent extends EnemyStats {
  stableId?: string;
  aptitudeTier?: RikishiStatus['aptitudeTier'];
  aptitudeProfile?: RikishiStatus['aptitudeProfile'];
  aptitudeFactor?: RikishiStatus['aptitudeFactor'];
  careerBand?: RikishiStatus['careerBand'];
  stagnation?: RikishiStatus['stagnation'];
  bashoFormDelta?: number;
}

/**
 * 取組コンテキスト（スキル判定に使用）
 */
export interface BoutContext {
  day: number;          // 何日目か (1~15)
  currentWins: number;  // その場所の現在の勝ち数
  currentLosses: number; // その場所の現在の負け数
  consecutiveWins: number; // 連勝数
  currentWinStreak?: number; // その場所の現在連勝数
  currentLossStreak?: number; // その場所の現在連敗数
  opponentWinStreak?: number; // 相手の現在連勝数
  opponentLossStreak?: number; // 相手の現在連敗数
  isLastDay: boolean;   // 千秋楽かどうか
  isYushoContention: boolean; // 優勝がかかっているか
  contentionTier?: 'Leader' | 'Contender' | 'Outside';
  titleImplication?: 'DIRECT' | 'CHASE' | 'NONE';
  boundaryImplication?: 'PROMOTION' | 'DEMOTION' | 'NONE';
  schedulePhase?: string;
  previousResult?: 'WIN' | 'LOSS' | 'ABSENT';
  bashoFormDelta?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveSignedStreak = (winStreak: number, lossStreak: number): number =>
  winStreak > 0 ? winStreak : lossStreak > 0 ? -lossStreak : 0;

const resolveStablePerformanceFactor = (stableId?: string): number => {
  if (!stableId) return 1;
  const stable = resolveStableById(stableId);
  if (!stable) return 1;
  const training = STABLE_ARCHETYPE_BY_ID[stable.archetypeId]?.training;
  if (!training) return 1;
  const growth = training.growth8;
  const avg =
    (growth.tsuki + growth.oshi + growth.kumi + growth.nage + growth.koshi + growth.deashi + growth.waza + growth.power) / 8;
  return Math.max(0.9, Math.min(1.1, avg));
};

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

const resolveKataBattleModifier = (status: RikishiStatus): number => {
  const kata = status.kataProfile;
  if (!kata) return 1;
  if (kata.settled) return 1.03;
  return kata.confidence < 0.35 ? 0.985 : 1.0;
};

const resolveDesignedStyleBattleModifier = (status: RikishiStatus): number => {
  const profile = status.designedStyleProfile;
  if (!profile) return 1;
  const compatibilityBonus = getCompatibilityWeight(profile.compatibility) / 100;
  const secretTacticsMatch = profile.secret && styleToTactics(profile.secret) === status.tactics;
  return 1 + compatibilityBonus + (secretTacticsMatch ? 0.03 : 0);
};

const toKimariteStyle = (tactics: RikishiStatus['tactics']): KimariteStyle =>
  tactics === 'PUSH' ? 'PUSH' :
    tactics === 'GRAPPLE' ? 'GRAPPLE' :
      tactics === 'TECHNIQUE' ? 'TECHNIQUE' :
        'BALANCE';


const buildEnemyKimariteStats = (
  enemy: BattleOpponent,
): Partial<Record<keyof RikishiStatus['stats'], number>> => {
  const base = clamp((enemy.ability ?? enemy.power) * 1.05, 35, 120);
  if (enemy.styleBias === 'PUSH') {
    return {
      tsuki: base * 1.15,
      oshi: base * 1.2,
      deashi: base * 0.95,
      power: base,
      waza: base * 0.6,
      nage: base * 0.5,
      kumi: base * 0.45,
      koshi: base * 0.55,
    };
  }
  if (enemy.styleBias === 'GRAPPLE') {
    return {
      kumi: base * 1.15,
      koshi: base * 1.1,
      power: base * 1.05,
      nage: base * 0.9,
      deashi: base * 0.8,
      waza: base * 0.72,
      tsuki: base * 0.45,
      oshi: base * 0.5,
    };
  }
  if (enemy.styleBias === 'TECHNIQUE') {
    return {
      waza: base * 1.2,
      nage: base * 1.1,
      deashi: base,
      tsuki: base * 0.7,
      oshi: base * 0.65,
      kumi: base * 0.75,
      koshi: base * 0.72,
      power: base * 0.68,
    };
  }
  return {
    tsuki: base * 0.82,
    oshi: base * 0.82,
    deashi: base * 0.82,
    power: base * 0.82,
    waza: base * 0.82,
    nage: base * 0.82,
    kumi: base * 0.82,
    koshi: base * 0.82,
  };
};

const buildEnemyKimariteProfile = (
  enemy: BattleOpponent,
): KimariteCompetitorProfile => {
  const bodyType = inferBodyTypeFromMetrics(enemy.heightCm, enemy.weightKg);
  const traits: RikishiStatus['traits'] = [];
  if (enemy.styleBias === 'PUSH') traits.push('TSUPPARI_TOKKA');
  if (enemy.styleBias === 'GRAPPLE') traits.push('YOTSU_NO_ONI');
  if (enemy.styleBias === 'TECHNIQUE') traits.push('ARAWAZASHI', 'READ_THE_BOUT');
  if (enemy.heightCm >= 190) traits.push('LONG_REACH');
  if (enemy.weightKg >= 155) traits.push('HEAVY_PRESSURE');
  return {
    style:
      enemy.styleBias === 'PUSH' || enemy.styleBias === 'GRAPPLE' || enemy.styleBias === 'TECHNIQUE'
        ? enemy.styleBias
        : 'BALANCE',
    bodyType,
    heightCm: enemy.heightCm,
    weightKg: enemy.weightKg,
    stats: buildEnemyKimariteStats(enemy),
    traits,
    historyCounts: {},
  };
};

const buildPlayerKimariteProfile = (
  rikishi: RikishiStatus,
  heightCm: number,
  weightKg: number,
  preferredMove?: string | null,
): KimariteCompetitorProfile => ({
  style: toKimariteStyle(rikishi.tactics),
  bodyType: rikishi.bodyType,
  heightCm,
  weightKg,
  stats: rikishi.stats,
  traits: rikishi.traits || [],
  preferredMove: preferredMove ?? undefined,
  historyCounts: rikishi.history.kimariteTotal ?? {},
});

const isSeventhWinMatch = (context?: BoutContext): boolean =>
  (context?.currentWins ?? 0) === 6;

const isHighPressureBout = (context?: BoutContext): boolean =>
  Boolean(
    context && (
      context.isLastDay ||
      context.titleImplication === 'DIRECT' ||
      context.titleImplication === 'CHASE' ||
      context.boundaryImplication === 'PROMOTION' ||
      context.boundaryImplication === 'DEMOTION'
    ),
  );

const canTriggerEdgeReversal = (
  winProbability: number,
  context?: BoutContext,
): boolean => winProbability >= 0.28 && isHighPressureBout(context);

const resolveBattleResult = (
  rikishi: RikishiStatus,
  enemy: BattleOpponent,
  context?: BoutContext,
  rng: RandomSource = Math.random,
): { isWin: boolean; kimarite: string; winProbability: number; opponentAbility: number } => {
  const traits = rikishi.traits || [];
  const numBouts = CONSTANTS.BOUTS_MAP[rikishi.rank.division];
  const currentWinStreak = Math.max(0, context?.currentWinStreak ?? context?.consecutiveWins ?? 0);
  const currentLossStreak = Math.max(0, context?.currentLossStreak ?? 0);
  const opponentWinStreak = Math.max(0, context?.opponentWinStreak ?? 0);
  const opponentLossStreak = Math.max(0, context?.opponentLossStreak ?? 0);

  const myTotal = Object.values(rikishi.stats).reduce((a, b) => a + b, 0);
  const myAverage = myTotal / 8;
  const conditionMod = 1.0 + ((rikishi.currentCondition - 50) / 200);
  const basePower = myAverage * conditionMod;
  let myPower = basePower;

  const baseMetrics = rikishi.bodyMetrics ?? DEFAULT_BODY_METRICS[rikishi.bodyType];
  const metricMod = resolveBodyMetricModifiers(rikishi.bodyType);
  const myHeight = baseMetrics.heightCm * metricMod.height;
  const myWeight = baseMetrics.weightKg * metricMod.weight;
  const enemyHeight = enemy.heightCm;
  const enemyWeight = enemy.weightKg;
  const sizeDiff = clamp(resolveSizeScore(myHeight, myWeight) - resolveSizeScore(enemyHeight, enemyWeight), -12, 12);
  myPower += sizeDiff * 0.9;
  myPower *= resolveEnemyStyleMatchupModifier(rikishi.tactics, enemy.styleBias);
  myPower *= resolveKataBattleModifier(rikishi);
  myPower *= resolveDesignedStyleBattleModifier(rikishi);

  let usedSignatureMove: string | null = null;
  if (rikishi.signatureMoves && rikishi.signatureMoves.length > 0) {
    const moveName = normalizeKimariteName(rikishi.signatureMoves[0]);
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

  if (traits.includes('KINBOSHI_HUNTER') && enemy.rankValue <= 2) myPower *= 1.25;
  if (traits.includes('KYOJIN_GOROSHI') && enemy.power > myAverage * 1.2) myPower *= 1.2;
  if (traits.includes('KOHEI_KILLER') && enemy.power < myAverage * 0.9) myPower *= 1.15;
  if (traits.includes('YOTSU_NO_ONI') && rikishi.tactics === 'GRAPPLE') myPower *= 1.1;
  if (traits.includes('TSUPPARI_TOKKA') && rikishi.tactics === 'PUSH') myPower *= 1.1;
  if (traits.includes('LONG_REACH') && myHeight >= 190) myPower += 6;
  if (traits.includes('HEAVY_PRESSURE') && myWeight - enemyWeight >= 15) myPower *= 1.12;
  if (traits.includes('BELT_COUNTER') && rikishi.tactics === 'GRAPPLE' && enemyWeight - myWeight >= 10) myPower *= 1.15;
  if (rikishi.bodyType === 'ANKO') myPower += 3;
  if (rikishi.genome) {
    const volatilityFactor = 1 + (rikishi.genome.variance.formVolatility - 50) / 200;
    const conditionDelta = myPower * (conditionMod - 1);
    myPower += conditionDelta * (volatilityFactor - 1);
  }
  const intrinsicPower = myPower;

  if (traits.includes('KYOUSHINZOU')) {
    const isClutchSpot =
      isSeventhWinMatch(context) ||
      (context?.isLastDay && context.isYushoContention) ||
      context?.titleImplication === 'DIRECT' ||
      context?.titleImplication === 'CHASE' ||
      context?.boundaryImplication === 'PROMOTION' ||
      context?.boundaryImplication === 'DEMOTION';
    if (isClutchSpot) myPower *= 1.1;
  }
  if (traits.includes('NOMI_NO_SHINZOU')) {
    const isImportantMatch = context && (
      isSeventhWinMatch(context) ||
      context.titleImplication === 'DIRECT' ||
      context.titleImplication === 'CHASE' ||
      context.boundaryImplication === 'PROMOTION' ||
      context.boundaryImplication === 'DEMOTION' ||
      (context.isLastDay && context.isYushoContention)
    );
    if (enemy.rankValue <= 2 || isImportantMatch) myPower *= 0.8;
  }
  if (
    traits.includes('OOBUTAI_NO_ONI') &&
    context &&
    (
      (context.isLastDay && context.isYushoContention) ||
      context.titleImplication === 'DIRECT'
    )
  ) {
    myPower *= 1.2;
  }
  if (traits.includes('RENSHOU_KAIDOU') && currentWinStreak >= 3) myPower += Math.min(8, currentWinStreak * 1.2);
  if (traits.includes('SLOW_STARTER') && context) myPower *= context.day <= Math.ceil(numBouts / 2) ? 0.94 : 1.06;
  if (traits.includes('WEAK_LOWER_BACK') && context && context.currentLosses > context.currentWins) myPower *= 0.92;
  if (traits.includes('OPENING_DASH') && context && context.day <= 3) myPower *= 1.12;
  if (traits.includes('SENSHURAKU_KISHITSU') && context?.isLastDay) myPower *= 1.15;
  if (traits.includes('TRAILING_FIRE') && context && context.currentLosses > context.currentWins) myPower *= 1.18;
  if (traits.includes('PROTECT_LEAD') && context && context.currentWins - context.currentLosses >= 3) myPower *= 1.10;
  if (traits.includes('THRUST_RUSH') && rikishi.tactics === 'PUSH' && context && context.day <= 5) myPower *= 1.12;
  if (traits.includes('READ_THE_BOUT') && context?.previousResult === 'LOSS') myPower += 4;

  if (rikishi.genome) {
    const gv = rikishi.genome.variance;
    let dnaBonus = 0;
    if (context) {
      const isImportant =
        isSeventhWinMatch(context) ||
        (context.isLastDay && context.isYushoContention) ||
        context.currentWins >= 10 ||
        context.titleImplication === 'DIRECT' ||
        context.titleImplication === 'CHASE' ||
        context.boundaryImplication === 'PROMOTION' ||
        context.boundaryImplication === 'DEMOTION';
      if (isImportant) dnaBonus += gv.clutchBias * 0.1;
    }
    if (context) {
      const streakFactor = (gv.streakSensitivity - 50) / 100;
      if (currentWinStreak >= 2) dnaBonus += currentWinStreak * streakFactor * 0.5;
      else if (currentLossStreak >= 2) dnaBonus -= currentLossStreak * streakFactor * 0.35;
    }
    const maxDnaMod = intrinsicPower * 0.15;
    dnaBonus = clamp(dnaBonus, -maxDnaMod, maxDnaMod);
    myPower += dnaBonus;
  }

  const playerStyle = toKimariteStyle(rikishi.tactics);
  const playerProfile = buildPlayerKimariteProfile(
    rikishi,
    myHeight,
    myWeight,
    usedSignatureMove,
  );
  const enemyProfile = buildEnemyKimariteProfile(enemy);

  const bonus = myPower - basePower;
  const playerCompetitiveFactor = resolveCompetitiveFactor(rikishi);
  const enemyCompetitiveFactor = resolveCompetitiveFactor(
    enemy as BattleOpponent & Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor' | 'careerBand' | 'stagnation'>,
  );
  const enemyAbilityRaw = (enemy.ability ?? enemy.power) + (enemy.bashoFormDelta ?? 0);
  const enemyAbility =
    resolveUnifiedNpcStrength({
      ability: enemyAbilityRaw,
      power: enemy.power,
    }) *
    resolveStablePerformanceFactor(enemy.stableId) *
    enemyCompetitiveFactor;
  const injuryPenalty = Math.max(0, rikishi.injuryLevel);
  const myAbilityBase =
    resolvePlayerAbility(rikishi, baseMetrics, bonus) + (context?.bashoFormDelta ?? 0);
  const myAbility = myAbilityBase * playerCompetitiveFactor;
  const myMomentum = calculateMomentumBonus(resolveSignedStreak(currentWinStreak, currentLossStreak));
  const opponentMomentum = calculateMomentumBonus(resolveSignedStreak(opponentWinStreak, opponentLossStreak));
  const momentumDelta = myMomentum - opponentMomentum;
  const baseWinProbability = resolveBoutWinProb({
    attackerAbility: myAbility,
    defenderAbility: enemyAbility,
    attackerStyle: playerStyle,
    defenderStyle: enemy.styleBias,
    injuryPenalty,
    bonus: momentumDelta,
  });
  const winProbability = clamp(baseWinProbability, 0.03, 0.97);
  const opponentAbility = enemyAbility;
  const isWin = rng() < winProbability;

  if (!isWin && canTriggerEdgeReversal(winProbability, context)) {
    const hasDohyogiwa = traits.includes('DOHYOUGIWA_MAJUTSU') && rng() < 0.06;
    const hasClutchReversal = traits.includes('CLUTCH_REVERSAL') && rng() < 0.04;
    if (hasDohyogiwa || hasClutchReversal) {
      const reversal = resolveKimariteOutcome({
        winner: playerProfile,
        loser: enemyProfile,
        rng,
        forcePattern: 'EDGE_REVERSAL',
        allowNonTechnique: false,
      });
      return {
        isWin: true,
        kimarite: normalizeKimariteName(reversal.kimarite),
        winProbability,
        opponentAbility,
      };
    }
  }

  const selected = resolveKimariteOutcome({
    winner: isWin ? playerProfile : enemyProfile,
    loser: isWin ? enemyProfile : playerProfile,
    rng,
    allowNonTechnique: true,
  });
  return {
    isWin,
    kimarite: normalizeKimariteName(selected.kimarite),
    winProbability,
    opponentAbility,
  };
};

export const calculateBattleResult = (
  rikishi: RikishiStatus,
  enemy: BattleOpponent,
  context?: BoutContext,
  rng: RandomSource = Math.random,
): { isWin: boolean; kimarite: string; winProbability: number; opponentAbility: number } =>
  resolveBattleResult(rikishi, enemy, context, rng);

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
      Jonidan: 250,
      Jonokuchi: 78,
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
    const ability = basePower * 0.92 + enemy.growthBias * 4.5;
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
        ability: ability + powerFluctuation * 0.7,
        heightCm: body.heightCm,
        weightKg: body.weightKg,
    };
};
