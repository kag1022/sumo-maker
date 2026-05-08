// NPC visibility tiering for player-facing career summary.
// See docs/npc_rework/npc_simplified_design.md.

export type NpcVisibilityTier = "background" | "notable" | "eraStar";

export type RivalryKind =
  | "frequentOpponent"
  | "promotionRace"
  | "wall"
  | "sameGeneration"
  | "titleRace"
  | "nemesis";

export interface NotableNpcSummary {
  id: string;
  shikona: string;
  visibilityTier: "notable";
  generationLabel?: string;
  peakRankLabel?: string;
  currentOrFinalRankLabel?: string;
  rivalryScore: number;
  rivalryKinds: RivalryKind[];
  meetings: number;
  playerWins: number;
  npcWins: number;
  firstMetBashoIndex?: number;
  lastMetBashoIndex?: number;
  notableReasonCodes: string[];
}

export interface EraStarNpcSummary {
  id: string;
  shikona: string;
  visibilityTier: "eraStar";
  activeFromBashoIndex: number;
  activeToBashoIndex: number;
  peakRankLabel: string;
  dominanceScore: number;
  yushoLikeCount?: number;
  sanyakuBashoCount?: number;
  ozekiOrAboveBashoCount?: number;
  notableReasonCodes: string[];
}

export type RarityTier = "common" | "uncommon" | "rare" | "elite" | "legendary";

export interface CareerRaritySummary {
  highestRankLabel: string;
  highestRankBucket: string;
  realDataPercentileText: string;
  rarityTier: RarityTier;
  reasonCodes: string[];
}

export interface CareerWorldSummary {
  generationPeers: NotableNpcSummary[];
  rivals: NotableNpcSummary[];
  promotionRaceOpponents: NotableNpcSummary[];
  strongestOpponents: NotableNpcSummary[];
  eraStars: EraStarNpcSummary[];
  rarity: CareerRaritySummary;
}
