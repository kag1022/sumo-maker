import { MakuuchiLayout, buildMakuuchiLayoutFromRanks, decodeMakuuchiRankFromScore } from '../../banzuke/scale/banzukeLayout';
import { BashoRecordSnapshot, BanzukeAllocation } from '../../banzuke/providers/sekitori/types';
import { Rank } from '../../models';
import { PLAYER_ACTOR_ID } from '../actors/constants';
import { SimulationWorld, TopDivision, WorldRikishi } from '../world/types';

type DivisionBashoSnapshotLike = {
  id: string;
  shikona: string;
  rankScore: number;
  rank?: Rank;
  wins: number;
  losses: number;
  absent?: number;
  expectedWins?: number;
  strengthOfSchedule?: number;
  performanceOverExpected?: number;
  yusho?: boolean;
  junYusho?: boolean;
  specialPrizes?: string[];
};

export type PlayerSanyakuQuota = {
  enforcedSanyaku?: 'Sekiwake' | 'Komusubi';
};

const DIVISION_SIZE: Record<TopDivision, number> = {
  Makuuchi: 42,
  Juryo: 28,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const decodeJuryoRankFromScore = (rankScore: number): Rank => {
  const bounded = clamp(rankScore, 1, DIVISION_SIZE.Juryo);
  return {
    division: 'Juryo',
    name: '十両',
    number: Math.floor((bounded - 1) / 2) + 1,
    side: bounded % 2 === 1 ? 'East' : 'West',
  };
};

type TopRankName = '横綱' | '大関' | '関脇' | '小結';

const TOP_RANK_NAMES = new Set<Rank['name']>(['横綱', '大関', '関脇', '小結']);

const resolveTopRankSection = (
  rankName: TopRankName,
  layout: MakuuchiLayout,
): { start: number; count: number } => {
  const yokozunaStart = 1;
  const ozekiStart = yokozunaStart + layout.yokozuna;
  const sekiwakeStart = ozekiStart + layout.ozeki;
  const komusubiStart = sekiwakeStart + layout.sekiwake;
  if (rankName === '横綱') return { start: yokozunaStart, count: layout.yokozuna };
  if (rankName === '大関') return { start: ozekiStart, count: layout.ozeki };
  if (rankName === '関脇') return { start: sekiwakeStart, count: layout.sekiwake };
  return { start: komusubiStart, count: layout.komusubi };
};

const toRankOrderIndex = (rank: Rank): number => {
  const number = Math.max(1, rank.number || 1);
  return (number - 1) * 2 + (rank.side === 'West' ? 1 : 0);
};

const resolveRosterDivisionRankScore = (
  allocation: BanzukeAllocation,
  makuuchiLayout: MakuuchiLayout,
  resolveRankScore: (rank: Rank, layout: MakuuchiLayout) => number,
): number => {
  const rank = allocation.nextRank;
  if (rank.division !== 'Makuuchi' || !TOP_RANK_NAMES.has(rank.name)) {
    return resolveRankScore(rank, makuuchiLayout);
  }

  const section = resolveTopRankSection(rank.name as TopRankName, makuuchiLayout);
  if (section.count <= 0) return resolveRankScore(rank, makuuchiLayout);
  // nextRank の side/number が当該 section の枠数を越えても、
  // roster 適用時に次 section へ漏らさない。制度判定済みの rank name を優先する。
  const indexInSection = clamp(toRankOrderIndex(rank), 0, section.count - 1);
  return section.start + indexInSection;
};

const resolveRosterSortScore = (
  allocation: BanzukeAllocation,
  makuuchiLayout: MakuuchiLayout,
  resolveRankScore: (rank: Rank, layout: MakuuchiLayout) => number,
): number => {
  const rankScore = resolveRosterDivisionRankScore(allocation, makuuchiLayout, resolveRankScore);
  return allocation.nextRank.division === 'Juryo'
    ? DIVISION_SIZE.Makuuchi + rankScore
    : rankScore;
};

export const resolvePlayerSanyakuQuota = (
  assignedRank?: Rank,
  options?: {
    isKachikoshi?: boolean;
    nextIsOzekiReturn?: boolean;
    currentRank?: Rank;
  },
): PlayerSanyakuQuota => {
  if (assignedRank?.division !== 'Makuuchi') return {};
  const alreadySanyaku =
    options?.currentRank?.division === 'Makuuchi' &&
    (options.currentRank.name === '横綱' ||
      options.currentRank.name === '大関' ||
      options.currentRank.name === '関脇' ||
      options.currentRank.name === '小結');
  const canHoldSanyaku = Boolean(options?.isKachikoshi || options?.nextIsOzekiReturn);
  if (!alreadySanyaku || !canHoldSanyaku) return {};
  if (assignedRank.name === '関脇') return { enforcedSanyaku: 'Sekiwake' };
  if (assignedRank.name === '小結') return { enforcedSanyaku: 'Komusubi' };
  return {};
};

export const buildTopDivisionRecords = (world: SimulationWorld): BashoRecordSnapshot[] => {
  const topRankPopulation = {
    currentYokozunaCount: world.makuuchiLayout.yokozuna,
    currentOzekiCount: world.makuuchiLayout.ozeki,
  };
  const toSnapshots = (
    division: TopDivision,
    results: DivisionBashoSnapshotLike[],
  ): BashoRecordSnapshot[] => results.map((result) => {
    const history = world.recentSekitoriHistory.get(result.id) ?? [];
    const rank =
      result.rank ??
      (division === 'Makuuchi'
        ? decodeMakuuchiRankFromScore(result.rankScore, world.makuuchiLayout)
        : decodeJuryoRankFromScore(result.rankScore));
    const absent = result.absent ?? Math.max(0, 15 - (result.wins + result.losses));
    return {
      id: result.id,
      shikona: result.shikona,
      rank,
      wins: result.wins,
      losses: result.losses,
      absent,
      expectedWins: result.expectedWins,
      strengthOfSchedule: result.strengthOfSchedule,
      performanceOverExpected: result.performanceOverExpected,
      yusho: result.yusho ?? false,
      junYusho: result.junYusho ?? false,
      specialPrizes: result.specialPrizes ?? [],
      pastRecords: history.slice(1, 3),
      isOzekiKadoban: world.ozekiKadobanById.get(result.id) ?? false,
      isOzekiReturn: world.ozekiReturnById.get(result.id) ?? false,
      topRankPopulation,
    };
  });
  return [
    ...toSnapshots('Makuuchi', world.lastBashoResults.Makuuchi ?? []),
    ...toSnapshots('Juryo', world.lastBashoResults.Juryo ?? []),
  ];
};

const buildWorldRikishi = (
  world: SimulationWorld,
  existingById: Map<string, WorldRikishi>,
  id: string,
  division: TopDivision,
  rankScore: number,
): WorldRikishi => {
  const actor = world.actorRegistry.get(id);
  const existing = existingById.get(id);

  return {
    id,
    shikona: actor?.shikona ?? existing?.shikona ?? id,
    division,
    stableId: actor?.stableId ?? existing?.stableId ?? 'stable-001',
    basePower: actor?.basePower ?? existing?.basePower ?? 60,
    ability: actor?.ability ?? existing?.ability ?? actor?.basePower ?? existing?.basePower ?? 60,
    uncertainty: actor?.uncertainty ?? existing?.uncertainty ?? 2,
    growthBias: actor?.growthBias ?? existing?.growthBias ?? 0,
    rankScore,
    volatility: actor?.volatility ?? existing?.volatility ?? 1.2,
    form: actor?.form ?? existing?.form ?? 1,
    styleBias: actor?.styleBias ?? existing?.styleBias ?? 'BALANCE',
    heightCm: actor?.heightCm ?? existing?.heightCm ?? 180,
    weightKg: actor?.weightKg ?? existing?.weightKg ?? 130,
    aptitudeTier: actor?.aptitudeTier ?? existing?.aptitudeTier,
    aptitudeFactor: actor?.aptitudeFactor ?? existing?.aptitudeFactor,
    aptitudeProfile: actor?.aptitudeProfile ?? existing?.aptitudeProfile,
    careerBand: actor?.careerBand ?? existing?.careerBand,
    stagnation: actor?.stagnation ?? existing?.stagnation,
  };
};

const compareAllocationForRoster = (
  a: BanzukeAllocation,
  b: BanzukeAllocation,
  makuuchiLayout: MakuuchiLayout,
  resolveRankScore: (rank: Rank, layout: MakuuchiLayout) => number,
): number => {
  const aScore = resolveRosterSortScore(a, makuuchiLayout, resolveRankScore);
  const bScore = resolveRosterSortScore(b, makuuchiLayout, resolveRankScore);
  if (aScore !== bScore) return aScore - bScore;
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
};

export const applyBanzukeToRosters = (
  world: SimulationWorld,
  allocations: BanzukeAllocation[],
  resolveRankScore: (rank: Rank, layout: MakuuchiLayout) => number,
): void => {
  const nextLayout = buildMakuuchiLayoutFromRanks(
    allocations
      .map((allocation) => allocation.nextRank)
      .filter((rank) => rank.division === 'Makuuchi'),
  );
  const allNpcs = [...world.rosters.Makuuchi, ...world.rosters.Juryo];
  const existingById = new Map(
    allNpcs.map((rikishi) => [rikishi.id, rikishi]),
  );

  const sekitori = allocations
    .filter((allocation) =>
      allocation.nextRank.division === 'Makuuchi' || allocation.nextRank.division === 'Juryo')
    .map((allocation) => {
      const division = allocation.nextRank.division as TopDivision;
      const rankScore = resolveRosterDivisionRankScore(allocation, nextLayout, resolveRankScore);
      return {
        rikishi: buildWorldRikishi(world, existingById, allocation.id, division, rankScore),
        allocation,
      };
    })
    .sort((left, right) => {
      const rankOrder = compareAllocationForRoster(
        left.allocation,
        right.allocation,
        nextLayout,
        resolveRankScore,
      );
      if (rankOrder !== 0) return rankOrder;
      if (left.rikishi.id === PLAYER_ACTOR_ID) return -1;
      if (right.rikishi.id === PLAYER_ACTOR_ID) return 1;
      return left.rikishi.id.localeCompare(right.rikishi.id);
    })
    .map((entry) => entry.rikishi);

  world.rosters.Makuuchi = sekitori
    .slice(0, DIVISION_SIZE.Makuuchi)
    .map((rikishi, index) => ({ ...rikishi, division: 'Makuuchi', rankScore: index + 1 }));
  world.rosters.Juryo = sekitori
    .slice(DIVISION_SIZE.Makuuchi, DIVISION_SIZE.Makuuchi + DIVISION_SIZE.Juryo)
    .map((rikishi, index) => ({ ...rikishi, division: 'Juryo', rankScore: index + 1 }));
  world.makuuchiLayout = nextLayout;
};
