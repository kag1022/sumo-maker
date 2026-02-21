import { BashoRecord, RikishiStatus } from '../models';
import { NpcBashoAggregate, PlayerBoutDetail } from '../simulation/basho';
import { formatKinboshiTitle } from '../simulation/titles';
import {
  BashoRecordRow,
  BanzukeDecisionRow,
  BanzukePopulationRow,
  BoutRecordRow,
  CareerRow,
  CareerState,
  getDb,
} from './db';
import type { BanzukeDecisionLog, BanzukePopulationSnapshot } from '../banzuke/types';

const MAX_SAVED_CAREERS = 200;

const toYearMonth = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

const resolveRetirementYearMonth = (status?: RikishiStatus): string | null => {
  if (!status) return null;
  const retirement = [...status.history.events]
    .reverse()
    .find((event) => event.type === 'RETIREMENT');
  if (!retirement) return null;
  return toYearMonth(retirement.year, retirement.month);
};

const toSummaryPatch = (status: RikishiStatus): Partial<CareerRow> => ({
  shikona: status.shikona,
  title: status.history.title,
  maxRank: status.history.maxRank,
  totalWins: status.history.totalWins,
  totalLosses: status.history.totalLosses,
  totalAbsent: status.history.totalAbsent,
  yushoCount: status.history.yushoCount,
  bashoCount: status.history.records.length,
  finalStatus: status,
});

const toPlayerBashoRow = (
  careerId: string,
  seq: number,
  record: BashoRecord,
  shikona: string,
): BashoRecordRow => ({
  careerId,
  seq,
  entityId: 'PLAYER',
  entityType: 'PLAYER',
  year: record.year,
  month: record.month,
  shikona,
  division: record.rank.division,
  rankName: record.rank.name,
  rankNumber: record.rank.number,
  rankSide: record.rank.side,
  wins: record.wins,
  losses: record.losses,
  absent: record.absent,
  titles: [
    ...(record.yusho ? ['YUSHO'] : []),
    ...(record.specialPrizes ?? []),
    ...((record.kinboshi ?? 0) > 0 ? [formatKinboshiTitle(record.kinboshi ?? 0)] : []),
  ],
});

const toNpcBashoRows = (
  careerId: string,
  seq: number,
  year: number,
  month: number,
  records: NpcBashoAggregate[],
): BashoRecordRow[] => {
  const dedup = new Map<string, NpcBashoAggregate>();
  for (const record of records) {
    if (!dedup.has(record.entityId)) {
      dedup.set(record.entityId, record);
    }
  }

  return [...dedup.values()].map((record) => ({
    careerId,
    seq,
    entityId: record.entityId,
    entityType: 'NPC',
    year,
    month,
    shikona: record.shikona,
    division: record.division,
    rankName: record.rankName,
    rankNumber: record.rankNumber,
    rankSide: record.rankSide,
    wins: record.wins,
    losses: record.losses,
    absent: record.absent,
    titles: record.titles,
  }));
};

const toBoutRows = (
  careerId: string,
  seq: number,
  year: number,
  month: number,
  rank: BashoRecord['rank'],
  bouts: PlayerBoutDetail[],
): BoutRecordRow[] => bouts.map((bout) => ({
  careerId,
  bashoSeq: seq,
  day: bout.day,
  year,
  month,
  playerDivision: rank.division,
  playerRankName: rank.name,
  playerRankNumber: rank.number,
  playerRankSide: rank.side,
  result: bout.result,
  kimarite: bout.kimarite,
  opponentId: bout.opponentId,
  opponentShikona: bout.opponentShikona,
  opponentRankName: bout.opponentRankName,
  opponentRankNumber: bout.opponentRankNumber,
  opponentRankSide: bout.opponentRankSide,
}));

const removeCareerRows = async (careerId: string): Promise<void> => {
  const db = getDb();
  await db.careers.delete(careerId);
  await db.bashoRecords.where('careerId').equals(careerId).delete();
  await db.boutRecords.where('careerId').equals(careerId).delete();
  await db.banzukePopulation.where('careerId').equals(careerId).delete();
  await db.banzukeDecisions.where('careerId').equals(careerId).delete();
};

export interface CreateDraftCareerParams {
  id?: string;
  initialStatus: RikishiStatus;
  careerStartYearMonth: string;
}

export interface AppendBashoChunkParams {
  careerId: string;
  seq: number;
  playerRecord: BashoRecord;
  playerBouts: PlayerBoutDetail[];
  npcRecords: NpcBashoAggregate[];
  statusSnapshot: RikishiStatus;
  banzukePopulation?: BanzukePopulationSnapshot;
  banzukeDecisions?: BanzukeDecisionLog[];
}

export interface CareerListItem {
  id: string;
  state: CareerState;
  savedAt?: string;
  updatedAt: string;
  shikona: string;
  title?: string;
  maxRank: CareerRow['maxRank'];
  totalWins: number;
  totalLosses: number;
  totalAbsent: number;
  yushoCount: CareerRow['yushoCount'];
  bashoCount: number;
  careerStartYearMonth: string;
  careerEndYearMonth: string | null;
}

export interface HeadToHeadRow {
  opponentId: string;
  latestShikona: string;
  bouts: number;
  wins: number;
  losses: number;
  absences: number;
  firstSeenSeq: number;
  lastSeenSeq: number;
}

export const createDraftCareer = async ({
  id,
  initialStatus,
  careerStartYearMonth,
}: CreateDraftCareerParams): Promise<string> => {
  const careerId = id || crypto.randomUUID();
  const now = new Date().toISOString();

  const row: CareerRow = {
    id: careerId,
    state: 'draft',
    createdAt: now,
    updatedAt: now,
    shikona: initialStatus.shikona,
    title: initialStatus.history.title,
    maxRank: initialStatus.history.maxRank,
    totalWins: initialStatus.history.totalWins,
    totalLosses: initialStatus.history.totalLosses,
    totalAbsent: initialStatus.history.totalAbsent,
    yushoCount: initialStatus.history.yushoCount,
    bashoCount: initialStatus.history.records.length,
    careerStartYearMonth,
    careerEndYearMonth: null,
    finalStatus: initialStatus,
  };

  const db = getDb();
  await db.careers.put(row);
  return careerId;
};

export const appendBashoChunk = async ({
  careerId,
  seq,
  playerRecord,
  playerBouts,
  npcRecords,
  statusSnapshot,
  banzukePopulation,
  banzukeDecisions,
}: AppendBashoChunkParams): Promise<void> => {
  const db = getDb();
  const playerRow = toPlayerBashoRow(careerId, seq, playerRecord, statusSnapshot.shikona);
  const npcRows = toNpcBashoRows(careerId, seq, playerRecord.year, playerRecord.month, npcRecords);
  const boutRows = toBoutRows(
    careerId,
    seq,
    playerRecord.year,
    playerRecord.month,
    playerRecord.rank,
    playerBouts,
  );
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.banzukePopulation,
    db.banzukeDecisions,
  ];

  await db.transaction(
    'rw',
    writableTables,
    async () => {
      const career = await db.careers.get(careerId);
      if (!career) {
        throw new Error(`Career not found: ${careerId}`);
      }

      await db.bashoRecords.bulkPut([playerRow, ...npcRows]);
      await db.boutRecords.bulkPut(boutRows);
      if (banzukePopulation) {
        const row: BanzukePopulationRow = {
          ...banzukePopulation,
          careerId,
          seq,
        };
        await db.banzukePopulation.put(row);
      }
      if (banzukeDecisions?.length) {
        const rows: BanzukeDecisionRow[] = banzukeDecisions.map((log) => ({
          ...log,
          careerId,
          seq,
        }));
        await db.banzukeDecisions.bulkPut(rows);
      }

      const now = new Date().toISOString();
      const retirementYm = resolveRetirementYearMonth(statusSnapshot);
      await db.careers.update(careerId, {
        ...toSummaryPatch(statusSnapshot),
        updatedAt: now,
        careerEndYearMonth: retirementYm,
      });
    },
  );
};

export const markCareerCompleted = async (
  careerId: string,
  finalStatus: RikishiStatus,
): Promise<void> => {
  const db = getDb();
  const now = new Date().toISOString();
  await db.careers.update(careerId, {
    ...toSummaryPatch(finalStatus),
    updatedAt: now,
    careerEndYearMonth: resolveRetirementYearMonth(finalStatus),
  });
};

export const commitCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.banzukePopulation,
    db.banzukeDecisions,
  ];
  await db.transaction('rw', writableTables, async () => {
    const career = await db.careers.get(careerId);
    if (!career) {
      throw new Error(`Career not found: ${careerId}`);
    }

    const now = new Date().toISOString();
    await db.careers.update(careerId, {
      state: 'saved',
      savedAt: now,
      updatedAt: now,
      careerEndYearMonth:
        career.careerEndYearMonth ?? resolveRetirementYearMonth(career.finalStatus),
    });

    const savedRows = await db.careers.where('state').equals('saved').toArray();
    const sorted = savedRows
      .filter((row) => row.savedAt)
      .sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));

    const overflow = sorted.length - MAX_SAVED_CAREERS;
    if (overflow > 0) {
      const deleteIds = sorted.slice(0, overflow).map((row) => row.id);
      for (const id of deleteIds) {
        await removeCareerRows(id);
      }
    }
  });
};

export const discardDraftCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.banzukePopulation,
    db.banzukeDecisions,
  ];
  await db.transaction('rw', writableTables, async () => {
    const row = await db.careers.get(careerId);
    if (!row || row.state !== 'draft') return;
    await removeCareerRows(careerId);
  });
};

export const listCommittedCareers = async (): Promise<CareerListItem[]> => {
  const db = getDb();
  const rows = await db.careers.where('state').equals('saved').toArray();
  return rows
    .sort((a, b) => {
      const endCmp = (b.careerEndYearMonth || '').localeCompare(a.careerEndYearMonth || '');
      if (endCmp !== 0) return endCmp;
      return (b.savedAt || '').localeCompare(a.savedAt || '');
    })
    .map((row) => ({
      id: row.id,
      state: row.state,
      savedAt: row.savedAt,
      updatedAt: row.updatedAt,
      shikona: row.shikona,
      title: row.title,
      maxRank: row.maxRank,
      totalWins: row.totalWins,
      totalLosses: row.totalLosses,
      totalAbsent: row.totalAbsent,
      yushoCount: row.yushoCount,
      bashoCount: row.bashoCount,
      careerStartYearMonth: row.careerStartYearMonth,
      careerEndYearMonth: row.careerEndYearMonth,
    }));
};

export const loadCareerStatus = async (careerId: string): Promise<RikishiStatus | null> => {
  const db = getDb();
  const row = await db.careers.get(careerId);
  if (!row) return null;
  return row.finalStatus ?? null;
};

export const deleteCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.banzukePopulation,
    db.banzukeDecisions,
  ];
  await db.transaction('rw', writableTables, async () => {
    await removeCareerRows(careerId);
  });
};

export const isCareerSaved = async (careerId: string): Promise<boolean> => {
  const db = getDb();
  const row = await db.careers.get(careerId);
  return row?.state === 'saved';
};

export const buildCareerStartYearMonth = (year: number, month: number): string =>
  toYearMonth(year, month);

export const getCareerHeadToHead = async (careerId: string): Promise<HeadToHeadRow[]> => {
  const db = getDb();
  const bouts = await db.boutRecords.where('careerId').equals(careerId).toArray();
  const npcRows = await db.bashoRecords
    .where('[careerId+entityType]')
    .equals([careerId, 'NPC'])
    .toArray();

  const latestNameById = new Map<string, { seq: number; shikona: string }>();
  for (const row of npcRows) {
    const current = latestNameById.get(row.entityId);
    if (!current || row.seq > current.seq) {
      latestNameById.set(row.entityId, { seq: row.seq, shikona: row.shikona });
    }
  }

  const byOpponent = new Map<string, HeadToHeadRow>();
  for (const bout of bouts) {
    if (!bout.opponentId) continue;
    const key = bout.opponentId;
    const existing = byOpponent.get(key);
    if (!existing) {
      byOpponent.set(key, {
        opponentId: key,
        latestShikona:
          latestNameById.get(key)?.shikona ??
          bout.opponentShikona ??
          key,
        bouts: 1,
        wins: bout.result === 'WIN' ? 1 : 0,
        losses: bout.result === 'LOSS' ? 1 : 0,
        absences: bout.result === 'ABSENT' ? 1 : 0,
        firstSeenSeq: bout.bashoSeq,
        lastSeenSeq: bout.bashoSeq,
      });
      continue;
    }

    existing.bouts += 1;
    if (bout.result === 'WIN') existing.wins += 1;
    if (bout.result === 'LOSS') existing.losses += 1;
    if (bout.result === 'ABSENT') existing.absences += 1;
    existing.firstSeenSeq = Math.min(existing.firstSeenSeq, bout.bashoSeq);
    existing.lastSeenSeq = Math.max(existing.lastSeenSeq, bout.bashoSeq);
    const latestName = latestNameById.get(key)?.shikona ?? bout.opponentShikona;
    if (latestName) existing.latestShikona = latestName;
  }

  return [...byOpponent.values()].sort((a, b) => {
    if (b.bouts !== a.bouts) return b.bouts - a.bouts;
    if (b.lastSeenSeq !== a.lastSeenSeq) return b.lastSeenSeq - a.lastSeenSeq;
    return a.opponentId.localeCompare(b.opponentId);
  });
};

export const appendBanzukePopulation = async (
  snapshot: BanzukePopulationSnapshot & { careerId: string },
): Promise<void> => {
  const db = getDb();
  await db.banzukePopulation.put(snapshot);
};

export const appendBanzukeDecisionLogs = async (
  logs: BanzukeDecisionLog[],
): Promise<void> => {
  if (!logs.length) return;
  const db = getDb();
  await db.banzukeDecisions.bulkPut(logs);
};

export const listBanzukeDecisions = async (
  careerId: string,
  seq: number,
): Promise<BanzukeDecisionLog[]> => {
  const db = getDb();
  return db.banzukeDecisions.where('[careerId+seq]').equals([careerId, seq]).toArray();
};

export const listBanzukePopulation = async (
  careerId: string,
): Promise<Array<BanzukePopulationSnapshot & { careerId: string }>> => {
  const db = getDb();
  return db.banzukePopulation.where('careerId').equals(careerId).toArray();
};
