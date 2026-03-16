import { RandomSource } from '../deps';
import { createDailyMatchups, createFacedMap, simulateNpcBout } from '../matchmaking';
import { DEFAULT_TORIKUMI_BOUNDARY_BANDS } from '../torikumi/policy';
import { scheduleTorikumiBasho } from '../torikumi/scheduler';
import { toDivisionParticipants, toTorikumiParticipant } from './shared';
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
    rng,
    facedMap: createFacedMap(participants),
    onPair: ({ a, b }) => {
      simulateNpcBout(a, b, rng);
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
