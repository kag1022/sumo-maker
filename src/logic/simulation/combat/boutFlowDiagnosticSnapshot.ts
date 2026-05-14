import type { WinRoute } from '../../models';
import type {
  ControlPhaseCandidate,
  ControlPhasePredecessor,
  OpeningPhase,
} from './boutFlowModel';
import type { ControlPhaseCandidateConfidence } from './controlPhaseAdapter';
import type { PreBoutPhaseConfidenceBucket } from './preBoutPhaseRouteBias';

export type BoutFlowTransitionClassification =
  | 'ALIGNED_FLOW'
  | 'CONTROL_SHIFT'
  | 'TECHNIQUE_CONVERSION'
  | 'EDGE_TURNAROUND'
  | 'QUICK_FINISH'
  | 'AMBIGUOUS_CONTROL';

export interface BoutFlowDiagnosticKimariteSnapshot {
  readonly name: string;
  readonly family?: string;
  readonly diagnosticFamily: string;
  readonly rarity?: string;
  readonly catalogStatus?: string;
}

export interface CreateBoutFlowDiagnosticSnapshotInput {
  readonly openingPhase: OpeningPhase;
  readonly openingConfidence: PreBoutPhaseConfidenceBucket;
  readonly controlPhasePredecessor?: ControlPhasePredecessor;
  readonly controlPhaseCandidate?: ControlPhaseCandidate;
  readonly controlConfidence: ControlPhaseCandidateConfidence;
  readonly finishRoute: WinRoute;
  readonly kimarite: BoutFlowDiagnosticKimariteSnapshot;
}

export interface BoutFlowDiagnosticSnapshot extends CreateBoutFlowDiagnosticSnapshotInput {
  readonly transitionClassification: BoutFlowTransitionClassification;
  readonly transitionReasonTags: readonly string[];
}

const TECHNIQUE_FINISH_ROUTES: readonly WinRoute[] = [
  'THROW_BREAK',
  'LEG_ATTACK',
];

const classifyBoutFlowTransition = (
  input: CreateBoutFlowDiagnosticSnapshotInput,
): Pick<BoutFlowDiagnosticSnapshot, 'transitionClassification' | 'transitionReasonTags'> => {
  if (
    !input.controlPhaseCandidate ||
    input.controlConfidence === 'UNAVAILABLE' ||
    input.controlConfidence === 'AMBIGUOUS'
  ) {
    return {
      transitionClassification: 'AMBIGUOUS_CONTROL',
      transitionReasonTags: ['bout-flow:ambiguous-control'],
    };
  }
  if (input.controlPhaseCandidate === 'EDGE_BATTLE' || input.finishRoute === 'EDGE_REVERSAL') {
    return {
      transitionClassification: 'EDGE_TURNAROUND',
      transitionReasonTags: ['bout-flow:edge-turnaround'],
    };
  }
  if (input.controlPhaseCandidate === 'QUICK_COLLAPSE') {
    return {
      transitionClassification: 'QUICK_FINISH',
      transitionReasonTags: ['bout-flow:quick-finish'],
    };
  }
  if (
    input.controlPhaseCandidate === 'TECHNIQUE_SCRAMBLE' ||
    TECHNIQUE_FINISH_ROUTES.includes(input.finishRoute)
  ) {
    return {
      transitionClassification: 'TECHNIQUE_CONVERSION',
      transitionReasonTags: ['bout-flow:technique-conversion'],
    };
  }
  if (input.openingPhase === input.controlPhaseCandidate) {
    return {
      transitionClassification: 'ALIGNED_FLOW',
      transitionReasonTags: ['bout-flow:aligned-flow'],
    };
  }
  return {
    transitionClassification: 'CONTROL_SHIFT',
    transitionReasonTags: ['bout-flow:control-shift'],
  };
};

export const createBoutFlowDiagnosticSnapshot = (
  input: CreateBoutFlowDiagnosticSnapshotInput,
): BoutFlowDiagnosticSnapshot => {
  const transition = classifyBoutFlowTransition(input);
  return {
    ...input,
    ...transition,
  };
};
