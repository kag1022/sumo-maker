import {
  DEFAULT_TORIKUMI_BOUNDARY_PRIORITY,
  DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
} from '../policy';
import {
  BoundaryBandSpec,
  BoundaryId,
  ScheduleTorikumiBashoParams,
  TorikumiBashoResult,
  TorikumiPair,
  TorikumiParticipant,
} from '../types';
import {
  filterByBand,
  isBoundaryLatePhase,
  mergeUniqueParticipants,
  pairAcrossBoundary,
  resolveActivationReasons,
  resolveHybridBandCandidates,
} from './boundary';
import { markPaired, pairWithinDivision } from './intraDivision';
import { reserveLateBoundaryCandidates } from './reservations';

const ensureFacedMap = (
  participants: TorikumiParticipant[],
  facedMap?: Map<string, Set<string>>,
): Map<string, Set<string>> => {
  if (facedMap) {
    for (const participant of participants) {
      if (!facedMap.has(participant.id)) facedMap.set(participant.id, new Set<string>());
    }
    return facedMap;
  }
  return new Map(participants.map((participant) => [participant.id, new Set<string>()]));
};

const removeUsedFromLeftovers = (
  leftoversByDivision: Map<string, TorikumiParticipant[]>,
  usedIds: Set<string>,
): void => {
  for (const [division, leftovers] of leftoversByDivision.entries()) {
    leftoversByDivision.set(
      division,
      leftovers.filter((participant) => !usedIds.has(participant.id)),
    );
  }
};

export const scheduleTorikumiBasho = (
  params: ScheduleTorikumiBashoParams,
): TorikumiBashoResult => {
  const faced = ensureFacedMap(params.participants, params.facedMap);
  const days = params.days.slice().sort((a, b) => a - b);
  const lateEvalStartDay = params.lateEvalStartDay ?? DEFAULT_TORIKUMI_LATE_EVAL_START_DAY;
  const vacancyByDivision = params.vacancyByDivision ?? {};
  const simulationModelVersion = params.simulationModelVersion ?? 'unified-v2-kimarite';
  const rng = params.rng;
  const canFightOnDay =
    params.dayEligibility ??
    ((_participant: TorikumiParticipant, day: number): boolean => day >= 1 && day <= 15);
  const boundaryBandById = new Map<BoundaryId, BoundaryBandSpec>(
    params.boundaryBands.map((band) => [band.id, band]),
  );

  const boundaryActivations: TorikumiBashoResult['diagnostics']['boundaryActivations'] = [];
  const dayResults: TorikumiBashoResult['days'] = [];

  for (const day of days) {
    const eligible = params.participants.filter(
      (participant) =>
        participant.active &&
        participant.boutsDone < participant.targetBouts &&
        canFightOnDay(participant, day),
    );
    const byDivision = new Map<string, TorikumiParticipant[]>();
    for (const participant of eligible) {
      const list = byDivision.get(participant.division) ?? [];
      list.push(participant);
      byDivision.set(participant.division, list);
    }

    const dayPairs: TorikumiPair[] = [];
    const leftoversByDivision = new Map<string, TorikumiParticipant[]>();
    const { reservationsByBoundary, reservationsByDivision } = reserveLateBoundaryCandidates(
      day,
      lateEvalStartDay,
      byDivision,
      boundaryBandById,
    );

    for (const [division, pool] of byDivision.entries()) {
      const reserved = reservationsByDivision.get(division) ?? [];
      const reservedIds = new Set(reserved.map((participant) => participant.id));
      const poolForWithin =
        reservedIds.size > 0
          ? pool.filter((participant) => !reservedIds.has(participant.id))
          : pool;
      const within = pairWithinDivision(
        poolForWithin,
        faced,
        day,
        lateEvalStartDay,
        simulationModelVersion,
        rng,
      );
      dayPairs.push(...within.pairs);
      leftoversByDivision.set(
        division,
        reserved.length > 0 ? within.leftovers.concat(reserved) : within.leftovers,
      );
    }

    for (const boundaryId of DEFAULT_TORIKUMI_BOUNDARY_PRIORITY) {
      const spec = boundaryBandById.get(boundaryId);
      if (!spec) continue;

      const upperLeftovers = leftoversByDivision.get(spec.upperDivision) ?? [];
      const lowerLeftovers = leftoversByDivision.get(spec.lowerDivision) ?? [];
      if (!upperLeftovers.length || !lowerLeftovers.length) continue;

      const boundaryIsLatePhase = isBoundaryLatePhase(
        day,
        lateEvalStartDay,
        upperLeftovers,
        lowerLeftovers,
      );
      const reasons = resolveActivationReasons(
        spec,
        upperLeftovers,
        lowerLeftovers,
        vacancyByDivision,
        boundaryIsLatePhase,
      );
      if (!reasons.length) continue;

      const reservation = reservationsByBoundary.get(spec.id);
      const upperCandidates = resolveHybridBandCandidates(
        upperLeftovers,
        spec.upperBand,
        true,
      );
      const lowerCandidates = resolveHybridBandCandidates(
        lowerLeftovers,
        spec.lowerBand,
        false,
      );
      const upperBandCandidates = filterByBand(upperCandidates, spec.upperBand);
      const lowerBandCandidates = filterByBand(lowerCandidates, spec.lowerBand);
      let effectiveUpper = upperBandCandidates.length ? upperBandCandidates : upperCandidates;
      let effectiveLower = lowerBandCandidates.length ? lowerBandCandidates : lowerCandidates;
      if (reservation) {
        effectiveUpper = mergeUniqueParticipants(reservation.upper, effectiveUpper);
        effectiveLower = mergeUniqueParticipants(reservation.lower, effectiveLower);
      }
      const boundaryPairs = pairAcrossBoundary(
        day,
        lateEvalStartDay,
        faced,
        spec,
        effectiveUpper,
        effectiveLower,
        reasons,
        simulationModelVersion,
        rng,
      );
      if (!boundaryPairs.length) continue;

      dayPairs.push(...boundaryPairs);
      boundaryActivations.push({
        day,
        boundaryId: spec.id,
        reasons,
        pairCount: boundaryPairs.length,
      });
      const usedIds = new Set(
        boundaryPairs.flatMap((pair) => [pair.a.id, pair.b.id]),
      );
      removeUsedFromLeftovers(leftoversByDivision, usedIds);
    }

    for (const [division, leftovers] of leftoversByDivision.entries()) {
      if (leftovers.length < 2) continue;
      const retry = pairWithinDivision(
        leftovers,
        faced,
        day,
        lateEvalStartDay,
        simulationModelVersion,
        rng,
      );
      dayPairs.push(...retry.pairs);
      leftoversByDivision.set(division, retry.leftovers);
    }

    for (const pair of dayPairs) {
      markPaired(faced, pair.a, pair.b);
      pair.a.boutsDone += 1;
      pair.b.boutsDone += 1;
      params.onPair?.(pair, day);
    }

    const byeIds: string[] = [];
    for (const leftovers of leftoversByDivision.values()) {
      for (const participant of leftovers) {
        byeIds.push(participant.id);
        params.onBye?.(participant, day);
      }
    }

    dayResults.push({
      day,
      pairs: dayPairs,
      byeIds,
    });
  }

  const remainingTargetById: Record<string, number> = {};
  const unscheduledById: Record<string, number> = {};
  for (const participant of params.participants) {
    const remaining = Math.max(0, participant.targetBouts - participant.boutsDone);
    remainingTargetById[participant.id] = remaining;
    if (remaining > 0) unscheduledById[participant.id] = remaining;
  }

  return {
    days: dayResults,
    diagnostics: {
      boundaryActivations,
      remainingTargetById,
      unscheduledById,
    },
  };
};
