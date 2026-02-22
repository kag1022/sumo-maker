import { Division } from "../../../logic/models";
import { PlayerBoutDetail } from "../../../logic/simulation/basho";

export type BoutDetail = PlayerBoutDetail;

const MAX_DAYS_BY_DIVISION: Record<Division, number> = {
  Makuuchi: 15,
  Juryo: 15,
  Makushita: 15,
  Sandanme: 15,
  Jonidan: 15,
  Jonokuchi: 15,
  Maezumo: 15,
};

export const buildHoshitoriGrid = (
  bouts: BoutDetail[],
  division: Division,
): (BoutDetail | null)[] => {
  const maxDays = MAX_DAYS_BY_DIVISION[division];
  const grid: (BoutDetail | null)[] = Array.from({ length: 15 }, () => null);

  for (const bout of bouts) {
    if (!Number.isInteger(bout.day)) continue;
    if (bout.day < 1 || bout.day > maxDays) continue;
    grid[bout.day - 1] = bout;
  }

  return grid;
};
