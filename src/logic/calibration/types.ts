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
  collection?: Record<string, unknown>;
}
