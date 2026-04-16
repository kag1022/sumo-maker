import { getRankValue } from '../../../ranking/rankScore';
import { DEFAULT_MAKUUCHI_LAYOUT } from '../../scale/banzukeLayout';
import { BanzukeCandidate, BashoRecordSnapshot, SekitoriContextSnapshot, TopDirective } from './types';
import { buildSekitoriContextSnapshot, buildSekitoriOrderProfile } from './contextual';

const EMPTY_CONTEXT: SekitoriContextSnapshot = {
  upperCollapseCount: 0,
  upperBlockerCount: 0,
  makuuchiDemotionOpenings: 0,
  juryoPromotionCandidates: 0,
  sanyakuVacancies: 0,
  boundaryOpenings: {
    makuuchi: 0,
    juryo: 0,
  },
  competitionBands: new Map<string, number>(),
  promotionPressureSource: 0,
  demotionPressureSource: 0,
};

export const scoreTopDivisionCandidate = (
  snapshot: BashoRecordSnapshot,
  directive: TopDirective,
  currentSlot: number,
  context: SekitoriContextSnapshot = EMPTY_CONTEXT,
  layout = DEFAULT_MAKUUCHI_LAYOUT,
): number => {
  return buildSekitoriOrderProfile(
    snapshot,
    directive,
    currentSlot,
    context,
    layout,
  ).score;
};

export const compareByScore = (a: BanzukeCandidate, b: BanzukeCandidate): number => {
  const aTier = a.orderProfile?.comparisonTier ?? Number.MAX_SAFE_INTEGER;
  const bTier = b.orderProfile?.comparisonTier ?? Number.MAX_SAFE_INTEGER;
  if (aTier !== bTier) return aTier - bTier;
  if (b.score !== a.score) return b.score - a.score;
  if ((b.orderProfile?.vacancyGain ?? 0) !== (a.orderProfile?.vacancyGain ?? 0)) {
    return (b.orderProfile?.vacancyGain ?? 0) - (a.orderProfile?.vacancyGain ?? 0);
  }
  if (a.currentSlot !== b.currentSlot) return a.currentSlot - b.currentSlot;
  return a.snapshot.id.localeCompare(b.snapshot.id);
};

export const compareRankKey = (a: BanzukeCandidate, b: BanzukeCandidate): number => {
  const av = getRankValue(a.snapshot.rank);
  const bv = getRankValue(b.snapshot.rank);
  if (av !== bv) return av - bv;
  return compareByScore(a, b);
};

export { buildSekitoriContextSnapshot };
