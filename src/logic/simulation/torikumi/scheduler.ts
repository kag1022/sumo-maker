import {
  boundaryNeedWeight,
  DEFAULT_TORIKUMI_BOUNDARY_PRIORITY,
  DEFAULT_TORIKUMI_LATE_BOUNDARY_FORCE_COUNT,
  DEFAULT_TORIKUMI_LATE_BOUNDARY_PLAYOFF_BONUS,
  DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
  DEFAULT_TORIKUMI_LATE_SURVIVAL_MATCH_BONUS,
  isBorderlineSurvivalMatchPoint,
  isJuryoDemotionBubble,
  isMakushitaPromotionBubble,
  rankDistanceWeight,
  scoreDistanceWeight,
} from './policy';
import {
  BoundaryActivationReason,
  BoundaryBandSpec,
  BoundaryId,
  ScheduleTorikumiBashoParams,
  TorikumiBashoResult,
  TorikumiPair,
  TorikumiParticipant,
} from './types';
import { REALISM_V1_BALANCE } from '../../balance/realismV1';

const resolveRankNumber = (participant: TorikumiParticipant): number =>
  participant.rankNumber ?? Math.floor((participant.rankScore - 1) / 2) + 1;

const isAlreadyPaired = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): boolean => faced.get(a.id)?.has(b.id) ?? false;

const isForbiddenPair = (a: TorikumiParticipant, b: TorikumiParticipant): boolean =>
  (a.forbiddenOpponentIds?.includes(b.id) ?? false) ||
  (b.forbiddenOpponentIds?.includes(a.id) ?? false);

const isValidPair = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): boolean =>
  a.id !== b.id &&
  a.stableId !== b.stableId &&
  !isAlreadyPaired(faced, a, b) &&
  !isForbiddenPair(a, b);

const markPaired = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): void => {
  faced.get(a.id)?.add(b.id);
  faced.get(b.id)?.add(a.id);
};

const deterministicTie = (a: TorikumiParticipant, b: TorikumiParticipant, day: number): number => {
  const key = `${a.id}|${b.id}|${day}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

type PairEvalPhase = 'EARLY' | 'MID' | 'LATE';

const isLowerDivisionClimax = (participant: TorikumiParticipant): boolean =>
  participant.targetBouts <= 7 && participant.boutsDone >= 5;

const resolvePairEvalPhase = (
  day: number,
  lateEvalStartDay: number,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): PairEvalPhase => {
  if (day >= lateEvalStartDay || isLowerDivisionClimax(a) || isLowerDivisionClimax(b)) return 'LATE';
  if (day <= 5) return 'EARLY';
  return 'MID';
};

const mergeUniqueParticipants = (
  prioritized: TorikumiParticipant[],
  rest: TorikumiParticipant[],
): TorikumiParticipant[] => {
  const seen = new Set<string>();
  const merged: TorikumiParticipant[] = [];
  for (const participant of prioritized.concat(rest)) {
    if (seen.has(participant.id)) continue;
    seen.add(participant.id);
    merged.push(participant);
  }
  return merged;
};

const compareForPhase = (a: TorikumiParticipant, b: TorikumiParticipant, day: number): number => {
  if (day <= 5) {
    if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
  } else if (day <= 10) {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
  } else {
    if (a.wins !== b.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
  }
  if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
  return deterministicTie(a, b, day) - deterministicTie(b, a, day);
};

const resolvePairScore = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  day: number,
  options?: {
    boundaryNeed?: number;
    phase?: PairEvalPhase;
    boundaryId?: BoundaryId;
  },
): number => {
  const boundaryNeed = options?.boundaryNeed ?? 0;
  const phase = options?.phase ?? (day >= DEFAULT_TORIKUMI_LATE_EVAL_START_DAY ? 'LATE' : 'MID');
  const scoreWeight = Math.min(
    REALISM_V1_BALANCE.torikumi.sameScoreWeightCap,
    scoreDistanceWeight(day),
  );
  const rankWeight = rankDistanceWeight(day);
  const lossWeight = Math.max(4, Math.round(scoreWeight * 0.1));
  let score =
    Math.abs(a.wins - b.wins) * scoreWeight +
    Math.abs(resolveRankNumber(a) - resolveRankNumber(b)) * rankWeight +
    Math.abs(a.losses - b.losses) * lossWeight -
    boundaryNeed;

  if (phase !== 'LATE') return score;

  const survivalClash =
    isBorderlineSurvivalMatchPoint(a) &&
    isBorderlineSurvivalMatchPoint(b) &&
    a.targetBouts === b.targetBouts &&
    a.wins === b.wins &&
    a.losses === b.losses;
  if (survivalClash) {
    score -= DEFAULT_TORIKUMI_LATE_SURVIVAL_MATCH_BONUS;
  }

  const boundaryPlayoff =
    options?.boundaryId === 'JuryoMakushita' &&
    (
      (isJuryoDemotionBubble(a) && isMakushitaPromotionBubble(b)) ||
      (isJuryoDemotionBubble(b) && isMakushitaPromotionBubble(a))
    );
  if (boundaryPlayoff) {
    score -= DEFAULT_TORIKUMI_LATE_BOUNDARY_PLAYOFF_BONUS;
  }

  return score;
};

const pairWithinDivision = (
  pool: TorikumiParticipant[],
  faced: Map<string, Set<string>>,
  day: number,
  lateEvalStartDay: number,
): { pairs: TorikumiPair[]; leftovers: TorikumiParticipant[] } => {
  if (pool.length <= 1) return { pairs: [], leftovers: pool.slice() };
  const sorted = pool.slice().sort((a, b) => compareForPhase(a, b, day));
  const used = new Set<string>();
  const pairs: TorikumiPair[] = [];
  const leftovers: TorikumiParticipant[] = [];

  for (let i = 0; i < sorted.length; i += 1) {
    const current = sorted[i];
    if (used.has(current.id)) continue;

    let bestCandidate: TorikumiParticipant | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const candidate = sorted[j];
      if (used.has(candidate.id)) continue;
      if (!isValidPair(faced, current, candidate)) continue;
      const score = resolvePairScore(current, candidate, day, {
        phase: resolvePairEvalPhase(day, lateEvalStartDay, current, candidate),
      });
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      leftovers.push(current);
      used.add(current.id);
      continue;
    }

    used.add(current.id);
    used.add(bestCandidate.id);
    pairs.push({
      a: current,
      b: bestCandidate,
      activationReasons: [],
    });
  }

  return { pairs, leftovers };
};

const filterByBand = (
  participants: TorikumiParticipant[],
  band: BoundaryBandSpec['upperBand'],
): TorikumiParticipant[] =>
  participants.filter((participant) => {
    if (band.rankName && participant.rankName !== band.rankName) return false;
    const number = resolveRankNumber(participant);
    return number >= band.minNumber && number <= band.maxNumber;
  });

const resolveHybridBandCandidates = (
  participants: TorikumiParticipant[],
  band: BoundaryBandSpec['upperBand'],
  preferUpperNumber: boolean,
): TorikumiParticipant[] => {
  if (!participants.length) return [];
  let min = band.minNumber;
  let max = band.maxNumber;
  const floor = 1;
  const ceil = Math.max(...participants.map((participant) => resolveRankNumber(participant)));

  for (let step = 0; step < 8; step += 1) {
    const filtered = participants.filter((participant) => {
      if (band.rankName && participant.rankName !== band.rankName) return false;
      const number = resolveRankNumber(participant);
      return number >= min && number <= max;
    });
    if (filtered.length > 0) return filtered;
    min = Math.max(floor, min - 1);
    max = Math.min(ceil, max + 1);
  }

  const sorted = participants
    .slice()
    .sort((a, b) =>
      preferUpperNumber
        ? resolveRankNumber(b) - resolveRankNumber(a)
        : resolveRankNumber(a) - resolveRankNumber(b));
  return sorted.slice(0, Math.min(10, sorted.length));
};

const hasCloseScorePair = (
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
): boolean => {
  for (const up of upper) {
    for (const low of lower) {
      if (Math.abs(up.wins - low.wins) <= 1) return true;
    }
  }
  return false;
};

const hasRunawayLower = (
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
): boolean => {
  if (!upper.length || !lower.length) return false;
  const upperBottomWins = Math.min(...upper.map((participant) => participant.wins));
  const lowerTopWins = Math.max(...lower.map((participant) => participant.wins));
  return lowerTopWins - upperBottomWins >= 2;
};

const resolveActivationReasons = (
  spec: BoundaryBandSpec,
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
  vacancyByDivision: Partial<Record<string, number>>,
  isLatePhase: boolean,
): BoundaryActivationReason[] => {
  const reasons: BoundaryActivationReason[] = [];
  if ((vacancyByDivision[spec.upperDivision] ?? 0) > 0) reasons.push('VACANCY');
  if (upper.length > 0 && lower.length > 0) reasons.push('SHORTAGE');
  if (hasCloseScorePair(upper, lower)) reasons.push('SCORE_ALIGNMENT');
  if (isLatePhase) reasons.push('LATE_EVAL');
  if (hasRunawayLower(upper, lower)) reasons.push('RUNAWAY_CHECK');
  return reasons;
};

const resolvePromotionPressure = (
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
): number => {
  if (!upper.length || !lower.length) return 0;
  const upperBottom = Math.min(...upper.map((participant) => participant.wins));
  const lowerTop = Math.max(...lower.map((participant) => participant.wins));
  return Math.max(0, lowerTop - upperBottom - 1);
};

const pairAcrossBoundary = (
  day: number,
  lateEvalStartDay: number,
  faced: Map<string, Set<string>>,
  spec: BoundaryBandSpec,
  upperCandidates: TorikumiParticipant[],
  lowerCandidates: TorikumiParticipant[],
  reasons: BoundaryActivationReason[],
): TorikumiPair[] => {
  const pairs: TorikumiPair[] = [];
  const usedUpper = new Set<string>();
  const usedLower = new Set<string>();
  const sortedUpper = upperCandidates
    .slice()
    .sort((a, b) => resolveRankNumber(b) - resolveRankNumber(a));

  const vacancy = reasons.includes('VACANCY') ? 1 : 0;
  const promotionPressure = resolvePromotionPressure(upperCandidates, lowerCandidates);
  const needWeight = boundaryNeedWeight(day, vacancy, promotionPressure);

  for (const upper of sortedUpper) {
    if (usedUpper.has(upper.id)) continue;
    let bestLower: TorikumiParticipant | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const lower of lowerCandidates) {
      if (usedLower.has(lower.id)) continue;
      if (!isValidPair(faced, upper, lower)) continue;
      const score = resolvePairScore(upper, lower, day, {
        boundaryNeed: needWeight,
        boundaryId: spec.id,
        phase: resolvePairEvalPhase(day, lateEvalStartDay, upper, lower),
      });
      if (score < bestScore) {
        bestScore = score;
        bestLower = lower;
      }
    }
    if (!bestLower) continue;
    usedUpper.add(upper.id);
    usedLower.add(bestLower.id);
    pairs.push({
      a: upper,
      b: bestLower,
      boundaryId: spec.id,
      activationReasons: reasons,
    });
  }

  return pairs;
};

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

type BoundaryReservation = {
  upper: TorikumiParticipant[];
  lower: TorikumiParticipant[];
};

const reserveLateBoundaryCandidates = (
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

export const scheduleTorikumiBasho = (
  params: ScheduleTorikumiBashoParams,
): TorikumiBashoResult => {
  const faced = ensureFacedMap(params.participants, params.facedMap);
  const days = params.days.slice().sort((a, b) => a - b);
  const lateEvalStartDay = params.lateEvalStartDay ?? DEFAULT_TORIKUMI_LATE_EVAL_START_DAY;
  const vacancyByDivision = params.vacancyByDivision ?? {};
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
      const within = pairWithinDivision(poolForWithin, faced, day, lateEvalStartDay);
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

      const boundaryIsLatePhase =
        day >= lateEvalStartDay ||
        upperLeftovers.some(isLowerDivisionClimax) ||
        lowerLeftovers.some(isLowerDivisionClimax);
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
      const retry = pairWithinDivision(leftovers, faced, day, lateEvalStartDay);
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
