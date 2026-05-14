import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import type { Division } from "../../../logic/models";
import { formatRankDisplayName } from "../../../logic/ranking";
import { formatBashoLabel } from "../../../logic/bashoLabels";
import { resolveStableById } from "../../../logic/simulation/heya";

export interface NpcCareerDetail {
  entityId: string;
  shikona: string;
  bashoLabel: string;
  rankLabel: string;
  recordLabel: string;
  bodyLabel?: string;
  styleLabel?: string;
  stableLabel?: string;
  careerBashoCountLabel?: string;
}

const STYLE_LABELS: Record<string, string> = {
  PUSH: "押し",
  GRAPPLE: "四つ",
  THROW: "投げ",
  BALANCE: "万能",
};

const formatRecordLabel = (wins: number, losses: number, absent: number): string =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const rankLabelFromRow = (row: BashoRecordRow): string =>
  formatRankDisplayName({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
    specialStatus: row.rankSpecialStatus,
  });

const formatBodyLabel = (row: BashoRecordRow): string | undefined => {
  const height = Number.isFinite(row.heightCm) ? `${Math.round(row.heightCm!)}cm` : null;
  const weight = Number.isFinite(row.weightKg) ? `${Math.round(row.weightKg!)}kg` : null;
  return [height, weight].filter(Boolean).join(" / ") || undefined;
};

const formatStableLabel = (stableId: string | undefined): string | undefined =>
  stableId ? resolveStableById(stableId)?.displayName : undefined;

const formatCareerBashoCountLabel = (careerBashoCount: number | undefined): string | undefined =>
  Number.isFinite(careerBashoCount) ? `${careerBashoCount}場所目` : undefined;

export const buildNpcCareerDetail = (
  detail: CareerBashoDetail | null,
  entityId: string,
): NpcCareerDetail | null => {
  const row = detail?.rows.find((entry) => entry.entityType === "NPC" && entry.entityId === entityId);
  if (!detail || !row) return null;

  return {
    entityId,
    shikona: row.shikona,
    bashoLabel: formatBashoLabel(detail.year, detail.month),
    rankLabel: rankLabelFromRow(row),
    recordLabel: formatRecordLabel(row.wins, row.losses, row.absent),
    bodyLabel: formatBodyLabel(row),
    styleLabel: row.styleBias ? STYLE_LABELS[row.styleBias] ?? row.styleBias : undefined,
    stableLabel: formatStableLabel(row.stableId),
    careerBashoCountLabel: formatCareerBashoCountLabel(row.careerBashoCount),
  };
};
