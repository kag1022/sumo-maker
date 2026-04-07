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
      const rank =
        division === 'Makuuchi'
          ? decodeMakuuchiRankFromScore(result.rankScore, world.makuuchiLayout)
          : decodeJuryoRankFromScore(result.rankScore);
      const registryNpc = world.npcRegistry.get(npc.id);
      const age = registryNpc?.age ?? 24;
      const stagnationPressure = registryNpc?.stagnation?.pressure ?? npc.stagnation?.pressure ?? 0;
      const recentUpperBashoCount = (registryNpc?.recentBashoResults ?? []).reduce((count, row) => (
        row.division === 'Makuuchi' && ['横綱', '大関', '関脇', '小結'].includes(row.rankName ?? '')
          ? count + 1
          : count
      ), 0);
      const isUpperRank = division === 'Makuuchi' && ['横綱', '大関', '関脇', '小結'].includes(rank.name);
      const upperDrag =
        isUpperRank
          ? Math.max(0, age - 30) * 0.045 +
            Math.max(0, recentUpperBashoCount - 4) * 0.18 +
            Math.max(0, stagnationPressure - 1.2) * 0.75
          : 0;

      const diff = result.wins - result.losses;
      const absent = Math.max(0, 15 - (result.wins + result.losses));
      const expectedWins = result.expectedWins ?? (result.wins + result.losses) / 2;
      const performanceOverExpected = result.wins - expectedWins;
      const absencePenalty = absent * (isUpperRank ? 0.26 : 0.14);
      const ability = (npc.ability ?? npc.basePower) +
        performanceOverExpected * (isUpperRank ? 0.88 : 1.05) +
        ((result.bashoFormDelta ?? 0) * 0.45) +
        npc.growthBias * (isUpperRank ? 0.55 : 0.85) +
        randomNoise(rng, isUpperRank ? 0.62 : 0.45) -
        upperDrag * 0.24 -
        absencePenalty * 0.85 -
        (diff < 0 ? Math.abs(diff) * (isUpperRank ? 0.9 : 0) : 0);
      const basePower = softClampPower(
        npc.basePower +
          (diff > 0 ? diff * (isUpperRank ? 0.14 : 0.2) : diff * (isUpperRank ? 0.32 : 0.2)) +
          performanceOverExpected * (isUpperRank ? 0.2 : 0.3) +
          randomNoise(rng, isUpperRank ? 0.6 : 0.45) -
          upperDrag * 0.16 -
          absencePenalty * 0.45,
        range,
      );
      const nextForm = clamp(
        npc.form * (isUpperRank ? 0.54 : 0.6) +
        (
          1 +
          diff * (isUpperRank ? 0.007 : 0.01) +
          ((result.bashoFormDelta ?? 0) * 0.008) +
          randomNoise(rng, isUpperRank ? 0.085 : 0.06) -
          (diff < 0 && isUpperRank ? Math.abs(diff) * 0.018 : 0) -
          upperDrag * 0.012 -
          absent * 0.014
        ) * (isUpperRank ? 0.46 : 0.4),
        isUpperRank ? 0.68 : 0.78,
        isUpperRank ? 1.18 : 1.22,
      );
      const nextUncertainty = clamp(
        (npc.uncertainty ?? 1.7) -
          0.02 +
          (isUpperRank
            ? Math.max(0, age - 31) * 0.006 +
              (diff < 0 ? Math.abs(diff) * 0.012 : 0) +
              Math.max(0, stagnationPressure - 1.4) * 0.02 +
              absent * 0.018
            : 0),
        0.55,
        2.3,
      );
      const nextRankScore = clamp(
        npc.rankScore - diff * 0.5 + randomNoise(rng, 0.3),
        1,
        200,
      );

      if (registryNpc) {
        registryNpc.basePower = basePower;
        registryNpc.ability = ability;
        registryNpc.uncertainty = nextUncertainty;
        registryNpc.form = nextForm;
        registryNpc.rankScore = nextRankScore;
        registryNpc.division = division;
        registryNpc.currentDivision = division;
        pushNpcBashoResult(registryNpc, result.wins, result.losses, {
          absent,
          rankName: rank.name,
          division,
        });
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
