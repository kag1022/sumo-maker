import { EnemyStyleBias } from '../../catalog/enemyData';

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
  forbiddenOpponentIds?: string[];
  power: number;
  ability?: number;
  styleBias?: EnemyStyleBias;
  heightCm?: number;
  weightKg?: number;
  wins: number;
  losses: number;
  expectedWins?: number;
  opponentAbilityTotal?: number;
  boutsSimulated?: number;
  active: boolean;
  targetBouts: number;
  boutsDone: number;
};

export type TorikumiPair = {
  a: TorikumiParticipant;
  b: TorikumiParticipant;
  boundaryId?: BoundaryId;
  activationReasons: BoundaryActivationReason[];
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
};

export type TorikumiBashoResult = {
  days: TorikumiDayResult[];
  diagnostics: TorikumiDiagnostics;
};

export type ScheduleTorikumiBashoParams = {
  participants: TorikumiParticipant[];
  days: number[];
  boundaryBands: BoundaryBandSpec[];
  facedMap?: Map<string, Set<string>>;
  lateEvalStartDay?: number;
  vacancyByDivision?: Partial<Record<TorikumiDivision, number>>;
  dayEligibility?: (participant: TorikumiParticipant, day: number) => boolean;
  onPair?: (pair: TorikumiPair, day: number) => void;
  onBye?: (participant: TorikumiParticipant, day: number) => void;
};
