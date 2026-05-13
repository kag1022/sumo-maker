export interface BanzukeReviewNearbyRow {
  entityId: string;
  shikona: string;
  rankLabel: string;
  recordText: string;
  movementText: string;
  isPlayer: boolean;
}

export interface BanzukeReviewDecisionItem {
  id: string;
  title: string;
  detail: string;
  tone: 'empirical' | 'override' | 'info';
}

export interface BanzukeReviewTabModel {
  bashoLabel: string;
  lane: {
    fromRankLabel: string;
    empiricalBandLabel: string;
    toRankLabel: string;
    proposalBasis: 'EMPIRICAL' | 'RULE_OVERRIDE' | 'UNKNOWN';
  };
  summaryLines: string[];
  nearbyRows: BanzukeReviewNearbyRow[];
  decisionItems: BanzukeReviewDecisionItem[];
  supplementalTorikumi: Array<{
    id: string;
    label: string;
    detail: string;
  }>;
}
