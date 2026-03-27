import { getRankValue } from '../../../ranking/rankScore';
import { BanzukeCandidate, BashoRecordSnapshot, TopDirective } from './types';
import { resolveSekitoriPerformanceIndex } from './performanceIndex';
import { resolveEmpiricalSlotBand } from '../empirical';
import { getHeiseiBoundaryExchangeRate } from '../../../calibration/banzukeHeisei';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const resolveBoundaryPressure = (
  snapshot: BashoRecordSnapshot,
  currentSlot: number,
  direction: 'promotion' | 'demotion',
): number => {
  const division = snapshot.rank.division;
  const number = snapshot.rank.number ?? (division === 'Juryo' ? 14 : 17);
  const rate =
    division === 'Juryo'
      ? getHeiseiBoundaryExchangeRate(direction === 'promotion' ? 'JuryoToMakuuchi' : 'JuryoToMakushita')
      : getHeiseiBoundaryExchangeRate(direction === 'demotion' ? 'MakuuchiToJuryo' : 'JuryoToMakuuchi');
  if (rate <= 0) return 0;
  const diff = snapshot.wins - (snapshot.losses + snapshot.absent);
  if (direction === 'promotion' && diff <= 0) return 0;
  if (direction === 'demotion' && diff >= 0) return 0;
  const max = division === 'Juryo' ? 14 : 17;
  const proximity =
    direction === 'promotion'
      ? 1 - (number - 1) / Math.max(1, max - 1)
      : (number - 1) / Math.max(1, max - 1);
  return clamp(rate * proximity * Math.abs(diff), 0, 1) + Math.max(0, 40 - currentSlot) * 0.001;
};

export const scoreTopDivisionCandidate = (
  snapshot: BashoRecordSnapshot,
  directive: TopDirective,
  currentSlot: number,
): number => {
  const index = resolveSekitoriPerformanceIndex(snapshot);
  const empirical = resolveEmpiricalSlotBand({
    division: snapshot.rank.division,
    rankName: snapshot.rank.name,
    rankNumber: snapshot.rank.number,
    currentSlot,
    totalSlots: 70,
    wins: snapshot.wins,
    losses: snapshot.losses,
    absent: snapshot.absent,
    promotionPressure: resolveBoundaryPressure(snapshot, currentSlot, 'promotion'),
    demotionPressure: resolveBoundaryPressure(snapshot, currentSlot, 'demotion'),
  });
  const topRankBonus =
    directive.preferredTopName === '横綱'
      ? 60
      : directive.preferredTopName === '大関'
        ? 42
        : directive.preferredTopName === '関脇'
          ? 22
          : directive.preferredTopName === '小結'
            ? 14
            : 0;
  return (
    empirical.score +
    index.performanceOverExpected * 22 +
    (index.sos - 100) * 0.5 +
    (snapshot.yusho ? 40 : 0) +
    (snapshot.junYusho ? 16 : 0) +
    directive.yokozunaPromotionBonus * 2 +
    topRankBonus
  );
};

export const compareByScore = (a: BanzukeCandidate, b: BanzukeCandidate): number => {
  if (b.score !== a.score) return b.score - a.score;
  if (a.currentSlot !== b.currentSlot) return a.currentSlot - b.currentSlot;
  return a.snapshot.id.localeCompare(b.snapshot.id);
};

export const compareRankKey = (a: BanzukeCandidate, b: BanzukeCandidate): number => {
  const av = getRankValue(a.snapshot.rank);
  const bv = getRankValue(b.snapshot.rank);
  if (av !== bv) return av - bv;
  return compareByScore(a, b);
};
