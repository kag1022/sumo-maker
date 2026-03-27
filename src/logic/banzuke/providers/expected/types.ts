import { Rank } from '../../../models';

export interface ExpectedPlacementCandidate {
  id: string;
  currentRank: Rank;
  wins: number;
  losses: number;
  absent: number;
  currentSlot: number;
  expectedSlot: number;
  minSlot: number;
  maxSlot: number;
  mandatoryDemotion: boolean;
  mandatoryPromotion: boolean;
  sourceDivision: string;
  score: number;
  rankBand?: string;
  recordBucket?: string;
  proposalBasis?: 'EMPIRICAL' | 'RULE_OVERRIDE';
}

export interface ExpectedPlacementAssignment {
  id: string;
  slot: number;
}
