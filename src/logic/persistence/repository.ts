import {
  BashoRecord,
  CollectionTier,
  CollectionType,
  OyakataBlueprint,
  OyakataProfile,
  RikishiStatus,
} from '../models';
import { NpcBashoAggregate, PlayerBoutDetail } from '../simulation/basho';
import { formatKinboshiTitle } from '../simulation/titles';
import {
  AdRewardLedgerRow,
  BashoRecordRow,
  BanzukeDecisionRow,
  BanzukePopulationRow,
  BoutRecordRow,
  CareerRow,
  CareerState,
  SimulationDiagnosticsRow,
  getDb,
} from './db';
import type { BanzukeDecisionLog, BanzukePopulationSnapshot } from '../banzuke/types';
import { SimulationDiagnostics } from '../simulation/diagnostics';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from '../simulation/modelVersion';
import { addWalletPoints } from './wallet';
import { buildCareerRewardSummary, calculateCareerPrizeBreakdown } from '../economy/prizeMoney';
import { evaluateAchievementProgress } from '../achievements';
import { KIMARITE_CATALOG, normalizeKimariteName } from '../kimarite/catalog';
import { deriveOyakataProfile } from '../oyakata/profile';
import { ensureKataProfile, resolveKataDisplay } from '../style/kata';
import {
  createUnlockedOyakataBlueprint,
  ensurePhaseAStatus,
  resolvePhaseARewardPoints,
  STARTER_OYAKATA_BLUEPRINTS,
} from '../phaseA';

const MAX_SHELVED_CAREERS = 200;
const COLLECTION_TYPES: CollectionType[] = ['RIKISHI', 'OYAKATA', 'KIMARITE', 'ACHIEVEMENT'];
const OFFICIAL_KIMARITE_KEYS = new Set(KIMARITE_CATALOG.map((entry) => entry.name));

const normalizeBanzukeDecisionLog = (log: BanzukeDecisionLog): BanzukeDecisionLog => ({
  ...log,
  modelVersion: log.modelVersion ?? DEFAULT_SIMULATION_MODEL_VERSION,
  proposalSource: log.proposalSource ?? 'COMMITTEE_MODEL',
  constraintHits: log.constraintHits ?? [],
});

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
  finalStatus: ensurePhaseAStatus(status),
});

const toCollectionEntryId = (type: CollectionType, key: string): string => `${type}:${key}`;

const resolveCollectionKey = (type: CollectionType, key: string): string | null => {
  if (type !== 'KIMARITE') return key;
  const normalized = normalizeKimariteName(key);
  return OFFICIAL_KIMARITE_KEYS.has(normalized) ? normalized : null;
};

const resolveKimariteTier = (
  progress: number,
): { tier: CollectionTier; target: number } => {
  if (progress >= 50) return { tier: 'GOLD', target: 50 };
  if (progress >= 10) return { tier: 'SILVER', target: 50 };
  return { tier: 'BRONZE', target: 10 };
};

const unlockCollectionEntry = async (
  type: CollectionType,
  key: string,
  sourceCareerId?: string,
  options?: {
    progressIncrement?: number;
  },
): Promise<boolean> => {
  const db = getDb();
  const resolvedKey = resolveCollectionKey(type, key);
  if (!resolvedKey) return false;
  const id = toCollectionEntryId(type, resolvedKey);
  const existing = await db.collectionEntries.get(id);
  const now = new Date().toISOString();
  const progressIncrement = Math.max(0, Math.floor(options?.progressIncrement ?? 0));
  if (!existing) {
    const progress = type === 'KIMARITE' ? Math.max(1, progressIncrement) : undefined;
    const kimariteTier = type === 'KIMARITE' ? resolveKimariteTier(progress ?? 1) : undefined;
    await db.collectionEntries.put({
      id,
      type,
      key: resolvedKey,
      sourceCareerId,
      unlockedAt: now,
      progress,
      tier: kimariteTier?.tier,
      target: kimariteTier?.target,
      isNew: true,
    });
    return true;
  }

  let changed = false;
  const patch: Partial<typeof existing> = {};
  if (type === 'KIMARITE' && progressIncrement > 0) {
    const nextProgress = (existing.progress ?? 0) + progressIncrement;
    const nextTier = resolveKimariteTier(nextProgress);
    if (nextProgress !== existing.progress) {
      patch.progress = nextProgress;
      changed = true;
    }
    if (nextTier.tier !== existing.tier || nextTier.target !== existing.target) {
      patch.tier = nextTier.tier;
      patch.target = nextTier.target;
      changed = true;
    }
  }
  if (changed || !existing.isNew) {
    patch.isNew = true;
    await db.collectionEntries.update(id, patch);
  }
  return changed;
};

const unlockCollectionsForStatus = async (
  careerId: string,
  status: RikishiStatus,
  includeOyakata: boolean,
): Promise<number> => {
  let changedCount = 0;
  if (await unlockCollectionEntry('RIKISHI', careerId, careerId)) changedCount += 1;

  const kimarite = Object.entries(status.history.kimariteTotal ?? {}).filter(([, count]) => count > 0);
  for (const [key, count] of kimarite) {
    if (await unlockCollectionEntry('KIMARITE', key, careerId, { progressIncrement: count })) {
      changedCount += 1;
    }
  }

  const achievements = evaluateAchievementProgress(status).unlocked;
  for (const achievement of achievements) {
    if (await unlockCollectionEntry('ACHIEVEMENT', achievement.id, careerId)) changedCount += 1;
  }

  if (includeOyakata) {
    if (await unlockCollectionEntry('OYAKATA', careerId, careerId)) changedCount += 1;
  }
  return changedCount;
};

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
  await db.simulationDiagnostics.where('careerId').equals(careerId).delete();
  await db.careerRewardLedger.delete(careerId);
  await db.collectionEntries.where('sourceCareerId').equals(careerId).delete();
};

export interface CreateDraftCareerParams {
  id?: string;
  initialStatus: RikishiStatus;
  careerStartYearMonth: string;
  simulationModelVersion?: SimulationModelVersion;
  selectedOyakataId?: string | null;
}

const parseParentCareerId = (
  selectedOyakataId?: string | null,
  existingCareerIds?: Set<string>,
): string | undefined => {
  if (!selectedOyakataId) return undefined;
  const candidate = selectedOyakataId.startsWith('oyakata:')
    ? selectedOyakataId.slice('oyakata:'.length)
    : selectedOyakataId;
  if (!candidate) return undefined;
  if (existingCareerIds && !existingCareerIds.has(candidate)) return undefined;
  return candidate;
};

export const resolveParentCareerId = async (
  selectedOyakataId?: string | null,
): Promise<string | undefined> => {
  const db = getDb();
  const rows = await db.careers.toArray();
  const existingCareerIds = new Set(rows.map((row) => row.id));
  return parseParentCareerId(selectedOyakataId, existingCareerIds);
};

export interface AppendBashoChunkParams {
  careerId: string;
  seq: number;
  playerRecord: BashoRecord;
  playerBouts: PlayerBoutDetail[];
  npcRecords: NpcBashoAggregate[];
  statusSnapshot: RikishiStatus;
  banzukePopulation?: BanzukePopulationSnapshot;
  banzukeDecisions?: BanzukeDecisionLog[];
  diagnostics?: SimulationDiagnostics;
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
  lifetimePrizeYen?: number;
  earnedPointsFromPrize?: number;
  oyakataProfile?: OyakataProfile;
  kataLabel?: string;
  parentCareerId?: string;
  generation?: number;
  careerIndex?: number;
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

export interface CareerPlayerBoutsByBasho {
  bashoSeq: number;
  bouts: PlayerBoutDetail[];
}

export const createDraftCareer = async ({
  id,
  initialStatus,
  careerStartYearMonth,
  simulationModelVersion,
  selectedOyakataId,
}: CreateDraftCareerParams): Promise<string> => {
  const careerId = id || crypto.randomUUID();
  const now = new Date().toISOString();
  const db = getDb();
  const allRows = await db.careers.toArray();
  const existingCareerIds = new Set(allRows.map((row) => row.id));
  const parentCareerId = parseParentCareerId(selectedOyakataId, existingCareerIds);
  const parentGeneration = parentCareerId
    ? allRows.find((row) => row.id === parentCareerId)?.generation ?? 1
    : 0;
  const generation = parentCareerId ? Math.min(99, parentGeneration + 1) : 1;
  const nextCareerIndex = allRows.reduce((max, row) => Math.max(max, row.careerIndex ?? 0), 0) + 1;

  const row: CareerRow = {
    id: careerId,
    state: 'in_progress',
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
    simulationModelVersion: simulationModelVersion ?? DEFAULT_SIMULATION_MODEL_VERSION,
    finalStatus: initialStatus,
    lifetimePrizeYen: 0,
    earnedPointsFromPrize: 0,
    selectedOyakataId: selectedOyakataId ?? null,
    parentCareerId,
    generation,
    careerIndex: nextCareerIndex,
  };

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
  diagnostics,
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
    db.simulationDiagnostics,
    db.careerRewardLedger,
    db.collectionEntries,
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
        const rows: BanzukeDecisionRow[] = banzukeDecisions.map((rawLog) => ({
          ...normalizeBanzukeDecisionLog(rawLog),
          careerId,
          seq,
        }));
        await db.banzukeDecisions.bulkPut(rows);
      }
      if (diagnostics) {
        const row: SimulationDiagnosticsRow = {
          ...diagnostics,
          careerId,
          seq,
        };
        await db.simulationDiagnostics.put(row);
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
  const normalizedStatus = ensurePhaseAStatus(finalStatus);
  const breakdown = calculateCareerPrizeBreakdown(normalizedStatus);
  const rewardSummary = buildCareerRewardSummary(breakdown);
  normalizedStatus.history.prizeBreakdown = breakdown;
  normalizedStatus.history.rewardSummary = rewardSummary;

  await db.careers.update(careerId, {
    ...toSummaryPatch(normalizedStatus),
    state: 'unshelved',
    updatedAt: now,
    careerEndYearMonth: resolveRetirementYearMonth(normalizedStatus),
    lifetimePrizeYen: breakdown.totalYen,
    prizeBreakdown: breakdown,
    earnedPointsFromPrize: 0,
    pointConversionRuleId: rewardSummary.conversionRuleId,
    rewardGrantedAt: undefined,
  });
};

export const shelveCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.banzukePopulation,
    db.banzukeDecisions,
    db.simulationDiagnostics,
    db.careerRewardLedger,
    db.collectionEntries,
    db.meta,
    db.walletTransactions,
  ];
  await db.transaction('rw', writableTables, async () => {
    const career = await db.careers.get(careerId);
    if (!career) {
      throw new Error(`Career not found: ${careerId}`);
    }

    const now = new Date().toISOString();
    const oyakataProfile = career.finalStatus
      ? deriveOyakataProfile(careerId, career.finalStatus)
      : undefined;
    let finalStatus = career.finalStatus;
    if (finalStatus?.history.prizeBreakdown) {
      const rewardSummary = buildCareerRewardSummary(finalStatus.history.prizeBreakdown);
      const existingReward = await db.careerRewardLedger.get(careerId);
      const grantedPoints = resolvePhaseARewardPoints(rewardSummary.awardedPoints);
      if (!existingReward && grantedPoints > 0) {
        const grantedAt = new Date().toISOString();
        await addWalletPoints(grantedPoints, 'CAREER_PRIZE_REWARD', careerId);
        await db.careerRewardLedger.put({
          careerId,
          lifetimePrizeYen: finalStatus.history.prizeBreakdown.totalYen,
          pointsAwarded: grantedPoints,
          conversionRuleId: rewardSummary.conversionRuleId,
          grantedAt,
          updatedAt: grantedAt,
        });
        finalStatus = {
          ...finalStatus,
          history: {
            ...finalStatus.history,
            rewardSummary: {
              ...rewardSummary,
              granted: true,
              grantedAt,
              awardedPoints: rewardSummary.awardedPoints,
              convertedPoints: grantedPoints,
            },
          },
        };
      } else if (existingReward) {
        finalStatus = {
          ...finalStatus,
          history: {
            ...finalStatus.history,
            rewardSummary: {
              ...rewardSummary,
              granted: true,
              grantedAt: existingReward.grantedAt,
              awardedPoints: rewardSummary.awardedPoints,
              convertedPoints: existingReward.pointsAwarded,
            },
          },
        };
      }
    }
    await db.careers.update(careerId, {
      state: 'shelved',
      savedAt: now,
      updatedAt: now,
      careerEndYearMonth:
        career.careerEndYearMonth ?? resolveRetirementYearMonth(finalStatus),
      oyakataProfile,
      finalStatus: finalStatus ? ensurePhaseAStatus(finalStatus) : finalStatus,
      lifetimePrizeYen: finalStatus?.history.prizeBreakdown?.totalYen ?? career.lifetimePrizeYen,
      earnedPointsFromPrize: finalStatus?.history.rewardSummary?.convertedPoints ?? career.earnedPointsFromPrize,
      rewardGrantedAt: finalStatus?.history.rewardSummary?.grantedAt,
    });

    const savedRows = await db.careers.where('state').equals('shelved').toArray();
    const sorted = savedRows
      .filter((row) => row.savedAt)
      .sort((a, b) => (a.savedAt || '').localeCompare(b.savedAt || ''));

    const overflow = sorted.length - MAX_SHELVED_CAREERS;
    if (overflow > 0) {
      const deleteIds = sorted.slice(0, overflow).map((row) => row.id);
      for (const id of deleteIds) {
        await removeCareerRows(id);
      }
    }
  });

  const career = await db.careers.get(careerId);
  if (career?.finalStatus) {
    const collectionDeltaCount = await unlockCollectionsForStatus(careerId, career.finalStatus, true);
    await db.careers.update(careerId, { collectionDeltaCount });
  }
};

export const commitCareer = async (careerId: string): Promise<void> => shelveCareer(careerId);

export const discardCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.banzukePopulation,
    db.banzukeDecisions,
    db.simulationDiagnostics,
    db.careerRewardLedger,
    db.collectionEntries,
  ];
  await db.transaction('rw', writableTables, async () => {
    const row = await db.careers.get(careerId);
    if (!row || row.state === 'shelved') return;
    await removeCareerRows(careerId);
  });
};

export const discardDraftCareer = async (careerId: string): Promise<void> => discardCareer(careerId);

const toCareerListItem = (row: CareerRow): CareerListItem => ({
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
  lifetimePrizeYen: row.lifetimePrizeYen,
  earnedPointsFromPrize: row.earnedPointsFromPrize,
  oyakataProfile: row.oyakataProfile,
  kataLabel: resolveKataDisplay(row.finalStatus?.kataProfile).styleLabel,
  parentCareerId: row.parentCareerId,
  generation: row.generation,
  careerIndex: row.careerIndex,
});

export const listShelvedCareers = async (): Promise<CareerListItem[]> => {
  const db = getDb();
  const rows = await db.careers.where('state').equals('shelved').toArray();
  return rows
    .sort((a, b) => {
      const endCmp = (b.careerEndYearMonth || '').localeCompare(a.careerEndYearMonth || '');
      if (endCmp !== 0) return endCmp;
      return (b.savedAt || '').localeCompare(a.savedAt || '');
    })
    .map(toCareerListItem);
};

export const listCommittedCareers = async (): Promise<CareerListItem[]> => listShelvedCareers();

export const listUnshelvedCareers = async (): Promise<CareerListItem[]> => {
  const db = getDb();
  const rows = await db.careers.where('state').equals('unshelved').toArray();
  return rows
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toCareerListItem);
};

export interface GenealogyNode {
  careerId: string;
  parentCareerId?: string;
  generation: number;
  shikona: string;
  maxRank: CareerRow['maxRank'];
  lifetimePrizeYen: number;
  children: GenealogyNode[];
}

export interface GenealogyTree {
  roots: GenealogyNode[];
}

const sortGenealogyNode = (node: GenealogyNode): void => {
  node.children.sort((a, b) => {
    if (a.generation !== b.generation) return a.generation - b.generation;
    return a.shikona.localeCompare(b.shikona, 'ja');
  });
  for (const child of node.children) sortGenealogyNode(child);
};

export const buildGenealogyTree = async (
  rootCareerId?: string,
): Promise<GenealogyTree> => {
  const db = getDb();
  const rows = await db.careers.where('state').equals('shelved').toArray();
  const nodeMap = new Map<string, GenealogyNode>();
  for (const row of rows) {
    nodeMap.set(row.id, {
      careerId: row.id,
      parentCareerId: row.parentCareerId,
      generation: row.generation ?? 1,
      shikona: row.shikona,
      maxRank: row.maxRank,
      lifetimePrizeYen: row.lifetimePrizeYen ?? 0,
      children: [],
    });
  }

  const roots: GenealogyNode[] = [];
  for (const row of rows) {
    const node = nodeMap.get(row.id);
    if (!node) continue;
    const parent = row.parentCareerId ? nodeMap.get(row.parentCareerId) : undefined;
    if (parent && parent.careerId !== node.careerId) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  for (const root of roots) sortGenealogyNode(root);
  roots.sort((a, b) => a.generation - b.generation || a.shikona.localeCompare(b.shikona, 'ja'));

  if (rootCareerId) {
    const root = nodeMap.get(rootCareerId);
    return { roots: root ? [root] : [] };
  }
  return { roots };
};

export const loadCareerStatus = async (careerId: string): Promise<RikishiStatus | null> => {
  const db = getDb();
  const row = await db.careers.get(careerId);
  if (!row) return null;
  return row.finalStatus ? ensurePhaseAStatus(ensureKataProfile(row.finalStatus)) : null;
};

export const deleteCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.banzukePopulation,
    db.banzukeDecisions,
    db.simulationDiagnostics,
    db.careerRewardLedger,
    db.collectionEntries,
  ];
  await db.transaction('rw', writableTables, async () => {
    await removeCareerRows(careerId);
  });
};

export const isCareerSaved = async (careerId: string): Promise<boolean> => {
  const db = getDb();
  const row = await db.careers.get(careerId);
  return row?.state === 'shelved';
};

export const buildCareerStartYearMonth = (year: number, month: number): string =>
  toYearMonth(year, month);

export const listCareerPlayerBoutsByBasho = async (
  careerId: string,
): Promise<CareerPlayerBoutsByBasho[]> => {
  const db = getDb();
  const rows = await db.boutRecords.where('careerId').equals(careerId).toArray();
  const grouped = new Map<number, PlayerBoutDetail[]>();
  const sortedRows = rows
    .slice()
    .sort((a, b) => a.bashoSeq - b.bashoSeq || a.day - b.day);

  for (const row of sortedRows) {
    const bouts = grouped.get(row.bashoSeq) ?? [];
    bouts.push({
      day: row.day,
      result: row.result,
      kimarite: row.kimarite,
      opponentId: row.opponentId,
      opponentShikona: row.opponentShikona,
      opponentRankName: row.opponentRankName,
      opponentRankNumber: row.opponentRankNumber,
      opponentRankSide: row.opponentRankSide,
    });
    grouped.set(row.bashoSeq, bouts);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bashoSeq, bouts]) => ({ bashoSeq, bouts }));
};

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
  await db.banzukeDecisions.bulkPut(logs.map(normalizeBanzukeDecisionLog));
};

export const appendSimulationDiagnostics = async (
  diagnostics: SimulationDiagnostics & { careerId: string },
): Promise<void> => {
  const db = getDb();
  await db.simulationDiagnostics.put(diagnostics);
};

export const listBanzukeDecisions = async (
  careerId: string,
  seq: number,
): Promise<BanzukeDecisionLog[]> => {
  const db = getDb();
  return db.banzukeDecisions.where('[careerId+seq]').equals([careerId, seq]).toArray();
};

export const listCareerBanzukeDecisions = async (
  careerId: string,
): Promise<BanzukeDecisionLog[]> => {
  const db = getDb();
  return db.banzukeDecisions
    .where('careerId')
    .equals(careerId)
    .sortBy('seq');
};

export const listBanzukePopulation = async (
  careerId: string,
): Promise<Array<BanzukePopulationSnapshot & { careerId: string }>> => {
  const db = getDb();
  return db.banzukePopulation.where('careerId').equals(careerId).toArray();
};

export const listCareerSimulationDiagnostics = async (
  careerId: string,
): Promise<Array<SimulationDiagnostics & { careerId: string }>> => {
  const db = getDb();
  return db.simulationDiagnostics.where('careerId').equals(careerId).toArray();
};

export interface CareerRewardLedgerItem {
  careerId: string;
  lifetimePrizeYen: number;
  pointsAwarded: number;
  conversionRuleId: string;
  grantedAt: string;
}

export const getCareerRewardLedger = async (
  careerId: string,
): Promise<CareerRewardLedgerItem | null> => {
  const db = getDb();
  const row = await db.careerRewardLedger.get(careerId);
  if (!row) return null;
  return {
    careerId: row.careerId,
    lifetimePrizeYen: row.lifetimePrizeYen,
    pointsAwarded: row.pointsAwarded,
    conversionRuleId: row.conversionRuleId,
    grantedAt: row.grantedAt,
  };
};

export interface CollectionSummaryRow {
  type: CollectionType;
  count: number;
  newCount: number;
}

export const listCollectionSummary = async (): Promise<CollectionSummaryRow[]> => {
  const db = getDb();
  const allRows = await db.collectionEntries.toArray();
  const summary: CollectionSummaryRow[] = COLLECTION_TYPES.map((type) => ({
    type,
    count: 0,
    newCount: 0,
  }));
  const grouped = new Map<string, { type: CollectionType; isNew: boolean }>();

  for (const row of allRows) {
    const resolvedKey = resolveCollectionKey(row.type, row.key);
    if (!resolvedKey) continue;
    const normalizedId = toCollectionEntryId(row.type, resolvedKey);
    const existing = grouped.get(normalizedId);
    if (!existing) {
      grouped.set(normalizedId, { type: row.type, isNew: Boolean(row.isNew) });
      continue;
    }
    existing.isNew = existing.isNew || Boolean(row.isNew);
    grouped.set(normalizedId, existing);
  }

  for (const entry of grouped.values()) {
    const sumRow = summary.find((s) => s.type === entry.type);
    if (!sumRow) continue;
    sumRow.count += 1;
    if (entry.isNew) {
      sumRow.newCount += 1;
    }
  }

  return summary;
};

export interface CollectionEntryDetail {
  id: string;
  type: CollectionType;
  key: string;
  label: string;
  unlockedAt: string;
  isNew?: boolean;
}

export const listUnlockedCollectionEntries = async (): Promise<CollectionEntryDetail[]> => {
  const db = getDb();
  const rows = await db.collectionEntries.toArray();
  const details = new Map<string, CollectionEntryDetail>();

  const careers = await db.careers.toArray();
  const oyakatas = await db.oyakataProfiles.toArray();

  for (const row of rows) {
    const resolvedKey = resolveCollectionKey(row.type, row.key);
    if (!resolvedKey) continue;

    let label = resolvedKey;
    if (row.type === 'RIKISHI') {
      const career = careers.find(c => c.id === resolvedKey);
      label = career ? `殿堂入り：${career.shikona}` : `殿堂入り：${resolvedKey}`;
    } else if (row.type === 'OYAKATA') {
      const oyakata = oyakatas.find(o => o.id === resolvedKey);
      const c2 = careers.find(c => c.id === resolvedKey);
      label = oyakata ? `名跡継承：${oyakata.displayName}` : (c2 ? `名跡継承：${c2.shikona}親方` : `名跡継承：親方`);
    } else if (row.type === 'KIMARITE') {
      label = `決まり手：${resolvedKey}`;
    } else if (row.type === 'ACHIEVEMENT') {
      label = `偉業達成：${resolvedKey}`;
    }

    const normalizedId = toCollectionEntryId(row.type, resolvedKey);
    const nextDetail: CollectionEntryDetail = {
      id: normalizedId,
      type: row.type,
      key: resolvedKey,
      label,
      unlockedAt: row.unlockedAt,
      isNew: row.isNew,
    };
    const current = details.get(normalizedId);
    if (!current || current.unlockedAt < nextDetail.unlockedAt) {
      details.set(normalizedId, nextDetail);
    } else if (nextDetail.isNew && !current.isNew) {
      details.set(normalizedId, { ...current, isNew: true });
    }
  }

  return [...details.values()].sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt));
};

export const clearCollectionNewFlags = async (): Promise<void> => {
  const db = getDb();
  const rows = (await db.collectionEntries.toArray()).filter((row) => row.isNew);
  for (const row of rows) {
    await db.collectionEntries.update(row.id, { isNew: false });
  }
};

export const listAvailableOyakataProfiles = async (): Promise<OyakataProfile[]> => {
  const db = getDb();
  const rows = await db.careers.where('state').equals('shelved').toArray();
  const sortedRows = rows
    .slice()
    .sort((a, b) => (a.careerIndex ?? 0) - (b.careerIndex ?? 0));
  const latestCareerIndex = sortedRows[sortedRows.length - 1]?.careerIndex ?? 0;
  const profiles: OyakataProfile[] = [];
  for (const row of rows) {
    const profile = row.finalStatus
      ? deriveOyakataProfile(row.id, row.finalStatus)
      : row.oyakataProfile;
    if (!profile) continue;
    let streak = 0;
    for (let i = sortedRows.length - 1; i >= 0; i -= 1) {
      const saved = sortedRows[i];
      if (saved.selectedOyakataId !== profile.id) break;
      streak += 1;
    }
    profiles.push({
      ...profile,
      cooldownUntilCareerIndex: streak >= 3 ? latestCareerIndex + 1 : undefined,
    });
  }
  return profiles.sort((a, b) => {
    const rankCmp = a.maxRank.division.localeCompare(b.maxRank.division);
    if (rankCmp !== 0) return rankCmp;
    return a.displayName.localeCompare(b.displayName);
  });
};

export const listAvailableOyakataBlueprints = async (): Promise<OyakataBlueprint[]> => {
  const unlockedProfiles = await listAvailableOyakataProfiles();
  const starter = STARTER_OYAKATA_BLUEPRINTS.map((blueprint) => ({ ...blueprint }));
  const unlocked = unlockedProfiles.map((profile) => createUnlockedOyakataBlueprint(profile));
  return [...starter, ...unlocked];
};

const toDayKey = (nowMs: number): string => {
  const date = new Date(nowMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const listAdRowsByDayAndType = async (
  day: string,
  type: AdRewardLedgerRow['type'],
): Promise<AdRewardLedgerRow[]> => {
  const db = getDb();
  const rows = await db.adRewardLedger.where('day').equals(day).toArray();
  return rows.filter((row) => row.type === type);
};

export interface InterstitialGateResult {
  canShow: boolean;
  todayCount: number;
  cooldownRemainSec: number;
}

export const getInterstitialGateStatus = async (
  nowMs: number = Date.now(),
): Promise<InterstitialGateResult> => {
  const day = toDayKey(nowMs);
  const rows = await listAdRowsByDayAndType(day, 'INTERSTITIAL');
  const todayCount = rows.length;
  const latest = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const latestMs = latest ? Date.parse(latest.createdAt) : 0;
  const cooldownMs = 10 * 60 * 1000;
  const elapsed = latestMs > 0 ? Math.max(0, nowMs - latestMs) : cooldownMs;
  const cooldownRemainSec = Math.max(0, Math.ceil((cooldownMs - elapsed) / 1000));
  const canShow = todayCount < 3 && cooldownRemainSec === 0;
  return { canShow, todayCount, cooldownRemainSec };
};

export const registerInterstitialShown = async (
  nowMs: number = Date.now(),
): Promise<InterstitialGateResult> => {
  const gate = await getInterstitialGateStatus(nowMs);
  if (!gate.canShow) return gate;
  const db = getDb();
  const day = toDayKey(nowMs);
  const row: AdRewardLedgerRow = {
    id: crypto.randomUUID(),
    day,
    slot: `interstitial:${nowMs}`,
    type: 'INTERSTITIAL',
    createdAt: new Date(nowMs).toISOString(),
  };
  await db.adRewardLedger.put(row);
  return getInterstitialGateStatus(nowMs);
};

export interface RewardedTokenResult {
  granted: boolean;
  todayCount: number;
  totalTokens: number;
}

export const grantRewardedAdToken = async (
  nowMs: number = Date.now(),
): Promise<RewardedTokenResult> => {
  const db = getDb();
  const day = toDayKey(nowMs);
  const todayRows = await listAdRowsByDayAndType(day, 'REWARDED');
  if (todayRows.length >= 3) {
    const totalRows = (await db.adRewardLedger.where('type').equals('REWARDED').toArray()).length;
    return { granted: false, todayCount: todayRows.length, totalTokens: totalRows };
  }
  const nextSlot = `rewarded:${todayRows.length + 1}`;
  const row: AdRewardLedgerRow = {
    id: crypto.randomUUID(),
    day,
    slot: nextSlot,
    type: 'REWARDED',
    createdAt: new Date(nowMs).toISOString(),
  };
  await db.adRewardLedger.put(row);
  const totalRows = (await db.adRewardLedger.where('type').equals('REWARDED').toArray()).length;
  return { granted: true, todayCount: todayRows.length + 1, totalTokens: totalRows };
};
