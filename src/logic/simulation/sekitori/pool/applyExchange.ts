import { SimulationWorld } from '../../world';
import { clamp } from '../../boundary/shared';
import {
  JURYO_POWER_MAX,
  JURYO_POWER_MIN,
  JURYO_SIZE,
  MAKUSHITA_POWER_MAX,
  MAKUSHITA_POWER_MIN,
  MakushitaNpc,
  SekitoriBoundaryWorld,
} from '../types';

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
        ability: (rikishi.ability ?? rikishi.basePower) + 3.5,
        uncertainty: Math.max(0.6, rikishi.uncertainty ?? 1.6),
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
        ability: (rikishi.ability ?? rikishi.basePower) - 3.2,
        uncertainty: Math.min(2.3, (rikishi.uncertainty ?? 1.4) + 0.04),
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
    npc.ability = rikishi.ability;
    npc.uncertainty = rikishi.uncertainty;
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
    npc.ability = rikishi.ability;
    npc.uncertainty = rikishi.uncertainty;
    npc.growthBias = rikishi.growthBias ?? npc.growthBias;
    npc.form = rikishi.form;
    npc.volatility = rikishi.volatility;
    npc.styleBias = rikishi.styleBias ?? npc.styleBias;
    npc.heightCm = rikishi.heightCm ?? npc.heightCm;
    npc.weightKg = rikishi.weightKg ?? npc.weightKg;
  }
};
