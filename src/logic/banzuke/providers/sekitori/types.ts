import { Rank } from '../../../models';

export type SekitoriDivision = 'Makuuchi' | 'Juryo';
export type TopRankName = '横綱' | '大関' | '関脇' | '小結';

export interface BashoRecordHistorySnapshot {
  rank: Rank;
  wins: number;
  losses: number;
  absent: number;
  expectedWins?: number;
  strengthOfSchedule?: number;
  performanceOverExpected?: number;
  yusho?: boolean;
  junYusho?: boolean;
  specialPrizes?: string[];
}

export interface BashoRecordSnapshot {
  id: string;
  shikona: string;
  rank: Rank;
  wins: number;
  losses: number;
  absent: number;
  expectedWins?: number;
  strengthOfSchedule?: number;
  performanceOverExpected?: number;
  yusho?: boolean;
  junYusho?: boolean;
  specialPrizes?: string[];
  pastRecords?: BashoRecordHistorySnapshot[];
  isRetired?: boolean;
  isOzekiKadoban?: boolean;
  isOzekiReturn?: boolean;
}

export interface BanzukeAllocation {
  id: string;
  shikona: string;
  currentRank: Rank;
  nextRank: Rank;
  score: number;
  recordDiff: number;
  sourceDivision: SekitoriDivision;
  nextIsOzekiKadoban: boolean;
  nextIsOzekiReturn: boolean;
}

export interface SekitoriContextSnapshot {
  upperCollapseCount: number;
  upperBlockerCount: number;
  makuuchiDemotionOpenings: number;
  juryoPromotionCandidates: number;
  sanyakuVacancies: number;
  boundaryOpenings: {
    makuuchi: number;
    juryo: number;
  };
  competitionBands: Map<string, number>;
  promotionPressureSource: number;
  demotionPressureSource: number;
}

export interface RankOrderProfile {
  comparisonTier: number;
  bubbleClass: string;
  vacancyGain: number;
  congestionPenalty: number;
  hardRuleReason: string[];
  targetSlot: number;
  minSlot: number;
  maxSlot: number;
  score: number;
}

export type TopDirective = {
  preferredTopName?: TopRankName;
  nextIsOzekiKadoban: boolean;
  nextIsOzekiReturn: boolean;
  yokozunaPromotionBonus: number;
};

export type BanzukeCandidate = {
  snapshot: BashoRecordSnapshot;
  sourceDivision: SekitoriDivision;
  normalizedLosses: number;
  score: number;
  currentSlot: number;
  directive: TopDirective;
  orderProfile?: RankOrderProfile;
};

export type SekitoriZone = 'MakuuchiTop' | 'MakuuchiMidLow' | 'Juryo';

export type SekitoriDeltaBand = {
  zone: SekitoriZone;
  minSlotDelta: number;
  maxSlotDelta: number;
};

export type RankAssignment = {
  candidate: BanzukeCandidate;
  slot: number;
};
