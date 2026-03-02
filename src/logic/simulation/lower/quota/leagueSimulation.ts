import { RandomSource } from '../../deps';
import { clamp, randomNoise } from '../../boundary/shared';
import { createFacedMap, DivisionParticipant, simulateNpcBout } from '../../matchmaking';
import {
  BoundarySnapshot,
  LowerDivision,
  LowerDivisionQuotaWorld,
  POWER_RANGE,
} from '../../lower/types';
import { PLAYER_ACTOR_ID } from '../../actors/constants';
import {
  createLowerDivisionBoutDayMap,
  DEFAULT_TORIKUMI_BOUNDARY_BANDS,
  resolveLowerDivisionEligibility,
} from '../../torikumi/policy';
import { scheduleTorikumiBasho } from '../../torikumi/scheduler';
import { TorikumiParticipant } from '../../torikumi/types';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from '../../modelVersion';
import { evolveDivisionRoster } from './rosterEvolution';

export type LowerLeagueSnapshots = Record<LowerDivision, BoundarySnapshot[]>;

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
      const isPlayer = npc.id === PLAYER_ACTOR_ID;
      return {
        id: npc.id,
        shikona,
        isPlayer,
        stableId,
        rankScore: npc.rankScore,
        power: clamp(seasonalPower, range.min, range.max),
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
        active: true,
      };
    });
};

export const resolveLowerRankName = (division: LowerDivision): string => {
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
    currentWinStreak: participant.currentWinStreak,
    currentLossStreak: participant.currentLossStreak,
    expectedWins: participant.expectedWins,
    opponentAbilityTotal: participant.opponentAbilityTotal,
    boutsSimulated: participant.boutsSimulated,
    active: participant.active,
  }));

export const simulateLowerLeagueBasho = (
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
