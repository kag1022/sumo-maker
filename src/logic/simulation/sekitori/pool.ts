import { Rank } from '../../models';
import { RandomSource } from '../deps';
import {
  createDailyMatchups,
  createFacedMap,
  DivisionParticipant,
  simulateNpcBout,
} from '../matchmaking';
import { SimulationWorld } from '../world';
import { clamp, randomNoise } from '../boundary/shared';
import { createInitialNpcUniverse } from '../npc/factory';
import { pushNpcBashoResult } from '../npc/retirement';
import {
  BoundarySnapshot,
  JURYO_POWER_MAX,
  JURYO_POWER_MIN,
  JURYO_SIZE,
  MAKUSHITA_POOL_SIZE,
  MAKUSHITA_POWER_MAX,
  MAKUSHITA_POWER_MIN,
  MakushitaNpc,
  PlayerMakushitaRecord,
  SekitoriBoundaryWorld,
} from './types';

const resolvePlayerMakushitaRankScore = (rank: Rank): number => {
  const number = clamp(rank.number || 1, 1, 60);
  const sideOffset = rank.side === 'West' ? 1 : 0;
  return clamp(1 + (number - 1) * 2 + sideOffset, 1, MAKUSHITA_POOL_SIZE);
};

const snapshotParticipants = (participants: DivisionParticipant[]): BoundarySnapshot[] =>
  participants.map((participant) => ({
    id: participant.id,
    shikona: participant.shikona,
    isPlayer: participant.isPlayer,
    stableId: participant.stableId,
    rankScore: participant.rankScore,
    wins: participant.wins,
    losses: participant.losses,
  }));

const createMakushitaParticipants = (
  world: SekitoriBoundaryWorld,
  rng: RandomSource,
): DivisionParticipant[] => {
  const roster = world.makushitaPool
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore)
    .slice(0, MAKUSHITA_POOL_SIZE);

  return roster.map((npc) => {
    const seasonalPower =
      npc.basePower * npc.form + randomNoise(rng, npc.volatility) + randomNoise(rng, 0.8);
    return {
      id: npc.id,
      shikona: npc.shikona,
      isPlayer: false,
      stableId: npc.stableId,
      rankScore: npc.rankScore,
      power: clamp(seasonalPower, MAKUSHITA_POWER_MIN, MAKUSHITA_POWER_MAX),
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      wins: 0,
      losses: 0,
      active: true,
    };
  });
};

const evolveMakushitaPool = (
  world: SekitoriBoundaryWorld,
  participants: DivisionParticipant[],
  rng: RandomSource,
): void => {
  const byId = new Map(participants.filter((p) => !p.isPlayer).map((p) => [p.id, p]));

  world.makushitaPool = world.makushitaPool
    .map((npc) => {
      const result = byId.get(npc.id);
      if (!result) return npc;

      const diff = result.wins - result.losses;
      const updated = {
        ...npc,
        basePower: clamp(
          npc.basePower + diff * 0.28 + (npc.growthBias ?? 0) * 0.85 + randomNoise(rng, 0.4),
          MAKUSHITA_POWER_MIN,
          MAKUSHITA_POWER_MAX,
        ),
        form: clamp(
          npc.form * 0.64 + (1 + diff * 0.012 + randomNoise(rng, 0.05)) * 0.36,
          0.85,
          1.15,
        ),
        rankScore: clamp(npc.rankScore - diff * 0.6 + randomNoise(rng, 0.25), 1, 999),
      };
      const persistent = world.npcRegistry?.get(npc.id);
      if (persistent) {
        persistent.basePower = updated.basePower;
        persistent.form = updated.form;
        persistent.rankScore = updated.rankScore;
        persistent.growthBias = updated.growthBias ?? persistent.growthBias;
        persistent.division = 'Makushita';
        persistent.currentDivision = 'Makushita';
        pushNpcBashoResult(persistent, result.wins, result.losses);
      }
      return updated;
    })
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
};

export const simulateMakushitaBoundaryBasho = (
  world: SekitoriBoundaryWorld,
  rng: RandomSource,
): BoundarySnapshot[] => {
  const participants = createMakushitaParticipants(world, rng);
  const facedMap = createFacedMap(participants);

  for (let boutIndex = 0; boutIndex < 7; boutIndex += 1) {
    const day = 1 + boutIndex * 2;
    const daily = createDailyMatchups(participants, facedMap, rng, day, 15);
    for (const { a, b } of daily.pairs) {
      simulateNpcBout(a, b, rng);
    }
  }

  const snapshots = snapshotParticipants(participants);
  world.lastMakushitaResults = snapshots;
  evolveMakushitaPool(world, participants, rng);
  return snapshots;
};

export const mergePlayerMakushitaRecord = (
  baseResults: BoundarySnapshot[],
  playerRecord?: PlayerMakushitaRecord,
): BoundarySnapshot[] => {
  if (!playerRecord || playerRecord.rank.division !== 'Makushita') {
    return baseResults;
  }

  const playerSnapshot: BoundarySnapshot = {
    id: 'PLAYER',
    shikona: playerRecord.shikona,
    isPlayer: true,
    stableId: 'player-heya',
    rankScore: resolvePlayerMakushitaRankScore(playerRecord.rank),
    wins: playerRecord.wins,
    losses: playerRecord.losses + playerRecord.absent,
  };

  return baseResults.filter((result) => result.id !== 'PLAYER').concat(playerSnapshot);
};

export const applyNpcExchange = (
  topWorld: SimulationWorld,
  boundaryWorld: SekitoriBoundaryWorld,
  promotedToJuryoIds: string[],
  demotedToMakushitaIds: string[],
): void => {
  type JuryoRosterItem = SimulationWorld['rosters']['Juryo'][number];

  const promotedNpcIds = promotedToJuryoIds.filter((id) => id !== 'PLAYER');
  const demotedNpcIds = demotedToMakushitaIds.filter((id) => id !== 'PLAYER');
  const slots = Math.min(promotedNpcIds.length, demotedNpcIds.length);
  if (slots === 0) return;

  const selectedPromotedIds = promotedNpcIds.slice(0, slots);
  const selectedDemotedIds = demotedNpcIds.slice(0, slots);

  const juryo = topWorld.rosters.Juryo.slice().sort((a, b) => a.rankScore - b.rankScore);
  const juryoMap = new Map(juryo.map((rikishi) => [rikishi.id, rikishi]));
  const makushitaPool = boundaryWorld.makushitaPool
    .slice()
    .sort((a, b) => a.rankScore - b.rankScore);
  const makushitaMap = new Map(makushitaPool.map((rikishi) => [rikishi.id, rikishi]));

  const promoted = selectedPromotedIds
    .map((id, index) => {
      const rikishi = makushitaMap.get(id);
      if (!rikishi) return null;
      const promotedRikishi: JuryoRosterItem = {
        id: rikishi.id,
        shikona: rikishi.shikona,
        division: 'Juryo',
        stableId: rikishi.stableId,
        basePower: clamp(rikishi.basePower + 4, JURYO_POWER_MIN, JURYO_POWER_MAX),
        growthBias: rikishi.growthBias ?? 0,
        rankScore: JURYO_SIZE - slots + index + 1,
        volatility: rikishi.volatility,
        form: rikishi.form,
        styleBias: rikishi.styleBias ?? 'BALANCE',
        heightCm: rikishi.heightCm ?? 184,
        weightKg: rikishi.weightKg ?? 140,
      };
      return promotedRikishi;
    })
    .filter((rikishi): rikishi is JuryoRosterItem => Boolean(rikishi));

  const demoted = selectedDemotedIds
    .map<MakushitaNpc | null>((id, index) => {
      const rikishi = juryoMap.get(id);
      if (!rikishi) return null;
      return {
        id: rikishi.id,
        shikona: rikishi.shikona,
        stableId: rikishi.stableId,
        basePower: clamp(rikishi.basePower - 3.5, MAKUSHITA_POWER_MIN, MAKUSHITA_POWER_MAX),
        rankScore: index + 1,
        volatility: rikishi.volatility,
        form: rikishi.form,
        styleBias: rikishi.styleBias,
        heightCm: rikishi.heightCm,
        weightKg: rikishi.weightKg,
        growthBias: rikishi.growthBias,
      };
    })
    .filter((rikishi): rikishi is MakushitaNpc => rikishi !== null);

  const appliedSlots = Math.min(promoted.length, demoted.length);
  if (appliedSlots === 0) return;
  const appliedPromoted = promoted.slice(0, appliedSlots);
  const appliedDemoted = demoted.slice(0, appliedSlots);

  const promotedSet = new Set(appliedPromoted.map((rikishi) => rikishi.id));
  const demotedSet = new Set(appliedDemoted.map((rikishi) => rikishi.id));

  topWorld.rosters.Juryo = juryo
    .filter((rikishi) => !demotedSet.has(rikishi.id))
    .concat(appliedPromoted)
    .sort((a, b) => a.rankScore - b.rankScore)
    .slice(0, JURYO_SIZE)
    .map((rikishi, index) => ({ ...rikishi, division: 'Juryo', rankScore: index + 1 }));

  boundaryWorld.makushitaPool = makushitaPool
    .filter((rikishi) => !promotedSet.has(rikishi.id))
    .concat(appliedDemoted)
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((rikishi, index) => ({ ...rikishi, rankScore: index + 1 }));

  const registry = topWorld.npcRegistry ?? boundaryWorld.npcRegistry;
  if (!registry) return;

  for (const rikishi of topWorld.rosters.Juryo) {
    const npc = registry.get(rikishi.id);
    if (!npc) continue;
    npc.division = 'Juryo';
    npc.currentDivision = 'Juryo';
    npc.rankScore = rikishi.rankScore;
    npc.basePower = rikishi.basePower;
    npc.growthBias = rikishi.growthBias;
    npc.form = rikishi.form;
    npc.volatility = rikishi.volatility;
    npc.styleBias = rikishi.styleBias;
    npc.heightCm = rikishi.heightCm;
    npc.weightKg = rikishi.weightKg;
  }
  for (const rikishi of boundaryWorld.makushitaPool) {
    const npc = registry.get(rikishi.id);
    if (!npc) continue;
    npc.division = 'Makushita';
    npc.currentDivision = 'Makushita';
    npc.rankScore = rikishi.rankScore;
    npc.basePower = rikishi.basePower;
    npc.growthBias = rikishi.growthBias ?? npc.growthBias;
    npc.form = rikishi.form;
    npc.volatility = rikishi.volatility;
    npc.styleBias = rikishi.styleBias ?? npc.styleBias;
    npc.heightCm = rikishi.heightCm ?? npc.heightCm;
    npc.weightKg = rikishi.weightKg ?? npc.weightKg;
  }
};

export const createSekitoriMakushitaPool = (rng: RandomSource): MakushitaNpc[] => {
  const universe = createInitialNpcUniverse(rng);
  return universe.rosters.Makushita
    .slice(0, MAKUSHITA_POOL_SIZE)
    .map((npc, index) => ({
      id: npc.id,
      shikona: npc.shikona,
      stableId: npc.stableId,
      basePower: clamp(
        npc.basePower + randomNoise(rng, 0.75),
        MAKUSHITA_POWER_MIN,
        MAKUSHITA_POWER_MAX,
      ),
      rankScore: index + 1,
      volatility: npc.volatility,
      form: npc.form,
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      growthBias: npc.growthBias,
    }));
};
