import { Rank } from '../models';
import { clamp } from '../simulation/boundary/shared';
import { BoundarySnapshot, JURYO_SIZE, MAKUSHITA_POOL_SIZE, SekitoriExchange } from '../simulation/sekitori/types';
import { reallocateWithMonotonicConstraints } from './expected/monotonic';
import { resolveExpectedPlacementScore } from './expected/scoring';
import { resolveExpectedSlotBand } from './expected/slotBands';
import { ExpectedPlacementCandidate } from './expected/types';

const JURYO_OFFSET = 0;
const MAKUSHITA_OFFSET = JURYO_SIZE;
const TOTAL_SLOTS = JURYO_SIZE + MAKUSHITA_POOL_SIZE;
const JURYO_FULL_ABSENCE_MIN_DEMOTION_SLOTS = 22;

const toGlobalSlot = (division: 'Juryo' | 'Makushita', rankScore: number): number =>
  division === 'Juryo'
    ? clamp(JURYO_OFFSET + clamp(rankScore, 1, JURYO_SIZE), 1, TOTAL_SLOTS)
    : clamp(MAKUSHITA_OFFSET + clamp(rankScore, 1, MAKUSHITA_POOL_SIZE), 1, TOTAL_SLOTS);

const toRank = (slot: number): Rank => {
  const bounded = clamp(slot, 1, TOTAL_SLOTS);
  if (bounded <= JURYO_SIZE) {
    return {
      division: 'Juryo',
      name: '十両',
      number: Math.floor((bounded - 1) / 2) + 1,
      side: bounded % 2 === 1 ? 'East' : 'West',
    };
  }
  const score = bounded - MAKUSHITA_OFFSET;
  return {
    division: 'Makushita',
    name: '幕下',
    number: Math.floor((score - 1) / 2) + 1,
    side: score % 2 === 1 ? 'East' : 'West',
  };
};

const toCurrentRank = (division: 'Juryo' | 'Makushita', rankScore: number): Rank => {
  if (division === 'Juryo') {
    const bounded = clamp(rankScore, 1, JURYO_SIZE);
    return {
      division: 'Juryo',
      name: '十両',
      number: Math.floor((bounded - 1) / 2) + 1,
      side: bounded % 2 === 1 ? 'East' : 'West',
    };
  }
  const bounded = clamp(rankScore, 1, MAKUSHITA_POOL_SIZE);
  return {
    division: 'Makushita',
    name: '幕下',
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

export const resolveSekitoriBoundaryAssignedRank = (
  juryoResults: BoundarySnapshot[],
  makushitaResults: BoundarySnapshot[],
  exchange: SekitoriExchange,
  playerFullAbsence: boolean,
): Rank | undefined => {
  const candidates: ExpectedPlacementCandidate[] = [];
  for (const row of juryoResults) {
    const currentSlot = toGlobalSlot('Juryo', row.rankScore);
    const currentRank = toCurrentRank('Juryo', row.rankScore);
    const absent = row.id === 'PLAYER' && playerFullAbsence ? 15 : 0;
    const mandatoryDemotion =
      row.id === 'PLAYER' &&
      (playerFullAbsence || exchange.playerDemotedToMakushita);
    const band = resolveExpectedSlotBand({
      currentSlot,
      wins: row.wins,
      losses: row.losses,
      absent,
      totalSlots: TOTAL_SLOTS,
      mandatoryDemotion,
      mandatoryPromotion: false,
    });
    let expectedSlot = band.expectedSlot;
    let minSlot = band.minSlot;
    let maxSlot = band.maxSlot;
    if (row.id === 'PLAYER') {
      const isMakekoshi = row.wins < row.losses;
      const isKachikoshi = row.wins > row.losses;
      if (isMakekoshi) {
        const minDemotionSlots = playerFullAbsence ? JURYO_FULL_ABSENCE_MIN_DEMOTION_SLOTS : 1;
        const demotionFloor = clamp(currentSlot + minDemotionSlots, 1, TOTAL_SLOTS);
        expectedSlot = Math.max(expectedSlot, demotionFloor);
        minSlot = Math.max(minSlot, clamp(currentSlot + 1, 1, TOTAL_SLOTS));
      } else if (isKachikoshi) {
        const promotionCeiling = clamp(currentSlot - 1, 1, TOTAL_SLOTS);
        expectedSlot = Math.min(expectedSlot, promotionCeiling);
        maxSlot = Math.min(maxSlot, promotionCeiling);
      }
    }
    minSlot = clamp(Math.min(minSlot, maxSlot), 1, TOTAL_SLOTS);
    maxSlot = clamp(Math.max(minSlot, maxSlot), 1, TOTAL_SLOTS);
    expectedSlot = clamp(expectedSlot, minSlot, maxSlot);
    candidates.push({
      id: row.id,
      currentRank,
      wins: row.wins,
      losses: row.losses,
      absent,
      currentSlot,
      expectedSlot,
      minSlot,
      maxSlot,
      mandatoryDemotion,
      mandatoryPromotion: false,
      sourceDivision: 'Juryo',
      score: resolveExpectedPlacementScore(currentRank, row.wins, row.losses, absent, mandatoryDemotion, false),
    });
  }
  for (const row of makushitaResults) {
    const currentSlot = toGlobalSlot('Makushita', row.rankScore);
    const currentRank = toCurrentRank('Makushita', row.rankScore);
    const mandatoryPromotion = row.id === 'PLAYER' && exchange.playerPromotedToJuryo;
    const band = resolveExpectedSlotBand({
      currentSlot,
      wins: row.wins,
      losses: row.losses,
      absent: 0,
      totalSlots: TOTAL_SLOTS,
      mandatoryDemotion: false,
      mandatoryPromotion,
    });
    let expectedSlot = band.expectedSlot;
    let minSlot = band.minSlot;
    let maxSlot = band.maxSlot;
    if (row.id === 'PLAYER') {
      const isMakekoshi = row.wins < row.losses;
      const isKachikoshi = row.wins > row.losses;
      if (isMakekoshi) {
        const demotionFloor = clamp(currentSlot + 1, 1, TOTAL_SLOTS);
        expectedSlot = Math.max(expectedSlot, demotionFloor);
        minSlot = Math.max(minSlot, demotionFloor);
      } else if (isKachikoshi) {
        const promotionCeiling = clamp(currentSlot - 1, 1, TOTAL_SLOTS);
        expectedSlot = Math.min(expectedSlot, promotionCeiling);
        maxSlot = Math.min(maxSlot, promotionCeiling);
      }
    }
    minSlot = clamp(Math.min(minSlot, maxSlot), 1, TOTAL_SLOTS);
    maxSlot = clamp(Math.max(minSlot, maxSlot), 1, TOTAL_SLOTS);
    expectedSlot = clamp(expectedSlot, minSlot, maxSlot);
    candidates.push({
      id: row.id,
      currentRank,
      wins: row.wins,
      losses: row.losses,
      absent: 0,
      currentSlot,
      expectedSlot,
      minSlot,
      maxSlot,
      mandatoryDemotion: false,
      mandatoryPromotion,
      sourceDivision: 'Makushita',
      score: resolveExpectedPlacementScore(currentRank, row.wins, row.losses, 0, false, mandatoryPromotion),
    });
  }

  if (!candidates.some((candidate) => candidate.id === 'PLAYER')) return undefined;
  const assignments = reallocateWithMonotonicConstraints(candidates, TOTAL_SLOTS);
  const player = assignments.find((assignment) => assignment.id === 'PLAYER');
  if (!player) return undefined;
  return toRank(player.slot);
};
