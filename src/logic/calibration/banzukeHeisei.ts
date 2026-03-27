import rawCalibration from '../../../sumo-db/data/analysis/banzuke_calibration_heisei.json';
import { BanzukeCalibrationTarget, BanzukeMovementQuantiles } from './types';

export const HEISEI_BANZUKE_CALIBRATION =
  rawCalibration as unknown as BanzukeCalibrationTarget;

export const getHeiseiBoundaryExchangeRate = (key: string): number =>
  HEISEI_BANZUKE_CALIBRATION.boundaryExchangeRates[key]?.rate ?? 0;

export const getHeiseiDivisionQuantiles = (
  division: string,
  movement: 'stayed' | 'promoted' | 'demoted',
): BanzukeMovementQuantiles | null =>
  HEISEI_BANZUKE_CALIBRATION.divisionMovementQuantiles[division]?.[movement] ?? null;
