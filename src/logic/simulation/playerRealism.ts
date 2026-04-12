import { BashoRecord, Division, Rank, RatingState } from '../models';
import {
  resolveEmpiricalNpcRetirementHazard,
  resolveEmpiricalNpcRetirementLookupMeta,
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

const isSanyakuRank = (rank: Rank): boolean =>
  rank.division === 'Makuuchi' &&
  (rank.name === '横綱' || rank.name === '大関' || rank.name === '関脇' || rank.name === '小結');

const isSekitoriDivision = (division: Division): boolean =>
  division === 'Makuuchi' || division === 'Juryo';

const resolveFavoriteCompressionFactor = (rank: Rank): number => {
  if (rank.division === 'Makushita') return 0.68;
  if (rank.division === 'Juryo') return 0.60;
  if (rank.division === 'Makuuchi') return isSanyakuRank(rank) ? 0.48 : 0.54;
  return 0.78;
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
  return projectedExpectedWins >= 4.8 ? 0.015 : 0;
};

export const resolvePlayerFavoriteCompression = (input: {
  winProbability: number;
  projectedExpectedWins?: number;
  careerBashoCount: number;
  currentRank: Rank;
}): number => {
  const { winProbability, projectedExpectedWins = 0, careerBashoCount, currentRank } = input;
  if (careerBashoCount < 6) return clamp(winProbability, 0.03, 0.97);
  if (winProbability <= 0.56) return clamp(winProbability, 0.03, 0.97);

  const factor = resolveFavoriteCompressionFactor(currentRank);
  const compressed = 0.5 + (winProbability - 0.5) * factor;
  const penalty = resolveProjectedExpectedWinsPenalty(currentRank, projectedExpectedWins);
  return clamp(compressed - penalty, 0.03, 0.97);
};

const resolvePositiveGrowthFactor = (rank: Rank, age: number): number => {
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

const resolveNegativeGrowthFactor = (rank: Rank): number => {
  if (rank.division === 'Makuuchi') return 1.12;
  if (rank.division === 'Juryo') return 1.10;
  if (rank.division === 'Makushita') return 1.08;
  return 1.04;
};

const resolveSoftCapAllowance = (rank: Rank, age: number): number => {
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
}): RatingState => {
  const { current, next, age, careerBashoCount, currentRank, absent } = input;
  if (careerBashoCount < 6) return next;

  const scheduledBouts = BOUTS_BY_DIVISION[currentRank.division];
  let abilityDelta = next.ability - current.ability;
  let formDelta = next.form - current.form;
  const positiveFactorBase = resolvePositiveGrowthFactor(currentRank, age);
  const negativeFactor = resolveNegativeGrowthFactor(currentRank);
  const ageFactor = age >= 35 ? 0.70 : age >= 31 ? 0.85 : 1;
  const positiveFactor = positiveFactorBase * ageFactor;

  if (abilityDelta > 0) {
    abilityDelta *= absent >= scheduledBouts ? 0 : positiveFactor;
  } else if (abilityDelta < 0) {
    abilityDelta *= absent >= scheduledBouts ? negativeFactor * 1.18 : negativeFactor;
  }

  if (formDelta > 0) {
    formDelta *= absent >= scheduledBouts ? 0 : positiveFactor;
  } else if (formDelta < 0) {
    formDelta *= absent >= scheduledBouts ? negativeFactor * 1.18 : negativeFactor;
  }

  const baselineAbility = resolveRankBaselineAbility(currentRank);
  const cap = baselineAbility + resolveSoftCapAllowance(currentRank, age);
  return {
    ...next,
    ability: Math.min(cap, current.ability + abilityDelta),
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
  if (age < 28 || careerBashoCount < 36) return 1;

  const recent = recentRecords.slice(-6);
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
  return clamp(modifier, 0.90, 2.4);
};
