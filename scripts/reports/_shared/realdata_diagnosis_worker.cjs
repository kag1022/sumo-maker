// Worker for realdata-career-diagnosis-bundle. READ-ONLY: only invokes
// runCareerObservation and extracts extended features.
'use strict';
const { parentPort, workerData } = require('worker_threads');
const { loadObservationModule } = require('./observation_module.cjs');
const { extractRealdataDiagnosisFeatures } = require('./realdata_diagnosis_features.cjs');

const run = async () => {
  const { runCareerObservation } = loadObservationModule();
  const result = await runCareerObservation({
    seed: workerData.seed,
    simulationModelVersion: 'v3',
    populationKind: workerData.populationKind,
    populationPreset: workerData.populationPreset,
  });
  parentPort.postMessage(extractRealdataDiagnosisFeatures(result));
};

run().catch((error) => {
  console.error('realdata-diagnosis worker error:', error);
  process.exit(1);
});
