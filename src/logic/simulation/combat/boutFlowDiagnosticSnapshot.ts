import type { WinRoute } from '../../models';
import type { KimaritePattern } from '../../kimarite/catalog';
import type {
  BoutExplanationMaterialAxis,
  ControlPhaseCandidate,
  ControlPhasePredecessor,
  BanzukeContextTag,
  HoshitoriContextTag,
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
  readonly kimaritePattern?: KimaritePattern;
  readonly kimarite: BoutFlowDiagnosticKimariteSnapshot;
  readonly victoryFactorTags?: readonly string[];
  readonly hoshitoriContextTags?: readonly HoshitoriContextTag[];
  readonly banzukeContextTags?: readonly BanzukeContextTag[];
}

export type BoutFlowExplanationAxisStatus =
  | 'AVAILABLE'
  | 'PARTIAL'
  | 'MISSING';

export type BoutFlowExplanationCompleteness =
  | 'FLOW_ONLY'
  | 'FLOW_AND_RESULT'
  | 'COMPLETE_CONTEXT';

export interface BoutFlowExplanationAxisCoverage {
  readonly axis: BoutExplanationMaterialAxis;
  readonly status: BoutFlowExplanationAxisStatus;
  readonly reasonTags: readonly string[];
}

export interface BoutFlowDiagnosticSnapshot extends CreateBoutFlowDiagnosticSnapshotInput {
  readonly victoryFactorTags: readonly string[];
  readonly hoshitoriContextTags: readonly HoshitoriContextTag[];
  readonly banzukeContextTags: readonly BanzukeContextTag[];
  readonly transitionClassification: BoutFlowTransitionClassification;
  readonly transitionReasonTags: readonly string[];
  readonly explanationCoverage: readonly BoutFlowExplanationAxisCoverage[];
  readonly missingExplanationAxes: readonly BoutExplanationMaterialAxis[];
  readonly explanationCompleteness: BoutFlowExplanationCompleteness;
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

const axisCoverage = (
  axis: BoutExplanationMaterialAxis,
  status: BoutFlowExplanationAxisStatus,
  reasonTags: readonly string[],
): BoutFlowExplanationAxisCoverage => ({
  axis,
  status,
  reasonTags,
});

const resolveBoutFlowExplanationCoverage = (
  input: CreateBoutFlowDiagnosticSnapshotInput,
  transitionClassification: BoutFlowTransitionClassification,
): Pick<BoutFlowDiagnosticSnapshot, 'explanationCoverage' | 'missingExplanationAxes' | 'explanationCompleteness'> => {
  const coverage: BoutFlowExplanationAxisCoverage[] = [
    axisCoverage('OPENING', 'AVAILABLE', [`opening:${input.openingPhase}:${input.openingConfidence}`]),
    axisCoverage(
      'CONTROL',
      input.controlPhaseCandidate &&
        input.controlConfidence !== 'UNAVAILABLE' &&
        input.controlConfidence !== 'AMBIGUOUS'
        ? 'AVAILABLE'
        : input.controlPhaseCandidate
          ? 'PARTIAL'
          : 'MISSING',
      [`control:${input.controlPhaseCandidate ?? 'UNAVAILABLE'}:${input.controlConfidence}`],
    ),
    axisCoverage(
      'TRANSITION',
      transitionClassification === 'AMBIGUOUS_CONTROL' ? 'PARTIAL' : 'AVAILABLE',
      [`transition:${transitionClassification}`],
    ),
    axisCoverage('FINISH_ROUTE', 'AVAILABLE', [`finish:${input.finishRoute}`]),
    axisCoverage(
      'KIMARITE',
      input.kimarite.name ? 'AVAILABLE' : 'MISSING',
      [`kimarite:${input.kimarite.diagnosticFamily}`],
    ),
    axisCoverage(
      'VICTORY_FACTOR',
      (input.victoryFactorTags?.length ?? 0) > 0 ? 'AVAILABLE' : 'MISSING',
      input.victoryFactorTags?.length ? input.victoryFactorTags : ['victory-factor:missing'],
    ),
    axisCoverage(
      'HOSHITORI_CONTEXT',
      (input.hoshitoriContextTags?.length ?? 0) > 0 ? 'AVAILABLE' : 'MISSING',
      input.hoshitoriContextTags?.length ? input.hoshitoriContextTags : ['hoshitori-context:missing'],
    ),
    axisCoverage(
      'BANZUKE_CONTEXT',
      (input.banzukeContextTags?.length ?? 0) > 0 ? 'AVAILABLE' : 'MISSING',
      input.banzukeContextTags?.length ? input.banzukeContextTags : ['banzuke-context:missing'],
    ),
    axisCoverage(
      'OUTCOME_MEANING',
      (input.victoryFactorTags?.length ?? 0) > 0 &&
        ((input.hoshitoriContextTags?.length ?? 0) > 0 || (input.banzukeContextTags?.length ?? 0) > 0)
        ? 'AVAILABLE'
        : 'MISSING',
      ['outcome-meaning:requires-victory-and-context'],
    ),
  ];
  const missingExplanationAxes = coverage
    .filter((entry) => entry.status === 'MISSING')
    .map((entry) => entry.axis);
  const explanationCompleteness: BoutFlowExplanationCompleteness =
    missingExplanationAxes.length === 0
      ? 'COMPLETE_CONTEXT'
      : coverage.some((entry) =>
        (entry.axis === 'VICTORY_FACTOR' ||
          entry.axis === 'HOSHITORI_CONTEXT' ||
          entry.axis === 'BANZUKE_CONTEXT') &&
        entry.status === 'AVAILABLE',
      )
        ? 'FLOW_AND_RESULT'
        : 'FLOW_ONLY';
  return {
    explanationCoverage: coverage,
    missingExplanationAxes,
    explanationCompleteness,
  };
};

export const createBoutFlowDiagnosticSnapshot = (
  input: CreateBoutFlowDiagnosticSnapshotInput,
): BoutFlowDiagnosticSnapshot => {
  const normalizedInput = {
    ...input,
    victoryFactorTags: input.victoryFactorTags ?? [],
    hoshitoriContextTags: input.hoshitoriContextTags ?? [],
    banzukeContextTags: input.banzukeContextTags ?? [],
  };
  const transition = classifyBoutFlowTransition(normalizedInput);
  const coverage = resolveBoutFlowExplanationCoverage(normalizedInput, transition.transitionClassification);
  return {
    ...normalizedInput,
    ...transition,
    ...coverage,
  };
};
