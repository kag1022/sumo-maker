import type { WinRoute } from '../../models';
import type { BoutEngagement } from '../../kimarite/engagement';
import type {
  KimariteFamily,
  KimaritePattern,
  KimariteRarityBucket,
} from '../../kimarite/catalog';
import type { KimariteOutcomeResolution } from '../../kimarite/selection';
import type { PreBoutPhase, PreBoutPhaseWeights } from './preBoutPhase';

export type BoutFlowModelVersion = 'BOUT_FLOW_COMPLETE_CONTRACT_V1';

export type OpeningPhase = PreBoutPhase;
export type OpeningPhaseWeights = PreBoutPhaseWeights;

export type ControlPhase =
  | 'THRUST_BATTLE'
  | 'BELT_BATTLE'
  | 'TECHNIQUE_SCRAMBLE'
  | 'EDGE_BATTLE'
  | 'QUICK_COLLAPSE'
  | 'MIXED';

export type ControlPhasePredecessor = BoutEngagement['phase'];
export type ControlPhaseCandidate = ControlPhase;

export type FinishRoute = WinRoute;

export type Kimarite = KimariteOutcomeResolution;

export type BoutFlowLayerProvenance =
  | 'PRODUCTION_RESULT'
  | 'PRODUCTION_SAMPLE'
  | 'DETERMINISTIC_DIAGNOSTIC'
  | 'DIAGNOSTIC_ADAPTER'
  | 'FUTURE_CONTRACT';

export type BoutFlowConfidence =
  | 'OBSERVED'
  | 'DIRECT'
  | 'RENAMED'
  | 'INFERRED_HIGH'
  | 'INFERRED_MEDIUM'
  | 'INFERRED_LOW'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE';

export type BoutFlowActorRole =
  | 'ATTACKER'
  | 'DEFENDER'
  | 'WINNER'
  | 'LOSER'
  | 'PLAYER'
  | 'OPPONENT';

export type BoutFlowTransition =
  | 'ALIGNED_FLOW'
  | 'CONTROL_SHIFT'
  | 'TECHNIQUE_CONVERSION'
  | 'EDGE_TURNAROUND'
  | 'QUICK_FINISH'
  | 'AMBIGUOUS_CONTROL';

export type BoutVictoryFactorKind =
  | 'ABILITY'
  | 'STYLE'
  | 'BODY'
  | 'FORM'
  | 'MOMENTUM'
  | 'INJURY'
  | 'PRESSURE'
  | 'ROUTE_EXECUTION'
  | 'KIMARITE_FIT'
  | 'REALISM_COMPRESSION'
  | 'RANDOM_RESULT_ROLL';

export type BoutVictoryFactorDirection =
  | 'FOR_WINNER'
  | 'FOR_LOSER'
  | 'NEUTRAL';

export type BoutVictoryFactorStrength =
  | 'SMALL'
  | 'MEDIUM'
  | 'LARGE';

export type HoshitoriContextTag =
  | 'EARLY_BASHO'
  | 'MIDDLE_BASHO'
  | 'FINAL_BOUT'
  | 'KACHIKOSHI_DECIDER'
  | 'MAKEKOSHI_DECIDER'
  | 'YUSHO_DIRECT'
  | 'YUSHO_CHASE'
  | 'WIN_STREAK'
  | 'LOSS_STREAK'
  | 'RECOVERY_BOUT'
  | 'LEAD_PROTECTION';

export type BanzukeContextTag =
  | 'PROMOTION_RELEVANT'
  | 'DEMOTION_RELEVANT'
  | 'SAN_YAKU_PRESSURE'
  | 'SEKITORI_BOUNDARY'
  | 'MAKUUCHI_BOUNDARY'
  | 'KINBOSHI_CHANCE'
  | 'RANK_GAP_UPSET'
  | 'RANK_EXPECTED_WIN';

export type BoutExplanationMaterialAxis =
  | 'OPENING'
  | 'CONTROL'
  | 'TRANSITION'
  | 'FINISH_ROUTE'
  | 'KIMARITE'
  | 'VICTORY_FACTOR'
  | 'HOSHITORI_CONTEXT'
  | 'BANZUKE_CONTEXT'
  | 'OUTCOME_MEANING';

export type BoutExplanationMaterialTone =
  | 'FACTUAL'
  | 'TACTICAL'
  | 'DRAMATIC'
  | 'CONTEXTUAL'
  | 'RESTRAINT';

export interface BoutExplanationMaterial {
  readonly axis: BoutExplanationMaterialAxis;
  readonly key: string;
  readonly subject?: BoutFlowActorRole;
  readonly tone: BoutExplanationMaterialTone;
  readonly requiredTags?: readonly string[];
  readonly excludedTags?: readonly string[];
  readonly text: string;
}

export interface BoutFlowOpeningLayer {
  readonly phase?: OpeningPhase;
  readonly weights: OpeningPhaseWeights;
  readonly reasonTags: readonly string[];
  readonly confidence?: BoutFlowConfidence;
  readonly provenance: BoutFlowLayerProvenance;
}

export interface BoutFlowControlLayer {
  readonly engagement: BoutEngagement;
  readonly predecessor?: ControlPhasePredecessor;
  readonly phase: ControlPhase;
  readonly confidence?: BoutFlowConfidence;
  readonly reasonTags?: readonly string[];
  readonly provenance: BoutFlowLayerProvenance;
}

export interface BoutFlowTransitionLayer {
  readonly transition: BoutFlowTransition;
  readonly reasonTags: readonly string[];
  readonly confidence?: BoutFlowConfidence;
  readonly provenance: BoutFlowLayerProvenance;
}

export interface BoutFlowFinishLayer {
  readonly route: FinishRoute;
  readonly reasonTags?: readonly string[];
  readonly provenance: BoutFlowLayerProvenance;
}

export interface BoutFlowKimariteLayer {
  readonly outcome: Kimarite;
  readonly name: string;
  readonly pattern?: KimaritePattern;
  readonly family?: KimariteFamily;
  readonly rarity?: KimariteRarityBucket;
  readonly catalogStatus?: 'OFFICIAL' | 'NON_TECHNIQUE' | 'UNKNOWN';
  readonly provenance: BoutFlowLayerProvenance;
}

export interface BoutVictoryFactor {
  readonly kind: BoutVictoryFactorKind;
  readonly direction: BoutVictoryFactorDirection;
  readonly strength: BoutVictoryFactorStrength;
  readonly actor?: BoutFlowActorRole;
  readonly label: string;
  readonly reasonTags?: readonly string[];
}

export interface BoutOutcomeContextLayer {
  readonly hoshitoriTags: readonly HoshitoriContextTag[];
  readonly banzukeTags: readonly BanzukeContextTag[];
  readonly pressureTags: readonly string[];
  readonly provenance: BoutFlowLayerProvenance;
}

export interface BoutOutcomeMeaningLayer {
  readonly winner: BoutFlowActorRole;
  readonly factors: readonly BoutVictoryFactor[];
  readonly meaningTags: readonly string[];
  readonly materialKeys: readonly string[];
  readonly provenance: BoutFlowLayerProvenance;
}

export interface BoutFlowModel {
  readonly version?: BoutFlowModelVersion;
  readonly opening?: BoutFlowOpeningLayer;
  readonly control?: BoutFlowControlLayer;
  readonly transition?: BoutFlowTransitionLayer;
  readonly finish?: BoutFlowFinishLayer;
  readonly kimarite?: BoutFlowKimariteLayer;
  readonly context?: BoutOutcomeContextLayer;
  readonly meaning?: BoutOutcomeMeaningLayer;
  readonly materials?: readonly BoutExplanationMaterial[];
}
