import { Rank, RikishiStatus } from '../models';
import { EnemyStyleBias } from '../catalog/enemyData';
import { BashoRecordHistorySnapshot, BanzukeAllocation } from '../banzuke/providers/sekitori/types';
import { RandomSource } from './deps';
import {
  DEFAULT_MAKUUCHI_LAYOUT,
  MakuuchiLayout,
  decodeMakuuchiRankFromScore as decodeMakuuchiRankByLayout,
  encodeMakuuchiRankToScore,
  resolveTopDivisionRankValueFromRank,
} from '../banzuke/scale/banzukeLayout';
import { evaluateSpecialPrizes, type SpecialPrizeCode } from './topDivision/specialPrizes';
import { normalizePlayerAssignedRank } from './topDivision/playerNormalization';
import {
  applyNpcBanzukeToRosters,
  buildTopDivisionRecords,
  resolvePlayerSanyakuQuota,
} from './topDivision/banzuke';
import { generateNextBanzuke } from '../banzuke/providers/topDivision';
import {
  createDailyMatchups,
  createFacedMap,
  simulateNpcBout,
  type DivisionParticipant,
} from './matchmaking';
import { resolveYushoResolution } from './yusho';
import { createInitialNpcUniverse } from './npc/factory';
import { pushNpcBashoResult } from './npc/retirement';
import {
  ActorRegistry,
  NpcNameContext,
  NpcRegistry,
  PersistentActor,
  PersistentNpc,
} from './npc/types';
import { resolveTopDivisionRank } from './topDivision/rank';
import { DEFAULT_TORIKUMI_BOUNDARY_BANDS } from './torikumi/policy';
import { scheduleTorikumiBasho } from './torikumi/scheduler';
import { TorikumiParticipant } from './torikumi/types';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from './modelVersion';
import { PLAYER_ACTOR_ID } from './actors/constants';
import { createPlayerActorFromStatus, syncPlayerActorFromStatus } from './actors/playerBridge';
import { generateUniqueNpcShikona, normalizeShikona } from './npc/npcShikonaGenerator';

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
  ability: number;
  uncertainty: number;
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
  expectedWins?: number;
  strengthOfSchedule?: number;
  performanceOverExpected?: number;
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
  actorRegistry: ActorRegistry;
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

const softClampPower = (value: number, range: { min: number; max: number }): number => {
  if (value < range.min) {
    return range.min - Math.log1p(range.min - value);
  }
  if (value > range.max) {
    return range.max + Math.log1p(value - range.max);
  }
  return value;
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

const toWorldRikishiFromActor = (
  actor: PersistentActor,
  division: TopDivision,
  rankScore: number,
): WorldRikishi => ({
  id: actor.id,
  shikona: actor.shikona,
  division,
  stableId: actor.stableId,
  basePower: actor.basePower,
  ability: actor.ability,
  uncertainty: actor.uncertainty,
  growthBias: actor.growthBias,
  rankScore,
  volatility: actor.volatility,
  form: actor.form,
  styleBias: actor.styleBias,
  heightCm: actor.heightCm,
  weightKg: actor.weightKg,
});

const parseActorNumericId = (id: string): number => {
  const match = id.match(/(\d+)$/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const compareActorIdAscending = (a: PersistentActor, b: PersistentActor): number => {
  const aNum = parseActorNumericId(a.id);
  const bNum = parseActorNumericId(b.id);
  if (aNum !== bNum) return aNum - bNum;
  return a.id.localeCompare(b.id);
};

const renameNpcCollidingWithPlayer = (
  world: SimulationWorld,
  playerShikona: string,
  rng: RandomSource,
): void => {
  const normalizedPlayer = normalizeShikona(playerShikona);
  const collidingActiveNpcs = [...world.npcRegistry.values()]
    .filter(
      (actor) =>
        actor.actorType === 'NPC' &&
        actor.active &&
        normalizeShikona(actor.shikona) === normalizedPlayer,
    )
    .sort(compareActorIdAscending);

  for (const npc of collidingActiveNpcs) {
    npc.shikona = generateUniqueNpcShikona(
      npc.stableId,
      npc.currentDivision,
      rng,
      world.npcNameContext,
      world.npcRegistry,
      npc.id,
    );
  }
};

const syncTopRosterNamesFromRegistry = (world: SimulationWorld): void => {
  for (const division of ['Makuuchi', 'Juryo'] as const) {
    world.rosters[division] = world.rosters[division].map((rikishi) => {
      const actor = world.npcRegistry.get(rikishi.id);
      if (!actor) return rikishi;
      return {
        ...rikishi,
        shikona: actor.shikona,
        stableId: actor.stableId,
      };
    });
  }
};

const syncLowerSeedsFromRegistry = (world: SimulationWorld): void => {
  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    world.lowerRosterSeeds[division] = world.lowerRosterSeeds[division].map((npc) => {
      const actor = world.npcRegistry.get(npc.id);
      if (!actor) return npc;
      return {
        ...npc,
        shikona: actor.shikona,
        stableId: actor.stableId,
      };
    });
  }

  world.maezumoPool = world.maezumoPool.map((npc) => {
    const actor = world.npcRegistry.get(npc.id);
    if (!actor) return npc;
    return {
      ...npc,
      shikona: actor.shikona,
      stableId: actor.stableId,
    };
  });
};

export const syncPlayerActorInWorld = (
  world: SimulationWorld,
  status: RikishiStatus,
  rng: RandomSource,
): void => {
  const current = world.actorRegistry.get(PLAYER_ACTOR_ID);
  const nextActor = current
    ? syncPlayerActorFromStatus(current, status)
    : createPlayerActorFromStatus(status);
  world.actorRegistry.set(PLAYER_ACTOR_ID, nextActor);
  world.npcRegistry = world.actorRegistry;
  renameNpcCollidingWithPlayer(world, status.shikona, rng);

  world.rosters.Makuuchi = world.rosters.Makuuchi.filter((rikishi) => rikishi.id !== PLAYER_ACTOR_ID);
  world.rosters.Juryo = world.rosters.Juryo.filter((rikishi) => rikishi.id !== PLAYER_ACTOR_ID);

  const topDivision = toTopDivision(status.rank);
  if (topDivision) {
    const rankScore = resolvePlayerRankScore(status.rank, world.makuuchiLayout);
    const nextRoster = world.rosters[topDivision]
      .slice()
      .sort((a, b) => a.rankScore - b.rankScore);
    if (nextRoster.length >= DIVISION_SIZE[topDivision]) {
      nextRoster.pop();
    }
    nextRoster.push(toWorldRikishiFromActor(nextActor, topDivision, rankScore));
    world.rosters[topDivision] = nextRoster
      .slice()
      .sort((a, b) => a.rankScore - b.rankScore)
      .slice(0, DIVISION_SIZE[topDivision]);
  }

  syncTopRosterNamesFromRegistry(world);
  syncLowerSeedsFromRegistry(world);
};

export const createSimulationWorld = (rng: RandomSource): SimulationWorld => {
  const universe = createInitialNpcUniverse(rng);
  if (!universe.registry.has(PLAYER_ACTOR_ID)) {
    universe.registry.set(PLAYER_ACTOR_ID, {
      actorId: PLAYER_ACTOR_ID,
      actorType: 'PLAYER',
      id: PLAYER_ACTOR_ID,
      seedId: 'PLAYER',
      shikona: 'PLAYER',
      stableId: 'player-heya',
      division: 'Maezumo',
      currentDivision: 'Maezumo',
      rankScore: 1,
      basePower: 60,
      ability: 60,
      uncertainty: 2,
      form: 1,
      volatility: 1.2,
      styleBias: 'BALANCE',
      heightCm: 180,
      weightKg: 130,
      growthBias: 0,
      retirementBias: 0,
      entryAge: 15,
      age: 15,
      careerBashoCount: 0,
      active: true,
      entrySeq: 0,
      recentBashoResults: [],
    });
  }
  const toWorldRikishi = (npc: PersistentActor): WorldRikishi => ({
    id: npc.id,
    shikona: npc.shikona,
    division: npc.currentDivision === 'Makuuchi' || npc.currentDivision === 'Juryo'
      ? npc.currentDivision
      : 'Juryo',
    stableId: npc.stableId,
    basePower: npc.basePower,
    ability: npc.ability,
    uncertainty: npc.uncertainty,
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
    actorRegistry: universe.registry,
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
    const seasonalAbility =
      (registryNpc?.ability ?? npc.ability ?? npc.basePower) +
      npc.form * 3.2 +
      randomNoise(rng, Math.max(0.8, npc.volatility * 0.45));
    const seasonalPower =
      npc.basePower * npc.form +
      randomNoise(rng, npc.volatility) +
      randomNoise(rng, 1.2);
    return {
      id: npc.id,
      shikona,
      isPlayer: (registryNpc?.actorType ?? (npc.id === PLAYER_ACTOR_ID ? 'PLAYER' : 'NPC')) === 'PLAYER',
      stableId,
      rankScore: npc.rankScore,
      power: softClampPower(seasonalPower, POWER_RANGE[division]),
      ability: seasonalAbility,
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      wins: 0,
      losses: 0,
      currentWinStreak: 0,
      currentLossStreak: 0,
      expectedWins: 0,
      opponentAbilityTotal: 0,
      boutsSimulated: 0,
      active,
    };
  });

  return participants;
};

const toTorikumiParticipant = (
  division: TopDivision,
  participant: DivisionParticipant,
  world: SimulationWorld,
): TorikumiParticipant => {
  const rank = resolveTopDivisionRank(division, participant.rankScore, world.makuuchiLayout);
  return {
    ...participant,
    division,
    rankName: rank.name,
    rankNumber: rank.number,
    targetBouts: 15,
    boutsDone: 0,
  };
};

const toDivisionParticipants = (
  participants: TorikumiParticipant[],
): DivisionParticipant[] =>
  participants.map((participant) => ({
    id: participant.id,
    shikona: participant.shikona,
    isPlayer: participant.isPlayer,
    stableId: participant.stableId,
    forbiddenOpponentIds: participant.forbiddenOpponentIds,
    rankScore: participant.rankScore,
    power: participant.power,
    ability: participant.ability,
    styleBias: participant.styleBias,
    heightCm: participant.heightCm,
    weightKg: participant.weightKg,
    wins: participant.wins,
    losses: participant.losses,
    currentWinStreak: participant.currentWinStreak,
    currentLossStreak: participant.currentLossStreak,
    expectedWins: participant.expectedWins,
    opponentAbilityTotal: participant.opponentAbilityTotal,
    boutsSimulated: participant.boutsSimulated,
    active: participant.active,
  }));

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
    const expectedWins = participant.expectedWins ?? 0;
    const sos =
      (participant.boutsSimulated ?? 0) > 0
        ? (participant.opponentAbilityTotal ?? 0) / (participant.boutsSimulated ?? 1)
        : 0;
    const performanceOverExpected = participant.wins - expectedWins;
    const yusho = participant.id === yushoWinnerId;
    const junYusho = !yusho && junYushoIds.has(participant.id);
    const specialPrizes = specialPrizesById.get(participant.id) ?? [];
    const historyRecord: BashoRecordHistorySnapshot = {
      rank,
      wins: participant.wins,
      losses: participant.losses,
      absent,
      expectedWins,
      strengthOfSchedule: sos,
      performanceOverExpected,
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
      expectedWins,
      strengthOfSchedule: sos,
      performanceOverExpected,
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
      const expectedWins = result.expectedWins ?? (result.wins + result.losses) / 2;
      const performanceOverExpected = result.wins - expectedWins;
      const ability = (npc.ability ?? npc.basePower) +
        performanceOverExpected * 1.05 +
        npc.growthBias * 0.85 +
        randomNoise(rng, 0.45);
      const basePower = softClampPower(
        npc.basePower + diff * 0.2 + performanceOverExpected * 0.3 + randomNoise(rng, 0.45),
        range,
      );
      const nextForm = clamp(
        npc.form * 0.6 + (1 + diff * 0.01 + randomNoise(rng, 0.06)) * 0.4,
        0.85,
        1.15,
      );
      const nextUncertainty = clamp((npc.uncertainty ?? 1.7) - 0.02, 0.55, 2.3);
      const nextRankScore = clamp(
        npc.rankScore - diff * 0.5 + randomNoise(rng, 0.3),
        1,
        200,
      );

      const registryNpc = world.npcRegistry.get(npc.id);
      if (registryNpc) {
        registryNpc.basePower = basePower;
        registryNpc.ability = ability;
        registryNpc.uncertainty = nextUncertainty;
        registryNpc.form = nextForm;
        registryNpc.rankScore = nextRankScore;
        registryNpc.division = division;
        registryNpc.currentDivision = division;
        pushNpcBashoResult(registryNpc, result.wins, result.losses);
      }

      return {
        ...npc,
        basePower,
        ability,
        uncertainty: nextUncertainty,
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

  const topDivisionRecords = buildTopDivisionRecords(world);
  const allocations: BanzukeAllocation[] = generateNextBanzuke(topDivisionRecords);
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
    playerPromotedToMakuuchi: promotedToMakuuchiIds.includes(PLAYER_ACTOR_ID),
    playerDemotedToJuryo: demotedToJuryoIds.includes(PLAYER_ACTOR_ID),
  };

  for (const allocation of allocations) {
    world.ozekiKadobanById.set(allocation.id, allocation.nextIsOzekiKadoban);
    world.ozekiReturnById.set(allocation.id, allocation.nextIsOzekiReturn);
  }

  const playerAllocation = allocations.find((allocation) => allocation.id === PLAYER_ACTOR_ID);
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
      registryNpc.ability = rikishi.ability;
      registryNpc.uncertainty = rikishi.uncertainty;
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
  const assigned = normalizedAssignedRank ?? world.lastPlayerAssignedRank;
  const assignPromote = Boolean(
    assigned && rank.division === 'Juryo' && assigned.division === 'Makuuchi',
  );
  const assignDemote = Boolean(
    assigned && rank.division === 'Makuuchi' && assigned.division === 'Juryo',
  );

  if (topDivision === 'Makuuchi') {
    return {
      canDemoteToJuryo: assignDemote || world.lastExchange.playerDemotedToJuryo,
      enforcedSanyaku: resolvedSanyakuQuota.enforcedSanyaku,
      assignedNextRank: normalizedAssignedRank,
      nextIsOzekiKadoban: world.lastPlayerAllocation?.nextIsOzekiKadoban,
      nextIsOzekiReturn: world.lastPlayerAllocation?.nextIsOzekiReturn,
    };
  }
  return {
    canPromoteToMakuuchi: assignPromote || world.lastExchange.playerPromotedToMakuuchi,
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
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): void => {
  const participants = createDivisionParticipants(world, division, rng);
  const facedMap = createFacedMap(participants);

  for (let day = 1; day <= 15; day += 1) {
    const dailyMatchups = createDailyMatchups(participants, facedMap, rng, day, 15);
    const pairs = dailyMatchups.pairs;
    for (const { a, b } of pairs) {
      simulateNpcBout(a, b, rng, simulationModelVersion);
    }
  }

  evolveDivisionAfterBasho(world, division, participants, rng);
};

export const simulateOffscreenSekitoriBasho = (
  world: SimulationWorld,
  rng: RandomSource,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): void => {
  const makuuchi = createDivisionParticipants(world, 'Makuuchi', rng).map((participant) =>
    toTorikumiParticipant('Makuuchi', participant, world),
  );
  const juryo = createDivisionParticipants(world, 'Juryo', rng).map((participant) =>
    toTorikumiParticipant('Juryo', participant, world),
  );
  const participants = makuuchi.concat(juryo);

  scheduleTorikumiBasho({
    participants,
    days: Array.from({ length: 15 }, (_, index) => index + 1),
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakuuchiJuryo'),
    facedMap: createFacedMap(participants),
    onPair: ({ a, b }) => {
      simulateNpcBout(a, b, rng, simulationModelVersion);
    },
  });

  evolveDivisionAfterBasho(
    world,
    'Makuuchi',
    toDivisionParticipants(participants.filter((participant) => participant.division === 'Makuuchi')),
    rng,
  );
  evolveDivisionAfterBasho(
    world,
    'Juryo',
    toDivisionParticipants(participants.filter((participant) => participant.division === 'Juryo')),
    rng,
  );
};

export const resolveTopDivisionFromRank = (rank: Rank): TopDivision | null =>
  toTopDivision(rank);

export const countActiveNpcInWorld = (world: SimulationWorld): number => {
  let count = 0;
  for (const npc of world.npcRegistry.values()) {
    if (npc.actorType === 'PLAYER') continue;
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
        ability: registryNpc.ability,
        uncertainty: registryNpc.uncertainty,
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
