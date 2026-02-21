import { MakuuchiLayout, buildMakuuchiLayoutFromRanks, decodeMakuuchiRankFromScore } from '../../ranking/banzukeLayout';
import { Rank } from '../../models';
import { BashoRecordHistorySnapshot, BashoRecordSnapshot, BanzukeAllocation } from '../../ranking';

type TopDivision = 'Makuuchi' | 'Juryo';

type DivisionBashoSnapshotLike = {
  id: string;
  shikona: string;
  rankScore: number;
  rank?: Rank;
  wins: number;
  losses: number;
  absent?: number;
  yusho?: boolean;
  junYusho?: boolean;
  specialPrizes?: string[];
};

type WorldRikishiLike = {
  id: string;
  division: TopDivision;
  rankScore: number;
  [key: string]: unknown;
};

type SimulationWorldLike = {
  rosters: Record<TopDivision, WorldRikishiLike[]>;
  lastBashoResults: Partial<Record<TopDivision, DivisionBashoSnapshotLike[]>>;
  recentSekitoriHistory: Map<string, BashoRecordHistorySnapshot[]>;
  ozekiKadobanById: Map<string, boolean>;
  ozekiReturnById: Map<string, boolean>;
  makuuchiLayout: MakuuchiLayout;
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

export const resolvePlayerSanyakuQuota = (assignedRank?: Rank): PlayerSanyakuQuota => {
  if (assignedRank?.division !== 'Makuuchi') return {};
  if (assignedRank.name === '関脇') return { enforcedSanyaku: 'Sekiwake' };
  if (assignedRank.name === '小結') return { enforcedSanyaku: 'Komusubi' };
  return {};
};

export const buildTopDivisionRecords = (world: SimulationWorldLike): BashoRecordSnapshot[] => {
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
      yusho: result.yusho ?? false,
      junYusho: result.junYusho ?? false,
      specialPrizes: result.specialPrizes ?? [],
      pastRecords: history.slice(1, 3),
      isOzekiKadoban: world.ozekiKadobanById.get(result.id) ?? false,
      isOzekiReturn: world.ozekiReturnById.get(result.id) ?? false,
    };
  });
  return [
    ...toSnapshots('Makuuchi', world.lastBashoResults.Makuuchi ?? []),
    ...toSnapshots('Juryo', world.lastBashoResults.Juryo ?? []),
  ];
};

const compareAllocationForRoster = (
  a: BanzukeAllocation,
  b: BanzukeAllocation,
  makuuchiLayout: MakuuchiLayout,
  resolveRankScore: (rank: Rank, layout: MakuuchiLayout) => number,
): number => {
  const aScore = resolveRankScore(a.nextRank, makuuchiLayout);
  const bScore = resolveRankScore(b.nextRank, makuuchiLayout);
  if (aScore !== bScore) return aScore - bScore;
  if (b.score !== a.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
};

export const applyNpcBanzukeToRosters = (
  world: SimulationWorldLike,
  allocations: BanzukeAllocation[],
  resolveRankScore: (rank: Rank, layout: MakuuchiLayout) => number,
): void => {
  const nextLayout = buildMakuuchiLayoutFromRanks(
    allocations
      .map((allocation) => allocation.nextRank)
      .filter((rank) => rank.division === 'Makuuchi'),
  );
  const allNpcs = [...world.rosters.Makuuchi, ...world.rosters.Juryo];
  const allocationById = new Map(
    allocations
      .filter((allocation) => allocation.id !== 'PLAYER')
      .map((allocation) => [allocation.id, allocation]),
  );

  const mappedNpcs = allNpcs.map((npc) => {
    const allocation = allocationById.get(npc.id);
    if (!allocation) {
      return {
        ...npc,
        division: npc.division,
        rankScore: DIVISION_SIZE[npc.division] + 100,
      };
    }
    const division = allocation.nextRank.division === 'Makuuchi' ? 'Makuuchi' : 'Juryo';
    return {
      ...npc,
      division,
      rankScore: resolveRankScore(allocation.nextRank, nextLayout),
    };
  });

  const makuuchi = mappedNpcs
    .filter((npc) => npc.division === 'Makuuchi')
    .map((npc) => ({ npc, allocation: allocationById.get(npc.id) }))
    .sort((a, b) => {
      if (a.allocation && b.allocation) {
        return compareAllocationForRoster(a.allocation, b.allocation, nextLayout, resolveRankScore);
      }
      if (a.allocation) return -1;
      if (b.allocation) return 1;
      return a.npc.rankScore - b.npc.rankScore;
    })
    .map((entry) => ({ ...entry.npc, division: 'Makuuchi' as TopDivision }));

  const juryo = mappedNpcs
    .filter((npc) => npc.division === 'Juryo')
    .map((npc) => ({ npc, allocation: allocationById.get(npc.id) }))
    .sort((a, b) => {
      if (a.allocation && b.allocation) {
        return compareAllocationForRoster(a.allocation, b.allocation, nextLayout, resolveRankScore);
      }
      if (a.allocation) return -1;
      if (b.allocation) return 1;
      return a.npc.rankScore - b.npc.rankScore;
    })
    .map((entry) => ({ ...entry.npc, division: 'Juryo' as TopDivision }));

  // プレイヤーが関取帯にいる間は NPC1名が「予備枠」として場所結果を持たないため、
  // 片側の頭数が不足した場合は余剰側の末尾を移して定員を維持する。
  while (makuuchi.length < DIVISION_SIZE.Makuuchi && juryo.length > 0) {
    const moved = juryo.pop();
    if (!moved) break;
    makuuchi.push({ ...moved, division: 'Makuuchi' });
  }
  while (juryo.length < DIVISION_SIZE.Juryo && makuuchi.length > 0) {
    const moved = makuuchi.pop();
    if (!moved) break;
    juryo.push({ ...moved, division: 'Juryo' });
  }

  // 補完後に超過側を定員まで切り詰める。
  while (makuuchi.length > DIVISION_SIZE.Makuuchi) {
    const moved = makuuchi.pop();
    if (!moved) break;
    juryo.push({ ...moved, division: 'Juryo' });
  }
  while (juryo.length > DIVISION_SIZE.Juryo) {
    const moved = juryo.pop();
    if (!moved) break;
    makuuchi.push({ ...moved, division: 'Makuuchi' });
  }

  world.rosters.Makuuchi = makuuchi
    .slice(0, DIVISION_SIZE.Makuuchi)
    .map((npc, index) => ({ ...npc, division: 'Makuuchi', rankScore: index + 1 }));
  world.rosters.Juryo = juryo
    .slice(0, DIVISION_SIZE.Juryo)
    .map((npc, index) => ({ ...npc, division: 'Juryo', rankScore: index + 1 }));
  world.makuuchiLayout = nextLayout;
};
