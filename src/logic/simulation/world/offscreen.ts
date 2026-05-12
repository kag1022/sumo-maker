import { RandomSource } from '../deps';
import {
  applyNpcDoubleKyujo,
  applyNpcFusenBout,
  createDailyMatchups,
  createFacedMap,
  simulateNpcBout,
} from '../matchmaking';
import { evolveDivisionAfterBasho } from './evolveDivision';
import { createDivisionParticipants } from './participants';
import { resolveTopDivisionRank } from '../topDivision/rank';
import { SimulationWorld, TopDivision } from './types';

export const simulateOffscreenTopDivisionBasho = (
  world: SimulationWorld,
  division: TopDivision,
  rng: RandomSource,
): void => {
  const participants = createDivisionParticipants(world, division, rng);
  const facedMap = createFacedMap(participants);
  const boutRows: NonNullable<SimulationWorld['lastTopDivisionBoutRows']> = [];

  for (let day = 1; day <= 15; day += 1) {
    const activeByDay = participants.map((participant) => ({
      participant,
      activeBeforeDay: participant.active,
    }));
    for (const entry of activeByDay) {
      if (
        entry.participant.kyujoStartDay != null &&
        day > entry.participant.kyujoStartDay
      ) {
        entry.participant.active = false;
      }
    }

    const dailyMatchups = createDailyMatchups(participants, facedMap, rng, day, 15);
    const pairs = dailyMatchups.pairs;
    for (const { a, b } of pairs) {
      const aRank = resolveTopDivisionRank(division, a.rankScore, world.makuuchiLayout);
      const bRank = resolveTopDivisionRank(division, b.rankScore, world.makuuchiLayout);
      const aKyujoStarted = a.kyujoStartDay != null && day >= a.kyujoStartDay;
      const bKyujoStarted = b.kyujoStartDay != null && day >= b.kyujoStartDay;
      if (aKyujoStarted && bKyujoStarted) {
        applyNpcDoubleKyujo(a, b);
        boutRows.push({
          division,
          day,
          aId: a.id,
          bId: b.id,
          aRankName: aRank.name,
          bRankName: bRank.name,
          fusen: true,
          fusenPair: true,
          fusenReason: 'partial_kyujo',
          doubleKyujo: true,
          doubleKyujoParticipantIds: [a.id, b.id],
          scheduledAfterKyujoStart: true,
        });
        continue;
      }
      if (aKyujoStarted || bKyujoStarted) {
        const winner = aKyujoStarted ? b : a;
        const loser = aKyujoStarted ? a : b;
        applyNpcFusenBout(winner, loser);
        boutRows.push({
          division,
          day,
          aId: a.id,
          bId: b.id,
          aRankName: aRank.name,
          bRankName: bRank.name,
          aWon: winner.id === a.id,
          aWinProbability: winner.id === a.id ? 0.96 : 0.04,
          fusen: true,
          fusenPair: true,
          fusenWinnerId: winner.id,
          fusenLoserId: loser.id,
          fusenReason: 'partial_kyujo',
          scheduledAfterKyujoStart: true,
        });
        continue;
      }
      const diagnostic = simulateNpcBout(a, b, rng);
      boutRows.push({
        division,
        day,
        aId: a.id,
        bId: b.id,
        aRankName: aRank.name,
        bRankName: bRank.name,
        aWon: diagnostic?.aWon,
        aWinProbability: diagnostic?.aWinProbability,
        aAbility: diagnostic?.aAbility,
        bAbility: diagnostic?.bAbility,
        fusen: diagnostic?.fusen,
        scheduledAfterKyujoStart:
          (a.kyujoStartDay != null && day >= a.kyujoStartDay) ||
          (b.kyujoStartDay != null && day >= b.kyujoStartDay),
      });
    }

    for (const entry of activeByDay) {
      entry.participant.active = entry.activeBeforeDay;
    }
  }

  world.lastTopDivisionBoutRows = [
    ...(world.lastTopDivisionBoutRows ?? []).filter((row) => row.division !== division),
    ...boutRows,
  ];
  evolveDivisionAfterBasho(world, division, participants, rng);
};

export const simulateOffscreenSekitoriBasho = (
  world: SimulationWorld,
  rng: RandomSource,
): void => {
  world.lastTopDivisionBoutRows = [];
  simulateOffscreenTopDivisionBasho(world, 'Makuuchi', rng);
  simulateOffscreenTopDivisionBasho(world, 'Juryo', rng);
};
