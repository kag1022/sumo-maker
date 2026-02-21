import { Rank } from '../models';
import { EnemyStyleBias } from '../catalog/enemyData';
import {
  BashoRecordHistorySnapshot,
  BanzukeAllocation,
  generateNextBanzuke,
} from '../ranking';
import { RandomSource } from './deps';
import {
  DEFAULT_MAKUUCHI_LAYOUT,
  MakuuchiLayout,
  decodeMakuuchiRankFromScore as decodeMakuuchiRankByLayout,
  encodeMakuuchiRankToScore,
  resolveTopDivisionRankValueFromRank,
} from '../ranking/banzukeLayout';
import { evaluateSpecialPrizes, type SpecialPrizeCode } from './topDivision/specialPrizes';
import { normalizePlayerAssignedRank } from './topDivision/playerNormalization';
import {
  applyNpcBanzukeToRosters,
  buildTopDivisionRecords,
  resolvePlayerSanyakuQuota,
} from './topDivision/banzuke';
import {
  createDailyMatchups,
  createFacedMap,
  simulateNpcBout,
  type DivisionParticipant,
} from './matchmaking';
import { resolveYushoResolution } from './yusho';
import { createInitialNpcUniverse } from './npc/factory';
import { pushNpcBashoResult } from './npc/retirement';
import { NpcNameContext, NpcRegistry, PersistentNpc } from './npc/types';

export type TopDivision = 'Makuuchi' | 'Juryo';
type LowerDivision = 'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi';
export type { SpecialPrizeCode } from './topDivision/specialPrizes';
export type { DailyMatchups, DivisionParticipant } from './matchmaking';

type WorldRikishi = {
  id: string;
  shikona: string;
  division: TopDivision;
  stableId: string;
  basePower: number;
  growthBias: number;
  rankScore: number;
  volatility: number;
  form: number;
  styleBias: EnemyStyleBias;
  heightCm: number;
  weightKg: number;
};

type DivisionBashoSnapshot = {
  id: string;
  shikona: string;
  isPlayer: boolean;
  stableId: string;
  rankScore: number;
  rank?: Rank;
  wins: number;
  losses: number;
  absent?: number;
  yusho?: boolean;
  junYusho?: boolean;
  specialPrizes?: SpecialPrizeCode[];
};

export type TopDivisionExchange = {
  slots: number;
  promotedToMakuuchiIds: string[];
  demotedToJuryoIds: string[];
  playerPromotedToMakuuchi: boolean;
  playerDemotedToJuryo: boolean;
};

export type PlayerSanyakuQuota = {
  enforcedSanyaku?: 'Sekiwake' | 'Komusubi';
};

export interface SimulationWorld {
  rosters: Record<TopDivision, WorldRikishi[]>;
  lowerRosterSeeds: Record<LowerDivision, PersistentNpc[]>;
  maezumoPool: PersistentNpc[];
  npcRegistry: NpcRegistry;
  npcNameContext: NpcNameContext;
  nextNpcSerial: number;
  lastBashoResults: Partial<Record<TopDivision, DivisionBashoSnapshot[]>>;
  recentSekitoriHistory: Map<string, BashoRecordHistorySnapshot[]>;
  ozekiKadobanById: Map<string, boolean>;
  ozekiReturnById: Map<string, boolean>;
  lastAllocations: BanzukeAllocation[];
  lastExchange: TopDivisionExchange;
  lastSanyakuQuota: PlayerSanyakuQuota;
  lastPlayerAssignedRank?: Rank;
  lastPlayerAllocation?: BanzukeAllocation;
  makuuchiLayout: MakuuchiLayout;
}

const DIVISION_SIZE: Record<TopDivision, number> = {
  Makuuchi: 42,
  Juryo: 28,
};

const POWER_RANGE: Record<TopDivision, { min: number; max: number }> = {
  Makuuchi: { min: 95, max: 165 },
  Juryo: { min: 80, max: 125 },
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const randomNoise = (rng: RandomSource, amplitude: number): number =>
  (rng() * 2 - 1) * amplitude;

const EMPTY_EXCHANGE: TopDivisionExchange = {
  slots: 0,
  promotedToMakuuchiIds: [],
  demotedToJuryoIds: [],
  playerPromotedToMakuuchi: false,
  playerDemotedToJuryo: false,
};

const toTopDivision = (rank: Rank): TopDivision | null => {
  if (rank.division === 'Makuuchi') return 'Makuuchi';
  if (rank.division === 'Juryo') return 'Juryo';
  return null;
};

export const resolvePlayerRankScore = (
  rank: Rank,
  makuuchiLayout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): number => {
  if (rank.division === 'Makuuchi') {
    return clamp(encodeMakuuchiRankToScore(rank, makuuchiLayout), 1, DIVISION_SIZE.Makuuchi);
  }
  if (rank.division === 'Juryo') {
    const sideOffset = rank.side === 'West' ? 1 : 0;
    const num = clamp(rank.number || 1, 1, 14);
    return clamp(1 + (num - 1) * 2 + sideOffset, 1, DIVISION_SIZE.Juryo);
  }
  return 20;
};

export const createSimulationWorld = (rng: RandomSource): SimulationWorld => {
  const universe = createInitialNpcUniverse(rng);
  const toWorldRikishi = (npc: PersistentNpc): WorldRikishi => ({
    id: npc.id,
    shikona: npc.shikona,
    division: npc.currentDivision === 'Makuuchi' || npc.currentDivision === 'Juryo'
      ? npc.currentDivision
      : 'Juryo',
    stableId: npc.stableId,
    basePower: npc.basePower,
    growthBias: npc.growthBias,
    rankScore: npc.rankScore,
    volatility: npc.volatility,
    form: npc.form,
    styleBias: npc.styleBias,
    heightCm: npc.heightCm,
    weightKg: npc.weightKg,
  });

  return {
    rosters: {
      Makuuchi: universe.rosters.Makuuchi.map(toWorldRikishi),
      Juryo: universe.rosters.Juryo.map(toWorldRikishi),
    },
    lowerRosterSeeds: {
      Makushita: universe.rosters.Makushita,
      Sandanme: universe.rosters.Sandanme,
      Jonidan: universe.rosters.Jonidan,
      Jonokuchi: universe.rosters.Jonokuchi,
    },
    maezumoPool: universe.maezumoPool,
    npcRegistry: universe.registry,
    npcNameContext: universe.nameContext,
    nextNpcSerial: universe.nextNpcSerial,
    lastBashoResults: {},
    recentSekitoriHistory: new Map<string, BashoRecordHistorySnapshot[]>(),
    ozekiKadobanById: new Map<string, boolean>(),
    ozekiReturnById: new Map<string, boolean>(),
    lastAllocations: [],
    lastExchange: { ...EMPTY_EXCHANGE },
    lastSanyakuQuota: {},
    lastPlayerAssignedRank: undefined,
    lastPlayerAllocation: undefined,
    makuuchiLayout: { ...DEFAULT_MAKUUCHI_LAYOUT },
  };
};

export const createDivisionParticipants = (
  world: SimulationWorld,
  division: TopDivision,
  rng: RandomSource,
  player?: { shikona: string; rankScore: number },
): DivisionParticipant[] => {
  const roster = world.rosters[division]
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore)
    .slice(0, DIVISION_SIZE[division]);

  const participants: DivisionParticipant[] = roster.map((npc) => {
    const registryNpc = world.npcRegistry.get(npc.id);
    const shikona = registryNpc?.shikona ?? npc.shikona;
    const stableId = registryNpc?.stableId ?? npc.stableId;
    const active = registryNpc?.active !== false;
    const seasonalPower =
      npc.basePower * npc.form +
      randomNoise(rng, npc.volatility) +
      randomNoise(rng, 1.2);
    return {
      id: npc.id,
      shikona,
      isPlayer: false,
      stableId,
      rankScore: npc.rankScore,
      power: clamp(seasonalPower, POWER_RANGE[division].min, POWER_RANGE[division].max),
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      wins: 0,
      losses: 0,
      active,
    };
  });

  if (!player) return participants;

  const replaceIndex = participants.length - 1;
  participants.splice(replaceIndex, 1);
  participants.push({
    id: 'PLAYER',
    shikona: player.shikona,
    isPlayer: true,
    stableId: 'player-heya',
    rankScore: player.rankScore,
    power: 0,
    wins: 0,
    losses: 0,
    active: true,
  });

  return participants;
};

const decodeMakuuchiRankFromScore = (
  rankScore: number,
  layout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): Rank => decodeMakuuchiRankByLayout(rankScore, layout);

const decodeJuryoRankFromScore = (rankScore: number): Rank => {
  const bounded = clamp(rankScore, 1, DIVISION_SIZE.Juryo);
  return {
    division: 'Juryo',
    name: '十両',
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

export const evolveDivisionAfterBasho = (
  world: SimulationWorld,
  division: TopDivision,
  participants: DivisionParticipant[],
  rng: RandomSource,
): void => {
  const yushoResolution = resolveYushoResolution(
    participants.map((participant) => ({
      id: participant.id,
      wins: participant.wins,
      losses: participant.losses,
      rankScore: participant.rankScore,
      power: participant.power,
    })),
    rng,
  );
  const yushoWinnerId = yushoResolution.winnerId;
  const junYushoIds = yushoResolution.junYushoIds;
  const specialPrizesById =
    division === 'Makuuchi'
      ? evaluateSpecialPrizes(participants, yushoWinnerId, rng, {
          makuuchiLayout: world.makuuchiLayout,
          techniqueSources: world.rosters.Makuuchi,
        })
      : new Map<string, SpecialPrizeCode[]>();

  world.lastBashoResults[division] = participants.map((participant) => {
    const rank =
      division === 'Makuuchi'
        ? decodeMakuuchiRankFromScore(participant.rankScore, world.makuuchiLayout)
        : decodeJuryoRankFromScore(participant.rankScore);
    const absent = Math.max(0, 15 - (participant.wins + participant.losses));
    const yusho = participant.id === yushoWinnerId;
    const junYusho = !yusho && junYushoIds.has(participant.id);
    const specialPrizes = specialPrizesById.get(participant.id) ?? [];
    const historyRecord: BashoRecordHistorySnapshot = {
      rank,
      wins: participant.wins,
      losses: participant.losses,
      absent,
      yusho,
      junYusho,
      specialPrizes,
    };
    const history = world.recentSekitoriHistory.get(participant.id) ?? [];
    world.recentSekitoriHistory.set(participant.id, [historyRecord, ...history].slice(0, 6));

    return {
      id: participant.id,
      shikona: participant.shikona,
      isPlayer: participant.isPlayer,
      stableId: participant.stableId,
      rankScore: participant.rankScore,
      rank,
      wins: participant.wins,
      losses: participant.losses,
      absent,
      yusho,
      junYusho,
      specialPrizes,
    };
  });

  const byId = new Map(participants.filter((p) => !p.isPlayer).map((p) => [p.id, p]));
  const range = POWER_RANGE[division];

  world.rosters[division] = world.rosters[division]
    .map((npc) => {
      const result = byId.get(npc.id);
      if (!result) return npc;

      const diff = result.wins - result.losses;
      const basePower = clamp(
        npc.basePower + diff * 0.35 + npc.growthBias * 0.9 + randomNoise(rng, 0.5),
        range.min,
        range.max,
      );
      const nextForm = clamp(
        npc.form * 0.6 + (1 + diff * 0.01 + randomNoise(rng, 0.06)) * 0.4,
        0.85,
        1.15,
      );
      const nextRankScore = clamp(
        npc.rankScore - diff * 0.5 + randomNoise(rng, 0.3),
        1,
        200,
      );

      const registryNpc = world.npcRegistry.get(npc.id);
      if (registryNpc) {
        registryNpc.basePower = basePower;
        registryNpc.form = nextForm;
        registryNpc.rankScore = nextRankScore;
        registryNpc.division = division;
        registryNpc.currentDivision = division;
        pushNpcBashoResult(registryNpc, result.wins, result.losses);
      }

      return {
        ...npc,
        basePower,
        form: nextForm,
        rankScore: nextRankScore,
      };
    })
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
};

export const advanceTopDivisionBanzuke = (world: SimulationWorld): void => {
  const makuuchiResults = world.lastBashoResults.Makuuchi ?? [];
  const juryoResults = world.lastBashoResults.Juryo ?? [];
  world.lastAllocations = [];
  world.lastPlayerAssignedRank = undefined;
  world.lastPlayerAllocation = undefined;
  world.lastSanyakuQuota = {};
  if (!makuuchiResults.length || !juryoResults.length) {
    world.lastExchange = { ...EMPTY_EXCHANGE };
    return;
  }

  const allocations = generateNextBanzuke(buildTopDivisionRecords(world));
  world.lastAllocations = allocations;

  const promotedToMakuuchiIds = allocations
    .filter(
      (allocation) =>
        allocation.currentRank.division === 'Juryo' && allocation.nextRank.division === 'Makuuchi',
    )
    .map((allocation) => allocation.id);
  const demotedToJuryoIds = allocations
    .filter(
      (allocation) =>
        allocation.currentRank.division === 'Makuuchi' && allocation.nextRank.division === 'Juryo',
    )
    .map((allocation) => allocation.id);

  world.lastExchange = {
    slots: Math.min(promotedToMakuuchiIds.length, demotedToJuryoIds.length),
    promotedToMakuuchiIds,
    demotedToJuryoIds,
    playerPromotedToMakuuchi: promotedToMakuuchiIds.includes('PLAYER'),
    playerDemotedToJuryo: demotedToJuryoIds.includes('PLAYER'),
  };

  for (const allocation of allocations) {
    world.ozekiKadobanById.set(allocation.id, allocation.nextIsOzekiKadoban);
    world.ozekiReturnById.set(allocation.id, allocation.nextIsOzekiReturn);
  }

  const playerAllocation = allocations.find((allocation) => allocation.id === 'PLAYER');
  world.lastPlayerAllocation = playerAllocation;
  world.lastPlayerAssignedRank = playerAllocation?.nextRank;
  world.lastSanyakuQuota = resolvePlayerSanyakuQuota(world.lastPlayerAssignedRank);
  applyNpcBanzukeToRosters(world, allocations, (rank, layout) =>
    resolvePlayerRankScore(rank, layout),
  );

  for (const division of ['Makuuchi', 'Juryo'] as const) {
    for (const rikishi of world.rosters[division]) {
      const registryNpc = world.npcRegistry.get(rikishi.id);
      if (!registryNpc) continue;
      registryNpc.division = division;
      registryNpc.currentDivision = division;
      registryNpc.rankScore = rikishi.rankScore;
      registryNpc.basePower = rikishi.basePower;
      registryNpc.growthBias = rikishi.growthBias;
      registryNpc.form = rikishi.form;
      registryNpc.volatility = rikishi.volatility;
      registryNpc.styleBias = rikishi.styleBias;
      registryNpc.heightCm = rikishi.heightCm;
      registryNpc.weightKg = rikishi.weightKg;
      rikishi.shikona = registryNpc.shikona;
    }
  }
};

export type PlayerTopDivisionQuota = {
  canPromoteToMakuuchi?: boolean;
  canDemoteToJuryo?: boolean;
  enforcedSanyaku?: 'Sekiwake' | 'Komusubi';
  assignedNextRank?: Rank;
  nextIsOzekiKadoban?: boolean;
  nextIsOzekiReturn?: boolean;
};

export const resolveTopDivisionQuotaForPlayer = (
  world: SimulationWorld,
  rank: Rank,
): PlayerTopDivisionQuota | undefined => {
  const topDivision = resolveTopDivisionFromRank(rank);
  if (!topDivision) return undefined;
  const normalizedAssignedRank =
    world.lastPlayerAssignedRank && world.lastPlayerAssignedRank.division === 'Makuuchi'
      ? normalizePlayerAssignedRank(world, rank, world.lastPlayerAssignedRank)
      : undefined;
  const resolvedSanyakuQuota = resolvePlayerSanyakuQuota(
    normalizedAssignedRank ?? world.lastPlayerAssignedRank,
  );

  if (topDivision === 'Makuuchi') {
    return {
      canDemoteToJuryo: world.lastExchange.playerDemotedToJuryo,
      enforcedSanyaku: resolvedSanyakuQuota.enforcedSanyaku,
      assignedNextRank: normalizedAssignedRank,
      nextIsOzekiKadoban: world.lastPlayerAllocation?.nextIsOzekiKadoban,
      nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
    };
  }
  return {
    canPromoteToMakuuchi: world.lastExchange.playerPromotedToMakuuchi,
    assignedNextRank: normalizedAssignedRank,
    nextIsOzekiKadoban: world.lastPlayerAllocation?.nextIsOzekiKadoban,
    nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
  };
};

export const resolveTopDivisionRankValue = (
  division: TopDivision,
  rankScore: number,
  makuuchiLayout: MakuuchiLayout = DEFAULT_MAKUUCHI_LAYOUT,
): number => {
  if (division === 'Juryo') return 6;
  const rank = decodeMakuuchiRankFromScore(rankScore, makuuchiLayout);
  return resolveTopDivisionRankValueFromRank(rank);
};

export const simulateOffscreenTopDivisionBasho = (
  world: SimulationWorld,
  division: TopDivision,
  rng: RandomSource,
): void => {
  const participants = createDivisionParticipants(world, division, rng);
  const facedMap = createFacedMap(participants);

  for (let day = 1; day <= 15; day += 1) {
    const dailyMatchups = createDailyMatchups(participants, facedMap, rng, day, 15);
    const pairs = dailyMatchups.pairs;
    for (const { a, b } of pairs) {
      simulateNpcBout(a, b, rng);
    }
  }

  evolveDivisionAfterBasho(world, division, participants, rng);
};

export const resolveTopDivisionFromRank = (rank: Rank): TopDivision | null =>
  toTopDivision(rank);

export const countActiveNpcInWorld = (world: SimulationWorld): number => {
  let count = 0;
  for (const npc of world.npcRegistry.values()) {
    if (npc.active) count += 1;
  }
  return count;
};

export const pruneRetiredTopDivisionRosters = (world: SimulationWorld): void => {
  for (const division of ['Makuuchi', 'Juryo'] as const) {
    world.rosters[division] = world.rosters[division].map((rikishi) => {
      const registryNpc = world.npcRegistry.get(rikishi.id);
      if (!registryNpc) return rikishi;
      return {
        ...rikishi,
        shikona: registryNpc.shikona,
        stableId: registryNpc.stableId,
          basePower: registryNpc.basePower,
          growthBias: registryNpc.growthBias,
          form: registryNpc.form,
          volatility: registryNpc.volatility,
          styleBias: registryNpc.styleBias,
          heightCm: registryNpc.heightCm,
          weightKg: registryNpc.weightKg,
        };
      });
  }
};
