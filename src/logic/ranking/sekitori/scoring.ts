import { getRankValue } from '../rankScore';
import { normalizeSekitoriLosses } from '../topDivisionRules';
import { BanzukeCandidate, BashoRecordSnapshot, TopDirective } from './types';

export const scoreTopDivisionCandidate = (
  snapshot: BashoRecordSnapshot,
  directive: TopDirective,
): number => {
  const wins = snapshot.wins;
  const losses = normalizeSekitoriLosses(snapshot.wins, snapshot.losses, snapshot.absent);
  const kachikoshi = Math.max(0, wins - losses);
  const makekoshi = Math.max(0, losses - wins);
  const rank = snapshot.rank;

  if (rank.division === 'Makuuchi') {
    if (rank.name === '横綱') {
      return (
        242 +
        kachikoshi * 3.0 -
        makekoshi * 4.8 -
        makekoshi * makekoshi * 1.0 -
        snapshot.absent * 1.8 +
        wins * 0.2 +
        (snapshot.yusho ? 14 : 0) +
        (snapshot.junYusho ? 7 : 0)
      );
    }
    if (rank.name === '大関') {
      return (
        224 +
        kachikoshi * 3.15 -
        makekoshi * 4.85 -
        makekoshi * makekoshi * 1.02 -
        snapshot.absent * 1.8 +
        wins * 0.2 +
        (snapshot.yusho ? 14 : 0) +
        (snapshot.junYusho ? 7 : 0) +
        directive.yokozunaPromotionBonus
      );
    }
    if (rank.name === '関脇') {
      return (
        194 +
        kachikoshi * 3.35 -
        makekoshi * 4.65 -
        makekoshi * makekoshi * 0.95 -
        snapshot.absent * 1.5 +
        wins * 0.25 +
        (snapshot.yusho ? 12 : 0) +
        (snapshot.junYusho ? 6 : 0)
      );
    }
    if (rank.name === '小結') {
      return (
        174 +
        kachikoshi * 3.35 -
        makekoshi * 4.65 -
        makekoshi * makekoshi * 0.95 -
        snapshot.absent * 1.5 +
        wins * 0.25 +
        (snapshot.yusho ? 12 : 0) +
        (snapshot.junYusho ? 6 : 0)
      );
    }
    const m = rank.number || 17;
    return (
      122 +
      Math.max(0, 18 - m) * 6.05 +
      kachikoshi * 2.45 -
      makekoshi * 4.2 -
      makekoshi * makekoshi * 0.9 -
      snapshot.absent * 1.4 +
      wins * 0.15 +
      (snapshot.yusho ? 11 : 0) +
      (snapshot.junYusho ? 5.5 : 0)
    );
  }

  const j = rank.number || 14;
  return (
    72 +
    Math.max(0, 15 - j) * 4.25 +
    kachikoshi * 2.85 -
    makekoshi * 3.85 -
    makekoshi * makekoshi * 0.72 -
    snapshot.absent * 1.3 +
    wins * 0.1 +
    (snapshot.yusho ? 10 : 0) +
    (snapshot.junYusho ? 4.5 : 0)
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
