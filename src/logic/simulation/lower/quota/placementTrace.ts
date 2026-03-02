import { resolveLowerDivisionPlacements } from '../../../banzuke/providers/lowerBoundary';
import { Rank } from '../../../models';
import {
  BoundarySnapshot,
  LowerDivision,
  LowerDivisionPlacementTraceRow,
} from '../../lower/types';
import { resolveLowerRankName } from './leagueSimulation';

export const buildPlacementTrace = (
  before: Record<LowerDivision, BoundarySnapshot[]>,
  placements: ReturnType<typeof resolveLowerDivisionPlacements>['placements'],
): LowerDivisionPlacementTraceRow[] => {
  const orderedDivisions: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
  const divisionOffsets: Record<LowerDivision, number> = {
    Makushita: 0,
    Sandanme: 0,
    Jonidan: 0,
    Jonokuchi: 0,
  };
  let cursor = 0;
  for (const division of orderedDivisions) {
    divisionOffsets[division] = cursor;
    cursor += before[division].length;
  }

  const toRankFromScore = (division: LowerDivision, rankScore: number): Rank => ({
    division,
    name: resolveLowerRankName(division),
    number: Math.floor((Math.max(1, rankScore) - 1) / 2) + 1,
    side: Math.max(1, rankScore) % 2 === 1 ? 'East' : 'West',
  });

  const beforeById = new Map<
    string,
    { shikona: string; division: LowerDivision; rankScore: number; wins: number; losses: number }
  >();
  for (const division of orderedDivisions) {
    for (const row of before[division]) {
      beforeById.set(row.id, {
        shikona: row.shikona,
        division,
        rankScore: row.rankScore,
        wins: row.wins,
        losses: row.losses,
      });
    }
  }
  const afterById = new Map(placements.map((placement) => [placement.id, placement]));

  const rows: LowerDivisionPlacementTraceRow[] = [];
  for (const [id, row] of beforeById.entries()) {
    const after = afterById.get(id);
    const afterDivision = after?.division ?? row.division;
    const afterRankScore = after?.rankScore ?? row.rankScore;
    const absent = Math.max(0, 7 - (row.wins + row.losses));
    rows.push({
      id,
      shikona: row.shikona,
      wins: row.wins,
      losses: row.losses,
      absent,
      scoreDiff: row.wins - row.losses,
      beforeRank: toRankFromScore(row.division, row.rankScore),
      afterRank: after?.rank ?? toRankFromScore(afterDivision, afterRankScore),
      beforeGlobalSlot: divisionOffsets[row.division] + row.rankScore,
      afterGlobalSlot: divisionOffsets[afterDivision] + afterRankScore,
    });
  }

  return rows.sort((a, b) => a.beforeGlobalSlot - b.beforeGlobalSlot);
};
