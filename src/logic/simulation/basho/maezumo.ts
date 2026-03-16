import { calculateBattleResult, generateEnemy } from '../../battle';
import { CONSTANTS } from '../../constants';
import { RikishiStatus } from '../../models';
import { RandomSource } from '../deps';
import { LowerDivisionQuotaWorld } from '../lowerQuota';

import {
  resolvePerformanceMetrics,
  resolveScheduledBoutDay,
} from './shared';
import { BashoSimulationResult, BoutOutcome, PlayerBoutDetail } from './types';

export const runMaezumoBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  lowerWorld: LowerDivisionQuotaWorld,
): BashoSimulationResult => {
  const numBouts = CONSTANTS.BOUTS_MAP.Maezumo;
  let wins = 0;
  let losses = 0;
  let consecutiveWins = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let previousResult: BoutOutcome | undefined;
  const kimariteCount: Record<string, number> = {};
  let expectedWins = 0;
  let sosTotal = 0;
  let sosCount = 0;
  const playerBoutDetails: PlayerBoutDetail[] = [];

  const maezumoCandidates = lowerWorld.maezumoPool
    .filter((npc) => npc.active !== false)
    .slice();

  for (let boutIndex = 0; boutIndex < numBouts; boutIndex += 1) {
    const day = resolveScheduledBoutDay(boutIndex);
    const opponent = maezumoCandidates.length
      ? maezumoCandidates[Math.floor(rng() * maezumoCandidates.length)]
      : undefined;

    const enemy = opponent
      ? {
        id: opponent.id,
        shikona: lowerWorld.npcRegistry.get(opponent.id)?.shikona ?? opponent.shikona,
        rankValue: 11,
        rankName: '前相撲',
        rankNumber: 1,
        rankSide: 'East' as const,
        power: Math.round(opponent.basePower * opponent.form + (rng() * 2 - 1) * Math.max(1, opponent.volatility)),
        ability: opponent.ability ?? opponent.basePower * opponent.form,
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? 176,
        weightKg: opponent.weightKg ?? 100,
        aptitudeFactor: opponent.aptitudeFactor,
      }
      : generateEnemy('Maezumo', year, rng);

    const result = calculateBattleResult(
      status,
      enemy,
      {
        day,
        currentWins: wins,
        currentLosses: losses,
        consecutiveWins,
        currentWinStreak,
        currentLossStreak,
        isLastDay: boutIndex === numBouts - 1,
        isYushoContention: false,
        previousResult,
      },
      rng,
    );
    expectedWins += result.winProbability;
    sosTotal += result.opponentAbility;
    sosCount += 1;

    if (result.isWin) {
      wins += 1;
      consecutiveWins += 1;
      currentWinStreak += 1;
      currentLossStreak = 0;
      kimariteCount[result.kimarite] = (kimariteCount[result.kimarite] || 0) + 1;
      previousResult = 'WIN';
    } else {
      losses += 1;
      consecutiveWins = 0;
      currentWinStreak = 0;
      currentLossStreak += 1;
      previousResult = 'LOSS';
    }

    playerBoutDetails.push({
      day,
      result: result.isWin ? 'WIN' : 'LOSS',
      kimarite: result.kimarite,
      opponentId: enemy.id,
      opponentShikona: enemy.shikona,
      opponentRankName: '前相撲',
      opponentRankNumber: 1,
      opponentRankSide: 'East',
    });
  }

  return {
    playerRecord: {
      year,
      month,
      rank: status.rank,
      wins,
      losses,
      absent: 0,
      yusho: false,
      specialPrizes: [],
      ...resolvePerformanceMetrics(wins, expectedWins, sosTotal, sosCount),
      kimariteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords: [],
  };
};
