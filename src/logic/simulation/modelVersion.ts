export type SimulationModelVersion =
  | 'unified-v2-kimarite'
  | 'unified-v3-variance';

export const DEFAULT_SIMULATION_MODEL_VERSION: SimulationModelVersion = 'unified-v3-variance';

export const isUnifiedModel = (version: SimulationModelVersion): boolean =>
  version === 'unified-v2-kimarite' || version === 'unified-v3-variance';

export const normalizeSimulationModelVersion = (
  version?: string,
): SimulationModelVersion => {
  if (version === 'unified-v3-variance') return 'unified-v3-variance';
  return 'unified-v2-kimarite';
};

export const normalizeNewRunModelVersion = (
  requested?: string,
): SimulationModelVersion => {
  if (
    requested === 'unified-v3-variance' ||
    requested === 'unified-v2-kimarite'
  ) {
    return requested;
  }
  return 'unified-v3-variance';
};
