import { BashoRecord, Rank } from '../../models';
import { LowerLeagueSnapshots } from '../lowerQuota';

export type BoutOutcome = 'WIN' | 'LOSS' | 'ABSENT';

export interface PlayerBoutDetail {
  day: number;
  result: BoutOutcome;
  kimarite?: string;
  opponentId?: string;
  opponentShikona?: string;
  opponentRankName?: string;
  opponentRankNumber?: number;
  opponentRankSide?: 'East' | 'West';
}

export interface NpcBashoAggregate {
  entityId: string;
  shikona: string;
  division: Rank['division'];
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  wins: number;
  losses: number;
  absent: number;
  titles: string[];
}

export interface BashoSimulationResult {
  playerRecord: BashoRecord;
  playerBoutDetails: PlayerBoutDetail[];
  sameDivisionNpcRecords: NpcBashoAggregate[];
  lowerLeagueSnapshots?: LowerLeagueSnapshots;
}
