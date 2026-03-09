import {
  DEFAULT_TORIKUMI_LATE_BOUNDARY_PLAYOFF_BONUS,
  DEFAULT_TORIKUMI_LATE_EVAL_START_DAY,
  DEFAULT_TORIKUMI_LATE_SURVIVAL_MATCH_BONUS,
  isBorderlineSurvivalMatchPoint,
  isJuryoDemotionBubble,
  isMakushitaPromotionBubble,
  rankDistanceWeight,
  scoreDistanceWeight,
} from '../policy';
import { BoundaryId, TorikumiParticipant } from '../types';
import { REALISM_V1_BALANCE } from '../../../balance/realismV1';
import { SimulationModelVersion } from '../../modelVersion';

export const resolveRankNumber = (participant: TorikumiParticipant): number =>
  participant.rankNumber ?? Math.floor((participant.rankScore - 1) / 2) + 1;

export type PairEvalPhase = 'EARLY' | 'MID' | 'LATE';

export const isLowerDivisionClimax = (participant: TorikumiParticipant): boolean =>
  participant.targetBouts <= 7 && participant.boutsDone >= 5;

export const resolvePairEvalPhase = (
  day: number,
  lateEvalStartDay: number,
  a: TorikumiParticipant,
  b: TorikumiParticipant,
): PairEvalPhase => {
  if (day >= lateEvalStartDay || isLowerDivisionClimax(a) || isLowerDivisionClimax(b)) return 'LATE';
  if (day <= 5) return 'EARLY';
  return 'MID';
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

export const compareForPhase = (a: TorikumiParticipant, b: TorikumiParticipant, day: number): number => {
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

export const resolvePairScore = (
  a: TorikumiParticipant,
  b: TorikumiParticipant,
  day: number,
  options?: {
    boundaryNeed?: number;
    phase?: PairEvalPhase;
    boundaryId?: BoundaryId;
    simulationModelVersion?: SimulationModelVersion;
  },
): number => {
  const boundaryNeed = options?.boundaryNeed ?? 0;
  const phase = options?.phase ?? (day >= DEFAULT_TORIKUMI_LATE_EVAL_START_DAY ? 'LATE' : 'MID');
  const simulationModelVersion = options?.simulationModelVersion ?? 'unified-v2-kimarite';
  let scoreWeight = Math.min(
    REALISM_V1_BALANCE.torikumi.sameScoreWeightCap,
    scoreDistanceWeight(day),
  );
  let rankWeight = rankDistanceWeight(day);
  if (simulationModelVersion === 'unified-v3-variance') {
    if (day >= 6 && day <= 10) {
      scoreWeight *= 0.7;
      rankWeight *= 1.15;
    } else if (day >= 11) {
      scoreWeight *= 0.8;
      rankWeight *= 1.1;
    }
  }
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
