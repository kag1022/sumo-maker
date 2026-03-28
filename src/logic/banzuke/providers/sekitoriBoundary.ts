import { Rank } from '../../models';
import { getHeiseiBoundaryExchangeRate } from '../../calibration/banzukeHeisei';
import { clamp } from '../../simulation/boundary/shared';
import { BoundarySnapshot, JURYO_SIZE, MAKUSHITA_POOL_SIZE, SekitoriExchange } from '../../simulation/sekitori/types';
import { reallocateWithMonotonicConstraints } from './expected/monotonic';
import { ExpectedPlacementCandidate } from './expected/types';
import { optimizeExpectedPlacements } from '../optimizer';
import { resolveEmpiricalSlotBand } from './empirical';

const JURYO_OFFSET = 0;
const MAKUSHITA_OFFSET = JURYO_SIZE;
const TOTAL_SLOTS = JURYO_SIZE + MAKUSHITA_POOL_SIZE;

const toJuryoNumber = (rankScore: number): number => Math.floor((clamp(rankScore, 1, JURYO_SIZE) - 1) / 2) + 1;
const toMakushitaNumber = (rankScore: number): number =>
  Math.floor((clamp(rankScore, 1, MAKUSHITA_POOL_SIZE) - 1) / 2) + 1;

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

const resolveBoundaryPressure = (
  direction: 'promotion' | 'demotion',
  division: 'Juryo' | 'Makushita',
  rankScore: number,
  wins: number,
  losses: number,
  absent: number,
): number => {
  const key =
    division === 'Juryo'
      ? direction === 'promotion'
        ? 'JuryoToMakuuchi'
        : 'JuryoToMakushita'
      : direction === 'promotion'
        ? 'MakushitaToJuryo'
        : 'MakushitaToSandanme';
  const rate = getHeiseiBoundaryExchangeRate(key);
  if (rate <= 0) return 0;
  const effectiveLosses = losses + absent;
  const diff = wins - effectiveLosses;
  if (direction === 'promotion' && diff <= 0) return 0;
  if (direction === 'demotion' && diff >= 0) return 0;
  const size = division === 'Juryo' ? JURYO_SIZE : 60;
  const number = division === 'Juryo' ? toJuryoNumber(rankScore) : toMakushitaNumber(rankScore);
  const proximity =
    direction === 'promotion'
      ? 1 - (number - 1) / Math.max(1, size - 1)
      : (number - 1) / Math.max(1, size - 1);
  return clamp(rate * proximity * Math.abs(diff), 0, 1);
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
    const mandatoryDemotion = row.id === 'PLAYER' && (
      playerFullAbsence ||
      (exchange.playerDemotedToMakushita && row.wins < row.losses)
    );
    const empirical = resolveEmpiricalSlotBand({
      division: 'Juryo',
      rankName: currentRank.name,
      rankNumber: currentRank.number,
      currentSlot,
      totalSlots: TOTAL_SLOTS,
      wins: row.wins,
      losses: row.losses,
      absent,
      mandatoryDemotion,
      promotionPressure: resolveBoundaryPressure('promotion', 'Juryo', row.rankScore, row.wins, row.losses, absent),
      demotionPressure: resolveBoundaryPressure('demotion', 'Juryo', row.rankScore, row.wins, row.losses, absent),
    });
    candidates.push({
      id: row.id,
      currentRank,
      wins: row.wins,
      losses: row.losses,
      absent,
      currentSlot,
      expectedSlot: empirical.expectedSlot,
      minSlot: empirical.minSlot,
      maxSlot: empirical.maxSlot,
      mandatoryDemotion,
      mandatoryPromotion: false,
      sourceDivision: 'Juryo',
      score: empirical.score,
      rankBand: empirical.rankBand,
      recordBucket: empirical.recordBucket,
      proposalBasis: empirical.proposalBasis,
    });
  }

  for (const row of makushitaResults) {
    if (row.rankScore > 30) continue;
    const currentSlot = toGlobalSlot('Makushita', row.rankScore);
    const currentRank = toCurrentRank('Makushita', row.rankScore);
    const mandatoryPromotion =
      row.id === 'PLAYER' &&
      exchange.playerPromotedToJuryo &&
      row.wins > row.losses;
    const empirical = resolveEmpiricalSlotBand({
      division: 'Makushita',
      rankName: currentRank.name,
      rankNumber: currentRank.number,
      currentSlot,
      totalSlots: TOTAL_SLOTS,
      wins: row.wins,
      losses: row.losses,
      absent: 0,
      mandatoryPromotion,
      promotionPressure: resolveBoundaryPressure('promotion', 'Makushita', row.rankScore, row.wins, row.losses, 0),
      demotionPressure: resolveBoundaryPressure('demotion', 'Makushita', row.rankScore, row.wins, row.losses, 0),
    });
    candidates.push({
      id: row.id,
      currentRank,
      wins: row.wins,
      losses: row.losses,
      absent: 0,
      currentSlot,
      expectedSlot: empirical.expectedSlot,
      minSlot: empirical.minSlot,
      maxSlot: empirical.maxSlot,
      mandatoryDemotion: false,
      mandatoryPromotion,
      sourceDivision: 'Makushita',
      score: empirical.score,
      rankBand: empirical.rankBand,
      recordBucket: empirical.recordBucket,
      proposalBasis: empirical.proposalBasis,
    });
  }

  if (!candidates.some((candidate) => candidate.id === 'PLAYER')) return undefined;
  const assignments =
    optimizeExpectedPlacements(candidates, TOTAL_SLOTS) ??
    reallocateWithMonotonicConstraints(candidates, TOTAL_SLOTS);
  const player = assignments.find((assignment) => assignment.id === 'PLAYER');
  if (!player) return undefined;
  return toRank(player.slot);
};
