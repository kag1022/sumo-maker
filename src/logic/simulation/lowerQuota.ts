import { Rank } from '../models';
import { RandomSource } from './deps';
import { ENEMY_BODY_METRIC_BASE } from '../catalog/enemyData';
import {
  clamp,
  computeNeighborHalfStepNudge,
  randomNoise,
} from './boundary/shared';
import { createFacedMap, DivisionParticipant, simulateNpcBout } from './matchmaking';
import { resolveBoundaryExchange, resolvePlayerRankScore } from './lower/exchange';
import { createInitialNpcUniverse } from './npc/factory';
import { pushNpcBashoResult } from './npc/retirement';
import { PersistentNpc } from './npc/types';
import {
  BoundarySnapshot,
  EMPTY_EXCHANGE,
  LOWER_BOUNDARIES,
  LowerBoundaryExchange,
  LowerBoundaryId,
  LowerDivision,
  LowerDivisionQuotaWorld,
  LowerNpc,
  PlayerLowerDivisionQuota,
  PlayerLowerRecord,
  DIVISION_SIZE,
  POWER_RANGE,
} from './lower/types';
import { SimulationWorld } from './world';
import { resolveLowerAssignedNextRank } from '../ranking/lowerCommittee';
import { DEFAULT_DIVISION_POLICIES, resolveDivisionPolicyMap, resolveTargetHeadcount } from '../banzuke/population/flow';
import {
  createLowerDivisionBoutDayMap,
  DEFAULT_TORIKUMI_BOUNDARY_BANDS,
  resolveLowerDivisionEligibility,
} from './torikumi/policy';
import { scheduleTorikumiBasho } from './torikumi/scheduler';
import { TorikumiParticipant } from './torikumi/types';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from './modelVersion';

export type {
  LowerBoundaryExchange,
  LowerDivisionQuotaWorld,
  PlayerLowerDivisionQuota,
};
export type LowerLeagueSnapshots = Record<LowerDivision, BoundarySnapshot[]>;

const toLowerNpc = (division: LowerDivision, npc: LowerNpc | PersistentNpc): LowerNpc => ({
  ...npc,
  division,
  currentDivision: division,
  styleBias: npc.styleBias ?? 'BALANCE',
  heightCm: npc.heightCm ?? ENEMY_BODY_METRIC_BASE[division].heightCm,
  weightKg: npc.weightKg ?? ENEMY_BODY_METRIC_BASE[division].weightKg,
  active: npc.active ?? true,
  recentBashoResults: npc.recentBashoResults ?? [],
});

const promoteMaezumoToJonokuchi = (
  world: LowerDivisionQuotaWorld,
  rng: RandomSource,
): void => {
  if (!world.maezumoPool.length) {
    world.lastMaezumoPromotions = [];
    return;
  }

  const jonokuchiSlots = Math.max(1, world.rosters.Jonokuchi.length || DIVISION_SIZE.Jonokuchi);
  const resolveRiseBandSlotRange = (riseBand: 1 | 2 | 3): [number, number] => {
    if (riseBand === 1) {
      return [
        clamp(Math.round(jonokuchiSlots * 0.13), 1, jonokuchiSlots),
        clamp(Math.round(jonokuchiSlots * 0.2), 1, jonokuchiSlots),
      ];
    }
    if (riseBand === 2) {
      return [
        clamp(Math.round(jonokuchiSlots * 0.3), 1, jonokuchiSlots),
        clamp(Math.round(jonokuchiSlots * 0.37), 1, jonokuchiSlots),
      ];
    }
    return [
      clamp(Math.round(jonokuchiSlots * 0.47), 1, jonokuchiSlots),
      clamp(Math.round(jonokuchiSlots * 0.5), 1, jonokuchiSlots),
    ];
  };

  const promotions = world.maezumoPool.map((npc) => {
    const baseAbility = Number.isFinite(npc.ability)
      ? (npc.ability as number)
      : npc.basePower * npc.form;
    const seasonal = baseAbility + randomNoise(rng, npc.volatility) + randomNoise(rng, 1.1);
    const winProbability = clamp(0.25 + (seasonal - 28) / 42, 0.12, 0.88);
    let wins = 0;
    for (let i = 0; i < 3; i += 1) {
      if (rng() < winProbability) wins += 1;
    }
    const riseBand: 1 | 2 | 3 = wins === 3 ? 1 : wins === 2 ? 2 : 3;
    const targetRange = resolveRiseBandSlotRange(riseBand);
    const targetRankScore = targetRange[0] + Math.floor(rng() * (targetRange[1] - targetRange[0] + 1));
    return {
      npc: {
        ...npc,
        division: 'Jonokuchi' as const,
        currentDivision: 'Jonokuchi' as const,
        rankScore: targetRankScore,
        riseBand,
      },
      riseBand,
    };
  });

  world.lastMaezumoPromotions = promotions.map((row) => ({
    id: row.npc.id,
    shikona: row.npc.shikona,
    riseBand: row.riseBand,
  }));
  world.maezumoPool = [];

  const merged = world.rosters.Jonokuchi
    .concat(promotions.map((row) => row.npc))
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
  const policy = resolveDivisionPolicyMap(DEFAULT_DIVISION_POLICIES);
  const target = resolveTargetHeadcount('Jonokuchi', merged.length, policy);
  const maxSlots = target.max;

  if (merged.length <= maxSlots) {
    world.rosters.Jonokuchi = merged;
    return;
  }

  world.rosters.Jonokuchi = merged.slice(0, maxSlots);
  const overflow = merged.slice(maxSlots);
  for (const npc of overflow) {
    const recycled = {
      ...npc,
      division: 'Maezumo' as const,
      currentDivision: 'Maezumo' as const,
      rankScore: 1,
      riseBand: 3 as const,
    };
    world.maezumoPool.push(recycled);
    const persistent = world.npcRegistry.get(recycled.id);
    if (persistent) {
      persistent.division = 'Maezumo';
      persistent.currentDivision = 'Maezumo';
      persistent.rankScore = 1;
      persistent.riseBand = 3;
    }
  }
};

export const createLowerDivisionQuotaWorld = (
  rng: RandomSource,
  sourceWorld?: SimulationWorld,
): LowerDivisionQuotaWorld => {
  const universe = createInitialNpcUniverse(rng);
  const seedRosters = sourceWorld?.lowerRosterSeeds ?? {
    Makushita: universe.rosters.Makushita,
    Sandanme: universe.rosters.Sandanme,
    Jonidan: universe.rosters.Jonidan,
    Jonokuchi: universe.rosters.Jonokuchi,
  };
  const npcRegistry = sourceWorld?.npcRegistry ?? universe.registry;
  const npcNameContext = sourceWorld?.npcNameContext ?? universe.nameContext;
  const nextNpcSerial = sourceWorld?.nextNpcSerial ?? universe.nextNpcSerial;
  const maezumoPool = sourceWorld?.maezumoPool ?? universe.maezumoPool;

  return {
    rosters: {
      Makushita: seedRosters.Makushita.map((npc) => toLowerNpc('Makushita', npc)),
      Sandanme: seedRosters.Sandanme.map((npc) => toLowerNpc('Sandanme', npc)),
      Jonidan: seedRosters.Jonidan.map((npc) => toLowerNpc('Jonidan', npc)),
      Jonokuchi: seedRosters.Jonokuchi.map((npc) => toLowerNpc('Jonokuchi', npc)),
    },
    maezumoPool: maezumoPool.map((npc) => ({
      ...npc,
      division: 'Maezumo',
      currentDivision: 'Maezumo',
      rankScore: 1,
      active: npc.active ?? true,
      recentBashoResults: npc.recentBashoResults ?? [],
    })),
    lastResults: {},
    lastExchanges: {
      MakushitaSandanme: { ...EMPTY_EXCHANGE },
      SandanmeJonidan: { ...EMPTY_EXCHANGE },
      JonidanJonokuchi: { ...EMPTY_EXCHANGE },
    },
    lastPlayerHalfStepNudge: {
      Makushita: 0,
      Sandanme: 0,
      Jonidan: 0,
      Jonokuchi: 0,
    },
    lastPlayerAssignedRank: undefined,
    npcRegistry,
    npcNameContext,
    nextNpcSerial,
    lastMaezumoPromotions: [],
  };
};

const createDivisionParticipants = (
  world: LowerDivisionQuotaWorld,
  division: LowerDivision,
  rng: RandomSource,
): DivisionParticipant[] => {
  const range = POWER_RANGE[division];
  return world.rosters[division]
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore)
    .filter((npc) => npc.active !== false)
    .map((npc) => {
      const registryNpc = world.npcRegistry.get(npc.id);
      const shikona = registryNpc?.shikona ?? npc.shikona;
      const stableId = registryNpc?.stableId ?? npc.stableId;
      const seasonalPower =
        npc.basePower * npc.form + randomNoise(rng, npc.volatility) + randomNoise(rng, 0.9);
      const seasonalAbility =
        (Number.isFinite(npc.ability) ? (npc.ability as number) : npc.basePower * npc.form) +
        randomNoise(rng, Math.max(0.8, npc.volatility * 0.45));
      return {
        id: npc.id,
        shikona,
        isPlayer: false,
        stableId,
        rankScore: npc.rankScore,
        power: clamp(seasonalPower, range.min, range.max),
        ability: seasonalAbility,
        styleBias: npc.styleBias,
        heightCm: npc.heightCm,
        weightKg: npc.weightKg,
        wins: 0,
        losses: 0,
        expectedWins: 0,
        opponentAbilityTotal: 0,
        boutsSimulated: 0,
        active: true,
      };
    });
};

const resolveLowerRankName = (division: LowerDivision): string => {
  if (division === 'Makushita') return '幕下';
  if (division === 'Sandanme') return '三段目';
  if (division === 'Jonidan') return '序二段';
  return '序ノ口';
};

const toTorikumiLowerParticipant = (
  division: LowerDivision,
  participant: DivisionParticipant,
): TorikumiParticipant => ({
  ...participant,
  division,
  rankName: resolveLowerRankName(division),
  rankNumber: Math.floor((participant.rankScore - 1) / 2) + 1,
  targetBouts: 7,
  boutsDone: 0,
});

const snapshotParticipants = (participants: DivisionParticipant[]): BoundarySnapshot[] =>
  participants.map((participant) => ({
    id: participant.id,
    shikona: participant.shikona,
    isPlayer: participant.isPlayer,
    stableId: participant.stableId,
    rankScore: participant.rankScore,
    wins: participant.wins,
    losses: participant.losses,
  }));

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
    expectedWins: participant.expectedWins,
    opponentAbilityTotal: participant.opponentAbilityTotal,
    boutsSimulated: participant.boutsSimulated,
    active: participant.active,
  }));

const evolveDivisionRoster = (
  world: LowerDivisionQuotaWorld,
  division: LowerDivision,
  participants: DivisionParticipant[],
  rng: RandomSource,
): void => {
  const byId = new Map(participants.filter((p) => !p.isPlayer).map((p) => [p.id, p]));
  const range = POWER_RANGE[division];

  world.rosters[division] = world.rosters[division]
    .map((npc) => {
      const result = byId.get(npc.id);
      if (!result) return npc;

      const diff = result.wins - result.losses;
      const expectedWins = Number.isFinite(result.expectedWins)
        ? (result.expectedWins as number)
        : (result.wins + result.losses) * 0.5;
      const performanceOverExpected = result.wins - expectedWins;
      const baseAbility = Number.isFinite(npc.ability)
        ? (npc.ability as number)
        : npc.basePower * npc.form;
      const updatedNpc = {
        ...npc,
        ability: baseAbility + performanceOverExpected * 1.0 + diff * 0.25 + randomNoise(rng, 0.5),
        uncertainty: clamp(
          (Number.isFinite(npc.uncertainty) ? (npc.uncertainty as number) : 2.1) * 0.975 +
          Math.min(0.14, Math.abs(performanceOverExpected) * 0.012),
          0.7,
          2.4,
        ),
        basePower: clamp(
          npc.basePower + diff * 0.24 + (npc.growthBias ?? 0) * 0.8 + randomNoise(rng, 0.35),
          range.min,
          range.max,
        ),
        form: clamp(
          npc.form * 0.67 + (1 + diff * 0.01 + randomNoise(rng, 0.045)) * 0.33,
          0.86,
          1.14,
        ),
        rankScore: clamp(npc.rankScore - diff * 0.55 + randomNoise(rng, 0.24), 1, 999),
      };

      const registryNpc = world.npcRegistry.get(npc.id);
      if (registryNpc) {
        registryNpc.ability = updatedNpc.ability;
        registryNpc.uncertainty = updatedNpc.uncertainty ?? registryNpc.uncertainty;
        registryNpc.basePower = updatedNpc.basePower;
        registryNpc.form = updatedNpc.form;
        registryNpc.rankScore = updatedNpc.rankScore;
        registryNpc.division = division;
        registryNpc.currentDivision = division;
        registryNpc.active = npc.active !== false;
        pushNpcBashoResult(registryNpc, result.wins, result.losses);
      }
      return updatedNpc;
    })
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
};

const simulateLowerLeagueBasho = (
  world: LowerDivisionQuotaWorld,
  rng: RandomSource,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): LowerLeagueSnapshots => {
  const divisions: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
  const participants = divisions.flatMap((division) =>
    createDivisionParticipants(world, division, rng).map((participant) =>
      toTorikumiLowerParticipant(division, participant),
    ),
  );
  const facedMap = createFacedMap(participants);
  const dayMap = createLowerDivisionBoutDayMap(participants, rng);

  scheduleTorikumiBasho({
    participants,
    days: Array.from({ length: 15 }, (_, index) => index + 1),
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) =>
      band.id === 'MakushitaSandanme' ||
      band.id === 'SandanmeJonidan' ||
      band.id === 'JonidanJonokuchi'),
    facedMap,
    dayEligibility: (participant, day) => resolveLowerDivisionEligibility(participant, day, dayMap),
    onPair: ({ a, b }) => {
      simulateNpcBout(a, b, rng, simulationModelVersion);
    },
  });

  const snapshotsByDivision = {
    Makushita: snapshotParticipants(
      toDivisionParticipants(
        participants.filter((participant) => participant.division === 'Makushita'),
      ),
    ),
    Sandanme: snapshotParticipants(
      toDivisionParticipants(
        participants.filter((participant) => participant.division === 'Sandanme'),
      ),
    ),
    Jonidan: snapshotParticipants(
      toDivisionParticipants(
        participants.filter((participant) => participant.division === 'Jonidan'),
      ),
    ),
    Jonokuchi: snapshotParticipants(
      toDivisionParticipants(
        participants.filter((participant) => participant.division === 'Jonokuchi'),
      ),
    ),
  } satisfies LowerLeagueSnapshots;

  for (const division of divisions) {
    world.lastResults[division] = snapshotsByDivision[division];
    evolveDivisionRoster(
      world,
      division,
      toDivisionParticipants(
        participants.filter((participant) => participant.division === division),
      ),
      rng,
    );
  }

  return snapshotsByDivision;
};

const buildDivisionParticipantsFromSnapshot = (
  world: LowerDivisionQuotaWorld,
  division: LowerDivision,
  snapshots: BoundarySnapshot[],
): DivisionParticipant[] => {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const participants: DivisionParticipant[] = world.rosters[division].map((npc) => {
    const snapshot = byId.get(npc.id);
    return {
      id: npc.id,
      shikona: npc.shikona,
      isPlayer: false,
      stableId: npc.stableId,
      rankScore: npc.rankScore,
      power: npc.basePower * npc.form,
      ability: Number.isFinite(npc.ability) ? npc.ability : npc.basePower * npc.form,
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      wins: snapshot?.wins ?? 0,
      losses: snapshot?.losses ?? 0,
      active: npc.active !== false,
    };
  });

  const playerSnapshot = snapshots.find((snapshot) => snapshot.id === 'PLAYER');
  if (playerSnapshot) {
    participants.push({
      id: playerSnapshot.id,
      shikona: playerSnapshot.shikona,
      isPlayer: true,
      stableId: playerSnapshot.stableId,
      rankScore: playerSnapshot.rankScore,
      power: 0,
      ability: 0,
      styleBias: 'BALANCE',
      heightCm: 180,
      weightKg: 130,
      wins: playerSnapshot.wins,
      losses: playerSnapshot.losses,
      active: true,
    });
  }

  return participants;
};

const evolveLowerLeagueFromSnapshots = (
  world: LowerDivisionQuotaWorld,
  snapshotsByDivision: LowerLeagueSnapshots,
  rng: RandomSource,
): void => {
  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    const snapshots = snapshotsByDivision[division] ?? [];
    world.lastResults[division] = snapshots;
    evolveDivisionRoster(
      world,
      division,
      buildDivisionParticipantsFromSnapshot(world, division, snapshots),
      rng,
    );
  }
};

const mergePlayerRecord = (
  baseResults: BoundarySnapshot[],
  division: LowerDivision,
  playerRecord?: PlayerLowerRecord,
  slotsByDivision?: Partial<Record<LowerDivision, number>>,
): BoundarySnapshot[] => {
  if (!playerRecord || playerRecord.rank.division !== division) {
    return baseResults;
  }
  const wins = playerRecord.wins;
  const losses = playerRecord.losses + playerRecord.absent;
  const playerSnapshot: BoundarySnapshot = {
    id: 'PLAYER',
    shikona: playerRecord.shikona,
    isPlayer: true,
    stableId: 'player-heya',
    rankScore: resolvePlayerRankScore(playerRecord.rank, slotsByDivision),
    wins,
    losses,
  };
  return baseResults.filter((result) => result.id !== 'PLAYER').concat(playerSnapshot);
};

export const runLowerDivisionQuotaStep = (
  world: LowerDivisionQuotaWorld,
  rng: RandomSource,
  playerRecord?: PlayerLowerRecord,
  precomputedLeagueResults?: LowerLeagueSnapshots,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): Record<LowerBoundaryId, LowerBoundaryExchange> => {
  promoteMaezumoToJonokuchi(world, rng);
  const lowerLeagueRaw =
    precomputedLeagueResults ??
    simulateLowerLeagueBasho(world, rng, simulationModelVersion);
  if (precomputedLeagueResults) {
    evolveLowerLeagueFromSnapshots(world, lowerLeagueRaw, rng);
  }
  const slotsByDivision: Record<LowerDivision, number> = {
    Makushita: world.rosters.Makushita.length,
    Sandanme: world.rosters.Sandanme.length,
    Jonidan: world.rosters.Jonidan.length,
    Jonokuchi: world.rosters.Jonokuchi.length,
  };

  const results: Record<LowerDivision, BoundarySnapshot[]> = {
    Makushita: mergePlayerRecord(lowerLeagueRaw.Makushita, 'Makushita', playerRecord, slotsByDivision),
    Sandanme: mergePlayerRecord(lowerLeagueRaw.Sandanme, 'Sandanme', playerRecord, slotsByDivision),
    Jonidan: mergePlayerRecord(lowerLeagueRaw.Jonidan, 'Jonidan', playerRecord, slotsByDivision),
    Jonokuchi: mergePlayerRecord(lowerLeagueRaw.Jonokuchi, 'Jonokuchi', playerRecord, slotsByDivision),
  };
  world.lastPlayerHalfStepNudge = {
    Makushita: computeNeighborHalfStepNudge(results.Makushita),
    Sandanme: computeNeighborHalfStepNudge(results.Sandanme),
    Jonidan: computeNeighborHalfStepNudge(results.Jonidan),
    Jonokuchi: computeNeighborHalfStepNudge(results.Jonokuchi),
  };

  world.lastResults = results;
  for (const spec of LOWER_BOUNDARIES) {
    world.lastExchanges[spec.id] = resolveBoundaryExchange(
      spec,
      results[spec.upper],
      results[spec.lower],
    );
  }
  world.lastPlayerAssignedRank = resolveLowerAssignedNextRank(
    results,
    world.lastExchanges,
    playerRecord,
  );

  return world.lastExchanges;
};

export const resolveLowerDivisionQuotaForPlayer = (
  world: LowerDivisionQuotaWorld,
  rank: Rank,
): PlayerLowerDivisionQuota | undefined => {
  if (rank.division === 'Makushita') {
    return {
      canDemoteToSandanme: world.lastExchanges.MakushitaSandanme.playerDemotedToLower,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Makushita,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  if (rank.division === 'Sandanme') {
    return {
      canPromoteToMakushita: world.lastExchanges.MakushitaSandanme.playerPromotedToUpper,
      canDemoteToJonidan: world.lastExchanges.SandanmeJonidan.playerDemotedToLower,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Sandanme,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  if (rank.division === 'Jonidan') {
    return {
      canPromoteToSandanme: world.lastExchanges.SandanmeJonidan.playerPromotedToUpper,
      canDemoteToJonokuchi: world.lastExchanges.JonidanJonokuchi.playerDemotedToLower,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Jonidan,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  if (rank.division === 'Jonokuchi') {
    return {
      canPromoteToJonidan: world.lastExchanges.JonidanJonokuchi.playerPromotedToUpper,
      enemyHalfStepNudge: world.lastPlayerHalfStepNudge.Jonokuchi,
      assignedNextRank: world.lastPlayerAssignedRank,
    };
  }
  return undefined;
};

export const pruneRetiredLowerRosters = (world: LowerDivisionQuotaWorld): void => {
  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    world.rosters[division] = world.rosters[division]
      .sort((a, b) => a.rankScore - b.rankScore)
      .map((npc, index) => {
        const persistent = world.npcRegistry.get(npc.id);
        if (!persistent) {
          return { ...npc, rankScore: index + 1, division, currentDivision: division };
        }
        return {
          ...npc,
          shikona: persistent.shikona,
          stableId: persistent.stableId,
          basePower: persistent.basePower,
          ability: persistent.ability,
          uncertainty: persistent.uncertainty,
          volatility: persistent.volatility,
          form: persistent.form,
          styleBias: persistent.styleBias,
          heightCm: persistent.heightCm,
          weightKg: persistent.weightKg,
          growthBias: persistent.growthBias,
          retirementBias: persistent.retirementBias,
          active: persistent.active,
          rankScore: index + 1,
          division,
          currentDivision: division,
        };
      });
  }

  world.maezumoPool = world.maezumoPool
    .filter((npc) => world.npcRegistry.get(npc.id)?.active !== false)
    .map((npc) => ({
      ...npc,
      division: 'Maezumo',
      currentDivision: 'Maezumo',
      rankScore: 1,
    }));
};
