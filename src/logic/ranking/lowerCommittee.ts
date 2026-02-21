import { Rank } from '../models';
import { reallocateWithMonotonicConstraints } from './expected/monotonic';
import { resolveExpectedPlacementScore } from './expected/scoring';
import { ExpectedSlotRangeByWinsSpec, resolveExpectedSlotBand } from './expected/slotBands';
import { ExpectedPlacementCandidate } from './expected/types';
import {
  BoundarySnapshot,
  LowerBoundaryExchange,
  LowerDivision,
  PlayerLowerRecord,
  DIVISION_SIZE,
  DIVISION_MAX_NUMBER,
} from '../simulation/lower/types';
import { clamp } from '../simulation/boundary/shared';

const ORDERED_DIVISIONS: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const DIVISION_LABEL: Record<LowerDivision, string> = {
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
};

type LowerResults = Record<LowerDivision, BoundarySnapshot[]>;
type LowerExchanges = {
  MakushitaSandanme: LowerBoundaryExchange;
  SandanmeJonidan: LowerBoundaryExchange;
  JonidanJonokuchi: LowerBoundaryExchange;
};

const resolveOffsets = (): Record<LowerDivision, number> => {
  let cursor = 0;
  const offsets = {} as Record<LowerDivision, number>;
  for (const division of ORDERED_DIVISIONS) {
    offsets[division] = cursor;
    cursor += DIVISION_SIZE[division];
  }
  return offsets;
};

const LOWER_OFFSETS = resolveOffsets();
const LOWER_TOTAL_SLOTS = ORDERED_DIVISIONS.reduce((sum, division) => sum + DIVISION_SIZE[division], 0);

const MAKUSHITA_SLOT_RANGE_BY_WINS: Partial<Record<number, ExpectedSlotRangeByWinsSpec>> = {
  7: { min: 44, max: 68, sign: 1 },
  6: { min: 28, max: 42, sign: 1 },
  5: { min: 20, max: 32, sign: 1 },
  4: { min: 8, max: 14, sign: 1 },
  3: { min: 10, max: 16, sign: -1 },
  2: { min: 34, max: 48, sign: -1 },
  1: { min: 60, max: 82, sign: -1 },
  0: { min: 100, max: 132, sign: -1 },
};

const LOWER_MASSIVE_SLOT_RANGE_BY_WINS: Partial<Record<number, ExpectedSlotRangeByWinsSpec>> = {
  7: { min: 60, max: 100, sign: 1 },
  6: { min: 28, max: 48, sign: 1 },
  5: { min: 16, max: 28, sign: 1 },
  4: { min: 10, max: 18, sign: 1 },
  3: { min: 16, max: 28, sign: -1 },
  2: { min: 36, max: 60, sign: -1 },
  1: { min: 60, max: 92, sign: -1 },
  0: { min: 100, max: 144, sign: -1 },
};

const LOWER_SLOT_RANGE_BY_DIVISION: Record<LowerDivision, Partial<Record<number, ExpectedSlotRangeByWinsSpec>>> = {
  Makushita: MAKUSHITA_SLOT_RANGE_BY_WINS,
  Sandanme: LOWER_MASSIVE_SLOT_RANGE_BY_WINS,
  Jonidan: LOWER_MASSIVE_SLOT_RANGE_BY_WINS,
  Jonokuchi: LOWER_MASSIVE_SLOT_RANGE_BY_WINS,
};

const resolvePlayerMinimumDemotionSlots = (
  division: LowerDivision,
  absent: number,
): number => {
  if (absent < 7) return 1;
  if (division === 'Makushita') return 30;
  if (division === 'Sandanme') return 24;
  if (division === 'Jonidan') return 24;
  return 12;
};

const resolveBoundaryJamCounts = (
  results: LowerResults,
): {
  promotionJam: Record<LowerDivision, number>;
  demotionJam: Record<LowerDivision, number>;
} => {
  const promotionJam = {
    Makushita: 0,
    Sandanme: 0,
    Jonidan: 0,
    Jonokuchi: 0,
  } satisfies Record<LowerDivision, number>;
  const demotionJam = {
    Makushita: 0,
    Sandanme: 0,
    Jonidan: 0,
    Jonokuchi: 0,
  } satisfies Record<LowerDivision, number>;

  for (const division of ORDERED_DIVISIONS) {
    const rows = results[division] ?? [];
    const size = DIVISION_SIZE[division];
    const upperLane = Math.max(10, Math.floor(size * 0.12));
    const lowerLane = Math.max(10, Math.floor(size * 0.12));
    promotionJam[division] = rows.filter((row) => row.rankScore <= upperLane && row.wins >= 4).length;
    demotionJam[division] = rows.filter((row) =>
      row.rankScore >= (size - lowerLane) && (row.wins <= 2 || row.losses >= 5)).length;
  }

  return { promotionJam, demotionJam };
};

const resolveCommitteeTurbulence = (
  division: LowerDivision,
  row: BoundarySnapshot,
  absent: number,
  rankProgress: number,
  jamCounts: {
    promotionJam: Record<LowerDivision, number>;
    demotionJam: Record<LowerDivision, number>;
  },
): number => {
  const isExtremePromotion = row.wins >= 6;
  const isExtremeDemotion = row.wins <= 1 || absent >= 7;
  if (!isExtremePromotion && !isExtremeDemotion) return 0;

  let turbulence = 0;
  if (isExtremePromotion) {
    if (rankProgress <= 0.15) turbulence += 1;
    if (rankProgress >= 0.8) turbulence -= 1;
    if (jamCounts.promotionJam[division] >= 6) turbulence += 1;
  }
  if (isExtremeDemotion) {
    if (rankProgress <= 0.2) turbulence += 1;
    if (rankProgress >= 0.85) turbulence -= 1;
    if (jamCounts.demotionJam[division] >= 6) turbulence -= 1;
  }

  const deterministicJitter =
    ((row.rankScore + row.wins * 3 + row.losses * 5 + row.id.length) % 3) - 1;
  turbulence += deterministicJitter;
  return clamp(turbulence, -2, 2);
};

const toGlobalSlot = (division: LowerDivision, rankScore: number): number =>
  clamp(LOWER_OFFSETS[division] + clamp(rankScore, 1, DIVISION_SIZE[division]), 1, LOWER_TOTAL_SLOTS);

const fromGlobalSlot = (slot: number): { division: LowerDivision; rankScore: number } => {
  const bounded = clamp(slot, 1, LOWER_TOTAL_SLOTS);
  for (const division of ORDERED_DIVISIONS) {
    const start = LOWER_OFFSETS[division] + 1;
    const end = LOWER_OFFSETS[division] + DIVISION_SIZE[division];
    if (bounded >= start && bounded <= end) {
      return { division, rankScore: bounded - LOWER_OFFSETS[division] };
    }
  }
  return { division: 'Jonokuchi', rankScore: DIVISION_SIZE.Jonokuchi };
};

const toRank = (division: LowerDivision, rankScore: number): Rank => {
  const bounded = clamp(rankScore, 1, DIVISION_SIZE[division]);
  const number = clamp(Math.floor((bounded - 1) / 2) + 1, 1, DIVISION_MAX_NUMBER[division]);
  return {
    division,
    name: DIVISION_LABEL[division],
    number,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

const resolvePlayerMandatoryFlags = (
  playerRecord: PlayerLowerRecord,
  exchanges: LowerExchanges,
): { mandatoryDemotion: boolean; mandatoryPromotion: boolean } => {
  const fullAbsence = playerRecord.absent >= 7;
  if (fullAbsence && playerRecord.rank.division !== 'Jonokuchi') {
    return { mandatoryDemotion: true, mandatoryPromotion: false };
  }

  if (playerRecord.rank.division === 'Makushita') {
    return {
      mandatoryDemotion: exchanges.MakushitaSandanme.playerDemotedToLower,
      mandatoryPromotion: false,
    };
  }
  if (playerRecord.rank.division === 'Sandanme') {
    return {
      mandatoryDemotion: exchanges.SandanmeJonidan.playerDemotedToLower,
      mandatoryPromotion: exchanges.MakushitaSandanme.playerPromotedToUpper,
    };
  }
  if (playerRecord.rank.division === 'Jonidan') {
    return {
      mandatoryDemotion: exchanges.JonidanJonokuchi.playerDemotedToLower,
      mandatoryPromotion: exchanges.SandanmeJonidan.playerPromotedToUpper,
    };
  }
  return {
    mandatoryDemotion: false,
    mandatoryPromotion: exchanges.JonidanJonokuchi.playerPromotedToUpper,
  };
};

export const resolveLowerAssignedNextRank = (
  results: LowerResults,
  exchanges: LowerExchanges,
  playerRecord?: PlayerLowerRecord,
): Rank | undefined => {
  if (!playerRecord) return undefined;
  const playerDivision = playerRecord.rank.division;
  if (!ORDERED_DIVISIONS.includes(playerDivision as LowerDivision)) return undefined;

  const playerFlags = resolvePlayerMandatoryFlags(playerRecord, exchanges);
  const jamCounts = resolveBoundaryJamCounts(results);
  const candidates: ExpectedPlacementCandidate[] = [];
  for (const division of ORDERED_DIVISIONS) {
    const rows = results[division] ?? [];
    for (const row of rows) {
      const currentRank = toRank(division, row.rankScore);
      const currentSlot = toGlobalSlot(division, row.rankScore);
      const rankProgress = DIVISION_SIZE[division] <= 1
        ? 0
        : clamp(row.rankScore - 1, 0, DIVISION_SIZE[division] - 1) / (DIVISION_SIZE[division] - 1);
      const absent = row.id === 'PLAYER' ? playerRecord.absent : Math.max(0, 7 - (row.wins + row.losses));
      const mandatoryDemotion = row.id === 'PLAYER' ? playerFlags.mandatoryDemotion : false;
      const mandatoryPromotion = row.id === 'PLAYER' ? playerFlags.mandatoryPromotion : false;
      const band = resolveExpectedSlotBand({
        currentSlot,
        wins: row.wins,
        losses: row.losses,
        absent,
        totalSlots: LOWER_TOTAL_SLOTS,
        rankProgress,
        slotRangeByWins: LOWER_SLOT_RANGE_BY_DIVISION[division],
        mandatoryDemotion,
        mandatoryPromotion,
      });
      const turbulence = resolveCommitteeTurbulence(
        division,
        row,
        absent,
        rankProgress,
        jamCounts,
      );
      let expectedSlot = clamp(band.expectedSlot + turbulence, 1, LOWER_TOTAL_SLOTS);
      let minSlot = clamp(band.minSlot + turbulence, 1, LOWER_TOTAL_SLOTS);
      let maxSlot = clamp(band.maxSlot + turbulence, 1, LOWER_TOTAL_SLOTS);
      if (mandatoryDemotion) {
        expectedSlot = Math.max(expectedSlot, currentSlot + 1);
        minSlot = Math.max(minSlot, currentSlot + 1);
      }
      if (mandatoryPromotion) {
        expectedSlot = Math.min(expectedSlot, currentSlot - 1);
        maxSlot = Math.min(maxSlot, currentSlot - 1);
      }
      if (row.id === 'PLAYER') {
        const isMakekoshi = row.wins < row.losses;
        const isKachikoshi = row.wins > row.losses;
        if (isMakekoshi) {
          const demotionFloor = clamp(
            currentSlot + resolvePlayerMinimumDemotionSlots(division, absent),
            1,
            LOWER_TOTAL_SLOTS,
          );
          expectedSlot = Math.max(expectedSlot, demotionFloor);
          minSlot = Math.max(minSlot, clamp(currentSlot + 1, 1, LOWER_TOTAL_SLOTS));
        } else if (isKachikoshi) {
          const promotionCeiling = clamp(currentSlot - 1, 1, LOWER_TOTAL_SLOTS);
          expectedSlot = Math.min(expectedSlot, promotionCeiling);
          maxSlot = Math.min(maxSlot, promotionCeiling);
        }
      }
      minSlot = clamp(Math.min(minSlot, maxSlot), 1, LOWER_TOTAL_SLOTS);
      maxSlot = clamp(Math.max(minSlot, maxSlot), 1, LOWER_TOTAL_SLOTS);
      expectedSlot = clamp(expectedSlot, minSlot, maxSlot);
      const score = resolveExpectedPlacementScore(
        currentRank,
        row.wins,
        row.losses,
        absent,
        mandatoryDemotion,
        mandatoryPromotion,
      );
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
        mandatoryPromotion,
        sourceDivision: division,
        score,
      });
    }
  }

  if (!candidates.some((candidate) => candidate.id === 'PLAYER')) return undefined;
  const assignments = reallocateWithMonotonicConstraints(candidates, LOWER_TOTAL_SLOTS);
  const player = assignments.find((assignment) => assignment.id === 'PLAYER');
  if (!player) return undefined;

  const resolved = fromGlobalSlot(player.slot);
  if (playerRecord.rank.division === 'Jonokuchi' && playerRecord.absent >= 7) {
    return toRank('Jonokuchi', DIVISION_SIZE.Jonokuchi);
  }
  return toRank(resolved.division, resolved.rankScore);
};
