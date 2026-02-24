export type SimulationModelVersion = 'legacy-v6' | 'realism-v1' | 'unified-v1';

export const DEFAULT_SIMULATION_MODEL_VERSION: SimulationModelVersion = 'unified-v1';

export const isUnifiedModel = (version: SimulationModelVersion): boolean =>
  version === 'unified-v1';

export const normalizeSimulationModelVersion = (
  version?: SimulationModelVersion,
): SimulationModelVersion => {
  if (version === 'legacy-v6') return 'legacy-v6';
  if (version === 'realism-v1') return 'realism-v1';
  return 'unified-v1';
};

export const normalizeNewRunModelVersion = (
  _requested?: SimulationModelVersion,
): SimulationModelVersion => 'unified-v1';
