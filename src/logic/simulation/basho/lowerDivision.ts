import { BoutContext, calculateBattleResult } from '../../battle';
import { rankNumberSideToSlot, resolveDivisionSlots } from '../../banzuke/scale/rankScale';
import { CONSTANTS } from '../../constants';
import { Rank, RikishiStatus } from '../../models';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { RandomSource } from '../deps';
import { resolveStableById } from '../heya/stableCatalog';
import { STABLE_ARCHETYPE_BY_ID } from '../heya/stableArchetypeCatalog';
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
import { LowerDivisionQuotaWorld } from '../lowerQuota';
import { DEFAULT_SIMULATION_MODEL_VERSION, SimulationModelVersion } from '../modelVersion';
import { resolveBashoFormDelta } from '../variance/bashoVariance';
import {
  createLowerDivisionBoutDayMap,
  DEFAULT_TORIKUMI_BOUNDARY_BANDS,
  resolveLowerDivisionEligibility,
} from '../torikumi/policy';
import { scheduleTorikumiBasho } from '../torikumi/scheduler';
import { TorikumiParticipant } from '../torikumi/types';
import { SimulationWorld } from '../world';
import { resolveYushoResolution } from '../yusho';
import { runSimplifiedBasho } from './simplified';
import {
  resolvePerformanceMetrics,
  resolveScheduledBoutDay,
  toBoundarySnapshotsByDivision,
} from './shared';
import {
  BashoSimulationResult,
  BoutOutcome,
  PlayerBoutDetail,
  buildImportantTorikumiNote,
  type ImportantTorikumiNote,
} from './types';

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

const DIVISION_ORDER: Record<TorikumiParticipant['division'], number> = {
  Makuuchi: 0,
  Juryo: 1,
  Makushita: 2,
  Sandanme: 3,
  Jonidan: 4,
  Jonokuchi: 5,
};

const resolvePlayerBoundaryImplication = (
  pair: { a: TorikumiParticipant; b: TorikumiParticipant; boundaryId?: string; matchReason: string; boundaryImplication?: BoutContext['boundaryImplication'] },
  playerId: string,
): BoutContext['boundaryImplication'] => {
  const self = pair.a.id === playerId ? pair.a : pair.b.id === playerId ? pair.b : null;
  const opponent = self ? (self.id === pair.a.id ? pair.b : pair.a) : null;
  if (!self || !opponent) return pair.boundaryImplication ?? 'NONE';
  if (pair.boundaryId === 'JuryoMakushita') {
    return self.division === 'Makushita' ? 'PROMOTION' : 'DEMOTION';
  }
  if (pair.matchReason === 'JURYO_PROMOTION_RACE') return 'PROMOTION';
  if (pair.matchReason === 'JURYO_DEMOTION_RACE') return 'DEMOTION';
  if (pair.matchReason === 'LOWER_BOUNDARY_EVAL' || pair.boundaryId) {
    return DIVISION_ORDER[self.division] < DIVISION_ORDER[opponent.division] ? 'DEMOTION' : 'PROMOTION';
  }
  return pair.boundaryImplication ?? 'NONE';
};

export const syncPlayerToLowerDivisionRoster = (
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
    stableId: status.stableId,
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
    aptitudeTier: playerActor?.aptitudeTier ?? status.aptitudeTier,
    aptitudeFactor: playerActor?.aptitudeFactor ?? status.aptitudeFactor,
    aptitudeProfile: playerActor?.aptitudeProfile ?? status.aptitudeProfile,
    careerBand: playerActor?.careerBand ?? status.careerBand,
    growthBias: playerActor?.growthBias ?? 0,
    retirementBias: playerActor?.retirementBias ?? 0,
    retirementProfile: playerActor?.retirementProfile ?? status.retirementProfile ?? 'STANDARD',
    active: true,
    stagnation: playerActor?.stagnation ?? status.stagnation,
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

export const runLowerDivisionBasho = (
  status: RikishiStatus,
  year: number,
  month: number,
  rng: RandomSource,
  lowerWorld: LowerDivisionQuotaWorld,
  topWorld?: SimulationWorld,
  simulationModelVersion: SimulationModelVersion = DEFAULT_SIMULATION_MODEL_VERSION,
  forcedPlayerBashoFormDelta?: number,
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
  let currentWinStreak = 0;
  let currentLossStreak = 0;
  let previousResult: BoutOutcome | undefined;
  const kimariteCount: Record<string, number> = {};
  let expectedWins = 0;
  let sosTotal = 0;
  let sosCount = 0;
  const playerBoutDetails: PlayerBoutDetail[] = [];
  const importantTorikumiNotes: ImportantTorikumiNote[] = [];
  const playerRankScore = resolveLowerRankScore(status.rank, lowerWorld);
  const participants: TorikumiParticipant[] = LOWER_DIVISIONS.flatMap((lowerDivision) =>
    lowerWorld.rosters[lowerDivision]
      .filter((npc) => npc.active !== false)
      .slice()
      .sort((a, b) => a.rankScore - b.rankScore)
      .map((npc) => {
        const bashoFormDelta = true
          ? resolveBashoFormDelta({
            uncertainty: npc.uncertainty,
            volatility: npc.volatility,
            rng,
          }).bashoFormDelta
          : 0;
        return {
          id: npc.id,
          shikona: lowerWorld.npcRegistry.get(npc.id)?.shikona ?? npc.shikona,
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
          bashoFormDelta,
          styleBias: npc.styleBias ?? 'BALANCE',
          heightCm: npc.heightCm ?? 180,
          weightKg: npc.weightKg ?? 130,
          aptitudeTier: npc.aptitudeTier,
          aptitudeFactor: npc.aptitudeFactor,
          aptitudeProfile: npc.aptitudeProfile,
          careerBand: npc.careerBand,
          wins: 0,
          losses: 0,
          currentWinStreak: 0,
          currentLossStreak: 0,
          active: true,
          stagnation: npc.stagnation,
          targetBouts: 7,
          boutsDone: 0,
        };
      }),
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
      const guestBashoFormDelta = true
        ? resolveBashoFormDelta({
          uncertainty: guest.uncertainty,
          volatility: guest.volatility,
          rng,
        }).bashoFormDelta
        : 0;
      participants.push({
        id: guestId,
        shikona: topWorld.npcRegistry.get(guest.id)?.shikona ?? guest.shikona,
        isPlayer: false,
        stableId: guest.stableId,
        division: 'Juryo',
        rankScore: Math.max(1, Math.min(28, guest.rankScore)),
        rankName: '十両',
        rankNumber: rank.number,
        power: Math.round(guest.basePower * guest.form + (rng() * 2 - 1) * 1.6),
        ability: Number.isFinite(guest.ability) ? guest.ability : guest.basePower * guest.form,
        bashoFormDelta: guestBashoFormDelta,
        styleBias: guest.styleBias ?? 'BALANCE',
        heightCm: guest.heightCm ?? 186,
        weightKg: guest.weightKg ?? 152,
        aptitudeTier: guest.aptitudeTier,
        aptitudeFactor: guest.aptitudeFactor,
        aptitudeProfile: guest.aptitudeProfile,
        careerBand: guest.careerBand,
        wins: 0,
        losses: 0,
        currentWinStreak: 0,
        currentLossStreak: 0,
        active: true,
        stagnation: guest.stagnation,
        targetBouts: 1,
        boutsDone: 0,
      });
    }
  }

  const player = participants.find((participant) => participant.id === PLAYER_ACTOR_ID);
  if (!player) {
    throw new Error('Player participant was not initialized for lower division basho');
  }
  const playerBashoFormDelta =
    true
      ? (
        Number.isFinite(forcedPlayerBashoFormDelta)
          ? (forcedPlayerBashoFormDelta as number)
          : resolveBashoFormDelta({
            uncertainty: status.ratingState.uncertainty,
            volatility: 1.2,
            rng,
          }).bashoFormDelta
      )
      : 0;
  player.bashoFormDelta = playerBashoFormDelta;
  player.shikona = status.shikona;
  player.stableId = status.stableId;
  player.division = division;
  player.rankScore = playerRankScore;
  player.rankName = resolveLowerRankName(division);
  player.rankNumber = status.rank.number ?? Math.floor((playerRankScore - 1) / 2) + 1;
  player.targetBouts = numBouts;
  player.boutsDone = 0;
  player.active = true;
  player.aptitudeProfile = status.aptitudeProfile;
  player.careerBand = status.careerBand;
  player.stagnation = status.stagnation;
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
  const torikumiResult = scheduleTorikumiBasho({
    participants,
    days: Array.from({ length: 15 }, (_, index) => index + 1),
    boundaryBands: DEFAULT_TORIKUMI_BOUNDARY_BANDS.filter((band) =>
      band.id === 'JuryoMakushita' ||
      band.id === 'MakushitaSandanme' ||
      band.id === 'SandanmeJonidan' ||
      band.id === 'JonidanJonokuchi'),
    simulationModelVersion,
    rng,
    facedMap: createFacedMap(participants),
    dayEligibility: (participant, day) => {
      if (participant.id.startsWith('JURYO_GUEST_')) return day >= 1 && day <= 15;
      return resolveLowerDivisionEligibility(participant, day, lowerDayMap);
    },
    onPair: (pair, day) => {
      const { a, b } = pair;
      // 事前にNPCのケガ判定を実施 (1日1回)
      const npcInjuryCheck = (participant: DivisionParticipant) => {
        if (!participant.isPlayer && participant.active) {
          const stable = resolveStableById(participant.stableId);
          const injuryRiskMultiplier = stable
            ? STABLE_ARCHETYPE_BY_ID[stable.archetypeId]?.training.injuryRiskMultiplier ?? 1
            : 1;
          if (rng() < CONSTANTS.PROBABILITY.INJURY_PER_BOUT * 0.5 * injuryRiskMultiplier) { // NPCは簡易確率で処理
            participant.active = false;
          }
        }
      };
      npcInjuryCheck(a);
      npcInjuryCheck(b);

      if (!a.isPlayer && !b.isPlayer) {
        simulateNpcBout(a, b, rng);
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
      const importantNote = buildImportantTorikumiNote({
        pair,
        day,
        year,
        month,
        opponentId: opponent.id,
        opponentShikona: opponent.shikona,
        opponentRank: {
          division: opponentDivision,
          name: rankName,
          number: rankNumber,
          side: rankSide,
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
          opponentRankName: rankName,
          opponentRankNumber: rankNumber,
          opponentRankSide: rankSide,
        });
        return;
      }

      if (rng() < resolveInjuryRate(status)) {
        losses += 1;
        player.losses += 1;
        opponent.wins += 1;
        player.currentWinStreak = 0;
        player.currentLossStreak = (player.currentLossStreak ?? 0) + 1;
        opponent.currentWinStreak = (opponent.currentWinStreak ?? 0) + 1;
        opponent.currentLossStreak = 0;
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
          opponentRankName: rankName,
          opponentRankNumber: rankNumber,
          opponentRankSide: rankSide,
        });
        if (postInjury.mustSitOut) {
          player.active = false;
        }
        consecutiveWins = 0;
        currentWinStreak = 0;
        currentLossStreak += 1;
        previousResult = 'LOSS';
        return;
      }

      const isLastBout = player.boutsDone >= numBouts;
      const isYushoContention =
        pair.titleImplication === 'DIRECT' ||
        pair.titleImplication === 'CHASE' ||
        (isLastBout && wins >= numBouts - 1);
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
        contentionTier: pair.contentionTier,
        titleImplication: pair.titleImplication,
        boundaryImplication: resolvePlayerBoundaryImplication(pair, player.id),
        schedulePhase: pair.phaseId,
        previousResult,
        bashoFormDelta: playerBashoFormDelta,
      };
      const enemyPowerNoise = 1.0;
      const enemy = {
        id: opponent.id,
        shikona: opponent.shikona,
        rankValue,
        rankName,
        rankNumber,
        rankSide,
        power: Math.round(opponent.power + (rng() * 2 - 1) * enemyPowerNoise),
        ability: (opponent.ability ?? opponent.power) + (opponent.bashoFormDelta ?? 0),
        styleBias: opponent.styleBias ?? 'BALANCE',
        heightCm: opponent.heightCm ?? 180,
        weightKg: opponent.weightKg ?? 130,
        aptitudeFactor: opponent.aptitudeFactor,
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
    importantTorikumiNotes,
    lowerLeagueSnapshots: toBoundarySnapshotsByDivision(
      participants.filter((participant) => !participant.id.startsWith('JURYO_GUEST_')),
    ),
    torikumiDiagnostics: torikumiResult.diagnostics,
  };
};

