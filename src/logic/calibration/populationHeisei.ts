import rawCalibration from '../../../sumo-db/data/analysis/population_calibration_heisei.json';
import { DistributionCalibrationStats, PopulationCalibrationTarget } from './types';

export const HEISEI_POPULATION_CALIBRATION =
  rawCalibration as unknown as PopulationCalibrationTarget;

export const getHeiseiMonthlyIntakeStats = (
  month: number,
): DistributionCalibrationStats | null =>
  HEISEI_POPULATION_CALIBRATION.monthlyIntakeByMonth[String(month)] ?? null;
