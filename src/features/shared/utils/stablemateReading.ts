import type { Division } from "../../../logic/models";
import type { CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import { formatRankDisplayName } from "../../../logic/ranking";
import { resolveStableById } from "../../../logic/simulation/heya";

export type StablemateRelation = "senior" | "peer" | "junior";

export interface StablemateSummary {
  entityId: string;
  shikona: string;
  relation: StablemateRelation;
  relationLabel: string;
  rankLabel: string;
  recordLabel: string;
  overlapBashoCount: number;
  firstSeenLabel: string;
}

interface StablemateAccumulator {
  entityId: string;
  shikona: string;
  latestRow: BashoRecordRow;
  firstSeq: number;
  lastSeq: number;
  overlapBashoCount: number;
  diffTotal: number;
  diffCount: number;
}

const RELATION_LABELS: Record<StablemateRelation, string> = {
  senior: "兄弟子格",
  peer: "同期に近い",
  junior: "弟弟子格",
};

const formatRecordLabel = (row: BashoRecordRow): string =>
  `${row.wins}勝${row.losses}敗${row.absent > 0 ? `${row.absent}休` : ""}`;

const formatRowRank = (row: BashoRecordRow): string =>
  formatRankDisplayName({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
    specialStatus: row.rankSpecialStatus,
  });

const resolveRelation = (averageDiff: number): StablemateRelation => {
  if (averageDiff >= 8) return "senior";
  if (averageDiff <= -8) return "junior";
  return "peer";
};

const sortByPresence = (left: StablemateSummary, right: StablemateSummary): number => {
  if (left.overlapBashoCount !== right.overlapBashoCount) {
    return right.overlapBashoCount - left.overlapBashoCount;
  }
  return left.shikona.localeCompare(right.shikona, "ja");
};

export const buildStablemateSummaries = (
  status: { stableId?: string },
  bashoRows: CareerBashoRecordsBySeq[],
  limit = 6,
): StablemateSummary[] => {
  if (!status.stableId || bashoRows.length === 0) return [];

  const byEntity = new Map<string, StablemateAccumulator>();
  for (const basho of bashoRows) {
    const playerCareerBashoCount =
      basho.rows.find((row) => row.entityType === "PLAYER")?.careerBashoCount ?? basho.bashoSeq;
    for (const row of basho.rows) {
      if (row.entityType !== "NPC") continue;
      if (row.stableId !== status.stableId) continue;
      if (!Number.isFinite(row.careerBashoCount)) continue;

      const current = byEntity.get(row.entityId);
      const diff = (row.careerBashoCount ?? playerCareerBashoCount) - playerCareerBashoCount;
      if (!current) {
        byEntity.set(row.entityId, {
          entityId: row.entityId,
          shikona: row.shikona,
          latestRow: row,
          firstSeq: basho.bashoSeq,
          lastSeq: basho.bashoSeq,
          overlapBashoCount: 1,
          diffTotal: diff,
          diffCount: 1,
        });
        continue;
      }

      current.shikona = row.shikona;
      current.latestRow = basho.bashoSeq >= current.lastSeq ? row : current.latestRow;
      current.firstSeq = Math.min(current.firstSeq, basho.bashoSeq);
      current.lastSeq = Math.max(current.lastSeq, basho.bashoSeq);
      current.overlapBashoCount += 1;
      current.diffTotal += diff;
      current.diffCount += 1;
    }
  }

  const grouped: Record<StablemateRelation, StablemateSummary[]> = {
    senior: [],
    peer: [],
    junior: [],
  };

  for (const entry of byEntity.values()) {
    const relation = resolveRelation(entry.diffTotal / Math.max(1, entry.diffCount));
    grouped[relation].push({
      entityId: entry.entityId,
      shikona: entry.shikona,
      relation,
      relationLabel: RELATION_LABELS[relation],
      rankLabel: formatRowRank(entry.latestRow),
      recordLabel: formatRecordLabel(entry.latestRow),
      overlapBashoCount: entry.overlapBashoCount,
      firstSeenLabel: `${entry.firstSeq}場所目から`,
    });
  }

  const ordered: StablemateSummary[] = [];
  for (const relation of ["senior", "peer", "junior"] as const) {
    ordered.push(...grouped[relation].sort(sortByPresence).slice(0, 2));
  }

  return ordered.slice(0, Math.max(0, limit));
};

export const resolveStableRelationshipLabel = (
  row: Pick<BashoRecordRow, "stableId">,
  playerStableId: string,
): string | undefined => {
  if (!row.stableId) return undefined;
  if (row.stableId === playerStableId) return "同部屋";
  const stable = resolveStableById(row.stableId);
  const playerStable = resolveStableById(playerStableId);
  if (stable && playerStable && stable.ichimonId === playerStable.ichimonId) return "同一門";
  return undefined;
};

export const resolveStableAffiliationLabel = (
  row: Pick<BashoRecordRow, "stableId">,
  playerStableId: string,
): string | undefined => {
  const relationshipLabel = resolveStableRelationshipLabel(row, playerStableId);
  if (relationshipLabel) return relationshipLabel;
  if (!row.stableId) return undefined;
  const stable = resolveStableById(row.stableId);
  return stable?.displayName;
};
