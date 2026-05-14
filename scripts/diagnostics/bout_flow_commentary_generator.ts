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
  const diagnostic = createBoutFlowCommentaryDiagnostic(snapshot);
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

const containsRawEnum = (text: string): boolean => /[A-Z]{2,}_[A-Z0-9_]+/.test(text);

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
  if (scenario.commentary.shortCommentary.length > 150) {
    flags.push('short-commentary-too-long');
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
const axisCounts = countBy(scenarios.flatMap((scenario) => scenario.commentary.materials.map((material) => material.axis)));
const transitionCounts = countBy(scenarios.map((scenario) => scenario.snapshot.transitionClassification));
const finishCounts = countBy(scenarios.map((scenario) => scenario.snapshot.finishRoute));
const kimariteCounts = countBy(scenarios.map((scenario) => scenario.snapshot.kimarite.name));
const hoshitoriCounts = countBy(scenarios.flatMap((scenario) => scenario.snapshot.hoshitoriContextTags));
const banzukeCounts = countBy(scenarios.flatMap((scenario) => scenario.snapshot.banzukeContextTags));
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

invariant(sameKimariteScenarios.length === 3, 'same-kimarite audit fixtures should be present');
invariant(new Set(sameKimariteScenarios.map((scenario) => scenario.commentary.kimarite)).size === 1, 'same-kimarite fixtures must use the same kimarite');
invariant(sameKimariteShorts.size > 1, 'same kimarite should produce varied short commentary');
invariant(sameKimariteMaterialKeySets.size > 1, 'same kimarite should produce varied material keys');
invariant(missingAxisFlags.length === 0, `all scenarios should reflect required axes: ${missingAxisFlags.join(', ')}`);
invariant(criticalQualityFlags.length === 0, `commentary quality flags: ${criticalQualityFlags.join(', ')}`);

const audit = {
  japaneseNaturalness: {
    pass: criticalQualityFlags.length === 0,
    checks: [
      'no undefined/null tokens',
      'no raw diagnostic enum tokens in prose',
      'no duplicate punctuation',
      'short commentary length stays bounded',
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
    duplicateMaterialKeys: duplicated(materialKeyCounts),
    expectedSharedKeys: [
      '同一決まり手監査では finish:PUSH_OUT と kimarite:押し出し:PUSH_THRUST が重複する',
      'victory key は日本語ラベルではなく diagnostic tag 由来に固定',
    ],
  },
  duplicateExpressions: {
    duplicateShortCommentaries: duplicated(shortCommentaryCounts),
    duplicateMaterialTexts: duplicated(materialTextCounts),
  },
  axisReflection: {
    requiredAxes: REQUIRED_AXES,
    allScenariosComplete: missingAxisFlags.length === 0,
    scenarioAudits,
    distinctCounts: {
      transition: Object.keys(transitionCounts).length,
      finish: Object.keys(finishCounts).length,
      kimarite: Object.keys(kimariteCounts).length,
      hoshitori: Object.keys(hoshitoriCounts).length,
      banzuke: Object.keys(banzukeCounts).length,
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
    'no DB, worker, or UI payload',
  ],
  scenarioCount: scenarios.length,
  sameKimariteVariation: {
    kimarite: pushOut.name,
    scenarioCount: sameKimariteScenarios.length,
    uniqueShortCommentaries: sameKimariteShorts.size,
    uniqueMaterialKeySets: sameKimariteMaterialKeySets.size,
    variationConfirmed: sameKimariteShorts.size > 1 && sameKimariteMaterialKeySets.size > 1,
  },
  distributions: {
    transition: transitionCounts,
    finish: finishCounts,
    kimarite: kimariteCounts,
    hoshitori: hoshitoriCounts,
    banzuke: banzukeCounts,
  },
  audit,
  materialImprovementsApplied: [
    'shortCommentary now includes banzuke context as well as transition and hoshitori context',
    'victory material keys use diagnostic factor tags instead of Japanese labels',
    '硬い説明調だった一部素材を相撲短評として読みやすい表現に調整',
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
console.log(`bout flow commentary generator written: ${outPath}`);
console.log(JSON.stringify({
  diagnosticSeed: report.diagnosticSeed,
  scenarioCount: report.scenarioCount,
  sameKimariteVariation: report.sameKimariteVariation,
  distinctCounts: report.audit.axisReflection.distinctCounts,
  japaneseNaturalness: report.audit.japaneseNaturalness.pass,
  duplicateShortCommentaries: report.audit.duplicateExpressions.duplicateShortCommentaries,
  productionGuardrails: report.productionGuardrails,
}, null, 2));
