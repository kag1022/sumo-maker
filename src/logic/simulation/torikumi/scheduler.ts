import {
  boundaryNeedWeight,
  DEFAULT_TORIKUMI_BOUNDARY_PRIORITY,
  DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
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
  boundaryNeed = 0,
): number => {
  const scoreWeight = Math.min(
    REALISM_V1_BALANCE.torikumi.sameScoreWeightCap,
    scoreDistanceWeight(day),
  );
  const rankWeight = rankDistanceWeight(day);
  const lossWeight = Math.max(4, Math.round(scoreWeight * 0.1));
  return (
    Math.abs(a.wins - b.wins) * scoreWeight +
    Math.abs(resolveRankNumber(a) - resolveRankNumber(b)) * rankWeight +
    Math.abs(a.losses - b.losses) * lossWeight -
    boundaryNeed
  );
};

const pairWithinDivision = (
  pool: TorikumiParticipant[],
  faced: Map<string, Set<string>>,
  day: number,
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
      const score = resolvePairScore(current, candidate, day);
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
  day: number,
  spec: BoundaryBandSpec,
  upper: TorikumiParticipant[],
  lower: TorikumiParticipant[],
  vacancyByDivision: Partial<Record<string, number>>,
  lateEvalStartDay: number,
): BoundaryActivationReason[] => {
  const reasons: BoundaryActivationReason[] = [];
  if ((vacancyByDivision[spec.upperDivision] ?? 0) > 0) reasons.push('VACANCY');
  if (upper.length > 0 && lower.length > 0) reasons.push('SHORTAGE');
  if (hasCloseScorePair(upper, lower)) reasons.push('SCORE_ALIGNMENT');
  if (day >= lateEvalStartDay) reasons.push('LATE_EVAL');
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
      const score = resolvePairScore(upper, lower, day, needWeight);
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
    for (const [division, pool] of byDivision.entries()) {
      const within = pairWithinDivision(pool, faced, day);
      dayPairs.push(...within.pairs);
      leftoversByDivision.set(division, within.leftovers);
    }

    for (const boundaryId of DEFAULT_TORIKUMI_BOUNDARY_PRIORITY) {
      const spec = boundaryBandById.get(boundaryId);
      if (!spec) continue;

      const upperLeftovers = leftoversByDivision.get(spec.upperDivision) ?? [];
      const lowerLeftovers = leftoversByDivision.get(spec.lowerDivision) ?? [];
      if (!upperLeftovers.length || !lowerLeftovers.length) continue;

      const reasons = resolveActivationReasons(
        day,
        spec,
        upperLeftovers,
        lowerLeftovers,
        vacancyByDivision,
        lateEvalStartDay,
      );
      if (!reasons.length) continue;

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
      const effectiveUpper = upperBandCandidates.length ? upperBandCandidates : upperCandidates;
      const effectiveLower = lowerBandCandidates.length ? lowerBandCandidates : lowerCandidates;
      const boundaryPairs = pairAcrossBoundary(
        day,
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
      const retry = pairWithinDivision(leftovers, faced, day);
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
