import {
  buildBoundaryBandMap,
  DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
  isLowerDivision,
  resolveRankNumber,
  resolveSurvivalBubble,
  resolveTorikumiTier,
  resolveYushoRaceTier,
} from '../policy';
import {
  BoundaryActivationReason,
  BoundaryBandSpec,
  BoundaryId,
  ScheduleTorikumiBashoParams,
  TorikumiBashoResult,
  TorikumiBoundaryImplication,
  TorikumiContentionTier,
  TorikumiMatchReason,
  TorikumiPair,
  TorikumiParticipant,
  TorikumiTitleImplication,
} from '../types';

type ObligationReason =
  | 'SANYAKU_ROUND_ROBIN'
  | 'JOI_ASSIGNMENT'
  | 'JURYO_PROMOTION_RACE'
  | 'JURYO_DEMOTION_RACE';

type Obligation = {
  id: string;
  pairKey: string;
  reason: ObligationReason;
};

type PairEval = {
  score: number;
  matchReason: TorikumiMatchReason;
  boundaryId?: BoundaryId;
  activationReasons: BoundaryActivationReason[];
  crossDivision: boolean;
  phaseId?: string;
  roundIndex?: number;
  obligationId?: string;
  contentionTier: TorikumiContentionTier;
  titleImplication: TorikumiTitleImplication;
  boundaryImplication: TorikumiBoundaryImplication;
};

type MatchAttempt = {
  pairs: TorikumiPair[];
  leftoverIds: string[];
  totalScore: number;
  repairDepth: number;
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

const canonicalPairKey = (aId: string, bId: string): string =>
  [aId, bId].sort().join(':');

const cloneFacedMap = (
  faced: Map<string, Set<string>>,
): Map<string, Set<string>> =>
  new Map([...faced.entries()].map(([id, ids]) => [id, new Set(ids)]));

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

const markFaced = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): void => {
  faced.get(a.id)?.add(b.id);
  faced.get(b.id)?.add(a.id);
};

const applyParticipantDefaults = (participant: TorikumiParticipant): void => {
  participant.kyujo = participant.kyujo ?? !participant.active;
  participant.facedIdsThisBasho = participant.facedIdsThisBasho ?? [];
  participant.torikumiTier = resolveTorikumiTier(participant);
  participant.rankSide = participant.rankSide ?? (participant.rankScore % 2 === 1 ? 'East' : 'West');
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

const resolveMakuuchiBand = (participant: TorikumiParticipant): string => {
  if (participant.division !== 'Makuuchi') return 'OTHER';
  if (participant.rankName === '横綱' || participant.rankName === '大関' || participant.rankName === '関脇' || participant.rankName === '小結') {
    return 'SANYAKU';
  }
  const rankNumber = resolveRankNumber(participant);
  if (rankNumber <= 4) return 'JOI_A';
  if (rankNumber <= 8) return 'JOI_B';
  return 'TAIL';
};

const resolveJuryoBand = (participant: TorikumiParticipant): string => {
  if (participant.division !== 'Juryo') return 'OTHER';
  const rankNumber = resolveRankNumber(participant);
  if (rankNumber <= 5) return 'PROMO';
  if (rankNumber >= 12) return 'DROP';
  return 'MID';
};

const buildObligations = (
  participants: TorikumiParticipant[],
): {
  byPairKey: Map<string, Obligation>;
  coverage: Record<string, { scheduled: number; total: number }>;
} => {
  const byPairKey = new Map<string, Obligation>();
  const coverage: Record<string, { scheduled: number; total: number }> = {
    SANYAKU_ROUND_ROBIN: { scheduled: 0, total: 0 },
    JOI_ASSIGNMENT: { scheduled: 0, total: 0 },
    JURYO_PROMOTION_RACE: { scheduled: 0, total: 0 },
    JURYO_DEMOTION_RACE: { scheduled: 0, total: 0 },
  };
  const add = (a: TorikumiParticipant, b: TorikumiParticipant, reason: ObligationReason): void => {
    const pairKey = canonicalPairKey(a.id, b.id);
    if (byPairKey.has(pairKey)) return;
    const id = `${reason}:${pairKey}`;
    byPairKey.set(pairKey, { id, pairKey, reason });
    coverage[reason].total += 1;
  };

  const makuuchi = participants.filter((participant) => participant.division === 'Makuuchi');
  for (let index = 0; index < makuuchi.length; index += 1) {
    for (let inner = index + 1; inner < makuuchi.length; inner += 1) {
      const a = makuuchi[index];
      const b = makuuchi[inner];
      const aBand = resolveMakuuchiBand(a);
      const bBand = resolveMakuuchiBand(b);
      if (aBand === 'SANYAKU' && bBand === 'SANYAKU') {
        add(a, b, 'SANYAKU_ROUND_ROBIN');
      } else if (
        (aBand === 'SANYAKU' && bBand === 'JOI_A') ||
        (bBand === 'SANYAKU' && aBand === 'JOI_A')
      ) {
        add(a, b, 'JOI_ASSIGNMENT');
      }
    }
  }

  const juryo = participants.filter((participant) => participant.division === 'Juryo');
  for (let index = 0; index < juryo.length; index += 1) {
    for (let inner = index + 1; inner < juryo.length; inner += 1) {
      const a = juryo[index];
      const b = juryo[inner];
      const aBand = resolveJuryoBand(a);
      const bBand = resolveJuryoBand(b);
      if (aBand === 'PROMO' && bBand === 'PROMO') add(a, b, 'JURYO_PROMOTION_RACE');
      if (aBand === 'DROP' && bBand === 'DROP') add(a, b, 'JURYO_DEMOTION_RACE');
    }
  }

  return { byPairKey, coverage };
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
    participant.promotionRaceTier =
      participant.division === 'Makushita' && resolveRankNumber(participant) <= 5
        ? participant.wins >= 6
          ? 'Lead'
          : participant.wins >= 4
            ? 'Candidate'
            : 'Outside'
        : participant.division === 'Juryo' && resolveJuryoBand(participant) === 'PROMO'
          ? participant.wins >= 10
            ? 'Lead'
            : participant.wins >= 8
              ? 'Candidate'
              : 'Outside'
          : 'Outside';
    participant.demotionRaceTier =
      participant.division === 'Juryo' && resolveJuryoBand(participant) === 'DROP'
        ? participant.wins <= 5
          ? 'Critical'
          : participant.wins <= 7
            ? 'Bubble'
            : 'Safe'
        : 'Safe';
    participant.schedulePool =
      participant.division === 'Makuuchi'
        ? resolveMakuuchiBand(participant)
        : participant.division === 'Juryo'
          ? resolveJuryoBand(participant)
          : participant.division;
  }
  return participants;
};

const isForbiddenPair = (a: TorikumiParticipant, b: TorikumiParticipant): boolean =>
  (a.forbiddenOpponentIds?.includes(b.id) ?? false) ||
  (b.forbiddenOpponentIds?.includes(a.id) ?? false);

const isLegalPair = (
  faced: Map<string, Set<string>>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): boolean =>
  a.id !== b.id &&
  a.stableId !== b.stableId &&
  !faced.get(a.id)?.has(b.id) &&
  !isForbiddenPair(a, b);

const hasBoundaryBand = (
  bandMap: Map<BoundaryId, BoundaryBandSpec>,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): { boundaryId?: BoundaryId } => {
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
    return { boundaryId };
  }
  return {};
};

const resolveTopPhase = (day: number): string =>
  day <= 4 ? 'EARLY' : day <= 8 ? 'MID_A' : day <= 12 ? 'MID_B' : 'LATE';

const resolveLowerRoundIndex = (a: TorikumiParticipant, b: TorikumiParticipant): number =>
  Math.max(a.boutsDone, b.boutsDone) + 1;

const resolveLowerPhase = (roundIndex: number): string =>
  roundIndex <= 3 ? 'ROUND_EARLY' : roundIndex <= 5 ? 'ROUND_SCORE' : 'ROUND_LATE';

const resolveTitleImplication = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  day: number,
): { titleImplication: TorikumiTitleImplication; contentionTier: TorikumiContentionTier } => {
  if (day < DEFAULT_TORIKUMI_LATE_EVAL_START_DAY || a.division !== b.division) {
    return { titleImplication: 'NONE', contentionTier: 'Outside' };
  }
  const threshold = a.targetBouts >= 15 ? 9 : 4;
  if (Math.max(a.wins, b.wins) < threshold) {
    return { titleImplication: 'NONE', contentionTier: 'Outside' };
  }
  const aTier = a.yushoRaceTier ?? 'Outside';
  const bTier = b.yushoRaceTier ?? 'Outside';
  if (aTier === 'Outside' && bTier === 'Outside') {
    return { titleImplication: 'NONE', contentionTier: 'Outside' };
  }
  if ((aTier === 'Leader' || aTier === 'Contender') && (bTier === 'Leader' || bTier === 'Contender')) {
    return {
      titleImplication: Math.abs(a.wins - b.wins) <= 1 ? 'DIRECT' : 'CHASE',
      contentionTier: aTier === 'Leader' || bTier === 'Leader' ? 'Leader' : 'Contender',
    };
  }
  return { titleImplication: 'CHASE', contentionTier: 'Contender' };
};

const isJuryoMakushitaExchangeCandidate = (
  juryo: TorikumiParticipant,
  makushita: TorikumiParticipant,
): boolean =>
  resolveJuryoBand(juryo) === 'DROP' &&
  resolveRankNumber(juryo) <= 14 &&
  juryo.wins <= 8 &&
  makushita.division === 'Makushita' &&
  resolveRankNumber(makushita) <= 5 &&
  makushita.wins >= 4;

const resolveSchedulingPriority = (participant: TorikumiParticipant, day: number, repair = false): number => {
  const tier = resolveTorikumiTier(participant);
  const divisionPriority = DIVISION_PRIORITY[participant.division];
  const late = day >= DEFAULT_TORIKUMI_LATE_EVAL_START_DAY;
  const yushoBias =
    late && participant.yushoRaceTier === 'Leader'
      ? -40
      : late && participant.yushoRaceTier === 'Contender'
        ? -20
        : 0;
  const repairBias = repair ? participant.wins * -5 : 0;
  return (
    divisionPriority * 1000 +
    TIER_PRIORITY[tier] * 100 +
    yushoBias +
    repairBias +
    resolveRankNumber(participant)
  );
};

const toPair = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  evalResult: PairEval,
  repairDepth: number,
): TorikumiPair => ({
  a,
  b,
  boundaryId: evalResult.boundaryId,
  activationReasons: evalResult.activationReasons,
  matchReason: evalResult.matchReason,
  relaxationStage: repairDepth,
  crossDivision: evalResult.crossDivision,
  phaseId: evalResult.phaseId,
  roundIndex: evalResult.roundIndex,
  obligationId: evalResult.obligationId,
  repairDepth,
  contentionTier: evalResult.contentionTier,
  titleImplication: evalResult.titleImplication,
  boundaryImplication: evalResult.boundaryImplication,
});

const evaluateMakuuchiPair = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  day: number,
  obligations: Map<string, Obligation>,
): PairEval | null => {
  if (a.division !== 'Makuuchi' || b.division !== 'Makuuchi') return null;
  const phaseId = resolveTopPhase(day);
  const rankDiff = Math.abs(resolveRankNumber(a) - resolveRankNumber(b));
  const winDiff = Math.abs(a.wins - b.wins);
  const title = resolveTitleImplication(a, b, day);
  const obligation = obligations.get(canonicalPairKey(a.id, b.id));
  let score = rankDiff * 10 + winDiff * (phaseId === 'LATE' ? 10 : 13) + Math.abs(a.losses - b.losses) * 3;
  if (obligation?.reason === 'SANYAKU_ROUND_ROBIN') score -= 360;
  if (obligation?.reason === 'JOI_ASSIGNMENT') score -= phaseId === 'EARLY' ? 300 : phaseId === 'MID_A' ? 220 : 140;
  if (title.titleImplication === 'DIRECT') score -= 420;
  if (title.titleImplication === 'CHASE') score -= 260;
  if (
    phaseId === 'EARLY' &&
    (resolveMakuuchiBand(a) === 'SANYAKU' || resolveMakuuchiBand(b) === 'SANYAKU') &&
    (resolveMakuuchiBand(a) === 'TAIL' || resolveMakuuchiBand(b) === 'TAIL')
  ) {
    score += 240;
  }
  let matchReason: TorikumiMatchReason = 'RANK_NEARBY';
  if (title.titleImplication === 'DIRECT') matchReason = 'YUSHO_DIRECT';
  else if (title.titleImplication === 'CHASE') matchReason = 'YUSHO_PURSUIT';
  else if (obligation?.reason === 'SANYAKU_ROUND_ROBIN') matchReason = 'SANYAKU_ROUND_ROBIN';
  else if (obligation?.reason === 'JOI_ASSIGNMENT') matchReason = 'JOI_ASSIGNMENT';
  else if (winDiff <= 1) matchReason = 'RECORD_NEARBY';
  return {
    score,
    matchReason,
    activationReasons: [],
    crossDivision: false,
    phaseId,
    obligationId: obligation?.id,
    contentionTier: title.contentionTier,
    titleImplication: title.titleImplication,
    boundaryImplication: 'NONE',
  };
};

const evaluateJuryoPair = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  day: number,
  obligations: Map<string, Obligation>,
  bandMap: Map<BoundaryId, BoundaryBandSpec>,
  crossDivisionById: Map<string, number>,
): PairEval | null => {
  const title = resolveTitleImplication(a, b, day);
  if (a.division === 'Juryo' && b.division === 'Juryo') {
    const obligation = obligations.get(canonicalPairKey(a.id, b.id));
    const rankDiff = Math.abs(resolveRankNumber(a) - resolveRankNumber(b));
    const winDiff = Math.abs(a.wins - b.wins);
    let score = rankDiff * 8 + winDiff * (day >= 13 ? 8 : 10);
    if (day < 15 && title.titleImplication === 'DIRECT') score -= 340;
    if (day < 15 && title.titleImplication === 'CHASE') score -= 220;
    if (obligation?.reason === 'JURYO_PROMOTION_RACE') score -= day === 15 ? 250 : 180;
    if (obligation?.reason === 'JURYO_DEMOTION_RACE') score -= day === 15 ? 300 : 220;
    let matchReason: TorikumiMatchReason = 'RANK_NEARBY';
    if (day < 15 && title.titleImplication === 'DIRECT') matchReason = 'YUSHO_DIRECT';
    else if (day < 15 && title.titleImplication === 'CHASE') matchReason = 'YUSHO_PURSUIT';
    else if (obligation?.reason === 'JURYO_PROMOTION_RACE') matchReason = 'JURYO_PROMOTION_RACE';
    else if (obligation?.reason === 'JURYO_DEMOTION_RACE') matchReason = 'JURYO_DEMOTION_RACE';
    else if (winDiff <= 1) matchReason = 'RECORD_NEARBY';
    return {
      score,
      matchReason,
      activationReasons: [],
      crossDivision: false,
      phaseId: resolveTopPhase(day),
      obligationId: obligation?.id,
      contentionTier: title.contentionTier,
      titleImplication: day < 15 ? title.titleImplication : 'NONE',
      boundaryImplication:
        obligation?.reason === 'JURYO_DEMOTION_RACE'
          ? 'DEMOTION'
          : obligation?.reason === 'JURYO_PROMOTION_RACE'
            ? 'PROMOTION'
            : 'NONE',
    };
  }
  const juryo = a.division === 'Juryo' ? a : b.division === 'Juryo' ? b : null;
  const makushita = a.division === 'Makushita' ? a : b.division === 'Makushita' ? b : null;
  if (!juryo || !makushita || day < 12) return null;
  if ((crossDivisionById.get(juryo.id) ?? 0) >= 1 || (crossDivisionById.get(makushita.id) ?? 0) >= 1) {
    return null;
  }
  if (!isJuryoMakushitaExchangeCandidate(juryo, makushita)) return null;
  const boundary = hasBoundaryBand(bandMap, a, b);
  if (boundary.boundaryId !== 'JuryoMakushita') return null;
  return {
    score:
      (day === 15 ? -380 : day >= 14 ? -340 : -300) +
      Math.abs(juryo.wins - makushita.wins) * 8 +
      Math.abs(resolveRankNumber(juryo) - resolveRankNumber(makushita)) * 4,
    matchReason: 'JURYO_MAKUSHITA_EXCHANGE',
    boundaryId: 'JuryoMakushita',
    activationReasons: ['LATE_EVAL', 'SCORE_ALIGNMENT'],
    crossDivision: true,
    phaseId: resolveTopPhase(day),
    contentionTier: 'Outside',
    titleImplication: 'NONE',
    boundaryImplication: 'PROMOTION',
  };
};

const evaluateLowerPair = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  bandMap: Map<BoundaryId, BoundaryBandSpec>,
): PairEval | null => {
  const roundIndex = resolveLowerRoundIndex(a, b);
  if (a.division === b.division && isLowerDivision(a.division)) {
    const rankDiff = Math.abs(resolveRankNumber(a) - resolveRankNumber(b));
    const winDiff = Math.abs(a.wins - b.wins);
    let score = rankDiff * 7 + winDiff * 10;
    let matchReason: TorikumiMatchReason = 'RANK_NEARBY';
    if (roundIndex <= 3) {
      score += winDiff * 6;
    } else if (roundIndex <= 5) {
      score -= Math.max(0, 80 - winDiff * 24);
      matchReason = 'LOWER_SCORE_GROUP';
    } else {
      score -= Math.max(0, 60 - winDiff * 18);
      matchReason = winDiff <= 1 ? 'LOWER_SCORE_GROUP' : 'RECORD_NEARBY';
    }
    return {
      score,
      matchReason,
      activationReasons: [],
      crossDivision: false,
      phaseId: resolveLowerPhase(roundIndex),
      roundIndex,
      contentionTier: 'Outside',
      titleImplication: 'NONE',
      boundaryImplication: 'NONE',
    };
  }
  if (!isLowerDivision(a.division) || !isLowerDivision(b.division) || roundIndex < 7) return null;
  const boundary = hasBoundaryBand(bandMap, a, b);
  if (!boundary.boundaryId || boundary.boundaryId === 'JuryoMakushita' || boundary.boundaryId === 'MakuuchiJuryo') {
    return null;
  }
  return {
    score: Math.abs(a.wins - b.wins) * 7 + Math.abs(resolveRankNumber(a) - resolveRankNumber(b)) * 4,
    matchReason: 'LOWER_BOUNDARY_EVAL',
    boundaryId: boundary.boundaryId,
    activationReasons: ['LATE_EVAL', 'SCORE_ALIGNMENT'],
    crossDivision: true,
    phaseId: resolveLowerPhase(roundIndex),
    roundIndex,
    contentionTier: 'Outside',
    titleImplication: 'NONE',
    boundaryImplication: 'PROMOTION',
  };
};

const buildAttempt = (
  pool: TorikumiParticipant[],
  faced: Map<string, Set<string>>,
  repairDepth: number,
  orderKey: (participant: TorikumiParticipant) => number,
  evaluate: (a: TorikumiParticipant, b: TorikumiParticipant) => PairEval | null,
): MatchAttempt => {
  const tempFaced = cloneFacedMap(faced);
  const scheduledIds = new Set<string>();
  const pairs: TorikumiPair[] = [];
  let totalScore = 0;
  const ordered = pool.slice().sort((left, right) => {
    const keyDiff = orderKey(left) - orderKey(right);
    if (keyDiff !== 0) return keyDiff;
    return left.id.localeCompare(right.id);
  });
  for (const participant of ordered) {
    if (scheduledIds.has(participant.id)) continue;
    let best: { opponent: TorikumiParticipant; evalResult: PairEval } | null = null;
    for (const candidate of ordered) {
      if (scheduledIds.has(candidate.id) || participant.id === candidate.id) continue;
      if (!isLegalPair(tempFaced, participant, candidate)) continue;
      const evalResult = evaluate(participant, candidate);
      if (!evalResult) continue;
      if (!best || evalResult.score < best.evalResult.score) {
        best = { opponent: candidate, evalResult };
      }
    }
    if (!best) continue;
    scheduledIds.add(participant.id);
    scheduledIds.add(best.opponent.id);
    markFaced(tempFaced, participant, best.opponent);
    pairs.push(toPair(participant, best.opponent, best.evalResult, repairDepth));
    totalScore += best.evalResult.score;
  }
  return {
    pairs,
    totalScore,
    repairDepth,
    leftoverIds: pool.filter((participant) => !scheduledIds.has(participant.id)).map((participant) => participant.id),
  };
};

const chooseAttempt = (primary: MatchAttempt, repair: MatchAttempt): MatchAttempt => {
  if (repair.leftoverIds.length < primary.leftoverIds.length) return repair;
  if (repair.leftoverIds.length === primary.leftoverIds.length && repair.totalScore < primary.totalScore) {
    return repair;
  }
  return primary;
};

export const scheduleTorikumiBasho = (
  params: ScheduleTorikumiBashoParams,
): TorikumiBashoResult => {
  const participants = params.participants;
  for (const participant of participants) applyParticipantDefaults(participant);
  const faced = ensureFacedMap(participants, params.facedMap);
  const days = params.days.slice().sort((left, right) => left - right);
  const canFightOnDay = params.dayEligibility ?? (() => true);
  const bandMap = buildBoundaryBandMap(params.boundaryBands);
  const obligations = buildObligations(participants);
  const crossDivisionById = new Map<string, number>(participants.map((participant) => [participant.id, 0]));

  const dayResults: TorikumiBashoResult['days'] = [];
  const boundaryActivations: TorikumiBashoResult['diagnostics']['boundaryActivations'] = [];
  const torikumiRelaxationHistogram: Record<string, number> = {};
  const repairHistogram: Record<string, number> = {};
  const crossDivisionByBoundary: Record<string, number> = {};
  const scheduleViolations: TorikumiBashoResult['diagnostics']['scheduleViolations'] = [];
  let crossDivisionBoutCount = 0;
  let lateCrossDivisionBoutCount = 0;
  let lateDirectTitleBoutCount = 0;

  for (const day of days) {
    const eligible = enrichParticipantsForDay(
      participants.filter((participant) =>
        participant.active &&
        !participant.kyujo &&
        participant.boutsDone < participant.targetBouts &&
        canFightOnDay(participant, day)),
    );
    const scheduledIds = new Set<string>();
    const dayPairs: TorikumiPair[] = [];

    const schedulePool = (
      pool: TorikumiParticipant[],
      evaluate: (a: TorikumiParticipant, b: TorikumiParticipant) => PairEval | null,
    ): void => {
      const available = pool.filter((participant) => !scheduledIds.has(participant.id));
      if (available.length < 2) return;
      const primary = buildAttempt(
        available,
        faced,
        0,
        (participant) => resolveSchedulingPriority(participant, day, false),
        evaluate,
      );
      const repair = buildAttempt(
        available,
        faced,
        1,
        (participant) => resolveSchedulingPriority(participant, day, true),
        evaluate,
      );
      const chosen = chooseAttempt(primary, repair);
      for (const pair of chosen.pairs) {
        scheduledIds.add(pair.a.id);
        scheduledIds.add(pair.b.id);
        dayPairs.push(pair);
      }
    };

    schedulePool(
      eligible.filter((participant) => participant.division === 'Makuuchi'),
      (a, b) => evaluateMakuuchiPair(a, b, day, obligations.byPairKey),
    );
    schedulePool(
      eligible.filter((participant) =>
        participant.division === 'Juryo' ||
        (participant.division === 'Makushita' && resolveRankNumber(participant) <= 5)),
      (a, b) => evaluateJuryoPair(a, b, day, obligations.byPairKey, bandMap, crossDivisionById),
    );
    schedulePool(
      eligible.filter((participant) => isLowerDivision(participant.division)),
      (a, b) => evaluateLowerPair(a, b, bandMap),
    );

    for (const pair of dayPairs) {
      markFaced(faced, pair.a, pair.b);
      pair.a.boutsDone += 1;
      pair.b.boutsDone += 1;
      pair.a.lastBoutDay = day;
      pair.b.lastBoutDay = day;
      if (!pair.a.facedIdsThisBasho?.includes(pair.b.id)) pair.a.facedIdsThisBasho?.push(pair.b.id);
      if (!pair.b.facedIdsThisBasho?.includes(pair.a.id)) pair.b.facedIdsThisBasho?.push(pair.a.id);
      if (pair.crossDivision) {
        crossDivisionBoutCount += 1;
        crossDivisionById.set(pair.a.id, (crossDivisionById.get(pair.a.id) ?? 0) + 1);
        crossDivisionById.set(pair.b.id, (crossDivisionById.get(pair.b.id) ?? 0) + 1);
        if (day >= DEFAULT_TORIKUMI_LATE_EVAL_START_DAY) lateCrossDivisionBoutCount += 1;
        if (pair.boundaryId) {
          crossDivisionByBoundary[pair.boundaryId] = (crossDivisionByBoundary[pair.boundaryId] ?? 0) + 1;
        }
      }
      if (pair.titleImplication === 'DIRECT' && day >= DEFAULT_TORIKUMI_LATE_EVAL_START_DAY) {
        lateDirectTitleBoutCount += 1;
      }
      const relaxKey = String(pair.relaxationStage);
      torikumiRelaxationHistogram[relaxKey] = (torikumiRelaxationHistogram[relaxKey] ?? 0) + 1;
      const repairKey = String(pair.repairDepth);
      repairHistogram[repairKey] = (repairHistogram[repairKey] ?? 0) + 1;
      if (pair.boundaryId) {
        const activation = boundaryActivations.find(
          (entry) => entry.day === day && entry.boundaryId === pair.boundaryId,
        );
        if (activation) {
          activation.pairCount += 1;
        } else {
          boundaryActivations.push({
            day,
            boundaryId: pair.boundaryId,
            reasons: pair.activationReasons,
            pairCount: 1,
          });
        }
      }
      if (pair.obligationId) {
        const [reason] = pair.obligationId.split(':');
        if (obligations.coverage[reason]) obligations.coverage[reason].scheduled += 1;
      }
    }

    for (const pair of dayPairs) {
      params.onPair?.(pair, day);
    }

    const leftoverIds = eligible
      .filter((participant) => !scheduledIds.has(participant.id))
      .map((participant) => participant.id);
    if (leftoverIds.length > 0) {
      scheduleViolations.push({
        day,
        participantIds: leftoverIds,
        reason: 'UNRESOLVED_LEFTOVER',
      });
    }

    dayResults.push({ day, pairs: dayPairs, byeIds: [] });
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
      sameStableViolationCount: 0,
      sameCardViolationCount: 0,
      scheduleViolations,
      repairHistogram,
      obligationCoverage: obligations.coverage,
      crossDivisionByBoundary,
      lateDirectTitleBoutCount,
    },
  };
};
