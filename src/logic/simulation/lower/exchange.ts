import { Rank } from '../../models';
import { clamp, compareBoundaryCandidate } from '../boundary/shared';
import {
  BoundaryCandidate,
  BoundarySnapshot,
  BoundarySpec,
  CandidateRule,
  DIVISION_MAX_NUMBER,
  DIVISION_SIZE,
  LowerBoundaryExchange,
  LowerDivision,
} from './types';

const toDivisionNumber = (division: LowerDivision, rankScore: number): number =>
  clamp(Math.ceil(rankScore / 2), 1, DIVISION_MAX_NUMBER[division]);

export const resolvePlayerRankScore = (rank: Rank): number => {
  const division = rank.division as LowerDivision;
  const maxNumber = DIVISION_MAX_NUMBER[division] || 1;
  const number = clamp(rank.number || 1, 1, maxNumber);
  const sideOffset = rank.side === 'West' ? 1 : 0;
  return clamp(1 + (number - 1) * 2 + sideOffset, 1, DIVISION_SIZE[division]);
};

const buildBoundaryCandidates = (
  results: BoundarySnapshot[],
  division: LowerDivision,
  rule: CandidateRule,
): BoundaryCandidate[] =>
  results
    .map((result) => {
      const number = toDivisionNumber(division, result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      const mandatory = rule.mandatory(number, wins, losses);
      const bubble = mandatory || rule.bubble(number, wins, losses);
      if (!bubble) return null;
      let score = rule.score(number, wins, losses);
      if (mandatory) score += 8;
      return { id: result.id, score, mandatory };
    })
    .filter((candidate): candidate is BoundaryCandidate => Boolean(candidate))
    .sort(compareBoundaryCandidate);

const buildFallbackDemotionCandidates = (
  upperResults: BoundarySnapshot[],
  upperDivision: LowerDivision,
  rule: CandidateRule,
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  upperResults
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => {
      const number = toDivisionNumber(upperDivision, result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      const score = rule.fallbackScore(number, wins, losses);
      return { id: result.id, score, mandatory: false };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

const buildFallbackPromotionCandidates = (
  lowerResults: BoundarySnapshot[],
  lowerDivision: LowerDivision,
  rule: CandidateRule,
  excludeIds: Set<string>,
): BoundaryCandidate[] =>
  lowerResults
    .filter((result) => !excludeIds.has(result.id))
    .map((result) => {
      const number = toDivisionNumber(lowerDivision, result.rankScore);
      const wins = result.wins;
      const losses = result.losses;
      const score = rule.score(number, wins, losses);
      return { id: result.id, score, mandatory: false };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.id.localeCompare(a.id);
    });

const resolveExchangeSlots = (
  demotionPool: BoundaryCandidate[],
  promotionPool: BoundaryCandidate[],
): { demotions: BoundaryCandidate[]; promotions: BoundaryCandidate[]; slots: number } => {
  if (!demotionPool.length || !promotionPool.length) {
    return { demotions: [], promotions: [], slots: 0 };
  }

  const mandatoryDemotions = demotionPool.filter((candidate) => candidate.mandatory).length;
  const mandatoryPromotions = promotionPool.filter((candidate) => candidate.mandatory).length;
  const maxSlots = Math.min(demotionPool.length, promotionPool.length);

  let slots = Math.min(Math.max(mandatoryDemotions, mandatoryPromotions), maxSlots);
  if (slots === 0 && promotionPool[0].score >= demotionPool[0].score + 5) {
    slots = 1;
  }
  if (slots === 0 && maxSlots > 0) {
    slots = 1;
  }

  while (slots < maxSlots) {
    const nextPromotion = promotionPool[slots];
    const nextDemotion = demotionPool[slots];
    if (!nextPromotion || !nextDemotion) break;
    if (nextPromotion.score >= nextDemotion.score + 2.5) {
      slots += 1;
      continue;
    }
    break;
  }

  return {
    demotions: demotionPool.slice(0, slots),
    promotions: promotionPool.slice(0, slots),
    slots,
  };
};

export const resolveBoundaryExchange = (
  spec: BoundarySpec,
  upperResults: BoundarySnapshot[],
  lowerResults: BoundarySnapshot[],
): LowerBoundaryExchange => {
  let demotionPool = buildBoundaryCandidates(upperResults, spec.upper, spec.demotionRule);
  let promotionPool = buildBoundaryCandidates(lowerResults, spec.lower, spec.promotionRule);
  const mandatoryPromotions = promotionPool.filter((candidate) => candidate.mandatory).length;
  if (!demotionPool.length && !promotionPool.length) {
    demotionPool = buildFallbackDemotionCandidates(
      upperResults,
      spec.upper,
      spec.demotionRule,
      new Set<string>(),
    );
    promotionPool = buildFallbackPromotionCandidates(
      lowerResults,
      spec.lower,
      spec.promotionRule,
      new Set<string>(),
    );
  }

  if (promotionPool.length && (demotionPool.length === 0 || mandatoryPromotions > demotionPool.length)) {
    const excludeIds = new Set(demotionPool.map((candidate) => candidate.id));
    const fallbackDemotions = buildFallbackDemotionCandidates(
      upperResults,
      spec.upper,
      spec.demotionRule,
      excludeIds,
    );
    const minimumDemotions = Math.min(upperResults.length, Math.max(1, mandatoryPromotions));
    demotionPool = demotionPool.concat(fallbackDemotions).slice(0, minimumDemotions);
  }
  if (demotionPool.length && (promotionPool.length === 0 || demotionPool.length > promotionPool.length)) {
    const excludeIds = new Set(promotionPool.map((candidate) => candidate.id));
    const fallbackPromotions = buildFallbackPromotionCandidates(
      lowerResults,
      spec.lower,
      spec.promotionRule,
      excludeIds,
    );
    const minimumPromotions = Math.min(
      lowerResults.length,
      Math.max(1, demotionPool.length),
    );
    promotionPool = promotionPool.concat(fallbackPromotions).slice(0, minimumPromotions);
  }

  const resolved = resolveExchangeSlots(demotionPool, promotionPool);
  const promotedToUpperIds = resolved.promotions.map((candidate) => candidate.id);
  const demotedToLowerIds = resolved.demotions.map((candidate) => candidate.id);
  const playerUpper = upperResults.find((result) => result.id === 'PLAYER');
  const forcePlayerDemotion = Boolean(playerUpper && playerUpper.wins === 0 && playerUpper.losses >= 7);
  const forcedDemotedIds = demotedToLowerIds.includes('PLAYER')
    ? demotedToLowerIds
    : forcePlayerDemotion
      ? [...demotedToLowerIds, 'PLAYER']
      : demotedToLowerIds;
  const forcedPromotedIds =
    forcePlayerDemotion && forcedDemotedIds.length > promotedToUpperIds.length
      ? [
        ...promotedToUpperIds,
        (
          promotionPool.find((candidate) => !promotedToUpperIds.includes(candidate.id))?.id ??
          lowerResults.find((result) => result.id !== 'PLAYER')?.id ??
          lowerResults[0]?.id
        ) as string,
      ].filter((id, index, arr) => Boolean(id) && arr.indexOf(id) === index)
      : promotedToUpperIds;
  const resolvedSlots = forcePlayerDemotion ? Math.max(1, resolved.slots) : resolved.slots;
  return {
    slots: resolvedSlots,
    promotedToUpperIds: forcedPromotedIds,
    demotedToLowerIds: forcedDemotedIds,
    playerPromotedToUpper: forcedPromotedIds.includes('PLAYER'),
    playerDemotedToLower: forcedDemotedIds.includes('PLAYER'),
    reason: forcePlayerDemotion ? 'MANDATORY_ABSENCE_DEMOTION' : 'NORMAL',
  };
};
