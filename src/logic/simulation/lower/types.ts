import { Rank } from '../../models';
import { EnemyStyleBias } from '../../catalog/enemyData';
import { LOWER_DIVISION_SLOTS, NpcNameContext, NpcRegistry } from '../npc/types';

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
  ability?: number;
  uncertainty?: number;
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
  mandatory: (number: number, wins: number, losses: number, maxNumber: number) => boolean;
  bubble: (number: number, wins: number, losses: number, maxNumber: number) => boolean;
  score: (number: number, wins: number, losses: number, maxNumber: number) => number;
  fallbackScore: (number: number, wins: number, losses: number, maxNumber: number) => number;
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
  stableId?: string;
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

export type LowerDivisionPlacementTraceRow = {
  id: string;
  shikona: string;
  wins: number;
  losses: number;
  absent: number;
  scoreDiff: number;
  beforeRank: Rank;
  afterRank: Rank;
  beforeGlobalSlot: number;
  afterGlobalSlot: number;
};

export interface LowerDivisionQuotaWorld {
  rosters: Record<LowerDivision, LowerNpc[]>;
  maezumoPool: LowerNpc[];
  lastResults: Partial<Record<LowerDivision, BoundarySnapshot[]>>;
  lastExchanges: Record<LowerBoundaryId, LowerBoundaryExchange>;
  lastPlayerHalfStepNudge: Record<LowerDivision, number>;
  lastPlayerAssignedRank?: Rank;
  lastPlacementTrace: LowerDivisionPlacementTraceRow[];
  npcRegistry: NpcRegistry;
  npcNameContext: NpcNameContext;
  nextNpcSerial: number;
  lastMaezumoPromotions: Array<{ id: string; shikona: string; riseBand: 1 | 2 | 3 }>;
}

export const DIVISION_SIZE: Record<LowerDivision, number> = {
  Makushita: LOWER_DIVISION_SLOTS.Makushita,
  Sandanme: LOWER_DIVISION_SLOTS.Sandanme,
  Jonidan: LOWER_DIVISION_SLOTS.Jonidan,
  Jonokuchi: LOWER_DIVISION_SLOTS.Jonokuchi,
};

export const DIVISION_MAX_NUMBER: Record<LowerDivision, number> = {
  Makushita: Math.ceil(DIVISION_SIZE.Makushita / 2),
  Sandanme: Math.ceil(DIVISION_SIZE.Sandanme / 2),
  Jonidan: Math.ceil(DIVISION_SIZE.Jonidan / 2),
  Jonokuchi: Math.ceil(DIVISION_SIZE.Jonokuchi / 2),
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

const topRounded = (maxNumber: number, ratio: number, minimum: number): number =>
  Math.max(minimum, Math.round(maxNumber * ratio));

const bottomStart = (maxNumber: number, ratio: number, minimumBandSize: number): number => {
  const band = Math.max(minimumBandSize, Math.ceil(maxNumber * ratio));
  return Math.max(1, maxNumber - band + 1);
};

const laneDepth = (num: number, maxNumber: number, ratio: number, minimumStart: number): number => {
  const start = Math.max(minimumStart, Math.round(maxNumber * ratio));
  return Math.max(0, num - start);
};

export const LOWER_BOUNDARIES: BoundarySpec[] = [
  {
    id: 'MakushitaSandanme',
    upper: 'Makushita',
    lower: 'Sandanme',
    demotionRule: {
      mandatory: (num, wins, _losses, maxNumber) =>
        (num >= bottomStart(maxNumber, 0.08, 5) && wins <= 2) ||
        (num >= bottomStart(maxNumber, 0.18, 11) && wins === 0),
      bubble: (num, wins, _losses, maxNumber) =>
        (num >= bottomStart(maxNumber, 0.08, 5) && wins <= 2) ||
        (num >= bottomStart(maxNumber, 0.14, 9) && wins <= 3) ||
        (num >= bottomStart(maxNumber, 0.22, 13) && wins <= 2),
      score: (num, wins, losses, maxNumber) =>
        laneDepth(num, maxNumber, 0.73, 18) * 2.0 + Math.max(0, 4 - wins) * 3.0 + Math.max(0, losses - wins) * 1.1,
      fallbackScore: (num, wins, losses, maxNumber) =>
        laneDepth(num, maxNumber, 0.9, 30) * 1.6 + Math.max(0, 4 - wins) * 1.25 + Math.max(0, losses - wins) * 0.45,
    },
    promotionRule: {
      mandatory: (num, wins, _losses, maxNumber) =>
        num === 1 ? wins >= 4 : (num <= topRounded(maxNumber, 0.17, 10) && wins === 7) || (num <= topRounded(maxNumber, 0.08, 5) && wins >= 6),
      bubble: (num, wins, _losses, maxNumber) =>
        (num === 1 && wins >= 4) ||
        (num <= topRounded(maxNumber, 0.17, 10) && wins === 7) ||
        (num <= topRounded(maxNumber, 0.25, 15) && wins >= 6) ||
        (num <= topRounded(maxNumber, 0.42, 25) && wins === 7),
      score: (num, wins, losses, maxNumber) =>
        Math.max(0, wins - 3) * 2.95 + Math.max(0, topRounded(maxNumber, 0.27, 16) - num) * 1.75 + Math.max(0, wins - losses) * 1.05,
      fallbackScore: () => 0,
    },
  },
  {
    id: 'SandanmeJonidan',
    upper: 'Sandanme',
    lower: 'Jonidan',
    demotionRule: {
      mandatory: (num, wins, _losses, maxNumber) =>
        (num >= bottomStart(maxNumber, 0.06, 5) && wins <= 2) ||
        (num >= bottomStart(maxNumber, 0.13, 11) && wins === 0),
      bubble: (num, wins, _losses, maxNumber) =>
        (num >= bottomStart(maxNumber, 0.06, 5) && wins <= 2) ||
        (num >= bottomStart(maxNumber, 0.1, 9) && wins <= 3) ||
        (num >= bottomStart(maxNumber, 0.18, 17) && wins <= 2),
      score: (num, wins, losses, maxNumber) =>
        laneDepth(num, maxNumber, 0.76, 24) * 1.65 + Math.max(0, 4 - wins) * 2.65 + Math.max(0, losses - wins) * 1.0,
      fallbackScore: (num, wins, losses, maxNumber) =>
        laneDepth(num, maxNumber, 0.91, 34) * 1.4 + Math.max(0, 4 - wins) * 1.15 + Math.max(0, losses - wins) * 0.4,
    },
    promotionRule: {
      mandatory: (num, wins, _losses, maxNumber) =>
        num === 1 ? wins >= 4 : (num <= topRounded(maxNumber, 0.17, 15) && wins === 7) || (num <= topRounded(maxNumber, 0.09, 8) && wins >= 6),
      bubble: (num, wins, _losses, maxNumber) =>
        (num === 1 && wins >= 4) ||
        (num <= topRounded(maxNumber, 0.17, 15) && wins === 7) ||
        (num <= topRounded(maxNumber, 0.22, 20) && wins >= 6) ||
        (num <= topRounded(maxNumber, 0.39, 35) && wins === 7),
      score: (num, wins, losses, maxNumber) =>
        Math.max(0, wins - 3) * 2.75 + Math.max(0, topRounded(maxNumber, 0.24, 22) - num) * 1.3 + Math.max(0, wins - losses) * 1.0,
      fallbackScore: () => 0,
    },
  },
  {
    id: 'JonidanJonokuchi',
    upper: 'Jonidan',
    lower: 'Jonokuchi',
    demotionRule: {
      mandatory: (num, wins, _losses, maxNumber) =>
        (num >= bottomStart(maxNumber, 0.05, 5) && wins <= 2) ||
        (num >= bottomStart(maxNumber, 0.11, 11) && wins === 0),
      bubble: (num, wins, _losses, maxNumber) =>
        (num >= bottomStart(maxNumber, 0.05, 5) && wins <= 2) ||
        (num >= bottomStart(maxNumber, 0.09, 9) && wins <= 3) ||
        (num >= bottomStart(maxNumber, 0.17, 17) && wins <= 2),
      score: (num, wins, losses, maxNumber) =>
        laneDepth(num, maxNumber, 0.8, 30) * 1.6 + Math.max(0, 4 - wins) * 2.5 + Math.max(0, losses - wins) * 0.95,
      fallbackScore: (num, wins, losses, maxNumber) =>
        laneDepth(num, maxNumber, 0.92, 40) * 1.35 + Math.max(0, 4 - wins) * 1.1 + Math.max(0, losses - wins) * 0.35,
    },
    promotionRule: {
      mandatory: (num, wins) => num === 1 ? wins >= 4 : wins === 7,
      bubble: (num, wins, _losses, maxNumber) =>
        (num === 1 && wins >= 4) ||
        wins === 7 ||
        (num <= topRounded(maxNumber, 0.33, 10) && wins >= 6) ||
        (num <= topRounded(maxNumber, 0.6, 18) && wins >= 5),
      score: (num, wins, losses, maxNumber) =>
        Math.max(0, wins - 3) * 2.65 + Math.max(0, topRounded(maxNumber, 0.67, 20) - num) * 1.15 + Math.max(0, wins - losses) * 0.95,
      fallbackScore: () => 0,
    },
  },
];
