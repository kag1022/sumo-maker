import { RandomSource } from '../deps';
import { createDailyMatchups, createFacedMap, simulateNpcBout } from '../matchmaking';
import { evolveDivisionAfterBasho } from './evolveDivision';
import { createDivisionParticipants } from './participants';
import { SimulationWorld, TopDivision } from './types';

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

export const simulateOffscreenSekitoriBasho = (
  world: SimulationWorld,
  rng: RandomSource,
): void => {
  simulateOffscreenTopDivisionBasho(world, 'Makuuchi', rng);
  simulateOffscreenTopDivisionBasho(world, 'Juryo', rng);
};
