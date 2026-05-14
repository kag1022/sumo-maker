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

interface CommentaryScenario {
  readonly label: string;
  readonly snapshot: BoutFlowDiagnosticSnapshot;
  readonly commentary: BoutFlowCommentary;
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
  };
};

const pushOut = kimarite('押し出し', 'PUSH_THRUST');

const fixtures: readonly Fixture[] = [
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
const shortCommentaryCounts = countBy(scenarios.map((scenario) => scenario.commentary.shortCommentary));
const shortCommentaryLengths = scenarios.map((scenario) => scenario.commentary.shortCommentary.length);
const shortPhraseCounts = countBy(scenarios.flatMap((scenario) => phraseSegments(scenario.commentary.shortCommentary)));
const axisCounts = countBy(scenarios.flatMap((scenario) => scenario.commentary.materials.map((material) => material.axis)));
const transitionCounts = countBy(scenarios.map((scenario) => scenario.snapshot.transitionClassification));
const finishCounts = countBy(scenarios.map((scenario) => scenario.snapshot.finishRoute));
const kimariteCounts = countBy(scenarios.map((scenario) => scenario.snapshot.kimarite.name));
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
  return {
    label: scenario.label,
    missingAxes,
    qualityFlags: qualityFlags(scenario),
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
const totalMaterialSlots = scenarios.reduce((sum, scenario) => sum + scenario.commentary.materialKeys.length, 0);
const totalShortPhraseSlots = Object.values(shortPhraseCounts).reduce((sum, count) => sum + count, 0);
const repeatedMaterialKeySlots = repeatedSlotCount(materialKeyCounts);
const repeatedMaterialTextSlots = repeatedSlotCount(materialTextCounts);
const repeatedShortCommentarySlots = repeatedSlotCount(shortCommentaryCounts);
const repeatedShortPhraseSlots = repeatedSlotCount(shortPhraseCounts);
const fallbackBanzukeSlots = scenarios.filter((scenario) => scenario.snapshot.banzukeContextTags.includes('RANK_EXPECTED_WIN')).length;
const totalAxisSlots = scenarioAudits.length * REQUIRED_AXES.length;
const reflectedAxisSlots = scenarioAudits.reduce((sum, audit) => sum + REQUIRED_AXES.length - audit.missingAxes.length, 0);
const duplicateShortCommentaryRate = scenarios.length > 0 ? repeatedShortCommentarySlots / scenarios.length : 0;
const topPhraseFrequency = scenarios.length > 0
  ? Math.max(0, ...Object.values(shortPhraseCounts)) / scenarios.length
  : 0;
const fallbackContextRate = scenarios.length > 0 ? fallbackBanzukeSlots / scenarios.length : 0;

invariant(sameKimariteScenarios.length === 3, 'same-kimarite audit fixtures should be present');
invariant(scenarios.length >= 20, 'commentary generator should cover at least 20 fixed fixtures');
invariant(whiteStarScenarios.length > 0 && blackStarScenarios.length > 0, 'white-star and black-star fixtures should both be present');
invariant(new Set(sameKimariteScenarios.map((scenario) => scenario.commentary.kimarite)).size === 1, 'same-kimarite fixtures must use the same kimarite');
invariant(sameKimariteShorts.size > 1, 'same kimarite should produce varied short commentary');
invariant(sameKimariteMaterialKeySets.size > 1, 'same kimarite should produce varied material keys');
invariant(missingAxisFlags.length === 0, `all scenarios should reflect required axes: ${missingAxisFlags.join(', ')}`);
invariant(criticalQualityFlags.length === 0, `commentary quality flags: ${criticalQualityFlags.join(', ')}`);
invariant(duplicateShortCommentaryRate <= 0.05, `duplicate short commentary rate too high: ${duplicateShortCommentaryRate}`);
invariant(topPhraseFrequency <= 0.25, `top phrase frequency too high: ${topPhraseFrequency}`);
invariant(fallbackContextRate <= 0.35, `fallback context rate too high: ${fallbackContextRate}`);

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
    repeatedMaterialKeySlots,
    repeatedMaterialTextSlots,
    duplicateMaterialKeyRate: totalMaterialSlots > 0 ? repeatedMaterialKeySlots / totalMaterialSlots : 0,
    duplicateMaterialTextRate: totalMaterialSlots > 0 ? repeatedMaterialTextSlots / totalMaterialSlots : 0,
    duplicateMaterialKeys: duplicated(materialKeyCounts),
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
    repeatedShortCommentarySlots,
    repeatedShortPhraseSlots,
    totalShortPhraseSlots,
    topPhrases: Object.fromEntries(
      Object.entries(shortPhraseCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 8),
    ),
    thresholds: {
      duplicateShortCommentaryRate: 0.05,
      topPhraseFrequency: 0.25,
      fallbackContextRate: 0.35,
    },
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
    hoshitori: hoshitoriCounts,
    banzuke: banzukeCounts,
    outcome: outcomeCounts,
  },
  audit,
  materialImprovementsApplied: [
    'shortCommentary now includes banzuke context as well as transition and hoshitori context',
    'shortCommentary no longer repeats the already visible kimarite / east-west result row',
    'shortCommentary uses O(1) deterministic phrase variants derived from existing BoutFlow axes',
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
  sameKimariteVariation: report.sameKimariteVariation,
  outcomeVariation: report.outcomeVariation,
  distinctCounts: report.audit.axisReflection.distinctCounts,
  duplicateMaterialKeyRate: report.audit.materialKeyBias.duplicateMaterialKeyRate,
  duplicateMaterialTextRate: report.audit.materialKeyBias.duplicateMaterialTextRate,
  duplicateShortCommentaryRate: report.audit.phraseVariation.duplicateShortCommentaryRate,
  topPhraseFrequency: report.audit.phraseVariation.topPhraseFrequency,
  fallbackContextRate: report.audit.phraseVariation.fallbackContextRate,
  topPhrases: report.audit.phraseVariation.topPhrases,
  contextReflectionRate: report.audit.axisReflection.contextReflectionRate,
  shortCommentaryLength: report.audit.shortCommentaryLength,
  japaneseNaturalness: report.audit.japaneseNaturalness.pass,
  duplicateShortCommentaries: report.audit.duplicateExpressions.duplicateShortCommentaries,
  productionGuardrails: report.productionGuardrails,
  officialHomepageReference: report.officialHomepageReference.inspectedContract,
}, null, 2));
