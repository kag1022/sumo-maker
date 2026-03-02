import { resolveLowerDivisionPlacements } from '../../../banzuke/providers/lowerBoundary';
import { resolvePlayerRankScore } from '../../lower/exchange';
import { PLAYER_ACTOR_ID } from '../../actors/constants';
import {
  BoundarySnapshot,
  LowerBoundaryExchange,
  LowerBoundaryId,
  LowerDivision,
  LowerDivisionQuotaWorld,
  LowerNpc,
  PlayerLowerRecord,
} from '../../lower/types';

export const mergePlayerRecord = (
  baseResults: BoundarySnapshot[],
  division: LowerDivision,
  playerRecord?: PlayerLowerRecord,
  slotsByDivision?: Partial<Record<LowerDivision, number>>,
): BoundarySnapshot[] => {
  if (!playerRecord || playerRecord.rank.division !== division) {
    return baseResults;
  }
  const wins = playerRecord.wins;
  const losses = playerRecord.losses;
  const playerSnapshot: BoundarySnapshot = {
    id: 'PLAYER',
    shikona: playerRecord.shikona,
    isPlayer: true,
    stableId: playerRecord.stableId ?? 'stable-001',
    rankScore: resolvePlayerRankScore(playerRecord.rank, slotsByDivision),
    wins,
    losses,
  };
  return baseResults.filter((result) => result.id !== 'PLAYER').concat(playerSnapshot);
};

const resolveDivisionOrderIndex = (division: LowerDivision): number =>
  division === 'Makushita'
    ? 0
    : division === 'Sandanme'
      ? 1
      : division === 'Jonidan'
        ? 2
        : 3;

export const deriveExchangesFromPlacements = (
  before: Record<LowerDivision, BoundarySnapshot[]>,
  placements: ReturnType<typeof resolveLowerDivisionPlacements>['placements'],
): Record<LowerBoundaryId, LowerBoundaryExchange> => {
  const beforeDivisionById = new Map<string, LowerDivision>();
  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    for (const row of before[division]) {
      beforeDivisionById.set(row.id, division);
    }
  }
  const afterDivisionById = new Map(placements.map((placement) => [placement.id, placement.division]));

  const resolveBoundary = (
    upper: LowerDivision,
    lower: LowerDivision,
  ): LowerBoundaryExchange => {
    const promotedToUpperIds: string[] = [];
    const demotedToLowerIds: string[] = [];
    for (const [id, beforeDivision] of beforeDivisionById.entries()) {
      const afterDivision = afterDivisionById.get(id);
      if (!afterDivision) continue;
      if (beforeDivision === lower && afterDivision === upper) promotedToUpperIds.push(id);
      if (beforeDivision === upper && afterDivision === lower) demotedToLowerIds.push(id);
    }
    const slots = Math.min(promotedToUpperIds.length, demotedToLowerIds.length);
    return {
      slots,
      promotedToUpperIds,
      demotedToLowerIds,
      playerPromotedToUpper: promotedToUpperIds.includes(PLAYER_ACTOR_ID),
      playerDemotedToLower: demotedToLowerIds.includes(PLAYER_ACTOR_ID),
      reason: 'NORMAL',
    };
  };

  return {
    MakushitaSandanme: resolveBoundary('Makushita', 'Sandanme'),
    SandanmeJonidan: resolveBoundary('Sandanme', 'Jonidan'),
    JonidanJonokuchi: resolveBoundary('Jonidan', 'Jonokuchi'),
  };
};

export const applyLowerDivisionPlacements = (
  world: LowerDivisionQuotaWorld,
  placements: ReturnType<typeof resolveLowerDivisionPlacements>['placements'],
): void => {
  if (!placements.length) return;
  const npcById = new Map(
    (['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const).flatMap((division) =>
      world.rosters[division].map((npc) => [npc.id, npc] as const)),
  );
  const nextRosters: Record<LowerDivision, LowerNpc[]> = {
    Makushita: [],
    Sandanme: [],
    Jonidan: [],
    Jonokuchi: [],
  };
  const assignedIds = new Set<string>();

  for (const placement of placements.slice().sort((a, b) => {
    const divisionCmp = resolveDivisionOrderIndex(a.division) - resolveDivisionOrderIndex(b.division);
    if (divisionCmp !== 0) return divisionCmp;
    if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
    return a.id.localeCompare(b.id);
  })) {
    if (placement.id === PLAYER_ACTOR_ID) continue;
    const npc = npcById.get(placement.id);
    if (!npc) continue;
    assignedIds.add(placement.id);
    nextRosters[placement.division].push({
      ...npc,
      division: placement.division,
      currentDivision: placement.division,
      rankScore: placement.rankScore,
    });
  }

  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    for (const npc of world.rosters[division]) {
      if (assignedIds.has(npc.id)) continue;
      nextRosters[division].push({
        ...npc,
        division,
        currentDivision: division,
      });
    }
  }

  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    world.rosters[division] = nextRosters[division]
      .slice()
      .sort((a, b) => {
        if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
        return a.id.localeCompare(b.id);
      })
      .map((npc, index) => ({
        ...npc,
        rankScore: index + 1,
        division,
        currentDivision: division,
      }));
    for (const npc of world.rosters[division]) {
      const persistent = world.npcRegistry.get(npc.id);
      if (!persistent) continue;
      persistent.division = division;
      persistent.currentDivision = division;
      persistent.rankScore = npc.rankScore;
      persistent.basePower = npc.basePower;
      persistent.ability = npc.ability ?? persistent.ability;
      persistent.uncertainty = npc.uncertainty ?? persistent.uncertainty;
      persistent.volatility = npc.volatility;
      persistent.form = npc.form;
      persistent.styleBias = npc.styleBias ?? persistent.styleBias;
      persistent.heightCm = npc.heightCm ?? persistent.heightCm;
      persistent.weightKg = npc.weightKg ?? persistent.weightKg;
    }
  }
};
