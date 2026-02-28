import { Rank, RikishiStatus } from '../../models';
import { PersistentActor } from '../npc/types';
import { PLAYER_ACTOR_ID } from './constants';

const averageStats = (status: RikishiStatus): number => {
  const values = Object.values(status.stats);
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const toActorDivision = (rank: Rank): PersistentActor['currentDivision'] => rank.division;

export const createPlayerActorFromStatus = (status: RikishiStatus): PersistentActor => {
  const basePower = Math.max(20, averageStats(status));
  return {
    actorId: PLAYER_ACTOR_ID,
    actorType: 'PLAYER',
    id: PLAYER_ACTOR_ID,
    seedId: 'PLAYER',
    shikona: status.shikona,
    stableId: status.stableId,
    division: toActorDivision(status.rank),
    currentDivision: toActorDivision(status.rank),
    rankScore: 1,
    basePower,
    ability: status.ratingState.ability,
    uncertainty: status.ratingState.uncertainty,
    form: 1 + status.ratingState.form * 0.01,
    volatility: 1.2,
    styleBias: 'BALANCE',
    heightCm: status.bodyMetrics.heightCm,
    weightKg: status.bodyMetrics.weightKg,
    growthBias: 0,
    retirementBias: 0,
    entryAge: status.entryAge,
    age: status.age,
    careerBashoCount: status.history.records.length,
    active: true,
    entrySeq: 0,
    recentBashoResults: [],
  };
};

export const syncPlayerActorFromStatus = (
  actor: PersistentActor,
  status: RikishiStatus,
): PersistentActor => ({
  ...actor,
  shikona: status.shikona,
  stableId: status.stableId || actor.stableId,
  division: toActorDivision(status.rank),
  currentDivision: toActorDivision(status.rank),
  ability: status.ratingState.ability,
  uncertainty: status.ratingState.uncertainty,
  age: status.age,
  careerBashoCount: status.history.records.length,
  heightCm: status.bodyMetrics.heightCm,
  weightKg: status.bodyMetrics.weightKg,
  active: true,
});
