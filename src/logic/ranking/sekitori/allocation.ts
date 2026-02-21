import {
  MakuuchiLayout,
  SANYAKU_CAP,
  SANYAKU_MIN,
} from '../banzukeLayout';
import {
  resolveBandSlotBounds,
  resolveRequiredSekitoriDemotionSlots,
  resolveSekitoriDeltaBand,
  resolveSekitoriPreferredSlot,
} from './bands';
import { compareByScore } from './scoring';
import { SEKITORI_CAPACITY } from './slots';
import { BanzukeCandidate, RankAssignment } from './types';

const isForcedSanyakuLift = (
  candidate: BanzukeCandidate,
  maxMaegashira: number,
  minimumWins: number,
): boolean => {
  const rank = candidate.snapshot.rank;
  return (
    rank.division === 'Makuuchi' &&
    rank.name === '前頭' &&
    (rank.number || 99) <= maxMaegashira &&
    candidate.snapshot.wins >= minimumWins
  );
};

const takeCandidates = (
  sortedPool: BanzukeCandidate[],
  targetCount: number,
  predicate: (candidate: BanzukeCandidate) => boolean,
): BanzukeCandidate[] => {
  const picked: BanzukeCandidate[] = [];
  for (const candidate of sortedPool) {
    if (picked.length >= targetCount) break;
    if (!predicate(candidate)) continue;
    picked.push(candidate);
  }
  return picked;
};

const uniqueById = (candidates: BanzukeCandidate[]): BanzukeCandidate[] => {
  const seen = new Set<string>();
  const unique: BanzukeCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.snapshot.id)) continue;
    seen.add(candidate.snapshot.id);
    unique.push(candidate);
  }
  return unique;
};

const isStrictSekiwakeCandidate = (candidate: BanzukeCandidate): boolean => {
  const rank = candidate.snapshot.rank;
  if (candidate.directive.preferredTopName === '関脇') return true;
  if (rank.division !== 'Makuuchi') return false;
  if (rank.name === '関脇') return candidate.snapshot.wins >= 8;
  if (rank.name === '小結') return candidate.snapshot.wins >= 9;
  if (rank.name === '前頭') return (rank.number || 99) <= 2 && candidate.snapshot.wins >= 11;
  return false;
};

const isStrictKomusubiCandidate = (candidate: BanzukeCandidate): boolean => {
  const rank = candidate.snapshot.rank;
  if (candidate.directive.preferredTopName === '小結') return true;
  if (rank.division !== 'Makuuchi') return false;
  if (rank.name === '小結') return candidate.snapshot.wins >= 8;
  if (rank.name === '関脇') return candidate.snapshot.wins >= 6;
  if (rank.name === '前頭') return (rank.number || 99) <= 4 && candidate.snapshot.wins >= 10;
  return false;
};

const isForcedSekiwake = (candidate: BanzukeCandidate): boolean =>
  candidate.directive.preferredTopName === '関脇';

const isForcedKomusubi = (candidate: BanzukeCandidate): boolean =>
  candidate.directive.preferredTopName === '小結';

const pickTopCandidates = (
  pool: BanzukeCandidate[],
  count: number,
  preferred: (candidate: BanzukeCandidate) => boolean,
  mandatory?: (candidate: BanzukeCandidate) => boolean,
  forcedFallback?: (candidate: BanzukeCandidate) => boolean,
): BanzukeCandidate[] => {
  const picked: BanzukeCandidate[] = [];
  if (mandatory) {
    picked.push(...takeCandidates(pool, count, mandatory));
  }
  if (picked.length < count) {
    picked.push(
      ...takeCandidates(
        pool.filter((candidate) => !picked.some((row) => row.snapshot.id === candidate.snapshot.id)),
        count - picked.length,
        preferred,
      ),
    );
  }
  if (picked.length < count && forcedFallback) {
    picked.push(
      ...takeCandidates(
        pool.filter((candidate) => !picked.some((row) => row.snapshot.id === candidate.snapshot.id)),
        count - picked.length,
        forcedFallback,
      ),
    );
  }
  if (picked.length < count) {
    picked.push(
      ...pool
        .filter((candidate) => !picked.some((row) => row.snapshot.id === candidate.snapshot.id))
        .slice(0, count - picked.length),
    );
  }
  return uniqueById(picked).slice(0, count);
};

const assignSectionSlotsByScore = (
  picked: BanzukeCandidate[],
  startSlot: number,
  assignedSlotById: Map<string, number>,
): number => {
  const ordered = picked.slice().sort(compareByScore);
  let cursor = startSlot;
  for (const candidate of ordered) {
    assignedSlotById.set(candidate.snapshot.id, cursor);
    cursor += 1;
  }
  return cursor;
};

const pickNearestSlot = (
  candidate: BanzukeCandidate,
  openSlots: number[],
): number => {
  const band = resolveSekitoriDeltaBand(candidate.snapshot);
  const preferredSlot = resolveSekitoriPreferredSlot(candidate, band);
  const { minSlot, maxSlot } = resolveBandSlotBounds(candidate.currentSlot, band);

  let bestSlot = openSlots[0];
  let bestCost = Number.POSITIVE_INFINITY;
  const minimumDrop = resolveRequiredSekitoriDemotionSlots(candidate);
  const minimumDemotedSlot = candidate.currentSlot + minimumDrop;
  for (const slot of openSlots) {
    const outside =
      slot < minSlot ? minSlot - slot : slot > maxSlot ? slot - maxSlot : 0;
    const distance = Math.abs(slot - preferredSlot);
    let directionPenalty = 0;
    if (candidate.snapshot.wins < candidate.normalizedLosses && slot < candidate.currentSlot) {
      directionPenalty += 700;
    }
    if (candidate.snapshot.wins > candidate.normalizedLosses && slot > candidate.currentSlot) {
      directionPenalty += 700;
    }
    if (
      candidate.snapshot.wins < candidate.normalizedLosses &&
      slot < minimumDemotedSlot
    ) {
      directionPenalty += (minimumDemotedSlot - slot) * 320;
    }
    const cost = outside * 120 + directionPenalty + distance;
    if (cost < bestCost || (cost === bestCost && slot < bestSlot)) {
      bestCost = cost;
      bestSlot = slot;
    }
  }
  return bestSlot;
};

const allocateSekitoriWithBands = (
  candidates: BanzukeCandidate[],
  openSlots: number[],
): RankAssignment[] => {
  if (!candidates.length || !openSlots.length) return [];
  const assignments: RankAssignment[] = [];
  const available = openSlots.slice().sort((a, b) => a - b);
  for (const candidate of candidates.slice().sort(compareByScore)) {
    if (!available.length) break;
    const targetSlot = pickNearestSlot(candidate, available);
    assignments.push({ candidate, slot: targetSlot });
    const idx = available.indexOf(targetSlot);
    if (idx >= 0) available.splice(idx, 1);
  }
  return assignments;
};

export const allocateSekitoriSlots = (
  sortedOverall: BanzukeCandidate[],
  totalSlots: number,
  makuuchiSlots: number,
): { assignedSlotById: Map<string, number>; nextLayout: MakuuchiLayout } => {
  const assignedSlotById = new Map<string, number>();
  const topPool = sortedOverall.slice();

  const consumeByIds = (ids: Set<string>): void => {
    for (let i = topPool.length - 1; i >= 0; i -= 1) {
      if (ids.has(topPool[i].snapshot.id)) topPool.splice(i, 1);
    }
  };

  const yokozuna = topPool
    .filter(
      (candidate) =>
        candidate.directive.preferredTopName === '横綱' || candidate.snapshot.rank.name === '横綱',
    )
    .slice(0, makuuchiSlots);
  consumeByIds(new Set(yokozuna.map((candidate) => candidate.snapshot.id)));

  const ozeki = topPool
    .filter(
      (candidate) =>
        candidate.directive.preferredTopName === '大関' ||
        (candidate.snapshot.rank.name === '大関' && candidate.snapshot.wins >= 8),
    )
    .slice(0, Math.max(0, makuuchiSlots - yokozuna.length));
  consumeByIds(new Set(ozeki.map((candidate) => candidate.snapshot.id)));

  const remainingForSanyaku = Math.max(0, makuuchiSlots - yokozuna.length - ozeki.length);
  const forcedSekiwake = takeCandidates(topPool, topPool.length, isForcedSekiwake);
  const maxSekiwake =
    forcedSekiwake.length > SANYAKU_CAP.sekiwake
      ? forcedSekiwake.length
      : SANYAKU_CAP.sekiwake;
  const strictSekiwakeCount = topPool.filter(isStrictSekiwakeCandidate).length;
  const desiredSekiwake = Math.max(
    SANYAKU_MIN.sekiwake,
    Math.min(maxSekiwake, strictSekiwakeCount),
  );
  const targetSekiwake = Math.min(
    remainingForSanyaku,
    Math.max(forcedSekiwake.length, desiredSekiwake),
  );
  const sekiwake = pickTopCandidates(
    topPool,
    targetSekiwake,
    isStrictSekiwakeCandidate,
    isForcedSekiwake,
    (candidate) => isForcedSanyakuLift(candidate, 4, 8),
  );
  consumeByIds(new Set(sekiwake.map((candidate) => candidate.snapshot.id)));

  const remainingForKomusubi = Math.max(
    0,
    makuuchiSlots - yokozuna.length - ozeki.length - sekiwake.length,
  );
  const forcedKomusubi = takeCandidates(topPool, topPool.length, isForcedKomusubi);
  const strictKomusubiCount = topPool.filter(isStrictKomusubiCandidate).length;
  const desiredKomusubi = Math.max(
    SANYAKU_MIN.komusubi,
    Math.min(SANYAKU_CAP.komusubi, strictKomusubiCount),
  );
  const targetKomusubi = Math.min(
    remainingForKomusubi,
    Math.max(forcedKomusubi.length, desiredKomusubi),
  );
  const komusubi = pickTopCandidates(
    topPool,
    targetKomusubi,
    isStrictKomusubiCandidate,
    isForcedKomusubi,
    (candidate) => isForcedSanyakuLift(candidate, 5, 8),
  );
  consumeByIds(new Set(komusubi.map((candidate) => candidate.snapshot.id)));

  const topCount = yokozuna.length + ozeki.length + sekiwake.length + komusubi.length;
  const nextLayout: MakuuchiLayout = {
    yokozuna: yokozuna.length,
    ozeki: ozeki.length,
    sekiwake: sekiwake.length,
    komusubi: komusubi.length,
    maegashira: Math.max(0, SEKITORI_CAPACITY.Makuuchi - topCount),
    sekiwakeOverflow: sekiwake.length > SANYAKU_CAP.sekiwake,
    komusubiOverflow: komusubi.length > SANYAKU_CAP.komusubi,
    sekiwakeCap: SANYAKU_CAP.sekiwake,
    komusubiCap: SANYAKU_CAP.komusubi,
  };

  let sectionSlot = 1;
  sectionSlot = assignSectionSlotsByScore(yokozuna, sectionSlot, assignedSlotById);
  sectionSlot = assignSectionSlotsByScore(ozeki, sectionSlot, assignedSlotById);
  sectionSlot = assignSectionSlotsByScore(sekiwake, sectionSlot, assignedSlotById);
  sectionSlot = assignSectionSlotsByScore(komusubi, sectionSlot, assignedSlotById);

  const remainingCandidates = sortedOverall.filter(
    (candidate) => !assignedSlotById.has(candidate.snapshot.id),
  );
  const openSlots: number[] = [];
  for (let slot = sectionSlot; slot <= totalSlots; slot += 1) {
    openSlots.push(slot);
  }
  const bodyAssignments = allocateSekitoriWithBands(remainingCandidates, openSlots);
  for (const assignment of bodyAssignments) {
    assignedSlotById.set(assignment.candidate.snapshot.id, assignment.slot);
  }

  return { assignedSlotById, nextLayout };
};
