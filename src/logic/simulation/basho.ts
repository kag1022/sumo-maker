import { calculateBattleResult, generateEnemy, BoutContext } from '../battle';
import { CONSTANTS } from '../constants';
import { BashoRecord, Rank, RikishiStatus } from '../models';
import { RandomSource } from './deps';
import {
  applyGeneratedInjury,
  generateInjury,
  resolveInjuryParticipation,
  resolveInjuryRate,
  withInjuryBattlePenalty,
} from './injury';
import {
  createDailyMatchups,
  createFacedMap,
  DivisionParticipant,
  simulateNpcBout,
} from './matchmaking';
import {
  addAbsentBoutDetails,
  isKinboshiEligibleRank,
  toNpcAggregateFromTopDivision,
} from './topDivision/bashoSummary';
import {
  createDivisionParticipants,
  evolveDivisionAfterBasho,
  resolvePlayerRankScore,
  resolveTopDivisionFromRank,
  resolveTopDivisionRankValue,
  SimulationWorld,
  TopDivision,
} from './world';
import { resolveTopDivisionRank } from './topDivision/rank';
import { LowerDivisionQuotaWorld } from './lowerQuota';
import { resolveYushoResolution } from './yusho';
import { rankNumberSideToSlot, resolveDivisionSlots } from '../banzuke/scale/rankScale';

export type BoutOutcome = 'WIN' | 'LOSS' | 'ABSENT';

export interface PlayerBoutDetail {
  day: number;
  result: BoutOutcome;
  kimarite?: string;
  opponentId?: string;
  opponentShikona?: string;
  opponentRankName?: string;
  opponentRankNumber?: number;
  opponentRankSide?: 'East' | 'West';
}

export interface NpcBashoAggregate {
  entityId: string;
  shikona: string;
  division: Rank['division'];
  rankName: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  wins: number;
  losses: number;
  absent: number;
  titles: string[];
}

export interface BashoSimulationResult {
  playerRecord: BashoRecord;
  playerBoutDetails: PlayerBoutDetail[];
  sameDivisionNpcRecords: NpcBashoAggregate[];
}

const HONBASHO_TOTAL_DAYS = 15;

const resolveScheduledBoutDay = (boutIndex: number): number =>
  Math.min(HONBASHO_TOTAL_DAYS, 1 + boutIndex * 2);

const addScheduledAbsentBoutDetails = (
  details: PlayerBoutDetail[],
  startBoutIndex: number,
  totalBouts: number,
): void => {
  for (let boutIndex = startBoutIndex; boutIndex < totalBouts; boutIndex += 1) {
    details.push({
      day: resolveScheduledBoutDay(boutIndex),
      result: 'ABSENT',
    });
  }
};

export const runBashoDetailed = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  world?: SimulationWorld,
  lowerWorld?: LowerDivisionQuotaWorld,
): BashoSimulationResult => {
  const topDivision = resolveTopDivisionFromRank(status.rank);
  if (topDivision && world) {
    return runTopDivisionBasho(status, year, month, topDivision, rng, world);
  }
  if (status.rank.division === 'Maezumo' && lowerWorld) {
    return runMaezumoBasho(status, year, month, rng, lowerWorld);
  }
  if (
    (status.rank.division === 'Makushita' ||
      status.rank.division === 'Sandanme' ||
      status.rank.division === 'Jonidan' ||
      status.rank.division === 'Jonokuchi') &&
    lowerWorld
  ) {
    return runLowerDivisionBasho(status, year, month, rng, lowerWorld, world);
  }
  return runSimplifiedBasho(status, year, month, rng);
};

export const runBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  world?: SimulationWorld,
  lowerWorld?: LowerDivisionQuotaWorld,
): BashoRecord => runBashoDetailed(status, year, month, rng, world, lowerWorld).playerRecord;

const runSimplifiedBasho = (
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
  let previousResult: BoutOutcome | undefined;
  let kinboshi = 0;
  const kimariteCount: Record<string, number> = {};
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
      },
      playerBoutDetails,
      sameDivisionNpcRecords: [],
    };
  }

  for (let day = 1; day <= numBouts; day += 1) {
    if (rng() < resolveInjuryRate(status)) {
      losses += 1;
      playerBoutDetails.push({ day, result: 'LOSS' });
      applyGeneratedInjury(status, generateInjury(status, year, month, rng));
      const postInjury = resolveInjuryParticipation(status);
      if (postInjury.mustSitOut) {
        const remaining = numBouts - day;
        absent += remaining;
        addAbsentBoutDetails(playerBoutDetails, day + 1, numBouts);
        break;
      }
      consecutiveWins = 0;
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
      isLastDay,
      isYushoContention,
      previousResult,
    };

    const result = calculateBattleResult(withInjuryBattlePenalty(status), enemy, boutContext, rng);

    if (result.isWin) {
      wins += 1;
      consecutiveWins += 1;
      kimariteCount[result.kimarite] = (kimariteCount[result.kimarite] || 0) + 1;
      if (isKinboshiEligibleRank(status.rank) && enemy.rankName === '横綱') {
        kinboshi += 1;
      }
      previousResult = 'WIN';
    } else {
      losses += 1;
      consecutiveWins = 0;
      previousResult = 'LOSS';
    }

    playerBoutDetails.push({
      day,
      result: result.isWin ? 'WIN' : 'LOSS',
      kimarite: result.kimarite,
      opponentId: enemy.id,
      opponentShikona: enemy.shikona,
      opponentRankName: enemy.rankName,
      opponentRankNumber: enemy.rankNumber,
      opponentRankSide: enemy.rankSide,
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
      kinboshi,
      kimariteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords: [],
  };
};

const resolveLowerRankScore = (rank: Rank, lowerWorld: LowerDivisionQuotaWorld): number => {
  if (
    rank.division !== 'Makushita' &&
    rank.division !== 'Sandanme' &&
    rank.division !== 'Jonidan' &&
    rank.division !== 'Jonokuchi'
  ) {
    return 1;
  }
  const slots = resolveDivisionSlots(rank.division, {
    Makushita: lowerWorld.rosters.Makushita.length,
    Sandanme: lowerWorld.rosters.Sandanme.length,
    Jonidan: lowerWorld.rosters.Jonidan.length,
    Jonokuchi: lowerWorld.rosters.Jonokuchi.length,
  });
  return rankNumberSideToSlot(rank.number ?? 1, rank.side, slots);
};

const resolveLowerRankName = (division: Rank['division']): string => {
  if (division === 'Makushita') return '幕下';
  if (division === 'Sandanme') return '三段目';
  if (division === 'Jonidan') return '序二段';
  if (division === 'Jonokuchi') return '序ノ口';
  return '前相撲';
};

const LOWER_RANK_VALUE_MAP = {
  Makushita: 7,
  Sandanme: 8,
  Jonidan: 9,
  Jonokuchi: 10,
} as const;

const decodeJuryoRankFromScore = (
  rankScore: number,
): { number: number; side: 'East' | 'West' } => {
  const bounded = Math.max(1, Math.min(28, rankScore));
  return {
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

const runLowerDivisionBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  lowerWorld: LowerDivisionQuotaWorld,
  topWorld?: SimulationWorld,
): BashoSimulationResult => {
  const division = status.rank.division;
  if (
    division !== 'Makushita' &&
    division !== 'Sandanme' &&
    division !== 'Jonidan' &&
    division !== 'Jonokuchi'
  ) {
    return runSimplifiedBasho(status, year, month, rng);
  }

  const numBouts = CONSTANTS.BOUTS_MAP[division];
  let wins = 0;
  let losses = 0;
  let absent = 0;
  let consecutiveWins = 0;
  let previousResult: BoutOutcome | undefined;
  const kimariteCount: Record<string, number> = {};
  const playerBoutDetails: PlayerBoutDetail[] = [];
  const playerRankScore = resolveLowerRankScore(status.rank, lowerWorld);
  const participants: DivisionParticipant[] = lowerWorld.rosters[division]
    .filter((npc) => npc.active !== false)
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc) => ({
      id: npc.id,
      shikona: npc.shikona,
      isPlayer: false,
      stableId: npc.stableId,
      rankScore: npc.rankScore,
      power: Math.round(
        npc.basePower * npc.form + (rng() * 2 - 1) * Math.max(1.2, npc.volatility),
      ),
      styleBias: npc.styleBias ?? 'BALANCE',
      heightCm: npc.heightCm ?? 180,
      weightKg: npc.weightKg ?? 130,
      wins: 0,
      losses: 0,
      active: true,
    }));
  const juryoGuestRankById = new Map<string, { number: number; side: 'East' | 'West' }>();

  if (
    division === 'Makushita' &&
    (status.rank.number ?? 1) <= 15 &&
    topWorld &&
    topWorld.rosters.Juryo.length > 0
  ) {
    const guestCandidates = topWorld.rosters.Juryo
      .slice()
      .sort((a, b) => b.rankScore - a.rankScore)
      .slice(0, 6);
    for (const guest of guestCandidates) {
      const guestId = `JURYO_GUEST_${guest.id}`;
      const rank = decodeJuryoRankFromScore(guest.rankScore);
      juryoGuestRankById.set(guestId, rank);
      participants.push({
        id: guestId,
        shikona: guest.shikona,
        isPlayer: false,
        stableId: guest.stableId,
        rankScore: Math.max(1, Math.min(32, guest.rankScore)),
        power: Math.round(guest.basePower * guest.form + (rng() * 2 - 1) * 1.6),
        styleBias: guest.styleBias ?? 'BALANCE',
        heightCm: guest.heightCm ?? 186,
        weightKg: guest.weightKg ?? 152,
        wins: 0,
        losses: 0,
        active: true,
      });
    }
  }

  if (resolveInjuryParticipation(status).mustSitOut) {
    addScheduledAbsentBoutDetails(playerBoutDetails, 0, numBouts);
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
      },
      playerBoutDetails,
      sameDivisionNpcRecords: [],
    };
  }

  if (!participants.length) {
    addScheduledAbsentBoutDetails(playerBoutDetails, 0, numBouts);
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
      },
      playerBoutDetails,
      sameDivisionNpcRecords: [],
    };
  }

  const replaceIndex = participants.length - 1;
  participants.splice(replaceIndex, 1);
  const player: DivisionParticipant = {
    id: 'PLAYER',
    shikona: status.shikona,
    isPlayer: true,
    stableId: 'player-heya',
    rankScore: playerRankScore,
    power: 0,
    wins: 0,
    losses: 0,
    active: true,
  };
  participants.push(player);
  const facedMap = createFacedMap(participants);

  for (let boutIndex = 0; boutIndex < numBouts; boutIndex += 1) {
    const day = resolveScheduledBoutDay(boutIndex);
    const dailyMatchups = createDailyMatchups(participants, facedMap, rng, day, HONBASHO_TOTAL_DAYS);
    let playerRecordedToday = false;
    if (dailyMatchups.byeIds.includes(player.id)) {
      absent += 1;
      playerBoutDetails.push({ day, result: 'ABSENT' });
      playerRecordedToday = true;
      previousResult = 'ABSENT';
    }

    for (const { a, b } of dailyMatchups.pairs) {
      if (!a.isPlayer && !b.isPlayer) {
        simulateNpcBout(a, b, rng);
        continue;
      }

      const opponent = a.isPlayer ? b : a;
      const juryoGuestRank = juryoGuestRankById.get(opponent.id);
      const rankName = juryoGuestRank ? '十両' : resolveLowerRankName(division);
      const rankNumber = juryoGuestRank
        ? juryoGuestRank.number
        : Math.floor((opponent.rankScore - 1) / 2) + 1;
      const rankSide = juryoGuestRank
        ? juryoGuestRank.side
        : (opponent.rankScore % 2 === 1 ? 'East' : 'West');
      const rankValue = juryoGuestRank ? 6 : LOWER_RANK_VALUE_MAP[division];

      if (rng() < resolveInjuryRate(status)) {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        playerBoutDetails.push({
          day,
          result: 'LOSS',
          opponentId: opponent.id,
          opponentShikona: opponent.shikona,
          opponentRankName: rankName,
          opponentRankNumber: rankNumber,
          opponentRankSide: rankSide,
        });
        applyGeneratedInjury(status, generateInjury(status, year, month, rng));
        const postInjury = resolveInjuryParticipation(status);
        if (postInjury.mustSitOut) {
          addScheduledAbsentBoutDetails(playerBoutDetails, boutIndex + 1, numBouts);
          absent += numBouts - (boutIndex + 1);
          return {
            playerRecord: {
              year,
              month,
              rank: status.rank,
              wins,
              losses,
              absent,
              yusho: false,
              specialPrizes: [],
              kimariteCount,
            },
            playerBoutDetails,
            sameDivisionNpcRecords: [],
          };
        }
        consecutiveWins = 0;
        previousResult = 'LOSS';
        playerRecordedToday = true;
        continue;
      }

      const isLastBout = boutIndex === numBouts - 1;
      const isYushoContention = isLastBout && wins >= numBouts - 1;
      const boutContext: BoutContext = {
        day,
        currentWins: wins,
        currentLosses: losses,
        consecutiveWins,
        isLastDay: isLastBout,
        isYushoContention,
        previousResult,
      };
      const enemy = {
        id: opponent.id,
        shikona: opponent.shikona,
        rankValue,
        rankName,
        rankNumber,
        rankSide,
        power: Math.round(opponent.power + (rng() * 2 - 1) * 1.4),
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? 180,
        weightKg: opponent.weightKg ?? 130,
      };
      const result = calculateBattleResult(withInjuryBattlePenalty(status), enemy, boutContext, rng);
      if (result.isWin) {
        wins += 1;
        player.wins += 1;
        opponent.losses += 1;
        consecutiveWins += 1;
        kimariteCount[result.kimarite] = (kimariteCount[result.kimarite] || 0) + 1;
        previousResult = 'WIN';
      } else {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        consecutiveWins = 0;
        previousResult = 'LOSS';
      }

      playerBoutDetails.push({
        day,
        result: result.isWin ? 'WIN' : 'LOSS',
        kimarite: result.kimarite,
        opponentId: enemy.id,
        opponentShikona: enemy.shikona,
        opponentRankName: enemy.rankName,
        opponentRankNumber: enemy.rankNumber,
        opponentRankSide: enemy.rankSide,
      });
      playerRecordedToday = true;
    }

    if (!playerRecordedToday) {
      absent += 1;
      playerBoutDetails.push({ day, result: 'ABSENT' });
      previousResult = 'ABSENT';
    }
  }

  const yushoResolution = resolveYushoResolution(
    participants
      .filter((participant) => !participant.id.startsWith('JURYO_GUEST_'))
      .map((participant) => ({
        id: participant.id,
        wins: participant.wins,
        losses: participant.losses,
        rankScore: participant.rankScore,
        power: participant.power,
      })),
    rng,
  );
  const yusho = yushoResolution.winnerId === 'PLAYER';
  return {
    playerRecord: {
      year,
      month,
      rank: status.rank,
      wins,
      losses,
      absent,
      yusho,
      specialPrizes: [],
      kimariteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords: [],
  };
};

const runMaezumoBasho = (
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
  let previousResult: BoutOutcome | undefined;
  const kimariteCount: Record<string, number> = {};
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
        shikona: opponent.shikona,
        rankValue: 11,
        rankName: '前相撲',
        rankNumber: 1,
        rankSide: 'East' as const,
        power: Math.round(opponent.basePower * opponent.form + (rng() * 2 - 1) * Math.max(1, opponent.volatility)),
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? 176,
        weightKg: opponent.weightKg ?? 100,
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
        isLastDay: boutIndex === numBouts - 1,
        isYushoContention: false,
        previousResult,
      },
      rng,
    );

    if (result.isWin) {
      wins += 1;
      consecutiveWins += 1;
      kimariteCount[result.kimarite] = (kimariteCount[result.kimarite] || 0) + 1;
      previousResult = 'WIN';
    } else {
      losses += 1;
      consecutiveWins = 0;
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
      kimariteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords: [],
  };
};

const runTopDivisionBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  division: TopDivision,
  rng: RandomSource,
  world: SimulationWorld,
): BashoSimulationResult => {
  const numBouts = CONSTANTS.BOUTS_MAP[division];
  const kimariteCount: Record<string, number> = {};
  let wins = 0;
  let losses = 0;
  let absent = 0;
  let consecutiveWins = 0;
  let previousResult: BoutOutcome | undefined;
  const playerBoutDetails: PlayerBoutDetail[] = [];
  const kinboshiById = new Map<string, number>();

  const participants = createDivisionParticipants(world, division, rng, {
    shikona: status.shikona,
    rankScore: resolvePlayerRankScore(status.rank, world.makuuchiLayout),
  });
  const facedMap = createFacedMap(participants);
  const player = participants.find((participant) => participant.isPlayer);
  if (!player) {
    throw new Error('Player participant was not initialized for top division basho');
  }
  if (resolveInjuryParticipation(status).mustSitOut) {
    player.active = false;
  }

  const addKinboshi = (id: string): void => {
    kinboshiById.set(id, (kinboshiById.get(id) ?? 0) + 1);
  };

  for (let day = 1; day <= numBouts; day += 1) {
    const dailyMatchups = createDailyMatchups(participants, facedMap, rng, day, numBouts);
    let playerRecordedToday = false;
    if (dailyMatchups.byeIds.includes(player.id)) {
      absent += 1;
      playerBoutDetails.push({ day, result: 'ABSENT' });
      playerRecordedToday = true;
      previousResult = 'ABSENT';
    }

    for (const { a, b } of dailyMatchups.pairs) {
      if (!a.isPlayer && !b.isPlayer) {
        const aRank = resolveTopDivisionRank(division, a.rankScore, world.makuuchiLayout);
        const bRank = resolveTopDivisionRank(division, b.rankScore, world.makuuchiLayout);
        const aWinsBefore = a.wins;
        simulateNpcBout(a, b, rng);
        if (division === 'Makuuchi') {
          const aWon = a.wins > aWinsBefore;
          const winner = aWon ? a : b;
          const winnerRank = aWon ? aRank : bRank;
          const loserRank = aWon ? bRank : aRank;
          if (winnerRank.name === '前頭' && loserRank.name === '横綱') {
            addKinboshi(winner.id);
          }
        }
        continue;
      }

      const opponent = a.isPlayer ? b : a;
      if (!player.active) {
        opponent.wins += 1;
        if (!playerRecordedToday) {
          absent += 1;
          const opponentRankForAbsent = resolveTopDivisionRank(
            division,
            opponent.rankScore,
            world.makuuchiLayout,
          );
          playerBoutDetails.push({
            day,
            result: 'ABSENT',
            opponentId: opponent.id,
            opponentShikona: opponent.shikona,
            opponentRankName: opponentRankForAbsent.name,
            opponentRankNumber: opponentRankForAbsent.number,
            opponentRankSide: opponentRankForAbsent.side,
          });
          playerRecordedToday = true;
          previousResult = 'ABSENT';
        }
        continue;
      }

      if (rng() < resolveInjuryRate(status)) {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        consecutiveWins = 0;
        playerRecordedToday = true;
        previousResult = 'LOSS';

        playerBoutDetails.push({
          day,
          result: 'LOSS',
          opponentId: opponent.id,
          opponentShikona: opponent.shikona,
          opponentRankName: resolveTopDivisionRank(
            division,
            opponent.rankScore,
            world.makuuchiLayout,
          ).name,
          opponentRankNumber: resolveTopDivisionRank(
            division,
            opponent.rankScore,
            world.makuuchiLayout,
          ).number,
          opponentRankSide: resolveTopDivisionRank(
            division,
            opponent.rankScore,
            world.makuuchiLayout,
          ).side,
        });

        applyGeneratedInjury(status, generateInjury(status, year, month, rng));
        const postInjury = resolveInjuryParticipation(status);
        if (postInjury.mustSitOut) {
          player.active = false;
        }
        continue;
      }

      const enemy = {
        shikona: opponent.shikona,
        rankValue: resolveTopDivisionRankValue(division, opponent.rankScore, world.makuuchiLayout),
        power: Math.round(opponent.power + (rng() * 2 - 1) * 1.5),
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? (division === 'Makuuchi' ? 188 : 186),
        weightKg: opponent.weightKg ?? (division === 'Makuuchi' ? 160 : 152),
      };

      const isLastDay = day === numBouts;
      const isYushoContention = isLastDay && wins >= numBouts - 2;
      const boutContext: BoutContext = {
        day,
        currentWins: wins,
        currentLosses: losses,
        consecutiveWins,
        isLastDay,
        isYushoContention,
        previousResult,
      };

      const result = calculateBattleResult(withInjuryBattlePenalty(status), enemy, boutContext, rng);
      if (result.isWin) {
        wins += 1;
        player.wins += 1;
        opponent.losses += 1;
        consecutiveWins += 1;
        kimariteCount[result.kimarite] = (kimariteCount[result.kimarite] || 0) + 1;
        if (division === 'Makuuchi' && isKinboshiEligibleRank(status.rank)) {
          const opponentRankForKinboshi = resolveTopDivisionRank(
            division,
            opponent.rankScore,
            world.makuuchiLayout,
          );
          if (opponentRankForKinboshi.name === '横綱') {
            addKinboshi('PLAYER');
          }
        }
        previousResult = 'WIN';
      } else {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        consecutiveWins = 0;
        previousResult = 'LOSS';
      }

      const opponentRank = resolveTopDivisionRank(division, opponent.rankScore, world.makuuchiLayout);
      playerBoutDetails.push({
        day,
        result: result.isWin ? 'WIN' : 'LOSS',
        kimarite: result.kimarite,
        opponentId: opponent.id,
        opponentShikona: opponent.shikona,
        opponentRankName: opponentRank.name,
        opponentRankNumber: opponentRank.number,
        opponentRankSide: opponentRank.side,
      });
      playerRecordedToday = true;
    }

    if (!playerRecordedToday) {
      absent += 1;
      playerBoutDetails.push({ day, result: 'ABSENT' });
      previousResult = 'ABSENT';
    }
  }

  const accountedBouts = wins + losses + absent;
  if (accountedBouts < numBouts) {
    const missing = numBouts - accountedBouts;
    absent += missing;
    const existingDays = new Set(playerBoutDetails.map((detail) => detail.day));
    for (let day = 1; day <= numBouts; day += 1) {
      if (!existingDays.has(day)) {
        playerBoutDetails.push({ day, result: 'ABSENT' });
      }
    }
    playerBoutDetails.sort((a, b) => a.day - b.day);
  }

  evolveDivisionAfterBasho(world, division, participants, rng);
  const divisionResults = world.lastBashoResults[division] ?? [];
  const yushoWinnerId = divisionResults.find((row) => row.yusho)?.id;
  const yusho = yushoWinnerId === 'PLAYER';
  const specialPrizesById = new Map(
    divisionResults.map((row) => [row.id, row.specialPrizes ?? []]),
  );
  const sameDivisionNpcRecords = toNpcAggregateFromTopDivision(division, participants, numBouts, {
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
      kinboshi: playerKinboshi,
      kimariteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords,
  };
};
