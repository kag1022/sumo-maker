import type { StyleArchetype } from '../models';
import { findOfficialKimariteEntry } from './catalog';
import { resolveStyleSignatureFit } from './styleSignatureMoves';

export interface KimariteSignatureCandidate {
  move: string;
  count: number;
  rarityBucket: 'COMMON' | 'UNCOMMON' | 'RARE' | 'EXTREME' | 'UNKNOWN';
  eligible: boolean;
  minOccurrences: number;
  score: number;
}

export interface KimariteSignatureSummary {
  candidates: KimariteSignatureCandidate[];
  selectedMoves: string[];
  oneOffRareRejectedCount: number;
  rareSelectedCount: number;
}

const MIN_OCCURRENCES_BY_RARITY: Record<KimariteSignatureCandidate['rarityBucket'], number> = {
  COMMON: 3,
  UNCOMMON: 4,
  RARE: 5,
  EXTREME: 7,
  UNKNOWN: 4,
};

const RARITY_SCORE_MULTIPLIER: Record<KimariteSignatureCandidate['rarityBucket'], number> = {
  COMMON: 1,
  UNCOMMON: 0.88,
  RARE: 0.58,
  EXTREME: 0.32,
  UNKNOWN: 0.72,
};

const RARITY_TIE_ORDER: Record<KimariteSignatureCandidate['rarityBucket'], number> = {
  COMMON: 0,
  UNCOMMON: 1,
  RARE: 2,
  EXTREME: 3,
  UNKNOWN: 4,
};

const resolveRarityBucket = (move: string): KimariteSignatureCandidate['rarityBucket'] =>
  findOfficialKimariteEntry(move)?.rarityBucket ?? 'UNKNOWN';

const scoreMove = (
  move: string,
  count: number,
  rarityBucket: KimariteSignatureCandidate['rarityBucket'],
  strongStyles?: StyleArchetype[],
): number => {
  const styleFit = resolveStyleSignatureFit(move, strongStyles);
  const contribution = Math.sqrt(Math.max(0, count));
  return contribution * styleFit * RARITY_SCORE_MULTIPLIER[rarityBucket];
};

export const summarizeSignatureKimarite = (
  kimariteTotal: Record<string, number> | undefined,
  strongStyles?: StyleArchetype[],
  limit = 3,
): KimariteSignatureSummary => {
  const candidates = Object.entries(kimariteTotal ?? {})
    .filter(([, count]) => count > 0)
    .map(([move, count]) => {
      const rarityBucket = resolveRarityBucket(move);
      const minOccurrences = MIN_OCCURRENCES_BY_RARITY[rarityBucket];
      return {
        move,
        count,
        rarityBucket,
        eligible: count >= minOccurrences,
        minOccurrences,
        score: scoreMove(move, count, rarityBucket, strongStyles),
      };
    })
    .sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      if (right.score !== left.score) return right.score - left.score;
      if (right.count !== left.count) return right.count - left.count;
      return RARITY_TIE_ORDER[left.rarityBucket] - RARITY_TIE_ORDER[right.rarityBucket];
    });

  const selectedMoves = candidates
    .filter((candidate) => candidate.eligible)
    .slice(0, limit)
    .map((candidate) => candidate.move);

  return {
    candidates,
    selectedMoves,
    oneOffRareRejectedCount: candidates.filter(
      (candidate) =>
        candidate.count <= 2 &&
        (candidate.rarityBucket === 'RARE' || candidate.rarityBucket === 'EXTREME') &&
        !candidate.eligible,
    ).length,
    rareSelectedCount: candidates.filter(
      (candidate) =>
        candidate.eligible &&
        (candidate.rarityBucket === 'RARE' || candidate.rarityBucket === 'EXTREME') &&
        selectedMoves.includes(candidate.move),
    ).length,
  };
};
