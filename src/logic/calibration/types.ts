import type { AptitudeTier, CareerBand, Division, RetirementProfile } from '../models';

export type CalibrationRankRateKey =
  | 'sekitoriRate'
  | 'makuuchiRate'
  | 'sanyakuRate'
  | 'ozekiRate'
  | 'yokozunaRate';

export interface CalibrationMeta {
  generatedAt: string;
  source: string;
  era: string;
  sampleSize: number;
  bashoCount?: number;
  cohort?: string;
}

export interface BanzukeDataQuality {
  rikishiBashoRecordCount: number;
  candidatePairCount: number;
  consecutivePairCount: number;
  consecutiveMovementRate: number;
  rankMovementJoinSuccessRate: number;
  validBoutLengthRate: number;
  banzukeAlignmentRate: number;
}

export interface DistributionCalibrationStats {
  sampleSize: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  max: number;
}

export interface CareerCalibrationTarget {
  meta: CalibrationMeta & {
    minDebutYear: number;
  };
  rankRates: Record<CalibrationRankRateKey, number>;
  careerLength: {
    mean: number;
    p10: number;
    p50: number;
    p90: number;
  };
  careerWinRate: {
    mean: number;
    median: number;
    bucketRates: Record<string, number>;
  };
  distributionBuckets: {
    highestRank: Record<string, number>;
    careerBasho: Record<string, number>;
    careerWinRate: Record<string, number>;
  };
  longTailSignals: {
    lowWinLongCareerRate: number;
  };
}

export interface BanzukeMovementQuantiles {
  sampleSize: number;
  p10HalfStep: number;
  p50HalfStep: number;
  p90HalfStep: number;
  p10Rank: number;
  p50Rank: number;
  p90Rank: number;
}

export interface BoundaryExchangeRate {
  sampleSize: number;
  count: number;
  rate: number;
}

export type BanzukeRankBandTuple = [number, number | null, string];

export interface RecordAwareQuantileMap {
  [division: string]: {
    [rankBand: string]: {
      [recordBucket: string]: BanzukeMovementQuantiles | null;
    };
  };
}

export interface BanzukeCalibrationTarget {
  meta: CalibrationMeta & {
    divisionScope: string[];
    note?: string;
    dataQuality?: BanzukeDataQuality;
  };
  divisionMovementQuantiles: Record<
    string,
    Record<'stayed' | 'promoted' | 'demoted', BanzukeMovementQuantiles | null>
  >;
  boundaryExchangeRates: Record<string, BoundaryExchangeRate>;
  recordBucketRules: {
    supported: boolean;
    source: string;
    recordLinkMeaning: string;
    lowerDivisionScope: string[];
    rankBands: Record<string, BanzukeRankBandTuple[]>;
    recordAwareQuantiles: RecordAwareQuantileMap;
  };
}

export interface PopulationCalibrationTarget {
  meta: CalibrationMeta & {
    divisionScope: string[];
    countMeaning: string;
    monthlyIntakeMeaning: string;
  };
  annualTotalHeadcount: DistributionCalibrationStats;
  annualTotalDelta: DistributionCalibrationStats;
  annualTotalSwing: DistributionCalibrationStats;
  annualJonidanHeadcount: DistributionCalibrationStats;
  annualJonidanDelta: DistributionCalibrationStats;
  annualJonidanSwing: DistributionCalibrationStats;
  annualJonokuchiHeadcount: DistributionCalibrationStats;
  annualJonokuchiDelta: DistributionCalibrationStats;
  annualJonokuchiSwing: DistributionCalibrationStats;
  monthlyIntakeByMonth: Record<string, DistributionCalibrationStats | null>;
  bashoLevelReference: {
    totalHeadcount: DistributionCalibrationStats;
    jonidanHeadcount: DistributionCalibrationStats;
    jonokuchiHeadcount: DistributionCalibrationStats;
  };
}

export interface CalibrationBundle {
  meta?: {
    generatedAt: string;
    cohort: string;
    sampleSize: number;
    includedCount: number;
    excludedCount: number;
    pendingCount: number;
    stabilityStatus: {
      isStable: boolean;
      recommendedStopReason: string;
      stableRunLength: number;
      reachedMinimumSample: boolean;
    };
  };
  career: CareerCalibrationTarget;
  banzuke: BanzukeCalibrationTarget;
  population?: PopulationCalibrationTarget;
  collection?: Record<string, unknown>;
}

export type EmpiricalNpcRetirementResultClass =
  | 'KK'
  | 'EVEN'
  | 'MK_LIGHT'
  | 'MK_HEAVY'
  | 'FULL_KYUJO';

export type EmpiricalNpcAgeBand =
  | '15-18'
  | '19-21'
  | '22-24'
  | '25-27'
  | '28-30'
  | '31-33'
  | '34-36'
  | '37-39'
  | '40+';

export type EmpiricalNpcAbsenceBand = '0' | '1-2' | '3-5' | '6+';

export interface EmpiricalNpcSeedRecipe {
  id: string;
  aptitudeTier: AptitudeTier;
  careerBand: CareerBand;
  retirementProfile: RetirementProfile;
  riseBand: 1 | 2 | 3;
  weight: number;
}

export interface EmpiricalNpcRetirementStateKey {
  division: Division;
  rankBand: string;
  ageBand: EmpiricalNpcAgeBand;
  resultClass: EmpiricalNpcRetirementResultClass;
  absenceBand: EmpiricalNpcAbsenceBand;
  formerSekitori: boolean;
}

export interface EmpiricalNpcRetirementHazardRow {
  sampleSize: number;
  retirements: number;
  hazard: number;
}

export interface EmpiricalNpcRetirementFallbacks {
  dropFormerSekitori: Record<string, EmpiricalNpcRetirementHazardRow>;
  dropRankBand: Record<string, EmpiricalNpcRetirementHazardRow>;
  divisionAgeResult: Record<string, EmpiricalNpcRetirementHazardRow>;
  divisionOnly: Record<string, EmpiricalNpcRetirementHazardRow>;
}

export interface EmpiricalNpcRetirementLookupMeta {
  fallbackLevel: 'full' | 'dropFormerSekitori' | 'dropRankBand' | 'divisionAgeResult' | 'divisionOnly' | 'none';
  sampleSize: number;
}

export interface EmpiricalNpcRealismCalibrationTarget {
  meta: CalibrationMeta & {
    sampleSizeThreshold: number;
  };
  npcSeedMix: EmpiricalNpcSeedRecipe[];
  retirementHazardByState: Record<string, EmpiricalNpcRetirementHazardRow>;
  retirementFallbacks: EmpiricalNpcRetirementFallbacks;
  divisionAgeProfile: Record<string, DistributionCalibrationStats>;
  fitSummary?: Record<string, unknown>;
}
