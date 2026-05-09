import frequencyData from './data/kimarite_realdata_frequency.json';
import { normalizeKimariteName } from './aliases';
import type { KimariteRarityBucket, OfficialKimariteEntry } from './catalog';

export interface KimariteRealdataFrequencyRow {
  kimariteId: string;
  canonicalName: string;
  observedCount: number;
  observedRate: number;
  source: string;
  sourcePeriod: string;
  sourceTotalBouts: number;
  observedInSource: boolean;
}

interface KimariteRealdataFrequencyPayload {
  sourceUrl: string;
  source: string;
  sourcePeriod: string;
  sourceTotalBouts: number;
  generatedAt: string;
  rows: KimariteRealdataFrequencyRow[];
}

export interface KimariteRealdataCalibration {
  row?: KimariteRealdataFrequencyRow;
  rarityBucket: KimariteRarityBucket;
  historicalWeight: number;
  signatureEligible: boolean;
}

export const KIMARITE_REALDATA_EPSILON_WEIGHT = 0.0001;
export const KIMARITE_REALDATA_COMMON_RATE = 0.03;
export const KIMARITE_REALDATA_UNCOMMON_RATE = 0.005;
export const KIMARITE_REALDATA_RARE_RATE = 0.0005;
export const KIMARITE_REALDATA_WEIGHT_CEILING = 28;

export const KIMARITE_REALDATA_FREQUENCY =
  frequencyData as KimariteRealdataFrequencyPayload;

const frequencyByName = new Map(
  KIMARITE_REALDATA_FREQUENCY.rows.map((row) => [
    normalizeKimariteName(row.canonicalName),
    row,
  ]),
);

export const resolveKimariteRarityFromObservedRate = (
  observedRate: number,
): KimariteRarityBucket => {
  if (observedRate >= KIMARITE_REALDATA_COMMON_RATE) return 'COMMON';
  if (observedRate >= KIMARITE_REALDATA_UNCOMMON_RATE) return 'UNCOMMON';
  if (observedRate >= KIMARITE_REALDATA_RARE_RATE) return 'RARE';
  return 'EXTREME';
};

export const resolveKimariteGameWeightFromObservedRate = (
  observedRate: number,
): number => {
  if (observedRate <= 0) return KIMARITE_REALDATA_EPSILON_WEIGHT;
  return Math.min(
    KIMARITE_REALDATA_WEIGHT_CEILING,
    Math.max(KIMARITE_REALDATA_EPSILON_WEIGHT, observedRate * 100),
  );
};

export const findKimariteRealdataFrequency = (
  name: string,
): KimariteRealdataFrequencyRow | undefined =>
  frequencyByName.get(normalizeKimariteName(name));

export const resolveKimariteRealdataCalibration = (
  entry: OfficialKimariteEntry,
): KimariteRealdataCalibration => {
  const row = findKimariteRealdataFrequency(entry.name);
  if (!row) {
    return {
      rarityBucket: entry.rarityBucket,
      historicalWeight: entry.historicalWeight,
      signatureEligible: entry.signatureEligible,
    };
  }

  return {
    row,
    rarityBucket: resolveKimariteRarityFromObservedRate(row.observedRate),
    historicalWeight: resolveKimariteGameWeightFromObservedRate(row.observedRate),
    signatureEligible: entry.signatureEligible && row.observedCount > 0,
  };
};

export const applyKimariteRealdataCalibration = (
  entries: OfficialKimariteEntry[],
): OfficialKimariteEntry[] =>
  entries.map((entry) => {
    const calibration = resolveKimariteRealdataCalibration(entry);
    return {
      ...entry,
      rarityBucket: calibration.rarityBucket,
      historicalWeight: calibration.historicalWeight,
      signatureEligible: calibration.signatureEligible,
    };
  });
