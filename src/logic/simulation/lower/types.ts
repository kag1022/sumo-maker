import { Rank } from '../../models';
import { EnemyStyleBias } from '../../catalog/enemyData';
import { NpcNameContext, NpcRegistry } from '../npc/types';

export type LowerDivision = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
export type LowerBoundaryId = 'MakushitaSandanme' | 'SandanmeJonidan' | 'JonidanJonokuchi';

export type LowerNpc = {
  id: string;
  seedId?: string;
  shikona: string;
  division: LowerDivision | 'Maezumo';
  currentDivision?: LowerDivision | 'Maezumo';
  stableId: string;
  basePower: number;
  rankScore: number;
  volatility: number;
  form: number;
  styleBias?: EnemyStyleBias;
  heightCm?: number;
  weightKg?: number;
  growthBias?: number;
  retirementBias?: number;
  entryAge?: number;
  age?: number;
  careerBashoCount?: number;
  active?: boolean;
  entrySeq?: number;
  retiredAtSeq?: number;
  riseBand?: 1 | 2 | 3;
  recentBashoResults?: { division: string; wins: number; losses: number }[];
};

export type BoundarySnapshot = {
  id: string;
  shikona: string;
  isPlayer: boolean;
  stableId: string;
  rankScore: number;
  wins: number;
  losses: number;
};

export type BoundaryCandidate = {
  id: string;
  score: number;
  mandatory: boolean;
};

export type CandidateRule = {
  mandatory: (number: number, wins: number, losses: number) => boolean;
  bubble: (number: number, wins: number, losses: number) => boolean;
  score: (number: number, wins: number, losses: number) => number;
  fallbackScore: (number: number, wins: number, losses: number) => number;
};

export type BoundarySpec = {
  id: LowerBoundaryId;
  upper: LowerDivision;
  lower: LowerDivision;
  demotionRule: CandidateRule;
  promotionRule: CandidateRule;
};

export type PlayerLowerRecord = {
  rank: Rank;
  shikona: string;
  wins: number;
  losses: number;
  absent: number;
};

export type LowerBoundaryExchange = {
  slots: number;
  promotedToUpperIds: string[];
  demotedToLowerIds: string[];
  playerPromotedToUpper: boolean;
  playerDemotedToLower: boolean;
  reason?: 'NORMAL' | 'MANDATORY_ABSENCE_DEMOTION';
};

export type PlayerLowerDivisionQuota = {
  canPromoteToMakushita?: boolean;
  canDemoteToSandanme?: boolean;
  canPromoteToSandanme?: boolean;
  canDemoteToJonidan?: boolean;
  canPromoteToJonidan?: boolean;
  canDemoteToJonokuchi?: boolean;
  enemyHalfStepNudge?: number;
  assignedNextRank?: Rank;
};

export interface LowerDivisionQuotaWorld {
  rosters: Record<LowerDivision, LowerNpc[]>;
  maezumoPool: LowerNpc[];
  lastResults: Partial<Record<LowerDivision, BoundarySnapshot[]>>;
  lastExchanges: Record<LowerBoundaryId, LowerBoundaryExchange>;
  lastPlayerHalfStepNudge: Record<LowerDivision, number>;
  lastPlayerAssignedRank?: Rank;
  npcRegistry: NpcRegistry;
  npcNameContext: NpcNameContext;
  nextNpcSerial: number;
  lastMaezumoPromotions: Array<{ id: string; shikona: string; riseBand: 1 | 2 | 3 }>;
}

export const DIVISION_SIZE: Record<LowerDivision, number> = {
  Makushita: 120,
  Sandanme: 180,
  Jonidan: 200,
  Jonokuchi: 60,
};

export const DIVISION_MAX_NUMBER: Record<LowerDivision, number> = {
  Makushita: 60,
  Sandanme: 90,
  Jonidan: 100,
  Jonokuchi: 30,
};

export const POWER_RANGE: Record<LowerDivision, { min: number; max: number }> = {
  Makushita: { min: 68, max: 102 },
  Sandanme: { min: 56, max: 90 },
  Jonidan: { min: 45, max: 80 },
  Jonokuchi: { min: 35, max: 70 },
};

export const EMPTY_EXCHANGE: LowerBoundaryExchange = {
  slots: 0,
  promotedToUpperIds: [],
  demotedToLowerIds: [],
  playerPromotedToUpper: false,
  playerDemotedToLower: false,
  reason: 'NORMAL',
};

export const LOWER_BOUNDARIES: BoundarySpec[] = [
  {
    id: 'MakushitaSandanme',
    upper: 'Makushita',
    lower: 'Sandanme',
    demotionRule: {
      mandatory: (num, wins) => (num >= 56 && wins <= 2) || (num >= 50 && wins === 0),
      bubble: (num, wins) =>
        (num >= 56 && wins <= 2) ||
        (num >= 52 && wins <= 3) ||
        (num >= 48 && wins <= 2),
      score: (num, wins, losses) =>
        (num - 44) * 2.0 + Math.max(0, 4 - wins) * 3.0 + Math.max(0, losses - wins) * 1.1,
      fallbackScore: (num, wins, losses) =>
        Math.max(0, num - 54) * 1.6 + Math.max(0, 4 - wins) * 1.25 + Math.max(0, losses - wins) * 0.45,
    },
    promotionRule: {
      mandatory: (num, wins) => num === 1 ? wins >= 4 : (num <= 10 && wins === 7) || (num <= 5 && wins >= 6),
      bubble: (num, wins) =>
        (num === 1 && wins >= 4) ||
        (num <= 10 && wins === 7) ||
        (num <= 15 && wins >= 6) ||
        (num <= 25 && wins === 7),
      score: (num, wins, losses) =>
        Math.max(0, wins - 3) * 2.95 + Math.max(0, 16 - num) * 1.75 + Math.max(0, wins - losses) * 1.05,
      fallbackScore: () => 0,
    },
  },
  {
    id: 'SandanmeJonidan',
    upper: 'Sandanme',
    lower: 'Jonidan',
    demotionRule: {
      mandatory: (num, wins) => (num >= 86 && wins <= 2) || (num >= 80 && wins === 0),
      bubble: (num, wins) =>
        (num >= 86 && wins <= 2) ||
        (num >= 82 && wins <= 3) ||
        (num >= 74 && wins <= 2),
      score: (num, wins, losses) =>
        (num - 68) * 1.65 + Math.max(0, 4 - wins) * 2.65 + Math.max(0, losses - wins) * 1.0,
      fallbackScore: (num, wins, losses) =>
        Math.max(0, num - 82) * 1.4 + Math.max(0, 4 - wins) * 1.15 + Math.max(0, losses - wins) * 0.4,
    },
    promotionRule: {
      mandatory: (num, wins) => num === 1 ? wins >= 4 : (num <= 15 && wins === 7) || (num <= 8 && wins >= 6),
      bubble: (num, wins) =>
        (num === 1 && wins >= 4) ||
        (num <= 15 && wins === 7) ||
        (num <= 20 && wins >= 6) ||
        (num <= 35 && wins === 7),
      score: (num, wins, losses) =>
        Math.max(0, wins - 3) * 2.75 + Math.max(0, 22 - num) * 1.3 + Math.max(0, wins - losses) * 1.0,
      fallbackScore: () => 0,
    },
  },
  {
    id: 'JonidanJonokuchi',
    upper: 'Jonidan',
    lower: 'Jonokuchi',
    demotionRule: {
      mandatory: (num, wins) => (num >= 96 && wins <= 2) || (num >= 90 && wins === 0),
      bubble: (num, wins) =>
        (num >= 96 && wins <= 2) ||
        (num >= 92 && wins <= 3) ||
        (num >= 84 && wins <= 2),
      score: (num, wins, losses) =>
        (num - 80) * 1.6 + Math.max(0, 4 - wins) * 2.5 + Math.max(0, losses - wins) * 0.95,
      fallbackScore: (num, wins, losses) =>
        Math.max(0, num - 92) * 1.35 + Math.max(0, 4 - wins) * 1.1 + Math.max(0, losses - wins) * 0.35,
    },
    promotionRule: {
      mandatory: (num, wins) => num === 1 ? wins >= 4 : wins === 7,
      bubble: (num, wins) =>
        (num === 1 && wins >= 4) || wins === 7 || (num <= 10 && wins >= 6) || (num <= 18 && wins >= 5),
      score: (num, wins, losses) =>
        Math.max(0, wins - 3) * 2.65 + Math.max(0, 20 - num) * 1.15 + Math.max(0, wins - losses) * 0.95,
      fallbackScore: () => 0,
    },
  },
];
