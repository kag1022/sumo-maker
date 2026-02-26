export type SimulationModelVersion =
  | 'legacy-v6'
  | 'realism-v1'
  | 'unified-v1'
  | 'unified-v2-kimarite';

export const DEFAULT_SIMULATION_MODEL_VERSION: SimulationModelVersion = 'unified-v2-kimarite';

export const isUnifiedModel = (version: SimulationModelVersion): boolean =>
  version === 'unified-v1' || version === 'unified-v2-kimarite';

export const normalizeSimulationModelVersion = (
  version?: SimulationModelVersion,
): SimulationModelVersion => {
  if (version === 'legacy-v6') return 'legacy-v6';
  if (version === 'realism-v1') return 'realism-v1';
  if (version === 'unified-v1') return 'unified-v1';
  return 'unified-v2-kimarite';
};

export const normalizeNewRunModelVersion = (
  requested?: SimulationModelVersion,
): SimulationModelVersion => {
  if (
    requested === 'legacy-v6' ||
    requested === 'realism-v1' ||
    requested === 'unified-v1' ||
    requested === 'unified-v2-kimarite'
  ) {
    return requested;
  }
  return 'unified-v2-kimarite';
};
