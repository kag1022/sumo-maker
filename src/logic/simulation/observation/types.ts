import { AptitudeTier, BashoRecord, Rank, RikishiStatus } from '../../models';
import { BanzukeDecisionLog } from '../../banzuke';
import { NpcBashoAggregate } from '../basho';
import { SimulationDiagnostics } from '../diagnostics';
import { SimulationProgressState } from '../workerProtocol';
import { DomainEvent, SimulationRuntimeSnapshot } from '../runtimeTypes';
import { SimulationModelVersion } from '../modelVersion';
import type {
  InitialPopulationProfile,
  ObservationPopulationKind,
  ObservationPopulationMetadata,
  ObservationPopulationPreset,
} from '../../scout/populations';

export interface ObservationAptitudeLadder {
  id: string;
  factors: {
    C?: number;
    D?: number;
  };
}

export interface CareerObservationConfig {
  seed: number;
  initialStatus?: RikishiStatus;
  startYear?: number;
  simulationModelVersion?: SimulationModelVersion;
  aptitudeLadder?: ObservationAptitudeLadder;
  populationKind?: ObservationPopulationKind;
  populationPreset?: ObservationPopulationPreset;
}

export interface ObservationPromotionReview {
  candidate: boolean;
  promote: boolean;
  decisionBand: string;
  score: number;
  blockReason?: string;
}

export interface ObservationTitleContext {
  yusho: boolean;
  wins: number;
  losses: number;
  absent: number;
}

export interface SeasonObservationFrame {
  kind: 'BASHO' | 'COMPLETED';
  seq: number;
  year: number;
  month: number;
  rank: Rank;
  maxRank: Rank;
  record?: BashoRecord;
  progress: SimulationProgressState;
  runtime: SimulationRuntimeSnapshot;
  domainEvents: DomainEvent[];
  diagnostics?: SimulationDiagnostics;
  npcResults: NpcBashoAggregate[];
  banzukeDecisions?: BanzukeDecisionLog[];
  retiredNpcCareerBashoCounts?: number[];
  upperRankEarlyDeepOpponents: number;
  upperRankEarlyTotalOpponents: number;
  promotionReview?: ObservationPromotionReview;
  titleContext?: ObservationTitleContext;
}

export interface RankOutcomeSummary {
  isSekitori: boolean;
  isMakuuchi: boolean;
  isSanyaku: boolean;
  isOzeki: boolean;
  isYokozuna: boolean;
  maxRank: Rank;
  highestRankBucket: string;
}

export interface CareerOutcomeSummary {
  wins: number;
  losses: number;
  absent: number;
  bashoCount: number;
  retireAge: number;
  officialWinRate: number;
  effectiveWinRate: number;
  pooledWinRate: number;
  losingCareer: boolean;
  entryAge: number;
  firstSekitoriBasho?: number;
  sekitoriBashoCount: number;
  makuuchiBashoCount: number;
  fullAbsenceBashoCount: number;
  retirementReasonCode: string;
  retirementReasonLabel: string;
  retiredAfterKachikoshi: boolean;
}

export interface StyleOutcomeSummary {
  uniqueOfficialKimariteCount: number;
  top1MoveShare: number;
  top3MoveShare: number;
  rareMoveRate: number;
  dominantStyleBucket: 'PUSH' | 'GRAPPLE' | 'TECHNIQUE' | null;
  dominantRoute: string | null;
  dominantRouteShare: number;
  top2RouteShare: number;
  strengthStyleCount: number;
  weakStyleCount: number;
  internalStrengthStyleCount: number;
  internalWeakStyleCount: number;
  noStyleIdentity: boolean;
  repertoireUnsettled: boolean;
  repertoireSettledAtBashoSeq?: number;
  kimariteVarietyEligible: boolean;
  kimariteVariety20Reached: boolean;
}

export interface PopulationTimelinePoint {
  seq: number;
  year: number;
  month: number;
  activeBanzukeHeadcount: number;
  jonidanHeadcount: number;
  jonokuchiHeadcount: number;
}

export interface LeagueOutcomeSummary {
  sameStableViolations: number;
  sameCardViolations: number;
  crossDivisionBouts: number;
  lateCrossDivisionBouts: number;
  upperRankEarlyDeepOpponents: number;
  upperRankEarlyTotalOpponents: number;
  lateEntrantCount: number;
  lateEntrantYokozunaCount: number;
  populationTimeline: PopulationTimelinePoint[];
}

export interface YokozunaPipelineSummary {
  ozekiReach: boolean;
  ozekiBashoCount: number;
  ozeki13WinCount: number;
  ozekiYushoCount: number;
  backToBackYushoEquivalentCount: number;
  yokozunaDeliberationCount: number;
  yokozunaPromotionCount: number;
  yokozunaBlockedReasons: Record<string, number>;
}

export interface CareerObservationSummary {
  seed: number;
  startYear: number;
  modelVersion: SimulationModelVersion;
  bundleId: string;
  population: ObservationPopulationMetadata;
  initialPopulation: InitialPopulationProfile;
  aptitudeTier: AptitudeTier;
  rankOutcome: RankOutcomeSummary;
  careerOutcome: CareerOutcomeSummary;
  styleOutcome: StyleOutcomeSummary;
  leagueOutcome: LeagueOutcomeSummary;
  pipeline: YokozunaPipelineSummary;
}

export interface CareerObservationResult {
  seed: number;
  startYear: number;
  modelVersion: SimulationModelVersion;
  populationKind: ObservationPopulationKind;
  populationPreset?: ObservationPopulationPreset;
  initialStatus: RikishiStatus;
  finalStatus: RikishiStatus;
  runtime: SimulationRuntimeSnapshot;
  frames: SeasonObservationFrame[];
  summary: CareerObservationSummary;
}

export interface ObservationPopulationSummary {
  sample: number;
  annualTotalMedian: number;
  annualAbsDeltaMedian: number;
  annualAbsDeltaP90: number;
  annualSwingMedian: number;
  annualSwingP90: number;
  annualJonidanSwingMedian: number;
  annualJonokuchiSwingMedian: number;
}

export interface ObservationStyleBucketSummary {
  sample: number;
  uniqueKimariteP50: number;
  uniqueKimariteP90: number;
  top1MoveShareP50: number;
  top3MoveShareP50: number;
  rareMoveRate: number;
}

export interface ObservationRealismSummary {
  sample: number;
  sekitoriRate: number;
  makuuchiRate: number;
  sanyakuRate: number;
  yokozunaRate: number;
  careerWinRate: number;
  careerEffectiveWinRate: number;
  careerPooledWinRate: number;
  nonSekitoriCareerWinRate: number;
  nonSekitoriCareerEffectiveWinRate: number;
  nonSekitoriCareerPooledWinRate: number;
  losingCareerRate: number;
  avgCareerBasho: number;
  careerBashoP50: number;
  allCareerRetireAgeP50: number;
  nonSekitoriMedianBasho: number;
  lowTierRate: number;
  careerWinRateLe35Rate: number;
  careerWinRateLe30Rate: number;
}

export interface ObservationQuantileSummary {
  p10: number;
  p50: number;
  p90: number;
}

export interface ObservationDistributionSummary {
  highestRankBuckets: Record<string, number>;
  careerBashoBuckets: Record<string, number>;
  careerWinRateBuckets: Record<string, number>;
  careerBasho: ObservationQuantileSummary;
  retireAge: ObservationQuantileSummary;
  officialWinRate: ObservationQuantileSummary;
  effectiveWinRate: ObservationQuantileSummary;
  absent: {
    p50: number;
    p90: number;
    p99: number;
  };
  absenceZeroRate: number;
  fullAbsenceBashoExperienceRate: number;
  firstSekitoriBasho: ObservationQuantileSummary;
  sekitoriBashoCount: {
    p50: number;
    p90: number;
  };
  makuuchiBashoCount: {
    p50: number;
    p90: number;
  };
  lowWinLongCareerRate: number;
  retiredAfterKachikoshiRate: number;
  retirementReasonDistribution: Record<string, number>;
}

export interface ObservationStyleSummary {
  uniqueKimariteP50: number;
  uniqueKimariteP90: number;
  top1MoveShareP50: number;
  top3MoveShareP50: number;
  dominantRouteShareP50: number;
  top2RouteShareP50: number;
  rareMoveRate: number;
  kimariteVariety20Rate: number;
  strengthStyleCountMean: number;
  weakStyleCountMean: number;
  internalStrengthStyleCountMean: number;
  internalWeakStyleCountMean: number;
  noStyleIdentityRate: number;
  repertoireUnsettledRate: number;
  repertoireSettledAtBashoSeqP50: number;
  styleBucketMetrics: Partial<Record<'PUSH' | 'GRAPPLE' | 'TECHNIQUE', ObservationStyleBucketSummary>>;
}

export interface ObservationYokozunaPipelineSummary {
  ozekiReachRate: number;
  ozeki13WinRate: number;
  ozekiYushoRate: number;
  backToBackYushoEquivalentRate: number;
  yokozunaDeliberationRate: number;
  yokozunaPromotionRate: number;
  yokozunaBlockedReasonDistribution: Record<string, number>;
}

export interface ObservationOutlierSummary {
  longestCareerSeeds: number[];
  lowWinLongCareerSeeds: number[];
  highestRankOutlierSeeds: number[];
  highAbsenceSeeds: number[];
  yokozunaSeeds: number[];
  highestLateEntrantYokozunaSeeds: number[];
}

export interface ObservationBatchSummary {
  realism: ObservationRealismSummary;
  distribution: ObservationDistributionSummary;
  population: ObservationPopulationSummary;
  style: ObservationStyleSummary;
  yokozunaPipeline: ObservationYokozunaPipelineSummary;
  outliers: ObservationOutlierSummary;
}
