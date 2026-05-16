import { HEISEI_BANZUKE_CALIBRATION } from './banzukeHeisei';
import { LONG_RANGE_BANZUKE_CALIBRATION } from './banzukeLongRange';
import {
  BanzukeCalibrationTarget,
  BanzukeMovementClassSemantics,
  BanzukeMovementQuantiles,
} from './types';

export type BanzukeCalibrationSourceId = 'long-range' | 'heisei';
export type BanzukeCalibrationIntendedUse = 'runtime' | 'diagnostic';

export interface BanzukeCalibrationCoverage {
  recordAwareBucketsByDivision: Record<string, number>;
  recordAwareSamplesByDivision: Record<string, number>;
}

export interface BanzukeCalibrationProfile {
  sourceId: BanzukeCalibrationSourceId;
  target: BanzukeCalibrationTarget;
  movementClassSemantics: BanzukeMovementClassSemantics;
  intendedUse: BanzukeCalibrationIntendedUse;
  coverage: BanzukeCalibrationCoverage;
}

const buildCoverage = (target: BanzukeCalibrationTarget): BanzukeCalibrationCoverage => {
  const recordAwareBucketsByDivision: Record<string, number> = {};
  const recordAwareSamplesByDivision: Record<string, number> = {};

  for (const [division, rankBands] of Object.entries(target.recordBucketRules.recordAwareQuantiles)) {
    let buckets = 0;
    let samples = 0;
    for (const bucketRows of Object.values(rankBands)) {
      for (const quantiles of Object.values(bucketRows)) {
        buckets += 1;
        samples += quantiles?.sampleSize ?? 0;
      }
    }
    recordAwareBucketsByDivision[division] = buckets;
    recordAwareSamplesByDivision[division] = samples;
  }

  return {
    recordAwareBucketsByDivision,
    recordAwareSamplesByDivision,
  };
};

const inferMovementClassSemantics = (
  sourceId: BanzukeCalibrationSourceId,
  target: BanzukeCalibrationTarget,
): BanzukeMovementClassSemantics => {
  if (target.meta.movementClassSemantics) return target.meta.movementClassSemantics;
  if (sourceId === 'heisei') return 'sameDivisionBoundary';
  return 'signedMovement';
};

const createProfile = (
  sourceId: BanzukeCalibrationSourceId,
  target: BanzukeCalibrationTarget,
  intendedUse: BanzukeCalibrationIntendedUse,
): BanzukeCalibrationProfile => ({
  sourceId,
  target,
  movementClassSemantics: inferMovementClassSemantics(sourceId, target),
  intendedUse,
  coverage: buildCoverage(target),
});

const PROFILES: Record<BanzukeCalibrationSourceId, BanzukeCalibrationProfile> = {
  'long-range': createProfile('long-range', LONG_RANGE_BANZUKE_CALIBRATION, 'runtime'),
  heisei: createProfile('heisei', HEISEI_BANZUKE_CALIBRATION, 'diagnostic'),
};

let activeSourceId: BanzukeCalibrationSourceId = 'long-range';

export const setActiveBanzukeCalibrationSource = (
  sourceId: BanzukeCalibrationSourceId,
): void => {
  activeSourceId = sourceId;
};

export const getActiveBanzukeCalibrationSource = (): BanzukeCalibrationSourceId =>
  activeSourceId;

export const getBanzukeCalibrationProfile = (
  sourceId: BanzukeCalibrationSourceId,
): BanzukeCalibrationProfile => PROFILES[sourceId];

export const getActiveBanzukeCalibrationProfile = (): BanzukeCalibrationProfile =>
  getBanzukeCalibrationProfile(activeSourceId);

export const resolveProfileDivisionQuantiles = (
  profile: BanzukeCalibrationProfile,
  division: string,
  movement: 'stayed' | 'promoted' | 'demoted',
): BanzukeMovementQuantiles | null => {
  if (profile.movementClassSemantics !== 'sameDivisionBoundary') return null;
  return profile.target.divisionMovementQuantiles[division]?.[movement] ?? null;
};

export const auditBanzukeCalibrationProfiles = (): BanzukeCalibrationProfile[] =>
  Object.values(PROFILES);
