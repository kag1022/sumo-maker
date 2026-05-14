import type { WinRoute } from '../../models';
import type { BoutEngagement } from '../../kimarite/engagement';
import type { ControlPhaseCandidate, ControlPhasePredecessor } from './boutFlowModel';

export type { ControlPhaseCandidate } from './boutFlowModel';

export type ControlPhaseCandidateConfidence =
  | 'DIRECT'
  | 'RENAMED'
  | 'INFERRED'
  | 'AMBIGUOUS'
  | 'UNAVAILABLE';

export interface ResolveControlPhaseCandidateInput {
  readonly engagement?: Pick<
    BoutEngagement,
    'phase' | 'defenderCollapsed' | 'edgeCrisis' | 'gripEstablished' | 'weightDomination'
  >;
  readonly finishRoute?: WinRoute;
  readonly kimaritePattern?: string;
}

export interface ControlPhaseCandidateResolution {
  readonly controlPhasePredecessor?: ControlPhasePredecessor;
  readonly controlPhaseCandidate?: ControlPhaseCandidate;
  readonly confidence: ControlPhaseCandidateConfidence;
  readonly reasonTags: readonly string[];
}

const TECHNIQUE_ROUTE_CANDIDATES: readonly WinRoute[] = [
  'THROW_BREAK',
  'LEG_ATTACK',
  'EDGE_REVERSAL',
];

const TECHNIQUE_PATTERN_CANDIDATES = new Set([
  'THROW_EXCHANGE',
  'LEG_TRIP_PICK',
  'EDGE_REVERSAL',
]);

const resolveMixedCandidate = (
  input: ResolveControlPhaseCandidateInput,
): ControlPhaseCandidateResolution => {
  const engagement = input.engagement;
  if (!engagement) {
    return {
      confidence: 'UNAVAILABLE',
      reasonTags: ['control-phase:unavailable:no-engagement'],
    };
  }
  if (engagement.edgeCrisis) {
    return {
      controlPhasePredecessor: engagement.phase,
      controlPhaseCandidate: 'EDGE_BATTLE',
      confidence: 'INFERRED',
      reasonTags: ['control-phase:inferred:mixed-edge-crisis'],
    };
  }
  if (engagement.defenderCollapsed) {
    return {
      controlPhasePredecessor: engagement.phase,
      controlPhaseCandidate: 'QUICK_COLLAPSE',
      confidence: 'INFERRED',
      reasonTags: ['control-phase:inferred:mixed-defender-collapsed'],
    };
  }
  if (engagement.gripEstablished && input.finishRoute === 'BELT_FORCE') {
    return {
      controlPhasePredecessor: engagement.phase,
      controlPhaseCandidate: 'BELT_BATTLE',
      confidence: 'INFERRED',
      reasonTags: ['control-phase:inferred:mixed-grip-belt-route'],
    };
  }
  if (
    (input.finishRoute && TECHNIQUE_ROUTE_CANDIDATES.includes(input.finishRoute)) ||
    (input.kimaritePattern && TECHNIQUE_PATTERN_CANDIDATES.has(input.kimaritePattern))
  ) {
    return {
      controlPhasePredecessor: engagement.phase,
      controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
      confidence: 'INFERRED',
      reasonTags: ['control-phase:inferred:mixed-technique-finish'],
    };
  }
  return {
    controlPhasePredecessor: engagement.phase,
    controlPhaseCandidate: 'MIXED',
    confidence: 'AMBIGUOUS',
    reasonTags: ['control-phase:ambiguous:mixed-predecessor'],
  };
};

export const resolveControlPhaseCandidate = (
  input: ResolveControlPhaseCandidateInput,
): ControlPhaseCandidateResolution => {
  const engagement = input.engagement;
  if (!engagement) {
    return {
      confidence: 'UNAVAILABLE',
      reasonTags: ['control-phase:unavailable:no-engagement'],
    };
  }
  if (engagement.phase === 'EDGE_SCRAMBLE') {
    return {
      controlPhasePredecessor: engagement.phase,
      controlPhaseCandidate: 'EDGE_BATTLE',
      confidence: 'RENAMED',
      reasonTags: ['control-phase:renamed:EDGE_SCRAMBLE->EDGE_BATTLE'],
    };
  }
  if (engagement.phase === 'MIXED') {
    return resolveMixedCandidate(input);
  }
  return {
    controlPhasePredecessor: engagement.phase,
    controlPhaseCandidate: engagement.phase,
    confidence: 'DIRECT',
    reasonTags: [`control-phase:direct:${engagement.phase}`],
  };
};
