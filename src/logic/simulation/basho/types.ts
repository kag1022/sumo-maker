import { BashoRecord, Rank, WinRoute } from '../../models';
import type { EnemyStyleBias } from '../../catalog/enemyData';
import { LowerLeagueSnapshots } from '../lowerQuota';
import type { TorikumiMatchReason, TorikumiPair } from '../torikumi/types';
import { TorikumiDiagnostics } from '../torikumi/types';

export type BoutOutcome = 'WIN' | 'LOSS' | 'ABSENT';

export interface PlayerBoutDetail {
  day: number;
  result: BoutOutcome;
  kimarite?: string;
  winRoute?: WinRoute;
  opponentId?: string;
  opponentShikona?: string;
  opponentRankName?: string;
  opponentRankNumber?: number;
  opponentRankSide?: 'East' | 'West';
  opponentStyleBias?: EnemyStyleBias;
}

export interface NpcBashoAggregate {
  entityId: string;
  shikona: string;
  division: Rank['division'];
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  rankSpecialStatus?: Rank['specialStatus'];
  wins: number;
  losses: number;
  absent: number;
  titles: string[];
  careerBashoCount?: number;
}

export type ImportantTorikumiTrigger =
  | 'YUSHO_RACE'
  | 'YUSHO_DIRECT'
  | 'YUSHO_PURSUIT'
  | 'JOI_DUTY'
  | 'JOI_ASSIGNMENT'
  | 'SEKITORI_BOUNDARY'
  | 'JURYO_BOUNDARY'
  | 'CROSS_DIVISION_EVAL'
  | 'LOWER_BOUNDARY'
  | 'LATE_RELAXATION';

export interface ImportantTorikumiNote {
  day: number;
  year: number;
  month: number;
  opponentId?: string;
  opponentShikona?: string;
  opponentRank: Rank;
  trigger: ImportantTorikumiTrigger;
  summary: string;
  matchReason: TorikumiMatchReason;
  relaxationStage: number;
  phaseId?: string;
  repairDepth?: number;
  contentionTier?: 'Leader' | 'Contender' | 'Outside';
  titleImplication?: 'DIRECT' | 'CHASE' | 'NONE';
  boundaryImplication?: 'PROMOTION' | 'DEMOTION' | 'NONE';
}

export interface BashoSimulationResult {
  playerRecord: BashoRecord;
  playerBoutDetails: PlayerBoutDetail[];
  sameDivisionNpcRecords: NpcBashoAggregate[];
  importantTorikumiNotes?: ImportantTorikumiNote[];
  lowerLeagueSnapshots?: LowerLeagueSnapshots;
  torikumiDiagnostics?: TorikumiDiagnostics;
}

export const buildImportantTorikumiNote = ({
  pair,
  day,
  year,
  month,
  opponentId,
  opponentShikona,
  opponentRank,
}: {
  pair: TorikumiPair;
  day: number;
  year: number;
  month: number;
  opponentId?: string;
  opponentShikona?: string;
  opponentRank: Rank;
}): ImportantTorikumiNote | null => {
  let trigger: ImportantTorikumiTrigger | null = null;
  let summary = '';

  if (pair.matchReason === 'YUSHO_RACE') {
    trigger = 'YUSHO_RACE';
    summary = '優勝争いの割で組まれた。';
  } else if (pair.matchReason === 'YUSHO_DIRECT') {
    trigger = 'YUSHO_DIRECT';
    summary = '優勝争いの直接対決として組まれた。';
  } else if (pair.matchReason === 'YUSHO_PURSUIT') {
    trigger = 'YUSHO_PURSUIT';
    summary = '優勝争いの追走線として組まれた。';
  } else if (pair.matchReason === 'TOP_RANK_DUTY') {
    trigger = 'JOI_DUTY';
    summary = '上位総当たりの割が回ってきた。';
  } else if (
    pair.matchReason === 'SANYAKU_ROUND_ROBIN' ||
    pair.matchReason === 'JOI_ASSIGNMENT'
  ) {
    trigger = 'JOI_ASSIGNMENT';
    summary = '上位番付の義務戦として組まれた。';
  } else if (pair.boundaryId === 'MakuuchiJuryo' || pair.boundaryId === 'JuryoMakushita') {
    trigger = 'SEKITORI_BOUNDARY';
    summary = '関取境界の直接評価として組まれた。';
  } else if (
    pair.matchReason === 'JURYO_PROMOTION_RACE' ||
    pair.matchReason === 'JURYO_DEMOTION_RACE' ||
    pair.matchReason === 'JURYO_MAKUSHITA_EXCHANGE'
  ) {
    trigger = 'JURYO_BOUNDARY';
    summary = '十両の昇降評価線に沿って組まれた。';
  } else if (pair.crossDivision) {
    trigger = 'CROSS_DIVISION_EVAL';
    summary = '越境戦として組まれた。';
  } else if (pair.matchReason === 'LOWER_BOUNDARY_EVAL') {
    trigger = 'LOWER_BOUNDARY';
    summary = '下位段境界の評価戦として組まれた。';
  } else if (pair.matchReason === 'REPAIR_SWAP') {
    trigger = 'LATE_RELAXATION';
    summary = '組み直し修復を経て相手が決まった。';
  } else if (pair.relaxationStage >= 2 || pair.matchReason === 'FALLBACK') {
    trigger = 'LATE_RELAXATION';
    summary = '制約緩和が深い編成で相手が決まった。';
  }

  if (!trigger) return null;

  return {
    day,
    year,
    month,
    opponentId,
    opponentShikona,
    opponentRank,
    trigger,
    summary,
    matchReason: pair.matchReason,
    relaxationStage: pair.relaxationStage,
    phaseId: pair.phaseId,
    repairDepth: pair.repairDepth,
    contentionTier: pair.contentionTier,
    titleImplication: pair.titleImplication,
    boundaryImplication: pair.boundaryImplication,
  };
};
