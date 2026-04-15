import { BoutContext, calculateBattleResult, generateEnemy } from '../../battle';
import { CONSTANTS } from '../../constants';
import { RikishiStatus } from '../../models';
import { RandomSource } from '../deps';
import {
  applyGeneratedInjury,
  appendInjuryHistoryEvent,
  generateInjury,
  resolveInjuryParticipation,
  resolveInjuryRate,
  withInjuryBattlePenalty,
} from '../injury';

import {
  addAbsentBoutDetails,
  isKinboshiEligibleRank,
} from '../topDivision/bashoSummary';
import { BashoSimulationResult, BoutOutcome, PlayerBoutDetail } from './types';
import { resolvePerformanceMetrics } from './shared';

export const runSimplifiedBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
): BashoSimulationResult => {
  const numBouts = CONSTANTS.BOUTS_MAP[status.rank.division];
  let wins = 0;
  let losses = 0;
  let absent = 0;
  let consecutiveWins = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let previousResult: BoutOutcome | undefined;
  let kinboshi = 0;
  const kimariteCount: Record<string, number> = {};
  const winRouteCount: Record<string, number> = {};
  let expectedWins = 0;
  let sosTotal = 0;
  let sosCount = 0;
  const playerBoutDetails: PlayerBoutDetail[] = [];

  if (resolveInjuryParticipation(status).mustSitOut) {
    addAbsentBoutDetails(playerBoutDetails, 1, numBouts);
    return {
      playerRecord: {
        year,
        month,
        rank: status.rank,
        wins: 0,
        losses: 0,
        absent: numBouts,
        yusho: false,
        specialPrizes: [],
        ...resolvePerformanceMetrics(0, 0, 0, 0),
      },
      playerBoutDetails,
      sameDivisionNpcRecords: [],
    };
  }

  for (let day = 1; day <= numBouts; day += 1) {
    if (rng() < resolveInjuryRate(status)) {
      losses += 1;
      const injury = generateInjury(status, year, month, rng);
      applyGeneratedInjury(status, injury);
      const postInjury = resolveInjuryParticipation(status);
      appendInjuryHistoryEvent(status, year, month, injury, postInjury.mustSitOut);
      const enemy = generateEnemy(status.rank.division, year, rng);
      playerBoutDetails.push({
        day,
        result: 'LOSS',
        kimarite: postInjury.mustSitOut ? '不戦敗' : undefined,
        opponentId: enemy.id,
        opponentShikona: enemy.shikona,
        opponentRankName: enemy.rankName,
        opponentRankNumber: enemy.rankNumber,
        opponentRankSide: enemy.rankSide,
        opponentStyleBias: enemy.styleBias ?? 'BALANCE',
      });
      if (postInjury.mustSitOut) {
        const remaining = numBouts - day;
        absent += remaining;
        addAbsentBoutDetails(playerBoutDetails, day + 1, numBouts);
        break;
      }
      consecutiveWins = 0;
      currentWinStreak = 0;
      currentLossStreak += 1;
      previousResult = 'LOSS';
      continue;
    }

    const enemy = generateEnemy(status.rank.division, year, rng);
    const isLastDay = day === numBouts;
    const isYushoContention = isLastDay && wins >= numBouts - 2;

    const boutContext: BoutContext = {
      day,
      currentWins: wins,
      currentLosses: losses,
      consecutiveWins,
      currentWinStreak,
      currentLossStreak,
      isLastDay,
      isYushoContention,
      previousResult,
      expectedWinsSoFar: expectedWins,
    };

    const result = calculateBattleResult(
      withInjuryBattlePenalty(status),
      enemy,
      boutContext,
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
      if (result.winRoute) winRouteCount[result.winRoute] = (winRouteCount[result.winRoute] || 0) + 1;
      if (isKinboshiEligibleRank(status.rank) && enemy.rankName === '横綱') {
        kinboshi += 1;
      }
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
      winRoute: result.isWin ? result.winRoute : undefined,
      opponentId: enemy.id,
      opponentShikona: enemy.shikona,
      opponentRankName: enemy.rankName,
      opponentRankNumber: enemy.rankNumber,
      opponentRankSide: enemy.rankSide,
      opponentStyleBias: enemy.styleBias ?? 'BALANCE',
    });
  }

  let yusho = false;
  if (status.rank.division === 'Makuuchi') {
    if (wins === 15) yusho = true;
    else if (wins === 14 && rng() < CONSTANTS.PROBABILITY.YUSHO.MAKUUCHI_14) yusho = true;
    else if (wins === 13 && rng() < CONSTANTS.PROBABILITY.YUSHO.MAKUUCHI_13) yusho = true;
  } else {
    if (numBouts === 15 && wins >= 14) yusho = rng() < CONSTANTS.PROBABILITY.YUSHO.JURYO_14;
    if (numBouts === 7 && wins === 7) yusho = rng() < CONSTANTS.PROBABILITY.YUSHO.LOWER_7;
  }

  const specialPrizes: string[] = [];

  return {
    playerRecord: {
      year,
      month,
      rank: status.rank,
      wins,
      losses,
      absent,
      yusho,
      specialPrizes,
      ...resolvePerformanceMetrics(wins, expectedWins, sosTotal, sosCount),
      kinboshi,
      kimariteCount,
      winRouteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords: [],
  };
};
