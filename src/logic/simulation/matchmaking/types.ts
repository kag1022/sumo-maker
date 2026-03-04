import { AptitudeTier } from '../../models';
import { EnemyStyleBias } from '../../catalog/enemyData';

export type DivisionParticipant = {
  id: string;
  shikona: string;
  isPlayer: boolean;
  stableId: string;
  forbiddenOpponentIds?: string[];
  rankScore: number;
  power: number;
  ability?: number;
  bashoFormDelta?: number;
  styleBias?: EnemyStyleBias;
  heightCm?: number;
  weightKg?: number;
  aptitudeTier?: AptitudeTier;
  aptitudeFactor?: number;
  wins: number;
  losses: number;
  currentWinStreak?: number;
  currentLossStreak?: number;
  expectedWins?: number;
  opponentAbilityTotal?: number;
  boutsSimulated?: number;
  active: boolean;
};

export type DailyMatchups = {
  pairs: Array<{ a: DivisionParticipant; b: DivisionParticipant }>;
  byeIds: string[];
};
