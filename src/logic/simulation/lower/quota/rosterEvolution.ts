import { RandomSource } from '../../deps';
import { clamp, randomNoise } from '../../boundary/shared';
import { DivisionParticipant } from '../../matchmaking';
import { DEFAULT_SIMULATION_MODEL_VERSION, SimulationModelVersion } from '../../modelVersion';
import { pushNpcBashoResult } from '../../npc/retirement';
import {
  BoundarySnapshot,
  LowerDivision,
  LowerDivisionQuotaWorld,
  POWER_RANGE,
} from '../../lower/types';
import { PLAYER_ACTOR_ID } from '../../actors/constants';
import { LowerLeagueSnapshots } from './leagueSimulation';

export const evolveDivisionRoster = (
  world: LowerDivisionQuotaWorld,
  division: LowerDivision,
  participants: DivisionParticipant[],
  rng: RandomSource,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
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
        ability:
          baseAbility +
          performanceOverExpected * 1.0 +
          diff * 0.25 +
          (simulationModelVersion === 'unified-v3-variance' ? (result.bashoFormDelta ?? 0) * 0.45 : 0) +
          randomNoise(rng, 0.5),
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
          npc.form * 0.67 +
          (
            1 +
            diff * 0.01 +
            (simulationModelVersion === 'unified-v3-variance' ? (result.bashoFormDelta ?? 0) * 0.008 : 0) +
            randomNoise(rng, 0.045)
          ) * 0.33,
          simulationModelVersion === 'unified-v3-variance' ? 0.8 : 0.86,
          simulationModelVersion === 'unified-v3-variance' ? 1.2 : 1.14,
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
        registryNpc.aptitudeProfile = updatedNpc.aptitudeProfile;
        registryNpc.careerBand = updatedNpc.careerBand;
        registryNpc.stagnation = updatedNpc.stagnation;
        pushNpcBashoResult(registryNpc, result.wins, result.losses);
      }
      return updatedNpc;
    })
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
};

const buildDivisionParticipantsFromSnapshot = (
  world: LowerDivisionQuotaWorld,
  division: LowerDivision,
  snapshots: BoundarySnapshot[],
): DivisionParticipant[] => {
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const participants: DivisionParticipant[] = world.rosters[division].map((npc) => {
    const snapshot = byId.get(npc.id);
    const isPlayer = npc.id === PLAYER_ACTOR_ID;
    return {
      id: npc.id,
      shikona: npc.shikona,
      isPlayer,
      stableId: npc.stableId,
      rankScore: npc.rankScore,
      power: npc.basePower * npc.form,
      ability: Number.isFinite(npc.ability) ? npc.ability : npc.basePower * npc.form,
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      aptitudeTier: npc.aptitudeTier,
      aptitudeFactor: npc.aptitudeFactor,
      aptitudeProfile: npc.aptitudeProfile,
      careerBand: npc.careerBand,
      wins: snapshot?.wins ?? 0,
      losses: snapshot?.losses ?? 0,
      currentWinStreak: 0,
      currentLossStreak: 0,
      active: npc.active !== false,
      stagnation: npc.stagnation,
    };
  });

  const playerSnapshot = snapshots.find((snapshot) => snapshot.id === PLAYER_ACTOR_ID);
  if (playerSnapshot && !participants.some((participant) => participant.id === PLAYER_ACTOR_ID)) {
    participants.push({
      id: PLAYER_ACTOR_ID,
      shikona: playerSnapshot.shikona,
      isPlayer: true,
      stableId: playerSnapshot.stableId,
      rankScore: playerSnapshot.rankScore,
      power: 0,
      ability: 0,
      styleBias: 'BALANCE',
      heightCm: 180,
      weightKg: 130,
      aptitudeTier: 'B',
      aptitudeFactor: 1,
      aptitudeProfile: undefined,
      careerBand: 'STANDARD',
      wins: playerSnapshot.wins,
      losses: playerSnapshot.losses,
      currentWinStreak: 0,
      currentLossStreak: 0,
      active: true,
      stagnation: undefined,
    });
  }

  return participants;
};

export const evolveLowerLeagueFromSnapshots = (
  world: LowerDivisionQuotaWorld,
  snapshotsByDivision: LowerLeagueSnapshots,
  rng: RandomSource,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): void => {
  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    const snapshots = snapshotsByDivision[division] ?? [];
    world.lastResults[division] = snapshots;
    evolveDivisionRoster(
      world,
      division,
      buildDivisionParticipantsFromSnapshot(world, division, snapshots),
      rng,
      simulationModelVersion,
    );
  }
};
