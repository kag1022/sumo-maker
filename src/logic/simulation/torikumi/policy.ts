import { RandomSource } from '../deps';
import {
  BoundaryBandSpec,
  BoundaryId,
  TorikumiDivision,
  TorikumiParticipant,
  TorikumiTier,
  YushoRaceTier,
} from './types';
import { BALANCE } from '../../balance';

export const DEFAULT_TORIKUMI_BOUNDARY_BANDS: BoundaryBandSpec[] = [
  {
    id: 'MakuuchiJuryo',
    upperDivision: 'Makuuchi',
    lowerDivision: 'Juryo',
    upperBand: { minNumber: 14, maxNumber: 18, rankName: '前頭' },
    lowerBand: { minNumber: 1, maxNumber: 3, rankName: '十両' },
  },
  {
    id: 'JuryoMakushita',
    upperDivision: 'Juryo',
    lowerDivision: 'Makushita',
    upperBand: { minNumber: 12, maxNumber: 14, rankName: '十両' },
    lowerBand: { minNumber: 1, maxNumber: 5, rankName: '幕下' },
  },
  {
    id: 'MakushitaSandanme',
    upperDivision: 'Makushita',
    lowerDivision: 'Sandanme',
    upperBand: { minNumber: 55, maxNumber: 60, rankName: '幕下' },
    lowerBand: { minNumber: 1, maxNumber: 5, rankName: '三段目' },
  },
  {
    id: 'SandanmeJonidan',
    upperDivision: 'Sandanme',
    lowerDivision: 'Jonidan',
    upperBand: { minNumber: 85, maxNumber: 90, rankName: '三段目' },
    lowerBand: { minNumber: 1, maxNumber: 5, rankName: '序二段' },
  },
  {
    id: 'JonidanJonokuchi',
    upperDivision: 'Jonidan',
    lowerDivision: 'Jonokuchi',
    upperBand: { minNumber: 96, maxNumber: 100, rankName: '序二段' },
    lowerBand: { minNumber: 1, maxNumber: 5, rankName: '序ノ口' },
  },
];

export const DEFAULT_TORIKUMI_LATE_EVAL_START_DAY = 13;
export const DEFAULT_TORIKUMI_LATE_SURVIVAL_MATCH_BONUS = 360;
export const DEFAULT_TORIKUMI_LATE_BOUNDARY_PLAYOFF_BONUS = 320;
export const DEFAULT_TORIKUMI_LATE_BOUNDARY_FORCE_COUNT = 2;

export const DEFAULT_TORIKUMI_BOUNDARY_PRIORITY: BoundaryId[] = [
  'MakuuchiJuryo',
  'JuryoMakushita',
  'MakushitaSandanme',
  'SandanmeJonidan',
  'JonidanJonokuchi',
];

export const rankDistanceWeight = (day: number): number => {
  if (day <= 5) return BALANCE.torikumi.earlyRankDistanceWeight;
  if (day <= 10) return BALANCE.torikumi.midRankDistanceWeight;
  return BALANCE.torikumi.lateRankDistanceWeight;
};

export const scoreDistanceWeight = (day: number): number => {
  if (day <= 5) return BALANCE.torikumi.earlyScoreDistanceWeight;
  if (day <= 10) return BALANCE.torikumi.midScoreDistanceWeight;
  return Math.min(
    BALANCE.torikumi.sameScoreWeightCap,
    BALANCE.torikumi.lateScoreDistanceWeight,
  );
};

export const boundaryNeedWeight = (
  day: number,
  vacancy = 0,
  promotionPressure = 0,
): number => {
  const lateWeight = day >= 11 ? BALANCE.torikumi.boundaryLateDayWeight : 0;
  return (
    vacancy * BALANCE.torikumi.boundaryVacancyWeight +
    promotionPressure * BALANCE.torikumi.boundaryPromotionPressureWeight +
    lateWeight
  );
};

const resolveBorderlineWins = (targetBouts: number): number => {
  if (targetBouts === 15) return 7;
  if (targetBouts === 7) return 3;
  return Math.max(1, Math.floor(targetBouts / 2));
};

export const isBorderlineSurvivalMatchPoint = (
  participant: Pick<TorikumiParticipant, 'wins' | 'losses' | 'targetBouts'>,
): boolean => {
  const border = resolveBorderlineWins(participant.targetBouts);
  return participant.wins === border && participant.losses === border;
};

export const resolveRankNumber = (participant: TorikumiParticipant): number =>
  participant.rankNumber ?? Math.floor((participant.rankScore - 1) / 2) + 1;

export const resolveTorikumiTier = (participant: TorikumiParticipant): TorikumiTier => {
  if (participant.torikumiTier) return participant.torikumiTier;
  if (participant.division === 'Makuuchi') {
    if (participant.rankName === '横綱') return 'Yokozuna';
    if (participant.rankName === '大関') return 'Ozeki';
    if (participant.rankName === '関脇' || participant.rankName === '小結') return 'Sanyaku';
    return resolveRankNumber(participant) <= 8 ? 'Upper' : 'Lower';
  }
  if (participant.division === 'Juryo') {
    const rankNumber = resolveRankNumber(participant);
    return rankNumber <= 5 || rankNumber >= 12 ? 'Boundary' : 'Lower';
  }
  if (participant.division === 'Makushita') {
    return resolveRankNumber(participant) <= 5 ? 'Boundary' : 'Lower';
  }
  if (participant.division === 'Sandanme') {
    return resolveRankNumber(participant) <= 5 || resolveRankNumber(participant) >= 85
      ? 'Boundary'
      : 'Lower';
  }
  if (participant.division === 'Jonidan') {
    return resolveRankNumber(participant) <= 5 || resolveRankNumber(participant) >= 96
      ? 'Boundary'
      : 'Lower';
  }
  return resolveRankNumber(participant) <= 5 ? 'Boundary' : 'Lower';
};

export const resolveYushoRaceTier = (
  participant: TorikumiParticipant,
  divisionLeaderWins: number,
): YushoRaceTier => {
  if (participant.yushoRaceTier) return participant.yushoRaceTier;
  const gap = divisionLeaderWins - participant.wins;
  if (gap <= 0) return 'Leader';
  if (gap <= 1) return 'Contender';
  return 'Outside';
};

export const resolveSurvivalBubble = (participant: TorikumiParticipant): boolean => {
  if (typeof participant.survivalBubble === 'boolean') return participant.survivalBubble;
  if (isJuryoDemotionBubble(participant)) return true;
  if (participant.division === 'Makuuchi' && resolveRankNumber(participant) >= 15 && participant.wins <= 6) {
    return true;
  }
  if (participant.division === 'Makushita' && resolveRankNumber(participant) <= 5) {
    return participant.wins >= 4 && participant.losses >= 1;
  }
  return isBorderlineSurvivalMatchPoint(participant);
};

export const isUpperRankTier = (participant: TorikumiParticipant): boolean =>
  ['Yokozuna', 'Ozeki', 'Sanyaku'].includes(resolveTorikumiTier(participant));

export const isJuryoDemotionBubble = (participant: TorikumiParticipant): boolean => {
  if (participant.division !== 'Juryo') return false;
  const rankNumber = resolveRankNumber(participant);
  return rankNumber >= 13 && participant.wins <= 6;
};

export const isMakushitaPromotionBubble = (participant: TorikumiParticipant): boolean => {
  if (participant.division !== 'Makushita') return false;
  const rankNumber = resolveRankNumber(participant);
  return rankNumber <= 5 && participant.wins >= 5 && participant.wins >= participant.losses + 1;
};

export const buildBoundaryBandMap = (
  bands: BoundaryBandSpec[],
): Map<BoundaryId, BoundaryBandSpec> =>
  new Map(bands.map((band) => [band.id, band]));

const LOWER_DIVISION_SET = new Set<TorikumiDivision>([
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
]);

export const isLowerDivision = (division: TorikumiDivision): boolean =>
  LOWER_DIVISION_SET.has(division);

const chooseUniqueIndices = (count: number, size: number, rng: RandomSource): number[] => {
  const picked = new Set<number>();
  while (picked.size < count) {
    picked.add(Math.floor(rng() * size));
  }
  return [...picked.values()];
};

export const buildLowerDivisionBoutDays = (rng: RandomSource): number[] => {
  // Lower divisions should mostly finish by day 13, with day 14/15 appearing occasionally.
  // All intervals stay 2 or 3 days apart (1-2 day rest between bouts).
  const roll = rng();
  const startDay =
    roll < 0.68 ? 1 :
      roll < 0.88 ? (rng() < 0.7 ? 1 : 2) :
        (rng() < 0.6 ? 1 : 2);
  const threeGapCount =
    roll < 0.68 ? 0 :
      roll < 0.88 ? (startDay === 1 ? 1 : 0) :
        (startDay === 1 ? 2 : 1);
  const intervals = Array.from({ length: 6 }, () => 2);
  const threeGapPositions = chooseUniqueIndices(threeGapCount, intervals.length, rng);
  for (const position of threeGapPositions) intervals[position] = 3;

  const days: number[] = [startDay];
  for (const interval of intervals) {
    days.push(days[days.length - 1] + interval);
  }
  return days;
};

export const createLowerDivisionBoutDayMap = (
  participants: TorikumiParticipant[],
  rng: RandomSource,
): Map<string, Set<number>> => {
  const map = new Map<string, Set<number>>();
  for (const participant of participants) {
    if (!isLowerDivision(participant.division)) continue;
    map.set(participant.id, new Set(buildLowerDivisionBoutDays(rng)));
  }
  return map;
};

export const resolveLowerDivisionEligibility = (
  participant: TorikumiParticipant,
  day: number,
  dayMap?: ReadonlyMap<string, ReadonlySet<number>>,
): boolean => {
  if (day < 1 || day > 15) return false;
  if (!isLowerDivision(participant.division)) return true;
  const days = dayMap?.get(participant.id);
  if (!days) return day % 2 === 1;
  return days.has(day);
};
