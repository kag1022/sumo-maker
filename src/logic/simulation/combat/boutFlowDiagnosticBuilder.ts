import type { WinRoute } from '../../models';
import {
  findNonTechniqueEntry,
  findOfficialKimariteEntry,
  normalizeKimariteName,
} from '../../kimarite/catalog';
import type {
  BoutExplanationFactor,
  BoutExplanationSnapshot,
} from '../diagnostics';
import {
  createBoutFlowDiagnosticSnapshot,
  type BoutFlowDiagnosticKimariteSnapshot,
  type BoutFlowDiagnosticSnapshot,
} from './boutFlowDiagnosticSnapshot';
import type {
  BanzukeContextTag,
  HoshitoriContextTag,
} from './boutFlowModel';
import { resolveControlPhaseCandidate } from './controlPhaseAdapter';
import { resolvePreBoutPhaseConfidence } from './preBoutPhaseRouteBias';

export interface BoutFlowDiagnosticContextTags {
  readonly victoryFactorTags: readonly string[];
  readonly hoshitoriContextTags: readonly HoshitoriContextTag[];
  readonly banzukeContextTags: readonly BanzukeContextTag[];
}

const unique = <T extends string>(values: readonly T[]): readonly T[] =>
  Array.from(new Set(values));

const factorTagKind = (factor: BoutExplanationFactor): string => {
  if (factor.kind === 'KIMARITE') return 'kimarite-fit';
  if (factor.kind === 'REALISM') return 'realism-compression';
  if (factor.kind === 'PHASE') return 'phase-shape';
  return factor.kind.toLowerCase();
};

export const resolveBoutFlowVictoryFactorTags = (
  factors: readonly BoutExplanationFactor[],
): readonly string[] =>
  unique(factors.flatMap((factor) => [
    `victory-factor:${factorTagKind(factor)}`,
    `victory-factor:${factorTagKind(factor)}:${factor.strength.toLowerCase()}`,
    `victory-factor:${factor.direction.toLowerCase()}`,
  ]));

export const resolveBoutFlowHoshitoriContextTags = (
  snapshot: Pick<
    BoutExplanationSnapshot,
    | 'boutOrdinal'
    | 'calendarDay'
    | 'currentWins'
    | 'currentLosses'
    | 'currentWinStreak'
    | 'currentLossStreak'
    | 'previousResult'
    | 'pressure'
    | 'titleImplication'
  >,
): readonly HoshitoriContextTag[] => {
  const tags: HoshitoriContextTag[] = [];
  const boutPosition = snapshot.boutOrdinal ?? snapshot.calendarDay;

  if (snapshot.pressure?.isFinalBout) {
    tags.push('FINAL_BOUT');
  } else if (boutPosition !== undefined && boutPosition <= 3) {
    tags.push('EARLY_BASHO');
  } else {
    tags.push('MIDDLE_BASHO');
  }

  if (snapshot.pressure?.isKachiMakeDecider) tags.push('KACHI_MAKE_DECIDER');
  if (snapshot.pressure?.isKachikoshiDecider) tags.push('KACHIKOSHI_DECIDER');
  if (snapshot.pressure?.isMakekoshiDecider) tags.push('MAKEKOSHI_DECIDER');
  if (snapshot.pressure?.isYushoRelevant) {
    tags.push(snapshot.titleImplication === 'DIRECT' ? 'YUSHO_DIRECT' : 'YUSHO_CHASE');
  }
  if ((snapshot.currentWinStreak ?? 0) >= 2) tags.push('WIN_STREAK');
  if ((snapshot.currentLossStreak ?? 0) >= 2) tags.push('LOSS_STREAK');
  if (snapshot.previousResult === 'LOSS') tags.push('RECOVERY_BOUT');
  if (
    snapshot.currentWins !== undefined &&
    snapshot.currentLosses !== undefined &&
    snapshot.currentWins - snapshot.currentLosses >= 3
  ) {
    tags.push('LEAD_PROTECTION');
  }

  return unique(tags);
};

export const resolveBoutFlowBanzukeContextTags = (
  snapshot: Pick<
    BoutExplanationSnapshot,
    | 'boundaryImplication'
    | 'division'
    | 'rank'
    | 'pressure'
    | 'isKinboshiContext'
  >,
): readonly BanzukeContextTag[] => {
  const tags: BanzukeContextTag[] = [];
  const promotionRelevant =
    snapshot.pressure?.isPromotionRelevant ||
    snapshot.boundaryImplication === 'PROMOTION';
  const demotionRelevant =
    snapshot.pressure?.isDemotionRelevant ||
    snapshot.boundaryImplication === 'DEMOTION';

  if (promotionRelevant) tags.push('PROMOTION_RELEVANT');
  if (demotionRelevant) tags.push('DEMOTION_RELEVANT');
  if (
    snapshot.rank?.division === 'Makuuchi' &&
    ['横綱', '大関', '関脇', '小結'].includes(snapshot.rank.name)
  ) {
    tags.push('SAN_YAKU_PRESSURE');
  }
  if (
    snapshot.division === 'Juryo' ||
    (snapshot.division === 'Makushita' && (promotionRelevant || demotionRelevant))
  ) {
    tags.push('SEKITORI_BOUNDARY');
  }
  if (
    (snapshot.division === 'Makuuchi' || snapshot.division === 'Juryo') &&
    (promotionRelevant || demotionRelevant)
  ) {
    tags.push('MAKUUCHI_BOUNDARY');
  }
  if (snapshot.isKinboshiContext) tags.push('KINBOSHI_CHANCE');
  if (!tags.length) tags.push('RANK_EXPECTED_WIN');

  return unique(tags);
};

export const buildBoutFlowDiagnosticContextTags = (
  snapshot: Pick<
    BoutExplanationSnapshot,
    | 'factors'
    | 'boutOrdinal'
    | 'calendarDay'
    | 'currentWins'
    | 'currentLosses'
    | 'currentWinStreak'
    | 'currentLossStreak'
    | 'previousResult'
    | 'pressure'
    | 'titleImplication'
    | 'boundaryImplication'
    | 'division'
    | 'rank'
    | 'isKinboshiContext'
  >,
): BoutFlowDiagnosticContextTags => ({
  victoryFactorTags: resolveBoutFlowVictoryFactorTags(snapshot.factors),
  hoshitoriContextTags: resolveBoutFlowHoshitoriContextTags(snapshot),
  banzukeContextTags: resolveBoutFlowBanzukeContextTags(snapshot),
});

const resolveKimariteSnapshot = (
  kimarite: string,
): BoutFlowDiagnosticKimariteSnapshot => {
  const normalized = normalizeKimariteName(kimarite);
  const official = findOfficialKimariteEntry(normalized);
  if (official) {
    return {
      name: official.name,
      family: official.family,
      diagnosticFamily: official.family,
      rarity: official.rarityBucket,
      catalogStatus: 'OFFICIAL',
    };
  }
  const nonTechnique = findNonTechniqueEntry(normalized);
  if (nonTechnique) {
    return {
      name: nonTechnique.name,
      family: nonTechnique.family,
      diagnosticFamily: nonTechnique.family,
      rarity: nonTechnique.rarityBucket,
      catalogStatus: 'NON_TECHNIQUE',
    };
  }
  return {
    name: normalized,
    diagnosticFamily: 'UNKNOWN',
    catalogStatus: 'UNKNOWN',
  };
};

export const createBoutFlowDiagnosticSnapshotFromExplanationSnapshot = (
  snapshot: BoutExplanationSnapshot,
): BoutFlowDiagnosticSnapshot | undefined => {
  if (
    !snapshot.preBoutPhaseWeights ||
    !snapshot.winRoute ||
    !snapshot.kimarite ||
    !snapshot.boutEngagement
  ) {
    return undefined;
  }
  const controlPhase = resolveControlPhaseCandidate({
    engagement: snapshot.boutEngagement,
    finishRoute: snapshot.winRoute,
    kimaritePattern: snapshot.kimaritePattern,
  });
  const openingConfidence = resolvePreBoutPhaseConfidence(snapshot.preBoutPhaseWeights);
  return createBoutFlowDiagnosticSnapshot({
    openingPhase: openingConfidence.dominantPhase,
    openingConfidence: openingConfidence.bucket,
    controlPhasePredecessor: snapshot.boutEngagement.phase,
    controlPhaseCandidate: controlPhase.controlPhaseCandidate,
    controlConfidence: controlPhase.confidence,
    finishRoute: snapshot.winRoute as WinRoute,
    kimaritePattern: snapshot.kimaritePattern,
    kimarite: resolveKimariteSnapshot(snapshot.kimarite),
    ...buildBoutFlowDiagnosticContextTags(snapshot),
  });
};
