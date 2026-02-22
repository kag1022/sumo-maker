export type SimulationModelVersion = 'legacy-v6' | 'realism-v1';

export const DEFAULT_SIMULATION_MODEL_VERSION: SimulationModelVersion = 'legacy-v6';

export const isRealismModel = (version: SimulationModelVersion): boolean =>
  version === 'realism-v1';
