import {
  BashoRecord,
  CareerSaveTag,
  CollectionTier,
  CollectionType,
  ExperimentPresetId,
  ObservationRuleMode,
  ObservationStanceId,
  OyakataBlueprint,
  OyakataProfile,
  RikishiStatus,
} from '../models';
import {
  buildCareerClearScoreSummary,
  buildCareerRecordBadges,
  CLEAR_SCORE_VERSION,
  listCareerRecordCatalog,
  resolveCareerRecordBadgeLabel,
  resolveRecordCollectionTier,
  type CareerClearScoreSummary,
  type CareerRecordBadge,
} from '../career/clearScore';
import { ImportantTorikumiNote, NpcBashoAggregate, PlayerBoutDetail } from '../simulation/basho';
import { formatKinboshiTitle } from '../simulation/titles';
import {
  AdRewardLedgerRow,
  BashoRecordRow,
  BanzukeDecisionRow,
  BanzukePopulationRow,
  BoutRecordRow,
  CareerRow,
  CareerState,
  ImportantTorikumiRow,
  SimulationDiagnosticsRow,
  getDb,
} from './db';
import type { BanzukeDecisionLog, BanzukePopulationSnapshot } from '../banzuke/types';
import { SimulationDiagnostics } from '../simulation/diagnostics';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from '../simulation/modelVersion';
import { buildCareerRewardSummary, calculateCareerPrizeBreakdown } from '../economy/prizeMoney';
import { ACHIEVEMENT_CATALOG, evaluateAchievementProgress } from '../achievements';
import {
  COLLECTION_KIMARITE_NAME_SET,
  listNonTechniqueCatalog,
  listOfficialWinningKimariteCatalog,
  normalizeKimariteName,
  resolveKimariteFamilyLabel,
  resolveKimariteRarityLabel,
} from '../kimarite/catalog';
import { getRankValueForChart } from '../ranking';
import { deriveOyakataProfile } from '../oyakata/profile';
import {
  ensureStyleIdentityProfile,
  resolveDisplayedStrengthStyles,
  resolveStyleLabelsOrFallback,
} from '../style/identity';
import { buildCareerRivalryDigest } from '../careerRivalry';
import {
  createUnlockedOyakataBlueprint,
  STARTER_OYAKATA_BLUEPRINTS,
  resolveCareerRecordRewardPoints,
} from '../careerSeed';
import { ensureCareerRecordStatus, withRivalSummary } from '../careerNarrative';
import { clearKpiCounters } from '../telemetry/kpi';
import { addObservationPoints } from './observationPoints';
import { evaluateResearchThemes } from '../research/themes';
import { judgeArchiveCategories } from '../archive/categories';
import { judgeCareerTitles } from '../archive/titles';
import { computeArchiveReward } from '../archive/rewards';

const MAX_SHELVED_CAREERS = 200;
const COLLECTION_TYPES: CollectionType[] = ['RIKISHI', 'OYAKATA', 'KIMARITE', 'ACHIEVEMENT', 'RECORD'];
const OFFICIAL_KIMARITE_KEYS = COLLECTION_KIMARITE_NAME_SET;
const STANDARD_OBSERVATION_REWARD_CAP = 25;
const EXPERIMENT_OBSERVATION_REWARD_CAP = 8;

const normalizeBanzukeDecisionLog = (log: BanzukeDecisionLog): BanzukeDecisionLog => ({
  ...log,
  modelVersion: log.modelVersion ?? DEFAULT_SIMULATION_MODEL_VERSION,
  proposalSource: log.proposalSource ?? 'COMMITTEE_MODEL',
  constraintHits: log.constraintHits ?? [],
  proposalBasis: log.proposalBasis ?? 'EMPIRICAL',
  overrideNames: log.overrideNames ?? [],
});

const toYearMonth = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}`;

const enrichStatusWithPersistenceNarratives = async (
  careerId: string,
  status: RikishiStatus,
): Promise<RikishiStatus> => {
  const [headToHeadRows, boutsByBasho, bashoRowsBySeq] = await Promise.all([
    getCareerHeadToHead(careerId),
    listCareerPlayerBoutsByBasho(careerId),
    listCareerBashoRecordsBySeq(careerId),
  ]);
  const rivalryDigest = buildCareerRivalryDigest(status, headToHeadRows, boutsByBasho, bashoRowsBySeq);
  const enriched = withRivalSummary(status, headToHeadRows);
  return {
    ...enriched,
    careerRivalryDigest: rivalryDigest,
  };
};

const resolveRetirementYearMonth = (status?: RikishiStatus): string | null => {
  if (!status) return null;
  const retirement = [...status.history.events]
    .reverse()
    .find((event) => event.type === 'RETIREMENT');
  if (!retirement) return null;
  return toYearMonth(retirement.year, retirement.month);
};

const toSummaryPatch = (
  status: RikishiStatus,
  options?: {
    includeFinalStatus?: boolean;
  },
): Partial<CareerRow> => {
  const scoreSummary = buildCareerClearScoreSummary(status);
  return {
    shikona: status.shikona,
    title: status.history.title,
    maxRank: status.history.maxRank,
    totalWins: status.history.totalWins,
    totalLosses: status.history.totalLosses,
    totalAbsent: status.history.totalAbsent,
    yushoCount: status.history.yushoCount,
    bashoCount: status.history.records.length,
    ...(options?.includeFinalStatus === false
      ? {}
      : { finalStatus: ensureCareerRecordStatus(status) }),
    clearScore: scoreSummary.clearScore,
    clearScoreVersion: scoreSummary.version,
    recordBadgeKeys: scoreSummary.badges.map((badge) => badge.key),
  };
};

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

const resolveCollectionProgressTier = (
  type: CollectionType,
  progress: number,
): { tier: CollectionTier; target: number } | undefined => {
  if (type === 'KIMARITE') return resolveKimariteTier(progress);
  if (type === 'RECORD') return resolveRecordCollectionTier(progress);
  return undefined;
};

const unlockCollectionEntry = async (
  type: CollectionType,
  key: string,
  sourceCareerId?: string,
  options?: {
    progressIncrement?: number;
    markAsNew?: boolean;
  },
): Promise<boolean> => {
  const db = getDb();
  const resolvedKey = resolveCollectionKey(type, key);
  if (!resolvedKey) return false;
  const id = toCollectionEntryId(type, resolvedKey);
  const existing = await db.collectionEntries.get(id);
  const now = new Date().toISOString();
  const progressIncrement = Math.max(0, Math.floor(options?.progressIncrement ?? 0));
  const markAsNew = options?.markAsNew ?? true;
  if (!existing) {
    const progress = type === 'KIMARITE' || type === 'RECORD' ? Math.max(1, progressIncrement) : undefined;
    const progressTier = progress ? resolveCollectionProgressTier(type, progress) : undefined;
    await db.collectionEntries.put({
      id,
      type,
      key: resolvedKey,
      sourceCareerId,
      unlockedAt: now,
      progress,
      tier: progressTier?.tier,
      target: progressTier?.target,
      isNew: markAsNew,
    });
    return true;
  }

  let changed = false;
  const patch: Partial<typeof existing> = {};
  if ((type === 'KIMARITE' || type === 'RECORD') && progressIncrement > 0) {
    const nextProgress = (existing.progress ?? 0) + progressIncrement;
    const nextTier = resolveCollectionProgressTier(type, nextProgress);
    if (nextProgress !== existing.progress) {
      patch.progress = nextProgress;
      changed = true;
    }
    if (nextTier && (nextTier.tier !== existing.tier || nextTier.target !== existing.target)) {
      patch.tier = nextTier.tier;
      patch.target = nextTier.target;
      changed = true;
    }
  }
  if (changed || (markAsNew && !existing.isNew)) {
    if (markAsNew) patch.isNew = true;
    await db.collectionEntries.update(id, patch);
  }
  return changed;
};

interface CollectionUnlockCandidate {
  type: CollectionType;
  key: string;
  progressIncrement?: number;
}

const buildCollectionUnlockCandidates = (
  careerId: string,
  status: RikishiStatus,
  includeOyakata: boolean,
): CollectionUnlockCandidate[] => {
  const candidates: CollectionUnlockCandidate[] = [{ type: 'RIKISHI', key: careerId }];

  Object.entries(status.history.kimariteTotal ?? {})
    .filter(([, count]) => count > 0)
    .forEach(([key, count]) => {
      candidates.push({ type: 'KIMARITE', key, progressIncrement: count });
    });

  evaluateAchievementProgress(status).unlocked.forEach((achievement) => {
    candidates.push({ type: 'ACHIEVEMENT', key: achievement.id });
  });

  buildCareerRecordBadges(status).forEach((badge) => {
    candidates.push({ type: 'RECORD', key: badge.key, progressIncrement: 1 });
  });

  if (includeOyakata) {
    candidates.push({ type: 'OYAKATA', key: careerId });
  }

  return candidates;
};

interface CollectionUnlockPreview {
  collectionDeltaCount: number;
  newRecordCount: number;
}

const previewCollectionUnlocks = async (
  careerId: string,
  status: RikishiStatus,
  includeOyakata: boolean,
): Promise<CollectionUnlockPreview> => {
  const db = getDb();
  const candidates = buildCollectionUnlockCandidates(careerId, status, includeOyakata);
  let collectionDeltaCount = 0;
  let newRecordCount = 0;

  for (const candidate of candidates) {
    const resolvedKey = resolveCollectionKey(candidate.type, candidate.key);
    if (!resolvedKey) continue;
    const existing = await db.collectionEntries.get(toCollectionEntryId(candidate.type, resolvedKey));
    if (!existing) {
      collectionDeltaCount += 1;
      if (candidate.type === 'RECORD') newRecordCount += 1;
      continue;
    }
    if ((candidate.type === 'KIMARITE' || candidate.type === 'RECORD') && (candidate.progressIncrement ?? 0) > 0) {
      const nextProgress = (existing.progress ?? 0) + (candidate.progressIncrement ?? 0);
      const currentTier = existing.progress ? resolveCollectionProgressTier(candidate.type, existing.progress) : undefined;
      const nextTier = resolveCollectionProgressTier(candidate.type, nextProgress);
      if (nextProgress !== existing.progress || nextTier?.tier !== currentTier?.tier) {
        collectionDeltaCount += 1;
      }
    }
  }

  return {
    collectionDeltaCount,
    newRecordCount,
  };
};

const unlockCollectionsForStatus = async (
  careerId: string,
  status: RikishiStatus,
  includeOyakata: boolean,
  options?: {
    markAsNew?: boolean;
  },
): Promise<number> => {
  let changedCount = 0;
  const candidates = buildCollectionUnlockCandidates(careerId, status, includeOyakata);
  for (const candidate of candidates) {
    if (
      await unlockCollectionEntry(candidate.type, candidate.key, careerId, {
        progressIncrement: candidate.progressIncrement,
        markAsNew: options?.markAsNew,
      })
    ) {
      changedCount += 1;
    }
  }
  return changedCount;
};

const resolveCareerLengthBonus = (bashoCount: number): number => {
  if (bashoCount >= 72) return 4;
  if (bashoCount >= 36) return 2;
  return 0;
};

const resolveClearScoreBonus = (clearScore: number): number => {
  if (clearScore >= 120) return 8;
  if (clearScore >= 80) return 5;
  if (clearScore >= 45) return 2;
  return 0;
};

const claimObservationPointsForCareer = async (
  careerId: string,
  status: RikishiStatus,
  ruleMode: ObservationRuleMode,
  collectionDeltaCount: number,
): Promise<{ pointsAwarded: number; researchThemeIds: string[]; claimedAt?: string }> => {
  const db = getDb();
  const existing = await db.careerObservationClaims.get(careerId);
  if (existing) {
    return { pointsAwarded: existing.pointsAwarded, researchThemeIds: [] };
  }

  const now = new Date().toISOString();
  const clearScore = buildCareerClearScoreSummary(status);
  const achievements = ruleMode === 'STANDARD' ? evaluateAchievementProgress(status).unlocked : [];
  const completedResearchThemes = ruleMode === 'STANDARD' ? evaluateResearchThemes(status) : [];
  const newResearchThemes: string[] = [];

  for (const theme of completedResearchThemes) {
    const existingTheme = await db.researchThemeProgress.get(theme.id);
    if (existingTheme) continue;
    await db.researchThemeProgress.put({
      id: theme.id,
      completedAt: now,
      sourceCareerId: careerId,
    });
    newResearchThemes.push(theme.id);
  }

  const rawPoints =
    2 +
    resolveCareerLengthBonus(status.history.records.length) +
    resolveClearScoreBonus(clearScore.clearScore) +
    Math.min(6, clearScore.badges.length) +
    Math.min(9, achievements.length * 3) +
    Math.min(8, collectionDeltaCount) +
    newResearchThemes.length * 8;
  const cap = ruleMode === 'EXPERIMENT' ? EXPERIMENT_OBSERVATION_REWARD_CAP : STANDARD_OBSERVATION_REWARD_CAP;
  const pointsAwarded = Math.min(cap, rawPoints);

  await db.careerObservationClaims.put({
    careerId,
    claimedAt: now,
    pointsAwarded,
    ruleMode,
  });
  await addObservationPoints(
    pointsAwarded,
    ruleMode === 'EXPERIMENT' ? 'EXPERIMENT_OBSERVATION' : 'CAREER_OBSERVATION',
    careerId,
  );
  return { pointsAwarded, researchThemeIds: newResearchThemes, claimedAt: now };
};

const ensureLegacyCollectionEntries = async (): Promise<void> => {
  const db = getDb();
  const existingCollectionCount = await db.collectionEntries.count();
  if (existingCollectionCount > 0) return;

  const savedRows = await db.careers.where('state').equals('shelved').toArray();
  for (const row of savedRows) {
    if (!row.finalStatus) continue;
    const collectionDeltaCount = await unlockCollectionsForStatus(row.id, row.finalStatus, true, {
      markAsNew: false,
    });
    if (row.collectionDeltaCount !== collectionDeltaCount) {
      await db.careers.update(row.id, { collectionDeltaCount });
    }
  }
};

const refreshBestScoreRanks = async (): Promise<void> => {
  const db = getDb();
  const rows = await db.careers.where('state').equals('shelved').toArray();
  const ranked = rows
    .slice()
    .sort((left, right) => {
      const scoreDelta = (right.clearScore ?? 0) - (left.clearScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      const savedDelta = (right.savedAt ?? '').localeCompare(left.savedAt ?? '');
      if (savedDelta !== 0) return savedDelta;
      return right.updatedAt.localeCompare(left.updatedAt);
    });

  for (let index = 0; index < ranked.length; index += 1) {
    const row = ranked[index];
    const nextRank = index + 1;
    if (row.bestScoreRank === nextRank) continue;
    await db.careers.update(row.id, { bestScoreRank: nextRank });
  }
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

const normalizePersistentOpponentId = (opponentId?: string): string | undefined => {
  if (!opponentId) return undefined;
  return opponentId.startsWith('JURYO_GUEST_')
    ? opponentId.slice('JURYO_GUEST_'.length)
    : opponentId;
};

const LOWER_DIVISION_PERSIST_NEARBY_RANGE = 5;

const filterPersistedNpcRecords = (
  chunk: Pick<AppendBashoChunkParams, 'playerRecord' | 'playerBouts' | 'npcRecords'>,
): NpcBashoAggregate[] => {
  const recordsById = new Map<string, NpcBashoAggregate>();
  for (const record of chunk.npcRecords) {
    if (!recordsById.has(record.entityId)) {
      recordsById.set(record.entityId, record);
    }
  }

  const selectedIds = new Set<string>();
  for (const record of recordsById.values()) {
    if (record.division === 'Makuuchi' || record.division === 'Juryo') {
      selectedIds.add(record.entityId);
    }
  }

  const playerDivision = chunk.playerRecord.rank.division;
  if (
    playerDivision === 'Makushita' ||
    playerDivision === 'Sandanme' ||
    playerDivision === 'Jonidan' ||
    playerDivision === 'Jonokuchi'
  ) {
    const playerRankValue = getRankValueForChart(chunk.playerRecord.rank);
    for (const bout of chunk.playerBouts) {
      const normalizedId = normalizePersistentOpponentId(bout.opponentId);
      if (normalizedId && recordsById.has(normalizedId)) {
        selectedIds.add(normalizedId);
      }
    }
    for (const record of recordsById.values()) {
      if (record.division !== playerDivision) continue;
      const rankValue = getRankValueForChart({
        division: record.division,
        name: record.rankName,
        number: record.rankNumber,
        side: record.rankSide,
      });
      const isNearby = Math.abs(rankValue - playerRankValue) <= LOWER_DIVISION_PERSIST_NEARBY_RANGE;
      const isTitled = (record.titles?.length ?? 0) > 0;
      if (isNearby || isTitled) {
        selectedIds.add(record.entityId);
      }
    }
  }

  return [...selectedIds]
    .map((id) => recordsById.get(id))
    .filter((record): record is NpcBashoAggregate => Boolean(record));
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
  winRoute: bout.winRoute,
  opponentId: bout.opponentId,
  opponentShikona: bout.opponentShikona,
  opponentRankName: bout.opponentRankName,
  opponentRankNumber: bout.opponentRankNumber,
  opponentRankSide: bout.opponentRankSide,
}));

const toImportantTorikumiRows = (
  careerId: string,
  seq: number,
  notes: ImportantTorikumiNote[],
): ImportantTorikumiRow[] => notes.map((note) => ({
  careerId,
  bashoSeq: seq,
  day: note.day,
  year: note.year,
  month: note.month,
  opponentId: note.opponentId,
  opponentShikona: note.opponentShikona,
  opponentRankName: note.opponentRank.name,
  opponentRankNumber: note.opponentRank.number,
  opponentRankSide: note.opponentRank.side,
  trigger: note.trigger,
  summary: note.summary,
  matchReason: note.matchReason,
  relaxationStage: note.repairDepth ?? note.relaxationStage,
}));

const removeCareerRows = async (careerId: string): Promise<void> => {
  const db = getDb();
  await db.careers.delete(careerId);
  await db.bashoRecords.where('careerId').equals(careerId).delete();
  await db.boutRecords.where('careerId').equals(careerId).delete();
  await db.importantTorikumi.where('careerId').equals(careerId).delete();
  await db.banzukePopulation.where('careerId').equals(careerId).delete();
  await db.banzukeDecisions.where('careerId').equals(careerId).delete();
  await db.simulationDiagnostics.where('careerId').equals(careerId).delete();
};

export interface CreateDraftCareerParams {
  id?: string;
  initialStatus: RikishiStatus;
  careerStartYearMonth: string;
  simulationModelVersion?: SimulationModelVersion;
  selectedOyakataId?: string | null;
  observationRuleMode?: ObservationRuleMode;
  observationStanceId?: ObservationStanceId;
  experimentPresetId?: ExperimentPresetId;
  // Career-archive observation build metadata (Phase 2)
  archiveThemeId?: string;
  archiveModifierIds?: string[];
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
  playerShikona: string;
  summaryStatus?: RikishiStatus;
  playerBouts: PlayerBoutDetail[];
  importantTorikumiNotes?: ImportantTorikumiNote[];
  npcRecords: NpcBashoAggregate[];
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
  clearScore: number;
  clearScoreVersion?: number;
  recordBadgeKeys: string[];
  bestScoreRank?: number;
  collectionDeltaCount?: number;
  yokozunaOrdinal?: number;
  detailState: NonNullable<CareerRow['detailState']>;
  saveTags?: CareerSaveTag[];
  observerMemo?: string;
  observationPointsAwarded?: number;
  observationRuleMode?: ObservationRuleMode;
  observationStanceId?: ObservationStanceId;
  experimentPresetId?: string;
  finalStatus?: RikishiStatus;
}

const resolveNextYokozunaOrdinal = async (careerId: string): Promise<number> => {
  const db = getDb();
  const rows = await db.careers.toArray();
  const current = rows.find((row) => row.id === careerId);
  if (current?.yokozunaOrdinal) return current.yokozunaOrdinal;
  const maxOrdinal = rows.reduce((max, row) => Math.max(max, row.yokozunaOrdinal ?? 0), 0);
  return maxOrdinal + 1;
};

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

export interface CareerBashoRecordsBySeq {
  bashoSeq: number;
  sourceBashoSeq?: number;
  year: number;
  month: number;
  rows: BashoRecordRow[];
}

export interface CareerImportantTorikumiByBasho {
  bashoSeq: number;
  notes: ImportantTorikumiRow[];
}

export interface CareerBashoDetail {
  bashoSeq: number;
  sourceBashoSeq?: number;
  year: number;
  month: number;
  playerRecord?: BashoRecordRow;
  rows: BashoRecordRow[];
  bouts: PlayerBoutDetail[];
  importantTorikumi: ImportantTorikumiRow[];
  banzukeDecisions: BanzukeDecisionLog[];
  diagnostics?: SimulationDiagnostics;
}

export const createDraftCareer = async ({
  id,
  initialStatus,
  careerStartYearMonth,
  simulationModelVersion,
  selectedOyakataId,
  observationRuleMode,
  observationStanceId,
  experimentPresetId,
  archiveThemeId,
  archiveModifierIds,
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
  const initialSummary = toSummaryPatch(initialStatus);

  const row: CareerRow = {
    id: careerId,
    state: 'in_progress',
    createdAt: now,
    updatedAt: now,
    shikona: initialSummary.shikona ?? initialStatus.shikona,
    title: initialSummary.title,
    maxRank: initialSummary.maxRank ?? initialStatus.history.maxRank,
    totalWins: initialSummary.totalWins ?? initialStatus.history.totalWins,
    totalLosses: initialSummary.totalLosses ?? initialStatus.history.totalLosses,
    totalAbsent: initialSummary.totalAbsent ?? initialStatus.history.totalAbsent,
    yushoCount: initialSummary.yushoCount ?? initialStatus.history.yushoCount,
    bashoCount: initialSummary.bashoCount ?? initialStatus.history.records.length,
    careerStartYearMonth,
    careerEndYearMonth: null,
    simulationModelVersion: simulationModelVersion ?? DEFAULT_SIMULATION_MODEL_VERSION,
    lifetimePrizeYen: 0,
    earnedPointsFromPrize: 0,
    selectedOyakataId: selectedOyakataId ?? null,
    parentCareerId,
    generation,
    observationRuleMode: observationRuleMode ?? 'STANDARD',
    observationStanceId,
    experimentPresetId,
    archiveThemeId,
    archiveModifierIds,
    careerIndex: nextCareerIndex,
    finalStatus: initialSummary.finalStatus ?? ensureCareerRecordStatus(initialStatus),
    detailState: 'building',
    clearScore: initialSummary.clearScore,
    clearScoreVersion: initialSummary.clearScoreVersion,
    recordBadgeKeys: initialSummary.recordBadgeKeys,
  };

  await db.careers.put(row);
  return careerId;
};

const appendBashoChunksInternal = async (
  chunks: AppendBashoChunkParams[],
  options?: {
    summaryStatus?: RikishiStatus;
    detailState?: CareerRow['detailState'];
  },
): Promise<void> => {
  if (chunks.length === 0) return;
  const db = getDb();
  const bashoRows: BashoRecordRow[] = [];
  const boutRows: BoutRecordRow[] = [];
  const importantTorikumiRows: ImportantTorikumiRow[] = [];
  const populationRows: BanzukePopulationRow[] = [];
  const decisionRows: BanzukeDecisionRow[] = [];
  const diagnosticRows: SimulationDiagnosticsRow[] = [];

  for (const chunk of chunks) {
    bashoRows.push(toPlayerBashoRow(chunk.careerId, chunk.seq, chunk.playerRecord, chunk.playerShikona));
    const persistedNpcRecords = filterPersistedNpcRecords(chunk);
    bashoRows.push(...toNpcBashoRows(
      chunk.careerId,
      chunk.seq,
      chunk.playerRecord.year,
      chunk.playerRecord.month,
      persistedNpcRecords,
    ));
    boutRows.push(...toBoutRows(
      chunk.careerId,
      chunk.seq,
      chunk.playerRecord.year,
      chunk.playerRecord.month,
      chunk.playerRecord.rank,
      chunk.playerBouts,
    ));
    importantTorikumiRows.push(...toImportantTorikumiRows(
      chunk.careerId,
      chunk.seq,
      chunk.importantTorikumiNotes ?? [],
    ));
    if (chunk.banzukePopulation) {
      populationRows.push({
        ...chunk.banzukePopulation,
        careerId: chunk.careerId,
        seq: chunk.seq,
      });
    }
    if (chunk.banzukeDecisions?.length) {
      decisionRows.push(...chunk.banzukeDecisions.map((rawLog) => ({
        ...normalizeBanzukeDecisionLog(rawLog),
        careerId: chunk.careerId,
        seq: chunk.seq,
      })));
    }
    if (chunk.diagnostics) {
      diagnosticRows.push({
        ...chunk.diagnostics,
        careerId: chunk.careerId,
        seq: chunk.seq,
      });
    }
  }

  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.importantTorikumi,
    db.banzukePopulation,
    db.banzukeDecisions,
    db.simulationDiagnostics,
  ];

  await db.transaction('rw', writableTables, async () => {
    const careerId = chunks[0]?.careerId;
    const career = careerId ? await db.careers.get(careerId) : null;
    if (!career || !careerId) {
      throw new Error(`Career not found: ${careerId}`);
    }

    await db.bashoRecords.bulkPut(bashoRows);
    await db.boutRecords.bulkPut(boutRows);
    if (importantTorikumiRows.length) {
      await db.importantTorikumi.bulkPut(importantTorikumiRows);
    }
    if (populationRows.length) {
      await db.banzukePopulation.bulkPut(populationRows);
    }
    if (decisionRows.length) {
      await db.banzukeDecisions.bulkPut(decisionRows);
    }
    if (diagnosticRows.length) {
      await db.simulationDiagnostics.bulkPut(diagnosticRows);
    }

    if (options?.summaryStatus) {
      const now = new Date().toISOString();
      await db.careers.update(careerId, {
        ...toSummaryPatch(options.summaryStatus, { includeFinalStatus: false }),
        updatedAt: now,
        careerEndYearMonth: resolveRetirementYearMonth(options.summaryStatus),
        ...(options.detailState ? { detailState: options.detailState } : {}),
      });
      return;
    }

    if (options?.detailState) {
      await db.careers.update(careerId, { detailState: options.detailState });
    }
  });
};

export const appendBashoChunksBulk = async (
  chunks: AppendBashoChunkParams[],
  options?: {
    summaryStatus?: RikishiStatus;
    detailState?: CareerRow['detailState'];
  },
): Promise<void> => appendBashoChunksInternal(chunks, options);

export const appendBashoChunk = async ({
  summaryStatus,
  ...chunk
}: AppendBashoChunkParams): Promise<void> => {
  await appendBashoChunksInternal([chunk], { summaryStatus });
};

export const markCareerReadyForReveal = async (
  careerId: string,
  finalStatus: RikishiStatus,
): Promise<RikishiStatus> => {
  const db = getDb();
  const now = new Date().toISOString();
  const normalizedStatus = ensureCareerRecordStatus(finalStatus);
  const breakdown = calculateCareerPrizeBreakdown(normalizedStatus);
  const rewardSummary = buildCareerRewardSummary(breakdown);
  normalizedStatus.history.prizeBreakdown = breakdown;
  normalizedStatus.history.rewardSummary = rewardSummary;

  await db.careers.update(careerId, {
    ...toSummaryPatch(normalizedStatus),
    state: 'unshelved',
    updatedAt: now,
    careerEndYearMonth: resolveRetirementYearMonth(normalizedStatus),
    detailState: 'building',
    lifetimePrizeYen: breakdown.totalYen,
    prizeBreakdown: breakdown,
    earnedPointsFromPrize: 0,
    pointConversionRuleId: rewardSummary.conversionRuleId,
    rewardGrantedAt: undefined,
  });
  return normalizedStatus;
};

export const finalizeCareerDetails = async (
  careerId: string,
  finalStatus: RikishiStatus,
): Promise<RikishiStatus> => {
  const db = getDb();
  let normalizedStatus = ensureCareerRecordStatus(finalStatus);
  normalizedStatus = await enrichStatusWithPersistenceNarratives(careerId, normalizedStatus);
  const career = await db.careers.get(careerId);
  const ruleMode = career?.observationRuleMode ?? 'STANDARD';
  const collectionDeltaCount = ruleMode === 'STANDARD'
    ? await unlockCollectionsForStatus(careerId, normalizedStatus, true)
    : 0;
  const observationClaim = await claimObservationPointsForCareer(
    careerId,
    normalizedStatus,
    ruleMode,
    collectionDeltaCount,
  );
  // ---- Archive judgment (Phase 7-10) ----
  const archiveCategories = judgeArchiveCategories(normalizedStatus, career ?? null);
  const archiveTitles = judgeCareerTitles(normalizedStatus, archiveCategories as never);

  // First-entry detection: any prior career has archiveJudgedAt set?
  const priorJudged = await db.careers
    .filter((row) => row.id !== careerId && Boolean(row.archiveJudgedAt))
    .first();
  const isFirstEntry = !priorJudged;

  // New-category detection: categories never seen before in any judged career.
  const priorCategorySet = new Set<string>();
  if (priorJudged) {
    const allRows = await db.careers.toArray();
    for (const row of allRows) {
      if (row.id === careerId) continue;
      if (!row.archiveJudgedAt) continue;
      for (const c of row.archiveCategories ?? []) priorCategorySet.add(c);
    }
  }
  const newCategories = archiveCategories.filter((c) => !priorCategorySet.has(c));

  const reward = computeArchiveReward({
    isFirstEntry,
    newCategories,
    titles: archiveTitles,
  });

  if (reward.delta > 0) {
    await addObservationPoints(reward.delta, 'ARCHIVE_NEW_ENTRY', careerId);
  }

  const judgedAt = new Date().toISOString();
  await db.careers.update(careerId, {
    finalStatus: normalizedStatus,
    ...toSummaryPatch(normalizedStatus),
    detailState: 'ready',
    collectionDeltaCount,
    observationPointsAwarded: observationClaim.pointsAwarded,
    observationPointsGrantedAt: observationClaim.claimedAt,
    archiveCategories,
    archiveTitles,
    archiveJudgedAt: judgedAt,
    archiveRewardAwarded: reward.delta,
  });
  return normalizedStatus;
};

export const markCareerCompleted = async (
  careerId: string,
  finalStatus: RikishiStatus,
): Promise<RikishiStatus> => {
  const summaryReadyStatus = await markCareerReadyForReveal(careerId, finalStatus);
  return finalizeCareerDetails(careerId, summaryReadyStatus);
};

export const shelveCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.importantTorikumi,
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
    const yokozunaOrdinal =
      finalStatus?.history.maxRank.name === '横綱'
        ? await resolveNextYokozunaOrdinal(careerId)
        : career.yokozunaOrdinal;
    if (finalStatus?.history.prizeBreakdown) {
      const rewardSummary = buildCareerRewardSummary(finalStatus.history.prizeBreakdown);
      const existingReward = await db.careerRewardLedger.get(careerId);
      const grantedPoints = resolveCareerRecordRewardPoints(rewardSummary.awardedPoints);
      if (!existingReward && grantedPoints > 0) {
        const grantedAt = new Date().toISOString();
        await db.careerRewardLedger.put({
          careerId,
          lifetimePrizeYen: finalStatus.history.prizeBreakdown.totalYen,
          pointsAwarded: 0,
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
              convertedPoints: 0,
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
              convertedPoints: 0,
            },
          },
        };
      }
    }
    await db.careers.update(careerId, {
      ...(finalStatus ? toSummaryPatch(finalStatus) : {}),
      state: 'shelved',
      savedAt: now,
      updatedAt: now,
      careerEndYearMonth:
        career.careerEndYearMonth ?? resolveRetirementYearMonth(finalStatus),
      oyakataProfile,
      lifetimePrizeYen: finalStatus?.history.prizeBreakdown?.totalYen ?? career.lifetimePrizeYen,
      earnedPointsFromPrize: finalStatus?.history.rewardSummary?.convertedPoints ?? career.earnedPointsFromPrize,
      rewardGrantedAt: finalStatus?.history.rewardSummary?.grantedAt,
      yokozunaOrdinal,
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
    const enrichedFinalStatus = await enrichStatusWithPersistenceNarratives(careerId, career.finalStatus);
    await db.careers.update(careerId, {
      finalStatus: enrichedFinalStatus,
      ...toSummaryPatch(enrichedFinalStatus),
    });
  }
  await refreshBestScoreRanks();
};

export const commitCareer = async (careerId: string): Promise<void> => shelveCareer(careerId);

export const updateCareerSaveMetadata = async (
  careerId: string,
  metadata: {
    saveTags?: CareerSaveTag[];
    observerMemo?: string;
  },
): Promise<void> => {
  const db = getDb();
  await db.careers.update(careerId, {
    saveTags: metadata.saveTags ?? [],
    observerMemo: metadata.observerMemo?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  });
};

export const discardCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.importantTorikumi,
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
  kataLabel: row.finalStatus
    ? resolveStyleLabelsOrFallback(
      resolveDisplayedStrengthStyles(ensureStyleIdentityProfile(row.finalStatus).styleIdentityProfile),
    )
    : 'なし',
  parentCareerId: row.parentCareerId,
  generation: row.generation,
  careerIndex: row.careerIndex,
  clearScore: row.clearScore ?? 0,
  clearScoreVersion: row.clearScoreVersion,
  recordBadgeKeys: row.recordBadgeKeys ?? [],
  bestScoreRank: row.bestScoreRank,
  collectionDeltaCount: row.collectionDeltaCount,
  yokozunaOrdinal: row.yokozunaOrdinal,
  saveTags: row.saveTags,
  observerMemo: row.observerMemo,
  observationPointsAwarded: row.observationPointsAwarded,
  observationRuleMode: row.observationRuleMode,
  observationStanceId: row.observationStanceId,
  experimentPresetId: row.experimentPresetId,
  finalStatus: row.finalStatus,
  detailState: row.detailState ?? 'ready',
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

export interface CareerSaveIncentiveSummary {
  clearScore: CareerClearScoreSummary;
  recordBadges: CareerRecordBadge[];
  featuredBadges: CareerRecordBadge[];
  projectedBestScoreRank?: number;
  collectionDeltaCount: number;
  newRecordCount: number;
  isPersonalBest: boolean;
  rewardLabel: string;
  rewardDetail: string;
  saveLabel: string;
}

const resolveScoreTieBreak = (left: CareerRow, right: CareerRow): number => {
  const scoreDelta = (right.clearScore ?? 0) - (left.clearScore ?? 0);
  if (scoreDelta !== 0) return scoreDelta;
  const savedDelta = (right.savedAt ?? '').localeCompare(left.savedAt ?? '');
  if (savedDelta !== 0) return savedDelta;
  return right.updatedAt.localeCompare(left.updatedAt);
};

export const getCareerSaveIncentiveSummary = async (
  status: RikishiStatus,
  options?: {
    careerId?: string | null;
    isSaved?: boolean;
    includeOyakata?: boolean;
  },
): Promise<CareerSaveIncentiveSummary> => {
  const db = getDb();
  const clearScore = buildCareerClearScoreSummary(status);
  const rows = await db.careers.where('state').equals('shelved').toArray();
  const compareRows = options?.careerId
    ? rows.filter((row) => row.id !== options.careerId)
    : rows;
  const virtualRow: CareerRow = {
    id: options?.careerId ?? 'virtual-current',
    state: 'shelved',
    createdAt: '',
    updatedAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    shikona: status.shikona,
    maxRank: status.history.maxRank,
    totalWins: status.history.totalWins,
    totalLosses: status.history.totalLosses,
    totalAbsent: status.history.totalAbsent,
    yushoCount: status.history.yushoCount,
    bashoCount: status.history.records.length,
    careerStartYearMonth: '',
    careerEndYearMonth: null,
    simulationModelVersion: DEFAULT_SIMULATION_MODEL_VERSION,
    clearScore: clearScore.clearScore,
    clearScoreVersion: CLEAR_SCORE_VERSION,
    recordBadgeKeys: clearScore.badges.map((badge) => badge.key),
  };
  const projectedBestScoreRank = [...compareRows, virtualRow]
    .sort(resolveScoreTieBreak)
    .findIndex((row) => row.id === virtualRow.id) + 1;
  const existingCareer = options?.careerId ? await db.careers.get(options.careerId) : null;
  const collectionPreview = options?.isSaved || !options?.careerId
    ? { collectionDeltaCount: 0, newRecordCount: 0 }
    : existingCareer?.collectionDeltaCount
      ? {
        collectionDeltaCount: existingCareer.collectionDeltaCount,
        newRecordCount: Math.min(existingCareer.collectionDeltaCount, clearScore.badges.length),
      }
      : await previewCollectionUnlocks(options.careerId, status, options?.includeOyakata ?? true);

  let rewardLabel = '保存候補';
  let rewardDetail = '記録を残すと、あとで詳細な一代記を読み返せます。';
  let saveLabel = '保存する';
  if (options?.isSaved) {
    rewardLabel = projectedBestScoreRank > 0 ? `歴代${projectedBestScoreRank}位` : '保存済み';
    rewardDetail = 'すでに保存済みの記録です。詳しく見るから分析画面へ進めます。';
    saveLabel = '保存済み';
  } else if (projectedBestScoreRank === 1) {
    rewardLabel = '自己ベスト更新';
    rewardDetail = '保存すると、総評点の歴代1位になります。';
    saveLabel = '自己ベストとして保存';
  } else if (projectedBestScoreRank === 2) {
    rewardLabel = '歴代2位';
    rewardDetail = '保存すると、総評点の上位圏に入ります。';
    saveLabel = '上位記録として保存';
  } else if (projectedBestScoreRank > 0 && projectedBestScoreRank <= 10) {
    rewardLabel = '上位10入り';
    rewardDetail = '保存すると、総評点上位10件に入ります。';
    saveLabel = '上位記録として保存';
  } else if (collectionPreview.newRecordCount > 0) {
    rewardLabel = `新規記録 ${collectionPreview.newRecordCount}件`;
    rewardDetail = '保存すると、記録図鑑の新しい項目が解放されます。';
    saveLabel = '図鑑を更新して保存';
  } else if (collectionPreview.collectionDeltaCount > 0) {
    rewardLabel = `図鑑進捗 +${collectionPreview.collectionDeltaCount}`;
    rewardDetail = '保存すると、図鑑の進捗が更新されます。';
    saveLabel = '図鑑を更新して保存';
  }

  return {
    clearScore,
    recordBadges: clearScore.badges,
    featuredBadges: clearScore.badges.slice(0, 3),
    projectedBestScoreRank: projectedBestScoreRank > 0 ? projectedBestScoreRank : undefined,
    collectionDeltaCount: collectionPreview.collectionDeltaCount,
    newRecordCount: collectionPreview.newRecordCount,
    isPersonalBest: projectedBestScoreRank === 1,
    rewardLabel,
    rewardDetail,
    saveLabel,
  };
};

export const listTopCareerClearScores = async (limit = 10): Promise<CareerListItem[]> => {
  const db = getDb();
  const rows = await db.careers.where('state').equals('shelved').toArray();
  return rows
    .sort(resolveScoreTieBreak)
    .slice(0, Math.max(1, limit))
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
  if (!row.finalStatus) return null;
  const status = ensureCareerRecordStatus(ensureStyleIdentityProfile(row.finalStatus));
  if ((row.detailState ?? 'ready') !== 'ready') {
    return status;
  }
  return enrichStatusWithPersistenceNarratives(careerId, status);
};

export const deleteCareer = async (careerId: string): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.importantTorikumi,
    db.banzukePopulation,
    db.banzukeDecisions,
    db.simulationDiagnostics,
    db.careerRewardLedger,
    db.collectionEntries,
  ];
  await db.transaction('rw', writableTables, async () => {
    await removeCareerRows(careerId);
  });
  await refreshBestScoreRanks();
};

export const clearAllStoredData = async (): Promise<void> => {
  const db = getDb();
  const writableTables = [
    db.careers,
    db.bashoRecords,
    db.boutRecords,
    db.importantTorikumi,
    db.meta,
    db.banzukePopulation,
    db.banzukeDecisions,
    db.simulationDiagnostics,
    db.walletTransactions,
    db.careerRewardLedger,
    db.collectionEntries,
    db.adRewardLedger,
    db.oyakataProfiles,
    db.generationTokenLedger,
    db.observationPointLedger,
    db.careerObservationClaims,
    db.observerUpgrades,
    db.researchThemeProgress,
  ];
  await db.transaction('rw', writableTables, async () => {
    await Promise.all(writableTables.map((table) => table.clear()));
  });
  clearKpiCounters();
};

export const isCareerSaved = async (careerId: string): Promise<boolean> => {
  const db = getDb();
  const row = await db.careers.get(careerId);
  return row?.state === 'shelved';
};

export const getCareerYokozunaOrdinal = async (careerId: string): Promise<number | null> => {
  const db = getDb();
  const row = await db.careers.get(careerId);
  return row?.yokozunaOrdinal ?? null;
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
      winRoute: row.winRoute,
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

export const listCareerBashoRecordsBySeq = async (
  careerId: string,
): Promise<CareerBashoRecordsBySeq[]> => {
  const db = getDb();
  const rows = await db.bashoRecords.where('careerId').equals(careerId).toArray();
  const grouped = new Map<number, BashoRecordRow[]>();

  for (const row of rows) {
    const current = grouped.get(row.seq) ?? [];
    current.push(row);
    grouped.set(row.seq, current);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([bashoSeq, bashoRows]) => {
      const sortedRows = bashoRows
        .slice()
        .sort((a, b) => a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId));
      const sample = sortedRows[0];
      return {
        bashoSeq,
        sourceBashoSeq: bashoSeq,
        year: sample?.year ?? 0,
        month: sample?.month ?? 0,
        rows: sortedRows,
      };
    });
};

export const listCareerImportantTorikumi = async (
  careerId: string,
): Promise<ImportantTorikumiRow[]> => {
  const db = getDb();
  return db.importantTorikumi
    .where('careerId')
    .equals(careerId)
    .sortBy('[careerId+bashoSeq+day]');
};

export const getCareerBashoDetail = async (
  careerId: string,
  bashoSeq: number,
): Promise<CareerBashoDetail | null> => {
  const db = getDb();
  const [rows, bouts, importantTorikumi, banzukeDecisions, diagnostics] = await Promise.all([
    db.bashoRecords.where('[careerId+seq]').equals([careerId, bashoSeq]).toArray(),
    db.boutRecords.where('[careerId+bashoSeq]').equals([careerId, bashoSeq]).sortBy('[careerId+bashoSeq+day]'),
    db.importantTorikumi
      .where('[careerId+bashoSeq]')
      .equals([careerId, bashoSeq])
      .sortBy('[careerId+bashoSeq+day]'),
    db.banzukeDecisions.where('[careerId+seq]').equals([careerId, bashoSeq]).toArray(),
    db.simulationDiagnostics.where('[careerId+seq]').equals([careerId, bashoSeq]).first(),
  ]);

  if (!rows.length) return null;

  const sortedRows = rows
    .slice()
    .sort((a, b) => a.entityType.localeCompare(b.entityType) || a.entityId.localeCompare(b.entityId));
  const playerRecord = sortedRows.find((row) => row.entityType === 'PLAYER');
  const sample = playerRecord ?? sortedRows[0];

  return {
    bashoSeq,
    sourceBashoSeq: bashoSeq,
    year: sample?.year ?? 0,
    month: sample?.month ?? 0,
    playerRecord,
    rows: sortedRows,
    bouts: bouts.map((row) => ({
      day: row.day,
      result: row.result,
      kimarite: row.kimarite,
      winRoute: row.winRoute,
      opponentId: row.opponentId,
      opponentShikona: row.opponentShikona,
      opponentRankName: row.opponentRankName,
      opponentRankNumber: row.opponentRankNumber,
      opponentRankSide: row.opponentRankSide,
    })),
    importantTorikumi,
    banzukeDecisions: banzukeDecisions
      .slice()
      .sort((a, b) => a.rikishiId.localeCompare(b.rikishiId)),
    diagnostics,
  };
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

export type CollectionCatalogType = Extract<CollectionType, 'RECORD' | 'ACHIEVEMENT' | 'KIMARITE'>;

export interface CollectionCatalogEntry {
  id: string;
  type: CollectionCatalogType;
  key: string;
  state: 'UNLOCKED' | 'LOCKED';
  label: string;
  description?: string;
  isSecret?: boolean;
  unlockedAt?: string;
  progress?: number;
  target?: number;
  tier?: CollectionTier;
  isNew?: boolean;
  meta?: Record<string, string | number | boolean>;
}

export interface CollectionRecentUnlock {
  id: string;
  type: CollectionCatalogType;
  label: string;
  unlockedAt: string;
  isNew?: boolean;
  meta?: Record<string, string | number | boolean>;
}

export interface CollectionDashboardSummary {
  totalUnlocked: number;
  totalNew: number;
  rows: Array<{
    type: CollectionCatalogType;
    label: string;
    unlocked: number;
    total: number;
    newCount: number;
    note?: string;
  }>;
  recentUnlocks: CollectionRecentUnlock[];
}

interface CollectionCatalogBaseEntry {
  type: CollectionCatalogType;
  key: string;
  label: string;
  description: string;
  isSecret?: boolean;
  meta?: Record<string, string | number | boolean>;
}

const resolveAchievementCategoryLabel = (category: string): string => {
  if (category === 'YUSHO') return '優勝';
  if (category === 'ZENSHO') return '全勝優勝';
  if (category === 'WINS') return '通算勝利';
  if (category === 'AGE') return '現役年齢';
  if (category === 'IRONMAN') return '無休場';
  if (category === 'STREAK') return '連続勝ち越し';
  if (category === 'RAPID_PROMOTION') return '新入幕速度';
  if (category === 'SANSHO') return '三賞';
  if (category === 'GRAND_SLAM') return '各段優勝';
  if (category === 'KINBOSHI') return '金星';
  if (category === 'KIMARITE_VARIETY') return '決まり手';
  return '初勝利';
};

const buildCollectionCatalog = (
  type: CollectionCatalogType,
): CollectionCatalogBaseEntry[] => {
  if (type === 'RECORD') {
    return listCareerRecordCatalog().map((entry) => ({
      type,
      key: entry.key,
      label: entry.label,
      description: entry.description,
      isSecret: entry.isSecret,
      meta: {
        scoreBonus: entry.scoreBonus,
      },
    }));
  }
  if (type === 'ACHIEVEMENT') {
    return ACHIEVEMENT_CATALOG.map((entry) => ({
      type,
      key: entry.id,
      label: entry.name,
      description: entry.description,
      isSecret: entry.isSecret,
      meta: {
        category: resolveAchievementCategoryLabel(entry.category),
        tier: entry.tier,
      },
    }));
  }
  const officialEntries = listOfficialWinningKimariteCatalog().map((entry) => ({
    type,
    key: entry.name,
    label: entry.name,
    description: `${resolveKimariteFamilyLabel(entry.family)}の公式決まり手`,
    meta: {
      familyLabel: resolveKimariteFamilyLabel(entry.family),
      rarityLabel: resolveKimariteRarityLabel(entry.rarityBucket),
      isNonTechnique: false,
    },
  }));
  const nonTechniqueEntries = listNonTechniqueCatalog().map((entry) => ({
    type,
    key: entry.name,
    label: entry.collectionLabel,
    description: '決まり手82手とは別枠の非技',
    meta: {
      familyLabel: '非技',
      rarityLabel: resolveKimariteRarityLabel(entry.rarityBucket),
      isNonTechnique: true,
    },
  }));
  return [...officialEntries, ...nonTechniqueEntries];
};

const resolveCollectionEntryLabel = (
  type: CollectionCatalogType,
  key: string,
): string => {
  const catalogEntry = buildCollectionCatalog(type).find((entry) => entry.key === key);
  return catalogEntry?.label ?? key;
};

export const listCollectionSummary = async (): Promise<CollectionSummaryRow[]> => {
  await ensureLegacyCollectionEntries();
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

export const getRecordCollectionSummary = async (): Promise<CollectionSummaryRow> => {
  const summary = await listCollectionSummary();
  return summary.find((row) => row.type === 'RECORD') ?? {
    type: 'RECORD',
    count: 0,
    newCount: 0,
  };
};

export interface CollectionEntryDetail {
  id: string;
  type: CollectionType;
  key: string;
  label: string;
  unlockedAt: string;
  isNew?: boolean;
}

const COLLECTION_DETAIL_TYPES: CollectionCatalogType[] = ['RECORD', 'ACHIEVEMENT', 'KIMARITE'];

export const listCollectionCatalogEntries = async (
  type: CollectionCatalogType,
): Promise<CollectionCatalogEntry[]> => {
  await ensureLegacyCollectionEntries();
  const db = getDb();
  const rows = await db.collectionEntries.where('type').equals(type).toArray();
  const rowByKey = new Map(rows.map((row) => [resolveCollectionKey(row.type, row.key) ?? row.key, row]));
  const catalog = buildCollectionCatalog(type);

  return catalog
    .filter((entry) => {
      const unlocked = rowByKey.get(entry.key);
      if (!entry.isSecret) return true;
      return Boolean(unlocked);
    })
    .map((entry) => {
      const unlocked = rowByKey.get(entry.key);
      if (!unlocked) {
        return {
          id: toCollectionEntryId(type, entry.key),
          type,
          key: entry.key,
          state: 'LOCKED' as const,
          label: '？？？',
          isSecret: entry.isSecret,
          meta: type === 'KIMARITE' ? entry.meta : undefined,
        };
      }
      return {
        id: toCollectionEntryId(type, entry.key),
        type,
        key: entry.key,
        state: 'UNLOCKED' as const,
        label: entry.label,
        description: entry.description,
        isSecret: entry.isSecret,
        unlockedAt: unlocked.unlockedAt,
        progress: unlocked.progress,
        target: unlocked.target,
        tier: unlocked.tier,
        isNew: unlocked.isNew,
        meta: entry.meta,
      };
    });
};

export const listRecentCollectionUnlocks = async (
  limit = 8,
): Promise<CollectionRecentUnlock[]> => {
  await ensureLegacyCollectionEntries();
  const db = getDb();
  const rows = (await db.collectionEntries.toArray())
    .filter((row): row is typeof row & { type: CollectionCatalogType } => COLLECTION_DETAIL_TYPES.includes(row.type as CollectionCatalogType))
    .sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
    .slice(0, Math.max(1, limit));

  return rows.map((row) => {
    const key = resolveCollectionKey(row.type, row.key) ?? row.key;
    const catalogEntry = buildCollectionCatalog(row.type).find((entry) => entry.key === key);
    return {
      id: toCollectionEntryId(row.type, key),
      type: row.type,
      label: catalogEntry?.label ?? resolveCollectionEntryLabel(row.type, key),
      unlockedAt: row.unlockedAt,
      isNew: row.isNew,
      meta: catalogEntry?.meta,
    };
  });
};

export const getCollectionDashboardSummary = async (): Promise<CollectionDashboardSummary> => {
  const summaryRows = await listCollectionSummary();
  const recentUnlocks = await listRecentCollectionUnlocks(6);
  const kimariteCatalog = buildCollectionCatalog('KIMARITE');
  const officialTotal = kimariteCatalog.filter((entry) => !entry.meta?.isNonTechnique).length;
  const nonTechniqueTotal = kimariteCatalog.filter((entry) => entry.meta?.isNonTechnique).length;
  const unlockedKimariteEntries = await listCollectionCatalogEntries('KIMARITE');
  const unlockedNonTechniqueCount = unlockedKimariteEntries.filter(
    (entry) => entry.state === 'UNLOCKED' && entry.meta?.isNonTechnique,
  ).length;
  const unlockedOfficialKimariteCount = unlockedKimariteEntries.filter(
    (entry) => entry.state === 'UNLOCKED' && !entry.meta?.isNonTechnique,
  ).length;
  const rows = COLLECTION_DETAIL_TYPES.map((type) => {
    const summary = summaryRows.find((row) => row.type === type);
    const total = buildCollectionCatalog(type).filter((entry) => !entry.isSecret).length;
    return {
      type,
      label: type === 'RECORD' ? '記録' : type === 'ACHIEVEMENT' ? '偉業' : '決まり手',
      unlocked: type === 'KIMARITE' ? unlockedOfficialKimariteCount : summary?.count ?? 0,
      total: type === 'KIMARITE' ? officialTotal : total,
      newCount: summary?.newCount ?? 0,
      note:
        type === 'KIMARITE'
          ? `非技 ${unlockedNonTechniqueCount}/${nonTechniqueTotal}`
          : undefined,
    };
  });

  return {
    totalUnlocked: rows.reduce((sum, row) => sum + row.unlocked, 0) + unlockedNonTechniqueCount,
    totalNew: rows.reduce((sum, row) => sum + row.newCount, 0),
    rows,
    recentUnlocks,
  };
};

export const listUnlockedCollectionEntries = async (): Promise<CollectionEntryDetail[]> => {
  await ensureLegacyCollectionEntries();
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
      label = `偉業達成：${resolveCollectionEntryLabel('ACHIEVEMENT', resolvedKey)}`;
    } else if (row.type === 'RECORD') {
      label = `記録図鑑：${resolveCareerRecordBadgeLabel(resolvedKey as Parameters<typeof resolveCareerRecordBadgeLabel>[0])}`;
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
