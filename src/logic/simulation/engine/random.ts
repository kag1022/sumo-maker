import { RandomSource } from '../deps';

export const createSeededRandom = (seed: number): RandomSource => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};
