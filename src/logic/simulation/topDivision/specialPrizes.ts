import { MakuuchiLayout, decodeMakuuchiRankFromScore } from '../../ranking/banzukeLayout';
import { Rank } from '../../models';
import { RandomSource } from '../deps';

export type SpecialPrizeCode = 'SHUKUN' | 'KANTO' | 'GINO';

type SpecialPrizeParticipant = {
  id: string;
  rankScore: number;
  wins: number;
  losses: number;
};

type TechniqueSource = {
  id: string;
  volatility: number;
  form: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const isSanshoEligibleBase = (rank: Rank, wins: number): boolean => {
  if (rank.division !== 'Makuuchi') return false;
  if (!['関脇', '小結', '前頭'].includes(rank.name)) return false;
  return wins >= 8;
};

const isMaegashiraRange = (rank: Rank, min: number, max: number): boolean =>
  rank.name === '前頭' && typeof rank.number === 'number' && rank.number >= min && rank.number <= max;

const pushPrize = (map: Map<string, SpecialPrizeCode[]>, id: string, prize: SpecialPrizeCode): void => {
  const current = map.get(id) ?? [];
  if (!current.includes(prize)) {
    current.push(prize);
    map.set(id, current);
  }
};

export const evaluateSpecialPrizes = (
  participants: SpecialPrizeParticipant[],
  yushoWinnerId: string | undefined,
  rng: RandomSource,
  options: {
    makuuchiLayout: MakuuchiLayout;
    techniqueSources: TechniqueSource[];
  },
): Map<string, SpecialPrizeCode[]> => {
  const result = new Map<string, SpecialPrizeCode[]>();
  if (!participants.length) return result;

  const techniqueById = new Map(options.techniqueSources.map((rikishi) => [rikishi.id, rikishi]));
  const candidates = participants
    .map((participant) => {
      const rank = decodeMakuuchiRankFromScore(participant.rankScore, options.makuuchiLayout);
      const roster = techniqueById.get(participant.id);
      const techniqueModifier = roster
        ? clamp((1.4 - roster.volatility) * 0.08 + (roster.form - 1) * 0.2, -0.1, 0.12)
        : 0;
      return {
        id: participant.id,
        rank,
        wins: participant.wins,
        techniqueModifier,
      };
    })
    .filter((candidate) => isSanshoEligibleBase(candidate.rank, candidate.wins));

  for (const candidate of candidates) {
    const { id, rank, wins } = candidate;

    // 殊勲賞
    if (id === yushoWinnerId) {
      pushPrize(result, id, 'SHUKUN');
    } else if (isMaegashiraRange(rank, 1, 5) && wins >= 10) {
      if (rng() < 0.7) pushPrize(result, id, 'SHUKUN');
    } else if ((rank.name === '関脇' || rank.name === '小結') && wins >= 12) {
      if (rng() < 0.5) pushPrize(result, id, 'SHUKUN');
    }

    // 敢闘賞
    if (wins >= 12) {
      pushPrize(result, id, 'KANTO');
    } else if (isMaegashiraRange(rank, 10, 17) && wins >= 11) {
      if (rng() < 0.8) pushPrize(result, id, 'KANTO');
    } else if (wins === 10) {
      if (rng() < 0.3) pushPrize(result, id, 'KANTO');
    }

    // 技能賞
    if (wins >= 10) {
      const probability = clamp(0.3 + candidate.techniqueModifier, 0.1, 0.6);
      if (rng() < probability) pushPrize(result, id, 'GINO');
    }
  }

  return result;
};
