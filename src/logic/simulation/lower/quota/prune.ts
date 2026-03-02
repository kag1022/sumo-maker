import { LowerDivisionQuotaWorld } from '../../lower/types';

export const pruneRetiredLowerRosters = (world: LowerDivisionQuotaWorld): void => {
  for (const division of ['Makushita', 'Sandanme', 'Jonidan', 'Jonokuchi'] as const) {
    world.rosters[division] = world.rosters[division]
      .sort((a, b) => a.rankScore - b.rankScore)
      .map((npc, index) => {
        const persistent = world.npcRegistry.get(npc.id);
        if (!persistent) {
          return { ...npc, rankScore: index + 1, division, currentDivision: division };
        }
        return {
          ...npc,
          shikona: persistent.shikona,
          stableId: persistent.stableId,
          basePower: persistent.basePower,
          ability: persistent.ability,
          uncertainty: persistent.uncertainty,
          volatility: persistent.volatility,
          form: persistent.form,
          styleBias: persistent.styleBias,
          heightCm: persistent.heightCm,
          weightKg: persistent.weightKg,
          growthBias: persistent.growthBias,
          retirementBias: persistent.retirementBias,
          active: persistent.active,
          rankScore: index + 1,
          division,
          currentDivision: division,
        };
      });
  }

  world.maezumoPool = world.maezumoPool
    .filter((npc) => world.npcRegistry.get(npc.id)?.active !== false)
    .map((npc) => ({
      ...npc,
      division: 'Maezumo',
      currentDivision: 'Maezumo',
      rankScore: 1,
    }));
};
