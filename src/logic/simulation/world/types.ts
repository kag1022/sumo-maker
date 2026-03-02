import { MakuuchiLayout } from '../../banzuke/scale/banzukeLayout';
import { BashoRecordHistorySnapshot, BanzukeAllocation } from '../../banzuke/providers/sekitori/types';
import { EnemyStyleBias } from '../../catalog/enemyData';
import { Rank } from '../../models';
import { SpecialPrizeCode } from '../topDivision/specialPrizes';
import { ActorRegistry, NpcNameContext, NpcRegistry, PersistentNpc } from '../npc/types';

export type TopDivision = 'Makuuchi' | 'Juryo';
export type LowerDivision = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';

export type WorldRikishi = {
  id: string;
  shikona: string;
  division: TopDivision;
  stableId: string;
  basePower: number;
  ability: number;
  uncertainty: number;
  growthBias: number;
  rankScore: number;
  volatility: number;
  form: number;
  styleBias: EnemyStyleBias;
  heightCm: number;
  weightKg: number;
};

export type DivisionBashoSnapshot = {
  id: string;
  shikona: string;
  isPlayer: boolean;
  stableId: string;
  rankScore: number;
  rank?: Rank;
  wins: number;
  losses: number;
  absent?: number;
  expectedWins?: number;
  strengthOfSchedule?: number;
  performanceOverExpected?: number;
  yusho?: boolean;
  junYusho?: boolean;
  specialPrizes?: SpecialPrizeCode[];
};

export type TopDivisionExchange = {
  slots: number;
  promotedToMakuuchiIds: string[];
  demotedToJuryoIds: string[];
  playerPromotedToMakuuchi: boolean;
  playerDemotedToJuryo: boolean;
};

export type PlayerSanyakuQuota = {
  enforcedSanyaku?: 'Sekiwake' | 'Komusubi';
};

export type PlayerTopDivisionQuota = {
  canPromoteToMakuuchi?: boolean;
  canDemoteToJuryo?: boolean;
  enforcedSanyaku?: 'Sekiwake' | 'Komusubi';
  assignedNextRank?: Rank;
  nextIsOzekiKadoban?: boolean;
  nextIsOzekiReturn?: boolean;
};

export interface SimulationWorld {
  rosters: Record<TopDivision, WorldRikishi[]>;
  lowerRosterSeeds: Record<LowerDivision, PersistentNpc[]>;
  maezumoPool: PersistentNpc[];
  actorRegistry: ActorRegistry;
  npcRegistry: NpcRegistry;
  npcNameContext: NpcNameContext;
  nextNpcSerial: number;
  lastBashoResults: Partial<Record<TopDivision, DivisionBashoSnapshot[]>>;
  recentSekitoriHistory: Map<string, BashoRecordHistorySnapshot[]>;
  ozekiKadobanById: Map<string, boolean>;
  ozekiReturnById: Map<string, boolean>;
  lastAllocations: BanzukeAllocation[];
  lastExchange: TopDivisionExchange;
  lastSanyakuQuota: PlayerSanyakuQuota;
  lastPlayerAssignedRank?: Rank;
  lastPlayerAllocation?: BanzukeAllocation;
  makuuchiLayout: MakuuchiLayout;
}
