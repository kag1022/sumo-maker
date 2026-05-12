import {
  DEFAULT_MAKUUCHI_LAYOUT,
  MakuuchiLayout,
  decodeMakuuchiRankFromScore as decodeMakuuchiRankByLayout,
  encodeMakuuchiRankToScore,
} from '../../banzuke/scale/banzukeLayout';
import { Rank } from '../../models';
import { DivisionParticipant } from '../matchmaking';
import { RandomSource } from '../deps';
import { resolveTopDivisionRank } from '../topDivision/rank';
import { TorikumiParticipant } from '../torikumi/types';
import { SimulationWorld, TopDivision, TopDivisionExchange } from './types';

export const DIVISION_SIZE: Record<TopDivision, number> = {
  Makuuchi: 42,
  Juryo: 28,
};

export const POWER_RANGE: Record<TopDivision, { min: number; max: number }> = {
  Makuuchi: { min: 95, max: 165 },
  Juryo: { min: 80, max: 125 },
};

export const softClampPower = (value: number, range: { min: number; max: number }): number => {
  if (value < range.min) {
    return range.min - Math.log1p(range.min - value);
  }
  if (value > range.max) {
    return range.max + Math.log1p(value - range.max);
  }
  return value;
};

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const randomNoise = (rng: RandomSource, amplitude: number): number =>
  (rng() * 2 - 1) * amplitude;

export const EMPTY_EXCHANGE: TopDivisionExchange = {
  slots: 0,
  promotedToMakuuchiIds: [],
  demotedToJuryoIds: [],
  playerPromotedToMakuuchi: false,
  playerDemotedToJuryo: false,
};

const toTopDivision = (rank: Rank): TopDivision | null => {
  if (rank.division === 'Makuuchi') return 'Makuuchi';
  if (rank.division === 'Juryo') return 'Juryo';
  return null;
};

export const resolveTopDivisionFromRank = (rank: Rank): TopDivision | null =>
  toTopDivision(rank);

export const resolvePlayerRankScore = (
  rank: Rank,
  makuuchiLayout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): number => {
  if (rank.division === 'Makuuchi') {
    return clamp(encodeMakuuchiRankToScore(rank, makuuchiLayout), 1, DIVISION_SIZE.Makuuchi);
  }
  if (rank.division === 'Juryo') {
    const sideOffset = rank.side === 'West' ? 1 : 0;
    const num = clamp(rank.number || 1, 1, 14);
    return clamp(1 + (num - 1) * 2 + sideOffset, 1, DIVISION_SIZE.Juryo);
  }
  return 20;
};

export const toTorikumiParticipant = (
  division: TopDivision,
  participant: DivisionParticipant,
  world: SimulationWorld,
): TorikumiParticipant => {
  const rank = resolveTopDivisionRank(division, participant.rankScore, world.makuuchiLayout);
  return {
    ...participant,
    division,
    rankName: rank.name,
    rankNumber: rank.number,
    targetBouts: 15,
    boutsDone: 0,
  };
};

export const toDivisionParticipants = (
  participants: TorikumiParticipant[],
): DivisionParticipant[] =>
  participants.map((participant) => ({
    id: participant.id,
    shikona: participant.shikona,
    isPlayer: participant.isPlayer,
    stableId: participant.stableId,
    forbiddenOpponentIds: participant.forbiddenOpponentIds,
    rankScore: participant.rankScore,
    power: participant.power,
    ability: participant.ability,
    bashoFormDelta: participant.bashoFormDelta,
    styleBias: participant.styleBias,
    heightCm: participant.heightCm,
    weightKg: participant.weightKg,
    aptitudeTier: participant.aptitudeTier,
    aptitudeFactor: participant.aptitudeFactor,
    aptitudeProfile: participant.aptitudeProfile,
    careerBand: participant.careerBand,
    stagnation: participant.stagnation,
    wins: participant.wins,
    losses: participant.losses,
    currentWinStreak: participant.currentWinStreak,
    currentLossStreak: participant.currentLossStreak,
    expectedWins: participant.expectedWins,
    opponentAbilityTotal: participant.opponentAbilityTotal,
    boutsSimulated: participant.boutsSimulated,
    active: participant.active,
    bashoKyujo: participant.bashoKyujo,
    kyujoStartDay: participant.kyujoStartDay,
    kyujoReason: participant.kyujoReason,
  }));

export const decodeMakuuchiRankFromScore = (
  rankScore: number,
  layout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): Rank => decodeMakuuchiRankByLayout(rankScore, layout);

export const decodeJuryoRankFromScore = (rankScore: number): Rank => {
  const bounded = clamp(rankScore, 1, DIVISION_SIZE.Juryo);
  return {
    division: 'Juryo',
    name: '十両',
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};
