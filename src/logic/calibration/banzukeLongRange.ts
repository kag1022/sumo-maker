import rawCalibration from '../../../sumo-api-db/data/analysis/banzuke_calibration_long_range.json';
import { BanzukeCalibrationTarget, BanzukeMovementQuantiles } from './types';

export const LONG_RANGE_BANZUKE_CALIBRATION =
  rawCalibration as unknown as BanzukeCalibrationTarget;

export const getLongRangeBoundaryExchangeRate = (key: string): number =>
  LONG_RANGE_BANZUKE_CALIBRATION.boundaryExchangeRates[key]?.rate ?? 0;

export const getLongRangeDivisionQuantiles = (
  division: string,
  movement: 'stayed' | 'promoted' | 'demoted',
): BanzukeMovementQuantiles | null =>
  LONG_RANGE_BANZUKE_CALIBRATION.divisionMovementQuantiles[division]?.[movement] ?? null;
