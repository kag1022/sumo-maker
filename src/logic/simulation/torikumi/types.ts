import { EnemyStyleBias } from '../../catalog/enemyData';
import { AptitudeProfile, AptitudeTier, CareerBand, StagnationState } from '../../models';
import { RandomSource } from '../deps';
import { SimulationModelVersion } from '../modelVersion';

export type TorikumiDivision =
  | 'Makuuchi'
  | 'Juryo'
  | 'Makushita'
  | 'Sandanme'
  | 'Jonidan'
  | 'Jonokuchi';

export type BoundaryId =
  | 'MakuuchiJuryo'
  | 'JuryoMakushita'
  | 'MakushitaSandanme'
  | 'SandanmeJonidan'
  | 'JonidanJonokuchi';

export type BoundaryActivationReason =
  | 'VACANCY'
  | 'SHORTAGE'
  | 'SCORE_ALIGNMENT'
  | 'LATE_EVAL'
  | 'RUNAWAY_CHECK';

export type TorikumiTier =
  | 'Yokozuna'
  | 'Ozeki'
  | 'Sanyaku'
  | 'Upper'
  | 'Lower'
  | 'Boundary';

export type YushoRaceTier =
  | 'Leader'
  | 'Contender'
  | 'Outside';

export type TorikumiMatchReason =
  | 'SANYAKU_ROUND_ROBIN'
  | 'JOI_ASSIGNMENT'
  | 'YUSHO_DIRECT'
  | 'YUSHO_PURSUIT'
  | 'JURYO_PROMOTION_RACE'
  | 'JURYO_DEMOTION_RACE'
  | 'JURYO_MAKUSHITA_EXCHANGE'
  | 'LOWER_SCORE_GROUP'
  | 'LOWER_BOUNDARY_EVAL'
  | 'REPAIR_SWAP'
  | 'TOP_RANK_DUTY'
  | 'RANK_NEARBY'
  | 'RECORD_NEARBY'
  | 'YUSHO_RACE'
  | 'SURVIVAL_BUBBLE'
  | 'BOUNDARY_CROSSOVER'
  | 'FALLBACK';

export type BoundaryBandSpec = {
  id: BoundaryId;
  upperDivision: TorikumiDivision;
  lowerDivision: TorikumiDivision;
  upperBand: {
    minNumber: number;
    maxNumber: number;
    rankName?: string;
  };
  lowerBand: {
    minNumber: number;
    maxNumber: number;
    rankName?: string;
  };
};

export type TorikumiParticipant = {
  id: string;
  shikona: string;
  isPlayer: boolean;
  stableId: string;
  division: TorikumiDivision;
  rankScore: number;
  rankName?: string;
  rankNumber?: number;
  rankSide?: 'East' | 'West';
  forbiddenOpponentIds?: string[];
  power: number;
  ability?: number;
  bashoFormDelta?: number;
  styleBias?: EnemyStyleBias;
  heightCm?: number;
  weightKg?: number;
  aptitudeTier?: AptitudeTier;
  aptitudeFactor?: number;
  aptitudeProfile?: AptitudeProfile;
  careerBand?: CareerBand;
  stagnation?: StagnationState;
  wins: number;
  losses: number;
  currentWinStreak?: number;
  currentLossStreak?: number;
  expectedWins?: number;
  opponentAbilityTotal?: number;
  boutsSimulated?: number;
  active: boolean;
  bashoKyujo?: boolean;
  targetBouts: number;
  boutsDone: number;
  kyujo?: boolean;
  lastBoutDay?: number;
  facedIdsThisBasho?: string[];
  torikumiTier?: TorikumiTier;
  yushoRaceTier?: YushoRaceTier;
  survivalBubble?: boolean;
  plannedRounds?: number[];
  promotionRaceTier?: 'Lead' | 'Candidate' | 'Outside';
  demotionRaceTier?: 'Critical' | 'Bubble' | 'Safe';
  schedulePool?: string;
};

export type TorikumiContentionTier = 'Leader' | 'Contender' | 'Outside';
export type TorikumiTitleImplication = 'DIRECT' | 'CHASE' | 'NONE';
export type TorikumiBoundaryImplication = 'PROMOTION' | 'DEMOTION' | 'NONE';

export type TorikumiPair = {
  a: TorikumiParticipant;
  b: TorikumiParticipant;
  boundaryId?: BoundaryId;
  activationReasons: BoundaryActivationReason[];
  matchReason: TorikumiMatchReason;
  relaxationStage: number;
  crossDivision: boolean;
  phaseId?: string;
  roundIndex?: number;
  obligationId?: string;
  repairDepth: number;
  contentionTier?: TorikumiContentionTier;
  titleImplication?: TorikumiTitleImplication;
  boundaryImplication?: TorikumiBoundaryImplication;
};

export type TorikumiDayResult = {
  day: number;
  pairs: TorikumiPair[];
  byeIds: string[];
};

export type TorikumiDiagnostics = {
  boundaryActivations: Array<{
    day: number;
    boundaryId: BoundaryId;
    reasons: BoundaryActivationReason[];
    pairCount: number;
  }>;
  remainingTargetById: Record<string, number>;
  unscheduledById: Record<string, number>;
  torikumiRelaxationHistogram: Record<string, number>;
  crossDivisionBoutCount: number;
  lateCrossDivisionBoutCount: number;
  sameStableViolationCount: number;
  sameCardViolationCount: number;
  scheduleViolations: Array<{
    day: number;
    participantIds: string[];
    reason: 'UNRESOLVED_LEFTOVER';
  }>;
  repairHistogram: Record<string, number>;
  obligationCoverage: Record<string, { scheduled: number; total: number }>;
  sanyakuRoundRobinCoverageRate: number;
  joiAssignmentCoverageRate: number;
  yokozunaOzekiTailBoutRatio: number;
  npcTopDivisionBoutRows?: Array<{
    day: number;
    aId: string;
    bId: string;
    aRankName?: string;
    bRankName?: string;
    aWon?: boolean;
    aWinProbability?: number;
    aAbility?: number;
    bAbility?: number;
    fusen?: boolean;
  }>;
  crossDivisionByBoundary: Record<string, number>;
  lateDirectTitleBoutCount: number;
  playerHealthyUnresolvedDays: number[];
  unresolvedByDivisionAndDay: Record<string, Partial<Record<TorikumiDivision, number>>>;
  repairAttempts: number;
  repairSuccessCount: number;
};

export type TorikumiBashoResult = {
  days: TorikumiDayResult[];
  diagnostics: TorikumiDiagnostics;
};

/**
 * EraSnapshot.boundaryProfile を torikumi 生成に渡すための小さな context。
 * 生 EraSnapshot を渡し回さず、必要な scalar だけを抽出する。
 *
 * 全フィールド optional。未指定時は legacy policy にfallback (全場所 day>=12 から
 * JuryoMakushita 境界取組がスコア最強候補に入るデフォルト動作)。
 *
 * `effectiveIntensity` は world layer で boundaryProfile から導出した合成値。
 *   ~0       : era に cross-division 取組の文化が無い → boundary 取組を抑制
 *   ~0.875   : 標準 (legacy 動作とほぼ同一)
 *   ~1.15+   : 境界圧の高い時代 → 早めの day threshold + 強め score bonus
 */
export type TorikumiBoundaryContext = {
  sekitoriBoundaryPressure?: number;
  makushitaUpperCongestion?: number;
  juryoDemotionPressure?: number;
  crossDivisionBoutIntensity?: number;
  effectiveIntensity?: number;
};

export type ScheduleTorikumiBashoParams = {
  participants: TorikumiParticipant[];
  days: number[];
  boundaryBands: BoundaryBandSpec[];
  simulationModelVersion?: SimulationModelVersion;
  rng?: RandomSource;
  facedMap?: Map<string, Set<string>>;
  lateEvalStartDay?: number;
  vacancyByDivision?: Partial<Record<TorikumiDivision, number>>;
  dayEligibility?: (participant: TorikumiParticipant, day: number) => boolean;
  onPair?: (pair: TorikumiPair, day: number) => void;
  onBye?: (participant: TorikumiParticipant, day: number) => void;
  /**
   * EraSnapshot.boundaryProfile から導出した境界取組コンテキスト。
   * undefined の場合は legacy 動作 (effectiveIntensity=1.0 と同等)。
   */
  boundaryContext?: TorikumiBoundaryContext;
};
