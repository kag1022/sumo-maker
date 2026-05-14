import Dexie, { Table } from 'dexie';
import {
  BuildIntent,
  CareerPrizeBreakdown,
  CareerSaveTag,
  CollectionEntry,
  ExperimentPresetId,
  ObserverUpgradeId,
  ObservationRuleMode,
  ObservationStanceId,
  WinRoute,
  OyakataProfile,
  Rank,
  RikishiStatus,
  WalletTransaction,
} from '../models';
import { buildCareerClearScoreSummary, CLEAR_SCORE_VERSION } from '../career/clearScore';
import type { BanzukeDecisionLog, BanzukePopulationSnapshot } from '../banzuke/types';
import { SimulationDiagnostics } from '../simulation/diagnostics';
import { SimulationModelVersion } from '../simulation/modelVersion';
import type { ImportantTorikumiTrigger } from '../simulation/basho';
import type { BoutFlowCommentary } from '../simulation/combat/boutFlowCommentary';
import type { TorikumiMatchReason } from '../simulation/torikumi/types';
import type { EnemyStyleBias } from '../catalog/enemyData';
import { ensureKataProfile } from '../style/kata';
import type { EraTag } from '../era/types';

export type CareerState = 'in_progress' | 'unshelved' | 'shelved';

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
  simulationModelVersion: SimulationModelVersion;
  finalStatus?: RikishiStatus;
  genomeSummary?: string;
  lifetimePrizeYen?: number;
  prizeBreakdown?: CareerPrizeBreakdown;
  earnedPointsFromPrize?: number;
  pointConversionRuleId?: string;
  rewardGrantedAt?: string;
  oyakataProfile?: OyakataProfile;
  buildIntent?: BuildIntent;
  lineageId?: string;
  selectedOyakataId?: string | null;
  parentCareerId?: string;
  generation?: number;
  saveTags?: CareerSaveTag[];
  observerMemo?: string;
  observationPointsAwarded?: number;
  observationPointsGrantedAt?: string;
  observationRuleMode?: ObservationRuleMode;
  observationStanceId?: ObservationStanceId;
  experimentPresetId?: ExperimentPresetId;
  collectionDeltaCount?: number;
  careerIndex?: number;
  previewSeed?: number;
  clearScore?: number;
  clearScoreVersion?: number;
  recordBadgeKeys?: string[];
  bestScoreRank?: number;
  yokozunaOrdinal?: number;
  detailState?: 'building' | 'ready' | 'error';
  // ---- Observation Build metadata (optional, no schema bump) ----
  archiveThemeId?: string;
  archiveModifierIds?: string[];
  // ---- Anonymous EraSnapshot (optional, no schema bump) ----
  eraSnapshotId?: string;
  eraTags?: EraTag[];
  publicEraLabel?: string;
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
  stableId?: string;
  division: string;
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  rankSpecialStatus?: Rank['specialStatus'];
  wins: number;
  losses: number;
  absent: number;
  titles: string[];
  heightCm?: number;
  weightKg?: number;
  styleBias?: EnemyStyleBias;
  careerBashoCount?: number;
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
  winRoute?: WinRoute;
  opponentId?: string;
  opponentShikona?: string;
  opponentRankName?: string;
  opponentRankNumber?: number;
  opponentRankSide?: 'East' | 'West';
  boutFlowCommentary?: BoutFlowCommentary;
}

export interface ImportantTorikumiRow {
  careerId: string;
  bashoSeq: number;
  day: number;
  year: number;
  month: number;
  opponentId?: string;
  opponentShikona?: string;
  opponentRankName: string;
  opponentRankNumber?: number;
  opponentRankSide?: 'East' | 'West';
  trigger: ImportantTorikumiTrigger;
  summary: string;
  matchReason: TorikumiMatchReason;
  relaxationStage: number;
}

export interface WalletRow {
  key: 'wallet';
  points: number;
  lastRegenAt: number;
  updatedAt: string;
}

export interface GenerationTokenRow {
  key: 'generationTokens';
  tokens: number;
  lastRegenAt: number;
  updatedAt: string;
}

export interface ObservationPointRow {
  key: 'observationPoints';
  points: number;
  totalEarned: number;
  updatedAt: string;
}

export type WalletTransactionRow = WalletTransaction;

export interface GenerationTokenLedgerRow {
  id: string;
  kind: 'SPEND' | 'REFUND' | 'REGEN' | 'INIT';
  amount: number;
  balanceAfter: number;
  reason: 'CAREER_START' | 'EXPERIMENT_START' | 'TECHNICAL_REFUND' | 'REGEN' | 'INIT';
  careerId?: string;
  createdAt: string;
}

export interface ObservationPointLedgerRow {
  id: string;
  kind: 'EARN' | 'SPEND';
  amount: number;
  balanceAfter: number;
  reason: 'CAREER_OBSERVATION' | 'EXPERIMENT_OBSERVATION' | 'OBSERVER_UPGRADE' | 'MANUAL_ADJUST';
  careerId?: string;
  createdAt: string;
}

export interface CareerObservationClaimRow {
  careerId: string;
  claimedAt: string;
  pointsAwarded: number;
  ruleMode: ObservationRuleMode;
}

export interface ObserverUpgradeRow {
  id: ObserverUpgradeId;
  unlockedAt: string;
}

export interface ResearchThemeProgressRow {
  id: string;
  completedAt: string;
  sourceCareerId?: string;
}

export interface CareerRewardLedgerRow {
  careerId: string;
  lifetimePrizeYen: number;
  pointsAwarded: number;
  conversionRuleId: string;
  grantedAt: string;
  updatedAt: string;
}

export type CollectionEntryRow = CollectionEntry;

export interface AdRewardLedgerRow {
  id: string;
  day: string;
  slot: string;
  type: 'INTERSTITIAL' | 'REWARDED';
  createdAt: string;
}

export type MetaRow = WalletRow | GenerationTokenRow | ObservationPointRow;

export interface BanzukePopulationRow extends BanzukePopulationSnapshot {
  careerId: string;
}

export type BanzukeDecisionRow = BanzukeDecisionLog;

export interface SimulationDiagnosticsRow extends SimulationDiagnostics {
  careerId: string;
}

class SumoMakerDatabase extends Dexie {
  careers!: Table<CareerRow, string>;

  bashoRecords!: Table<BashoRecordRow, [string, number, string]>;

  boutRecords!: Table<BoutRecordRow, [string, number, number]>;

  meta!: Table<MetaRow, string>;

  banzukePopulation!: Table<BanzukePopulationRow, [string, number]>;

  banzukeDecisions!: Table<BanzukeDecisionRow, [string, number, string]>;

  simulationDiagnostics!: Table<SimulationDiagnosticsRow, [string, number]>;

  importantTorikumi!: Table<ImportantTorikumiRow, [string, number, number]>;

  walletTransactions!: Table<WalletTransactionRow, string>;

  careerRewardLedger!: Table<CareerRewardLedgerRow, string>;

  collectionEntries!: Table<CollectionEntryRow, string>;

  adRewardLedger!: Table<AdRewardLedgerRow, string>;

  oyakataProfiles!: Table<OyakataProfile, string>;

  generationTokenLedger!: Table<GenerationTokenLedgerRow, string>;

  observationPointLedger!: Table<ObservationPointLedgerRow, string>;

  careerObservationClaims!: Table<CareerObservationClaimRow, string>;

  observerUpgrades!: Table<ObserverUpgradeRow, ObserverUpgradeId>;

  researchThemeProgress!: Table<ResearchThemeProgressRow, string>;

  constructor() {
    super('sumo-maker-v15');

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
      simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
    });

    this.version(5).stores({
      careers:
        '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      meta: '&key, updatedAt',
      banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
      banzukeDecisions:
        '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
      simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
    });

    // v6: DNA genome support
    this.version(6).stores({
      careers:
        '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      meta: '&key, updatedAt',
      banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
      banzukeDecisions:
        '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
      simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
    });

    // v7: prize reward, wallet ledger, collection, oyakata profile
    this.version(7).stores({
      careers:
        '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      meta: '&key, updatedAt',
      banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
      banzukeDecisions:
        '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
      simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
      walletTransactions: '&id, createdAt, reason, careerId',
      careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
      collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId',
    });

    // v8: build lineage metadata + ad reward ledger + collection progress fields
    this.version(8)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, careerIndex',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      })
      .upgrade(async (tx) => {
        const careers = await tx.table<CareerRow, string>('careers').toArray();
        let nextIndex = 1;
        for (const row of careers.sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
          await tx.table<CareerRow, string>('careers').update(row.id, {
            buildIntent: row.buildIntent ?? 'BALANCE',
            careerIndex: row.careerIndex ?? nextIndex,
          });
          nextIndex += 1;
        }

        const collectionRows = await tx.table<CollectionEntryRow, string>('collectionEntries').toArray();
        for (const row of collectionRows) {
          const progress = row.progress ?? (row.type === 'KIMARITE' ? 1 : undefined);
          const tier = row.tier ?? (row.type === 'KIMARITE' ? 'BRONZE' : undefined);
          const target = row.target ?? (row.type === 'KIMARITE' ? 10 : undefined);
          await tx.table<CollectionEntryRow, string>('collectionEntries').update(row.id, {
            progress,
            tier,
            target,
            isNew: row.isNew ?? false,
          });
        }
      });

    this.version(9)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      })
      .upgrade(async (tx) => {
        const table = tx.table<CareerRow, string>('careers');
        const rows = await table.toArray();
        const existingIds = new Set(rows.map((row) => row.id));
        const parentMap = new Map<string, string | undefined>();

        for (const row of rows) {
          let parentCareerId = row.parentCareerId;
          if (!parentCareerId && row.selectedOyakataId) {
            if (row.selectedOyakataId.startsWith('oyakata:')) {
              const candidate = row.selectedOyakataId.slice('oyakata:'.length);
              if (existingIds.has(candidate)) {
                parentCareerId = candidate;
              }
            } else if (existingIds.has(row.selectedOyakataId)) {
              parentCareerId = row.selectedOyakataId;
            }
          }
          parentMap.set(row.id, parentCareerId);
        }

        const generationCache = new Map<string, number>();
        const visiting = new Set<string>();
        const resolveGeneration = (careerId: string): number => {
          const cached = generationCache.get(careerId);
          if (cached) return cached;
          if (visiting.has(careerId)) return 1;
          visiting.add(careerId);
          const parentCareerId = parentMap.get(careerId);
          const next =
            parentCareerId && existingIds.has(parentCareerId)
              ? Math.min(99, resolveGeneration(parentCareerId) + 1)
              : 1;
          visiting.delete(careerId);
          generationCache.set(careerId, next);
          return next;
        };

        for (const row of rows) {
          await table.update(row.id, {
            parentCareerId: parentMap.get(row.id),
            generation: resolveGeneration(row.id),
          });
        }
      });

    this.version(10)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      })
      .upgrade(async (tx) => {
        const table = tx.table<CareerRow, string>('careers');
        const rows = await table.toArray();
        for (const row of rows) {
          if (!row.finalStatus) continue;
          if (row.finalStatus.kataProfile) continue;
          await table.update(row.id, {
            finalStatus: ensureKataProfile(row.finalStatus),
          });
        }
      });

    this.version(11)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      })
      .upgrade(async (tx) => {
        const meta = tx.table<WalletRow, string>('meta');
        const wallet = await meta.get('wallet');
        if (wallet) {
          await meta.put({
            ...wallet,
            points: Math.max(0, Math.min(150, wallet.points)),
            lastRegenAt: wallet.lastRegenAt ?? Date.now(),
            updatedAt: new Date().toISOString(),
          });
        }
      });

    this.version(12).stores({
      careers:
        '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      importantTorikumi:
        '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq], trigger',
      meta: '&key, updatedAt',
      banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
      banzukeDecisions:
        '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
      simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
      walletTransactions: '&id, createdAt, reason, careerId',
      careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
      collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
      adRewardLedger: '&id, [day+slot], day, type, createdAt',
      oyakataProfiles: '&id, sourceCareerId',
    });

    this.version(13)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex, clearScore, bestScoreRank',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        importantTorikumi:
          '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq], trigger',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      });

    this.version(14)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex, clearScore, bestScoreRank',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        importantTorikumi:
          '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq], trigger',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      })
      .upgrade(async (tx) => {
        const table = tx.table<CareerRow, string>('careers');
        const rows = await table.toArray();
        const scoredRows = rows.map((row) => {
          if (!row.finalStatus) return row;
          const summary = buildCareerClearScoreSummary(row.finalStatus);
          return {
            ...row,
            clearScore: summary.clearScore,
            clearScoreVersion: CLEAR_SCORE_VERSION,
            recordBadgeKeys: summary.badges.map((badge) => badge.key),
          };
        });

        const ranked = scoredRows
          .filter((row) => row.state === 'shelved')
          .slice()
          .sort((left, right) => {
            const scoreDelta = (right.clearScore ?? 0) - (left.clearScore ?? 0);
            if (scoreDelta !== 0) return scoreDelta;
            const savedDelta = (right.savedAt ?? '').localeCompare(left.savedAt ?? '');
            if (savedDelta !== 0) return savedDelta;
            return right.updatedAt.localeCompare(left.updatedAt);
          });
        const bestScoreRankById = new Map(ranked.map((row, index) => [row.id, index + 1]));

        for (const row of scoredRows) {
          await table.update(row.id, {
            clearScore: row.clearScore,
            clearScoreVersion: row.clearScoreVersion,
            recordBadgeKeys: row.recordBadgeKeys,
            bestScoreRank: bestScoreRankById.get(row.id),
          });
        }
      });

    this.version(15)
      .stores({
        careers:
          '&id, state, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex, clearScore, bestScoreRank',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        importantTorikumi:
          '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq], trigger',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      })
      .upgrade(async (tx) => {
        const table = tx.table<CareerRow, string>('careers');
        const rows = await table.toArray();
        const yokozunaRows = rows
          .filter((row) => (row.finalStatus?.history.maxRank.name ?? row.maxRank.name) === '横綱')
          .sort((left, right) => left.createdAt.localeCompare(right.createdAt));

        for (let index = 0; index < yokozunaRows.length; index += 1) {
          const row = yokozunaRows[index];
          await table.update(row.id, {
            yokozunaOrdinal: row.yokozunaOrdinal ?? index + 1,
          });
        }
      });

    this.version(16)
      .stores({
        careers:
          '&id, state, detailState, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex, clearScore, bestScoreRank',
        bashoRecords:
          '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
        boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
        importantTorikumi:
          '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq], trigger',
        meta: '&key, updatedAt',
        banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
        banzukeDecisions:
          '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
        simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
        walletTransactions: '&id, createdAt, reason, careerId',
        careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
        collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
        adRewardLedger: '&id, [day+slot], day, type, createdAt',
        oyakataProfiles: '&id, sourceCareerId',
      })
      .upgrade(async (tx) => {
        const table = tx.table<CareerRow, string>('careers');
        const rows = await table.toArray();
        for (const row of rows) {
          await table.update(row.id, {
            detailState: row.detailState ?? 'ready',
          });
        }
      });

    this.version(17).stores({
      careers:
        '&id, state, detailState, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex, clearScore, bestScoreRank, observationRuleMode',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      importantTorikumi:
        '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq], trigger',
      meta: '&key, updatedAt',
      banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
      banzukeDecisions:
        '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
      simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
      walletTransactions: '&id, createdAt, reason, careerId',
      careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
      collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
      adRewardLedger: '&id, [day+slot], day, type, createdAt',
      oyakataProfiles: '&id, sourceCareerId',
      generationTokenLedger: '&id, createdAt, reason, careerId',
      observationPointLedger: '&id, createdAt, reason, careerId',
      careerObservationClaims: '&careerId, claimedAt',
      observerUpgrades: '&id, unlockedAt',
      researchThemeProgress: '&id, completedAt, sourceCareerId',
    });

    this.version(18).stores({
      careers:
        '&id, state, detailState, updatedAt, savedAt, careerStartYearMonth, careerEndYearMonth, rewardGrantedAt, buildIntent, lineageId, selectedOyakataId, parentCareerId, generation, careerIndex, clearScore, bestScoreRank, observationRuleMode, observationStanceId',
      bashoRecords:
        '&[careerId+seq+entityId], careerId, [careerId+seq], [careerId+entityType], division',
      boutRecords: '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq]',
      importantTorikumi:
        '&[careerId+bashoSeq+day], careerId, [careerId+bashoSeq], trigger',
      meta: '&key, updatedAt',
      banzukePopulation: '&[careerId+seq], careerId, seq, [careerId+year+month]',
      banzukeDecisions:
        '&[careerId+seq+rikishiId], careerId, [careerId+seq], rikishiId, modelVersion, proposalSource',
      simulationDiagnostics: '&[careerId+seq], careerId, [careerId+year+month]',
      walletTransactions: '&id, createdAt, reason, careerId',
      careerRewardLedger: '&careerId, grantedAt, pointsAwarded',
      collectionEntries: '&id, type, key, [type+key], unlockedAt, sourceCareerId, isNew',
      adRewardLedger: '&id, [day+slot], day, type, createdAt',
      oyakataProfiles: '&id, sourceCareerId',
      generationTokenLedger: '&id, createdAt, reason, careerId',
      observationPointLedger: '&id, createdAt, reason, careerId',
      careerObservationClaims: '&careerId, claimedAt',
      observerUpgrades: '&id, unlockedAt',
      researchThemeProgress: '&id, completedAt, sourceCareerId',
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
