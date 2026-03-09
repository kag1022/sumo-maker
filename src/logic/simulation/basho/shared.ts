import { BashoRecord } from '../../models';
import { BoundarySnapshot, LowerDivision } from '../lower/types';
import { LowerLeagueSnapshots } from '../lowerQuota';
import { TorikumiParticipant } from '../torikumi/types';

const HONBASHO_TOTAL_DAYS = 15;

export const resolveScheduledBoutDay = (boutIndex: number): number =>
  Math.min(HONBASHO_TOTAL_DAYS, 1 + boutIndex * 2);

export const resolvePerformanceMetrics = (
  wins: number,
  expectedWins: number,
  sosTotal: number,
  sosCount: number,
): Pick<BashoRecord, 'expectedWins' | 'strengthOfSchedule' | 'performanceOverExpected'> => ({
  expectedWins,
  strengthOfSchedule: sosCount > 0 ? sosTotal / sosCount : 0,
  performanceOverExpected: wins - expectedWins,
});

export const toBoundarySnapshotsByDivision = (
  participants: TorikumiParticipant[],
): LowerLeagueSnapshots => {
  const divisions: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
  const result = {
    Makushita: [],
    Sandanme: [],
    Jonidan: [],
    Jonokuchi: [],
  } as LowerLeagueSnapshots;
  for (const division of divisions) {
    result[division] = participants
      .filter((participant) => participant.division === division)
      .map((participant) => ({
        id: participant.id,
        shikona: participant.shikona,
        isPlayer: participant.isPlayer,
        stableId: participant.stableId,
        rankScore: participant.rankScore,
        wins: participant.wins,
        losses: participant.losses,
      } satisfies BoundarySnapshot));
  }
  return result;
};
