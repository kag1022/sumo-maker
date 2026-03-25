import type { CareerBashoRecordsBySeq } from "../../../logic/persistence/careerHistory";
import type { BashoRecordRow } from "../../../logic/persistence/db";
import { Division, RankedDivision } from "../../../logic/models";
import { getRankValueForChart } from "../../../logic/ranking";
import { formatRankDisplayName } from "../../report/utils/reportShared";

export interface EraStatsViewState {
  selectedBashoSeq: number;
  selectedDivision: RankedDivision;
  rankingBasis: "rank" | "record";
}

export interface EraPeerRow {
  key: string;
  label: string;
  maxRankLabel: string;
  recordLabel: string;
  rankingValueLabel: string;
  isPlayer: boolean;
  sortValue: number;
}

export const buildEraTimelineBands = (
  records: Array<{ bashoSeq: number; year: number }>,
) => {
  const grouped = new Map<number, number[]>();
  for (const record of records) {
    const current = grouped.get(record.year) ?? [];
    current.push(record.bashoSeq);
    grouped.set(record.year, current);
  }

  return [...grouped.entries()].map(([year, seqs]) => ({
    year,
    label: String(year),
    startSeq: seqs[0],
    endSeq: seqs[seqs.length - 1],
    size: seqs.length,
  }));
};

export const getDefaultDivision = (division?: Division): RankedDivision => {
  if (division === "Makuuchi" || division === "Juryo" || division === "Makushita" || division === "Sandanme" || division === "Jonidan" || division === "Jonokuchi") {
    return division;
  }
  return "Makushita";
};

const rankValueFromRow = (row: BashoRecordRow): number =>
  getRankValueForChart({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
  });

export const getSelectedBanzukeSlice = (
  basho: CareerBashoRecordsBySeq | null,
  division: RankedDivision,
): BashoRecordRow[] => {
  if (!basho) return [];
  return basho.rows
    .filter((row) => row.division === division)
    .slice()
    .sort((left, right) => rankValueFromRow(left) - rankValueFromRow(right));
};

export const getEraPeerRows = (
  bashoRows: CareerBashoRecordsBySeq[],
  division: RankedDivision,
  rankingBasis: "rank" | "record",
): EraPeerRow[] => {
  const byKey = new Map<string, {
    label: string;
    maxRankValue: number;
    maxRankLabel: string;
    wins: number;
    losses: number;
    absent: number;
    appearances: number;
    isPlayer: boolean;
  }>();

  for (const basho of bashoRows) {
    for (const row of basho.rows) {
      if (row.division !== division) continue;
      const key = `${row.entityType}:${row.entityId}`;
      const current = byKey.get(key);
      const rankValue = rankValueFromRow(row);
      const rankLabel = formatRankDisplayName({
        division: row.division as Division,
        name: row.rankName,
        number: row.rankNumber ?? undefined,
        side: row.rankSide ?? undefined,
      });
      if (!current) {
        byKey.set(key, {
          label: row.shikona,
          maxRankValue: rankValue,
          maxRankLabel: rankLabel,
          wins: row.wins,
          losses: row.losses,
          absent: row.absent,
          appearances: 1,
          isPlayer: row.entityType === "PLAYER",
        });
      } else {
        current.wins += row.wins;
        current.losses += row.losses;
        current.absent += row.absent;
        current.appearances += 1;
        if (rankValue < current.maxRankValue) {
          current.maxRankValue = rankValue;
          current.maxRankLabel = rankLabel;
        }
      }
    }
  }

  return [...byKey.entries()]
    .map(([key, row]) => ({
      key,
      label: row.label,
      maxRankLabel: row.maxRankLabel,
      recordLabel: `${row.wins}勝${row.losses}敗${row.absent > 0 ? `${row.absent}休` : ""}`,
      rankingValueLabel: rankingBasis === "rank" ? row.maxRankLabel : `${row.wins}勝 / ${row.appearances}場所`,
      isPlayer: row.isPlayer,
      sortValue: rankingBasis === "rank" ? row.maxRankValue : -(row.wins * 100 - row.losses * 10 - row.absent),
    }))
    .sort((left, right) => left.sortValue - right.sortValue || left.label.localeCompare(right.label, "ja"));
};
