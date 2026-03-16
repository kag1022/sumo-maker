import {
  buildBoundaryBandMap,
  DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
  isLowerDivision,
  isUpperRankTier,
  resolveRankNumber,
  resolveSurvivalBubble,
  resolveTorikumiTier,
  resolveYushoRaceTier,
} from '../policy';
import {
  BoundaryBandSpec,
  BoundaryId,
  ScheduleTorikumiBashoParams,
  TorikumiBashoResult,
  TorikumiMatchReason,
  TorikumiPair,
  TorikumiParticipant,
} from '../types';

type PairStage = {
  allowCrossDivision: boolean;
  enforceSameDivision: boolean;
  requireCrossDivision?: boolean;
  maxRankDiff?: number;
  maxWinDiff?: number;
};

type OrderedParticipant = {
  participant: TorikumiParticipant;
  orderKey: number;
};

const DIVISION_PRIORITY: Record<TorikumiParticipant['division'], number> = {
  Makuuchi: 0,
  Juryo: 1,
  Makushita: 2,
  Sandanme: 3,
  Jonidan: 4,
  Jonokuchi: 5,
};

const TIER_PRIORITY: Record<ReturnType<typeof resolveTorikumiTier>, number> = {
  Yokozuna: 0,
  Ozeki: 1,
  Sanyaku: 2,
  Upper: 3,
  Boundary: 4,
  Lower: 5,
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

const applyParticipantDefaults = (participant: TorikumiParticipant): void => {
  participant.kyujo = participant.kyujo ?? !participant.active;
  participant.facedIdsThisBasho = participant.facedIdsThisBasho ?? [];
  participant.torikumiTier = resolveTorikumiTier(participant);
  participant.yushoRaceTier = participant.yushoRaceTier ?? 'Outside';
  participant.survivalBubble = resolveSurvivalBubble(participant);
};

const resolveDivisionLeaderWins = (
  participants: TorikumiParticipant[],
): Map<TorikumiParticipant['division'], number> => {
  const leaderWins = new Map<TorikumiParticipant['division'], number>();
  for (const participant of participants) {
    const current = leaderWins.get(participant.division) ?? Number.NEGATIVE_INFINITY;
    if (participant.wins > current) leaderWins.set(participant.division, participant.wins);
  }
  return leaderWins;
};

const enrichParticipantsForDay = (
  participants: TorikumiParticipant[],
): TorikumiParticipant[] => {
  const leaderWins = resolveDivisionLeaderWins(participants);
  for (const participant of participants) {
    const leader = leaderWins.get(participant.division) ?? participant.wins;
    participant.torikumiTier = resolveTorikumiTier(participant);
    participant.yushoRaceTier = resolveYushoRaceTier(participant, leader);
    participant.survivalBubble = resolveSurvivalBubble(participant);
  }
  return participants;
};

const isAlreadyPaired = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): boolean => faced.get(a.id)?.has(b.id) ?? false;

const isForbiddenPair = (a: TorikumiParticipant, b: TorikumiParticipant): boolean =>
  (a.forbiddenOpponentIds?.includes(b.id) ?? false) ||
  (b.forbiddenOpponentIds?.includes(a.id) ?? false);

const hasBoundaryBand = (
  bandMap: Map<BoundaryId, BoundaryBandSpec>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): { boundaryId?: BoundaryId; spec?: BoundaryBandSpec } => {
  for (const [boundaryId, spec] of bandMap.entries()) {
    const upper = a.division === spec.upperDivision ? a : b.division === spec.upperDivision ? b : null;
    const lower = a.division === spec.lowerDivision ? a : b.division === spec.lowerDivision ? b : null;
    if (!upper || !lower) continue;
    const upperNumber = resolveRankNumber(upper);
    const lowerNumber = resolveRankNumber(lower);
    const upperNameOk = !spec.upperBand.rankName || upper.rankName === spec.upperBand.rankName;
    const lowerNameOk = !spec.lowerBand.rankName || lower.rankName === spec.lowerBand.rankName;
    if (!upperNameOk || !lowerNameOk) continue;
    if (upperNumber < spec.upperBand.minNumber || upperNumber > spec.upperBand.maxNumber) continue;
    if (lowerNumber < spec.lowerBand.minNumber || lowerNumber > spec.lowerBand.maxNumber) continue;
    return { boundaryId, spec };
  }
  return {};
};

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
  day: number,
): void => {
  faced.get(a.id)?.add(b.id);
  faced.get(b.id)?.add(a.id);
  if (!a.facedIdsThisBasho?.includes(b.id)) {
    a.facedIdsThisBasho?.push(b.id);
  }
  if (!b.facedIdsThisBasho?.includes(a.id)) {
    b.facedIdsThisBasho?.push(a.id);
  }
  a.lastBoutDay = day;
  b.lastBoutDay = day;
};

const isLatePhase = (day: number, participant: TorikumiParticipant): boolean =>
  day >= DEFAULT_TORIKUMI_LATE_EVAL_START_DAY ||
  (participant.division === 'Juryo' && resolveTorikumiTier(participant) === 'Boundary' && day >= 11) ||
  (isLowerDivision(participant.division) && participant.boutsDone >= Math.max(5, participant.targetBouts - 2));

const buildStages = (
  day: number,
  participant: TorikumiParticipant,
): PairStage[] => {
  const lower = isLowerDivision(participant.division);
  const late = isLatePhase(day, participant);
  const boundaryTier = resolveTorikumiTier(participant) === 'Boundary';
  if (lower) {
    if (boundaryTier && late) {
      return [
        { allowCrossDivision: true, enforceSameDivision: false, requireCrossDivision: true, maxRankDiff: 6, maxWinDiff: 2 },
        { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 12, maxWinDiff: 1 },
        { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 20, maxWinDiff: 2 },
        { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 40 },
        { allowCrossDivision: true, enforceSameDivision: false },
      ];
    }
    return [
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 12, maxWinDiff: 1 },
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 20, maxWinDiff: 2 },
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 40 },
      { allowCrossDivision: true, enforceSameDivision: false, maxRankDiff: 12, maxWinDiff: late ? 2 : 1 },
      { allowCrossDivision: true, enforceSameDivision: false },
    ];
  }
  if (participant.division === 'Juryo') {
    if (boundaryTier && late) {
      return [
        { allowCrossDivision: true, enforceSameDivision: false, requireCrossDivision: true, maxRankDiff: 4, maxWinDiff: 2 },
        { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 5, maxWinDiff: 1 },
        { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 8, maxWinDiff: 3 },
        { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 12 },
        { allowCrossDivision: true, enforceSameDivision: false },
      ];
    }
    return [
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: late ? 5 : 4, maxWinDiff: late ? 1 : 2 },
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 8, maxWinDiff: 3 },
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 12 },
      { allowCrossDivision: true, enforceSameDivision: false, maxRankDiff: 4, maxWinDiff: 2 },
      { allowCrossDivision: true, enforceSameDivision: false },
    ];
  }
  if (participant.rankName === '横綱' || participant.rankName === '大関') {
    return [
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: day <= 5 ? 6 : 9, maxWinDiff: late ? 2 : 3 },
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 12, maxWinDiff: 4 },
      { allowCrossDivision: false, enforceSameDivision: true },
      { allowCrossDivision: true, enforceSameDivision: false, maxRankDiff: 4, maxWinDiff: 2 },
      { allowCrossDivision: true, enforceSameDivision: false },
    ];
  }
  if (participant.rankName === '関脇' || participant.rankName === '小結') {
    return [
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: day <= 5 ? 8 : 10, maxWinDiff: late ? 2 : 3 },
      { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 14, maxWinDiff: 4 },
      { allowCrossDivision: false, enforceSameDivision: true },
      { allowCrossDivision: true, enforceSameDivision: false, maxRankDiff: 4, maxWinDiff: 2 },
      { allowCrossDivision: true, enforceSameDivision: false },
    ];
  }
  return [
    { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: day <= 5 ? 4 : 6, maxWinDiff: late ? 1 : 2 },
    { allowCrossDivision: false, enforceSameDivision: true, maxRankDiff: 8, maxWinDiff: 3 },
    { allowCrossDivision: false, enforceSameDivision: true },
    { allowCrossDivision: true, enforceSameDivision: false, maxRankDiff: 4, maxWinDiff: 2 },
    { allowCrossDivision: true, enforceSameDivision: false },
  ];
};

const resolveOrderKey = (participant: TorikumiParticipant, day: number): number => {
  const tier = resolveTorikumiTier(participant);
  const divisionPriority = DIVISION_PRIORITY[participant.division];
  const tierPriority = participant.division === 'Makuuchi'
    ? TIER_PRIORITY[tier]
    : divisionPriority * 10 + (tier === 'Boundary' ? 0 : 1);
  const late = isLatePhase(day, participant);
  const raceWeight = late && participant.yushoRaceTier === 'Leader'
    ? -2
    : late && participant.yushoRaceTier === 'Contender'
      ? -1
      : 0;
  const bubbleWeight = late && participant.survivalBubble ? -1 : 0;
  return (
    divisionPriority * 1000 +
    tierPriority * 100 +
    raceWeight * 10 +
    bubbleWeight * 5 +
    resolveRankNumber(participant)
  );
};

const rankMismatchPenalty = (
  participant: TorikumiParticipant,
  candidate: TorikumiParticipant,
  day: number,
): number => {
  const rankDiff = Math.abs(resolveRankNumber(participant) - resolveRankNumber(candidate));
  if (participant.rankName === '横綱' || participant.rankName === '大関') {
    if (day <= 5 && candidate.division === 'Makuuchi' && resolveRankNumber(candidate) >= 8) {
      return 70 + rankDiff * 4;
    }
    if (candidate.division === 'Juryo') return 160;
  }
  if (participant.rankName === '関脇' || participant.rankName === '小結') {
    if (day <= 5 && candidate.division === 'Makuuchi' && resolveRankNumber(candidate) >= 12) {
      return 38 + rankDiff * 3;
    }
    if (candidate.division === 'Juryo') return 120;
  }
  return rankDiff * (day <= 5 ? 6 : day <= 10 ? 4 : 3);
};

const matchReasonFor = (
  participant: TorikumiParticipant,
  candidate: TorikumiParticipant,
  crossDivision: boolean,
  late: boolean,
): TorikumiMatchReason => {
  if (crossDivision) return 'BOUNDARY_CROSSOVER';
  if (isUpperRankTier(participant)) return 'TOP_RANK_DUTY';
  if (late && participant.yushoRaceTier !== 'Outside' && candidate.yushoRaceTier !== 'Outside') {
    return 'YUSHO_RACE';
  }
  if (late && participant.survivalBubble && candidate.survivalBubble) {
    return 'SURVIVAL_BUBBLE';
  }
  if (Math.abs(participant.wins - candidate.wins) <= 1) return 'RECORD_NEARBY';
  if (Math.abs(resolveRankNumber(participant) - resolveRankNumber(candidate)) <= 3) return 'RANK_NEARBY';
  return 'FALLBACK';
};

const candidateScore = (
  participant: TorikumiParticipant,
  candidate: TorikumiParticipant,
  day: number,
  stageIndex: number,
  crossDivision: boolean,
): number => {
  const late = isLatePhase(day, participant) || isLatePhase(day, candidate);
  const rankDiff = Math.abs(resolveRankNumber(participant) - resolveRankNumber(candidate));
  const winDiff = Math.abs(participant.wins - candidate.wins);
  let score = stageIndex * 500;
  score += rankMismatchPenalty(participant, candidate, day);
  score += winDiff * (late ? 8 : 10);
  score += Math.abs(participant.losses - candidate.losses) * 4;
  score += Math.abs((participant.lastBoutDay ?? 0) - (candidate.lastBoutDay ?? 0));
  if (crossDivision) score += late ? 25 : 60;
  if (late && participant.yushoRaceTier !== 'Outside' && candidate.yushoRaceTier !== 'Outside') {
    score -= 48;
  }
  if (late && participant.survivalBubble && candidate.survivalBubble) {
    score -= 42;
  }
  if (participant.division === candidate.division && rankDiff <= 2) {
    score -= 16;
  }
  if (participant.division === candidate.division && winDiff === 0) {
    score -= late ? 12 : 4;
  }
  return score;
};

const isAllowedByStage = (
  stage: PairStage,
  bandMap: Map<BoundaryId, BoundaryBandSpec>,
  participant: TorikumiParticipant,
  candidate: TorikumiParticipant,
): { allowed: boolean; crossDivision: boolean; boundaryId?: BoundaryId } => {
  if (participant.division !== candidate.division) {
    if (stage.enforceSameDivision || !stage.allowCrossDivision) return { allowed: false, crossDivision: false };
    const boundary = hasBoundaryBand(bandMap, participant, candidate);
    if (!boundary.boundaryId) return { allowed: false, crossDivision: false };
    return { allowed: true, crossDivision: true, boundaryId: boundary.boundaryId };
  }
  if (stage.requireCrossDivision) {
    return { allowed: false, crossDivision: false };
  }

  const rankDiff = Math.abs(resolveRankNumber(participant) - resolveRankNumber(candidate));
  const winDiff = Math.abs(participant.wins - candidate.wins);
  if (typeof stage.maxRankDiff === 'number' && rankDiff > stage.maxRankDiff) {
    return { allowed: false, crossDivision: false };
  }
  if (typeof stage.maxWinDiff === 'number' && winDiff > stage.maxWinDiff) {
    return { allowed: false, crossDivision: false };
  }
  return { allowed: true, crossDivision: false };
};

const selectOpponent = (
  participant: TorikumiParticipant,
  pool: TorikumiParticipant[],
  scheduledIds: Set<string>,
  faced: Map<string, Set<string>>,
  day: number,
  bandMap: Map<BoundaryId, BoundaryBandSpec>,
): { opponent?: TorikumiParticipant; pair?: TorikumiPair } => {
  const stages = buildStages(day, participant);
  for (let stageIndex = 0; stageIndex < stages.length; stageIndex += 1) {
    const stage = stages[stageIndex];
    let best: { candidate: TorikumiParticipant; score: number; boundaryId?: BoundaryId; crossDivision: boolean } | null = null;
    for (const candidate of pool) {
      if (scheduledIds.has(candidate.id) || candidate.id === participant.id) continue;
      if (!isValidPair(faced, participant, candidate)) continue;
      const allowed = isAllowedByStage(stage, bandMap, participant, candidate);
      if (!allowed.allowed) continue;
      const score = candidateScore(participant, candidate, day, stageIndex, allowed.crossDivision);
      if (!best || score < best.score) {
        best = {
          candidate,
          score,
          boundaryId: allowed.boundaryId,
          crossDivision: allowed.crossDivision,
        };
      }
    }
    if (best) {
      return {
        opponent: best.candidate,
        pair: {
          a: participant,
          b: best.candidate,
          boundaryId: best.boundaryId,
          activationReasons: best.boundaryId ? ['SHORTAGE', isLatePhase(day, participant) ? 'LATE_EVAL' : 'SCORE_ALIGNMENT'] : [],
          matchReason: matchReasonFor(participant, best.candidate, best.crossDivision, isLatePhase(day, participant)),
          relaxationStage: stageIndex,
          crossDivision: best.crossDivision,
        },
      };
    }
  }
  return {};
};

const compareOrderedParticipants = (left: OrderedParticipant, right: OrderedParticipant): number => {
  if (left.orderKey !== right.orderKey) return left.orderKey - right.orderKey;
  if (left.participant.rankScore !== right.participant.rankScore) {
    return left.participant.rankScore - right.participant.rankScore;
  }
  return left.participant.id.localeCompare(right.participant.id);
};

export const scheduleTorikumiBasho = (
  params: ScheduleTorikumiBashoParams,
): TorikumiBashoResult => {
  const participants = params.participants;
  for (const participant of participants) {
    applyParticipantDefaults(participant);
  }
  const faced = ensureFacedMap(participants, params.facedMap);
  const days = params.days.slice().sort((a, b) => a - b);
  const canFightOnDay =
    params.dayEligibility ??
    ((_participant: TorikumiParticipant, day: number): boolean => day >= 1 && day <= 15);
  const bandMap = buildBoundaryBandMap(params.boundaryBands);

  const boundaryActivations: TorikumiBashoResult['diagnostics']['boundaryActivations'] = [];
  const torikumiRelaxationHistogram: Record<string, number> = {};
  const dayResults: TorikumiBashoResult['days'] = [];
  let crossDivisionBoutCount = 0;
  let lateCrossDivisionBoutCount = 0;
  let sameStableViolationCount = 0;
  let sameCardViolationCount = 0;

  for (const day of days) {
    const eligible = enrichParticipantsForDay(
      participants.filter(
        (participant) =>
          participant.active &&
          !participant.kyujo &&
          participant.boutsDone < participant.targetBouts &&
          canFightOnDay(participant, day),
      ),
    );
    const ordered = eligible
      .map((participant) => ({
        participant,
        orderKey: resolveOrderKey(participant, day),
      }))
      .sort(compareOrderedParticipants);

    const scheduledIds = new Set<string>();
    const dayPairs: TorikumiPair[] = [];

    for (const { participant } of ordered) {
      if (scheduledIds.has(participant.id)) continue;
      const selected = selectOpponent(participant, eligible, scheduledIds, faced, day, bandMap);
      if (!selected.opponent || !selected.pair) continue;
      const opponent = selected.opponent;
      const pair = selected.pair;

      scheduledIds.add(participant.id);
      scheduledIds.add(opponent.id);
      markPaired(faced, participant, opponent, day);
      participant.boutsDone += 1;
      opponent.boutsDone += 1;
      if (pair.crossDivision) {
        crossDivisionBoutCount += 1;
        if (day >= DEFAULT_TORIKUMI_LATE_EVAL_START_DAY) lateCrossDivisionBoutCount += 1;
      }
      if (participant.stableId === opponent.stableId) sameStableViolationCount += 1;
      if (isAlreadyPaired(faced, participant, opponent)) {
        // markPaired already added the pair, so repeated presence here signals a same-card violation before scheduling.
        const facedCountA = participant.facedIdsThisBasho?.filter((id) => id === opponent.id).length ?? 0;
        if (facedCountA > 1) sameCardViolationCount += 1;
      }
      const stageKey = String(pair.relaxationStage);
      torikumiRelaxationHistogram[stageKey] = (torikumiRelaxationHistogram[stageKey] ?? 0) + 1;
      if (pair.boundaryId) {
        const existing = boundaryActivations.find(
          (activation) => activation.day === day && activation.boundaryId === pair.boundaryId,
        );
        if (existing) {
          existing.pairCount += 1;
        } else {
          boundaryActivations.push({
            day,
            boundaryId: pair.boundaryId,
            reasons: pair.activationReasons,
            pairCount: 1,
          });
        }
      }
      dayPairs.push(pair);
      params.onPair?.(pair, day);
    }

    const byeIds: string[] = [];
    for (const participant of eligible) {
      if (scheduledIds.has(participant.id)) continue;
      byeIds.push(participant.id);
      participant.lastBoutDay = day;
      params.onBye?.(participant, day);
    }

    dayResults.push({
      day,
      pairs: dayPairs,
      byeIds,
    });
  }

  const remainingTargetById: Record<string, number> = {};
  const unscheduledById: Record<string, number> = {};
  for (const participant of participants) {
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
      torikumiRelaxationHistogram,
      crossDivisionBoutCount,
      lateCrossDivisionBoutCount,
      sameStableViolationCount,
      sameCardViolationCount,
    },
  };
};
