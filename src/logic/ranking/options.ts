import { Rank } from '../models';

export interface RankChangeResult {
  nextRank: Rank;
  event?: string;
  isKadoban?: boolean;
  isOzekiReturn?: boolean;
}

export interface RankCalculationOptions {
  topDivisionQuota?: {
    canPromoteToMakuuchi?: boolean;
    canDemoteToJuryo?: boolean;
    enforcedSanyaku?: 'Sekiwake' | 'Komusubi';
    assignedNextRank?: Rank;
  };
  sekitoriQuota?: {
    canPromoteToJuryo?: boolean;
    canDemoteToMakushita?: boolean;
    enemyHalfStepNudge?: number;
    assignedNextRank?: Rank;
  };
  lowerDivisionQuota?: {
    canPromoteToMakushita?: boolean;
    canDemoteToSandanme?: boolean;
    canPromoteToSandanme?: boolean;
    canDemoteToJonidan?: boolean;
    canPromoteToJonidan?: boolean;
    canDemoteToJonokuchi?: boolean;
    enemyHalfStepNudge?: number;
    assignedNextRank?: Rank;
  };
  boundaryAssignedNextRank?: Rank;
  isOzekiReturn?: boolean;
}
