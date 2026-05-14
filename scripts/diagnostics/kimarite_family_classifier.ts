import type { WinRoute } from '../../src/logic/models';
import {
  findNonTechniqueEntry,
  findOfficialKimariteEntry,
  type KimariteContextTag,
  type KimariteFamily,
  type KimaritePattern,
  type KimaritePatternRole,
  type KimariteRarityBucket,
  type KimariteTag,
} from '../../src/logic/kimarite/catalog';
import type { PreBoutPhase } from '../../src/logic/simulation/combat/preBoutPhase';

export type DiagnosticContradictionSeverity = 'NONE' | 'SOFT' | 'HARD' | 'UNKNOWN';
export type DiagnosticConfidenceBucket = 'LOW' | 'MEDIUM' | 'HIGH';

export type DiagnosticKimariteFamilyBucket =
  | 'PUSH_THRUST'
  | 'FORCE_OUT'
  | 'BELT_FORCE'
  | 'THROW'
  | 'PULL_SLAP_DOWN'
  | 'TWIST_DROP'
  | 'LEG_TRIP'
  | 'REAR'
  | 'EDGE_REVERSAL'
  | 'BACKWARD_BODY_DROP'
  | 'NON_TECHNIQUE'
  | 'UNKNOWN';

export interface DiagnosticKimariteMetadata {
  kimarite?: string;
  family?: KimariteFamily;
  diagnosticFamily: DiagnosticKimariteFamilyBucket;
  rarityBucket?: KimariteRarityBucket;
  class?: string;
  tags: KimariteTag[];
  requiredPatterns: KimaritePattern[];
  patternRole?: KimaritePatternRole;
  contextTags: KimariteContextTag[];
  catalogStatus: 'OFFICIAL' | 'NON_TECHNIQUE' | 'UNKNOWN';
  signals: {
    belt: boolean;
    throw: boolean;
    pull: boolean;
    twist: boolean;
    leg: boolean;
    rear: boolean;
    edge: boolean;
    directForce: boolean;
    closeBody: boolean;
    techniqueLike: boolean;
    rareComplex: boolean;
  };
}

export interface DiagnosticContradictionInput {
  phase: PreBoutPhase;
  confidenceBucket: DiagnosticConfidenceBucket;
  route?: WinRoute;
  metadata: DiagnosticKimariteMetadata;
}

export interface DiagnosticContradictionResult {
  severity: DiagnosticContradictionSeverity;
  contradiction: boolean;
  reason: string;
}

export const DIAGNOSTIC_KIMARITE_CLASSIFIER_RULES = [
  'MIXED phases are neutral.',
  'UNKNOWN catalog or missing route remains UNKNOWN, never HARD.',
  'HARD is reserved for high-confidence phase/family mismatches with clear route and catalog evidence.',
  'THRUST_BATTLE treats push, pull/slap-down, twist/drop, and non-technique collapse as compatible.',
  'THRUST_BATTLE marks belt-force and leg/trip as clear mismatches; non-belt throws are SOFT or UNKNOWN.',
  'BELT_BATTLE treats belt force, belt-tag throws/twists, and close-body technique as compatible.',
  'BELT_BATTLE marks pure push/thrust and non-belt pull/slap-down as mismatches.',
  'TECHNIQUE_SCRAMBLE emits at most SOFT for common direct-force outcomes.',
  'EDGE_BATTLE only marks direct non-edge outcomes as mismatches when confidence is HIGH.',
  'QUICK_COLLAPSE only marks long belt/lift or rare complex throws as mismatches when confidence is HIGH.',
] as const;

const routePatternOf = (route: WinRoute | undefined): KimaritePattern | undefined => {
  if (route === 'PUSH_OUT') return 'PUSH_ADVANCE';
  if (route === 'BELT_FORCE') return 'BELT_FORCE';
  if (route === 'THROW_BREAK') return 'THROW_EXCHANGE';
  if (route === 'PULL_DOWN') return 'PULL_DOWN';
  if (route === 'EDGE_REVERSAL') return 'EDGE_REVERSAL';
  if (route === 'REAR_FINISH') return 'REAR_CONTROL';
  if (route === 'LEG_ATTACK') return 'LEG_TRIP_PICK';
  return undefined;
};

const hasTag = (metadata: Pick<DiagnosticKimariteMetadata, 'tags'>, tag: KimariteTag): boolean =>
  metadata.tags.includes(tag);

const hasPattern = (
  metadata: Pick<DiagnosticKimariteMetadata, 'requiredPatterns'>,
  pattern: KimaritePattern,
): boolean =>
  metadata.requiredPatterns.includes(pattern);

const hasContext = (
  metadata: Pick<DiagnosticKimariteMetadata, 'contextTags'>,
  contextTag: KimariteContextTag,
): boolean =>
  metadata.contextTags.includes(contextTag);

const resolveDiagnosticFamily = (input: {
  family?: KimariteFamily;
  tags: KimariteTag[];
  patterns: KimaritePattern[];
  catalogStatus: 'OFFICIAL' | 'NON_TECHNIQUE' | 'UNKNOWN';
}): DiagnosticKimariteFamilyBucket => {
  if (input.catalogStatus === 'NON_TECHNIQUE') return 'NON_TECHNIQUE';
  if (input.catalogStatus === 'UNKNOWN') return 'UNKNOWN';
  if (input.family === 'BACKWARD_BODY_DROP') return 'BACKWARD_BODY_DROP';
  if (input.family === 'REAR' || input.tags.includes('rear') || input.patterns.includes('REAR_CONTROL')) return 'REAR';
  if (input.family === 'TRIP_PICK' || input.tags.includes('leg') || input.tags.includes('trip')) return 'LEG_TRIP';
  if (input.tags.includes('edge') || input.patterns.includes('EDGE_REVERSAL')) return 'EDGE_REVERSAL';
  if (input.family === 'THROW') return 'THROW';
  if (input.family === 'TWIST_DOWN') {
    if (input.tags.includes('pull') || input.patterns.includes('PULL_DOWN')) return 'PULL_SLAP_DOWN';
    return 'TWIST_DROP';
  }
  if (input.family === 'FORCE_OUT') {
    if (input.tags.includes('belt') || input.patterns.includes('BELT_FORCE')) return 'BELT_FORCE';
    return 'FORCE_OUT';
  }
  if (input.family === 'PUSH_THRUST' || input.patterns.includes('PUSH_ADVANCE')) return 'PUSH_THRUST';
  return 'UNKNOWN';
};

const buildSignals = (input: {
  family?: KimariteFamily;
  diagnosticFamily: DiagnosticKimariteFamilyBucket;
  rarityBucket?: KimariteRarityBucket;
  tags: KimariteTag[];
  patterns: KimaritePattern[];
  contextTags: KimariteContextTag[];
}): DiagnosticKimariteMetadata['signals'] => {
  const belt = input.tags.includes('belt') || input.patterns.includes('BELT_FORCE');
  const edge = input.tags.includes('edge') || input.patterns.includes('EDGE_REVERSAL') || input.contextTags.includes('EDGE');
  const rear = input.tags.includes('rear') || input.patterns.includes('REAR_CONTROL') || input.family === 'REAR';
  const leg = input.tags.includes('leg') || input.tags.includes('trip') || input.patterns.includes('LEG_TRIP_PICK') || input.family === 'TRIP_PICK';
  const pull = input.tags.includes('pull') || input.patterns.includes('PULL_DOWN');
  const twist = input.tags.includes('twist') || input.family === 'TWIST_DOWN';
  const throwSignal = input.family === 'THROW' || input.patterns.includes('THROW_EXCHANGE');
  const directForce =
    input.family === 'PUSH_THRUST' ||
    input.family === 'FORCE_OUT' ||
    input.patterns.includes('PUSH_ADVANCE') ||
    input.patterns.includes('BELT_FORCE');
  const techniqueLike =
    throwSignal ||
    pull ||
    twist ||
    leg ||
    rear ||
    edge ||
    input.family === 'BACKWARD_BODY_DROP';
  const closeBody = belt || throwSignal || leg || input.family === 'FORCE_OUT';
  const rareComplex =
    (input.rarityBucket === 'RARE' || input.rarityBucket === 'EXTREME') &&
    (throwSignal || leg || rear || input.family === 'BACKWARD_BODY_DROP' || input.tags.includes('lift'));
  return {
    belt,
    throw: throwSignal,
    pull,
    twist,
    leg,
    rear,
    edge,
    directForce,
    closeBody,
    techniqueLike,
    rareComplex,
  };
};

export const resolveDiagnosticKimariteMetadata = (
  kimarite: string | undefined,
): DiagnosticKimariteMetadata => {
  if (!kimarite) {
    return {
      tags: [],
      requiredPatterns: [],
      contextTags: [],
      catalogStatus: 'UNKNOWN',
      diagnosticFamily: 'UNKNOWN',
      signals: buildSignals({
        tags: [],
        patterns: [],
        contextTags: [],
        diagnosticFamily: 'UNKNOWN',
      }),
    };
  }
  const official = findOfficialKimariteEntry(kimarite);
  if (official) {
    const diagnosticFamily = resolveDiagnosticFamily({
      family: official.family,
      tags: official.tags,
      patterns: official.requiredPatterns,
      catalogStatus: 'OFFICIAL',
    });
    return {
      kimarite: official.name,
      family: official.family,
      diagnosticFamily,
      rarityBucket: official.rarityBucket,
      class: official.class,
      tags: [...official.tags],
      requiredPatterns: [...official.requiredPatterns],
      patternRole: official.patternRole,
      contextTags: [...official.contextTags],
      catalogStatus: 'OFFICIAL',
      signals: buildSignals({
        family: official.family,
        diagnosticFamily,
        rarityBucket: official.rarityBucket,
        tags: official.tags,
        patterns: official.requiredPatterns,
        contextTags: official.contextTags,
      }),
    };
  }
  const nonTechnique = findNonTechniqueEntry(kimarite);
  if (nonTechnique) {
    return {
      kimarite: nonTechnique.name,
      family: nonTechnique.family,
      diagnosticFamily: 'NON_TECHNIQUE',
      rarityBucket: nonTechnique.rarityBucket,
      class: nonTechnique.class,
      tags: [],
      requiredPatterns: ['NON_TECHNIQUE'],
      contextTags: [],
      catalogStatus: 'NON_TECHNIQUE',
      signals: buildSignals({
        family: nonTechnique.family,
        diagnosticFamily: 'NON_TECHNIQUE',
        rarityBucket: nonTechnique.rarityBucket,
        tags: [],
        patterns: ['NON_TECHNIQUE'],
        contextTags: [],
      }),
    };
  }
  return {
    kimarite,
    tags: [],
    requiredPatterns: [],
    contextTags: [],
    catalogStatus: 'UNKNOWN',
    diagnosticFamily: 'UNKNOWN',
    signals: buildSignals({
      tags: [],
      patterns: [],
      contextTags: [],
      diagnosticFamily: 'UNKNOWN',
    }),
  };
};

const severityForConfidence = (
  bucket: DiagnosticConfidenceBucket,
  highSeverity: DiagnosticContradictionSeverity = 'HARD',
  mediumSeverity: DiagnosticContradictionSeverity = 'SOFT',
): DiagnosticContradictionSeverity => {
  if (bucket === 'HIGH') return highSeverity;
  if (bucket === 'MEDIUM') return mediumSeverity;
  return 'UNKNOWN';
};

const isEdgeCompatible = (
  route: WinRoute | undefined,
  metadata: DiagnosticKimariteMetadata,
): boolean =>
  route === 'EDGE_REVERSAL' ||
  metadata.signals.edge ||
  metadata.diagnosticFamily === 'EDGE_REVERSAL' ||
  metadata.diagnosticFamily === 'BACKWARD_BODY_DROP' ||
  metadata.diagnosticFamily === 'PULL_SLAP_DOWN' ||
  metadata.diagnosticFamily === 'REAR' ||
  hasTag(metadata, 'edge') ||
  hasContext(metadata, 'EDGE') ||
  hasPattern(metadata, 'EDGE_REVERSAL');

const isCollapseCompatible = (
  route: WinRoute | undefined,
  metadata: DiagnosticKimariteMetadata,
): boolean =>
  route === 'PUSH_OUT' ||
  route === 'PULL_DOWN' ||
  metadata.diagnosticFamily === 'PUSH_THRUST' ||
  metadata.diagnosticFamily === 'PULL_SLAP_DOWN' ||
  metadata.diagnosticFamily === 'TWIST_DROP' ||
  metadata.diagnosticFamily === 'NON_TECHNIQUE';

export const classifyPreBoutPhaseKimariteContradiction = (
  input: DiagnosticContradictionInput,
): DiagnosticContradictionResult => {
  const { phase, confidenceBucket, route, metadata } = input;
  const routePattern = routePatternOf(route);
  if (phase === 'MIXED') {
    return {
      severity: 'NONE',
      contradiction: false,
      reason: 'mixed phase has no default contradiction rule',
    };
  }
  if (!route || metadata.catalogStatus === 'UNKNOWN') {
    return {
      severity: 'UNKNOWN',
      contradiction: false,
      reason: 'route or kimarite catalog metadata unavailable',
    };
  }
  if (routePattern && metadata.requiredPatterns.length > 0 && !metadata.requiredPatterns.includes(routePattern)) {
    return {
      severity: 'UNKNOWN',
      contradiction: false,
      reason: 'route and kimarite pattern disagree; diagnostic cannot classify safely',
    };
  }

  if (phase === 'THRUST_BATTLE') {
    if (
      metadata.diagnosticFamily === 'PUSH_THRUST' ||
      metadata.diagnosticFamily === 'PULL_SLAP_DOWN' ||
      metadata.diagnosticFamily === 'TWIST_DROP' ||
      metadata.diagnosticFamily === 'NON_TECHNIQUE'
    ) {
      return {
        severity: 'NONE',
        contradiction: false,
        reason: 'thrust phase compatible with push, pull/slap-down, twist/drop, or collapse outcome',
      };
    }
    if (metadata.diagnosticFamily === 'BELT_FORCE') {
      const severity = severityForConfidence(confidenceBucket);
      return {
        severity,
        contradiction: severity === 'SOFT' || severity === 'HARD',
        reason: 'thrust phase paired with clear belt-force outcome',
      };
    }
    if (metadata.diagnosticFamily === 'LEG_TRIP') {
      const severity = severityForConfidence(confidenceBucket);
      return {
        severity,
        contradiction: severity === 'SOFT' || severity === 'HARD',
        reason: 'thrust phase paired with leg/trip outcome',
      };
    }
    if (metadata.diagnosticFamily === 'THROW' || metadata.diagnosticFamily === 'BACKWARD_BODY_DROP') {
      const clearBeltThrow = metadata.signals.belt || metadata.signals.rareComplex;
      const severity = clearBeltThrow
        ? severityForConfidence(confidenceBucket)
        : severityForConfidence(confidenceBucket, 'SOFT', 'UNKNOWN');
      return {
        severity,
        contradiction: severity === 'SOFT' || severity === 'HARD',
        reason: clearBeltThrow
          ? 'thrust phase paired with belt-linked or rare complex throw'
          : 'thrust phase paired with non-belt throw; treated conservatively',
      };
    }
    return {
      severity: 'UNKNOWN',
      contradiction: false,
      reason: 'thrust phase has ambiguous non-push kimarite family',
    };
  }

  if (phase === 'BELT_BATTLE') {
    if (
      metadata.diagnosticFamily === 'BELT_FORCE' ||
      metadata.signals.belt ||
      (metadata.signals.closeBody && metadata.diagnosticFamily !== 'PUSH_THRUST')
    ) {
      return {
        severity: 'NONE',
        contradiction: false,
        reason: 'belt phase compatible with belt force, throw, trip, or close-body technique',
      };
    }
    const purePush = route === 'PUSH_OUT' && metadata.diagnosticFamily === 'PUSH_THRUST';
    const nonBeltPull = route === 'PULL_DOWN' && metadata.diagnosticFamily === 'PULL_SLAP_DOWN' && !metadata.signals.belt && !metadata.signals.edge;
    if (purePush || nonBeltPull) {
      const severity = severityForConfidence(confidenceBucket);
      return {
        severity,
        contradiction: severity === 'SOFT' || severity === 'HARD',
        reason: purePush
          ? 'belt phase paired with pure push/thrust outcome'
          : 'belt phase paired with non-belt pull/slap-down outcome',
      };
    }
    if (metadata.diagnosticFamily === 'TWIST_DROP' && !metadata.signals.belt) {
      const severity = severityForConfidence(confidenceBucket, 'SOFT', 'UNKNOWN');
      return {
        severity,
        contradiction: severity === 'SOFT' || severity === 'HARD',
        reason: 'belt phase paired with non-belt twist/drop outcome; treated conservatively',
      };
    }
    return {
      severity: 'UNKNOWN',
      contradiction: false,
      reason: 'belt phase has ambiguous non-belt outcome',
    };
  }

  if (phase === 'TECHNIQUE_SCRAMBLE') {
    const directCommonForce =
      (route === 'PUSH_OUT' || route === 'BELT_FORCE') &&
      (metadata.diagnosticFamily === 'PUSH_THRUST' || metadata.diagnosticFamily === 'BELT_FORCE' || metadata.diagnosticFamily === 'FORCE_OUT') &&
      metadata.rarityBucket === 'COMMON' &&
      !metadata.signals.techniqueLike;
    if (directCommonForce) {
      const severity = confidenceBucket === 'LOW' ? 'UNKNOWN' : 'SOFT';
      return {
        severity,
        contradiction: severity === 'SOFT',
        reason: 'technique phase paired with common direct-force outcome',
      };
    }
    return {
      severity: 'NONE',
      contradiction: false,
      reason: 'technique phase compatible with adaptive, rare, or technique-like outcome',
    };
  }

  if (phase === 'EDGE_BATTLE') {
    if (isEdgeCompatible(route, metadata)) {
      return {
        severity: 'NONE',
        contradiction: false,
        reason: 'edge phase compatible with edge, rear, pull, throw, or collapse-compatible outcome',
      };
    }
    const directNonEdge = route === 'PUSH_OUT' || route === 'BELT_FORCE';
    if (directNonEdge && confidenceBucket === 'HIGH') {
      return {
        severity: 'HARD',
        contradiction: true,
        reason: 'edge phase paired with direct non-edge force outcome',
      };
    }
    return {
      severity: 'UNKNOWN',
      contradiction: false,
      reason: 'edge phase lacks explicit edge-compatible evidence but is not clear enough for contradiction',
    };
  }

  if (phase === 'QUICK_COLLAPSE') {
    if (isCollapseCompatible(route, metadata)) {
      return {
        severity: 'NONE',
        contradiction: false,
        reason: 'quick collapse phase compatible with immediate force, pull, twist, or non-technique outcome',
      };
    }
    const longBeltOrRareComplex =
      metadata.diagnosticFamily === 'BELT_FORCE' ||
      hasTag(metadata, 'lift') ||
      metadata.signals.rareComplex;
    if (longBeltOrRareComplex && confidenceBucket === 'HIGH') {
      return {
        severity: 'HARD',
        contradiction: true,
        reason: 'quick collapse phase paired with long belt/lift or rare complex outcome',
      };
    }
    return {
      severity: 'UNKNOWN',
      contradiction: false,
      reason: 'quick collapse phase has ambiguous non-collapse outcome',
    };
  }

  return {
    severity: 'UNKNOWN',
    contradiction: false,
    reason: 'unhandled phase',
  };
};
