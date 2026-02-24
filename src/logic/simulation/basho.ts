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
  resolveTopDivisionFromRank,
  resolveTopDivisionRankValue,
  SimulationWorld,
  syncPlayerActorInWorld,
  TopDivision,
} from './world';
import { resolveTopDivisionRank } from './topDivision/rank';
import { LowerDivisionQuotaWorld, LowerLeagueSnapshots } from './lowerQuota';
import { BoundarySnapshot, LowerDivision } from './lower/types';
import { resolveYushoResolution } from './yusho';
import { rankNumberSideToSlot, resolveDivisionSlots } from '../banzuke/scale/rankScale';
import { PLAYER_ACTOR_ID } from './actors/constants';
import {
  createLowerDivisionBoutDayMap,
  DEFAULT_TORIKUMI_BOUNDARY_BANDS,
  resolveLowerDivisionEligibility,
} from './torikumi/policy';
import { scheduleTorikumiBasho } from './torikumi/scheduler';
import { TorikumiParticipant } from './torikumi/types';
import {
  DEFAULT_SIMULATION_MODEL_VERSION,
  SimulationModelVersion,
} from './modelVersion';

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
  lowerLeagueSnapshots?: LowerLeagueSnapshots;
}

const HONBASHO_TOTAL_DAYS = 15;

const resolveScheduledBoutDay = (boutIndex: number): number =>
  Math.min(HONBASHO_TOTAL_DAYS, 1 + boutIndex * 2);

const resolvePerformanceMetrics = (
  wins: number,
  expectedWins: number,
  sosTotal: number,
  sosCount: number,
): Pick<BashoRecord, 'expectedWins' | 'strengthOfSchedule' | 'performanceOverExpected'> => ({
  expectedWins,
  strengthOfSchedule: sosCount > 0 ? sosTotal / sosCount : 0,
  performanceOverExpected: wins - expectedWins,
});

const toBoundarySnapshotsByDivision = (
  participants: TorikumiParticipant[],
): LowerLeagueSnapshots => {
  const divisions: LowerDivision[] = ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'];
  const result = {
    Makushita: [],
    Sandanme: [],
    Jonidan: [],
    Jonokuchi: [],
  } as LowerLeagueSnapshots;
  for (const division of divisions) {
    result[division] = participants
      .filter((participant) => participant.division === division)
      .map((participant) => ({
        id: participant.id,
        shikona: participant.shikona,
        isPlayer: participant.isPlayer,
        stableId: participant.stableId,
        rankScore: participant.rankScore,
        wins: participant.wins,
        losses: participant.losses,
      } satisfies BoundarySnapshot));
  }
  return result;
};

export const runBashoDetailed = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  world?: SimulationWorld,
  lowerWorld?: LowerDivisionQuotaWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): BashoSimulationResult => {
  if (lowerWorld) {
    syncPlayerToLowerDivisionRoster(status, lowerWorld);
  }
  const topDivision = resolveTopDivisionFromRank(status.rank);
  if (topDivision && world) {
    return runTopDivisionBasho(status, year, month, topDivision, rng, world, simulationModelVersion);
  }
  if (status.rank.division === 'Maezumo' && lowerWorld) {
    return runMaezumoBasho(status, year, month, rng, lowerWorld, simulationModelVersion);
  }
  if (
    (status.rank.division === 'Makushita' ||
      status.rank.division === 'Sandanme' ||
      status.rank.division === 'Jonidan' ||
      status.rank.division === 'Jonokuchi') &&
    lowerWorld
  ) {
    return runLowerDivisionBasho(status, year, month, rng, lowerWorld, world, simulationModelVersion);
  }
  return runSimplifiedBasho(status, year, month, rng, simulationModelVersion);
};

export const runBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  world?: SimulationWorld,
  lowerWorld?: LowerDivisionQuotaWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): BashoRecord => runBashoDetailed(
  status,
  year,
  month,
  rng,
  world,
  lowerWorld,
  simulationModelVersion,
).playerRecord;

const runSimplifiedBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  simulationModelVersion: SimulationModelVersion,
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
    };

    const result = calculateBattleResult(
      withInjuryBattlePenalty(status),
      enemy,
      boutContext,
      rng,
      simulationModelVersion,
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
      ...resolvePerformanceMetrics(wins, expectedWins, sosTotal, sosCount),
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

const LOWER_DIVISIONS: Array<'Makushita' | 'Sandanme' | 'Jonidan' | 'Jonokuchi'> = [
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
];

const syncPlayerToLowerDivisionRoster = (
  status: RikishiStatus,
  lowerWorld: LowerDivisionQuotaWorld,
): void => {
  for (const lowerDivision of LOWER_DIVISIONS) {
    lowerWorld.rosters[lowerDivision] = lowerWorld.rosters[lowerDivision].filter(
      (npc) => npc.id !== PLAYER_ACTOR_ID,
    );
  }

  if (!LOWER_DIVISIONS.includes(status.rank.division as typeof LOWER_DIVISIONS[number])) return;
  const division = status.rank.division as typeof LOWER_DIVISIONS[number];
  const rankScore = resolveLowerRankScore(status.rank, lowerWorld);
  const playerActor = lowerWorld.npcRegistry.get(PLAYER_ACTOR_ID);
  const slots = Math.max(1, lowerWorld.rosters[division].length || resolveDivisionSlots(division));
  const merged = lowerWorld.rosters[division]
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore);
  if (merged.length >= slots) {
    merged.pop();
  }
  merged.push({
    id: PLAYER_ACTOR_ID,
    seedId: PLAYER_ACTOR_ID,
    shikona: status.shikona,
    stableId: 'player-heya',
    division,
    currentDivision: division,
    rankScore,
    basePower: playerActor?.basePower ?? 72,
    ability: playerActor?.ability ?? status.ratingState.ability,
    uncertainty: playerActor?.uncertainty ?? status.ratingState.uncertainty,
    volatility: playerActor?.volatility ?? 1.3,
    form: playerActor?.form ?? Math.max(0.85, Math.min(1.15, 1 + status.ratingState.form * 0.03)),
    styleBias: playerActor?.styleBias ?? 'BALANCE',
    heightCm: playerActor?.heightCm ?? status.bodyMetrics.heightCm,
    weightKg: playerActor?.weightKg ?? status.bodyMetrics.weightKg,
    growthBias: playerActor?.growthBias ?? 0,
    retirementBias: playerActor?.retirementBias ?? 0,
    active: true,
    recentBashoResults: playerActor?.recentBashoResults ?? [],
  });
  lowerWorld.rosters[division] = merged
    .sort((a, b) => a.rankScore - b.rankScore)
    .slice(0, slots);
};

const decodeJuryoRankFromScore = (
  rankScore: number,
): { number: number; side: 'East' | 'West' } => {
  const bounded = Math.max(1, Math.min(28, rankScore));
  return {
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

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
    styleBias: participant.styleBias,
    heightCm: participant.heightCm,
    weightKg: participant.weightKg,
    wins: participant.wins,
    losses: participant.losses,
    currentWinStreak: participant.currentWinStreak,
    currentLossStreak: participant.currentLossStreak,
    expectedWins: participant.expectedWins,
    opponentAbilityTotal: participant.opponentAbilityTotal,
    boutsSimulated: participant.boutsSimulated,
    active: participant.active,
  }));

const runLowerDivisionBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  lowerWorld: LowerDivisionQuotaWorld,
  topWorld?: SimulationWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): BashoSimulationResult => {
  const division = status.rank.division;
  if (
    division !== 'Makushita' &&
    division !== 'Sandanme' &&
    division !== 'Jonidan' &&
    division !== 'Jonokuchi'
  ) {
    return runSimplifiedBasho(status, year, month, rng, simulationModelVersion);
  }

  const numBouts = CONSTANTS.BOUTS_MAP[division];
  let wins = 0;
  let losses = 0;
  let absent = 0;
  let consecutiveWins = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let previousResult: BoutOutcome | undefined;
  const kimariteCount: Record<string, number> = {};
  let expectedWins = 0;
  let sosTotal = 0;
  let sosCount = 0;
  const playerBoutDetails: PlayerBoutDetail[] = [];
  const playerRankScore = resolveLowerRankScore(status.rank, lowerWorld);
  const participants: TorikumiParticipant[] = LOWER_DIVISIONS.flatMap((lowerDivision) =>
    lowerWorld.rosters[lowerDivision]
      .filter((npc) => npc.active !== false)
      .slice()
      .sort((a, b) => a.rankScore - b.rankScore)
      .map((npc) => ({
        id: npc.id,
        shikona: npc.shikona,
        isPlayer: npc.id === PLAYER_ACTOR_ID,
        stableId: npc.stableId,
        division: lowerDivision,
        rankScore: npc.rankScore,
        rankName: resolveLowerRankName(lowerDivision),
        rankNumber: Math.floor((npc.rankScore - 1) / 2) + 1,
        power: Math.round(
          npc.basePower * npc.form + (rng() * 2 - 1) * Math.max(1.2, npc.volatility),
        ),
        ability: Number.isFinite(npc.ability) ? npc.ability : npc.basePower * npc.form,
        styleBias: npc.styleBias ?? 'BALANCE',
        heightCm: npc.heightCm ?? 180,
        weightKg: npc.weightKg ?? 130,
        wins: 0,
        losses: 0,
        currentWinStreak: 0,
        currentLossStreak: 0,
        active: true,
        targetBouts: 7,
        boutsDone: 0,
      })),
  );
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
        division: 'Juryo',
        rankScore: Math.max(1, Math.min(28, guest.rankScore)),
        rankName: '十両',
        rankNumber: rank.number,
        power: Math.round(guest.basePower * guest.form + (rng() * 2 - 1) * 1.6),
        ability: Number.isFinite(guest.ability) ? guest.ability : guest.basePower * guest.form,
        styleBias: guest.styleBias ?? 'BALANCE',
        heightCm: guest.heightCm ?? 186,
        weightKg: guest.weightKg ?? 152,
        wins: 0,
        losses: 0,
        currentWinStreak: 0,
        currentLossStreak: 0,
        active: true,
        targetBouts: 1,
        boutsDone: 0,
      });
    }
  }

  const player = participants.find((participant) => participant.id === PLAYER_ACTOR_ID);
  if (!player) {
    throw new Error('Player participant was not initialized for lower division basho');
  }
  player.shikona = status.shikona;
  player.stableId = 'player-heya';
  player.division = division;
  player.rankScore = playerRankScore;
  player.rankName = resolveLowerRankName(division);
  player.rankNumber = status.rank.number ?? Math.floor((playerRankScore - 1) / 2) + 1;
  player.targetBouts = numBouts;
  player.boutsDone = 0;
  player.active = true;
  player.currentWinStreak = 0;
  player.currentLossStreak = 0;
  const lowerDayMap = createLowerDivisionBoutDayMap(participants, rng);
  const playerPlannedDays =
    [...(lowerDayMap.get('PLAYER') ?? new Set(Array.from({ length: numBouts }, (_, i) => resolveScheduledBoutDay(i))))].sort(
      (a, b) => a - b,
    );
  if (resolveInjuryParticipation(status).mustSitOut) {
    player.active = false;
  }
  scheduleTorikumiBasho({
    participants,
    days: Array.from({ length: 15 }, (_, index) => index + 1),
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) =>
      band.id === 'JuryoMakushita' ||
      band.id === 'MakushitaSandanme' ||
      band.id === 'SandanmeJonidan' ||
      band.id === 'JonidanJonokuchi'),
    facedMap: createFacedMap(participants),
    dayEligibility: (participant, day) => {
      if (participant.id.startsWith('JURYO_GUEST_')) return day >= 1 && day <= 15;
      return resolveLowerDivisionEligibility(participant, day, lowerDayMap);
    },
    onPair: ({ a, b }, day) => {
      if (!a.isPlayer && !b.isPlayer) {
        simulateNpcBout(a, b, rng, simulationModelVersion);
        return;
      }

      const opponent = a.isPlayer ? b : a;
      const opponentDivision = opponent.division;
      const juryoGuestRank = juryoGuestRankById.get(opponent.id);
      const rankName =
        opponentDivision === 'Juryo' ? '十両' : resolveLowerRankName(opponentDivision);
      const rankNumber = juryoGuestRank
        ? juryoGuestRank.number
        : Math.floor((opponent.rankScore - 1) / 2) + 1;
      const rankSide = juryoGuestRank
        ? juryoGuestRank.side
        : (opponent.rankScore % 2 === 1 ? 'East' : 'West');
      const rankValue =
        opponentDivision === 'Juryo'
          ? 6
          : LOWER_RANK_VALUE_MAP[opponentDivision as keyof typeof LOWER_RANK_VALUE_MAP];

      if (rng() < resolveInjuryRate(status)) {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        player.currentWinStreak = 0;
        player.currentLossStreak = (player.currentLossStreak ?? 0) + 1;
        opponent.currentWinStreak = (opponent.currentWinStreak ?? 0) + 1;
        opponent.currentLossStreak = 0;
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
        if (resolveInjuryParticipation(status).mustSitOut) {
          player.active = false;
        }
        consecutiveWins = 0;
        currentWinStreak = 0;
        currentLossStreak += 1;
        previousResult = 'LOSS';
        return;
      }

      const isLastBout = player.boutsDone >= numBouts;
      const isYushoContention = isLastBout && wins >= numBouts - 1;
      const boutContext: BoutContext = {
        day,
        currentWins: wins,
        currentLosses: losses,
        consecutiveWins,
        currentWinStreak,
        currentLossStreak,
        opponentWinStreak: opponent.currentWinStreak ?? 0,
        opponentLossStreak: opponent.currentLossStreak ?? 0,
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
        ability: opponent.ability ?? opponent.power,
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? 180,
        weightKg: opponent.weightKg ?? 130,
      };
      const result = calculateBattleResult(
        withInjuryBattlePenalty(status),
        enemy,
        boutContext,
        rng,
        simulationModelVersion,
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
        player.currentLossStreak = currentLossStreak;
        opponent.currentLossStreak = (opponent.currentLossStreak ?? 0) + 1;
        opponent.currentWinStreak = 0;
        kimariteCount[result.kimarite] = (kimariteCount[result.kimarite] || 0) + 1;
        previousResult = 'WIN';
      } else {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        consecutiveWins = 0;
        currentWinStreak = 0;
        currentLossStreak += 1;
        player.currentWinStreak = currentWinStreak;
        player.currentLossStreak = currentLossStreak;
        opponent.currentWinStreak = (opponent.currentWinStreak ?? 0) + 1;
        opponent.currentLossStreak = 0;
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

  const recordedDays = new Set(playerBoutDetails.map((detail) => detail.day));
  for (const day of playerPlannedDays) {
    if (recordedDays.has(day)) continue;
    absent += 1;
    currentWinStreak = 0;
    currentLossStreak = 0;
    player.currentWinStreak = 0;
    player.currentLossStreak = 0;
    playerBoutDetails.push({ day, result: 'ABSENT' });
    previousResult = 'ABSENT';
  }
  playerBoutDetails.sort((a, b) => a.day - b.day);

  const yushoResolution = resolveYushoResolution(
    participants
      .filter((participant) =>
        !participant.id.startsWith('JURYO_GUEST_') &&
        participant.division === division)
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
      ...resolvePerformanceMetrics(wins, expectedWins, sosTotal, sosCount),
      kimariteCount,
    },
    playerBoutDetails,
    sameDivisionNpcRecords: [],
    lowerLeagueSnapshots: toBoundarySnapshotsByDivision(
      participants.filter((participant) => !participant.id.startsWith('JURYO_GUEST_')),
    ),
  };
};

const runMaezumoBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  lowerWorld: LowerDivisionQuotaWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
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
        shikona: opponent.shikona,
        rankValue: 11,
        rankName: '前相撲',
        rankNumber: 1,
        rankSide: 'East' as const,
        power: Math.round(opponent.basePower * opponent.form + (rng() * 2 - 1) * Math.max(1, opponent.volatility)),
        ability: opponent.ability ?? opponent.basePower * opponent.form,
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
        currentWinStreak,
        currentLossStreak,
        isLastDay: boutIndex === numBouts - 1,
        isYushoContention: false,
        previousResult,
      },
      rng,
      simulationModelVersion,
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

const runTopDivisionBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  division: TopDivision,
  rng: RandomSource,
  world: SimulationWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
): BashoSimulationResult => {
  syncPlayerActorInWorld(world, status);
  const numBouts = CONSTANTS.BOUTS_MAP[division];
  const kimariteCount: Record<string, number> = {};
  let wins = 0;
  let losses = 0;
  let absent = 0;
  let consecutiveWins = 0;
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let previousResult: BoutOutcome | undefined;
  const playerBoutDetails: PlayerBoutDetail[] = [];
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
  if (resolveInjuryParticipation(status).mustSitOut) {
    player.active = false;
  }

  const addKinboshi = (id: string): void => {
    kinboshiById.set(id, (kinboshiById.get(id) ?? 0) + 1);
  };

  scheduleTorikumiBasho({
    participants,
    days: Array.from({ length: 15 }, (_, index) => index + 1),
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) => band.id === 'MakuuchiJuryo'),
    facedMap: createFacedMap(participants),
    dayEligibility: () => true,
    onPair: ({ a, b }, day) => {
      if (!a.isPlayer && !b.isPlayer) {
        const aDivision = a.division as TopDivision;
        const bDivision = b.division as TopDivision;
        const aRank = resolveTopDivisionRank(aDivision, a.rankScore, world.makuuchiLayout);
        const bRank = resolveTopDivisionRank(bDivision, b.rankScore, world.makuuchiLayout);
        const aWinsBefore = a.wins;
        simulateNpcBout(a, b, rng, simulationModelVersion);
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

        playerBoutDetails.push({
          day,
          result: 'LOSS',
          opponentId: opponent.id,
          opponentShikona: opponent.shikona,
          opponentRankName: opponentRank.name,
          opponentRankNumber: opponentRank.number,
          opponentRankSide: opponentRank.side,
        });

        applyGeneratedInjury(status, generateInjury(status, year, month, rng));
        if (resolveInjuryParticipation(status).mustSitOut) {
          player.active = false;
        }
        return;
      }

      const enemy = {
        shikona: opponent.shikona,
        rankValue: resolveTopDivisionRankValue(
          opponentDivision,
          opponent.rankScore,
          world.makuuchiLayout,
        ),
        power: Math.round(opponent.power + (rng() * 2 - 1) * 1.5),
        ability: opponent.ability ?? opponent.power,
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? (opponentDivision === 'Makuuchi' ? 188 : 186),
        weightKg: opponent.weightKg ?? (opponentDivision === 'Makuuchi' ? 160 : 152),
      };

      const isLastDay = day === numBouts;
      const isYushoContention = isLastDay && wins >= numBouts - 2;
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
        previousResult,
      };

      const result = calculateBattleResult(
        withInjuryBattlePenalty(status),
        enemy,
        boutContext,
        rng,
        simulationModelVersion,
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
        opponentId: opponent.id,
        opponentShikona: opponent.shikona,
        opponentRankName: opponentRank.name,
        opponentRankNumber: opponentRank.number,
        opponentRankSide: opponentRank.side,
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
    },
    playerBoutDetails,
    sameDivisionNpcRecords,
  };
};
