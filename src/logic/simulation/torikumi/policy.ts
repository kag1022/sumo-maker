import { RandomSource } from '../deps';
import { BoundaryBandSpec, BoundaryId, TorikumiDivision, TorikumiParticipant } from './types';
import { REALISM_V1_BALANCE } from '../../balance/realismV1';

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

export const DEFAULT_TORIKUMI_BOUNDARY_PRIORITY: BoundaryId[] = [
  'MakuuchiJuryo',
  'JuryoMakushita',
  'MakushitaSandanme',
  'SandanmeJonidan',
  'JonidanJonokuchi',
];

export const rankDistanceWeight = (day: number): number => {
  if (day <= 5) return REALISM_V1_BALANCE.torikumi.earlyRankDistanceWeight;
  if (day <= 10) return REALISM_V1_BALANCE.torikumi.midRankDistanceWeight;
  return REALISM_V1_BALANCE.torikumi.lateRankDistanceWeight;
};

export const scoreDistanceWeight = (day: number): number => {
  if (day <= 5) return REALISM_V1_BALANCE.torikumi.earlyScoreDistanceWeight;
  if (day <= 10) return REALISM_V1_BALANCE.torikumi.midScoreDistanceWeight;
  return Math.min(
    REALISM_V1_BALANCE.torikumi.sameScoreWeightCap,
    REALISM_V1_BALANCE.torikumi.lateScoreDistanceWeight,
  );
};

export const boundaryNeedWeight = (
  day: number,
  vacancy = 0,
  promotionPressure = 0,
): number => {
  const lateWeight = day >= 11 ? REALISM_V1_BALANCE.torikumi.boundaryLateDayWeight : 0;
  return (
    vacancy * REALISM_V1_BALANCE.torikumi.boundaryVacancyWeight +
    promotionPressure * REALISM_V1_BALANCE.torikumi.boundaryPromotionPressureWeight +
    lateWeight
  );
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
