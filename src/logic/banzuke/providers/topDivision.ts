import { buildMakuuchiLayoutFromRanks } from '../scale/banzukeLayout';
import { normalizeSekitoriLosses } from '../rules/topDivisionRules';
import { allocateSekitoriSlots } from './sekitori/allocation';
import { resolveTopDirective, toHistoryScore } from './sekitori/directives';
import { compareByScore, compareRankKey, buildSekitoriContextSnapshot } from './sekitori/scoring';
import { applySekitoriSafetyGuard } from './sekitori/safety';
import { fromSekitoriSlot, isSekitoriDivision, SEKITORI_CAPACITY, toSekitoriSlot } from './sekitori/slots';
import { buildSekitoriOrderProfile } from './sekitori/contextual';
import {
  BanzukeAllocation,
  BanzukeCandidate,
  BashoRecordSnapshot,
} from './sekitori/types';

const assignOpenSide = (
  allocations: BanzukeAllocation[],
  rankName: '関脇' | '小結',
): 'East' | 'West' => {
  const used = new Set(
    allocations
      .filter((allocation) => allocation.nextRank.division === 'Makuuchi' && allocation.nextRank.name === rankName)
      .map((allocation) => allocation.nextRank.side)
      .filter((side): side is 'East' | 'West' => side === 'East' || side === 'West'),
  );
  return used.has('East') && !used.has('West') ? 'West' : 'East';
};

const ensureSanyakuFloor = (
  allocations: BanzukeAllocation[],
): BanzukeAllocation[] => {
  const next = allocations.slice();
  const makuuchi = next.filter((allocation) => allocation.nextRank.division === 'Makuuchi');
  const byScoreDesc = (left: BanzukeAllocation, right: BanzukeAllocation): number =>
    right.score - left.score || left.id.localeCompare(right.id);
  const byScoreAsc = (left: BanzukeAllocation, right: BanzukeAllocation): number =>
    left.score - right.score || left.id.localeCompare(right.id);

  const isProtectedUpperMaegashiraKachikoshi = (allocation: BanzukeAllocation): boolean =>
    allocation.currentRank.division === 'Makuuchi' &&
    allocation.currentRank.name === '前頭' &&
    (allocation.currentRank.number ?? 99) <= 5 &&
    allocation.recordDiff === 1;

  const canEmergencyFillSanyaku = (
    allocation: BanzukeAllocation,
    target: '関脇' | '小結',
  ): boolean => {
    if (allocation.nextRank.division !== 'Makuuchi') return false;
    if (
      allocation.currentRank.division === 'Makuuchi' &&
      (allocation.currentRank.name === '関脇' || allocation.currentRank.name === '小結')
    ) {
      return true;
    }
    if (allocation.nextRank.name !== '前頭') return false;
    if ((allocation.nextRank.number ?? 99) > (target === '関脇' ? 1 : 2)) return false;
    if (allocation.recordDiff <= 0) return false;
    if (isProtectedUpperMaegashiraKachikoshi(allocation)) return false;
    return true;
  };

  const canCompressSekiwakeOverflow = (allocation: BanzukeAllocation): boolean => {
    if (allocation.nextRank.division !== 'Makuuchi' || allocation.nextRank.name !== '関脇') return false;
    if (
      allocation.currentRank.division === 'Makuuchi' &&
      allocation.currentRank.name === '小結' &&
      allocation.recordDiff >= 2
    ) {
      return false;
    }
    return true;
  };

  const promoteToRank = (
    allocation: BanzukeAllocation | undefined,
    rankName: '関脇' | '小結',
  ): void => {
    if (!allocation) return;
    allocation.nextRank = {
      division: 'Makuuchi',
      name: rankName,
      side: assignOpenSide(next, rankName),
    };
  };

  const countOf = (rankName: '関脇' | '小結'): number =>
    makuuchi.filter((allocation) => allocation.nextRank.name === rankName).length;

  while (countOf('関脇') < 2) {
    const source =
      makuuchi
        .filter((allocation) => allocation.nextRank.name === '小結')
        .sort(byScoreDesc)[0] ??
      makuuchi
        .filter(
          (allocation) =>
            allocation.nextRank.name === '前頭' && canEmergencyFillSanyaku(allocation, '関脇'),
        )
        .sort(byScoreDesc)[0];
    if (!source) break;
    promoteToRank(source, '関脇');
  }

  while (countOf('小結') < 2) {
    const source =
      makuuchi
        .filter(
          (allocation) =>
            allocation.nextRank.name === '前頭' && canEmergencyFillSanyaku(allocation, '小結'),
        )
        .sort(byScoreDesc)[0] ??
      makuuchi
        .filter((allocation) => allocation.nextRank.name === '関脇')
        .sort(byScoreAsc)
        .find((allocation) => countOf('関脇') > 2 && canCompressSekiwakeOverflow(allocation));
    if (!source) break;
    promoteToRank(source, '小結');
  }

  return next;
};

export const generateNextBanzuke = (records: BashoRecordSnapshot[]): BanzukeAllocation[] => {
  const activeSekitori = records.filter(
    (record) => !record.isRetired && isSekitoriDivision(record.rank.division),
  );
  if (activeSekitori.length === 0) return [];

  const currentLayout = buildMakuuchiLayoutFromRanks(
    activeSekitori
      .filter((record) => record.rank.division === 'Makuuchi')
      .map((record) => record.rank),
  );
  const context = buildSekitoriContextSnapshot(activeSekitori);

  const candidates: BanzukeCandidate[] = activeSekitori.map((snapshot) => {
    const sourceDivision = snapshot.rank.division as BanzukeCandidate['sourceDivision'];
    const normalizedLosses = normalizeSekitoriLosses(
      snapshot.wins,
      snapshot.losses,
      snapshot.absent,
    );
    const directive = resolveTopDirective(snapshot);
    const currentSlot = toSekitoriSlot(snapshot.rank, currentLayout);
    const orderProfile = buildSekitoriOrderProfile(
      snapshot,
      directive,
      currentSlot,
      context,
      currentLayout,
    );
    const historyScore = (snapshot.pastRecords ?? [])
      .slice(0, 2)
      .reduce((sum, record, index) => sum + toHistoryScore(record) * (index === 0 ? 0.75 : 0.45), 0);
    const score = orderProfile.score + historyScore;
    return {
      snapshot,
      sourceDivision,
      normalizedLosses,
      score,
      currentSlot,
      directive,
      orderProfile: {
        ...orderProfile,
        score,
      },
    };
  });

  const sortedOverall = candidates.slice().sort(compareByScore);
  const totalSlots = Math.min(
    SEKITORI_CAPACITY.Makuuchi + SEKITORI_CAPACITY.Juryo,
    sortedOverall.length,
  );
  const makuuchiSlots = Math.min(SEKITORI_CAPACITY.Makuuchi, totalSlots);
  const { assignedSlotById, nextLayout } = allocateSekitoriSlots(
    sortedOverall,
    totalSlots,
    makuuchiSlots,
  );

  const resolvedAllocations = candidates
    .slice()
    .sort(compareRankKey)
    .map((candidate) => {
      const assignedSlot = assignedSlotById.get(candidate.snapshot.id) ?? candidate.currentSlot;
      const proposedRank = fromSekitoriSlot(assignedSlot, nextLayout);
      const nextRank = applySekitoriSafetyGuard(candidate, proposedRank, nextLayout);
      const nextIsOzekiKadoban =
        nextRank.division === 'Makuuchi' &&
        nextRank.name === '大関' &&
        candidate.directive.nextIsOzekiKadoban;
      const nextIsOzekiReturn =
        nextRank.division === 'Makuuchi' &&
        nextRank.name === '関脇' &&
        candidate.directive.nextIsOzekiReturn;
      return {
        id: candidate.snapshot.id,
        shikona: candidate.snapshot.shikona,
        currentRank: candidate.snapshot.rank,
        nextRank,
        score: candidate.score,
        recordDiff: candidate.snapshot.wins - candidate.normalizedLosses,
        sourceDivision: candidate.sourceDivision,
        nextIsOzekiKadoban,
        nextIsOzekiReturn,
      };
    });

  return ensureSanyakuFloor(resolvedAllocations);
};

export type {
  BanzukeAllocation,
  BashoRecordHistorySnapshot,
  BashoRecordSnapshot,
  SekitoriDeltaBand,
  SekitoriZone,
} from './sekitori/types';
export { resolveSekitoriDeltaBand, resolveSekitoriPreferredSlot } from './sekitori/bands';
