import { BashoRecord, Division, Rank, RatingState } from '../models';
import {
  resolveEmpiricalNpcRetirementHazard,
  resolveEmpiricalNpcRetirementLookupMeta,
  sampleEmpiricalNpcSeed,
} from '../calibration/npcRealismHeisei';
import { resolveRankBaselineAbility } from './strength/model';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const BOUTS_BY_DIVISION: Record<Division, number> = {
  Makuuchi: 15,
  Juryo: 15,
  Makushita: 7,
  Sandanme: 7,
  Jonidan: 7,
  Jonokuchi: 7,
  Maezumo: 3,
};

const EMPIRICAL_DIVISION_BASELINE_HAZARD: Record<Division, number> = {
  Makuuchi: 0.00487908,
  Juryo: 0.01068307,
  Makushita: 0.01177839,
  Sandanme: 0.01543576,
  Jonidan: 0.02111602,
  Jonokuchi: 0.0388223,
  Maezumo: 0.01,
};

const OPENING_BONUS_ATTENUATION = 0.70;

export type PlayerStagnationBand = 'NORMAL' | 'STALLED' | 'CRITICAL';

export type PlayerStartingPotentialBand = 'LOW' | 'MID' | 'HIGH' | 'ELITE';

export type PlayerEntryCalibration = {
  startingPotentialBand: PlayerStartingPotentialBand;
  initialAbilityBias: number;
  growthBias: number;
};

export type PlayerStagnationResolution = {
  band: PlayerStagnationBand;
  badResultCount: number;
  fullKyujoStreak: number;
  isMakushitaTop15: boolean;
  isMakushitaTop10: boolean;
  graceApplied: boolean;
};

const resolveSoftCap = (value: number, cap: number, excessFactor = 0.35): number =>
  value <= cap ? value : cap + (value - cap) * excessFactor;

const isSanyakuRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' &&
  (rank.name === '横綱' || rank.name === '大関' || rank.name === '関脇' || rank.name === '小結');

const isSekitoriDivision = (division: Division): boolean =>
  division === 'Makuuchi' || division === 'Juryo';

const isMakushitaOrBelowDivision = (division: Division): boolean =>
  division === 'Makushita' ||
  division === 'Sandanme' ||
  division === 'Jonidan' ||
  division === 'Jonokuchi';

const resolveNormalCompressionPhaseScale = (careerBashoCount: number): number =>
  careerBashoCount < 3 ? 0 : careerBashoCount < 6 ? 0.5 : 1;

const resolvePlayerEntryPotentialBand = (input: {
  aptitudeTier: 'S' | 'A' | 'B' | 'C' | 'D';
  riseBand: 1 | 2 | 3;
  careerBand: 'ELITE' | 'STRONG' | 'STANDARD' | 'GRINDER' | 'WASHOUT';
}): PlayerStartingPotentialBand => {
  if (input.careerBand === 'ELITE' && input.riseBand === 1) return 'ELITE';
  if (
    input.aptitudeTier === 'S' ||
    input.careerBand === 'STRONG' ||
    input.careerBand === 'ELITE' ||
    input.riseBand === 1
  ) {
    return 'HIGH';
  }
  if (input.careerBand === 'GRINDER' || input.careerBand === 'WASHOUT' || input.aptitudeTier === 'D') {
    return 'LOW';
  }
  return 'MID';
};

export const resolvePlayerEntryCalibration = (input: {
  startingRank: Rank;
  rng: () => number;
}): PlayerEntryCalibration => {
  const recipe = sampleEmpiricalNpcSeed(input.rng);
  const startingPotentialBand = resolvePlayerEntryPotentialBand({
    aptitudeTier: recipe.aptitudeTier,
    riseBand: recipe.riseBand,
    careerBand: recipe.careerBand,
  });
  const initialAbilityBias =
    startingPotentialBand === 'ELITE'
      ? 1.0
      : startingPotentialBand === 'HIGH'
        ? 0.6
        : startingPotentialBand === 'MID'
          ? 0.2
          : 0;
  const growthBias =
    (recipe.riseBand === 1 ? 0.04 : recipe.riseBand === 2 ? 0.02 : 0) +
    (recipe.careerBand === 'ELITE' ? 0.02 : recipe.careerBand === 'STRONG' ? 0.01 : 0) -
    (input.startingRank.division === 'Makushita' ? 0.01 : 0);
  return {
    startingPotentialBand,
    initialAbilityBias,
    growthBias: clamp(growthBias, 0, 0.06),
  };
};

const resolveInitialAbilityAllowance = (rank: Rank): number =>
  rank.division === 'Makushita' ? 10 : 8;

export const applyPlayerInitialAbilityCap = (input: {
  ability: number;
  rank: Rank;
}): number =>
  resolveSoftCap(
    input.ability,
    resolveRankBaselineAbility(input.rank) + resolveInitialAbilityAllowance(input.rank),
    0.35,
  );

export const resolvePlayerOpeningBonusAttenuation = (input: {
  rawWinProbability: number;
  baselineWinProbability: number;
  careerBashoCount: number;
}): number => {
  const raw = clamp(input.rawWinProbability, 0.03, 0.97);
  if (input.careerBashoCount >= 6) return raw;
  const baseline = clamp(input.baselineWinProbability, 0.03, 0.97);
  const bonus = Math.max(0, raw - baseline);
  if (bonus <= 0) return raw;
  return clamp(baseline + bonus * OPENING_BONUS_ATTENUATION, 0.03, 0.97);
};

export const resolvePlayerNormalDivisionCompression = (input: {
  careerBashoCount: number;
  currentRank: Rank;
  winProbability: number;
}): number => {
  const phaseScale = resolveNormalCompressionPhaseScale(input.careerBashoCount);
  if (phaseScale <= 0 || input.winProbability <= 0.52) return 0;
  if (input.currentRank.division === 'Makuuchi') return 0;
  const base =
    input.currentRank.division === 'Juryo'
      ? 0.02
      : input.currentRank.division === 'Makushita'
        ? 0.06
        : input.currentRank.division === 'Sandanme'
          ? 0.07
          : 0.08;
  return base * phaseScale;
};

const isFullKyujoRecord = (record: BashoRecord): boolean =>
  record.absent >= BOUTS_BY_DIVISION[record.rank.division];

const isKachikoshiRecord = (record: BashoRecord): boolean =>
  record.wins > record.losses + record.absent;

const resolveOfficialWinRate = (records: BashoRecord[]): number => {
  const wins = records.reduce((sum, record) => sum + record.wins, 0);
  const losses = records.reduce((sum, record) => sum + record.losses, 0);
  return wins + losses > 0 ? wins / (wins + losses) : 0;
};

const resolveFullKyujoStreakFromRecords = (records: BashoRecord[]): number => {
  let streak = 0;
  for (let index = records.length - 1; index >= 0; index -= 1) {
    if (!isFullKyujoRecord(records[index])) break;
    streak += 1;
  }
  return streak;
};

const resolveYoungInjuryGraceEligible = (input: {
  age: number;
  careerBashoCount: number;
  currentRank: Rank;
  recentRecords: BashoRecord[];
  fullKyujoStreak: number;
}): boolean => {
  const { age, careerBashoCount, currentRank, recentRecords, fullKyujoStreak } = input;
  if (age >= 21) return false;
  if (careerBashoCount >= 12) return false;
  if (!isMakushitaOrBelowDivision(currentRank.division)) return false;
  if (fullKyujoStreak !== 1) return false;
  const latest = recentRecords[recentRecords.length - 1];
  if (!latest || !isFullKyujoRecord(latest)) return false;
  const prior = recentRecords.slice(0, -1).slice(-3);
  if (!prior.length) return false;
  const kachikoshiCount = prior.filter(isKachikoshiRecord).length;
  return kachikoshiCount >= 2 || resolveOfficialWinRate(prior) >= 0.5;
};

export const resolvePlayerStagnationState = (input: {
  age: number;
  careerBashoCount: number;
  currentRank: Rank;
  maxRank: Rank;
  recentRecords: BashoRecord[];
  fullKyujoStreak?: number;
  formerSekitori: boolean;
}): PlayerStagnationResolution => {
  const {
    age,
    careerBashoCount,
    currentRank,
    recentRecords,
    fullKyujoStreak = resolveFullKyujoStreakFromRecords(recentRecords),
  } = input;
  const recent = recentRecords.slice(-6);
  const last4 = recent.slice(-4);
  const badResultCount = recent.filter(isLosingOrKyujoRecord).length;
  const isLower = isMakushitaOrBelowDivision(currentRank.division);
  const isMakushitaTop15 =
    currentRank.division === 'Makushita' && typeof currentRank.number === 'number' && currentRank.number <= 15;
  const isMakushitaTop10 =
    currentRank.division === 'Makushita' && typeof currentRank.number === 'number' && currentRank.number <= 10;

  const criticalByCount = isLower && badResultCount >= 5;
  const criticalByFullKyujo = fullKyujoStreak >= 2;
  const criticalByTopMakushita =
    isMakushitaTop10 && last4.length === 4 && last4.every(isLosingOrKyujoRecord);
  const criticalByAge = age >= 29 && isLower && badResultCount >= 4;

  const stalledByCount = isLower && badResultCount >= 3;
  const stalledByFullKyujo = fullKyujoStreak === 1;
  const stalledByTopMakushita =
    isMakushitaTop15 && last4.length === 4 && last4.filter(isKachikoshiRecord).length === 0;

  let band: PlayerStagnationBand =
    criticalByCount || criticalByFullKyujo || criticalByTopMakushita || criticalByAge
      ? 'CRITICAL'
      : stalledByCount || stalledByFullKyujo || stalledByTopMakushita
        ? 'STALLED'
        : 'NORMAL';

  const graceApplied =
    band === 'STALLED' &&
    stalledByFullKyujo &&
    !stalledByCount &&
    !stalledByTopMakushita &&
    resolveYoungInjuryGraceEligible({
      age,
      careerBashoCount,
      currentRank,
      recentRecords: recent,
      fullKyujoStreak,
    });

  if (graceApplied) {
    band = 'NORMAL';
  }

  return {
    band,
    badResultCount,
    fullKyujoStreak,
    isMakushitaTop15,
    isMakushitaTop10,
    graceApplied,
  };
};

export const resolvePlayerStagnationBattlePenalty = (input: {
  winProbability: number;
  currentRank: Rank;
  stagnation?: PlayerStagnationResolution;
}): number => {
  const { winProbability, currentRank, stagnation } = input;
  if (!stagnation || stagnation.band === 'NORMAL') return 0;
  if (winProbability <= 0.5) return 0;
  if (currentRank.division === 'Makuuchi') return 0;
  if (currentRank.division === 'Juryo') {
    return stagnation.band === 'CRITICAL' ? 0.015 : 0.005;
  }
  if (currentRank.division === 'Makushita') {
    return stagnation.band === 'CRITICAL' ? 0.025 : 0.010;
  }
  if (
    currentRank.division === 'Sandanme' ||
    currentRank.division === 'Jonidan' ||
    currentRank.division === 'Jonokuchi'
  ) {
    return stagnation.band === 'CRITICAL' ? 0.035 : 0.015;
  }
  return 0;
};

const resolveStagnationGrowthFactors = (
  rank: Rank,
  careerBashoCount: number,
  stagnation?: PlayerStagnationResolution,
): { positive: number; negative: number } => {
  if (careerBashoCount < 6) return { positive: 1, negative: 1 };
  if (!stagnation || stagnation.band === 'NORMAL') return { positive: 1, negative: 1 };
  if (rank.division === 'Makuuchi') return { positive: 1, negative: 1 };
  if (rank.division === 'Juryo') {
    return stagnation.band === 'CRITICAL'
      ? { positive: 0.70, negative: 1.12 }
      : { positive: 0.90, negative: 1.05 };
  }
  if (isMakushitaOrBelowDivision(rank.division)) {
    return stagnation.band === 'CRITICAL'
      ? { positive: 0.45, negative: 1.25 }
      : { positive: 0.80, negative: 1.10 };
  }
  return { positive: 1, negative: 1 };
};

export const resolvePlayerStagnationRetentionPressure = (input: {
  currentDivision: Division;
  currentRank: Rank;
  stagnation: PlayerStagnationResolution;
}): number => {
  const { currentDivision, currentRank, stagnation } = input;
  if (stagnation.band === 'NORMAL') return 1;

  let pressure =
    stagnation.band === 'CRITICAL'
      ? currentDivision === 'Juryo'
        ? 1.35
        : currentDivision === 'Makuuchi'
          ? 1.10
          : 2.50
      : currentDivision === 'Juryo'
        ? 1.15
        : currentDivision === 'Makuuchi'
          ? 1
          : 1.35;

  if (
    currentRank.division === 'Makushita' &&
    typeof currentRank.number === 'number' &&
    currentRank.number <= 15
  ) {
    pressure *= 1.50;
  }
  return pressure;
};

const resolveFavoriteCompressionFactor = (rank: Rank): number => {
  if (rank.division === 'Makushita') return 0.68;
  if (rank.division === 'Juryo') return 0.60;
  if (rank.division === 'Makuuchi') return isSanyakuRank(rank) ? 0.48 : 0.54;
  return 0.78;
};

const resolveStagnationCompressionAdjustment = (
  rank: Rank,
  stagnation?: PlayerStagnationResolution,
): number => {
  if (!stagnation || stagnation.band === 'NORMAL') return 0;
  if (rank.division === 'Makuuchi') return 0;
  if (rank.division === 'Juryo') {
    return stagnation.band === 'CRITICAL' ? 0.08 : 0.05;
  }
  if (rank.division === 'Makushita') {
    return stagnation.band === 'CRITICAL' ? 0.10 : 0.08;
  }
  if (
    rank.division === 'Sandanme' ||
    rank.division === 'Jonidan' ||
    rank.division === 'Jonokuchi'
  ) {
    return stagnation.band === 'CRITICAL' ? 0.10 : 0.08;
  }
  return 0;
};

const resolveProjectedExpectedWinsPenalty = (
  rank: Rank,
  projectedExpectedWins: number,
): number => {
  if (rank.division === 'Makuuchi' && isSanyakuRank(rank)) {
    return projectedExpectedWins >= 8.8 ? 0.035 : projectedExpectedWins >= 8.4 ? 0.025 : 0;
  }
  if (isSekitoriDivision(rank.division)) {
    return projectedExpectedWins >= 8.4 ? 0.025 : 0;
  }
  if (rank.division === 'Makushita') {
    let penalty = projectedExpectedWins >= 4.8 ? 0.015 : 0;
    if (projectedExpectedWins >= 4.6) penalty += 0.010;
    return penalty;
  }
  let penalty = projectedExpectedWins >= 4.5 ? 0.015 : 0;
  if (projectedExpectedWins >= 5.2) penalty += 0.010;
  return penalty;
};

export const resolvePlayerFavoriteCompression = (input: {
  winProbability: number;
  baselineWinProbability?: number;
  projectedExpectedWins?: number;
  careerBashoCount: number;
  currentRank: Rank;
  stagnation?: PlayerStagnationResolution;
}): number => {
  const {
    winProbability,
    baselineWinProbability = winProbability,
    projectedExpectedWins = 0,
    careerBashoCount,
    currentRank,
    stagnation,
  } = input;
  let adjusted = resolvePlayerOpeningBonusAttenuation({
    rawWinProbability: winProbability,
    baselineWinProbability,
    careerBashoCount,
  });
  const normalCompression = resolvePlayerNormalDivisionCompression({
    careerBashoCount,
    currentRank,
    winProbability: adjusted,
  });
  if (careerBashoCount >= 6 && adjusted > 0.56) {
    const factor = clamp(
      resolveFavoriteCompressionFactor(currentRank) -
        normalCompression -
        resolveStagnationCompressionAdjustment(currentRank, stagnation),
      0.35,
      0.95,
    );
    const compressed = 0.5 + (adjusted - 0.5) * factor;
    const penalty = resolveProjectedExpectedWinsPenalty(currentRank, projectedExpectedWins);
    adjusted = compressed - penalty;
  } else if (normalCompression > 0 && adjusted > 0.52) {
    const factor = clamp(1 - normalCompression, 0.82, 0.99);
    adjusted =
      0.5 + (adjusted - 0.5) * factor - resolveProjectedExpectedWinsPenalty(currentRank, projectedExpectedWins) * 0.5;
  }
  if (careerBashoCount >= 6) {
    adjusted -= resolvePlayerStagnationBattlePenalty({
      winProbability: adjusted,
      currentRank,
      stagnation,
    });
  }
  return clamp(adjusted, 0.03, 0.97);
};

const resolvePositiveGrowthFactor = (rank: Rank, age: number, careerBashoCount: number): number => {
  if (careerBashoCount < 18) {
    if (rank.division === 'Makuuchi') return isSanyakuRank(rank) ? 0.45 : 0.52;
    if (rank.division === 'Juryo') return 0.58;
    if (rank.division === 'Makushita') {
      if (age <= 22) return 0.60;
      if (age <= 26) return 0.52;
      return 0.45;
    }
    if (rank.division === 'Sandanme') {
      return age <= 22 ? 0.70 : age <= 26 ? 0.60 : 0.60;
    }
    return age <= 22 ? 0.72 : age <= 26 ? 0.62 : 0.62;
  }
  if (careerBashoCount < 36) {
    if (rank.division === 'Makuuchi') return isSanyakuRank(rank) ? 0.45 : 0.52;
    if (rank.division === 'Juryo') return 0.58;
    if (rank.division === 'Makushita') {
      if (age <= 22) return 0.71;
      if (age <= 26) return 0.62;
      return 0.54;
    }
    if (rank.division === 'Sandanme') {
      return age <= 22 ? 0.80 : age <= 26 ? 0.70 : 0.70;
    }
    return age <= 22 ? 0.81 : age <= 26 ? 0.71 : 0.71;
  }
  if (rank.division === 'Makuuchi') return isSanyakuRank(rank) ? 0.45 : 0.52;
  if (rank.division === 'Juryo') return 0.58;
  if (rank.division === 'Makushita') {
    if (age <= 23) return 0.82;
    if (age <= 27) return 0.72;
    return 0.62;
  }
  if (age <= 23) return 0.90;
  if (age <= 27) return 0.80;
  return 0.80;
};

const resolveNegativeGrowthFactor = (rank: Rank, careerBashoCount: number): number => {
  if (careerBashoCount < 18) {
    if (rank.division === 'Makuuchi') return 1.12;
    if (rank.division === 'Juryo') return 1.10;
    if (rank.division === 'Makushita') return 1.14;
    return 1.08;
  }
  if (careerBashoCount < 36) {
    if (rank.division === 'Makuuchi') return 1.12;
    if (rank.division === 'Juryo') return 1.10;
    if (rank.division === 'Makushita') return 1.11;
    return 1.06;
  }
  if (rank.division === 'Makuuchi') return 1.12;
  if (rank.division === 'Juryo') return 1.10;
  if (rank.division === 'Makushita') return 1.08;
  return 1.04;
};

const resolveSoftCapAllowance = (rank: Rank, age: number, careerBashoCount: number): number => {
  let allowance =
    rank.division === 'Makuuchi'
      ? isSanyakuRank(rank)
        ? 18
        : 20
      : rank.division === 'Juryo'
        ? 18
        : rank.division === 'Makushita'
          ? 16
          : rank.division === 'Sandanme'
            ? 14
            : 12;
  if (careerBashoCount < 18) allowance -= 4;
  else if (careerBashoCount < 36) allowance -= 2;
  if (age >= 30) allowance -= 2;
  if (age >= 34) allowance -= 3;
  return Math.max(8, allowance);
};

export const applyPlayerEmpiricalProgressClamp = (input: {
  current: RatingState;
  next: RatingState;
  age: number;
  careerBashoCount: number;
  currentRank: Rank;
  absent: number;
  maxRank: Rank;
  stagnation?: PlayerStagnationResolution;
}): RatingState => {
  const { current, next, age, careerBashoCount, currentRank, absent, stagnation } = input;

  const scheduledBouts = BOUTS_BY_DIVISION[currentRank.division];
  let abilityDelta = next.ability - current.ability;
  let formDelta = next.form - current.form;
  const positiveFactorBase = resolvePositiveGrowthFactor(currentRank, age, careerBashoCount);
  const negativeFactor = resolveNegativeGrowthFactor(currentRank, careerBashoCount);
  const ageFactor = age >= 35 ? 0.70 : age >= 31 ? 0.85 : 1;
  const stagnationFactors = resolveStagnationGrowthFactors(currentRank, careerBashoCount, stagnation);
  const positiveFactor = positiveFactorBase * ageFactor * stagnationFactors.positive;

  if (abilityDelta > 0) {
    abilityDelta *= absent >= scheduledBouts ? 0 : positiveFactor;
  } else if (abilityDelta < 0) {
    abilityDelta *=
      (absent >= scheduledBouts ? negativeFactor * 1.18 : negativeFactor) *
      stagnationFactors.negative;
  }

  if (formDelta > 0) {
    formDelta *= absent >= scheduledBouts ? 0 : positiveFactor;
  } else if (formDelta < 0) {
    formDelta *=
      (absent >= scheduledBouts ? negativeFactor * 1.18 : negativeFactor) *
      stagnationFactors.negative;
  }

  const baselineAbility = resolveRankBaselineAbility(currentRank);
  const cap = baselineAbility + resolveSoftCapAllowance(currentRank, age, careerBashoCount);
  return {
    ...next,
    ability: resolveSoftCap(current.ability + abilityDelta, cap),
    form: clamp(current.form + formDelta, -1.2, 1.2),
  };
};

const toRecentResult = (record: BashoRecord) => ({
  division: record.rank.division,
  rankName: record.rank.name,
  rankNumber: record.rank.number,
  wins: record.wins,
  losses: record.losses,
  absent: record.absent,
});

const isLosingOrKyujoRecord = (record: BashoRecord): boolean => {
  const scheduledBouts = BOUTS_BY_DIVISION[record.rank.division];
  if (record.absent >= scheduledBouts) return true;
  return record.wins <= record.losses + record.absent;
};

export const resolvePlayerRetentionModifier = (input: {
  age: number;
  careerBashoCount: number;
  currentDivision: Division;
  currentRank: Rank;
  maxRank: Rank;
  recentRecords: BashoRecord[];
  fullKyujoStreak: number;
  formerSekitori: boolean;
}): number => {
  const {
    age,
    careerBashoCount,
    currentDivision,
    currentRank,
    maxRank,
    recentRecords,
    fullKyujoStreak,
    formerSekitori,
  } = input;
  if (careerBashoCount < 6 && fullKyujoStreak < 2) return 1;
  if (age < 24 && careerBashoCount < 18 && !(careerBashoCount < 6 && fullKyujoStreak >= 2)) return 1;

  const recent = recentRecords.slice(-6);
  const stagnation = resolvePlayerStagnationState({
    age,
    careerBashoCount,
    currentRank,
    maxRank,
    recentRecords: recent,
    fullKyujoStreak,
    formerSekitori,
  });
  const meta = resolveEmpiricalNpcRetirementLookupMeta({
    age,
    currentDivision,
    currentRankScore:
      typeof currentRank.number === 'number'
        ? currentRank.division === 'Makuuchi' && !isSanyakuRank(currentRank)
          ? 8 + (currentRank.number - 1) * 2 + (currentRank.side === 'West' ? 2 : 1)
          : currentRank.division === 'Juryo'
            ? (currentRank.number - 1) * 2 + (currentRank.side === 'West' ? 2 : 1)
            : Math.max(1, currentRank.number * 2 - 1)
        : 1,
    recentBashoResults: recent.map(toRecentResult),
    formerSekitori,
  });
  if (meta.sampleSize <= 0) return 1;

  const empiricalHazard = resolveEmpiricalNpcRetirementHazard({
    age,
    currentDivision,
    currentRankScore:
      typeof currentRank.number === 'number'
        ? currentRank.division === 'Makuuchi' && !isSanyakuRank(currentRank)
          ? 8 + (currentRank.number - 1) * 2 + (currentRank.side === 'West' ? 2 : 1)
          : currentRank.division === 'Juryo'
            ? (currentRank.number - 1) * 2 + (currentRank.side === 'West' ? 2 : 1)
            : Math.max(1, currentRank.number * 2 - 1)
        : 1,
    recentBashoResults: recent.map(toRecentResult),
    formerSekitori,
  });
  const baseline = EMPIRICAL_DIVISION_BASELINE_HAZARD[currentDivision];
  let modifier =
    baseline > 0
      ? clamp(empiricalHazard / baseline, 0.90, 1.85)
      : 1;

  const recentLosingOrKyujo = recent.filter(isLosingOrKyujoRecord).length;
  const maxRankWasSekitori = maxRank.division === 'Makuuchi' || maxRank.division === 'Juryo';
  if (!maxRankWasSekitori && recentLosingOrKyujo >= 5) {
    modifier *= age >= 31 ? 1.45 : 1.25;
  }
  if (fullKyujoStreak >= 3) {
    modifier *= 1.60;
  } else if (fullKyujoStreak >= 2) {
    modifier *= 1.35;
  }
  const makekoshiStreak = recent.reduce((streak, record) => {
    if (record.wins > record.losses + record.absent) return 0;
    return streak + 1;
  }, 0);
  if (formerSekitori && age >= 33 && makekoshiStreak >= 3) {
    modifier *= 1.20;
  }
  modifier *= resolvePlayerStagnationRetentionPressure({
    currentDivision,
    currentRank,
    stagnation:
      careerBashoCount < 6 && fullKyujoStreak < 2
        ? { ...stagnation, band: 'NORMAL' }
        : stagnation,
  });
  return clamp(modifier, 0.90, 4.00);
};
