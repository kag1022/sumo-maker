import { RandomSource } from '../../deps';
import {
  createDailyMatchups,
  createFacedMap,
  DivisionParticipant,
  simulateNpcBout,
} from '../../matchmaking';
import { clamp, randomNoise } from '../../boundary/shared';
import { pushNpcBashoResult } from '../../npc/retirement';
import {
  BoundarySnapshot,
  MAKUSHITA_POOL_SIZE,
  MAKUSHITA_POWER_MAX,
  MAKUSHITA_POWER_MIN,
  SekitoriBoundaryWorld,
} from '../types';

import { resolveBashoFormDelta } from '../../variance/bashoVariance';

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

const createMakushitaParticipants = (
  world: SekitoriBoundaryWorld,
  rng: RandomSource,
  
): DivisionParticipant[] => {
  const roster = world.makushitaPool
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore)
    .slice(0, MAKUSHITA_POOL_SIZE);

  return roster.map((npc) => {
    const bashoFormDelta = true
      ? resolveBashoFormDelta({
        uncertainty: npc.uncertainty,
        volatility: npc.volatility,
        rng,
      }).bashoFormDelta
      : 0;
    const seasonalPower =
      npc.basePower * npc.form + randomNoise(rng, npc.volatility) + randomNoise(rng, 0.8);
    return {
      id: npc.id,
      shikona: npc.shikona,
      isPlayer: false,
      stableId: npc.stableId,
      rankScore: npc.rankScore,
      power: clamp(seasonalPower, MAKUSHITA_POWER_MIN, MAKUSHITA_POWER_MAX),
      ability: npc.ability,
      bashoFormDelta,
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      aptitudeTier: npc.aptitudeTier,
      aptitudeFactor: npc.aptitudeFactor,
      aptitudeProfile: npc.aptitudeProfile,
      careerBand: npc.careerBand,
      wins: 0,
      losses: 0,
      expectedWins: 0,
      opponentAbilityTotal: 0,
      boutsSimulated: 0,
      active: true,
      stagnation: npc.stagnation,
    };
  });
};

const evolveMakushitaPool = (
  world: SekitoriBoundaryWorld,
  participants: DivisionParticipant[],
  rng: RandomSource,
  
): void => {
  const byId = new Map(participants.filter((p) => !p.isPlayer).map((p) => [p.id, p]));

  world.makushitaPool = world.makushitaPool
    .map((npc) => {
      const result = byId.get(npc.id);
      if (!result) return npc;

      const diff = result.wins - result.losses;
      const expectedWins = result.expectedWins ?? (result.wins + result.losses) / 2;
      const performanceOverExpected = result.wins - expectedWins;
      const updated = {
        ...npc,
        basePower: clamp(
          npc.basePower + diff * 0.28 + (npc.growthBias ?? 0) * 0.85 + randomNoise(rng, 0.4),
          MAKUSHITA_POWER_MIN,
          MAKUSHITA_POWER_MAX,
        ),
        ability:
          (npc.ability ?? npc.basePower) +
          performanceOverExpected * 1.0 +
          ((result.bashoFormDelta ?? 0) * 0.45) +
          randomNoise(rng, 0.35),
        uncertainty: clamp((npc.uncertainty ?? 1.7) - 0.02, 0.6, 2.3),
        form: clamp(
          npc.form * 0.64 +
          (
            1 +
            diff * 0.012 +
            ((result.bashoFormDelta ?? 0) * 0.008) +
            randomNoise(rng, 0.05)
          ) * 0.36,
          0.8,
          1.2,
        ),
        rankScore: clamp(npc.rankScore - diff * 0.6 + randomNoise(rng, 0.25), 1, 999),
      };
      const persistent = world.npcRegistry?.get(npc.id);
      if (persistent) {
        persistent.basePower = updated.basePower;
        persistent.ability = updated.ability;
        persistent.uncertainty = updated.uncertainty;
        persistent.form = updated.form;
        persistent.rankScore = updated.rankScore;
        persistent.growthBias = updated.growthBias ?? persistent.growthBias;
        persistent.aptitudeProfile = updated.aptitudeProfile;
        persistent.careerBand = updated.careerBand;
        persistent.stagnation = updated.stagnation;
        persistent.division = 'Makushita';
        persistent.currentDivision = 'Makushita';
        pushNpcBashoResult(persistent, result.wins, result.losses);
      }
      return updated;
    })
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
};

export const simulateMakushitaBoundaryBasho = (
  world: SekitoriBoundaryWorld,
  rng: RandomSource,
  
): BoundarySnapshot[] => {
  const participants = createMakushitaParticipants(world, rng);
  const facedMap = createFacedMap(participants);

  for (let boutIndex = 0; boutIndex < 7; boutIndex += 1) {
    const day = 1 + boutIndex * 2;
    const daily = createDailyMatchups(participants, facedMap, rng, day, 15);
    for (const { a, b } of daily.pairs) {
      simulateNpcBout(a, b, rng);
    }
  }

  const snapshots = snapshotParticipants(participants);
  world.lastMakushitaResults = snapshots;
  evolveMakushitaPool(world, participants, rng);
  return snapshots;
};
