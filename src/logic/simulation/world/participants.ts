import { PLAYER_ACTOR_ID } from '../actors/constants';
import { RandomSource } from '../deps';
import { DivisionParticipant } from '../matchmaking';
import { DIVISION_SIZE, POWER_RANGE, randomNoise, softClampPower } from './shared';
import { SimulationWorld, TopDivision } from './types';

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
