import {
  DEFAULT_TORIKUMI_LATE_BOUNDARY_FORCE_COUNT,
  isJuryoDemotionBubble,
  isMakushitaPromotionBubble,
} from '../policy';
import { BoundaryBandSpec, BoundaryId, TorikumiParticipant } from '../types';
import { isLowerDivisionClimax, resolveRankNumber } from './scoring';

export type BoundaryReservation = {
  upper: TorikumiParticipant[];
  lower: TorikumiParticipant[];
};

export const reserveLateBoundaryCandidates = (
  day: number,
  lateEvalStartDay: number,
  byDivision: Map<string, TorikumiParticipant[]>,
  boundaryBandById: Map<BoundaryId, BoundaryBandSpec>,
): {
  reservationsByBoundary: Map<BoundaryId, BoundaryReservation>;
  reservationsByDivision: Map<string, TorikumiParticipant[]>;
} => {
  const reservationsByBoundary = new Map<BoundaryId, BoundaryReservation>();
  const reservationsByDivision = new Map<string, TorikumiParticipant[]>();

  const spec = boundaryBandById.get('JuryoMakushita');
  if (!spec) return { reservationsByBoundary, reservationsByDivision };

  const upperPool = byDivision.get(spec.upperDivision) ?? [];
  const lowerPool = byDivision.get(spec.lowerDivision) ?? [];
  if (!upperPool.length || !lowerPool.length) return { reservationsByBoundary, reservationsByDivision };

  const isLatePhase =
    day >= lateEvalStartDay ||
    upperPool.some(isLowerDivisionClimax) ||
    lowerPool.some(isLowerDivisionClimax);
  if (!isLatePhase) return { reservationsByBoundary, reservationsByDivision };

  const upperCandidates = upperPool
    .filter(isJuryoDemotionBubble)
    .sort((a, b) =>
      resolveRankNumber(b) - resolveRankNumber(a) ||
      a.wins - b.wins ||
      b.losses - a.losses,
    );
  const lowerCandidates = lowerPool
    .filter(isMakushitaPromotionBubble)
    .sort((a, b) =>
      resolveRankNumber(a) - resolveRankNumber(b) ||
      b.wins - a.wins ||
      a.losses - b.losses,
    );
  const reserveCount = Math.min(
    DEFAULT_TORIKUMI_LATE_BOUNDARY_FORCE_COUNT,
    upperCandidates.length,
    lowerCandidates.length,
  );
  if (reserveCount <= 0) return { reservationsByBoundary, reservationsByDivision };

  const upperReserved = upperCandidates.slice(0, reserveCount);
  const lowerReserved = lowerCandidates.slice(0, reserveCount);
  reservationsByBoundary.set(spec.id, {
    upper: upperReserved,
    lower: lowerReserved,
  });
  reservationsByDivision.set(spec.upperDivision, upperReserved);
  reservationsByDivision.set(spec.lowerDivision, lowerReserved);

  return { reservationsByBoundary, reservationsByDivision };
};
