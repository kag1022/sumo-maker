import type { Division } from '../../../logic/models';
import type { BashoRecordRow } from '../../../logic/persistence/db';
import { getRankValueForChart } from '../../../logic/ranking';

const rankValueFromRow = (row: BashoRecordRow): number =>
  getRankValueForChart({
    division: row.division as Division,
    name: row.rankName,
    number: row.rankNumber ?? undefined,
    side: row.rankSide ?? undefined,
  });

export const listDivisionRows = (
  rows: BashoRecordRow[],
  playerRow: BashoRecordRow,
): BashoRecordRow[] =>
  rows
    .filter((row) => row.division === playerRow.division)
    .slice()
    .sort((left, right) => rankValueFromRow(left) - rankValueFromRow(right));

export const groupNearbyRanks = (
  rows: BashoRecordRow[],
  playerRow: BashoRecordRow,
  range: number,
): BashoRecordRow[] => {
  const sorted = listDivisionRows(rows, playerRow);
  const playerIndex = sorted.findIndex((row) => row.entityType === 'PLAYER');
  if (playerIndex < 0) return sorted.slice(0, Math.min(sorted.length, range * 2 + 1));
  return sorted.slice(Math.max(0, playerIndex - range), Math.min(sorted.length, playerIndex + range + 1));
};
