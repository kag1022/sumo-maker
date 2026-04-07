import { PLAYER_ACTOR_ID } from '../actors/constants';
import { RandomSource } from '../deps';
import { DivisionParticipant } from '../matchmaking';
import { computeConsecutiveMakekoshiStreak } from '../retirement/shared';
import { resolveTopDivisionRank } from '../topDivision/rank';
import { resolveBashoFormDelta } from '../variance/bashoVariance';
import { DIVISION_SIZE, POWER_RANGE, randomNoise, softClampPower } from './shared';
import { SimulationWorld, TopDivision } from './types';

const UPPER_RANK_NAMES = new Set(['横綱', '大関', '関脇', '小結']);
const TOP_HEAVY_RANK_NAMES = new Set(['横綱', '大関']);

const countRecentUpperBasho = (
  results?: Array<{ division: string; rankName?: string }>,
): number =>
  (results ?? []).reduce((count, row) => (
    row.division === 'Makuuchi' && UPPER_RANK_NAMES.has(row.rankName ?? '')
      ? count + 1
      : count
  ), 0);

const countRecentTopHeavyBasho = (
  results?: Array<{ division: string; rankName?: string }>,
): number =>
  (results ?? []).reduce((count, row) => (
    row.division === 'Makuuchi' && TOP_HEAVY_RANK_NAMES.has(row.rankName ?? '')
      ? count + 1
      : count
  ), 0);

const resolveUpperDivisionVariance = (input: {
  division: TopDivision;
  rankName: string;
  age: number;
  form: number;
  stagnationPressure: number;
  recentUpperBashoCount: number;
  recentTopHeavyBashoCount: number;
  recentAbsenceTotal: number;
  consecutiveMakekoshi: number;
  rng: RandomSource;
}): {
  bashoKyujo: boolean;
  powerShock: number;
  abilityShock: number;
} => {
  if (input.division !== 'Makuuchi' || !UPPER_RANK_NAMES.has(input.rankName)) {
    return { bashoKyujo: false, powerShock: 0, abilityShock: 0 };
  }

  const agePressure = Math.max(0, input.age - 30) * 0.004 + Math.max(0, input.age - 34) * 0.006;
  const tenurePressure =
    Math.max(0, input.recentUpperBashoCount - 4) * 0.007 +
    Math.max(0, input.recentTopHeavyBashoCount - 2) * 0.01;
  const slumpPressure =
    Math.max(0, 0.96 - input.form) * 0.18 +
    Math.max(0, input.stagnationPressure - 1.3) * 0.022 +
    Math.max(0, input.consecutiveMakekoshi - 1) * 0.015 +
    Math.max(0, input.recentAbsenceTotal - 1) * 0.01;
  const sitoutChance = Math.min(
    0.18,
    0.004 + agePressure + tenurePressure * 0.55 + slumpPressure,
  );
  if (input.rng() < sitoutChance) {
    return { bashoKyujo: true, powerShock: -7, abilityShock: -10 };
  }

  const coldSnapChance = Math.min(0.4, 0.08 + agePressure * 2.4 + slumpPressure * 1.8);
  if (input.rng() >= coldSnapChance) {
    return { bashoKyujo: false, powerShock: 0, abilityShock: 0 };
  }

  const severity = 1 + input.rng() * (2.2 + tenurePressure * 5 + slumpPressure * 7);
  return {
    bashoKyujo: false,
    powerShock: -severity * 1.8,
    abilityShock: -severity * 2.6,
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
    const resolvedRank = resolveTopDivisionRank(division, npc.rankScore, world.makuuchiLayout);
    const recentResults = registryNpc?.recentBashoResults ?? [];
    const upperVariance = resolveUpperDivisionVariance({
      division,
      rankName: resolvedRank.name,
      age: registryNpc?.age ?? 24,
      form: registryNpc?.form ?? npc.form,
      stagnationPressure: registryNpc?.stagnation?.pressure ?? npc.stagnation?.pressure ?? 0,
      recentUpperBashoCount: countRecentUpperBasho(recentResults),
      recentTopHeavyBashoCount: countRecentTopHeavyBasho(recentResults),
      recentAbsenceTotal: recentResults.reduce((sum, row) => sum + (row.absent ?? 0), 0),
      consecutiveMakekoshi: computeConsecutiveMakekoshiStreak(recentResults, 8),
      rng,
    });
    const bashoVariance = resolveBashoFormDelta({
        uncertainty: registryNpc?.uncertainty ?? npc.uncertainty,
        volatility: npc.volatility,
        rng,
      });
    const bashoFormDelta = bashoVariance?.bashoFormDelta ?? 0;
    const seasonalAbility =
      (registryNpc?.ability ?? npc.ability ?? npc.basePower) +
      npc.form * 3.2 +
      randomNoise(rng, Math.max(0.8, npc.volatility * 0.45)) +
      upperVariance.abilityShock;
    const seasonalPower =
      npc.basePower * npc.form +
      randomNoise(rng, npc.volatility) +
      randomNoise(rng, 1.2) +
      upperVariance.powerShock;
    return {
      id: npc.id,
      shikona,
      isPlayer: (registryNpc?.actorType ?? (npc.id === PLAYER_ACTOR_ID ? 'PLAYER' : 'NPC')) === 'PLAYER',
      stableId,
      rankScore: npc.rankScore,
      power: softClampPower(seasonalPower, POWER_RANGE[division]),
      ability: seasonalAbility,
      bashoFormDelta,
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      aptitudeTier: registryNpc?.aptitudeTier ?? npc.aptitudeTier,
      aptitudeFactor: registryNpc?.aptitudeFactor ?? npc.aptitudeFactor,
      aptitudeProfile: registryNpc?.aptitudeProfile ?? npc.aptitudeProfile,
      careerBand: registryNpc?.careerBand ?? npc.careerBand,
      stagnation: registryNpc?.stagnation ?? npc.stagnation,
      wins: 0,
      losses: 0,
      currentWinStreak: 0,
      currentLossStreak: 0,
      expectedWins: 0,
      opponentAbilityTotal: 0,
      boutsSimulated: 0,
      active,
      bashoKyujo: upperVariance.bashoKyujo,
    };
  });

  return participants;
};
