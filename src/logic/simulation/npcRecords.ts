import type { Rank } from '../models';
import type { MakuuchiLayout } from '../ranking/banzukeLayout';
import type { NpcBashoAggregate } from './basho';
import type { LowerDivisionQuotaWorld } from './lowerQuota';
import { resolveTopDivisionRank } from './topDivision/rank';
import type { SimulationWorld, TopDivision } from './world';
import { resolveYushoResolution } from './yusho';

type LowerDivision = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';

const LOWER_DIVISION_NAME: Record<LowerDivision, string> = {
  Makushita: '幕下',
  Sandanme: '三段目',
  Jonidan: '序二段',
  Jonokuchi: '序ノ口',
};

const isLowerDivision = (division: Rank['division']): division is LowerDivision =>
  division === 'Makushita' ||
  division === 'Sandanme' ||
  division === 'Jonidan' ||
  division === 'Jonokuchi';

export const buildSekitoriNpcRecords = (
  world: SimulationWorld,
  makuuchiLayout: MakuuchiLayout,
): NpcBashoAggregate[] => {
  const toDivisionRecords = (division: TopDivision): NpcBashoAggregate[] => {
    const results = world.lastBashoResults[division] ?? [];
    if (!results.length) return [];

    return results
      .filter((result) => !result.isPlayer)
      .map((result) => {
        const rank = resolveTopDivisionRank(division, result.rankScore, makuuchiLayout);
        return {
          entityId: result.id,
          shikona: result.shikona,
          division,
          rankName: rank.name,
          rankNumber: rank.number,
          rankSide: rank.side,
          wins: result.wins,
          losses: result.losses,
          absent: Math.max(0, 15 - (result.wins + result.losses)),
          titles: [
            ...(result.yusho ? ['YUSHO'] : []),
            ...(result.specialPrizes ?? []),
          ],
        };
      });
  };

  return [...toDivisionRecords('Makuuchi'), ...toDivisionRecords('Juryo')];
};

export const buildSameDivisionLowerNpcRecords = (
  lowerWorld: LowerDivisionQuotaWorld,
  rank: Rank,
): NpcBashoAggregate[] => {
  if (!isLowerDivision(rank.division)) return [];

  const division = rank.division;
  const results = lowerWorld.lastResults[division] ?? [];
  if (!results.length) return [];

  const yushoId = resolveYushoResolution(
    results.map((result) => ({
      id: result.id,
      wins: result.wins,
      losses: result.losses,
      rankScore: result.rankScore,
    })),
    () => 0.5,
  ).winnerId;

  return results
    .filter((result) => !result.isPlayer)
    .map((result) => {
      const number = Math.floor((result.rankScore - 1) / 2) + 1;
      const side = result.rankScore % 2 === 1 ? 'East' : 'West';
      return {
        entityId: result.id,
        shikona: result.shikona,
        division,
        rankName: LOWER_DIVISION_NAME[division],
        rankNumber: number,
        rankSide: side,
        wins: result.wins,
        losses: result.losses,
        absent: Math.max(0, 7 - (result.wins + result.losses)),
        titles: result.id === yushoId ? ['YUSHO'] : [],
      };
    });
};

export const mergeNpcBashoRecords = (
  ...recordSets: NpcBashoAggregate[][]
): NpcBashoAggregate[] => {
  const dedup = new Map<string, NpcBashoAggregate>();
  for (const set of recordSets) {
    for (const record of set) {
      if (!dedup.has(record.entityId)) {
        dedup.set(record.entityId, record);
      }
    }
  }
  return [...dedup.values()];
};
