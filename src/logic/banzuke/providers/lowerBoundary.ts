import { Rank } from '../../models';
import { BanzukeEngineVersion } from '../types';
import { reallocateWithMonotonicConstraints } from './expected/monotonic';
import { resolveExpectedPlacementScore } from './expected/scoring';
import { ExpectedSlotRangeByWinsSpec, resolveExpectedSlotBand } from './expected/slotBands';
import { ExpectedPlacementCandidate } from './expected/types';
import { optimizeExpectedPlacements } from '../optimizer';
import {
  BoundarySnapshot,
  LowerBoundaryExchange,
  LowerDivision,
  PlayerLowerRecord,
  DIVISION_SIZE,
} from '../../simulation/lower/types';
import { clamp } from '../../simulation/boundary/shared';

const ORDERED_DIVISIONS: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
const DIVISION_LABEL: Record<LowerDivision, string> = {
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
};

type LowerResults = Record<LowerDivision, BoundarySnapshot[]>;
type BoundaryJamCounts = {
  promotionJam: Record<LowerDivision, number>;
  demotionJam: Record<LowerDivision, number>;
};
export type LowerDivisionResolvedPlacement = {
  id: string;
  division: LowerDivision;
  rankScore: number;
  rank: Rank;
};
export type LowerDivisionPlacementResolution = {
  placements: LowerDivisionResolvedPlacement[];
  playerAssignedRank?: Rank;
};

const resolveDivisionSizes = (results: LowerResults): Record<LowerDivision, number> => ({
  Makushita: Math.max(
    1,
    (results.Makushita?.length ?? 0) > 0 ? results.Makushita.length : DIVISION_SIZE.Makushita,
  ),
  Sandanme: Math.max(
    1,
    (results.Sandanme?.length ?? 0) > 0 ? results.Sandanme.length : DIVISION_SIZE.Sandanme,
  ),
  Jonidan: Math.max(
    1,
    (results.Jonidan?.length ?? 0) > 0 ? results.Jonidan.length : DIVISION_SIZE.Jonidan,
  ),
  Jonokuchi: Math.max(
    1,
    (results.Jonokuchi?.length ?? 0) > 0 ? results.Jonokuchi.length : DIVISION_SIZE.Jonokuchi,
  ),
});

const resolveDivisionMaxNumbers = (
  sizes: Record<LowerDivision, number>,
): Record<LowerDivision, number> => ({
  Makushita: Math.max(1, Math.ceil(sizes.Makushita / 2)),
  Sandanme: Math.max(1, Math.ceil(sizes.Sandanme / 2)),
  Jonidan: Math.max(1, Math.ceil(sizes.Jonidan / 2)),
  Jonokuchi: Math.max(1, Math.ceil(sizes.Jonokuchi / 2)),
});

const resolveOffsets = (
  sizes: Record<LowerDivision, number>,
): Record<LowerDivision, number> => {
  let cursor = 0;
  const offsets = {} as Record<LowerDivision, number>;
  for (const division of ORDERED_DIVISIONS) {
    offsets[division] = cursor;
    cursor += sizes[division];
  }
  return offsets;
};

const MAKUSHITA_SLOT_RANGE_BY_WINS: Partial<Record<number, ExpectedSlotRangeByWinsSpec>> = {
  7: { min: 74, max: 112, sign: 1 },
  6: { min: 44, max: 74, sign: 1 },
  5: { min: 26, max: 46, sign: 1 },
  4: { min: 10, max: 18, sign: 1 },
  3: { min: 14, max: 22, sign: -1 },
  2: { min: 48, max: 72, sign: -1 },
  1: { min: 86, max: 122, sign: -1 },
  0: { min: 140, max: 186, sign: -1 },
};

const LOWER_MASSIVE_SLOT_RANGE_BY_WINS: Partial<Record<number, ExpectedSlotRangeByWinsSpec>> = {
  7: { min: 128, max: 212, sign: 1 },
  6: { min: 88, max: 152, sign: 1 },
  5: { min: 56, max: 96, sign: 1 },
  4: { min: 16, max: 30, sign: 1 },
  3: { min: 22, max: 44, sign: -1 },
  2: { min: 84, max: 150, sign: -1 },
  1: { min: 132, max: 216, sign: -1 },
  0: { min: 192, max: 292, sign: -1 },
};

const LOWER_SLOT_RANGE_BY_DIVISION: Record<LowerDivision, Partial<Record<number, ExpectedSlotRangeByWinsSpec>>> = {
  Makushita: MAKUSHITA_SLOT_RANGE_BY_WINS,
  Sandanme: LOWER_MASSIVE_SLOT_RANGE_BY_WINS,
  Jonidan: LOWER_MASSIVE_SLOT_RANGE_BY_WINS,
  Jonokuchi: LOWER_MASSIVE_SLOT_RANGE_BY_WINS,
};

const resolveTotalLosses = (losses: number, absent: number): number =>
  losses + absent;

const resolvePlayerMinimumDemotionSlots = (
  division: LowerDivision,
  wins: number,
  losses: number,
  absent: number,
  rankProgress: number,
): number => {
  const totalLosses = resolveTotalLosses(losses, absent);
  if (absent < 7) {
    const deficit = Math.max(1, totalLosses - wins);
    const severeBoost = deficit >= 3 ? 10 : 0;
    const lowerLaneBoost = rankProgress >= 0.68 ? 12 : 0;
    const divisionBias =
      division === 'Makushita' ? 8 : division === 'Sandanme' ? 10 : division === 'Jonidan' ? 12 : 8;
    return clamp(deficit * 14 + severeBoost + lowerLaneBoost + divisionBias, 10, 150);
  }
  if (division === 'Makushita') return 160;
  if (division === 'Sandanme') return 150;
  if (division === 'Jonidan') return 130;
  return 90;
};

const resolveBoundaryJamCounts = (
  results: LowerResults,
  divisionSizes: Record<LowerDivision, number>,
): BoundaryJamCounts => {
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
    const size = divisionSizes[division];
    const upperLane = Math.max(10, Math.floor(size * 0.12));
    const lowerLane = Math.max(10, Math.floor(size * 0.12));
    promotionJam[division] = rows.filter((row) => row.rankScore <= upperLane && row.wins >= 4).length;
    demotionJam[division] = rows.filter((row) => {
      const absent = Math.max(0, 7 - (row.wins + row.losses));
      const totalLosses = resolveTotalLosses(row.losses, absent);
      return row.rankScore >= (size - lowerLane) && (row.wins <= 2 || totalLosses >= 5);
    }).length;
  }

  return { promotionJam, demotionJam };
};

const resolveCommitteeTurbulence = (
  division: LowerDivision,
  row: BoundarySnapshot,
  absent: number,
  rankProgress: number,
  jamCounts: BoundaryJamCounts,
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

const toGlobalSlot = (
  division: LowerDivision,
  rankScore: number,
  divisionOffsets: Record<LowerDivision, number>,
  divisionSizes: Record<LowerDivision, number>,
  totalSlots: number,
): number =>
  clamp(
    divisionOffsets[division] + clamp(rankScore, 1, divisionSizes[division]),
    1,
    totalSlots,
  );

const fromGlobalSlot = (
  slot: number,
  divisionOffsets: Record<LowerDivision, number>,
  divisionSizes: Record<LowerDivision, number>,
  totalSlots: number,
): { division: LowerDivision; rankScore: number } => {
  const bounded = clamp(slot, 1, totalSlots);
  for (const division of ORDERED_DIVISIONS) {
    const start = divisionOffsets[division] + 1;
    const end = divisionOffsets[division] + divisionSizes[division];
    if (bounded >= start && bounded <= end) {
      return { division, rankScore: bounded - divisionOffsets[division] };
    }
  }
  return { division: 'Jonokuchi', rankScore: divisionSizes.Jonokuchi };
};

const toRank = (
  division: LowerDivision,
  rankScore: number,
  divisionSizes: Record<LowerDivision, number>,
  divisionMaxNumbers: Record<LowerDivision, number>,
): Rank => {
  const bounded = clamp(rankScore, 1, divisionSizes[division]);
  const number = clamp(Math.floor((bounded - 1) / 2) + 1, 1, divisionMaxNumbers[division]);
  return {
    division,
    name: DIVISION_LABEL[division],
    number,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

const resolvePlayerMandatoryFlags = (
  playerRecord: PlayerLowerRecord,
): { mandatoryDemotion: boolean; mandatoryPromotion: boolean } => {
  const fullAbsence = playerRecord.absent >= 7;
  if (fullAbsence && playerRecord.rank.division !== 'Jonokuchi') {
    return { mandatoryDemotion: true, mandatoryPromotion: false };
  }
  return { mandatoryDemotion: false, mandatoryPromotion: false };
};

export const resolveLowerDivisionPlacements = (
  results: LowerResults,
  playerRecord?: PlayerLowerRecord,
  banzukeEngineVersion: BanzukeEngineVersion = 'legacy-v1',
): LowerDivisionPlacementResolution => {
  const divisionSizes = resolveDivisionSizes(results);
  const divisionMaxNumbers = resolveDivisionMaxNumbers(divisionSizes);
  const divisionOffsets = resolveOffsets(divisionSizes);
  const totalSlots = ORDERED_DIVISIONS.reduce((sum, division) => sum + divisionSizes[division], 0);
  const resolvedPlayerRecord: PlayerLowerRecord | undefined = (() => {
    if (playerRecord) return playerRecord;
    for (const division of ORDERED_DIVISIONS) {
      const row = (results[division] ?? []).find((candidate) => candidate.id === 'PLAYER');
      if (!row) continue;
      return {
        rank: toRank(division, row.rankScore, divisionSizes, divisionMaxNumbers),
        shikona: row.shikona,
        wins: row.wins,
        losses: row.losses,
        absent: Math.max(0, 7 - (row.wins + row.losses)),
      };
    }
    return undefined;
  })();
  const playerFlags =
    resolvedPlayerRecord &&
    ORDERED_DIVISIONS.includes(resolvedPlayerRecord.rank.division as LowerDivision)
      ? resolvePlayerMandatoryFlags(resolvedPlayerRecord)
      : { mandatoryDemotion: false, mandatoryPromotion: false };
  const jamCounts = resolveBoundaryJamCounts(results, divisionSizes);
  const candidates: ExpectedPlacementCandidate[] = [];
  for (const division of ORDERED_DIVISIONS) {
    const rows = results[division] ?? [];
    for (const row of rows) {
      const currentRank = toRank(division, row.rankScore, divisionSizes, divisionMaxNumbers);
      const currentSlot = toGlobalSlot(
        division,
        row.rankScore,
        divisionOffsets,
        divisionSizes,
        totalSlots,
      );
      const rankProgress = divisionSizes[division] <= 1
        ? 0
        : clamp(row.rankScore - 1, 0, divisionSizes[division] - 1) / (divisionSizes[division] - 1);
      const absent = row.id === 'PLAYER' && resolvedPlayerRecord
        ? resolvedPlayerRecord.absent
        : Math.max(0, 7 - (row.wins + row.losses));
      const totalLosses = resolveTotalLosses(row.losses, absent);
      const mandatoryDemotion = row.id === 'PLAYER' ? playerFlags.mandatoryDemotion : false;
      const mandatoryPromotion = row.id === 'PLAYER' ? playerFlags.mandatoryPromotion : false;
      const band = resolveExpectedSlotBand({
        currentSlot,
        wins: row.wins,
        losses: row.losses,
        absent,
        totalSlots,
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
      let expectedSlot = clamp(band.expectedSlot + turbulence, 1, totalSlots);
      let minSlot = clamp(band.minSlot + turbulence, 1, totalSlots);
      let maxSlot = clamp(band.maxSlot + turbulence, 1, totalSlots);
      if (mandatoryDemotion) {
        expectedSlot = Math.max(expectedSlot, currentSlot + 1);
        minSlot = Math.max(minSlot, currentSlot + 1);
      }
      if (mandatoryPromotion) {
        expectedSlot = Math.min(expectedSlot, currentSlot - 1);
        maxSlot = Math.min(maxSlot, currentSlot - 1);
      }
      if (row.id === 'PLAYER') {
        const isMakekoshi = row.wins < totalLosses;
        const isKachikoshi = row.wins > totalLosses;
        if (isMakekoshi) {
          const demotionFloor = clamp(
            currentSlot + resolvePlayerMinimumDemotionSlots(
              division,
              row.wins,
              row.losses,
              absent,
              rankProgress,
            ),
            1,
            totalSlots,
          );
          expectedSlot = Math.max(expectedSlot, demotionFloor);
          minSlot = Math.max(minSlot, demotionFloor);
        } else if (isKachikoshi) {
          const promotionCeiling = clamp(currentSlot - 1, 1, totalSlots);
          expectedSlot = Math.min(expectedSlot, promotionCeiling);
          maxSlot = Math.min(maxSlot, promotionCeiling);
        }
      }
      minSlot = clamp(Math.min(minSlot, maxSlot), 1, totalSlots);
      maxSlot = clamp(Math.max(minSlot, maxSlot), 1, totalSlots);
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

  const assignments =
    banzukeEngineVersion === 'optimizer-v1'
      ? optimizeExpectedPlacements(candidates, totalSlots) ??
        reallocateWithMonotonicConstraints(candidates, totalSlots)
      : reallocateWithMonotonicConstraints(candidates, totalSlots);
  const player = assignments.find((assignment) => assignment.id === 'PLAYER');

  const placements: LowerDivisionResolvedPlacement[] = assignments.map((assignment) => {
    const resolved = fromGlobalSlot(assignment.slot, divisionOffsets, divisionSizes, totalSlots);
    return {
      id: assignment.id,
      division: resolved.division,
      rankScore: resolved.rankScore,
      rank: toRank(resolved.division, resolved.rankScore, divisionSizes, divisionMaxNumbers),
    };
  });

  if (
    player &&
    resolvedPlayerRecord &&
    resolvedPlayerRecord.rank.division === 'Jonokuchi' &&
    resolvedPlayerRecord.absent >= 7
  ) {
    return {
      placements,
      playerAssignedRank: toRank(
        'Jonokuchi',
        divisionSizes.Jonokuchi,
        divisionSizes,
        divisionMaxNumbers,
      ),
    };
  }
  if (!player) {
    return {
      placements,
      playerAssignedRank: undefined,
    };
  }

  const resolved = fromGlobalSlot(player.slot, divisionOffsets, divisionSizes, totalSlots);
  return {
    placements,
    playerAssignedRank: toRank(
      resolved.division,
      resolved.rankScore,
      divisionSizes,
      divisionMaxNumbers,
    ),
  };
};

export const resolveLowerAssignedNextRank = (
  results: LowerResults,
  _exchanges: {
    MakushitaSandanme: LowerBoundaryExchange;
    SandanmeJonidan: LowerBoundaryExchange;
    JonidanJonokuchi: LowerBoundaryExchange;
  },
  playerRecord?: PlayerLowerRecord,
  banzukeEngineVersion: BanzukeEngineVersion = 'legacy-v1',
): Rank | undefined => resolveLowerDivisionPlacements(
  results,
  playerRecord,
  banzukeEngineVersion,
).playerAssignedRank;
