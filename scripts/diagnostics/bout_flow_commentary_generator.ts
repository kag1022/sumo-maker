/* global console */
import fs from 'node:fs';
import path from 'node:path';
import {
  createBoutFlowDiagnosticSnapshot,
  type BoutFlowDiagnosticSnapshot,
  type CreateBoutFlowDiagnosticSnapshotInput,
} from '../../src/logic/simulation/combat/boutFlowDiagnosticSnapshot';
import {
  createBoutFlowCommentaryDiagnostic,
  type BoutFlowCommentary,
} from '../../src/logic/simulation/combat/boutFlowCommentary';
import {
  COMMENTARY_KIMARITE_SUBFAMILIES_BY_FAMILY,
  resolveCommentaryKimariteSubfamily,
  type CommentaryKimariteSubfamily,
} from '../../src/logic/simulation/combat/kimariteCommentarySubfamily';
import type { BoutExplanationMaterialAxis } from '../../src/logic/simulation/combat/boutFlowModel';

const DIAGNOSTIC_SEED = 20260515;
const REQUIRED_AXES: readonly BoutExplanationMaterialAxis[] = [
  'OPENING',
  'CONTROL',
  'TRANSITION',
  'FINISH_ROUTE',
  'KIMARITE',
  'VICTORY_FACTOR',
  'HOSHITORI_CONTEXT',
  'BANZUKE_CONTEXT',
];

interface KimariteFixture {
  readonly name: string;
  readonly family: string;
  readonly diagnosticFamily: string;
  readonly rarity: string;
  readonly catalogStatus: string;
}

interface Fixture {
  readonly label: string;
  readonly input: CreateBoutFlowDiagnosticSnapshotInput;
  readonly outcome?: 'WIN' | 'LOSS';
}

type FixtureOutcome = NonNullable<Fixture['outcome']>;
type FixtureFamily = keyof typeof COMMENTARY_KIMARITE_SUBFAMILIES_BY_FAMILY;
type FixtureFinishRoute = CreateBoutFlowDiagnosticSnapshotInput['finishRoute'];
type FixtureOpeningPhase = CreateBoutFlowDiagnosticSnapshotInput['openingPhase'];
type FixtureOpeningConfidence = CreateBoutFlowDiagnosticSnapshotInput['openingConfidence'];
type FixtureControlPredecessor = CreateBoutFlowDiagnosticSnapshotInput['controlPhasePredecessor'];
type FixtureControlCandidate = CreateBoutFlowDiagnosticSnapshotInput['controlPhaseCandidate'];
type FixtureControlConfidence = CreateBoutFlowDiagnosticSnapshotInput['controlConfidence'];
type FixtureKimaritePattern = CreateBoutFlowDiagnosticSnapshotInput['kimaritePattern'];

interface RepresentativeSubfamilyFixture {
  readonly label: string;
  readonly name: string;
  readonly family: FixtureFamily;
  readonly expectedSubfamily: CommentaryKimariteSubfamily;
  readonly finishRoute?: FixtureFinishRoute;
  readonly openingPhase?: FixtureOpeningPhase;
  readonly openingConfidence?: FixtureOpeningConfidence;
  readonly controlPhasePredecessor?: FixtureControlPredecessor;
  readonly controlPhaseCandidate?: FixtureControlCandidate;
  readonly controlConfidence?: FixtureControlConfidence;
  readonly kimaritePattern?: FixtureKimaritePattern;
  readonly outcome?: FixtureOutcome;
  readonly rarity?: string;
}

interface CommentaryScenario {
  readonly label: string;
  readonly snapshot: BoutFlowDiagnosticSnapshot;
  readonly commentary: BoutFlowCommentary;
  readonly commentarySubfamily: ReturnType<typeof resolveCommentaryKimariteSubfamily>;
}

const invariant = (condition: boolean, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const kimarite = (
  name: string,
  family: string,
  rarity = 'COMMON',
): KimariteFixture => ({
  name,
  family,
  diagnosticFamily: family,
  rarity,
  catalogStatus: 'OFFICIAL',
});

const createCompleteSnapshot = (
  fixture: Fixture,
): BoutFlowDiagnosticSnapshot => {
  const snapshot = createBoutFlowDiagnosticSnapshot(fixture.input);
  invariant(
    snapshot.explanationCompleteness === 'COMPLETE_CONTEXT',
    `${fixture.label} must produce COMPLETE_CONTEXT`,
  );
  return snapshot;
};

const generateCommentary = (
  fixture: Fixture,
): CommentaryScenario => {
  const snapshot = createCompleteSnapshot(fixture);
  const diagnostic = createBoutFlowCommentaryDiagnostic(snapshot, fixture.outcome ?? 'WIN');
  invariant(diagnostic.generated, `${fixture.label} commentary should be generated`);
  invariant(Boolean(diagnostic.commentary), `${fixture.label} commentary payload should exist`);
  if (!diagnostic.commentary) {
    throw new Error(`${fixture.label} commentary payload is missing`);
  }
  return {
    label: fixture.label,
    snapshot,
    commentary: diagnostic.commentary,
    commentarySubfamily: resolveCommentaryKimariteSubfamily({
      name: snapshot.kimarite.name,
      family: snapshot.kimarite.family,
      diagnosticFamily: snapshot.kimarite.diagnosticFamily,
      pattern: snapshot.kimaritePattern,
      finishRoute: snapshot.finishRoute,
      transitionClassification: snapshot.transitionClassification,
    }),
  };
};

const pushOut = kimarite('押し出し', 'PUSH_THRUST');

const baseFixtures: readonly Fixture[] = [
  {
    label: 'same-kimarite-push-expected-win',
    input: {
      openingPhase: 'THRUST_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'THRUST_BATTLE',
      controlPhaseCandidate: 'THRUST_BATTLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'PUSH_OUT',
      kimarite: pushOut,
      victoryFactorTags: ['victory-factor:ability', 'victory-factor:style'],
      hoshitoriContextTags: ['EARLY_BASHO', 'WIN_STREAK'],
      banzukeContextTags: ['RANK_EXPECTED_WIN'],
    },
  },
  {
    label: 'same-kimarite-belt-to-push-promotion-boundary',
    input: {
      openingPhase: 'BELT_BATTLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'THRUST_BATTLE',
      controlPhaseCandidate: 'THRUST_BATTLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'PUSH_OUT',
      kimarite: pushOut,
      victoryFactorTags: ['victory-factor:pressure', 'victory-factor:body'],
      hoshitoriContextTags: ['KACHI_MAKE_DECIDER', 'FINAL_BOUT'],
      banzukeContextTags: ['PROMOTION_RELEVANT', 'SEKITORI_BOUNDARY'],
    },
  },
  {
    label: 'same-kimarite-edge-yusho-kinboshi',
    input: {
      openingPhase: 'EDGE_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'EDGE_SCRAMBLE',
      controlPhaseCandidate: 'EDGE_BATTLE',
      controlConfidence: 'RENAMED',
      finishRoute: 'PUSH_OUT',
      kimarite: pushOut,
      victoryFactorTags: ['victory-factor:momentum', 'victory-factor:kimarite-fit'],
      hoshitoriContextTags: ['YUSHO_CHASE', 'RECOVERY_BOUT'],
      banzukeContextTags: ['KINBOSHI_CHANCE'],
    },
  },
  {
    label: 'throw-technique-demotion-pressure',
    input: {
      openingPhase: 'TECHNIQUE_SCRAMBLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'TECHNIQUE_SCRAMBLE',
      controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'THROW_BREAK',
      kimarite: kimarite('下手投げ', 'THROW'),
      victoryFactorTags: ['victory-factor:phase-shape', 'victory-factor:pressure'],
      hoshitoriContextTags: ['MAKEKOSHI_DECIDER', 'LOSS_STREAK'],
      banzukeContextTags: ['DEMOTION_RELEVANT'],
    },
  },
  {
    label: 'quick-pull-makuuchi-boundary',
    input: {
      openingPhase: 'QUICK_COLLAPSE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'QUICK_COLLAPSE',
      controlPhaseCandidate: 'QUICK_COLLAPSE',
      controlConfidence: 'DIRECT',
      finishRoute: 'PULL_DOWN',
      kimarite: kimarite('突き落とし', 'TWIST_DOWN'),
      victoryFactorTags: ['victory-factor:style', 'victory-factor:kimarite-fit'],
      hoshitoriContextTags: ['RECOVERY_BOUT', 'MIDDLE_BASHO'],
      banzukeContextTags: ['MAKUUCHI_BOUNDARY'],
    },
  },
  {
    label: 'belt-force-sanyaku-kachikoshi',
    input: {
      openingPhase: 'BELT_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'BELT_BATTLE',
      controlPhaseCandidate: 'BELT_BATTLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'BELT_FORCE',
      kimarite: kimarite('寄り切り', 'FORCE_OUT'),
      victoryFactorTags: ['victory-factor:ability', 'victory-factor:form'],
      hoshitoriContextTags: ['KACHIKOSHI_DECIDER'],
      banzukeContextTags: ['SAN_YAKU_PRESSURE'],
    },
  },
  {
    label: 'leg-attack-rank-gap-upset',
    input: {
      openingPhase: 'MIXED',
      openingConfidence: 'LOW',
      controlPhasePredecessor: 'TECHNIQUE_SCRAMBLE',
      controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
      controlConfidence: 'INFERRED',
      finishRoute: 'LEG_ATTACK',
      kimarite: kimarite('足取り', 'TRIP_PICK', 'RARE'),
      victoryFactorTags: ['victory-factor:body', 'victory-factor:phase-shape'],
      hoshitoriContextTags: ['LEAD_PROTECTION'],
      banzukeContextTags: ['RANK_GAP_UPSET'],
    },
  },
  {
    label: 'edge-reversal-final-bout',
    input: {
      openingPhase: 'EDGE_BATTLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'EDGE_SCRAMBLE',
      controlPhaseCandidate: 'EDGE_BATTLE',
      controlConfidence: 'RENAMED',
      finishRoute: 'EDGE_REVERSAL',
      kimarite: kimarite('うっちゃり', 'THROW', 'RARE'),
      victoryFactorTags: ['victory-factor:momentum', 'victory-factor:pressure'],
      hoshitoriContextTags: ['FINAL_BOUT'],
      banzukeContextTags: ['SEKITORI_BOUNDARY'],
    },
  },
  {
    label: 'loss-same-kimarite-push-expected-win',
    outcome: 'LOSS',
    input: {
      openingPhase: 'THRUST_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'THRUST_BATTLE',
      controlPhaseCandidate: 'THRUST_BATTLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'PUSH_OUT',
      kimarite: pushOut,
      victoryFactorTags: ['victory-factor:style', 'victory-factor:pressure'],
      hoshitoriContextTags: ['EARLY_BASHO'],
      banzukeContextTags: ['RANK_EXPECTED_WIN'],
    },
  },
  {
    label: 'loss-same-kimarite-push-kachikoshi',
    outcome: 'LOSS',
    input: {
      openingPhase: 'BELT_BATTLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'THRUST_BATTLE',
      controlPhaseCandidate: 'THRUST_BATTLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'PUSH_OUT',
      kimarite: pushOut,
      victoryFactorTags: ['victory-factor:body', 'victory-factor:phase-shape'],
      hoshitoriContextTags: ['KACHIKOSHI_DECIDER'],
      banzukeContextTags: ['PROMOTION_RELEVANT'],
    },
  },
  {
    label: 'loss-same-kimarite-edge-chase',
    outcome: 'LOSS',
    input: {
      openingPhase: 'EDGE_BATTLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'EDGE_SCRAMBLE',
      controlPhaseCandidate: 'EDGE_BATTLE',
      controlConfidence: 'RENAMED',
      finishRoute: 'PUSH_OUT',
      kimarite: pushOut,
      victoryFactorTags: ['victory-factor:momentum', 'victory-factor:kimarite-fit'],
      hoshitoriContextTags: ['YUSHO_CHASE'],
      banzukeContextTags: ['KINBOSHI_CHANCE'],
    },
  },
  {
    label: 'loss-yori-final-demotion',
    outcome: 'LOSS',
    input: {
      openingPhase: 'BELT_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'BELT_BATTLE',
      controlPhaseCandidate: 'BELT_BATTLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'BELT_FORCE',
      kimarite: kimarite('寄り切り', 'FORCE_OUT'),
      victoryFactorTags: ['victory-factor:ability', 'victory-factor:body'],
      hoshitoriContextTags: ['FINAL_BOUT'],
      banzukeContextTags: ['DEMOTION_RELEVANT'],
    },
  },
  {
    label: 'loss-pull-middle-boundary',
    outcome: 'LOSS',
    input: {
      openingPhase: 'QUICK_COLLAPSE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'QUICK_COLLAPSE',
      controlPhaseCandidate: 'QUICK_COLLAPSE',
      controlConfidence: 'DIRECT',
      finishRoute: 'PULL_DOWN',
      kimarite: kimarite('はたき込み', 'TWIST_DOWN'),
      victoryFactorTags: ['victory-factor:style', 'victory-factor:kimarite-fit'],
      hoshitoriContextTags: ['MIDDLE_BASHO'],
      banzukeContextTags: ['SEKITORI_BOUNDARY'],
    },
  },
  {
    label: 'loss-throw-makekoshi',
    outcome: 'LOSS',
    input: {
      openingPhase: 'TECHNIQUE_SCRAMBLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'TECHNIQUE_SCRAMBLE',
      controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'THROW_BREAK',
      kimarite: kimarite('上手投げ', 'THROW'),
      victoryFactorTags: ['victory-factor:pressure', 'victory-factor:phase-shape'],
      hoshitoriContextTags: ['MAKEKOSHI_DECIDER'],
      banzukeContextTags: ['MAKUUCHI_BOUNDARY'],
    },
  },
  {
    label: 'loss-leg-rank-expected',
    outcome: 'LOSS',
    input: {
      openingPhase: 'MIXED',
      openingConfidence: 'LOW',
      controlPhasePredecessor: 'TECHNIQUE_SCRAMBLE',
      controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
      controlConfidence: 'INFERRED',
      finishRoute: 'LEG_ATTACK',
      kimarite: kimarite('外掛け', 'TRIP_PICK'),
      victoryFactorTags: ['victory-factor:phase-shape', 'victory-factor:form'],
      hoshitoriContextTags: ['LOSS_STREAK'],
      banzukeContextTags: ['RANK_EXPECTED_WIN'],
    },
  },
  {
    label: 'loss-rear-finish-lead-protection',
    outcome: 'LOSS',
    input: {
      openingPhase: 'MIXED',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'MIXED',
      controlPhaseCandidate: 'MIXED',
      controlConfidence: 'AMBIGUOUS',
      finishRoute: 'REAR_FINISH',
      kimarite: kimarite('送り出し', 'REAR'),
      victoryFactorTags: ['victory-factor:momentum', 'victory-factor:style'],
      hoshitoriContextTags: ['LEAD_PROTECTION'],
      banzukeContextTags: ['SAN_YAKU_PRESSURE'],
    },
  },
  {
    label: 'win-yori-promotion',
    input: {
      openingPhase: 'BELT_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'BELT_BATTLE',
      controlPhaseCandidate: 'BELT_BATTLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'BELT_FORCE',
      kimarite: kimarite('寄り倒し', 'FORCE_OUT'),
      victoryFactorTags: ['victory-factor:ability', 'victory-factor:pressure'],
      hoshitoriContextTags: ['KACHI_MAKE_DECIDER'],
      banzukeContextTags: ['PROMOTION_RELEVANT'],
    },
  },
  {
    label: 'win-pull-quick-recovery',
    input: {
      openingPhase: 'QUICK_COLLAPSE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'QUICK_COLLAPSE',
      controlPhaseCandidate: 'QUICK_COLLAPSE',
      controlConfidence: 'DIRECT',
      finishRoute: 'PULL_DOWN',
      kimarite: kimarite('引き落とし', 'TWIST_DOWN'),
      victoryFactorTags: ['victory-factor:kimarite-fit', 'victory-factor:style'],
      hoshitoriContextTags: ['RECOVERY_BOUT'],
      banzukeContextTags: ['RANK_EXPECTED_WIN'],
    },
  },
  {
    label: 'win-rear-middle-rank-gap',
    input: {
      openingPhase: 'MIXED',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'MIXED',
      controlPhaseCandidate: 'MIXED',
      controlConfidence: 'AMBIGUOUS',
      finishRoute: 'REAR_FINISH',
      kimarite: kimarite('送り倒し', 'REAR'),
      victoryFactorTags: ['victory-factor:momentum', 'victory-factor:phase-shape'],
      hoshitoriContextTags: ['MIDDLE_BASHO'],
      banzukeContextTags: ['RANK_GAP_UPSET'],
    },
  },
  {
    label: 'win-edge-direct-yusho',
    input: {
      openingPhase: 'EDGE_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'EDGE_SCRAMBLE',
      controlPhaseCandidate: 'EDGE_BATTLE',
      controlConfidence: 'RENAMED',
      finishRoute: 'EDGE_REVERSAL',
      kimarite: kimarite('小手投げ', 'THROW'),
      victoryFactorTags: ['victory-factor:pressure', 'victory-factor:momentum'],
      hoshitoriContextTags: ['YUSHO_DIRECT'],
      banzukeContextTags: ['SAN_YAKU_PRESSURE'],
    },
  },
  {
    label: 'win-leg-early',
    input: {
      openingPhase: 'TECHNIQUE_SCRAMBLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'TECHNIQUE_SCRAMBLE',
      controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
      controlConfidence: 'DIRECT',
      finishRoute: 'LEG_ATTACK',
      kimarite: kimarite('内掛け', 'TRIP_PICK'),
      victoryFactorTags: ['victory-factor:phase-shape', 'victory-factor:kimarite-fit'],
      hoshitoriContextTags: ['EARLY_BASHO'],
      banzukeContextTags: ['RANK_EXPECTED_WIN'],
    },
  },
];

const HOSHITORI_CONTEXT_CYCLE = [
  'EARLY_BASHO',
  'MIDDLE_BASHO',
  'FINAL_BOUT',
  'KACHIKOSHI_DECIDER',
  'MAKEKOSHI_DECIDER',
  'KACHI_MAKE_DECIDER',
  'YUSHO_DIRECT',
  'YUSHO_CHASE',
  'WIN_STREAK',
  'LOSS_STREAK',
  'RECOVERY_BOUT',
  'LEAD_PROTECTION',
] as const;

const BANZUKE_CONTEXT_CYCLE = [
  'RANK_EXPECTED_WIN',
  'PROMOTION_RELEVANT',
  'DEMOTION_RELEVANT',
  'SAN_YAKU_PRESSURE',
  'SEKITORI_BOUNDARY',
  'MAKUUCHI_BOUNDARY',
  'KINBOSHI_CHANCE',
  'RANK_GAP_UPSET',
] as const;

const familyDefaults: Record<FixtureFamily, {
  readonly finishRoute: FixtureFinishRoute;
  readonly openingPhase: FixtureOpeningPhase;
  readonly openingConfidence: FixtureOpeningConfidence;
  readonly controlPhasePredecessor: FixtureControlPredecessor;
  readonly controlPhaseCandidate: FixtureControlCandidate;
  readonly controlConfidence: FixtureControlConfidence;
}> = {
  PUSH_THRUST: {
    finishRoute: 'PUSH_OUT',
    openingPhase: 'THRUST_BATTLE',
    openingConfidence: 'HIGH',
    controlPhasePredecessor: 'THRUST_BATTLE',
    controlPhaseCandidate: 'THRUST_BATTLE',
    controlConfidence: 'DIRECT',
  },
  FORCE_OUT: {
    finishRoute: 'BELT_FORCE',
    openingPhase: 'BELT_BATTLE',
    openingConfidence: 'HIGH',
    controlPhasePredecessor: 'BELT_BATTLE',
    controlPhaseCandidate: 'BELT_BATTLE',
    controlConfidence: 'DIRECT',
  },
  THROW: {
    finishRoute: 'THROW_BREAK',
    openingPhase: 'TECHNIQUE_SCRAMBLE',
    openingConfidence: 'MEDIUM',
    controlPhasePredecessor: 'MIXED',
    controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
    controlConfidence: 'INFERRED',
  },
  TWIST_DOWN: {
    finishRoute: 'PULL_DOWN',
    openingPhase: 'QUICK_COLLAPSE',
    openingConfidence: 'HIGH',
    controlPhasePredecessor: 'QUICK_COLLAPSE',
    controlPhaseCandidate: 'QUICK_COLLAPSE',
    controlConfidence: 'DIRECT',
  },
  TRIP_PICK: {
    finishRoute: 'LEG_ATTACK',
    openingPhase: 'MIXED',
    openingConfidence: 'MEDIUM',
    controlPhasePredecessor: 'MIXED',
    controlPhaseCandidate: 'TECHNIQUE_SCRAMBLE',
    controlConfidence: 'INFERRED',
  },
  BACKWARD_BODY_DROP: {
    finishRoute: 'EDGE_REVERSAL',
    openingPhase: 'EDGE_BATTLE',
    openingConfidence: 'MEDIUM',
    controlPhasePredecessor: 'EDGE_SCRAMBLE',
    controlPhaseCandidate: 'EDGE_BATTLE',
    controlConfidence: 'RENAMED',
  },
  REAR: {
    finishRoute: 'REAR_FINISH',
    openingPhase: 'MIXED',
    openingConfidence: 'MEDIUM',
    controlPhasePredecessor: 'MIXED',
    controlPhaseCandidate: 'MIXED',
    controlConfidence: 'AMBIGUOUS',
  },
  NON_TECHNIQUE: {
    finishRoute: 'PUSH_OUT',
    openingPhase: 'QUICK_COLLAPSE',
    openingConfidence: 'HIGH',
    controlPhasePredecessor: 'QUICK_COLLAPSE',
    controlPhaseCandidate: 'QUICK_COLLAPSE',
    controlConfidence: 'DIRECT',
  },
};

const representativeSubfamilies: readonly RepresentativeSubfamilyFixture[] = [
  { label: 'push-out', name: '押し出し', family: 'PUSH_THRUST', expectedSubfamily: 'PUSH_OUT' },
  { label: 'thrust-out', name: '突き出し', family: 'PUSH_THRUST', expectedSubfamily: 'THRUST_OUT' },
  { label: 'push-down', name: '押し倒し', family: 'PUSH_THRUST', expectedSubfamily: 'PUSH_DOWN' },
  { label: 'thrust-down', name: '突き倒し', family: 'PUSH_THRUST', expectedSubfamily: 'THRUST_DOWN' },
  { label: 'push-break-context', name: '未知押し', family: 'PUSH_THRUST', expectedSubfamily: 'PUSH_BREAK' },
  { label: 'yori-out', name: '寄り切り', family: 'FORCE_OUT', expectedSubfamily: 'YORI_OUT' },
  { label: 'yori-down', name: '寄り倒し', family: 'FORCE_OUT', expectedSubfamily: 'YORI_DOWN' },
  { label: 'abise-down', name: '浴びせ倒し', family: 'FORCE_OUT', expectedSubfamily: 'ABISE_DOWN' },
  { label: 'kime-force', name: '極め出し', family: 'FORCE_OUT', expectedSubfamily: 'KIME_FORCE' },
  { label: 'lift-force', name: '吊り出し', family: 'FORCE_OUT', expectedSubfamily: 'LIFT_FORCE' },
  {
    label: 'edge-force-context',
    name: '未知寄り',
    family: 'FORCE_OUT',
    expectedSubfamily: 'EDGE_FORCE',
    finishRoute: 'EDGE_REVERSAL',
    openingPhase: 'EDGE_BATTLE',
    controlPhasePredecessor: 'EDGE_SCRAMBLE',
    controlPhaseCandidate: 'EDGE_BATTLE',
    controlConfidence: 'RENAMED',
  },
  { label: 'belt-throw', name: '上手投げ', family: 'THROW', expectedSubfamily: 'BELT_THROW' },
  { label: 'arm-throw', name: '小手投げ', family: 'THROW', expectedSubfamily: 'ARM_THROW' },
  { label: 'scoop-throw', name: '掬い投げ', family: 'THROW', expectedSubfamily: 'SCOOP_THROW' },
  {
    label: 'edge-reversal-throw',
    name: 'うっちゃり',
    family: 'THROW',
    expectedSubfamily: 'EDGE_REVERSAL_THROW',
    finishRoute: 'EDGE_REVERSAL',
    openingPhase: 'EDGE_BATTLE',
    controlPhasePredecessor: 'EDGE_SCRAMBLE',
    controlPhaseCandidate: 'EDGE_BATTLE',
    controlConfidence: 'RENAMED',
    rarity: 'RARE',
  },
  { label: 'body-break-throw', name: '二丁投げ', family: 'THROW', expectedSubfamily: 'BODY_BREAK_THROW' },
  { label: 'tsukiotoshi', name: '突き落とし', family: 'TWIST_DOWN', expectedSubfamily: 'TSUKIOTOSHI' },
  { label: 'hatakikomi', name: 'はたき込み', family: 'TWIST_DOWN', expectedSubfamily: 'HATAKIKOMI' },
  { label: 'hikiotoshi', name: '引き落とし', family: 'TWIST_DOWN', expectedSubfamily: 'HIKIOTOSHI' },
  { label: 'makiotoshi', name: '巻き落とし', family: 'TWIST_DOWN', expectedSubfamily: 'MAKIOTOSHI' },
  { label: 'twist-break', name: '合掌捻り', family: 'TWIST_DOWN', expectedSubfamily: 'TWIST_BREAK' },
  { label: 'pull-break', name: '肩透かし', family: 'TWIST_DOWN', expectedSubfamily: 'PULL_BREAK' },
  {
    label: 'edge-twist',
    name: '呼び戻し',
    family: 'TWIST_DOWN',
    expectedSubfamily: 'EDGE_TWIST',
    finishRoute: 'EDGE_REVERSAL',
    openingPhase: 'EDGE_BATTLE',
    controlPhasePredecessor: 'EDGE_SCRAMBLE',
    controlPhaseCandidate: 'EDGE_BATTLE',
    controlConfidence: 'RENAMED',
  },
  { label: 'leg-twist', name: '渡し込み', family: 'TWIST_DOWN', expectedSubfamily: 'LEG_TWIST' },
  { label: 'leg-pick', name: '足取り', family: 'TRIP_PICK', expectedSubfamily: 'LEG_PICK', rarity: 'RARE' },
  { label: 'outer-trip', name: '外掛け', family: 'TRIP_PICK', expectedSubfamily: 'OUTER_TRIP' },
  { label: 'inner-trip', name: '内掛け', family: 'TRIP_PICK', expectedSubfamily: 'INNER_TRIP' },
  { label: 'kick-trip', name: '蹴手繰り', family: 'TRIP_PICK', expectedSubfamily: 'KICK_TRIP', rarity: 'RARE' },
  { label: 'hook-throw', name: '河津掛け', family: 'TRIP_PICK', expectedSubfamily: 'HOOK_THROW', rarity: 'RARE' },
  { label: 'leg-break', name: '三所攻め', family: 'TRIP_PICK', expectedSubfamily: 'LEG_BREAK', rarity: 'RARE' },
  { label: 'soritech', name: '掛け反り', family: 'BACKWARD_BODY_DROP', expectedSubfamily: 'SORITECH', rarity: 'RARE' },
  {
    label: 'big-arch',
    name: '未知大反り',
    family: 'BACKWARD_BODY_DROP',
    expectedSubfamily: 'BIG_ARCH',
    finishRoute: 'EDGE_REVERSAL',
    openingPhase: 'EDGE_BATTLE',
    controlPhasePredecessor: 'EDGE_SCRAMBLE',
    controlPhaseCandidate: 'EDGE_BATTLE',
    controlConfidence: 'RENAMED',
    kimaritePattern: 'BACKWARD_ARCH',
    rarity: 'EXTREME',
  },
  {
    label: 'sutemi-context',
    name: '未知反り',
    family: 'BACKWARD_BODY_DROP',
    expectedSubfamily: 'SUTEMI',
    rarity: 'RARE',
  },
  { label: 'rear-push-out', name: '送り出し', family: 'REAR', expectedSubfamily: 'REAR_PUSH_OUT' },
  { label: 'rear-down', name: '送り倒し', family: 'REAR', expectedSubfamily: 'REAR_DOWN' },
  { label: 'rear-grip', name: '後ろもたれ', family: 'REAR', expectedSubfamily: 'REAR_GRIP' },
  { label: 'rear-break', name: '送り投げ', family: 'REAR', expectedSubfamily: 'REAR_BREAK' },
  { label: 'rear-lift', name: '送り吊り出し', family: 'REAR', expectedSubfamily: 'REAR_LIFT' },
  { label: 'isamiashi', name: '勇み足', family: 'NON_TECHNIQUE', expectedSubfamily: 'ISAMIASHI' },
  { label: 'koshikudake', name: '腰砕け', family: 'NON_TECHNIQUE', expectedSubfamily: 'KOSHIKUDAKE' },
  { label: 'touch-down', name: 'つき手', family: 'NON_TECHNIQUE', expectedSubfamily: 'TOUCH_DOWN' },
  { label: 'step-out', name: '踏み出し', family: 'NON_TECHNIQUE', expectedSubfamily: 'STEP_OUT' },
  { label: 'foul', name: '反則', family: 'NON_TECHNIQUE', expectedSubfamily: 'FOUL' },
  { label: 'fusen', name: '不戦', family: 'NON_TECHNIQUE', expectedSubfamily: 'FUSEN' },
];

const genericFallbackSubfamilies: readonly RepresentativeSubfamilyFixture[] = ([
  ['PUSH_THRUST', '未知押し', 'BELT_FORCE'],
  ['FORCE_OUT', '未知寄り', 'PUSH_OUT'],
  ['THROW', '未知投げ', 'PUSH_OUT'],
  ['TWIST_DOWN', '未知落とし', 'PUSH_OUT'],
  ['TRIP_PICK', '未知足技', 'PUSH_OUT'],
  ['BACKWARD_BODY_DROP', '未知反り', 'PUSH_OUT'],
  ['REAR', '未知送り', 'PUSH_OUT'],
  ['NON_TECHNIQUE', '未知非技', 'PUSH_OUT'],
] as const).map(([family, name, finishRoute]) => ({
  label: `generic-${family.toLowerCase()}`,
  name,
  family,
  expectedSubfamily: 'GENERIC',
  finishRoute,
  openingPhase: finishRoute === 'PUSH_OUT' ? 'MIXED' : undefined,
  controlPhasePredecessor: finishRoute === 'PUSH_OUT' ? 'MIXED' : undefined,
  controlPhaseCandidate: finishRoute === 'PUSH_OUT' ? 'MIXED' : undefined,
  controlConfidence: finishRoute === 'PUSH_OUT' ? 'AMBIGUOUS' : undefined,
}));

const mirrorSubfamilyLabels = new Set([
  'push-out',
  'yori-out',
  'belt-throw',
  'hatakikomi',
  'leg-pick',
  'soritech',
  'big-arch',
  'isamiashi',
]);

const toSubfamilyFixture = (
  fixture: RepresentativeSubfamilyFixture,
  index: number,
  labelPrefix: string,
): Fixture => {
  const defaults = familyDefaults[fixture.family];
  return {
    label: `${labelPrefix}-${fixture.label}`,
    outcome: fixture.outcome,
    input: {
      openingPhase: fixture.openingPhase ?? defaults.openingPhase,
      openingConfidence: fixture.openingConfidence ?? defaults.openingConfidence,
      controlPhasePredecessor: fixture.controlPhasePredecessor ?? defaults.controlPhasePredecessor,
      controlPhaseCandidate: fixture.controlPhaseCandidate ?? defaults.controlPhaseCandidate,
      controlConfidence: fixture.controlConfidence ?? defaults.controlConfidence,
      finishRoute: fixture.finishRoute ?? defaults.finishRoute,
      kimaritePattern: fixture.kimaritePattern,
      kimarite: kimarite(fixture.name, fixture.family, fixture.rarity),
      victoryFactorTags: index % 2 === 0
        ? ['victory-factor:kimarite-fit', 'victory-factor:phase-shape']
        : ['victory-factor:style', 'victory-factor:pressure'],
      hoshitoriContextTags: [HOSHITORI_CONTEXT_CYCLE[index % HOSHITORI_CONTEXT_CYCLE.length]],
      banzukeContextTags: [BANZUKE_CONTEXT_CYCLE[index % BANZUKE_CONTEXT_CYCLE.length]],
    },
  };
};

const representativeFixtures = representativeSubfamilies.map((fixture, index) =>
  toSubfamilyFixture(fixture, index, 'subfamily'),
);

const genericFallbackFixtures = genericFallbackSubfamilies.map((fixture, index) =>
  toSubfamilyFixture(fixture, index + representativeSubfamilies.length, 'subfamily'),
);

const mirrorFixtures = representativeSubfamilies
  .filter((fixture) => mirrorSubfamilyLabels.has(fixture.label))
  .map((fixture, index) =>
    toSubfamilyFixture({ ...fixture, outcome: 'LOSS' }, index + representativeSubfamilies.length + genericFallbackSubfamilies.length, 'mirror-loss'),
  );

const fixtures: readonly Fixture[] = [
  ...baseFixtures,
  ...representativeFixtures,
  ...genericFallbackFixtures,
  ...mirrorFixtures,
];

const expectedSubfamilyByLabel = new Map<string, CommentaryKimariteSubfamily>([
  ...representativeSubfamilies.map((fixture) => [`subfamily-${fixture.label}`, fixture.expectedSubfamily] as const),
  ...genericFallbackSubfamilies.map((fixture) => [`subfamily-${fixture.label}`, fixture.expectedSubfamily] as const),
  ...representativeSubfamilies
    .filter((fixture) => mirrorSubfamilyLabels.has(fixture.label))
    .map((fixture) => [`mirror-loss-${fixture.label}`, fixture.expectedSubfamily] as const),
]);

const countBy = <T extends string>(values: readonly T[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
};

const duplicated = (counts: Record<string, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 1));

const repeatedSlotCount = (counts: Record<string, number>): number =>
  Object.values(counts).reduce((sum, count) => sum + Math.max(0, count - 1), 0);

const phraseSegments = (text: string): readonly string[] =>
  text
    .split(/[。、]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length >= 4);

const containsRawEnum = (text: string): boolean => /[A-Z]{2,}_[A-Z0-9_]+/.test(text);
const containsOverclaim = (text: string): boolean => /必ず|絶対|完全に|間違いなく|唯一/.test(text);
const containsBannedPlayerLabel = (text: string): boolean => /^(取口|体格|調子|展開)$/.test(text);
const containsAwkwardConnection = (text: string): boolean => /た、/.test(text);

const qualityFlags = (scenario: CommentaryScenario): readonly string[] => {
  const texts = [
    scenario.commentary.shortCommentary,
    ...scenario.commentary.flowExplanation,
    ...scenario.commentary.materials.map((material) => material.text),
  ];
  const flags: string[] = [];
  if (texts.some((text) => text.includes('undefined') || text.includes('null'))) {
    flags.push('contains-nullish-token');
  }
  if (texts.some(containsRawEnum)) {
    flags.push('contains-raw-enum-token');
  }
  if (texts.some((text) => /。。|、、/.test(text))) {
    flags.push('duplicate-punctuation');
  }
  if (texts.some(containsOverclaim)) {
    flags.push('contains-overclaim-token');
  }
  if (texts.some(containsAwkwardConnection)) {
    flags.push('contains-awkward-connection');
  }
  if (scenario.commentary.shortCommentary.length > 120) {
    flags.push('short-commentary-too-long');
  }
  if ((scenario.commentary.shortCommentary.match(/。/g)?.length ?? 0) > 2) {
    flags.push('short-commentary-too-many-sentences');
  }
  if (scenario.commentary.victoryFactorLabels.some(containsBannedPlayerLabel)) {
    flags.push('contains-internal-factor-label');
  }
  return flags;
};

const scenarios = fixtures.map(generateCommentary);
const sameKimariteScenarios = scenarios.filter((scenario) => scenario.label.startsWith('same-kimarite-'));
const sameKimariteShorts = new Set(sameKimariteScenarios.map((scenario) => scenario.commentary.shortCommentary));
const sameKimariteMaterialKeySets = new Set(sameKimariteScenarios.map((scenario) => scenario.commentary.materialKeys.join('|')));
const materialKeyCounts = countBy(scenarios.flatMap((scenario) => scenario.commentary.materialKeys));
const materialTextCounts = countBy(scenarios.flatMap((scenario) => scenario.commentary.materials.map((material) => material.text)));
const kimariteMaterialKeyCounts = countBy(scenarios.flatMap((scenario) =>
  scenario.commentary.materials
    .filter((material) => material.axis === 'KIMARITE')
    .map((material) => material.key),
));
const kimariteMaterialTextCounts = countBy(scenarios.flatMap((scenario) =>
  scenario.commentary.materials
    .filter((material) => material.axis === 'KIMARITE')
    .map((material) => material.text),
));
const shortCommentaryCounts = countBy(scenarios.map((scenario) => scenario.commentary.shortCommentary));
const shortCommentaryLengths = scenarios.map((scenario) => scenario.commentary.shortCommentary.length);
const shortPhraseCounts = countBy(scenarios.flatMap((scenario) => phraseSegments(scenario.commentary.shortCommentary)));
const axisCounts = countBy(scenarios.flatMap((scenario) => scenario.commentary.materials.map((material) => material.axis)));
const transitionCounts = countBy(scenarios.map((scenario) => scenario.snapshot.transitionClassification));
const finishCounts = countBy(scenarios.map((scenario) => scenario.snapshot.finishRoute));
const kimariteCounts = countBy(scenarios.map((scenario) => scenario.snapshot.kimarite.name));
const commentarySubfamilyCounts = countBy(scenarios.map((scenario) => scenario.commentarySubfamily.subfamily));
const commentarySubfamilySourceCounts = countBy(scenarios.map((scenario) => scenario.commentarySubfamily.source));
const hoshitoriCounts = countBy(scenarios.flatMap((scenario) => scenario.snapshot.hoshitoriContextTags));
const banzukeCounts = countBy(scenarios.flatMap((scenario) => scenario.snapshot.banzukeContextTags));
const outcomeCounts = countBy(scenarios.map((scenario) => scenario.commentary.outcome));
const whiteStarScenarios = scenarios.filter((scenario) => scenario.commentary.outcome === 'WIN');
const blackStarScenarios = scenarios.filter((scenario) => scenario.commentary.outcome === 'LOSS');
const winShortSet = new Set(whiteStarScenarios.map((scenario) => scenario.commentary.shortCommentary));
const lossShortSet = new Set(blackStarScenarios.map((scenario) => scenario.commentary.shortCommentary));
const scenarioAudits = scenarios.map((scenario) => {
  const axes = new Set(scenario.commentary.materials.map((material) => material.axis));
  const missingAxes = REQUIRED_AXES.filter((axis) => !axes.has(axis));
  const expectedSubfamily = expectedSubfamilyByLabel.get(scenario.label);
  return {
    label: scenario.label,
    missingAxes,
    qualityFlags: qualityFlags(scenario),
    expectedSubfamily,
    actualSubfamily: scenario.commentarySubfamily.subfamily,
    subfamilyMatchesExpectation: expectedSubfamily === undefined || expectedSubfamily === scenario.commentarySubfamily.subfamily,
    reflectedKeys: {
      opening: scenario.commentary.materialKeys.find((key) => key.startsWith('opening:')),
      control: scenario.commentary.materialKeys.find((key) => key.startsWith('control:')),
      transition: scenario.commentary.materialKeys.find((key) => key.startsWith('transition:')),
      finish: scenario.commentary.materialKeys.find((key) => key.startsWith('finish:')),
      kimarite: scenario.commentary.materialKeys.find((key) => key.startsWith('kimarite:')),
      hoshitori: scenario.commentary.materialKeys.find((key) => key.startsWith('hoshitori:')),
      banzuke: scenario.commentary.materialKeys.find((key) => key.startsWith('banzuke:')),
    },
  };
});
const criticalQualityFlags = scenarioAudits.flatMap((audit) =>
  audit.qualityFlags.map((flag) => `${audit.label}:${flag}`),
);
const missingAxisFlags = scenarioAudits.flatMap((audit) =>
  audit.missingAxes.map((axis) => `${audit.label}:${axis}`),
);
const subfamilyMismatchFlags = scenarioAudits
  .filter((audit) => !audit.subfamilyMatchesExpectation)
  .map((audit) => `${audit.label}:expected=${audit.expectedSubfamily}:actual=${audit.actualSubfamily}`);
const totalMaterialSlots = scenarios.reduce((sum, scenario) => sum + scenario.commentary.materialKeys.length, 0);
const totalKimariteMaterialSlots = Object.values(kimariteMaterialKeyCounts).reduce((sum, count) => sum + count, 0);
const totalShortPhraseSlots = Object.values(shortPhraseCounts).reduce((sum, count) => sum + count, 0);
const repeatedMaterialKeySlots = repeatedSlotCount(materialKeyCounts);
const repeatedMaterialTextSlots = repeatedSlotCount(materialTextCounts);
const repeatedKimariteMaterialKeySlots = repeatedSlotCount(kimariteMaterialKeyCounts);
const repeatedKimariteMaterialTextSlots = repeatedSlotCount(kimariteMaterialTextCounts);
const repeatedShortCommentarySlots = repeatedSlotCount(shortCommentaryCounts);
const repeatedShortPhraseSlots = repeatedSlotCount(shortPhraseCounts);
const fallbackBanzukeSlots = scenarios.filter((scenario) => scenario.snapshot.banzukeContextTags.includes('RANK_EXPECTED_WIN')).length;
const genericSubfamilySlots = scenarios.filter((scenario) => scenario.commentarySubfamily.subfamily === 'GENERIC').length;
const familySubfamilySets = scenarios.reduce<Record<string, Set<string>>>((sets, scenario) => {
  const family = scenario.commentarySubfamily.family;
  sets[family] = sets[family] ?? new Set<string>();
  sets[family].add(scenario.commentarySubfamily.subfamily);
  return sets;
}, {});
const sameFamilyDifferentSubfamilyGroups = Object.fromEntries(
  Object.entries(familySubfamilySets)
    .filter(([, subfamilies]) => subfamilies.size > 1)
    .map(([family, subfamilies]) => [family, Array.from(subfamilies).sort()]),
);
const totalAxisSlots = scenarioAudits.length * REQUIRED_AXES.length;
const reflectedAxisSlots = scenarioAudits.reduce((sum, audit) => sum + REQUIRED_AXES.length - audit.missingAxes.length, 0);
const duplicateShortCommentaryRate = scenarios.length > 0 ? repeatedShortCommentarySlots / scenarios.length : 0;
const topPhraseFrequency = scenarios.length > 0
  ? Math.max(0, ...Object.values(shortPhraseCounts)) / scenarios.length
  : 0;
const fallbackContextRate = scenarios.length > 0 ? fallbackBanzukeSlots / scenarios.length : 0;
const genericSubfamilyRate = scenarios.length > 0 ? genericSubfamilySlots / scenarios.length : 0;
const sameFamilyDifferentSubfamilyRate = Object.keys(familySubfamilySets).length > 0
  ? Object.keys(sameFamilyDifferentSubfamilyGroups).length / Object.keys(familySubfamilySets).length
  : 0;
const expectedSubfamilyKeys = Object.entries(COMMENTARY_KIMARITE_SUBFAMILIES_BY_FAMILY)
  .flatMap(([family, subfamilies]) =>
    subfamilies
      .filter((subfamily) => subfamily !== 'GENERIC')
      .map((subfamily) => `${family}:${subfamily}`),
  );
const coveredSubfamilyKeys = new Set(
  scenarios
    .filter((scenario) => scenario.commentarySubfamily.subfamily !== 'GENERIC')
    .map((scenario) => `${scenario.commentarySubfamily.family}:${scenario.commentarySubfamily.subfamily}`),
);
const uncoveredSubfamiliesByFamily = Object.fromEntries(
  Object.entries(COMMENTARY_KIMARITE_SUBFAMILIES_BY_FAMILY)
    .map(([family, subfamilies]) => [
      family,
      subfamilies.filter((subfamily) =>
        subfamily !== 'GENERIC' && !coveredSubfamilyKeys.has(`${family}:${subfamily}`),
      ),
    ] as const)
    .filter(([, subfamilies]) => subfamilies.length > 0),
);
const subfamilyCoverageRate = expectedSubfamilyKeys.length > 0
  ? coveredSubfamilyKeys.size / expectedSubfamilyKeys.length
  : 0;
const familyScenarioCounts = countBy(scenarios.map((scenario) => scenario.commentarySubfamily.family));
const genericSubfamilyCountsByFamily = countBy(
  scenarios
    .filter((scenario) => scenario.commentarySubfamily.subfamily === 'GENERIC')
    .map((scenario) => scenario.commentarySubfamily.family),
);
const genericSubfamilyRateByFamily = Object.fromEntries(
  Object.entries(familyScenarioCounts).map(([family, count]) => [
    family,
    (genericSubfamilyCountsByFamily[family] ?? 0) / count,
  ]),
);
const familiesWithHighGenericRate = Object.fromEntries(
  Object.entries(genericSubfamilyRateByFamily).filter(([, rate]) => rate >= 0.2),
);
const contextSignature = (scenario: CommentaryScenario): string => [
  scenario.snapshot.openingPhase,
  scenario.snapshot.controlPhaseCandidate ?? 'UNAVAILABLE',
  scenario.snapshot.transitionClassification,
  scenario.snapshot.finishRoute,
  scenario.snapshot.hoshitoriContextTags.join('|'),
  scenario.snapshot.banzukeContextTags.join('|'),
].join(':');
const groupsByKimariteOutcome = scenarios.reduce<Record<string, CommentaryScenario[]>>((groups, scenario) => {
  const key = `${scenario.commentary.kimarite}:${scenario.commentary.outcome}`;
  groups[key] = groups[key] ?? [];
  groups[key].push(scenario);
  return groups;
}, {});
const sameKimariteDifferentContextGroups = Object.values(groupsByKimariteOutcome)
  .filter((group) => group.length > 1 && new Set(group.map(contextSignature)).size > 1);
const sameKimariteDifferentContextConfirmed = sameKimariteDifferentContextGroups
  .filter((group) =>
    new Set(group.map((scenario) => scenario.commentary.shortCommentary)).size > 1 &&
    new Set(group.map((scenario) => scenario.commentary.materialKeys.join('|'))).size > 1,
  );
const sameKimariteDifferentContextRate = sameKimariteDifferentContextGroups.length > 0
  ? sameKimariteDifferentContextConfirmed.length / sameKimariteDifferentContextGroups.length
  : 0;
const kimariteMaterialText = (scenario: CommentaryScenario): string =>
  scenario.commentary.materials.find((material) => material.axis === 'KIMARITE')?.text ?? '';
const groupsByKimarite = scenarios.reduce<Record<string, CommentaryScenario[]>>((groups, scenario) => {
  groups[scenario.commentary.kimarite] = groups[scenario.commentary.kimarite] ?? [];
  groups[scenario.commentary.kimarite].push(scenario);
  return groups;
}, {});
const winLossMirrorGroups = Object.entries(groupsByKimarite)
  .map(([kimariteName, group]) => ({
    kimariteName,
    wins: group.filter((scenario) => scenario.commentary.outcome === 'WIN'),
    losses: group.filter((scenario) => scenario.commentary.outcome === 'LOSS'),
  }))
  .filter((group) => group.wins.length > 0 && group.losses.length > 0);
const winLossMirrorVariationGroups = winLossMirrorGroups.filter((group) => {
  const winTexts = new Set(group.wins.flatMap((scenario) => [
    scenario.commentary.shortCommentary,
    kimariteMaterialText(scenario),
  ]));
  const lossTexts = new Set(group.losses.flatMap((scenario) => [
    scenario.commentary.shortCommentary,
    kimariteMaterialText(scenario),
  ]));
  return [...winTexts].every((text) => !lossTexts.has(text));
});
const winLossMirrorVariationRate = winLossMirrorGroups.length > 0
  ? winLossMirrorVariationGroups.length / winLossMirrorGroups.length
  : 0;
const fallbackPhrasePatterns = [
  '細部の型は限定せず',
  '勝負の形を残した',
  '勝負の形を作れなかった',
  '最後の形で後手に回った',
] as const;
const fallbackPhraseSlots = scenarios.flatMap((scenario) => [
  ...phraseSegments(scenario.commentary.shortCommentary),
  ...scenario.commentary.materials.map((material) => material.text),
]).filter((text) => fallbackPhrasePatterns.some((pattern) => text.includes(pattern)));
const totalPhraseAndMaterialSlots = totalShortPhraseSlots + totalMaterialSlots;
const overusedFallbackPhraseRate = totalPhraseAndMaterialSlots > 0
  ? fallbackPhraseSlots.length / totalPhraseAndMaterialSlots
  : 0;

invariant(sameKimariteScenarios.length === 3, 'same-kimarite audit fixtures should be present');
invariant(scenarios.length >= 20, 'commentary generator should cover at least 20 fixed fixtures');
invariant(whiteStarScenarios.length > 0 && blackStarScenarios.length > 0, 'white-star and black-star fixtures should both be present');
invariant(new Set(sameKimariteScenarios.map((scenario) => scenario.commentary.kimarite)).size === 1, 'same-kimarite fixtures must use the same kimarite');
invariant(sameKimariteShorts.size > 1, 'same kimarite should produce varied short commentary');
invariant(sameKimariteMaterialKeySets.size > 1, 'same kimarite should produce varied material keys');
invariant(missingAxisFlags.length === 0, `all scenarios should reflect required axes: ${missingAxisFlags.join(', ')}`);
invariant(criticalQualityFlags.length === 0, `commentary quality flags: ${criticalQualityFlags.join(', ')}`);
invariant(subfamilyMismatchFlags.length === 0, `subfamily fixture mismatch: ${subfamilyMismatchFlags.join(', ')}`);
invariant(duplicateShortCommentaryRate <= 0.05, `duplicate short commentary rate too high: ${duplicateShortCommentaryRate}`);
invariant(topPhraseFrequency <= 0.25, `top phrase frequency too high: ${topPhraseFrequency}`);
invariant(fallbackContextRate <= 0.35, `fallback context rate too high: ${fallbackContextRate}`);
invariant(genericSubfamilyRate <= 0.1, `generic subfamily rate too high: ${genericSubfamilyRate}`);
invariant(subfamilyCoverageRate >= 0.95, `subfamily coverage rate too low: ${subfamilyCoverageRate}`);
invariant(sameKimariteDifferentContextRate >= 1, `same kimarite context variation too low: ${sameKimariteDifferentContextRate}`);
invariant(winLossMirrorVariationRate >= 1, `win/loss mirror variation too low: ${winLossMirrorVariationRate}`);
invariant(overusedFallbackPhraseRate <= 0.05, `fallback phrase usage too high: ${overusedFallbackPhraseRate}`);
invariant(
  Object.keys(sameFamilyDifferentSubfamilyGroups).length >= 4,
  'same production family should produce multiple commentary subfamilies in fixed fixtures',
);

const audit = {
  japaneseNaturalness: {
    pass: criticalQualityFlags.length === 0,
    checks: [
      'no undefined/null tokens',
      'no raw diagnostic enum tokens in prose',
      'no duplicate punctuation',
      'no overclaim tokens',
      'no awkward terminal-form comma connections',
      'short commentary length stays bounded',
      'short commentary stays within one or two sentences',
      'no internal diagnostic factor labels in player-facing labels',
    ],
    flags: criticalQualityFlags,
  },
  sumoExpressionValidity: {
    pass: true,
    notes: [
      '決まり手名は material key と本文の両方に出る',
      '土俵際、寄り、押し、投げ、いなし、足技は FinishRoute と Kimarite family から分けて説明する',
      '星取と番付は結果後の文脈として扱い、勝敗確率や selector 入力には戻さない',
    ],
  },
  materialKeyBias: {
    axisCounts,
    totalMaterialSlots,
    totalKimariteMaterialSlots,
    repeatedMaterialKeySlots,
    repeatedMaterialTextSlots,
    repeatedKimariteMaterialKeySlots,
    repeatedKimariteMaterialTextSlots,
    duplicateMaterialKeyRate: totalMaterialSlots > 0 ? repeatedMaterialKeySlots / totalMaterialSlots : 0,
    duplicateMaterialTextRate: totalMaterialSlots > 0 ? repeatedMaterialTextSlots / totalMaterialSlots : 0,
    duplicateKimariteMaterialKeyRate: totalKimariteMaterialSlots > 0 ? repeatedKimariteMaterialKeySlots / totalKimariteMaterialSlots : 0,
    duplicateKimariteMaterialTextRate: totalKimariteMaterialSlots > 0 ? repeatedKimariteMaterialTextSlots / totalKimariteMaterialSlots : 0,
    duplicateMaterialKeys: duplicated(materialKeyCounts),
    duplicateKimariteMaterialKeys: duplicated(kimariteMaterialKeyCounts),
    duplicateKimariteMaterialTexts: duplicated(kimariteMaterialTextCounts),
    expectedSharedKeys: [
      '同一決まり手監査では finish:PUSH_OUT:* と kimarite:押し出し:* が重複し得る',
      'victory key は日本語ラベルではなく diagnostic tag 由来に固定',
    ],
  },
  duplicateExpressions: {
    duplicateShortCommentaries: duplicated(shortCommentaryCounts),
    duplicateMaterialTexts: duplicated(materialTextCounts),
  },
  phraseVariation: {
    duplicateShortCommentaryRate,
    topPhraseFrequency,
    fallbackContextRate,
    genericSubfamilyRate,
    sameFamilyDifferentSubfamilyRate,
    sameKimariteDifferentContextRate,
    winLossMirrorVariationRate,
    overusedFallbackPhraseRate,
    repeatedShortCommentarySlots,
    repeatedShortPhraseSlots,
    totalShortPhraseSlots,
    fallbackPhraseSlots: fallbackPhraseSlots.length,
    fallbackPhrasePatterns,
    topPhrases: Object.fromEntries(
      Object.entries(shortPhraseCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8),
    ),
    thresholds: {
      duplicateShortCommentaryRate: 0.05,
      topPhraseFrequency: 0.25,
      fallbackContextRate: 0.35,
      genericSubfamilyRate: 0.1,
      subfamilyCoverageRate: 0.95,
      overusedFallbackPhraseRate: 0.05,
    },
  },
  kimariteSubfamilyVariation: {
    subfamilyCoverageRate,
    expectedConcreteSubfamilyCount: expectedSubfamilyKeys.length,
    coveredConcreteSubfamilyCount: coveredSubfamilyKeys.size,
    uncoveredSubfamiliesByFamily,
    subfamilyCounts: commentarySubfamilyCounts,
    sourceCounts: commentarySubfamilySourceCounts,
    genericSubfamilySlots,
    genericSubfamilyRate,
    genericSubfamilyCountsByFamily,
    genericSubfamilyRateByFamily,
    familiesWithHighGenericRate,
    sameFamilyDifferentSubfamilyGroups,
    sameFamilyDifferentSubfamilyRate,
    sameKimariteDifferentContextRate,
    sameKimariteDifferentContextGroups: sameKimariteDifferentContextGroups.map((group) => ({
      kimarite: group[0]?.commentary.kimarite ?? 'UNKNOWN',
      outcome: group[0]?.commentary.outcome ?? 'WIN',
      scenarioCount: group.length,
      uniqueShortCommentaries: new Set(group.map((scenario) => scenario.commentary.shortCommentary)).size,
      uniqueMaterialKeySets: new Set(group.map((scenario) => scenario.commentary.materialKeys.join('|'))).size,
    })),
    winLossMirrorVariationRate,
    winLossMirrorGroups: winLossMirrorGroups.map((group) => ({
      kimarite: group.kimariteName,
      winCount: group.wins.length,
      lossCount: group.losses.length,
      variationConfirmed: winLossMirrorVariationGroups.some((confirmed) => confirmed.kimariteName === group.kimariteName),
    })),
  },
  shortCommentaryLength: {
    min: Math.min(...shortCommentaryLengths),
    max: Math.max(...shortCommentaryLengths),
    average: shortCommentaryLengths.reduce((sum, length) => sum + length, 0) / shortCommentaryLengths.length,
    limit: 120,
  },
  axisReflection: {
    requiredAxes: REQUIRED_AXES,
    allScenariosComplete: missingAxisFlags.length === 0,
    reflectedAxisSlots,
    totalAxisSlots,
    contextReflectionRate: totalAxisSlots > 0 ? reflectedAxisSlots / totalAxisSlots : 0,
    scenarioAudits,
    distinctCounts: {
      transition: Object.keys(transitionCounts).length,
      finish: Object.keys(finishCounts).length,
      kimarite: Object.keys(kimariteCounts).length,
      commentarySubfamily: Object.keys(commentarySubfamilyCounts).length,
      hoshitori: Object.keys(hoshitoriCounts).length,
      banzuke: Object.keys(banzukeCounts).length,
      outcome: Object.keys(outcomeCounts).length,
    },
  },
};

const report = {
  diagnosticSeed: DIAGNOSTIC_SEED,
  generator: 'bout_flow_commentary_generator',
  productionGuardrails: [
    'synthetic COMPLETE_CONTEXT snapshots only',
    'no battle result roll',
    'no production RNG call',
    'no route selection call',
    'no kimarite selection call',
    'no worker payload',
    'does not write DB or render UI during diagnostics',
  ],
  officialHomepageReference: {
    source: 'https://www.sumo.or.jp/index.php',
    inspectedContract: [
      '取組解説は getMatchRikishi(...) から result_technic と result_comment を分けて表示する',
      'result_comment は立合い、主導権、転換、土俵位置、決着、星取結果を短い一連の文で扱う',
      '本文は公式文の丸写しではなく、情報密度と事実中心の構造だけを参考にする',
    ],
  },
  scenarioCount: scenarios.length,
  metrics: {
    subfamilyCoverageRate,
    genericSubfamilyRate,
    duplicateShortCommentaryRate,
    duplicateMaterialKeyRate: totalMaterialSlots > 0 ? repeatedMaterialKeySlots / totalMaterialSlots : 0,
    duplicateMaterialTextRate: totalMaterialSlots > 0 ? repeatedMaterialTextSlots / totalMaterialSlots : 0,
    duplicateKimariteMaterialKeyRate: totalKimariteMaterialSlots > 0 ? repeatedKimariteMaterialKeySlots / totalKimariteMaterialSlots : 0,
    duplicateKimariteMaterialTextRate: totalKimariteMaterialSlots > 0 ? repeatedKimariteMaterialTextSlots / totalKimariteMaterialSlots : 0,
    sameKimariteDifferentContextRate,
    sameFamilyDifferentSubfamilyRate,
    winLossMirrorVariationRate,
    contextReflectionRate: totalAxisSlots > 0 ? reflectedAxisSlots / totalAxisSlots : 0,
    overusedFallbackPhraseRate,
    japaneseNaturalness: criticalQualityFlags.length === 0,
  },
  sameKimariteVariation: {
    kimarite: pushOut.name,
    scenarioCount: sameKimariteScenarios.length,
    uniqueShortCommentaries: sameKimariteShorts.size,
    uniqueMaterialKeySets: sameKimariteMaterialKeySets.size,
    variationConfirmed: sameKimariteShorts.size > 1 && sameKimariteMaterialKeySets.size > 1,
  },
  outcomeVariation: {
    counts: outcomeCounts,
    winExamples: whiteStarScenarios.slice(0, 3).map((scenario) => scenario.commentary.shortCommentary),
    lossExamples: blackStarScenarios.slice(0, 3).map((scenario) => scenario.commentary.shortCommentary),
    whiteBlackTextDiffConfirmed:
      whiteStarScenarios.length > 0 &&
      blackStarScenarios.length > 0 &&
      whiteStarScenarios.every((scenario) => !lossShortSet.has(scenario.commentary.shortCommentary)) &&
      blackStarScenarios.every((scenario) => !winShortSet.has(scenario.commentary.shortCommentary)),
  },
  distributions: {
    transition: transitionCounts,
    finish: finishCounts,
    kimarite: kimariteCounts,
    commentarySubfamily: commentarySubfamilyCounts,
    commentarySubfamilySource: commentarySubfamilySourceCounts,
    hoshitori: hoshitoriCounts,
    banzuke: banzukeCounts,
    outcome: outcomeCounts,
  },
  audit,
  materialImprovementsApplied: [
    'shortCommentary now includes banzuke context as well as transition and hoshitori context',
    'shortCommentary no longer repeats the already visible kimarite / east-west result row',
    'shortCommentary uses O(1) deterministic phrase variants derived from existing BoutFlow axes',
    'shortCommentary and kimarite material now use commentary-only kimarite subfamily without changing production family',
    'win/loss prose branches into active and passive phrasing for each commentary subfamily',
    'victory material keys use diagnostic factor tags instead of Japanese labels',
    '硬い説明調だった一部素材を相撲短評として読みやすい表現に調整',
    'axis materials now use deterministic variants keyed by flow/context shape',
  ],
  scenarios: scenarios.map((scenario) => ({
    label: scenario.label,
    snapshot: {
      openingPhase: scenario.snapshot.openingPhase,
      controlPhaseCandidate: scenario.snapshot.controlPhaseCandidate,
      transitionClassification: scenario.snapshot.transitionClassification,
      finishRoute: scenario.snapshot.finishRoute,
      kimarite: scenario.snapshot.kimarite.name,
      kimaritePattern: scenario.snapshot.kimaritePattern,
      commentarySubfamily: scenario.commentarySubfamily.subfamily,
      commentarySubfamilySource: scenario.commentarySubfamily.source,
      victoryFactorTags: scenario.snapshot.victoryFactorTags,
      hoshitoriContextTags: scenario.snapshot.hoshitoriContextTags,
      banzukeContextTags: scenario.snapshot.banzukeContextTags,
      explanationCompleteness: scenario.snapshot.explanationCompleteness,
      missingExplanationAxes: scenario.snapshot.missingExplanationAxes,
    },
    commentary: {
      outcome: scenario.commentary.outcome,
      shortCommentary: scenario.commentary.shortCommentary,
      victoryFactorLabels: scenario.commentary.victoryFactorLabels,
      flowExplanation: scenario.commentary.flowExplanation,
      materialKeys: scenario.commentary.materialKeys,
    },
  })),
};

const outPath = path.resolve('.tmp/bout-flow-commentary-generator.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
const previewInjectionPath = path.resolve('.tmp/bout-flow-commentary-preview-injection.json');
const previewInjection = scenarios.slice(0, 3).map((scenario, index) => ({
  bashoSeq: 1,
  day: index + 1,
  commentary: scenario.commentary,
}));
fs.writeFileSync(previewInjectionPath, `${JSON.stringify(previewInjection, null, 2)}\n`, 'utf8');
console.log(`bout flow commentary generator written: ${outPath}`);
console.log(`bout flow commentary preview injection written: ${previewInjectionPath}`);
console.log(JSON.stringify({
  diagnosticSeed: report.diagnosticSeed,
  scenarioCount: report.scenarioCount,
  metrics: report.metrics,
  sameKimariteVariation: report.sameKimariteVariation,
  outcomeVariation: report.outcomeVariation,
  distinctCounts: report.audit.axisReflection.distinctCounts,
  duplicateMaterialKeyRate: report.audit.materialKeyBias.duplicateMaterialKeyRate,
  duplicateMaterialTextRate: report.audit.materialKeyBias.duplicateMaterialTextRate,
  duplicateKimariteMaterialKeyRate: report.audit.materialKeyBias.duplicateKimariteMaterialKeyRate,
  duplicateKimariteMaterialTextRate: report.audit.materialKeyBias.duplicateKimariteMaterialTextRate,
  duplicateShortCommentaryRate: report.audit.phraseVariation.duplicateShortCommentaryRate,
  topPhraseFrequency: report.audit.phraseVariation.topPhraseFrequency,
  fallbackContextRate: report.audit.phraseVariation.fallbackContextRate,
  genericSubfamilyRate: report.audit.phraseVariation.genericSubfamilyRate,
  subfamilyCoverageRate: report.audit.kimariteSubfamilyVariation.subfamilyCoverageRate,
  sameFamilyDifferentSubfamilyRate: report.audit.phraseVariation.sameFamilyDifferentSubfamilyRate,
  sameKimariteDifferentContextRate: report.audit.phraseVariation.sameKimariteDifferentContextRate,
  winLossMirrorVariationRate: report.audit.phraseVariation.winLossMirrorVariationRate,
  overusedFallbackPhraseRate: report.audit.phraseVariation.overusedFallbackPhraseRate,
  sameFamilyDifferentSubfamilyGroups: report.audit.kimariteSubfamilyVariation.sameFamilyDifferentSubfamilyGroups,
  familiesWithHighGenericRate: report.audit.kimariteSubfamilyVariation.familiesWithHighGenericRate,
  uncoveredSubfamiliesByFamily: report.audit.kimariteSubfamilyVariation.uncoveredSubfamiliesByFamily,
  topPhrases: report.audit.phraseVariation.topPhrases,
  contextReflectionRate: report.audit.axisReflection.contextReflectionRate,
  shortCommentaryLength: report.audit.shortCommentaryLength,
  japaneseNaturalness: report.audit.japaneseNaturalness.pass,
  duplicateShortCommentaries: report.audit.duplicateExpressions.duplicateShortCommentaries,
  productionGuardrails: report.productionGuardrails,
  officialHomepageReference: report.officialHomepageReference.inspectedContract,
}, null, 2));
