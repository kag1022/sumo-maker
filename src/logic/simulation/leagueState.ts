import { Division } from '../models';
import { countActiveBanzukeHeadcountExcludingMaezumo, countActiveMaezumoHeadcount } from './world';
import { LeagueFlowRuntime } from './leagueFlow';
import {
  LeagueDivisionEntry,
  LeagueDivisionState,
  LeagueState,
} from './runtimeTypes';

const SEASON_MONTHS = [1, 3, 5, 7, 9, 11] as const;

export interface LeagueStateBuildInput {
  leagueFlow: LeagueFlowRuntime;
  seq: number;
  year: number;
  monthIndex: number;
}

const toLeagueDivisionEntry = (
  row: {
    id: string;
    shikona: string;
    stableId: string;
    rankScore: number;
    actorType?: 'PLAYER' | 'NPC';
    entrySeq?: number;
    active?: boolean;
  },
): LeagueDivisionEntry => ({
  id: row.id,
  shikona: row.shikona,
  stableId: row.stableId,
  rankScore: row.rankScore,
  actorType: row.actorType ?? (row.id === 'PLAYER' ? 'PLAYER' : 'NPC'),
  entrySeq: row.entrySeq ?? 0,
  active: row.active !== false,
});

const buildDivisionState = (
  division: Division,
  rows: LeagueDivisionEntry[],
): LeagueDivisionState => {
  const activeHeadcount = rows.filter((row) => row.active).length;
  return {
    division,
    headcount: rows.length,
    activeHeadcount,
    vacancies: Math.max(0, rows.length - activeHeadcount),
    ranks: rows,
  };
};

export const buildLeagueState = ({
  leagueFlow,
  seq,
  year,
  monthIndex,
}: LeagueStateBuildInput): LeagueState => {
  const world = leagueFlow.world;
  const lowerWorld = leagueFlow.lowerWorld;
  const activeBanzukeHeadcount = countActiveBanzukeHeadcountExcludingMaezumo(world);
  const maezumoHeadcount = countActiveMaezumoHeadcount(world);

  const divisions: Record<Division, LeagueDivisionState> = {
    Makuuchi: buildDivisionState(
      'Makuuchi',
      world.rosters.Makuuchi.map((row) => {
        const actor = world.npcRegistry.get(row.id);
        return toLeagueDivisionEntry({
          ...row,
          actorType: actor?.actorType,
          entrySeq: actor?.entrySeq,
          active: true,
        });
      }),
    ),
    Juryo: buildDivisionState(
      'Juryo',
      world.rosters.Juryo.map((row) => {
        const actor = world.npcRegistry.get(row.id);
        return toLeagueDivisionEntry({
          ...row,
          actorType: actor?.actorType,
          entrySeq: actor?.entrySeq,
          active: true,
        });
      }),
    ),
    Makushita: buildDivisionState(
      'Makushita',
      lowerWorld.rosters.Makushita.map((row) => toLeagueDivisionEntry(row)),
    ),
    Sandanme: buildDivisionState(
      'Sandanme',
      lowerWorld.rosters.Sandanme.map((row) => toLeagueDivisionEntry(row)),
    ),
    Jonidan: buildDivisionState(
      'Jonidan',
      lowerWorld.rosters.Jonidan.map((row) => toLeagueDivisionEntry(row)),
    ),
    Jonokuchi: buildDivisionState(
      'Jonokuchi',
      lowerWorld.rosters.Jonokuchi.map((row) => toLeagueDivisionEntry(row)),
    ),
    Maezumo: buildDivisionState(
      'Maezumo',
      world.maezumoPool.map((row) => toLeagueDivisionEntry(row)),
    ),
  };

  const lowerExchanges = Object.values(lowerWorld.lastExchanges ?? {}).reduce((sum, exchange) => (
    sum + (exchange?.slots ?? 0)
  ), 0);
  const topExchangeSlots = world.lastExchange?.slots ?? 0;

  return {
    currentSeason: {
      seq,
      year,
      month: SEASON_MONTHS[monthIndex] ?? 1,
    },
    population: {
      totalHeadcount: Object.values(divisions).reduce((sum, division) => sum + division.headcount, 0),
      totalActiveHeadcount: Object.values(divisions).reduce((sum, division) => sum + division.activeHeadcount, 0),
      activeBanzukeHeadcount,
      maezumoHeadcount,
    },
    divisions,
    currentCohort: [...world.npcRegistry.values()]
      .filter((npc) => npc.active && npc.entrySeq === seq)
      .map((npc) => npc.id),
    boundaryContext: {
      headcountPressure:
        Object.values(divisions).reduce((sum, division) => sum + division.vacancies, 0),
      promotionPressure: topExchangeSlots + lowerExchanges,
      demotionPressure: topExchangeSlots + lowerExchanges,
      makushitaExchangeSlots:
        topExchangeSlots + (lowerWorld.lastExchanges.MakushitaSandanme?.slots ?? 0),
    },
  };
};
