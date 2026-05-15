import { Rank } from '../../models';
import { formatRankDisplayName } from '../../ranking';
import { BanzukeEngineVersion } from '../types';
import {
  OptimizerPlacementTrace,
  optimizeExpectedPlacements,
  optimizeExpectedPlacementsWithTrace,
} from '../optimizer';
import { DEFAULT_SCALE_SLOTS } from '../scale/rankLimits';
import { reallocateWithMonotonicConstraints } from './expected/monotonic';
import { orderExpectedPlacementCandidates } from './expected/order';
import { ExpectedPlacementCandidate } from './expected/types';
import { resolveEmpiricalSlotBand } from './empirical';
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

export interface LowerDivisionCandidateTrace {
  id: string;
  tier: TierClassification;
  sourceDivision: LowerDivision;
  currentRankLabel: string;
  currentSlot: number;
  expectedSlot: number;
  minSlot: number;
  maxSlot: number;
  assignedSlot?: number;
  assignedRankLabel?: string;
  wins: number;
  losses: number;
  absent: number;
  score: number;
  rankBand?: string;
  recordBucket?: string;
  proposalBasis?: string;
}

export interface LowerDivisionPlacementDiagnosticTrace {
  totalSlots: number;
  divisionSizes: Record<LowerDivision, number>;
  divisionOffsets: Record<LowerDivision, number>;
  boundarySlots: number[];
  playerSlot?: number;
  tierCounts: Record<TierClassification, number>;
  optimizerTrace?: OptimizerPlacementTrace;
  optimizerUsed: boolean;
  monotonicFallbackUsed: boolean;
  candidates: LowerDivisionCandidateTrace[];
  player?: LowerDivisionCandidateTrace;
  playerBlockers: LowerDivisionCandidateTrace[];
  playerAssignedSlot?: number;
  playerAssignedRankLabel?: string;
}

type LowerDivisionPlacementDiagnosticSink = (
  trace: LowerDivisionPlacementDiagnosticTrace,
) => void;

let lowerDivisionPlacementDiagnosticSink: LowerDivisionPlacementDiagnosticSink | undefined;

export const setLowerDivisionPlacementDiagnosticSink = (
  sink: LowerDivisionPlacementDiagnosticSink | undefined,
): LowerDivisionPlacementDiagnosticSink | undefined => {
  const previous = lowerDivisionPlacementDiagnosticSink;
  lowerDivisionPlacementDiagnosticSink = sink;
  return previous;
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

const toRankLabel = (rank: Rank): string => {
  return formatRankDisplayName(rank);
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

/**
 * 部門境界からのスロット距離に基づいて候補をTier分類する。
 * Tier 1: プレイヤー + 境界±BOUNDARY_BUFFER枚以内 + プレイヤー±PLAYER_BUFFER枚以内 → DP最適化
 * Tier 2: それ以外 → 決定的計算 + 単調性制約のみ
 */
const BOUNDARY_BUFFER = 15;
const PLAYER_BUFFER = 15;

type TierClassification = 'TIER1_PRECISE' | 'TIER2_DETERMINISTIC';

const classifyTier = (
  slot: number,
  playerSlot: number | undefined,
  boundarySlots: number[],
  isPlayer: boolean,
): TierClassification => {
  if (isPlayer) return 'TIER1_PRECISE';
  for (const boundary of boundarySlots) {
    if (Math.abs(slot - boundary) <= BOUNDARY_BUFFER) return 'TIER1_PRECISE';
  }
  if (playerSlot !== undefined && Math.abs(slot - playerSlot) <= PLAYER_BUFFER) {
    return 'TIER1_PRECISE';
  }
  return 'TIER2_DETERMINISTIC';
};

const resolveBoundarySlots = (
  divisionOffsets: Record<LowerDivision, number>,
  divisionSizes: Record<LowerDivision, number>,
): number[] => {
  const slots: number[] = [];
  for (const division of ORDERED_DIVISIONS) {
    // 各部門の先頭と末尾が境界
    const start = divisionOffsets[division] + 1;
    const end = divisionOffsets[division] + divisionSizes[division];
    slots.push(start, end);
  }
  return slots;
};

const buildCandidate = (
  row: BoundarySnapshot,
  division: LowerDivision,
  resolvedPlayerRecord: PlayerLowerRecord | undefined,
  playerFlags: { mandatoryDemotion: boolean; mandatoryPromotion: boolean },
  divisionSizes: Record<LowerDivision, number>,
  divisionMaxNumbers: Record<LowerDivision, number>,
  divisionOffsets: Record<LowerDivision, number>,
  totalSlots: number,
): ExpectedPlacementCandidate => {
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
  const empirical = resolveEmpiricalSlotBand({
    division,
    rankName: currentRank.name,
    rankNumber: currentRank.number,
    currentSlot,
    totalSlots,
    divisionTotalSlots: divisionSizes[division],
    baselineDivisionTotalSlots: DEFAULT_SCALE_SLOTS[division],
    wins: row.wins,
    losses: row.losses,
    absent,
    mandatoryDemotion,
    mandatoryPromotion,
  });
  const headPromotionDivision =
    currentRank.number === 1 &&
    row.wins > row.losses &&
    currentRank.division !== 'Makushita'
      ? UPPER_DIVISION[currentRank.division as LowerDivision]
      : undefined;
  const boundaryPromotionSlot = headPromotionDivision
    ? toGlobalSlot(
      headPromotionDivision,
      divisionSizes[headPromotionDivision],
      divisionOffsets,
      divisionSizes,
      totalSlots,
    )
    : undefined;
  const expectedSlot = boundaryPromotionSlot
    ? Math.min(empirical.expectedSlot, boundaryPromotionSlot)
    : empirical.expectedSlot;
  const minSlot = boundaryPromotionSlot
    ? Math.min(empirical.minSlot, boundaryPromotionSlot)
    : empirical.minSlot;
  const maxSlot = boundaryPromotionSlot
    ? Math.min(empirical.maxSlot, currentSlot - 1)
    : empirical.maxSlot;
  return {
    id: row.id,
    currentRank,
    wins: row.wins,
    losses: row.losses,
    absent,
    currentSlot,
    expectedSlot,
    minSlot: clamp(Math.min(minSlot, maxSlot), 1, totalSlots),
    maxSlot: clamp(Math.max(minSlot, maxSlot), 1, totalSlots),
    mandatoryDemotion,
    mandatoryPromotion,
    sourceDivision: division,
    score: empirical.score,
    rankBand: empirical.rankBand,
    recordBucket: empirical.recordBucket,
    proposalBasis: empirical.proposalBasis,
  };
};

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
  // プレイヤーが下位にいるか判定し、playerSlotを計算
  const playerSlot = (() => {
    if (!resolvedPlayerRecord) return undefined;
    const division = resolvedPlayerRecord.rank.division as LowerDivision;
    if (!ORDERED_DIVISIONS.includes(division)) return undefined;
    const rankScore = ((resolvedPlayerRecord.rank.number ?? 1) - 1) * 2 +
      (resolvedPlayerRecord.rank.side === 'West' ? 2 : 1);
    return toGlobalSlot(division, rankScore, divisionOffsets, divisionSizes, totalSlots);
  })();

  // 境界スロットを計算
  const boundarySlots = resolveBoundarySlots(divisionOffsets, divisionSizes);

  // 全候補を構築し、Tier分類する
  const tier1Candidates: ExpectedPlacementCandidate[] = [];
  const tier2Candidates: ExpectedPlacementCandidate[] = [];
  const tierById = new Map<string, TierClassification>();
  const candidateById = new Map<string, ExpectedPlacementCandidate>();

  for (const division of ORDERED_DIVISIONS) {
    for (const row of results[division] ?? []) {
      const candidate = buildCandidate(
        row, division, resolvedPlayerRecord, playerFlags,
        divisionSizes, divisionMaxNumbers, divisionOffsets, totalSlots,
      );
      const tier = classifyTier(candidate.currentSlot, playerSlot, boundarySlots, row.id === 'PLAYER');
      tierById.set(candidate.id, tier);
      candidateById.set(candidate.id, candidate);
      if (tier === 'TIER1_PRECISE') {
        tier1Candidates.push(candidate);
      } else {
        tier2Candidates.push(candidate);
      }
    }
  }

  // Tier 2: 決定的計算でスロットを割り当て（expectedSlotを基点に Tier2 同士の衝突も解消）
  const tier2OccupiedSlots = new Set<number>();
  const tier2Assignments: { id: string; slot: number }[] = [];
  const sortedTier2 = tier2Candidates.slice().sort((a, b) => {
    const slotA = clamp(a.expectedSlot, 1, totalSlots);
    const slotB = clamp(b.expectedSlot, 1, totalSlots);
    if (slotA !== slotB) return slotA - slotB;
    return a.id.localeCompare(b.id);
  });
  for (const candidate of sortedTier2) {
    const desired = clamp(candidate.expectedSlot, 1, totalSlots);
    let slot = desired;
    if (tier2OccupiedSlots.has(slot)) {
      let offset = 1;
      let resolved = false;
      while (offset <= totalSlots) {
        const up = desired - offset;
        if (up >= 1 && !tier2OccupiedSlots.has(up)) {
          slot = up;
          resolved = true;
          break;
        }
        const down = desired + offset;
        if (down <= totalSlots && !tier2OccupiedSlots.has(down)) {
          slot = down;
          resolved = true;
          break;
        }
        offset += 1;
      }
      if (!resolved) continue;
    }
    tier2OccupiedSlots.add(slot);
    tier2Assignments.push({ id: candidate.id, slot });
  }

  // Tier 1: DP最適化で精密配置（Tier 2の割り当てを尊重）
  let tier1Assignments: { id: string; slot: number }[];
  let optimizerTrace: OptimizerPlacementTrace | undefined;
  let monotonicFallbackUsed = false;
  if (tier1Candidates.length > 0) {
    const orderedTier1 = orderExpectedPlacementCandidates(tier1Candidates);
    const optimized = lowerDivisionPlacementDiagnosticSink
      ? (() => {
        optimizerTrace = optimizeExpectedPlacementsWithTrace(orderedTier1, totalSlots);
        return optimizerTrace.assignmentSource === 'dp' ? optimizerTrace.assignments : undefined;
      })()
      : optimizeExpectedPlacements(orderedTier1, totalSlots);
    const rawAssignments = optimized ?? reallocateWithMonotonicConstraints(orderedTier1, totalSlots);
    monotonicFallbackUsed = !optimized;

    // Tier 2とのスロット衝突を解決: Tier 1の結果を優先し、衝突したTier 2をずらす
    const tier1SlotSet = new Set(rawAssignments.map((a) => a.slot));
    for (const t2 of tier2Assignments) {
      if (tier1SlotSet.has(t2.slot)) {
        // 近傍の空きスロットを探す
        let offset = 1;
        while (offset <= totalSlots) {
          const up = t2.slot - offset;
          if (up >= 1 && !tier1SlotSet.has(up) && !tier2OccupiedSlots.has(up)) {
            tier2OccupiedSlots.delete(t2.slot);
            t2.slot = up;
            tier2OccupiedSlots.add(up);
            break;
          }
          const down = t2.slot + offset;
          if (down <= totalSlots && !tier1SlotSet.has(down) && !tier2OccupiedSlots.has(down)) {
            tier2OccupiedSlots.delete(t2.slot);
            t2.slot = down;
            tier2OccupiedSlots.add(down);
            break;
          }
          offset += 1;
        }
      }
    }
    tier1Assignments = rawAssignments;
  } else {
    tier1Assignments = [];
  }

  // 全割り当てを統合
  const allAssignments = [...tier1Assignments, ...tier2Assignments];
  const assignmentById = new Map(allAssignments.map((assignment) => [assignment.id, assignment.slot]));

  if (lowerDivisionPlacementDiagnosticSink) {
    const candidates: LowerDivisionCandidateTrace[] = [...candidateById.values()]
      .map((candidate) => {
        const assignedSlot = assignmentById.get(candidate.id);
        const assignedPosition = assignedSlot === undefined
          ? undefined
          : fromGlobalSlot(assignedSlot, divisionOffsets, divisionSizes, totalSlots);
        const assignedRank = assignedPosition
          ? toRank(assignedPosition.division, assignedPosition.rankScore, divisionSizes, divisionMaxNumbers)
          : undefined;
        return {
          id: candidate.id,
          tier: tierById.get(candidate.id) ?? 'TIER2_DETERMINISTIC',
          sourceDivision: candidate.sourceDivision as LowerDivision,
          currentRankLabel: toRankLabel(candidate.currentRank),
          currentSlot: candidate.currentSlot,
          expectedSlot: candidate.expectedSlot,
          minSlot: candidate.minSlot,
          maxSlot: candidate.maxSlot,
          assignedSlot,
          assignedRankLabel: assignedRank ? toRankLabel(assignedRank) : undefined,
          wins: candidate.wins,
          losses: candidate.losses,
          absent: candidate.absent,
          score: candidate.score,
          rankBand: candidate.rankBand,
          recordBucket: candidate.recordBucket,
          proposalBasis: candidate.proposalBasis,
        };
      })
      .sort((a, b) => a.currentSlot - b.currentSlot);
    const player = candidates.find((candidate) => candidate.id === 'PLAYER');
    const playerAssignedSlot = player ? assignmentById.get('PLAYER') : undefined;
    const blockerMin = player ? Math.min(player.expectedSlot, playerAssignedSlot ?? player.expectedSlot) : undefined;
    const blockerMax = player ? Math.max(player.expectedSlot, playerAssignedSlot ?? player.expectedSlot) : undefined;
    const playerBlockers = blockerMin === undefined || blockerMax === undefined
      ? []
      : candidates.filter((candidate) =>
        candidate.id !== 'PLAYER' &&
        candidate.assignedSlot !== undefined &&
        candidate.assignedSlot >= blockerMin &&
        candidate.assignedSlot <= blockerMax);
    const playerAssignedPosition = playerAssignedSlot === undefined
      ? undefined
      : fromGlobalSlot(playerAssignedSlot, divisionOffsets, divisionSizes, totalSlots);
    const playerAssignedRank = playerAssignedPosition
      ? toRank(playerAssignedPosition.division, playerAssignedPosition.rankScore, divisionSizes, divisionMaxNumbers)
      : undefined;
    lowerDivisionPlacementDiagnosticSink({
      totalSlots,
      divisionSizes,
      divisionOffsets,
      boundarySlots,
      playerSlot,
      tierCounts: {
        TIER1_PRECISE: tier1Candidates.length,
        TIER2_DETERMINISTIC: tier2Candidates.length,
      },
      optimizerTrace,
      optimizerUsed: optimizerTrace?.assignmentSource === 'dp',
      monotonicFallbackUsed,
      candidates,
      player,
      playerBlockers,
      playerAssignedSlot,
      playerAssignedRankLabel: playerAssignedRank ? toRankLabel(playerAssignedRank) : undefined,
    });
  }

  const placements: LowerDivisionResolvedPlacement[] = allAssignments.map((assignment) => {
    const resolved = fromGlobalSlot(assignment.slot, divisionOffsets, divisionSizes, totalSlots);
    return {
      id: assignment.id,
      division: resolved.division,
      rankScore: resolved.rankScore,
      rank: toRank(resolved.division, resolved.rankScore, divisionSizes, divisionMaxNumbers),
    };
  });
  const player = allAssignments.find((assignment) => assignment.id === 'PLAYER');
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
