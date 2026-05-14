import type { RandomSource } from '../deps';
import {
  applyNpcDoubleKyujo,
  applyNpcFusenBout,
  simulateNpcBoutCompat,
  type NpcBoutResult,
} from '../combat/npcCompat';
import type { DivisionParticipant } from './types';

export { applyNpcDoubleKyujo, applyNpcFusenBout };

export const simulateNpcBout = (
  a: DivisionParticipant,
  b: DivisionParticipant,
  rng: RandomSource,
): NpcBoutResult => simulateNpcBoutCompat(a, b, rng);
