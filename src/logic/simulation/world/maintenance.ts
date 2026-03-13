import { SimulationWorld } from './types';

export const countActiveNpcInWorld = (world: SimulationWorld): number => {
  let count = 0;
  for (const npc of world.npcRegistry.values()) {
    if (npc.actorType === 'PLAYER') continue;
    if (npc.active) count += 1;
  }
  return count;
};

export const pruneRetiredTopDivisionRosters = (world: SimulationWorld): void => {
  for (const division of ['Makuuchi', 'Juryo'] as const) {
    world.rosters[division] = world.rosters[division].map((rikishi) => {
      const registryNpc = world.npcRegistry.get(rikishi.id);
      if (!registryNpc) return rikishi;
      return {
        ...rikishi,
        shikona: registryNpc.shikona,
        stableId: registryNpc.stableId,
        basePower: registryNpc.basePower,
        ability: registryNpc.ability,
        uncertainty: registryNpc.uncertainty,
        growthBias: registryNpc.growthBias,
        form: registryNpc.form,
        volatility: registryNpc.volatility,
        styleBias: registryNpc.styleBias,
        heightCm: registryNpc.heightCm,
        weightKg: registryNpc.weightKg,
        aptitudeTier: registryNpc.aptitudeTier,
        aptitudeFactor: registryNpc.aptitudeFactor,
        aptitudeProfile: registryNpc.aptitudeProfile,
        careerBand: registryNpc.careerBand,
        stagnation: registryNpc.stagnation,
      };
    });
  }
};
