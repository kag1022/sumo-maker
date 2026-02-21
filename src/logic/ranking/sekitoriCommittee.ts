import { buildMakuuchiLayoutFromRanks } from './banzukeLayout';
import { normalizeSekitoriLosses } from './topDivisionRules';
import { allocateSekitoriSlots } from './sekitori/allocation';
import { resolveTopDirective, toHistoryScore } from './sekitori/directives';
import { compareByScore, compareRankKey, scoreTopDivisionCandidate } from './sekitori/scoring';
import { applySekitoriSafetyGuard } from './sekitori/safety';
import { fromSekitoriSlot, isSekitoriDivision, SEKITORI_CAPACITY, toSekitoriSlot } from './sekitori/slots';
import {
  BanzukeAllocation,
  BanzukeCandidate,
  BashoRecordSnapshot,
} from './sekitori/types';

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

  const candidates: BanzukeCandidate[] = activeSekitori.map((snapshot) => {
    const sourceDivision = snapshot.rank.division as BanzukeCandidate['sourceDivision'];
    const normalizedLosses = normalizeSekitoriLosses(
      snapshot.wins,
      snapshot.losses,
      snapshot.absent,
    );
    const directive = resolveTopDirective(snapshot);
    const historyScore = (snapshot.pastRecords ?? [])
      .slice(0, 2)
      .reduce((sum, record, index) => sum + toHistoryScore(record) * (index === 0 ? 0.75 : 0.45), 0);
    const score = scoreTopDivisionCandidate(snapshot, directive) + historyScore;
    return {
      snapshot,
      sourceDivision,
      normalizedLosses,
      score,
      currentSlot: toSekitoriSlot(snapshot.rank, currentLayout),
      directive,
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

  return candidates
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
        sourceDivision: candidate.sourceDivision,
        nextIsOzekiKadoban,
        nextIsOzekiReturn,
      };
    });
};

export type {
  BanzukeAllocation,
  BashoRecordHistorySnapshot,
  BashoRecordSnapshot,
  SekitoriDeltaBand,
  SekitoriZone,
} from './sekitori/types';
export { resolveSekitoriDeltaBand, resolveSekitoriPreferredSlot } from './sekitori/bands';
