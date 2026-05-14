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

const DIAGNOSTIC_SEED = 20260515;
const SHARED_KIMARITE = {
  name: '押し出し',
  family: 'PUSH_THRUST',
  diagnosticFamily: 'PUSH_THRUST',
  rarity: 'COMMON',
  catalogStatus: 'OFFICIAL',
} as const;

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

const createCompleteSnapshot = (
  input: Omit<CreateBoutFlowDiagnosticSnapshotInput, 'finishRoute' | 'kimarite'>,
): BoutFlowDiagnosticSnapshot => {
  const snapshot = createBoutFlowDiagnosticSnapshot({
    ...input,
    finishRoute: 'PUSH_OUT',
    kimarite: SHARED_KIMARITE,
  });
  invariant(
    snapshot.explanationCompleteness === 'COMPLETE_CONTEXT',
    `${input.openingPhase} fixture must produce COMPLETE_CONTEXT`,
  );
  return snapshot;
};

const generateCommentary = (
  label: string,
  snapshot: BoutFlowDiagnosticSnapshot,
): CommentaryScenario => {
  const diagnostic = createBoutFlowCommentaryDiagnostic(snapshot);
  invariant(diagnostic.generated, `${label} commentary should be generated`);
  invariant(Boolean(diagnostic.commentary), `${label} commentary payload should exist`);
  if (!diagnostic.commentary) {
    throw new Error(`${label} commentary payload is missing`);
  }
  return {
    label,
    snapshot,
    commentary: diagnostic.commentary,
  };
};

const scenarios = [
  generateCommentary(
    'push-expected-win',
    createCompleteSnapshot({
      openingPhase: 'THRUST_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'THRUST_BATTLE',
      controlPhaseCandidate: 'THRUST_BATTLE',
      controlConfidence: 'DIRECT',
      victoryFactorTags: ['victory-factor:ability', 'victory-factor:style'],
      hoshitoriContextTags: ['EARLY_BASHO', 'WIN_STREAK'],
      banzukeContextTags: ['RANK_EXPECTED_WIN'],
    }),
  ),
  generateCommentary(
    'belt-to-push-promotion-boundary',
    createCompleteSnapshot({
      openingPhase: 'BELT_BATTLE',
      openingConfidence: 'MEDIUM',
      controlPhasePredecessor: 'THRUST_BATTLE',
      controlPhaseCandidate: 'THRUST_BATTLE',
      controlConfidence: 'DIRECT',
      victoryFactorTags: ['victory-factor:pressure', 'victory-factor:body'],
      hoshitoriContextTags: ['KACHI_MAKE_DECIDER', 'FINAL_BOUT'],
      banzukeContextTags: ['PROMOTION_RELEVANT', 'SEKITORI_BOUNDARY'],
    }),
  ),
  generateCommentary(
    'edge-yusho-kinboshi',
    createCompleteSnapshot({
      openingPhase: 'EDGE_BATTLE',
      openingConfidence: 'HIGH',
      controlPhasePredecessor: 'EDGE_SCRAMBLE',
      controlPhaseCandidate: 'EDGE_BATTLE',
      controlConfidence: 'RENAMED',
      victoryFactorTags: ['victory-factor:momentum', 'victory-factor:kimarite-fit'],
      hoshitoriContextTags: ['YUSHO_CHASE', 'RECOVERY_BOUT'],
      banzukeContextTags: ['KINBOSHI_CHANCE'],
    }),
  ),
];

const shortCommentaries = new Set(scenarios.map((scenario) => scenario.commentary.shortCommentary));
const materialKeySets = new Set(scenarios.map((scenario) => scenario.commentary.materialKeys.join('|')));
const kimariteNames = new Set(scenarios.map((scenario) => scenario.commentary.kimarite));

invariant(kimariteNames.size === 1, 'all fixtures must use the same kimarite');
invariant(shortCommentaries.size > 1, 'same kimarite should produce varied short commentary');
invariant(materialKeySets.size > 1, 'same kimarite should produce varied material keys');
invariant(
  scenarios.some((scenario) => scenario.commentary.materialKeys.includes('transition:CONTROL_SHIFT')),
  'control-shift material should be represented',
);
invariant(
  scenarios.some((scenario) => scenario.commentary.materialKeys.includes('transition:EDGE_TURNAROUND')),
  'edge-turnaround material should be represented',
);
invariant(
  scenarios.some((scenario) => scenario.commentary.materialKeys.includes('hoshitori:KACHI_MAKE_DECIDER')),
  'kachi-make hoshitori context should be represented',
);
invariant(
  scenarios.some((scenario) => scenario.commentary.materialKeys.includes('banzuke:KINBOSHI_CHANCE')),
  'kinboshi banzuke context should be represented',
);

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
  kimarite: SHARED_KIMARITE.name,
  scenarioCount: scenarios.length,
  uniqueShortCommentaries: shortCommentaries.size,
  uniqueMaterialKeySets: materialKeySets.size,
  variationConfirmed: shortCommentaries.size > 1 && materialKeySets.size > 1,
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
  kimarite: report.kimarite,
  scenarioCount: report.scenarioCount,
  uniqueShortCommentaries: report.uniqueShortCommentaries,
  uniqueMaterialKeySets: report.uniqueMaterialKeySets,
  variationConfirmed: report.variationConfirmed,
  productionGuardrails: report.productionGuardrails,
}, null, 2));
