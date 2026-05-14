import { RikishiStatus, Division, StyleArchetype, WinRoute } from './models';
import {
  ENEMY_SEED_POOL,
  EnemyStats,
  EnemyStyleBias,
  resolveEnemySeedBodyMetrics,
} from './catalog/enemyData';
import { CONSTANTS } from './constants';
import { RandomSource } from './simulation/deps';
import {
  type BoutExplanationFactor,
  type BoutExplanationSnapshot,
  isBoutFlowDiagnosticSnapshotEnabled,
  isBoutExplanationSnapshotEnabled,
  isBoutWinProbSnapshotEnabled,
  isPreBoutPhaseSnapshotEnabled,
  recordBoutFlowDiagnosticSnapshot,
  recordBoutExplanationSnapshot,
  recordBoutWinProbSnapshot,
  recordPreBoutPhaseSnapshot,
} from './simulation/diagnostics';
import { createBoutFlowDiagnosticSnapshotFromExplanationSnapshot } from './simulation/combat/boutFlowDiagnosticBuilder';
import {
  resolvePlayerBoutCompat,
  type PlayerBoutCompatNormalizedInput,
  type PlayerBoutCompatResult,
} from './simulation/combat/playerCompat';
import { resolveCombatKernelProbability } from './simulation/combat/kernel';
import {
  type PreBoutPhaseResolution,
  resolvePreBoutPhaseWeights,
} from './simulation/combat/preBoutPhase';
import type { CombatStyle } from './simulation/combat/types';
import {
  calculateMomentumBonus,
  resolveBoutWinProb,
  resolvePlayerAbility,
  resolveRankBaselineAbility,
  resolveUnifiedNpcStrength,
} from './simulation/strength/model';
import type {
  BashoFormatPolicy,
  BoutOrdinalContext,
  BoutPressureContext,
} from './simulation/basho/formatPolicy';
import {
  resolvePlayerFavoriteCompression,
  resolvePlayerStagnationState,
} from './simulation/playerRealism';
import {
  resolveCompetitiveFactor,
} from './simulation/realism';
import { resolveStablePerformanceFactor } from './simulation/combat/profile';
import {
  KimariteStyle,
  normalizeKimariteName,
} from './kimarite/catalog';
import {
  inferBodyTypeFromMetrics,
  resolveKimariteOutcome,
  type KimariteCompetitorProfile,
} from './kimarite/selection';
import {
  type BoutEngagement,
  resolveBoutEngagement,
} from './kimarite/engagement';
import { resolveFinishRoute } from './kimarite/finishRoute';
import { createKimariteRepertoireFromSeed, ensureKimariteRepertoire } from './kimarite/repertoire';
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveDisplayedWeakStyles,
  resolveInternalStrengthStyles,
  resolveInternalWeakStyles,
  resolvePrimaryIdentityStyles,
  resolveStyleMatchupDelta,
} from './style/identity';
import { styleToTactics } from './styleProfile';

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
  day: number;          // カレンダー上の何日目か (1~15)
  currentWins: number;  // その場所の現在の勝ち数
  currentLosses: number; // その場所の現在の負け数
  consecutiveWins: number; // 連勝数
  currentWinStreak?: number; // その場所の現在連勝数
  currentLossStreak?: number; // その場所の現在連敗数
  opponentWinStreak?: number; // 相手の現在連勝数
  opponentLossStreak?: number; // 相手の現在連敗数
  isLastDay: boolean;   // 当人の最終取組かどうか（legacy 名）
  isYushoContention: boolean; // 優勝がかかっているか
  formatKind?: BashoFormatPolicy['kind'];
  ordinal?: BoutOrdinalContext;
  pressure?: BoutPressureContext;
  contentionTier?: 'Leader' | 'Contender' | 'Outside';
  titleImplication?: 'DIRECT' | 'CHASE' | 'NONE';
  boundaryImplication?: 'PROMOTION' | 'DEMOTION' | 'NONE';
  schedulePhase?: string;
  previousResult?: 'WIN' | 'LOSS' | 'ABSENT';
  bashoFormDelta?: number;
  expectedWinsSoFar?: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveSignedStreak = (winStreak: number, lossStreak: number): number =>
  winStreak > 0 ? winStreak : lossStreak > 0 ? -lossStreak : 0;

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

const resolveIdentityBattleModifier = (
  status: RikishiStatus,
  enemyStyle?: EnemyStyleBias,
): number => {
  const ensured = ensureStyleIdentityProfile(status);
  const delta = resolveStyleMatchupDelta(ensured.styleIdentityProfile, enemyStyle);
  return 1 + delta;
};

const toKimariteStyle = (tactics: RikishiStatus['tactics']): KimariteStyle =>
  tactics === 'PUSH' ? 'PUSH' :
    tactics === 'GRAPPLE' ? 'GRAPPLE' :
      tactics === 'TECHNIQUE' ? 'TECHNIQUE' :
        'BALANCE';

const toCombatStyle = (
  style: KimariteStyle | EnemyStyleBias | undefined,
): CombatStyle | undefined => {
  if (!style) return undefined;
  if (style === 'PUSH' || style === 'GRAPPLE' || style === 'TECHNIQUE') return style;
  return 'BALANCED';
};

const averageKimariteStats = (
  profile: KimariteCompetitorProfile,
  keys: Array<keyof RikishiStatus['stats']>,
): number | undefined => {
  const values = keys
    .map((key) => profile.stats[key])
    .filter((value): value is number => Number.isFinite(value));
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const explanationStrengthFromAbs = (
  value: number,
  medium: number,
  large: number,
): BoutExplanationFactor['strength'] => {
  const abs = Math.abs(value);
  if (abs >= large) return 'LARGE';
  if (abs >= medium) return 'MEDIUM';
  return 'SMALL';
};

const explanationDirectionFromDelta = (
  value: number,
): BoutExplanationFactor['direction'] => {
  if (value > 0) return 'FOR_ATTACKER';
  if (value < 0) return 'FOR_DEFENDER';
  return 'NEUTRAL';
};

const addExplanationFactor = (
  factors: BoutExplanationFactor[],
  factor: BoutExplanationFactor,
): void => {
  factors.push(factor);
};

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

const ENEMY_BIAS_TO_STRONG_STYLES: Record<EnemyStyleBias, StyleArchetype[]> = {
  PUSH: ['TSUKI_OSHI', 'POWER_PRESSURE'],
  GRAPPLE: ['YOTSU', 'MOROZASHI'],
  TECHNIQUE: ['NAGE_TECH', 'DOHYOUGIWA'],
  BALANCE: [],
};

const ENEMY_BIAS_TO_WEAK_STYLES: Record<EnemyStyleBias, StyleArchetype[]> = {
  PUSH: ['YOTSU', 'MOROZASHI'],
  GRAPPLE: ['NAGE_TECH', 'DOHYOUGIWA'],
  TECHNIQUE: ['TSUKI_OSHI', 'POWER_PRESSURE'],
  BALANCE: [],
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
  const style =
    enemy.styleBias === 'PUSH' || enemy.styleBias === 'GRAPPLE' || enemy.styleBias === 'TECHNIQUE'
      ? enemy.styleBias
      : 'BALANCE';
  const repertoire = createKimariteRepertoireFromSeed({
    style,
    bodyType,
    traits,
    preferredMove: undefined,
    kataSettled: false,
  });
  const bias = enemy.styleBias ?? 'BALANCE';
  return {
    style,
    bodyType,
    heightCm: enemy.heightCm,
    weightKg: enemy.weightKg,
    stats: buildEnemyKimariteStats(enemy),
    traits,
    historyCounts: {},
    strongStyles: ENEMY_BIAS_TO_STRONG_STYLES[bias],
    weakStyles: ENEMY_BIAS_TO_WEAK_STYLES[bias],
    kataSettled: false,
    repertoire,
  };
};

const buildPlayerKimariteProfile = (
  rikishi: RikishiStatus,
  heightCm: number,
  weightKg: number,
  preferredMove?: string | null,
): KimariteCompetitorProfile => {
  const normalized = ensureKimariteRepertoire(ensureStyleIdentityProfile(rikishi));
  const preferredStyles = resolvePrimaryIdentityStyles(normalized.styleIdentityProfile);
  const strongDisplay = resolveDisplayedStrengthStyles(normalized.styleIdentityProfile);
  const weakDisplay = resolveDisplayedWeakStyles(normalized.styleIdentityProfile);
  const strongInternal = resolveInternalStrengthStyles(normalized.styleIdentityProfile);
  const weakInternal = resolveInternalWeakStyles(normalized.styleIdentityProfile);
  const strongStyles = strongDisplay.length > 0 ? strongDisplay : strongInternal;
  const weakStyles = weakDisplay.length > 0 ? weakDisplay : weakInternal;
  return {
    style: toKimariteStyle(normalized.tactics),
    bodyType: normalized.bodyType,
    heightCm,
    weightKg,
    stats: normalized.stats,
    traits: normalized.traits || [],
    preferredMove: preferredMove ?? normalized.signatureMoves?.[0] ?? undefined,
    historyCounts: normalized.history.kimariteTotal ?? {},
    designedPrimaryStyle: preferredStyles[0] ? toKimariteStyle(styleToTactics(preferredStyles[0])) : undefined,
    designedSecondaryStyle: preferredStyles[1] ? toKimariteStyle(styleToTactics(preferredStyles[1])) : undefined,
    strongStyles,
    weakStyles,
    kataSettled: normalized.kimariteRepertoire?.provisional === false,
    repertoire: normalized.kimariteRepertoire,
  };
};

const isKachiMakeDeciderBout = (context?: BoutContext): boolean =>
  Boolean(context?.pressure?.isKachiMakeDecider);

const isYushoRelevantBout = (context?: BoutContext): boolean =>
  context?.pressure
    ? context.pressure.isYushoRelevant
    : Boolean(
      context && (
        (context.isLastDay && context.isYushoContention) ||
        context.titleImplication === 'DIRECT' ||
        context.titleImplication === 'CHASE'
      ),
    );

const isPromotionRelevantBout = (context?: BoutContext): boolean =>
  context?.pressure
    ? context.pressure.isPromotionRelevant
    : context?.boundaryImplication === 'PROMOTION';

const isDemotionRelevantBout = (context?: BoutContext): boolean =>
  context?.pressure
    ? context.pressure.isDemotionRelevant
    : context?.boundaryImplication === 'DEMOTION';

const isHighPressureBout = (context?: BoutContext): boolean => {
  if (!context) return false;
  if (context.pressure) {
    return (
      context.pressure.isFinalBout ||
      context.pressure.isKachiMakeDecider ||
      context.pressure.isYushoRelevant ||
      context.pressure.isPromotionRelevant ||
      context.pressure.isDemotionRelevant
    );
  }
  return Boolean(
    (
      context.isLastDay ||
      context.titleImplication === 'DIRECT' ||
      context.titleImplication === 'CHASE' ||
      context.boundaryImplication === 'PROMOTION' ||
      context.boundaryImplication === 'DEMOTION'
    )
  );
};

const canTriggerEdgeReversal = (
  winProbability: number,
  context?: BoutContext,
): boolean => winProbability >= 0.28 && isHighPressureBout(context);

const resolveBattleResult = (
  rikishi: RikishiStatus,
  enemy: BattleOpponent,
  context?: BoutContext,
  rng: RandomSource = Math.random,
): PlayerBoutCompatResult => {
  const traits = rikishi.traits || [];
  const numBouts = CONSTANTS.BOUTS_MAP[rikishi.rank.division];
  const boutOrdinal = context?.ordinal?.boutOrdinal ?? context?.day;
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
  myPower *= resolveIdentityBattleModifier(rikishi, enemy.styleBias);

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
      isKachiMakeDeciderBout(context) ||
      isYushoRelevantBout(context) ||
      isPromotionRelevantBout(context) ||
      isDemotionRelevantBout(context);
    if (isClutchSpot) myPower *= 1.1;
  }
  if (traits.includes('NOMI_NO_SHINZOU')) {
    const isImportantMatch = context && (
      isKachiMakeDeciderBout(context) ||
      isYushoRelevantBout(context) ||
      isPromotionRelevantBout(context) ||
      isDemotionRelevantBout(context)
    );
    if (enemy.rankValue <= 2 || isImportantMatch) myPower *= 0.8;
  }
  if (
    traits.includes('OOBUTAI_NO_ONI') &&
    context &&
    (
      isYushoRelevantBout(context) ||
      context.titleImplication === 'DIRECT'
    )
  ) {
    myPower *= 1.2;
  }
  if (traits.includes('RENSHOU_KAIDOU') && currentWinStreak >= 3) myPower += Math.min(8, currentWinStreak * 1.2);
  if (traits.includes('SLOW_STARTER') && context) myPower *= (boutOrdinal ?? context.day) <= Math.ceil(numBouts / 2) ? 0.94 : 1.06;
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
        isKachiMakeDeciderBout(context) ||
        isYushoRelevantBout(context) ||
        context.currentWins >= 10 ||
        isPromotionRelevantBout(context) ||
        isDemotionRelevantBout(context);
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
  const shouldCollectPreBoutPhase = isPreBoutPhaseSnapshotEnabled();
  const shouldCollectBoutExplanation = isBoutExplanationSnapshotEnabled();
  const shouldCollectBoutFlowDiagnostic = isBoutFlowDiagnosticSnapshotEnabled();
  let preBoutPhaseResolution: PreBoutPhaseResolution | undefined;
  let preBoutAttackerStyle: CombatStyle | undefined;
  let preBoutDefenderStyle: CombatStyle | undefined;
  let preBoutAttackerBodyScore: number | undefined;
  let preBoutDefenderBodyScore: number | undefined;
  if (shouldCollectPreBoutPhase || shouldCollectBoutExplanation) {
    preBoutAttackerStyle = toCombatStyle(playerProfile.style);
    preBoutDefenderStyle = toCombatStyle(enemyProfile.style);
    preBoutAttackerBodyScore = resolveSizeScore(myHeight, myWeight);
    preBoutDefenderBodyScore = resolveSizeScore(enemyHeight, enemyWeight);
    preBoutPhaseResolution = resolvePreBoutPhaseWeights({
      source: 'PLAYER_DIAGNOSTIC',
      division: rikishi.rank.division,
      formatKind: context?.formatKind,
      attackerStyle: preBoutAttackerStyle,
      defenderStyle: preBoutDefenderStyle,
      attackerPushStrength: averageKimariteStats(playerProfile, ['tsuki', 'oshi', 'deashi']),
      defenderPushStrength: averageKimariteStats(enemyProfile, ['tsuki', 'oshi', 'deashi']),
      attackerBeltStrength: averageKimariteStats(playerProfile, ['kumi', 'koshi', 'power']),
      defenderBeltStrength: averageKimariteStats(enemyProfile, ['kumi', 'koshi', 'power']),
      attackerTechniqueStrength: averageKimariteStats(playerProfile, ['waza', 'nage', 'deashi']),
      defenderTechniqueStrength: averageKimariteStats(enemyProfile, ['waza', 'nage', 'deashi']),
      attackerEdgeStrength: averageKimariteStats(playerProfile, ['waza', 'koshi', 'deashi']),
      defenderEdgeStrength: averageKimariteStats(enemyProfile, ['waza', 'koshi', 'deashi']),
      attackerHeightCm: myHeight,
      defenderHeightCm: enemyHeight,
      attackerWeightKg: myWeight,
      defenderWeightKg: enemyWeight,
      attackerBodyScore: preBoutAttackerBodyScore,
      defenderBodyScore: preBoutDefenderBodyScore,
      pressure: context?.pressure,
    });
  }
  if (shouldCollectPreBoutPhase && preBoutPhaseResolution) {
    recordPreBoutPhaseSnapshot({
      source: 'PLAYER_BOUT',
      division: rikishi.rank.division,
      formatKind: context?.formatKind,
      calendarDay: context?.ordinal?.calendarDay ?? context?.day,
      boutOrdinal: context?.ordinal?.boutOrdinal,
      attackerStyle: preBoutAttackerStyle,
      defenderStyle: preBoutDefenderStyle,
      attackerBodyScore: preBoutAttackerBodyScore,
      defenderBodyScore: preBoutDefenderBodyScore,
      pressure: context?.pressure,
      weights: preBoutPhaseResolution.weights,
      reasonTags: preBoutPhaseResolution.reasonTags,
    });
  }

  const bonus = myPower - basePower;
  const playerCompetitiveFactor = resolveCompetitiveFactor(rikishi);
  const enemyCompetitiveFactor = resolveCompetitiveFactor(
    enemy as BattleOpponent & Pick<RikishiStatus, 'aptitudeTier' | 'aptitudeProfile' | 'aptitudeFactor' | 'careerBand' | 'stagnation'>,
  );
  const enemyStableFactor = resolveStablePerformanceFactor(enemy.stableId);
  const enemyAbilityRawWithoutForm = enemy.ability ?? enemy.power;
  const enemyBashoFormDelta = enemy.bashoFormDelta ?? 0;
  const enemyAbilityRaw = enemyAbilityRawWithoutForm + enemyBashoFormDelta;
  const enemyAbility =
    resolveUnifiedNpcStrength({
      ability: enemyAbilityRaw,
      power: enemy.power,
    }) *
    enemyStableFactor *
    enemyCompetitiveFactor;
  const injuryPenalty = Math.max(0, rikishi.injuryLevel);
  const myAbilityBase =
    resolvePlayerAbility(rikishi, baseMetrics, bonus) + (context?.bashoFormDelta ?? 0);
  const myAbility = myAbilityBase * playerCompetitiveFactor;
  const myMomentum = calculateMomentumBonus(resolveSignedStreak(currentWinStreak, currentLossStreak));
  const opponentMomentum = calculateMomentumBonus(resolveSignedStreak(opponentWinStreak, opponentLossStreak));
  const momentumDelta = myMomentum - opponentMomentum;
  const baseWinProbInput = {
    attackerAbility: myAbility,
    defenderAbility: enemyAbility,
    attackerStyle: playerStyle,
    defenderStyle: enemy.styleBias,
    injuryPenalty,
    bonus: momentumDelta,
  };
  const baselineWinProbInput = {
    attackerAbility: resolveRankBaselineAbility(rikishi.rank) * playerCompetitiveFactor,
    defenderAbility: enemyAbility,
    attackerStyle: playerStyle,
    defenderStyle: enemy.styleBias,
    injuryPenalty,
    bonus: momentumDelta,
  };
  const combatKernelMetadata = {
    division: rikishi.rank.division,
    formatKind: context?.formatKind,
    calendarDay: context?.ordinal?.calendarDay ?? context?.day,
    boutOrdinal: context?.ordinal?.boutOrdinal,
    pressureFlags: context?.pressure,
  };
  const baseWinProbability = resolveCombatKernelProbability({
    source: 'PLAYER_BASE',
    ...baseWinProbInput,
    metadata: combatKernelMetadata,
  }).probability;
  const baselineWinProbability = resolveCombatKernelProbability({
    source: 'PLAYER_BASELINE',
    ...baselineWinProbInput,
    metadata: combatKernelMetadata,
  }).probability;
  const projectedExpectedWins = (context?.expectedWinsSoFar ?? 0) + baseWinProbability;
  const stagnation = resolvePlayerStagnationState({
    age: rikishi.age,
    careerBashoCount: rikishi.history.records.length,
    currentRank: rikishi.rank,
    maxRank: rikishi.history.maxRank,
    recentRecords: rikishi.history.records.slice(-6),
    formerSekitori:
      rikishi.history.maxRank.division === 'Makuuchi' || rikishi.history.maxRank.division === 'Juryo',
  });
  const winProbability = resolvePlayerFavoriteCompression({
    winProbability: baseWinProbability,
    baselineWinProbability,
    projectedExpectedWins,
    careerBashoCount: rikishi.history.records.length,
    currentRank: rikishi.rank,
    careerBand: rikishi.careerBand,
    stagnation,
  });
  if (isBoutWinProbSnapshotEnabled()) {
    const enemyAbilityRawIfSingleForm = enemyAbilityRaw;
    const enemyAbilityIfSingleForm = enemyAbility;
    const enemyAbilityRawIfDuplicateForm = enemyAbilityRaw + enemyBashoFormDelta;
    const enemyAbilityIfDuplicateForm =
      resolveUnifiedNpcStrength({
        ability: enemyAbilityRawIfDuplicateForm,
        power: enemy.power,
      }) *
      enemyStableFactor *
      enemyCompetitiveFactor;
    const baseWinProbabilityIfSingleForm = baseWinProbability;
    const baselineWinProbabilityIfSingleForm = baselineWinProbability;
    const baseWinProbabilityIfDuplicateForm = resolveBoutWinProb({
      ...baseWinProbInput,
      defenderAbility: enemyAbilityIfDuplicateForm,
    });
    const baselineWinProbabilityIfDuplicateForm = resolveBoutWinProb({
      ...baselineWinProbInput,
      defenderAbility: enemyAbilityIfDuplicateForm,
    });
    const playerOpponentForm = {
      enemyAbilityInput: enemy.ability,
      enemyPower: enemy.power,
      enemyBashoFormDelta: enemy.bashoFormDelta,
      enemyAbilityRawUsed: enemyAbilityRaw,
      enemyAbilityRawIfSingleForm,
      enemyAbilityRawIfDuplicateForm,
      enemyAbilityUsed: enemyAbility,
      enemyAbilityIfSingleForm,
      enemyAbilityIfDuplicateForm,
      estimatedExtraEnemyAbility: enemyAbility - enemyAbilityIfSingleForm,
      estimatedDuplicateEnemyAbility: enemyAbilityIfDuplicateForm - enemyAbility,
      baseWinProbabilityIfSingleForm,
      baselineWinProbabilityIfSingleForm,
      baseWinProbabilityIfDuplicateForm,
      baselineWinProbabilityIfDuplicateForm,
    };
    const commonSnapshot = {
      division: rikishi.rank.division,
      formatKind: context?.formatKind,
      totalBouts: context?.ordinal?.totalBouts,
      calendarDay: context?.ordinal?.calendarDay ?? context?.day,
      boutOrdinal: context?.ordinal?.boutOrdinal,
      baseWinProbability,
      baselineWinProbability,
      compressedWinProbability: winProbability,
      projectedExpectedWins,
      pressure: context?.pressure,
      currentWins: context?.currentWins,
      currentLosses: context?.currentLosses,
      currentWinStreak,
      currentLossStreak,
      opponentWinStreak,
      opponentLossStreak,
      injuryPenaltySource: 'player.injuryLevel' as const,
      traitGenomeSummary: {
        traitCount: traits.length,
        hasGenome: Boolean(rikishi.genome),
        basePower,
        modifiedPower: myPower,
        bonus,
      },
      playerOpponentForm,
    };
    recordBoutWinProbSnapshot({
      source: 'PLAYER_BOUT',
      call: 'PLAYER_BASE',
      ...commonSnapshot,
      ...baseWinProbInput,
      probability: baseWinProbability,
    });
    recordBoutWinProbSnapshot({
      source: 'PLAYER_BOUT',
      call: 'PLAYER_BASELINE',
      ...commonSnapshot,
      ...baselineWinProbInput,
      probability: baselineWinProbability,
    });
  }
  const opponentAbility = enemyAbility;
  const isWin = rng() < winProbability;
  const playerDominance = clamp(winProbability * 2 - 1, -1, 1);
  const enemyDominance = -playerDominance;
  const isTitleDecider = Boolean(
    context?.isLastDay && (
      context?.titleImplication === 'DIRECT' ||
      (context?.isYushoContention && context?.contentionTier === 'Leader')
    ),
  );
  const playerRankValue = rikishi.rank.division === 'Makuuchi'
    ? (rikishi.rank.name === '横綱' ? 1 : rikishi.rank.name === '大関' ? 2 : rikishi.rank.name === '関脇' || rikishi.rank.name === '小結' ? 3 : 4)
    : rikishi.rank.division === 'Juryo' ? 6 : 7;
  const isPlayerKinboshi = playerRankValue >= 4 && (enemy.rankValue ?? 99) <= 2;
  const isEnemyKinboshi = (enemy.rankValue ?? 99) >= 4 && playerRankValue <= 2;
  const playerSelectionContext = {
    isHighPressure: isHighPressureBout(context),
    isLastDay: Boolean(context?.isLastDay),
    isUnderdog: winProbability < 0.45,
    isEdgeCandidate: canTriggerEdgeReversal(winProbability, context),
    weightDiff: myWeight - enemyWeight,
    heightDiff: myHeight - enemyHeight,
    dominance: playerDominance,
    isTitleDecider,
    isKinboshiChance: isPlayerKinboshi,
  };
  const enemySelectionContext = {
    isHighPressure: isHighPressureBout(context),
    isLastDay: Boolean(context?.isLastDay),
    isUnderdog: (1 - winProbability) < 0.45,
    isEdgeCandidate: canTriggerEdgeReversal(1 - winProbability, context),
    weightDiff: enemyWeight - myWeight,
    heightDiff: enemyHeight - myHeight,
    dominance: enemyDominance,
    isTitleDecider,
    isKinboshiChance: isEnemyKinboshi,
  };
  const buildExplanationFactors = (
    kimarite: string,
    winRoute: WinRoute | undefined,
    finalIsWin: boolean,
  ): BoutExplanationFactor[] => {
    const factors: BoutExplanationFactor[] = [];
    const abilityDelta = myAbility - enemyAbility;
    if (Math.abs(abilityDelta) >= 3) {
      addExplanationFactor(factors, {
        kind: 'ABILITY',
        direction: explanationDirectionFromDelta(abilityDelta),
        strength: explanationStrengthFromAbs(abilityDelta, 8, 18),
        label: '基礎能力差',
      });
    }
    if (playerStyle || enemy.styleBias) {
      addExplanationFactor(factors, {
        kind: 'STYLE',
        direction: 'NEUTRAL',
        strength: 'SMALL',
        label: '取り口相性',
      });
    }
    if (Math.abs(sizeDiff) >= 2) {
      addExplanationFactor(factors, {
        kind: 'BODY',
        direction: explanationDirectionFromDelta(sizeDiff),
        strength: explanationStrengthFromAbs(sizeDiff, 5, 9),
        label: '体格差',
      });
    }
    const formDelta = (context?.bashoFormDelta ?? 0) - enemyBashoFormDelta;
    if (Math.abs(formDelta) >= 1) {
      addExplanationFactor(factors, {
        kind: 'FORM',
        direction: explanationDirectionFromDelta(formDelta),
        strength: explanationStrengthFromAbs(formDelta, 4, 9),
        label: '場所ごとの調子',
      });
    }
    if (context?.pressure && (
      context.pressure.isKachiMakeDecider ||
      context.pressure.isFinalBout ||
      context.pressure.isYushoRelevant ||
      context.pressure.isPromotionRelevant ||
      context.pressure.isDemotionRelevant
    )) {
      const pressureLabel = context.pressure.isKachiMakeDecider
        ? '勝ち越し/負け越しのかかる一番'
        : context.pressure.isYushoRelevant
          ? '優勝争いの文脈'
          : '勝負所の文脈';
      addExplanationFactor(factors, {
        kind: 'PRESSURE',
        direction: 'NEUTRAL',
        strength: context.pressure.isKachiMakeDecider || context.pressure.isYushoRelevant ? 'MEDIUM' : 'SMALL',
        label: pressureLabel,
      });
    }
    if (Math.abs(momentumDelta) >= 0.1) {
      addExplanationFactor(factors, {
        kind: 'MOMENTUM',
        direction: explanationDirectionFromDelta(momentumDelta),
        strength: explanationStrengthFromAbs(momentumDelta, 1, 2),
        label: '場所内の流れ',
      });
    }
    if (injuryPenalty > 0) {
      addExplanationFactor(factors, {
        kind: 'INJURY',
        direction: 'FOR_DEFENDER',
        strength: explanationStrengthFromAbs(injuryPenalty, 3, 7),
        label: '負傷影響',
      });
    }
    if (preBoutPhaseResolution) {
      const dominantPhase = Object.entries(preBoutPhaseResolution.weights)
        .reduce((best, entry) => entry[1] > best[1] ? entry : best);
      const phaseLabel =
        dominantPhase[0] === 'THRUST_BATTLE' ? '押し合いになりやすい展開' :
          dominantPhase[0] === 'BELT_BATTLE' ? '組み合いになりやすい展開' :
            dominantPhase[0] === 'TECHNIQUE_SCRAMBLE' ? '技の応酬になりやすい展開' :
              dominantPhase[0] === 'EDGE_BATTLE' ? '土俵際になりやすい展開' :
                dominantPhase[0] === 'QUICK_COLLAPSE' ? '早い崩れが起きやすい展開' :
                  '展開が混ざりやすい一番';
      addExplanationFactor(factors, {
        kind: 'PHASE',
        direction: 'NEUTRAL',
        strength: 'SMALL',
        label: phaseLabel,
      });
    }
    const realismDelta = winProbability - baseWinProbability;
    if (Math.abs(realismDelta) >= 0.01) {
      addExplanationFactor(factors, {
        kind: 'REALISM',
        direction: explanationDirectionFromDelta(realismDelta),
        strength: explanationStrengthFromAbs(realismDelta, 0.03, 0.08),
        label: '番付帯に応じた補正',
      });
    }
    if (kimarite || winRoute) {
      addExplanationFactor(factors, {
        kind: 'KIMARITE',
        direction: finalIsWin ? 'FOR_ATTACKER' : 'FOR_DEFENDER',
        strength: 'SMALL',
        label: '決まり手との整合',
      });
    }
    if (!factors.length) {
      addExplanationFactor(factors, {
        kind: 'UNKNOWN',
        direction: 'NEUTRAL',
        strength: 'SMALL',
        label: '決定的でない要素',
      });
    }
    return factors;
  };
  const recordExplanationSnapshot = (
    kimarite: string,
    winRoute: WinRoute | undefined,
    finalIsWin: boolean,
    flow?: {
      readonly engagement?: BoutEngagement;
      readonly kimaritePattern?: string;
    },
  ): void => {
    if (!shouldCollectBoutExplanation && !shouldCollectBoutFlowDiagnostic) return;
    const factors = buildExplanationFactors(kimarite, winRoute, finalIsWin);
    const snapshot: BoutExplanationSnapshot = {
      source: 'PLAYER_BOUT',
      division: rikishi.rank.division,
      rank: rikishi.rank,
      formatKind: context?.formatKind,
      totalBouts: context?.ordinal?.totalBouts,
      calendarDay: context?.ordinal?.calendarDay ?? context?.day,
      boutOrdinal: context?.ordinal?.boutOrdinal,
      currentWins: context?.currentWins,
      currentLosses: context?.currentLosses,
      currentWinStreak,
      currentLossStreak,
      previousResult: context?.previousResult,
      titleImplication: context?.titleImplication,
      boundaryImplication: context?.boundaryImplication,
      isKinboshiContext: isPlayerKinboshi || isEnemyKinboshi,
      baseWinProbability,
      winProbability,
      baselineWinProbability,
      compressedWinProbability: winProbability,
      preBoutPhaseWeights: preBoutPhaseResolution?.weights,
      preBoutPhaseReasonTags: preBoutPhaseResolution?.reasonTags,
      pressure: context?.pressure,
      kimarite,
      winRoute,
      boutEngagement: flow?.engagement,
      kimaritePattern: flow?.kimaritePattern,
      factors,
      shortCommentaryDraft: factors.slice(0, 3).map((factor) => factor.label).join('、'),
    };
    if (shouldCollectBoutExplanation) {
      recordBoutExplanationSnapshot(snapshot);
    }
    if (shouldCollectBoutFlowDiagnostic) {
      const boutFlowSnapshot = createBoutFlowDiagnosticSnapshotFromExplanationSnapshot(snapshot);
      if (boutFlowSnapshot) recordBoutFlowDiagnosticSnapshot(boutFlowSnapshot);
    }
  };

  if (!isWin && canTriggerEdgeReversal(winProbability, context)) {
    const hasDohyogiwa = traits.includes('DOHYOUGIWA_MAJUTSU') && rng() < 0.06;
    const hasClutchReversal = traits.includes('CLUTCH_REVERSAL') && rng() < 0.04;
    if (hasDohyogiwa || hasClutchReversal) {
      const reversal = resolveKimariteOutcome({
        winner: playerProfile,
        loser: enemyProfile,
        rng,
        forcePattern: 'EDGE_REVERSAL',
        allowedRoute: 'EDGE_REVERSAL',
        allowNonTechnique: false,
        boutContext: playerSelectionContext,
      });
      const kimarite = normalizeKimariteName(reversal.kimarite);
      recordExplanationSnapshot(kimarite, reversal.route, true);
      return {
        isWin: true,
        kimarite,
        winRoute: reversal.route,
        winProbability,
        opponentAbility,
      };
    }
  }

  const winnerProfile = isWin ? playerProfile : enemyProfile;
  const loserProfile = isWin ? enemyProfile : playerProfile;
  const selectionContext = isWin ? playerSelectionContext : enemySelectionContext;
  // 両力士の相互作用から取組の型（engagement）を 1 回だけ sample。
  // route 選択と kimarite 選択の両方に渡すことで、BELT 展開 × PUSH 勝者の
  // 組み合わせでも自然に BELT_FORCE route へ寄せ、押し出し一択を防ぐ。
  const engagement = resolveBoutEngagement(winnerProfile, loserProfile, selectionContext, rng);
  const selectionContextWithEngagement = { ...selectionContext, engagement };
  const winRoute = resolveFinishRoute({
    winner: winnerProfile,
    context: selectionContext,
    engagement,
    rng,
  });
  const selected = resolveKimariteOutcome({
    winner: winnerProfile,
    loser: loserProfile,
    rng,
    allowedRoute: winRoute,
    allowNonTechnique: true,
    boutContext: selectionContextWithEngagement,
  });
  const kimarite = normalizeKimariteName(selected.kimarite);
  const finalWinRoute = selected.route ?? winRoute;
  recordExplanationSnapshot(kimarite, finalWinRoute, isWin, {
    engagement,
    kimaritePattern: selected.pattern,
  });
  return {
    isWin,
    kimarite,
    winRoute: finalWinRoute,
    winProbability,
    opponentAbility,
  };
};

export const calculateBattleResult = (
  rikishi: RikishiStatus,
  enemy: BattleOpponent,
  context?: BoutContext,
  rng: RandomSource = Math.random,
): PlayerBoutCompatResult =>
  resolvePlayerBoutCompat(
    { rikishi, enemy, context, rng },
    (input: PlayerBoutCompatNormalizedInput) =>
      resolveBattleResult(input.rikishi, input.enemy, input.context, input.rng),
  );

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
