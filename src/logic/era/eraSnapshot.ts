import type { SimulationRunOptions } from '../models';
import snapshotsJson from './data/era_snapshots_196007_202603.json';
import type { EraRunMetadata, EraSnapshot } from './types';

const ERA_SNAPSHOTS = snapshotsJson as EraSnapshot[];
const ERA_SNAPSHOT_BY_ID = new Map(ERA_SNAPSHOTS.map((snapshot) => [snapshot.id, snapshot]));

export const listEraSnapshots = (): EraSnapshot[] => [...ERA_SNAPSHOTS];

export const getEraSnapshotById = (id?: string | null): EraSnapshot | undefined => {
  if (!id) return undefined;
  return ERA_SNAPSHOT_BY_ID.get(id);
};

export const selectRandomEraSnapshot = (
  random: () => number = Math.random,
): EraSnapshot => {
  if (ERA_SNAPSHOTS.length === 0) {
    throw new Error('EraSnapshot data is empty.');
  }
  const index = Math.min(
    ERA_SNAPSHOTS.length - 1,
    Math.max(0, Math.floor(random() * ERA_SNAPSHOTS.length)),
  );
  return ERA_SNAPSHOTS[index];
};

export const toEraRunMetadata = (snapshot: EraSnapshot): EraRunMetadata => ({
  eraSnapshotId: snapshot.id,
  eraTags: snapshot.eraTags,
  publicEraLabel: snapshot.publicEraLabel,
});

export const withRandomEraSnapshot = (
  runOptions?: SimulationRunOptions,
  random: () => number = Math.random,
): SimulationRunOptions => {
  if (runOptions?.eraSnapshotId) return runOptions;
  const snapshot = selectRandomEraSnapshot(random);
  return {
    ...runOptions,
    ...toEraRunMetadata(snapshot),
  };
};
