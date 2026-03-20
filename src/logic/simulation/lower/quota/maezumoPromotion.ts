import { DEFAULT_DIVISION_POLICIES, resolveDivisionPolicyMap, resolveTargetHeadcount } from '../../../banzuke/population/flow';
import { RandomSource } from '../../deps';
import { clamp, randomNoise } from '../../boundary/shared';
import { DIVISION_SIZE, LowerDivisionQuotaWorld } from '../../lower/types';

export const promoteMaezumoToJonokuchi = (
  world: LowerDivisionQuotaWorld,
  rng: RandomSource,
): void => {
  if (!world.maezumoPool.length) {
    world.lastMaezumoPromotions = [];
    return;
  }

  const jonokuchiSlots = Math.max(1, world.rosters.Jonokuchi.length || DIVISION_SIZE.Jonokuchi);
  const resolveRiseBandSlotRange = (riseBand: 1 | 2 | 3): [number, number] => {
    if (riseBand === 1) {
      return [
        clamp(Math.round(jonokuchiSlots * 0.78), 1, jonokuchiSlots),
        clamp(Math.round(jonokuchiSlots * 0.88), 1, jonokuchiSlots),
      ];
    }
    if (riseBand === 2) {
      return [
        clamp(Math.round(jonokuchiSlots * 0.86), 1, jonokuchiSlots),
        clamp(Math.round(jonokuchiSlots * 0.95), 1, jonokuchiSlots),
      ];
    }
    return [
      clamp(Math.round(jonokuchiSlots * 0.92), 1, jonokuchiSlots),
      clamp(Math.round(jonokuchiSlots * 0.99), 1, jonokuchiSlots),
    ];
  };

  const promotions = world.maezumoPool.map((npc) => {
    const baseAbility = Number.isFinite(npc.ability)
      ? (npc.ability as number)
      : npc.basePower * npc.form;
    const seasonal = baseAbility + randomNoise(rng, npc.volatility) + randomNoise(rng, 1.1);
    const winProbability = clamp(0.25 + (seasonal - 28) / 42, 0.12, 0.88);
    let wins = 0;
    for (let i = 0; i < 3; i += 1) {
      if (rng() < winProbability) wins += 1;
    }
    const riseBand: 1 | 2 | 3 = wins === 3 ? 1 : wins === 2 ? 2 : 3;
    const targetRange = resolveRiseBandSlotRange(riseBand);
    const targetRankScore = targetRange[0] + Math.floor(rng() * (targetRange[1] - targetRange[0] + 1));
    return {
      npc: {
        ...npc,
        division: 'Jonokuchi' as const,
        currentDivision: 'Jonokuchi' as const,
        rankScore: targetRankScore,
        riseBand,
      },
      riseBand,
    };
  });

  world.lastMaezumoPromotions = promotions.map((row) => ({
    id: row.npc.id,
    shikona: row.npc.shikona,
    riseBand: row.riseBand,
  }));
  world.maezumoPool = [];

  const merged = world.rosters.Jonokuchi
    .concat(promotions.map((row) => row.npc))
    .sort((a, b) => a.rankScore - b.rankScore)
    .map((npc, index) => ({ ...npc, rankScore: index + 1 }));
  const policy = resolveDivisionPolicyMap(DEFAULT_DIVISION_POLICIES);
  const target = resolveTargetHeadcount('Jonokuchi', merged.length, policy);
  const maxSlots = target.max;

  if (merged.length <= maxSlots) {
    world.rosters.Jonokuchi = merged;
    return;
  }

  world.rosters.Jonokuchi = merged.slice(0, maxSlots);
  const overflow = merged.slice(maxSlots);
  for (const npc of overflow) {
    const recycled = {
      ...npc,
      division: 'Maezumo' as const,
      currentDivision: 'Maezumo' as const,
      rankScore: 1,
      riseBand: 3 as const,
    };
    world.maezumoPool.push(recycled);
    const persistent = world.npcRegistry.get(recycled.id);
    if (persistent) {
      persistent.division = 'Maezumo';
      persistent.currentDivision = 'Maezumo';
      persistent.rankScore = 1;
      persistent.riseBand = 3;
    }
  }
};
