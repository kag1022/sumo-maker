import { RandomSource } from '../deps';
import { LowerDivisionQuotaWorld, LowerNpc } from '../lower/types';
import { intakeNewNpcRecruits } from './intake';
import { resolveMonthlyIntakePulse, resolvePopulationPressure } from './populationPlan';
import { PopulationPlan } from './populationPlanTypes';
import { PersistentNpc } from './types';
import { SekitoriBoundaryWorld } from '../sekitori/types';
import { SimulationWorld } from '../world';
import { countActiveBanzukeHeadcountExcludingMaezumo } from '../world';
import { DEFAULT_DIVISION_POLICIES, resolveDivisionPolicyMap, resolveTargetHeadcount } from '../../banzuke/population/flow';
import { buildMakuuchiLayoutFromRanks, decodeMakuuchiRankFromScore } from '../../banzuke/scale/banzukeLayout';
import type { Rank } from '../../models';

type LeagueDivision =
  | 'Makuuchi'
  | 'Juryo'
  | 'Makushita'
  | 'Sandanme'
  | 'Jonidan'
  | 'Jonokuchi'
  | 'Maezumo';

const ORDER: LeagueDivision[] = [
  'Makuuchi',
  'Juryo',
  'Makushita',
  'Sandanme',
  'Jonidan',
  'Jonokuchi',
  'Maezumo',
];

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

type ReconcileMoveType = 'PROMOTE' | 'DEMOTE' | 'INTAKE';

export type ReconcileMove = {
  id: string;
  from?: LeagueDivision;
  to: LeagueDivision;
  type: ReconcileMoveType;
};

export type ReconcileCounts = Record<LeagueDivision, number>;

export interface ReconcileReport {
  before: ReconcileCounts;
  after: ReconcileCounts;
  recruited: number;
  moves: ReconcileMove[];
}

interface BucketState {
  items: PersistentNpc[];
  start: number;
  end: number;
}

const createEmptyBuckets = (): Record<LeagueDivision, BucketState> => ({
  Makuuchi: { items: [], start: 0, end: 0 },
  Juryo: { items: [], start: 0, end: 0 },
  Makushita: { items: [], start: 0, end: 0 },
  Sandanme: { items: [], start: 0, end: 0 },
  Jonidan: { items: [], start: 0, end: 0 },
  Jonokuchi: { items: [], start: 0, end: 0 },
  Maezumo: { items: [], start: 0, end: 0 },
});

const compareByRankThenId = (a: PersistentNpc, b: PersistentNpc): number => {
  if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
  return a.id.localeCompare(b.id);
};

const isLeagueDivision = (value: string): value is LeagueDivision =>
  ORDER.includes(value as LeagueDivision);

const resolveDivision = (npc: PersistentNpc): LeagueDivision => {
  if (isLeagueDivision(npc.currentDivision)) return npc.currentDivision;
  if (isLeagueDivision(npc.division)) return npc.division;
  return 'Maezumo';
};

const getBucketLength = (bucket: BucketState): number => bucket.end - bucket.start;

const toBucketArray = (bucket: BucketState): PersistentNpc[] =>
  bucket.items.slice(bucket.start, bucket.end);

const insertSorted = (bucket: BucketState, npc: PersistentNpc): void => {
  let low = bucket.start;
  let high = bucket.end;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (compareByRankThenId(bucket.items[mid], npc) <= 0) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  bucket.items.splice(low, 0, npc);
  bucket.end += 1;
};

const takeBest = (bucket: BucketState): PersistentNpc | undefined =>
  bucket.start < bucket.end
    ? bucket.items[bucket.start++]
    : undefined;

const takeWorst = (bucket: BucketState): PersistentNpc | undefined =>
  bucket.start < bucket.end
    ? bucket.items[--bucket.end]
    : undefined;

const toCounts = (buckets: Record<LeagueDivision, BucketState>): ReconcileCounts => ({
  Makuuchi: getBucketLength(buckets.Makuuchi),
  Juryo: getBucketLength(buckets.Juryo),
  Makushita: getBucketLength(buckets.Makushita),
  Sandanme: getBucketLength(buckets.Sandanme),
  Jonidan: getBucketLength(buckets.Jonidan),
  Jonokuchi: getBucketLength(buckets.Jonokuchi),
  Maezumo: getBucketLength(buckets.Maezumo),
});

const resolvePopulationDrivenPolicies = (
  populationPlan: PopulationPlan | undefined,
  month: number,
  currentBanzukeHeadcount: number,
) => {
  if (!populationPlan) {
    return DEFAULT_DIVISION_POLICIES;
  }
  const intakePulse = resolveMonthlyIntakePulse(month);
  const headcountPressure = resolvePopulationPressure(
    month,
    currentBanzukeHeadcount,
    populationPlan,
  );
  const lowerDivisionRetentionBias = Math.round(populationPlan.sampledTotalSwing * 0.1);
  const elasticity = populationPlan.lowerDivisionElasticity;
  const jonidanCenter = clamp(
    250 +
      Math.round(lowerDivisionRetentionBias * 0.7) +
      Math.round(populationPlan.jonidanShock * populationPlan.sampledJonidanSwing * 0.65) +
      Math.round(intakePulse * populationPlan.sampledJonidanSwing * 0.45 * elasticity) +
      Math.round(headcountPressure * 0.62),
    200,
    320,
  );
  const jonokuchiCenter = clamp(
    78 +
      Math.round(lowerDivisionRetentionBias * 0.3) +
      Math.round(populationPlan.jonokuchiShock * populationPlan.sampledJonokuchiSwing * 0.75) +
      Math.round(intakePulse * populationPlan.sampledJonokuchiSwing * 0.42 * elasticity) +
      Math.round(headcountPressure * 0.24),
    45,
    120,
  );
  const jonidanMargin = clamp(
    Math.round(populationPlan.sampledJonidanSwing * 0.42 * elasticity),
    12,
    60,
  );
  const jonokuchiMargin = clamp(
    Math.round(populationPlan.sampledJonokuchiSwing * 0.45 * elasticity),
    8,
    28,
  );
  const jonidanMin = clamp(jonidanCenter - jonidanMargin, 180, 320);
  const jonidanSoftMax = clamp(jonidanCenter + jonidanMargin, 200, 340);
  const jonokuchiMin = clamp(jonokuchiCenter - jonokuchiMargin, 45, 120);
  const jonokuchiSoftMax = clamp(jonokuchiCenter + jonokuchiMargin, 45, 120);
  const jonidanTarget = clamp(
    jonidanCenter,
    jonidanMin,
    jonidanSoftMax,
  );
  const jonokuchiTarget = clamp(
    jonokuchiCenter,
    jonokuchiMin,
    jonokuchiSoftMax,
  );

  return DEFAULT_DIVISION_POLICIES.map((policy) => {
    if (policy.division === 'Jonokuchi' && policy.capacityMode === 'VARIABLE') {
      return {
        ...policy,
        minSlots: jonokuchiMin,
        softMaxSlots: jonokuchiSoftMax,
        targetSlots: jonokuchiTarget,
      };
    }
    if (policy.division === 'Jonidan' && policy.capacityMode === 'VARIABLE') {
      return {
        ...policy,
        minSlots: jonidanMin,
        softMaxSlots: jonidanSoftMax,
        targetSlots: jonidanTarget,
      };
    }
    return policy;
  });
};

const toTopRosterItem = (
  npc: PersistentNpc,
  division: 'Makuuchi' | 'Juryo',
): SimulationWorld['rosters']['Makuuchi'][number] => ({
  id: npc.id,
  shikona: npc.shikona,
  division,
  stableId: npc.stableId,
  basePower: npc.basePower,
  ability: npc.ability,
  uncertainty: npc.uncertainty,
  growthBias: npc.growthBias,
  rankScore: npc.rankScore,
  volatility: npc.volatility,
  form: npc.form,
  styleBias: npc.styleBias,
  heightCm: npc.heightCm,
  weightKg: npc.weightKg,
  aptitudeTier: npc.aptitudeTier,
  aptitudeFactor: npc.aptitudeFactor,
  aptitudeProfile: npc.aptitudeProfile,
  careerBand: npc.careerBand,
  stagnation: npc.stagnation,
});

const toLowerNpc = (npc: PersistentNpc, division: LowerNpc['division']): LowerNpc => ({
  id: npc.id,
  seedId: npc.seedId,
  shikona: npc.shikona,
  division,
  currentDivision: division,
  stableId: npc.stableId,
  basePower: npc.basePower,
  ability: npc.ability,
  uncertainty: npc.uncertainty,
  rankScore: npc.rankScore,
  volatility: npc.volatility,
  form: npc.form,
  styleBias: npc.styleBias,
  heightCm: npc.heightCm,
  weightKg: npc.weightKg,
  aptitudeTier: npc.aptitudeTier,
  aptitudeFactor: npc.aptitudeFactor,
  aptitudeProfile: npc.aptitudeProfile,
  careerBand: npc.careerBand,
  growthBias: npc.growthBias,
  retirementBias: npc.retirementBias,
  retirementProfile: npc.retirementProfile,
  entryAge: npc.entryAge,
  age: npc.age,
  careerBashoCount: npc.careerBashoCount,
  active: npc.active,
  entrySeq: npc.entrySeq,
  retiredAtSeq: npc.retiredAtSeq,
  riseBand: npc.riseBand,
  stagnation: npc.stagnation,
  recentBashoResults: npc.recentBashoResults,
});

const toMakushitaPoolNpc = (
  npc: PersistentNpc,
): SekitoriBoundaryWorld['makushitaPool'][number] => ({
  id: npc.id,
  shikona: npc.shikona,
  stableId: npc.stableId,
  basePower: npc.basePower,
  ability: npc.ability,
  uncertainty: npc.uncertainty,
  rankScore: npc.rankScore,
  volatility: npc.volatility,
  form: npc.form,
  styleBias: npc.styleBias,
  heightCm: npc.heightCm,
  weightKg: npc.weightKg,
  aptitudeTier: npc.aptitudeTier,
  aptitudeFactor: npc.aptitudeFactor,
  aptitudeProfile: npc.aptitudeProfile,
  careerBand: npc.careerBand,
  growthBias: npc.growthBias,
  stagnation: npc.stagnation,
});

const assignCanonicalMakuuchiRankScores = (
  bucket: PersistentNpc[],
  world: SimulationWorld,
): void => {
  const ranks = ensureSanyakuRankFloor(bucket.map((npc) =>
    decodeMakuuchiRankFromScore(npc.rankScore, world.makuuchiLayout),
  ));
  const layout = buildMakuuchiLayoutFromRanks(ranks);
  const sectionStart = {
    横綱: 1,
    大関: 1 + layout.yokozuna,
    関脇: 1 + layout.yokozuna + layout.ozeki,
    小結: 1 + layout.yokozuna + layout.ozeki + layout.sekiwake,
    前頭: 1 + layout.yokozuna + layout.ozeki + layout.sekiwake + layout.komusubi,
  };
  const cursors: Record<'横綱' | '大関' | '関脇' | '小結' | '前頭', number> = {
    横綱: 0,
    大関: 0,
    関脇: 0,
    小結: 0,
    前頭: 0,
  };

  for (let i = 0; i < bucket.length; i += 1) {
    const rankName = ranks[i].name;
    const sectionName =
      rankName === '横綱' ||
      rankName === '大関' ||
      rankName === '関脇' ||
      rankName === '小結'
        ? rankName
        : '前頭';
    bucket[i].rankScore = sectionStart[sectionName] + cursors[sectionName];
    cursors[sectionName] += 1;
  }
  world.makuuchiLayout = layout;
};

const nextOpenTopRankSlot = (
  ranks: Rank[],
  rankName: '関脇' | '小結',
): Pick<Rank, 'side' | 'number'> => {
  const used = new Set(
    ranks
      .filter((rank) => rank.division === 'Makuuchi' && rank.name === rankName)
      .map((rank) => {
        const number = Math.max(1, rank.number ?? 1);
        const side = rank.side === 'West' ? 'West' : 'East';
        return `${number}:${side}`;
      }),
  );
  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 === 0 ? 'East' : 'West';
    const number = Math.floor(index / 2) + 1;
    if (!used.has(`${number}:${side}`)) return { side, number };
  }
  return { side: 'East', number: 1 };
};

const promoteRankAt = (
  ranks: Rank[],
  index: number,
  rankName: '関脇' | '小結',
): void => {
  const slot = nextOpenTopRankSlot(ranks, rankName);
  ranks[index] = {
    division: 'Makuuchi',
    name: rankName,
    side: slot.side,
    number: slot.number,
  };
};

const ensureSanyakuRankFloor = (input: Rank[]): Rank[] => {
  const ranks = input.map((rank) => ({ ...rank }));
  const count = (rankName: '関脇' | '小結'): number =>
    ranks.filter((rank) => rank.division === 'Makuuchi' && rank.name === rankName).length;
  const findCandidate = (rankNames: Array<'小結' | '前頭'>): number =>
    ranks.findIndex((rank) =>
      rank.division === 'Makuuchi' && rankNames.includes(rank.name as '小結' | '前頭'));

  while (count('関脇') < 2) {
    const candidateIndex = findCandidate(['小結', '前頭']);
    if (candidateIndex < 0) break;
    promoteRankAt(ranks, candidateIndex, '関脇');
  }

  while (count('小結') < 2) {
    const candidateIndex = findCandidate(['前頭']);
    if (candidateIndex < 0) break;
    promoteRankAt(ranks, candidateIndex, '小結');
  }

  return ranks;
};

export const reconcileNpcLeague = (
  world: SimulationWorld,
  lowerWorld: LowerDivisionQuotaWorld,
  boundaryWorld: SekitoriBoundaryWorld,
  rng: RandomSource,
  seq: number,
  month: number,
  populationPlan?: PopulationPlan,
): ReconcileReport => {
  const buckets = createEmptyBuckets();
  const moves: ReconcileMove[] = [];
  let recruited = 0;

  for (const npc of world.npcRegistry.values()) {
    if (npc.actorType === 'PLAYER') continue;
    if (!npc.active) continue;
    const division = resolveDivision(npc);
    buckets[division].items.push(npc);
    buckets[division].end += 1;
  }

  for (const division of ORDER) {
    buckets[division].items.sort(compareByRankThenId);
  }

  const before = toCounts(buckets);
  const currentBanzukeHeadcount =
    before.Makuuchi +
    before.Juryo +
    before.Makushita +
    before.Sandanme +
    before.Jonidan +
    before.Jonokuchi;
  const policyMap = resolveDivisionPolicyMap(
    resolvePopulationDrivenPolicies(populationPlan, month, currentBanzukeHeadcount),
  );

  const recruitToMaezumo = (): boolean => {
    const intake = intakeNewNpcRecruits(
      {
        registry: world.npcRegistry,
        maezumoPool: world.maezumoPool,
        nameContext: world.npcNameContext,
        nextNpcSerial: world.nextNpcSerial,
      },
      seq,
      month,
      countActiveBanzukeHeadcountExcludingMaezumo(world),
      populationPlan,
      rng,
    );
    world.nextNpcSerial = intake.nextNpcSerial;
    lowerWorld.nextNpcSerial = intake.nextNpcSerial;
    if (!intake.recruits.length) return false;
    for (const recruit of intake.recruits) {
      insertSorted(buckets.Maezumo, recruit);
      moves.push({ id: recruit.id, to: 'Maezumo', type: 'INTAKE' });
    }
    recruited += intake.recruits.length;
    return true;
  };

  const moveNpc = (
    npc: PersistentNpc,
    from: LeagueDivision,
    to: LeagueDivision,
    type: ReconcileMoveType,
  ): void => {
    npc.currentDivision = to;
    npc.division = to;
    if (from !== to) {
      if (to === 'Makuuchi') {
        npc.rankScore = 42;
      } else if (to === 'Juryo') {
        npc.rankScore = 28;
      }
    }
    insertSorted(buckets[to], npc);
    moves.push({ id: npc.id, from, to, type });
  };

  const ensureSource = (index: number): boolean => {
    const division = ORDER[index];
    if (getBucketLength(buckets[division]) > 0) return true;

    if (division === 'Maezumo') {
      return recruitToMaezumo();
    }

    const lowerIndex = index + 1;
    if (lowerIndex >= ORDER.length) return false;
    if (!ensureSource(lowerIndex)) return false;
    const lowerDivision = ORDER[lowerIndex];
    const promoted = takeBest(buckets[lowerDivision]);
    if (!promoted) return false;
    moveNpc(promoted, lowerDivision, division, 'PROMOTE');
    return true;
  };

  for (let i = 0; i < ORDER.length - 1; i += 1) {
    const division = ORDER[i];
    const lowerDivision = ORDER[i + 1];
    if (division === 'Maezumo') continue;
    const target = resolveTargetHeadcount(division, getBucketLength(buckets[division]), policyMap);

    while (getBucketLength(buckets[division]) > target.max) {
      const demoted = takeWorst(buckets[division]);
      if (!demoted) break;
      moveNpc(demoted, division, lowerDivision, 'DEMOTE');
    }

    if (target.fixed) {
      while (getBucketLength(buckets[division]) < target.target) {
        if (!ensureSource(i + 1)) break;
        const promoted = takeBest(buckets[lowerDivision]);
        if (!promoted) break;
        moveNpc(promoted, lowerDivision, division, 'PROMOTE');
      }
      continue;
    }

    while (getBucketLength(buckets[division]) < target.min) {
      if (!ensureSource(i + 1)) break;
      const promoted = takeBest(buckets[lowerDivision]);
      if (!promoted) break;
      moveNpc(promoted, lowerDivision, division, 'PROMOTE');
    }

    while (getBucketLength(buckets[division]) > target.target) {
      const demoted = takeWorst(buckets[division]);
      if (!demoted) break;
      moveNpc(demoted, division, lowerDivision, 'DEMOTE');
    }

    while (getBucketLength(buckets[division]) < target.target) {
      if (!ensureSource(i + 1)) break;
      const promoted = takeBest(buckets[lowerDivision]);
      if (!promoted) break;
      moveNpc(promoted, lowerDivision, division, 'PROMOTE');
    }
  }

  const orderedBuckets = ORDER.reduce((acc, division) => {
    const bucket = toBucketArray(buckets[division]);
    if (division === 'Makuuchi') {
      assignCanonicalMakuuchiRankScores(bucket, world);
      for (const npc of bucket) {
        npc.currentDivision = division;
        npc.division = division;
      }
    } else {
      for (let i = 0; i < bucket.length; i += 1) {
        const npc = bucket[i];
        npc.currentDivision = division;
        npc.division = division;
        npc.rankScore = i + 1;
      }
    }
    acc[division] = bucket;
    return acc;
  }, {} as Record<LeagueDivision, PersistentNpc[]>);

  world.rosters.Makuuchi = orderedBuckets.Makuuchi
    .slice()
    .map((npc) => toTopRosterItem(npc, 'Makuuchi'));
  world.rosters.Juryo = orderedBuckets.Juryo
    .slice()
    .map((npc) => toTopRosterItem(npc, 'Juryo'));

  world.lowerRosterSeeds = {
    Makushita: orderedBuckets.Makushita.slice(),
    Sandanme: orderedBuckets.Sandanme.slice(),
    Jonidan: orderedBuckets.Jonidan.slice(),
    Jonokuchi: orderedBuckets.Jonokuchi.slice(),
  };
  world.maezumoPool = orderedBuckets.Maezumo.slice();

  lowerWorld.rosters = {
    Makushita: orderedBuckets.Makushita.map((npc) => toLowerNpc(npc, 'Makushita')),
    Sandanme: orderedBuckets.Sandanme.map((npc) => toLowerNpc(npc, 'Sandanme')),
    Jonidan: orderedBuckets.Jonidan.map((npc) => toLowerNpc(npc, 'Jonidan')),
    Jonokuchi: orderedBuckets.Jonokuchi.map((npc) => toLowerNpc(npc, 'Jonokuchi')),
  };
  lowerWorld.maezumoPool = orderedBuckets.Maezumo
    .slice()
    .map((npc) => toLowerNpc(npc, 'Maezumo'));

  boundaryWorld.makushitaPool = orderedBuckets.Makushita
    .slice()
    .map(toMakushitaPoolNpc);
  boundaryWorld.npcRegistry = world.npcRegistry;

  return {
    before,
    after: toCounts(buckets),
    recruited,
    moves,
  };
};
