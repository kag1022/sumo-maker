import { RandomSource } from './deps';
import { EnemyStyleBias } from '../catalog/enemyData';

export type DivisionParticipant = {
  id: string;
  shikona: string;
  isPlayer: boolean;
  stableId: string;
  forbiddenOpponentIds?: string[];
  rankScore: number;
  power: number;
  styleBias?: EnemyStyleBias;
  heightCm?: number;
  weightKg?: number;
  wins: number;
  losses: number;
  active: boolean;
};

export type DailyMatchups = {
  pairs: Array<{ a: DivisionParticipant; b: DivisionParticipant }>;
  byeIds: string[];
};

export const createFacedMap = (
  participants: DivisionParticipant[],
): Map<string, Set<string>> =>
  new Map(participants.map((participant) => [participant.id, new Set<string>()]));

const isAlreadyPaired = (
  faced: Map<string, Set<string>>,
  a: DivisionParticipant,
  b: DivisionParticipant,
): boolean => faced.get(a.id)?.has(b.id) ?? false;

const isForbiddenPair = (a: DivisionParticipant, b: DivisionParticipant): boolean =>
  (a.forbiddenOpponentIds?.includes(b.id) ?? false) ||
  (b.forbiddenOpponentIds?.includes(a.id) ?? false);

const markPaired = (
  faced: Map<string, Set<string>>,
  a: DivisionParticipant,
  b: DivisionParticipant,
): void => {
  faced.get(a.id)?.add(b.id);
  faced.get(b.id)?.add(a.id);
};

export const createDailyMatchups = (
  participants: DivisionParticipant[],
  faced: Map<string, Set<string>>,
  rng: RandomSource,
  day: number,
  totalDays = 15,
): DailyMatchups => {
  const early = day <= 5;
  const mid = day >= 6 && day <= 9;
  const late = day > 9 && day <= totalDays;

  const activeParticipants = participants.filter((participant) => participant.active);
  if (activeParticipants.length <= 1) {
    return {
      pairs: [],
      byeIds: activeParticipants.length ? [activeParticipants[0].id] : [],
    };
  }

  const deterministicTie = (
    a: DivisionParticipant,
    b: DivisionParticipant,
    attempt: number,
  ): number => {
    const key = `${a.id}|${b.id}|${day}|${attempt}`;
    let hash = 2166136261;
    for (let i = 0; i < key.length; i += 1) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) - 2147483648;
  };

  const compareForPhase = (
    a: DivisionParticipant,
    b: DivisionParticipant,
    attempt: number,
    useRngTie: boolean,
  ): number => {
    if (early) {
      if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
    } else if (mid) {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
    } else if (late) {
      if (a.wins !== b.wins) return b.wins - a.wins;
    }
    if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return useRngTie ? rng() - 0.5 : deterministicTie(a, b, attempt);
  };

  type PairConstraints = {
    allowSameStable: boolean;
    allowRematch: boolean;
  };

  const isValidPair = (
    a: DivisionParticipant,
    b: DivisionParticipant,
    constraints: PairConstraints,
  ): boolean =>
    a.id !== b.id &&
    (constraints.allowSameStable || a.stableId !== b.stableId) &&
    (constraints.allowRematch || !isAlreadyPaired(faced, a, b)) &&
    !isForbiddenPair(a, b);

  const resolvePairScore = (
    current: DivisionParticipant,
    next: DivisionParticipant,
  ): number => {
    if (early) {
      return Math.abs(current.rankScore - next.rankScore);
    }
    if (mid) {
      return Math.abs(current.wins - next.wins) * 100 + Math.abs(current.rankScore - next.rankScore);
    }
    if (late) {
      return Math.abs(current.wins - next.wins) * 120 + Math.abs(current.losses - next.losses) * 8;
    }
    return Math.abs(current.rankScore - next.rankScore);
  };

  const resolveBestCandidate = (
    sorted: DivisionParticipant[],
    current: DivisionParticipant,
    startIndex: number,
    used: Set<string>,
    constraints: PairConstraints,
  ): DivisionParticipant | null => {
    let candidate: DivisionParticipant | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let j = startIndex; j < sorted.length; j += 1) {
      const next = sorted[j];
      if (used.has(next.id)) continue;
      if (!isValidPair(current, next, constraints)) continue;
      const score = resolvePairScore(current, next);
      if (
        score < bestScore ||
        (score === bestScore && next.rankScore < (candidate?.rankScore ?? Number.POSITIVE_INFINITY))
      ) {
        bestScore = score;
        candidate = next;
      }
    }
    return candidate;
  };

  const buildAttempt = (
    pool: DivisionParticipant[],
    attempt: number,
    useRngTie: boolean,
    constraints: PairConstraints,
  ): DailyMatchups => {
    const sorted = pool
      .slice()
      .sort((a, b) => compareForPhase(a, b, attempt, useRngTie));
    const used = new Set<string>();
    const pairs: Array<{ a: DivisionParticipant; b: DivisionParticipant }> = [];
    const byeIds: string[] = [];

    if (late && sorted.length >= 8) {
      const topWins = sorted[0].wins;
      const contenders = sorted.filter((participant) => participant.wins >= topWins - 1).slice(0, 12);
      const contenderSet = new Set(contenders.map((participant) => participant.id));
      for (const contender of contenders) {
        if (used.has(contender.id)) continue;
        const candidate = resolveBestCandidate(
          sorted.filter((participant) => contenderSet.has(participant.id)),
          contender,
          0,
          used,
          constraints,
        );
        if (!candidate) continue;
        used.add(contender.id);
        used.add(candidate.id);
        pairs.push({ a: contender, b: candidate });
      }
    }

    for (let i = 0; i < sorted.length; i += 1) {
      const current = sorted[i];
      if (used.has(current.id)) continue;

      const candidate = resolveBestCandidate(sorted, current, i + 1, used, constraints);

      if (!candidate) {
        byeIds.push(current.id);
        used.add(current.id);
        continue;
      }

      used.add(current.id);
      used.add(candidate.id);
      pairs.push({ a: current, b: candidate });
    }

    return { pairs, byeIds };
  };

  const buildBestForPool = (
    pool: DivisionParticipant[],
    constraints: PairConstraints,
  ): DailyMatchups => {
    const maxPairCount = Math.floor(pool.length / 2);
    const attemptCount =
      pool.length <= 60 ? 24 :
        pool.length <= 140 ? 8 :
          4;

    let best = buildAttempt(pool, 0, true, constraints);
    for (let attempt = 1; attempt < attemptCount; attempt += 1) {
      const next = buildAttempt(pool, attempt, false, constraints);
      if (next.pairs.length > best.pairs.length) best = next;
      if (best.pairs.length >= maxPairCount) break;
    }
    return best;
  };

  const strict = buildBestForPool(activeParticipants, {
    allowSameStable: false,
    allowRematch: false,
  });
  let pairs = strict.pairs.slice();
  let byeIds = strict.byeIds.slice();

  if (byeIds.length > 1) {
    const byeSet = new Set(byeIds);
    const rematchPool = activeParticipants.filter((participant) => byeSet.has(participant.id));
    const rematchRelaxed = buildBestForPool(rematchPool, {
      allowSameStable: false,
      allowRematch: true,
    });
    pairs = pairs.concat(rematchRelaxed.pairs);
    byeIds = rematchRelaxed.byeIds.slice();
  }

  if (byeIds.length > 1) {
    const byeSet = new Set(byeIds);
    const sameStablePool = activeParticipants.filter((participant) => byeSet.has(participant.id));
    const fullyRelaxed = buildBestForPool(sameStablePool, {
      allowSameStable: true,
      allowRematch: true,
    });
    pairs = pairs.concat(fullyRelaxed.pairs);
    byeIds = fullyRelaxed.byeIds.slice();
  }

  for (const { a, b } of pairs) {
    markPaired(faced, a, b);
  }

  return { pairs, byeIds };
};

const randomNoise = (rng: RandomSource, amplitude: number): number =>
  (rng() * 2 - 1) * amplitude;

const resolveStyleEdge = (
  mine: EnemyStyleBias | undefined,
  other: EnemyStyleBias | undefined,
): number => {
  if (!mine || !other || mine === 'BALANCE' || other === 'BALANCE' || mine === other) {
    return 0;
  }
  if (
    (mine === 'PUSH' && other === 'TECHNIQUE') ||
    (mine === 'TECHNIQUE' && other === 'GRAPPLE') ||
    (mine === 'GRAPPLE' && other === 'PUSH')
  ) {
    return 1.4;
  }
  return -1.4;
};

const resolveNpcWinProbability = (
  a: DivisionParticipant,
  b: DivisionParticipant,
  rng: RandomSource,
): number => {
  const aMomentum = (a.wins - a.losses) * 0.35;
  const bMomentum = (b.wins - b.losses) * 0.35;
  const styleDiff = resolveStyleEdge(a.styleBias, b.styleBias) - resolveStyleEdge(b.styleBias, a.styleBias);
  const diff =
    (a.power + aMomentum + styleDiff + randomNoise(rng, 1.5)) -
    (b.power + bMomentum + randomNoise(rng, 1.5));
  return 1 / (1 + Math.exp(-0.06 * diff));
};

export const simulateNpcBout = (
  a: DivisionParticipant,
  b: DivisionParticipant,
  rng: RandomSource,
): void => {
  const aWin = rng() < resolveNpcWinProbability(a, b, rng);
  if (aWin) {
    a.wins += 1;
    b.losses += 1;
  } else {
    b.wins += 1;
    a.losses += 1;
  }
};
