import { BashoRecord, Rank } from '../../models';
import { LowerLeagueSnapshots } from '../lowerQuota';
import type { TorikumiMatchReason, TorikumiPair } from '../torikumi/types';
import { TorikumiDiagnostics } from '../torikumi/types';

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

export type ImportantTorikumiTrigger =
  | 'YUSHO_RACE'
  | 'JOI_DUTY'
  | 'SEKITORI_BOUNDARY'
  | 'CROSS_DIVISION_EVAL'
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
  } else if (pair.matchReason === 'TOP_RANK_DUTY') {
    trigger = 'JOI_DUTY';
    summary = '上位総当たりの割が回ってきた。';
  } else if (pair.boundaryId === 'MakuuchiJuryo' || pair.boundaryId === 'JuryoMakushita') {
    trigger = 'SEKITORI_BOUNDARY';
    summary = '関取境界の直接評価として組まれた。';
  } else if (pair.crossDivision) {
    trigger = 'CROSS_DIVISION_EVAL';
    summary = '越境戦として組まれた。';
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
  };
};
