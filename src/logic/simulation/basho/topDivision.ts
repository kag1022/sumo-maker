import { BoutContext, calculateBattleResult } from '../../battle';
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
  createFacedMap,
  DivisionParticipant,
  simulateNpcBout,
} from '../matchmaking';
import { DEFAULT_SIMULATION_MODEL_VERSION, SimulationModelVersion } from '../modelVersion';
import { resolveBashoFormDelta } from '../variance/bashoVariance';
import {
  isKinboshiEligibleRank,
  toNpcAggregateFromTopDivision,
} from '../topDivision/bashoSummary';
import { resolveTopDivisionRank } from '../topDivision/rank';
import {
  createDivisionParticipants,
  evolveDivisionAfterBasho,
  finalizeSekitoriPlayerPlacement,
  resolveTopDivisionRankValue,
  SimulationWorld,
  syncPlayerActorInWorld,
  TopDivision,
} from '../world';
import { scheduleTorikumiBasho } from '../torikumi/scheduler';
import { TorikumiParticipant } from '../torikumi/types';
import { resolvePerformanceMetrics } from './shared';
import {
  BashoSimulationResult,
  BoutOutcome,
  PlayerBoutDetail,
  buildImportantTorikumiNote,
  type ImportantTorikumiNote,
} from './types';

const toDivisionParticipants = (
  participants: TorikumiParticipant[],
): DivisionParticipant[] =>
  participants.map((participant) => ({
    id: participant.id,
    shikona: participant.shikona,
    isPlayer: participant.isPlayer,
    stableId: participant.stableId,
    forbiddenOpponentIds: participant.forbiddenOpponentIds,
    rankScore: participant.rankScore,
    power: participant.power,
    ability: participant.ability,
    bashoFormDelta: participant.bashoFormDelta,
    styleBias: participant.styleBias,
    heightCm: participant.heightCm,
    weightKg: participant.weightKg,
    aptitudeTier: participant.aptitudeTier,
    aptitudeFactor: participant.aptitudeFactor,
    wins: participant.wins,
    losses: participant.losses,
    currentWinStreak: participant.currentWinStreak,
    currentLossStreak: participant.currentLossStreak,
    expectedWins: participant.expectedWins,
    opponentAbilityTotal: participant.opponentAbilityTotal,
    boutsSimulated: participant.boutsSimulated,
    active: participant.active,
  }));

export const runTopDivisionBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  division: TopDivision,
  rng: RandomSource,
  world: SimulationWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
  forcedPlayerBashoFormDelta?: number,
): BashoSimulationResult => {
  syncPlayerActorInWorld(world, status, rng);
  finalizeSekitoriPlayerPlacement(world, status);
  const numBouts = CONSTANTS.BOUTS_MAP[division];
  const kimariteCount: Record<string, number> = {};
  const winRouteCount: Record<string, number> = {};
  let wins = 0;
  let losses = 0;
  let absent = 0;
  let consecutiveWins = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let previousResult: BoutOutcome | undefined;
  const playerBoutDetails: PlayerBoutDetail[] = [];
  const importantTorikumiNotes: ImportantTorikumiNote[] = [];
  const kinboshiById = new Map<string, number>();
  let expectedWins = 0;
  let sosTotal = 0;
  let sosCount = 0;

  const toTorikumiSekitoriParticipant = (
    topDivision: TopDivision,
    participant: DivisionParticipant,
  ): TorikumiParticipant => {
    const rank = resolveTopDivisionRank(topDivision, participant.rankScore, world.makuuchiLayout);
    return {
      ...participant,
      division: topDivision,
      rankName: rank.name,
      rankNumber: rank.number,
      targetBouts: 15,
      boutsDone: 0,
    };
  };

  const makuuchi = createDivisionParticipants(
    world,
    'Makuuchi',
    rng,
  ).map((participant) => toTorikumiSekitoriParticipant('Makuuchi', participant));
  const juryo = createDivisionParticipants(
    world,
    'Juryo',
    rng,
  ).map((participant) => toTorikumiSekitoriParticipant('Juryo', participant));
  const participants = makuuchi.concat(juryo);

  const player = participants.find((participant) => participant.isPlayer);
  if (!player) {
    throw new Error('Player participant was not initialized for top division basho');
  }
  const playerBashoFormDelta =
    Number.isFinite(forcedPlayerBashoFormDelta)
      ? (forcedPlayerBashoFormDelta as number)
      : resolveBashoFormDelta({
        uncertainty: status.ratingState.uncertainty,
        volatility: 1.2,
        rng,
      }).bashoFormDelta;
  player.bashoFormDelta = playerBashoFormDelta;
  if (resolveInjuryParticipation(status).mustSitOut) {
    player.active = false;
  }

  const addKinboshi = (id: string): void => {
    kinboshiById.set(id, (kinboshiById.get(id) ?? 0) + 1);
  };

  const torikumiResult = scheduleTorikumiBasho({
    participants,
    days: Array.from({ length: 15 }, (_, index) => index + 1),
    boundaryBands: [],
    simulationModelVersion,
    rng,
    facedMap: createFacedMap(participants),
    dayEligibility: () => true,
    onPair: (pair, day) => {
      const { a, b } = pair;
      if (!a.isPlayer && !b.isPlayer) {
        const aDivision = a.division as TopDivision;
        const bDivision = b.division as TopDivision;
        const aRank = resolveTopDivisionRank(aDivision, a.rankScore, world.makuuchiLayout);
        const bRank = resolveTopDivisionRank(bDivision, b.rankScore, world.makuuchiLayout);
        const aWinsBefore = a.wins;
        simulateNpcBout(a, b, rng);
        if (aDivision === 'Makuuchi' && bDivision === 'Makuuchi') {
          const aWon = a.wins > aWinsBefore;
          const winner = aWon ? a : b;
          const winnerRank = aWon ? aRank : bRank;
          const loserRank = aWon ? bRank : aRank;
          if (winnerRank.name === '前頭' && loserRank.name === '横綱') {
            addKinboshi(winner.id);
          }
        }
        return;
      }

      const opponent = a.isPlayer ? b : a;
      const opponentDivision = opponent.division as TopDivision;
      const opponentRank = resolveTopDivisionRank(
        opponentDivision,
        opponent.rankScore,
        world.makuuchiLayout,
      );
      const importantNote = buildImportantTorikumiNote({
        pair,
        day,
        year,
        month,
        opponentId: opponent.id,
        opponentShikona: opponent.shikona,
        opponentRank: {
          division: opponentDivision,
          name: opponentRank.name,
          number: opponentRank.number,
          side: opponentRank.side,
        },
      });
      if (importantNote) {
        importantTorikumiNotes.push(importantNote);
      }

      if (!opponent.active) {
        wins += 1;
        player.wins += 1;
        opponent.losses += 1;
        consecutiveWins += 1;
        currentWinStreak += 1;
        currentLossStreak = 0;
        player.currentWinStreak = currentWinStreak;
        player.currentLossStreak = 0;
        opponent.currentLossStreak = (opponent.currentLossStreak ?? 0) + 1;
        opponent.currentWinStreak = 0;
        previousResult = 'WIN';
        playerBoutDetails.push({
          day,
          result: 'WIN',
          kimarite: '不戦勝',
          opponentId: opponent.id,
          opponentShikona: opponent.shikona,
          opponentRankName: opponentRank.name,
          opponentRankNumber: opponentRank.number,
          opponentRankSide: opponentRank.side,
          opponentStyleBias: opponent.styleBias ?? 'BALANCE',
        });

        // 取組自体は発生しない（勝たないと金星は得られない）
        return;
      }

      if (opponent.bashoKyujo) {
        wins += 1;
        player.wins += 1;
        consecutiveWins += 1;
        currentWinStreak += 1;
        currentLossStreak = 0;
        player.currentWinStreak = currentWinStreak;
        player.currentLossStreak = 0;
        opponent.currentLossStreak = 0;
        opponent.currentWinStreak = 0;
        previousResult = 'WIN';
        playerBoutDetails.push({
          day,
          result: 'WIN',
          kimarite: '不戦勝',
          opponentId: opponent.id,
          opponentShikona: opponent.shikona,
          opponentRankName: opponentRank.name,
          opponentRankNumber: opponentRank.number,
          opponentRankSide: opponentRank.side,
          opponentStyleBias: opponent.styleBias ?? 'BALANCE',
        });
        return;
      }

      if (rng() < resolveInjuryRate(status)) {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        consecutiveWins = 0;
        currentWinStreak = 0;
        currentLossStreak += 1;
        player.currentWinStreak = 0;
        player.currentLossStreak = currentLossStreak;
        opponent.currentWinStreak = (opponent.currentWinStreak ?? 0) + 1;
        opponent.currentLossStreak = 0;
        previousResult = 'LOSS';

        const injury = generateInjury(status, year, month, rng);
        applyGeneratedInjury(status, injury);
        const postInjury = resolveInjuryParticipation(status);
        appendInjuryHistoryEvent(status, year, month, injury, postInjury.mustSitOut);

        playerBoutDetails.push({
          day,
          result: 'LOSS',
          kimarite: postInjury.mustSitOut ? '不戦敗' : undefined,
          opponentId: opponent.id,
          opponentShikona: opponent.shikona,
          opponentRankName: opponentRank.name,
          opponentRankNumber: opponentRank.number,
          opponentRankSide: opponentRank.side,
          opponentStyleBias: opponent.styleBias ?? 'BALANCE',
        });

        if (postInjury.mustSitOut) {
          player.active = false;
        }
        return;
      }

      const enemyPowerNoise = 1.0;
      const enemy = {
        shikona: opponent.shikona,
        rankValue: resolveTopDivisionRankValue(
          opponentDivision,
          opponent.rankScore,
          world.makuuchiLayout,
        ),
        stableId: opponent.stableId,
        power: Math.round(opponent.power + (rng() * 2 - 1) * enemyPowerNoise),
        ability: (opponent.ability ?? opponent.power) + (opponent.bashoFormDelta ?? 0),
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? (opponentDivision === 'Makuuchi' ? 188 : 186),
        weightKg: opponent.weightKg ?? (opponentDivision === 'Makuuchi' ? 160 : 152),
        aptitudeTier: opponent.aptitudeTier,
        aptitudeProfile: opponent.aptitudeProfile,
        aptitudeFactor: opponent.aptitudeFactor,
        careerBand: opponent.careerBand,
        stagnation: opponent.stagnation,
        bashoFormDelta: opponent.bashoFormDelta,
      };

      const isLastDay = day === numBouts;
      const isYushoContention =
        pair.titleImplication === 'DIRECT' ||
        pair.titleImplication === 'CHASE' ||
        (isLastDay && wins >= numBouts - 2);
      const boutContext: BoutContext = {
        day,
        currentWins: wins,
        currentLosses: losses,
        consecutiveWins,
        currentWinStreak,
        currentLossStreak,
        opponentWinStreak: opponent.currentWinStreak ?? 0,
        opponentLossStreak: opponent.currentLossStreak ?? 0,
        isLastDay,
        isYushoContention,
        contentionTier: pair.contentionTier,
        titleImplication: pair.titleImplication,
        boundaryImplication: pair.boundaryImplication,
        schedulePhase: pair.phaseId,
        previousResult,
        bashoFormDelta: playerBashoFormDelta,
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
        player.wins += 1;
        opponent.losses += 1;
        consecutiveWins += 1;
        currentWinStreak += 1;
        currentLossStreak = 0;
        player.currentWinStreak = currentWinStreak;
        player.currentLossStreak = 0;
        opponent.currentLossStreak = (opponent.currentLossStreak ?? 0) + 1;
        opponent.currentWinStreak = 0;
        kimariteCount[result.kimarite] = (kimariteCount[result.kimarite] || 0) + 1;
        if (result.winRoute) winRouteCount[result.winRoute] = (winRouteCount[result.winRoute] || 0) + 1;
        if (division === 'Makuuchi' && isKinboshiEligibleRank(status.rank)) {
          if (opponentRank.name === '横綱') {
            addKinboshi('PLAYER');
          }
        }
        previousResult = 'WIN';
      } else {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        consecutiveWins = 0;
        currentWinStreak = 0;
        currentLossStreak += 1;
        player.currentWinStreak = 0;
        player.currentLossStreak = currentLossStreak;
        opponent.currentWinStreak = (opponent.currentWinStreak ?? 0) + 1;
        opponent.currentLossStreak = 0;
        previousResult = 'LOSS';
      }

      playerBoutDetails.push({
        day,
        result: result.isWin ? 'WIN' : 'LOSS',
        kimarite: result.kimarite,
        winRoute: result.isWin ? result.winRoute : undefined,
        opponentId: opponent.id,
        opponentShikona: opponent.shikona,
        opponentRankName: opponentRank.name,
        opponentRankNumber: opponentRank.number,
        opponentRankSide: opponentRank.side,
        opponentStyleBias: opponent.styleBias ?? 'BALANCE',
      });
    },
    onBye: (participant, day) => {
      if (participant.id !== 'PLAYER') return;
      absent += 1;
      currentWinStreak = 0;
      currentLossStreak = 0;
      participant.currentWinStreak = 0;
      participant.currentLossStreak = 0;
      previousResult = 'ABSENT';
      playerBoutDetails.push({ day, result: 'ABSENT' });
    },
  });

  const existingDays = new Set(playerBoutDetails.map((detail) => detail.day));
  for (let day = 1; day <= numBouts; day += 1) {
    if (existingDays.has(day)) continue;
    absent += 1;
    currentWinStreak = 0;
    currentLossStreak = 0;
    player.currentWinStreak = 0;
    player.currentLossStreak = 0;
    playerBoutDetails.push({ day, result: 'ABSENT' });
  }
  playerBoutDetails.sort((a, b) => a.day - b.day);

  const makuuchiParticipants = toDivisionParticipants(
    participants.filter((participant) => participant.division === 'Makuuchi'),
  );
  const juryoParticipants = toDivisionParticipants(
    participants.filter((participant) => participant.division === 'Juryo'),
  );
  evolveDivisionAfterBasho(world, 'Makuuchi', makuuchiParticipants, rng);
  evolveDivisionAfterBasho(world, 'Juryo', juryoParticipants, rng);

  const divisionParticipants = division === 'Makuuchi' ? makuuchiParticipants : juryoParticipants;
  const divisionResults = world.lastBashoResults[division] ?? [];
  const yushoWinnerId = divisionResults.find((row) => row.yusho)?.id;
  const yusho = yushoWinnerId === 'PLAYER';
  const specialPrizesById = new Map(
    divisionResults.map((row) => [row.id, row.specialPrizes ?? []]),
  );
  const sameDivisionNpcRecords = toNpcAggregateFromTopDivision(division, divisionParticipants, numBouts, {
    yushoWinnerId,
    specialPrizesById,
    kinboshiById,
    makuuchiLayout: world.makuuchiLayout,
  });

  const playerSpecialPrizes = specialPrizesById.get('PLAYER') ?? [];
  const playerKinboshi = kinboshiById.get('PLAYER') ?? 0;

  return {
    playerRecord: {
      year,
      month,
      rank: status.rank,
      wins,
      losses,
      absent,
      yusho,
      specialPrizes: playerSpecialPrizes,
      ...resolvePerformanceMetrics(wins, expectedWins, sosTotal, sosCount),
      kinboshi: playerKinboshi,
      kimariteCount,
      winRouteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords,
    importantTorikumiNotes,
    torikumiDiagnostics: torikumiResult.diagnostics,
  };
};
