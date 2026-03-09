import { RandomSource } from '../../deps';
import { clamp, randomNoise } from '../../boundary/shared';
import { createInitialNpcUniverse } from '../../npc/factory';
import {
  MAKUSHITA_POOL_SIZE,
  MAKUSHITA_POWER_MAX,
  MAKUSHITA_POWER_MIN,
  MakushitaNpc,
} from '../types';

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
      ability: npc.ability,
      uncertainty: npc.uncertainty,
      rankScore: index + 1,
      volatility: npc.volatility,
      form: npc.form,
      styleBias: npc.styleBias,
      heightCm: npc.heightCm,
      weightKg: npc.weightKg,
      aptitudeTier: npc.aptitudeTier,
      aptitudeFactor: npc.aptitudeFactor,
      growthBias: npc.growthBias,
    }));
};
