import { Rank } from '../../models';
import { EnemyStyleBias } from '../../catalog/enemyData';
import { NpcRegistry } from '../npc/types';

export type MakushitaNpc = {
  id: string;
  shikona: string;
  stableId: string;
  basePower: number;
  rankScore: number;
  volatility: number;
  form: number;
  styleBias?: EnemyStyleBias;
  heightCm?: number;
  weightKg?: number;
  growthBias?: number;
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

export type SekitoriExchange = {
  slots: number;
  promotedToJuryoIds: string[];
  demotedToMakushitaIds: string[];
  playerPromotedToJuryo: boolean;
  playerDemotedToMakushita: boolean;
  reason?: 'NORMAL' | 'MANDATORY_ABSENCE_DEMOTION';
};

export interface SekitoriBoundaryWorld {
  makushitaPool: MakushitaNpc[];
  lastMakushitaResults: BoundarySnapshot[];
  lastExchange: SekitoriExchange;
  lastPlayerJuryoHalfStepNudge: number;
  lastPlayerAssignedRank?: Rank;
  npcRegistry?: NpcRegistry;
}

export type PlayerSekitoriQuota = {
  canPromoteToJuryo?: boolean;
  canDemoteToMakushita?: boolean;
  enemyHalfStepNudge?: number;
  assignedNextRank?: Rank;
};

export type PlayerMakushitaRecord = {
  rank: Rank;
  shikona: string;
  wins: number;
  losses: number;
  absent: number;
};

export const MAKUSHITA_POOL_SIZE = 120;
export const JURYO_SIZE = 28;
export const MAKUSHITA_POWER_MIN = 68;
export const MAKUSHITA_POWER_MAX = 102;
export const JURYO_POWER_MIN = 78;
export const JURYO_POWER_MAX = 128;

export const EMPTY_EXCHANGE: SekitoriExchange = {
  slots: 0,
  promotedToJuryoIds: [],
  demotedToMakushitaIds: [],
  playerPromotedToJuryo: false,
  playerDemotedToMakushita: false,
  reason: 'NORMAL',
};
