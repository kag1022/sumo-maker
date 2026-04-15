import { Rank } from '../../models';
import { BanzukeEngineVersion } from '../types';
import { optimizeExpectedPlacements } from '../optimizer';
import { reallocateWithMonotonicConstraints } from './expected/monotonic';
import { orderExpectedPlacementCandidates } from './expected/order';
import { ExpectedPlacementCandidate } from './expected/types';
import { calculateLowerDivisionRankChange } from '../rules/lowerDivision';
import { resolveRuntimeRankBand, resolveRuntimeRecordBucket } from './runtimeMetadata';
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
const UPPER_DIVISION: Partial<Record<LowerDivision, LowerDivision>> = {
  Sandanme: 'Makushita',
  Jonidan: 'Sandanme',
  Jonokuchi: 'Jonidan',
};
type LowerResults = Record<LowerDivision, BoundarySnapshot[]>;

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
  Makushita: Math.max(1, results.Makushita?.length ?? DIVISION_SIZE.Makushita),
  Sandanme: Math.max(1, results.Sandanme?.length ?? DIVISION_SIZE.Sandanme),
  Jonidan: Math.max(1, results.Jonidan?.length ?? DIVISION_SIZE.Jonidan),
  Jonokuchi: Math.max(1, results.Jonokuchi?.length ?? DIVISION_SIZE.Jonokuchi),
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
): { mandatoryDemotion: boolean; mandatoryPromotion: boolean } => ({
  mandatoryDemotion: playerRecord.absent >= 7 && playerRecord.rank.division !== 'Jonokuchi',
  mandatoryPromotion:
    playerRecord.rank.division !== 'Makushita' &&
    (playerRecord.rank.number ?? 99) === 1 &&
    playerRecord.wins > playerRecord.losses + playerRecord.absent,
});

export const resolveLowerDivisionPlacements = (
  results: LowerResults,
  playerRecord?: PlayerLowerRecord,
  _banzukeEngineVersion: BanzukeEngineVersion = 'optimizer-v2',
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
        stableId: row.stableId,
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
  const scaleSlots = {
    Makushita: divisionSizes.Makushita,
    Sandanme: divisionSizes.Sandanme,
    Jonidan: divisionSizes.Jonidan,
    Jonokuchi: divisionSizes.Jonokuchi,
  };

  const candidates: ExpectedPlacementCandidate[] = [];
  for (const division of ORDERED_DIVISIONS) {
    for (const row of results[division] ?? []) {
      const currentRank = toRank(division, row.rankScore, divisionSizes, divisionMaxNumbers);
      const currentSlot = toGlobalSlot(
        division,
        row.rankScore,
        divisionOffsets,
        divisionSizes,
        totalSlots,
      );
      const absent = row.id === 'PLAYER' && resolvedPlayerRecord
        ? resolvedPlayerRecord.absent
        : Math.max(0, 7 - (row.wins + row.losses));
      const mandatoryDemotion = row.id === 'PLAYER' ? playerFlags.mandatoryDemotion : false;
      const mandatoryPromotion = row.id === 'PLAYER' ? playerFlags.mandatoryPromotion : false;
      const deterministic = calculateLowerDivisionRankChange({
        year: 2026,
        month: 1,
        rank: currentRank,
        wins: row.wins,
        losses: row.losses,
        absent,
        yusho: false,
        specialPrizes: [],
      }, { scaleSlots }, () => 0.5);
      const headPromotionDivision =
        currentRank.number === 1 &&
        row.wins > row.losses &&
        currentRank.division !== 'Makushita'
          ? UPPER_DIVISION[currentRank.division as LowerDivision]
          : undefined;
      const targetRank = headPromotionDivision
        ? {
          division: headPromotionDivision,
          name: DIVISION_LABEL[headPromotionDivision],
          number: divisionMaxNumbers[headPromotionDivision],
          side: 'East' as const,
        }
        : deterministic.nextRank.division === 'Maezumo'
        ? { ...deterministic.nextRank, division: 'Jonokuchi', name: '序ノ口' } as Rank
        : deterministic.nextRank;
      const targetSlot = toGlobalSlot(
        targetRank.division as LowerDivision,
        ((targetRank.number ?? 1) - 1) * 2 + (targetRank.side === 'West' ? 2 : 1),
        divisionOffsets,
        divisionSizes,
        totalSlots,
      );
      const radius = mandatoryDemotion || mandatoryPromotion ? 2 : Math.max(2, Math.abs(currentSlot - targetSlot) <= 3 ? 2 : 6);
      candidates.push({
        id: row.id,
        currentRank,
        wins: row.wins,
        losses: row.losses,
        absent,
        currentSlot,
        expectedSlot: targetSlot,
        minSlot: clamp(Math.min(targetSlot - radius, currentSlot), 1, totalSlots),
        maxSlot: clamp(Math.max(targetSlot + radius, currentSlot), 1, totalSlots),
        mandatoryDemotion,
        mandatoryPromotion,
        sourceDivision: division,
        score:
          (division === 'Makushita' ? 800 : division === 'Sandanme' ? 600 : division === 'Jonidan' ? 400 : 250) +
          row.wins * 40 -
          row.losses * 32 -
          absent * 24 -
          currentSlot * 0.8,
        rankBand: resolveRuntimeRankBand(division, currentRank.name, currentRank.number),
        recordBucket: resolveRuntimeRecordBucket(row.wins, row.losses, absent),
        proposalBasis: 'RULE_OVERRIDE',
      });
    }
  }

  const orderedCandidates = orderExpectedPlacementCandidates(candidates);
  const assignments =
    optimizeExpectedPlacements(orderedCandidates, totalSlots) ??
    reallocateWithMonotonicConstraints(orderedCandidates, totalSlots);
  const placements: LowerDivisionResolvedPlacement[] = assignments.map((assignment) => {
    const resolved = fromGlobalSlot(assignment.slot, divisionOffsets, divisionSizes, totalSlots);
    return {
      id: assignment.id,
      division: resolved.division,
      rankScore: resolved.rankScore,
      rank: toRank(resolved.division, resolved.rankScore, divisionSizes, divisionMaxNumbers),
    };
  });
  const player = assignments.find((assignment) => assignment.id === 'PLAYER');
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
    return { placements, playerAssignedRank: undefined };
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
  banzukeEngineVersion: BanzukeEngineVersion = 'optimizer-v2',
): Rank | undefined => resolveLowerDivisionPlacements(
  results,
  playerRecord,
  banzukeEngineVersion,
).playerAssignedRank;
