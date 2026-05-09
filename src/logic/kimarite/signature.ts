import type { StyleArchetype } from '../models';
import {
  type KimariteRarityBucket,
  findOfficialKimariteEntry,
  normalizeKimariteName,
} from './catalog';
import { findKimariteRealdataFrequency } from './realdata';
import { resolveStyleSignatureFit } from './styleSignatureMoves';

export interface KimariteSignatureCandidate {
  move: string;
  count: number;
  rarityBucket: KimariteRarityBucket | 'UNKNOWN';
  minOccurrences: number;
  eligible: boolean;
  score: number;
}

export interface KimariteSignatureSummary {
  selectedMoves: string[];
  candidates: KimariteSignatureCandidate[];
  rareSelectedCount: number;
  extremeSelectedCount: number;
  oneOffRareRejectedCount: number;
}

const MIN_OCCURRENCES_BY_RARITY: Record<KimariteRarityBucket | 'UNKNOWN', number> = {
  COMMON: 3,
  UNCOMMON: 4,
  RARE: 5,
  EXTREME: 7,
  UNKNOWN: 4,
};

const SCORE_MULTIPLIER_BY_RARITY: Record<KimariteRarityBucket | 'UNKNOWN', number> = {
  COMMON: 1,
  UNCOMMON: 0.88,
  RARE: 0.58,
  EXTREME: 0.32,
  UNKNOWN: 0.72,
};

const RARITY_SORT_ORDER: Record<KimariteRarityBucket | 'UNKNOWN', number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EXTREME: 3,
  UNKNOWN: 4,
};

export const summarizeSignatureKimarite = (
  kimariteTotal: Record<string, number> | undefined,
  strongStyles: StyleArchetype[] = [],
  limit = 3,
): KimariteSignatureSummary => {
  const candidates: KimariteSignatureCandidate[] = Object.entries(kimariteTotal ?? {})
    .filter(([, count]) => count > 0)
    .map(([rawMove, count]) => {
      const move = normalizeKimariteName(rawMove);
      const entry = findOfficialKimariteEntry(move);
      const rarityBucket: KimariteRarityBucket | 'UNKNOWN' = entry?.rarityBucket ?? 'UNKNOWN';
      const minOccurrences = MIN_OCCURRENCES_BY_RARITY[rarityBucket];
      const realdata = findKimariteRealdataFrequency(move);
      const signatureEligible =
        Boolean(entry?.signatureEligible) &&
        rarityBucket !== 'UNKNOWN' &&
        realdata?.observedCount !== 0;
      const eligible = signatureEligible && count >= minOccurrences;
      const styleFit = resolveStyleSignatureFit(move, strongStyles);
      const score =
        Math.sqrt(count) *
        styleFit *
        SCORE_MULTIPLIER_BY_RARITY[rarityBucket];
      return {
        move,
        count,
        rarityBucket,
        minOccurrences,
        eligible,
        score,
      };
    })
    .sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      if (right.score !== left.score) return right.score - left.score;
      if (right.count !== left.count) return right.count - left.count;
      return RARITY_SORT_ORDER[left.rarityBucket] - RARITY_SORT_ORDER[right.rarityBucket];
    });

  const selectedMoves = candidates
    .filter((candidate) => candidate.eligible)
    .slice(0, limit)
    .map((candidate) => candidate.move);

  return {
    selectedMoves,
    candidates,
    rareSelectedCount: candidates.filter(
      (candidate) => selectedMoves.includes(candidate.move) && candidate.rarityBucket === 'RARE',
    ).length,
    extremeSelectedCount: candidates.filter(
      (candidate) => selectedMoves.includes(candidate.move) && candidate.rarityBucket === 'EXTREME',
    ).length,
    oneOffRareRejectedCount: candidates.filter(
      (candidate) =>
        (candidate.rarityBucket === 'RARE' || candidate.rarityBucket === 'EXTREME') &&
        candidate.count <= 2 &&
        !candidate.eligible,
    ).length,
  };
};
