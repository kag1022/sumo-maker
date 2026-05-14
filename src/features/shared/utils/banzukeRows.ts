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

const sideOrder = (side: BashoRecordRow['rankSide']): number =>
  side === 'East' ? 0 : side === 'West' ? 1 : 2;

const compareDivisionRows = (left: BashoRecordRow, right: BashoRecordRow): number => {
  const rankDelta = rankValueFromRow(left) - rankValueFromRow(right);
  if (rankDelta !== 0) return rankDelta;
  const sideDelta = sideOrder(left.rankSide) - sideOrder(right.rankSide);
  if (sideDelta !== 0) return sideDelta;
  if (left.entityType !== right.entityType) return left.entityType === 'PLAYER' ? -1 : 1;
  return left.shikona.localeCompare(right.shikona, 'ja');
};

export const listDivisionRows = (
  rows: BashoRecordRow[],
  playerRow: BashoRecordRow,
): BashoRecordRow[] =>
  rows
    .filter((row) => row.division === playerRow.division)
    .slice()
    .sort(compareDivisionRows);

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
