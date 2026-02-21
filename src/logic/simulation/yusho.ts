import { RandomSource } from './deps';

export interface YushoRaceParticipant {
  id: string;
  wins: number;
  losses: number;
  rankScore: number;
  power?: number;
}

export interface YushoResolution {
  winnerId?: string;
  junYushoIds: Set<string>;
  playoffParticipantIds: string[];
  topWins: number;
  junYushoWins: number;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const compareStanding = (a: YushoRaceParticipant, b: YushoRaceParticipant): number => {
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (a.losses !== b.losses) return a.losses - b.losses;
  if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
  return a.id.localeCompare(b.id);
};

const compareSeed = (a: YushoRaceParticipant, b: YushoRaceParticipant): number => {
  if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
  if (b.wins !== a.wins) return b.wins - a.wins;
  return a.id.localeCompare(b.id);
};

const resolvePlayoffWinner = (
  a: YushoRaceParticipant,
  b: YushoRaceParticipant,
  rng: RandomSource,
): YushoRaceParticipant => {
  const seedEdge = clamp((b.rankScore - a.rankScore) * 0.05, -2.8, 2.8);
  const aPower = (a.power ?? 78) + seedEdge;
  const bPower = b.power ?? 78;
  const powerDiff = aPower - bPower;
  const aWinProbability = 1 / (1 + Math.exp(-0.08 * powerDiff));
  return rng() < aWinProbability ? a : b;
};

const runPlayoff = (
  contenders: YushoRaceParticipant[],
  rng: RandomSource,
): string => {
  if (contenders.length === 1) return contenders[0].id;

  let bracket = contenders.slice().sort(compareSeed);
  while (bracket.length > 1) {
    const nextRound: YushoRaceParticipant[] = [];
    let left = 0;
    let right = bracket.length - 1;

    if (bracket.length % 2 === 1) {
      nextRound.push(bracket[0]);
      left = 1;
    }

    while (left < right) {
      nextRound.push(resolvePlayoffWinner(bracket[left], bracket[right], rng));
      left += 1;
      right -= 1;
    }
    if (left === right) {
      nextRound.push(bracket[left]);
    }
    bracket = nextRound.sort(compareSeed);
  }

  return bracket[0].id;
};

export const resolveYushoResolution = (
  participants: YushoRaceParticipant[],
  rng: RandomSource = Math.random,
): YushoResolution => {
  if (!participants.length) {
    return {
      winnerId: undefined,
      junYushoIds: new Set<string>(),
      playoffParticipantIds: [],
      topWins: 0,
      junYushoWins: -1,
    };
  }

  const sorted = participants.slice().sort(compareStanding);
  const topWins = sorted[0].wins;
  const playoffParticipants = sorted.filter((participant) => participant.wins === topWins);
  const winnerId = runPlayoff(playoffParticipants, rng);
  const junYushoWins = sorted.find((participant) => participant.wins < topWins)?.wins ?? -1;
  const junYushoIds = new Set(
    sorted
      .filter((participant) => participant.id !== winnerId)
      .filter(
        (participant) =>
          participant.wins === topWins ||
          (junYushoWins >= 0 && participant.wins === junYushoWins),
      )
      .map((participant) => participant.id),
  );

  return {
    winnerId,
    junYushoIds,
    playoffParticipantIds: playoffParticipants.map((participant) => participant.id),
    topWins,
    junYushoWins,
  };
};
