import { BashoRecordHistorySnapshot } from '../../banzuke/providers/sekitori/types';
import { evaluateYokozunaPromotion } from '../../banzuke/rules/yokozunaPromotion';
import { RandomSource } from '../deps';
import { DivisionParticipant } from '../matchmaking';
import { Rank } from '../../models';
import type { NpcBashoResult } from '../npc/types';
import { applyEmpiricalNpcDriftClamp } from '../npc/empiricalDrift';
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

/**
 * Fix-batch ①: NPC のランク更新が「rankScore - diff * 0.5」という純粋線形で
 * 大関 / 横綱の昇進ゲートを完全にスキップしていたため、平幕 NPC が 13-2 を 1-2 場所
 * 続けると横綱に到達してしまうバグの修正。
 *
 * Makuuchi rankScore の意味 (decodeMakuuchiRankFromScore に依存):
 *   1-2: 横綱 E/W   3-4: 大関 E/W   5-6: 関脇 E/W   7-8: 小結 E/W   9+: 前頭
 * 値が小さいほど高位。
 *
 * 提案 nextRankScore に対して、「現在地位から 1 場所で到達できる最高位」を上限として
 * 床値を設定する（実数値が小さくなりすぎないようにクランプ）。
 */
const MAKUUCHI_FLOOR_SEKIWAKE = 5; // 前頭/十両出身は 1 場所では関脇までしか昇進できない
const MAKUUCHI_FLOOR_OZEKI = 3;    // 関脇/小結は大関昇進ゲート未達なら大関まで進めない
const MAKUUCHI_FLOOR_YOKOZUNA = 1; // 大関は横綱昇進ゲート未達なら横綱に進めない

const resolveTopRankAbilityFloor = (
  rankName: string,
  initialCareerStage?: string,
  absent = 0,
): number | undefined => {
  const declineDiscount = initialCareerStage === 'declining' ? 8 : initialCareerStage === 'veteran' ? 3 : 0;
  const absenceDiscount = Math.min(7, absent * 0.45);
  if (rankName === '横綱') return 122 - declineDiscount - absenceDiscount;
  if (rankName === '大関') return 112 - declineDiscount - absenceDiscount;
  if (rankName === '関脇' || rankName === '小結') return 104 - declineDiscount - absenceDiscount;
  return undefined;
};

const enforceNpcPromotionGate = (
  fromRank: Rank,
  proposedNextRankScore: number,
  recentResults: NpcBashoResult[],
  recentSekitoriHistory: BashoRecordHistorySnapshot[],
  currentBashoWins: number,
  topRankPopulation: { currentYokozunaCount: number; currentOzekiCount: number },
): number => {
  if (fromRank.division !== 'Makuuchi') {
    // 十両以下 → 1 場所で関脇以上には昇進できない（実史 1989-2019 で 1 件もない）
    return Math.max(proposedNextRankScore, MAKUUCHI_FLOOR_SEKIWAKE);
  }
  const fromName = fromRank.name;
  if (fromName === '前頭') {
    return Math.max(proposedNextRankScore, MAKUUCHI_FLOOR_SEKIWAKE);
  }
  if (fromName === '関脇' || fromName === '小結') {
    // 大関昇進ゲート: 関脇/小結地位で 3 場所合計 33 勝相当
    // 簡易判定として「直近 2 場所 + 今場所」で wins ≥ 33 かつ各 wins ≥ 10
    const last2 = recentResults.slice(-2);
    const total3BashoWins =
      currentBashoWins + last2.reduce((sum, r) => sum + r.wins, 0);
    const eachKachikoshi =
      currentBashoWins >= 10 && last2.length >= 2 && last2.every((r) => r.wins >= 10);
    const ozekiGateMet = total3BashoWins >= 33 && eachKachikoshi;
    return Math.max(
      proposedNextRankScore,
      ozekiGateMet ? MAKUUCHI_FLOOR_OZEKI : MAKUUCHI_FLOOR_OZEKI + 2,
    );
  }
  if (fromName === '大関') {
    // 横綱昇進ゲートは banzuke rules と同じ yusho / junYusho / 人数 pressure を使う。
    // rankScore の線形移動だけで横綱へ漏れると、上位過密時に審査温度が効かない。
    const current = recentSekitoriHistory[0];
    const previous = recentSekitoriHistory[1];
    const yokozunaGateMet = Boolean(
      current &&
        evaluateYokozunaPromotion({
          id: 'NPC',
          shikona: 'NPC',
          rank: current.rank,
          wins: current.wins,
          losses: current.losses,
          absent: current.absent,
          expectedWins: current.expectedWins,
          strengthOfSchedule: current.strengthOfSchedule,
          performanceOverExpected: current.performanceOverExpected,
          yusho: current.yusho,
          junYusho: current.junYusho,
          specialPrizes: current.specialPrizes,
          pastRecords: previous ? [previous] : [],
          topRankPopulation,
        }).promote,
    );
    return Math.max(
      proposedNextRankScore,
      yokozunaGateMet ? MAKUUCHI_FLOOR_YOKOZUNA : MAKUUCHI_FLOOR_OZEKI,
    );
  }
  // 横綱: そのまま (clamp は呼出側が 1 を確保済み)
  return proposedNextRankScore;
};

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
      ability: participant.ability,
      styleBias: participant.styleBias,
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
      const rawAbility = (npc.ability ?? npc.basePower) +
        performanceOverExpected * (isUpperRank ? 0.88 : 1.05) +
        ((result.bashoFormDelta ?? 0) * 0.45) +
        npc.growthBias * (isUpperRank ? 0.55 : 0.85) +
        randomNoise(rng, isUpperRank ? 0.62 : 0.45) -
        upperDrag * 0.24 -
        absencePenalty * 0.85 -
        (diff < 0 ? Math.abs(diff) * (isUpperRank ? 0.9 : 0) : 0);
      const rawBasePower = softClampPower(
        npc.basePower +
          (diff > 0 ? diff * (isUpperRank ? 0.14 : 0.2) : diff * (isUpperRank ? 0.32 : 0.2)) +
          performanceOverExpected * (isUpperRank ? 0.2 : 0.3) +
          randomNoise(rng, isUpperRank ? 0.6 : 0.45) -
          upperDrag * 0.16 -
          absencePenalty * 0.45,
        range,
      );
      const rawNextForm = clamp(
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
      const driftedAbility = applyEmpiricalNpcDriftClamp(
        npc.ability ?? npc.basePower,
        rawAbility,
        { age, division, rankName: rank.name, absent },
      );
      const topRankFloor = resolveTopRankAbilityFloor(
        rank.name,
        registryNpc?.initialCareerStage,
        absent,
      );
      const ability = topRankFloor == null
        ? driftedAbility
        : Math.max(driftedAbility, topRankFloor);
      const basePower = softClampPower(
        applyEmpiricalNpcDriftClamp(
          npc.basePower,
          rawBasePower,
          { age, division, rankName: rank.name, absent },
        ),
        range,
      );
      const nextForm = clamp(
        applyEmpiricalNpcDriftClamp(
          npc.form,
          rawNextForm,
          { age, division, rankName: rank.name, absent },
        ),
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
      const linearNextRankScore = npc.rankScore - diff * 0.5 + randomNoise(rng, 0.3);
      const gatedNextRankScore = enforceNpcPromotionGate(
        rank,
        linearNextRankScore,
        registryNpc?.recentBashoResults ?? [],
        world.recentSekitoriHistory.get(npc.id) ?? [],
        result.wins,
        {
          currentYokozunaCount: world.makuuchiLayout.yokozuna,
          currentOzekiCount: world.makuuchiLayout.ozeki,
        },
      );
      const nextRankScore = clamp(gatedNextRankScore, 1, 200);

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
          rankNumber: rank.number,
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
    .map((npc, index) => ({
      ...npc,
      // rankScore は小さいほど高位。並び替え後の詰め直しで gate 済みの上限を
      // 上書きすると、前頭・十両降格予定者が横綱スロットへ漏れる。
      rankScore: Math.max(index + 1, npc.rankScore),
    }));
};
