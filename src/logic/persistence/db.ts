import Dexie, { Table } from 'dexie';
import { Rank, RikishiStatus } from '../models';
import type { BanzukeDecisionLog, BanzukePopulationSnapshot } from '../banzuke/types';

export type CareerState = 'draft' | 'saved';

export interface CareerYushoSummary {
  makuuchi: number;
  juryo: number;
  makushita: number;
  others: number;
}

export interface CareerRow {
  id: string;
  state: CareerState;
  createdAt: string;
  updatedAt: string;
  savedAt?: string;
  shikona: string;
  title?: string;
  maxRank: Rank;
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  yushoCount: CareerYushoSummary;
  bashoCount: number;
  careerStartYearMonth: string;
  careerEndYearMonth: string | null;
  finalStatus?: RikishiStatus;
}

export type BashoEntityType = 'PLAYER' | 'NPC';

export interface BashoRecordRow {
  careerId: string;
  seq: number;
  entityId: string;
  entityType: BashoEntityType;
  year: number;
  month: number;
  shikona: string;
  division: string;
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  wins: number;
  losses: number;
  absent: number;
  titles: string[];
}

export type BoutResultType = 'WIN' | 'LOSS' | 'ABSENT';

export interface BoutRecordRow {
  careerId: string;
  bashoSeq: number;
  day: number;
  year: number;
  month: number;
  playerDivision: string;
  playerRankName: string;
  playerRankNumber?: number;
  playerRankSide?: 'East' | 'West';
  result: BoutResultType;
  kimarite?: string;
  opponentId?: string;
  opponentShikona?: string;
  opponentRankName?: string;
  opponentRankNumber?: number;
  opponentRankSide?: 'East' | 'West';
}

export interface WalletRow {
  key: 'wallet';
  points: number;
  lastRegenAt: number;
  updatedAt: string;
}

export type MetaRow = WalletRow;

export interface BanzukePopulationRow extends BanzukePopulationSnapshot {
  careerId: string;
}

export type BanzukeDecisionRow = BanzukeDecisionLog;

class SumoMakerDatabase extends Dexie {
  careers!: Table<CareerRow, string>;

  bashoRecords!: Table<BashoRecordRow, [string, number, string]>;

  boutRecords!: Table<BoutRecordRow, [string, number, number]>;

  meta!: Table<MetaRow, string>;

  banzukePopulation!: Table<BanzukePopulationRow, [string, number]>;

  banzukeDecisions!: Table<BanzukeDecisionRow, [string, number, string]>;

  constructor() {
    super('sumo-maker-v6');

    this.version(1).stores({
      careers:
        '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
    });

    this.version(2).stores({
      careers:
        '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      meta: '&key, updatedAt',
    });

    // Test-play migration: top up existing wallet once without changing normal spend behavior.
    this.version(3)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        meta: '&key, updatedAt',
      })
      .upgrade(async (tx) => {
        const wallet = await tx.table<WalletRow, string>('meta').get('wallet');
        if (!wallet) return;
        if (wallet.points >= 500) return;
        await tx.table<WalletRow, string>('meta').put({
          ...wallet,
          points: 500,
          updatedAt: new Date().toISOString(),
        });
      });

    this.version(4).stores({
      careers:
        '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      meta: '&key, updatedAt',
      banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
      banzukeDecisions: '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId',
    });
  }
}

let dbInstance: SumoMakerDatabase | null = null;

const bindIndexedDbDependencies = (): void => {
  const globalScope = globalThis as unknown as {
    indexedDB?: IDBFactory;
    IDBKeyRange?: typeof IDBKeyRange;
  };
  if (globalScope.indexedDB) {
    Dexie.dependencies.indexedDB = globalScope.indexedDB;
  }
  if (globalScope.IDBKeyRange) {
    Dexie.dependencies.IDBKeyRange = globalScope.IDBKeyRange;
  }
};

export const getDb = (): SumoMakerDatabase => {
  if (!dbInstance) {
    bindIndexedDbDependencies();
    dbInstance = new SumoMakerDatabase();
  }
  return dbInstance;
};

export const closeDb = (): void => {
  if (!dbInstance) return;
  dbInstance.close();
  dbInstance = null;
};
