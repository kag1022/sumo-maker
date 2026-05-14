import type { CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import type { Division } from "../../../logic/models";
import { formatRankDisplayName } from "../../../logic/ranking";
import { formatBashoLabel } from "../../../logic/bashoLabels";

export interface NpcCareerDetail {
  entityId: string;
  shikona: string;
  appearances: number;
  totalRecordLabel: string;
  maxRankLabel: string;
  selectedRankLabel: string | null;
  selectedRecordLabel: string | null;
  firstBashoLabel: string;
  lastBashoLabel: string;
  yushoCount: number;
  recentSlices: Array<{
    bashoSeq: number;
    bashoLabel: string;
    rankLabel: string;
    recordLabel: string;
    selected: boolean;
  }>;
}

const formatRecordLabel = (wins: number, losses: number, absent: number) =>
  `${wins}勝${losses}敗${absent > 0 ? `${absent}休` : ""}`;

const rankLabelFromRow = (row: CareerBashoRecordsBySeq["rows"][number]) =>
  formatRankDisplayName({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
    specialStatus: row.rankSpecialStatus,
  });

const rankSortScore = (row: CareerBashoRecordsBySeq["rows"][number]) => {
  const divisionOrder: Record<string, number> = {
    Makuuchi: 0,
    Juryo: 1,
    Makushita: 2,
    Sandanme: 3,
    Jonidan: 4,
    Jonokuchi: 5,
    Maezumo: 6,
  };
  return (
    (divisionOrder[row.division] ?? 99) * 1000 +
    (row.rankNumber ?? 0) * 2 +
    (row.rankSide === "West" ? 1 : 0)
  );
};

export const buildNpcCareerDetail = (
  bashoRows: CareerBashoRecordsBySeq[],
  entityId: string,
  selectedBashoSeq: number | null,
): NpcCareerDetail | null => {
  const appearances = bashoRows
    .map((basho) => {
      const row = basho.rows.find((entry) => entry.entityType === "NPC" && entry.entityId === entityId);
      if (!row) return null;
      return {
        bashoSeq: basho.bashoSeq,
        bashoLabel: formatBashoLabel(basho.year, basho.month),
        row,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  if (!appearances.length) return null;

  const bestRow = appearances
    .map((entry) => entry.row)
    .slice()
    .sort((left, right) => rankSortScore(left) - rankSortScore(right))[0];
  const selectedEntry =
    (selectedBashoSeq != null && appearances.find((entry) => entry.bashoSeq === selectedBashoSeq)) ?? null;

  const totals = appearances.reduce(
    (acc, entry) => {
      acc.wins += entry.row.wins;
      acc.losses += entry.row.losses;
      acc.absent += entry.row.absent;
      if (entry.row.titles.includes("YUSHO")) acc.yushoCount += 1;
      return acc;
    },
    { wins: 0, losses: 0, absent: 0, yushoCount: 0 },
  );

  return {
    entityId,
    shikona: appearances[appearances.length - 1]?.row.shikona ?? appearances[0].row.shikona,
    appearances: appearances.length,
    totalRecordLabel: formatRecordLabel(totals.wins, totals.losses, totals.absent),
    maxRankLabel: rankLabelFromRow(bestRow),
    selectedRankLabel: selectedEntry ? rankLabelFromRow(selectedEntry.row) : null,
    selectedRecordLabel: selectedEntry
      ? formatRecordLabel(selectedEntry.row.wins, selectedEntry.row.losses, selectedEntry.row.absent)
      : null,
    firstBashoLabel: appearances[0].bashoLabel,
    lastBashoLabel: appearances[appearances.length - 1].bashoLabel,
    yushoCount: totals.yushoCount,
    recentSlices: appearances.slice(-8).map((entry) => ({
      bashoSeq: entry.bashoSeq,
      bashoLabel: entry.bashoLabel,
      rankLabel: rankLabelFromRow(entry.row),
      recordLabel: formatRecordLabel(entry.row.wins, entry.row.losses, entry.row.absent),
      selected: entry.bashoSeq === selectedBashoSeq,
    })),
  };
};
