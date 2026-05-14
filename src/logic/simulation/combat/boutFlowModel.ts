import type { WinRoute } from '../../models';
import type { BoutEngagement } from '../../kimarite/engagement';
import type { KimariteOutcomeResolution } from '../../kimarite/selection';
import type { PreBoutPhase, PreBoutPhaseWeights } from './preBoutPhase';

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

export type FinishRoute = WinRoute;

export type Kimarite = KimariteOutcomeResolution;

export interface BoutFlowOpeningLayer {
  readonly weights: OpeningPhaseWeights;
  readonly reasonTags: readonly string[];
}

export interface BoutFlowControlLayer {
  readonly engagement: BoutEngagement;
  readonly phase: ControlPhase;
}

export interface BoutFlowFinishLayer {
  readonly route: FinishRoute;
}

export interface BoutFlowKimariteLayer {
  readonly outcome: Kimarite;
}

export interface BoutFlowModel {
  readonly opening?: BoutFlowOpeningLayer;
  readonly control?: BoutFlowControlLayer;
  readonly finish?: BoutFlowFinishLayer;
  readonly kimarite?: BoutFlowKimariteLayer;
}
