import type { CareerBashoDetail } from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import type { Division } from "../../../logic/models";
import { formatRankDisplayName } from "../../../logic/ranking";
import { formatBashoLabel } from "../../../logic/bashoLabels";

export interface NpcCareerDetail {
  entityId: string;
  shikona: string;
  bashoLabel: string;
  rankLabel: string;
  recordLabel: string;
  sourceLabel: string;
  abilityLabel: string;
  bodyLabel: string;
  styleLabel: string;
  stableLabel: string;
  careerBashoCountLabel: string;
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

const formatNumberLabel = (value: number | undefined, digits = 0): string =>
  Number.isFinite(value) ? `${value!.toFixed(digits)}` : "保存なし";

const formatBodyLabel = (row: BashoRecordRow): string => {
  const height = Number.isFinite(row.heightCm) ? `${Math.round(row.heightCm!)}cm` : null;
  const weight = Number.isFinite(row.weightKg) ? `${Math.round(row.weightKg!)}kg` : null;
  return [height, weight].filter(Boolean).join(" / ") || "保存なし";
};

const formatAbilityLabel = (row: BashoRecordRow): string => {
  if (!Number.isFinite(row.ability) && !Number.isFinite(row.form)) return "保存なし";
  const ability = Number.isFinite(row.ability) ? `能力 ${Math.round(row.ability!)}` : null;
  const form = Number.isFinite(row.form) ? `調子 ${row.form!.toFixed(1)}` : null;
  return [ability, form].filter(Boolean).join(" / ");
};

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
    sourceLabel: "場所保存時点の番付行",
    abilityLabel: formatAbilityLabel(row),
    bodyLabel: formatBodyLabel(row),
    styleLabel: row.styleBias ? STYLE_LABELS[row.styleBias] ?? row.styleBias : "保存なし",
    stableLabel: row.stableId ?? "保存なし",
    careerBashoCountLabel: Number.isFinite(row.careerBashoCount)
      ? `${formatNumberLabel(row.careerBashoCount)}場所目`
      : "保存なし",
  };
};
