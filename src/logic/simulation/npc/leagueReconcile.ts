import { RandomSource } from '../deps';
import { LowerDivisionQuotaWorld, LowerNpc } from '../lower/types';
import { intakeNewNpcRecruits } from './intake';
import { PersistentNpc } from './types';
import { SekitoriBoundaryWorld } from '../sekitori/types';
import { SimulationWorld } from '../world';
import { DEFAULT_DIVISION_POLICIES, resolveDivisionPolicyMap, resolveTargetHeadcount } from '../../banzuke/population/flow';

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

const createEmptyBuckets = (): Record<LeagueDivision, PersistentNpc[]> => ({
  Makuuchi: [],
  Juryo: [],
  Makushita: [],
  Sandanme: [],
  Jonidan: [],
  Jonokuchi: [],
  Maezumo: [],
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

const takeBest = (bucket: PersistentNpc[]): PersistentNpc | undefined => {
  bucket.sort(compareByRankThenId);
  return bucket.shift();
};

const takeWorst = (bucket: PersistentNpc[]): PersistentNpc | undefined => {
  bucket.sort(compareByRankThenId);
  return bucket.pop();
};

const countActive = (world: SimulationWorld): number => {
  let total = 0;
  for (const npc of world.npcRegistry.values()) {
    if (npc.active) total += 1;
  }
  return total;
};

const toCounts = (buckets: Record<LeagueDivision, PersistentNpc[]>): ReconcileCounts => ({
  Makuuchi: buckets.Makuuchi.length,
  Juryo: buckets.Juryo.length,
  Makushita: buckets.Makushita.length,
  Sandanme: buckets.Sandanme.length,
  Jonidan: buckets.Jonidan.length,
  Jonokuchi: buckets.Jonokuchi.length,
  Maezumo: buckets.Maezumo.length,
});

const toTopRosterItem = (
  npc: PersistentNpc,
  division: 'Makuuchi' | 'Juryo',
): SimulationWorld['rosters']['Makuuchi'][number] => ({
  id: npc.id,
  shikona: npc.shikona,
  division,
  stableId: npc.stableId,
  basePower: npc.basePower,
  growthBias: npc.growthBias,
  rankScore: npc.rankScore,
  volatility: npc.volatility,
  form: npc.form,
  styleBias: npc.styleBias,
  heightCm: npc.heightCm,
  weightKg: npc.weightKg,
});

const toLowerNpc = (npc: PersistentNpc, division: LowerNpc['division']): LowerNpc => ({
  id: npc.id,
  seedId: npc.seedId,
  shikona: npc.shikona,
  division,
  currentDivision: division,
  stableId: npc.stableId,
  basePower: npc.basePower,
  rankScore: npc.rankScore,
  volatility: npc.volatility,
  form: npc.form,
  styleBias: npc.styleBias,
  heightCm: npc.heightCm,
  weightKg: npc.weightKg,
  growthBias: npc.growthBias,
  retirementBias: npc.retirementBias,
  entryAge: npc.entryAge,
  age: npc.age,
  careerBashoCount: npc.careerBashoCount,
  active: npc.active,
  entrySeq: npc.entrySeq,
  retiredAtSeq: npc.retiredAtSeq,
  riseBand: npc.riseBand,
  recentBashoResults: npc.recentBashoResults,
});

const toMakushitaPoolNpc = (
  npc: PersistentNpc,
): SekitoriBoundaryWorld['makushitaPool'][number] => ({
  id: npc.id,
  shikona: npc.shikona,
  stableId: npc.stableId,
  basePower: npc.basePower,
  rankScore: npc.rankScore,
  volatility: npc.volatility,
  form: npc.form,
  styleBias: npc.styleBias,
  heightCm: npc.heightCm,
  weightKg: npc.weightKg,
  growthBias: npc.growthBias,
});

export const reconcileNpcLeague = (
  world: SimulationWorld,
  lowerWorld: LowerDivisionQuotaWorld,
  boundaryWorld: SekitoriBoundaryWorld,
  rng: RandomSource,
  seq: number,
  month: number,
): ReconcileReport => {
  const buckets = createEmptyBuckets();
  const moves: ReconcileMove[] = [];
  let recruited = 0;

  for (const npc of world.npcRegistry.values()) {
    if (!npc.active) continue;
    const division = resolveDivision(npc);
    buckets[division].push(npc);
  }

  const before = toCounts(buckets);
  const policyMap = resolveDivisionPolicyMap(DEFAULT_DIVISION_POLICIES);

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
      countActive(world),
      rng,
    );
    world.nextNpcSerial = intake.nextNpcSerial;
    lowerWorld.nextNpcSerial = intake.nextNpcSerial;
    if (!intake.recruits.length) return false;
    for (const recruit of intake.recruits) {
      buckets.Maezumo.push(recruit);
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
    buckets[to].push(npc);
    moves.push({ id: npc.id, from, to, type });
  };

  const ensureSource = (index: number): boolean => {
    const division = ORDER[index];
    if (buckets[division].length > 0) return true;

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
    const target = resolveTargetHeadcount(division, buckets[division].length, policyMap);

    while (buckets[division].length > target.max) {
      const demoted = takeWorst(buckets[division]);
      if (!demoted) break;
      moveNpc(demoted, division, lowerDivision, 'DEMOTE');
    }

    if (target.fixed) {
      while (buckets[division].length < target.target) {
        if (!ensureSource(i + 1)) break;
        const promoted = takeBest(buckets[lowerDivision]);
        if (!promoted) break;
        moveNpc(promoted, lowerDivision, division, 'PROMOTE');
      }
      continue;
    }

    while (buckets[division].length < target.min) {
      if (!ensureSource(i + 1)) break;
      const promoted = takeBest(buckets[lowerDivision]);
      if (!promoted) break;
      moveNpc(promoted, lowerDivision, division, 'PROMOTE');
    }
  }

  for (const division of ORDER) {
    const bucket = buckets[division].sort(compareByRankThenId);
    for (let i = 0; i < bucket.length; i += 1) {
      const npc = bucket[i];
      npc.currentDivision = division;
      npc.division = division;
      npc.rankScore = i + 1;
    }
  }

  world.rosters.Makuuchi = buckets.Makuuchi
    .slice()
    .sort(compareByRankThenId)
    .map((npc) => toTopRosterItem(npc, 'Makuuchi'));
  world.rosters.Juryo = buckets.Juryo
    .slice()
    .sort(compareByRankThenId)
    .map((npc) => toTopRosterItem(npc, 'Juryo'));

  world.lowerRosterSeeds = {
    Makushita: buckets.Makushita.slice().sort(compareByRankThenId),
    Sandanme: buckets.Sandanme.slice().sort(compareByRankThenId),
    Jonidan: buckets.Jonidan.slice().sort(compareByRankThenId),
    Jonokuchi: buckets.Jonokuchi.slice().sort(compareByRankThenId),
  };
  world.maezumoPool = buckets.Maezumo.slice().sort(compareByRankThenId);

  lowerWorld.rosters = {
    Makushita: buckets.Makushita.slice().sort(compareByRankThenId).map((npc) => toLowerNpc(npc, 'Makushita')),
    Sandanme: buckets.Sandanme.slice().sort(compareByRankThenId).map((npc) => toLowerNpc(npc, 'Sandanme')),
    Jonidan: buckets.Jonidan.slice().sort(compareByRankThenId).map((npc) => toLowerNpc(npc, 'Jonidan')),
    Jonokuchi: buckets.Jonokuchi.slice().sort(compareByRankThenId).map((npc) => toLowerNpc(npc, 'Jonokuchi')),
  };
  lowerWorld.maezumoPool = buckets.Maezumo
    .slice()
    .sort(compareByRankThenId)
    .map((npc) => toLowerNpc(npc, 'Maezumo'));

  boundaryWorld.makushitaPool = buckets.Makushita
    .slice()
    .sort(compareByRankThenId)
    .map(toMakushitaPoolNpc);
  boundaryWorld.npcRegistry = world.npcRegistry;

  return {
    before,
    after: toCounts(buckets),
    recruited,
    moves,
  };
};
