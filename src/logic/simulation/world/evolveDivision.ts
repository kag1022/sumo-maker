import { BashoRecordHistorySnapshot } from '../../banzuke/providers/sekitori/types';
import { RandomSource } from '../deps';
import { DivisionParticipant } from '../matchmaking';
import { pushNpcBashoResult } from '../npc/retirement';
import { evaluateSpecialPrizes, SpecialPrizeCode } from '../topDivision/specialPrizes';
import { resolveYushoResolution } from '../yusho';
import {
  POWER_RANGE,
  clamp,
  decodeJuryoRankFromScore,
  decodeMakuuchiRankFromScore,
  randomNoise,
  softClampPower,
} from './shared';
import { SimulationWorld, TopDivision } from './types';

export const evolveDivisionAfterBasho = (
  world: SimulationWorld,
  division: TopDivision,
  participants: DivisionParticipant[],
  rng: RandomSource,
): void => {
  const yushoResolution = resolveYushoResolution(
    participants.map((participant) => ({
      id: participant.id,
      wins: participant.wins,
      losses: participant.losses,
      rankScore: participant.rankScore,
      power: participant.power,
    })),
    rng,
  );
  const yushoWinnerId = yushoResolution.winnerId;
  const junYushoIds = yushoResolution.junYushoIds;
  const specialPrizesById =
    division === 'Makuuchi'
      ? evaluateSpecialPrizes(participants, yushoWinnerId, rng, {
          makuuchiLayout: world.makuuchiLayout,
          techniqueSources: world.rosters.Makuuchi,
        })
      : new Map<string, SpecialPrizeCode[]>();

  world.lastBashoResults[division] = participants.map((participant) => {
    const rank =
      division === 'Makuuchi'
        ? decodeMakuuchiRankFromScore(participant.rankScore, world.makuuchiLayout)
        : decodeJuryoRankFromScore(participant.rankScore);
    const absent = Math.max(0, 15 - (participant.wins + participant.losses));
    const expectedWins = participant.expectedWins ?? 0;
    const sos =
      (participant.boutsSimulated ?? 0) > 0
        ? (participant.opponentAbilityTotal ?? 0) / (participant.boutsSimulated ?? 1)
        : 0;
    const performanceOverExpected = participant.wins - expectedWins;
    const yusho = participant.id === yushoWinnerId;
    const junYusho = !yusho && junYushoIds.has(participant.id);
    const specialPrizes = specialPrizesById.get(participant.id) ?? [];
    const historyRecord: BashoRecordHistorySnapshot = {
      rank,
      wins: participant.wins,
      losses: participant.losses,
      absent,
      expectedWins,
      strengthOfSchedule: sos,
      performanceOverExpected,
      yusho,
      junYusho,
      specialPrizes,
    };
    const history = world.recentSekitoriHistory.get(participant.id) ?? [];
    world.recentSekitoriHistory.set(participant.id, [historyRecord, ...history].slice(0, 6));

    return {
      id: participant.id,
      shikona: participant.shikona,
      isPlayer: participant.isPlayer,
      stableId: participant.stableId,
      rankScore: participant.rankScore,
      rank,
      wins: participant.wins,
      losses: participant.losses,
      absent,
      expectedWins,
      strengthOfSchedule: sos,
      performanceOverExpected,
      yusho,
      junYusho,
      specialPrizes,
    };
  });

  const byId = new Map(participants.filter((p) => !p.isPlayer).map((p) => [p.id, p]));
  const range = POWER_RANGE[division];

  world.rosters[division] = world.rosters[division]
    .map((npc) => {
      const result = byId.get(npc.id);
      if (!result) return npc;

      const diff = result.wins - result.losses;
      const expectedWins = result.expectedWins ?? (result.wins + result.losses) / 2;
      const performanceOverExpected = result.wins - expectedWins;
      const ability = (npc.ability ?? npc.basePower) +
        performanceOverExpected * 1.05 +
        npc.growthBias * 0.85 +
        randomNoise(rng, 0.45);
      const basePower = softClampPower(
        npc.basePower + diff * 0.2 + performanceOverExpected * 0.3 + randomNoise(rng, 0.45),
        range,
      );
      const nextForm = clamp(
        npc.form * 0.6 + (1 + diff * 0.01 + randomNoise(rng, 0.06)) * 0.4,
        0.85,
        1.15,
      );
      const nextUncertainty = clamp((npc.uncertainty ?? 1.7) - 0.02, 0.55, 2.3);
      const nextRankScore = clamp(
        npc.rankScore - diff * 0.5 + randomNoise(rng, 0.3),
        1,
        200,
      );

      const registryNpc = world.npcRegistry.get(npc.id);
      if (registryNpc) {
        registryNpc.basePower = basePower;
        registryNpc.ability = ability;
        registryNpc.uncertainty = nextUncertainty;
        registryNpc.form = nextForm;
        registryNpc.rankScore = nextRankScore;
        registryNpc.division = division;
        registryNpc.currentDivision = division;
        pushNpcBashoResult(registryNpc, result.wins, result.losses);
      }

      return {
        ...npc,
        basePower,
        ability,
        uncertainty: nextUncertainty,
        form: nextForm,
        rankScore: nextRankScore,
      };
    })
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
};
