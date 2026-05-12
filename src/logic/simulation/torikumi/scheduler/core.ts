import {
  buildBoundaryBandMap,
  DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
  isLowerDivision,
  resolveRankNumber,
  resolveSurvivalBubble,
  resolveTorikumiTier,
  resolveYushoRaceTier,
} from '../policy';
import { pairWithinDivision } from './intraDivision';
import {
  BoundaryActivationReason,
  BoundaryBandSpec,
  BoundaryId,
  ScheduleTorikumiBashoParams,
  TorikumiBashoResult,
  TorikumiBoundaryContext,
  TorikumiBoundaryImplication,
  TorikumiContentionTier,
  TorikumiFusenReason,
  TorikumiMatchReason,
  TorikumiPair,
  TorikumiParticipant,
  TorikumiTitleImplication,
} from '../types';

/**
 * boundaryContext から JuryoMakushita 境界取組の day threshold / score multiplier /
 * 候補プール rank 上限を導出。
 *
 * - effectiveIntensity 未指定 → legacy 動作 (threshold=12, multiplier=1.0, makushitaMaxRank=5)
 * - <0.05 → 完全 disable (era 側で「無かった」扱いを尊重)
 * - 高境界圧 → day を 1 早め、score を強化、Makushita 側の候補帯を 6 まで拡張
 * - 低境界圧 → day を 1 遅らせ、Makushita 側を 4 まで縮小
 *
 * Makushita 側のみ拡縮し、Juryo 側 (DROP band 12-14) は据え置く。
 * これは「幕下上位の押し上げ圧」を era 構造で表現するためで、
 * 十両下位の入替候補は実史的に常に下 3 枚帯に固定されているため。
 */
const resolveJuryoMakushitaBoundaryParams = (
  ctx: TorikumiBoundaryContext | undefined,
): {
  dayThreshold: number;
  scoreMultiplier: number;
  makushitaMaxRank: number;
  disabled: boolean;
} => {
  const intensity = ctx?.effectiveIntensity;
  if (intensity == null) {
    return { dayThreshold: 12, scoreMultiplier: 1.0, makushitaMaxRank: 5, disabled: false };
  }
  if (intensity < 0.05) {
    return { dayThreshold: 12, scoreMultiplier: 0, makushitaMaxRank: 5, disabled: true };
  }
  const dayThreshold = Math.max(11, Math.min(13, Math.round(13 - intensity)));
  const scoreMultiplier = Math.max(0.5, Math.min(1.5, intensity));
  const makushitaMaxRank =
    intensity >= 1.2 ? 7 : intensity >= 1.0 ? 6 : intensity >= 0.7 ? 5 : 4;
  return { dayThreshold, scoreMultiplier, makushitaMaxRank, disabled: false };
};

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
  repairAttempts: number;
  repairSuccessCount: number;
};

type CandidateLink = {
  opponent: TorikumiParticipant;
  evalResult: PairEval;
};

type PairGraph = {
  byId: Map<string, CandidateLink[]>;
  evalByPairKey: Map<string, PairEval>;
};

type NeighborhoodResult = {
  pairKeys: string[];
  scheduledCount: number;
  totalScore: number;
};

const LOCAL_REPAIR_CANDIDATE_LIMIT = 6;
const LOCAL_REPAIR_NEIGHBORHOOD_LIMIT = 12;
const DIVISION_PRIORITY: Record<TorikumiParticipant['division'], number> = {
  Makuuchi: 0,
  Juryo: 1,
  Makushita: 2,
  Sandanme: 3,
  Jonidan: 4,
  Jonokuchi: 5,
};
const LOWER_DIVISION_ORDER: Array<'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi'> = [
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
];

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

const matchesBoundaryBandParticipant = (
  participant: TorikumiParticipant,
  band: BoundaryBandSpec['upperBand'] | BoundaryBandSpec['lowerBand'],
): boolean => {
  const rankNumber = resolveRankNumber(participant);
  if (rankNumber < band.minNumber || rankNumber > band.maxNumber) return false;
  if (band.rankName && participant.rankName !== band.rankName) return false;
  return true;
};

const collectLateLowerBoundaryPool = (
  participants: TorikumiParticipant[],
  spec: BoundaryBandSpec,
): TorikumiParticipant[] => participants.filter((participant) =>
  participant.boutsDone >= participant.targetBouts - 1 && (
    (participant.division === spec.upperDivision && matchesBoundaryBandParticipant(participant, spec.upperBand)) ||
    (participant.division === spec.lowerDivision && matchesBoundaryBandParticipant(participant, spec.lowerBand))
  ));

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
  makushitaMaxRank = 5,
): boolean =>
  resolveJuryoBand(juryo) === 'DROP' &&
  resolveRankNumber(juryo) <= 14 &&
  juryo.wins <= 8 &&
  makushita.division === 'Makushita' &&
  resolveRankNumber(makushita) <= makushitaMaxRank &&
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
  const aBand = resolveMakuuchiBand(a);
  const bBand = resolveMakuuchiBand(b);
  const aTopHeavy = a.rankName === '横綱' || a.rankName === '大関';
  const bTopHeavy = b.rankName === '横綱' || b.rankName === '大関';
  const rankDiff = Math.abs(resolveRankNumber(a) - resolveRankNumber(b));
  const winDiff = Math.abs(a.wins - b.wins);
  const title = resolveTitleImplication(a, b, day);
  const obligation = obligations.get(canonicalPairKey(a.id, b.id));
  let score = rankDiff * 10 + winDiff * (phaseId === 'LATE' ? 10 : 13) + Math.abs(a.losses - b.losses) * 3;
  if (obligation?.reason === 'SANYAKU_ROUND_ROBIN') {
    score -= phaseId === 'EARLY' ? 420 : phaseId === 'MID_A' ? 380 : 320;
  }
  if (obligation?.reason === 'JOI_ASSIGNMENT') {
    score -= phaseId === 'EARLY' ? 340 : phaseId === 'MID_A' ? 260 : 170;
  }
  if (title.titleImplication === 'DIRECT') score -= 420;
  if (title.titleImplication === 'CHASE') score -= 260;
  if (
    phaseId === 'EARLY' &&
    (aBand === 'SANYAKU' || bBand === 'SANYAKU') &&
    (aBand === 'TAIL' || bBand === 'TAIL')
  ) {
    score += 240;
  }
  if ((aTopHeavy && bBand === 'TAIL') || (bTopHeavy && aBand === 'TAIL')) {
    score += phaseId === 'EARLY' ? 360 : phaseId === 'MID_A' ? 300 : 220;
  }
  if ((aTopHeavy && (bBand === 'SANYAKU' || bBand === 'JOI_A')) || (bTopHeavy && (aBand === 'SANYAKU' || aBand === 'JOI_A'))) {
    score -= phaseId === 'EARLY' ? 90 : phaseId === 'MID_A' ? 60 : 30;
  }
  // Fix-batch ②: 横綱 vs 大関、横綱 vs 横綱、大関 vs 大関 は実史上「中日以降」に
  // 組まれる慣習。EARLY/MID_A 期のこれらの上位対決を強く回避する。
  if (aTopHeavy && bTopHeavy) {
    if (phaseId === 'EARLY') score += 900;
    else if (phaseId === 'MID_A') score += 500;
    else if (phaseId === 'MID_B') score += 120;
  }
  let matchReason: TorikumiMatchReason = 'RANK_NEARBY';
  if (title.titleImplication === 'DIRECT') matchReason = 'YUSHO_DIRECT';
  else if (title.titleImplication === 'CHASE') matchReason = 'YUSHO_PURSUIT';
  else if (
    obligation?.reason === 'JOI_ASSIGNMENT' &&
    ((aTopHeavy && (bBand === 'SANYAKU' || bBand === 'JOI_A')) ||
      (bTopHeavy && (aBand === 'SANYAKU' || aBand === 'JOI_A')))
  ) {
    matchReason = 'TOP_RANK_DUTY';
  }
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
  boundaryContext?: TorikumiBoundaryContext,
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
  if (!juryo || !makushita) return null;
  const boundaryParams = resolveJuryoMakushitaBoundaryParams(boundaryContext);
  if (boundaryParams.disabled) return null;
  if (day < boundaryParams.dayThreshold) return null;
  if ((crossDivisionById.get(juryo.id) ?? 0) >= 1 || (crossDivisionById.get(makushita.id) ?? 0) >= 1) {
    return null;
  }
  if (!isJuryoMakushitaExchangeCandidate(juryo, makushita, boundaryParams.makushitaMaxRank)) return null;
  const boundary = hasBoundaryBand(bandMap, a, b);
  if (boundary.boundaryId !== 'JuryoMakushita') return null;
  const baseBonus = day === 15 ? -380 : day >= 14 ? -340 : -300;
  return {
    score:
      baseBonus * boundaryParams.scoreMultiplier +
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

const evaluateLateLowerBoundaryPair = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  bandMap: Map<BoundaryId, BoundaryBandSpec>,
): PairEval | null => {
  if (a.division === b.division) return null;
  return evaluateLowerPair(a, b, bandMap);
};

const buildPairGraph = (
  pool: TorikumiParticipant[],
  faced: Map<string, Set<string>>,
  evaluate: (a: TorikumiParticipant, b: TorikumiParticipant) => PairEval | null,
): PairGraph => {
  const byId = new Map<string, CandidateLink[]>();
  const evalByPairKey = new Map<string, PairEval>();
  for (const participant of pool) {
    byId.set(participant.id, []);
  }
  for (let index = 0; index < pool.length; index += 1) {
    for (let inner = index + 1; inner < pool.length; inner += 1) {
      const a = pool[index];
      const b = pool[inner];
      if (!isLegalPair(faced, a, b)) continue;
      const evalResult = evaluate(a, b);
      if (!evalResult) continue;
      const pairKey = canonicalPairKey(a.id, b.id);
      evalByPairKey.set(pairKey, evalResult);
      byId.get(a.id)?.push({ opponent: b, evalResult });
      byId.get(b.id)?.push({ opponent: a, evalResult });
    }
  }
  for (const links of byId.values()) {
    links.sort((left, right) =>
      left.evalResult.score - right.evalResult.score ||
      left.opponent.id.localeCompare(right.opponent.id));
  }
  return { byId, evalByPairKey };
};

const resolveRemainingNeed = (participant: TorikumiParticipant): number =>
  Math.max(0, participant.targetBouts - participant.boutsDone);

const compareParticipantsForAttempt = (
  left: TorikumiParticipant,
  right: TorikumiParticipant,
  orderKey: (participant: TorikumiParticipant) => number,
  candidateCountById: Map<string, number>,
): number => {
  const candidateDiff =
    (candidateCountById.get(left.id) ?? 0) - (candidateCountById.get(right.id) ?? 0);
  if (candidateDiff !== 0) return candidateDiff;
  const remainingDiff = resolveRemainingNeed(right) - resolveRemainingNeed(left);
  if (remainingDiff !== 0) return remainingDiff;
  const keyDiff = orderKey(left) - orderKey(right);
  if (keyDiff !== 0) return keyDiff;
  const rankDiff = left.rankScore - right.rankScore;
  if (rankDiff !== 0) return rankDiff;
  return left.id.localeCompare(right.id);
};

const computeLeftoverIds = (
  pool: TorikumiParticipant[],
  pairs: TorikumiPair[],
): string[] => {
  const scheduledIds = new Set<string>();
  for (const pair of pairs) {
    scheduledIds.add(pair.a.id);
    scheduledIds.add(pair.b.id);
  }
  return pool
    .filter((participant) => !scheduledIds.has(participant.id))
    .map((participant) => participant.id);
};

const computeTotalScore = (
  pairs: TorikumiPair[],
  evalByPairKey: Map<string, PairEval>,
): number =>
  pairs.reduce((sum, pair) =>
    sum + (evalByPairKey.get(canonicalPairKey(pair.a.id, pair.b.id))?.score ?? 0), 0);

const finalizeAttempt = (
  pool: TorikumiParticipant[],
  pairs: TorikumiPair[],
  repairDepth: number,
  evalByPairKey: Map<string, PairEval>,
  repairAttempts = 0,
  repairSuccessCount = 0,
): MatchAttempt => ({
  pairs,
  totalScore: computeTotalScore(pairs, evalByPairKey),
  repairDepth,
  leftoverIds: computeLeftoverIds(pool, pairs),
  repairAttempts,
  repairSuccessCount,
});

const buildPairAssignments = (pairs: TorikumiPair[]): Map<string, string> => {
  const assignments = new Map<string, string>();
  for (const pair of pairs) {
    assignments.set(pair.a.id, pair.b.id);
    assignments.set(pair.b.id, pair.a.id);
  }
  return assignments;
};

const compareNeighborhoodResults = (
  left: NeighborhoodResult,
  right: NeighborhoodResult,
): number => {
  if (left.scheduledCount !== right.scheduledCount) {
    return left.scheduledCount - right.scheduledCount;
  }
  if (left.totalScore !== right.totalScore) {
    return right.totalScore - left.totalScore;
  }
  return right.pairKeys.join('|').localeCompare(left.pairKeys.join('|'));
};

const resolveNeighborhoodResult = (
  neighborhoodIds: string[],
  pairs: TorikumiPair[],
  evalByPairKey: Map<string, PairEval>,
): NeighborhoodResult => {
  const neighborhoodSet = new Set(neighborhoodIds);
  const pairKeys = pairs
    .filter((pair) => neighborhoodSet.has(pair.a.id) && neighborhoodSet.has(pair.b.id))
    .map((pair) => canonicalPairKey(pair.a.id, pair.b.id))
    .sort();
  return {
    pairKeys,
    scheduledCount: pairKeys.length * 2,
    totalScore: pairKeys.reduce((sum, pairKey) => sum + (evalByPairKey.get(pairKey)?.score ?? 0), 0),
  };
};

const buildNeighborhoodIds = (
  leftoverId: string,
  graph: PairGraph,
  pairAssignments: Map<string, string>,
): string[] => {
  const ids = new Set<string>([leftoverId]);
  const ordered = [leftoverId];
  const candidates = (graph.byId.get(leftoverId) ?? []).slice(0, LOCAL_REPAIR_CANDIDATE_LIMIT);
  for (const { opponent } of candidates) {
    const additions: string[] = [];
    if (!ids.has(opponent.id)) additions.push(opponent.id);
    const partnerId = pairAssignments.get(opponent.id);
    if (partnerId && !ids.has(partnerId)) additions.push(partnerId);
    if (ordered.length + additions.length > LOCAL_REPAIR_NEIGHBORHOOD_LIMIT) continue;
    for (const id of additions) {
      ids.add(id);
      ordered.push(id);
    }
  }
  return ordered;
};

const optimizeNeighborhood = (
  neighborhoodIds: string[],
  graph: PairGraph,
): NeighborhoodResult => {
  const neighborhoodSet = new Set(neighborhoodIds);
  const adjacency = new Map<string, string[]>();
  for (const id of neighborhoodIds) {
    adjacency.set(
      id,
      (graph.byId.get(id) ?? [])
        .map((link) => link.opponent.id)
        .filter((candidateId) => neighborhoodSet.has(candidateId)),
    );
  }

  let best: NeighborhoodResult = { pairKeys: [], scheduledCount: 0, totalScore: 0 };

  const search = (
    remaining: Set<string>,
    pairKeys: string[],
    scheduledCount: number,
    totalScore: number,
  ): void => {
    const upperBound = scheduledCount + Math.floor(remaining.size / 2) * 2;
    if (upperBound < best.scheduledCount) return;
    if (remaining.size === 0) {
      const candidate = {
        pairKeys: pairKeys.slice().sort(),
        scheduledCount,
        totalScore,
      };
      if (compareNeighborhoodResults(candidate, best) > 0) best = candidate;
      return;
    }

    let nextId: string | null = null;
    let nextCandidates: string[] = [];
    for (const id of remaining) {
      const candidates = (adjacency.get(id) ?? []).filter((candidateId) => remaining.has(candidateId));
      if (!nextId || candidates.length < nextCandidates.length) {
        nextId = id;
        nextCandidates = candidates;
      }
      if (candidates.length <= 1) break;
    }
    if (!nextId) return;

    const pairable = nextCandidates
      .map((candidateId) => ({
        candidateId,
        score: graph.evalByPairKey.get(canonicalPairKey(nextId, candidateId))?.score ?? Number.POSITIVE_INFINITY,
      }))
      .sort((left, right) => left.score - right.score || left.candidateId.localeCompare(right.candidateId));

    for (const { candidateId, score } of pairable) {
      if (!remaining.has(candidateId)) continue;
      remaining.delete(nextId);
      remaining.delete(candidateId);
      pairKeys.push(canonicalPairKey(nextId, candidateId));
      search(remaining, pairKeys, scheduledCount + 2, totalScore + score);
      pairKeys.pop();
      remaining.add(nextId);
      remaining.add(candidateId);
    }

    remaining.delete(nextId);
    search(remaining, pairKeys, scheduledCount, totalScore);
    remaining.add(nextId);
  };

  search(new Set(neighborhoodIds), [], 0, 0);
  return best;
};

const replaceNeighborhoodPairs = (
  pairs: TorikumiPair[],
  neighborhoodIds: string[],
  nextNeighborhood: NeighborhoodResult,
  participantsById: Map<string, TorikumiParticipant>,
  evalByPairKey: Map<string, PairEval>,
  repairDepth: number,
): TorikumiPair[] => {
  const neighborhoodSet = new Set(neighborhoodIds);
  const outsidePairs = pairs.filter((pair) =>
    !neighborhoodSet.has(pair.a.id) && !neighborhoodSet.has(pair.b.id));
  const nextPairs = nextNeighborhood.pairKeys.map((pairKey) => {
    const [aId, bId] = pairKey.split(':');
    const a = participantsById.get(aId);
    const b = participantsById.get(bId);
    const evalResult = evalByPairKey.get(pairKey);
    if (!a || !b || !evalResult) {
      throw new Error(`Failed to rebuild local torikumi pair for ${pairKey}`);
    }
    return toPair(a, b, evalResult, repairDepth);
  });
  return outsidePairs.concat(nextPairs);
};

const improveAttemptLocally = (
  pool: TorikumiParticipant[],
  attempt: MatchAttempt,
  graph: PairGraph,
  orderKey: (participant: TorikumiParticipant) => number,
): MatchAttempt => {
  let pairs = attempt.pairs.slice();
  let repairAttempts = 0;
  let repairSuccessCount = 0;
  const participantsById = new Map(pool.map((participant) => [participant.id, participant]));
  const candidateCountById = new Map(
    pool.map((participant) => [participant.id, graph.byId.get(participant.id)?.length ?? 0]),
  );

  while (true) {
    const leftoverIds = computeLeftoverIds(pool, pairs);
    const playerLeftoverIds = leftoverIds.filter((id) => participantsById.get(id)?.isPlayer);
    if (playerLeftoverIds.length === 0) break;
    const pairAssignments = buildPairAssignments(pairs);
    const orderedLeftovers = playerLeftoverIds
      .slice()
      .sort((leftId, rightId) => {
        const left = participantsById.get(leftId);
        const right = participantsById.get(rightId);
        if (!left || !right) return leftId.localeCompare(rightId);
        return compareParticipantsForAttempt(left, right, orderKey, candidateCountById);
      });

    let improved = false;
    for (const leftoverId of orderedLeftovers) {
      const neighborhoodIds = buildNeighborhoodIds(leftoverId, graph, pairAssignments);
      if (neighborhoodIds.length < 2) continue;
      repairAttempts += 1;
      const currentNeighborhood = resolveNeighborhoodResult(
        neighborhoodIds,
        pairs,
        graph.evalByPairKey,
      );
      const optimized = optimizeNeighborhood(neighborhoodIds, graph);
      if (compareNeighborhoodResults(optimized, currentNeighborhood) <= 0) continue;
      pairs = replaceNeighborhoodPairs(
        pairs,
        neighborhoodIds,
        optimized,
        participantsById,
        graph.evalByPairKey,
        attempt.repairDepth,
      );
      repairSuccessCount += 1;
      improved = true;
      break;
    }
    if (!improved) break;
  }

  return finalizeAttempt(
    pool,
    pairs,
    attempt.repairDepth,
    graph.evalByPairKey,
    repairAttempts,
    repairSuccessCount,
  );
};

const resolveMakeupDay = (
  participant: TorikumiParticipant,
  day: number,
  bashoDays: number[],
  canFightOnDay: (participant: TorikumiParticipant, day: number) => boolean,
  grantedMakeupDaysById: Map<string, Set<number>>,
): number | null => {
  const grantedDays = grantedMakeupDaysById.get(participant.id) ?? new Set<number>();
  for (const candidateDay of bashoDays) {
    if (candidateDay <= day) continue;
    if (canFightOnDay(participant, candidateDay)) continue;
    if (grantedDays.has(candidateDay)) continue;
    return candidateDay;
  }
  return null;
};

const buildAttempt = (
  pool: TorikumiParticipant[],
  faced: Map<string, Set<string>>,
  repairDepth: number,
  orderKey: (participant: TorikumiParticipant) => number,
  evaluate: (a: TorikumiParticipant, b: TorikumiParticipant) => PairEval | null,
  options?: {
    optimizeLocally?: boolean;
  },
): MatchAttempt => {
  const graph = buildPairGraph(pool, faced, evaluate);
  const candidateCountById = new Map(
    pool.map((participant) => [participant.id, graph.byId.get(participant.id)?.length ?? 0]),
  );
  const scheduledIds = new Set<string>();
  const exhaustedIds = new Set<string>();
  const pairs: TorikumiPair[] = [];
  while (true) {
    const remaining = pool.filter((participant) =>
      !scheduledIds.has(participant.id) && !exhaustedIds.has(participant.id));
    if (remaining.length < 2) break;
    const participant = remaining
      .slice()
      .sort((left, right) => {
        const leftCurrentCount = (graph.byId.get(left.id) ?? [])
          .filter((candidate) =>
            !scheduledIds.has(candidate.opponent.id) && !exhaustedIds.has(candidate.opponent.id))
          .length;
        const rightCurrentCount = (graph.byId.get(right.id) ?? [])
          .filter((candidate) =>
            !scheduledIds.has(candidate.opponent.id) && !exhaustedIds.has(candidate.opponent.id))
          .length;
        if (leftCurrentCount !== rightCurrentCount) return leftCurrentCount - rightCurrentCount;
        return compareParticipantsForAttempt(left, right, orderKey, candidateCountById);
      })[0];
    const best = (graph.byId.get(participant.id) ?? [])
      .filter((candidate) =>
        !scheduledIds.has(candidate.opponent.id) && !exhaustedIds.has(candidate.opponent.id))
      .sort((left, right) => {
        const leftCurrentCount = (graph.byId.get(left.opponent.id) ?? [])
          .filter((candidate) =>
            !scheduledIds.has(candidate.opponent.id) &&
            !exhaustedIds.has(candidate.opponent.id) &&
            candidate.opponent.id !== participant.id)
          .length;
        const rightCurrentCount = (graph.byId.get(right.opponent.id) ?? [])
          .filter((candidate) =>
            !scheduledIds.has(candidate.opponent.id) &&
            !exhaustedIds.has(candidate.opponent.id) &&
            candidate.opponent.id !== participant.id)
          .length;
        if (left.evalResult.score !== right.evalResult.score) {
          return left.evalResult.score - right.evalResult.score;
        }
        if (leftCurrentCount !== rightCurrentCount) return leftCurrentCount - rightCurrentCount;
        return compareParticipantsForAttempt(
          left.opponent,
          right.opponent,
          orderKey,
          candidateCountById,
        );
      })[0] ?? null;
    if (!best) {
      exhaustedIds.add(participant.id);
      continue;
    }
    scheduledIds.add(participant.id);
    scheduledIds.add(best.opponent.id);
    pairs.push(toPair(participant, best.opponent, best.evalResult, repairDepth));
  }
  const attempt = finalizeAttempt(pool, pairs, repairDepth, graph.evalByPairKey);
  if (!options?.optimizeLocally || attempt.leftoverIds.length === 0) {
    return attempt;
  }
  return improveAttemptLocally(pool, attempt, graph, orderKey);
};

const chooseAttempt = (primary: MatchAttempt, repair: MatchAttempt): MatchAttempt => {
  if (repair.leftoverIds.length < primary.leftoverIds.length) return repair;
  if (repair.leftoverIds.length === primary.leftoverIds.length && repair.totalScore < primary.totalScore) {
    return repair;
  }
  return primary;
};

const resolveUnavailableReason = (
  participant: TorikumiParticipant,
  day: number,
): TorikumiFusenReason => {
  if (participant.bashoKyujo) return 'basho_kyujo';
  if (!participant.active || participant.kyujo) return 'inactive';
  if (participant.kyujoStartDay != null && day >= participant.kyujoStartDay) {
    return 'partial_kyujo';
  }
  return 'inactive';
};

export const scheduleTorikumiBasho = (
  params: ScheduleTorikumiBashoParams,
): TorikumiBashoResult => {
  const participants = params.participants;
  for (const participant of participants) applyParticipantDefaults(participant);
  const faced = ensureFacedMap(participants, params.facedMap);
  const days = params.days.slice().sort((left, right) => left - right);
  const canFightOnDay = params.prePublishedEligibility ?? params.dayEligibility ?? (() => true);
  const canAppearAfterPublication = params.postPublishedAvailability;
  const bandMap = buildBoundaryBandMap(params.boundaryBands);
  const obligations = buildObligations(participants);
  const crossDivisionById = new Map<string, number>(participants.map((participant) => [participant.id, 0]));
  const grantedMakeupDaysById = new Map<string, Set<number>>();
  const observedHealthyUnresolvedDaysById = new Map<string, Set<number>>();

  const dayResults: TorikumiBashoResult['days'] = [];
  const boundaryActivations: TorikumiBashoResult['diagnostics']['boundaryActivations'] = [];
  const torikumiRelaxationHistogram: Record<string, number> = {};
  const repairHistogram: Record<string, number> = {};
  const crossDivisionByBoundary: Record<string, number> = {};
  const scheduleViolations: TorikumiBashoResult['diagnostics']['scheduleViolations'] = [];
  const playerHealthyUnresolvedDays = new Set<number>();
  const unresolvedByDivisionAndDay: Record<string, Partial<Record<TorikumiParticipant['division'], number>>> = {};
  let crossDivisionBoutCount = 0;
  let lateCrossDivisionBoutCount = 0;
  let lateDirectTitleBoutCount = 0;
  let yokozunaOzekiBoutCount = 0;
  let yokozunaOzekiTailBoutCount = 0;
  let repairAttempts = 0;
  let repairSuccessCount = 0;
  let fusenPairCount = 0;
  let doubleKyujoCount = 0;

  for (const day of days) {
    const eligible = enrichParticipantsForDay(
      participants.filter((participant) =>
        participant.active &&
        !participant.kyujo &&
        participant.boutsDone < participant.targetBouts &&
        (canFightOnDay(participant, day) || grantedMakeupDaysById.get(participant.id)?.has(day) === true)),
    );
    const scheduledIds = new Set<string>();
    const dayPairs: TorikumiPair[] = [];

    const schedulePool = (
      pool: TorikumiParticipant[],
      evaluate: (a: TorikumiParticipant, b: TorikumiParticipant) => PairEval | null,
      options?: {
        optimizeLocally?: boolean;
        allowRepairAttempt?: boolean;
      },
    ): void => {
      const available = pool.filter((participant) => !scheduledIds.has(participant.id));
      if (available.length < 2) return;
      const primary = buildAttempt(
        available,
        faced,
        0,
        (participant) => resolveSchedulingPriority(participant, day, false),
        evaluate,
        options,
      );
      const chosen = options?.allowRepairAttempt === false
        ? primary
        : chooseAttempt(
          primary,
          buildAttempt(
            available,
            faced,
            1,
            (participant) => resolveSchedulingPriority(participant, day, true),
            evaluate,
            options,
          ),
        );
      repairAttempts += chosen.repairAttempts;
      repairSuccessCount += chosen.repairSuccessCount;
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
      (a, b) => evaluateJuryoPair(a, b, day, obligations.byPairKey, bandMap, crossDivisionById, params.boundaryContext),
      { optimizeLocally: true },
    );
    const lowerEligible = eligible.filter((participant) => isLowerDivision(participant.division));
    for (const spec of params.boundaryBands) {
      if (
        spec.id === 'MakuuchiJuryo' ||
        spec.id === 'JuryoMakushita'
      ) {
        continue;
      }
      const boundaryPool = collectLateLowerBoundaryPool(
        lowerEligible.filter((participant) => !scheduledIds.has(participant.id)),
        spec,
      );
      if (boundaryPool.length < 2) continue;
      schedulePool(
        boundaryPool,
        (a, b) => evaluateLateLowerBoundaryPair(a, b, bandMap),
        { optimizeLocally: true },
      );
    }
    for (const division of LOWER_DIVISION_ORDER) {
      const divisionPool = lowerEligible.filter((participant) =>
        participant.division === division && !scheduledIds.has(participant.id));
      if (divisionPool.length < 2) continue;
      const paired = pairWithinDivision(
        divisionPool,
        faced,
        day,
        DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
        params.rng,
      );
      for (const pair of paired.pairs) {
        pair.phaseId = resolveLowerPhase(resolveLowerRoundIndex(pair.a, pair.b));
        pair.roundIndex = resolveLowerRoundIndex(pair.a, pair.b);
        pair.contentionTier = 'Outside';
        pair.titleImplication = 'NONE';
        pair.boundaryImplication = 'NONE';
        scheduledIds.add(pair.a.id);
        scheduledIds.add(pair.b.id);
        dayPairs.push(pair);
      }
      const leftoverPool = paired.leftovers.filter((participant) => !scheduledIds.has(participant.id));
      if (leftoverPool.length >= 2) {
        schedulePool(
          leftoverPool,
          (a, b) => evaluateLowerPair(a, b, bandMap),
          {
            optimizeLocally: true,
            allowRepairAttempt: true,
          },
        );
      }
    }

    const normalPairs: TorikumiPair[] = [];
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
      if (pair.a.division === 'Makuuchi' && pair.b.division === 'Makuuchi') {
        const aTopHeavy = pair.a.rankName === '横綱' || pair.a.rankName === '大関';
        const bTopHeavy = pair.b.rankName === '横綱' || pair.b.rankName === '大関';
        if (aTopHeavy || bTopHeavy) {
          yokozunaOzekiBoutCount += 1;
          if (
            (aTopHeavy && resolveMakuuchiBand(pair.b) === 'TAIL') ||
            (bTopHeavy && resolveMakuuchiBand(pair.a) === 'TAIL')
          ) {
            yokozunaOzekiTailBoutCount += 1;
          }
        }
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

      if (canAppearAfterPublication) {
        const aAvailable = canAppearAfterPublication(pair.a, day);
        const bAvailable = canAppearAfterPublication(pair.b, day);
        if (!aAvailable && !bAvailable) {
          doubleKyujoCount += 1;
          fusenPairCount += 1;
          const aReason = resolveUnavailableReason(pair.a, day);
          const bReason = resolveUnavailableReason(pair.b, day);
          params.onDoubleKyujo?.(
            pair,
            day,
            aReason === 'partial_kyujo' || bReason === 'partial_kyujo'
              ? 'partial_kyujo'
              : aReason,
          );
          continue;
        }
        if (!aAvailable || !bAvailable) {
          fusenPairCount += 1;
          const winner = aAvailable ? pair.a : pair.b;
          const loser = aAvailable ? pair.b : pair.a;
          params.onFusen?.(pair, day, winner, loser, resolveUnavailableReason(loser, day));
          continue;
        }
      }
      normalPairs.push(pair);
    }

    for (const pair of normalPairs) {
      params.onPair?.(pair, day);
    }

    const leftoverIds = eligible
      .filter((participant) => !scheduledIds.has(participant.id))
      .map((participant) => participant.id);
    if (leftoverIds.length > 0) {
      const unresolvedByDivision =
        unresolvedByDivisionAndDay[String(day)] ?? {};
      const unresolvedLeftoverIds: string[] = [];
      for (const id of leftoverIds) {
        const participant = eligible.find((entry) => entry.id === id);
        if (!participant) continue;
        let grantedMakeup = false;
        if (participant.targetBouts <= 7) {
          const makeupDay = resolveMakeupDay(
            participant,
            day,
            days,
            canFightOnDay,
            grantedMakeupDaysById,
          );
          if (makeupDay !== null) {
            const grantedDays = grantedMakeupDaysById.get(participant.id) ?? new Set<number>();
            grantedDays.add(makeupDay);
            grantedMakeupDaysById.set(participant.id, grantedDays);
            grantedMakeup = true;
          }
        }
        if (grantedMakeup) {
          continue;
        }
        unresolvedLeftoverIds.push(id);
        unresolvedByDivision[participant.division] =
          (unresolvedByDivision[participant.division] ?? 0) + 1;
        if (participant.isPlayer && participant.targetBouts <= 7) {
          const observedDays = observedHealthyUnresolvedDaysById.get(participant.id) ?? new Set<number>();
          observedDays.add(day);
          observedHealthyUnresolvedDaysById.set(participant.id, observedDays);
        }
      }
      if (unresolvedLeftoverIds.length > 0) {
        unresolvedByDivisionAndDay[String(day)] = unresolvedByDivision;
        scheduleViolations.push({
          day,
          participantIds: unresolvedLeftoverIds,
          reason: 'UNRESOLVED_LEFTOVER',
        });
      }
    }

    dayResults.push({ day, pairs: dayPairs, byeIds: [] });
  }

  const remainingTargetById: Record<string, number> = {};
  const unscheduledById: Record<string, number> = {};
  for (const participant of participants) {
    const remaining = Math.max(0, participant.targetBouts - participant.boutsDone);
    remainingTargetById[participant.id] = remaining;
    if (remaining > 0) unscheduledById[participant.id] = remaining;
    if (
      participant.isPlayer &&
      participant.targetBouts <= 7 &&
      participant.active &&
      !participant.kyujo &&
      remaining > 0
    ) {
      for (const unresolvedDay of observedHealthyUnresolvedDaysById.get(participant.id) ?? []) {
        playerHealthyUnresolvedDays.add(unresolvedDay);
      }
    }
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
      sanyakuRoundRobinCoverageRate:
        (obligations.coverage.SANYAKU_ROUND_ROBIN.total ?? 0) > 0
          ? (obligations.coverage.SANYAKU_ROUND_ROBIN.scheduled ?? 0) /
            obligations.coverage.SANYAKU_ROUND_ROBIN.total
          : 1,
      joiAssignmentCoverageRate:
        (obligations.coverage.JOI_ASSIGNMENT.total ?? 0) > 0
          ? (obligations.coverage.JOI_ASSIGNMENT.scheduled ?? 0) /
            obligations.coverage.JOI_ASSIGNMENT.total
          : 1,
      yokozunaOzekiTailBoutRatio:
        yokozunaOzekiBoutCount > 0 ? yokozunaOzekiTailBoutCount / yokozunaOzekiBoutCount : 0,
      fusenPairCount,
      doubleKyujoCount,
      crossDivisionByBoundary,
      lateDirectTitleBoutCount,
      playerHealthyUnresolvedDays: [...playerHealthyUnresolvedDays].sort((left, right) => left - right),
      unresolvedByDivisionAndDay,
      repairAttempts,
      repairSuccessCount,
    },
  };
};
